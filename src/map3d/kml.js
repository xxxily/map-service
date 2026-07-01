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
import { gcj02ToWgs84, wgs84ToGcj02Deep } from '../map/coord-transform.js'
import { generateKmlText, parseKML } from '../map/kml-format.js'
import { showAlert, showConfirm, showEditDialog } from '../ui/dialog.js'
import { flyToLngLat } from './location.js'

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

function isAdminLoggedIn () {
  return Boolean(localStorage.getItem('mapServiceAdminToken'))
}

function isKmlEditable (kmlFile) {
  if (kmlFile?.isPublic) {
    return isEditingPublicKml && editingPublicKmlId === kmlFile.id
  }
  return Boolean(kmlFile)
}

function saveKmlChanges (kmlFile) {
  if (kmlFile?.isPublic) {
    isPublicKmlDirty = true
  } else {
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
    saveToStorage()
  }
}

function saveToStorage () {
  localStorage.setItem(KML_STORAGE_KEY, JSON.stringify(kmlList))
}

function normalizeKmlFile (kmlFile) {
  const isDefault = kmlFile.id === DEFAULT_KML_ID || kmlFile.isDefault === true
  return {
    ...kmlFile,
    id: isDefault ? DEFAULT_KML_ID : String(kmlFile.id || `kml-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
    name: String(kmlFile.name || (isDefault ? DEFAULT_KML_NAME : '未命名 KML')),
    isDefault,
    coordCorrection: kmlFile.coordCorrection || KML_COORD_CORRECTION,
    enabled: kmlFile.enabled !== false,
    features: Array.isArray(kmlFile.features) ? kmlFile.features : [],
  }
}

function createKmlFile (options = {}) {
  const isDefault = Boolean(options.isDefault)
  return normalizeKmlFile({
    id: isDefault ? DEFAULT_KML_ID : `kml-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: options.name || (isDefault ? DEFAULT_KML_NAME : '新建 KML 文件'),
    isDefault,
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
    id: DEFAULT_KML_ID,
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
  ensureDefaultKmlFile()
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
  const name = String(feature?.name || '').replace(/\s+/g, ' ').trim()
  if (!name) return '未命名要素'
  if (name.length <= KML_POINT_LABEL_MAX_LENGTH) return name
  return `${name.slice(0, KML_POINT_LABEL_MAX_LENGTH)}...`
}

function createPointFeature (kmlFile, latlng, result) {
  return {
    id: `feat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: 'Point',
    name: result.name.trim() || '新增标注点',
    description: result.description.trim(),
    coordinates: mapLatLngToStoredCoordinate(kmlFile, latlng),
  }
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
  kmlUndoStack.push(JSON.parse(JSON.stringify(kmlList)))
  if (kmlUndoStack.length > 50) {
    kmlUndoStack.shift()
  }
  kmlRedoStack.length = 0
}

function undoKml () {
  if (kmlUndoStack.length === 0) return
  kmlRedoStack.push(JSON.parse(JSON.stringify(kmlList)))
  kmlList = kmlUndoStack.pop()
  saveToStorage()
  renderAllKmls()
  updateKmlPanelUI()
}

function redoKml () {
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
  const color = Color.fromCssColorString('#0f766e')

  if (feature.type === 'Point') {
    const point = getPointLatLng(kmlFile, feature)
    const entity = markEntity(viewerRef.entities.add({
      name: feature.name || 'KML 标注',
      position: Cartesian3.fromDegrees(point.lng, point.lat, 8),
      point: {
        pixelSize: 11,
        color,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: getFeatureLabel(feature),
        font: '12px sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -18),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
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
    featureEntities.set(feature.id, {
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
  kmlFile?.features?.forEach(feature => {
    featureEntities.delete(feature.id)
  })
}

function renderKmlLayers (kmlFile) {
  removeKmlLayers(kmlFile)
  if (!isKmlEnabled(kmlFile)) return
  kmlFile.features.forEach(feature => renderFeature(kmlFile, feature))
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

function renderFeaturePopup (kmlId, feature, editable) {
  const actionsHtml = editable
    ? `
      <div class="kml-popup-actions">
        <button type="button" class="kml-popup-btn primary kml-edit-btn" data-kml-id="${kmlId}" data-feature-id="${feature.id}">编辑</button>
        <button type="button" class="kml-popup-btn danger kml-delete-btn" data-kml-id="${kmlId}" data-feature-id="${feature.id}">删除</button>
      </div>
    `
    : ''
  return `
    <div class="kml-popup-content">
      <div class="kml-popup-title">${escapeHtml(feature.name)}</div>
      <div class="kml-popup-desc">${escapeHtml(feature.description || '暂无描述')}</div>
      ${actionsHtml}
    </div>
  `
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
    ${renderFeaturePopup(kmlId, feature, isKmlEditable(kmlFile))}
  `

  const x = Math.min(Math.max(Number(windowPosition?.x || window.innerWidth / 2), 12), window.innerWidth - 280)
  const y = Math.min(Math.max(Number(windowPosition?.y || window.innerHeight / 2), 12), window.innerHeight - 180)
  popup.style.left = `${x}px`
  popup.style.top = `${y}px`

  popup.addEventListener('click', (event) => {
    event.stopPropagation()
  })

  popup.querySelector('.map3d-popup-close')?.addEventListener('click', closeFeaturePopup)
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

function getLatLngFromWindowPosition (windowPosition) {
  if (!viewerRef || !windowPosition) return null
  let cartesian = null
  try {
    if (viewerRef.scene.pickPositionSupported) {
      cartesian = viewerRef.scene.pickPosition(windowPosition)
    }
  } catch (err) {
    cartesian = null
  }

  if (!cartesian) {
    cartesian = viewerRef.camera.pickEllipsoid(windowPosition, viewerRef.scene.globe.ellipsoid)
  }
  if (!cartesian) return null

  const cartographic = viewerRef.scene.globe.ellipsoid.cartesianToCartographic(cartesian)
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

  const rendered = featureEntities.get(featureId)
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

async function handleEditFeature (kmlId, featureId) {
  const { kmlFile, feature } = getFeatureById(kmlId, featureId)
  if (!kmlFile || !feature || !isKmlEditable(kmlFile)) return

  const result = await showEditDialog({
    title: '修改标注属性',
    fields: [
      { name: 'name', label: '名称', type: 'text' },
      { name: 'description', label: '描述', type: 'textarea' },
    ],
    values: {
      name: feature.name,
      description: feature.description,
    },
  })

  if (!result) return
  pushKmlHistory()
  feature.name = result.name.trim() || '未命名要素'
  feature.description = result.description.trim()
  saveKmlChanges(kmlFile)
  renderKmlLayers(kmlFile)
  updateKmlPanelUI()
  showFeaturePopup(kmlId, featureId, new Cartesian2(window.innerWidth / 2, window.innerHeight / 2))
}

async function handleDeleteFeature (kmlId, featureId) {
  const confirmed = await showConfirm('确认删除此地图标注？')
  if (!confirmed) return

  const { kmlFile, feature } = getFeatureById(kmlId, featureId)
  if (!kmlFile || !feature || !isKmlEditable(kmlFile)) return

  pushKmlHistory()
  kmlFile.features = kmlFile.features.filter(item => item.id !== featureId)
  saveKmlChanges(kmlFile)
  renderKmlLayers(kmlFile)
  updateKmlPanelUI()
}

async function handleCreateKmlFile () {
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
  kmlList.push(kmlFile)
  expandedKmlIds.add(kmlFile.id)
  rememberTargetKmlId(kmlFile.id)
  saveToStorage()
  renderKmlLayers(kmlFile)
  updateKmlPanelUI()
}

async function handleRenameKmlFile (kmlId) {
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
  ensureDefaultKmlFile()
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
      description: '',
    },
  })

  viewerRef.entities.remove(tempEntity)
  if (!result) return

  const selectedKmlId = allowFileSelection ? result.kmlId : targetKmlId
  const kmlFile = getKmlFileById(selectedKmlId)
  if (!isKmlEnabled(kmlFile)) {
    showAlert('该 KML 文件已隐藏，请先启用后再新增标注。')
    return
  }

  pushKmlHistory()
  const newFeature = createPointFeature(kmlFile, latlng, result)
  kmlFile.features.push(newFeature)
  expandedKmlIds.add(kmlFile.id)
  rememberTargetKmlId(kmlFile.id)
  saveKmlChanges(kmlFile)
  renderKmlLayers(kmlFile)
  updateKmlPanelUI()
  focusFeature(kmlFile.id, newFeature.id)
}

function togglePickupMode (kmlId) {
  const canvas = viewerRef?.canvas
  if (!canvas) return

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

  const token = localStorage.getItem('mapServiceAdminToken')
  if (!token) {
    showAlert('您未登录管理员，无法编辑公共 KML 图层')
    return
  }

  try {
    const detail = await window.fetch(`/api/v1/admin/kml/${editId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).then(res => {
      if (!res.ok) throw new Error('加载公共 KML 数据失败')
      return res.json()
    }).then(payload => payload.result)

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
  const token = localStorage.getItem('mapServiceAdminToken')
  try {
    await window.fetch(`/api/v1/admin/kml/${editingPublicKml.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        features: editingPublicKml.features,
        status,
      }),
    }).then(res => {
      if (!res.ok) throw new Error('保存失败')
      return res.json()
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
  const iconSvg = feature.type === 'LineString'
    ? '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>'
    : feature.type === 'Polygon'
      ? '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12 2 22 9 18 22 6 22 2 9"/></svg>'
      : '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'

  return `
    <div class="kml-feature-item" data-kml-id="${kmlFile.id}" data-feature-id="${feature.id}">
      <div class="kml-feature-info" data-kml-action="focus-feature" data-kml-id="${kmlFile.id}" data-feature-id="${feature.id}">
        <span class="kml-feature-icon">${iconSvg}</span>
        <span class="kml-feature-name" title="${escapeHtml(feature.name)}">${escapeHtml(feature.name)}</span>
      </div>
      ${editable ? `<button type="button" class="kml-feature-del" data-kml-action="delete-feature" data-kml-id="${kmlFile.id}" data-feature-id="${feature.id}" title="删除标注"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg></button>` : ''}
    </div>
  `
}

function renderKmlCard (kmlFile) {
  const enabled = isKmlEnabled(kmlFile)
  const expanded = expandedKmlIds.has(kmlFile.id)
  const editable = isKmlEditable(kmlFile)
  const visibilityTitle = enabled ? `隐藏此${kmlFile.isPublic ? '公共' : ''}图层` : `显示此${kmlFile.isPublic ? '公共' : ''}图层`
  const isEditingThis = isEditingPublicKml && editingPublicKmlId === kmlFile.id
  const visibilityButton = kmlFile.isDefault
    ? ''
    : `
      <button type="button" class="kml-file-btn kml-visibility-btn ${enabled ? 'is-visible' : 'is-hidden'}" data-kml-action="toggle-visible" data-kml-id="${kmlFile.id}" aria-label="${visibilityTitle}" aria-pressed="${enabled}" title="${visibilityTitle}">
        <span class="kml-eye-icon" aria-hidden="true"></span>
      </button>
    `
  const shareButton = !kmlFile.isPublic && isAdminLoggedIn()
    ? `
      <button type="button" class="kml-file-btn" data-kml-action="share-file" data-kml-id="${kmlFile.id}" title="共享为公共 KML" aria-label="共享为公共 KML">
        <svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
      </button>
    `
    : ''
  const deleteButton = !kmlFile.isPublic && !kmlFile.isDefault
    ? `<button type="button" class="kml-file-btn delete" data-kml-action="delete-file" data-kml-id="${kmlFile.id}" title="删除此 KML 文件" aria-label="删除此 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button>`
    : ''
  const renameButton = kmlFile.isPublic
    ? ''
    : `<button type="button" class="kml-file-btn" data-kml-action="rename-file" data-kml-id="${kmlFile.id}" aria-label="重命名 KML 文件" title="重命名 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg></button>`

  return `
    <div class="kml-file-card ${enabled ? '' : 'is-disabled'}" data-kml-card-id="${kmlFile.id}">
      <div class="kml-file-head ${expanded ? 'is-expanded' : ''}" data-kml-action="toggle-collapse" data-kml-id="${kmlFile.id}" aria-expanded="${expanded}" title="点击展开更多 KML 操作">
        <div class="kml-file-title">
          <span class="kml-file-name" title="${escapeHtml(kmlFile.name)}">${escapeHtml(kmlFile.name)}</span>
          <span class="kml-file-count">${kmlFile.features ? kmlFile.features.length : (kmlFile.featureCount || 0)}</span>
          ${kmlFile.isPublic ? '<span class="kml-file-state is-default">公共</span>' : ''}
          ${kmlFile.isDefault ? '<span class="kml-file-state is-default">默认</span>' : ''}
          ${isEditingThis ? '<span class="kml-file-state is-default">编辑中</span>' : ''}
          ${enabled ? '' : '<span class="kml-file-state">已隐藏</span>'}
        </div>
        <div class="kml-file-actions">
          ${renameButton}
          ${shareButton}
          ${visibilityButton}
        </div>
      </div>
      <div class="kml-file-detail" id="features-${kmlFile.id}" style="display: ${expanded ? 'flex' : 'none'};">
        <div class="kml-file-toolbox" aria-label="${escapeHtml(kmlFile.name)} 相关操作">
          <label class="kml-correction-switch" title="${kmlFile.isPublic ? '公共图层不可在此修改纠偏配置' : '开启后按高德底图纠偏显示；导出仍保留 KML 标准经纬度'}">
            <input type="checkbox" data-kml-correction data-kml-id="${kmlFile.id}" ${kmlFile.isPublic ? 'disabled' : ''} ${shouldCorrectCoords(kmlFile) ? 'checked' : ''}>
            <span>坐标纠偏</span>
          </label>
          <div class="kml-file-tool-actions">
            ${editable ? `<button type="button" class="kml-file-btn" data-kml-action="add-point" data-kml-id="${kmlFile.id}" title="在此文件下新增标注点" aria-label="新增标注点"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg></button>` : ''}
            <button type="button" class="kml-file-btn" data-kml-action="export" data-kml-id="${kmlFile.id}" title="导出 KML 文件" aria-label="导出 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></button>
            ${deleteButton}
          </div>
        </div>
        <div class="kml-features-list">
          ${(kmlFile.features || []).map(feature => renderFeatureItem(kmlFile, feature, editable)).join('')}
        </div>
      </div>
    </div>
  `
}

function updateKmlPanelUI () {
  ensureDefaultKmlFile()
  const container = document.getElementById('kml-files-list')
  if (!container) return

  const publicExpanded = !expandedKmlIds.has('public-section')
  container.innerHTML = `
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
    <div class="kml-section-title">个人图层 (${kmlList.length})</div>
    <div class="kml-section-list">
      ${kmlList.map(renderKmlCard).join('')}
    </div>
  `
}

function bindPanelEvents () {
  const panel = document.getElementById('kml-panel')
  const fileInput = document.getElementById('kml-file-input')
  const correctionInput = document.getElementById('kml-coordinate-correction')
  const dropzone = document.getElementById('kml-import-dropzone')
  if (!panel || !fileInput || !dropzone) return

  window.toggleKmlPanel = () => {
    panel.hidden = !panel.hidden
  }

  panel.querySelector('.kml-close-btn')?.addEventListener('click', () => {
    panel.hidden = true
    if (isAddingPoint) {
      togglePickupMode(null)
    }
  })

  dropzone.addEventListener('click', () => {
    fileInput.click()
  })

  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      try {
        const features = parseKML(loadEvent.target.result)
        if (features.length === 0) {
          showAlert('KML 文件中未找到有效的点、线、面要素')
          return
        }

        pushKmlHistory()
        const newKml = createKmlFile({
          name: file.name,
          coordCorrection: correctionInput?.checked === false ? 'none' : KML_COORD_CORRECTION,
          features,
        })

        kmlList.push(newKml)
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

    if (action === 'share-file') {
      event.stopPropagation()
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return

      const confirmed = await showConfirm(`确认将个人图层“${escapeHtml(kmlFile.name)}”共享为公共 KML 图层吗？`)
      if (!confirmed) return

      const token = localStorage.getItem('mapServiceAdminToken')
      try {
        await window.fetch('/api/v1/admin/kml', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: kmlFile.name,
            features: kmlFile.features,
            coordCorrection: kmlFile.coordCorrection,
            status: 'published',
          }),
        }).then(res => {
          if (!res.ok) throw new Error('共享失败')
          return res.json()
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
        if (kmlFile && kmlFile.enabled && (!kmlFile.features || kmlFile.features.length === 0)) {
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

        if (kmlFile.enabled && (!kmlFile.features || kmlFile.features.length === 0)) {
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
        if (!kmlFile.features || kmlFile.features.length === 0) {
          try {
            const detail = await window.fetch(`/api/v1/kml/shared/${kmlFile.id}`).then(res => res.json()).then(payload => payload.result)
            kmlFile.features = detail.features || []
          } catch (err) {
            showAlert('获取数据失败')
            return
          }
        }
        downloadKmlFile(kmlFile.name, generateKmlText(kmlFile.name, kmlFile.features))
        return
      }

      kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        downloadKmlFile(kmlFile.name, generateKmlText(kmlFile.name, kmlFile.features))
      }
      return
    }

    if (action === 'add-point') {
      event.stopPropagation()
      const kmlFile = getKmlFileById(kmlId)
      if (!isKmlEnabled(kmlFile)) {
        showAlert('该 KML 文件已隐藏，请先启用后再新增标注。')
        return
      }
      togglePickupMode(kmlId)
    }
  })

  panel.addEventListener('change', (event) => {
    const target = event.target
    if (!target.matches('[data-kml-correction]')) return

    const kmlId = target.getAttribute('data-kml-id')
    const kmlFile = kmlList.find(k => k.id === kmlId)
    if (!kmlFile) return

    pushKmlHistory()
    kmlFile.coordCorrection = target.checked ? KML_COORD_CORRECTION : 'none'
    saveToStorage()
    if (isKmlEnabled(kmlFile)) {
      renderKmlLayers(kmlFile)
    }
    updateKmlPanelUI()
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

export function initKmlSupport3d (viewer) {
  viewerRef = viewer
  window.getIsKmlPickupModeActive = () => isAddingPoint

  loadFromStorage()
  renderAllKmls()
  updateKmlPanelUI()

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
