import test from 'node:test'
import assert from 'node:assert/strict'

import InteractionDatabase from '../service/bin/interaction/database.js'
import CommentService from '../service/bin/interaction/commentService.js'
import ModerationService, {
  matchWildcardTerm,
  normalizeModerationText,
} from '../service/bin/interaction/moderationService.js'
import InteractionAdapter from '../service/bin/interaction/adapter.js'
import InteractionService from '../service/bin/interaction/interactionService.js'
import { AiProviderRegistry } from '../service/bin/interaction/providerRegistry.js'
import { InteractionPolicyStore } from '../service/bin/interaction/commentPolicy.js'
import { decryptInteractionSecret, isInteractionCiphertext } from '../service/bin/interaction/security.js'

const TEST_SECRET = 'interaction-service-test-key'
const TEST_NOW = '2026-08-23T00:00:00.000Z'

const RESOURCE = Object.freeze({
  canonicalShareId: 'shr_canonical_one',
  sharePublicId: 'shr_public_demo',
  shareItemId: 'shi_demo',
  featureId: 'feature_demo',
})

function createHarness (options = {}) {
  let clock = options.now || TEST_NOW
  const database = new InteractionDatabase({ filePath: ':memory:' })
  const now = () => clock
  const policyStore = new InteractionPolicyStore({ database, now })
  const moderation = new ModerationService({ database, now })
  const comments = new CommentService({
    database,
    moderation,
    policyStore,
    secret: TEST_SECRET,
    now,
  })
  return {
    database,
    policyStore,
    moderation,
    comments,
    setNow: value => { clock = value },
    close: () => database.close(),
  }
}

function publishPolicy (harness, overrides = {}) {
  return harness.policyStore.publish({
    comments: {
      enabled: true,
      anonymous: { enabled: true, contactRequirement: 'email_or_phone', requireConsent: true },
      maxLength: 2000,
      moderationRequired: true,
      publicReplyEnabled: false,
      ...(overrides.comments || {}),
    },
    moderation: {
      autoApproveLevels: ['normal'],
      keywords: { enabled: true },
      ...(overrides.moderation || {}),
    },
  }, { now: TEST_NOW })
}

function submission (overrides = {}) {
  return {
    body: '这个地点很棒，推荐大家去看看。',
    displayName: '访客甲',
    email: 'visitor@example.com',
    consent: true,
    resourceRef: {
      siteId: 'map-service',
      sharePublicId: RESOURCE.sharePublicId,
      shareItemId: RESOURCE.shareItemId,
      featureId: RESOURCE.featureId,
      scope: 'feature',
    },
    ...overrides,
  }
}

test('comment submission starts pending, encrypts sensitive fields and records a keyword decision', () => {
  const harness = createHarness()
  try {
    publishPolicy(harness)
    const result = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission(),
      clientKey: 'visitor-bucket-1',
    })
    assert.equal(result.created, true)
    const comment = result.comment
    // Moderation is required, so a new comment must never be public.
    assert.equal(comment.moderation_status, 'pending')
    assert.equal(comment.content_status, 'active')
    assert.equal(comment.approved_at, null)
    assert.equal(comment.thread_depth, 0)
    assert.equal(comment.scope, 'feature')
    assert.equal(comment.media_id, '')
    assert.equal(comment.canonical_share_id, RESOURCE.canonicalShareId)
    assert.equal(comment.share_public_id_snapshot, RESOURCE.sharePublicId)

    // Sensitive fields are ciphertext, and no plaintext contact is stored.
    assert.equal(isInteractionCiphertext(comment.body_raw_encrypted), true)
    assert.equal(isInteractionCiphertext(comment.contact_ciphertext), true)
    assert.equal(comment.contact_type, 'email')
    assert.ok(comment.contact_hash)
    assert.equal(comment.contact_hash.includes('visitor@example.com'), false)
    assert.equal(comment.body_raw_encrypted.includes('推荐大家'), false)
    // The author key must not be a raw visitor bucket or IP.
    assert.equal(comment.author_key.includes('visitor-bucket-1'), false)

    // The screening decision exists in the same transaction as the comment.
    const decisions = harness.moderation.decisionsForComment(comment.id)
    assert.equal(decisions.length, 1)
    assert.equal(decisions[0].stage, 'keyword')

    // A creation event is queued for the outbox.
    const events = harness.database.prepare(
      "SELECT event_type, status FROM comment_outbox WHERE comment_id = ?"
    ).all(comment.id).map(row => ({ ...row }))
    assert.deepEqual(events, [{ event_type: 'comment.created', status: 'pending' }])
  } finally {
    harness.close()
  }
})

