import L from 'leaflet'
import { showConfirm, showEditDialog, showAlert } from '../ui/dialog.js'
import { gcj02ToWgs84, wgs84ToGcj02Deep } from './coord-transform.js'
import { generateKmlText, parseKML } from './kml-format.js'

const KML_STORAGE_KEY = 'map_kml_list'
const KML_COORD_CORRECTION = 'wgs84-to-gcj02'
const KML_POINT_LABEL_MAX_LENGTH = 18
let kmlList = []

const kmlLayerGroups = new Map()
const featureLayers = new Map()
const expandedKmlIds = new Set()

let isAddingPoint = false
let activeKmlIdForAdd = null
let clickListener = null
let pickupToastElement = null

function loadFromStorage () {
  try {
    kmlList = JSON.parse(localStorage.getItem(KML_STORAGE_KEY) || '[]')
  } catch (err) {
    console.error('Failed to load KML list from localStorage', err)
    kmlList = []
  }

  kmlList = kmlList.map(normalizeKmlFile)
}

function saveToStorage () {
  localStorage.setItem(KML_STORAGE_KEY, JSON.stringify(kmlList))
}

function normalizeKmlFile (kmlFile) {
  return {
    ...kmlFile,
    coordCorrection: kmlFile.coordCorrection || KML_COORD_CORRECTION,
    enabled: kmlFile.enabled !== false,
    features: Array.isArray(kmlFile.features) ? kmlFile.features : [],
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
  const container = document.getElementById('kml-files-list')
  if (!container) return
  
  if (kmlList.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px 0; color: #94a3b8; font-size: 13px;">
        暂无导入的 KML 数据
      </div>
    `
    return
  }
  
  container.innerHTML = kmlList.map(kmlFile => {
    const enabled = isKmlEnabled(kmlFile)
    const expanded = expandedKmlIds.has(kmlFile.id)
    const visibilityTitle = enabled ? '隐藏此 KML 文件' : '显示此 KML 文件'
    return `
      <div class="kml-file-card ${enabled ? '' : 'is-disabled'}" data-kml-card-id="${kmlFile.id}">
        <div class="kml-file-head ${expanded ? 'is-expanded' : ''}" data-kml-action="toggle-collapse" data-kml-id="${kmlFile.id}" aria-expanded="${expanded}" title="点击展开更多 KML 操作">
          <div class="kml-file-title">
            <span class="kml-file-name" title="${escapeHtml(kmlFile.name)}">${escapeHtml(kmlFile.name)}</span>
            <span class="kml-file-count">${kmlFile.features.length}</span>
            ${enabled ? '' : '<span class="kml-file-state">已隐藏</span>'}
          </div>
          <div class="kml-file-actions">
            <button type="button" class="kml-file-btn kml-visibility-btn ${enabled ? 'is-visible' : 'is-hidden'}" data-kml-action="toggle-visible" data-kml-id="${kmlFile.id}" aria-label="${visibilityTitle}" aria-pressed="${enabled}" title="${visibilityTitle}">
              <span class="kml-eye-icon" aria-hidden="true"></span>
            </button>
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
              <button type="button" class="kml-file-btn delete" data-kml-action="delete-file" data-kml-id="${kmlFile.id}" title="删除此 KML 文件" aria-label="删除此 KML 文件">🗑</button>
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
      
      const result = await showEditDialog({
        title: '新增地图标注',
        fields: [
          { name: 'name', label: '标注名称', type: 'text' },
          { name: 'description', label: '描述信息', type: 'textarea' }
        ],
        values: {
          name: '',
          description: ''
        }
      })
      
      if (result) {
        const kmlFile = kmlList.find(k => k.id === kmlId)
        if (!kmlFile) return
        
        const newFeat = {
          id: `feat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          type: 'Point',
          name: result.name.trim() || '新增标注点',
          description: result.description.trim(),
          coordinates: mapLatLngToStoredCoordinate(kmlFile, latlng)
        }
        
        kmlFile.features.push(newFeat)
        saveToStorage()
        
        const group = kmlLayerGroups.get(kmlId)
        const layer = renderFeature(map, kmlFile, newFeat)
        if (layer && group) {
          group.addLayer(layer)
        }
        
        updateKmlPanelUI(map)
        focusFeature(map, kmlId, newFeat.id)
      }
    }
    
    map.on('click', clickListener)
  }
}

export function initKmlSupport (map) {
  loadFromStorage()
  renderAllKmls(map)
  updateKmlPanelUI(map)
  
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
        
        const newKml = {
          id: `kml-${Date.now()}`,
          name: file.name,
          coordCorrection: correctionInput?.checked === false ? 'none' : KML_COORD_CORRECTION,
          enabled: true,
          features
        }
        
        kmlList.push(newKml)
        saveToStorage()
        
        renderKmlLayers(map, newKml)
        updateKmlPanelUI(map)
        expandedKmlIds.add(newKml.id)
        
        const featListDiv = document.getElementById(`features-${newKml.id}`)
        if (featListDiv) featListDiv.style.display = 'flex'
        
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
    }

    if (action === 'toggle-visible') {
      event.stopPropagation()
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return

      kmlFile.enabled = !isKmlEnabled(kmlFile)
      saveToStorage()

      if (isAddingPoint && activeKmlIdForAdd === kmlId && !isKmlEnabled(kmlFile)) {
        togglePickupMode(map, null)
      }

      renderKmlLayers(map, kmlFile)
      updateKmlPanelUI(map)
    }
    
    if (action === 'focus-feature') {
      focusFeature(map, kmlId, featureId)
    }
    
    if (action === 'delete-feature') {
      event.stopPropagation()
      handleDeleteFeature(map, kmlId, featureId)
    }
    
    if (action === 'delete-file') {
      event.stopPropagation()
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
        saveToStorage()
        
        if (kmlLayerGroups.has(kmlId)) {
          map.removeLayer(kmlLayerGroups.get(kmlId))
          kmlLayerGroups.delete(kmlId)
        }
        
        updateKmlPanelUI(map)
      }
    }
    
    if (action === 'export') {
      event.stopPropagation()
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        const kmlText = generateKmlText(kmlFile.name, kmlFile.features)
        downloadKmlFile(kmlFile.name, kmlText)
      }
    }
    
    if (action === 'add-point') {
      event.stopPropagation()
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (!isKmlEnabled(kmlFile)) {
        showAlert('该 KML 文件已隐藏，请先启用后再新增标注。')
        return
      }
      togglePickupMode(map, kmlId)
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
}
