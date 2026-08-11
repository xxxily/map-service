import {
  Cartesian2,
  Cartesian3,
  Color,
  HeightReference,
  LabelStyle,
  PolygonHierarchy,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Math as CesiumMath,
} from 'cesium'
import { escapeHtml } from '../admin/utils.js'
import { gcj02ToWgs84, normalizeLongitude, wgs84ToGcj02Deep } from '../map/coord-transform.js'
import { generateKmlText, parseKmlDocument } from '../map/kml-format.js'
import {
  bindKmlFeaturePopupMediaActions,
  openKmlFeatureContentPanel,
  renderKmlFeaturePopupContent,
} from '../map/kml-content-panel.js'
import { renderKmlFileOverview } from '../map/kml-file-overview.js'
import { getKmlFeatureDisplayName, getKmlFeatureNamePresentation } from '../map/kml-feature-name.js'
import { getKmlMediaBillboard, getKmlMediaListIcon } from '../map/kml-media-marker.js'
import {
  applyKmlMarkerIconSelection,
  buildKmlMarkerIconField,
  getEditableKmlMarkerIcon,
  normalizeKmlFeatureMarkerIcon,
  recordKmlMarkerRecentIcon,
} from '../map/kml-marker-picker.js'
import {
  buildTrackSegments,
  cameraHeightToZoom,
  getTrackDisplayFeatures,
  LIVE_TRACK_RENDER_LINE_POINT_LIMIT,
  LIVE_TRACK_RENDER_POINT_LIMIT,
  VIEWPORT_BUFFER_RATIO,
} from '../map/location-track.js'
import { showAlert, showConfirm, showEditDialog } from '../ui/dialog.js'
import { renderCustomSelect, renderCustomColorPicker, initCustomControlsListeners } from '../ui/controls.js'
import { flyToLngLat } from './location.js'
import { apiRequest } from '../auth/api.js'
import { getAuthSnapshot, hasPermission } from '../auth/session.js'
import {
  bindKmlAccountSyncStatus,
  initializeKmlAccountMode,
  isAccountKmlMode,
  isAccountKmlWritable,
  scheduleKmlAccountSync,
  suspendKmlAccountSync,
} from '../map/kml-account-sync.js'
import {
  bindKmlAccountConflictRecovery,
  promptKmlAccountRecovery,
} from '../map/kml-account-recovery-ui.js'
import { getActiveShare, loadActiveShareFiles } from '../map/share-view.js'
import {
  enrichKmlDescriptionWithShareLinks,
  getEditableKmlDescription,
} from '../integrations/kml-share-links.js'

const KML_STORAGE_KEY = 'map_kml_list'
const KML_LAST_TARGET_KEY = 'map_kml_last_target_id'
const KML_COORD_CORRECTION = 'wgs84-to-gcj02'
const DEFAULT_KML_ID = 'default-kml'
const DEFAULT_KML_NAME = '默认标注'
const PUBLIC_PREFS_KEY = 'map_shared_kml_prefs'
const KML_POINT_LABEL_MAX_LENGTH = 18
const LONG_PRESS_DELAY_MS = 650
const LONG_PRESS_MOVE_TOLERANCE = 10

let viewerRef = null
let accountSessionExpiryBound3d = false
let kmlViewportRerenderTimer3d = null // KML 图层视口变化重渲染的 debounce timer
let lastRenderedCamLat3d = null // 上次渲染时相机纬度
let lastRenderedCamLng3d = null // 上次渲染时相机经度
let lastRenderedCamHeight3d = null // 上次渲染时相机高度
let lastRenderedZoom3d = null // 上次渲染时的等效缩放级别

/**
 * 检查当前相机位置是否仍在上次渲染的缓冲范围内，如果是则跳过重渲染。
 */
function isCameraWithinCache3d () {
  if (!viewerRef?.camera || lastRenderedCamLat3d === null || lastRenderedCamHeight3d === null) return false
  const carto = viewerRef.camera.positionCartographic
  if (!carto) return false

  const camLat = (carto.latitude * 180) / Math.PI
  const camLng = (carto.longitude * 180) / Math.PI
  const heightMeters = carto.height
  if (!Number.isFinite(heightMeters) || heightMeters <= 0) return false

  const currentZoom = cameraHeightToZoom(heightMeters)
  // 缩放级别变化超过 1 级需要重新渲染（LOD 分级不同）
  if (lastRenderedZoom3d !== null && Math.abs(currentZoom - lastRenderedZoom3d) >= 1) return false

  // 计算上次渲染时的缓冲范围
  const latRange = Math.min(90, (lastRenderedCamHeight3d / 111000) * 1.5 * VIEWPORT_BUFFER_RATIO)
  const lngRange = Math.min(180, latRange / Math.max(0.1, Math.cos(lastRenderedCamLat3d * Math.PI / 180)))

  return Math.abs(camLat - lastRenderedCamLat3d) <= latRange &&
         Math.abs(camLng - lastRenderedCamLng3d) <= lngRange
}
let kmlList = []
let publicKmlList = []
let publicKmlPrefs = {}
let isEditingPublicKml = false
let editingPublicKmlId = null
let editingPublicKml = null
let isPublicKmlDirty = false
let isAddingPoint = false
let activeKmlIdForAdd = null
let pickupToastElement = null
let featurePopupElement = null
let handler = null
let mediaFeatureActivationTimer = null

const renderedKmlEntities = new Map()
const featureEntities = new Map()
const expandedKmlIds = new Set()
const kmlUndoStack = []
const kmlRedoStack = []

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

function canManagePersonalShares () {
  return isAccountKmlMode() && hasPermission('share.own.manage', getAuthSnapshot())
}

function isKmlEditable (kmlFile) {
  if (kmlFile?.isPublic) {
    return isEditingPublicKml && editingPublicKmlId === kmlFile.id
  }
  return Boolean(kmlFile && canWritePersonalKml())
}

function saveKmlChanges (kmlFile) {
  if (kmlFile?.isPublic) {
    isPublicKmlDirty = true
  } else if (canWritePersonalKml()) {
    saveToStorage()
  }
}

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
    description: String(kmlFile.description || '').slice(0, 10000),
    isDefault,
    theme: kmlFile.theme || 'default',
    color: kmlFile.color || '#0f766e',
    coordCorrection: kmlFile.coordCorrection || KML_COORD_CORRECTION,
    lockDrag: kmlFile.lockDrag === true,
    enabled: kmlFile.enabled !== false,
    features: Array.isArray(kmlFile.features) ? kmlFile.features.map(normalizeKmlFeatureMarkerIcon) : [],
  }
}

