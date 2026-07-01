import {
  Cartesian2,
  Cartesian3,
  Color,
  HeightReference,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Math as CesiumMath,
} from 'cesium'
import { showConfirm } from '../ui/dialog.js'

const GUIDELINE_STORAGE_KEY = 'map_guidelines'
const EARTH_RADIUS_KM = 6371
const GUIDELINE_MIN_HALF_LENGTH_M = 250
const GUIDELINE_MAX_HALF_LENGTH_M = 3000000
const GUIDELINE_LINE_HEIGHT_M = 80

let viewerRef = null
let handler = null
let guidelinesData = []
let selectedGuidelineId = null
let isGuidelineModeActive = false
let previewEntities = []
let guidelinePopupEl = null
let popupGuidelineId = null
let refreshFrameId = 0

const undoStack = []
const redoStack = []
const renderedGuidelines = new Map()

function loadGuidelinesData () {
  try {
    const raw = localStorage.getItem(GUIDELINE_STORAGE_KEY)
    guidelinesData = raw ? JSON.parse(raw) : []
    if (!Array.isArray(guidelinesData)) {
      guidelinesData = []
    }
  } catch (err) {
    guidelinesData = []
  }
}

function saveGuidelinesData () {
  try {
    localStorage.setItem(GUIDELINE_STORAGE_KEY, JSON.stringify(guidelinesData))
  } catch (err) {
  }
}

function pushHistory () {
  undoStack.push(JSON.parse(JSON.stringify(guidelinesData)))
  if (undoStack.length > 50) {
    undoStack.shift()
  }
  redoStack.length = 0
  updateToolbarButtons()
}

function updateToolbarButtons () {
  const undoBtn = document.querySelector('[data-guideline-action="undo"]')
  const redoBtn = document.querySelector('[data-guideline-action="redo"]')
  if (undoBtn) {
    undoBtn.disabled = undoStack.length === 0
    undoBtn.style.display = undoStack.length === 0 ? 'none' : 'inline-flex'
  }
  if (redoBtn) {
    redoBtn.disabled = redoStack.length === 0
    redoBtn.style.display = redoStack.length === 0 ? 'none' : 'inline-flex'
  }
}

function preventAllPropagation (el) {
  if (!el) return
  const events = [
    'click', 'dblclick',
    'mousedown', 'mouseup',
    'touchstart', 'touchend', 'touchmove',
    'pointerdown', 'pointerup', 'pointermove',
    'contextmenu',
  ]
  events.forEach(eventName => {
    el.addEventListener(eventName, event => {
      event.stopPropagation()
    })
  })
}

function getGuidelineHalfLengthKm () {
  if (!viewerRef) return 1
  const cameraHeight = viewerRef.camera?.positionCartographic?.height || 1000
  const canvas = viewerRef.canvas
  const aspect = canvas?.clientHeight ? Math.max(1, canvas.clientWidth / canvas.clientHeight) : 1
  const fovy = viewerRef.camera?.frustum?.fovy || CesiumMath.toRadians(60)
  const visibleRadius = cameraHeight * Math.tan(fovy / 2) * Math.sqrt(1 + aspect * aspect)
  const halfLengthMeters = Math.max(
    GUIDELINE_MIN_HALF_LENGTH_M,
    Math.min(GUIDELINE_MAX_HALF_LENGTH_M, visibleRadius * 1.35)
  )
  return halfLengthMeters / 1000
}

function destinationPoint (lat, lng, bearing, distanceKm) {
  const angularDistance = distanceKm / EARTH_RADIUS_KM
  const bearingRad = CesiumMath.toRadians(bearing)
  const latRad = CesiumMath.toRadians(lat)
  const lngRad = CesiumMath.toRadians(lng)

  const targetLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
    Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearingRad)
  )
  const targetLng = lngRad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angularDistance) * Math.cos(latRad),
    Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(targetLat)
  )

  return {
    lat: CesiumMath.toDegrees(targetLat),
    lng: ((CesiumMath.toDegrees(targetLng) + 540) % 360) - 180,
  }
}

