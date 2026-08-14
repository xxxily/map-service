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

export function initDesktopShiftDragRotate (map, options = {}) {
  if (!(map?.setBearing instanceof Function) || !(map?.getContainer instanceof Function)) return null

  const container = map.getContainer()
  const documentLike = options.document || globalThis.document
  const windowLike = options.window || globalThis.window
  if (!container || !documentLike?.addEventListener) return null

  const { requestFrame, cancelFrame } = getFrameScheduler(options)
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
    map.setBearing(nextBearing)
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