function createKmlFile (options = {}) {
  const isDefault = Boolean(options.isDefault)
  return normalizeKmlFile({
    id: isDefault && !isAccountKmlMode()
      ? DEFAULT_KML_ID
      : `kml-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: options.name || (isDefault ? DEFAULT_KML_NAME : '新建 KML 文件'),
    description: options.description || '',
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

  const changed = defaultIndex !== 0 ||
    previousDefault.id !== defaultFile.id ||
    previousDefault.name !== defaultFile.name ||
    previousDefault.isDefault !== defaultFile.isDefault ||
    previousDefault.coordCorrection !== defaultFile.coordCorrection ||
    previousDefault.enabled !== defaultFile.enabled

  kmlList.splice(defaultIndex, 1)
  kmlList.unshift(defaultFile)
  return changed
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

function getPointLatLng (kmlFile, feature) {
  const coordinates = getMapCoordinates(kmlFile, feature)
  return {
    lat: coordinates[1],
    lng: coordinates[0],
  }
}

function getLineCoordinates (kmlFile, feature) {
  return getMapCoordinates(kmlFile, feature).flatMap(coord => [coord[0], coord[1]])
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

function getFeatureLabel (feature) {
  const name = getKmlFeatureDisplayName(feature).replace(/\s+/g, ' ').trim()
  if (!name) return ''
  if (name.length <= KML_POINT_LABEL_MAX_LENGTH) return name
  return `${name.slice(0, KML_POINT_LABEL_MAX_LENGTH)}...`
}

function createPointFeature (kmlFile, latlng, result) {
  const feature = {
    id: `feat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: 'Point',
    name: result.name.trim(),
    description: result.description.trim(),
    coordinates: mapLatLngToStoredCoordinate(kmlFile, latlng),
  }
  return applyKmlMarkerIconSelection(feature, result.markerIcon)
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

function pushKmlHistory () {
  if (!canWritePersonalKml() && !isEditingPublicKml) return
  kmlUndoStack.push(JSON.parse(JSON.stringify(kmlList)))
  if (kmlUndoStack.length > 50) {
    kmlUndoStack.shift()
  }
  kmlRedoStack.length = 0
}

function undoKml () {
  if (!canWritePersonalKml()) return
  if (kmlUndoStack.length === 0) return
  kmlRedoStack.push(JSON.parse(JSON.stringify(kmlList)))
  kmlList = kmlUndoStack.pop()
  saveToStorage()
  renderAllKmls()
  updateKmlPanelUI()
}

function redoKml () {
  if (!canWritePersonalKml()) return
  if (kmlRedoStack.length === 0) return
  kmlUndoStack.push(JSON.parse(JSON.stringify(kmlList)))
  kmlList = kmlRedoStack.pop()
  saveToStorage()
  renderAllKmls()
  updateKmlPanelUI()
}

function markEntity (entity, kmlId, featureId) {
  entity._map3dKmlFeature = { kmlId, featureId }
  return entity
}

function getKmlFileById (kmlId) {
  return kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
}

function getFeatureById (kmlId, featureId) {
  const kmlFile = getKmlFileById(kmlId)
  return {
    kmlFile,
    feature: kmlFile?.features?.find(feature => feature.id === featureId),
  }
}

function getFeatureEntityKey (kmlId, featureId) {
  return JSON.stringify([String(kmlId || ''), String(featureId || '')])
}

function addRenderedEntity (kmlId, entity) {
  if (!renderedKmlEntities.has(kmlId)) {
    renderedKmlEntities.set(kmlId, new Set())
  }
  renderedKmlEntities.get(kmlId).add(entity)
}

function renderFeature (kmlFile, feature) {
  if (!viewerRef) return null
  const kmlId = kmlFile.id
  const entities = []
  const theme = getKmlTheme(kmlFile)
  const colorHex = getKmlColor(kmlFile)
  const color = Color.fromCssColorString(colorHex)

  if (feature.type === 'Point') {
    const point = getPointLatLng(kmlFile, feature)
    const mediaBillboard = getKmlMediaBillboard(feature)
    
    const pointGraphics = {
      pixelSize: theme === 'simple' ? 8 : 11,
      color: theme === 'simple' ? Color.fromCssColorString(colorHex) : color,
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    }

    const labelText = theme === 'simple' ? '' : getFeatureLabel(feature)
    const labelGraphics = labelText ? {
      text: labelText,
      font: '12px sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, mediaBillboard ? -43 : -18),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    } : undefined

    const entity = markEntity(viewerRef.entities.add({
      name: getKmlFeatureDisplayName(feature),
      position: Cartesian3.fromDegrees(point.lng, point.lat, 8),
      point: mediaBillboard ? undefined : pointGraphics,
      billboard: mediaBillboard
        ? {
            image: mediaBillboard.image,
            width: mediaBillboard.iconSize[0],
            height: mediaBillboard.iconSize[1],
            verticalOrigin: VerticalOrigin.BOTTOM,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        : undefined,
      label: labelGraphics
    }), kmlId, feature.id)
    entities.push(entity)
  } else if (feature.type === 'LineString') {
    const positions = Cartesian3.fromDegreesArray(getLineCoordinates(kmlFile, feature))
    const entity = markEntity(viewerRef.entities.add({
      name: feature.name || 'KML 线',
      polyline: {
        positions,
        width: 4,
        material: color.withAlpha(0.88),
        clampToGround: true,
      },
    }), kmlId, feature.id)
    entities.push(entity)
  } else if (feature.type === 'Polygon') {
    const positions = Cartesian3.fromDegreesArray(getLineCoordinates(kmlFile, feature))
    const polygon = markEntity(viewerRef.entities.add({
      name: feature.name || 'KML 面',
      polygon: {
        hierarchy: new PolygonHierarchy(positions),
        material: color.withAlpha(0.18),
        outline: true,
        outlineColor: color,
        heightReference: HeightReference.CLAMP_TO_GROUND,
      },
    }), kmlId, feature.id)
    const outline = markEntity(viewerRef.entities.add({
      name: `${feature.name || 'KML 面'} 外框`,
      polyline: {
        positions: [...positions, positions[0]].filter(Boolean),
        width: 3,
        material: color.withAlpha(0.9),
        clampToGround: true,
      },
    }), kmlId, feature.id)
    entities.push(polygon, outline)
  }

  if (entities.length) {
    entities.forEach(entity => addRenderedEntity(kmlId, entity))
    featureEntities.set(getFeatureEntityKey(kmlId, feature.id), {
      kmlId,
      featureId: feature.id,
      entities,
      primary: entities[0],
    })
  }

  return entities
}

function removeKmlLayers (kmlFileOrId) {
  if (!viewerRef) return
  const kmlId = typeof kmlFileOrId === 'string' ? kmlFileOrId : kmlFileOrId.id
  const entities = renderedKmlEntities.get(kmlId)
  if (entities) {
    entities.forEach(entity => viewerRef.entities.remove(entity))
    renderedKmlEntities.delete(kmlId)
  }

  const kmlFile = typeof kmlFileOrId === 'string' ? getKmlFileById(kmlFileOrId) : kmlFileOrId
  const renderedFeatures = kmlFile?.isShare
    ? (kmlFile.features || [])
    : getTrackDisplayFeatures(kmlFile)
  renderedFeatures.forEach(feature => {
    featureEntities.delete(getFeatureEntityKey(kmlId, feature.id))
  })
}

// 辅助函数：从 Cesium viewer 获取视口参数
function getViewportOptions3d () {
  if (!viewerRef?.camera) return {}
  const carto = viewerRef.camera.positionCartographic
  if (!carto) return {}
  const zoom = cameraHeightToZoom(carto.height)
  return { zoom, viewer3d: viewerRef }
}

function renderKmlLayers (kmlFile) {
  removeKmlLayers(kmlFile)
  if (!isKmlEnabled(kmlFile)) return
  const viewportOptions = getViewportOptions3d()
  const displayFeatures = kmlFile.isShare
    ? (kmlFile.features || [])
    : getTrackDisplayFeatures(kmlFile, viewportOptions)
  displayFeatures.forEach(feature => renderFeature(kmlFile, feature))

  // 更新视口缓存：live track 渲染后记录当前相机位置，用于后续跳过判断
  if (kmlFile.isLiveTrack && viewerRef?.camera) {
    const carto = viewerRef.camera.positionCartographic
    if (carto) {
      lastRenderedCamLat3d = (carto.latitude * 180) / Math.PI
      lastRenderedCamLng3d = (carto.longitude * 180) / Math.PI
      lastRenderedCamHeight3d = carto.height
      lastRenderedZoom3d = cameraHeightToZoom(carto.height)
    }
  }
}

function renderAllKmls () {
  if (!viewerRef) return
  renderedKmlEntities.forEach(entities => {
    entities.forEach(entity => viewerRef.entities.remove(entity))
  })
  renderedKmlEntities.clear()
  featureEntities.clear()

  kmlList.forEach(kmlFile => renderKmlLayers(kmlFile))
  publicKmlList.forEach(kmlFile => renderKmlLayers(kmlFile))
}

function bindAccountSessionExpiry3d () {
  if (accountSessionExpiryBound3d || typeof window === 'undefined') return
  accountSessionExpiryBound3d = true
  window.addEventListener('map-auth-session-expired', () => {
    if (!isAccountKmlMode()) return
    suspendKmlAccountSync({ preserveDraft: true, reason: 'session-expired' })
    loadFromStorage()
    renderAllKmls()
    updateKmlPanelUI()
    showAlert('登录已失效，未同步的账号 KML 已保存在该用户专属恢复草稿中。当前页面已切换回访客本地 KML，请重新登录同一账号后恢复。')
  })
}

function closeFeaturePopup () {
  featurePopupElement?.remove()
  featurePopupElement = null
}

function showFeaturePopup (kmlId, featureId, windowPosition) {
  const { kmlFile, feature } = getFeatureById(kmlId, featureId)
  if (!kmlFile || !feature) return
  closeFeaturePopup()

  const popup = document.createElement('div')
  popup.className = 'map3d-feature-popup'
  popup.innerHTML = `
    <button type="button" class="map3d-popup-close" aria-label="关闭">×</button>
    ${renderKmlFeaturePopupContent(kmlFile, feature, isKmlEditable(kmlFile))}
  `

  const popupWidth = Math.min(354, Math.max(280, window.innerWidth - 24))
  const popupHeight = feature.description ? 350 : 300
  const x = Math.min(Math.max(Number(windowPosition?.x || window.innerWidth / 2), popupWidth / 2 + 12), window.innerWidth - popupWidth / 2 - 12)
  const y = Math.min(Math.max(Number(windowPosition?.y || window.innerHeight / 2), popupHeight + 12), window.innerHeight - 12)
  popup.style.left = `${x}px`
  popup.style.top = `${y}px`

  popup.addEventListener('click', (event) => {
    event.stopPropagation()
  })

  popup.querySelector('.map3d-popup-close')?.addEventListener('click', closeFeaturePopup)
  bindKmlFeaturePopupMediaActions(popup, kmlFile, feature)
  popup.querySelector('.kml-detail-btn')?.addEventListener('click', () => {
    openKmlFeatureContentPanel(kmlFile, feature)
  })
  popup.querySelector('.kml-edit-btn')?.addEventListener('click', async () => {
    await handleEditFeature(kmlId, featureId)
  })
  popup.querySelector('.kml-delete-btn')?.addEventListener('click', async () => {
    closeFeaturePopup()
    await handleDeleteFeature(kmlId, featureId)
  })

  document.body.appendChild(popup)
  featurePopupElement = popup
}

// 优先锚定深度或真实地形，避免在山地上回落到椭球面。
export function pickKmlWorldPosition (scene, camera, windowPosition) {
  if (!scene || !camera || !windowPosition) return null

  try {
    if (scene.pickPositionSupported !== false) {
      const depthPosition = scene.pickPosition?.(windowPosition)
      if (depthPosition) return depthPosition
    }
  } catch {
    // 深度拾取在首帧或没有深度纹理时可能不可用。
  }

  try {
    const ray = camera.getPickRay?.(windowPosition)
    const terrainPosition = ray ? scene.globe?.pick?.(ray, scene) : null
    if (terrainPosition) return terrainPosition
  } catch {
    // 地形数据加载过程中允许继续退化到椭球拾取。
  }

  try {
    return camera.pickEllipsoid?.(windowPosition, scene.globe?.ellipsoid) || null
  } catch {
    return null
  }
}

function getLatLngFromWindowPosition (windowPosition) {
  if (!viewerRef || !windowPosition) return null
  const cartesian = pickKmlWorldPosition(viewerRef.scene, viewerRef.camera, windowPosition)
  if (!cartesian) return null

  const cartographic = viewerRef.scene.globe.ellipsoid.cartesianToCartographic(cartesian)
  if (!cartographic) return null
  return {
    lat: CesiumMath.toDegrees(cartographic.latitude),
    lng: CesiumMath.toDegrees(cartographic.longitude),
  }
}

function focusFeature (kmlId, featureId) {
  const { kmlFile, feature } = getFeatureById(kmlId, featureId)
  if (!viewerRef || !kmlFile || !feature) return
  if (!isKmlEnabled(kmlFile)) {
    showAlert('该 KML 文件已隐藏，请先启用后查看。')
    return
  }

  const rendered = featureEntities.get(getFeatureEntityKey(kmlId, featureId))
  if (!rendered) return

  if (feature.type === 'Point') {
    const point = getPointLatLng(kmlFile, feature)
    flyToLngLat(viewerRef, point.lng, point.lat, { height: 1500, duration: 0.8 })
    setTimeout(() => {
      showFeaturePopup(kmlId, featureId, new Cartesian2(window.innerWidth / 2, window.innerHeight / 2))
    }, 850)
  } else {
    viewerRef.flyTo(rendered.entities, {
      duration: 0.8,
      offset: undefined,
    }).then(() => {
      showFeaturePopup(kmlId, featureId, new Cartesian2(window.innerWidth / 2, window.innerHeight / 2))
    }).catch(() => {})
  }
}

function activateFeatureForMedia (item, options = {}) {
  const kmlId = String(item?.kmlId || '')
  const featureId = String(item?.featureId || '')
  if (!kmlId || !featureId) return
  const { kmlFile, feature } = getFeatureById(kmlId, featureId)
  const rendered = featureEntities.get(getFeatureEntityKey(kmlId, featureId))
  if (!viewerRef || !kmlFile || !feature || !rendered || !isKmlEnabled(kmlFile)) return
  window.clearTimeout(mediaFeatureActivationTimer)
  viewerRef.camera.cancelFlight?.()
  const duration = options.closePreview ? 0 : 0.28
  if (feature.type === 'Point') {
    const point = getPointLatLng(kmlFile, feature)
    flyToLngLat(viewerRef, point.lng, point.lat, { height: 1500, duration })
  } else {
    viewerRef.flyTo(rendered.entities, { duration }).catch(() => {})
  }
  mediaFeatureActivationTimer = window.setTimeout(() => {
    showFeaturePopup(kmlId, featureId, new Cartesian2(window.innerWidth / 2, window.innerHeight / 2))
  }, options.closePreview ? 0 : 300)
}

async function handleEditFeature (kmlId, featureId) {
  const { kmlFile, feature } = getFeatureById(kmlId, featureId)
  if (!kmlFile || !feature) return
  if (!isKmlEditable(kmlFile)) {
    await showAlert('当前账号只有 KML 查看权限，不能修改标注。')
    return
  }

  const result = await showEditDialog({
    title: '修改标注属性',
    fields: [
      {
        name: 'name',
        label: '名称',
        type: 'text',
        required: false,
      },
      buildKmlMarkerIconField(getEditableKmlMarkerIcon(feature)),
      {
        name: 'description',
        label: '描述',
        type: 'textarea',
        hint: '可粘贴受支持的公开分享链接。',
      },
    ],
    values: {
      name: feature.name,
      markerIcon: getEditableKmlMarkerIcon(feature),
      description: getEditableKmlDescription(feature.description),
    },
  })

  if (!result) return
  const enriched = await enrichKmlDescriptionWithShareLinks(result.description, {
    previousDescription: feature.description,
  })
  pushKmlHistory()
  feature.name = result.name.trim()
  feature.description = enriched.description.trim()
  applyKmlMarkerIconSelection(feature, result.markerIcon)
  saveKmlChanges(kmlFile)
  recordKmlMarkerRecentIcon(result.markerIcon)
  renderKmlLayers(kmlFile)
  updateKmlPanelUI()
  showFeaturePopup(kmlId, featureId, new Cartesian2(window.innerWidth / 2, window.innerHeight / 2))
  if (enriched.warnings.length) {
    await showAlert(enriched.warnings.join('；'), { title: '点位已保存' })
  }
}

async function handleDeleteFeature (kmlId, featureId) {
  const { kmlFile, feature } = getFeatureById(kmlId, featureId)
  if (!kmlFile || !feature) return
  if (!isKmlEditable(kmlFile)) {
    await showAlert('当前账号只有 KML 查看权限，不能删除标注。')
    return
  }
  const confirmed = await showConfirm('确认删除此地图标注？')
  if (!confirmed) return

  pushKmlHistory()
  kmlFile.features = kmlFile.features.filter(item => item.id !== featureId)
  saveKmlChanges(kmlFile)
  renderKmlLayers(kmlFile)
  updateKmlPanelUI()
}

async function handleCreateKmlFile () {
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

  pushKmlHistory()
  const kmlFile = createKmlFile({ name })
  kmlList.splice(1, 0, kmlFile)
  expandedKmlIds.add(kmlFile.id)
  rememberTargetKmlId(kmlFile.id)
  saveToStorage()
  renderKmlLayers(kmlFile)
  updateKmlPanelUI()
}

async function handleRenameKmlFile (kmlId) {
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

  pushKmlHistory()
  kmlFile.name = name
  saveToStorage()
  updateKmlPanelUI()
}

async function createPointAtLatLng (latlng, options = {}) {
  if (!viewerRef || !latlng) return
  if (!canWritePersonalKml() && !isEditingPublicKml) {
    await showAlert('当前账号只有 KML 查看权限，不能新增标注。')
    return
  }
  if (canWritePersonalKml()) ensureDefaultKmlFile()
  const targetOptions = buildKmlTargetOptions()
  const allowFileSelection = options.allowFileSelection !== false && targetOptions.length > 1
  const targetKmlId = resolveTargetKmlId(options.targetKmlId)
  const fields = [
    {
      name: 'name',
      label: '标注名称',
      type: 'text',
      required: false,
    },
    buildKmlMarkerIconField('auto'),
    {
      name: 'description',
      label: '描述信息',
      type: 'textarea',
      hint: '可粘贴受支持的公开分享链接。',
    },
  ]

  if (allowFileSelection) {
    fields.unshift({
      name: 'kmlId',
      label: '保存到 KML 文件',
      type: 'select',
      options: targetOptions,
    })
  }

  const tempEntity = viewerRef.entities.add({
    position: Cartesian3.fromDegrees(latlng.lng, latlng.lat, 8),
    point: {
      pixelSize: 12,
      color: Color.fromCssColorString('#f59e0b'),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })

  const result = await showEditDialog({
    title: '新增地图标注',
    fields,
    values: {
      kmlId: targetKmlId,
      name: '',
      markerIcon: 'auto',
      description: '',
    },
  })

  viewerRef.entities.remove(tempEntity)
  if (!result) return

  const selectedKmlId = allowFileSelection ? result.kmlId : targetKmlId
  const kmlFile = getKmlFileById(selectedKmlId)
  if (!kmlFile || !isKmlEditable(kmlFile)) {
    await showAlert('目标 KML 当前为只读，不能新增标注。')
    return
  }
  if (!isKmlEnabled(kmlFile)) {
    showAlert('该 KML 文件已隐藏，请先启用后再新增标注。')
    return
  }

  const enriched = await enrichKmlDescriptionWithShareLinks(result.description)
  pushKmlHistory()
  const newFeature = createPointFeature(kmlFile, latlng, {
    ...result,
    description: enriched.description,
  })
  kmlFile.features.push(newFeature)
  expandedKmlIds.add(kmlFile.id)
  rememberTargetKmlId(kmlFile.id)
  saveKmlChanges(kmlFile)
  recordKmlMarkerRecentIcon(result.markerIcon)
  renderKmlLayers(kmlFile)
  updateKmlPanelUI()
  focusFeature(kmlFile.id, newFeature.id)
  if (enriched.warnings.length) {
    await showAlert(enriched.warnings.join('；'), { title: '点位已保存' })
  }
}

function togglePickupMode (kmlId) {
  const canvas = viewerRef?.canvas
  if (!canvas) return

  if (!isAddingPoint && kmlId && !canWritePersonalKml() && !isEditingPublicKml) {
    showAlert('当前账号只有 KML 查看权限，不能新增标注。')
    return
  }

  if (isAddingPoint) {
    isAddingPoint = false
    activeKmlIdForAdd = null
    canvas.classList.remove('map3d-pickup-active')
    pickupToastElement?.remove()
    pickupToastElement = null
    return
  }

  isAddingPoint = true
  activeKmlIdForAdd = kmlId
  canvas.classList.add('map3d-pickup-active')
  pickupToastElement = document.createElement('div')
  pickupToastElement.className = 'kml-pickup-toast'
  pickupToastElement.textContent = '请点击三维地球位置以添加点位标注'
  document.body.appendChild(pickupToastElement)
}

function initLongPressPointCreation () {
  const canvas = viewerRef?.canvas
  if (!canvas) return

  let pressState = null
  let lastLongPressAt = 0
  const activePointerIds = new Set()

  const clearPress = () => {
    pressState = null
  }

  const isInteractiveTarget = (target) => target.closest?.('.leaflet-control, #map-menu, #kml-panel, #map-search-mod, #guideline-toolbar, .map3d-feature-popup, button, a, input, textarea, select')

  const onPointerDown = (event) => {
    activePointerIds.add(event.pointerId)
    if (activePointerIds.size > 1 || event.isPrimary === false) {
      clearPress()
      return
    }
    if (typeof window.getMap3dInteractionMode === 'function' && window.getMap3dInteractionMode() === '3d') return
    if (isAddingPoint || event.button > 0 || isInteractiveTarget(event.target)) return

    const startX = event.clientX
    const startY = event.clientY
    pressState = {
      pointerId: event.pointerId,
      startedAt: Date.now(),
      startX,
      startY,
      windowPosition: new Cartesian2(event.clientX, event.clientY),
      moved: false,
    }
  }

  const onPointerMove = (event) => {
    if (!pressState || event.pointerId !== pressState.pointerId) return
    const deltaX = event.clientX - pressState.startX
    const deltaY = event.clientY - pressState.startY
    if (Math.hypot(deltaX, deltaY) > LONG_PRESS_MOVE_TOLERANCE) {
      pressState.moved = true
      clearPress()
    }
  }

  const onPointerUp = async (event) => {
    const currentPress = pressState
    activePointerIds.delete(event.pointerId)
    if (!currentPress || event.pointerId !== currentPress.pointerId) {
      return
    }

    clearPress()
    if (currentPress.moved || activePointerIds.size > 0) {
      return
    }

    const heldMs = Date.now() - currentPress.startedAt
    if (heldMs < LONG_PRESS_DELAY_MS) {
      return
    }

    lastLongPressAt = Date.now()
    const latlng = getLatLngFromWindowPosition(currentPress.windowPosition)
    await createPointAtLatLng(latlng, {
      allowFileSelection: true,
    })
  }

  const onPointerAbort = (event) => {
    activePointerIds.delete(event.pointerId)
    if (pressState && event.pointerId === pressState.pointerId) {
      clearPress()
    }
  }

  const onContextMenu = (event) => {
    if (Date.now() - lastLongPressAt < 1200) {
      event.preventDefault()
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: true })
  canvas.addEventListener('pointermove', onPointerMove, { passive: true })
  canvas.addEventListener('pointerup', onPointerUp, { passive: true })
  canvas.addEventListener('pointercancel', onPointerAbort, { passive: true })
  canvas.addEventListener('pointerleave', onPointerAbort, { passive: true })
  canvas.addEventListener('contextmenu', onContextMenu)
  const clearAllPressState = () => {
    clearPress()
    activePointerIds.clear()
  }

  window.addEventListener('blur', clearAllPressState)
  window.addEventListener('pagehide', clearAllPressState)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearAllPressState()
    }
  })
}

async function loadPublicKmls () {
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
          renderKmlLayers(kml)
        } catch (err) {
          console.error(`Failed to load public KML detail for ${kml.id}`, err)
        }
      }
    }))
  } catch (err) {
    console.error('Failed to load public KML list', err)
  }
}

