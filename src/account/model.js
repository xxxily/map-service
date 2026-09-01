const ACCOUNT_TABS = new Set(['profile', 'kml', 'favorites', 'shares', 'security'])
const KML_SORT_FIELDS = new Set(['updatedAt', 'createdAt', 'name', 'featureCount', 'position'])
const DEFAULT_KML_POINT_CLUSTERING = Object.freeze({
  enabled: false,
  minZoom: 0,
  maxClusterZoom: 13,
  gridSize: 64,
  minClusterPoints: 2,
  maxMembersPerCluster: 5000,
})

export function isAccountLocation (locationLike) {
  const pathname = typeof locationLike === 'string'
    ? locationLike
    : locationLike?.pathname
  return pathname === '/account' || String(pathname || '').startsWith('/account/')
}

function userHasPermission (user, permission) {
  const permissions = user?.permissions || []
  if (permissions.includes('system.super_admin') || permissions.includes(permission)) return true
  if (permission === 'account.self.read' && permissions.includes('account.self.update')) return true
  if (permission === 'kml.own.read' && permissions.includes('kml.own.write')) return true
  return false
}

export function getAccountCapabilities (user) {
  return {
    canReadProfile: userHasPermission(user, 'account.self.read'),
    canUpdateProfile: userHasPermission(user, 'account.self.update'),
    canReadKml: userHasPermission(user, 'kml.own.read'),
    canWriteKml: userHasPermission(user, 'kml.own.write'),
    canManageShares: userHasPermission(user, 'share.own.manage'),
    canManageFavorites: userHasPermission(user, 'favorite.own.manage'),
    canManageSessions: userHasPermission(user, 'session.self.manage'),
    canAccessSecurity: Boolean(user),
  }
}

export function getAvailableAccountTabs (user) {
  const capabilities = getAccountCapabilities(user)
  return [
    capabilities.canReadProfile && 'profile',
    capabilities.canReadKml && 'kml',
    capabilities.canManageFavorites && 'favorites',
    capabilities.canManageShares && 'shares',
    capabilities.canAccessSecurity && 'security',
  ].filter(Boolean)
}

