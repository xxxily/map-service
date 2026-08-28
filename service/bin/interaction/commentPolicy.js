/**
 * Interaction policy enforcement for comment submission.
 *
 * The shared contracts in `shared/interaction-contracts.js` normalize and
 * validate untrusted input, but they deliberately know nothing about sessions,
 * site policy or HTTP. This module is the enforcement boundary that decides
 * whether a submission is allowed at all:
 *
 * - the author type is derived from the session, never from the request body;
 * - `comments.enabled` and `comments.anonymous.enabled` are enforced fail-closed;
 * - the consent policy version always comes from the active policy row;
 * - contract error codes are mapped onto the documented HTTP statuses;
 * - idempotency identity and duplicate detection are centralised here so the
 *   partial unique index on `comments` is the single source of truth.
 */

import {
  INTERACTION_TEXT_LIMITS,
  normalizeCommentInput,
} from '../../../shared/interaction-contracts.js'
import {
  DEFAULT_INTERACTION_POLICY,
  MEDIA_DETAILS_GENERAL_DESCRIPTION_MAX_LENGTH,
  MODERATION_LEVELS,
  MODERATION_ACTIONS,
  resolveModerationAction,
} from '../../../shared/interaction-policy.js'
import { createHttpError, randomId } from '../user/security.js'
import { hashInteractionValue } from './security.js'

/**
 * Documented status for every interaction error code.
 * See docs/requirements/kml-comments-and-reports.md section 11.4.
 */
export const INTERACTION_ERROR_STATUS = Object.freeze({
  AUTH_REQUIRED: 401,
  ANONYMOUS_COMMENTS_DISABLED: 403,
  COMMENT_POLICY_BLOCKED: 403,
  SHARE_ACCESS_REQUIRED: 403,
  CSRF_INVALID: 403,
  PERMISSION_DENIED: 403,
  RESOURCE_NOT_FOUND: 404,
  COMMENT_PARENT_INVALID: 404,
  COMMENT_PARENT_HAS_REPLIES: 409,
  DUPLICATE_REQUEST: 409,
  MODERATION_TRANSITION_INVALID: 409,
  CONTENT_STATUS_TRANSITION_INVALID: 409,
  CONTENT_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERACTION_SERVICE_UNAVAILABLE: 503,
  AI_REVIEW_IN_PROGRESS: 409,
  PROMPT_VERSION_IMMUTABLE: 409,
})

const DEFAULT_ERROR_STATUS = 400

/** Target `moderation_status` for each moderation action. */
export const MODERATION_ACTION_STATUS = Object.freeze({
  approve: 'approved',
  review: 'pending',
  reject: 'rejected',
  quarantine: 'quarantined',
  spam: 'spam',
})

export function interactionErrorStatus (code) {
  return INTERACTION_ERROR_STATUS[code] || DEFAULT_ERROR_STATUS
}

export function interactionHttpError (message, code = 'VALIDATION_FAILED') {
  return createHttpError(message, interactionErrorStatus(code), code)
}

/**
 * Attach the documented status code to an error raised by the shared
 * contracts (which only carry `.code`). Errors that already have a
 * `statusCode` are returned untouched so route-level errors keep their intent.
 */
export function toInteractionHttpError (error) {
  if (!error) return interactionHttpError('交互请求处理失败', 'VALIDATION_FAILED')
  if (Number.isInteger(error.statusCode)) return error
  const code = error.code || 'VALIDATION_FAILED'
  error.statusCode = interactionErrorStatus(code)
  error.code = code
  return error
}

function clonePolicy (value) {
  if (Array.isArray(value)) return value.map(clonePolicy)
  if (!value || typeof value !== 'object') return value
  const copy = {}
  for (const [key, child] of Object.entries(value)) copy[key] = clonePolicy(child)
  return copy
}

/**
 * `createDefaultInteractionPolicy()` returns the frozen shared reference, so a
 * mutable per-site base has to be cloned before overrides can be applied.
 */
export function createMutableInteractionPolicy (overrides = {}) {
  const policy = clonePolicy(DEFAULT_INTERACTION_POLICY)
  return mergePolicy(policy, overrides)
}