async function checkPublicKmlEditMode () {
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
      enabled: true,
    }
    isPublicKmlDirty = false

    const existing = publicKmlList.find(k => k.id === editId)
    if (existing) {
      existing.enabled = true
      existing.features = editingPublicKml.features
    } else {
      publicKmlList.push(editingPublicKml)
    }

    renderKmlLayers(editingPublicKml)
    updateKmlPanelUI()
    showEditingBanner()
  } catch (err) {
    showAlert(`加载公共 KML 编辑数据失败: ${err.message}`)
  }
}

function showEditingBanner () {
  document.getElementById('public-kml-edit-banner')?.remove()
  if (!editingPublicKml) return

  const banner = document.createElement('div')
  banner.id = 'public-kml-edit-banner'
  banner.className = 'map3d-public-kml-edit-banner'
  banner.innerHTML = `
    <div>
      <span class="map3d-edit-badge">编辑公共图层</span>
      正在编辑：<strong>${escapeHtml(editingPublicKml.name)}</strong>
    </div>
    <div>
      <button type="button" id="public-kml-save-btn">保存草稿</button>
      <button type="button" id="public-kml-publish-btn">保存并发布</button>
      <button type="button" id="public-kml-exit-btn">退出</button>
    </div>
  `
  document.body.appendChild(banner)

  document.getElementById('public-kml-save-btn').addEventListener('click', () => saveEditingPublicKml('draft'))
  document.getElementById('public-kml-publish-btn').addEventListener('click', () => saveEditingPublicKml('published'))
  document.getElementById('public-kml-exit-btn').addEventListener('click', exitEditingPublicKml)
}

