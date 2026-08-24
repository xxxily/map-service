/**
 * Auth, CSRF and RBAC enforcement for interaction routes, plus the redacted
 * admin projection of a comment.
 *
 * The existing user-system guards live as module-private helpers inside
 * `service/bin/simpleApi.js`. Rather than duplicating them, this module takes
 * the checks it needs as injected callbacks (`verifyCsrf`, `assertPermission`,
 * `assertSameOrigin`) so the route layer can pass the real
 * `service.verifyUserCsrf` / `service.assertUserPermission` and tests can pass
 * spies without booting the user database.
 */

import { interactionHttpError } from './commentPolicy.js'

/** Route -> required permission, per docs/requirements section 11.3. */
export const INTERACTION_ADMIN_PERMISSIONS = Object.freeze({
  'comments.list': 'admin.comment.read',
  'comments.detail': 'admin.comment.read',
  'comments.review': 'admin.comment.moderate',
  'comments.reprocess': 'admin.comment.moderate',
  'moderation.settings.read': 'admin.comment.read',
  'moderation.settings.write': 'admin.comment.policy.manage',
  'moderation.providers': 'admin.moderation.ai.manage',
  'moderation.keywords': 'admin.moderation.keyword.manage',
  'reports.list': 'admin.report.read',
  'reports.detail': 'admin.report.read',
  'reports.actions': 'admin.report.manage',
})

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function isWriteMethod (method) {
  return !SAFE_METHODS.has(String(method || 'GET').toUpperCase())
}

/**
 * Enforce the write path for a public comment submission.
 *
 * Two distinct protections, because anonymous callers have no session to bind a
 * CSRF token to:
 * - logged-in writes must present a valid session CSRF token;
 * - anonymous writes must pass the same-origin / Fetch-Metadata check.
 *
 * Anonymous writes are additionally gated on `comments.anonymous.enabled`,
 * which `assertCommentSubmissionAllowed` checks; this guard covers the
 * transport, not the policy.
 */
export function assertPublicCommentWrite (options = {}) {
  const { req, session } = options
  const method = req && req.method
  if (!isWriteMethod(method)) return { authorType: session ? 'user' : 'anonymous', csrfChecked: false }

  if (session) {
    if (typeof options.verifyCsrf !== 'function') {
      throw interactionHttpError('缺少 CSRF 校验实现', 'INTERACTION_SERVICE_UNAVAILABLE')
    }
    const token = readCsrfToken(req)
    // verifyCsrf throws 403 CSRF_INVALID on mismatch; an empty token must not
    // short-circuit into a pass.
    options.verifyCsrf(session, token)
    return { authorType: 'user', csrfChecked: true }
  }

  if (typeof options.assertSameOrigin !== 'function') {
    throw interactionHttpError('缺少同源校验实现', 'INTERACTION_SERVICE_UNAVAILABLE')
  }
  options.assertSameOrigin(req)
  return { authorType: 'anonymous', csrfChecked: false }
}

/**
 * Enforce that comments require a login when the policy disables anonymous
 * submission. Separate from the policy check so the route can answer 401 (log
 * in and retry) rather than 403 for a caller who simply has no session.
 */
export function assertCommentAuthentication (options = {}) {
  const { session, policy } = options
  if (session) return session
  const anonymousEnabled = Boolean(policy && policy.comments &&
    policy.comments.anonymous && policy.comments.anonymous.enabled === true)
  if (!anonymousEnabled) {
    throw interactionHttpError('请先登录后再留言', 'AUTH_REQUIRED')
  }
  return null
}

/**
 * RBAC for an admin interaction route. `assertPermission` is the injected
 * user-system check, which also handles super-admin implication and the
 * password-change / re-auth gates.
 */
