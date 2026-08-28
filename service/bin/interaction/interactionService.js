/**
 * Interaction facade: the single object the API layer talks to.
 *
 * The routes must not know whether comments live in their own database, how
 * the policy version is resolved, or how rate limiting is bucketed. This
 * facade owns that composition:
 *
 *   InteractionDatabase -> InteractionPolicyStore
 *                       -> ModerationService
 *                       -> CommentService
 *   UserContentService  -> InteractionAdapter (authorization + resource proof)
 *
 * Construction is lazy: the interaction database file is only opened on first
 * use, so a deployment that never enables comments does not create it, and the
 * existing tests that import `service.js` do not gain a new side effect.
 */

import InteractionDatabase from './database.js'
import InteractionAdapter from './adapter.js'
import CommentService from './commentService.js'
import ModerationService from './moderationService.js'
import ReportService from './reportService.js'
import { AiProviderRegistry } from './providerRegistry.js'
import { createServerProviderAdapters } from './providerAdapters.js'
import AiModerationEngine from './aiModeration.js'
import crypto from 'node:crypto'
import { DEFAULT_AI_PROMPT } from '../../../shared/interaction-ai.js'
import {
  InteractionPolicyStore,
  createMutableInteractionPolicy,
  interactionHttpError,
  normalizeInteractionPolicyForPublish,
  resolveInitialModerationState,
} from './commentPolicy.js'
import { createHttpError } from '../user/security.js'
import { encryptInteractionSecret, decryptInteractionSecret } from './security.js'
import { AI_PROMPT_VERSION, emptyAiScores } from '../../../shared/interaction-ai.js'

const MAX_KEYWORD_PREVIEW_TEXT_LENGTH = 10_000
const MAX_KEYWORD_PREVIEW_RULES = 5_000
const MAX_IMPACT_PREVIEW_COMMENTS = 10_000
const MAX_AI_PROMPT_TEXT_LENGTH = 20_000
const AI_REVIEW_LOCK_TTL_MS = 10 * 60 * 1000

const PROVIDER_LOAD_ERROR_CODES = new Set([
  'INTERACTION_CIPHERTEXT_INVALID',
  'INTERACTION_DECRYPT_FAILED',
  'INTERACTION_SECRET_REQUIRED',
  'AI_PROVIDER_ALLOWLIST_REQUIRED',
  'AI_PROVIDER_ADAPTER_REQUIRED',
  'VALIDATION_FAILED',
])

function actorUserId (actor) {
  return actor?.user?.id || actor?.id || ''
}

function providerLoadErrorCode (error) {
  const code = String(error?.code || '')
  return PROVIDER_LOAD_ERROR_CODES.has(code) ? code : 'CONFIG_INVALID'
}

function normalizePromptText (value) {
  if (typeof value !== 'string') throw interactionHttpError('提示词正文必须是字符串', 'VALIDATION_FAILED')
  const normalized = value.normalize('NFKC').replace(/\r\n?/gu, '\n').trim()
  if (!normalized) throw interactionHttpError('提示词正文不能为空', 'VALIDATION_FAILED')
  if (Array.from(normalized).length > MAX_AI_PROMPT_TEXT_LENGTH) {
    throw interactionHttpError(`提示词正文不能超过 ${MAX_AI_PROMPT_TEXT_LENGTH} 个字符`, 'CONTENT_TOO_LARGE')
  }
  return normalized
}

/**
 * Fixed-window limiter for comment submissions.
 *
 * Comments need their own budget: routing them through the share
 * manifest/tile limiter would let a burst of comments lock a visitor out of
 * reading the map (and vice versa).
 */
class CommentRateLimiter {
  constructor (options = {}, clock = () => Date.now()) {
    this.options = {
      maxRequests: Math.max(1, Number(options.maxRequests) || 10),
      windowMs: Math.max(1000, Number(options.windowMs) || 60_000),
      maxEntries: Math.max(100, Number(options.maxEntries) || 10_000),
    }
    this.clock = clock
    this.entries = new Map()
  }

  prune (now) {
    for (const [key, entry] of this.entries) {
      if (now - entry.startedAt >= this.options.windowMs) this.entries.delete(key)
    }
    // Keep the in-memory map bounded even when every key is still in window.
    while (this.entries.size >= this.options.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }

  consume (key) {
    const now = this.clock()
    const normalizedKey = String(key || '').slice(0, 320)
    let entry = this.entries.get(normalizedKey)
    if (!entry || now - entry.startedAt >= this.options.windowMs) {
      this.prune(now)
      entry = { startedAt: now, count: 0 }
    }
    if (entry.count >= this.options.maxRequests) {
      throw createHttpError('留言提交过于频繁，请稍后再试', 429, 'RATE_LIMITED')
    }
    entry.count += 1
    this.entries.set(normalizedKey, entry)
  }
}

export class InteractionService {
  constructor (options = {}) {
    if (!options.userContent) throw new Error('InteractionService 需要 userContent')
    this.userContent = options.userContent
    this.config = options.config || {}
    this.secret = this.config.secretEncryptionKey || ''
    this.now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
    this.clock = typeof options.clock === 'function' ? options.clock : () => Date.now()
    this.adapter = new InteractionAdapter({ userContent: this.userContent })
    this.limiter = new CommentRateLimiter(this.config.commentRateLimit || {}, this.clock)
    // Injected wholesale by tests; otherwise built on first use.
    this.database = options.database || null
    this.policyStore = options.policyStore || null
    this.moderation = options.moderation || null
    this.comments = options.comments || null
    this.reports = options.reports || null
    this.aiRegistry = options.aiRegistry || null
    this.providerAdapters = options.providerAdapters || createServerProviderAdapters({ secretResolver: options.secretResolver })
    this.secretResolver = options.secretResolver
    this.aiEngine = options.aiEngine || null
    this.aiEngineInjected = Boolean(options.aiEngine)
    this.aiRuntimeConfig = null
    this.aiTasks = new Set()
    this.aiReviewTasks = new Map()
    this.aiProviderConfigs = Array.isArray(this.config.ai?.providers) ? this.config.ai.providers : []
    // Persisted provider rows are authoritative over bootstrap configuration.
    // Keep invalid rows in a redacted management-only projection so an
    // administrator can repair them without ever reactivating stale runtime
    // closures or credentials.
    this.persistedAiProviderFailures = new Map()
    this.aiClosing = false
    this.aiRawResultsDays = Math.max(1, Number(this.config.retention?.aiRawResultsDays) || 30)
    this.retention = {
      approvedCommentDays: Math.max(1, Number(this.config.retention?.publicCommentsDays) || 730),
      nonPublicCommentDays: Math.max(1, Number(this.config.retention?.privateCommentsDays) || 90),
      anonymousContactDays: Math.max(1, Number(this.config.retention?.anonymousContactDays) || 90),
    }
  }

  /** Open the interaction database and build the services on first use. */
  ensureReady () {
    if (this.comments && this.reports) {
      this.syncAiRuntimePolicy()
      return this
    }
    if (!this.secret) {
      throw interactionHttpError('交互服务未配置加密密钥', 'INTERACTION_SERVICE_UNAVAILABLE')
    }
    if (!this.database) {
      this.database = new InteractionDatabase({ filePath: this.config.databasePath })
    }
    this.backfillCommentRetention()
    if (!this.policyStore) {
      this.policyStore = new InteractionPolicyStore({ database: this.database, now: this.now })
    }
    if (!this.moderation) {
      this.moderation = new ModerationService({ database: this.database, now: this.now, retention: this.retention })
    }
    if (!this.aiRegistry) {
      this.aiRegistry = new AiProviderRegistry({
        maxConcurrency: this.config.ai?.maxConcurrency,
        budget: this.config.ai?.dailyBudget,
        allowHosts: this.config.ai?.allowHosts,
        verificationTtlMs: this.config.ai?.providerVerificationTtlMs,
        now: () => Date.parse(this.now()) || Date.now(),
        adapters: this.providerAdapters,
        usageStore: (provider, state) => {
          if (!this.database) return
          this.database.prepare('UPDATE ai_provider_configs SET daily_budget_day = ?, daily_budget_used = ?, updated_at = ? WHERE id = ?')
            .run(state.budgetDay, state.used, this.now(), provider.id)
        },
        budgetStore: (day, budget) => {
          if (!this.database || !Number.isFinite(budget)) return true
          const now = this.now()
          return this.database.transaction(() => {
            this.database.prepare(`
              INSERT INTO ai_budget_usage(day, used, updated_at) VALUES (?, 1, ?)
              ON CONFLICT(day) DO UPDATE SET used = used + 1, updated_at = excluded.updated_at
            `).run(day, now)
            const used = Number(this.database.prepare('SELECT used FROM ai_budget_usage WHERE day = ?').get(day)?.used || 0)
            if (used <= budget) return true
            this.database.prepare('UPDATE ai_budget_usage SET used = used - 1, updated_at = ? WHERE day = ?').run(now, day)
            return false
          })
        },
        onVerificationExpired: provider => {
          if (!this.database) return
          this.database.prepare(`
            UPDATE ai_provider_configs
            SET enabled = 0, is_default = 0, health_status = 'unknown',
                last_verified_at = NULL, updated_at = ?
            WHERE id = ?
          `).run(this.now(), provider.id)
        },
      })
      for (const provider of this.aiProviderConfigs) {
        try { this.aiRegistry.register(provider) } catch { /* invalid config remains fail-closed */ }
      }
      this.loadPersistedAiProviders()
    }
    if (!this.comments) this.comments = new CommentService({
      database: this.database,
      moderation: this.moderation,
      policyStore: this.policyStore,
      secret: this.secret,
      now: this.now,
      retention: this.retention,
    })
    if (!this.reports) this.reports = new ReportService({
      database: this.database,
      policyStore: this.policyStore,
      secret: this.secret,
      now: this.now,
      reportsDays: this.config.retention?.reportsDays,
    })
    this.syncAiRuntimePolicy()
    return this
  }

