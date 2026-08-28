import test from 'node:test'
import assert from 'node:assert/strict'
import { AiProviderRegistry } from '../service/bin/interaction/providerRegistry.js'
import { AiModerationEngine } from '../service/bin/interaction/aiModeration.js'
import { AI_SCORE_KEYS, buildAiPayload, redactPii, redactPiiText, validateAiDecision } from '../shared/interaction-ai.js'
import { createServerProviderAdapters } from '../service/bin/interaction/providerAdapters.js'

const validDecision = (overrides = {}) => ({
  level: 'risk',
  scores: Object.fromEntries(AI_SCORE_KEYS.map(key => [key, 0.1])),
  confidence: 0.9,
  reasonCodes: [],
  suggestedAction: 'review',
  policyVersion: 'interaction-moderation-v1',
  ...overrides,
})

test('AI contract validates decisions and redacts PII fields', () => {
  assert.deepEqual(redactPii({ email: 'a@b.test', nested: { token: 'x', ok: 'y' } }), { email: '[REDACTED]', nested: { token: '[REDACTED]', ok: 'y' } })
  assert.deepEqual(validateAiDecision(validDecision()).level, 'risk')
  assert.throws(() => validateAiDecision(validDecision({ level: 'bad' })))
  assert.throws(() => validateAiDecision({ ...validDecision(), extra: true }))
  assert.equal(validateAiDecision(validDecision({ confidence: 0.5, suggestedAction: 'approve' })).suggestedAction, 'review')
  assert.deepEqual(buildAiPayload({ body: 'hello', context: { language: 'zh', session: 's', userAgent: 'ua', ip: '127.0.0.1' } }).context, { language: 'zh' })
  assert.equal(redactPiiText('请联系 a@example.com 或 +86 138-0013-8000，token=secret usr_123456。').includes('a@example.com'), false)
  const payload = buildAiPayload({ body: 'IP 192.168.1.2, session=abc, user@example.com' })
  assert.equal(payload.body.includes('192.168.1.2'), false)
  assert.equal(payload.body.includes('user@example.com'), false)
})

test('provider registry fails closed without allowlist and enforces provider-specific budgets', async () => {
  const missingAllowlist = new AiProviderRegistry()
  assert.throws(() => missingAllowlist.register({ id: 'p', endpoint: 'https://example.test', secretRef: 'env://AI_KEY', request: async () => ({}) }), /allowlist/iu)
  const registry = new AiProviderRegistry({ allowHosts: ['example.test'], budget: 10 })
  registry.register({ id: 'one', endpoint: 'https://example.test', secretRef: 'env://AI_KEY', dailyBudget: 1, request: async () => ({ ok: true }) })
  registry.register({ id: 'two', endpoint: 'https://example.test', secretRef: 'env://AI_KEY', dailyBudget: 2, request: async () => ({ ok: true }) })
  await registry.run('one', async provider => provider.request())
  await assert.rejects(() => registry.run('one', async provider => provider.request()), /budget exhausted/iu)
  await registry.run('two', async provider => provider.request())
  assert.equal(registry.get('one').state.used, 1)
  assert.equal(registry.get('two').state.used, 1)
})

test('registry enforces one shared daily budget across multiple providers', async () => {
  let used = 0
  const registry = new AiProviderRegistry({
    allowHosts: ['example.test'],
    budget: 2,
    budgetStore: () => {
      if (used >= 2) return false
      used += 1
      return true
    },
  })
  registry.register({ id: 'shared-one', endpoint: 'https://example.test', secretRef: 'env://AI_KEY', dailyBudget: 0, request: async () => ({ ok: true }) })
  registry.register({ id: 'shared-two', endpoint: 'https://example.test', secretRef: 'env://AI_KEY', dailyBudget: 0, request: async () => ({ ok: true }) })
  await registry.run('shared-one', async provider => provider.request())
  await registry.run('shared-two', async provider => provider.request())
  await assert.rejects(() => registry.run('shared-one', async provider => provider.request()), /budget exhausted/iu)
  assert.equal(used, 2)
})

