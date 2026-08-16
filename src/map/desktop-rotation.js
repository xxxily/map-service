export const DEFAULT_DESKTOP_ROTATION_SENSITIVITY = 0.5

function finiteNumber (value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

/**
 * Desktop rotation follows a camera-orbit convention: dragging the pointer to
 * the right turns the viewing direction right, so the map content rotates
 * counter-clockwise inside the viewport.
 */
export function getDesktopDragBearing (startBearing, startX, currentX, sensitivity = DEFAULT_DESKTOP_ROTATION_SENSITIVITY) {
  const degreesPerPixel = Math.max(0, finiteNumber(sensitivity, DEFAULT_DESKTOP_ROTATION_SENSITIVITY))
  return finiteNumber(startBearing) -
    (finiteNumber(currentX) - finiteNumber(startX)) * degreesPerPixel
}

function getFrameScheduler (options = {}) {
  const windowLike = options.window || globalThis.window
  const requestFrame = options.requestFrame || windowLike?.requestAnimationFrame?.bind(windowLike)
  const cancelFrame = options.cancelFrame || windowLike?.cancelAnimationFrame?.bind(windowLike)

  if (requestFrame && cancelFrame) return { requestFrame, cancelFrame }
  return {
    requestFrame: callback => globalThis.setTimeout(callback, 16),
    cancelFrame: frameId => globalThis.clearTimeout(frameId),
  }
}

function getMapPanePosition (map) {
  const privatePosition = map?._getMapPanePos?.() || map?._mapPane?._leaflet_pos
  if (Number.isFinite(privatePosition?.x) && Number.isFinite(privatePosition?.y)) {
    return { x: privatePosition.x, y: privatePosition.y }
  }
  return null
}

function getMapSize (map) {
  const size = map?.getSize?.()
  if (Number.isFinite(size?.x) && Number.isFinite(size?.y)) {
    return { x: size.x, y: size.y }
  }
  return null
}

function pointsEqual (left, right, tolerance = 0.01) {
  return Boolean(left && right) &&
    Math.abs(left.x - right.x) <= tolerance &&
    Math.abs(left.y - right.y) <= tolerance
}

function rotatePointAround (point, radians, pivot) {
  const sin = Math.sin(radians)
  const cos = Math.cos(radians)
  const x = point.x - pivot.x
  const y = point.y - pivot.y
  return {
    x: x * cos - y * sin + pivot.x,
    y: x * sin + y * cos + pivot.y,
  }
}

function formatCssNumber (value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.0005) return '0'
  return String(Number(value.toFixed(3)))
}

function canReplaceMapPaneTransform (transform) {
  const value = String(transform || '').trim()
  return value === '' || value === 'none' || /^translate(?:3d)?\([^)]*\)$/i.test(value)
}

export function createLeafletRotationPreview (map) {
  const pane = map?._mapPane || map?.getPane?.('mapPane')
  if (!pane?.style) return null

  let originalStyle = null

  const start = () => {
    const size = getMapSize(map)
    const panePosition = getMapPanePosition(map)
    if (!size || !panePosition || !canReplaceMapPaneTransform(pane.style.transform)) return false

    originalStyle = {
      rotate: pane.style.rotate,
      transform: pane.style.transform,
      transformOrigin: pane.style.transformOrigin,
      willChange: pane.style.willChange,
      panePosition,
      size,
      expectedTransform: pane.style.transform,
    }
    pane.style.rotate = ''
    pane.style.transformOrigin = '0 0'
    pane.style.willChange = 'transform'
    return true
  }

  const update = ({ delta }) => {
    if (!originalStyle) return false
    const size = getMapSize(map)
    const panePosition = getMapPanePosition(map)
    const transformChanged = pane.style.transform !== originalStyle.expectedTransform
    const geometryChanged = !pointsEqual(panePosition, originalStyle.panePosition) ||
      !pointsEqual(size, originalStyle.size)
    if (!size || !panePosition || transformChanged || geometryChanged || map?._animatingZoom) return false

    const degrees = finiteNumber(delta)
    const visualCenter = { x: size.x / 2, y: size.y / 2 }
    // Rotate Leaflet's existing pane translation around the viewport center so
    // this temporary parent transform matches the final setBearing transform.
    const translatedPanePosition = rotatePointAround(
      panePosition,
      degrees * Math.PI / 180,
      visualCenter,
    )
    pane.style.transform = `translate3d(${formatCssNumber(translatedPanePosition.x)}px, ${formatCssNumber(translatedPanePosition.y)}px, 0) rotate(${degrees}deg)`
    originalStyle.expectedTransform = pane.style.transform
    return true
  }

  const finish = () => {
    if (!originalStyle) return
    pane.style.rotate = originalStyle.rotate
    if (pane.style.transform === originalStyle.expectedTransform) {
      pane.style.transform = originalStyle.transform
    }
    pane.style.transformOrigin = originalStyle.transformOrigin
    pane.style.willChange = originalStyle.willChange
    originalStyle = null
  }

  return { start, update, finish }
}

