/**
 * Moderation service: deterministic keyword screening plus the human review
 * state machine and the moderation event outbox.
 *
 * Design constraints that shape this module:
 *
 * - **No arbitrary regex.** Rules are `exact`, `phrase` or `pattern`, and
 *   `pattern` supports only a literal `*` wildcard which is expanded into a
 *   bounded, non-backtracking matcher. Accepting operator-supplied regular
 *   expressions would make the screening stage a ReDoS surface reachable from
 *   an unauthenticated comment POST.
 * - **Versioned rules.** Every decision records the
 *   `moderation_keyword_versions.version` it was produced under, so a later
 *   rule change never silently rewrites the audit history.
 * - **Deterministic severity.** When several rules match, the highest severity
 *   wins, and ties are broken by rule id so the same body always produces the
 *   same decision.
 * - **Outbox, not a message queue.** P0/P1 has no external broker, so events
 *   are appended in the same transaction as the state change and drained
 *   later. The unique `dedupe_key` makes redelivery idempotent.
 */

import {
  MODERATION_LEVELS,
  canTransitionCommentContent,
  canTransitionCommentModeration,
} from '../../../shared/interaction-policy.js'
import {
  commentOutboxDedupeKey,
  interactionHttpError,
  isUniqueConstraintError,
  mapInteractionDatabaseError,
  newModerationDecisionId,
  newOutboxEventId,
} from './commentPolicy.js'
import { isInteractionCiphertext } from './security.js'

/** Severity ordering used to pick a winner among several matches. */
const LEVEL_SEVERITY = Object.freeze({
  normal: 0,
  unknown: 1,
  spam: 2,
  risk: 3,
  violation: 4,
  illegal_or_ip: 5,
})

/** Keyword rule action -> the moderation action the pipeline should take. */
const RULE_ACTION_TO_MODERATION = Object.freeze({
  reject: 'reject',
  quarantine: 'quarantine',
  flag: 'review',
  replace: 'review',
})

const MAX_PATTERN_SEGMENTS = 16
const MAX_TERM_LENGTH = 128
const MAX_RULE_METADATA_LENGTH = 128

/** Normalize text the same way on the rule side and the content side. */
export function normalizeModerationText (value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()
}

/**
 * Match a `pattern` rule without a regular expression.
 *
 * The only supported metacharacter is `*` (any run of characters). Matching is
 * a linear left-to-right scan over the literal segments, so runtime is bounded
 * by the input length regardless of how the pattern is written.
 */
export function matchWildcardTerm (haystack, pattern) {
  const segments = String(pattern).split('*')
  if (segments.length > MAX_PATTERN_SEGMENTS) return false
  // A pattern with no wildcard behaves like a substring match.
  if (segments.length === 1) return segments[0] !== '' && haystack.includes(segments[0])

  let index = 0
  for (let position = 0; position < segments.length; position += 1) {
    const segment = segments[position]
    if (segment === '') continue
    if (position === 0) {
      // A leading literal must anchor at the start.
      if (!haystack.startsWith(segment)) return false
      index = segment.length
      continue
    }
    const found = haystack.indexOf(segment, index)
    if (found === -1) return false
    index = found + segment.length
  }
  const last = segments[segments.length - 1]
  // A trailing literal must anchor at the end.
  if (last !== '' && !haystack.endsWith(last)) return false
  return true
}

function ruleMatches (normalizedBody, rule) {
  const term = rule.normalized_term
  if (!term) return false
  switch (rule.match_type) {
    case 'exact':
      return normalizedBody === term
    case 'phrase':
      return normalizedBody.includes(term)
    case 'pattern':
      return matchWildcardTerm(normalizedBody, term)
    default:
      return false
  }
}

function ruleIsInEffect (rule, now) {
  if (rule.enabled !== 1) return false
  if (rule.starts_at && String(rule.starts_at) > now) return false
  if (rule.ends_at && String(rule.ends_at) <= now) return false
  return true
}