function getGuidelineLinePoints (item) {
  const bearing = Number(item.bearing || 0)
  const halfLengthKm = getGuidelineHalfLengthKm()
  const verticalForward = destinationPoint(item.lat, item.lng, bearing, halfLengthKm)
  const verticalBackward = destinationPoint(item.lat, item.lng, bearing + 180, halfLengthKm)
  const horizontalForward = destinationPoint(item.lat, item.lng, bearing + 90, halfLengthKm)
  const horizontalBackward = destinationPoint(item.lat, item.lng, bearing + 270, halfLengthKm)

  return {
    vertical: [verticalBackward, verticalForward],
    horizontal: [horizontalBackward, horizontalForward],
  }
}

function positionsFromPoints (points) {
  return Cartesian3.fromDegreesArrayHeights(points.flatMap(point => [
    point.lng,
    point.lat,
    GUIDELINE_LINE_HEIGHT_M,
  ]))
}

function markEntity (entity, guidelineId) {
  entity._map3dGuidelineId = guidelineId
  return entity
}

function getGuidelineColor (item) {
  return item.id === selectedGuidelineId
    ? Color.fromCssColorString('#be123c')
    : Color.fromCssColorString('#06b6d4')
}

function renderGuidelines () {
  if (!viewerRef) return

  renderedGuidelines.forEach(entities => {
    entities.forEach(entity => viewerRef.entities.remove(entity))
  })
  renderedGuidelines.clear()

  guidelinesData.forEach(item => {
    const linePoints = getGuidelineLinePoints(item)
    const color = getGuidelineColor(item)
    const lineMaterial = color.withAlpha(item.id === selectedGuidelineId ? 0.98 : 0.82)
    const depthFailMaterial = color.withAlpha(item.id === selectedGuidelineId ? 0.9 : 0.68)
    const lineWidth = item.id === selectedGuidelineId ? 3 : 2

    const horizontal = markEntity(viewerRef.entities.add({
      polyline: {
        positions: positionsFromPoints(linePoints.horizontal),
        width: lineWidth,
        material: lineMaterial,
        depthFailMaterial,
        clampToGround: false,
      },
    }), item.id)

    const vertical = markEntity(viewerRef.entities.add({
      polyline: {
        positions: positionsFromPoints(linePoints.vertical),
        width: lineWidth,
        material: lineMaterial,
        depthFailMaterial,
        clampToGround: false,
      },
    }), item.id)

    const center = markEntity(viewerRef.entities.add({
      position: Cartesian3.fromDegrees(item.lng, item.lat, GUIDELINE_LINE_HEIGHT_M),
      point: {
        pixelSize: item.id === selectedGuidelineId ? 13 : 11,
        color,
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    }), item.id)

    renderedGuidelines.set(item.id, [horizontal, vertical, center])
  })
  updateGuidelinePopupPosition()
}

function updateGuidelineEntityPositions () {
  if (!viewerRef) return
  guidelinesData.forEach(item => {
    const entities = renderedGuidelines.get(item.id)
    if (!entities) return
    const [horizontal, vertical, center] = entities
    const linePoints = getGuidelineLinePoints(item)
    if (horizontal?.polyline) {
      horizontal.polyline.positions = positionsFromPoints(linePoints.horizontal)
    }
    if (vertical?.polyline) {
      vertical.polyline.positions = positionsFromPoints(linePoints.vertical)
    }
    if (center) {
      center.position = Cartesian3.fromDegrees(item.lng, item.lat, GUIDELINE_LINE_HEIGHT_M)
    }
  })
  updateGuidelinePopupPosition()
}

function scheduleGuidelineRefresh () {
  if (refreshFrameId) return
  refreshFrameId = requestAnimationFrame(() => {
    refreshFrameId = 0
    updateGuidelineEntityPositions()
  })
}

function ensureGuidelinePopup () {
  if (guidelinePopupEl) return guidelinePopupEl
  guidelinePopupEl = document.createElement('div')
  guidelinePopupEl.className = 'map3d-guideline-popup'
  guidelinePopupEl.hidden = true
  guidelinePopupEl.innerHTML = `
    <button type="button" class="guideline-popup-del-btn" data-guideline-popup-action="delete" title="删除此辅助线 (Delete / Backspace)">
      <svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
      删除
    </button>
  `
  preventAllPropagation(guidelinePopupEl)
  guidelinePopupEl.querySelector('[data-guideline-popup-action="delete"]')?.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    if (popupGuidelineId) {
      deleteGuidelineDirectly(popupGuidelineId)
    }
  })
  document.body.appendChild(guidelinePopupEl)
  return guidelinePopupEl
}

function hideGuidelinePopup () {
  popupGuidelineId = null
  if (guidelinePopupEl) {
    guidelinePopupEl.hidden = true
  }
}

