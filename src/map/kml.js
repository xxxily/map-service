import L from 'leaflet'
import { showConfirm, showEditDialog, showAlert } from '../ui/dialog.js'
import { renderCustomSelect, renderCustomColorPicker, initCustomControlsListeners } from '../ui/controls.js'
import { gcj02ToWgs84, normalizeLongitude, wgs84ToGcj02Deep } from './coord-transform.js'
import { generateKmlText, parseKML } from './kml-format.js'
import {
  bindKmlFeaturePopupMediaActions,
  openKmlFeatureContentPanel,
  renderKmlFeaturePopupContent,
} from './kml-content-panel.js'
import { getKmlMediaListIcon, getKmlMediaMarkerDescriptor } from './kml-media-marker.js'
import {
  buildTrackSegments,
  getTrackDisplayFeatures,
  LIVE_TRACK_RENDER_LINE_POINT_LIMIT,
  LIVE_TRACK_RENDER_POINT_LIMIT,
  VIEWPORT_BUFFER_RATIO,
} from './location-track.js'
import { apiRequest } from '../auth/api.js'
import { getAuthSnapshot, hasPermission } from '../auth/session.js'
import {
  clearTwoBuluImportRequest,
  showTwoBuluImportDialog,
  twoBuluImportResultMessage,
} from '../ui/two-bulu-import-dialog.js'
import {
  finalizeTwoBuluImport,
  getTwoBuluHelperState,
  probeTwoBuluHelper,
  requestTwoBuluKml,
  subscribeTwoBuluHelper,
  TWO_BULU_HELPER_PROTOCOL_VERSION,
} from '../integrations/two-bulu-helper-bridge.js'
import {
  bindKmlAccountSyncStatus,
  initializeKmlAccountMode,
  isAccountKmlMode,
  isAccountKmlWritable,
  registerKmlAccountDocument,
  scheduleKmlAccountSync,
  suspendKmlAccountSync,
} from './kml-account-sync.js'
import {
  bindKmlAccountConflictRecovery,
  promptKmlAccountRecovery,
} from './kml-account-recovery-ui.js'
import { getActiveShare, loadActiveShareFiles } from './share-view.js'

// 辅助函数：从 Leaflet map 获取视口参数
function getViewportOptions2d (map) {
  if (!map || typeof map.getBounds !== 'function') return {}
  const bounds = map.getBounds()
  if (!bounds || !bounds.isValid()) return {}
  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()
  const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 16
  return { viewportBounds: { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng }, zoom }
}

const KML_STORAGE_KEY = 'map_kml_list'
const KML_LAST_TARGET_KEY = 'map_kml_last_target_id'
const KML_COORD_CORRECTION = 'wgs84-to-gcj02'
const KML_POINT_LABEL_MAX_LENGTH = 18
const DEFAULT_KML_ID = 'default-kml'
const DEFAULT_KML_NAME = '默认标注'
const LONG_PRESS_DELAY_MS = 650
const LONG_PRESS_MOVE_TOLERANCE = 10
let kmlList = []
let accountSessionExpiryBound = false
let kmlViewportRerenderTimer = null // KML 图层视口变化重渲染的 debounce timer
let mediaFeatureActivationTimer = null
let lastRenderedViewportBounds = null // 上次渲染时使用的视口边界（用于缓存跳过）
let lastRenderedZoom = null // 上次渲染时的缩放级别

/**
 * 检查当前视口是否仍在上次渲染的缓冲范围内，如果是则跳过重渲染。
 * 缓冲范围 = 上次视口 × VIEWPORT_BUFFER_RATIO。
 */
function isViewportWithinCache2d (bounds, zoom) {
  if (!lastRenderedViewportBounds || lastRenderedZoom === null) return false
  // 缩放级别变化超过 1 级需要重新渲染（LOD 分级不同）
  if (Math.abs(zoom - lastRenderedZoom) >= 1) return false
  const latRange = lastRenderedViewportBounds.north - lastRenderedViewportBounds.south
  const lngRange = lastRenderedViewportBounds.east - lastRenderedViewportBounds.west
  const latPad = latRange * (VIEWPORT_BUFFER_RATIO - 1) / 2
  const lngPad = lngRange * (VIEWPORT_BUFFER_RATIO - 1) / 2
  return bounds.south >= lastRenderedViewportBounds.south - latPad &&
         bounds.north <= lastRenderedViewportBounds.north + latPad &&
         bounds.west >= lastRenderedViewportBounds.west - lngPad &&
         bounds.east <= lastRenderedViewportBounds.east + lngPad
}

let publicKmlList = []
let isEditingPublicKml = false
let editingPublicKmlId = null
let editingPublicKml = null
let isPublicKmlDirty = false

const PUBLIC_PREFS_KEY = 'map_shared_kml_prefs'
let publicKmlPrefs = {}

function loadPublicPrefs () {
  try {
    publicKmlPrefs = JSON.parse(localStorage.getItem(PUBLIC_PREFS_KEY) || '{}')
  } catch (err) {
    publicKmlPrefs = {}
  }
}

function savePublicPrefs () {
  localStorage.setItem(PUBLIC_PREFS_KEY, JSON.stringify(publicKmlPrefs))
}

function getKmlTheme (kmlFile) {
  if (kmlFile.isPublic) {
    return publicKmlPrefs[kmlFile.id + '_theme'] || kmlFile.theme || 'default'
  }
  return kmlFile.theme || 'default'
}

function getKmlColor (kmlFile) {
  if (kmlFile.isPublic) {
    return publicKmlPrefs[kmlFile.id + '_color'] || kmlFile.color || '#0f766e'
  }
  return kmlFile.color || '#0f766e'
}

function isAdminLoggedIn () {
  return hasPermission('admin.public_kml.manage', getAuthSnapshot())
}

function canWritePersonalKml () {
  return !isAccountKmlMode() || isAccountKmlWritable()
}

function canImportTwoBuluKml () {
  const auth = getAuthSnapshot()
  return Boolean(
    auth.authenticated &&
    isAccountKmlWritable() &&
    hasPermission('kml.own.write', auth) &&
    getTwoBuluHelperState().available
  )
}

function canManagePersonalShares () {
  return isAccountKmlMode() && hasPermission('share.own.manage', getAuthSnapshot())
}

function isKmlEditable (kmlFile) {
  if (!kmlFile) return false
  if (kmlFile.isPublic) {
    return isEditingPublicKml && editingPublicKmlId === kmlFile.id
  }
  return canWritePersonalKml()
}

function saveKmlChanges (kmlFile) {
  if (kmlFile.isPublic) {
    isPublicKmlDirty = true
  } else if (canWritePersonalKml()) {
    saveToStorage()
  }
}

async function loadPublicKmls (map) {
  loadPublicPrefs()
  try {
    const list = await window.fetch('/api/v1/kml/shared').then(res => res.json()).then(payload => payload.result || [])
    
    const oldPublicKmls = new Map(publicKmlList.map(k => [k.id, k]))
    
    publicKmlList = list.map(kml => {
      const oldKml = oldPublicKmls.get(kml.id)
      return {
        ...kml,
        isPublic: true,
        enabled: Boolean(publicKmlPrefs[kml.id]),
        features: oldKml ? oldKml.features : [],
      }
    })

    await Promise.all(publicKmlList.map(async kml => {
      if (kml.enabled && (!kml.features || kml.features.length === 0)) {
        try {
          const detail = await window.fetch(`/api/v1/kml/shared/${kml.id}`).then(res => res.json()).then(payload => payload.result)
          kml.features = detail.features || []
          renderKmlLayers(map, kml)
        } catch (err) {
          console.error(`Failed to load public KML detail for ${kml.id}`, err)
        }
      }
    }))
  } catch (err) {
    console.error('Failed to load public KML list', err)
  }
}

async function checkPublicKmlEditMode (map) {
  const params = new URLSearchParams(window.location.search)
  const editId = params.get('editPublicKml')
  if (!editId) return

  if (!isAdminLoggedIn()) {
    showAlert('您未登录管理员，无法编辑公共 KML 图层')
    return
  }

  try {
    const detail = await apiRequest(`/admin/kml/${encodeURIComponent(editId)}`)

    isEditingPublicKml = true
    editingPublicKmlId = editId
    editingPublicKml = {
      ...detail,
      isPublic: true,
      enabled: true
    }
    isPublicKmlDirty = false

    const existing = publicKmlList.find(k => k.id === editId)
    if (existing) {
      existing.enabled = true
      existing.features = editingPublicKml.features
    } else {
      publicKmlList.push(editingPublicKml)
    }

    renderKmlLayers(map, editingPublicKml)
    updateKmlPanelUI(map)
    showEditingBanner(map)
  } catch (err) {
    showAlert(`加载公共 KML 编辑数据失败: ${err.message}`)
  }
}