function normalizeKeywordRules (rules = []) {
  if (!Array.isArray(rules)) throw interactionHttpError('关键词规则必须是数组', 'VALIDATION_FAILED')
  return rules.map((rule, index) => {
    const term = normalizeModerationText(rule?.term ?? rule?.normalizedTerm)
    if (!term) throw interactionHttpError(`第 ${index + 1} 条关键词规则缺少词条`, 'VALIDATION_FAILED')
    if (term.length > MAX_TERM_LENGTH) {
      throw interactionHttpError(`第 ${index + 1} 条关键词规则词条过长`, 'CONTENT_TOO_LARGE')
    }
    const matchType = String(rule?.matchType || rule?.match_type || 'phrase')
    if (!['exact', 'phrase', 'pattern'].includes(matchType)) {
      throw interactionHttpError(`第 ${index + 1} 条关键词规则匹配方式不合法`, 'VALIDATION_FAILED')
    }
    if (matchType === 'pattern' && term.split('*').length > MAX_PATTERN_SEGMENTS) {
      throw interactionHttpError(`第 ${index + 1} 条关键词规则通配符过多`, 'VALIDATION_FAILED')
    }
    const level = String(rule?.level || '')
    if (!['risk', 'violation', 'illegal_or_ip', 'spam'].includes(level)) {
      throw interactionHttpError(`第 ${index + 1} 条关键词规则风险等级不合法`, 'VALIDATION_FAILED')
    }
    const action = String(rule?.action || '')
    if (!['reject', 'quarantine', 'flag', 'replace'].includes(action)) {
      throw interactionHttpError(`第 ${index + 1} 条关键词规则处置动作不合法`, 'VALIDATION_FAILED')
    }
    const category = String(rule?.category || '')
    const replacement = String(rule?.replacement || '')
    const id = String(rule?.id || rule?.ruleId || `draft_${index + 1}`)
    if (category.length > MAX_RULE_METADATA_LENGTH || replacement.length > MAX_RULE_METADATA_LENGTH || id.length > MAX_RULE_METADATA_LENGTH) {
      throw interactionHttpError(`第 ${index + 1} 条关键词规则元数据过长`, 'CONTENT_TOO_LARGE')
    }
    return {
      id,
      term,
      matchType,
      level,
      action,
      category,
      replacement,
      enabled: rule?.enabled === false ? 0 : 1,
      startsAt: rule?.startsAt || rule?.starts_at || null,
      endsAt: rule?.endsAt || rule?.ends_at || null,
    }
  })
}

export class ModerationService {
  constructor (options = {}) {
    if (!options.database) throw new Error('ModerationService 需要 database')
    this.database = options.database
    this.now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
    this.retention = {
      approvedCommentDays: Math.max(1, Number(options.retention?.approvedCommentDays) || 730),
      nonPublicCommentDays: Math.max(1, Number(options.retention?.nonPublicCommentDays) || 90),
    }
  }

  // ---------------------------------------------------------------- keywords

  activeKeywordVersion () {
    return this.database.prepare(`
      SELECT version, source_policy_version, rules_hash, active, created_at
      FROM moderation_keyword_versions WHERE active = 1
    `).get() || null
  }

  keywordRules (version) {
    return this.database.prepare(`
      SELECT id, policy_version, normalized_term, match_type, category, level,
             action, replacement, enabled, starts_at, ends_at
      FROM moderation_keyword_rules
      WHERE policy_version = ? AND enabled = 1
      ORDER BY id
    `).all(version)
  }

  prepareKeywordRules (rules) {
    return normalizeKeywordRules(rules)
  }