function getGuidelineScreenPosition (guidelineId) {
  if (!viewerRef || !guidelineId) return null
  const item = guidelinesData.find(g => g.id === guidelineId)
  if (!item) return null
  const position = Cartesian3.fromDegrees(item.lng, item.lat, GUIDELINE_LINE_HEIGHT_M)
  return viewerRef.scene.cartesianToCanvasCoordinates(position, new Cartesian2())
}

function placeGuidelinePopup (screenPosition) {
  const popup = ensureGuidelinePopup()
  if (!screenPosition) {
    popup.hidden = true
    return
  }
  const x = Math.max(12, Math.min(window.innerWidth - 12, screenPosition.x))
  const y = Math.max(44, Math.min(window.innerHeight - 12, screenPosition.y - 12))
  popup.style.left = `${x}px`
  popup.style.top = `${y}px`
  popup.hidden = false
}

function updateGuidelinePopupPosition () {
  if (!popupGuidelineId || !guidelinePopupEl || guidelinePopupEl.hidden) return
  placeGuidelinePopup(getGuidelineScreenPosition(popupGuidelineId))
}

function showGuidelinePopup (guidelineId, screenPosition = null) {
  popupGuidelineId = guidelineId
  placeGuidelinePopup(screenPosition || getGuidelineScreenPosition(guidelineId))
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

function currentCameraBearing () {
  if (!viewerRef) return 0
  const heading = CesiumMath.toDegrees(viewerRef.camera.heading)
  return Math.round((heading % 360 + 360) % 360)
}

function removePreview () {
  if (!viewerRef) return
  previewEntities.forEach(entity => viewerRef.entities.remove(entity))
  previewEntities = []
}

function updatePreview (windowPosition) {
  if (!isGuidelineModeActive || !viewerRef) return
  const latlng = getLatLngFromWindowPosition(windowPosition)
  if (!latlng) {
    removePreview()
    return
  }

  removePreview()
  const preview = {
    id: 'preview',
    lat: latlng.lat,
    lng: latlng.lng,
    bearing: currentCameraBearing(),
  }
  const linePoints = getGuidelineLinePoints(preview)
  const material = Color.fromCssColorString('#06b6d4').withAlpha(0.45)
  previewEntities = [
    viewerRef.entities.add({
      polyline: {
        positions: positionsFromPoints(linePoints.horizontal),
        width: 1.5,
        material,
        depthFailMaterial: material,
        clampToGround: false,
      },
    }),
    viewerRef.entities.add({
      polyline: {
        positions: positionsFromPoints(linePoints.vertical),
        width: 1.5,
        material,
        depthFailMaterial: material,
        clampToGround: false,
      },
    }),
  ]
}

function selectGuideline (guidelineId, screenPosition = null) {
  if (!guidelineId) return
  selectedGuidelineId = guidelineId
  if (!isGuidelineModeActive) {
    enterGuidelineMode()
  }
  renderGuidelines()
  showGuidelinePopup(guidelineId, screenPosition)
}

function deleteGuidelineDirectly (guidelineId) {
  const item = guidelinesData.find(g => g.id === guidelineId)
  if (!item) return

  pushHistory()
  guidelinesData = guidelinesData.filter(g => g.id !== guidelineId)
  if (selectedGuidelineId === guidelineId) {
    selectedGuidelineId = null
  }
  if (popupGuidelineId === guidelineId) {
    hideGuidelinePopup()
  }
  saveGuidelinesData()
  renderGuidelines()
  updateToolbarButtons()
}

function addGuidelineAtPosition (windowPosition) {
  const latlng = getLatLngFromWindowPosition(windowPosition)
  if (!latlng) return

  pushHistory()
  const newId = `guideline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  guidelinesData.push({
    id: newId,
    lat: latlng.lat,
    lng: latlng.lng,
    bearing: currentCameraBearing(),
  })
  selectedGuidelineId = newId
  saveGuidelinesData()
  renderGuidelines()
  showGuidelinePopup(newId, windowPosition)
  updateToolbarButtons()
}

function bindToolbar () {
  const toolbar = document.getElementById('guideline-toolbar')
  if (!toolbar) return

  toolbar.addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-guideline-action]')
    const action = actionTarget?.getAttribute('data-guideline-action')
    if (action === 'clear') {
      clearAllGuidelines()
    } else if (action === 'exit') {
      exitGuidelineMode()
    } else if (action === 'undo') {
      undoGuidelines()
    } else if (action === 'redo') {
      redoGuidelines()
    }
  })
}

function bindKeyboard () {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isGuidelineModeActive) {
      exitGuidelineMode()
      return
    }

    if (!isGuidelineModeActive) return

    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedGuidelineId) {
      event.preventDefault()
      deleteGuidelineDirectly(selectedGuidelineId)
      return
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const modifier = isMac ? event.metaKey : event.ctrlKey
    if (!modifier) return

    const key = event.key.toLowerCase()
    if (key === 'z') {
      event.preventDefault()
      if (event.shiftKey) {
        redoGuidelines()
      } else {
        undoGuidelines()
      }
    } else if (key === 'y') {
      event.preventDefault()
      redoGuidelines()
    }
  })
}

function bindPickEvents () {
  if (!viewerRef) return
  handler = new ScreenSpaceEventHandler(viewerRef.canvas)

  handler.setInputAction((movement) => {
    const picked = viewerRef.scene.pick(movement.position)
    if (picked?.id?._map3dKmlFeature) return

    const guidelineId = picked?.id?._map3dGuidelineId
    if (guidelineId) {
      selectGuideline(guidelineId, movement.position)
      return
    }

    if (typeof window.getIsKmlPickupModeActive === 'function' && window.getIsKmlPickupModeActive()) return
    if (isGuidelineModeActive) {
      addGuidelineAtPosition(movement.position)
    }
  }, ScreenSpaceEventType.LEFT_CLICK)

  handler.setInputAction((movement) => {
    updatePreview(movement.endPosition)
  }, ScreenSpaceEventType.MOUSE_MOVE)
}

export function enterGuidelineMode () {
  if (!viewerRef || isGuidelineModeActive) return
  isGuidelineModeActive = true
  viewerRef.canvas.classList.add('map3d-guideline-active')
  updateToolbarButtons()

  const toolbar = document.getElementById('guideline-toolbar')
  if (toolbar) {
    toolbar.hidden = false
  }
}

export function exitGuidelineMode () {
  if (!viewerRef || !isGuidelineModeActive) return
  isGuidelineModeActive = false
  viewerRef.canvas.classList.remove('map3d-guideline-active')
  selectedGuidelineId = null
  hideGuidelinePopup()
  removePreview()
  renderGuidelines()

  const toolbar = document.getElementById('guideline-toolbar')
  if (toolbar) {
    toolbar.hidden = true
  }
}

export async function clearAllGuidelines () {
  if (guidelinesData.length === 0) return

  const confirmed = await showConfirm('确定要清除地图上的所有辅助线吗？该操作不可撤销。', {
    title: '清除所有辅助线',
    confirmText: '清除',
    cancelText: '取消',
  })

  if (!confirmed) return
  pushHistory()
  guidelinesData = []
  selectedGuidelineId = null
  hideGuidelinePopup()
  saveGuidelinesData()
  removePreview()
  renderGuidelines()
  updateToolbarButtons()
}

export function undoGuidelines () {
  if (undoStack.length === 0) return
  redoStack.push(JSON.parse(JSON.stringify(guidelinesData)))
  guidelinesData = undoStack.pop()
  selectedGuidelineId = null
  hideGuidelinePopup()
  saveGuidelinesData()
  renderGuidelines()
  updateToolbarButtons()
}

export function redoGuidelines () {
  if (redoStack.length === 0) return
  undoStack.push(JSON.parse(JSON.stringify(guidelinesData)))
  guidelinesData = redoStack.pop()
  selectedGuidelineId = null
  hideGuidelinePopup()
  saveGuidelinesData()
  renderGuidelines()
  updateToolbarButtons()
}

export function toggleGuidelineMode3d () {
  if (isGuidelineModeActive) {
    exitGuidelineMode()
  } else {
    enterGuidelineMode()
  }
}

export function initGuidelines3d (viewer) {
  viewerRef = viewer
  window.getIsGuidelineModeActive = () => isGuidelineModeActive
  loadGuidelinesData()
  renderGuidelines()
  viewerRef.camera.changed.addEventListener(scheduleGuidelineRefresh)
  viewerRef.scene.preRender.addEventListener(updateGuidelinePopupPosition)
  bindToolbar()
  bindKeyboard()
  bindPickEvents()
}