  /**
   * Resolve the active policy's AI section and apply it to the in-process
   * engine. The published policy is the runtime source of truth; environment
   * configuration is only a bootstrap fallback before a policy exists.
   */
  getEffectiveAiConfig () {
    const configured = this.config.ai && typeof this.config.ai === 'object' ? this.config.ai : {}
    const active = this.policyStore?.getActiveVersion?.()
    const activePrompt = this.database?.prepare('SELECT version FROM ai_prompt_versions WHERE active = 1').get()
    if (!active) return { ...configured, ...(activePrompt?.version ? { promptVersion: activePrompt.version } : {}) }
    try {
      const policy = createMutableInteractionPolicy(JSON.parse(active.policy_json || '{}'))
      const result = { ...configured, ...(policy.moderation?.ai || {}) }
      if (activePrompt?.version) result.promptVersion = activePrompt.version
      return result
    } catch {
      return { ...configured, enabled: false }
    }
  }

  syncAiRuntimePolicy () {
    if (!this.aiRegistry || !this.policyStore || this.aiEngineInjected) return
    const ai = this.getEffectiveAiConfig()
    this.aiRuntimeConfig = ai
    this.aiRegistry.configureRuntimeLimits({ budget: ai.dailyBudget, maxConcurrency: ai.maxConcurrency })
    if (ai.enabled !== true) {
      this.aiEngine = null
      return
    }
    const providerId = String(ai.providerId || this.aiRegistry.defaultProviderId || '')
    const options = {
      registry: this.aiRegistry,
      providerId,
      timeoutMs: ai.timeoutMs,
      retries: Math.max(0, Number(ai.maxAttempts || 1) - 1),
      promptVersion: ai.promptVersion,
      promptText: this.database?.prepare('SELECT prompt_text FROM ai_prompt_versions WHERE active = 1').get()?.prompt_text || DEFAULT_AI_PROMPT,
      policyVersion: ai.policyVersion || ai.promptVersion,
      runtimeOverrides: {
        timeoutMs: ai.timeoutMs,
        maxAttempts: ai.maxAttempts,
      },
    }
    if (!this.aiEngine) this.aiEngine = new AiModerationEngine(options)
    else {
      this.aiEngine.providerId = options.providerId
      this.aiEngine.timeoutMs = Math.max(100, Number(options.timeoutMs) || 3000)
      this.aiEngine.retries = Math.max(0, Math.min(3, Number(options.retries) || 0))
      this.aiEngine.promptVersion = String(options.promptVersion || this.aiEngine.promptVersion)
      this.aiEngine.promptText = String(options.promptText || this.aiEngine.promptText || DEFAULT_AI_PROMPT)
      this.aiEngine.policyVersion = String(options.policyVersion || this.aiEngine.promptVersion)
      this.aiEngine.runtimeOverrides = { ...options.runtimeOverrides }
    }
  }

  backfillCommentRetention () {
    if (!this.database) return
    const approvedDays = this.retention.approvedCommentDays
    const privateDays = this.retention.nonPublicCommentDays
    const contactDays = this.retention.anonymousContactDays
    this.database.prepare(`
      UPDATE comments
      SET retention_expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+' || CASE WHEN moderation_status = 'approved' THEN ? ELSE ? END || ' days')
      WHERE retention_expires_at IS NULL
    `).run(approvedDays, privateDays)
    this.database.prepare(`
      UPDATE comments
      SET contact_expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+' || ? || ' days')
      WHERE contact_expires_at IS NULL AND contact_ciphertext <> ''
    `).run(contactDays)
  }

  async close () {
    this.aiClosing = true
    await this.flushAiReviews()
    if (this.database) this.database.close()
    this.database = null
    this.policyStore = null
    this.moderation = null
    this.comments = null
    this.reports = null
    this.aiTasks.clear()
    this.aiReviewTasks.clear()
    this.aiRegistry = null
    this.aiEngine = null
    this.aiClosing = false
  }

  // ------------------------------------------------------------- public API

  /**
   * Public policy view for the comment form.
   *
   * Only the fields a client needs to render and pre-validate the form are
   * exposed; moderation rules, keyword state and retention windows stay
   * server-side.
   */
  getPublicCommentPolicy (publicId, context = {}) {
    this.ensureReady()
    // Authorization first: the policy view must not be readable for a share
    // the caller cannot access.
    this.adapter.resolveShareThread(publicId, context)
    const active = this.policyStore.getActiveVersion()
    if (!active) {
      return {
        enabled: false,
        policyVersion: 0,
        anonymous: { enabled: false, contactRequirement: 'email_or_phone' },
        maxLength: 0,
        moderationRequired: true,
        publicReplyEnabled: false,
        reason: 'INTERACTION_POLICY_UNPUBLISHED',
      }
    }
    let parsed = {}
    try {
      parsed = JSON.parse(active.policy_json || '{}')
    } catch {
      throw interactionHttpError('留言策略解析失败', 'INTERACTION_SERVICE_UNAVAILABLE')
    }
    const policy = createMutableInteractionPolicy(parsed)
    const comments = policy.comments || {}
    const anonymous = comments.anonymous || {}
    return {
      enabled: comments.enabled === true,
      policyVersion: active.version,
      anonymous: {
        enabled: anonymous.enabled === true,
        contactRequirement: anonymous.contactRequirement || 'email_or_phone',
        requireConsent: anonymous.requireConsent !== false,
      },
      maxLength: Number(comments.maxLength || 0),
      moderationRequired: comments.moderationRequired !== false,
      publicReplyEnabled: comments.publicReplyEnabled === true,
    }
  }

  getPublicInfo (publicId, context = {}) {
    this.ensureReady()
    const thread = this.adapter.resolveShareThread(publicId, context)
    const metadata = this.userContent.getPublicShareMetadata(publicId)
    if (!metadata || metadata.publicId !== thread.sharePublicId) throw interactionHttpError('资源不存在或不可访问', 'RESOURCE_NOT_FOUND')
    const active = this.policyStore.getActiveVersion()
    let policy = {}
    try { policy = active ? createMutableInteractionPolicy(JSON.parse(active.policy_json || '{}')) : createMutableInteractionPolicy({}) } catch { throw interactionHttpError('交互策略解析失败', 'INTERACTION_SERVICE_UNAVAILABLE') }
    return {
      source: { title: metadata.title || '', description: metadata.description || '' },
      generalDescription: String(policy.mediaDetails?.generalDescription || '').trim(),
      agreements: { privacyUrl: '/privacy', termsUrl: '/terms' },
      reports: { enabled: policy.reports?.enabled === true, anonymousEnabled: policy.reports?.anonymous?.enabled !== false, types: Array.isArray(policy.reports?.types) ? [...policy.reports.types] : [] },
      resource: { sharePublicId: thread.sharePublicId },
    }
  }

  /** List public comments for one published feature. */
  listPublicComments (publicId, query = {}, context = {}) {
    this.ensureReady()
    const resource = this.adapter.resolveCommentQueryResource(publicId, {
      siteId: query.siteId,
      sharePublicId: query.sharePublicId,
      shareItemId: query.shareItemId,
      featureId: query.featureId,
      scope: 'feature',
    }, context)
    return this.comments.listPublicComments(resource, {
      limit: query.limit,
      cursor: query.cursor,
    })
  }