  /**
   * Publish a keyword rule set as a new active version.
   * Terms are normalized here so screening never has to normalize rules at
   * request time, and an invalid term is rejected rather than stored.
   */
  publishKeywordRules (rules = [], options = {}) {
    const createdAt = options.now || this.now()
    const createdBy = options.createdBy || ''
    const sourcePolicyVersion = options.sourcePolicyVersion
    if (!Number.isSafeInteger(sourcePolicyVersion) || sourcePolicyVersion < 1) {
      throw interactionHttpError('关键词规则必须绑定有效的策略版本', 'VALIDATION_FAILED')
    }
    const normalized = normalizeKeywordRules(rules)

    // A content-addressed hash makes an unchanged republish detectable and
    // ties every decision to the exact rule text that produced it.
    const rulesHash = `sha256:${hashRules(normalized)}`

    return this.database.transaction(() => {
      const current = this.activeKeywordVersion()
      if (current) {
        this.database.prepare(`
          UPDATE moderation_keyword_versions SET active = 0, superseded_at = ? WHERE version = ?
        `).run(createdAt, current.version)
      }
      const next = Number(this.database.prepare(
        'SELECT COALESCE(MAX(version), 0) AS version FROM moderation_keyword_versions'
      ).get().version) + 1
      this.database.prepare(`
        INSERT INTO moderation_keyword_versions(
          version, source_policy_version, rules_hash, active, created_by, change_reason, created_at
        ) VALUES (?, ?, ?, 1, ?, ?, ?)
      `).run(next, sourcePolicyVersion, rulesHash, createdBy, String(options.changeReason || ''), createdAt)
      normalized.forEach((rule, index) => {
        this.database.prepare(`
          INSERT INTO moderation_keyword_rules(
            id, policy_version, normalized_term, match_type, category, level, action,
            replacement, enabled, starts_at, ends_at, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
        `).run(
          `kwr_${next}_${String(index + 1).padStart(4, '0')}`,
          next, rule.term, rule.matchType, rule.category, rule.level, rule.action,
          rule.replacement, rule.startsAt, rule.endsAt, createdBy, createdAt, createdAt
        )
      })
      return { version: next, rulesHash, ruleCount: normalized.length }
    })
  }

  /**
   * Screen a comment body against the active keyword version.
   *
   * Returns `{level, action, reasonCodes, keywordPolicyVersion, matches}`.
   * With no active version the result is `unknown`/`review`, never
   * `normal`/`approve`: an unconfigured screener must not auto-publish.
   */
  screenText (body, options = {}) {
    const now = options.now || this.now()
    const version = this.activeKeywordVersion()
    const normalizedBody = normalizeModerationText(body)
    if (!version) {
      return {
        level: 'unknown',
        action: 'review',
        reasonCodes: ['KEYWORD_RULES_UNAVAILABLE'],
        keywordPolicyVersion: null,
        matches: [],
      }
    }
    const matches = []
    for (const rule of this.keywordRules(version.version)) {
      if (!ruleIsInEffect(rule, now)) continue
      if (!ruleMatches(normalizedBody, rule)) continue
      matches.push({
        ruleId: rule.id,
        level: rule.level,
        action: rule.action,
        category: rule.category,
        matchType: rule.match_type,
      })
    }
    if (!matches.length) {
      return {
        level: 'normal',
        action: 'approve',
        reasonCodes: [],
        keywordPolicyVersion: version.version,
        matches: [],
      }
    }
    // Highest severity wins; rule id breaks ties so the outcome is stable.
    const winner = matches.reduce((best, candidate) => {
      const bestScore = LEVEL_SEVERITY[best.level] ?? 0
      const score = LEVEL_SEVERITY[candidate.level] ?? 0
      if (score > bestScore) return candidate
      if (score === bestScore && candidate.ruleId < best.ruleId) return candidate
      return best
    })
    return {
      level: winner.level,
      action: RULE_ACTION_TO_MODERATION[winner.action] || 'review',
      // Reason codes are rule categories/ids, never the matched term: the
      // decision record must not leak the keyword list to API consumers.
      reasonCodes: [...new Set(matches.map(match => `KEYWORD:${match.category || match.ruleId}`))],
      keywordPolicyVersion: version.version,
      matches,
    }
  }

