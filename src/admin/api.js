const API_BASE = '/api/v1'
const TOKEN_KEY = 'mapServiceAdminToken'

export function getAdminToken () {
  return window.localStorage.getItem(TOKEN_KEY) || ''
}

export function setAdminToken (token) {
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token)
  } else {
    window.localStorage.removeItem(TOKEN_KEY)
  }
}

async function request (path, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (options.auth !== false) {
    const token = getAdminToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  const response = await window.fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.code !== 0) {
    const message = payload?.error?.message || response.statusText || '请求失败'
    const err = new Error(message)
    err.status = response.status
    throw err
  }

  return payload.result
}

export async function loginAdmin (credentials) {
  const result = await request('/admin/auth/login', {
    method: 'POST',
    auth: false,
    body: credentials,
  })
  setAdminToken(result.token)
  return result
}

export function logoutAdmin () {
  setAdminToken('')
}

export const adminApi = {
  session: () => request('/admin/session'),
  system: () => request('/admin/system'),
  cache: () => request('/admin/cache'),
  clearCache: () => request('/admin/cache', { method: 'DELETE' }),
  visits: () => request('/admin/visits'),
  settings: () => request('/admin/settings'),
  updateSettings: (body) => request('/admin/settings', { method: 'PUT', body }),
  providers: () => request('/admin/precache/providers'),
  tasks: () => request('/admin/precache/tasks'),
  createTask: (body) => request('/admin/precache/tasks', { method: 'POST', body }),
}

export async function getAccessStatus () {
  return request('/access/status', { auth: false })
}

export async function verifyAccessPassword (password) {
  return request('/access/verify', {
    method: 'POST',
    auth: false,
    body: { password },
  })
}