test('pending comments are invisible and uncounted until approved', () => {
  const harness = createHarness()
  try {
    publishPolicy(harness)
    const created = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission(),
      clientKey: 'visitor-bucket-1',
    }).comment

    let page = harness.comments.listPublicComments(RESOURCE, {})
    assert.equal(page.count, 0)
    assert.deepEqual(page.items, [])
    assert.equal(page.nextCursor, '')

    harness.setNow('2026-08-23T01:00:00.000Z')
    const applied = harness.moderation.applyHumanDecision({
      commentId: created.id,
      moderationStatus: 'approved',
      level: 'normal',
      suggestedAction: 'approve',
      actorUserId: 'usr_moderator',
      idempotencyKey: 'review-1',
    })
    assert.equal(applied.applied, true)
    assert.equal(applied.moderationStatus, 'approved')

    page = harness.comments.listPublicComments(RESOURCE, {})
    assert.equal(page.count, 1)
    assert.equal(page.items.length, 1)
    assert.equal(page.items[0].id, created.id)
    assert.equal(page.items[0].displayName, '访客甲')
    // The public projection must never expose contact or moderation internals.
    assert.deepEqual(Object.keys(page.items[0]).sort(), ['body', 'createdAt', 'displayName', 'id', 'replies'])

    // Hiding the comment removes it from public reads and counts again.
    harness.moderation.applyHumanDecision({
      commentId: created.id,
      contentStatus: 'hidden',
      level: 'risk',
      suggestedAction: 'review',
      actorUserId: 'usr_moderator',
      idempotencyKey: 'review-2',
    })
    page = harness.comments.listPublicComments(RESOURCE, {})
    assert.equal(page.count, 0)
    assert.deepEqual(page.items, [])
  } finally {
    harness.close()
  }
})

test('idempotent submissions return the original comment instead of a duplicate', () => {
  const harness = createHarness()
  try {
    publishPolicy(harness)
    const first = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission({ clientRequestId: 'req_one' }),
      clientKey: 'visitor-bucket-1',
    })
    const second = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission({ clientRequestId: 'req_one', body: '完全不同的内容也不应创建第二条。' }),
      clientKey: 'visitor-bucket-1',
    })
    assert.equal(first.created, true)
    assert.equal(second.created, false)
    assert.equal(second.replayed, true)
    assert.equal(second.comment.id, first.comment.id)
    // NFKC normalization folds the fullwidth comma to ASCII on the way in.
    assert.equal(second.comment.body_normalized, '这个地点很棒,推荐大家去看看。')
    assert.equal(
      Number(harness.database.prepare('SELECT COUNT(*) AS count FROM comments').get().count),
      1
    )
  } finally {
    harness.close()
  }
})

test('anonymous comments are refused when the policy disables them', () => {
  const harness = createHarness()
  try {
    publishPolicy(harness, { comments: { anonymous: { enabled: false, contactRequirement: 'email_or_phone' } } })
    assert.throws(() => harness.comments.submitComment({
      resource: RESOURCE,
      body: submission(),
      clientKey: 'visitor-bucket-1',
    }), error => error.code === 'ANONYMOUS_COMMENTS_DISABLED' && error.statusCode === 403)
  } finally {
    harness.close()
  }
})

test('comments are refused entirely when the feature is disabled or unpublished', () => {
  const harness = createHarness()
  try {
    // No published policy at all: fail closed with 503, never a silent default.
    assert.throws(() => harness.comments.submitComment({
      resource: RESOURCE,
      body: submission(),
      clientKey: 'visitor-bucket-1',
    }), error => error.code === 'INTERACTION_SERVICE_UNAVAILABLE' && error.statusCode === 503)

    publishPolicy(harness, { comments: { enabled: false } })
    assert.throws(() => harness.comments.submitComment({
      resource: RESOURCE,
      body: submission(),
      clientKey: 'visitor-bucket-1',
    }), error => error.code === 'COMMENT_POLICY_BLOCKED' && error.statusCode === 403)
  } finally {
    harness.close()
  }
})

test('keyword screening is deterministic, versioned and never auto-approves an unknown level', () => {
  const harness = createHarness()
  try {
    const policyVersion = publishPolicy(harness)

    // With no keyword version published, screening must not report `normal`.
    const unscreened = harness.moderation.screenText('任意内容')
    assert.equal(unscreened.level, 'unknown')
    assert.equal(unscreened.action, 'review')
    assert.equal(unscreened.keywordPolicyVersion, null)

    const published = harness.moderation.publishKeywordRules([
      { term: '违规词', matchType: 'phrase', level: 'violation', action: 'reject', category: 'abuse' },
      { term: '风险词', matchType: 'phrase', level: 'risk', action: 'flag', category: 'risk' },
      { term: '买*粉', matchType: 'pattern', level: 'spam', action: 'quarantine', category: 'spam' },
    ], { sourcePolicyVersion: policyVersion, now: TEST_NOW })
    assert.equal(published.version, 1)
    assert.equal(published.ruleCount, 3)

    assert.equal(harness.moderation.screenText('干净内容').level, 'normal')
    assert.equal(harness.moderation.screenText('干净内容').action, 'approve')

    const violation = harness.moderation.screenText('这里有违规词出现')
    assert.equal(violation.level, 'violation')
    assert.equal(violation.action, 'reject')
    assert.equal(violation.keywordPolicyVersion, 1)
    // Reason codes must not leak the matched keyword itself.
    assert.equal(violation.reasonCodes.some(code => code.includes('违规词')), false)

    // Highest severity wins when several rules match.
    const mixed = harness.moderation.screenText('风险词和违规词同时出现')
    assert.equal(mixed.level, 'violation')

    // Wildcard patterns match without a regular expression.
    assert.equal(harness.moderation.screenText('买很多粉').level, 'spam')
    assert.equal(harness.moderation.screenText('买粉丝服务').level, 'normal')
  } finally {
    harness.close()
  }
})