export function normalizeAccountTab (value, user = null) {
  const tab = String(value || '').replace(/^#/, '')
  const normalized = ACCOUNT_TABS.has(tab) ? tab : 'profile'
  if (!user) return normalized
  const available = getAvailableAccountTabs(user)
  return available.includes(normalized) ? normalized : (available[0] || 'security')
}

export function sanitizeReturnTo (value, fallback = '/') {
  const target = String(value || '')
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return fallback
  try {
    const parsed = new URL(target, 'https://map.local')
    if (parsed.origin !== 'https://map.local') return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

export function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function formatDateTime (value) {
  const date = new Date(value || '')
  if (!Number.isFinite(date.getTime())) return '未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatBytes (value) {
  const bytes = Math.max(0, Number(value || 0))
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function normalizePagedResult (result) {
  if (Array.isArray(result)) {
    return { items: result, page: 1, limit: result.length || 20, total: result.length }
  }
  return {
    ...(result || {}),
    items: Array.isArray(result?.items) ? result.items : [],
    page: Number(result?.page || 1),
    limit: Number(result?.limit || 20),
    total: Number(result?.total || 0),
  }
}

export function normalizeCompletePagedResult (result, options = {}) {
  const requestedPage = Number(options.page || 1)
  const requestedLimit = Number(options.limit || 100)
  const fail = message => {
    throw Object.assign(new Error(message), { code: 'KML_LIST_INCOMPLETE' })
  }
  if (!result || typeof result !== 'object' || Array.isArray(result) || !Array.isArray(result.items)) {
    fail('KML 文件列表响应不完整，已停止加载')
  }
  const total = Number(result.total)
  const page = Number(result.page ?? requestedPage)
  const limit = Number(result.limit ?? requestedLimit)
  if (!Number.isSafeInteger(total) || total < 0 || page !== requestedPage || limit !== requestedLimit) {
    fail('KML 文件列表分页参数不正确，已停止加载')
  }
  if (result.items.length > requestedLimit || result.items.length > total) {
    fail('KML 文件列表条目数量不正确，已停止加载')
  }
  if (result.items.some(item => !item || typeof item !== 'object' || !String(item.id || ''))) {
    fail('KML 文件列表包含无效文件，已停止加载')
  }
  return { ...result, items: result.items, page, limit, total }
}

export async function loadCompleteKmlPages (requestPage, options = {}) {
  const limit = Number(options.limit || 100)
  const maxPages = Number(options.maxPages || 1000)
  if (!(requestPage instanceof Function) || !Number.isSafeInteger(limit) || limit < 1 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw Object.assign(new Error('KML 文件分页加载参数不正确'), { code: 'KML_LIST_INCOMPLETE' })
  }
  const items = []
  const seenIds = new Set()
  let total = null
  let usage = {}
  for (let page = 1; page <= maxPages; page += 1) {
    const result = normalizeCompletePagedResult(await requestPage({ page, limit }), { page, limit })
    if (total === null) total = result.total
    if (result.total !== total) {
      throw Object.assign(new Error('KML 文件列表在加载期间发生变化，已停止加载'), { code: 'KML_LIST_CHANGED' })
    }
    const expectedCount = Math.min(limit, total - items.length)
    if (result.items.length !== expectedCount) {
      throw Object.assign(new Error('KML 文件列表分页不完整，已停止加载'), { code: 'KML_LIST_INCOMPLETE' })
    }
    for (const item of result.items) {
      const id = String(item.id)
      if (seenIds.has(id)) {
        throw Object.assign(new Error('KML 文件列表包含重复文件，已停止加载'), { code: 'KML_LIST_INCOMPLETE' })
      }
      seenIds.add(id)
    }
    items.push(...result.items)
    usage = result.usage || usage
    if (items.length === total) {
      return { items, page: 1, limit: items.length || limit, total, usage }
    }
  }
  throw Object.assign(new Error('KML 文件列表分页不完整，已停止加载'), { code: 'KML_LIST_INCOMPLETE' })
}

export function registrationEnabled (config) {
  return config?.registration?.enabled === true || config?.registration?.mode === 'open'
}

export function buildShareItems (selectedIds, documents) {
  const selected = new Set(Array.from(selectedIds || [], String))
  return (documents || [])
    .filter(document => selected.has(String(document.id)) && document.status === 'active')
    .map((document, position) => ({
      kmlId: document.id,
      position,
      visibleByDefault: document.enabled !== false,
    }))
}

export function normalizeKmlDirectoryCatalog (value = {}) {
  const items = Array.isArray(value?.items) ? value.items : []
  const normalizedItems = items
    .filter(item => item?.id)
    .map((item, index) => ({
      ...item,
      id: String(item.id),
      name: String(item.name || '未命名目录'),
      position: Number.isFinite(Number(item.position)) ? Number(item.position) : index,
    }))
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, 'zh-CN'))
  return {
    items: normalizedItems,
    uncategorized: {
      ...(value?.uncategorized || {}),
      id: null,
      name: String(value?.uncategorized?.name || '未分类'),
      position: normalizedItems.length,
    },
  }
}

export function groupKmlDocumentsByDirectory (documents, directoryCatalog = {}) {
  const catalog = normalizeKmlDirectoryCatalog(directoryCatalog)
  const groups = [
    ...catalog.items.map(directory => ({ ...directory, items: [] })),
    { ...catalog.uncategorized, items: [] },
  ]
  const byId = new Map(groups.map(group => [String(group.id || ''), group]))
  for (const document of documents || []) {
    const directoryId = document?.directoryId == null ? '' : String(document.directoryId)
    let group = byId.get(directoryId)
    if (!group) {
      group = {
        id: directoryId || null,
        name: String(document?.directoryName || (directoryId ? '未命名目录' : '未分类')),
        position: groups.length,
        items: [],
      }
      groups.push(group)
      byId.set(directoryId, group)
    }
    group.items.push(document)
  }
  groups.forEach(group => group.items.sort((left, right) => (
    Number(left?.position || 0) - Number(right?.position || 0) ||
    String(left?.name || '').localeCompare(String(right?.name || ''), 'zh-CN') ||
    String(left?.id || '').localeCompare(String(right?.id || ''))
  )))
  groups.forEach(group => {
    const activeItems = group.items.filter(item => item?.status === 'active')
    const visibleCount = activeItems.filter(item => item.enabled !== false).length
    group.activeFileCount = activeItems.length
    group.visibleFileCount = visibleCount
    group.visibilityState = activeItems.length === 0 || visibleCount === activeItems.length
      ? 'visible'
      : visibleCount === 0 ? 'hidden' : 'mixed'
  })
  return groups
}

export function selectedActiveKmlIdsInDisplayOrder (selectedIds, documents, directoryCatalog = {}) {
  const selected = new Set(Array.from(selectedIds || [], String))
  return groupKmlDocumentsByDirectory(documents, directoryCatalog)
    .flatMap(group => group.items)
    .filter(document => document?.status === 'active' && selected.has(String(document.id || '')))
    .map(document => String(document.id))
}

export function normalizeKmlSort (sort, order) {
  return {
    sort: KML_SORT_FIELDS.has(String(sort || '')) ? String(sort) : 'updatedAt',
    order: String(order || '').toLowerCase() === 'asc' ? 'asc' : 'desc',
  }
}

export function partitionKmlTrashSelection (selectedIds, documents) {
  const selected = new Set(Array.from(selectedIds || [], String))
  const eligible = []
  const skippedDefault = []
  const skippedInactive = []
  const seen = new Set()

  Array.from(documents || []).forEach(document => {
    const id = String(document?.id || '')
    if (!id || !selected.has(id)) return
    seen.add(id)
    if (document.isDefault) skippedDefault.push(document)
    else if (document.status !== 'active') skippedInactive.push(document)
    else eligible.push(document)
  })

  return {
    eligible,
    skippedDefault,
    skippedInactive,
    skippedMissing: Array.from(selected).filter(id => !seen.has(id)),
  }
}

export function buildShareUpdateItems (items) {
  const seen = new Set()
  return (items || []).flatMap(item => {
    const kmlId = String(item?.kmlId || '')
    if (!kmlId || seen.has(kmlId)) return []
    seen.add(kmlId)
    return [{
      kmlId,
      visibleByDefault: item.visibleByDefault !== false,
      displayName: String(item.displayName || '').slice(0, 200),
    }]
  }).map((item, position) => ({ ...item, position }))
}

export function buildShareViewConfig (input = {}, fallback = {}) {
  const current = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : {}
  const result = {}
  const mapMode = String(input.mapMode ?? current.mapMode ?? '2d')
  if (!['2d', '3d'].includes(mapMode)) throw new Error('地图模式只支持 2D 或 3D')
  result.mapMode = mapMode

  const center = input.center === undefined ? current.center : input.center
  if (center !== undefined && center !== null && center !== '') {
    if (!Array.isArray(center) || center.length !== 2) throw new Error('地图中心需同时填写纬度和经度')
    const latitude = Number(center[0])
    const longitude = Number(center[1])
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error('地图中心必须是有效的纬度和经度')
    }
    result.center = [latitude, longitude]
  }

  const numberFields = [
    ['zoom', 0, 24, '缩放级别需在 0～24 之间'],
    ['bearing', -360, 360, '旋转角度需在 -360～360 之间'],
    ['pitch', 0, 85, '俯仰角需在 0～85 之间'],
  ]
  numberFields.forEach(([name, minimum, maximum, message]) => {
    const rawValue = input[name] === undefined ? current[name] : input[name]
    if (rawValue === undefined || rawValue === null || rawValue === '') return
    const value = Number(rawValue)
    if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(message)
    result[name] = value
  })

  if (typeof current.layerId === 'string' && current.layerId) result.layerId = current.layerId
  if (typeof current.showOwnerDisplayName === 'boolean') result.showOwnerDisplayName = current.showOwnerDisplayName
  const clusteringInput = input.kmlPointClustering === undefined
    ? current.kmlPointClustering
    : input.kmlPointClustering
  if (clusteringInput !== undefined) {
    const clustering = clusteringInput && typeof clusteringInput === 'object' && !Array.isArray(clusteringInput)
      ? clusteringInput
      : {}
    if (clustering.enabled !== true) {
      result.kmlPointClustering = { enabled: false }
    } else {
      const integer = (name, minimum, maximum, message) => {
        const value = Number(clustering[name] ?? DEFAULT_KML_POINT_CLUSTERING[name])
        if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(message)
        return value
      }
      const minZoom = integer('minZoom', 0, 24, '聚合起始级别需为 0～24 的整数')
      const maxClusterZoom = integer('maxClusterZoom', 0, 24, '聚合结束级别需为 0～24 的整数')
      if (minZoom > maxClusterZoom) throw new Error('聚合起始级别不能高于结束级别')
      result.kmlPointClustering = {
        enabled: true,
        minZoom,
        maxClusterZoom,
        gridSize: integer('gridSize', 24, 128, '聚合网格需为 24～128 像素的整数'),
        minClusterPoints: integer('minClusterPoints', 2, 1000, '强制聚合最少点位数需为 2～1000 的整数'),
        maxMembersPerCluster: integer('maxMembersPerCluster', 100, 20000, '聚合成员上限需为 100～20000 的整数'),
      }
    }
  }
  return result
}

export function parseLocalKmlFiles (rawValue) {
  let source
  try {
    source = JSON.parse(String(rawValue || '[]'))
  } catch {
    return { files: [], invalidCount: 1 }
  }
  if (!Array.isArray(source)) return { files: [], invalidCount: 1 }

  let invalidCount = 0
  const files = source.slice(0, 100).flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      invalidCount += 1
      return []
    }
    const features = Array.isArray(item.features) ? item.features : []
    return [{
      id: String(item.id || `local-${index + 1}`),
      name: String(item.name || '本地 KML').slice(0, 200),
      description: String(item.description || '').slice(0, 5000),
      isDefault: item.isDefault === true || item.id === 'default-kml',
      theme: String(item.theme || 'default'),
      color: String(item.color || '#0f766e'),
      coordCorrection: String(item.coordCorrection || 'wgs84-to-gcj02'),
      lockDrag: item.lockDrag === true,
      enabled: item.enabled !== false,
      isLiveTrack: item.isLiveTrack === true,
      features,
    }]
  })
  invalidCount += Math.max(0, source.length - 100)
  return { files, invalidCount }
}