test('zero daily budget is unlimited and provider verification expires', async () => {
  let now = Date.parse('2026-08-24T00:00:00.000Z')
  const adapters = {
    test: {
      create: () => ({ request: async () => ({ ok: true }), healthCheck: async () => true }),
    },
  }
  const registry = new AiProviderRegistry({
    allowHosts: ['example.test'],
    adapters,
    budget: 10,
    now: () => now,
    verificationTtlMs: 1_000,
  })
  registry.register({
    id: 'unlimited', endpoint: 'https://example.test', secretRef: 'env://AI_KEY',
    adapterId: 'test', healthStatus: 'verified', lastVerifiedAt: new Date(now).toISOString(), dailyBudget: 0,
  })
  await registry.run('unlimited', async provider => provider.request())
  assert.equal(registry.get('unlimited').state.budget, Infinity)
  registry.register({
    id: 'inherited', endpoint: 'https://example.test', secretRef: 'env://AI_KEY',
    adapterId: 'test', healthStatus: 'verified', lastVerifiedAt: new Date(now).toISOString(),
  })
  assert.equal(registry.get('inherited').state.budget, 10)
  assert.equal(registry.list().find(provider => provider.id === 'unlimited').budgetUnlimited, true)
  now += 1_001
  assert.throws(() => registry.setDefault('unlimited'), /最近健康验证/iu)
  assert.equal(registry.get('unlimited').healthStatus, 'unknown')
  assert.equal(registry.get('unlimited').enabled, false)
})

test('re-registering a default provider with an unusable persisted state clears the default pointer', () => {
  const registry = new AiProviderRegistry({
    allowHosts: ['example.test'],
    adapters: { test: { create: () => ({ request: async () => ({ ok: true }) }) } },
    now: () => Date.parse('2026-08-24T00:00:00.000Z'),
  })
  registry.register({
    id: 'default-provider', endpoint: 'https://example.test', secretRef: 'vault://key',
    adapterId: 'test', enabled: true, isDefault: true,
    healthStatus: 'verified', lastVerifiedAt: '2026-08-24T00:00:00.000Z',
  })
  assert.equal(registry.defaultProviderId, 'default-provider')
  registry.register({
    id: 'default-provider', endpoint: 'https://example.test', secretRef: 'vault://key',
    adapterId: 'test', enabled: true, isDefault: false, healthStatus: 'unknown',
  })
  assert.equal(registry.defaultProviderId, '')
  assert.equal(registry.get('default-provider').enabled, false)
})

test('removing a corrupt provider can suppress implicit default promotion', () => {
  const registry = new AiProviderRegistry({
    allowHosts: ['example.test'],
    adapters: { test: { create: () => ({ request: async () => ({ ok: true }) }) } },
    now: () => Date.parse('2026-08-24T00:00:00.000Z'),
  })
  for (const id of ['bad-provider', 'other-provider']) {
    registry.register({
      id, endpoint: 'https://example.test', secretRef: 'vault://key', adapterId: 'test',
      enabled: true, isDefault: id === 'bad-provider', healthStatus: 'verified',
      lastVerifiedAt: '2026-08-24T00:00:00.000Z',
    })
  }
  registry.remove('bad-provider', { promote: false })
  assert.equal(registry.defaultProviderId, '')
})

test('server provider adapters expose only controlled request and health-check functions', () => {
  const adapters = createServerProviderAdapters({ secretResolver: () => 'test-secret' })
  const adapter = adapters['openai-compatible'].create({
    endpoint: 'https://example.test/v1/chat/completions',
    model: 'model',
    secretRef: 'vault://test',
    timeoutMs: 1000,
  })
  assert.equal(typeof adapter.request, 'function')
  assert.equal(typeof adapter.healthCheck, 'function')
})