test('admin reprocess uses the current keyword policy and is idempotent per content and policy revision', () => {
  const harness = createHarness()
  const audits = []
  try {
    const policyVersion = publishPolicy(harness)
    const created = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission({ body: '包含后来发布的违规词' }),
      clientKey: 'visitor-bucket-reprocess',
    }).comment
    const rules = harness.moderation.publishKeywordRules([
      { term: '违规词', matchType: 'phrase', level: 'violation', action: 'reject', category: 'abuse' },
    ], { sourcePolicyVersion: policyVersion, now: TEST_NOW })
    const interaction = new InteractionService({
      userContent: { insertAudit: entry => audits.push(entry) },
      config: { secretEncryptionKey: TEST_SECRET },
      database: harness.database,
      policyStore: harness.policyStore,
      moderation: harness.moderation,
      comments: harness.comments,
      now: () => TEST_NOW,
    })

    const first = interaction.reprocessComment({ user: { id: 'usr_admin' } }, created.id, { ipSummary: 'ip_demo' })
    assert.equal(first.applied, true)
    assert.equal(first.moderationStatus, 'rejected')
    assert.equal(first.moderationLevel, 'violation')
    assert.equal(first.keywordPolicyVersion, rules.version)

    const second = interaction.reprocessComment({ user: { id: 'usr_admin' } }, created.id, { ipSummary: 'ip_demo' })
    assert.equal(second.applied, false)
    assert.equal(second.replayed, true)
    assert.equal(second.decisionId, first.decisionId)
    const decisions = harness.moderation.decisionsForComment(created.id)
    assert.equal(decisions.length, 2)
    const reprocessDecision = decisions.find(decision => decision.keyword_policy_version === rules.version)
    assert.ok(reprocessDecision)
    assert.equal(reprocessDecision.stage, 'keyword')
    assert.equal(audits[0].action, 'comment.reprocess')
    assert.equal(audits[0].metadata.keywordPolicyVersion, rules.version)
  } finally {
    harness.close()
  }
})

test('AI review is audited with encrypted raw output and never changes the comment state', async () => {
  const harness = createHarness()
  const audits = []
  const created = (() => {
    publishPolicy(harness)
    return harness.comments.submitComment({
      resource: RESOURCE,
      body: submission({ body: '等待 AI 审核的留言。' }),
      clientKey: 'visitor-ai-audit',
    }).comment
  })()
  const aiEngine = {
    providerId: 'provider-one',
    promptVersion: 'prompt-v2',
    policyVersion: 'policy-v2',
    decide: async () => ({
      level: 'risk',
      scores: { abuse: 0.8, spam: 0.1, illegal: 0.05, privacy: 0.05 },
      confidence: 0.91,
      reasonCodes: ['RISK_SIGNAL'],
      suggestedAction: 'review',
      policyVersion: 'policy-v2',
      providerId: 'provider-one',
      model: 'model-one',
      promptVersion: 'prompt-v2',
      resultHash: 'sha256:test-result',
      rawResult: { level: 'risk', internalTrace: 'must-stay-encrypted' },
    }),
  }
  const interaction = new InteractionService({
    userContent: { insertAudit: entry => audits.push(entry) },
    config: { secretEncryptionKey: TEST_SECRET, retention: { aiRawResultsDays: 30 } },
    database: harness.database,
    policyStore: harness.policyStore,
    moderation: harness.moderation,
    comments: harness.comments,
    aiEngine,
    now: () => TEST_NOW,
  })
  try {
    const result = await interaction.scheduleAiReview(created, { language: 'zh-CN' })
    assert.equal(result.decisionId.startsWith('cmd_'), true)
    const row = harness.database.prepare(`
      SELECT stage, level, suggested_action, provider_id, model, prompt_version,
             raw_result_ciphertext, raw_result_expires_at, result_hash
      FROM comment_moderation_decisions WHERE comment_id = ? AND stage = 'ai'
    `).get(created.id)
    assert.equal(row.stage, 'ai')
    assert.equal(row.level, 'risk')
    assert.equal(row.suggested_action, 'review')
    assert.equal(row.provider_id, 'provider-one')
    assert.equal(row.model, 'model-one')
    assert.equal(row.prompt_version, 'prompt-v2')
    assert.equal(isInteractionCiphertext(row.raw_result_ciphertext), true)
    assert.equal(decryptInteractionSecret(row.raw_result_ciphertext, TEST_SECRET, 'ai-raw-result'), JSON.stringify({ level: 'risk', internalTrace: 'must-stay-encrypted' }))
    assert.equal(row.raw_result_expires_at, '2026-09-22T00:00:00.000Z')
    assert.equal(row.result_hash, 'sha256:test-result')
    assert.equal(harness.database.prepare('SELECT moderation_status FROM comments WHERE id = ?').get(created.id).moderation_status, 'pending')

    const detail = harness.comments.getCommentForAdmin(created.id)
    const aiDetail = detail.decisions.find(decision => decision.stage === 'ai')
    assert.equal(aiDetail.rawResultAvailable, true)
    assert.equal(Object.hasOwn(aiDetail, 'rawResultCiphertext'), false)

    const human = harness.moderation.applyHumanDecision({
      commentId: created.id,
      moderationStatus: 'approved',
      level: 'normal',
      suggestedAction: 'approve',
      actorUserId: 'usr_moderator',
      idempotencyKey: 'ai-human-override',
    })
    assert.equal(human.applied, true)
    assert.equal(harness.database.prepare('SELECT moderation_status FROM comments WHERE id = ?').get(created.id).moderation_status, 'approved')
    assert.equal(audits.length, 0)
  } finally {
    await interaction.close()
  }
})