export function assertInteractionAdminAccess (options = {}) {
  const { session, action } = options
  const permission = options.permission || INTERACTION_ADMIN_PERMISSIONS[action]
  if (!permission) {
    throw interactionHttpError('未知的管理操作', 'VALIDATION_FAILED')
  }
  if (!session) {
    throw interactionHttpError('请先登录', 'AUTH_REQUIRED')
  }
  if (typeof options.assertPermission !== 'function') {
    throw interactionHttpError('缺少权限校验实现', 'INTERACTION_SERVICE_UNAVAILABLE')
  }
  options.assertPermission(session, permission)

  if (options.req && isWriteMethod(options.req.method)) {
    if (typeof options.verifyCsrf !== 'function') {
      throw interactionHttpError('缺少 CSRF 校验实现', 'INTERACTION_SERVICE_UNAVAILABLE')
    }
    options.verifyCsrf(session, readCsrfToken(options.req))
  }
  return { session, permission }
}

function readCsrfToken (req) {
  if (!req) return ''
  if (typeof req.get === 'function') return req.get('x-csrf-token') || ''
  const headers = req.headers || {}
  return headers['x-csrf-token'] || ''
}

/**
 * Admin projection of a comment row.
 *
 * Redacted unconditionally: `body_raw_encrypted`, `contact_ciphertext`,
 * `contact_hash`, `author_key`, `resource_snapshot_json` and any raw IP or user
 * agent. Contact presence is reported as a type only, so a moderator can see
 * that a reporter left an email without the value being readable. Nothing here
 * ever returns plaintext contact details, keys or tokens.
 */
export function redactModerationComment (row) {
  if (!row) return null
  return {
    id: row.id,
    canonicalShareId: row.canonical_share_id,
    sharePublicIdSnapshot: row.share_public_id_snapshot,
    shareItemId: row.share_item_id,
    featureId: row.feature_id,
    scope: row.scope,
    contentRevision: row.content_revision,
    parentId: row.parent_id || '',
    threadDepth: row.thread_depth,
    authorType: row.author_type,
    // Present as a boolean: moderators need "is this a registered author",
    // not the account identifier.
    authorRegistered: Boolean(row.author_user_id),
    displayName: row.display_name_snapshot || '',
    body: row.body_normalized || '',
    contactType: row.contact_type || '',
    contactProvided: Boolean(row.contact_type),
    contentStatus: row.content_status,
    moderationStatus: row.moderation_status,
    moderationLevel: row.moderation_level,
    consentPolicyVersion: row.consent_policy_version,
    legalHold: row.legal_hold === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at || '',
    visibleAt: row.visible_at || '',
    deletedAt: row.deleted_at || '',
  }
}

export function redactModerationComments (rows = []) {
  return rows.map(redactModerationComment).filter(Boolean)
}

/** Field names that must never appear in any interaction API response. */
export const FORBIDDEN_RESPONSE_FIELDS = Object.freeze([
  'body_raw_encrypted', 'bodyRawEncrypted',
  'contact_ciphertext', 'contactCiphertext',
  'contact_hash', 'contactHash',
  'author_key', 'authorKey',
  'author_user_id', 'authorUserId',
  'email', 'phone',
  'resource_snapshot_json', 'resourceSnapshotJson',
  'ipSummary', 'ip', 'userAgent',
  'csrfHash', 'csrfToken', 'token', 'secret',
])

/**
 * Defence in depth for tests and for the route layer: walk a payload and
 * report any forbidden key. Returns the offending paths so a failure names the
 * field instead of just failing.
 */
export function findForbiddenResponseFields (payload, path = '$', seen = new WeakSet()) {
  if (!payload || typeof payload !== 'object') return []
  if (seen.has(payload)) return []
  seen.add(payload)
  const found = []
  if (Array.isArray(payload)) {
    payload.forEach((item, index) => {
      found.push(...findForbiddenResponseFields(item, `${path}[${index}]`, seen))
    })
    return found
  }
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_RESPONSE_FIELDS.includes(key)) found.push(`${path}.${key}`)
    found.push(...findForbiddenResponseFields(value, `${path}.${key}`, seen))
  }
  return found
}

export default {
  FORBIDDEN_RESPONSE_FIELDS,
  INTERACTION_ADMIN_PERMISSIONS,
  assertCommentAuthentication,
  assertInteractionAdminAccess,
  assertPublicCommentWrite,
  findForbiddenResponseFields,
  redactModerationComment,
  redactModerationComments,
}