  /** Public approved-comment count for one published feature. */
  getPublicCommentCount (publicId, query = {}, context = {}) {
    this.ensureReady()
    const resource = this.adapter.resolveCommentQueryResource(publicId, {
      siteId: query.siteId,
      sharePublicId: query.sharePublicId,
      shareItemId: query.shareItemId,
      featureId: query.featureId,
      scope: 'feature',
    }, context)
    return {
      count: this.comments.countPublicComments(resource),
      resourceRef: {
        sharePublicId: resource.sharePublicId,
        shareItemId: resource.shareItemId,
        featureId: resource.featureId,
        scope: 'feature',
      },
    }
  }

  /**
   * Submit a comment.
   *
   * Order matters: authorize and verify the resource first, then rate limit on
   * the resolved canonical share, then persist. Rate limiting after
   * authorization keeps an unauthorized prober from consuming a real
   * visitor's budget.
   */
  submitComment (publicId, input = {}, context = {}) {
    this.ensureReady()
    const resource = this.adapter.resolveCommentResource(publicId, {
      siteId: input.resourceRef?.siteId,
      sharePublicId: input.resourceRef?.sharePublicId,
      shareItemId: input.resourceRef?.shareItemId,
      featureId: input.resourceRef?.featureId,
      scope: 'feature',
    }, context)

    const clientKey = this.adapter.clientKey(resource.canonicalShareId, context)
    this.limiter.consume(clientKey)

    const result = this.comments.submitComment({
      resource,
      body: { ...input, resourceRef: resource.resourceRef },
      session: context.session,
      clientKey,
      aiEnabled: Boolean(this.aiEngine),
    })
    if (result.created && this.aiEngine) this.scheduleAiReview(result.comment, context).catch(() => {})

    // The API never echoes the comment back: a pending comment is not public,
    // and returning it would leak moderation state to the author's page.
    return {
      id: result.comment.id,
      moderationStatus: result.comment.moderation_status,
      pending: result.comment.moderation_status !== 'approved',
      duplicate: result.replayed === true,
    }
  }

  scheduleAiReview (comment, context = {}, options = {}) {
    const engine = this.aiEngine
    if (!engine || !comment || this.aiClosing) return Promise.resolve(null)
    const commentId = String(comment.id || '')
    const contentRevision = Number(comment.content_revision || 1)
    const policyVersion = Number(this.policyStore?.getActiveVersion?.()?.version || 0)
    const providerRevision = this.database?.prepare('SELECT updated_at FROM ai_provider_configs WHERE id = ?').get(String(engine.providerId || ''))?.updated_at || ''
    const policyRevision = `${policyVersion}:${String(engine.policyVersion || '')}:${String(engine.promptVersion || '')}:${String(engine.providerId || '')}:${providerRevision}`
    const idempotencyKey = String(options.idempotencyKey || `ai:${commentId}:${contentRevision}:${policyRevision}`)
    const inProcess = this.aiReviewTasks.get(idempotencyKey)
    if (inProcess) return inProcess
    const current = this.database?.prepare('SELECT content_status FROM comments WHERE id = ?').get(commentId)
    if (current?.content_status === 'deleted' || (options.admin && current?.content_status !== 'active')) {
      if (options.admin) throw interactionHttpError('已删除或隐藏的留言不能重新发送给 AI', 'COMMENT_POLICY_BLOCKED')
      return Promise.resolve({ skipped: true, reason: 'COMMENT_NOT_ACTIVE' })
    }
    const claim = this.claimAiReview({ ...comment, id: commentId, content_revision: contentRevision }, idempotencyKey, policyRevision)
    if (claim.state === 'completed') return Promise.resolve({ ...claim.decision, created: false, replayed: true })
    if (claim.state === 'in_progress') return Promise.resolve({ inProgress: true, decisionId: '', replayed: false })
    const task = Promise.resolve().then(async () => {
      let decision
      try {
        decision = await engine.decide({
          body: comment.body_normalized,
          context: {
            language: context.language,
            resourceType: 'kml-feature-comment',
            hasMedia: false,
          },
        })
      } catch (error) {
        decision = {
          level: 'unknown',
          scores: emptyAiScores(),
          confidence: 0,
          suggestedAction: 'review',
          reasonCodes: ['AI_UNAVAILABLE'],
          policyVersion: engine.policyVersion,
          providerId: engine.providerId,
          model: '',
          promptVersion: engine.promptVersion,
          rawResult: null,
          resultHash: '',
          error: String(error?.message || error),
        }
      }
      const rawResult = this.serializeAiRawResult(decision.rawResult)
      const now = this.now()
      const expiresAt = rawResult
        ? new Date(new Date(now).getTime() + this.aiRawResultsDays * 86_400_000).toISOString()
        : null
      const audit = this.database.transaction(() => {
        const result = this.moderation.recordAiDecision({
          commentId,
          contentRevision,
          level: decision.level,
          scores: decision.scores,
          confidence: decision.confidence,
          reasonCodes: decision.reasonCodes,
          suggestedAction: decision.suggestedAction,
          policyVersion: decision.policyVersion,
          providerId: decision.providerId,
          model: decision.model,
          promptVersion: decision.promptVersion,
          resultHash: decision.resultHash,
          rawResultCiphertext: rawResult ? encryptInteractionSecret(rawResult, this.secret, 'ai-raw-result') : '',
          rawResultExpiresAt: expiresAt,
          idempotencyKey,
          now,
        })
        this.completeAiReviewClaim(idempotencyKey, result.id)
        return result
      })
      return { ...decision, decisionId: audit.id, created: audit.created }
    }).catch(error => {
      this.failAiReviewClaim(idempotencyKey, error)
      throw error
    })
    this.aiTasks.add(task)
    this.aiReviewTasks.set(idempotencyKey, task)
    task.finally(() => {
      this.aiTasks.delete(task)
      this.aiReviewTasks.delete(idempotencyKey)
    }).catch(() => {})
    return task
  }

  claimAiReview (comment, idempotencyKey, policyRevision) {
    const now = this.now()
    const staleBefore = new Date(Date.parse(now) - AI_REVIEW_LOCK_TTL_MS).toISOString()
    return this.database.transaction(() => {
      const existingDecision = this.database.prepare(`
        SELECT id, level, suggested_action, reason_codes_json, prompt_version, provider_id, model
        FROM comment_moderation_decisions
        WHERE comment_id = ? AND content_revision = ? AND stage = 'ai' AND idempotency_key = ?
      `).get(comment.id, comment.content_revision, idempotencyKey)
      if (existingDecision) {
        this.database.prepare(`
          INSERT INTO ai_review_claims(idempotency_key, comment_id, content_revision, policy_revision, status, decision_id, claimed_at, updated_at)
          VALUES (?, ?, ?, ?, 'completed', ?, ?, ?)
          ON CONFLICT(idempotency_key) DO UPDATE SET status = 'completed', decision_id = excluded.decision_id,
            last_error = '', updated_at = excluded.updated_at
        `).run(idempotencyKey, comment.id, comment.content_revision, policyRevision, existingDecision.id, now, now)
        let reasonCodes = []
        try { reasonCodes = JSON.parse(existingDecision.reason_codes_json || '[]') } catch {}
        return { state: 'completed', decision: { decisionId: existingDecision.id, level: existingDecision.level, suggestedAction: existingDecision.suggested_action, reasonCodes, promptVersion: existingDecision.prompt_version, providerId: existingDecision.provider_id, model: existingDecision.model } }
      }
      const claim = this.database.prepare('SELECT * FROM ai_review_claims WHERE idempotency_key = ?').get(idempotencyKey)
      if (!claim) {
        this.database.prepare(`
          INSERT INTO ai_review_claims(idempotency_key, comment_id, content_revision, policy_revision, status, claimed_at, updated_at)
          VALUES (?, ?, ?, ?, 'processing', ?, ?)
        `).run(idempotencyKey, comment.id, comment.content_revision, policyRevision, now, now)
        return { state: 'claimed' }
      }
      if (claim.status === 'processing' && String(claim.updated_at) > staleBefore) return { state: 'in_progress' }
      this.database.prepare(`
        UPDATE ai_review_claims
        SET status = 'processing', attempts = attempts + 1, last_error = '', claimed_at = ?, updated_at = ?
        WHERE idempotency_key = ?
      `).run(now, now, idempotencyKey)
      return { state: 'claimed' }
    })
  }

  completeAiReviewClaim (idempotencyKey, decisionId) {
    this.database.prepare(`
      UPDATE ai_review_claims SET status = 'completed', decision_id = ?, last_error = '', updated_at = ?
      WHERE idempotency_key = ?
    `).run(String(decisionId || ''), this.now(), idempotencyKey)
  }