export function initDesktopShiftDragRotate (map, options = {}) {
  if (!(map?.setBearing instanceof Function) || !(map?.getContainer instanceof Function)) return null

  const container = map.getContainer()
  const documentLike = options.document || globalThis.document
  const windowLike = options.window || globalThis.window
  if (!container || !documentLike?.addEventListener) return null

  const { requestFrame, cancelFrame } = getFrameScheduler(options)
  const rotationPreview = options.preview === undefined
    ? createLeafletRotationPreview(map)
    : options.preview
  const sensitivity = Math.max(
    0,
    finiteNumber(options.sensitivity, DEFAULT_DESKTOP_ROTATION_SENSITIVITY),
  )
  let rotateState = null
  let frameId = null
  let pendingClientX = null
  let destroyed = false

  const removeActiveListeners = () => {
    documentLike.removeEventListener('mousemove', onMouseMove)
    documentLike.removeEventListener('mouseup', onMouseUp)
    windowLike?.removeEventListener?.('blur', onWindowBlur)
  }

  const applyPendingBearing = () => {
    frameId = null
    if (!rotateState || !Number.isFinite(pendingClientX)) return false

    const nextBearing = getDesktopDragBearing(
      rotateState.startBearing,
      rotateState.startX,
      pendingClientX,
      sensitivity,
    )
    pendingClientX = null
    if (Math.abs(nextBearing - rotateState.lastAppliedBearing) < 0.001) return false

    rotateState.lastAppliedBearing = nextBearing
    if (rotateState.previewActive) {
      const updated = rotationPreview?.update?.({
        bearing: nextBearing,
        delta: nextBearing - rotateState.startBearing,
      })
      if (updated === false) {
        rotationPreview?.finish?.()
        rotateState.previewActive = false
      }
    }
    if (!rotateState.previewActive) map.setBearing(nextBearing)
    options.onRotatePreview?.({ bearing: nextBearing })
    return true
  }

  const scheduleBearingUpdate = () => {
    if (frameId !== null) return
    frameId = requestFrame(applyPendingBearing)
  }

  const stopRotate = (event, endOptions = {}) => {
    if (!rotateState) return false
    const restoreDragging = endOptions.restoreDragging !== false
    const notify = endOptions.notify !== false
    const flush = endOptions.flush !== false
    if (Number.isFinite(Number(event?.clientX))) pendingClientX = Number(event.clientX)
    if (frameId !== null && !flush) {
      cancelFrame(frameId)
      frameId = null
    }
    if (flush) {
      if (frameId !== null) cancelFrame(frameId)
      frameId = null
      applyPendingBearing()
    } else {
      pendingClientX = null
    }

    const previousState = rotateState
    if (previousState.previewActive) {
      // Clear the temporary transform before Leaflet writes its authoritative
      // bearing; otherwise restoring the old inline transform would overwrite
      // the committed rotate-pane position.
      rotationPreview?.finish?.()
      if (Math.abs(previousState.lastAppliedBearing - previousState.startBearing) >= 0.001) {
        map.setBearing(previousState.lastAppliedBearing)
      }
    }
    rotateState = null
    pendingClientX = null
    removeActiveListeners()
    container.classList?.remove('map-shift-rotating')
    if (restoreDragging && previousState.wasDraggingEnabled && map.dragging?.enable instanceof Function) {
      map.dragging.enable()
    }
    if (notify) {
      options.onRotateEnd?.({
        bearing: map.getBearing instanceof Function ? map.getBearing() : previousState.lastAppliedBearing,
      })
    }
    return true
  }

  function onMouseMove (event) {
    if (!rotateState) return
    if (Number.isFinite(Number(event.buttons)) && (Number(event.buttons) & 1) === 0) {
      stopRotate(event)
      return
    }

    event.preventDefault?.()
    pendingClientX = finiteNumber(event.clientX, rotateState.startX)
    scheduleBearingUpdate()
  }

  function onMouseUp (event) {
    if (!rotateState) return
    event.preventDefault?.()
    stopRotate(event)
  }

  function onWindowBlur () {
    stopRotate()
  }

  const onMouseDown = (event) => {
    if (destroyed || event.button !== 0 || !event.shiftKey) return
    if (event.target?.closest?.(
      '.leaflet-control, .leaflet-marker-icon, .leaflet-interactive, .leaflet-popup, .leaflet-tooltip, button, a, input, textarea, select',
    )) return

    event.preventDefault?.()
    event.stopPropagation?.()
    event.stopImmediatePropagation?.()

    const startBearing = map.getBearing instanceof Function ? map.getBearing() : 0
    rotateState = {
      startX: finiteNumber(event.clientX),
      startBearing: finiteNumber(startBearing),
      lastAppliedBearing: finiteNumber(startBearing),
      wasDraggingEnabled: Boolean(map.dragging?.enabled?.()),
      previewActive: rotationPreview?.start?.() === true,
    }
    pendingClientX = rotateState.startX

    if (rotateState.wasDraggingEnabled && map.dragging?.disable instanceof Function) {
      map.dragging.disable()
    }
    container.classList?.add('map-shift-rotating')
    documentLike.addEventListener('mousemove', onMouseMove, { passive: false })
    documentLike.addEventListener('mouseup', onMouseUp, { passive: false })
    windowLike?.addEventListener?.('blur', onWindowBlur)
    options.onRotateStart?.({ bearing: rotateState.startBearing })
  }

  const teardown = ({ restoreDragging = true, notify = false, flush = true } = {}) => {
    if (rotateState) {
      stopRotate(null, { restoreDragging, notify, flush })
    } else {
      removeActiveListeners()
      if (frameId !== null) cancelFrame(frameId)
      frameId = null
      pendingClientX = null
      rotationPreview?.finish?.()
      container.classList?.remove('map-shift-rotating')
    }
    container.removeEventListener('mousedown', onMouseDown, true)
  }

  const destroy = () => {
    if (destroyed) return
    teardown()
    destroyed = true
    map.off?.('unload', onMapUnload)
  }

  const onMapUnload = () => {
    if (destroyed) return
    teardown({ restoreDragging: false, flush: false })
    destroyed = true
  }

  container.addEventListener('mousedown', onMouseDown, true)
  map.on?.('unload', onMapUnload)

  return {
    destroy,
    flush: applyPendingBearing,
    isActive: () => Boolean(rotateState),
  }
}