  /**
   * Dry-run a moderation rule set without writing a rule version or a
   * moderation decision.  This is deliberately separate from `screenText`
   * so the admin preview can evaluate an unsaved draft while public comment
   * requests continue to use only the active persisted version.
   */
  previewText (body, rules = null, options = {}) {
    if (!Array.isArray(rules)) return this.screenText(body, options)
    const now = options.now || this.now()
    const normalizedBody = normalizeModerationText(body)
    const matches = []
    const preparedRules = Array.isArray(options.preparedRules) ? options.preparedRules : normalizeKeywordRules(rules)
    for (const input of preparedRules) {
      const rule = {
        id: input.id,
        normalized_term: input.term,
        match_type: input.matchType,
        category: input.category,
        level: input.level,
        action: input.action,
        replacement: input.replacement,
        enabled: input.enabled,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
      }
      if (!ruleIsInEffect(rule, now) || !ruleMatches(normalizedBody, rule)) continue
      matches.push({
        ruleId: rule.id,
        level: rule.level,
        action: rule.action,
        category: rule.category,
        matchType: rule.match_type,
      })
    }
    if (!matches.length) {
      return {
        level: 'normal',
        action: 'approve',
        reasonCodes: [],
        keywordPolicyVersion: null,
        matches: [],
      }
    }
    const winner = matches.reduce((best, candidate) => {
      const bestScore = LEVEL_SEVERITY[best.level] ?? 0
      const score = LEVEL_SEVERITY[candidate.level] ?? 0
      if (score > bestScore) return candidate
      if (score === bestScore && candidate.ruleId < best.ruleId) return candidate
      return best
    })
    return {
      level: winner.level,
      action: RULE_ACTION_TO_MODERATION[winner.action] || 'review',
      reasonCodes: [...new Set(matches.map(match => `KEYWORD:${match.category || match.ruleId}`))],
      keywordPolicyVersion: null,
      matches,
    }
  }

  // --------------------------------------------------------------- decisions