function showEditingBanner (map) {
  document.getElementById('public-kml-edit-banner')?.remove()

  const banner = document.createElement('div')
  banner.id = 'public-kml-edit-banner'
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; height: 50px;
    background: #0f766e; color: #fff; z-index: 9999;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    font-size: 14px; box-sizing: border-box;
  `
  banner.innerHTML = `
    <div style="font-weight: 500;">
      🎯 <span style="background: #14b8a6; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 6px;">编辑公共图层</span>正在编辑：<strong>${escapeHtml(editingPublicKml.name)}</strong>
    </div>
    <div style="display: flex; gap: 8px;">
      <button type="button" id="public-kml-save-btn" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: #3182ce; color: white; border: none; border-radius: 4px; cursor: pointer; min-height: 28px; line-height: 1.25;">保存草稿</button>
      <button type="button" id="public-kml-publish-btn" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: #48bb78; color: white; border: none; border-radius: 4px; cursor: pointer; min-height: 28px; line-height: 1.25;">保存并发布</button>
      <button type="button" id="public-kml-exit-btn" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: #e53e3e; color: white; border: none; border-radius: 4px; cursor: pointer; min-height: 28px; line-height: 1.25;">退出</button>
    </div>
  `
  document.body.appendChild(banner)

  document.getElementById('public-kml-save-btn').addEventListener('click', () => saveEditingPublicKml(map, 'draft'))
  document.getElementById('public-kml-publish-btn').addEventListener('click', () => saveEditingPublicKml(map, 'published'))
  document.getElementById('public-kml-exit-btn').addEventListener('click', () => exitEditingPublicKml(map))
}

async function saveEditingPublicKml (map, status) {
  try {
    await apiRequest(`/admin/kml/${encodeURIComponent(editingPublicKml.id)}`, {
      method: 'PUT',
      body: {
        features: editingPublicKml.features,
        status,
      },
    })

    isPublicKmlDirty = false
    editingPublicKml.status = status
    showAlert(status === 'published' ? '保存并发布成功！' : '保存草稿成功！')
  } catch (err) {
    showAlert(`保存失败: ${err.message}`)
  }
}

async function exitEditingPublicKml (map) {
  if (isPublicKmlDirty) {
    const confirmed = await showConfirm('有未保存的修改，确定退出编辑吗？')
    if (!confirmed) return
  }

  document.getElementById('public-kml-edit-banner')?.remove()

  isEditingPublicKml = false
  editingPublicKmlId = null
  editingPublicKml = null
  isPublicKmlDirty = false

  const url = new URL(window.location.href)
  url.searchParams.delete('editPublicKml')
  window.history.replaceState(null, '', url.pathname + url.search)
  
  await loadPublicKmls(map)
  renderAllKmls(map)
  updateKmlPanelUI(map)
}

const kmlLayerGroups = new Map()
const featureLayers = new Map()
const expandedKmlIds = new Set()

let isAddingPoint = false
let activeKmlIdForAdd = null
let clickListener = null
let pickupToastElement = null

function loadFromStorage () {
  let shouldSave = false
  try {
    kmlList = JSON.parse(localStorage.getItem(KML_STORAGE_KEY) || '[]')
    if (!Array.isArray(kmlList)) {
      kmlList = []
      shouldSave = true
    }
  } catch (err) {
    console.error('Failed to load KML list from localStorage', err)
    kmlList = []
    shouldSave = true
  }

  kmlList = kmlList.map(normalizeKmlFile)
  shouldSave = ensureDefaultKmlFile() || shouldSave
  if (shouldSave) {
    try {
      saveToStorage()
    } catch (err) {
      // Storage 被禁用时仍保留内存 KML，不能阻断地图和持续定位初始化。
      console.error('KML 本地存储不可用，将临时使用内存模式', err)
    }
  }
}

async function loadInitialKmlFiles () {
  const account = await initializeKmlAccountMode()
  if (account.mode === 'account') {
    kmlList = (account.files || []).map(normalizeKmlFile)
    if (account.error) {
      showAlert(`账号 KML 加载失败，当前不会读取或上传浏览器本地 KML。请稍后刷新重试：${account.error.message}`)
      return
    }
    if (account.canWrite && ensureDefaultKmlFile()) saveToStorage()
    if (account.recovery) {
      await promptKmlAccountRecovery(account.recovery, files => {
        kmlList = files.map(normalizeKmlFile)
        return kmlList
      })
    }
    return
  }
  loadFromStorage()
}

function saveToStorage () {
  if (isAccountKmlMode()) {
    if (isAccountKmlWritable()) scheduleKmlAccountSync(kmlList)
    return
  }
  localStorage.setItem(KML_STORAGE_KEY, JSON.stringify(kmlList))
}

function normalizeKmlFile (kmlFile) {
  const isDefault = kmlFile.id === DEFAULT_KML_ID || kmlFile.isDefault === true
  const preserveServerDefaultId = isDefault && isAccountKmlMode() && kmlFile.id
  return {
    ...kmlFile,
    id: preserveServerDefaultId
      ? String(kmlFile.id)
      : (isDefault ? DEFAULT_KML_ID : String(kmlFile.id || `kml-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`)),
    name: String(kmlFile.name || (isDefault ? DEFAULT_KML_NAME : '未命名 KML')),
    isDefault,
    theme: kmlFile.theme || 'default',
    color: kmlFile.color || '#0f766e',
    coordCorrection: kmlFile.coordCorrection || KML_COORD_CORRECTION,
    lockDrag: kmlFile.lockDrag === true,
    enabled: kmlFile.enabled !== false,
    features: Array.isArray(kmlFile.features) ? kmlFile.features : [],
  }
}

function createKmlFile (options = {}) {
  const isDefault = Boolean(options.isDefault)
  return normalizeKmlFile({
    id: isDefault && !isAccountKmlMode()
      ? DEFAULT_KML_ID
      : `kml-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: options.name || (isDefault ? DEFAULT_KML_NAME : '新建 KML 文件'),
    isDefault,
    theme: options.theme || 'default',
    color: options.color || '#0f766e',
    coordCorrection: options.coordCorrection || KML_COORD_CORRECTION,
    enabled: true,
    features: options.features || [],
  })
}

function ensureDefaultKmlFile () {
  const defaultIndex = kmlList.findIndex(kmlFile => kmlFile.id === DEFAULT_KML_ID || kmlFile.isDefault === true)
  if (defaultIndex === -1) {
    kmlList.unshift(createKmlFile({ isDefault: true }))
    return true
  }

  const previousDefault = kmlList[defaultIndex]
  const defaultFile = normalizeKmlFile({
    ...previousDefault,
    id: isAccountKmlMode() ? previousDefault.id : DEFAULT_KML_ID,
    isDefault: true,
    name: previousDefault.name || DEFAULT_KML_NAME,
    enabled: true,
  })

  let changed = defaultIndex !== 0 ||
    previousDefault.id !== defaultFile.id ||
    previousDefault.name !== defaultFile.name ||
    previousDefault.isDefault !== defaultFile.isDefault ||
    previousDefault.coordCorrection !== defaultFile.coordCorrection ||
    previousDefault.enabled !== defaultFile.enabled ||
    previousDefault.features !== defaultFile.features

  kmlList.splice(defaultIndex, 1)
  kmlList.unshift(defaultFile)
  return changed
}

function downloadKmlFile (fileName, kmlText) {
  const blob = new Blob([kmlText], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.kml') ? fileName : `${fileName}.kml`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function shouldCorrectCoords (kmlFile) {
  return kmlFile?.coordCorrection !== 'none'
}

function isKmlEnabled (kmlFile) {
  return Boolean(kmlFile) && kmlFile.enabled !== false
}

function getMapCoordinates (kmlFile, feature) {
  if (!shouldCorrectCoords(kmlFile)) {
    return feature.coordinates
  }
  return wgs84ToGcj02Deep(feature.coordinates)
}

function getMapPoint (kmlFile, feature) {
  const coordinates = getMapCoordinates(kmlFile, feature)
  return [coordinates[1], coordinates[0]]
}

function getMapLatLngs (kmlFile, feature) {
  return getMapCoordinates(kmlFile, feature).map(c => [c[1], c[0]])
}

function mapLatLngToStoredCoordinate (kmlFile, latlng) {
  const coord = [latlng.lng, latlng.lat]
  return shouldCorrectCoords(kmlFile) ? gcj02ToWgs84(coord) : coord
}

function getRememberedTargetKmlId () {
  try {
    return localStorage.getItem(KML_LAST_TARGET_KEY) || ''
  } catch (err) {
    console.error('Failed to read last KML target from localStorage', err)
    return ''
  }
}

function rememberTargetKmlId (kmlId) {
  try {
    localStorage.setItem(KML_LAST_TARGET_KEY, kmlId)
  } catch (err) {
    console.error('Failed to save last KML target to localStorage', err)
  }
}

function getEnabledKmlFiles () {
  if (canWritePersonalKml()) ensureDefaultKmlFile()
  return kmlList.filter(isKmlEnabled)
}

function getFeatureById (kmlId, featureId) {
  const kmlFile = kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
  const feature = kmlFile?.features?.find(f => f.id === featureId) || null
  return { kmlFile, feature }
}

function getFeatureLayerKey (kmlId, featureId) {
  return JSON.stringify([String(kmlId || ''), String(featureId || '')])
}

function resolveTargetKmlId (preferredKmlId = '') {
  if (isEditingPublicKml && editingPublicKmlId) {
    return editingPublicKmlId
  }
  const enabledFiles = getEnabledKmlFiles()
  const candidates = [
    preferredKmlId,
    getRememberedTargetKmlId(),
    DEFAULT_KML_ID,
    enabledFiles[0]?.id,
  ].filter(Boolean)
  return candidates.find(kmlId => enabledFiles.some(kmlFile => kmlFile.id === kmlId)) || DEFAULT_KML_ID
}

function buildKmlTargetOptions () {
  const options = getEnabledKmlFiles().map(kmlFile => ({
    value: kmlFile.id,
    label: `${kmlFile.name}${kmlFile.isDefault ? '（默认）' : ''}`,
  }))
  if (isEditingPublicKml && editingPublicKml) {
    options.push({
      value: editingPublicKml.id,
      label: `${editingPublicKml.name} (公共 - 编辑中)`,
    })
  }
  return options
}

function createPointFeature (kmlFile, latlng, result) {
  return {
    id: `feat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: 'Point',
    name: result.name.trim(),
    description: result.description.trim(),
    coordinates: mapLatLngToStoredCoordinate(kmlFile, latlng),
  }
}

function getFeatureLabel (feature) {
  const name = String(feature?.name || '').replace(/\s+/g, ' ').trim()
  if (!name) return ''
  if (name.length <= KML_POINT_LABEL_MAX_LENGTH) return name
  return `${name.slice(0, KML_POINT_LABEL_MAX_LENGTH)}...`
}

function renderFeature (map, kmlFile, feature) {
  const kmlId = kmlFile.id
  let layer
  const editable = isKmlEditable(kmlFile)
  const theme = getKmlTheme(kmlFile)
  const dragAllowed = editable && !kmlFile.lockDrag
  
  if (feature.type === 'Point') {
    const latlng = getMapPoint(kmlFile, feature)
    const mediaMarker = getKmlMediaMarkerDescriptor(feature)
    
    if (mediaMarker) {
      const mediaIcon = L.divIcon({
        className: 'kml-media-point-icon',
        html: mediaMarker.html,
        iconSize: mediaMarker.iconSize,
        iconAnchor: mediaMarker.iconAnchor,
        popupAnchor: mediaMarker.popupAnchor,
        tooltipAnchor: mediaMarker.tooltipAnchor,
      })
      layer = L.marker(latlng, {
        draggable: dragAllowed,
        icon: mediaIcon,
        title: mediaMarker.label,
      })
    } else if (theme === 'simple') {
      const colorVal = getKmlColor(kmlFile)
      const simpleIcon = L.divIcon({
        className: 'kml-simple-point-icon',
        html: `<div class="kml-simple-dot" style="background-color: ${colorVal}"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      })
      layer = L.marker(latlng, {
        draggable: dragAllowed,
        icon: simpleIcon
      })
    } else {
      layer = L.marker(latlng, {
        draggable: dragAllowed
      })
    }

    if (dragAllowed) {
      // 监听拖动开始：保存撤销快照，并在拖动时关闭 popup 气泡
      layer.on('dragstart', () => {
        pushKmlHistory()
        layer.closePopup()
      })
      
      layer.on('dragend', () => {
        const newLatLng = layer.getLatLng()
        feature.coordinates = mapLatLngToStoredCoordinate(kmlFile, newLatLng)
        saveKmlChanges(kmlFile)
        updateKmlPanelUI(map)
      })
    }

    if (theme !== 'simple') {
      const label = getFeatureLabel(feature)
      if (label) {
        layer.bindTooltip(escapeHtml(label), {
          permanent: true,
          direction: 'top',
          offset: [-16, -18],
          opacity: 1,
          className: 'kml-point-label',
        })
      }
    }
  } else if (feature.type === 'LineString') {
    const latlngs = getMapLatLngs(kmlFile, feature)
    layer = L.polyline(latlngs, {
      color: getKmlColor(kmlFile),
      weight: 4
    })
  } else if (feature.type === 'Polygon') {
    const latlngs = getMapLatLngs(kmlFile, feature)
    const colorVal = getKmlColor(kmlFile)
    layer = L.polygon(latlngs, {
      color: colorVal,
      fillColor: colorVal,
      fillOpacity: 0.15
    })
  }
  
  if (layer) {
    layer.bindPopup(renderKmlFeaturePopupContent(kmlFile, feature, editable), {
      closeButton: false,
      className: 'kml-rich-popup',
      maxWidth: 360,
      minWidth: 270,
    })
    featureLayers.set(getFeatureLayerKey(kmlId, feature.id), layer)
  }
  
  return layer
}

