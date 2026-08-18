import { applyEmbeddedRequestContext, isEmbeddedDocument } from './embed-context.js'

const API_BASE = '/api/v1'
const CSRF_COOKIE_NAME = 'map_csrf_token'
const EMBEDDED_CSRF_COOKIE_NAME = `${CSRF_COOKIE_NAME}_embed`
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export class ApiError extends Error {
  constructor (message, options = {}) {
    super(message || '请求失败')
    this.name = 'ApiError'
    this.status = Number(options.status || 0)
    this.code = options.code || 'REQUEST_FAILED'
    this.details = options.details || null
  }
}

export function parseCookieString (cookieString = '') {
  return String(cookieString)
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .reduce((result, item) => {
      const separator = item.indexOf('=')
      if (separator <= 0) return result
      const key = item.slice(0, separator).trim()
      const rawValue = item.slice(separator + 1)
      try {
        result[key] = decodeURIComponent(rawValue)
      } catch {
        result[key] = rawValue
      }
      return result
    }, {})
}

export function getCsrfToken (cookieString, options = {}) {
  const source = cookieString === undefined && typeof document !== 'undefined'
    ? document.cookie
    : cookieString
  const cookies = parseCookieString(source)
  const embedded = options.embedded === undefined
    ? (cookieString === undefined && isEmbeddedDocument())
    : options.embedded === true
  return embedded
    ? (cookies[EMBEDDED_CSRF_COOKIE_NAME] || cookies[CSRF_COOKIE_NAME] || '')
    : (cookies[CSRF_COOKIE_NAME] || cookies[EMBEDDED_CSRF_COOKIE_NAME] || '')
}

export function shouldAttachCsrf (method) {
  return !SAFE_METHODS.has(String(method || 'GET').toUpperCase())
}

export function buildApiUrl (path, query) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${path || ''}`
  const params = query instanceof URLSearchParams
    ? query
    : new URLSearchParams(Object.entries(query || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined))
  const queryString = params.toString()
  return `${API_BASE}${normalizedPath}${queryString ? `?${queryString}` : ''}`
}

function isFormData (value) {
  return typeof FormData !== 'undefined' && value instanceof FormData
}

function notifySessionExpired (error) {
  if (error.status !== 401 || error.code !== 'AUTH_REQUIRED') return
  if (typeof window !== 'undefined' && window.dispatchEvent instanceof Function) {
    window.dispatchEvent(new CustomEvent('map-auth-session-expired'))
  }
}

async function readResponsePayload (response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null)
  }
  const text = await response.text().catch(() => '')
  return text ? { message: text } : null
}

function apiErrorFromResponse (response, payload) {
  const source = payload?.error || payload || {}
  return new ApiError(source.message || response.statusText || '请求失败', {
    status: response.status,
    code: source.code || `HTTP_${response.status}`,
    details: source.details || null,
  })
}

function isReplayableBody (body) {
  return body === undefined || body === null || typeof body === 'string'
}

function clearEmbeddedCsrfCookie () {
  if (typeof document === 'undefined') return
  // Match the partitioned cookie attributes used by the server. Chromium
  // treats the local loopback origin as secure for this deletion as well.
  document.cookie = `${EMBEDDED_CSRF_COOKIE_NAME}=; Max-Age=0; Path=/; Secure; SameSite=None; Partitioned`
}

async function refreshEmbeddedAuthContext () {
  clearEmbeddedCsrfCookie()
  const headers = new Headers({ Accept: 'application/json' })
  applyEmbeddedRequestContext(headers)
  try {
    await fetch(buildApiUrl('/auth/session'), {
      method: 'GET',
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
    })
  } catch {
    // The original write error remains the actionable result.
  }
}

async function requestApiResponse (url, options) {
  const response = await fetch(url, options)
  const payload = await readResponsePayload(response)
  return { response, payload }
}

export async function apiRequest (path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')
  applyEmbeddedRequestContext(headers)

  let body
  if (options.body !== undefined) {
    if (isFormData(options.body) || typeof options.body === 'string' || options.body instanceof Blob) {
      body = options.body
    } else {
      headers.set('Content-Type', 'application/json')
      body = JSON.stringify(options.body)
    }
  }

  if (shouldAttachCsrf(method) && options.csrf !== false) {
    const csrfToken = getCsrfToken()
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
  }

  const requestOptions = {
    method,
    headers,
    body,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    signal: options.signal,
  }
  let { response, payload } = await requestApiResponse(buildApiUrl(path, options.query), requestOptions)
  if (!response.ok || (payload && Object.hasOwn(payload, 'code') && payload.code !== 0)) {
    let error = apiErrorFromResponse(response, payload)
    const canRecoverCsrf = error.status === 403 && error.code === 'CSRF_INVALID' &&
      isEmbeddedDocument() && options.csrf !== false && isReplayableBody(body) &&
      options.retryOnCsrf !== false
    if (canRecoverCsrf) {
      await refreshEmbeddedAuthContext()
      const refreshedCsrfToken = getCsrfToken()
      if (refreshedCsrfToken) requestOptions.headers.set('X-CSRF-Token', refreshedCsrfToken)
      else requestOptions.headers.delete('X-CSRF-Token')
      const retried = await requestApiResponse(buildApiUrl(path, options.query), requestOptions)
      response = retried.response
      payload = retried.payload
      if (response.ok && !(payload && Object.hasOwn(payload, 'code') && payload.code !== 0)) {
        return payload && Object.hasOwn(payload, 'result') ? payload.result : payload
      }
      error = apiErrorFromResponse(response, payload)
    }
    notifySessionExpired(error)
    throw error
  }
  return payload && Object.hasOwn(payload, 'result') ? payload.result : payload
}

export async function apiDownload (path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers || {})
  headers.set('Accept', options.accept || 'application/octet-stream')
  applyEmbeddedRequestContext(headers)
  if (shouldAttachCsrf(method) && options.csrf !== false) {
    const csrfToken = getCsrfToken()
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
  }
  const response = await fetch(buildApiUrl(path, options.query), {
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    signal: options.signal,
  })
  if (!response.ok) {
    const payload = await readResponsePayload(response)
    const error = apiErrorFromResponse(response, payload)
    notifySessionExpired(error)
    throw error
  }
  return {
    blob: await response.blob(),
    contentDisposition: response.headers.get('content-disposition') || '',
    contentType: response.headers.get('content-type') || '',
  }
}

export { API_BASE, CSRF_COOKIE_NAME, EMBEDDED_CSRF_COOKIE_NAME }
