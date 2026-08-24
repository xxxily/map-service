/**
 * Comment service: persistence and query surface for public comments.
 *
 * Invariants enforced here:
 *
 * - A comment is public **only** when `content_status = 'active'` AND
 *   `moderation_status = 'approved'`. Every public read and every count goes
 *   through that predicate, so a pending or hidden comment is invisible and
 *   uncounted.
 * - Submissions start in the state the moderation pipeline decides, which is
 *   `pending` whenever review is required. Auto-approval is a policy decision
 *   made in `commentPolicy.js`, never a default here.
 * - The comment body and contact details are stored encrypted; only the
 *   normalized body needed for screening/display is kept in plaintext, and
 *   contacts are additionally hashed so a moderator can correlate submissions
 *   without the service ever decrypting them.
 * - Idempotency is delegated to the partial unique index on
 *   `(canonical_share_id, share_item_id, feature_id, author_type, author_key,
 *   client_request_id)`: a replay returns the original comment instead of
 *   creating a second one.
 * - Cursor pagination is keyed on `(approved_at, id)`, matching
 *   `idx_comments_public_order`, so paging is stable while new comments are
 *   approved.
 */

import {
  serializePublicComment,
  serializePublicComments,
} from '../../../shared/interaction-contracts.js'
import {
  commentIdempotencyIdentity,
  deriveCommentAuthorKey,
  interactionHttpError,
  isUniqueConstraintError,
  mapInteractionDatabaseError,
  newCommentId,
  normalizeCommentSubmission,
  resolveInitialModerationState,
} from './commentPolicy.js'
import {
  encryptInteractionSecret,
  hashInteractionContacts,
} from './security.js'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

/** Public-visibility predicate, shared by every read path and every count. */
const PUBLIC_PREDICATE = "content_status = 'active' AND moderation_status = 'approved'"

/**
 * Encode a pagination cursor. Opaque base64url so clients cannot craft an
 * ordering, and it carries no resource identity: the cursor is only valid
 * together with the resourceRef the caller already had to prove access to.
 */
export function encodeCommentCursor (row) {
  if (!row) return ''
  return Buffer.from(JSON.stringify({ a: row.approved_at || '', i: row.id }), 'utf8').toString('base64url')
}

export function decodeCommentCursor (cursor) {
  if (!cursor) return null
  let parsed
  try {
    parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'))
  } catch {
    throw interactionHttpError('游标格式不合法', 'CURSOR_INVALID')
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.i !== 'string' || typeof parsed.a !== 'string') {
    throw interactionHttpError('游标格式不合法', 'CURSOR_INVALID')
  }
  return { approvedAt: parsed.a, id: parsed.i }
}

export class CommentService {
  constructor (options = {}) {
    if (!options.database) throw new Error('CommentService 需要 database')
    if (!options.moderation) throw new Error('CommentService 需要 moderation')
    if (!options.secret) throw new Error('CommentService 需要加密密钥')
    this.database = options.database
    this.moderation = options.moderation
    this.policyStore = options.policyStore || null
    this.secret = options.secret
    this.now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
    this.retention = {
      approvedCommentDays: Math.max(1, Number(options.retention?.approvedCommentDays) || 730),
      nonPublicCommentDays: Math.max(1, Number(options.retention?.nonPublicCommentDays) || 90),
      anonymousContactDays: Math.max(1, Number(options.retention?.anonymousContactDays) || 90),
    }
  }

  // ------------------------------------------------------------- submission