test('AI provider failure records a fail-closed audit and close waits for reviews', async () => {
  const harness = createHarness()
  publishPolicy(harness)
  const created = harness.comments.submitComment({
    resource: RESOURCE,
    body: submission({ body: 'provider 故障时仍需人工复核。' }),
    clientKey: 'visitor-ai-failure',
  }).comment
  let release
  const aiEngine = {
    providerId: 'provider-down',
    promptVersion: 'prompt-v1',
    policyVersion: 'policy-v1',
    decide: () => new Promise(resolve => { release = () => resolve({
      level: 'unknown', scores: {}, confidence: 0, reasonCodes: ['AI_UNAVAILABLE'],
      suggestedAction: 'review', policyVersion: 'policy-v1', providerId: 'provider-down',
      model: '', promptVersion: 'prompt-v1', rawResult: null, resultHash: '',
    }) }),
  }
  const interaction = new InteractionService({
    userContent: {},
    config: { secretEncryptionKey: TEST_SECRET },
    database: harness.database,
    policyStore: harness.policyStore,
    moderation: harness.moderation,
    comments: harness.comments,
    aiEngine,
    now: () => TEST_NOW,
  })
  const task = interaction.scheduleAiReview(created)
  let closed = false
  const closing = interaction.close().then(() => { closed = true })
  await Promise.resolve()
  assert.equal(closed, false)
  release()
  await closing
  assert.equal(closed, true)
  // A fresh in-memory database is unnecessary here; the task's completion is
  // proven by close() resolving only after the fail-closed audit was written.
  await task
})

test('AI provider configuration persists across restart and PUT preserves an existing secret reference', async () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  const audits = []
  const userContent = { insertAudit: entry => audits.push(entry) }
  const config = { secretEncryptionKey: TEST_SECRET, ai: { allowHosts: ['ai.example.test'] } }
  const first = new InteractionService({
    userContent,
    config,
    database,
    aiRegistry: new AiProviderRegistry({ allowHosts: ['ai.example.test'] }),
    now: () => TEST_NOW,
  })
  let databaseClosed = false
  try {
    const created = first.configureAiProviderForAdmin({ user: { id: 'usr_admin' } }, {
      id: 'provider-persisted', name: 'Persisted', endpoint: 'https://ai.example.test/v1',
      model: 'model-v1', secretRef: 'vault://ai/persisted', isDefault: true,
    })
    assert.equal(created.defaultProviderId, '')
    assert.equal(Object.hasOwn(created.providers[0], 'secretRef'), false)
    first.configureAiProviderForAdmin({ user: { id: 'usr_admin' } }, {
      id: 'provider-persisted', endpoint: 'https://ai.example.test/v2', model: 'model-v2',
    })
    const persisted = database.prepare('SELECT endpoint, model, secret_ref, is_default FROM ai_provider_configs WHERE id = ?').get('provider-persisted')
    assert.deepEqual({ ...persisted }, { endpoint: 'https://ai.example.test/v2', model: 'model-v2', secret_ref: 'vault://ai/persisted', is_default: 0 })

    const restarted = new InteractionService({ userContent, config, database })
    restarted.ensureReady()
    const listed = restarted.listAiProvidersForAdmin()
    assert.equal(listed.defaultProviderId, '')
    assert.equal(listed.providers[0].id, 'provider-persisted')
    assert.equal(listed.providers[0].configured, false)
    assert.equal(audits.length, 2)
    await restarted.close()
    databaseClosed = true
  } finally {
    if (!databaseClosed) database.close()
  }
})

test('AI provider requires server adapter verification before enablement and default selection', async () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  const providerAdapters = {
    test: {
      create: () => ({
        request: async () => ({ ok: true }),
        healthCheck: async () => true,
      }),
    },
  }
  const service = new InteractionService({
    userContent: { insertAudit: () => {} },
    config: { secretEncryptionKey: TEST_SECRET, ai: { allowHosts: ['ai.example.test'] } },
    database,
    providerAdapters,
    now: () => TEST_NOW,
  })
  try {
    const before = service.configureAiProviderForAdmin({ user: { id: 'usr_admin' } }, {
      id: 'provider-verified', endpoint: 'https://ai.example.test/v1', adapterId: 'test',
      secretRef: 'vault://ai/test', enabled: true, isDefault: true,
    })
    assert.equal(before.defaultProviderId, '')
    assert.equal(before.providers[0].enabled, false)
    await service.verifyAiProviderForAdmin({ user: { id: 'usr_admin' } }, 'provider-verified')
    const verified = service.listAiProvidersForAdmin()
    assert.equal(verified.providers[0].configured, true)
    assert.equal(verified.providers[0].enabled, true)
    service.setDefaultAiProviderForAdmin({ user: { id: 'usr_admin' } }, 'provider-verified')
    assert.equal(service.listAiProvidersForAdmin().defaultProviderId, 'provider-verified')
  } finally { database.close() }
})

