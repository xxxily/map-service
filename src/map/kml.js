import L from 'leaflet'
import { showConfirm, showEditDialog, showAlert } from '../ui/dialog.js'
import { gcj02ToWgs84, wgs84ToGcj02Deep } from './coord-transform.js'
import { generateKmlText, parseKML } from './kml-format.js'

const KML_STORAGE_KEY = 'map_kml_list'
const KML_LAST_TARGET_KEY = 'map_kml_last_target_id'
const KML_COORD_CORRECTION = 'wgs84-to-gcj02'
const KML_POINT_LABEL_MAX_LENGTH = 18
const DEFAULT_KML_ID = 'default-kml'
const DEFAULT_KML_NAME = '默认标注'
const LONG_PRESS_DELAY_MS = 650
const LONG_PRESS_MOVE_TOLERANCE = 10
let kmlList = []

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
  ensureDefaultKmlFile()
  return kmlList.filter(isKmlEnabled)
}

function resolveTargetKmlId (preferredKmlId = '') {
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
  return getEnabledKmlFiles().map(kmlFile => ({
    value: kmlFile.id,
    label: `${kmlFile.name}${kmlFile.isDefault ? '（默认）' : ''}`,
  }))
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

function getFeatureLabel (feature) {
  const name = String(feature?.name || '').replace(/\s+/g, ' ').trim()
  if (!name) return '未命名要素'
  if (name.length <= KML_POINT_LABEL_MAX_LENGTH) return name
  return `${name.slice(0, KML_POINT_LABEL_MAX_LENGTH)}...`
}

function renderFeaturePopup (kmlId, feature) {
  return `
    <div class="kml-popup-content">
      <div class="kml-popup-title">${escapeHtml(feature.name)}</div>
      <div class="kml-popup-desc">${escapeHtml(feature.description || '暂无描述')}</div>
      <div class="kml-popup-actions">
        <button type="button" class="kml-popup-btn primary kml-edit-btn" data-kml-id="${kmlId}" data-feature-id="${feature.id}">编辑</button>
        <button type="button" class="kml-popup-btn danger kml-delete-btn" data-kml-id="${kmlId}" data-feature-id="${feature.id}">删除</button>
      </div>
    </div>
  `
}

function renderFeature (map, kmlFile, feature) {
  const kmlId = kmlFile.id
  let layer
  
  if (feature.type === 'Point') {
    const latlng = getMapPoint(kmlFile, feature)
    layer = L.marker(latlng, {
      draggable: true
    })

    // 监听拖动开始：保存撤销快照，并在拖动时关闭 popup 气泡
    layer.on('dragstart', () => {
      pushKmlHistory()
      layer.closePopup()
    })
    
    layer.on('dragend', () => {
      const newLatLng = layer.getLatLng()
      feature.coordinates = mapLatLngToStoredCoordinate(kmlFile, newLatLng)
      saveToStorage()
      updateKmlPanelUI(map)
    })
    layer.bindTooltip(escapeHtml(getFeatureLabel(feature)), {
      permanent: true,
      direction: 'top',
      offset: [-16, -18],
      opacity: 1,
      className: 'kml-point-label',
    })
  } else if (feature.type === 'LineString') {
    const latlngs = getMapLatLngs(kmlFile, feature)
    layer = L.polyline(latlngs, {
      color: '#0f766e',
      weight: 4
    })
  } else if (feature.type === 'Polygon') {
    const latlngs = getMapLatLngs(kmlFile, feature)
    layer = L.polygon(latlngs, {
      color: '#0f766e',
      fillColor: '#0f766e',
      fillOpacity: 0.15
    })
  }
  
  if (layer) {
    layer.bindPopup(renderFeaturePopup(kmlId, feature), { closeButton: false })
    featureLayers.set(feature.id, layer)
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

  const targetKml = typeof kmlFile === 'string' ? kmlList.find(k => k.id === kmlFile) : kmlFile
  targetKml?.features.forEach(feature => {
    featureLayers.delete(feature.id)
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
  
  kmlFile.features.forEach(feat => {
    const layer = renderFeature(map, kmlFile, feat)
    if (layer) {
      group.addLayer(layer)
    }
  })
  
  group.addTo(map)
  kmlLayerGroups.set(kmlFile.id, group)
}

function renderAllKmls (map) {
  kmlLayerGroups.forEach(group => map.removeLayer(group))
  kmlLayerGroups.clear()
  featureLayers.clear()
  
  kmlList.forEach(kmlFile => {
    renderKmlLayers(map, kmlFile)
  })
}

function updateKmlPanelUI (map) {
  ensureDefaultKmlFile()
  const container = document.getElementById('kml-files-list')
  if (!container) return
  
  container.innerHTML = kmlList.map(kmlFile => {
    const enabled = isKmlEnabled(kmlFile)
    const expanded = expandedKmlIds.has(kmlFile.id)
    const visibilityTitle = enabled ? '隐藏此 KML 文件' : '显示此 KML 文件'
    const visibilityButton = kmlFile.isDefault
      ? ''
      : `
        <button type="button" class="kml-file-btn kml-visibility-btn ${enabled ? 'is-visible' : 'is-hidden'}" data-kml-action="toggle-visible" data-kml-id="${kmlFile.id}" aria-label="${visibilityTitle}" aria-pressed="${enabled}" title="${visibilityTitle}">
          <span class="kml-eye-icon" aria-hidden="true"></span>
        </button>
      `
    const deleteButton = kmlFile.isDefault
      ? ''
      : `<button type="button" class="kml-file-btn delete" data-kml-action="delete-file" data-kml-id="${kmlFile.id}" title="删除此 KML 文件" aria-label="删除此 KML 文件">🗑</button>`
    return `
      <div class="kml-file-card ${enabled ? '' : 'is-disabled'}" data-kml-card-id="${kmlFile.id}">
        <div class="kml-file-head ${expanded ? 'is-expanded' : ''}" data-kml-action="toggle-collapse" data-kml-id="${kmlFile.id}" aria-expanded="${expanded}" title="点击展开更多 KML 操作">
          <div class="kml-file-title">
            <span class="kml-file-name" title="${escapeHtml(kmlFile.name)}">${escapeHtml(kmlFile.name)}</span>
            <span class="kml-file-count">${kmlFile.features.length}</span>
            ${kmlFile.isDefault ? '<span class="kml-file-state is-default">默认</span>' : ''}
            ${enabled ? '' : '<span class="kml-file-state">已隐藏</span>'}
          </div>
          <div class="kml-file-actions">
            <button type="button" class="kml-file-btn" data-kml-action="rename-file" data-kml-id="${kmlFile.id}" aria-label="重命名 KML 文件" title="重命名 KML 文件">✎</button>
            ${visibilityButton}
          </div>
        </div>
        <div class="kml-file-detail" id="features-${kmlFile.id}" style="display: ${expanded ? 'flex' : 'none'};">
          <div class="kml-file-toolbox" aria-label="${escapeHtml(kmlFile.name)} 相关操作">
            <label class="kml-correction-switch" title="开启后按高德底图纠偏显示；导出仍保留 KML 标准经纬度">
              <input type="checkbox" data-kml-correction data-kml-id="${kmlFile.id}" ${shouldCorrectCoords(kmlFile) ? 'checked' : ''}>
              <span>坐标纠偏</span>
            </label>
            <div class="kml-file-tool-actions">
              <button type="button" class="kml-file-btn" data-kml-action="add-point" data-kml-id="${kmlFile.id}" title="在此文件下新增标注点" aria-label="新增标注点">➕</button>
              <button type="button" class="kml-file-btn" data-kml-action="export" data-kml-id="${kmlFile.id}" title="导出 KML 文件" aria-label="导出 KML 文件">⤓</button>
              ${deleteButton}
            </div>
          </div>
          <div class="kml-features-list">
            ${kmlFile.features.map(feat => {
              let icon = '📍'
              if (feat.type === 'LineString') icon = '〰'
              if (feat.type === 'Polygon') icon = '⬡'
              return `
                <div class="kml-feature-item" data-kml-id="${kmlFile.id}" data-feature-id="${feat.id}">
                  <div class="kml-feature-info" data-kml-action="focus-feature" data-kml-id="${kmlFile.id}" data-feature-id="${feat.id}">
                    <span class="kml-feature-icon">${icon}</span>
                    <span class="kml-feature-name" title="${escapeHtml(feat.name)}">${escapeHtml(feat.name)}</span>
                  </div>
                  <button type="button" class="kml-feature-del" data-kml-action="delete-feature" data-kml-id="${kmlFile.id}" data-feature-id="${feat.id}" title="删除标注">✖</button>
                </div>
              `
            }).join('')}
          </div>
        </div>
      </div>
    `
  }).join('')
}

function focusFeature (map, kmlId, featureId) {
  const kmlFile = kmlList.find(k => k.id === kmlId)
  if (!kmlFile) return
  if (!isKmlEnabled(kmlFile)) {
    showAlert('该 KML 文件已隐藏，请先启用后查看。')
    return
  }

  const feature = kmlFile.features.find(f => f.id === featureId)
  if (!feature) return
  
  const layer = featureLayers.get(featureId)
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

async function handleEditFeature (map, kmlId, featureId) {
  const kmlFile = kmlList.find(k => k.id === kmlId)
  if (!kmlFile) return
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
    feature.name = result.name.trim() || '未命名要素'
    feature.description = result.description.trim()
    saveToStorage()
    
    const layer = featureLayers.get(featureId)
    if (layer) {
      layer.setPopupContent(renderFeaturePopup(kmlId, feature))
      if (feature.type === 'Point') {
        layer.setTooltipContent(escapeHtml(getFeatureLabel(feature)))
      }
      layer.closePopup()
      setTimeout(() => layer.openPopup(), 100)
    }
    
    updateKmlPanelUI(map)
  }
}

async function handleDeleteFeature (map, kmlId, featureId) {
  const confirmed = await showConfirm('确认删除此地图标注？')
  if (!confirmed) return
  
  const kmlFile = kmlList.find(k => k.id === kmlId)
  if (!kmlFile) return
  
  const index = kmlFile.features.findIndex(f => f.id === featureId)
  if (index === -1) return
  
  kmlFile.features.splice(index, 1)
  saveToStorage()
  
  const layer = featureLayers.get(featureId)
  if (layer) {
    const group = kmlLayerGroups.get(kmlId)
    if (group) {
      group.removeLayer(layer)
    }
    featureLayers.delete(featureId)
  }
  
  updateKmlPanelUI(map)
}

async function handleCreateKmlFile (map) {
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
  kmlList.push(kmlFile)
  expandedKmlIds.add(kmlFile.id)
  rememberTargetKmlId(kmlFile.id)
  saveToStorage()
  renderKmlLayers(map, kmlFile)
  updateKmlPanelUI(map)
}

async function handleRenameKmlFile (map, kmlId) {
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

  const result = await showEditDialog({
    title: '新增地图标注',
    fields,
    values: {
      kmlId: targetKmlId,
      name: '',
      description: '',
    },
  })

  if (!result) return

  const selectedKmlId = allowFileSelection ? result.kmlId : targetKmlId
  const kmlFile = kmlList.find(k => k.id === selectedKmlId)
  if (!isKmlEnabled(kmlFile)) {
    showAlert('该 KML 文件已隐藏，请先启用后再新增标注。')
    return
  }

  const newFeat = createPointFeature(kmlFile, latlng, result)
  kmlFile.features.push(newFeat)
  expandedKmlIds.add(kmlFile.id)
  rememberTargetKmlId(kmlFile.id)
  saveToStorage()

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
    try {
      container.setPointerCapture?.(event.pointerId)
    } catch (err) {
      // 部分浏览器不允许对当前事件捕获指针，忽略即可。
    }
    if (activePointerIds.size > 1 || event.isPrimary === false) {
      clearPress()
      return
    }
    if (isAddingPoint || event.button > 0 || isInteractiveTarget(event.target)) return

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

export function initKmlSupport (map) {
  window.getActiveKmlMarkers = getActiveKmlMarkers
  loadFromStorage()
  renderAllKmls(map)
  updateKmlPanelUI(map)
  initLongPressPointCreation(map)
  
  const panel = document.getElementById('kml-panel')
  const fileInput = document.getElementById('kml-file-input')
  const correctionInput = document.getElementById('kml-coordinate-correction')
  const dropzone = document.getElementById('kml-import-dropzone')
  
  const kmlActions = {
    toggleKmlPanel: () => {
      panel.hidden = !panel.hidden
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
    fileInput.click()
  })
  
  fileInput.addEventListener('change', (e) => {
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
        
        kmlList.push(newKml)
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

    if (action === 'toggle-collapse') {
      const listDiv = document.getElementById(`features-${kmlId}`)
      if (listDiv) {
        const willExpand = listDiv.style.display === 'none'
        listDiv.style.display = willExpand ? 'flex' : 'none'
        if (willExpand) {
          expandedKmlIds.add(kmlId)
        } else {
          expandedKmlIds.delete(kmlId)
        }
      }
      return
    }

    if (action === 'toggle-visible') {
      event.stopPropagation()
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return
      if (kmlFile.isDefault) return

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
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile?.isDefault) {
        showAlert('默认 KML 文件会一直保留，不能删除。')
        return
      }

      const confirmed = await showConfirm('确认删除此 KML 文件及其中所有的标注？')
      if (!confirmed) return
      
      const index = kmlList.findIndex(k => k.id === kmlId)
      if (index !== -1) {
        if (isAddingPoint && activeKmlIdForAdd === kmlId) {
          togglePickupMode(map, null)
        }

        kmlList[index].features.forEach(feat => {
          featureLayers.delete(feat.id)
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
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        const kmlText = generateKmlText(kmlFile.name, kmlFile.features)
        downloadKmlFile(kmlFile.name, kmlText)
      }
      return
    }
    
    if (action === 'add-point') {
      event.stopPropagation()
      const kmlFile = kmlList.find(k => k.id === kmlId)
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
    if (!target.matches('[data-kml-correction]')) return

    const kmlId = target.getAttribute('data-kml-id')
    const kmlFile = kmlList.find(k => k.id === kmlId)
    if (!kmlFile) return

    kmlFile.coordCorrection = target.checked ? KML_COORD_CORRECTION : 'none'
    saveToStorage()
    if (isKmlEnabled(kmlFile)) {
      renderKmlLayers(map, kmlFile)
    }
    updateKmlPanelUI(map)
  })
  
  map.on('popupopen', (e) => {
    const popup = e.popup
    const container = popup.getElement()
    if (!container) return
    
    const editBtn = container.querySelector('.kml-edit-btn')
    const deleteBtn = container.querySelector('.kml-delete-btn')
    
    if (editBtn) {
      const kId = editBtn.getAttribute('data-kml-id')
      const fId = editBtn.getAttribute('data-feature-id')
      
      editBtn.addEventListener('click', () => {
        handleEditFeature(map, kId, fId)
      })
    }
    
    if (deleteBtn) {
      const kId = deleteBtn.getAttribute('data-kml-id')
      const fId = deleteBtn.getAttribute('data-feature-id')
      
      deleteBtn.addEventListener('click', () => {
        map.closePopup(popup)
        handleDeleteFeature(map, kId, fId)
      })
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
  kmlUndoStack.push(JSON.parse(JSON.stringify(kmlList)))
  if (kmlUndoStack.length > 50) {
    kmlUndoStack.shift()
  }
  kmlRedoStack.length = 0
}

export function undoKml (map) {
  if (kmlUndoStack.length === 0) return
  kmlRedoStack.push(JSON.parse(JSON.stringify(kmlList)))
  kmlList = kmlUndoStack.pop()
  saveToStorage()
  renderAllKmls(map)
  updateKmlPanelUI(map)
}

export function redoKml (map) {
  if (kmlRedoStack.length === 0) return
  kmlUndoStack.push(JSON.parse(JSON.stringify(kmlList)))
  kmlList = kmlRedoStack.pop()
  saveToStorage()
  renderAllKmls(map)
  updateKmlPanelUI(map)
}