function removeKmlLayers (map, kmlFile) {
  const kmlId = typeof kmlFile === 'string' ? kmlFile : kmlFile.id
  const group = kmlLayerGroups.get(kmlId)
  if (group) {
    map.removeLayer(group)
    kmlLayerGroups.delete(kmlId)
  }

  const targetKml = typeof kmlFile === 'string'
    ? (kmlList.find(k => k.id === kmlFile) || publicKmlList.find(k => k.id === kmlFile))
    : kmlFile
  const renderedFeatures = targetKml?.isShare
    ? (targetKml.features || [])
    : getTrackDisplayFeatures(targetKml)
  renderedFeatures.forEach(feature => {
    featureLayers.delete(getFeatureLayerKey(kmlId, feature.id))
  })
}

function escapeHtml (str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderKmlLayers (map, kmlFile) {
  removeKmlLayers(map, kmlFile)

  if (!isKmlEnabled(kmlFile)) return
  
  const group = L.featureGroup()
  const viewportOptions = getViewportOptions2d(map)
  const displayFeatures = kmlFile.isShare
    ? (kmlFile.features || [])
    : getTrackDisplayFeatures(kmlFile, viewportOptions)

  displayFeatures.forEach(feat => {
    const layer = renderFeature(map, kmlFile, feat)
    if (layer) {
      group.addLayer(layer)
    }
  })
  
  group.addTo(map)
  kmlLayerGroups.set(kmlFile.id, group)

  // 更新视口缓存：live track 渲染后记录当前视口，用于后续跳过判断
  if (kmlFile.isLiveTrack && viewportOptions.viewportBounds) {
    lastRenderedViewportBounds = viewportOptions.viewportBounds
    lastRenderedZoom = viewportOptions.zoom
  }
}

function renderAllKmls (map) {
  kmlLayerGroups.forEach(group => map.removeLayer(group))
  kmlLayerGroups.clear()
  featureLayers.clear()
  
  kmlList.forEach(kmlFile => {
    renderKmlLayers(map, kmlFile)
  })

  publicKmlList.forEach(kmlFile => {
    renderKmlLayers(map, kmlFile)
  })
}

function bindAccountSessionExpiry (map) {
  if (accountSessionExpiryBound || typeof window === 'undefined') return
  accountSessionExpiryBound = true
  window.addEventListener('map-auth-session-expired', () => {
    if (!isAccountKmlMode()) return
    suspendKmlAccountSync({ preserveDraft: true, reason: 'session-expired' })
    loadFromStorage()
    renderAllKmls(map)
    updateKmlPanelUI(map)
    showAlert('登录已失效，未同步的账号 KML 已保存在该用户专属恢复草稿中。当前页面已切换回访客本地 KML，请重新登录同一账号后恢复。')
  })
}

function updateKmlPanelUI (map) {
  const twoBuluImportButton = document.getElementById('kml-import-2bulu')
  if (twoBuluImportButton) twoBuluImportButton.hidden = !canImportTwoBuluKml()
  if (canWritePersonalKml()) ensureDefaultKmlFile()
  const container = document.getElementById('kml-files-list')
  if (!container) return

  let html = ''

  // 1. 个人图层分区
  const personalExpanded = !expandedKmlIds.has('personal-section')
  html += `
    <div class="kml-section-header" style="margin-top: 8px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(22, 61, 61, 0.12); display: flex; justify-content: space-between; align-items: center; cursor: pointer;" data-kml-action="toggle-section" data-section-id="personal-section">
      <span style="font-weight: bold; color: #0f766e; font-size: 13px;">个人图层 (${kmlList.length})</span>
      <span style="font-size: 11px; color: #6b7280;">${personalExpanded ? '▲' : '▼'}</span>
    </div>
    <div id="kml-personal-list" style="display: ${personalExpanded ? 'flex' : 'none'}; flex-direction: column; gap: 8px; margin-bottom: 16px;">
      ${kmlList.map(kmlFile => {
        const safeKmlId = escapeHtml(kmlFile.id)
        const enabled = isKmlEnabled(kmlFile)
        const expanded = expandedKmlIds.has(kmlFile.id)
        const displayFeatures = getTrackDisplayFeatures(kmlFile, getViewportOptions2d(map))
        const writable = canWritePersonalKml()
        const visibilityTitle = enabled ? '隐藏此 KML 文件' : '显示此 KML 文件'
        const visibilityButton = !writable || kmlFile.isDefault
          ? ''
          : `
            <button type="button" class="kml-file-btn kml-visibility-btn ${enabled ? 'is-visible' : 'is-hidden'}" data-kml-action="toggle-visible" data-kml-id="${safeKmlId}" aria-label="${visibilityTitle}" aria-pressed="${enabled}" title="${visibilityTitle}">
              <span class="kml-eye-icon" aria-hidden="true"></span>
            </button>
          `
        const shareButton = canManagePersonalShares()
          ? `
            <button type="button" class="kml-file-btn" data-kml-action="manage-share" data-kml-id="${safeKmlId}" title="在用户中心分享此 KML" aria-label="分享此 KML" style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;">↗</button>
          `
          : (isAdminLoggedIn() ? `
            <button type="button" class="kml-file-btn" data-kml-action="share-file" data-kml-id="${safeKmlId}" title="共享为公共 KML" aria-label="共享为公共 KML" style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;">
              <svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; stroke-linecap: round; stroke-linejoin: round;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </button>
          ` : '')
        const deleteButton = !writable || kmlFile.isDefault
          ? ''
          : `<button type="button" class="kml-file-btn delete" data-kml-action="delete-file" data-kml-id="${safeKmlId}" title="删除此 KML 文件" aria-label="删除此 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button>`
        return `
          <div class="kml-file-card ${enabled ? '' : 'is-disabled'}" data-kml-card-id="${safeKmlId}">
            <div class="kml-file-head ${expanded ? 'is-expanded' : ''}" data-kml-action="toggle-collapse" data-kml-id="${safeKmlId}" aria-expanded="${expanded}" title="点击展开更多 KML 操作">
              <div class="kml-file-title">
                <span class="kml-file-name" title="${escapeHtml(kmlFile.name)}">${escapeHtml(kmlFile.name)}</span>
                <span class="kml-file-count">${kmlFile.features.length}</span>
                ${kmlFile.isDefault ? '<span class="kml-file-state is-default">默认</span>' : ''}
                ${writable ? '' : '<span class="kml-file-state">只读</span>'}
                ${enabled ? '' : '<span class="kml-file-state">已隐藏</span>'}
              </div>
              <div class="kml-file-actions">
                ${writable ? `<button type="button" class="kml-file-btn" data-kml-action="rename-file" data-kml-id="${safeKmlId}" aria-label="重命名 KML 文件" title="重命名 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg></button>` : ''}
                ${shareButton}
                ${visibilityButton}
              </div>
            </div>
            <div class="kml-file-detail" id="features-${safeKmlId}" style="display: ${expanded ? 'flex' : 'none'};">
              <div class="kml-file-toolbox" aria-label="${escapeHtml(kmlFile.name)} 相关操作">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <label class="kml-correction-switch" title="开启后按高德底图纠偏显示；导出仍保留 KML 标准经纬度">
                    <input type="checkbox" data-kml-correction data-kml-id="${safeKmlId}" ${writable ? '' : 'disabled'} ${shouldCorrectCoords(kmlFile) ? 'checked' : ''}>
                    <span>坐标纠偏</span>
                  </label>
                  <label class="kml-correction-switch" title="开启后将锁定该图层下所有标注点位，防止误触拖拽移动">
                    <input type="checkbox" data-kml-lock-drag data-kml-id="${safeKmlId}" ${writable ? '' : 'disabled'} ${kmlFile.lockDrag ? 'checked' : ''}>
                    <span>锁定移动</span>
                  </label>
                  <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 2px;">
                    <span style="font-size: 11px; color: #475569;">样式：</span>
                    ${renderCustomSelect({
                      className: 'kml-theme-select',
                      value: getKmlTheme(kmlFile),
                      options: [
                        { value: 'default', label: '常规' },
                        { value: 'simple', label: '简约' }
                      ],
                      attrs: `data-kml-id="${safeKmlId}" ${writable ? '' : 'disabled'}`
                    })}
                    <span style="font-size: 11px; color: #475569; margin-left: 4px;">颜色：</span>
                    ${renderCustomColorPicker({
                      className: 'kml-color-input',
                      value: getKmlColor(kmlFile),
                      attrs: `data-kml-id="${safeKmlId}" ${writable ? '' : 'disabled'}`
                    })}
                  </div>
                </div>
                <div class="kml-file-tool-actions">
                  ${writable ? `<button type="button" class="kml-file-btn" data-kml-action="add-point" data-kml-id="${safeKmlId}" title="在此文件下新增标注点" aria-label="新增标注点"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg></button>` : ''}
                  <button type="button" class="kml-file-btn" data-kml-action="export" data-kml-id="${safeKmlId}" title="导出 KML 文件" aria-label="导出 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></button>
                  ${deleteButton}
                </div>
              </div>
              <div class="kml-features-list">
                ${displayFeatures.length < kmlFile.features.length ? `<div class="kml-feature-limit-note">已按当前视口和缩放级别过滤显示，共 ${kmlFile.features.length} 个记录点中展示 ${displayFeatures.length} 个；导出仍包含全部记录。</div>` : ''}
                ${displayFeatures.map(feat => {
                  const safeFeatureId = escapeHtml(feat.id)
                  let iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
                  if (feat.type === 'LineString') {
                    iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>'
                  }
                  if (feat.type === 'Polygon') {
                    iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12 2 22 9 18 22 6 22 2 9"/></svg>'
                  }
                  iconSvg = getKmlMediaListIcon(feat) || iconSvg
                  return `
                    <div class="kml-feature-item" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}">
                      <div class="kml-feature-info" data-kml-action="focus-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}">
                        <span class="kml-feature-icon">${iconSvg}</span>
                        <span class="kml-feature-name" title="${escapeHtml(feat.name || '未命名点位')}">${escapeHtml(feat.name || '未命名点位')}</span>
                      </div>
                      ${writable ? `<button type="button" class="kml-feature-del" data-kml-action="delete-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}" title="删除标注"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg></button>` : ''}
                    </div>
                  `
                }).join('')}
              </div>
            </div>
          </div>
        `
      }).join('') || '<div style="font-size: 12px; color: #9ca3af; text-align: center; padding: 8px 0;">无个人图层</div>'}
    </div>
  `

  // 2. 公共图层分区
  const publicCount = publicKmlList.length
  const publicExpanded = !expandedKmlIds.has('public-section')
  html += `
    <div class="kml-section-header" style="margin-top: 8px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(22, 61, 61, 0.12); display: flex; justify-content: space-between; align-items: center; cursor: pointer;" data-kml-action="toggle-section" data-section-id="public-section">
      <span style="font-weight: bold; color: #0f766e; font-size: 13px;">公共图层 (${publicCount})</span>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button type="button" class="kml-file-btn" data-kml-action="refresh-public" title="刷新公共图层" style="padding: 2px; width: auto; height: auto;" onclick="event.stopPropagation()">
          <svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        </button>
        <span style="font-size: 11px; color: #6b7280;">${publicExpanded ? '▲' : '▼'}</span>
      </div>
    </div>
    <div id="kml-public-list" style="display: ${publicExpanded ? 'flex' : 'none'}; flex-direction: column; gap: 8px; margin-bottom: 16px;">
      ${publicKmlList.map(kmlFile => {
        const safeKmlId = escapeHtml(kmlFile.id)
        const enabled = isKmlEnabled(kmlFile)
        const expanded = expandedKmlIds.has(kmlFile.id)
        const visibilityTitle = enabled ? '隐藏此公共图层' : '显示此公共图层'
        const isEditingThis = isEditingPublicKml && editingPublicKmlId === kmlFile.id
        return `
          <div class="kml-file-card ${enabled ? '' : 'is-disabled'}" data-kml-card-id="${safeKmlId}">
            <div class="kml-file-head ${expanded ? 'is-expanded' : ''}" data-kml-action="toggle-collapse" data-kml-id="${safeKmlId}">
              <div class="kml-file-title">
                <span class="kml-file-name" title="${escapeHtml(kmlFile.name)}">${escapeHtml(kmlFile.name)}</span>
                <span class="kml-file-count">${kmlFile.features ? kmlFile.features.length : (kmlFile.featureCount || 0)}</span>
                <span class="kml-file-state is-default" style="background: #e0f2fe; color: #0369a1; padding: 1px 4px; font-size: 10px; font-weight: bold; border-radius: 4px;">公共</span>
                ${isEditingThis ? '<span class="kml-file-state is-default" style="background: #fef3c7; color: #d97706; padding: 1px 4px; font-size: 10px; font-weight: bold; border-radius: 4px;">编辑中</span>' : ''}
                ${enabled ? '' : '<span class="kml-file-state">已隐藏</span>'}
              </div>
              <div class="kml-file-actions">
                <button type="button" class="kml-file-btn kml-visibility-btn ${enabled ? 'is-visible' : 'is-hidden'}" data-kml-action="toggle-visible" data-kml-id="${safeKmlId}" aria-label="${visibilityTitle}" aria-pressed="${enabled}" title="${visibilityTitle}">
                  <span class="kml-eye-icon" aria-hidden="true"></span>
                </button>
              </div>
            </div>
            <div class="kml-file-detail" id="features-${safeKmlId}" style="display: ${expanded ? 'flex' : 'none'};">
              <div class="kml-file-toolbox">
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  <label class="kml-correction-switch" title="公共图层不可在此修改纠偏配置">
                    <input type="checkbox" disabled checked ${kmlFile.coordCorrection !== 'none' ? 'checked' : ''}>
                    <span>坐标纠偏</span>
                  </label>
                  <label class="kml-correction-switch" title="公共图层禁止点位移动">
                    <input type="checkbox" disabled checked>
                    <span>锁定移动</span>
                  </label>
                  <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 2px;">
                    <span style="font-size: 11px; color: #475569;">样式：</span>
                    ${renderCustomSelect({
                      className: 'kml-theme-select',
                      value: getKmlTheme(kmlFile),
                      options: [
                        { value: 'default', label: '常规' },
                        { value: 'simple', label: '简约' }
                      ],
                      attrs: `data-kml-id="${safeKmlId}"`
                    })}
                    <span style="font-size: 11px; color: #475569; margin-left: 4px;">颜色：</span>
                    ${renderCustomColorPicker({
                      className: 'kml-color-input',
                      value: getKmlColor(kmlFile),
                      attrs: `data-kml-id="${safeKmlId}"`
                    })}
                  </div>
                </div>
                <div class="kml-file-tool-actions">
                  ${isEditingThis ? `<button type="button" class="kml-file-btn" data-kml-action="add-point" data-kml-id="${safeKmlId}" title="新增标注点" style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 14px; height: 14px;"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg></button>` : ''}
                  <button type="button" class="kml-file-btn" data-kml-action="export" data-kml-id="${safeKmlId}" title="导出 KML 文件" aria-label="导出 KML 文件" style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></button>
                </div>
              </div>
              <div class="kml-features-list">
                ${(kmlFile.features || []).map(feat => {
                  const safeFeatureId = escapeHtml(feat.id)
                  let iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
                  if (feat.type === 'LineString') {
                    iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>'
                  }
                  if (feat.type === 'Polygon') {
                    iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12 2 22 9 18 22 6 22 2 9"/></svg>'
                  }
                  iconSvg = getKmlMediaListIcon(feat) || iconSvg
                  return `
                    <div class="kml-feature-item" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}">
                      <div class="kml-feature-info" data-kml-action="focus-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}">
                        <span class="kml-feature-icon">${iconSvg}</span>
                        <span class="kml-feature-name" title="${escapeHtml(feat.name || '未命名点位')}">${escapeHtml(feat.name || '未命名点位')}</span>
                      </div>
                      ${isEditingThis ? `
                        <button type="button" class="kml-feature-del" data-kml-action="delete-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}" title="删除标注"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg></button>
                      ` : ''}
                    </div>
                  `
                }).join('')}
              </div>
            </div>
          </div>
        `
      }).join('') || '<div style="font-size: 12px; color: #9ca3af; text-align: center; padding: 8px 0;">无已发布公共图层</div>'}
    </div>
  `
  container.innerHTML = html
}

function focusFeature (map, kmlId, featureId) {
  const kmlFile = kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
  if (!kmlFile) return
  if (!isKmlEnabled(kmlFile)) {
    showAlert('该 KML 文件已隐藏，请先启用后查看。')
    return
  }

  const feature = kmlFile.features.find(f => f.id === featureId)
  if (!feature) return
  
  const layer = featureLayers.get(getFeatureLayerKey(kmlId, featureId))
  if (!layer) return
  
  if (feature.type === 'Point') {
    map.flyTo(getMapPoint(kmlFile, feature), 15, { duration: 0.8 })
  } else {
    const bounds = layer.getBounds()
    map.flyToBounds(bounds, { maxZoom: 15, duration: 0.8 })
  }
  
  setTimeout(() => {
    layer.openPopup()
  }, 850)
}

function activateFeatureForMedia (map, item, options = {}) {
  const kmlId = String(item?.kmlId || '')
  const featureId = String(item?.featureId || '')
  if (!kmlId || !featureId) return
  const { kmlFile, feature } = getFeatureById(kmlId, featureId)
  const layer = featureLayers.get(getFeatureLayerKey(kmlId, featureId))
  if (!kmlFile || !feature || !layer || !isKmlEnabled(kmlFile)) return
  window.clearTimeout(mediaFeatureActivationTimer)
  map.stop?.()
  if (feature.type === 'Point') {
    const point = getMapPoint(kmlFile, feature)
    if (options.closePreview) map.setView(point, map.getZoom(), { animate: false })
    else map.panTo(point, { animate: true, duration: 0.28 })
  } else if (typeof layer.getBounds === 'function') {
    map.fitBounds(layer.getBounds(), { maxZoom: 15, animate: !options.closePreview, duration: 0.28 })
  }
  const delay = options.closePreview ? 0 : 300
  mediaFeatureActivationTimer = window.setTimeout(() => layer.openPopup(), delay)
}

async function handleEditFeature (map, kmlId, featureId) {
  const kmlFile = kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
  if (!kmlFile) return
  if (!isKmlEditable(kmlFile)) {
    await showAlert('当前账号只有 KML 查看权限，不能修改标注。')
    return
  }
  const feature = kmlFile.features.find(f => f.id === featureId)
  if (!feature) return
  
  const result = await showEditDialog({
    title: '修改标注属性',
    fields: [
      { name: 'name', label: '名称', type: 'text' },
      { name: 'description', label: '描述', type: 'textarea' }
    ],
    values: {
      name: feature.name,
      description: feature.description
    }
  })
  
  if (result) {
    feature.name = result.name.trim()
    feature.description = result.description.trim()
    saveKmlChanges(kmlFile)
    
    const layer = featureLayers.get(getFeatureLayerKey(kmlId, featureId))
    if (layer) {
      layer.setPopupContent(renderKmlFeaturePopupContent(kmlFile, feature, isKmlEditable(kmlFile)))
      if (feature.type === 'Point') {
        const label = getFeatureLabel(feature)
        if (label) {
          layer.setTooltipContent(escapeHtml(label))
        } else {
          layer.unbindTooltip()
        }
      }
      layer.closePopup()
      setTimeout(() => layer.openPopup(), 100)
    }
    
    updateKmlPanelUI(map)
  }
}

async function handleDeleteFeature (map, kmlId, featureId) {
  const kmlFile = kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
  if (!kmlFile) return
  if (!isKmlEditable(kmlFile)) {
    await showAlert('当前账号只有 KML 查看权限，不能删除标注。')
    return
  }
  const confirmed = await showConfirm('确认删除此地图标注？')
  if (!confirmed) return
  
  const index = kmlFile.features.findIndex(f => f.id === featureId)
  if (index === -1) return
  
  kmlFile.features.splice(index, 1)
  saveKmlChanges(kmlFile)
  
  const layer = featureLayers.get(getFeatureLayerKey(kmlId, featureId))
  if (layer) {
    const group = kmlLayerGroups.get(kmlId)
    if (group) {
      group.removeLayer(layer)
    }
    featureLayers.delete(getFeatureLayerKey(kmlId, featureId))
  }
  
  updateKmlPanelUI(map)
}

async function handleCreateKmlFile (map) {
  if (!canWritePersonalKml()) {
    await showAlert('当前账号只有 KML 查看权限，不能新建文件。')
    return
  }
  const result = await showEditDialog({
    title: '新建 KML 文件',
    fields: [
      { name: 'name', label: '文件名称', type: 'text' },
    ],
    values: {
      name: `新建 KML ${kmlList.length + 1}`,
    },
  })

  const name = result?.name?.trim()
  if (!name) return

  const kmlFile = createKmlFile({ name })
  kmlList.splice(1, 0, kmlFile)
  expandedKmlIds.add(kmlFile.id)
  rememberTargetKmlId(kmlFile.id)
  saveToStorage()
  renderKmlLayers(map, kmlFile)
  updateKmlPanelUI(map)
}

async function handleRenameKmlFile (map, kmlId) {
  if (!canWritePersonalKml()) {
    await showAlert('当前账号只有 KML 查看权限，不能重命名文件。')
    return
  }
  const kmlFile = kmlList.find(k => k.id === kmlId)
  if (!kmlFile) return

  const result = await showEditDialog({
    title: '重命名 KML 文件',
    fields: [
      { name: 'name', label: '文件名称', type: 'text' },
    ],
    values: {
      name: kmlFile.name,
    },
  })

  const name = result?.name?.trim()
  if (!name || name === kmlFile.name) return

  kmlFile.name = name
  saveToStorage()
  updateKmlPanelUI(map)
}

async function createPointAtLatLng (map, latlng, options = {}) {
  if (!canWritePersonalKml() && !isEditingPublicKml) {
    await showAlert('当前账号只有 KML 查看权限，不能新增标注。')
    return
  }
  if (canWritePersonalKml()) ensureDefaultKmlFile()
  const targetOptions = buildKmlTargetOptions()
  const allowFileSelection = options.allowFileSelection !== false && targetOptions.length > 1
  const targetKmlId = resolveTargetKmlId(options.targetKmlId)
  const fields = [
    { name: 'name', label: '标注名称', type: 'text' },
    { name: 'description', label: '描述信息', type: 'textarea' },
  ]

  if (allowFileSelection) {
    fields.unshift({
      name: 'kmlId',
      label: '保存到 KML 文件',
      type: 'select',
      options: targetOptions,
    })
  }

  // 在弹出对话框前绘制临时的标记点，提供直观的定位位置感知
  const tempMarker = L.marker(latlng).addTo(map)

  const result = await showEditDialog({
    title: '新增地图标注',
    fields,
    values: {
      kmlId: targetKmlId,
      name: '',
      description: '',
    },
  })

  // 对话框关闭后立即清除临时标记点
  tempMarker.remove()

  if (!result) return

  const selectedKmlId = allowFileSelection ? result.kmlId : targetKmlId
  const kmlFile = kmlList.find(k => k.id === selectedKmlId) || publicKmlList.find(k => k.id === selectedKmlId)
  if (!kmlFile || !isKmlEditable(kmlFile)) {
    await showAlert('目标 KML 当前为只读，不能新增标注。')
    return
  }
  if (!isKmlEnabled(kmlFile)) {
    showAlert('该 KML 文件已隐藏，请先启用后再新增标注。')
    return
  }

  const newFeat = createPointFeature(kmlFile, latlng, result)
  kmlFile.features.push(newFeat)
  expandedKmlIds.add(kmlFile.id)
  rememberTargetKmlId(kmlFile.id)
  saveKmlChanges(kmlFile)

  const group = kmlLayerGroups.get(kmlFile.id)
  const layer = renderFeature(map, kmlFile, newFeat)
  if (layer && group) {
    group.addLayer(layer)
  } else if (layer && !group) {
    renderKmlLayers(map, kmlFile)
  }

  updateKmlPanelUI(map)
  focusFeature(map, kmlFile.id, newFeat.id)
}

function togglePickupMode (map, kmlId) {
  if (!isAddingPoint && kmlId && !canWritePersonalKml() && !isEditingPublicKml) {
    showAlert('当前账号只有 KML 查看权限，不能新增标注。')
    return
  }
  if (isAddingPoint) {
    isAddingPoint = false
    activeKmlIdForAdd = null
    map.getContainer().style.cursor = ''
    if (clickListener) {
      map.off('click', clickListener)
      clickListener = null
    }
    if (pickupToastElement) {
      pickupToastElement.remove()
      pickupToastElement = null
    }
  } else {
    isAddingPoint = true
    activeKmlIdForAdd = kmlId
    map.getContainer().style.cursor = 'crosshair'
    
    pickupToastElement = document.createElement('div')
    pickupToastElement.className = 'kml-pickup-toast'
    pickupToastElement.innerHTML = '🎯 请点击地图位置以添加点位标注'
    document.body.appendChild(pickupToastElement)
    
    clickListener = async (e) => {
      const latlng = e.latlng
      togglePickupMode(map, null)
      await createPointAtLatLng(map, latlng, {
        targetKmlId: kmlId,
        allowFileSelection: false,
      })
    }
    
    map.on('click', clickListener)
  }
}

function initLongPressPointCreation (map) {
  const container = map.getContainer()
  let pressState = null
  let lastLongPressAt = 0
  const activePointerIds = new Set()

  const clearPress = () => {
    if (pressState?.timer) {
      window.clearTimeout(pressState.timer)
    }
    pressState = null
  }

  const isInteractiveTarget = (target) => target.closest?.('.leaflet-control, .leaflet-marker-icon, .leaflet-popup, button, a, input, textarea, select')

  const onPointerDown = (event) => {
    activePointerIds.add(event.pointerId)
    if (activePointerIds.size > 1 || event.isPrimary === false) {
      clearPress()
      return
    }
    if (isAddingPoint || event.button > 0 || isInteractiveTarget(event.target)) return

    try {
      container.setPointerCapture?.(event.pointerId)
    } catch (err) {
      // 部分浏览器不允许对当前事件捕获指针，忽略即可。
    }

    const startX = event.clientX
    const startY = event.clientY
    const latlng = map.mouseEventToLatLng(event)
    pressState = {
      pointerId: event.pointerId,
      startX,
      startY,
      timer: window.setTimeout(async () => {
        if (!pressState || activePointerIds.size !== 1) return
        lastLongPressAt = Date.now()
        const targetLatLng = latlng
        clearPress()
        await createPointAtLatLng(map, targetLatLng, {
          allowFileSelection: true,
        })
      }, LONG_PRESS_DELAY_MS),
    }
  }

  const onPointerMove = (event) => {
    if (!pressState || event.pointerId !== pressState.pointerId) return
    const deltaX = event.clientX - pressState.startX
    const deltaY = event.clientY - pressState.startY
    if (Math.hypot(deltaX, deltaY) > LONG_PRESS_MOVE_TOLERANCE) {
      clearPress()
    }
  }

  const onPointerUp = (event) => {
    activePointerIds.delete(event.pointerId)
    if (pressState && event.pointerId === pressState.pointerId) {
      clearPress()
    }
  }

  const onTouchChange = (event) => {
    if (event.touches?.length > 1) {
      clearPress()
    }
  }

  const onContextMenu = (event) => {
    if (Date.now() - lastLongPressAt < 1200) {
      event.preventDefault()
    }
  }

  container.addEventListener('pointerdown', onPointerDown, { passive: true })
  container.addEventListener('pointermove', onPointerMove, { passive: true })
  container.addEventListener('pointerup', onPointerUp, { passive: true })
  container.addEventListener('pointercancel', onPointerUp, { passive: true })
  container.addEventListener('touchstart', onTouchChange, { passive: true })
  container.addEventListener('touchmove', onTouchChange, { passive: true })
  container.addEventListener('contextmenu', onContextMenu)

  map.on('unload', () => {
    clearPress()
    activePointerIds.clear()
    container.removeEventListener('pointerdown', onPointerDown)
    container.removeEventListener('pointermove', onPointerMove)
    container.removeEventListener('pointerup', onPointerUp)
    container.removeEventListener('pointercancel', onPointerUp)
    container.removeEventListener('touchstart', onTouchChange)
    container.removeEventListener('touchmove', onTouchChange)
    container.removeEventListener('contextmenu', onContextMenu)
  })
}

/**
 * 视口变化时按需重渲染 KML 图层（debounce 150ms + setTimeout）。
 * 独立于定位生命周期，确保查看已保存轨迹时也能动态渲染。
 * 仅重渲染 isLiveTrack 的 KML 文件，普通 KML 无视口过滤不需要重渲染。
 * 优化：若当前视口仍在上次渲染的缓冲范围内则跳过，避免不必要的重渲染。
 * 使用 setTimeout(0) 替代 requestAnimationFrame，让浏览器先完成绘制再执行渲染。
 */
function scheduleKmlViewportRerender (map) {
  if (kmlViewportRerenderTimer) clearTimeout(kmlViewportRerenderTimer)
  kmlViewportRerenderTimer = setTimeout(() => {
    kmlViewportRerenderTimer = null
    const hasLiveTrack = kmlList.some(k => k.isLiveTrack && k.enabled) ||
                         publicKmlList.some(k => k.isLiveTrack && !k.isShare && k.enabled)
    if (!hasLiveTrack) return

    // 缓存跳过：当前视口在上次渲染的缓冲范围内则不重渲染
    const viewportOptions = getViewportOptions2d(map)
    if (viewportOptions.viewportBounds && isViewportWithinCache2d(viewportOptions.viewportBounds, viewportOptions.zoom)) {
      return
    }

    // 使用 setTimeout(0) 替代 requestAnimationFrame，让浏览器先绘制再渲染
    setTimeout(() => {
      kmlList.forEach(kmlFile => {
        if (kmlFile.isLiveTrack && !kmlFile.isShare && kmlFile.enabled) {
          renderKmlLayers(map, kmlFile)
        }
      })
      publicKmlList.forEach(kmlFile => {
        if (kmlFile.isLiveTrack && !kmlFile.isShare && kmlFile.enabled) {
          renderKmlLayers(map, kmlFile)
        }
      })
      // 视口重渲染时不更新面板 UI，避免不必要的 DOM 操作导致卡顿
    }, 0)
  }, 150)
}

function getKmlFeatureListIcon (feature) {
  const geometryIcon = feature.type === 'LineString'
    ? '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>'
    : feature.type === 'Polygon'
      ? '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12 2 22 9 18 22 6 22 2 9"/></svg>'
      : '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
  return getKmlMediaListIcon(feature) || geometryIcon
}

function extendKmlBounds (bounds, coordinates) {
  if (!Array.isArray(coordinates)) return
  if (
    coordinates.length >= 2 &&
    Number.isFinite(Number(coordinates[0])) &&
    Number.isFinite(Number(coordinates[1]))
  ) {
    bounds.extend([Number(coordinates[1]), Number(coordinates[0])])
    return
  }
  coordinates.forEach(item => extendKmlBounds(bounds, item))
}

function getKmlFilesBounds (files) {
  const bounds = L.latLngBounds([])
  files.forEach(kmlFile => {
    const features = kmlFile.features || []
    features.forEach(feature => {
      try {
        extendKmlBounds(bounds, getMapCoordinates(kmlFile, feature))
      } catch (error) {
        console.warn(`Failed to calculate KML bounds for ${kmlFile.id}`, error)
      }
    })
  })
  return bounds
}

function fitKmlFilesBounds (map, files, options = {}) {
  const bounds = getKmlFilesBounds(files)
  if (!bounds.isValid()) return false
  map.fitBounds(bounds, {
    padding: options.padding || [48, 48],
    maxZoom: Number.isFinite(options.maxZoom) ? options.maxZoom : 16,
    animate: options.animate !== false,
    duration: Number.isFinite(options.duration) ? options.duration : 0.6,
  })
  return true
}

async function handleTwoBuluImport (map, button, correctionInput) {
  if (!canImportTwoBuluKml()) {
    await showAlert('请先登录具备个人 KML 写权限的账号后再从两步路导入。')
    return
  }

  const input = await showTwoBuluImportDialog({
    coordCorrection: correctionInput?.checked === false ? 'none' : KML_COORD_CORRECTION,
  })
  if (!input) return

  const originalText = button?.textContent || '从两步路公开链接导入'
  if (button) {
    button.disabled = true
    button.textContent = '正在读取并导入…'
  }

  let helperResult = null
  let savedResult = null
  try {
    helperResult = await requestTwoBuluKml(input)
    const result = await apiRequest('/kml/import/2bulu/browser-helper', {
      method: 'POST',
      body: {
        ...input,
        protocolVersion: TWO_BULU_HELPER_PROTOCOL_VERSION,
        helperVersion: helperResult.helperVersion,
        name: helperResult.name,
        kmlText: helperResult.kmlText,
        sourceMode: helperResult.sourceMode,
        completeness: helperResult.completeness,
        warnings: helperResult.warnings,
      },
    })
    if (!result?.id || !Array.isArray(result.features)) {
      throw new Error('两步路导入响应缺少有效 KML 数据，请刷新后重试。')
    }
    savedResult = result

    const importedKml = normalizeKmlFile(result)
    if (!registerKmlAccountDocument(importedKml)) {
      clearTwoBuluImportRequest(input)
      await finalizeTwoBuluImport(helperResult, {
        status: 'success',
        message: '轨迹已保存到账号；当前地图登录状态已变化，请刷新页面后查看。',
      })
      await showAlert('轨迹已保存到账号，但当前页面登录状态已变化。请重新登录或刷新页面后查看。')
      return
    }

    const existingIndex = kmlList.findIndex(item => item.id === importedKml.id)
    if (existingIndex >= 0) kmlList.splice(existingIndex, 1, importedKml)
    else kmlList.splice(1, 0, importedKml)
    expandedKmlIds.add(importedKml.id)
    rememberTargetKmlId(importedKml.id)
    saveToStorage()

    renderKmlLayers(map, importedKml)
    updateKmlPanelUI(map)
    fitKmlFilesBounds(map, [importedKml])
    clearTwoBuluImportRequest(input)
    await finalizeTwoBuluImport(helperResult, {
      status: 'success',
      message: twoBuluImportResultMessage(result),
    })
    await showAlert(twoBuluImportResultMessage(result), { title: '导入完成' })
  } catch (error) {
    if (helperResult) {
      await finalizeTwoBuluImport(helperResult, {
        status: savedResult ? 'success' : 'failed',
        message: savedResult
          ? `轨迹已保存到账号，但当前地图加载失败：${error?.message || '请刷新页面后查看。'}`
          : `map-service 保存失败：${error?.message || '请返回地图页面查看原因后重试。'}`,
      })
      if (savedResult) clearTwoBuluImportRequest(input)
    }
    await showAlert(error?.message || '读取两步路公开轨迹失败，请稍后重试或改用本地 KML 导入。')
  } finally {
    if (button) {
      button.disabled = false
      button.textContent = originalText
    }
  }
}

function bindKmlPopupActions (map) {
  map.on('popupopen', (event) => {
    const popup = event.popup
    const container = popup.getElement()
    if (!container) return

    preventAllKmlPropagation(container)
    const detailBtn = container.querySelector('.kml-detail-btn')
    const popupFeatureId = detailBtn?.getAttribute('data-feature-id')
    const popupKmlId = detailBtn?.getAttribute('data-kml-id')
    if (popupKmlId && popupFeatureId) {
      const { kmlFile, feature } = getFeatureById(popupKmlId, popupFeatureId)
      if (kmlFile && feature) bindKmlFeaturePopupMediaActions(container, kmlFile, feature)
    }

    const editBtn = container.querySelector('.kml-edit-btn')
    const deleteBtn = container.querySelector('.kml-delete-btn')
    if (detailBtn && detailBtn.dataset.kmlDetailBound !== 'true') {
      detailBtn.dataset.kmlDetailBound = 'true'
      const kmlId = detailBtn.getAttribute('data-kml-id')
      const featureId = detailBtn.getAttribute('data-feature-id')
      detailBtn.addEventListener('click', (clickEvent) => {
        clickEvent.stopPropagation()
        clickEvent.preventDefault()
        const { kmlFile, feature } = getFeatureById(kmlId, featureId)
        if (kmlFile && feature) openKmlFeatureContentPanel(kmlFile, feature)
      })
    }

    if (editBtn && editBtn.dataset.kmlEditBound !== 'true') {
      editBtn.dataset.kmlEditBound = 'true'
      const kmlId = editBtn.getAttribute('data-kml-id')
      const featureId = editBtn.getAttribute('data-feature-id')
      editBtn.addEventListener('click', (clickEvent) => {
        clickEvent.stopPropagation()
        clickEvent.preventDefault()
        handleEditFeature(map, kmlId, featureId)
      })
    }

    if (deleteBtn && deleteBtn.dataset.kmlDeleteBound !== 'true') {
      deleteBtn.dataset.kmlDeleteBound = 'true'
      const kmlId = deleteBtn.getAttribute('data-kml-id')
      const featureId = deleteBtn.getAttribute('data-feature-id')
      deleteBtn.addEventListener('click', (clickEvent) => {
        clickEvent.stopPropagation()
        clickEvent.preventDefault()
        map.closePopup(popup)
        handleDeleteFeature(map, kmlId, featureId)
      })
    }
  })
}

function renderShareKmlPanel (map) {
  const container = document.getElementById('kml-files-list')
  const share = getActiveShare()
  if (!container || !share) return
  container.innerHTML = `
    <section class="kml-share-summary">
      <strong>${escapeHtml(share.manifest.title || 'KML 分享')}</strong>
      ${share.manifest.description ? `<p>${escapeHtml(share.manifest.description)}</p>` : ''}
      <span>${publicKmlList.length} 个只读 KML</span>
    </section>
    ${publicKmlList.map(kmlFile => {
      const safeKmlId = escapeHtml(kmlFile.id)
      const enabled = isKmlEnabled(kmlFile)
      const expanded = expandedKmlIds.has(kmlFile.id)
      const features = kmlFile.features || []
      const visibilityTitle = enabled ? '隐藏此 KML 文件' : '显示此 KML 文件'
      return `
      <article class="kml-file-card ${enabled ? '' : 'is-disabled'}" data-kml-card-id="${safeKmlId}">
        <div class="kml-file-head ${expanded ? 'is-expanded' : ''}" data-share-kml-action="toggle-collapse" data-kml-id="${safeKmlId}" aria-expanded="${expanded}" title="展开或收起 KML 要素">
          <div class="kml-file-title">
            <span class="kml-file-name" title="${escapeHtml(kmlFile.name)}">${escapeHtml(kmlFile.name)}</span>
            <span class="kml-file-count">${features.length}</span>
            ${kmlFile.loadError ? '<span class="kml-file-state">加载失败</span>' : '<span class="kml-file-state">只读</span>'}
            ${enabled ? '' : '<span class="kml-file-state">已隐藏</span>'}
          </div>
          <div class="kml-file-actions">
            <button type="button" class="kml-file-btn kml-visibility-btn ${enabled ? 'is-visible' : 'is-hidden'}" data-share-kml-action="toggle-visible" data-kml-id="${safeKmlId}" aria-label="${visibilityTitle}" aria-pressed="${enabled}" title="${visibilityTitle}"><span class="kml-eye-icon" aria-hidden="true"></span></button>
            ${features.length ? `<button type="button" class="kml-file-btn" data-share-kml-action="focus-layer" data-kml-id="${safeKmlId}" title="定位到此 KML 的完整范围" aria-label="定位到此 KML 的完整范围">⌖</button>` : ''}
            ${kmlFile.allowDownload ? `<button type="button" class="kml-file-btn" data-share-kml-action="export" data-kml-id="${safeKmlId}" title="下载 KML" aria-label="下载 KML">⇩</button>` : ''}
          </div>
        </div>
        <div class="kml-file-detail" id="features-${safeKmlId}" style="display: ${expanded ? 'flex' : 'none'};">
          ${kmlFile.loadError ? `<p class="kml-share-item-error">${escapeHtml(kmlFile.loadError)}</p>` : ''}
          <div class="kml-features-list">
            ${features.map(feature => {
              const safeFeatureId = escapeHtml(feature.id)
              const fallbackName = feature.type === 'LineString'
                ? '未命名线段'
                : feature.type === 'Polygon' ? '未命名区域' : '未命名点位'
              const featureName = feature.name || fallbackName
              return `
                <div class="kml-feature-item" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}">
                  <div class="kml-feature-info" data-share-kml-action="focus-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}">
                    <span class="kml-feature-icon">${getKmlFeatureListIcon(feature)}</span>
                    <span class="kml-feature-name" title="${escapeHtml(featureName)}">${escapeHtml(featureName)}</span>
                  </div>
                </div>
              `
            }).join('') || (kmlFile.loadError ? '' : '<div class="kml-empty">此 KML 没有可显示的点、线或面</div>')}
          </div>
        </div>
      </article>
    `
    }).join('')}
  `
}

async function initShareKmlSupport (map) {
  window.getActiveKmlMarkers = getActiveKmlMarkers
  window.activateKmlFeatureForMedia = (item, options) => activateFeatureForMedia(map, item, options)
  kmlList = []
  publicKmlList = await loadActiveShareFiles()
  expandedKmlIds.clear()
  const firstExpandable = publicKmlList.find(kmlFile => !kmlFile.loadError && (kmlFile.features || []).length)
  if (firstExpandable) expandedKmlIds.add(firstExpandable.id)
  renderAllKmls(map)
  const fitted = fitKmlFilesBounds(
    map,
    publicKmlList.filter(kmlFile => isKmlEnabled(kmlFile) && !kmlFile.loadError),
    { animate: false }
  )
  if (fitted) renderAllKmls(map)
  renderShareKmlPanel(map)
  map.on('moveend zoomend', () => scheduleKmlViewportRerender(map))

  const panel = document.getElementById('kml-panel')
  const dropzone = document.getElementById('kml-import-dropzone')
  const createButton = panel?.querySelector('[data-kml-action="create-file"]')
  const twoBuluImportButton = panel?.querySelector('[data-kml-action="import-2bulu"]')
  const correctionOption = panel?.querySelector('.kml-import-option')
  if (dropzone) dropzone.hidden = true
  if (createButton) createButton.hidden = true
  if (twoBuluImportButton) twoBuluImportButton.hidden = true
  if (correctionOption) correctionOption.hidden = true
  if (!panel) return

  L.DomEvent.disableScrollPropagation(panel)
  L.DomEvent.disableClickPropagation(panel)
  window.toggleKmlPanel = () => {
    panel.hidden = !panel.hidden
    if (!panel.hidden) renderShareKmlPanel(map)
  }
  panel.querySelector('.kml-close-btn')?.addEventListener('click', () => {
    panel.hidden = true
  })
  panel.addEventListener('click', event => {
    const target = event.target.closest('[data-share-kml-action]')
    if (!target) return
    const action = target.dataset.shareKmlAction
    const kmlFile = publicKmlList.find(item => item.id === target.dataset.kmlId)
    if (!kmlFile) return
    if (action === 'toggle-collapse') {
      if (expandedKmlIds.has(kmlFile.id)) expandedKmlIds.delete(kmlFile.id)
      else expandedKmlIds.add(kmlFile.id)
      renderShareKmlPanel(map)
    } else if (action === 'toggle-visible') {
      kmlFile.enabled = !kmlFile.enabled
      renderKmlLayers(map, kmlFile)
      renderShareKmlPanel(map)
    } else if (action === 'focus-layer') {
      if (!isKmlEnabled(kmlFile)) {
        showAlert('该 KML 文件已隐藏，请先启用后查看。')
        return
      }
      fitKmlFilesBounds(map, [kmlFile])
    } else if (action === 'focus-feature' && target.dataset.featureId) {
      focusFeature(map, kmlFile.id, target.dataset.featureId)
    } else if (action === 'export' && kmlFile.allowDownload) {
      downloadKmlFile(kmlFile.name, generateKmlText(kmlFile.name, kmlFile.features))
    }
  })
}

export async function initKmlSupport (map) {
  bindKmlPopupActions(map)
  if (getActiveShare()) {
    await initShareKmlSupport(map)
    return
  }
  window.getActiveKmlMarkers = getActiveKmlMarkers
  window.activateKmlFeatureForMedia = (item, options) => activateFeatureForMedia(map, item, options)
  bindKmlAccountSyncStatus()
  bindKmlAccountConflictRecovery((files) => {
    kmlList = files.map(normalizeKmlFile)
    renderAllKmls(map)
    updateKmlPanelUI(map)
    return kmlList
  })
  bindAccountSessionExpiry(map)
  await loadInitialKmlFiles()
  initCustomControlsListeners()

  // 注册视口变化监听，按需重渲染轨迹 KML 图层
  map.on('moveend zoomend', () => scheduleKmlViewportRerender(map))

  loadPublicKmls(map).then(() => {
    renderAllKmls(map)
    updateKmlPanelUI(map)
    checkPublicKmlEditMode(map)
  })

  initLongPressPointCreation(map)
  
  const panel = document.getElementById('kml-panel')
  const fileInput = document.getElementById('kml-file-input')
  const correctionInput = document.getElementById('kml-coordinate-correction')
  const dropzone = document.getElementById('kml-import-dropzone')
  const createButton = panel?.querySelector('[data-kml-action="create-file"]')
  const twoBuluImportButton = panel?.querySelector('[data-kml-action="import-2bulu"]')
  const correctionOption = panel?.querySelector('.kml-import-option')

  if (twoBuluImportButton) {
    twoBuluImportButton.hidden = !canImportTwoBuluKml()
    subscribeTwoBuluHelper(() => {
      twoBuluImportButton.hidden = !canImportTwoBuluKml()
    })
    probeTwoBuluHelper().catch(() => {})
  }

  if (!canWritePersonalKml()) {
    if (dropzone) dropzone.hidden = true
    if (createButton) createButton.hidden = true
    if (correctionOption) correctionOption.hidden = true
  }
  
  if (panel) {
    L.DomEvent.disableScrollPropagation(panel)
    L.DomEvent.disableClickPropagation(panel)
  }

  const kmlActions = {
    toggleKmlPanel: () => {
      panel.hidden = !panel.hidden
      if (!panel.hidden) {
        updateKmlPanelUI(map)
      }
    },
    closeKmlPanel: () => {
      panel.hidden = true
      if (isAddingPoint) {
        togglePickupMode(map, null)
      }
    }
  }
  
  window.toggleKmlPanel = kmlActions.toggleKmlPanel
  
  panel.querySelector('.kml-close-btn').addEventListener('click', kmlActions.closeKmlPanel)
  
  dropzone.addEventListener('click', () => {
    if (!canWritePersonalKml()) return
    fileInput.click()
  })
  
  fileInput.addEventListener('change', (e) => {
    if (!canWritePersonalKml()) {
      e.target.value = ''
      showAlert('当前账号只有 KML 查看权限，不能导入文件。')
      return
    }
    const file = e.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target.result
        const features = parseKML(text)
        
        if (features.length === 0) {
          showAlert('KML 文件中未找到有效的点、线、面要素')
          return
        }
        
        const newKml = createKmlFile({
          name: file.name,
          coordCorrection: correctionInput?.checked === false ? 'none' : KML_COORD_CORRECTION,
          features
        })
        
        kmlList.splice(1, 0, newKml)
        expandedKmlIds.add(newKml.id)
        rememberTargetKmlId(newKml.id)
        saveToStorage()
        
        renderKmlLayers(map, newKml)
        updateKmlPanelUI(map)
        focusFeature(map, newKml.id, features[0].id)
      } catch (err) {
        showAlert(err.message || '导入 KML 文件时出错，请确认格式是否正确。')
      } finally {
        fileInput.value = ''
      }
    }
    reader.readAsText(file)
  })
  
  panel.addEventListener('click', async (event) => {
    const target = event.target
    if (target.closest('.kml-correction-switch')) {
      event.stopPropagation()
      return
    }

    const actionTarget = target.closest('[data-kml-action]')
    if (!actionTarget) return
    
    const action = actionTarget.getAttribute('data-kml-action')
    const kmlId = actionTarget.getAttribute('data-kml-id')
    const featureId = actionTarget.getAttribute('data-feature-id')

    if (action === 'import-2bulu') {
      event.stopPropagation()
      await handleTwoBuluImport(map, actionTarget, correctionInput)
      return
    }

    if (action === 'create-file') {
      event.stopPropagation()
      await handleCreateKmlFile(map)
      return
    }

    if (action === 'rename-file') {
      event.stopPropagation()
      await handleRenameKmlFile(map, kmlId)
      return
    }

    if (action === 'toggle-section') {
      const sectionId = actionTarget.getAttribute('data-section-id')
      if (expandedKmlIds.has(sectionId)) {
        expandedKmlIds.delete(sectionId)
      } else {
        expandedKmlIds.add(sectionId)
      }
      updateKmlPanelUI(map)
      return
    }

    if (action === 'refresh-public') {
      event.stopPropagation()
      loadPublicKmls(map).then(() => {
        renderAllKmls(map)
        updateKmlPanelUI(map)
        showAlert('公共图层已刷新')
      })
      return
    }

    if (action === 'manage-share') {
      event.stopPropagation()
      if (!canManagePersonalShares()) {
        await showAlert('当前账号没有管理个人分享的权限。')
        return
      }
      window.location.href = `/account/kml?shareKmlId=${encodeURIComponent(kmlId)}`
      return
    }

    if (action === 'share-file') {
      event.stopPropagation()
      if (!isAdminLoggedIn()) {
        await showAlert('当前账号没有管理公共 KML 的权限。')
        return
      }
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return

      const confirmed = await showConfirm(`确认将个人图层“${escapeHtml(kmlFile.name)}”共享为公共 KML 图层吗？`)
      if (!confirmed) return

      try {
        await apiRequest('/admin/kml', {
          method: 'POST',
          body: {
            name: kmlFile.name,
            features: kmlFile.features,
            coordCorrection: kmlFile.coordCorrection,
            status: 'published'
          },
        })
        showAlert('共享成功！所有用户刷新页面后可见。')
        await loadPublicKmls(map)
        updateKmlPanelUI(map)
      } catch (err) {
        showAlert(`共享失败: ${err.message}`)
      }
      return
    }

    if (action === 'toggle-collapse') {
      const listDiv = document.getElementById(`features-${kmlId}`)
      if (listDiv) {
        const willExpand = listDiv.style.display === 'none'
        listDiv.style.display = willExpand ? 'flex' : 'none'
        if (willExpand) {
          expandedKmlIds.add(kmlId)
          
          const kmlFile = publicKmlList.find(k => k.id === kmlId)
          if (kmlFile && kmlFile.enabled && (!kmlFile.features || kmlFile.features.length === 0)) {
            try {
              const detail = await window.fetch(`/api/v1/kml/shared/${kmlFile.id}`).then(res => res.json()).then(payload => payload.result)
              kmlFile.features = detail.features || []
              renderKmlLayers(map, kmlFile)
              updateKmlPanelUI(map)
            } catch (err) {
              showAlert('加载公共图层详情失败')
            }
          }
        } else {
          expandedKmlIds.delete(kmlId)
        }
      }
      return
    }

    if (action === 'toggle-visible') {
      event.stopPropagation()
      let kmlFile = publicKmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        kmlFile.enabled = !kmlFile.enabled
        publicKmlPrefs[kmlFile.id] = kmlFile.enabled
        savePublicPrefs()

        if (kmlFile.enabled && (!kmlFile.features || kmlFile.features.length === 0)) {
          try {
            const detail = await window.fetch(`/api/v1/kml/shared/${kmlFile.id}`).then(res => res.json()).then(payload => payload.result)
            kmlFile.features = detail.features || []
          } catch (err) {
            showAlert('加载公共图层详情失败')
          }
        }

        renderKmlLayers(map, kmlFile)
        updateKmlPanelUI(map)
        return
      }

      kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return
      if (kmlFile.isDefault) return
      if (!canWritePersonalKml()) {
        await showAlert('当前账号只有 KML 查看权限，不能修改显隐状态。')
        return
      }

      kmlFile.enabled = !isKmlEnabled(kmlFile)
      saveToStorage()

      if (isAddingPoint && activeKmlIdForAdd === kmlId && !isKmlEnabled(kmlFile)) {
        togglePickupMode(map, null)
      }

      renderKmlLayers(map, kmlFile)
      updateKmlPanelUI(map)
      return
    }
    
    if (action === 'focus-feature') {
      focusFeature(map, kmlId, featureId)
      return
    }
    
    if (action === 'delete-feature') {
      event.stopPropagation()
      await handleDeleteFeature(map, kmlId, featureId)
      return
    }
    
    if (action === 'delete-file') {
      event.stopPropagation()
      if (!canWritePersonalKml()) {
        await showAlert('当前账号只有 KML 查看权限，不能删除文件。')
        return
      }
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile?.isDefault) {
        showAlert('默认 KML 文件会一直保留，不能删除。')
        return
      }

      const confirmed = await showConfirm('确认删除此 KML 文件及其中所有的标注？')
      if (!confirmed) return
      
      const index = kmlList.findIndex(k => k.id === kmlId)
      if (index !== -1) {
        pushKmlHistory()
        if (isAddingPoint && activeKmlIdForAdd === kmlId) {
          togglePickupMode(map, null)
        }

        kmlList[index].features.forEach(feat => {
          featureLayers.delete(getFeatureLayerKey(kmlId, feat.id))
        })
        kmlList.splice(index, 1)
        expandedKmlIds.delete(kmlId)
        if (getRememberedTargetKmlId() === kmlId) {
          rememberTargetKmlId(DEFAULT_KML_ID)
        }
        saveToStorage()
        
        if (kmlLayerGroups.has(kmlId)) {
          map.removeLayer(kmlLayerGroups.get(kmlId))
          kmlLayerGroups.delete(kmlId)
        }
        
        updateKmlPanelUI(map)
      }
      return
    }
    
    if (action === 'export') {
      event.stopPropagation()
      let kmlFile = publicKmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        if (!kmlFile.features || kmlFile.features.length === 0) {
          try {
            const detail = await window.fetch(`/api/v1/kml/shared/${kmlFile.id}`).then(res => res.json()).then(payload => payload.result)
            kmlFile.features = detail.features || []
          } catch (err) {
            showAlert('获取数据失败')
            return
          }
        }
        const kmlText = generateKmlText(kmlFile.name, kmlFile.features)
        downloadKmlFile(kmlFile.name, kmlText)
        return
      }

      kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        const kmlText = generateKmlText(kmlFile.name, kmlFile.features)
        downloadKmlFile(kmlFile.name, kmlText)
      }
      return
    }
    
    if (action === 'add-point') {
      event.stopPropagation()
      const kmlFile = kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
      if (!isKmlEditable(kmlFile)) {
        await showAlert('目标 KML 当前为只读，不能新增标注。')
        return
      }
      if (!isKmlEnabled(kmlFile)) {
        showAlert('该 KML 文件已隐藏，请先启用后再新增标注。')
        return
      }
      togglePickupMode(map, kmlId)
      return
    }
  })

  panel.addEventListener('change', (event) => {
    const target = event.target
    if (target.matches('[data-kml-correction]')) {
      const kmlId = target.getAttribute('data-kml-id')
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return
      if (!canWritePersonalKml()) {
        updateKmlPanelUI(map)
        return
      }

      kmlFile.coordCorrection = target.checked ? KML_COORD_CORRECTION : 'none'
      saveToStorage()
      if (isKmlEnabled(kmlFile)) {
        renderKmlLayers(map, kmlFile)
      }
      updateKmlPanelUI(map)
      return
    }

    if (target.matches('[data-kml-lock-drag]')) {
      const kmlId = target.getAttribute('data-kml-id')
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return
      if (!canWritePersonalKml()) {
        updateKmlPanelUI(map)
        return
      }

      kmlFile.lockDrag = target.checked
      saveToStorage()
      if (isKmlEnabled(kmlFile)) {
        renderKmlLayers(map, kmlFile)
      }
      updateKmlPanelUI(map)
      return
    }

    if (target.matches('.kml-theme-select')) {
      const kmlId = target.getAttribute('data-kml-id')
      let kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        if (!canWritePersonalKml()) {
          updateKmlPanelUI(map)
          return
        }
        kmlFile.theme = target.value
        saveToStorage()
      } else {
        kmlFile = publicKmlList.find(k => k.id === kmlId)
        if (kmlFile) {
          kmlFile.theme = target.value
          publicKmlPrefs[kmlFile.id + '_theme'] = target.value
          savePublicPrefs()
        }
      }
      if (kmlFile && isKmlEnabled(kmlFile)) {
        renderKmlLayers(map, kmlFile)
      }
      updateKmlPanelUI(map)
      return
    }

    if (target.matches('.kml-color-input')) {
      const kmlId = target.getAttribute('data-kml-id')
      let kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        if (!canWritePersonalKml()) {
          updateKmlPanelUI(map)
          return
        }
        kmlFile.color = target.value
        saveToStorage()
      } else {
        kmlFile = publicKmlList.find(k => k.id === kmlId)
        if (kmlFile) {
          kmlFile.color = target.value
          publicKmlPrefs[kmlFile.id + '_color'] = target.value
          savePublicPrefs()
        }
      }
      if (kmlFile && isKmlEnabled(kmlFile)) {
        renderKmlLayers(map, kmlFile)
      }
      updateKmlPanelUI(map)
      return
    }
  })
  
  // 监听键盘事件，在非辅助线模式下支持 KML 位置与数据的撤销与重做
  document.addEventListener('keydown', (event) => {
    // 规避冲突：若当前已激活辅助线模式，键盘快捷键优先给辅助线模块使用
    if (typeof window.getIsGuidelineModeActive === 'function' && window.getIsGuidelineModeActive()) return

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const modifier = isMac ? event.metaKey : event.ctrlKey

    if (modifier) {
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redoKml(map)
        } else {
          undoKml(map)
        }
      } else if (key === 'y') {
        event.preventDefault()
        redoKml(map)
      }
    }
  })
}

