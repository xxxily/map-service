import crypto from 'node:crypto'
import { AI_PROMPT_VERSION, buildAiPayload, failClosedDecision, validateAiDecision } from '../../../shared/interaction-ai.js'

function jsonFromResponse (response) {
  if (typeof response === 'string') return JSON.parse(response)
  if (response && typeof response === 'object' && response.body !== undefined) return jsonFromResponse(response.body)
  return response
}

function timeoutError () {
  const error = new Error('AI provider request timeout')
  error.name = 'AbortError'
  return error
}

function withTimeout (promise, controller, timeoutMs) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(timeoutError())
    }, timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export class AiModerationEngine {
  constructor (options = {}) {
    this.registry = options.registry
    this.providerId = options.providerId || ''
    this.timeoutMs = Math.max(100, Number(options.timeoutMs) || 3000)
    const configuredRetries = options.retries ?? (options.maxAttempts !== undefined ? Number(options.maxAttempts) - 1 : 1)
    this.retries = Math.max(0, Math.min(3, Number.isFinite(Number(configuredRetries)) ? Number(configuredRetries) : 1))
    this.promptVersion = String(options.promptVersion || AI_PROMPT_VERSION)
    this.policyVersion = String(options.policyVersion || this.promptVersion)
    this.runtimeOverrides = options.runtimeOverrides && typeof options.runtimeOverrides === 'object'
      ? { ...options.runtimeOverrides }
      : null
  }

  async decide (input = {}) {
    const fallback = (reason) => ({
      ...failClosedDecision(reason, this.policyVersion),
      providerId: this.providerId,
      model: '',
      promptVersion: this.promptVersion,
      policyVersion: this.policyVersion,
      rawResult: null,
    })
    if (!this.registry || !this.providerId) return fallback('AI_NOT_CONFIGURED')
    const configuredProvider = this.registry.get?.(this.providerId)
    const promptVersion = this.promptVersion
    const payload = buildAiPayload({ ...input, promptVersion })
    const retries = this.runtimeOverrides?.maxAttempts !== undefined
      ? Math.max(0, Math.min(3, Number(this.runtimeOverrides.maxAttempts) - 1))
      : configuredProvider?.maxAttemptsConfigured
      ? Math.max(0, Math.min(3, Number(configuredProvider.maxAttempts) - 1))
      : this.retries
    const timeoutMs = this.runtimeOverrides?.timeoutMs !== undefined
      ? Math.max(100, Number(this.runtimeOverrides.timeoutMs) || this.timeoutMs)
      : configuredProvider?.timeoutConfigured
      ? Math.max(100, Number(configuredProvider.timeoutMs) || this.timeoutMs)
      : this.timeoutMs
    let lastError
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        // One registry run corresponds to one outbound attempt, so retries
        // consume budget and concurrency independently.
        const result = await this.registry.run(this.providerId, async provider => {
          const controller = new AbortController()
          const raw = await withTimeout(
            provider.request({ endpoint: provider.endpoint, secretRef: provider.secretRef, payload, signal: controller.signal }),
            controller,
            timeoutMs,
          )
          const parsed = jsonFromResponse(raw)
          const decision = validateAiDecision(parsed)
          if (decision.policyVersion !== this.policyVersion) throw Object.assign(new Error('AI policyVersion 不匹配'), { code: 'AI_SCHEMA_INVALID' })
          return { ...decision, providerId: provider.id, model: String(provider.model || ''), promptVersion, rawResult: parsed }
        })
        return {
          ...result,
          resultHash: `sha256:${crypto.createHash('sha256').update(JSON.stringify(result.rawResult || result)).digest('hex')}`,
        }
      } catch (error) {
        lastError = error
        if (error?.name === 'AbortError') return fallback('AI_TIMEOUT')
        if (error?.code === 'AI_SCHEMA_INVALID' || /AI 响应|JSON/u.test(String(error?.message || ''))) return fallback('AI_SCHEMA_INVALID')
        if (/budget exhausted|circuit open|not configured|不存在/u.test(String(error?.message || ''))) break
      }
    }
    return fallback(lastError?.name === 'AbortError' ? 'AI_TIMEOUT' : 'AI_UNAVAILABLE')
  }
}

export default AiModerationEngine