  failAiReviewClaim (idempotencyKey, error) {
    if (!this.database) return
    this.database.prepare(`
      UPDATE ai_review_claims SET status = 'failed', last_error = ?, updated_at = ?
      WHERE idempotency_key = ?
    `).run(String(error?.message || error || 'AI 审核失败').slice(0, 500), this.now(), idempotencyKey)
  }

  async replayAiReviewForAdmin (actor, id, context = {}) {
    this.ensureReady()
    if (!this.aiEngine) throw interactionHttpError('AI 审核当前未启用或没有可用 provider', 'INTERACTION_SERVICE_UNAVAILABLE')
    const comment = this.database.prepare(`
      SELECT id, content_revision, body_normalized, moderation_status, content_status
      FROM comments WHERE id = ?
    `).get(String(id || ''))
    if (!comment) throw interactionHttpError('留言不存在', 'RESOURCE_NOT_FOUND')
    if (comment.content_status !== 'active') throw interactionHttpError('已删除或隐藏的留言不能重新发送给 AI', 'COMMENT_POLICY_BLOCKED')
    const decision = await this.scheduleAiReview(comment, context, { admin: true })
    if (decision?.inProgress) throw interactionHttpError('该留言正在进行 AI 审核，请稍后重试', 'AI_REVIEW_IN_PROGRESS')
    if (!decision?.decisionId) throw interactionHttpError('AI 审核决策未能持久化', 'INTERACTION_SERVICE_UNAVAILABLE')
    this.adapter.insertAudit({
      actorUserId: actorUserId(actor) || null,
      action: 'moderation.ai.replay',
      targetType: 'comment',
      targetId: comment.id,
      metadata: {
        decisionId: decision?.decisionId || '',
        level: decision?.level || 'unknown',
        reasonCodes: Array.isArray(decision?.reasonCodes) ? decision.reasonCodes : [],
      },
      ipSummary: context.ipSummary || '',
    })
    return {
      commentId: comment.id,
      replayed: true,
      decisionId: decision?.decisionId || '',
      level: decision?.level || 'unknown',
      suggestedAction: decision?.suggestedAction || 'review',
      reasonCodes: Array.isArray(decision?.reasonCodes) ? decision.reasonCodes : [],
    }
  }

  async flushAiReviews () {
    const tasks = [...this.aiTasks]
    return Promise.allSettled(tasks)
  }

  serializeAiRawResult (value) {
    if (value == null) return ''
    let serialized
    try { serialized = JSON.stringify(value) } catch { return '' }
    if (typeof serialized !== 'string' || serialized.length > 64 * 1024) return ''
    return serialized
  }

  loadPersistedAiProviders () {
    if (!this.database || !this.aiRegistry) return
    this.persistedAiProviderFailures.clear()
    const rows = this.database.prepare(`
      SELECT id, name, endpoint, model, secret_ref, enabled, is_default,
             timeout_ms, max_attempts, daily_budget, max_concurrency,
             prompt_version, redaction_json, adapter_id, api_key_ciphertext, health_status, last_verified_at,
             daily_budget_day, daily_budget_used,
             created_at, updated_at
      FROM ai_provider_configs ORDER BY id
    `).all()
    for (const row of rows) {
      try {
        const adapterId = String(row.adapter_id || 'openai-compatible').trim()
        if (!adapterId || !this.providerAdapters?.[adapterId]) {
          const error = new Error('AI provider 未绑定服务端 adapter')
          error.code = 'AI_PROVIDER_ADAPTER_REQUIRED'
          throw error
        }
        const apiKey = row.api_key_ciphertext
          ? decryptInteractionSecret(row.api_key_ciphertext, this.secret, 'ai-provider-key')
          : ''
        const provider = this.aiRegistry.register({
          id: row.id,
          name: row.name,
          endpoint: row.endpoint,
          model: row.model,
          secretRef: row.secret_ref,
          apiKey,
          enabled: row.enabled === 1,
          isDefault: row.is_default === 1,
          timeoutMs: row.timeout_ms,
          maxAttempts: row.max_attempts,
          dailyBudget: row.daily_budget,
          maxConcurrency: row.max_concurrency,
          promptVersion: row.prompt_version,
          // Never copy request/healthCheck closures from a bootstrap provider.
          // The registry must construct both functions from its trusted
          // server-side adapter catalog for this persisted record.
          adapterId,
          healthStatus: row.health_status,
          lastVerifiedAt: row.last_verified_at,
          dailyBudgetDay: row.daily_budget_day,
          dailyBudgetUsed: row.daily_budget_used,
        })
        const usable = provider.enabled === true &&
          typeof provider.request === 'function' &&
          provider.healthStatus === 'verified'
        if (!usable && row.is_default === 1) {
          // A persisted default is authoritative only while the loaded
          // provider is actually usable.  Clear the durable pointer together
          // with the in-memory pointer so a restart cannot resurrect it.
          this.database.prepare('UPDATE ai_provider_configs SET is_default = 0, updated_at = ? WHERE id = ?')
            .run(this.now(), row.id)
          this.aiRegistry.defaultProviderId = ''
        }
        if (row.health_status === 'verified' && provider.healthStatus !== 'verified') {
          this.database.prepare('UPDATE ai_provider_configs SET enabled = 0, is_default = 0, health_status = ?, last_verified_at = NULL, updated_at = ? WHERE id = ?')
            .run('unknown', this.now(), row.id)
        }
        this.persistedAiProviderFailures.delete(row.id)
      } catch (error) {
        const code = providerLoadErrorCode(error)
        // A database row must win over an identically named environment
        // provider even when it is corrupt. Removing first prevents a stale
        // bootstrap closure/key from becoming an accidental fallback.
        this.aiRegistry.remove(row.id, { promote: false })
        if (row.is_default === 1) this.aiRegistry.defaultProviderId = ''
        try {
          this.database.transaction(() => {
            this.database.prepare(`
              UPDATE ai_provider_configs
              SET enabled = 0, is_default = 0, health_status = 'failed',
                  last_verified_at = NULL, updated_at = ?
              WHERE id = ?
            `).run(this.now(), row.id)
          })
        } catch {
          // Keep the in-memory fail-closed state and management projection even
          // if a transient database failure prevents persisting the marker.
        }
        const dailyBudget = Number(row.daily_budget)
        this.persistedAiProviderFailures.set(row.id, {
          id: row.id,
          name: String(row.name || row.id || ''),
          endpoint: String(row.endpoint || ''),
          model: String(row.model || ''),
          adapterId: String(row.adapter_id || 'openai-compatible'),
          hasApiKey: Boolean(row.api_key_ciphertext),
          configured: false,
          enabled: false,
          requestedEnabled: row.enabled === 1,
          isDefault: false,
          health: 'failed',
          lastVerifiedAt: null,
          timeoutMs: Number(row.timeout_ms) || 3000,
          maxAttempts: Number(row.max_attempts) || 2,
          dailyBudget: Number.isFinite(dailyBudget) && dailyBudget > 0 ? Math.floor(dailyBudget) : 0,
          maxConcurrency: Number(row.max_concurrency) || 2,
          promptVersion: String(row.prompt_version || ''),
          budgetUnlimited: !(Number.isFinite(dailyBudget) && dailyBudget > 0),
          loadErrorCode: code,
        })
        try {
          this.adapter.insertAudit({
            actorUserId: null,
            action: 'moderation.provider.load_failed',
            targetType: 'ai_provider',
            targetId: String(row.id || ''),
            metadata: { phase: 'startup', code, healthStatus: 'failed' },
          })
        } catch {
          // Audit persistence must never make startup fall back to a secret.
        }
        console.warn('[interaction ai provider load failed]', { id: String(row.id || ''), code })
      }
    }
  }

  listAiProvidersForAdmin () {
    this.ensureReady()
    // Keep this projection explicit. The registry holds decrypted credentials
    // for outbound requests; an accidental field added to `list()` must never
    // turn into a management API leak.
    const providers = this.aiRegistry.list().map((provider) => ({
      id: provider.id,
      name: provider.name,
      endpoint: provider.endpoint,
      model: provider.model,
      adapterId: provider.adapterId,
      hasApiKey: provider.hasApiKey === true,
      configured: provider.configured === true,
      enabled: provider.enabled === true,
      requestedEnabled: provider.requestedEnabled !== false,
      isDefault: provider.isDefault === true,
      health: provider.health || 'unknown',
      lastVerifiedAt: provider.lastVerifiedAt || null,
      timeoutMs: provider.timeoutMs,
      maxAttempts: provider.maxAttempts,
      dailyBudget: provider.dailyBudget,
      maxConcurrency: provider.maxConcurrency,
      promptVersion: provider.promptVersion || '',
      budgetUnlimited: provider.budgetUnlimited === true,
    }))
    const registeredIds = new Set(providers.map(provider => provider.id))
    for (const failure of this.persistedAiProviderFailures.values()) {
      if (!registeredIds.has(failure.id)) providers.push({ ...failure })
    }
    providers.sort((left, right) => String(left.id).localeCompare(String(right.id)))
    return { enabled: this.getEffectiveAiConfig().enabled === true, defaultProviderId: this.aiRegistry.defaultProviderId, providers }
  }

