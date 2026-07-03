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
    if (typeof window !== 'undefined' && options.body instanceof window.FormData) {
      // Browser automatically sets boundary, do not set Content-Type
    } else {
      headers['Content-Type'] = 'application/json'
    }
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
    body: options.body === undefined ? undefined : (typeof window !== 'undefined' && options.body instanceof window.FormData ? options.body : JSON.stringify(options.body)),
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
  clearCache: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/admin/cache${qs ? `?${qs}` : ''}`, { method: 'DELETE' })
  },
  visits: () => request('/admin/visits'),
  settings: () => request('/admin/settings'),
  updateSettings: (body) => request('/admin/settings', { method: 'PUT', body }),
  updatePassword: (body) => request('/admin/auth/password', { method: 'POST', body }),
  precacheCatalog: () => request('/admin/precache/catalog'),
  tasks: () => request('/admin/precache/tasks'),
  estimateTask: (body) => request('/admin/precache/estimate', { method: 'POST', body }),
  createTask: (body) => request('/admin/precache/tasks', { method: 'POST', body }),
  pauseTask: (taskId) => request(`/admin/precache/tasks/${encodeURIComponent(taskId)}/pause`, { method: 'POST' }),
  resumeTask: (taskId) => request(`/admin/precache/tasks/${encodeURIComponent(taskId)}/resume`, { method: 'POST' }),
  deleteTask: (taskId, options = {}) => {
    const params = new URLSearchParams()
    if (options.deleteCache) {
      params.set('deleteCache', 'true')
    }
    const query = params.toString()
    return request(`/admin/precache/tasks/${encodeURIComponent(taskId)}${query ? `?${query}` : ''}`, { method: 'DELETE' })
  },
  kmls: () => request('/admin/kml'),
  getKml: (id) => request(`/admin/kml/${encodeURIComponent(id)}`),
  createKml: (body) => request('/admin/kml', { method: 'POST', body }),
  updateKml: (id, body) => request(`/admin/kml/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteKml: (id) => request(`/admin/kml/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  importKml: (formData) => request('/admin/kml/import', { method: 'POST', body: formData }),
  // 图源管理 API
  listTileSources: () => request('/admin/tile-sources'),
  createTileSource: (body) => request('/admin/tile-sources', { method: 'POST', body }),
  getTileSource: (id) => request(`/admin/tile-sources/${encodeURIComponent(id)}`),
  updateTileSource: (id, body) => request(`/admin/tile-sources/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteTileSource: (id) => request(`/admin/tile-sources/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testTileSource: (id) => request(`/admin/tile-sources/${encodeURIComponent(id)}/test`, { method: 'POST' }),

  // 图层组合 API
  listMapLayers: () => request('/admin/map-layers'),
  createMapLayer: (body) => request('/admin/map-layers', { method: 'POST', body }),
  updateMapLayer: (id, body) => request(`/admin/map-layers/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteMapLayer: (id) => request(`/admin/map-layers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setDefaultMapLayer: (id) => request('/admin/map-layers-default', { method: 'PUT', body: { id } }),

  // 代理出口 API
  listProxyOutbounds: () => request('/admin/proxy-outbounds'),
  createProxyOutbound: (body) => request('/admin/proxy-outbounds', { method: 'POST', body }),
  updateProxyOutbound: (id, body) => request(`/admin/proxy-outbounds/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteProxyOutbound: (id) => request(`/admin/proxy-outbounds/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testProxyOutbound: (id) => request(`/admin/proxy-outbounds/${encodeURIComponent(id)}/test`, { method: 'POST' }),

  // 代理池 API
  listProxyPools: () => request('/admin/proxy-pools'),
  createProxyPool: (body) => request('/admin/proxy-pools', { method: 'POST', body }),
  updateProxyPool: (id, body) => request(`/admin/proxy-pools/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteProxyPool: (id) => request(`/admin/proxy-pools/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testProxyPool: (id) => request(`/admin/proxy-pools/${encodeURIComponent(id)}/test`, { method: 'POST' }),

  // 对外发布 API
  listExternalPublishes: () => request('/admin/external-publishes'),
  createExternalPublish: (body) => request('/admin/external-publishes', { method: 'POST', body }),
  updateExternalPublish: (id, body) => request(`/admin/external-publishes/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteExternalPublish: (id) => request(`/admin/external-publishes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  resetExternalPublishToken: (id) => request(`/admin/external-publishes/${encodeURIComponent(id)}/token`, { method: 'POST' }),
  testExternalPublish: (id) => request(`/admin/external-publishes/${encodeURIComponent(id)}/test`, { method: 'POST' }),
  listExternalPublishLogs: (id = '') => id
    ? request(`/admin/external-publishes/${encodeURIComponent(id)}/logs`)
    : request('/admin/external-publish-logs'),
  listSourceAccessLogs: (id = '') => id
    ? request(`/admin/tile-sources/${encodeURIComponent(id)}/access-logs`)
    : request('/admin/source-access-logs'),
}

export async function getSharedKmlList () {
  return request('/kml/shared', { auth: false })
}

export async function getSharedKml (id) {
  return request(`/kml/shared/${encodeURIComponent(id)}`, { auth: false })
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