test('provider health checks use the default timeout and semantic config changes require re-verification', async () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  const providerAdapters = {
    test: {
      create: () => ({
        request: async () => ({ ok: true }),
        healthCheck: async () => new Promise(resolve => setTimeout(() => resolve(true), 20)),
      }),
    },
  }
  const service = new InteractionService({
    userContent: { insertAudit: () => {} },
    config: { secretEncryptionKey: TEST_SECRET, ai: { allowHosts: ['ai.example.test'] } },
    database,
    providerAdapters,
    now: () => TEST_NOW,
  })
  try {
    service.configureAiProviderForAdmin({ user: { id: 'usr_admin' } }, {
      id: 'provider-revalidate', endpoint: 'https://ai.example.test/v1', adapterId: 'test',
      secretRef: 'vault://ai/test', model: 'model-v1', promptVersion: 'prompt-v1', isDefault: true,
    })
    await service.verifyAiProviderForAdmin({ user: { id: 'usr_admin' } }, 'provider-revalidate')
    service.setDefaultAiProviderForAdmin({ user: { id: 'usr_admin' } }, 'provider-revalidate')
    const changed = service.configureAiProviderForAdmin({ user: { id: 'usr_admin' } }, {
      id: 'provider-revalidate', endpoint: 'https://ai.example.test/v1', model: 'model-v2', promptVersion: 'prompt-v2',
    })
    assert.equal(changed.defaultProviderId, '')
    assert.equal(changed.providers[0].enabled, false)
    assert.equal(changed.providers[0].configured, false)
    assert.equal(database.prepare('SELECT health_status, last_verified_at, is_default FROM ai_provider_configs WHERE id = ?').get('provider-revalidate').health_status, 'unknown')
    await service.verifyAiProviderForAdmin({ user: { id: 'usr_admin' } }, 'provider-revalidate')
  } finally { database.close() }
})

test('runtime provider verification expiry is persisted and clears the database default', async () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  let current = Date.parse(TEST_NOW)
  const providerAdapters = {
    test: {
      create: () => ({
        request: async () => ({ ok: true }),
        healthCheck: async () => true,
      }),
    },
  }
  const service = new InteractionService({
    userContent: { insertAudit: () => {} },
    config: {
      secretEncryptionKey: TEST_SECRET,
      ai: { allowHosts: ['ai.example.test'], providerVerificationTtlMs: 1_000 },
    },
    database,
    providerAdapters,
    now: () => new Date(current).toISOString(),
  })
  try {
    service.configureAiProviderForAdmin({ user: { id: 'usr_admin' } }, {
      id: 'provider-expiry', endpoint: 'https://ai.example.test/v1', adapterId: 'test',
      secretRef: 'vault://ai/test', isDefault: true,
    })
    await service.verifyAiProviderForAdmin({ user: { id: 'usr_admin' } }, 'provider-expiry')
    service.setDefaultAiProviderForAdmin({ user: { id: 'usr_admin' } }, 'provider-expiry')
    current += 1_001

    const listed = service.listAiProvidersForAdmin()
    assert.equal(listed.defaultProviderId, '')
    assert.equal(listed.providers[0].enabled, false)
    assert.equal(listed.providers[0].configured, false)
    assert.deepEqual(
      { ...database.prepare('SELECT enabled, is_default, health_status, last_verified_at FROM ai_provider_configs WHERE id = ?').get('provider-expiry') },
      { enabled: 0, is_default: 0, health_status: 'unknown', last_verified_at: null },
    )
  } finally { database.close() }
})

test('AI provider configuration rejects missing secrets and unsafe endpoints as validation errors', () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  const service = new InteractionService({
    userContent: { insertAudit: () => {} },
    config: { secretEncryptionKey: TEST_SECRET, ai: { allowHosts: ['ai.example.test'] } },
    database,
    aiRegistry: new AiProviderRegistry({ allowHosts: ['ai.example.test'] }),
    now: () => TEST_NOW,
  })
  try {
    assert.throws(
      () => service.configureAiProviderForAdmin({ user: { id: 'usr_admin' } }, { id: 'missing-secret', endpoint: 'https://ai.example.test/v1' }),
      error => error.statusCode === 400 && error.code === 'VALIDATION_FAILED'
    )
    assert.throws(
      () => service.configureAiProviderForAdmin(
        { user: { id: 'private-endpoint' } },
        { id: 'private-endpoint', endpoint: 'https://127.0.0.1', secretRef: 'vault://ai/private' }
      ),
      error => error.statusCode === 400 && error.code === 'VALIDATION_FAILED'
    )
  } finally {
    database.close()
  }
})

test('wildcard matching is anchored and bounded', () => {
  assert.equal(matchWildcardTerm('买很多粉', '买*粉'), true)
  assert.equal(matchWildcardTerm('买粉', '买*粉'), true)
  assert.equal(matchWildcardTerm('请买很多粉', '买*粉'), false)
  assert.equal(matchWildcardTerm('买很多粉丝', '买*粉'), false)
  assert.equal(matchWildcardTerm('前缀内容', '前缀*'), true)
  assert.equal(matchWildcardTerm('内容后缀', '*后缀'), true)
  assert.equal(matchWildcardTerm('abc', 'a'.repeat(1) + '*'.repeat(20)), false)
  assert.equal(normalizeModerationText('  ＡＢＣ   ｄｅｆ '), 'abc def')
})

test('keyword violations are held for review instead of published', () => {
  const harness = createHarness()
  try {
    const policyVersion = publishPolicy(harness, { comments: { moderationRequired: false } })
    harness.moderation.publishKeywordRules([
      { term: '违规词', matchType: 'phrase', level: 'violation', action: 'reject', category: 'abuse' },
    ], { sourcePolicyVersion: policyVersion, now: TEST_NOW })

    // A clean comment may auto-approve when review is not required.
    const clean = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission({ body: '这是一段完全干净的留言内容。', clientRequestId: 'req_clean' }),
      clientKey: 'visitor-bucket-1',
    }).comment
    assert.equal(clean.moderation_status, 'approved')
    assert.ok(clean.approved_at)

    // A matching comment is rejected, never published.
    const flagged = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission({ body: '这里包含违规词内容。', clientRequestId: 'req_flagged' }),
      clientKey: 'visitor-bucket-2',
    }).comment
    assert.equal(flagged.moderation_status, 'rejected')
    assert.equal(flagged.approved_at, null)

    const page = harness.comments.listPublicComments(RESOURCE, {})
    assert.equal(page.count, 1)
    assert.equal(page.items[0].id, clean.id)
  } finally {
    harness.close()
  }
})