  configureAiProviderForAdmin (actor, input = {}, context = {}) {
    this.ensureReady()
    const id = String(input.id || '').trim()
    const existing = id ? this.database.prepare('SELECT * FROM ai_provider_configs WHERE id = ?').get(id) : null
    const persistedDefault = this.database.prepare(
      'SELECT id FROM ai_provider_configs WHERE is_default = 1 LIMIT 1'
    ).get()
    const isDefault = input.isDefault === true || (
      input.isDefault === undefined && (existing?.is_default === 1 || !persistedDefault)
    )
    const secretRef = String(input.secretRef || existing?.secret_ref || '').trim()
    const suppliedApiKey = String(input.apiKey || '').trim()
    let existingApiKey = ''
    if (!suppliedApiKey && existing?.api_key_ciphertext) {
      try {
        existingApiKey = decryptInteractionSecret(existing.api_key_ciphertext, this.secret, 'ai-provider-key')
      } catch (error) {
        const code = error?.code === 'INTERACTION_CIPHERTEXT_INVALID' || error?.code === 'INTERACTION_DECRYPT_FAILED'
          ? error.code
          : 'INTERACTION_DECRYPT_FAILED'
        throw interactionHttpError('现有 API Key 密文无法解密，请重新填写 API Key', code)
      }
    }
    const apiKey = suppliedApiKey || existingApiKey
    if (!secretRef && !apiKey) throw interactionHttpError('新增 AI provider 必须提供 API Key 或 secretRef', 'VALIDATION_FAILED')
    const adapterId = String(input.adapterId || existing?.adapter_id || 'openai-compatible').trim()
    const aiConfig = this.getEffectiveAiConfig()
    const effectiveModel = String(input.model ?? existing?.model ?? '')
    const effectivePromptVersion = String(input.promptVersion ?? existing?.prompt_version ?? aiConfig.promptVersion ?? 'interaction-moderation-v1')
    const effectiveTimeoutMs = Number(input.timeoutMs ?? existing?.timeout_ms ?? aiConfig.timeoutMs ?? 3000)
    const effectiveMaxAttempts = Number(input.maxAttempts ?? existing?.max_attempts ?? aiConfig.maxAttempts ?? 2)
    const effectiveDailyBudget = Number(input.dailyBudget ?? existing?.daily_budget ?? aiConfig.dailyBudget ?? 0)
    const effectiveMaxConcurrency = Number(input.maxConcurrency ?? existing?.max_concurrency ?? aiConfig.maxConcurrency ?? 2)
    if (!id || id.length > 100) throw interactionHttpError('AI provider ID 必须是 1 到 100 个字符', 'VALIDATION_FAILED')
    if (!effectivePromptVersion.trim() || effectivePromptVersion.trim().length > 64) throw interactionHttpError('AI provider 提示词版本必须是 1 到 64 个字符', 'VALIDATION_FAILED')
    if (!Number.isInteger(effectiveTimeoutMs) || effectiveTimeoutMs < 100 || effectiveTimeoutMs > 120000) throw interactionHttpError('AI provider 超时必须是 100 到 120000 的整数', 'VALIDATION_FAILED')
    if (!Number.isInteger(effectiveMaxAttempts) || effectiveMaxAttempts < 1 || effectiveMaxAttempts > 4) throw interactionHttpError('AI provider 最大尝试次数必须是 1 到 4 的整数', 'VALIDATION_FAILED')
    if (!Number.isSafeInteger(effectiveDailyBudget) || effectiveDailyBudget < 0) throw interactionHttpError('AI provider 每日预算必须是不小于 0 的安全整数', 'VALIDATION_FAILED')
    if (!Number.isInteger(effectiveMaxConcurrency) || effectiveMaxConcurrency < 1 || effectiveMaxConcurrency > 128) throw interactionHttpError('AI provider 并发数必须是 1 到 128 的整数', 'VALIDATION_FAILED')
    const effectiveRedaction = JSON.stringify(input.redaction ?? (existing ? (() => {
      try { return JSON.parse(existing.redaction_json || '{}') } catch { return {} }
    })() : {}))
    const canReuseVerification = Boolean(existing && existing.health_status === 'verified' && existing.last_verified_at &&
      existing.endpoint === String(input.endpoint || existing.endpoint) &&
      existing.secret_ref === secretRef &&
      !suppliedApiKey &&
      String(existing.adapter_id || 'openai-compatible') === adapterId &&
      String(existing.model || '') === effectiveModel &&
      String(existing.prompt_version || '') === effectivePromptVersion &&
      Number(existing.timeout_ms || 3000) === effectiveTimeoutMs &&
      Number(existing.max_attempts || 2) === effectiveMaxAttempts &&
      Number(existing.daily_budget || 0) === effectiveDailyBudget &&
      Number(existing.max_concurrency || 2) === effectiveMaxConcurrency &&
      String(existing.redaction_json || '{}') === effectiveRedaction)
    const existingVerified = canReuseVerification
    const requestedEnabled = input.enabled !== false
    const requestedDefault = isDefault
    if (!this.providerAdapters[adapterId]) {
      throw interactionHttpError('AI provider 未绑定服务端 adapter', 'AI_PROVIDER_ADAPTER_REQUIRED')
    }
    const provider = this.aiRegistry.register({
      ...input,
      id,
      secretRef,
      apiKey,
      adapterId,
      model: effectiveModel,
      promptVersion: effectivePromptVersion,
      timeoutMs: effectiveTimeoutMs,
      maxAttempts: effectiveMaxAttempts,
      dailyBudget: effectiveDailyBudget,
      maxConcurrency: effectiveMaxConcurrency,
      request: undefined,
      healthCheck: undefined,
      enabled: requestedEnabled,
      isDefault: false,
      healthStatus: existingVerified ? 'verified' : 'unknown',
      lastVerifiedAt: existing?.last_verified_at || '',
      dailyBudgetDay: existing?.daily_budget_day || '',
      dailyBudgetUsed: existing?.daily_budget_used || 0,
    })
    const effectiveDefault = requestedDefault && provider.enabled && provider.request
    const now = this.now()
    this.database.transaction(() => {
      if (effectiveDefault) this.database.prepare('UPDATE ai_provider_configs SET is_default = 0').run()
      if (!effectiveDefault && existing?.is_default === 1) {
        this.database.prepare('UPDATE ai_provider_configs SET is_default = 0 WHERE id = ?').run(provider.id)
      }
      this.database.prepare(`
        INSERT INTO ai_provider_configs(
          id, name, endpoint, model, secret_ref, enabled, is_default,
          timeout_ms, max_attempts, daily_budget, max_concurrency,
          prompt_version, redaction_json, health_status, last_verified_at,
          adapter_id, api_key_ciphertext, daily_budget_day, daily_budget_used, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, endpoint = excluded.endpoint, model = excluded.model,
          secret_ref = excluded.secret_ref, enabled = excluded.enabled,
          is_default = excluded.is_default, timeout_ms = excluded.timeout_ms,
          max_attempts = excluded.max_attempts, daily_budget = excluded.daily_budget,
          max_concurrency = excluded.max_concurrency, prompt_version = excluded.prompt_version,
          redaction_json = excluded.redaction_json, adapter_id = excluded.adapter_id,
          api_key_ciphertext = excluded.api_key_ciphertext,
          health_status = excluded.health_status, last_verified_at = excluded.last_verified_at,
          updated_at = excluded.updated_at
      `).run(
        provider.id, provider.name, provider.endpoint, provider.model, provider.secretRef,
        provider.enabled ? 1 : 0, effectiveDefault ? 1 : 0,
        provider.timeoutMs, provider.maxAttempts,
        Number.isFinite(effectiveDailyBudget) && effectiveDailyBudget > 0 ? Math.floor(effectiveDailyBudget) : 0,
        provider.state.maxConcurrency,
        effectivePromptVersion.trim(),
        effectiveRedaction, provider.healthStatus, provider.lastVerifiedAt || null, adapterId,
        encryptInteractionSecret(apiKey, this.secret, 'ai-provider-key'), provider.state.budgetDay, provider.state.used, existing?.created_at || now, now
      )
    })
    this.persistedAiProviderFailures.delete(provider.id)
    if (!effectiveDefault && this.aiRegistry.defaultProviderId === provider.id) this.aiRegistry.defaultProviderId = ''
    if (effectiveDefault) this.aiRegistry.setDefault(provider.id)
    if (this.aiEngine && this.aiEngine.providerId === provider.id && !provider.enabled) this.aiEngine.providerId = ''
    this.adapter.insertAudit({ actorUserId: actorUserId(actor) || null, action: 'moderation.provider.configure', targetType: 'ai_provider', targetId: provider.id, metadata: { enabled: provider.enabled, isDefault: provider.id === this.aiRegistry.defaultProviderId, healthStatus: provider.healthStatus }, ipSummary: context.ipSummary || '' })
    return this.listAiProvidersForAdmin()
  }