async function saveEditingPublicKml (status) {
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

async function exitEditingPublicKml () {
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

  await loadPublicKmls()
  renderAllKmls()
  updateKmlPanelUI()
}

function renderFeatureItem (kmlFile, feature, editable) {
  const safeKmlId = escapeHtml(kmlFile.id)
  const safeFeatureId = escapeHtml(feature.id)
  const geometryIconSvg = feature.type === 'LineString'
    ? '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>'
    : feature.type === 'Polygon'
      ? '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12 2 22 9 18 22 6 22 2 9"/></svg>'
      : '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
  const iconSvg = getKmlMediaListIcon(feature) || geometryIconSvg
  const { displayName, accessibleName } = getKmlFeatureNamePresentation(feature)

  return `
    <div class="kml-feature-item" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}">
      <div class="kml-feature-info" data-kml-action="focus-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}" aria-label="定位到${escapeHtml(accessibleName)}">
        <span class="kml-feature-icon">${iconSvg}</span>
        ${displayName ? `<span class="kml-feature-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>` : ''}
      </div>
      ${editable ? `<button type="button" class="kml-feature-del" data-kml-action="delete-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}" title="删除标注"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg></button>` : ''}
    </div>
  `
}

function renderKmlCard (kmlFile) {
  const safeKmlId = escapeHtml(kmlFile.id)
  const enabled = isKmlEnabled(kmlFile)
  const expanded = expandedKmlIds.has(kmlFile.id)
  const displayFeatures = kmlFile.isShare
    ? (kmlFile.features || [])
    : getTrackDisplayFeatures(kmlFile, getViewportOptions3d())
  const editable = isKmlEditable(kmlFile)
  const personalReadOnly = !kmlFile.isPublic && !editable
  const styleEditable = (kmlFile.isPublic && !kmlFile.isShare) || editable
  const visibilityTitle = enabled ? `隐藏此${kmlFile.isPublic ? '公共' : ''}图层` : `显示此${kmlFile.isPublic ? '公共' : ''}图层`
  const isEditingThis = isEditingPublicKml && editingPublicKmlId === kmlFile.id
  const visibilityButton = personalReadOnly || kmlFile.isDefault
    ? ''
    : `
      <button type="button" class="kml-file-btn kml-visibility-btn ${enabled ? 'is-visible' : 'is-hidden'}" data-kml-action="toggle-visible" data-kml-id="${safeKmlId}" aria-label="${visibilityTitle}" aria-pressed="${enabled}" title="${visibilityTitle}">
        <span class="kml-eye-icon" aria-hidden="true"></span>
      </button>
    `
  const shareButton = !kmlFile.isPublic && canManagePersonalShares()
    ? `<button type="button" class="kml-file-btn" data-kml-action="manage-share" data-kml-id="${safeKmlId}" title="在用户中心分享此 KML" aria-label="分享此 KML">↗</button>`
    : (!kmlFile.isPublic && isAdminLoggedIn() ? `
      <button type="button" class="kml-file-btn" data-kml-action="share-file" data-kml-id="${safeKmlId}" title="共享为公共 KML" aria-label="共享为公共 KML">
        <svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
      </button>
    ` : '')
  const deleteButton = !kmlFile.isPublic && editable && !kmlFile.isDefault
    ? `<button type="button" class="kml-file-btn delete" data-kml-action="delete-file" data-kml-id="${safeKmlId}" title="删除此 KML 文件" aria-label="删除此 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button>`
    : ''
  const renameButton = kmlFile.isPublic || !editable
    ? ''
    : `<button type="button" class="kml-file-btn" data-kml-action="rename-file" data-kml-id="${safeKmlId}" aria-label="重命名 KML 文件" title="重命名 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg></button>`

  return `
    <div class="kml-file-card ${enabled ? '' : 'is-disabled'}" data-kml-card-id="${safeKmlId}">
      <div class="kml-file-head ${expanded ? 'is-expanded' : ''}" data-kml-action="toggle-collapse" data-kml-id="${safeKmlId}" aria-expanded="${expanded}" title="点击展开 KML 详情、操作和要素">
        <div class="kml-file-title">
          <span class="kml-file-name" title="${escapeHtml(kmlFile.name)}">${escapeHtml(kmlFile.name)}</span>
          <span class="kml-file-count">${kmlFile.features ? kmlFile.features.length : (kmlFile.featureCount || 0)}</span>
          ${kmlFile.isShare ? '<span class="kml-file-state">只读</span>' : (kmlFile.isPublic ? '<span class="kml-file-state is-default">公共</span>' : '')}
          ${kmlFile.isDefault ? '<span class="kml-file-state is-default">默认</span>' : ''}
          ${personalReadOnly ? '<span class="kml-file-state">只读</span>' : ''}
          ${isEditingThis ? '<span class="kml-file-state is-default">编辑中</span>' : ''}
          ${enabled ? '' : '<span class="kml-file-state">已隐藏</span>'}
        </div>
        <div class="kml-file-actions">
          ${renameButton}
          ${shareButton}
          ${visibilityButton}
        </div>
      </div>
      ${kmlFile.loadError ? `<p class="kml-share-item-error">${escapeHtml(kmlFile.loadError)}</p>` : ''}
      <div class="kml-file-detail" id="features-${safeKmlId}" style="display: ${expanded ? 'flex' : 'none'};">
        ${renderKmlFileOverview(kmlFile)}
        <div class="kml-file-toolbox" aria-label="${escapeHtml(kmlFile.name)} 相关操作">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label class="kml-correction-switch" title="${kmlFile.isPublic ? '公共图层不可在此修改纠偏配置' : '开启后按高德底图纠偏显示；导出仍保留 KML 标准经纬度'}">
              <input type="checkbox" data-kml-correction data-kml-id="${safeKmlId}" ${kmlFile.isPublic || personalReadOnly ? 'disabled' : ''} ${shouldCorrectCoords(kmlFile) ? 'checked' : ''}>
              <span>坐标纠偏</span>
            </label>
            <label class="kml-correction-switch" title="${kmlFile.isPublic ? '公共图层禁止点位移动' : '开启后将锁定该图层下所有标注点位，防止误触拖拽移动'}">
              <input type="checkbox" data-kml-lock-drag data-kml-id="${safeKmlId}" ${kmlFile.isPublic || personalReadOnly ? 'disabled' : ''} ${kmlFile.isPublic ? 'checked' : ''} ${kmlFile.lockDrag ? 'checked' : ''}>
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
                attrs: `data-kml-id="${safeKmlId}" ${styleEditable ? '' : 'disabled'}`
              })}
              <span style="font-size: 11px; color: #475569; margin-left: 4px;">颜色：</span>
              ${renderCustomColorPicker({
                className: 'kml-color-input',
                value: getKmlColor(kmlFile),
                attrs: `data-kml-id="${safeKmlId}" ${styleEditable ? '' : 'disabled'}`
              })}
            </div>
          </div>
          <div class="kml-file-tool-actions">
            ${editable ? `<button type="button" class="kml-file-btn" data-kml-action="add-point" data-kml-id="${safeKmlId}" title="在此文件下新增标注点" aria-label="新增标注点"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg></button>` : ''}
            ${!kmlFile.isShare || kmlFile.allowDownload ? `<button type="button" class="kml-file-btn" data-kml-action="export" data-kml-id="${safeKmlId}" title="导出 KML 文件" aria-label="导出 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></button>` : ''}
            ${deleteButton}
          </div>
        </div>
        <div class="kml-features-list">
          ${displayFeatures.length < (kmlFile.features || []).length ? `<div class="kml-feature-limit-note">已按当前视口和缩放级别过滤显示，共 ${(kmlFile.features || []).length} 个记录点中展示 ${displayFeatures.length} 个；导出仍包含全部记录。</div>` : ''}
          ${displayFeatures.map(feature => renderFeatureItem(kmlFile, feature, editable)).join('')}
        </div>
      </div>
    </div>
  `
}

function updateKmlPanelUI () {
  const container = document.getElementById('kml-files-list')
  if (!container) return

  const share = getActiveShare()
  if (share) {
    container.innerHTML = `
      <section class="kml-share-summary">
        <strong>${escapeHtml(share.manifest.title || 'KML 分享')}</strong>
        ${share.manifest.description ? `<p>${escapeHtml(share.manifest.description)}</p>` : ''}
        <span>${publicKmlList.length} 个只读 KML</span>
      </section>
      <div class="kml-section-list" style="display: flex;">
        ${publicKmlList.map(renderKmlCard).join('') || '<div class="kml-empty">分享中没有可用图层</div>'}
      </div>
    `
    return
  }

  if (canWritePersonalKml()) ensureDefaultKmlFile()

  const personalExpanded = !expandedKmlIds.has('personal-section')
  const publicExpanded = !expandedKmlIds.has('public-section')

  container.innerHTML = `
    <div class="kml-section-header" data-kml-action="toggle-section" data-section-id="personal-section">
      <span>个人图层 (${kmlList.length})</span>
      <span>${personalExpanded ? '▲' : '▼'}</span>
    </div>
    <div id="kml-personal-list" class="kml-section-list" style="display: ${personalExpanded ? 'flex' : 'none'};">
      ${kmlList.map(renderKmlCard).join('') || '<div class="kml-empty">无个人图层</div>'}
    </div>
    <div class="kml-section-header" data-kml-action="toggle-section" data-section-id="public-section">
      <span>公共图层 (${publicKmlList.length})</span>
      <div>
        <button type="button" class="kml-file-btn" data-kml-action="refresh-public" title="刷新公共图层">
          <svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        </button>
        <span>${publicExpanded ? '▲' : '▼'}</span>
      </div>
    </div>
    <div id="kml-public-list" class="kml-section-list" style="display: ${publicExpanded ? 'flex' : 'none'};">
      ${publicKmlList.map(renderKmlCard).join('') || '<div class="kml-empty">无已发布公共图层</div>'}
    </div>
  `
}

function bindPanelEvents () {
  const panel = document.getElementById('kml-panel')
  const fileInput = document.getElementById('kml-file-input')
  const correctionInput = document.getElementById('kml-coordinate-correction')
  const dropzone = document.getElementById('kml-import-dropzone')
  if (!panel || !fileInput || !dropzone) return
  const createButton = panel.querySelector('[data-kml-action="create-file"]')
  const correctionOption = panel.querySelector('.kml-import-option')
  if (!canWritePersonalKml()) {
    dropzone.hidden = true
    if (createButton) createButton.hidden = true
    if (correctionOption) correctionOption.hidden = true
  }

  // Cesium 拦截鼠标/触摸事件，防止操作穿透到底图地球，保障在移动端能独立顺滑滚动
  const events = [
    'click', 'dblclick', 'mousedown', 'mouseup', 'mousewheel', 'DOMMouseScroll',
    'touchstart', 'touchend', 'touchmove', 'pointerdown', 'pointerup', 'pointermove'
  ]
  events.forEach(evt => {
    panel.addEventListener(evt, (e) => {
      e.stopPropagation()
    }, { passive: true })
  })

  window.toggleKmlPanel = () => {
    panel.hidden = !panel.hidden
    if (!panel.hidden) {
      updateKmlPanelUI()
    }
  }

  panel.querySelector('.kml-close-btn')?.addEventListener('click', () => {
    panel.hidden = true
    if (isAddingPoint) {
      togglePickupMode(null)
    }
  })

  dropzone.addEventListener('click', () => {
    if (!canWritePersonalKml()) return
    fileInput.click()
  })

  fileInput.addEventListener('change', (event) => {
    if (!canWritePersonalKml()) {
      event.target.value = ''
      showAlert('当前账号只有 KML 查看权限，不能导入文件。')
      return
    }
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      try {
        const parsed = parseKmlDocument(loadEvent.target.result)
        const features = parsed.features
        if (features.length === 0) {
          showAlert('KML 文件中未找到有效的点、线、面要素')
          return
        }

        pushKmlHistory()
        const newKml = createKmlFile({
          name: file.name,
          description: parsed.description,
          coordCorrection: correctionInput?.checked === false ? 'none' : KML_COORD_CORRECTION,
          features,
        })

        kmlList.splice(1, 0, newKml)
        expandedKmlIds.add(newKml.id)
        rememberTargetKmlId(newKml.id)
        saveToStorage()
        renderKmlLayers(newKml)
        updateKmlPanelUI()
        focusFeature(newKml.id, features[0].id)
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

    if (action === 'create-file') {
      event.stopPropagation()
      await handleCreateKmlFile()
      return
    }

    if (action === 'rename-file') {
      event.stopPropagation()
      await handleRenameKmlFile(kmlId)
      return
    }

    if (action === 'toggle-section') {
      const sectionId = actionTarget.getAttribute('data-section-id')
      if (expandedKmlIds.has(sectionId)) {
        expandedKmlIds.delete(sectionId)
      } else {
        expandedKmlIds.add(sectionId)
      }
      updateKmlPanelUI()
      return
    }

    if (action === 'refresh-public') {
      event.stopPropagation()
      await loadPublicKmls()
      renderAllKmls()
      updateKmlPanelUI()
      showAlert('公共图层已刷新')
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
            status: 'published',
          },
        })
        showAlert('共享成功！所有用户刷新页面后可见。')
        await loadPublicKmls()
        updateKmlPanelUI()
      } catch (err) {
        showAlert(`共享失败: ${err.message}`)
      }
      return
    }

    if (action === 'toggle-collapse') {
      const listDiv = document.getElementById(`features-${kmlId}`)
      if (!listDiv) return
      const willExpand = listDiv.style.display === 'none'
      listDiv.style.display = willExpand ? 'flex' : 'none'
      if (willExpand) {
        expandedKmlIds.add(kmlId)
        const kmlFile = publicKmlList.find(k => k.id === kmlId)
        if (kmlFile && !kmlFile.isShare && kmlFile.enabled && (!kmlFile.features || kmlFile.features.length === 0)) {
          try {
            const detail = await window.fetch(`/api/v1/kml/shared/${kmlFile.id}`).then(res => res.json()).then(payload => payload.result)
            kmlFile.features = detail.features || []
            renderKmlLayers(kmlFile)
            updateKmlPanelUI()
          } catch (err) {
            showAlert('加载公共图层详情失败')
          }
        }
      } else {
        expandedKmlIds.delete(kmlId)
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

        if (!kmlFile.isShare && kmlFile.enabled && (!kmlFile.features || kmlFile.features.length === 0)) {
          try {
            const detail = await window.fetch(`/api/v1/kml/shared/${kmlFile.id}`).then(res => res.json()).then(payload => payload.result)
            kmlFile.features = detail.features || []
          } catch (err) {
            showAlert('加载公共图层详情失败')
          }
        }

        renderKmlLayers(kmlFile)
        updateKmlPanelUI()
        return
      }

      kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile || kmlFile.isDefault) return
      if (!canWritePersonalKml()) {
        await showAlert('当前账号只有 KML 查看权限，不能修改显隐状态。')
        return
      }
      pushKmlHistory()
      kmlFile.enabled = !isKmlEnabled(kmlFile)
      saveToStorage()
      if (isAddingPoint && activeKmlIdForAdd === kmlId && !isKmlEnabled(kmlFile)) {
        togglePickupMode(null)
      }
      renderKmlLayers(kmlFile)
      updateKmlPanelUI()
      return
    }

    if (action === 'focus-feature') {
      focusFeature(kmlId, featureId)
      return
    }

    if (action === 'delete-feature') {
      event.stopPropagation()
      await handleDeleteFeature(kmlId, featureId)
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
          togglePickupMode(null)
        }
        kmlList.splice(index, 1)
        expandedKmlIds.delete(kmlId)
        if (getRememberedTargetKmlId() === kmlId) {
          rememberTargetKmlId(DEFAULT_KML_ID)
        }
        saveToStorage()
        removeKmlLayers(kmlId)
        updateKmlPanelUI()
      }
      return
    }

    if (action === 'export') {
      event.stopPropagation()
      let kmlFile = publicKmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        if (kmlFile.isShare) {
          if (!kmlFile.allowDownload || kmlFile.loadError) return
          downloadKmlFile(kmlFile.name, generateKmlText(kmlFile.name, kmlFile.features || [], kmlFile.description))
          return
        }
        if (!kmlFile.features || kmlFile.features.length === 0) {
          try {
            const detail = await window.fetch(`/api/v1/kml/shared/${kmlFile.id}`).then(res => res.json()).then(payload => payload.result)
            kmlFile.features = detail.features || []
          } catch (err) {
            showAlert('获取数据失败')
            return
          }
        }
        downloadKmlFile(kmlFile.name, generateKmlText(kmlFile.name, kmlFile.features, kmlFile.description))
        return
      }

      kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        downloadKmlFile(kmlFile.name, generateKmlText(kmlFile.name, kmlFile.features, kmlFile.description))
      }
      return
    }

    if (action === 'add-point') {
      event.stopPropagation()
      const kmlFile = getKmlFileById(kmlId)
      if (!isKmlEditable(kmlFile)) {
        await showAlert('目标 KML 当前为只读，不能新增标注。')
        return
      }
      if (!isKmlEnabled(kmlFile)) {
        showAlert('该 KML 文件已隐藏，请先启用后再新增标注。')
        return
      }
      togglePickupMode(kmlId)
    }
  })

  panel.addEventListener('change', (event) => {
    const target = event.target
    if (target.matches('[data-kml-correction]')) {
      const kmlId = target.getAttribute('data-kml-id')
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return
      if (!canWritePersonalKml()) {
        updateKmlPanelUI()
        return
      }

      pushKmlHistory()
      kmlFile.coordCorrection = target.checked ? KML_COORD_CORRECTION : 'none'
      saveToStorage()
      if (isKmlEnabled(kmlFile)) {
        renderKmlLayers(kmlFile)
      }
      updateKmlPanelUI()
      return
    }

    if (target.matches('[data-kml-lock-drag]')) {
      const kmlId = target.getAttribute('data-kml-id')
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return
      if (!canWritePersonalKml()) {
        updateKmlPanelUI()
        return
      }

      pushKmlHistory()
      kmlFile.lockDrag = target.checked
      saveToStorage()
      if (isKmlEnabled(kmlFile)) {
        renderKmlLayers(kmlFile)
      }
      updateKmlPanelUI()
      return
    }

    if (target.matches('.kml-theme-select')) {
      const kmlId = target.getAttribute('data-kml-id')
      let kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        if (!canWritePersonalKml()) {
          updateKmlPanelUI()
          return
        }
        pushKmlHistory()
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
        renderKmlLayers(kmlFile)
      }
      updateKmlPanelUI()
      return
    }

    if (target.matches('.kml-color-input')) {
      const kmlId = target.getAttribute('data-kml-id')
      let kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        if (!canWritePersonalKml()) {
          updateKmlPanelUI()
          return
        }
        pushKmlHistory()
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
        renderKmlLayers(kmlFile)
      }
      updateKmlPanelUI()
      return
    }
  })
}

function bindCanvasPickEvents () {
  if (!viewerRef) return
  handler = new ScreenSpaceEventHandler(viewerRef.canvas)

  handler.setInputAction(async (movement) => {
    closeFeaturePopup()

    if (isAddingPoint) {
      const latlng = getLatLngFromWindowPosition(movement.position)
      const targetKmlId = activeKmlIdForAdd
      togglePickupMode(null)
      await createPointAtLatLng(latlng, {
        targetKmlId,
        allowFileSelection: false,
      })
      return
    }

    const picked = viewerRef.scene.pick(movement.position)
    const meta = picked?.id?._map3dKmlFeature
    if (meta) {
      showFeaturePopup(meta.kmlId, meta.featureId, movement.position)
    }
  }, ScreenSpaceEventType.LEFT_CLICK)
}

function bindKeyboardEvents () {
  document.addEventListener('keydown', (event) => {
    if (typeof window.getIsGuidelineModeActive === 'function' && window.getIsGuidelineModeActive()) return

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const modifier = isMac ? event.metaKey : event.ctrlKey
    if (!modifier) return

    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) {
        redoKml()
      } else {
        undoKml()
      }
    } else if (key === 'y') {
      event.preventDefault()
      redoKml()
    }
  })
}

/**
 * 视口变化时按需重渲染 3D KML 图层（debounce 150ms + setTimeout）。
 * 独立于定位生命周期，确保查看已保存轨迹时也能动态渲染。
 * 仅重渲染 isLiveTrack 的 KML 文件，普通 KML 无视口过滤不需要重渲染。
 * 优化：若当前相机位置仍在上次渲染的缓冲范围内则跳过，避免不必要的重渲染。
 * 使用 setTimeout(0) 替代 requestAnimationFrame，让浏览器先完成绘制再执行渲染。
 */
function scheduleKmlViewportRerender3d () {
  if (kmlViewportRerenderTimer3d) clearTimeout(kmlViewportRerenderTimer3d)
  kmlViewportRerenderTimer3d = setTimeout(() => {
    kmlViewportRerenderTimer3d = null
    if (!viewerRef) return
    const hasLiveTrack = kmlList.some(k => k.isLiveTrack && k.enabled) ||
                         publicKmlList.some(k => k.isLiveTrack && !k.isShare && k.enabled)
    if (!hasLiveTrack) return

    // 缓存跳过：当前相机位置在上次渲染的缓冲范围内则不重渲染
    if (isCameraWithinCache3d()) return

    // 使用 setTimeout(0) 替代 requestAnimationFrame，让浏览器先绘制再渲染
    setTimeout(() => {
      kmlList.forEach(kmlFile => {
        if (kmlFile.isLiveTrack && !kmlFile.isShare && kmlFile.enabled) {
          renderKmlLayers(kmlFile)
        }
      })
      publicKmlList.forEach(kmlFile => {
        if (kmlFile.isLiveTrack && !kmlFile.isShare && kmlFile.enabled) {
          renderKmlLayers(kmlFile)
        }
      })
      // 视口重渲染时不更新面板 UI，避免不必要的 DOM 操作导致卡顿
    }, 0)
  }, 150)
}

async function fitShareKmlView () {
  if (!viewerRef) return false
  const entities = publicKmlList
    .filter(kmlFile => isKmlEnabled(kmlFile) && !kmlFile.loadError)
    .flatMap(kmlFile => [...(renderedKmlEntities.get(kmlFile.id) || [])])
  if (!entities.length) return false
  try {
    await viewerRef.flyTo(entities, { duration: 0 })
    return true
  } catch (error) {
    console.warn('Failed to fit shared KML view', error)
    return false
  }
}

export async function initKmlSupport3d (viewer) {
  viewerRef = viewer
  window.activateKmlFeatureForMedia = (item, options) => activateFeatureForMedia(item, options)
  window.getIsKmlPickupModeActive = () => isAddingPoint
  initCustomControlsListeners()

  if (getActiveShare()) {
    kmlList = []
    publicKmlList = await loadActiveShareFiles()
    expandedKmlIds.clear()
    const firstExpandable = publicKmlList.find(kmlFile => !kmlFile.loadError && (kmlFile.features || []).length)
    if (firstExpandable) expandedKmlIds.add(firstExpandable.id)
    renderAllKmls()
    await fitShareKmlView()
    updateKmlPanelUI()
    const panel = document.getElementById('kml-panel')
    panel?.querySelector('#kml-import-dropzone')?.setAttribute('hidden', '')
    panel?.querySelector('[data-kml-action="create-file"]')?.setAttribute('hidden', '')
    panel?.querySelector('.kml-import-option')?.setAttribute('hidden', '')
    viewer.camera.moveEnd.addEventListener(scheduleKmlViewportRerender3d)
    bindPanelEvents()
    bindCanvasPickEvents()
    return
  }

  bindKmlAccountSyncStatus()
  bindKmlAccountConflictRecovery((files) => {
    kmlList = files.map(normalizeKmlFile)
    renderAllKmls()
    updateKmlPanelUI()
    return kmlList
  })
  bindAccountSessionExpiry3d()
  await loadInitialKmlFiles()
  renderAllKmls()
  updateKmlPanelUI()

  // 注册视口变化监听，按需重渲染轨迹 KML 图层
  // 使用 camera.moveEnd 替代 camera.changed，仅在相机停止移动后触发，避免移动过程中的频繁回调
  viewer.camera.moveEnd.addEventListener(scheduleKmlViewportRerender3d)

  loadPublicKmls().then(() => {
    renderAllKmls()
    updateKmlPanelUI()
    checkPublicKmlEditMode()
  })

  bindPanelEvents()
  bindCanvasPickEvents()
  bindKeyboardEvents()
  initLongPressPointCreation()
}

export function createTrackKml3d (name) {
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
    console.error('createTrackKml3d failed:', err)
    return null
  }
}

export function hasTrackKml3d (kmlId) {
  return Boolean(kmlId && kmlList.some(kmlFile => kmlFile.id === kmlId))
}

export function updateTrackKml3d (kmlId, historyPoints, lastPosition, onlyLine = false, completedSegments = []) {
  if (!canWritePersonalKml()) return false
  try {
    const kmlFile = kmlList.find(k => k.id === kmlId)
    if (!kmlFile) return false

    const segments = buildTrackSegments(historyPoints, lastPosition, completedSegments)
    const allPts = segments.flat()
    const coordinatesForPoint = (pt) => {
      let lat = null
      let lng = null
      if (pt) {
        if (typeof pt.lng === 'number' && typeof pt.lat === 'number') {
          lng = pt.lng
          lat = pt.lat
        } else if (pt.latlng) {
          if (Array.isArray(pt.latlng)) {
            lat = pt.latlng[0]
            lng = pt.latlng[1]
          } else if (typeof pt.latlng.lat === 'number' && typeof pt.latlng.lng === 'number') {
            lat = pt.latlng.lat
            lng = pt.latlng.lng
          }
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
        if (pt) {
          if (typeof pt.lng === 'number' && typeof pt.lat === 'number') {
            lng = pt.lng
            lat = pt.lat
          } else if (pt.latlng) {
            if (Array.isArray(pt.latlng)) {
              lat = pt.latlng[0]
              lng = pt.latlng[1]
            } else if (typeof pt.latlng.lat === 'number' && typeof pt.latlng.lng === 'number') {
              lat = pt.latlng.lat
              lng = pt.latlng.lng
            }
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

    // 覆盖 features 前先按旧 ID 清理实体索引，避免每次轨迹刷新后遗留
    // featureEntities 引用并在长途运行中持续增长。
    const oldFeatures = kmlFile.features
    kmlFile.features = features
    try {
      saveToStorage()
    } catch (err) {
      kmlFile.features = oldFeatures
      throw err
    }

    try {
      removeKmlLayers({ ...kmlFile, features: oldFeatures })
      renderKmlLayers(kmlFile)
      updateKmlPanelUI()
    } catch (renderError) {
      console.error('updateTrackKml3d render failed:', renderError)
    }
    return true
  } catch (err) {
    console.error('updateTrackKml3d failed:', err)
    return false
  }
}
