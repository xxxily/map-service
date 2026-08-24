import http from 'node:http'
import https from 'node:https'
import { resolvePublicHttpTarget, createPinnedHttpAgents } from '../security/networkTarget.js'

const MAX_RESPONSE_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 8_000

function adapterError (message, code = 'AI_PROVIDER_REQUEST_FAILED') {
  const error = new Error(message)
  error.code = code
  return error
}

function defaultSecretResolver (secretRef) {
  const match = /^env:\/\/([A-Z][A-Z0-9_]{0,127})$/u.exec(String(secretRef || ''))
  return match ? String(process.env[match[1]] || '') : ''
}

async function requestJson (endpoint, options = {}) {
  const target = await resolvePublicHttpTarget(endpoint, { lookup: options.lookup })
  const parsed = new URL(target.url)
  const transport = parsed.protocol === 'https:' ? https : http
  const agents = createPinnedHttpAgents(target.addresses)
  const body = options.body == null ? '' : JSON.stringify(options.body)
  const headers = {
    accept: 'application/json',
    ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}),
    ...(options.headers || {}),
    // Keep the original host for virtual hosting while the socket is pinned
    // to the address resolved above. Redirects are deliberately not followed.
    host: parsed.host,
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let timer
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }
    const request = transport.request({
      protocol: parsed.protocol,
      hostname: target.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      method: String(options.method || 'GET').toUpperCase(),
      headers,
      ...(parsed.protocol === 'https:' ? { agent: agents.httpsAgent, servername: target.hostname } : { agent: agents.httpAgent }),
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.resume()
        finish(adapterError('AI provider 禁止重定向', 'AI_PROVIDER_REDIRECT'))
        return
      }
      const chunks = []
      let size = 0
      response.on('data', chunk => {
        size += chunk.length
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy(adapterError('AI provider 响应过大', 'AI_PROVIDER_RESPONSE_TOO_LARGE'))
          return
        }
        chunks.push(chunk)
      })
      response.on('error', error => finish(error))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (response.statusCode < 200 || response.statusCode >= 300) {
          finish(adapterError(`AI provider 返回 HTTP ${response.statusCode}`, 'AI_PROVIDER_HTTP_ERROR'))
          return
        }
        if (!text) {
          finish(null, null)
          return
        }
        try { finish(null, JSON.parse(text)) } catch { finish(adapterError('AI provider 返回的 JSON 不合法', 'AI_PROVIDER_JSON_INVALID')) }
      })
    })
    request.on('error', error => finish(error))
    timer = setTimeout(() => {
      request.destroy(adapterError('AI provider 请求超时', 'AI_PROVIDER_TIMEOUT'))
    }, Math.max(100, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS))
    if (options.signal) {
      if (options.signal.aborted) request.destroy(adapterError('AI provider 请求已取消', 'AI_PROVIDER_ABORTED'))
      else options.signal.addEventListener('abort', () => request.destroy(adapterError('AI provider 请求已取消', 'AI_PROVIDER_ABORTED')), { once: true })
    }
    if (body) request.write(body)
    request.end()
  })
}

function extractOpenAiDecision (response) {
  const content = response?.choices?.[0]?.message?.content
  if (typeof content === 'string' && content.trim()) {
    try { return JSON.parse(content) } catch { throw adapterError('AI provider 返回的模型内容不是 JSON', 'AI_PROVIDER_JSON_INVALID') }
  }
  return response
}

function createOpenAiCompatibleAdapter ({ provider, resolveSecret }) {
  const getSecret = () => {
    const secret = resolveSecret(provider.secretRef)
    if (secret && typeof secret.then === 'function') return secret.then(value => String(value || ''))
    return String(secret || '')
  }
  const request = async ({ payload, signal }) => {
    const secret = await getSecret()
    if (!secret) throw adapterError('AI provider secretRef 未解析', 'AI_PROVIDER_SECRET_UNAVAILABLE')
    const response = await requestJson(provider.endpoint, {
      method: 'POST',
      timeoutMs: provider.timeoutMs,
      signal,
      headers: { authorization: `Bearer ${secret}` },
      body: {
        model: provider.model,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        response_format: { type: 'json_object' },
      },
    })
    return extractOpenAiDecision(response)
  }
  const healthCheck = async ({ signal }) => {
    const secret = await getSecret()
    if (!secret) throw adapterError('AI provider secretRef 未解析', 'AI_PROVIDER_SECRET_UNAVAILABLE')
    await requestJson(provider.endpoint, {
      method: 'POST',
      timeoutMs: provider.timeoutMs,
      signal,
      headers: { authorization: `Bearer ${secret}` },
      body: { model: provider.model, messages: [{ role: 'user', content: 'health-check' }], max_tokens: 1 },
    })
    return true
  }
  return { request, healthCheck }
}

/**
 * Only server-owned adapter ids are exposed to provider configuration. The
 * browser can select metadata, but it can never submit a function or a
 * request implementation.
 */
export function createServerProviderAdapters (options = {}) {
  const resolveSecret = typeof options.secretResolver === 'function' ? options.secretResolver : defaultSecretResolver
  return Object.freeze({
    'openai-compatible': {
      create: provider => createOpenAiCompatibleAdapter({ provider, resolveSecret }),
    },
  })
}

export { defaultSecretResolver, requestJson }