  setDefaultAiProviderForAdmin (actor, id, context = {}) {
    this.ensureReady()
    const provider = this.aiRegistry.setDefault(id)
    if (this.aiEngine) this.aiEngine.providerId = provider.id
    this.database.transaction(() => {
      this.database.prepare('UPDATE ai_provider_configs SET is_default = 0').run()
      this.database.prepare('UPDATE ai_provider_configs SET is_default = 1, updated_at = ? WHERE id = ?').run(this.now(), provider.id)
    })
    this.adapter.insertAudit({ actorUserId: actorUserId(actor) || null, action: 'moderation.provider.default', targetType: 'ai_provider', targetId: provider.id, metadata: { isDefault: true }, ipSummary: context.ipSummary || '' })
    return this.listAiProvidersForAdmin()
  }

  async verifyAiProviderForAdmin (actor, id, context = {}) {
    this.ensureReady()
    const provider = this.aiRegistry.get(id)
    if (!provider) throw interactionHttpError('AI provider 不存在', 'RESOURCE_NOT_FOUND')
    if (typeof provider.healthCheck !== 'function') throw interactionHttpError('AI provider 未绑定健康检查适配器', 'AI_PROVIDER_ADAPTER_REQUIRED')
    const controller = new AbortController()
    const timeoutMs = Math.max(100, Number(provider.timeoutMs) || 3000)
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      await provider.healthCheck({ signal: controller.signal })
      this.aiRegistry.markVerified(provider.id, this.now())
    } catch (error) {
      provider.healthStatus = 'failed'
      provider.enabled = false
      this.database.prepare('UPDATE ai_provider_configs SET enabled = 0, health_status = ?, last_verified_at = NULL, updated_at = ? WHERE id = ?').run('failed', this.now(), provider.id)
      throw interactionHttpError('AI provider 健康检查失败', 'AI_PROVIDER_HEALTHCHECK_FAILED')
    } finally {
      clearTimeout(timer)
    }
    this.database.prepare('UPDATE ai_provider_configs SET enabled = ?, health_status = ?, last_verified_at = ?, updated_at = ? WHERE id = ?').run(provider.enabled ? 1 : 0, provider.healthStatus, provider.lastVerifiedAt, this.now(), provider.id)
    this.adapter.insertAudit({ actorUserId: actorUserId(actor) || null, action: 'moderation.provider.verify', targetType: 'ai_provider', targetId: provider.id, metadata: { healthStatus: provider.healthStatus }, ipSummary: context.ipSummary || '' })
    return this.listAiProvidersForAdmin()
  }

  submitReport (publicId, input = {}, context = {}) {
    this.ensureReady()
    const resource = this.adapter.resolveReportResource(publicId, input.resourceRef || {}, context)
    const clientKey = this.adapter.clientKey(resource.canonicalShareId, context)
    this.limiter.consume(`report:${clientKey}`)
    const result = this.reports.submitReport({ body: { ...input, resourceRef: resource.resourceRef }, resource, session: context.session, clientKey })
    return { id: result.report.id, status: result.report.status, duplicate: result.replayed === true }
  }

  listReportsForAdmin (filters, options) { this.ensureReady(); return this.reports.listForAdmin(filters, options) }
  getReportForAdmin (id) { this.ensureReady(); return this.reports.getForAdmin(id) }
  actionReport (actor, id, input, context = {}) {
    this.ensureReady()
    const result = this.reports.action(actor, id, input)
    this.adapter.insertAudit({ actorUserId: actorUserId(actor) || null, action: `report.${input.action || 'action'}`, targetType: 'report', targetId: id, metadata: { status: result.status, action: result.action }, ipSummary: context.ipSummary || '' })
    return result
  }

  // -------------------------------------------------------------- admin API

  listCommentsForAdmin (filters = {}, options = {}) {
    this.ensureReady()
    return this.comments.listCommentsForAdmin(filters, options)
  }

  getCommentForAdmin (id) {
    this.ensureReady()
    return this.comments.getCommentForAdmin(id)
  }

  /** Apply a human moderation decision and write an audit entry. */
  moderateComment (actor, id, input = {}, context = {}) {
    this.ensureReady()
    const actorId = actorUserId(actor)
    const result = this.moderation.applyHumanDecision({
      commentId: id,
      moderationStatus: input.moderationStatus,
      contentStatus: input.contentStatus,
      level: input.level,
      reasonCodes: input.reasonCodes,
      suggestedAction: input.suggestedAction,
      actorUserId: actorId,
      idempotencyKey: input.idempotencyKey || '',
    })
    this.adapter.insertAudit({
      actorUserId: actorId || null,
      action: 'comment.moderate',
      targetType: 'comment',
      targetId: id,
      // The audit entry records the decision, never the comment text.
      metadata: {
        moderationStatus: result.moderationStatus || input.moderationStatus || '',
        contentStatus: result.contentStatus || input.contentStatus || '',
        decisionId: result.decisionId,
        replayed: result.replayed === true,
      },
      ipSummary: context.ipSummary || '',
    })
    return result
  }

  /** Re-run deterministic keyword moderation using the active policy version. */
  reprocessComment (actor, id, context = {}) {
    this.ensureReady()
    const commentId = String(id || '')
    const row = this.database.prepare(`
      SELECT id, content_revision, body_normalized, content_status, moderation_status
      FROM comments WHERE id = ?
    `).get(commentId)
    if (!row) throw interactionHttpError('留言不存在', 'RESOURCE_NOT_FOUND')

    const activePolicy = this.policyStore.getActiveVersion()
    if (!activePolicy) {
      throw interactionHttpError('留言策略尚未发布', 'INTERACTION_SERVICE_UNAVAILABLE')
    }
    let policy
    try {
      policy = createMutableInteractionPolicy(JSON.parse(activePolicy.policy_json || '{}'))
    } catch {
      throw interactionHttpError('留言策略解析失败', 'INTERACTION_SERVICE_UNAVAILABLE')
    }
    const now = this.now()
    const screening = this.moderation.screenText(row.body_normalized, { now })
    const initial = resolveInitialModerationState(policy, {
      level: screening.level,
      now,
    })
    const moderationStatus = initial.moderationStatus === 'pending' && row.moderation_status === 'approved'
      ? 'approved'
      : initial.moderationStatus
    const actorId = actorUserId(actor)
    const policyRevision = `${activePolicy.version}:${screening.keywordPolicyVersion || 0}`
    const result = this.moderation.applyHumanDecision({
      commentId,
      moderationStatus,
      contentStatus: row.content_status,
      level: screening.level,
      reasonCodes: screening.reasonCodes,
      suggestedAction: initial.suggestedAction,
      keywordPolicyVersion: screening.keywordPolicyVersion,
      actorUserId: actorId,
      stage: 'keyword',
      idempotencyKey: `reprocess:${commentId}:${row.content_revision}:${policyRevision}`,
      now,
    })
    this.adapter.insertAudit({
      actorUserId: actorId || null,
      action: 'comment.reprocess',
      targetType: 'comment',
      targetId: commentId,
      metadata: {
        decisionId: result.decisionId,
        keywordPolicyVersion: screening.keywordPolicyVersion,
        moderationStatus: result.moderationStatus || moderationStatus,
        replayed: result.replayed === true,
      },
      ipSummary: context.ipSummary || '',
    })
    return {
      ...result,
      keywordPolicyVersion: screening.keywordPolicyVersion,
      moderationLevel: screening.level,
      reasonCodes: screening.reasonCodes,
    }
  }

  deleteCommentForAdmin (actor, id, context = {}) {
    this.ensureReady()
    const actorId = actorUserId(actor)
    const result = this.comments.softDeleteComment(id, { actorUserId: actorId })
    this.adapter.insertAudit({
      actorUserId: actorId || null,
      action: 'comment.delete',
      targetType: 'comment',
      targetId: id,
      metadata: { deleted: result.deleted, alreadyDeleted: result.alreadyDeleted },
      ipSummary: context.ipSummary || '',
    })
    return result
  }

