import L from 'leaflet'
import { showAlert, showConfirm } from '../ui/dialog.js'
import {
  createKmlLineEditorState,
  lineEditorPointsToLatLngs,
} from './kml-line-editor-state.js'

const TOOLBAR_ID = 'kml-line-editor-toolbar'
const MIN_LINE_POINTS = 2

function stopPropagation (element) {
  if (!element) return
  ;['click', 'dblclick', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchmove', 'pointerdown', 'pointerup', 'pointermove', 'contextmenu'].forEach(eventName => {
    element.addEventListener(eventName, event => event.stopPropagation())
  })
}

function createPointIcon (selected = false) {
  return L.divIcon({
    className: `kml-line-editor-point-icon${selected ? ' is-selected' : ''}`,
    html: '<span class="kml-line-editor-point-core" aria-hidden="true"></span>',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function createCrosshairIcon () {
  return L.divIcon({
    className: 'kml-line-editor-crosshair-icon',
    html: '<span aria-hidden="true"></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function getToolbar () {
  return document.getElementById(TOOLBAR_ID)
}

function getActionTarget (event) {
  return event.target.closest?.('[data-kml-line-action]')
}

export function getIsKmlLineEditorActive () {
  return Boolean(window.__mapServiceKmlLineEditorActive)
}

export function createKmlLineEditor (map, options = {}) {
  if (!map || typeof map.on !== 'function') return null

  const state = createKmlLineEditorState(options.initialPoints)
  const toolbar = getToolbar()
  const container = map.getContainer?.()
  const pointLayer = L.featureGroup().addTo(map)
  const previewLine = L.polyline([], {
    color: options.color || '#0f766e',
    weight: 4,
    opacity: 0.86,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  }).addTo(map)
  let cursorMarker = null
  let active = true
  let finishing = false
  const markerById = new Map()

  const updateToolbar = () => {
    if (!toolbar) return
    const title = toolbar.querySelector('.guideline-title-text')
    if (title) title.textContent = options.title || '添加线段'
    const count = toolbar.querySelector('[data-kml-line-count]')
    if (count) count.textContent = `${state.size} 个点`
    const undoButton = toolbar.querySelector('[data-kml-line-action="undo"]')
    const redoButton = toolbar.querySelector('[data-kml-line-action="redo"]')
    const deleteButton = toolbar.querySelector('[data-kml-line-action="delete"]')
    const clearButton = toolbar.querySelector('[data-kml-line-action="clear"]')
    const mergeButton = toolbar.querySelector('[data-kml-line-action="merge"]')
    if (undoButton) undoButton.disabled = !state.canUndo
    if (redoButton) redoButton.disabled = !state.canRedo
    if (deleteButton) deleteButton.disabled = !state.getSelectedId()
    if (clearButton) clearButton.disabled = state.size === 0
    if (mergeButton) mergeButton.disabled = state.size < MIN_LINE_POINTS
  }

  const updatePreview = () => {
    previewLine.setLatLngs(lineEditorPointsToLatLngs(state.getPoints()))
    updateToolbar()
    options.onChange?.(state.getPoints(), state.getSelectedId())
  }

  const bindPoint = (point) => {
    const marker = L.marker([point.lat, point.lng], {
      icon: createPointIcon(point.id === state.getSelectedId()),
      draggable: true,
      interactive: true,
      bubblingMouseEvents: false,
      keyboard: true,
      title: `线段点 ${state.getPoints().findIndex(item => item.id === point.id) + 1}`,
    })
    markerById.set(point.id, marker)
    marker.on('click', event => {
      event.originalEvent?.preventDefault?.()
      event.originalEvent?.stopPropagation?.()
      state.select(point.id)
      renderPoints()
      markerById.get(point.id)?.openPopup()
    })
    marker.on('dragstart', () => {
      state.select(point.id)
      state.pushHistory()
      marker.closePopup()
      updateToolbar()
    })
    marker.on('drag', event => {
      const latlng = event.target.getLatLng()
      state.movePoint(point.id, latlng.lat, latlng.lng, { history: false })
      updatePreview()
    })
    marker.on('dragend', () => {
      const latlng = marker.getLatLng()
      state.movePoint(point.id, latlng.lat, latlng.lng, { history: false })
      renderPoints()
      updatePreview()
    })

    const popupContent = document.createElement('div')
    popupContent.className = 'kml-line-editor-point-popup'
    popupContent.innerHTML = '<button type="button" class="kml-line-editor-point-delete" title="删除此点位 (Delete / Backspace)"><span aria-hidden="true">×</span> 删除点位</button>'
    stopPropagation(popupContent)
    popupContent.querySelector('button')?.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      deletePoint(point.id)
    })
    marker.bindPopup(L.popup({ closeButton: false, offset: [0, -8], className: 'kml-line-editor-popup' }).setContent(popupContent))
    pointLayer.addLayer(marker)
  }

  function renderPoints () {
    pointLayer.clearLayers()
    markerById.clear()
    state.getPoints().forEach(bindPoint)
    updatePreview()
  }

  function addPoint (latlng) {
    if (!latlng || !state.addPoint({ lat: latlng.lat, lng: latlng.lng })) return
    renderPoints()
  }

  function deletePoint (id = state.getSelectedId()) {
    if (!state.deletePoint(id)) return
    renderPoints()
  }

  async function clearPoints () {
    if (!state.size) return
    const confirmed = await showConfirm('确定清除当前线段的全部点位吗？', {
      title: '清除线段点位',
      confirmText: '清除',
      cancelText: '取消',
    })
    if (!confirmed) return
    state.clear()
    renderPoints()
  }

  const updateCursor = event => {
    if (!active || !event?.latlng) return
    if (!cursorMarker) {
      cursorMarker = L.marker(event.latlng, {
        icon: createCrosshairIcon(),
        interactive: false,
        keyboard: false,
        opacity: 0.82,
      }).addTo(map)
    } else {
      cursorMarker.setLatLng(event.latlng)
    }
  }

  const hideCursor = () => {
    cursorMarker?.remove()
    cursorMarker = null
  }

  const onMapClick = event => {
    if (!active || event?.originalEvent?.target?.closest?.('.leaflet-marker-icon, .leaflet-popup, .leaflet-control, .leaflet-interactive')) return
    addPoint(event.latlng)
  }

  const closeToolbar = () => {
    if (!toolbar) return
    toolbar.hidden = true
    toolbar.removeEventListener('click', onToolbarClick)
  }

  const stop = ({ committed = false } = {}) => {
    if (!active) return
    active = false
    window.__mapServiceKmlLineEditorActive = false
    map.off('click', onMapClick)
    map.off('mousemove', updateCursor)
    map.off('mouseout', hideCursor)
    document.removeEventListener('keydown', onKeyDown)
    hideCursor()
    pointLayer.remove()
    previewLine.remove()
    container?.classList.remove('map-kml-line-editor-active')
    closeToolbar()
    options.onStop?.({ committed })
  }

  const cancel = async ({ force = false } = {}) => {
    if (!active || finishing) return false
    if (!force && state.size) {
      const confirmed = await showConfirm('当前线段尚未合并，确定放弃这些点位吗？', {
        title: '取消添加线段',
        confirmText: '放弃并退出',
        cancelText: '继续编辑',
      })
      if (!confirmed) return false
    }
    stop()
    options.onCancel?.()
    return true
  }

  const merge = async () => {
    if (finishing) return
    if (state.size < MIN_LINE_POINTS) {
      await showAlert('至少添加两个点位后才能保存线段。')
      return
    }
    finishing = true
    try {
      await options.onCommit?.(state.getPoints())
      stop({ committed: true })
    } catch (error) {
      finishing = false
      await showAlert(error?.message || '线段保存失败，当前编辑仍保留。')
    }
  }

  const onToolbarClick = event => {
    const target = getActionTarget(event)
    if (!target || target.disabled) return
    event.preventDefault()
    event.stopPropagation()
    const action = target.getAttribute('data-kml-line-action')
    if (action === 'undo' && state.undo()) renderPoints()
    else if (action === 'redo' && state.redo()) renderPoints()
    else if (action === 'delete') deletePoint()
    else if (action === 'clear') clearPoints()
    else if (action === 'merge') merge()
    else if (action === 'cancel') cancel()
  }

  const onKeyDown = event => {
    if (!active) return
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
      return
    }
    const isMac = navigator.platform?.toUpperCase().includes('MAC')
    const modifier = isMac ? event.metaKey : event.ctrlKey
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey ? state.redo() : state.undo()) renderPoints()
      return
    }
    if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      if (state.redo()) renderPoints()
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.getSelectedId()) {
      event.preventDefault()
      deletePoint()
    }
  }

  if (container) container.classList.add('map-kml-line-editor-active')
  window.__mapServiceKmlLineEditorActive = true
  map.on('click', onMapClick)
  map.on('mousemove', updateCursor)
  map.on('mouseout', hideCursor)
  document.addEventListener('keydown', onKeyDown)
  if (toolbar) {
    toolbar.hidden = false
    toolbar.addEventListener('click', onToolbarClick)
  }
  renderPoints()

  return {
    cancel,
    stop,
    merge,
    getPoints: () => state.getPoints(),
    getSelectedId: () => state.getSelectedId(),
    isActive: () => active,
  }
}