export function normalizeInteractionPolicyForPublish (input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw interactionHttpError('交互策略必须是对象', 'VALIDATION_FAILED')
  }
  if (Object.hasOwn(input, 'mediaDetails')) {
    const mediaDetails = input.mediaDetails
    if (!mediaDetails || typeof mediaDetails !== 'object' || Array.isArray(mediaDetails)) {
      throw interactionHttpError('媒体详情配置必须是对象', 'VALIDATION_FAILED')
    }
    if (Object.hasOwn(mediaDetails, 'generalDescription') && typeof mediaDetails.generalDescription !== 'string') {
      throw interactionHttpError('媒体详情通用说明必须是字符串', 'VALIDATION_FAILED')
    }
  }

  const policy = createMutableInteractionPolicy(input)

  const moderation = policy.moderation || {}
  const ai = moderation.ai || {}
  if (typeof ai.enabled !== 'boolean') {
    throw interactionHttpError('AI 审核开关必须是布尔值', 'VALIDATION_FAILED')
  }
  const boundedString = (value, label, maxLength = 64, required = false) => {
    if (typeof value !== 'string') throw interactionHttpError(`${label}必须是字符串`, 'VALIDATION_FAILED')
    const normalized = value.trim()
    if (required && !normalized) throw interactionHttpError(`${label}不能为空`, 'VALIDATION_FAILED')
    if (normalized.length > maxLength) throw interactionHttpError(`${label}不能超过 ${maxLength} 个字符`, 'VALIDATION_FAILED')
    return normalized
  }
  ai.providerId = boundedString(ai.providerId, 'AI provider ID', 100)
  ai.promptVersion = boundedString(ai.promptVersion, 'AI 提示词版本', 64, true)
  ai.policyVersion = boundedString(ai.policyVersion, 'AI 策略版本标识', 64, true)
  const boundedInteger = (value, label, min, max = Number.MAX_SAFE_INTEGER) => {
    const number = Number(value)
    if (!Number.isInteger(number) || number < min || number > max) {
      const range = max === Number.MAX_SAFE_INTEGER ? `不小于 ${min} 的安全整数` : `${min} 到 ${max} 的整数`
      throw interactionHttpError(`${label}必须是${range}`, 'VALIDATION_FAILED')
    }
    return number
  }
  ai.timeoutMs = boundedInteger(ai.timeoutMs, 'AI 超时', 100, 120000)
  ai.maxAttempts = boundedInteger(ai.maxAttempts, 'AI 最大尝试次数', 1, 4)
  ai.dailyBudget = boundedInteger(ai.dailyBudget, 'AI 每日预算', 0)
  ai.maxConcurrency = boundedInteger(ai.maxConcurrency, 'AI 最大并发数', 1, 128)

  const actions = moderation.actions || {}
  for (const level of MODERATION_LEVELS) {
    if (!MODERATION_ACTIONS.includes(actions[level])) {
      throw interactionHttpError(`AI 等级 ${level} 的动作不合法`, 'VALIDATION_FAILED')
    }
  }
  if (actions.unknown !== 'review') {
    throw interactionHttpError('unknown 等级只能进入人工复核', 'VALIDATION_FAILED')
  }
  if (!['review', 'quarantine'].includes(actions.illegal_or_ip)) {
    throw interactionHttpError('illegal_or_ip 等级只能进入复核或隔离', 'VALIDATION_FAILED')
  }
  if (!Array.isArray(moderation.autoApproveLevels) || moderation.autoApproveLevels.some(level => !MODERATION_LEVELS.includes(level))) {
    throw interactionHttpError('AI 自动放行等级不合法', 'VALIDATION_FAILED')
  }
  if (moderation.autoApproveLevels.includes('unknown') || moderation.autoApproveLevels.includes('illegal_or_ip')) {
    throw interactionHttpError('unknown 和 illegal_or_ip 不允许自动放行', 'VALIDATION_FAILED')
  }
  policy.moderation.ai = ai
  const description = policy.mediaDetails?.generalDescription
  if (typeof description !== 'string') {
    throw interactionHttpError('媒体详情通用说明必须是字符串', 'VALIDATION_FAILED')
  }
  const normalizedDescription = description.trim()
  if (normalizedDescription.length > MEDIA_DETAILS_GENERAL_DESCRIPTION_MAX_LENGTH) {
    throw interactionHttpError(`媒体详情通用说明不能超过 ${MEDIA_DETAILS_GENERAL_DESCRIPTION_MAX_LENGTH} 个字符`, 'VALIDATION_FAILED')
  }
  policy.mediaDetails.generalDescription = normalizedDescription
  return policy
}

