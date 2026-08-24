import test from 'node:test'
import assert from 'node:assert/strict'
import InteractionDatabase from '../service/bin/interaction/database.js'
import CommentService from '../service/bin/interaction/commentService.js'
import ModerationService from '../service/bin/interaction/moderationService.js'
import { InteractionPolicyStore } from '../service/bin/interaction/commentPolicy.js'
import { ArtalkMirror, ArtalkNotFoundError } from '../service/bin/interaction/artalkMirror.js'

const TEST_NOW = '2026-08-25T00:00:00.000Z'
const TEST_SECRET = 'artalk-mirror-test-secret'
const RESOURCE = Object.freeze({
  canonicalShareId: 'shr_canonical_artalk',
  sharePublicId: 'shr_public_artalk',
  shareItemId: 'shi_artalk',
  featureId: 'feature_artalk',
})

function jsonResponse (value, status = 200) {
  return new Response(value == null ? '' : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function projectionHarness (options = {}) {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  const now = () => TEST_NOW
  const policyStore = new InteractionPolicyStore({ database, now })
  const moderation = new ModerationService({ database, now })
  const comments = new CommentService({ database, moderation, policyStore, secret: TEST_SECRET, now })
  policyStore.publish({
    comments: {
      enabled: true,
      anonymous: { enabled: true, contactRequirement: 'email_or_phone', requireConsent: true },
      maxLength: 2000,
      moderationRequired: true,
      publicReplyEnabled: options.publicReplyEnabled === true,
    },
    moderation: { autoApproveLevels: ['normal'], keywords: { enabled: true } },
  }, { now: TEST_NOW })
  moderation.publishKeywordRules([], { sourcePolicyVersion: 1, now: TEST_NOW })
  return {
    database,
    moderation,
    comments,
    interaction: {
      database,
      ensureReady () {},
      drainModerationEvents: (handler, drainOptions = {}) => moderation.drainEvents(handler, { ...drainOptions, now: TEST_NOW }),
    },
    close: () => database.close(),
  }
}

function submit (comments, suffix, overrides = {}) {
  return comments.submitComment({
    resource: RESOURCE,
    clientKey: `visitor-${suffix}`,
    body: {
      body: `Artalk 镜像留言 ${suffix}`,
      displayName: `访客${suffix}`,
      email: `${suffix}@example.com`,
      consent: true,
      clientRequestId: `request-${suffix}`,
      resourceRef: {
        siteId: 'map-service',
        sharePublicId: RESOURCE.sharePublicId,
        shareItemId: RESOURCE.shareItemId,
        featureId: RESOURCE.featureId,
        scope: 'feature',
      },
      ...overrides,
    },
  }).comment
}

function approve (moderation, commentId, suffix) {
  return moderation.applyHumanDecision({
    commentId,
    moderationStatus: 'approved',
    level: 'normal',
    suggestedAction: 'approve',
    actorUserId: 'usr_artalk_admin',
    idempotencyKey: `approve-${suffix}`,
    now: TEST_NOW,
  })
}

function harness (row, events = [{ id: 'evt_1', event_type: 'comment.created', comment_id: 'cmt_1' }]) {
  let handlerCalls = 0
  return {
    ensureReady () {},
    database: { prepare: () => ({ get: () => row }) },
    async drainModerationEvents (handler) {
      let sent = 0
      let failed = 0
      for (const event of events) {
        try { await handler(event); sent += 1 } catch { failed += 1 }
      }
      handlerCalls += events.length
      return { claimed: events.length, sent, failed }
    },
    calls: () => handlerCalls,
  }
}

const approved = {
  id: 'cmt_1',
  canonical_share_id: 'shr_1',
  share_item_id: 'item_1',
  feature_id: 'feature_1',
  display_name_snapshot: '访客',
  body_normalized: '公开留言',
  content_status: 'active',
  moderation_status: 'approved',
}

test('Artalk mirror projects the current approved state without private identity fields', async () => {
  const calls = []
  const mirror = new ArtalkMirror({
    enabled: true,
    endpoint: 'http://artalk.test',
    token: 'server-only',
    adapter: {
      health: async () => {},
      upsert: async payload => calls.push(['upsert', payload]),
      remove: async payload => calls.push(['remove', payload]),
    },
  })
  const result = await mirror.drainOnce(harness(approved))
  assert.deepEqual(result, { claimed: 1, sent: 1, failed: 0 })
  assert.deepEqual(calls, [['upsert', {
    commentId: 'cmt_1', pageKey: 'shr_1:item_1:feature_1', nick: '访客', content: '公开留言',
  }]])
  assert.equal(JSON.stringify(calls).includes('server-only'), false)
  assert.equal(JSON.stringify(calls).includes('author_user_id'), false)
})

test('all comment events re-read state and idempotently upsert by comment id', async () => {
  const calls = []
  const mirror = new ArtalkMirror({ enabled: true, endpoint: 'http://artalk.test', token: 'x', adapter: {
    health: async () => {}, upsert: async payload => calls.push(payload.commentId), remove: async () => {},
  } })
  const interaction = harness(approved, [
    { id: 'evt_1', event_type: 'comment.created', comment_id: 'cmt_1' },
    { id: 'evt_2', event_type: 'comment.approved', comment_id: 'cmt_1' },
  ])
  assert.deepEqual(await mirror.drainOnce(interaction), { claimed: 2, sent: 2, failed: 0 })
  assert.deepEqual(calls, ['cmt_1', 'cmt_1'])
})

test('non-public state removes projection and provider failure stays inside drain result', async () => {
  const hidden = { ...approved, moderation_status: 'pending' }
  const removed = []
  const mirror = new ArtalkMirror({ enabled: true, endpoint: 'http://artalk.test', token: 'x', adapter: {
    health: async () => {}, upsert: async () => {}, remove: async payload => removed.push(payload.commentId),
  } })
  assert.equal((await mirror.drainOnce(harness(hidden))).sent, 1)
  assert.deepEqual(removed, ['cmt_1'])

  const failing = new ArtalkMirror({ enabled: true, endpoint: 'http://artalk.test', token: 'x', adapter: {
    health: async () => {}, upsert: async () => { throw new Error('provider down') }, remove: async () => {},
  } })
  assert.deepEqual(await failing.drainOnce(harness(approved)), { claimed: 1, sent: 0, failed: 1 })
})

test('mirror is disabled by default and does not initialize interaction storage', async () => {
  const interaction = harness(approved)
  const result = await new ArtalkMirror().drainOnce(interaction)
  assert.deepEqual(result, { claimed: 0, sent: 0, failed: 0, skipped: true })
  assert.equal(interaction.calls(), 0)
})

test('HTTP adapter refreshes an expired token once and reuses the refreshed bearer token', async () => {
  const calls = []
  let versionCalls = 0
  const mirror = new ArtalkMirror({
    enabled: true,
    endpoint: 'http://artalk.test/api/v2',
    token: 'expired-token',
    email: 'admin@example.com',
    password: 'server-only-password',
    fetch: async (url, options = {}) => {
      const headers = new Headers(options.headers)
      calls.push({ url, method: options.method || 'GET', authorization: headers.get('authorization') || '' })
      if (url.endsWith('/auth/email/login')) {
        assert.deepEqual(JSON.parse(options.body), { email: 'admin@example.com', password: 'server-only-password' })
        return jsonResponse({ data: { token: 'refreshed-token' } })
      }
      versionCalls += 1
      if (versionCalls === 1) return jsonResponse({ message: 'expired' }, 401)
      return jsonResponse({ data: { version: '2.10.0' } })
    },
  })

  await mirror.adapter.health()
  assert.deepEqual(calls.map(call => call.authorization), ['Bearer expired-token', '', 'Bearer refreshed-token'])
  assert.equal(versionCalls, 2)
})

test('HTTP adapter logs in and retries once when Artalk AdminGuard returns 403', async () => {
  const calls = []
  let commentUpdateCalls = 0
  const mirror = new ArtalkMirror({
    enabled: true,
    endpoint: 'http://artalk.test/api/v2',
    token: 'visitor-token',
    email: 'admin@example.com',
    password: 'server-only-password',
    fetch: async (url, options = {}) => {
      const headers = new Headers(options.headers)
      calls.push({
        url,
        method: options.method || 'GET',
        authorization: headers.get('authorization') || '',
      })
      if (url.endsWith('/auth/email/login')) return jsonResponse({ data: { token: 'admin-token' } })
      if (url.endsWith('/comments/42') && options.method === 'PUT') {
        commentUpdateCalls += 1
        if (commentUpdateCalls === 1) return jsonResponse({ message: 'AdminGuard' }, 403)
        return jsonResponse({ data: { id: 42, is_pending: false } })
      }
      throw new Error(`unexpected request: ${options.method || 'GET'} ${url}`)
    },
  })

  await mirror.adapter.update({
    providerCommentId: 42,
    pageKey: 'thread-one',
    siteName: 'map-service-internal',
    nick: '镜像管理员',
    content: '公开留言',
    email: 'mirror@example.invalid',
    rid: 0,
  })

  assert.deepEqual(calls.map(call => call.authorization), [
    'Bearer visitor-token',
    '',
    'Bearer admin-token',
  ])
  assert.equal(commentUpdateCalls, 2)
})

test('HTTP adapter does not retry a second 403 after administrator login', async () => {
  const calls = []
  const mirror = new ArtalkMirror({
    enabled: true,
    endpoint: 'http://artalk.test/api/v2',
    email: 'admin@example.com',
    password: 'server-only-password',
    fetch: async (url, options = {}) => {
      const headers = new Headers(options.headers)
      calls.push({ url, authorization: headers.get('authorization') || '' })
      if (url.endsWith('/auth/email/login')) return jsonResponse({ data: { token: 'admin-token' } })
      return jsonResponse({ message: 'AdminGuard' }, 403)
    },
  })

  await assert.rejects(
    mirror.adapter.update({
      providerCommentId: 42,
      pageKey: 'thread-one',
      siteName: 'map-service-internal',
      nick: '镜像管理员',
      content: '公开留言',
      email: 'mirror@example.invalid',
      rid: 0,
    }),
    /Artalk 请求失败: 403/,
  )
  assert.deepEqual(calls.map(call => call.authorization), ['', '', 'Bearer admin-token'])
})

test('HTTP adapter publishes replies with rid and explicitly clears Artalk pending state', async () => {
  const requests = []
  const mirror = new ArtalkMirror({
    enabled: true,
    endpoint: 'http://artalk.test/api/v2',
    token: 'server-token',
    fetch: async (url, options = {}) => {
      requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null })
      if (url.endsWith('/comments') && options.method === 'POST') return jsonResponse({ data: { id: 42 } })
      if (url.endsWith('/comments/42') && options.method === 'PUT') return jsonResponse({ data: { id: 42 } })
      throw new Error(`unexpected request: ${options.method || 'GET'} ${url}`)
    },
  })

  const id = await mirror.adapter.create({
    commentId: 'cmt_reply',
    pageKey: 'map-service:share:item:feature',
    siteName: 'map-service-internal',
    nick: '回复者',
    content: '一级回复',
    email: 'mirror@example.invalid',
    rid: 17,
  })
  assert.equal(id, 42)
  assert.equal(requests[0].body.rid, 17)
  assert.equal(requests[1].body.rid, 17)
  assert.equal(requests[1].body.is_pending, false)
})