// 导出所有当前在地图上渲染的 KML 标记点图层，供碰撞检测与反点击穿透使用
export function getActiveKmlMarkers () {
  const markers = []
  featureLayers.forEach(layer => {
    if (layer instanceof L.Marker) {
      markers.push(layer)
    }
  })
  return markers
}

// KML 历史堆栈及撤销/反撤销状态实现
const kmlUndoStack = []
const kmlRedoStack = []

export function pushKmlHistory () {
  if (!canWritePersonalKml() && !isEditingPublicKml) return
  kmlUndoStack.push(JSON.parse(JSON.stringify(kmlList)))
  if (kmlUndoStack.length > 50) {
    kmlUndoStack.shift()
  }
  kmlRedoStack.length = 0
}

export function undoKml (map) {
  if (!canWritePersonalKml()) return
  if (kmlUndoStack.length === 0) return
  kmlRedoStack.push(JSON.parse(JSON.stringify(kmlList)))
  kmlList = kmlUndoStack.pop()
  saveToStorage()
  renderAllKmls(map)
  updateKmlPanelUI(map)
}

export function redoKml (map) {
  if (!canWritePersonalKml()) return
  if (kmlRedoStack.length === 0) return
  kmlUndoStack.push(JSON.parse(JSON.stringify(kmlList)))
  kmlList = kmlRedoStack.pop()
  saveToStorage()
  renderAllKmls(map)
  updateKmlPanelUI(map)
}