test('server provider adapter exposes synchronous secret availability for env references', () => {
  const adapters = createServerProviderAdapters({ secretResolver: () => '' })
  const adapter = adapters['openai-compatible'].create({
    endpoint: 'https://example.test/v1/chat/completions',
    model: 'model',
    secretRef: 'env://MISSING_KEY',
  })
  assert.equal(adapter.secretAvailable(), false)
})

test('provider registry enforces HTTPS, concurrency budget and circuit breaker', async () => {
  const registry = new AiProviderRegistry({ allowHosts: ['example.test'], maxConcurrency: 1, budget: 1, failureThreshold: 1, cooldownMs: 10000 })
  assert.throws(() => registry.register({ id: 'bad', endpoint: 'http://x', secretRef: 'ENV:X', request: async () => ({}) }))
  registry.register({ id: 'p', endpoint: 'https://example.test', secretRef: 'ENV:X', request: async () => validDecision({ level: 'normal', suggestedAction: 'approve' }) })
  assert.equal(Object.hasOwn(registry.list()[0], 'secretRef'), false)
  await registry.run('p', async p => p.request())
  await assert.rejects(() => registry.run('p', async () => ({})), /budget exhausted/)
})

test('AI moderation fails closed and does not throw provider failures', async () => {
  const registry = new AiProviderRegistry({ allowHosts: ['example.test'], failureThreshold: 1 })
  registry.register({ id: 'p', endpoint: 'https://example.test', secretRef: 'ENV:X', request: async () => { throw new Error('offline') } })
  const engine = new AiModerationEngine({ registry, providerId: 'p', retries: 1 })
  const result = await engine.decide({ body: 'hello', context: { email: 'secret@example.test' } })
  assert.equal(result.level, 'unknown')
  assert.equal(result.suggestedAction, 'review')
  assert.equal(result.reasonCodes[0], 'AI_UNAVAILABLE')
})

test('retry=0 performs exactly one charged attempt', async () => {
  const registry = new AiProviderRegistry({ allowHosts: ['example.test'], budget: 1 })
  let calls = 0
  registry.register({ id: 'p', endpoint: 'https://example.test', secretRef: 'ENV:X', request: async () => { calls += 1; throw new Error('offline') } })
  const result = await new AiModerationEngine({ registry, providerId: 'p', retries: 0 }).decide({ body: 'x' })
  assert.equal(calls, 1)
  assert.equal(result.reasonCodes[0], 'AI_UNAVAILABLE')
  assert.equal(registry.used, 1)
})

test('each retry consumes a separate budget unit', async () => {
  const registry = new AiProviderRegistry({ allowHosts: ['example.test'], budget: 2, failureThreshold: 3 })
  let calls = 0
  registry.register({ id: 'p', endpoint: 'https://example.test', secretRef: 'ENV:X', request: async () => { calls += 1; throw new Error('offline') } })
  await new AiModerationEngine({ registry, providerId: 'p', retries: 1 }).decide({ body: 'x' })
  assert.equal(calls, 2)
  assert.equal(registry.used, 2)
})

test('provider timeout releases concurrency slot even when request ignores abort', async () => {
  const registry = new AiProviderRegistry({ allowHosts: ['example.test'], maxConcurrency: 1, budget: 2 })
  registry.register({ id: 'p', endpoint: 'https://example.test', secretRef: 'ENV:X', request: () => new Promise(() => {}) })
  const engine = new AiModerationEngine({ registry, providerId: 'p', retries: 0, timeoutMs: 100 })
  const result = await engine.decide({ body: 'x' })
  assert.equal(result.reasonCodes[0], 'AI_TIMEOUT')
  assert.equal(registry.active, 0)
})

test('provider endpoint rejects credentials and private or mapped private addresses', () => {
  const registry = new AiProviderRegistry({ allowHosts: ['example.test'] })
  for (const endpoint of ['https://user:pass@example.test', 'https://127.0.0.1', 'https://192.0.2.1', 'https://[::ffff:127.0.0.1]', 'https://service.internal']) {
    assert.throws(() => registry.register({ id: endpoint, endpoint, secretRef: 'ENV:X', request: async () => ({}) }))
  }
})
