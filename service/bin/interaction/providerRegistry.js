import net from 'node:net'
import { URL } from 'node:url'

const PRIVATE_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata'])
const DEFAULT_TIMEOUT_MS = 3_000
const DEFAULT_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1_000

function providerValidationError (message, code = 'VALIDATION_FAILED') {
  const error = new Error(message)
  error.statusCode = 400
  error.code = code
  return error
}

function ipv4Number (address) {
  return address.split('.').reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0)
}

function isForbiddenIpv4 (address) {
  if (net.isIP(address) !== 4) return false
  const value = ipv4Number(address)
  return [
    [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
    [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
    [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24],
    [0xe0000000, 4], [0xf0000000, 4],
  ].some(([network, prefix]) => (value >>> (32 - prefix)) === (network >>> (32 - prefix)))
}

function mappedIpv4 (hostname) {
  const match = /^::ffff:(?:([0-9a-f]{1,4}):([0-9a-f]{1,4})|(\d+\.\d+\.\d+\.\d+))$/iu.exec(hostname)
  if (!match) return ''
  if (match[3]) return match[3]
  const high = Number.parseInt(match[1], 16)
  const low = Number.parseInt(match[2], 16)
  return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`
}

function normalizeHosts (value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(item => String(item || '').trim().toLowerCase().replace(/^\.|\.$/gu, ''))
    .filter(item => /^[a-z0-9][a-z0-9.-]{0,252}$/u.test(item)))]
}

function endpointInfo (endpoint, allowHosts = []) {
  let parsed
  try { parsed = new URL(endpoint) } catch { throw providerValidationError('AI provider endpoint 不合法') }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, '').replace(/\.$/gu, '')
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw providerValidationError('AI provider 只允许不带凭据的 HTTPS endpoint')
  const ipType = net.isIP(hostname)
  const privateIp = ipType === 4 && isForbiddenIpv4(hostname)
  const mappedV4 = ipType === 6 ? mappedIpv4(hostname) : ''
  const privateMappedV4 = mappedV4 && isForbiddenIpv4(mappedV4)
  const privateV6 = ipType === 6 && (hostname === '::1' || hostname === '::' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe8') || hostname.startsWith('fe9') || hostname.startsWith('fea') || hostname.startsWith('feb') || hostname.startsWith('ff') || hostname.startsWith('2001:db8:'))
  if (PRIVATE_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || privateIp || privateV6 || privateMappedV4) throw providerValidationError('AI provider endpoint 命中禁止的本地或内网地址')
  const approved = normalizeHosts(allowHosts)
  if (!approved.length) throw providerValidationError('AI provider 未配置受控 allowlist', 'AI_PROVIDER_ALLOWLIST_REQUIRED')
  if (!approved.includes(hostname)) throw providerValidationError('AI provider endpoint 不在受控 allowlist')
  return { endpoint: parsed.toString(), hostname }
}

function positiveInteger (value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.floor(parsed))
}

function verificationTimestamp (value) {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function isFreshVerification (value, now, ttlMs) {
  const timestamp = verificationTimestamp(value)
  if (!timestamp) return false
  const age = now - timestamp
  return age >= 0 && age <= ttlMs
}

function makeProviderState (provider, defaults) {
  const hasProviderBudget = provider.dailyBudget !== undefined && provider.dailyBudget !== null && provider.dailyBudget !== ''
  const configuredBudget = Number(provider.dailyBudget)
  // An omitted budget inherits the registry default. An explicit zero is the
  // persisted/configured unlimited value; positive values are hard caps.
  const budget = hasProviderBudget && configuredBudget === 0
    ? Infinity
    : hasProviderBudget && Number.isFinite(configuredBudget) && configuredBudget > 0
      ? Math.floor(configuredBudget)
      : defaults.budget
  const hasProviderConcurrency = provider.maxConcurrency !== undefined && provider.maxConcurrency !== null && provider.maxConcurrency !== ''
  const configuredConcurrency = hasProviderConcurrency
    ? positiveInteger(provider.maxConcurrency, defaults.maxConcurrency, 128)
    : Infinity
  return {
    maxConcurrency: positiveInteger(provider.maxConcurrency, defaults.maxConcurrency, 128),
    budget,
    configuredBudget: Number.isFinite(configuredBudget) && configuredBudget > 0 ? Math.floor(configuredBudget) : Infinity,
    configuredMaxConcurrency: configuredConcurrency,
    budgetDay: String(provider.dailyBudgetDay || new Date().toISOString().slice(0, 10)),
    used: Math.max(0, Number(provider.dailyBudgetUsed) || 0),
    active: 0,
    queue: [],
    failures: { count: 0, openUntil: 0 },
    failureThreshold: positiveInteger(provider.failureThreshold, defaults.failureThreshold, 20),
    cooldownMs: positiveInteger(provider.cooldownMs, defaults.cooldownMs, 86_400_000),
  }
}

export class AiProviderRegistry {
  constructor (options = {}) {
    this.providers = new Map()
    this.defaultProviderId = String(options.defaultProviderId || '')
    this.now = typeof options.now === 'function' ? options.now : () => Date.now()
    this.maxConcurrency = positiveInteger(options.maxConcurrency, 2, 128)
    const configuredBudget = Number(options.budget)
    this.budget = Number.isFinite(configuredBudget) && configuredBudget > 0
      ? Math.floor(configuredBudget)
      : Infinity
    this.budgetDay = new Date(this.now()).toISOString().slice(0, 10)
    this.budgetUsed = 0
    this.failureThreshold = positiveInteger(options.failureThreshold, 3, 20)
    this.cooldownMs = positiveInteger(options.cooldownMs, 30_000, 86_400_000)
    this.allowHosts = normalizeHosts(options.allowHosts)
    this.adapters = options.adapters && typeof options.adapters === 'object' ? options.adapters : {}
    this.usageStore = typeof options.usageStore === 'function' ? options.usageStore : null
    this.budgetStore = typeof options.budgetStore === 'function' ? options.budgetStore : null
    this.onVerificationExpired = typeof options.onVerificationExpired === 'function' ? options.onVerificationExpired : null
    this.verificationTtlMs = positiveInteger(options.verificationTtlMs, DEFAULT_VERIFICATION_TTL_MS, 30 * 24 * 60 * 60 * 1_000)
  }

  _resolveAdapter (provider) {
    const adapterId = String(provider.adapterId || provider.protocol || '').trim()
    const factory = this.adapters[adapterId]
    if (!factory) return {
      adapterId,
      request: typeof provider.request === 'function' ? provider.request : null,
      healthCheck: typeof provider.healthCheck === 'function' ? provider.healthCheck : null,
    }
    const result = typeof factory.create === 'function' ? factory.create(provider) : typeof factory === 'function' ? factory(provider) : null
    return {
      adapterId,
      request: typeof result?.request === 'function' ? result.request : null,
      healthCheck: typeof result?.healthCheck === 'function' ? result.healthCheck : null,
      secretAvailable: typeof result?.secretAvailable === 'function' ? result.secretAvailable : null,
    }
  }

  register (provider = {}) {
    const id = String(provider.id || '').trim()
    const secretRef = String(provider.secretRef || '').trim()
    const apiKey = String(provider.apiKey || '').trim()
    if (!id || id.length > 100 || (!secretRef && !apiKey)) throw providerValidationError('AI provider 配置不合法')
    const endpoint = endpointInfo(String(provider.endpoint || ''), provider.allowHosts || this.allowHosts)
    const adapter = this._resolveAdapter({ ...provider, endpoint: endpoint.endpoint })
    const requestedHealthStatus = String(provider.healthStatus || provider.health_status || 'unknown')
    const healthStatus = ['verified', 'failed', 'unknown'].includes(requestedHealthStatus)
      ? requestedHealthStatus
      : 'unknown'
    // Function injection is retained only for isolated in-process tests that
    // construct a registry without the production adapter catalog. The
    // service-owned registry always has a catalog and therefore cannot accept
    // a function from a JSON management request.
    const trustedFunction = typeof provider.request === 'function' && Object.keys(this.adapters).length === 0
    const lastVerifiedAt = String(provider.lastVerifiedAt || provider.last_verified_at || '')
    let secretAvailable
    try { secretAvailable = adapter.secretAvailable?.() } catch { secretAvailable = false }
    const verified = trustedFunction || (
      healthStatus === 'verified' &&
      isFreshVerification(lastVerifiedAt, this.now(), this.verificationTtlMs) &&
      secretAvailable !== false
    )
    const effectiveHealthStatus = verified
      ? 'verified'
      : healthStatus === 'verified' && secretAvailable === false
        ? 'unknown'
        : healthStatus
    const requestedEnabled = provider.enabled !== false
    const entry = {
      ...provider,
      id,
      endpoint: endpoint.endpoint,
      hostname: endpoint.hostname,
      secretRef,
      apiKey,
      adapterId: adapter.adapterId,
      model: String(provider.model || ''),
      name: String(provider.name || id),
      enabled: requestedEnabled && verified && Boolean(adapter.request),
      requestedEnabled,
      trustedFunction,
      timeoutConfigured: provider.timeoutMs !== undefined,
      maxAttemptsConfigured: provider.maxAttempts !== undefined,
      dailyBudgetConfigured: provider.dailyBudget !== undefined,
      maxConcurrencyConfigured: provider.maxConcurrency !== undefined,
      request: adapter.request,
      healthCheck: adapter.healthCheck,
      healthStatus: effectiveHealthStatus,
      lastVerifiedAt: verified ? lastVerifiedAt : '',
      timeoutMs: positiveInteger(provider.timeoutMs, DEFAULT_TIMEOUT_MS, 120_000),
      maxAttempts: provider.maxAttempts === undefined ? undefined : positiveInteger(provider.maxAttempts, 2, 4),
      state: makeProviderState(provider, this),
    }
    this.providers.set(id, entry)
    if (provider.isDefault === true && entry.enabled && entry.request) this.defaultProviderId = id
    else if (this.defaultProviderId === id) this.defaultProviderId = ''
    return entry
  }

  configure (provider = {}) { return this.register(provider) }

  /**
   * Apply the active interaction policy's global runtime limits. Provider
   * records may still carry their own persisted limits, but a published site
   * policy is the authoritative safety envelope for outbound AI work.
   */
  configureRuntimeLimits ({ budget, maxConcurrency } = {}) {
    const parsedBudget = Number(budget)
    this.budget = Number.isFinite(parsedBudget) && parsedBudget > 0 ? Math.floor(parsedBudget) : Infinity
    const parsedConcurrency = Number(maxConcurrency)
    this.maxConcurrency = positiveInteger(parsedConcurrency, this.maxConcurrency, 128)
    for (const provider of this.providers.values()) {
      provider.state.budget = Number.isFinite(this.budget)
        ? Math.min(this.budget, provider.state.configuredBudget)
        : provider.state.configuredBudget
      provider.state.maxConcurrency = Math.min(this.maxConcurrency, provider.state.configuredMaxConcurrency)
    }
  }
  remove (id, options = {}) {
    const key = String(id || '')
    const removed = this.providers.delete(key)
    if (this.defaultProviderId === key) {
      this.defaultProviderId = options.promote === false
        ? ''
        : [...this.providers.values()].find(item => item.enabled && item.request && item.healthStatus === 'verified')?.id || ''
    }
    return removed
  }
  get (id) { return this.providers.get(String(id || '')) || null }
  getDefault () { return this.get(this.defaultProviderId) }
  _expireVerification (provider) {
    if (!provider || provider.trustedFunction || provider.healthStatus !== 'verified' || isFreshVerification(provider.lastVerifiedAt, this.now(), this.verificationTtlMs)) return false
    provider.healthStatus = 'unknown'
    provider.lastVerifiedAt = ''
    provider.enabled = false
    if (this.defaultProviderId === provider.id) this.defaultProviderId = ''
    this.onVerificationExpired?.(provider)
    return true
  }
  setDefault (id) {
    const provider = this.get(id)
    if (!provider) throw providerValidationError('AI provider 不存在', 'RESOURCE_NOT_FOUND')
    if (this._expireVerification(provider)) throw providerValidationError('AI provider 最近健康验证已过期', 'AI_PROVIDER_VERIFICATION_EXPIRED')
    if (!provider.enabled || typeof provider.request !== 'function' || provider.healthStatus !== 'verified') throw providerValidationError('AI provider 尚未通过健康验证', 'AI_PROVIDER_NOT_VERIFIED')
    this.defaultProviderId = provider.id
    return provider
  }
  markVerified (id, timestamp = new Date().toISOString()) {
    const provider = this.get(id)
    if (!provider) throw providerValidationError('AI provider 不存在', 'RESOURCE_NOT_FOUND')
    if (!provider.request || (!provider.healthCheck && !provider.lastVerifiedAt)) throw providerValidationError('AI provider 未绑定服务端适配器', 'AI_PROVIDER_ADAPTER_REQUIRED')
    provider.healthStatus = 'verified'
    provider.lastVerifiedAt = String(timestamp)
    provider.enabled = provider.requestedEnabled !== false
    return provider
  }
  list () {
    return [...this.providers.values()].map(provider => {
      this._expireVerification(provider)
      return {
      id: provider.id,
      name: provider.name,
      endpoint: provider.endpoint,
      model: provider.model,
      adapterId: provider.adapterId,
      hasApiKey: Boolean(provider.apiKey),
      configured: Boolean(provider.request && provider.healthStatus === 'verified'),
      enabled: provider.enabled,
      requestedEnabled: provider.requestedEnabled,
      isDefault: provider.id === this.defaultProviderId,
      health: provider.state.failures.openUntil > Date.now() ? 'circuit_open' : provider.healthStatus,
      lastVerifiedAt: provider.lastVerifiedAt || null,
      timeoutMs: provider.timeoutMs,
      maxAttempts: provider.maxAttempts || 2,
      dailyBudget: Number.isFinite(provider.state.budget) ? provider.state.budget : 0,
      maxConcurrency: provider.state.maxConcurrency,
      promptVersion: String(provider.promptVersion || ''),
      budgetUnlimited: !Number.isFinite(provider.state.budget),
      }
    })
  }

  _resetBudgetIfNeeded (provider) {
    const day = new Date(this.now()).toISOString().slice(0, 10)
    if (this.budgetDay !== day) {
      this.budgetDay = day
      this.budgetUsed = 0
    }
    if (provider.state.budgetDay !== day) {
      provider.state.budgetDay = day
      provider.state.used = 0
    }
  }

  async _acquireSlot (provider) {
    if (provider.state.active < provider.state.maxConcurrency) { provider.state.active += 1; return }
    await new Promise(resolve => provider.state.queue.push(resolve))
    provider.state.active += 1
  }

  _releaseSlot (provider) {
    provider.state.active = Math.max(0, provider.state.active - 1)
    provider.state.queue.shift()?.()
  }

  async run (id, task) {
    const provider = this.get(id)
    if (!provider || provider.enabled === false) throw new Error('AI provider 不存在或已停用')
    this._expireVerification(provider)
    if (provider.enabled === false) throw new Error('AI provider 尚未通过最近健康验证')
    if (typeof provider.request !== 'function' || provider.healthStatus !== 'verified') throw new Error('AI provider 未配置已验证的请求适配器')
    const now = this.now()
    if (provider.state.failures.openUntil > now) throw new Error('AI provider circuit open')
    this._resetBudgetIfNeeded(provider)
    if (provider.state.used >= provider.state.budget) throw new Error('AI budget exhausted')
    const day = new Date(this.now()).toISOString().slice(0, 10)
    if (Number.isFinite(this.budget)) {
      const allowed = this.budgetStore
        ? this.budgetStore(day, this.budget)
        : this.budgetUsed < this.budget
      if (allowed === false) throw new Error('AI budget exhausted')
      this.budgetUsed += 1
    }
    provider.state.used += 1
    this.usageStore?.(provider, provider.state)
    await this._acquireSlot(provider)
    try {
      const result = await task(provider)
      provider.state.failures = { count: 0, openUntil: 0 }
      return result
    } catch (error) {
      const next = provider.state.failures.count + 1
      provider.state.failures = { count: next, openUntil: next >= provider.state.failureThreshold ? this.now() + provider.state.cooldownMs : 0 }
      throw error
    } finally { this._releaseSlot(provider) }
  }

  get used () { return this.budgetUsed }
  get active () { return [...this.providers.values()].reduce((sum, provider) => sum + provider.state.active, 0) }
}

export { endpointInfo, normalizeHosts }
export default AiProviderRegistry
