/**
 * One-way Artalk projection. The internal comments table is authoritative;
 * this worker only mirrors its current visible state to the 161 sidecar.
 */

import crypto from 'node:crypto'
import { buildCommentThreadKey } from '../../../poc/comment-provider-adapters.js'

function bool (value) {
  return value === true || String(value || '').toLowerCase() === 'true'
}

function safeInteger (value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function hashProjection (value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function mirrorEmail (commentId, secret) {
  const digest = crypto.createHmac('sha256', String(secret || 'map-service-artalk')).update(String(commentId)).digest('hex').slice(0, 40)
  return `mirror-${digest}@map-service.invalid`
}

function responseValue (response) {
  return response?.data && typeof response.data === 'object' ? response.data : response
}

const NOT_FOUND = Symbol('artalk-not-found')

function hasOwn (value, key) {
  return value != null && Object.prototype.hasOwnProperty.call(value, key)
}

function patchValue (patch, key, fallback) {
  return hasOwn(patch, key) ? patch[key] : fallback
}

export class ArtalkNotFoundError extends Error {
  constructor () {
    super('Artalk 评论不存在')
    this.name = 'ArtalkNotFoundError'
    this.code = 'ARTALK_NOT_FOUND'
  }
}

export class ArtalkMirror {
  constructor (options = {}) {
    this.enabled = bool(options.enabled)
    this.endpoint = String(options.endpoint || '').replace(/\/$/u, '')
    this.siteName = String(options.siteName || 'map-service-internal').trim()
    this.email = String(options.email || '').trim()
    this.password = String(options.password || '').trim()
    this.token = String(options.token || options.appKey || '').trim()
    this.secret = String(options.secret || '')
    this.timeoutMs = Math.max(500, Math.min(10_000, Number(options.timeoutMs) || 3000))
    this.fetch = options.fetch || globalThis.fetch
    this.memoryProjections = new Map()
    this.adapter = options.adapter || createHttpAdapter(this)
  }

  status (interaction) {
    const result = {
      enabled: this.enabled,
      configured: Boolean(this.endpoint && this.siteName && (this.token || (this.email && this.password))),
      endpoint: this.endpoint ? '[configured]' : '',
      siteName: this.siteName || '',
    }
    try {
      const database = interaction?.database
      if (database) {
        result.outbox = {
          pending: Number(database.prepare("SELECT COUNT(*) AS count FROM comment_outbox WHERE status = 'pending'").get()?.count || 0),
          processing: Number(database.prepare("SELECT COUNT(*) AS count FROM comment_outbox WHERE status = 'processing'").get()?.count || 0),
          failed: Number(database.prepare("SELECT COUNT(*) AS count FROM comment_outbox WHERE status = 'failed'").get()?.count || 0),
        }
        result.projections = {
          visible: Number(database.prepare("SELECT COUNT(*) AS count FROM artalk_comment_projections WHERE projection_status = 'visible'").get()?.count || 0),
          failed: Number(database.prepare("SELECT COUNT(*) AS count FROM artalk_comment_projections WHERE projection_status = 'failed'").get()?.count || 0),
        }
      }
    } catch {
      // Status is diagnostic only; a partially migrated database must not
      // turn the health endpoint into a 500.
    }
    return result
  }

  async health (interaction) {
    if (!this.enabled) return { ...this.status(interaction), ok: false, skipped: true }
    if (!this.status(interaction).configured) return { ...this.status(interaction), ok: false, error: 'Artalk 镜像未配置' }
    await this.adapter.health()
    return { ...this.status(interaction), ok: true }
  }

  async drainOnce (interaction, options = {}) {
    if (!this.enabled) return { claimed: 0, sent: 0, failed: 0, skipped: true }
    if (!interaction || typeof interaction.drainModerationEvents !== 'function') throw new Error('缺少 InteractionService')
    interaction.ensureReady()
    const drained = await interaction.drainModerationEvents(event => this.projectEvent(interaction, event), options)
    if (options.reconcile !== true) return drained
    return { ...drained, ...(await this.reconcileOnce(interaction, options)) }
  }

  async reconcileOnce (interaction, options = {}) {
    interaction.ensureReady()
    const force = options.force === true
    const limit = Math.max(1, Math.min(1000, Number(options.reconcileLimit || options.limit) || 100))
    const where = force
      ? ''
      : `WHERE projection.comment_id IS NULL
          OR projection.projection_status = 'failed'
          OR (comment.content_status = 'active' AND comment.moderation_status = 'approved' AND projection.projection_status <> 'visible')
          OR ((comment.content_status <> 'active' OR comment.moderation_status <> 'approved') AND projection.projection_status <> 'removed')`
    const rows = interaction.database.prepare(`
      SELECT comment.id, comment.canonical_share_id, comment.share_item_id, comment.feature_id,
             comment.parent_id, comment.thread_depth, comment.display_name_snapshot,
             comment.body_normalized, comment.content_status, comment.moderation_status
      FROM comments AS comment
      LEFT JOIN artalk_comment_projections AS projection ON projection.comment_id = comment.id
      ${where}
      ORDER BY comment.updated_at, comment.id
      LIMIT ?
    `).all(limit)
    let reconciled = 0
    let reconcileFailed = 0
    for (const row of rows) {
      try {
        await this.projectComment(interaction, row, new Set(), { force })
        reconciled += 1
      } catch (error) {
        this.saveProjection(interaction.database, row.id, { status: 'failed', lastError: String(error?.message || error) })
        reconcileFailed += 1
      }
    }
    return { reconcileScanned: rows.length, reconciled, reconcileFailed }
  }

  projection (database, commentId) {
    try { return database.prepare('SELECT * FROM artalk_comment_projections WHERE comment_id = ?').get(commentId) || null } catch {
      return this.memoryProjections.get(commentId) || null
    }
  }

  saveProjection (database, commentId, patch = {}) {
    const now = new Date().toISOString()
    const existing = this.projection(database, commentId)
    const providerCommentId = patchValue(patch, 'providerCommentId', existing?.provider_comment_id ?? null)
    const pageKey = patchValue(patch, 'pageKey', existing?.page_key ?? '')
    const stateHash = patchValue(patch, 'stateHash', existing?.state_hash ?? '')
    const status = patchValue(patch, 'status', existing?.projection_status ?? 'unknown')
    const lastError = String(patchValue(patch, 'lastError', existing?.last_error ?? '') || '').slice(0, 500)
    const syncedAt = patchValue(patch, 'syncedAt', existing?.synced_at ?? null)
    try {
      database.prepare(`
      INSERT INTO artalk_comment_projections(
        comment_id, provider_comment_id, page_key, state_hash, projection_status,
        last_error, synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(comment_id) DO UPDATE SET
        provider_comment_id = excluded.provider_comment_id, page_key = excluded.page_key,
        state_hash = excluded.state_hash, projection_status = excluded.projection_status,
        last_error = excluded.last_error, synced_at = excluded.synced_at, updated_at = excluded.updated_at
      `).run(
      commentId,
      providerCommentId,
      pageKey,
      stateHash,
      status,
      lastError,
      syncedAt,
      existing?.created_at || now,
      now,
      )
    } catch {
      this.memoryProjections.set(commentId, {
        comment_id: commentId,
        provider_comment_id: providerCommentId,
        page_key: pageKey,
        state_hash: stateHash,
        projection_status: status,
        last_error: lastError,
        synced_at: syncedAt,
        created_at: existing?.created_at || now,
        updated_at: now,
      })
    }
  }

  async projectEvent (interaction, event) {
    const commentId = String(event.comment_id || event.aggregate_id || '')
    const row = interaction.database.prepare(`
      SELECT id, canonical_share_id, share_item_id, feature_id, parent_id, thread_depth,
             display_name_snapshot,
             body_normalized, content_status, moderation_status
      FROM comments WHERE id = ?
    `).get(commentId)
    try {
      await this.projectComment(interaction, row, new Set())
    } catch (error) {
      this.saveProjection(interaction.database, commentId, { status: 'failed', lastError: String(error?.message || error) })
      throw error
    }
  }

  async projectComment (interaction, row, stack = new Set(), options = {}) {
    const commentId = String(row?.id || '')
    if (!commentId) return
    if (stack.has(commentId)) throw new Error('Artalk 留言父级关系存在循环')
    stack.add(commentId)
    const projection = this.projection(interaction.database, commentId)
    try {
      // Compatibility seam for isolated tests and custom adapters. Production
      // adapters implement create/update/remove and use durable projections.
      if (typeof this.adapter.upsert === 'function' && typeof this.adapter.create !== 'function') {
        if (!row || row.content_status !== 'active' || row.moderation_status !== 'approved') {
          await this.adapter.remove({ commentId })
          return
        }
        await this.adapter.upsert({
          commentId,
          pageKey: [row.canonical_share_id, row.share_item_id, row.feature_id].map(value => String(value || '')).join(':'),
          nick: String(row.display_name_snapshot || '访客').slice(0, 80),
          content: String(row.body_normalized || '').slice(0, 10_000),
        })
        return
      }
      if (!row || row.content_status !== 'active' || row.moderation_status !== 'approved') {
        await this.removeProjectionTree(interaction, commentId)
        return
      }
      let parentProviderId = 0
      if (row.parent_id) {
        const parent = interaction.database.prepare(`
          SELECT id, canonical_share_id, share_item_id, feature_id, parent_id, thread_depth,
                 display_name_snapshot, body_normalized, content_status, moderation_status
          FROM comments WHERE id = ?
        `).get(row.parent_id)
        if (!parent || parent.content_status !== 'active' || parent.moderation_status !== 'approved') {
          await this.removeProjectionTree(interaction, commentId)
          return
        }
        await this.projectComment(interaction, parent, stack, options)
        parentProviderId = safeInteger(this.projection(interaction.database, parent.id)?.provider_comment_id) || 0
        if (!parentProviderId) {
          await this.removeProjectionTree(interaction, commentId)
          return
        }
      }
      const pageKey = buildCommentThreadKey({
        siteId: 'map-service', sharePublicId: 'internal', shareItemId: row.share_item_id, featureId: row.feature_id, scope: 'feature',
      }, { canonicalShareId: row.canonical_share_id })
      const payload = {
        commentId, pageKey, siteName: this.siteName,
        nick: String(row.display_name_snapshot || '访客').slice(0, 80),
        content: String(row.body_normalized || '').slice(0, 10_000),
        email: mirrorEmail(commentId, this.secret),
        rid: parentProviderId,
      }
      const stateHash = hashProjection(payload)
      if (!options.force && projection?.projection_status === 'visible' && projection.state_hash === stateHash && projection.provider_comment_id) return
      let providerCommentId = safeInteger(projection?.provider_comment_id)
      if (!providerCommentId) providerCommentId = await this.adapter.findExisting(payload)
      if (providerCommentId) {
        try {
          await this.adapter.update({ ...payload, providerCommentId })
        } catch (error) {
          if (error?.code !== 'ARTALK_NOT_FOUND') throw error
          providerCommentId = null
        }
      }
      if (!providerCommentId) {
        providerCommentId = await this.adapter.findExisting(payload)
        if (providerCommentId) {
          try {
            await this.adapter.update({ ...payload, providerCommentId })
          } catch (error) {
            if (error?.code !== 'ARTALK_NOT_FOUND') throw error
            providerCommentId = null
          }
        }
        if (!providerCommentId) providerCommentId = await this.adapter.create(payload)
      }
      if (!safeInteger(providerCommentId)) throw new Error('Artalk 未返回有效评论 ID')
      this.saveProjection(interaction.database, commentId, {
        providerCommentId, pageKey, stateHash, status: 'visible', syncedAt: new Date().toISOString(), lastError: '',
      })
    } finally {
      stack.delete(commentId)
    }
  }

  async removeProjectionTree (interaction, commentId) {
    const database = interaction.database
    const rows = database.prepare(`
      SELECT comment_id, provider_comment_id
      FROM artalk_comment_projections
      WHERE comment_id = ? OR comment_id IN (SELECT id FROM comments WHERE parent_id = ?)
    `).all(commentId, commentId)
    for (const projection of rows) {
      if (safeInteger(projection.provider_comment_id)) {
        await this.adapter.remove({ providerCommentId: projection.provider_comment_id })
      }
      this.saveProjection(database, projection.comment_id, {
        providerCommentId: null,
        status: 'removed',
        stateHash: '',
        syncedAt: new Date().toISOString(),
        lastError: '',
      })
    }
    if (!rows.length) {
      this.saveProjection(database, commentId, {
        providerCommentId: null,
        status: 'removed',
        stateHash: '',
        syncedAt: new Date().toISOString(),
        lastError: '',
      })
    }
  }
}

function createHttpAdapter (mirror) {
  if (typeof mirror.fetch !== 'function') throw new Error('Artalk 镜像需要 fetch')
  let token = mirror.token
  let loginPromise = null
  const login = async () => {
    if (loginPromise) return loginPromise
    loginPromise = (async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), mirror.timeoutMs)
      try {
        const response = await mirror.fetch(`${mirror.endpoint}/auth/email/login`, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ email: mirror.email, password: mirror.password }),
        })
        if (!response.ok) throw new Error(`Artalk 登录失败: ${response.status}`)
        const value = responseValue(await response.json())
        const next = String(value?.token || '')
        if (!next) throw new Error('Artalk 登录未返回令牌')
        token = next
        return token
      } finally { clearTimeout(timer) }
    })().finally(() => { loginPromise = null })
    return loginPromise
  }
  const request = async (path, options = {}, retryAuth = true) => {
    const { allowNotFound, ...fetchOptions } = options
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), mirror.timeoutMs)
    try {
      const response = await mirror.fetch(`${mirror.endpoint}${path}`, {
        redirect: 'error', ...fetchOptions, signal: controller.signal,
        headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(fetchOptions.headers || {}) },
      })
      if (response.status === 401 && retryAuth && mirror.email && mirror.password) {
        await login()
        return request(path, options, false)
      }
      if (response.status === 404 && allowNotFound) return NOT_FOUND
      if (!response.ok) throw new Error(`Artalk 请求失败: ${response.status}`)
      const text = await response.text()
      return text ? JSON.parse(text) : null
    } finally { clearTimeout(timer) }
  }
  const commentFields = payload => ({
    content: payload.content, email: payload.email, name: payload.nick,
    page_key: payload.pageKey, site_name: payload.siteName,
    rid: safeInteger(payload.rid) || 0,
  })
  return {
    health: () => request('/version'),
    async findExisting (payload) {
      const query = new URLSearchParams({ page_key: payload.pageKey, site_name: payload.siteName, email: payload.email, offset: '0', limit: '20' })
      const response = responseValue(await request(`/comments?${query.toString()}`))
      const candidates = Array.isArray(response?.comments) ? response.comments : (Array.isArray(response) ? response : [])
      const field = (item, snake, camel) => String(item?.[snake] ?? item?.[camel] ?? '')
      const scoped = candidates.filter(item => safeInteger(item.id) &&
        field(item, 'page_key', 'pageKey') === payload.pageKey &&
        field(item, 'site_name', 'siteName') === payload.siteName)
      const exact = scoped.find(item => field(item, 'email', 'email') === payload.email)
      if (exact) return safeInteger(exact.id)
      // Artalk 2.10.0 filters the query by email but deliberately returns only
      // `email_encrypted`. A single scoped result is therefore the safe crash-
      // recovery match; multiple candidates remain ambiguous and are ignored.
      return scoped.length === 1 && !hasOwn(scoped[0], 'email') ? safeInteger(scoped[0].id) : null
    },
    async create (payload) {
      const response = responseValue(await request('/comments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(commentFields(payload)) }))
      const id = safeInteger(response?.id)
      if (!id) throw new Error('Artalk 创建评论未返回 ID')
      await this.update({ ...payload, providerCommentId: id })
      return id
    },
    async update (payload) {
      const result = await request(`/comments/${encodeURIComponent(payload.providerCommentId)}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        allowNotFound: true,
        body: JSON.stringify({ ...commentFields(payload), rid: safeInteger(payload.rid) || 0, is_pending: false, is_pinned: false, is_collapsed: false }),
      })
      if (result === NOT_FOUND) throw new ArtalkNotFoundError()
    },
    remove: async ({ providerCommentId }) => {
      const result = await request(`/comments/${encodeURIComponent(providerCommentId)}`, { method: 'DELETE', allowNotFound: true })
      return result === NOT_FOUND ? null : result
    },
  }
}

export default ArtalkMirror