export function parseTags (value) {
  return Array.from(new Set(String(value || '')
    .split(/[,，]/)
    .map(item => item.trim())
    .filter(Boolean)))
    .slice(0, 20)
}

export function shareStatusLabel (status) {
  return {
    active: '分享中',
    paused: '已暂停',
    expired: '已过期',
    revoked: '已撤销',
    blocked: '已封禁',
  }[status] || String(status || '未知')
}

export function shareAccessPolicyLabel (share) {
  const accessMode = {
    public_link: '公开链接',
    inherit_site_access: '继承站点访问',
  }[share?.accessMode] || String(share?.accessMode || '公开链接')
  return share?.passwordProtected ? `${accessMode}（密码保护）` : `${accessMode}（无需密码）`
}

export function spatialAccessLabel (share) {
  return share?.spatialAccess?.mode === 'kml_bounds' || share?.spatialAccessMode === 'kml_bounds'
    ? '限制在 KML 区域'
    : '不限制'
}

export function spatialStatusLabel (share) {
  const status = share?.spatialAccess?.status || share?.spatialStatus || ''
  return {
    ready: '正常',
    recalculating: '重新计算中',
    out_of_policy: '超出策略',
    empty: '无有效几何',
    error: '计算失败',
  }[status] || (share?.spatialAccess?.mode === 'kml_bounds' || share?.spatialAccessMode === 'kml_bounds' ? '未知' : '不适用')
}

