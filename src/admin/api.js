import { apiRequest, getCsrfToken } from '../auth/api.js'

export { getCsrfToken }

export function clearAdminSessionState () {
  // 会话与 CSRF 均由服务端 Cookie 管理，后台没有需要清理的本地令牌。
}

export async function requestAdminApi (path, options = {}) {
  return apiRequest(path, options)
}

function queryString (params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })
  const value = query.toString()
  return value ? `?${value}` : ''
}

export async function loginAdmin (credentials) {
  clearAdminSessionState()
  return requestAdminApi('/admin/auth/login', {
    method: 'POST',
    csrf: false,
    body: credentials,
  })
}

export async function logoutAdmin () {
  try {
    return await requestAdminApi('/admin/auth/logout', { method: 'POST' })
  } finally {
    clearAdminSessionState()
  }
}

export const adminApi = {
  session: () => requestAdminApi('/admin/auth/session'),
  system: () => requestAdminApi('/admin/system'),
  cache: () => requestAdminApi('/admin/cache'),
  clearCache: (params = {}) => requestAdminApi(`/admin/cache${queryString(params)}`, { method: 'DELETE' }),
  visits: () => requestAdminApi('/admin/visits'),
  settings: () => requestAdminApi('/admin/settings'),
  updateSettings: (body) => requestAdminApi('/admin/settings', { method: 'PUT', body }),
  updatePassword: (body) => requestAdminApi('/auth/password', { method: 'POST', body }),
  reauthenticate: (password) => requestAdminApi('/auth/reauth', { method: 'POST', body: { password } }),
  precacheCatalog: () => requestAdminApi('/admin/precache/catalog'),
  tasks: () => requestAdminApi('/admin/precache/tasks'),
  estimateTask: (body) => requestAdminApi('/admin/precache/estimate', { method: 'POST', body }),
  createTask: (body) => requestAdminApi('/admin/precache/tasks', { method: 'POST', body }),
  pauseTask: (taskId) => requestAdminApi(`/admin/precache/tasks/${encodeURIComponent(taskId)}/pause`, { method: 'POST' }),
  resumeTask: (taskId) => requestAdminApi(`/admin/precache/tasks/${encodeURIComponent(taskId)}/resume`, { method: 'POST' }),
  deleteTask: (taskId, options = {}) => requestAdminApi(`/admin/precache/tasks/${encodeURIComponent(taskId)}${queryString({ deleteCache: options.deleteCache ? 'true' : '' })}`, { method: 'DELETE' }),
  kmls: () => requestAdminApi('/admin/kml'),
  getKml: (id) => requestAdminApi(`/admin/kml/${encodeURIComponent(id)}`),
  createKml: (body) => requestAdminApi('/admin/kml', { method: 'POST', body }),
  updateKml: (id, body) => requestAdminApi(`/admin/kml/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteKml: (id) => requestAdminApi(`/admin/kml/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  importKml: (formData) => requestAdminApi('/admin/kml/import', { method: 'POST', body: formData }),

  listTileSources: () => requestAdminApi('/admin/tile-sources'),
  createTileSource: (body) => requestAdminApi('/admin/tile-sources', { method: 'POST', body }),
  getTileSource: (id) => requestAdminApi(`/admin/tile-sources/${encodeURIComponent(id)}`),
  updateTileSource: (id, body) => requestAdminApi(`/admin/tile-sources/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteTileSource: (id) => requestAdminApi(`/admin/tile-sources/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testTileSource: (id) => requestAdminApi(`/admin/tile-sources/${encodeURIComponent(id)}/test`, { method: 'POST' }),
  listSourcePresets: () => requestAdminApi('/admin/source-presets'),
  createSourceFromPreset: (presetId, body) => requestAdminApi(`/admin/source-presets/${encodeURIComponent(presetId)}/create-source`, { method: 'POST', body }),

  listKeyPools: () => requestAdminApi('/admin/key-pools'),
  getKeyPool: (id) => requestAdminApi(`/admin/key-pools/${encodeURIComponent(id)}`),
  createKeyPool: (body) => requestAdminApi('/admin/key-pools', { method: 'POST', body }),
  updateKeyPool: (id, body) => requestAdminApi(`/admin/key-pools/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteKeyPool: (id) => requestAdminApi(`/admin/key-pools/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testKeyPool: (id) => requestAdminApi(`/admin/key-pools/${encodeURIComponent(id)}/test`, { method: 'POST' }),
  testKeyPoolKey: (poolId, keyId) => requestAdminApi(`/admin/key-pools/${encodeURIComponent(poolId)}/keys/${encodeURIComponent(keyId)}/test`, { method: 'POST' }),

  listMapLayers: () => requestAdminApi('/admin/map-layers'),
  createMapLayer: (body) => requestAdminApi('/admin/map-layers', { method: 'POST', body }),
  updateMapLayer: (id, body) => requestAdminApi(`/admin/map-layers/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteMapLayer: (id) => requestAdminApi(`/admin/map-layers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setDefaultMapLayer: (id) => requestAdminApi('/admin/map-layers-default', { method: 'PUT', body: { id } }),

  listProxyOutbounds: () => requestAdminApi('/admin/proxy-outbounds'),
  createProxyOutbound: (body) => requestAdminApi('/admin/proxy-outbounds', { method: 'POST', body }),
  updateProxyOutbound: (id, body) => requestAdminApi(`/admin/proxy-outbounds/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteProxyOutbound: (id) => requestAdminApi(`/admin/proxy-outbounds/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testProxyOutbound: (id) => requestAdminApi(`/admin/proxy-outbounds/${encodeURIComponent(id)}/test`, { method: 'POST' }),

  listProxyPools: () => requestAdminApi('/admin/proxy-pools'),
  createProxyPool: (body) => requestAdminApi('/admin/proxy-pools', { method: 'POST', body }),
  updateProxyPool: (id, body) => requestAdminApi(`/admin/proxy-pools/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteProxyPool: (id) => requestAdminApi(`/admin/proxy-pools/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  testProxyPool: (id) => requestAdminApi(`/admin/proxy-pools/${encodeURIComponent(id)}/test`, { method: 'POST' }),

  listExternalPublishes: () => requestAdminApi('/admin/external-publishes'),
  createExternalPublish: (body) => requestAdminApi('/admin/external-publishes', { method: 'POST', body }),
  updateExternalPublish: (id, body) => requestAdminApi(`/admin/external-publishes/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteExternalPublish: (id) => requestAdminApi(`/admin/external-publishes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  resetExternalPublishToken: (id) => requestAdminApi(`/admin/external-publishes/${encodeURIComponent(id)}/token`, { method: 'POST' }),
  testExternalPublish: (id) => requestAdminApi(`/admin/external-publishes/${encodeURIComponent(id)}/test`, { method: 'POST' }),
  listExternalPublishLogs: (id = '') => id
    ? requestAdminApi(`/admin/external-publishes/${encodeURIComponent(id)}/logs`)
    : requestAdminApi('/admin/external-publish-logs'),
  listSourceAccessLogs: (id = '') => id
    ? requestAdminApi(`/admin/tile-sources/${encodeURIComponent(id)}/access-logs`)
    : requestAdminApi('/admin/source-access-logs'),

  listUsers: (params = {}) => requestAdminApi(`/admin/users${queryString(params)}`),
  createUser: (body) => requestAdminApi('/admin/users', { method: 'POST', body }),
  getUser: (id) => requestAdminApi(`/admin/users/${encodeURIComponent(id)}`),
  updateUser: (id, body) => requestAdminApi(`/admin/users/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  updateUserRoles: (id, roles) => requestAdminApi(`/admin/users/${encodeURIComponent(id)}/roles`, { method: 'PUT', body: { roles } }),
  resetUserPassword: (id, body = {}) => requestAdminApi(`/admin/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', body }),
  revokeUserSessions: (id) => requestAdminApi(`/admin/users/${encodeURIComponent(id)}/revoke-sessions`, { method: 'POST' }),
  listRoles: () => requestAdminApi('/admin/roles'),
  createRole: (body) => requestAdminApi('/admin/roles', { method: 'POST', body }),
  updateRole: (id, body) => requestAdminApi(`/admin/roles/${encodeURIComponent(id)}`, { method: 'PUT', body }),
  deleteRole: (id) => requestAdminApi(`/admin/roles/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getUserSystemSettings: () => requestAdminApi('/admin/user-system/settings'),
  updateUserSystemSettings: (body) => requestAdminApi('/admin/user-system/settings', { method: 'PUT', body }),
  listUserShares: (params = {}) => requestAdminApi(`/admin/kml/shares${queryString(params)}`),
  blockUserShare: (id, reason) => requestAdminApi(`/admin/kml/shares/${encodeURIComponent(id)}/block`, { method: 'POST', body: { reason } }),
  unblockUserShare: (id) => requestAdminApi(`/admin/kml/shares/${encodeURIComponent(id)}/unblock`, { method: 'POST' }),
  listAuditLogs: (params = {}) => requestAdminApi(`/admin/audit-logs${queryString(params)}`),
}

export async function getSharedKmlList () {
  return requestAdminApi('/kml/shared')
}

export async function getSharedKml (id) {
  return requestAdminApi(`/kml/shared/${encodeURIComponent(id)}`)
}

export async function getAccessStatus () {
  return requestAdminApi('/access/status')
}

export async function verifyAccessPassword (password) {
  return requestAdminApi('/access/verify', {
    method: 'POST',
    csrf: false,
    body: { password },
  })
}