function mergePolicy (base, overrides) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return base
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      base[key] = mergePolicy(base[key] && typeof base[key] === 'object' ? base[key] : {}, value)
    } else {
      base[key] = clonePolicy(value)
    }
  }
  return base
}

/**
 * Read/write access to `interaction_policy_versions`. Every comment carries an
 * FK to a real version row, so the active version must exist before any
 * submission; the schema keeps a unique partial index on `active = 1`.
 */
export class InteractionPolicyStore {
  constructor (options = {}) {
    if (!options.database) throw new Error('InteractionPolicyStore 需要 database')
    this.database = options.database
    this.now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
  }

  getActiveVersion () {
    return this.database.prepare(`
      SELECT version, policy_json, active, created_by, created_at
      FROM interaction_policy_versions WHERE active = 1
    `).get() || null
  }

  /**
   * Resolve the active policy. Fail-closed: when no version is published the
   * caller gets a 503 instead of a silent fallback to defaults, because every
   * comment needs a real `consent_policy_version` FK target.
   */
  requireActivePolicy () {
    const row = this.getActiveVersion()
    if (!row) {
      throw interactionHttpError('留言策略尚未发布，请稍后再试', 'INTERACTION_SERVICE_UNAVAILABLE')
    }
    let policy
    try {
      policy = JSON.parse(row.policy_json || '{}')
    } catch {
      throw interactionHttpError('留言策略解析失败', 'INTERACTION_SERVICE_UNAVAILABLE')
    }
    return { version: row.version, policy: createMutableInteractionPolicy(policy) }
  }