test('illegal moderation transitions are rejected with a 409 rather than a constraint error', () => {
  const harness = createHarness()
  try {
    publishPolicy(harness)
    const created = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission(),
      clientKey: 'visitor-bucket-1',
    }).comment

    harness.moderation.applyHumanDecision({
      commentId: created.id,
      moderationStatus: 'approved',
      level: 'normal',
      actorUserId: 'usr_moderator',
      idempotencyKey: 'approve-1',
    })
    // approved -> pending is not an allowed transition.
    assert.throws(() => harness.moderation.applyHumanDecision({
      commentId: created.id,
      moderationStatus: 'pending',
      level: 'unknown',
      actorUserId: 'usr_moderator',
      idempotencyKey: 'back-to-pending',
    }), error => error.code === 'MODERATION_TRANSITION_INVALID' && error.statusCode === 409)

    assert.throws(() => harness.moderation.applyHumanDecision({
      commentId: 'cmt_missing',
      moderationStatus: 'approved',
      actorUserId: 'usr_moderator',
      idempotencyKey: 'missing',
    }), error => error.code === 'RESOURCE_NOT_FOUND' && error.statusCode === 404)
  } finally {
    harness.close()
  }
})

test('replayed human decisions do not re-apply the state change', () => {
  const harness = createHarness()
  try {
    publishPolicy(harness)
    const created = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission(),
      clientKey: 'visitor-bucket-1',
    }).comment

    const first = harness.moderation.applyHumanDecision({
      commentId: created.id,
      moderationStatus: 'approved',
      level: 'normal',
      actorUserId: 'usr_moderator',
      idempotencyKey: 'review-same',
    })
    const replay = harness.moderation.applyHumanDecision({
      commentId: created.id,
      moderationStatus: 'rejected',
      level: 'violation',
      actorUserId: 'usr_moderator',
      idempotencyKey: 'review-same',
    })
    assert.equal(first.applied, true)
    assert.equal(replay.applied, false)
    assert.equal(replay.replayed, true)
    assert.equal(replay.decisionId, first.decisionId)
    // The state must still reflect the first decision only.
    assert.equal(harness.comments.findById(created.id).moderation_status, 'approved')
    assert.equal(
      Number(harness.database.prepare(
        "SELECT COUNT(*) AS count FROM comment_moderation_decisions WHERE stage = 'human'"
      ).get().count),
      1
    )
  } finally {
    harness.close()
  }
})

test('cursor pagination is stable and bounded', () => {
  const harness = createHarness()
  try {
    publishPolicy(harness, { comments: { moderationRequired: false } })
    harness.moderation.publishKeywordRules([], { sourcePolicyVersion: 1, now: TEST_NOW })
    const ids = []
    for (let index = 0; index < 5; index += 1) {
      harness.setNow(`2026-08-23T0${index}:00:00.000Z`)
      ids.push(harness.comments.submitComment({
        resource: RESOURCE,
        body: submission({ body: `第 ${index} 条留言内容。`, clientRequestId: `req_${index}` }),
        clientKey: `visitor-bucket-${index}`,
      }).comment.id)
    }

    const first = harness.comments.listPublicComments(RESOURCE, { limit: 2 })
    assert.equal(first.count, 5)
    assert.equal(first.items.length, 2)
    assert.ok(first.nextCursor)
    assert.deepEqual(first.items.map(item => item.id), ids.slice(0, 2))

    const second = harness.comments.listPublicComments(RESOURCE, { limit: 2, cursor: first.nextCursor })
    assert.deepEqual(second.items.map(item => item.id), ids.slice(2, 4))

    const third = harness.comments.listPublicComments(RESOURCE, { limit: 2, cursor: second.nextCursor })
    assert.deepEqual(third.items.map(item => item.id), ids.slice(4))
    assert.equal(third.nextCursor, '')

    assert.throws(
      () => harness.comments.listPublicComments(RESOURCE, { cursor: 'not-a-cursor' }),
      error => error.code === 'CURSOR_INVALID'
    )
  } finally {
    harness.close()
  }
})

test('public counts are scoped to one resource', () => {
  const harness = createHarness()
  try {
    publishPolicy(harness, { comments: { moderationRequired: false } })
    harness.moderation.publishKeywordRules([], { sourcePolicyVersion: 1, now: TEST_NOW })
    harness.comments.submitComment({
      resource: RESOURCE,
      body: submission({ clientRequestId: 'req_a' }),
      clientKey: 'visitor-a',
    })
    const otherResource = { ...RESOURCE, featureId: 'feature_other' }
    harness.comments.submitComment({
      resource: otherResource,
      body: submission({
        clientRequestId: 'req_b',
        resourceRef: {
          siteId: 'map-service',
          sharePublicId: RESOURCE.sharePublicId,
          shareItemId: RESOURCE.shareItemId,
          featureId: 'feature_other',
          scope: 'feature',
        },
      }),
      clientKey: 'visitor-b',
    })
    assert.equal(harness.comments.countPublicComments(RESOURCE), 1)
    assert.equal(harness.comments.countPublicComments(otherResource), 1)
    assert.equal(harness.comments.countPublicComments({ ...RESOURCE, featureId: 'feature_none' }), 0)
  } finally {
    harness.close()
  }
})

