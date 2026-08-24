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
import {
  InteractionPolicyStore,
  createMutableInteractionPolicy,
  interactionHttpError,
  resolveInitialModerationState,
} from './commentPolicy.js'
import { createHttpError } from '../user/security.js'
import { encryptInteractionSecret } from './security.js'
import { emptyAiScores } from '../../../shared/interaction-ai.js'

function actorUserId (actor) {
  return actor?.user?.id || actor?.id || ''
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
    this.aiTasks = new Set()
    this.aiProviderConfigs = Array.isArray(this.config.ai?.providers) ? this.config.ai.providers : []
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
    if (this.comments && this.reports) return this
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
    if (!this.aiEngine && this.config.ai?.enabled === true) {
      const providerId = this.config.ai.providerId || this.aiRegistry.defaultProviderId
      this.aiEngine = new AiModerationEngine({
        registry: this.aiRegistry,
        providerId,
        timeoutMs: this.config.ai.timeoutMs,
        retries: Math.max(0, Number(this.config.ai.maxAttempts || 1) - 1),
        promptVersion: this.config.ai.promptVersion,
        policyVersion: this.config.ai.policyVersion || this.config.ai.promptVersion,
      })
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
    return this
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
    if (result.created && this.aiEngine) this.scheduleAiReview(result.comment, context)

    // The API never echoes the comment back: a pending comment is not public,
    // and returning it would leak moderation state to the author's page.
    return {
      id: result.comment.id,
      moderationStatus: result.comment.moderation_status,
      pending: result.comment.moderation_status !== 'approved',
      duplicate: result.replayed === true,
    }
  }

  scheduleAiReview (comment, context = {}) {
    if (!this.aiEngine || !comment || this.aiClosing) return Promise.resolve(null)
    const task = Promise.resolve().then(async () => {
      let decision
      try {
        decision = await this.aiEngine.decide({
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
          policyVersion: this.aiEngine.policyVersion,
          providerId: this.aiEngine.providerId,
          model: '',
          promptVersion: this.aiEngine.promptVersion,
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
      const audit = this.moderation.recordAiDecision({
        commentId: comment.id,
        contentRevision: comment.content_revision,
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
        idempotencyKey: `ai:${comment.id}:${comment.content_revision}:${decision.promptVersion}`,
        now,
      })
      return { ...decision, decisionId: audit.id, created: audit.created }
    }).catch(error => ({ level: 'unknown', suggestedAction: 'review', reasonCodes: ['AI_AUDIT_FAILED'], error: String(error?.message || error) }))
    this.aiTasks.add(task)
    task.finally(() => this.aiTasks.delete(task)).catch(() => {})
    return task
  }

  async flushAiReviews () {
    const tasks = [...this.aiTasks]
    return Promise.all(tasks)
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
    const rows = this.database.prepare(`
      SELECT id, name, endpoint, model, secret_ref, enabled, is_default,
             timeout_ms, max_attempts, daily_budget, max_concurrency,
             prompt_version, redaction_json, adapter_id, health_status, last_verified_at,
             daily_budget_day, daily_budget_used,
             created_at, updated_at
      FROM ai_provider_configs ORDER BY id
    `).all()
    for (const row of rows) {
      try {
        const runtime = this.aiRegistry.get(row.id)
        const provider = this.aiRegistry.register({
          id: row.id,
          name: row.name,
          endpoint: row.endpoint,
          model: row.model,
          secretRef: row.secret_ref,
          enabled: row.enabled === 1,
          isDefault: row.is_default === 1,
          timeoutMs: row.timeout_ms,
          maxAttempts: row.max_attempts,
          dailyBudget: row.daily_budget,
          maxConcurrency: row.max_concurrency,
          promptVersion: row.prompt_version,
          request: runtime?.request || undefined,
          healthCheck: runtime?.healthCheck || undefined,
          adapterId: row.adapter_id || runtime?.adapterId || '',
          healthStatus: row.health_status,
          lastVerifiedAt: row.last_verified_at,
          dailyBudgetDay: row.daily_budget_day,
          dailyBudgetUsed: row.daily_budget_used,
        })
        if (row.health_status === 'verified' && provider.healthStatus !== 'verified') {
          this.database.prepare('UPDATE ai_provider_configs SET enabled = 0, is_default = 0, health_status = ?, last_verified_at = NULL, updated_at = ? WHERE id = ?')
            .run('unknown', this.now(), row.id)
        }
      } catch {
        // Persisted invalid configuration remains visible as unavailable only
        // after an explicit repair; it must never become an outbound request.
      }
    }
  }

  listAiProvidersForAdmin () {
    this.ensureReady()
    const providers = this.aiRegistry.list().map((provider) => {
      const { secretRef, ...publicProvider } = provider
      return publicProvider
    })
    return { enabled: this.config.ai?.enabled === true, defaultProviderId: this.aiRegistry.defaultProviderId, providers }
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
    if (!secretRef) throw interactionHttpError('新增 AI provider 必须提供 secretRef', 'VALIDATION_FAILED')
    const adapterId = String(input.adapterId || existing?.adapter_id || 'openai-compatible').trim()
    const effectiveModel = String(input.model ?? existing?.model ?? '')
    const effectivePromptVersion = String(input.promptVersion ?? existing?.prompt_version ?? this.config.ai?.promptVersion ?? 'interaction-moderation-v1')
    const effectiveTimeoutMs = Number(input.timeoutMs ?? existing?.timeout_ms ?? this.config.ai?.timeoutMs ?? 3000)
    const effectiveMaxAttempts = Number(input.maxAttempts ?? existing?.max_attempts ?? this.config.ai?.maxAttempts ?? 2)
    const effectiveDailyBudget = Number(input.dailyBudget ?? existing?.daily_budget ?? this.config.ai?.dailyBudget ?? 0)
    const effectiveMaxConcurrency = Number(input.maxConcurrency ?? existing?.max_concurrency ?? this.config.ai?.maxConcurrency ?? 2)
    const effectiveRedaction = JSON.stringify(input.redaction ?? (existing ? (() => {
      try { return JSON.parse(existing.redaction_json || '{}') } catch { return {} }
    })() : {}))
    const canReuseVerification = Boolean(existing && existing.health_status === 'verified' && existing.last_verified_at &&
      existing.endpoint === String(input.endpoint || existing.endpoint) &&
      existing.secret_ref === secretRef &&
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
          adapter_id, daily_budget_day, daily_budget_used, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, endpoint = excluded.endpoint, model = excluded.model,
          secret_ref = excluded.secret_ref, enabled = excluded.enabled,
          is_default = excluded.is_default, timeout_ms = excluded.timeout_ms,
          max_attempts = excluded.max_attempts, daily_budget = excluded.daily_budget,
          max_concurrency = excluded.max_concurrency, prompt_version = excluded.prompt_version,
          redaction_json = excluded.redaction_json, adapter_id = excluded.adapter_id,
          health_status = excluded.health_status, last_verified_at = excluded.last_verified_at,
          updated_at = excluded.updated_at
      `).run(
        provider.id, provider.name, provider.endpoint, provider.model, provider.secretRef,
        provider.enabled ? 1 : 0, effectiveDefault ? 1 : 0,
        provider.timeoutMs, provider.maxAttempts,
        Number.isFinite(effectiveDailyBudget) && effectiveDailyBudget > 0 ? Math.floor(effectiveDailyBudget) : 0,
        provider.state.maxConcurrency,
        effectivePromptVersion,
        effectiveRedaction, provider.healthStatus, provider.lastVerifiedAt || null, adapterId,
        provider.state.budgetDay, provider.state.used, existing?.created_at || now, now
      )
    })
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

  publishInteractionPolicy (actor, policy, context = {}) {
    this.ensureReady()
    const actorId = actorUserId(actor)
    const version = this.policyStore.publish(policy, { createdBy: actorId })
    this.adapter.insertAudit({
      actorUserId: actorId || null,
      action: 'comment.policy.publish',
      targetType: 'interaction_policy',
      targetId: String(version),
      metadata: { version },
      ipSummary: context.ipSummary || '',
    })
    return { version }
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