  /**
   * Record a moderation decision. `idempotencyKey` is covered by a partial
   * unique index, so a retried human review collapses onto the first row
   * instead of appending a duplicate audit entry.
   */
  recordDecision (input = {}) {
    const createdAt = input.now || this.now()
    const level = MODERATION_LEVELS.includes(input.level) ? input.level : 'unknown'
    const stage = ['keyword', 'ai', 'human'].includes(input.stage) ? input.stage : 'keyword'
    const suggestedAction = ['approve', 'review', 'reject', 'quarantine', 'spam'].includes(input.suggestedAction)
      ? input.suggestedAction : 'review'
    const id = input.id || newModerationDecisionId()
    const rawResultCiphertext = String(input.rawResultCiphertext || '')
    if (rawResultCiphertext && (!isInteractionCiphertext(rawResultCiphertext) || !input.rawResultExpiresAt)) {
      throw interactionHttpError('AI 原始结果密文不合法', 'VALIDATION_FAILED')
    }
    try {
      this.database.prepare(`
        INSERT INTO comment_moderation_decisions(
          id, comment_id, content_revision, stage, level, scores_json, reason_codes_json,
          suggested_action, provider_id, model, prompt_version, keyword_policy_version,
          raw_result_ciphertext, raw_result_expires_at, result_hash, actor_user_id,
          created_at, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        String(input.commentId || ''),
        Number.isSafeInteger(input.contentRevision) && input.contentRevision > 0 ? input.contentRevision : 1,
        stage,
        level,
        JSON.stringify(input.scores || {}),
        JSON.stringify(Array.isArray(input.reasonCodes) ? input.reasonCodes : []),
        suggestedAction,
        String(input.providerId || ''),
        String(input.model || ''),
        String(input.promptVersion || ''),
        Number.isSafeInteger(input.keywordPolicyVersion) ? input.keywordPolicyVersion : null,
        rawResultCiphertext,
        input.rawResultExpiresAt || null,
        String(input.resultHash || ''),
        String(input.actorUserId || ''),
        createdAt,
        String(input.idempotencyKey || '')
      )
      return { id, created: true }
    } catch (error) {
      if (isUniqueConstraintError(error) && input.idempotencyKey) {
        const existing = this.database.prepare(`
          SELECT id FROM comment_moderation_decisions
          WHERE comment_id = ? AND content_revision = ? AND stage = ? AND idempotency_key = ?
        `).get(
          String(input.commentId || ''),
          Number.isSafeInteger(input.contentRevision) && input.contentRevision > 0 ? input.contentRevision : 1,
          stage,
          String(input.idempotencyKey)
        )
        if (existing) return { id: existing.id, created: false }
      }
      throw mapInteractionDatabaseError(error)
    }
  }

  /** Persist an AI result without changing moderation state; human review remains authoritative. */
  recordAiDecision (input = {}) {
    const scores = input.scores && typeof input.scores === 'object' ? {
      categories: input.scores,
      confidence: Number(input.confidence || 0),
      policyVersion: String(input.policyVersion || input.promptVersion || ''),
    } : {}
    return this.recordDecision({
      ...input,
      stage: 'ai',
      scores,
      providerId: input.providerId || '',
      model: input.model || '',
      promptVersion: input.promptVersion || '',
      idempotencyKey: input.idempotencyKey || `ai:${input.commentId || ''}:${input.contentRevision || 1}:${input.promptVersion || ''}`,
    })
  }

  decisionsForComment (commentId) {
    return this.database.prepare(`
      SELECT id, comment_id, content_revision, stage, level, reason_codes_json,
             suggested_action, scores_json, provider_id, model, prompt_version,
             keyword_policy_version, raw_result_ciphertext, raw_result_expires_at,
             result_hash, actor_user_id, created_at
      FROM comment_moderation_decisions
      WHERE comment_id = ?
      ORDER BY created_at, id
    `).all(String(commentId || ''))
  }

  // ----------------------------------------------------------------- outbox

  /**
   * Append a moderation event. Called inside the caller's transaction so an
   * event can never be published for a state change that rolled back.
   * A duplicate dedupe key is a successful no-op, which makes retries safe.
   */
  enqueueEvent (input = {}) {
    const createdAt = input.now || this.now()
    const commentId = String(input.commentId || '')
    const eventType = String(input.eventType || '')
    const dedupeKey = input.dedupeKey ||
      commentOutboxDedupeKey(eventType, commentId, input.revision || 1)
    const id = input.id || newOutboxEventId()
    try {
      this.database.prepare(`
        INSERT INTO comment_outbox(
          id, event_type, aggregate_type, aggregate_id, comment_id, dedupe_key,
          payload_json, status, available_at, created_at, updated_at
        ) VALUES (?, ?, 'comment', ?, ?, ?, ?, 'pending', ?, ?, ?)
      `).run(
        id, eventType, commentId, commentId, dedupeKey,
        JSON.stringify(input.payload || {}),
        input.availableAt || createdAt, createdAt, createdAt
      )
      return { id, dedupeKey, created: true }
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = this.database.prepare(
          'SELECT id FROM comment_outbox WHERE dedupe_key = ?'
        ).get(dedupeKey)
        if (existing) return { id: existing.id, dedupeKey, created: false }
      }
      throw mapInteractionDatabaseError(error)
    }
  }

  /** Claim a batch of due events. Locking is per-row inside one transaction. */
  claimEvents (options = {}) {
    const now = options.now || this.now()
    const limit = Number.isSafeInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 100) : 20
    const lockTtlMs = Number.isFinite(Number(options.lockTtlMs)) ? Math.max(1_000, Number(options.lockTtlMs)) : 60_000
    const staleBefore = new Date(new Date(now).getTime() - lockTtlMs).toISOString()
    return this.database.transaction(() => {
      // A process crash can leave an event in `processing`; recycle only locks
      // older than the bounded lease so an active provider call is not duplicated.
      this.database.prepare(`
        UPDATE comment_outbox
        SET status = 'pending', locked_at = NULL, available_at = ?, updated_at = ?
        WHERE status = 'processing' AND locked_at IS NOT NULL AND locked_at < ?
      `).run(now, now, staleBefore)
      const rows = this.database.prepare(`
        SELECT id, event_type, aggregate_id, comment_id, dedupe_key, payload_json, attempts
        FROM comment_outbox
        WHERE status = 'pending' AND available_at <= ?
        ORDER BY available_at, created_at
        LIMIT ?
      `).all(now, limit)
      for (const row of rows) {
        this.database.prepare(`
          UPDATE comment_outbox
          SET status = 'processing', locked_at = ?, attempts = attempts + 1, updated_at = ?
          WHERE id = ?
        `).run(now, now, row.id)
      }
      return rows
    })
  }

  markEventSent (id, options = {}) {
    const now = options.now || this.now()
    this.database.prepare(`
      UPDATE comment_outbox
      SET status = 'sent', sent_at = ?, locked_at = NULL, last_error = '', updated_at = ?
      WHERE id = ?
    `).run(now, now, String(id || ''))
  }

  /**
   * Return an event to the queue with a backoff, or fail it permanently once
   * the attempt budget is exhausted so a poison event cannot spin forever.
   */
  markEventFailed (id, error, options = {}) {
    const now = options.now || this.now()
    const maxAttempts = Number.isSafeInteger(options.maxAttempts) && options.maxAttempts > 0
      ? options.maxAttempts
      : 5
    const row = this.database.prepare(
      'SELECT attempts FROM comment_outbox WHERE id = ?'
    ).get(String(id || ''))
    const attempts = Number(row?.attempts || 0)
    const message = String(error?.message || error || '').slice(0, 500)
    if (attempts >= maxAttempts) {
      this.database.prepare(`
        UPDATE comment_outbox
        SET status = 'failed', locked_at = NULL, last_error = ?, updated_at = ?
        WHERE id = ?
      `).run(message, now, String(id || ''))
      return { status: 'failed', attempts }
    }
    const backoffMs = Math.min(60_000 * 2 ** attempts, 3_600_000)
    const availableAt = new Date(new Date(now).getTime() + backoffMs).toISOString()
    this.database.prepare(`
      UPDATE comment_outbox
      SET status = 'pending', locked_at = NULL, last_error = ?, available_at = ?, updated_at = ?
      WHERE id = ?
    `).run(message, availableAt, now, String(id || ''))
    return { status: 'pending', attempts, availableAt }
  }

  /** Drain due events through a handler. Used by the in-process worker. */
  async drainEvents (handler, options = {}) {
    const events = this.claimEvents(options)
    let sent = 0
    let failed = 0
    for (const event of events) {
      try {
        if (typeof handler === 'function') await handler(event)
        this.markEventSent(event.id, options)
        sent += 1
      } catch (error) {
        this.markEventFailed(event.id, error, options)
        failed += 1
      }
    }
    return { claimed: events.length, sent, failed }
  }

  // ---------------------------------------------------------- state machine

  /**
   * Apply a human moderation decision.
   *
   * Both axes are guarded by the shared transition table before the UPDATE, so
   * an illegal transition is a 409 rather than a CHECK-constraint 500. The
   * decision row, the state change and the outbox event share one transaction.
   */
  applyHumanDecision (input = {}) {
    const now = input.now || this.now()
    const commentId = String(input.commentId || '')
    const targetModeration = input.moderationStatus
    const targetContent = input.contentStatus

    return this.database.transaction(() => {
      const comment = this.database.prepare(`
        SELECT id, content_revision, content_status, moderation_status, approved_at, deleted_at
        FROM comments WHERE id = ?
      `).get(commentId)
      if (!comment) throw interactionHttpError('留言不存在', 'RESOURCE_NOT_FOUND')

      const nextModeration = targetModeration || comment.moderation_status
      const nextContent = targetContent || comment.content_status
      if (!canTransitionCommentModeration(comment.moderation_status, nextModeration)) {
        throw interactionHttpError(
          `审核状态不能从 ${comment.moderation_status} 变更为 ${nextModeration}`,
          'MODERATION_TRANSITION_INVALID'
        )
      }
      if (!canTransitionCommentContent(comment.content_status, nextContent)) {
        throw interactionHttpError(
          `内容状态不能从 ${comment.content_status} 变更为 ${nextContent}`,
          'CONTENT_STATUS_TRANSITION_INVALID'
        )
      }

      const decision = this.recordDecision({
        commentId,
        contentRevision: comment.content_revision,
        stage: input.stage || 'human',
        level: input.level || 'unknown',
        reasonCodes: input.reasonCodes || [],
        suggestedAction: input.suggestedAction || 'review',
        keywordPolicyVersion: input.keywordPolicyVersion,
        actorUserId: input.actorUserId || '',
        idempotencyKey: input.idempotencyKey || '',
        now,
      })
      // A replayed request must not re-apply the state change.
      if (!decision.created) {
        return { commentId, decisionId: decision.id, applied: false, replayed: true }
      }

      try {
        this.database.prepare(`
          UPDATE comments
          SET moderation_status = ?,
              content_status = ?,
              moderation_level = ?,
              approved_at = CASE WHEN ? = 'approved' THEN COALESCE(approved_at, ?) ELSE approved_at END,
              visible_at = CASE WHEN ? = 'approved' THEN COALESCE(visible_at, ?) ELSE visible_at END,
              retention_expires_at = CASE WHEN ? = 'approved' THEN ? ELSE ? END,
              deleted_at = CASE WHEN ? = 'deleted' THEN COALESCE(deleted_at, ?) ELSE deleted_at END,
              updated_at = ?
          WHERE id = ?
        `).run(
          nextModeration, nextContent,
          MODERATION_LEVELS.includes(input.level) ? input.level : 'unknown',
          nextModeration, now,
          nextModeration, now,
          nextModeration, new Date(Date.parse(now) + this.retention.approvedCommentDays * 86_400_000).toISOString(),
          new Date(Date.parse(now) + this.retention.nonPublicCommentDays * 86_400_000).toISOString(),
          nextContent, now,
          now, commentId
        )
      } catch (error) {
        throw mapInteractionDatabaseError(error)
      }

      const event = this.enqueueEvent({
        commentId,
        eventType: `comment.${nextModeration}`,
        revision: comment.content_revision,
        // The payload carries identity and state only — never comment text or
        // contact data, because outbox rows outlive the retention window.
        payload: {
          commentId,
          moderationStatus: nextModeration,
          contentStatus: nextContent,
          actorUserId: input.actorUserId || '',
          decisionId: decision.id,
        },
        // The dedupe key includes the decision id so two distinct decisions
        // reaching the same status both emit an event.
        dedupeKey: `comment.${nextModeration}:${commentId}:${decision.id}`,
        now,
      })

      return {
        commentId,
        decisionId: decision.id,
        eventId: event.id,
        applied: true,
        replayed: false,
        moderationStatus: nextModeration,
        contentStatus: nextContent,
      }
    })
  }
}

/** FNV-1a based content hash; non-cryptographic, only for change detection. */
function hashRules (rules) {
  const payload = JSON.stringify(rules)
  let hash = 0x811c9dc5
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export default ModerationService