  /**
   * Create a comment.
   *
   * `resource` must already come from the Interaction Adapter, i.e. the share
   * was authorized and the resourceRef was verified against the published
   * snapshot. This method does not re-authorize; it must never be called with
   * client-supplied identity.
   */
  submitComment (input = {}) {
    const now = input.now || this.now()
    const resource = input.resource
    if (!resource || !resource.canonicalShareId) {
      throw interactionHttpError('缺少已校验的资源引用', 'VALIDATION_FAILED')
    }
    const { policy, version: consentPolicyVersion } = input.policy && input.consentPolicyVersion
      ? { policy: input.policy, version: input.consentPolicyVersion }
      : this.requireActivePolicy()

    const normalized = normalizeCommentSubmission({
      input: input.body,
      policy,
      consentPolicyVersion,
      session: input.session,
      secret: this.secret,
    })

    // `hashInteractionContacts` returns a single keyed digest over the whole
    // contact set (or '' when no contact was supplied); the contact *kind*
    // comes from the normalized input.
    const contactHash = hashInteractionContacts(
      { email: normalized.email, phone: normalized.phone },
      this.secret
    )
    const contactType = contactHash ? normalized.type : ''
    const authorKey = deriveCommentAuthorKey({
      authorType: normalized.authorType,
      authorUserId: normalized.authorUserId,
      contactHash,
      // Only a pre-summarized visitor key reaches this layer, never a raw IP.
      ipSummary: input.clientKey || '',
    }, this.secret)

    const identity = commentIdempotencyIdentity({
      canonicalShareId: resource.canonicalShareId,
      shareItemId: resource.shareItemId,
      featureId: resource.featureId,
      authorType: normalized.authorType,
      authorKey,
      clientRequestId: normalized.clientRequestId,
    })

    // Fast path for an obvious replay; the unique index below is still the
    // authority, because two concurrent requests can both miss this lookup.
    if (identity.clientRequestId) {
      const existing = this.findByIdempotency(identity)
      if (existing) return { comment: existing, created: false, replayed: true }
    }

    const screening = this.moderation.screenText(normalized.body, { now })
    const resolvedInitial = resolveInitialModerationState(policy, { level: screening.level, now })
    // When an AI provider is enabled, deterministic auto-approval is disabled
    // until the AI suggestion is recorded and a human reviewer can confirm it.
    // The AI layer never mutates this state itself.
    const initial = input.aiEnabled
      ? {
          ...resolvedInitial,
          moderationStatus: 'pending',
          suggestedAction: 'review',
          approvedAt: null,
          visibleAt: null,
        }
      : resolvedInitial

    const id = newCommentId()
    const bodyCiphertext = encryptInteractionSecret(normalized.body, this.secret, 'comment-body')
    const contactCiphertext = contactType
      ? encryptInteractionSecret(
          JSON.stringify({ email: normalized.email, phone: normalized.phone }),
          this.secret,
          'comment-contact'
        )
      : ''
    const retentionDays = initial.moderationStatus === 'approved'
      ? this.retention.approvedCommentDays
      : this.retention.nonPublicCommentDays
    const retentionExpiresAt = new Date(Date.parse(now) + retentionDays * 86_400_000).toISOString()
    const contactExpiresAt = contactType
      ? new Date(Date.parse(now) + this.retention.anonymousContactDays * 86_400_000).toISOString()
      : null

    try {
      return this.database.transaction(() => {
        this.database.prepare(`
          INSERT INTO comments (
            id, site_id, canonical_share_id, share_public_id_snapshot, share_item_id,
            feature_id, media_id, scope, content_revision, resource_snapshot_json,
            parent_id, thread_depth, author_type, author_user_id, author_key,
            display_name_snapshot, body_raw_encrypted, body_normalized, body_rendered,
            consent_policy_version, contact_ciphertext, contact_hash, contact_type,
            content_status, moderation_status, moderation_level, visible_at,
            retention_expires_at, contact_expires_at,
            created_at, updated_at, approved_at, client_request_id
          ) VALUES (
            ?, 'map-service', ?, ?, ?, ?, '', 'feature', 1, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            'active', ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `).run(
          id,
          resource.canonicalShareId,
          resource.sharePublicId,
          resource.shareItemId,
          resource.featureId,
          JSON.stringify(normalized.resourceRef || {}),
          normalized.parentId || null,
          normalized.threadDepth,
          normalized.authorType,
          normalized.authorUserId,
          authorKey,
          normalized.displayName,
          bodyCiphertext,
          normalized.body,
          normalized.body,
          consentPolicyVersion,
          contactCiphertext,
          contactHash,
          contactType,
          initial.moderationStatus,
          initial.moderationLevel,
          initial.visibleAt,
          retentionExpiresAt,
          contactExpiresAt,
          now,
          now,
          initial.approvedAt,
          normalized.clientRequestId
        )

        // The screening decision is part of the same transaction as the row it
        // justifies, so a comment can never exist without its audit trail.
        this.moderation.recordDecision({
          commentId: id,
          contentRevision: 1,
          stage: 'keyword',
          level: screening.level,
          reasonCodes: screening.reasonCodes,
          suggestedAction: initial.suggestedAction,
          keywordPolicyVersion: screening.keywordPolicyVersion,
          idempotencyKey: `keyword:${id}:1`,
          now,
        })

        this.moderation.enqueueEvent({
          commentId: id,
          eventType: 'comment.created',
          revision: 1,
          payload: {
            commentId: id,
            canonicalShareId: resource.canonicalShareId,
            shareItemId: resource.shareItemId,
            featureId: resource.featureId,
            moderationStatus: initial.moderationStatus,
            moderationLevel: initial.moderationLevel,
          },
          now,
        })

        return { comment: this.findById(id), created: true, replayed: false }
      })
    } catch (error) {
      // A concurrent replay lost the unique-index race: return the winner
      // rather than surfacing a constraint error to the client.
      if (isUniqueConstraintError(error) && identity.clientRequestId) {
        const existing = this.findByIdempotency(identity)
        if (existing) return { comment: existing, created: false, replayed: true }
      }
      throw mapInteractionDatabaseError(error)
    }
  }

