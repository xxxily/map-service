/**
 * Public comment visibility, counts and redaction.
 *
 * The only definition of "public" is `content_status = 'active'` AND
 * `moderation_status = 'approved'` (`isPublicComment`). Pending, rejected,
 * quarantined, spam and orphaned comments must never influence the public list
 * or the badge count, so every query in this module carries that predicate in
 * the column order of the `idx_comments_public_order` partial index.
 *
 * The public projections select only the columns
 * `serializePublicComment` needs. Contact ciphertext, contact hashes, the
 * encrypted body, author user ids and moderation levels are never selected, so
 * they cannot leak through a serializer change.
 */

import {
  serializePublicComment,
  serializePublicComments,
} from '../../../shared/interaction-contracts.js'
import { isPublicComment } from '../../../shared/interaction-policy.js'
import { interactionHttpError } from './commentPolicy.js'

/** Columns a public reader is allowed to see. Deliberately minimal. */
const PUBLIC_COLUMNS = `
  id, parent_id, thread_depth, display_name_snapshot, avatar_snapshot, gender_snapshot, body_normalized,
  content_status, moderation_status, approved_at, created_at
`

const PUBLIC_PREDICATE = `content_status = 'active' AND moderation_status = 'approved'`

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 20

function requireResource (resource = {}) {
  const canonicalShareId = String(resource.canonicalShareId || '')
  const shareItemId = String(resource.shareItemId || '')
  const featureId = String(resource.featureId || '')
  if (!canonicalShareId || !shareItemId || !featureId) {
    throw interactionHttpError('缺少留言资源标识', 'VALIDATION_FAILED')
  }
  return { canonicalShareId, shareItemId, featureId }
}

/**
 * Approved + active counts for a feature.
 *
 * Replies live in the same table, so a naive `COUNT(*)` mixes the two levels.
 * The badge uses `total` (all approved comments on the resource, matching the
 * public list contents); `topLevel` and `replies` are exposed so admin views
 * and tests can assert the split without a second query.
 */