// 阻止 KML 气泡 DOM 上的所有交互事件向地图冒泡，防止点击穿透
function preventAllKmlPropagation (el) {
  if (!el) return
  const events = [
    'click', 'dblclick',
    'mousedown', 'mouseup',
    'touchstart', 'touchend', 'touchmove',
    'pointerdown', 'pointerup', 'pointermove',
    'contextmenu'
  ]
  events.forEach(evt => {
    el.addEventListener(evt, (e) => {
      e.stopPropagation()
    })
  })
}

export function createTrackKml2d (name) {
  if (!canWritePersonalKml()) return null
  let kmlFile = null
  try {
    kmlFile = {
      id: `kml-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: name || '未命名轨迹',
      enabled: true,
      isDefault: false,
      theme: 'simple',
      coordCorrection: KML_COORD_CORRECTION,
      lockDrag: true, // 默认开启锁定点位移动限制，防止意外拖动
      isLiveTrack: true,
      renderPointLimit: LIVE_TRACK_RENDER_POINT_LIMIT,
      renderLinePointLimit: LIVE_TRACK_RENDER_LINE_POINT_LIMIT,
      features: []
    }
    kmlList.splice(1, 0, kmlFile)
    saveToStorage()
    return kmlFile.id
  } catch (err) {
    if (kmlFile) {
      const index = kmlList.indexOf(kmlFile)
      if (index >= 0) kmlList.splice(index, 1)
    }
    console.error('createTrackKml2d failed:', err)
    return null
  }
}

export function hasTrackKml2d (kmlId) {
  return Boolean(kmlId && kmlList.some(kmlFile => kmlFile.id === kmlId))
}

export function updateTrackKml2d (map, kmlId, historyPoints, lastPosition, onlyLine = false, completedSegments = []) {
  if (!canWritePersonalKml()) return false
  try {
    const kmlFile = kmlList.find(k => k.id === kmlId)
    if (!kmlFile) return false

    const segments = buildTrackSegments(historyPoints, lastPosition, completedSegments)
    const allPts = segments.flat()
    const coordinatesForPoint = (pt) => {
      let lat = null
      let lng = null
      if (pt && pt.latlng) {
        if (Array.isArray(pt.latlng)) {
          lat = pt.latlng[0]
          lng = pt.latlng[1]
        } else if (typeof pt.latlng.lat === 'number' && typeof pt.latlng.lng === 'number') {
          lat = pt.latlng.lat
          lng = pt.latlng.lng
        }
      }
      if (typeof lat === 'number' && typeof lng === 'number') {
        const gcj02 = [normalizeLongitude(lng), lat]
        return gcj02ToWgs84(gcj02)
      }
      return null
    }

    const features = []
    segments.forEach((segment, segmentIndex) => {
      const lineCoordinates = segment.map(coordinatesForPoint).filter(Boolean)
      if (lineCoordinates.length <= 1) return
      let startTimeStr = '未知'
      let endTimeStr = '未知'
      let durationStr = '未知'
      if (segment.length > 0) {
        const firstPt = segment[0]
        const lastPt = segment[segment.length - 1]
        
        const formatDateTime = (ts) => {
          const d = new Date(ts)
          const year = d.getFullYear()
          const month = String(d.getMonth() + 1).padStart(2, '0')
          const date = String(d.getDate()).padStart(2, '0')
          const hours = String(d.getHours()).padStart(2, '0')
          const minutes = String(d.getMinutes()).padStart(2, '0')
          const seconds = String(d.getSeconds()).padStart(2, '0')
          return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`
        }
        
        startTimeStr = formatDateTime(firstPt.timestamp)
        endTimeStr = formatDateTime(lastPt.timestamp)
        
        const totalMs = lastPt.timestamp - firstPt.timestamp
        if (totalMs >= 0) {
          const totalSecs = Math.floor(totalMs / 1000)
          const hrs = Math.floor(totalSecs / 3600)
          const mins = Math.floor((totalSecs % 3600) / 60)
          const secs = totalSecs % 60
          
          let dur = ''
          if (hrs > 0) dur += `${hrs}小时`
          if (mins > 0 || hrs > 0) dur += `${mins}分`
          dur += `${secs}秒`
          durationStr = dur
        }
      }

      features.push({
        id: `track-line-${kmlId}-${segmentIndex}`,
        type: 'LineString',
        name: segments.length > 1 ? `移动轨迹 #${segmentIndex + 1}` : '移动轨迹',
        description: `开始时间：${startTimeStr}\n结束时间：${endTimeStr}\n持续时长：${durationStr}\n本段记录点数：${segment.length} 个`,
        coordinates: lineCoordinates
      })
    })

    if (!onlyLine) {
      allPts.forEach((pt, index) => {
        let lat = null
        let lng = null
        if (pt && pt.latlng) {
          if (Array.isArray(pt.latlng)) {
            lat = pt.latlng[0]
            lng = pt.latlng[1]
          } else if (typeof pt.latlng.lat === 'number' && typeof pt.latlng.lng === 'number') {
            lat = pt.latlng.lat
            lng = pt.latlng.lng
          }
        }
        if (typeof lat !== 'number' || typeof lng !== 'number') {
          return
        }
        const gcj02 = [normalizeLongitude(lng), lat]
        const wgs84 = gcj02ToWgs84(gcj02)
        const timeStr = new Date(pt.timestamp).toLocaleTimeString()
        
        let stayInfo = ''
        if (pt.staySeconds && pt.staySeconds > 0) {
          const mins = Math.floor(pt.staySeconds / 60)
          const secs = Math.floor(pt.staySeconds % 60)
          stayInfo = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`
        } else {
          stayInfo = '0秒'
        }

        const description = `定位时间：${timeStr}\n定位精度：${pt.accuracy ? Math.round(pt.accuracy) + ' 米' : '未知'}\n停留时长：${stayInfo}`

        features.push({
          id: `track-point-${kmlId}-${index}`,
          type: 'Point',
          name: `点 #${index + 1} (${new Date(pt.timestamp).toLocaleTimeString()})`,
          description,
          coordinates: wgs84
        })
      })
    }

    // 必须在覆盖 features 前按旧 ID 清理索引；否则每轮生成的新轨迹会把旧
    // featureLayers 引用永久遗留在 Map 中，长途运行时形成持续内存泄漏。
    const oldFeatures = kmlFile.features
    kmlFile.features = features
    try {
      saveToStorage()
    } catch (err) {
      kmlFile.features = oldFeatures
      throw err
    }

    try {
      removeKmlLayers(map, { ...kmlFile, features: oldFeatures })
      renderKmlLayers(map, kmlFile)
      updateKmlPanelUI(map)
    } catch (renderError) {
      console.error('updateTrackKml2d render failed:', renderError)
    }
    return true
  } catch (err) {
    console.error('updateTrackKml2d failed:', err)
    return false
  }
}
