// Cesium is injected so the gesture math remains usable in Node-based tests.
export const BUTTON_MASK = Object.freeze({
  LEFT: 1,
  RIGHT: 2,
  MIDDLE: 4,
})

const DEFAULT_MIN_CAMERA_HEIGHT = 150
const DEFAULT_MAX_CAMERA_DISTANCE = 18_000_000
const DEFAULT_MIN_PITCH = -85 * Math.PI / 180
const DEFAULT_MAX_PITCH = -15 * Math.PI / 180
const DEFAULT_MAX_ZOOM_FRACTION = 0.62
const DEFAULT_DRAG_START_THRESHOLD = 5
const DEFAULT_FALLBACK_PAN_FOVY = Math.PI / 3
const DEFAULT_MAX_FALLBACK_PAN_CSS_PIXELS = 180
const DEFAULT_MAX_FALLBACK_PAN_WORLD_DISTANCE = 1_200_000
export const DEFAULT_KEYBOARD_PAN_CSS_PIXELS = 56
export const DEFAULT_KEYBOARD_ZOOM_FRACTION = 0.18

function finiteNumber (value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function pointFrom (point) {
  if (!point || typeof point !== 'object') return null
  const x = finiteNumber(point.x ?? point.clientX, NaN)
  const y = finiteNumber(point.y ?? point.clientY, NaN)
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

function hasReachedDragThreshold (startPosition, currentPosition, threshold) {
  if (!startPosition || !currentPosition) return false
  return Math.hypot(
    finiteNumber(currentPosition.x) - finiteNumber(startPosition.x),
    finiteNumber(currentPosition.y) - finiteNumber(startPosition.y),
  ) >= threshold
}

function normalizedAngleDelta (current, previous) {
  let delta = current - previous
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return delta
}

function getGlobalWindow () {
  return typeof window === 'undefined' ? null : window
}

function getGlobalDocument () {
  return typeof document === 'undefined' ? null : document
}

function createCartesian2 (cesium, x, y) {
  const Cartesian2 = cesium?.Cartesian2
  return typeof Cartesian2 === 'function' ? new Cartesian2(x, y) : { x, y }
}

function createCartesian3 (cesium) {
  const Cartesian3 = cesium?.Cartesian3
  return typeof Cartesian3 === 'function' ? new Cartesian3() : { x: 0, y: 0, z: 0 }
}

function cartesianSubtract (cesium, left, right, result = createCartesian3(cesium)) {
  const Cartesian3 = cesium?.Cartesian3
  if (typeof Cartesian3?.subtract === 'function') return Cartesian3.subtract(left, right, result)
  result.x = finiteNumber(left?.x) - finiteNumber(right?.x)
  result.y = finiteNumber(left?.y) - finiteNumber(right?.y)
  result.z = finiteNumber(left?.z) - finiteNumber(right?.z)
  return result
}

function cartesianAdd (cesium, left, right, result = createCartesian3(cesium)) {
  const Cartesian3 = cesium?.Cartesian3
  if (typeof Cartesian3?.add === 'function') return Cartesian3.add(left, right, result)
  result.x = finiteNumber(left?.x) + finiteNumber(right?.x)
  result.y = finiteNumber(left?.y) + finiteNumber(right?.y)
  result.z = finiteNumber(left?.z) + finiteNumber(right?.z)
  return result
}

function cartesianMagnitude (cesium, vector) {
  const Cartesian3 = cesium?.Cartesian3
  if (typeof Cartesian3?.magnitude === 'function') return Cartesian3.magnitude(vector)
  return Math.hypot(finiteNumber(vector?.x), finiteNumber(vector?.y), finiteNumber(vector?.z))
}

function cartesianDistance (cesium, left, right) {
  const Cartesian3 = cesium?.Cartesian3
  if (typeof Cartesian3?.distance === 'function') return Cartesian3.distance(left, right)
  return cartesianMagnitude(cesium, cartesianSubtract(cesium, left, right))
}

function cartesianNormalize (cesium, vector, result = createCartesian3(cesium)) {
  const Cartesian3 = cesium?.Cartesian3
  if (typeof Cartesian3?.normalize === 'function') return Cartesian3.normalize(vector, result)
  const magnitude = cartesianMagnitude(cesium, vector)
  if (magnitude <= 0) return result
  result.x = finiteNumber(vector?.x) / magnitude
  result.y = finiteNumber(vector?.y) / magnitude
  result.z = finiteNumber(vector?.z) / magnitude
  return result
}

function cartesianMultiplyByScalar (cesium, vector, scalar, result = createCartesian3(cesium)) {
  const Cartesian3 = cesium?.Cartesian3
  if (typeof Cartesian3?.multiplyByScalar === 'function') return Cartesian3.multiplyByScalar(vector, scalar, result)
  result.x = finiteNumber(vector?.x) * scalar
  result.y = finiteNumber(vector?.y) * scalar
  result.z = finiteNumber(vector?.z) * scalar
  return result
}

function isNavigationMode3d (getNavigationMode) {
  return getNavigationMode?.() === '3d'
}

/**
 * Returns whether every bit in `mask` is pressed. The first argument may be a
 * PointerEvent-like value or a numeric `buttons` bitfield.
 */
export function isButtonPressed (eventOrButtons, mask) {
  const buttons = typeof eventOrButtons === 'number'
    ? eventOrButtons
    : eventOrButtons?.buttons
  return (finiteNumber(buttons) & mask) === mask
}

export function clamp (value, min, max) {
  const lower = finiteNumber(min, 0)
  const upper = finiteNumber(max, lower)
  const [minimum, maximum] = lower <= upper ? [lower, upper] : [upper, lower]
  return Math.max(minimum, Math.min(maximum, finiteNumber(value, minimum)))
}

/**
 * Builds stable two-pointer metrics from points shaped like `{ x, y }` or
 * PointerEvent-like `{ clientX, clientY }` values. Returns null for bad input.
 */
export function getTouchGestureMetrics (firstPointer, secondPointer) {
  const first = pointFrom(firstPointer)
  const second = pointFrom(secondPointer)
  if (!first || !second) return null

  const vectorX = second.x - first.x
  const vectorY = second.y - first.y
  return {
    first,
    second,
    midpoint: {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    },
    distance: Math.hypot(vectorX, vectorY),
    angle: Math.atan2(vectorY, vectorX),
  }
}

/**
 * Classifies the primary change between two two-pointer samples. A nearly
 * fixed-distance, same-direction vertical movement is treated as a tilt.
 */
export function classifyTwoPointerGesture (previous, current, options = {}) {
  if (!previous || !current) return 'none'

  const previousDistance = Math.max(1, finiteNumber(previous.distance, 1))
  const currentDistance = Math.max(1, finiteNumber(current.distance, 1))
  const distanceFraction = Math.abs(currentDistance - previousDistance) / previousDistance
  const angleDelta = Math.abs(normalizedAngleDelta(
    finiteNumber(current.angle),
    finiteNumber(previous.angle),
  ))
  const pinchThreshold = Math.max(0, finiteNumber(options.pinchThreshold, 0.04))
  const rotationThreshold = Math.max(0, finiteNumber(options.rotationThreshold, 4 * Math.PI / 180))

  if (distanceFraction >= pinchThreshold) return 'pinch'
  if (angleDelta >= rotationThreshold) return 'rotate'

  const previousFirst = pointFrom(previous.first)
  const previousSecond = pointFrom(previous.second)
  const currentFirst = pointFrom(current.first)
  const currentSecond = pointFrom(current.second)
  if (!previousFirst || !previousSecond || !currentFirst || !currentSecond) return 'none'

  const firstDeltaX = currentFirst.x - previousFirst.x
  const firstDeltaY = currentFirst.y - previousFirst.y
  const secondDeltaX = currentSecond.x - previousSecond.x
  const secondDeltaY = currentSecond.y - previousSecond.y
  const movement = Math.hypot(
    (firstDeltaX + secondDeltaX) / 2,
    (firstDeltaY + secondDeltaY) / 2,
  )
  const sameDirection = firstDeltaX * secondDeltaX + firstDeltaY * secondDeltaY > 0
  const verticalDominance = Math.abs(firstDeltaY + secondDeltaY) >=
    Math.abs(firstDeltaX + secondDeltaX) * Math.max(1, finiteNumber(options.verticalDominance, 1.2))
  const tiltThreshold = Math.max(0, finiteNumber(options.tiltThreshold, 12))

  if (movement < tiltThreshold) return 'pending'
  if (sameDirection && verticalDominance && movement >= tiltThreshold) return 'tilt'
  return 'pan'
}

/**
 * Converts a change in pinch distance to a bounded camera movement fraction.
 * Positive values zoom in; negative values zoom out.
 */
export function getZoomFraction (previousDistance, currentDistance, options = {}) {
  const before = finiteNumber(previousDistance, 0)
  const after = finiteNumber(currentDistance, 0)
  if (before <= 0 || after <= 0) return 0

  const sensitivity = Math.max(0, finiteNumber(options.sensitivity, 3))
  const maxFraction = Math.max(0, finiteNumber(options.maxFraction, DEFAULT_MAX_ZOOM_FRACTION))
  const minFraction = finiteNumber(options.minFraction, -maxFraction)
  return clamp(Math.log(after / before) * sensitivity, minFraction, maxFraction)
}

/**
 * Normalizes the canvas-only keyboard contract. Browser and assistive-tech
 * modifiers are deliberately left alone; Shift remains valid for a `+` key.
 */
export function getKeyboardNavigationCommand (event, options = {}) {
  if (!event || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return null

  const panPixels = Math.max(
    1,
    finiteNumber(options.panPixels, DEFAULT_KEYBOARD_PAN_CSS_PIXELS),
  )
  const zoomFraction = clamp(
    finiteNumber(options.zoomFraction, DEFAULT_KEYBOARD_ZOOM_FRACTION),
    0.02,
    DEFAULT_MAX_ZOOM_FRACTION,
  )
  const key = String(event.key || '')
  const code = String(event.code || '')

  if (key === 'ArrowLeft') return { type: 'pan', x: -panPixels, y: 0 }
  if (key === 'ArrowRight') return { type: 'pan', x: panPixels, y: 0 }
  if (key === 'ArrowUp') return { type: 'pan', x: 0, y: -panPixels }
  if (key === 'ArrowDown') return { type: 'pan', x: 0, y: panPixels }
  if (key === '+' || key === '=' || code === 'NumpadAdd') {
    return { type: 'zoom', fraction: zoomFraction }
  }
  if (key === '-' || key === '_' || code === 'NumpadSubtract') {
    return { type: 'zoom', fraction: -zoomFraction }
  }
  return null
}

/**
 * Gets the absolute cartographic height floor for the camera. Terrain height
 * is read synchronously from already available tiles; unloaded terrain keeps
 * the ellipsoid-based minimum instead of starting an async sample per frame.
 */
export function getMinimumCameraHeightAboveTerrain (scene, cartographic, minimumClearance) {
  const clearance = Math.max(1, finiteNumber(minimumClearance, DEFAULT_MIN_CAMERA_HEIGHT))
  try {
    const terrainHeight = finiteNumber(scene?.globe?.getHeight?.(cartographic), NaN)
    return Number.isFinite(terrainHeight) ? terrainHeight + clearance : clearance
  } catch (err) {
    return clearance
  }
}

/**
 * Maps a screen-space pan into camera-local world distances when no surface
 * position can be picked. Pointer coordinates are CSS pixels, so the scale
 * must use CSS canvas dimensions rather than the high-DPR drawing buffer.
 *
 * A missed pointer-capture event can otherwise create an arbitrarily large
 * delta. Clamp its CSS magnitude before projection, then clamp the resulting
 * world-space magnitude as a second safety boundary.
 */
export function getFallbackPanWorldDelta (cssDelta, options = {}) {
  const maxCssPixels = Math.max(
    1,
    finiteNumber(options.maxCssPixels, DEFAULT_MAX_FALLBACK_PAN_CSS_PIXELS),
  )
  const maxWorldDistance = Math.max(
    1,
    finiteNumber(options.maxWorldDistance, DEFAULT_MAX_FALLBACK_PAN_WORLD_DISTANCE),
  )
  const sourceX = finiteNumber(cssDelta?.x)
  const sourceY = finiteNumber(cssDelta?.y)
  const cssDistance = Math.hypot(sourceX, sourceY)
  const cssScale = cssDistance > maxCssPixels ? maxCssPixels / cssDistance : 1
  const deltaX = sourceX * cssScale
  const deltaY = sourceY * cssScale

  const cameraHeight = Math.max(1, finiteNumber(options.cameraHeight, 1_000_000))
  const requestedFovy = finiteNumber(options.fovy, DEFAULT_FALLBACK_PAN_FOVY)
  const fovy = requestedFovy > 0 && requestedFovy < Math.PI
    ? requestedFovy
    : DEFAULT_FALLBACK_PAN_FOVY
  const canvasWidth = Math.max(1, finiteNumber(options.canvasWidth, 1))
  const canvasHeight = Math.max(1, finiteNumber(options.canvasHeight, 1))
  const verticalSpan = 2 * cameraHeight * Math.tan(fovy / 2)
  const aspect = canvasWidth / canvasHeight
  const worldPerPixelX = verticalSpan * aspect / canvasWidth
  const worldPerPixelY = verticalSpan / canvasHeight
  let worldX = deltaX * worldPerPixelX
  let worldY = deltaY * worldPerPixelY
  const worldDistance = Math.hypot(worldX, worldY)

  if (worldDistance > maxWorldDistance) {
    const worldScale = maxWorldDistance / worldDistance
    worldX *= worldScale
    worldY *= worldScale
  }

  return { x: worldX, y: worldY }
}

/**
 * Resolves a camera anchor from rendered content first, then terrain, then
 * the ellipsoid. Keeping this standalone makes the fallback order testable.
 */
export function pickMap3dWorldPosition (scene, camera, position) {
  if (!camera || !scene || !position) return null
  try {
    const depthPosition = scene.pickPosition?.(position)
    if (depthPosition) return depthPosition
  } catch (err) {
    // `pickPosition` is unavailable for some imagery-only scenes.
  }
  try {
    const ray = camera.getPickRay?.(position)
    const terrainPosition = ray ? scene.globe?.pick?.(ray, scene) : null
    if (terrainPosition) return terrainPosition
  } catch (err) {
    // A failed terrain pick should not prevent ellipsoid fallback.
  }
  try {
    return camera.pickEllipsoid?.(position, scene.globe?.ellipsoid) || null
  } catch (err) {
    return null
  }
}

/**
 * Installs controlled camera gestures on a Cesium viewer. Returns `destroy`
 * and `cancel` so a page can cleanly unmount the viewer.
 */
export function installMap3dCameraInteraction (options = {}) {
  const {
    viewer,
    cesium,
    canvas = viewer?.canvas,
    getNavigationMode = () => '2d',
    isToolInteractionActive = () => false,
    onNavigationModeRequest,
    minCameraHeight = DEFAULT_MIN_CAMERA_HEIGHT,
    maxCameraDistance = DEFAULT_MAX_CAMERA_DISTANCE,
    minPitch = DEFAULT_MIN_PITCH,
    maxPitch = DEFAULT_MAX_PITCH,
    dragStartThreshold = DEFAULT_DRAG_START_THRESHOLD,
    advancedGestures = true,
    keyboardNavigation = true,
    keyboardPanPixels = DEFAULT_KEYBOARD_PAN_CSS_PIXELS,
    keyboardZoomFraction = DEFAULT_KEYBOARD_ZOOM_FRACTION,
    onCameraChanged,
    window: windowLike = getGlobalWindow(),
    document: documentLike = getGlobalDocument(),
  } = options

  if (!viewer || !canvas || !cesium || typeof canvas.addEventListener !== 'function') {
    return {
      cancel () {},
      destroy () {},
    }
  }

  const scene = viewer.scene
  const camera = viewer.camera
  const controller = scene?.screenSpaceCameraController
  const minimumHeight = Math.max(1, finiteNumber(minCameraHeight, DEFAULT_MIN_CAMERA_HEIGHT))
  const maximumDistance = Math.max(minimumHeight, finiteNumber(maxCameraDistance, DEFAULT_MAX_CAMERA_DISTANCE))
  const dragThreshold = Math.max(1, finiteNumber(dragStartThreshold, DEFAULT_DRAG_START_THRESHOLD))
  const enhancedGesturesEnabled = advancedGestures !== false
  const keyboardNavigationEnabled = keyboardNavigation !== false
  const [minimumPitch, maximumPitch] = minPitch <= maxPitch
    ? [minPitch, maxPitch]
    : [maxPitch, minPitch]
  const pointerState = new Map()
  const listeners = []
  let gesture = null
  let originalEnableInputs = null
  let controllerSuspended = false
  let previousTouchAction = null
  let previousTabIndex = null
  let assignedTabIndex = false
  const capturedPointerIds = new Set()

  const addListener = (target, type, listener, listenerOptions) => {
    if (!target?.addEventListener) return
    target.addEventListener(type, listener, listenerOptions)
    listeners.push(() => target.removeEventListener(type, listener, listenerOptions))
  }

  const toolInteractionActive = () => {
    try {
      return Boolean(isToolInteractionActive?.())
    } catch (err) {
      return true
    }
  }

  const notifyCameraChanged = () => {
    try {
      onCameraChanged?.()
    } catch (err) {
      // State reporting must not interrupt an active camera gesture.
    }
  }

  const screenPoint = (eventOrPoint) => {
    const point = pointFrom(eventOrPoint)
    if (!point) return null
    const rect = canvas.getBoundingClientRect?.()
    const x = point.x - finiteNumber(rect?.left)
    const y = point.y - finiteNumber(rect?.top)
    return createCartesian2(cesium, x, y)
  }

  const getCanvasCenter = () => createCartesian2(
    cesium,
    finiteNumber(canvas.clientWidth) / 2,
    finiteNumber(canvas.clientHeight) / 2,
  )

  const isCanvasKeyboardTarget = (event) => {
    const activeElement = documentLike?.activeElement
    if (activeElement && activeElement !== canvas) return false
    return !event?.target || event.target === canvas
  }

  const focusCanvas = () => {
    try {
      canvas.focus?.({ preventScroll: true })
    } catch (err) {
      try {
        canvas.focus?.()
      } catch {
        // A canvas without focus support still keeps pointer navigation usable.
      }
    }
  }

  const suspendController = () => {
    if (!controller || controllerSuspended) return
    originalEnableInputs = controller.enableInputs
    controllerSuspended = true
    controller.enableInputs = false
  }

  const restoreController = () => {
    if (!controller || !controllerSuspended) return
    controller.enableInputs = originalEnableInputs
    originalEnableInputs = null
    controllerSuspended = false
  }

  const getCameraHeight = () => {
    const height = finiteNumber(camera?.positionCartographic?.height, NaN)
    return Number.isFinite(height) ? Math.max(minimumHeight, height) : 1_000_000
  }

  // Depth picking includes visible 3D Tiles; terrain remains the next best hit.
  const pickWorldPosition = (position) => pickMap3dWorldPosition(scene, camera, position)

  const constrainCamera = () => {
    if (!camera?.position) return
    const distance = cartesianMagnitude(cesium, camera.position)
    if (Number.isFinite(distance) && distance > maximumDistance && distance > 0) {
      cartesianMultiplyByScalar(
        cesium,
        cartesianNormalize(cesium, camera.position),
        maximumDistance,
        camera.position,
      )
    }

    const ellipsoid = scene?.globe?.ellipsoid
    const Cartographic = cesium?.Cartographic
    let cartographic = camera.positionCartographic
    if (!cartographic && typeof Cartographic?.fromCartesian === 'function') {
      cartographic = Cartographic.fromCartesian(camera.position, ellipsoid)
    }
    const positionHeight = finiteNumber(cartographic?.height, NaN)
    const minimumAllowedHeight = getMinimumCameraHeightAboveTerrain(
      scene,
      cartographic,
      minimumHeight,
    )
    if (positionHeight < minimumAllowedHeight && typeof Cartographic?.fromCartesian === 'function' &&
      typeof ellipsoid?.cartographicToCartesian === 'function') {
      const positionCartographic = Cartographic.fromCartesian(camera.position, ellipsoid)
      if (positionCartographic) {
        positionCartographic.height = minimumAllowedHeight
        ellipsoid.cartographicToCartesian(positionCartographic, camera.position)
      }
    }
  }

  const moveCameraByDelta = (delta) => {
    if (!camera?.position || !delta) return
    cartesianAdd(cesium, camera.position, delta, camera.position)
    constrainCamera()
    notifyCameraChanged()
  }

  const panCamera = (previousPosition, currentPosition, fallbackDelta = null) => {
    const previousWorld = pickWorldPosition(previousPosition)
    const currentWorld = pickWorldPosition(currentPosition)
    if (previousWorld && currentWorld) {
      moveCameraByDelta(cartesianSubtract(cesium, previousWorld, currentWorld))
      return true
    }

    if (!fallbackDelta || !camera) return false
    const worldDelta = getFallbackPanWorldDelta(fallbackDelta, {
      cameraHeight: getCameraHeight(),
      fovy: camera.frustum?.fovy,
      canvasWidth: canvas.clientWidth,
      canvasHeight: canvas.clientHeight,
    })
    camera.moveRight?.(-worldDelta.x)
    camera.moveUp?.(worldDelta.y)
    constrainCamera()
    notifyCameraChanged()
    return true
  }

  const zoomCameraAt = (position, fraction) => {
    if (!camera || !Number.isFinite(fraction) || Math.abs(fraction) < 0.0001) return
    const target = pickWorldPosition(position) || pickWorldPosition(getCanvasCenter())
    const height = getCameraHeight()
    const zoomDistance = Math.min(Math.abs(height * fraction), 4_200_000)

    if (!target) {
      if (fraction > 0) camera.moveForward?.(zoomDistance)
      else camera.moveBackward?.(zoomDistance)
      constrainCamera()
      notifyCameraChanged()
      return
    }

    const direction = cartesianSubtract(cesium, target, camera.position)
    const distanceToTarget = cartesianMagnitude(cesium, direction)
    if (!Number.isFinite(distanceToTarget) || distanceToTarget <= 0) return
    cartesianNormalize(cesium, direction, direction)
    const amount = fraction > 0
      ? Math.min(zoomDistance, Math.max(0, distanceToTarget - minimumHeight))
      : -zoomDistance
    if (amount !== 0) camera.move?.(direction, amount)
    constrainCamera()
    if (amount !== 0) notifyCameraChanged()
  }

  const lookAtTarget = (target, heading, pitch) => {
    if (!target || !camera) return false
    const distance = Math.max(minimumHeight, cartesianDistance(cesium, camera.position, target))
    const HeadingPitchRange = cesium?.HeadingPitchRange
    if (typeof camera.lookAt !== 'function' || typeof HeadingPitchRange !== 'function') return false
    camera.lookAt(target, new HeadingPitchRange(heading, clamp(pitch, minimumPitch, maximumPitch), distance))
    camera.lookAtTransform?.(cesium?.Matrix4?.IDENTITY)
    constrainCamera()
    notifyCameraChanged()
    return true
  }

  const orbitCamera = (target, deltaX, deltaY) => {
    if (!target) return
    const heading = finiteNumber(camera?.heading) - deltaX * 0.003
    const pitch = finiteNumber(camera?.pitch, minimumPitch) - deltaY * 0.003
    lookAtTarget(target, heading, pitch)
  }

  const rotateHeading = (target, angleDelta) => {
    if (!target) return
    lookAtTarget(target, finiteNumber(camera?.heading) - angleDelta, finiteNumber(camera?.pitch, minimumPitch))
  }

  const tiltCamera = (target, deltaY) => {
    if (!target) return
    lookAtTarget(target, finiteNumber(camera?.heading), finiteNumber(camera?.pitch, minimumPitch) - deltaY * 0.004)
  }

  const preventHandled = (event) => {
    event.preventDefault?.()
    event.stopImmediatePropagation?.()
  }

  const request3dMode = (reason, event) => {
    if (isNavigationMode3d(getNavigationMode) || typeof onNavigationModeRequest !== 'function') return
    onNavigationModeRequest('3d', { reason, event })
  }

  const capturePointer = (pointerId) => {
    try {
      canvas.setPointerCapture?.(pointerId)
      capturedPointerIds.add(pointerId)
    } catch (err) {
      // Some browser/embedded WebView implementations do not support capture.
    }
  }

  const releasePointer = (pointerId) => {
    if (!capturedPointerIds.has(pointerId)) return
    try {
      if (canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture?.(pointerId)
    } catch (err) {
      // Pointer capture may already be released after cancel/page navigation.
    } finally {
      capturedPointerIds.delete(pointerId)
    }
  }

  const beginPendingPan = (pointerId, position) => {
    gesture = {
      kind: 'pan-pending',
      pointerId,
      startPosition: position,
      previousPosition: position,
    }
  }

  const activatePendingPan = (pointerId, position) => {
    if (gesture?.kind !== 'pan-pending' || gesture.pointerId !== pointerId) return false
    if (!hasReachedDragThreshold(gesture.startPosition, position, dragThreshold)) return false

    const previousPosition = gesture.previousPosition
    capturePointer(pointerId)
    suspendController()
    gesture = {
      kind: 'pan',
      pointerId,
      previousPosition,
    }
    return true
  }

  const beginOrbit = (pointerId, position, buttonMask) => {
    suspendController()
    gesture = {
      kind: 'orbit',
      pointerId,
      buttonMask,
      previousPosition: position,
      targetPosition: pickWorldPosition(position) || pickWorldPosition(getCanvasCenter()),
    }
  }

  const currentTwoTouchMetrics = () => {
    const points = [...pointerState.values()].filter(pointer => pointer.type === 'touch').slice(0, 2)
    if (points.length < 2) return null
    return getTouchGestureMetrics(points[0].position, points[1].position)
  }

  const beginTwoTouchGesture = () => {
    const metrics = currentTwoTouchMetrics()
    if (!metrics) return
    suspendController()
    const midpoint = createCartesian2(cesium, metrics.midpoint.x, metrics.midpoint.y)
    gesture = {
      kind: 'two-touch',
      initialMetrics: metrics,
      previousMetrics: metrics,
      lockedKind: null,
      targetPosition: pickWorldPosition(midpoint) || pickWorldPosition(getCanvasCenter()),
    }
  }

  const cancel = () => {
    for (const pointerId of [...capturedPointerIds]) releasePointer(pointerId)
    pointerState.clear()
    gesture = null
    restoreController()
  }

  const onPointerDown = (event) => {
    if (toolInteractionActive()) return
    const position = screenPoint(event)
    if (!position) return

    if (event.pointerType !== 'touch') focusCanvas()

    if (event.pointerType === 'touch') {
      pointerState.set(event.pointerId, { type: 'touch', position })
      if (gesture?.kind === 'two-touch-wait') return
      if (currentTwoTouchMetrics()) beginTwoTouchGesture()
      else beginPendingPan(event.pointerId, position)
      return
    }

    const isOrbitRequest = enhancedGesturesEnabled && (event.button === 1 || (event.button === 0 && event.shiftKey))
    if (isOrbitRequest && !isNavigationMode3d(getNavigationMode)) {
      request3dMode('orbit', event)
      return
    }
    if (event.button !== 0 && !isOrbitRequest) return

    if (isOrbitRequest) {
      capturePointer(event.pointerId)
      preventHandled(event)
      beginOrbit(
        event.pointerId,
        position,
        event.button === 1 ? BUTTON_MASK.MIDDLE : BUTTON_MASK.LEFT,
      )
    } else {
      // Do not swallow a plain press: Cesium's click handlers need pointerdown/up.
      beginPendingPan(event.pointerId, position)
    }
  }

  const onPointerMove = (event) => {
    const position = screenPoint(event)
    if (!position) return

    if (event.pointerType === 'touch') {
      const pointer = pointerState.get(event.pointerId)
      if (!pointer) return
      pointer.position = position
      if (toolInteractionActive()) {
        cancel()
        return
      }

      if (gesture?.kind === 'two-touch-wait') {
        preventHandled(event)
        return
      }

      const metrics = currentTwoTouchMetrics()
      if (metrics) {
        if (gesture?.kind !== 'two-touch') beginTwoTouchGesture()
        if (gesture?.kind !== 'two-touch') return
        preventHandled(event)
        const previous = gesture.previousMetrics
        const classifiedType = classifyTwoPointerGesture(gesture.initialMetrics, metrics)
        const type = gesture.lockedKind || (
          (!enhancedGesturesEnabled || !isNavigationMode3d(getNavigationMode)) &&
          (classifiedType === 'rotate' || classifiedType === 'tilt')
            ? 'pan'
            : classifiedType
        )
        if (type === 'pending' || type === 'none') return
        if (!gesture.lockedKind) gesture.lockedKind = type
        const midpoint = createCartesian2(cesium, metrics.midpoint.x, metrics.midpoint.y)

        if (type === 'pinch') {
          zoomCameraAt(midpoint, getZoomFraction(previous.distance, metrics.distance))
        } else if (type === 'rotate' && isNavigationMode3d(getNavigationMode)) {
          rotateHeading(gesture.targetPosition, normalizedAngleDelta(metrics.angle, previous.angle))
        } else if (type === 'tilt' && isNavigationMode3d(getNavigationMode)) {
          tiltCamera(gesture.targetPosition, metrics.midpoint.y - previous.midpoint.y)
        } else {
          panCamera(
            createCartesian2(cesium, previous.midpoint.x, previous.midpoint.y),
            midpoint,
            {
              x: metrics.midpoint.x - previous.midpoint.x,
              y: metrics.midpoint.y - previous.midpoint.y,
            },
          )
        }
        gesture.previousMetrics = metrics
        return
      }

      let activatedPendingPan = false
      if (gesture?.kind === 'pan-pending') {
        if (!activatePendingPan(event.pointerId, position)) return
        activatedPendingPan = true
        // Let Cesium observe the threshold-crossing move so its touch click
        // tolerance sees a drag; later moves are exclusively ours.
        event.preventDefault?.()
      }
      if (gesture?.kind !== 'pan') beginPendingPan(event.pointerId, position)
      if (gesture?.kind === 'pan' && gesture.pointerId === event.pointerId) {
        if (!activatedPendingPan) preventHandled(event)
        panCamera(gesture.previousPosition, position, {
          x: position.x - gesture.previousPosition.x,
          y: position.y - gesture.previousPosition.y,
        })
        gesture.previousPosition = position
      }
      return
    }

    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (toolInteractionActive()) {
      cancel()
      return
    }
    if (!isButtonPressed(event, gesture.buttonMask || BUTTON_MASK.LEFT)) {
      cancel()
      return
    }

    let activatedPendingPan = false
    if (gesture.kind === 'pan-pending') {
      if (!activatePendingPan(event.pointerId, position)) return
      activatedPendingPan = true
      // Preserve the transition event for Cesium's LEFT_CLICK tolerance while
      // still preventing browser selection/drag behaviour.
      event.preventDefault?.()
    }

    if (!activatedPendingPan) preventHandled(event)
    if (gesture.kind === 'orbit' && isNavigationMode3d(getNavigationMode)) {
      orbitCamera(
        gesture.targetPosition,
        position.x - gesture.previousPosition.x,
        position.y - gesture.previousPosition.y,
      )
    } else if (gesture.kind === 'pan') {
      panCamera(gesture.previousPosition, position, {
        x: position.x - gesture.previousPosition.x,
        y: position.y - gesture.previousPosition.y,
      })
    }
    gesture.previousPosition = position
  }

  const onPointerEnd = (event) => {
    const isTouch = event.pointerType === 'touch'
    if (isTouch && pointerState.has(event.pointerId)) {
      pointerState.delete(event.pointerId)
      releasePointer(event.pointerId)
      const remainingTouch = [...pointerState.values()].some(pointer => pointer.type === 'touch')
      if (remainingTouch) {
        // A locked two-finger gesture only ends when both fingers are lifted.
        // Keeping the controller suspended avoids a one-finger pan after tilt.
        gesture = { kind: 'two-touch-wait' }
      } else {
        gesture = null
        restoreController()
      }
      return
    }

    if (!isTouch && gesture?.pointerId === event.pointerId) {
      releasePointer(event.pointerId)
      gesture = null
      restoreController()
    }
  }

  const onWheel = (event) => {
    if (toolInteractionActive()) return
    const position = screenPoint(event)
    if (!position) return
    const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 320 : 1
    const delta = clamp(finiteNumber(event.deltaY) * multiplier, -1_200, 1_200)
    const ratio = Math.exp(-delta * 0.002)
    const fraction = getZoomFraction(1, ratio, {
      sensitivity: 1.6,
      maxFraction: 0.42,
    })
    if (fraction === 0) return
    preventHandled(event)
    suspendController()
    try {
      zoomCameraAt(position, fraction)
    } finally {
      if (!gesture) restoreController()
    }
  }

  const onKeyDown = (event) => {
    if (!keyboardNavigationEnabled || toolInteractionActive() || !isCanvasKeyboardTarget(event)) return
    const command = getKeyboardNavigationCommand(event, {
      panPixels: keyboardPanPixels,
      zoomFraction: keyboardZoomFraction,
    })
    if (!command) return

    preventHandled(event)
    suspendController()
    try {
      const center = getCanvasCenter()
      if (command.type === 'pan') {
        const next = createCartesian2(cesium, center.x + command.x, center.y + command.y)
        panCamera(center, next, { x: command.x, y: command.y })
      } else if (command.type === 'zoom') {
        zoomCameraAt(center, command.fraction)
      }
    } finally {
      if (!gesture) restoreController()
    }
  }

  const onContextMenu = (event) => {
    if (!gesture) return
    preventHandled(event)
    cancel()
  }

  const onVisibilityChange = () => {
    if (documentLike?.hidden) cancel()
  }

  previousTouchAction = canvas.style?.touchAction
  if (canvas.style) canvas.style.touchAction = 'none'
  try {
    previousTabIndex = canvas.getAttribute?.('tabindex') ?? null
    if (typeof canvas.tabIndex !== 'number' || canvas.tabIndex < 0) {
      canvas.tabIndex = 0
      assignedTabIndex = true
    }
  } catch {
    // Keyboard navigation is optional when an embedded canvas cannot be focused.
  }

  addListener(canvas, 'pointerdown', onPointerDown, { capture: true, passive: false })
  // Capture on window so a drag stays continuous if a browser drops pointer
  // capture or the pointer leaves the canvas before release.
  addListener(windowLike, 'pointermove', onPointerMove, { capture: true, passive: false })
  addListener(canvas, 'pointerup', onPointerEnd, { capture: true, passive: false })
  addListener(canvas, 'pointercancel', onPointerEnd, { capture: true, passive: false })
  addListener(canvas, 'wheel', onWheel, { capture: true, passive: false })
  addListener(canvas, 'keydown', onKeyDown)
  addListener(canvas, 'contextmenu', onContextMenu, { capture: true, passive: false })
  addListener(windowLike, 'pointerup', onPointerEnd, true)
  addListener(windowLike, 'pointercancel', onPointerEnd, true)
  addListener(windowLike, 'blur', cancel)
  addListener(windowLike, 'pagehide', cancel)
  addListener(documentLike, 'visibilitychange', onVisibilityChange)

  return {
    cancel,
    destroy () {
      cancel()
      for (const removeListener of listeners.splice(0)) removeListener()
      if (canvas.style) canvas.style.touchAction = previousTouchAction || ''
      if (assignedTabIndex) {
        try {
          if (previousTabIndex === null) canvas.removeAttribute?.('tabindex')
          else canvas.setAttribute?.('tabindex', previousTabIndex)
        } catch {
          // The viewer may already have removed its canvas during teardown.
        }
      }
    },
  }
}