test('HTTP adapter safely recovers a unique encrypted-email match and rejects ambiguous matches', async () => {
  let requestCount = 0
  const mirror = new ArtalkMirror({
    enabled: true,
    endpoint: 'http://artalk.test/api/v2',
    token: 'server-token',
    fetch: async () => {
      requestCount += 1
      const comments = requestCount === 1
        ? [{ id: 51, page_key: 'thread-one', site_name: 'map-service-internal', email_encrypted: 'redacted' }]
        : [
            { id: 51, page_key: 'thread-one', site_name: 'map-service-internal', email_encrypted: 'redacted-a' },
            { id: 52, page_key: 'thread-one', site_name: 'map-service-internal', email_encrypted: 'redacted-b' },
          ]
      return jsonResponse({ data: { comments } })
    },
  })
  const payload = { pageKey: 'thread-one', siteName: 'map-service-internal', email: 'mirror@example.invalid' }
  assert.equal(await mirror.adapter.findExisting(payload), 51)
  assert.equal(await mirror.adapter.findExisting(payload), null)
})

test('durable projection rebuilds a missing Artalk record and clears the provider mapping on removal', async () => {
  const harness = projectionHarness()
  let mode = 'initial'
  const removed = []
  const mirror = new ArtalkMirror({
    enabled: true,
    endpoint: 'http://artalk.test/api/v2',
    token: 'server-token',
    secret: TEST_SECRET,
    adapter: {
      health: async () => {},
      findExisting: async () => null,
      create: async () => mode === 'initial' ? 101 : 202,
      update: async () => { if (mode === 'rebuild') throw new ArtalkNotFoundError() },
      remove: async ({ providerCommentId }) => removed.push(providerCommentId),
    },
  })
  try {
    const comment = submit(harness.comments, 'rebuild')
    approve(harness.moderation, comment.id, 'rebuild')
    await mirror.reconcileOnce(harness.interaction, { force: true })
    assert.equal(harness.database.prepare('SELECT provider_comment_id FROM artalk_comment_projections WHERE comment_id = ?').get(comment.id).provider_comment_id, 101)

    mode = 'rebuild'
    await mirror.reconcileOnce(harness.interaction, { force: true })
    assert.equal(harness.database.prepare('SELECT provider_comment_id FROM artalk_comment_projections WHERE comment_id = ?').get(comment.id).provider_comment_id, 202)

    harness.moderation.applyHumanDecision({
      commentId: comment.id,
      moderationStatus: 'approved',
      contentStatus: 'hidden',
      level: 'normal',
      suggestedAction: 'review',
      actorUserId: 'usr_artalk_admin',
      idempotencyKey: 'hide-rebuild',
      now: TEST_NOW,
    })
    await mirror.reconcileOnce(harness.interaction, { force: true })
    const projection = harness.database.prepare('SELECT provider_comment_id, projection_status FROM artalk_comment_projections WHERE comment_id = ?').get(comment.id)
    assert.deepEqual({ ...projection }, { provider_comment_id: null, projection_status: 'removed' })
    assert.deepEqual(removed, [202])
  } finally { harness.close() }
})