export function countPublicComments (database, resource) {
  const { canonicalShareId, shareItemId, featureId } = requireResource(resource)
  const row = database.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN thread_depth = 0 THEN 1 ELSE 0 END) AS topLevel,
      SUM(CASE WHEN thread_depth = 1 THEN 1 ELSE 0 END) AS replies
    FROM comments
    WHERE canonical_share_id = ? AND share_item_id = ? AND feature_id = ?
      AND ${PUBLIC_PREDICATE}
  `).get(canonicalShareId, shareItemId, featureId)
  return {
    total: row.total || 0,
    topLevel: row.topLevel || 0,
    replies: row.replies || 0,
  }
}

/**
 * Badge value. `0` means the caller should hide the badge entirely; pending or
 * rejected comments never raise it above the approved total.
 */
export function publicCommentBadgeCount (database, resource) {
  return countPublicComments(database, resource).total
}

function normalizeLimit (value) {
  if (value == null || value === '') return DEFAULT_LIMIT
  const limit = Number(value)
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw interactionHttpError('分页大小不合法', 'VALIDATION_FAILED')
  }
  return Math.min(limit, MAX_LIMIT)
}

/**
 * Public comment list for one feature: approved + active top-level comments
 * ordered by `approved_at, id`, each with its approved + active replies.
 * The extra row fetched beyond `limit` only drives `hasMore`/`nextCursor`.
 */
export function listPublicComments (database, resource, options = {}) {
  const { canonicalShareId, shareItemId, featureId } = requireResource(resource)
  const limit = normalizeLimit(options.limit)
  const cursor = options.cursor ? decodePublicCursor(options.cursor) : null

  const params = [canonicalShareId, shareItemId, featureId]
  let cursorClause = ''
  if (cursor) {
    // Keyset pagination on the same (approved_at, id) pair the index sorts by.
    cursorClause = ' AND (approved_at > ? OR (approved_at = ? AND id > ?))'
    params.push(cursor.approvedAt, cursor.approvedAt, cursor.id)
  }

  const rows = database.prepare(`
    SELECT ${PUBLIC_COLUMNS}
    FROM comments
    WHERE canonical_share_id = ? AND share_item_id = ? AND feature_id = ?
      AND ${PUBLIC_PREDICATE}
      AND thread_depth = 0${cursorClause}
    ORDER BY approved_at ASC, id ASC
    LIMIT ?
  `).all(...params, limit + 1)

  const page = rows.slice(0, limit)
  const hasMore = rows.length > limit
  const last = page[page.length - 1]

  // `serializePublicComment` re-checks each reply row itself, so it must be
  // handed raw rows, not already-serialized replies. Fetched in one batch to
  // keep the list a two-query operation regardless of page size.
  const repliesByParent = fetchPublicReplyRows(database, page.map(row => row.id))
  const items = page.map(row => serializePublicComment(row, {
    replies: repliesByParent.get(row.id) || [],
  })).filter(Boolean)

  return {
    items,
    count: countPublicComments(database, resource).total,
    hasMore,
    nextCursor: hasMore && last ? encodePublicCursor(last) : '',
  }
}

/** Raw approved + active reply rows for a batch of parents, oldest first. */
function fetchPublicReplyRows (database, parentIds = []) {
  const grouped = new Map()
  if (!parentIds.length) return grouped
  const placeholders = parentIds.map(() => '?').join(', ')
  const rows = database.prepare(`
    SELECT ${PUBLIC_COLUMNS}
    FROM comments
    WHERE parent_id IN (${placeholders}) AND thread_depth = 1 AND ${PUBLIC_PREDICATE}
    ORDER BY approved_at ASC, id ASC
  `).all(...parentIds)
  for (const row of rows) {
    if (!grouped.has(row.parent_id)) grouped.set(row.parent_id, [])
    grouped.get(row.parent_id).push(row)
  }
  return grouped
}

/** Approved + active replies of one top-level comment, oldest first. */
export function listPublicReplies (database, parentId) {
  return serializePublicComments(fetchPublicReplyRows(database, [parentId]).get(parentId) || [])
}

/**
 * A logged-in author may see the state of their own submission, including a
 * `pending` placeholder. This must not expose anyone else's pending comment,
 * so the author id is part of the predicate rather than a post-filter.
 */
export function getOwnCommentState (database, commentId, authorUserId) {
  if (!authorUserId) throw interactionHttpError('请先登录', 'AUTH_REQUIRED')
  const row = database.prepare(`
    SELECT id, content_status, moderation_status, created_at, approved_at
    FROM comments
    WHERE id = ? AND author_user_id = ? AND author_type IN ('user', 'admin')
  `).get(commentId, String(authorUserId))
  if (!row) throw interactionHttpError('资源不存在', 'RESOURCE_NOT_FOUND')
  return {
    id: row.id,
    status: isPublicComment({ contentStatus: row.content_status, moderationStatus: row.moderation_status })
      ? 'published'
      : 'pending',
    createdAt: row.created_at,
  }
}

const CURSOR_SEPARATOR = '~'

function encodePublicCursor (row) {
  return Buffer.from(`${row.approved_at || ''}${CURSOR_SEPARATOR}${row.id}`, 'utf8').toString('base64url')
}

function decodePublicCursor (cursor) {
  let decoded
  try {
    decoded = Buffer.from(String(cursor), 'base64url').toString('utf8')
  } catch {
    throw interactionHttpError('分页游标不合法', 'CURSOR_INVALID')
  }
  const index = decoded.indexOf(CURSOR_SEPARATOR)
  if (index < 1) throw interactionHttpError('分页游标不合法', 'CURSOR_INVALID')
  const approvedAt = decoded.slice(0, index)
  const id = decoded.slice(index + CURSOR_SEPARATOR.length)
  if (!id.startsWith('cmt_')) throw interactionHttpError('分页游标不合法', 'CURSOR_INVALID')
  return { approvedAt, id }
}

export default {
  countPublicComments,
  getOwnCommentState,
  listPublicComments,
  listPublicReplies,
  publicCommentBadgeCount,
}
export { encodePublicCursor, decodePublicCursor }