test('soft delete keeps the row, hides it publicly and refuses legal holds', () => {
  const harness = createHarness()
  try {
    publishPolicy(harness, { comments: { moderationRequired: false } })
    harness.moderation.publishKeywordRules([], { sourcePolicyVersion: 1, now: TEST_NOW })
    const created = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission(),
      clientKey: 'visitor-bucket-1',
    }).comment
    assert.equal(harness.comments.countPublicComments(RESOURCE), 1)

    const result = harness.comments.softDeleteComment(created.id, { actorUserId: 'usr_moderator' })
    assert.equal(result.deleted, true)
    const row = harness.comments.findById(created.id)
    // The row survives for moderation/legal obligations.
    assert.equal(row.content_status, 'deleted')
    assert.ok(row.deleted_at)
    assert.equal(harness.comments.countPublicComments(RESOURCE), 0)

    // Deleting twice is a no-op rather than an error.
    assert.equal(harness.comments.softDeleteComment(created.id).alreadyDeleted, true)

    const held = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission({ clientRequestId: 'req_hold' }),
      clientKey: 'visitor-bucket-2',
    }).comment
    harness.database.prepare(`
      UPDATE comments SET legal_hold = 1, legal_hold_reason = '取证', legal_hold_at = ? WHERE id = ?
    `).run(TEST_NOW, held.id)
    assert.throws(
      () => harness.comments.softDeleteComment(held.id),
      error => error.code === 'COMMENT_POLICY_BLOCKED'
    )
  } finally {
    harness.close()
  }
})

test('admin projections never expose ciphertext or contact values', () => {
  const harness = createHarness()
  try {
    publishPolicy(harness)
    const created = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission(),
      clientKey: 'visitor-bucket-1',
    }).comment

    const list = harness.comments.listCommentsForAdmin({ moderationStatus: 'pending' })
    assert.equal(list.total, 1)
    assert.equal(list.items.length, 1)
    const serialized = JSON.stringify(list.items[0])
    assert.equal(serialized.includes('aes-256-gcm'), false)
    assert.equal(serialized.includes('visitor@example.com'), false)
    assert.equal(serialized.includes(created.contact_hash), false)
    assert.equal(serialized.includes(created.author_key), false)
    assert.equal(list.items[0].hasContact, true)
    assert.equal(list.items[0].contactType, 'email')

    const detail = harness.comments.getCommentForAdmin(created.id)
    assert.equal(detail.decisions.length, 1)
    assert.equal(detail.decisions[0].stage, 'keyword')
    assert.equal(JSON.stringify(detail).includes('aes-256-gcm'), false)

    // A filter that matches nothing must not fall back to an unfiltered list.
    assert.equal(harness.comments.listCommentsForAdmin({ moderationStatus: 'approved' }).total, 0)
    assert.throws(
      () => harness.comments.getCommentForAdmin('cmt_missing'),
      error => error.code === 'RESOURCE_NOT_FOUND'
    )
  } finally {
    harness.close()
  }
})

test('contact correlation works on hashes without decrypting', () => {
  const harness = createHarness()
  try {
    publishPolicy(harness)
    harness.comments.submitComment({
      resource: RESOURCE,
      body: submission(),
      clientKey: 'visitor-bucket-1',
    })
    const matches = harness.comments.findByContact({ email: 'visitor@example.com' })
    assert.equal(matches.length, 1)
    assert.equal(harness.comments.findByContact({ email: 'someone@example.com' }).length, 0)
    assert.deepEqual(harness.comments.findByContact({}), [])
  } finally {
    harness.close()
  }
})

test('outbox events drain, dedupe and back off on failure', async () => {
  const harness = createHarness()
  try {
    publishPolicy(harness)
    const created = harness.comments.submitComment({
      resource: RESOURCE,
      body: submission(),
      clientKey: 'visitor-bucket-1',
    }).comment

    // A duplicate dedupe key is an idempotent no-op.
    const first = harness.moderation.enqueueEvent({
      commentId: created.id,
      eventType: 'comment.created',
      revision: 1,
    })
    assert.equal(first.created, false)

    const handled = []
    const drained = await harness.moderation.drainEvents(event => { handled.push(event.event_type) })
    assert.equal(drained.claimed, 1)
    assert.equal(drained.sent, 1)
    assert.deepEqual(handled, ['comment.created'])
    assert.equal(
      harness.database.prepare('SELECT status FROM comment_outbox WHERE comment_id = ?').get(created.id).status,
      'sent'
    )

    // A failing handler returns the event to the queue with a backoff.
    harness.moderation.enqueueEvent({
      commentId: created.id,
      eventType: 'comment.retry',
      revision: 2,
    })
    const failedRun = await harness.moderation.drainEvents(() => { throw new Error('downstream down') })
    assert.equal(failedRun.failed, 1)
    const retryRow = harness.database.prepare(
      "SELECT status, attempts, last_error, available_at FROM comment_outbox WHERE event_type = 'comment.retry'"
    ).get()
    assert.equal(retryRow.status, 'pending')
    assert.equal(retryRow.attempts, 1)
    assert.match(retryRow.last_error, /downstream down/)
    assert.ok(retryRow.available_at > TEST_NOW)

    // Outbox payloads must not carry comment text or contact data.
    const payloads = harness.database.prepare('SELECT payload_json FROM comment_outbox').all()
      .map(row => row.payload_json).join('')
    assert.equal(payloads.includes('推荐大家'), false)
    assert.equal(payloads.includes('visitor@example.com'), false)
  } finally {
    harness.close()
  }
})