test('reply projection uses the parent provider id and hiding the parent removes the whole mirror tree', async () => {
  const harness = projectionHarness({ publicReplyEnabled: true })
  const created = []
  const removed = []
  let nextId = 300
  const mirror = new ArtalkMirror({
    enabled: true,
    endpoint: 'http://artalk.test/api/v2',
    token: 'server-token',
    secret: TEST_SECRET,
    adapter: {
      health: async () => {},
      findExisting: async () => null,
      create: async payload => { const id = nextId++; created.push({ id, ...payload }); return id },
      update: async () => {},
      remove: async ({ providerCommentId }) => removed.push(providerCommentId),
    },
  })
  try {
    const parent = submit(harness.comments, 'parent')
    approve(harness.moderation, parent.id, 'parent')
    const reply = submit(harness.comments, 'reply', { parentId: parent.id })
    approve(harness.moderation, reply.id, 'reply')

    await mirror.reconcileOnce(harness.interaction, { force: true, reconcileLimit: 10 })
    const parentProjection = harness.database.prepare('SELECT provider_comment_id FROM artalk_comment_projections WHERE comment_id = ?').get(parent.id)
    const replyCreate = created.find(item => item.commentId === reply.id)
    assert.ok(replyCreate)
    assert.equal(replyCreate.rid, parentProjection.provider_comment_id)

    harness.moderation.applyHumanDecision({
      commentId: parent.id,
      moderationStatus: 'approved',
      contentStatus: 'hidden',
      level: 'normal',
      suggestedAction: 'review',
      actorUserId: 'usr_artalk_admin',
      idempotencyKey: 'hide-parent',
      now: TEST_NOW,
    })
    await mirror.reconcileOnce(harness.interaction, { force: true, reconcileLimit: 10 })
    const projections = harness.database.prepare(`
      SELECT comment_id, provider_comment_id, projection_status
      FROM artalk_comment_projections ORDER BY comment_id
    `).all().map(row => ({ ...row }))
    assert.equal(projections.length, 2)
    assert.ok(projections.every(row => row.provider_comment_id === null && row.projection_status === 'removed'))
    assert.deepEqual(new Set(removed), new Set(created.map(item => item.id)))
  } finally { harness.close() }
})