export function passwordAccessLabel (share) {
  if (!share?.passwordProtected) return '不适用'
  const mode = share?.passwordAccess?.ttlMode || share?.passwordAccessTtlMode
  return mode === 'unlimited' ? '不限固定期限' : '有限期'
}

function optionalFiniteNumber (value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function normalizeSpatialAccess (share = {}) {
  const spatial = share.spatialAccess && typeof share.spatialAccess === 'object' ? share.spatialAccess : {}
  const mode = spatial.mode || share.spatialAccessMode || 'unrestricted'
  return {
    mode: mode === 'kml_bounds' ? 'kml_bounds' : 'unrestricted',
    status: spatial.status || share.spatialStatus || (mode === 'kml_bounds' ? 'recalculating' : 'ready'),
    version: mode === 'kml_bounds' ? optionalFiniteNumber(spatial.version) : null,
    geometryType: mode === 'kml_bounds' ? (spatial.geometryType || null) : null,
    bbox: Array.isArray(spatial.bbox) ? spatial.bbox : null,
    areaKm2: optionalFiniteNumber(spatial.areaKm2),
    diagonalKm: optionalFiniteNumber(spatial.diagonalKm),
    paddingMeters: optionalFiniteNumber(spatial.paddingMeters),
    minZoom: optionalFiniteNumber(spatial.minZoom),
    unrestrictedTileMaxZoom: optionalFiniteNumber(spatial.unrestrictedTileMaxZoom),
    maxCameraHeight: optionalFiniteNumber(spatial.maxCameraHeight),
    displayGeometry: spatial.displayGeometry || null,
    revision: Number(spatial.revision || share.spatialScopeRevision || 0),
    unlimitedAccessEligible: spatial.unlimitedAccessEligible === true || share.unlimitedAccessEligible === true,
    reasonCode: spatial.reasonCode || share.spatialReasonCode || null,
  }
}

export function revisionConflictPrompt (code) {
  if (code === 'KML_REVISION_CONFLICT') {
    return {
      title: 'KML 版本冲突',
      message: '该 KML 已被其他客户端更新，系统没有覆盖服务器内容。是否立即重新加载 KML 列表？',
      success: 'KML 列表已重新加载，请重新编辑',
      resource: 'kml',
    }
  }
  if (code === 'SHARE_REVISION_CONFLICT') {
    return {
      title: '分享版本冲突',
      message: '该分享已被其他客户端更新，系统没有覆盖服务器内容。是否立即重新加载分享列表？',
      success: '分享列表已重新加载，请重新编辑',
      resource: 'shares',
    }
  }
  return null
}

export function kmlStatusLabel (status) {
  return status === 'trashed' ? '回收站' : '使用中'
}

export function hasAdminAccess (user) {
  const permissions = user?.permissions || []
  return permissions.includes('system.super_admin') || permissions.some(permission => permission.startsWith('admin.'))
}

export { ACCOUNT_TABS }