  requireActivePolicy () {
    if (!this.policyStore) {
      throw interactionHttpError('留言策略不可用', 'INTERACTION_SERVICE_UNAVAILABLE')
    }
    return this.policyStore.requireActivePolicy()
  }

  // ------------------------------------------------------------------ reads

  findById (id) {
    return this.database.prepare('SELECT * FROM comments WHERE id = ?').get(String(id || '')) || null
  }

  findByIdempotency (identity) {
    return this.database.prepare(`
      SELECT * FROM comments
      WHERE canonical_share_id = ? AND share_item_id = ? AND feature_id = ?
        AND author_type = ? AND author_key = ? AND client_request_id = ?
    `).get(
      identity.canonicalShareId, identity.shareItemId, identity.featureId,
      identity.authorType, identity.authorKey, identity.clientRequestId
    ) || null
  }

  /**
   * Count public comments for a resource. Top-level and replies are counted
   * together because the UI shows a single total per feature.
   */
  countPublicComments (resource = {}) {
    return Number(this.database.prepare(`
      SELECT COUNT(*) AS count FROM comments
      WHERE canonical_share_id = ? AND share_item_id = ? AND feature_id = ?
        AND ${PUBLIC_PREDICATE}
    `).get(
      resource.canonicalShareId || '',
      resource.shareItemId || '',
      resource.featureId || ''
    )?.count || 0)
  }