  /** Publish a new version and deactivate the previous one atomically. */
  publish (policy, options = {}) {
    const createdAt = options.now || this.now()
    const createdBy = options.createdBy || ''
    const normalizedPolicy = normalizeInteractionPolicyForPublish(policy)
    return this.database.transaction(() => {
      const current = this.getActiveVersion()
      if (current) {
        this.database.prepare(`
          UPDATE interaction_policy_versions
          SET active = 0, superseded_at = ?
          WHERE version = ?
        `).run(createdAt, current.version)
      }
      const next = Number.isSafeInteger(options.version) && options.version > 0
        ? options.version
        : (this.database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM interaction_policy_versions').get().version + 1)
      this.database.prepare(`
        INSERT INTO interaction_policy_versions(version, policy_json, active, created_by, created_at)
        VALUES (?, ?, 1, ?, ?)
      `).run(next, JSON.stringify(normalizedPolicy), createdBy, createdAt)
      return next
    })
  }
}

/**
 * Derive the author identity from the session. The request body is never
 * trusted for `authorType`: `normalizeCommentInput` defaults it to
 * `anonymous`, so a logged-out caller could otherwise not be told apart from a
 * caller who simply omitted the field, and a logged-in caller could hide
 * behind an anonymous record.
 */
export function resolveCommentAuthorContext (session) {
  if (!session || !session.user || !session.user.id) {
    return { authorType: 'anonymous', authorUserId: '', displayName: '' }
  }
  const roles = Array.isArray(session.user.roles) ? session.user.roles : []
  const isAdmin = roles.some(role => role === 'admin' || role === 'super_admin' ||
    role === 'role_admin' || role === 'role_super_admin')
  return {
    authorType: isAdmin ? 'admin' : 'user',
    authorUserId: String(session.user.id),
    displayName: session.user.displayName || session.user.username || '',
  }
}

/**
 * Enforce the site policy for a submission. Fail-closed on every axis: a
 * missing policy section is treated as "not allowed" rather than "default on".
 */
export function assertCommentSubmissionAllowed (policy, authorType) {
  const comments = policy && policy.comments
  if (!comments || comments.enabled !== true) {
    throw interactionHttpError('该站点未开启留言功能', 'COMMENT_POLICY_BLOCKED')
  }
  if (authorType === 'anonymous') {
    const anonymous = comments.anonymous
    if (!anonymous || anonymous.enabled !== true) {
      throw interactionHttpError('匿名留言未开启，请先登录后再留言', 'ANONYMOUS_COMMENTS_DISABLED')
    }
  } else if (authorType !== 'user' && authorType !== 'admin') {
    throw interactionHttpError('留言作者类型不合法', 'COMMENT_POLICY_BLOCKED')
  }
  return true
}

/**
 * Stable per-author key used by the idempotency unique index and by rate
 * limiting. Logged-in authors key on the user id; anonymous authors key on
 * their contact hash when present, otherwise on the already-summarized IP.
 * Raw IPs must never reach this function.
 */
export function deriveCommentAuthorKey (input = {}, secret) {
  const authorType = input.authorType || 'anonymous'
  if (authorType === 'user' || authorType === 'admin') {
    if (!input.authorUserId) throw interactionHttpError('缺少登录用户标识', 'AUTH_REQUIRED')
    return hashInteractionValue(`user:${input.authorUserId}`, secret, 'author')
  }
  const seed = input.contactHash || input.ipSummary || ''
  if (!seed) throw interactionHttpError('匿名留言缺少可用的作者标识', 'VALIDATION_FAILED')
  return hashInteractionValue(`anon:${seed}`, secret, 'author')
}

/**
 * Decide the moderation state a newly created comment starts in.
 * `moderationRequired` wins over `autoApproveLevels`, and an unknown level can
 * never auto-approve. `approved_at` is stamped here because the schema has a
 * CHECK requiring it whenever `moderation_status = 'approved'`.
 */
export function resolveInitialModerationState (policy, options = {}) {
  const now = options.now
  const level = options.level || 'unknown'
  const moderation = (policy && policy.moderation) || {}
  const comments = (policy && policy.comments) || {}
  const action = resolveModerationAction(level, moderation.actions)
  const autoApproveLevels = Array.isArray(moderation.autoApproveLevels) ? moderation.autoApproveLevels : []
  const mayAutoApprove = comments.moderationRequired !== true &&
    level !== 'unknown' &&
    autoApproveLevels.includes(level) &&
    action === 'approve'
  // Without auto-approve the mapped action may still be `approve`; that only
  // means "no rule objected", never "publish without review".
  const mapped = MODERATION_ACTION_STATUS[action] || 'pending'
  const moderationStatus = mayAutoApprove
    ? 'approved'
    : (mapped === 'approved' ? 'pending' : mapped)
  return {
    moderationStatus,
    moderationLevel: level,
    suggestedAction: MODERATION_ACTIONS.includes(action) ? action : 'review',
    approvedAt: moderationStatus === 'approved' ? now : null,
    visibleAt: moderationStatus === 'approved' ? now : null,
  }
}

/**
 * Full enforced normalization for a public comment submission.
 * Returns the values the persistence layer needs, with the author identity and
 * consent version imposed by the server.
 */
export function normalizeCommentSubmission (options = {}) {
  const { policy, consentPolicyVersion, secret } = options
  const author = resolveCommentAuthorContext(options.session)
  assertCommentSubmissionAllowed(policy, author.authorType)

  const comments = (policy && policy.comments) || {}
  const anonymous = comments.anonymous || {}
  const body = options.input && typeof options.input === 'object' ? options.input : {}
  const maxLength = Number.isSafeInteger(comments.maxLength) && comments.maxLength > 0
    ? Math.min(comments.maxLength, INTERACTION_TEXT_LIMITS.body)
    : INTERACTION_TEXT_LIMITS.body

  if (body.parentId && comments.publicReplyEnabled !== true) {
    throw interactionHttpError('该站点未开启公开回复', 'COMMENT_POLICY_BLOCKED')
  }

  let normalized
  try {
    normalized = normalizeCommentInput({
      ...body,
      // The client cannot pick its own author type or display name identity.
      displayName: author.authorType === 'anonymous' ? body.displayName : author.displayName,
      avatar: author.authorType === 'anonymous' ? body.avatar : (options.session?.user?.avatar || ''),
      gender: author.authorType === 'anonymous' ? body.gender : (options.session?.user?.gender || ''),
    }, {
      authorType: author.authorType,
      maxLength,
      contactRequirement: anonymous.contactRequirement,
      consentPolicyVersion,
    })
  } catch (error) {
    throw toInteractionHttpError(error)
  }

  return {
    ...normalized,
    authorType: author.authorType,
    authorUserId: author.authorUserId,
    threadDepth: normalized.parentId ? 1 : 0,
    secret,
  }
}

/** Build the identity tuple that the `idx_comments_idempotency` index covers. */
export function commentIdempotencyIdentity (input = {}) {
  return {
    canonicalShareId: input.canonicalShareId || '',
    shareItemId: input.shareItemId || '',
    featureId: input.featureId || '',
    authorType: input.authorType || 'anonymous',
    authorKey: input.authorKey || '',
    clientRequestId: input.clientRequestId || '',
  }
}

/** Deterministic outbox dedupe key; the schema's unique index rejects ''. */
export function commentOutboxDedupeKey (eventType, commentId, revision = 1) {
  const type = String(eventType || '').trim()
  const id = String(commentId || '').trim()
  if (!type || !id) throw interactionHttpError('缺少事件去重键要素', 'VALIDATION_FAILED')
  return `${type}:${id}:${revision}`
}

export function isUniqueConstraintError (error) {
  return /UNIQUE constraint failed/i.test(String(error && error.message))
}

/**
 * Translate SQLite constraint failures and trigger aborts into the documented
 * interaction error codes. The parent triggers raise bare messages rather than
 * `.code` values, and a duplicate idempotency key must read as a 409 replay
 * instead of a 500.
 */
export function mapInteractionDatabaseError (error) {
  const message = String(error && error.message)
  if (/COMMENT_PARENT_HAS_REPLIES/.test(message)) {
    return interactionHttpError('父留言已有回复，不能再修改资源身份或层级', 'COMMENT_PARENT_HAS_REPLIES')
  }
  if (/COMMENT_PARENT_INVALID/.test(message)) {
    // Anti-enumeration: never reveal that a non-public parent exists.
    return interactionHttpError('资源不存在或不可评论', 'COMMENT_PARENT_INVALID')
  }
  if (isUniqueConstraintError(error) && /idx_comments_idempotency|client_request_id/i.test(message)) {
    return interactionHttpError('该请求已处理', 'DUPLICATE_REQUEST')
  }
  if (isUniqueConstraintError(error) && /idx_comment_decisions_idempotency/i.test(message)) {
    return interactionHttpError('该审核请求已处理', 'DUPLICATE_REQUEST')
  }
  if (isUniqueConstraintError(error) && /idx_comment_outbox_dedupe/i.test(message)) {
    return interactionHttpError('该事件已入队', 'DUPLICATE_REQUEST')
  }
  return toInteractionHttpError(error)
}

export function newCommentId () {
  return randomId('cmt')
}

export function newModerationDecisionId () {
  return randomId('cmd')
}

export function newOutboxEventId () {
  return randomId('evt')
}

export default {
  INTERACTION_ERROR_STATUS,
  MODERATION_ACTION_STATUS,
  InteractionPolicyStore,
  assertCommentSubmissionAllowed,
  commentIdempotencyIdentity,
  commentOutboxDedupeKey,
  createMutableInteractionPolicy,
  deriveCommentAuthorKey,
  interactionErrorStatus,
  interactionHttpError,
  isUniqueConstraintError,
  mapInteractionDatabaseError,
  newCommentId,
  newModerationDecisionId,
  newOutboxEventId,
  normalizeCommentSubmission,
  resolveCommentAuthorContext,
  resolveInitialModerationState,
  toInteractionHttpError,
}