  getInteractionPolicyForAdmin () {
    this.ensureReady()
    const active = this.policyStore.getActiveVersion()
    if (!active) return { version: 0, policy: createMutableInteractionPolicy({}), published: false }
    let parsed = {}
    try {
      parsed = JSON.parse(active.policy_json || '{}')
    } catch {
      throw interactionHttpError('留言策略解析失败', 'INTERACTION_SERVICE_UNAVAILABLE')
    }
    return {
      version: active.version,
      policy: createMutableInteractionPolicy(parsed),
      published: true,
      createdAt: active.created_at,
      createdBy: active.created_by || '',
    }
  }

  getAiPolicyForAdmin () {
    this.ensureReady()
    const active = this.policyStore.getActiveVersion()
    if (!active) {
      const policy = createMutableInteractionPolicy({})
      const activePrompt = this.database.prepare('SELECT version FROM ai_prompt_versions WHERE active = 1').get()
      if (activePrompt?.version) policy.moderation.ai.promptVersion = activePrompt.version
      return { version: 0, published: false, ai: policy.moderation.ai, actions: policy.moderation.actions, autoApproveLevels: policy.moderation.autoApproveLevels }
    }
    let parsed = {}
    try { parsed = JSON.parse(active.policy_json || '{}') } catch { throw interactionHttpError('留言策略解析失败', 'INTERACTION_SERVICE_UNAVAILABLE') }
    const policy = createMutableInteractionPolicy(parsed)
    const activePrompt = this.database.prepare('SELECT version FROM ai_prompt_versions WHERE active = 1').get()
    if (activePrompt?.version) policy.moderation.ai.promptVersion = activePrompt.version
    return {
      version: active.version,
      published: true,
      ai: policy.moderation.ai,
      actions: policy.moderation.actions,
      autoApproveLevels: policy.moderation.autoApproveLevels,
      createdAt: active.created_at,
      createdBy: active.created_by || '',
    }
  }

  publishInteractionPolicy (actor, policy, context = {}, options = {}) {
    this.ensureReady()
    const actorId = actorUserId(actor)
    const version = this.policyStore.publish(policy, { createdBy: actorId })
    this.syncAiRuntimePolicy()
    this.adapter.insertAudit({
      actorUserId: actorId || null,
      action: options.auditAction || 'comment.policy.publish',
      targetType: 'interaction_policy',
      targetId: String(version),
      metadata: { version, ...(options.auditMetadata || {}) },
      ipSummary: context.ipSummary || '',
    })
    return { version }
  }

  publishAiPolicy (actor, input = {}, context = {}) {
    this.ensureReady()
    const active = this.policyStore.getActiveVersion()
    let current = createMutableInteractionPolicy({})
    if (active) {
      try { current = createMutableInteractionPolicy(JSON.parse(active.policy_json || '{}')) } catch { throw interactionHttpError('留言策略解析失败', 'INTERACTION_SERVICE_UNAVAILABLE') }
    }
    const source = input && typeof input === 'object' ? input : {}
    const moderationPatch = source.moderation && typeof source.moderation === 'object' ? source.moderation : source
    const next = createMutableInteractionPolicy({
      ...current,
      moderation: {
        ...current.moderation,
        ...(Object.hasOwn(moderationPatch, 'ai') ? { ai: moderationPatch.ai } : {}),
        ...(Object.hasOwn(moderationPatch, 'actions') ? { actions: moderationPatch.actions } : {}),
        ...(Object.hasOwn(moderationPatch, 'autoApproveLevels') ? { autoApproveLevels: moderationPatch.autoApproveLevels } : {}),
      },
    })
    const result = this.publishInteractionPolicy(actor, next, context, {
      auditAction: 'moderation.ai.policy.publish',
      auditMetadata: { fields: ['ai', 'actions', 'autoApproveLevels'] },
    })
    return { ...result, ...this.getAiPolicyForAdmin() }
  }

  listAiPromptVersionsForAdmin () {
    this.ensureReady()
    const rows = this.database.prepare(`
      SELECT version, prompt_hash, prompt_text, active, created_by, created_at
      FROM ai_prompt_versions
      ORDER BY active DESC, created_at DESC, version DESC
    `).all()
    if (!rows.length) {
      return {
        activeVersion: AI_PROMPT_VERSION,
        versions: [{
          version: AI_PROMPT_VERSION,
          promptHash: '',
          promptText: DEFAULT_AI_PROMPT,
          promptTextAvailable: true,
          metadataOnly: false,
          active: true,
          createdAt: '',
          createdBy: '',
          bootstrap: true,
        }],
      }
    }
    return {
      activeVersion: rows.find(row => row.active === 1)?.version || '',
      versions: rows.map(row => ({
        version: row.version,
        promptHash: row.prompt_hash,
        promptText: row.prompt_text || '',
        promptTextAvailable: Boolean(row.prompt_text),
        metadataOnly: !row.prompt_text,
        active: row.active === 1,
        createdAt: row.created_at,
        createdBy: row.created_by || '',
        bootstrap: false,
      })),
    }
  }

  publishAiPromptVersion (actor, input = {}, context = {}) {
    this.ensureReady()
    const hasPromptText = Object.hasOwn(input, 'promptText')
    const promptText = hasPromptText ? normalizePromptText(input.promptText) : ''
    const suppliedPromptHash = String(input.promptHash || '').trim()
    const promptHash = promptText
      ? `sha256:${crypto.createHash('sha256').update(promptText, 'utf8').digest('hex')}`
      : suppliedPromptHash
    let version = String(input.version || '').trim()
    if (!version && /^sha256:[a-f0-9]{64}$/iu.test(promptHash)) {
      version = `prompt-${promptHash.slice(7, 63).toLowerCase()}`
    }
    if (!version || version.length > 64 || !/^[A-Za-z0-9._:-]+$/.test(version)) {
      throw interactionHttpError('提示词版本必须是 1 到 64 位的字母、数字或 ._:-', 'VALIDATION_FAILED')
    }
    if (!/^sha256:[a-f0-9]{64}$/i.test(promptHash)) {
      throw interactionHttpError('提示词哈希必须使用 sha256:<64位十六进制>', 'VALIDATION_FAILED')
    }
    if (promptText && suppliedPromptHash && suppliedPromptHash.toLowerCase() !== promptHash.toLowerCase()) {
      throw interactionHttpError('提示词正文与哈希不一致', 'VALIDATION_FAILED')
    }
    const actorId = actorUserId(actor)
    const now = this.now()
    const existing = this.database.prepare('SELECT prompt_hash, prompt_text, active FROM ai_prompt_versions WHERE version = ?').get(version)
    if (existing && String(existing.prompt_hash).toLowerCase() !== promptHash.toLowerCase()) {
      throw interactionHttpError('同一提示词版本不能修改哈希；请使用新的版本标识', 'PROMPT_VERSION_IMMUTABLE')
    }
    if (existing?.active === 1 && (!promptText || existing.prompt_text)) return this.listAiPromptVersionsForAdmin()
    this.database.transaction(() => {
      this.database.prepare('UPDATE ai_prompt_versions SET active = 0 WHERE active = 1').run()
      this.database.prepare(`
        INSERT INTO ai_prompt_versions(version, prompt_hash, prompt_text, active, created_by, created_at)
        VALUES (?, ?, ?, 1, ?, ?)
        ON CONFLICT(version) DO UPDATE SET
          active = 1,
          prompt_text = CASE
            WHEN ai_prompt_versions.prompt_text = '' THEN excluded.prompt_text
            ELSE ai_prompt_versions.prompt_text
          END
      `).run(version, promptHash.toLowerCase(), promptText, actorId, now)
    })
    this.syncAiRuntimePolicy()
    this.adapter.insertAudit({
      actorUserId: actorId || null,
      action: 'moderation.ai.prompt.publish',
      targetType: 'ai_prompt_version',
      targetId: version,
      metadata: { version, promptHash: promptHash.toLowerCase() },
      ipSummary: context.ipSummary || '',
    })
    return this.listAiPromptVersionsForAdmin()
  }

  getKeywordRulesForAdmin () {
    this.ensureReady()
    const active = this.moderation.activeKeywordVersion()
    if (!active) return { version: 0, published: false, rules: [] }
    return {
      version: active.version,
      published: true,
      rulesHash: active.rules_hash,
      sourcePolicyVersion: active.source_policy_version,
      createdAt: active.created_at,
      rules: this.moderation.keywordRules(active.version).map(rule => ({
        id: rule.id,
        term: rule.normalized_term,
        matchType: rule.match_type,
        category: rule.category,
        level: rule.level,
        action: rule.action,
        startsAt: rule.starts_at || '',
        endsAt: rule.ends_at || '',
      })),
    }
  }

