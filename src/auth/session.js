import { apiRequest } from './api.js'

const listeners = new Set()

let snapshot = {
  loaded: false,
  loading: false,
  authenticated: false,
  user: null,
  session: null,
  config: null,
  error: '',
}

function emit () {
  const next = getAuthSnapshot()
  listeners.forEach(listener => listener(next))
}

function setSnapshot (patch) {
  snapshot = { ...snapshot, ...patch }
  emit()
  return getAuthSnapshot()
}

export function normalizeSessionResult (result) {
  if (!result || result.authenticated === false || !result.user) {
    return { authenticated: false, user: null, session: null }
  }
  return {
    authenticated: true,
    user: result.user,
    session: result.session || {
      expiresAt: result.expiresAt || null,
    },
  }
}

export function getAuthSnapshot () {
  return {
    ...snapshot,
    user: snapshot.user ? { ...snapshot.user } : null,
    session: snapshot.session ? { ...snapshot.session } : null,
    config: snapshot.config ? { ...snapshot.config } : null,
  }
}

export function subscribeAuth (listener) {
  if (!(listener instanceof Function)) return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function loadAuthConfig () {
  const config = await apiRequest('/auth/config', { csrf: false })
  setSnapshot({ config })
  return config
}

export async function refreshAuthSession () {
  setSnapshot({ loading: true, error: '' })
  try {
    const result = normalizeSessionResult(await apiRequest('/auth/session', { csrf: false }))
    return setSnapshot({
      ...result,
      loaded: true,
      loading: false,
      error: '',
    })
  } catch (error) {
    if (error.status === 401) {
      return setSnapshot({
        authenticated: false,
        user: null,
        session: null,
        loaded: true,
        loading: false,
        error: '',
      })
    }
    setSnapshot({ loaded: true, loading: false, error: error.message })
    throw error
  }
}

export async function initializeAuth () {
  const results = await Promise.allSettled([
    loadAuthConfig(),
    refreshAuthSession(),
  ])
  const rejected = results.find(result => result.status === 'rejected')
  if (rejected && !snapshot.loaded) throw rejected.reason
  return getAuthSnapshot()
}

export async function login (credentials) {
  await apiRequest('/auth/login', {
    method: 'POST',
    body: credentials,
    csrf: false,
  })
  return refreshAuthSession()
}

export async function register (registration) {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: registration,
    csrf: false,
  })
}

export async function logout () {
  try {
    await apiRequest('/auth/logout', { method: 'POST' })
  } catch (error) {
    if (error.status !== 401 || error.code !== 'AUTH_REQUIRED') throw error
  }
  return setSnapshot({
    authenticated: false,
    user: null,
    session: null,
    loaded: true,
    loading: false,
    error: '',
  })
}

export function hasPermission (permission, auth = snapshot) {
  const permissions = auth?.user?.permissions || []
  if (permissions.includes(permission) || permissions.includes('system.super_admin')) return true
  if (permission === 'account.self.read' && permissions.includes('account.self.update')) return true
  if (permission === 'kml.own.read' && permissions.includes('kml.own.write')) return true
  if (permission === 'kml.any.read' && permissions.includes('kml.any.manage')) return true
  return false
}

if (typeof window !== 'undefined') {
  window.addEventListener('map-auth-session-expired', () => {
    setSnapshot({
      authenticated: false,
      user: null,
      session: null,
      loaded: true,
      loading: false,
      error: '登录已失效，请重新登录',
    })
  })
}
