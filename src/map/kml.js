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

function isAdminLoggedIn () {
  return Boolean(localStorage.getItem('mapServiceAdminToken'))
}

function isKmlEditable (kmlFile) {
  if (kmlFile.isPublic) {
    return isEditingPublicKml && editingPublicKmlId === kmlFile.id
  }
  return true
}

function saveKmlChanges (kmlFile) {
  if (kmlFile.isPublic) {
    isPublicKmlDirty = true
  } else {
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

  const token = localStorage.getItem('mapServiceAdminToken')
  if (!token) {
    showAlert('您未登录管理员，无法编辑公共 KML 图层')
    return
  }

  try {
    const detail = await window.fetch(`/api/v1/admin/kml/${editId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }).then(res => {
      if (!res.ok) throw new Error('加载公共 KML 数据失败')
      return res.json()
    }).then(payload => payload.result)

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
  const token = localStorage.getItem('mapServiceAdminToken')
  try {
    await window.fetch(`/api/v1/admin/kml/${editingPublicKml.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        features: editingPublicKml.features,
        status: status
      })
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

function renderFeaturePopup (kmlId, feature, isEditable) {
  const actionsHtml = isEditable
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

function renderFeature (map, kmlFile, feature) {
  const kmlId = kmlFile.id
  let layer
  const editable = isKmlEditable(kmlFile)
  
  if (feature.type === 'Point') {
    const latlng = getMapPoint(kmlFile, feature)
    layer = L.marker(latlng, {
      draggable: editable
    })

    if (editable) {
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
    layer.bindPopup(renderFeaturePopup(kmlId, feature, editable), { closeButton: false })
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

  const targetKml = typeof kmlFile === 'string'
    ? (kmlList.find(k => k.id === kmlFile) || publicKmlList.find(k => k.id === kmlFile))
    : kmlFile
  targetKml?.features?.forEach(feature => {
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

  publicKmlList.forEach(kmlFile => {
    renderKmlLayers(map, kmlFile)
  })
}

function updateKmlPanelUI (map) {
  ensureDefaultKmlFile()
  const container = document.getElementById('kml-files-list')
  if (!container) return

  let html = ''

  // 1. 公共图层分区
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
        const enabled = isKmlEnabled(kmlFile)
        const expanded = expandedKmlIds.has(kmlFile.id)
        const visibilityTitle = enabled ? '隐藏此公共图层' : '显示此公共图层'
        const isEditingThis = isEditingPublicKml && editingPublicKmlId === kmlFile.id
        return `
          <div class="kml-file-card ${enabled ? '' : 'is-disabled'}" data-kml-card-id="${kmlFile.id}">
            <div class="kml-file-head ${expanded ? 'is-expanded' : ''}" data-kml-action="toggle-collapse" data-kml-id="${kmlFile.id}">
              <div class="kml-file-title">
                <span class="kml-file-name" title="${escapeHtml(kmlFile.name)}">${escapeHtml(kmlFile.name)}</span>
                <span class="kml-file-count">${kmlFile.features ? kmlFile.features.length : (kmlFile.featureCount || 0)}</span>
                <span class="kml-file-state is-default" style="background: #e0f2fe; color: #0369a1; padding: 1px 4px; font-size: 10px; font-weight: bold; border-radius: 4px;">公共</span>
                ${isEditingThis ? '<span class="kml-file-state is-default" style="background: #fef3c7; color: #d97706; padding: 1px 4px; font-size: 10px; font-weight: bold; border-radius: 4px;">编辑中</span>' : ''}
                ${enabled ? '' : '<span class="kml-file-state">已隐藏</span>'}
              </div>
              <div class="kml-file-actions">
                <button type="button" class="kml-file-btn kml-visibility-btn ${enabled ? 'is-visible' : 'is-hidden'}" data-kml-action="toggle-visible" data-kml-id="${kmlFile.id}" aria-label="${visibilityTitle}" aria-pressed="${enabled}" title="${visibilityTitle}">
                  <span class="kml-eye-icon" aria-hidden="true"></span>
                </button>
              </div>
            </div>
            <div class="kml-file-detail" id="features-${kmlFile.id}" style="display: ${expanded ? 'flex' : 'none'};">
              <div class="kml-file-toolbox">
                <label class="kml-correction-switch" title="公共图层不可在此修改纠偏配置">
                  <input type="checkbox" disabled checked ${kmlFile.coordCorrection !== 'none' ? 'checked' : ''}>
                  <span>坐标纠偏</span>
                </label>
                <div class="kml-file-tool-actions">
                  ${isEditingThis ? `<button type="button" class="kml-file-btn" data-kml-action="add-point" data-kml-id="${kmlFile.id}" title="新增标注点" style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 14px; height: 14px;"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg></button>` : ''}
                  <button type="button" class="kml-file-btn" data-kml-action="export" data-kml-id="${kmlFile.id}" title="导出 KML 文件" aria-label="导出 KML 文件" style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width: 14px; height: 14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></button>
                </div>
              </div>
              <div class="kml-features-list">
                ${(kmlFile.features || []).map(feat => {
                  let iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
                  if (feat.type === 'LineString') {
                    iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>'
                  }
                  if (feat.type === 'Polygon') {
                    iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12 2 22 9 18 22 6 22 2 9"/></svg>'
                  }
                  return `
                    <div class="kml-feature-item" data-kml-id="${kmlFile.id}" data-feature-id="${feat.id}">
                      <div class="kml-feature-info" data-kml-action="focus-feature" data-kml-id="${kmlFile.id}" data-feature-id="${feat.id}">
                        <span class="kml-feature-icon">${iconSvg}</span>
                        <span class="kml-feature-name" title="${escapeHtml(feat.name)}">${escapeHtml(feat.name)}</span>
                      </div>
                      ${isEditingThis ? `
                        <button type="button" class="kml-feature-del" data-kml-action="delete-feature" data-kml-id="${kmlFile.id}" data-feature-id="${feat.id}" title="删除标注"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg></button>
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

  // 2. 个人图层分区
  html += `
    <div style="font-weight: bold; color: #0f766e; font-size: 13px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid rgba(22, 61, 61, 0.12);">
      个人图层 (${kmlList.length})
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${kmlList.map(kmlFile => {
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
        const shareButton = isAdminLoggedIn()
          ? `
            <button type="button" class="kml-file-btn" data-kml-action="share-file" data-kml-id="${kmlFile.id}" title="共享为公共 KML" aria-label="共享为公共 KML" style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;">
              <svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; stroke-linecap: round; stroke-linejoin: round;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </button>
          `
          : ''
        const deleteButton = kmlFile.isDefault
          ? ''
          : `<button type="button" class="kml-file-btn delete" data-kml-action="delete-file" data-kml-id="${kmlFile.id}" title="删除此 KML 文件" aria-label="删除此 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button>`
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
                <button type="button" class="kml-file-btn" data-kml-action="rename-file" data-kml-id="${kmlFile.id}" aria-label="重命名 KML 文件" title="重命名 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg></button>
                ${shareButton}
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
                  <button type="button" class="kml-file-btn" data-kml-action="add-point" data-kml-id="${kmlFile.id}" title="在此文件下新增标注点" aria-label="新增标注点"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg></button>
                  <button type="button" class="kml-file-btn" data-kml-action="export" data-kml-id="${kmlFile.id}" title="导出 KML 文件" aria-label="导出 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></button>
                  ${deleteButton}
                </div>
              </div>
              <div class="kml-features-list">
                ${kmlFile.features.map(feat => {
                  let iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
                  if (feat.type === 'LineString') {
                    iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>'
                  }
                  if (feat.type === 'Polygon') {
                    iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12 2 22 9 18 22 6 22 2 9"/></svg>'
                  }
                  return `
                    <div class="kml-feature-item" data-kml-id="${kmlFile.id}" data-feature-id="${feat.id}">
                      <div class="kml-feature-info" data-kml-action="focus-feature" data-kml-id="${kmlFile.id}" data-feature-id="${feat.id}">
                        <span class="kml-feature-icon">${iconSvg}</span>
                        <span class="kml-feature-name" title="${escapeHtml(feat.name)}">${escapeHtml(feat.name)}</span>
                      </div>
                      <button type="button" class="kml-feature-del" data-kml-action="delete-feature" data-kml-id="${kmlFile.id}" data-feature-id="${feat.id}" title="删除标注"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg></button>
                    </div>
                  `
                }).join('')}
              </div>
            </div>
          </div>
        `
      }).join('')}
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
  const kmlFile = kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
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
    saveKmlChanges(kmlFile)
    
    const layer = featureLayers.get(featureId)
    if (layer) {
      layer.setPopupContent(renderFeaturePopup(kmlId, feature, isKmlEditable(kmlFile)))
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
  
  const kmlFile = kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
  if (!kmlFile) return
  
  const index = kmlFile.features.findIndex(f => f.id === featureId)
  if (index === -1) return
  
  kmlFile.features.splice(index, 1)
  saveKmlChanges(kmlFile)
  
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

export function initKmlSupport (map) {
  window.getActiveKmlMarkers = getActiveKmlMarkers
  loadFromStorage()
  
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
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            name: kmlFile.name,
            features: kmlFile.features,
            coordCorrection: kmlFile.coordCorrection,
            status: 'published'
          })
        }).then(res => {
          if (!res.ok) throw new Error('共享失败')
          return res.json()
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

    // 彻底切断 KML 气泡外壳上一切鼠标、触摸、指针事件的向上传播，阻止穿透至地图
    preventAllKmlPropagation(container)
    
    const editBtn = container.querySelector('.kml-edit-btn')
    const deleteBtn = container.querySelector('.kml-delete-btn')
    
    if (editBtn) {
      const kId = editBtn.getAttribute('data-kml-id')
      const fId = editBtn.getAttribute('data-feature-id')
      
      editBtn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        ev.preventDefault()
        handleEditFeature(map, kId, fId)
      })
    }
    
    if (deleteBtn) {
      const kId = deleteBtn.getAttribute('data-kml-id')
      const fId = deleteBtn.getAttribute('data-feature-id')
      
      deleteBtn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        ev.preventDefault()
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