  previewKeywordRules (input = {}) {
    this.ensureReady()
    const text = String(input.text || '')
    if (!text.trim()) throw interactionHttpError('试运行文本不能为空', 'VALIDATION_FAILED')
    if ([...text].length > MAX_KEYWORD_PREVIEW_TEXT_LENGTH) {
      throw interactionHttpError(`试运行文本不能超过 ${MAX_KEYWORD_PREVIEW_TEXT_LENGTH} 个字符`, 'CONTENT_TOO_LARGE')
    }
    const rules = Object.hasOwn(input, 'rules') ? input.rules : null
    if (rules !== null && !Array.isArray(rules)) throw interactionHttpError('试运行规则必须是数组', 'VALIDATION_FAILED')
    if (Array.isArray(rules) && rules.length > MAX_KEYWORD_PREVIEW_RULES) {
      throw interactionHttpError(`试运行规则不能超过 ${MAX_KEYWORD_PREVIEW_RULES} 条`, 'CONTENT_TOO_LARGE')
    }
    const result = this.moderation.previewText(text, rules, { now: this.now() })
    return {
      dryRun: true,
      source: Array.isArray(rules) ? 'draft' : 'active',
      normalizedLength: [...String(text).normalize('NFKC').trim()].length,
      level: result.level,
      action: result.action,
      reasonCodes: result.reasonCodes,
      keywordPolicyVersion: result.keywordPolicyVersion,
      matches: result.matches.map(match => ({
        ruleId: match.ruleId,
        level: match.level,
        action: match.action,
        category: match.category,
        matchType: match.matchType,
      })),
    }
  }

  previewModerationImpact (input = {}) {
    this.ensureReady()
    const activeRow = this.policyStore.getActiveVersion()
    let current = createMutableInteractionPolicy({})
    if (activeRow) {
      try { current = createMutableInteractionPolicy(JSON.parse(activeRow.policy_json || '{}')) } catch { throw interactionHttpError('留言策略解析失败', 'INTERACTION_SERVICE_UNAVAILABLE') }
    }
    const source = input && typeof input === 'object' ? input : {}
    const moderationPatch = source.moderation && typeof source.moderation === 'object' ? source.moderation : source
    const candidateInput = source.policy && typeof source.policy === 'object'
      ? source.policy
      : (source.moderation && typeof source.moderation === 'object'
          ? { ...current, ...source, moderation: { ...current.moderation, ...source.moderation } }
          : { ...current, moderation: { ...current.moderation, ...moderationPatch } })
    let proposed
    try {
      proposed = normalizeInteractionPolicyForPublish(candidateInput)
    } catch (error) {
      throw error
    }
    if (Array.isArray(source.rules) && source.rules.length > MAX_KEYWORD_PREVIEW_RULES) {
      throw interactionHttpError(`影响预览规则不能超过 ${MAX_KEYWORD_PREVIEW_RULES} 条`, 'CONTENT_TOO_LARGE')
    }
    const rows = this.database.prepare(`
      SELECT moderation_status, moderation_level, canonical_share_id, body_normalized
      FROM comments
      WHERE content_status <> 'deleted'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(MAX_IMPACT_PREVIEW_COMMENTS)
    const counts = Object.fromEntries(['pending', 'approved', 'rejected', 'quarantined', 'spam', 'orphaned'].map(status => [status, 0]))
    const levels = Object.fromEntries(['normal', 'risk', 'violation', 'illegal_or_ip', 'spam', 'unknown'].map(level => [level, 0]))
    const affectedShares = new Set()
    let automaticActionChanges = 0
    let draftMatchedComments = 0
    const draftRules = Array.isArray(source.rules) ? this.moderation.prepareKeywordRules(source.rules) : null
    for (const row of rows) {
      counts[row.moderation_status] = (counts[row.moderation_status] || 0) + 1
      levels[row.moderation_level] = (levels[row.moderation_level] || 0) + 1
      const oldAction = current.moderation?.actions?.[row.moderation_level] || 'review'
      let nextLevel = row.moderation_level
      if (draftRules) {
        const draft = this.moderation.previewText(row.body_normalized, draftRules, { now: this.now(), preparedRules: draftRules })
        nextLevel = draft.level
        if (draft.matches.length) draftMatchedComments += 1
      }
      const nextAction = proposed.moderation?.actions?.[nextLevel] || 'review'
      if (oldAction !== nextAction || nextLevel !== row.moderation_level) {
        automaticActionChanges += 1
        affectedShares.add(row.canonical_share_id)
      }
    }
    const failedOutbox = Number(this.database.prepare("SELECT COUNT(*) AS count FROM comment_outbox WHERE status = 'failed'").get()?.count || 0)
    const queuedOutbox = Number(this.database.prepare("SELECT COUNT(*) AS count FROM comment_outbox WHERE status IN ('pending', 'processing')").get()?.count || 0)
    const keywordRulesDraftProvided = Array.isArray(source.rules)
    const keywordRuleCount = keywordRulesDraftProvided ? source.rules.length : Number(this.moderation.activeKeywordVersion()?.version ? this.moderation.keywordRules(this.moderation.activeKeywordVersion().version).length : 0)
    return {
      preview: true,
      currentPolicyVersion: Number(activeRow?.version || 0),
      scannedComments: rows.length,
      scanTruncated: rows.length >= MAX_IMPACT_PREVIEW_COMMENTS,
      counts,
      levels,
      pendingReview: counts.pending + counts.quarantined,
      automaticActionChanges,
      affectedShares: affectedShares.size,
      wouldEnableAi: current.moderation?.ai?.enabled !== true && proposed.moderation?.ai?.enabled === true,
      wouldDisableAi: current.moderation?.ai?.enabled === true && proposed.moderation?.ai?.enabled !== true,
      providerChanged: String(current.moderation?.ai?.providerId || '') !== String(proposed.moderation?.ai?.providerId || ''),
      promptVersionChanged: String(current.moderation?.ai?.promptVersion || '') !== String(proposed.moderation?.ai?.promptVersion || ''),
      keywordRulesDraftProvided,
      keywordRuleCount,
      draftMatchedComments,
      impactEstimated: true,
      outbox: { queued: queuedOutbox, failed: failedOutbox },
      historyReprocessRequired: automaticActionChanges > 0 || keywordRulesDraftProvided,
      historyReprocessAutomatic: false,
    }
  }

  replayFailedModerationEvents (actor, input = {}, context = {}) {
    this.ensureReady()
    const limit = Math.min(100, Math.max(1, Number(input.limit) || 20))
    const now = this.now()
    const rows = this.database.prepare(`
      SELECT id FROM comment_outbox
      WHERE status = 'failed'
      ORDER BY updated_at, created_at
      LIMIT ?
    `).all(limit)
    if (rows.length) {
      const update = this.database.prepare(`
        UPDATE comment_outbox
        SET status = 'pending', attempts = 0, available_at = ?, locked_at = NULL,
            last_error = '', updated_at = ?
        WHERE id = ? AND status = 'failed'
      `)
      this.database.transaction(() => rows.forEach(row => update.run(now, now, row.id)))
    }
    this.adapter.insertAudit({
      actorUserId: actorUserId(actor) || null,
      action: 'moderation.outbox.replay',
      targetType: 'comment_outbox',
      targetId: rows.length ? rows.map(row => row.id).join(',') : 'none',
      metadata: { requestedLimit: limit, replayed: rows.length },
      ipSummary: context.ipSummary || '',
    })
    return { replayed: rows.length, eventIds: rows.map(row => row.id) }
  }

  publishKeywordRules (actor, rules, options = {}, context = {}) {
    this.ensureReady()
    const actorId = actorUserId(actor)
    const active = this.policyStore.getActiveVersion()
    if (!active) {
      throw interactionHttpError('请先发布留言策略版本', 'INTERACTION_SERVICE_UNAVAILABLE')
    }
    const result = this.moderation.publishKeywordRules(rules, {
      sourcePolicyVersion: active.version,
      createdBy: actorId,
      changeReason: options.changeReason || '',
    })
    this.adapter.insertAudit({
      actorUserId: actorId || null,
      action: 'comment.keyword.publish',
      targetType: 'moderation_keyword_version',
      targetId: String(result.version),
      // Rule terms are never written to the audit log; only the count and hash.
      metadata: { version: result.version, ruleCount: result.ruleCount, rulesHash: result.rulesHash },
      ipSummary: context.ipSummary || '',
    })
    return result
  }

  /** Drain queued moderation events. Invoked by the in-process worker. */
  drainModerationEvents (handler, options = {}) {
    this.ensureReady()
    return this.moderation.drainEvents(handler, options)
  }
}

export default InteractionService
