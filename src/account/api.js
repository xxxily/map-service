import { apiDownload, apiRequest } from '../auth/api.js'

function pathId (value) {
  return encodeURIComponent(String(value || ''))
}

export const accountApi = {
  getProfile: () => apiRequest('/users/me'),
  updateProfile: body => apiRequest('/users/me', { method: 'PUT', body }),
  listKml: query => apiRequest('/kml/files', { query }),
  createKml: body => apiRequest('/kml/files', { method: 'POST', body }),
  getKml: id => apiRequest(`/kml/files/${pathId(id)}`),
  updateKml: (id, body) => apiRequest(`/kml/files/${pathId(id)}`, { method: 'PUT', body }),
  trashKml: id => apiRequest(`/kml/files/${pathId(id)}`, { method: 'DELETE' }),
  restoreKml: id => apiRequest(`/kml/files/${pathId(id)}/restore`, { method: 'POST' }),
  deleteKmlPermanently: id => apiRequest(`/kml/files/${pathId(id)}/permanent`, { method: 'DELETE' }),
  importKml: (file, options = {}) => {
    const formData = new FormData()
    formData.set('file', file, file.name)
    if (options.coordCorrection) formData.set('coordCorrection', options.coordCorrection)
    return apiRequest('/kml/import', { method: 'POST', body: formData })
  },
  exportKml: id => apiDownload(`/kml/files/${pathId(id)}/export`, {
    accept: 'application/vnd.google-earth.kml+xml',
  }),
  migrateLocalKml: body => apiRequest('/kml/migrations/local', { method: 'POST', body }),
  listFavorites: query => apiRequest('/favorites', { query }),
  createFavorite: body => apiRequest('/favorites', { method: 'POST', body }),
  updateFavorite: (id, body) => apiRequest(`/favorites/${pathId(id)}`, { method: 'PUT', body }),
  deleteFavorite: id => apiRequest(`/favorites/${pathId(id)}`, { method: 'DELETE' }),
  listShares: query => apiRequest('/kml/shares', { query }),
  getShare: id => apiRequest(`/kml/shares/${pathId(id)}`),
  createShare: body => apiRequest('/kml/shares', { method: 'POST', body }),
  updateShare: (id, body) => apiRequest(`/kml/shares/${pathId(id)}`, { method: 'PUT', body }),
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
