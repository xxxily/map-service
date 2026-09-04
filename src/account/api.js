import { apiDownload, apiRequest } from '../auth/api.js'

function pathId (value) {
  return encodeURIComponent(String(value || ''))
}

export const accountApi = {
  getProfile: () => apiRequest('/users/me'),
  updateProfile: body => apiRequest('/users/me', { method: 'PUT', body }),
  listKml: query => apiRequest('/kml/files', { query }),
  listKmlDirectories: () => apiRequest('/kml/directories'),
  createKmlDirectory: body => apiRequest('/kml/directories', { method: 'POST', body }),
  updateKmlDirectory: (id, body) => apiRequest(`/kml/directories/${pathId(id)}`, { method: 'PUT', body }),
  deleteKmlDirectory: id => apiRequest(`/kml/directories/${pathId(id)}`, { method: 'DELETE' }),
  reorderKmlDirectories: ids => apiRequest('/kml/directories/reorder', { method: 'POST', body: { ids } }),
  setKmlDirectoryVisibility: (id, enabled) => apiRequest(`/kml/directories/${id == null ? 'uncategorized' : pathId(id)}/visibility`, {
    method: 'POST',
    body: { enabled },
  }),
  createKml: body => apiRequest('/kml/files', { method: 'POST', body }),
  getKml: id => apiRequest(`/kml/files/${pathId(id)}`),
  updateKml: (id, body) => apiRequest(`/kml/files/${pathId(id)}`, { method: 'PUT', body }),
  trashKml: id => apiRequest(`/kml/files/${pathId(id)}`, { method: 'DELETE' }),
  restoreKml: id => apiRequest(`/kml/files/${pathId(id)}/restore`, { method: 'POST' }),
  deleteKmlPermanently: (id, password) => apiRequest(`/kml/files/${pathId(id)}/permanent`, { method: 'DELETE', body: { password } }),
  moveKml: (id, body) => apiRequest(`/kml/files/${pathId(id)}/move`, { method: 'POST', body }),
  batchMoveKml: body => apiRequest('/kml/files/batch-move', { method: 'POST', body }),
  reorderKml: body => apiRequest('/kml/files/reorder', { method: 'POST', body }),
  importKml: (file, options = {}) => {
    const formData = new FormData()
    formData.set('file', file, file.name)
    if (options.coordCorrection) formData.set('coordCorrection', options.coordCorrection)
    return apiRequest('/kml/import', { method: 'POST', body: formData })
  },
  importTwoBuluBrowserHelperKml: body => apiRequest('/kml/import/2bulu/browser-helper', { method: 'POST', body }),
  exportKml: id => apiDownload(`/kml/files/${pathId(id)}/export`, {
    accept: 'application/vnd.google-earth.kml+xml',
  }),
  migrateLocalKml: body => apiRequest('/kml/migrations/local', { method: 'POST', body }),
  listFavorites: query => apiRequest('/favorites', { query }),
  listResourceCollections: query => apiRequest('/resource-collections', { query }),
  createResourceCollection: body => apiRequest('/resource-collections', { method: 'POST', body }),
  getResourceCollection: id => apiRequest(`/resource-collections/${pathId(id)}`),
  updateResourceCollection: (id, body) => apiRequest(`/resource-collections/${pathId(id)}`, { method: 'PUT', body }),
  trashResourceCollection: id => apiRequest(`/resource-collections/${pathId(id)}`, { method: 'DELETE' }),
  restoreResourceCollection: id => apiRequest(`/resource-collections/${pathId(id)}/restore`, { method: 'POST' }),
  permanentlyDeleteResourceCollection: (id, password) => apiRequest(`/resource-collections/${pathId(id)}/permanent`, { method: 'DELETE', body: { password } }),
  listResourceCollectionItems: (id, query) => apiRequest(`/resource-collections/${pathId(id)}/items`, { query }),
  createResourceCollectionItem: (id, body) => apiRequest(`/resource-collections/${pathId(id)}/items`, { method: 'POST', body }),
  batchResourceCollectionItems: (id, body) => apiRequest(`/resource-collections/${pathId(id)}/items/batch`, { method: 'POST', body }),
  updateResourceCollectionItem: (id, itemId, body) => apiRequest(`/resource-collections/${pathId(id)}/items/${pathId(itemId)}`, { method: 'PUT', body }),
  deleteResourceCollectionItem: (id, itemId, body = {}) => apiRequest(`/resource-collections/${pathId(id)}/items/${pathId(itemId)}`, { method: 'DELETE', body }),
  reorderResourceCollectionItems: (id, body) => apiRequest(`/resource-collections/${pathId(id)}/items/reorder`, { method: 'POST', body }),
  listResourceCollectionReferences: (id, query, options = {}) => apiRequest(`/resource-collections/${pathId(id)}/references`, { ...options, query }),
  createFavorite: body => apiRequest('/favorites', { method: 'POST', body }),
  updateFavorite: (id, body) => apiRequest(`/favorites/${pathId(id)}`, { method: 'PUT', body }),
  deleteFavorite: id => apiRequest(`/favorites/${pathId(id)}`, { method: 'DELETE' }),
  listShares: query => apiRequest('/kml/shares', { query }),
  listShareAccessEvents: (id, query) => apiRequest(`/kml/shares/${pathId(id)}/access-events`, { query }),
  getSharePasswordDetails: id => apiRequest(`/kml/shares/${pathId(id)}/password-url`, { method: 'POST' }),
  spatialPreview: body => apiRequest('/kml/shares/spatial-preview', { method: 'POST', body }),
  getShare: id => apiRequest(`/kml/shares/${pathId(id)}`),
  createShare: body => apiRequest('/kml/shares', { method: 'POST', body }),
  updateShare: (id, body) => apiRequest(`/kml/shares/${pathId(id)}`, { method: 'PUT', body }),
  deleteShare: id => apiRequest(`/kml/shares/${pathId(id)}`, { method: 'DELETE' }),
  syncShare: (id, body) => apiRequest(`/kml/shares/${pathId(id)}/sync`, { method: 'POST', body }),
  pauseShare: id => apiRequest(`/kml/shares/${pathId(id)}/pause`, { method: 'POST' }),
  resumeShare: id => apiRequest(`/kml/shares/${pathId(id)}/resume`, { method: 'POST' }),
  rotateShareLink: id => apiRequest(`/kml/shares/${pathId(id)}/rotate-link`, { method: 'POST' }),
  revokeShare: id => apiRequest(`/kml/shares/${pathId(id)}/revoke`, { method: 'POST' }),
  reauthenticate: password => apiRequest('/auth/reauth', { method: 'POST', body: { password } }),
  changePassword: body => apiRequest('/auth/password', { method: 'POST', body }),
  listSessions: () => apiRequest('/auth/sessions'),
  revokeSession: id => apiRequest(`/auth/sessions/${pathId(id)}`, { method: 'DELETE' }),
  logoutAll: keepCurrent => apiRequest('/auth/logout-all', { method: 'POST', body: { keepCurrent } }),
}

export function saveDownload (download, fallbackName = 'map.kml') {
  const matched = download.contentDisposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
  let filename = fallbackName
  if (matched?.[1]) {
    try {
      filename = decodeURIComponent(matched[1])
    } catch {
      filename = matched[1]
    }
  }
  const url = URL.createObjectURL(download.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.hidden = true
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