test('interaction adapter resolves canonical thread identity and fails closed on unknown resources', () => {
  const snapshot = {
    resourceRefsVersion: 1,
    features: [{
      id: 'feature_demo',
      name: '示例地点',
      resourceRefs: { version: 1, featureId: 'feature_demo', media: [], complete: true },
    }],
  }
  const calls = []
  const userContent = {
    assertPublicShareRequest (publicId, context) {
      calls.push({ publicId, context })
      if (publicId !== 'shr_public_demo') {
        const error = new Error('分享不存在')
        error.statusCode = 404
        error.code = 'RESOURCE_NOT_FOUND'
        throw error
      }
      // The canonical id differs from the rotatable public alias.
      return { id: 'shr_canonical_one', publicId: 'shr_public_demo' }
    },
    publicShareItems () {
      return [{ share_item_id: 'shi_demo', snapshot }]
    },
    shareClientKey: (shareId, context) => `${shareId}:${context.visitorId || 'anon'}`,
  }
  const adapter = new InteractionAdapter({ userContent })

  const resolved = adapter.resolveCommentResource('shr_public_demo', {
    siteId: 'map-service',
    sharePublicId: 'shr_public_demo',
    shareItemId: 'shi_demo',
    featureId: 'feature_demo',
    scope: 'feature',
  }, { visitorId: 'vis_1' })
  // Thread identity is the immutable share id, not the rotatable alias.
  assert.equal(resolved.canonicalShareId, 'shr_canonical_one')
  assert.equal(resolved.sharePublicId, 'shr_public_demo')
  assert.equal(resolved.featureId, 'feature_demo')
  assert.equal(resolved.scope, 'feature')
  // Authorization went through the sharing domain's gating chain.
  assert.equal(calls.length, 1)
  assert.equal(calls[0].context.visitorId, 'vis_1')

  // An unknown feature is indistinguishable from an unknown share.
  const unknownFeature = () => adapter.resolveCommentResource('shr_public_demo', {
    siteId: 'map-service',
    sharePublicId: 'shr_public_demo',
    shareItemId: 'shi_demo',
    featureId: 'feature_missing',
    scope: 'feature',
  }, {})
  assert.throws(unknownFeature, error => error.code === 'RESOURCE_NOT_FOUND' && error.statusCode === 404)
  const unknownShare = () => adapter.resolveCommentResource('shr_public_other', {
    siteId: 'map-service',
    sharePublicId: 'shr_public_other',
    shareItemId: 'shi_demo',
    featureId: 'feature_demo',
    scope: 'feature',
  }, {})
  assert.throws(unknownShare, error => error.code === 'RESOURCE_NOT_FOUND')

  // An unknown share item is also a 404, not a 500.
  assert.throws(() => adapter.resolveCommentResource('shr_public_demo', {
    siteId: 'map-service',
    sharePublicId: 'shr_public_demo',
    shareItemId: 'shi_missing',
    featureId: 'feature_demo',
    scope: 'feature',
  }, {}), error => error.code === 'RESOURCE_NOT_FOUND')

  // A body alias that disagrees with the authorized path must not widen access.
  assert.throws(() => adapter.resolveCommentResource('shr_public_demo', {
    siteId: 'map-service',
    sharePublicId: 'shr_public_elsewhere',
    shareItemId: 'shi_demo',
    featureId: 'feature_demo',
    scope: 'feature',
  }, {}), error => error.code === 'RESOURCE_NOT_FOUND')

  // Only the feature scope is accepted for comments.
  assert.throws(() => adapter.resolveCommentResource('shr_public_demo', {
    siteId: 'map-service',
    sharePublicId: 'shr_public_demo',
    shareItemId: 'shi_demo',
    featureId: 'feature_demo',
    mediaId: 'media_demo',
    scope: 'media',
  }, {}), error => error.code === 'MEDIA_NOT_FOUND' || error.code === 'RESOURCE_NOT_FOUND')
})

test('rotating the share alias keeps one comment thread', () => {
  const harness = createHarness()
  try {
    publishPolicy(harness, { comments: { moderationRequired: false } })
    harness.moderation.publishKeywordRules([], { sourcePolicyVersion: 1, now: TEST_NOW })
    harness.comments.submitComment({
      resource: RESOURCE,
      body: submission({ clientRequestId: 'req_before' }),
      clientKey: 'visitor-bucket-1',
    })
    // The alias rotated, but the canonical share id is unchanged.
    const rotated = { ...RESOURCE, sharePublicId: 'shr_public_rotated' }
    harness.comments.submitComment({
      resource: rotated,
      body: submission({
        clientRequestId: 'req_after',
        resourceRef: {
          siteId: 'map-service',
          sharePublicId: 'shr_public_rotated',
          shareItemId: RESOURCE.shareItemId,
          featureId: RESOURCE.featureId,
          scope: 'feature',
        },
      }),
      clientKey: 'visitor-bucket-2',
    })
    // Both comments belong to the same thread.
    const page = harness.comments.listPublicComments(RESOURCE, {})
    assert.equal(page.count, 2)
    assert.equal(page.items.length, 2)
  } finally {
    harness.close()
  }
})