  /**
   * List public top-level comments with their public replies.
   *
   * Ordering is `(approved_at, id)` ascending to match the partial index. One
   * extra row is fetched to decide whether a `nextCursor` exists without a
   * second COUNT query.
   */
  listPublicComments (resource = {}, options = {}) {
    const limit = Number.isSafeInteger(options.limit) && options.limit > 0
      ? Math.min(options.limit, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE
    const cursor = decodeCommentCursor(options.cursor)
    const params = [
      resource.canonicalShareId || '',
      resource.shareItemId || '',
      resource.featureId || '',
    ]
    let cursorClause = ''
    if (cursor) {
      // Keyset pagination: strictly after (approved_at, id).
      cursorClause = ' AND (approved_at > ? OR (approved_at = ? AND id > ?))'
      params.push(cursor.approvedAt, cursor.approvedAt, cursor.id)
    }
    const rows = this.database.prepare(`
      SELECT * FROM comments
      WHERE canonical_share_id = ? AND share_item_id = ? AND feature_id = ?
        AND ${PUBLIC_PREDICATE} AND parent_id IS NULL${cursorClause}
      ORDER BY approved_at, id
      LIMIT ?
    `).all(...params, limit + 1)

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const items = page.map(row => serializePublicComment(row, {
      replies: this.publicReplies(row.id),
    })).filter(Boolean)

    return {
      count: this.countPublicComments(resource),
      items,
      nextCursor: hasMore ? encodeCommentCursor(page[page.length - 1]) : '',
    }
  }

  publicReplies (parentId) {
    return this.database.prepare(`
      SELECT * FROM comments
      WHERE parent_id = ? AND ${PUBLIC_PREDICATE}
      ORDER BY approved_at, id
    `).all(String(parentId || ''))
  }

  /** Serialize a list of rows for a public response (defensive re-filter). */
  serializePublic (rows) {
    return serializePublicComments(rows)
  }

  // ------------------------------------------------------------ admin reads

  /**
   * Admin listing. Uses page/limit to match the existing admin list
   * conventions, and never returns ciphertext or contact hashes.
   */
  listCommentsForAdmin (filters = {}, options = {}) {
    const limit = Number.isSafeInteger(options.limit) && options.limit > 0
      ? Math.min(options.limit, 100)
      : 20
    const page = Number.isSafeInteger(options.page) && options.page > 0 ? options.page : 1
    const where = ['1 = 1']
    const params = []
    if (filters.moderationStatus) {
      where.push('moderation_status = ?')
      params.push(filters.moderationStatus)
    }
    if (filters.contentStatus) {
      where.push('content_status = ?')
      params.push(filters.contentStatus)
    }
    if (filters.canonicalShareId) {
      where.push('canonical_share_id = ?')
      params.push(filters.canonicalShareId)
    }
    if (filters.shareItemId) {
      where.push('share_item_id = ?')
      params.push(filters.shareItemId)
    }
    if (filters.featureId) {
      where.push('feature_id = ?')
      params.push(filters.featureId)
    }
    const clause = where.join(' AND ')
    const total = Number(this.database.prepare(
      `SELECT COUNT(*) AS count FROM comments WHERE ${clause}`
    ).get(...params)?.count || 0)
    const rows = this.database.prepare(`
      SELECT id, canonical_share_id, share_public_id_snapshot, share_item_id, feature_id,
             parent_id, thread_depth, author_type, author_user_id, display_name_snapshot,
             body_normalized, content_status, moderation_status, moderation_level,
             contact_type, created_at, updated_at, approved_at, deleted_at, legal_hold
      FROM comments WHERE ${clause}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit)
    return {
      total,
      page,
      limit,
      items: rows.map(row => this.serializeAdminComment(row)),
    }
  }

  /**
   * Admin projection. Contact ciphertext and hashes are deliberately absent:
   * a moderator sees only whether a contact exists, never its value.
   */
  serializeAdminComment (row) {
    if (!row) return null
    return {
      id: row.id,
      canonicalShareId: row.canonical_share_id,
      sharePublicId: row.share_public_id_snapshot,
      shareItemId: row.share_item_id,
      featureId: row.feature_id,
      parentId: row.parent_id || '',
      threadDepth: row.thread_depth,
      authorType: row.author_type,
      authorRegistered: Boolean(row.author_user_id),
      displayName: row.display_name_snapshot,
      body: row.body_normalized,
      contentStatus: row.content_status,
      moderationStatus: row.moderation_status,
      moderationLevel: row.moderation_level,
      hasContact: Boolean(row.contact_type),
      contactType: row.contact_type || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      approvedAt: row.approved_at || '',
      deletedAt: row.deleted_at || '',
      legalHold: row.legal_hold === 1,
    }
  }

  getCommentForAdmin (id) {
    const row = this.database.prepare(`
      SELECT id, canonical_share_id, share_public_id_snapshot, share_item_id, feature_id,
             parent_id, thread_depth, author_type, author_user_id, display_name_snapshot,
             body_normalized, content_status, moderation_status, moderation_level,
             contact_type, created_at, updated_at, approved_at, deleted_at, legal_hold
      FROM comments WHERE id = ?
    `).get(String(id || ''))
    if (!row) throw interactionHttpError('留言不存在', 'RESOURCE_NOT_FOUND')
    return {
      ...this.serializeAdminComment(row),
      decisions: this.moderation.decisionsForComment(row.id).map(decision => ({
        id: decision.id,
        stage: decision.stage,
        level: decision.level,
        providerId: decision.provider_id || '',
        model: decision.model || '',
        promptVersion: decision.prompt_version || '',
        suggestedAction: decision.suggested_action,
        reasonCodes: parseJsonArray(decision.reason_codes_json),
        keywordPolicyVersion: decision.keyword_policy_version,
        scores: decision.stage === 'ai' ? parseAiScores(decision.scores_json) : null,
        confidence: decision.stage === 'ai' ? parseAiScores(decision.scores_json).confidence : null,
        policyVersion: decision.stage === 'ai' ? parseAiScores(decision.scores_json).policyVersion : '',
        resultHash: decision.result_hash || '',
        rawResultAvailable: Boolean(decision.raw_result_ciphertext),
        rawResultExpiresAt: decision.raw_result_expires_at || '',
        actorRecorded: Boolean(decision.actor_user_id),
        createdAt: decision.created_at,
      })),
    }
  }

  /**
   * Soft delete. The row is kept because moderation and legal-hold obligations
   * outlive the author's request; only `content_status` moves to `deleted`,
   * which the visibility triggers cascade to replies.
   */
  softDeleteComment (id, options = {}) {
    const now = options.now || this.now()
    const commentId = String(id || '')
    return this.database.transaction(() => {
      const row = this.database.prepare(
        'SELECT id, content_revision, content_status, legal_hold FROM comments WHERE id = ?'
      ).get(commentId)
      if (!row) throw interactionHttpError('留言不存在', 'RESOURCE_NOT_FOUND')
      if (row.content_status === 'deleted') {
        return { commentId, deleted: false, alreadyDeleted: true }
      }
      if (row.legal_hold === 1) {
        throw interactionHttpError('该留言处于法律保留状态，不能删除', 'COMMENT_POLICY_BLOCKED')
      }
      try {
        this.database.prepare(`
          UPDATE comments
          SET content_status = 'deleted', deleted_at = ?, updated_at = ?
          WHERE id = ?
        `).run(now, now, commentId)
      } catch (error) {
        throw mapInteractionDatabaseError(error)
      }
      this.moderation.enqueueEvent({
        commentId,
        eventType: 'comment.deleted',
        revision: row.content_revision,
        payload: { commentId, actorUserId: options.actorUserId || '' },
        dedupeKey: `comment.deleted:${commentId}:${row.content_revision}`,
        now,
      })
      return { commentId, deleted: true, alreadyDeleted: false }
    })
  }

  /**
   * Correlate submissions by contact without decrypting: the caller passes the
   * plaintext contact set, and only its keyed digest touches the query. The
   * hash must be produced exactly as `submitComment` produced it, so this goes
   * through `hashInteractionContacts` rather than hashing a single field.
   */
  findByContact (contact = {}, options = {}) {
    const hash = hashInteractionContacts(
      { email: contact.email || '', phone: contact.phone || '' },
      this.secret
    )
    if (!hash) return []
    const limit = Number.isSafeInteger(options.limit) && options.limit > 0
      ? Math.min(options.limit, 100)
      : 20
    return this.database.prepare(`
      SELECT id, canonical_share_id, feature_id, content_status, moderation_status, created_at
      FROM comments WHERE contact_hash = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(hash, limit)
  }
}

function parseJsonArray (value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseAiScores (value) {
  try {
    const parsed = JSON.parse(value || '{}')
    const categories = parsed?.categories && typeof parsed.categories === 'object'
      ? parsed.categories
      : parsed
    return {
      categories: categories && typeof categories === 'object' ? categories : {},
      confidence: Number.isFinite(Number(parsed?.confidence)) ? Number(parsed.confidence) : 0,
      policyVersion: String(parsed?.policyVersion || ''),
    }
  } catch {
    return { categories: {}, confidence: 0, policyVersion: '' }
  }
}

export default CommentService
