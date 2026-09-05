export const TOUCH_ROTATION_THRESHOLD_DEG = 30

const PATCH_FLAG = Symbol.for('map-service.touch-rotation')
const TOUCH_IDENTIFIERS = Symbol.for('map-service.touch-rotation-identifiers')

const PI2 = Math.PI * 2

/**
 * Normalize a signed angle difference to the shortest path around a circle.
 * The returned value is in the inclusive range [-PI, PI].
 */
export function normalizeAngleDeltaRadians (delta) {
  let normalized = Number(delta)
  if (!Number.isFinite(normalized)) return 0
  while (normalized > Math.PI) normalized -= PI2
  while (normalized < -Math.PI) normalized += PI2
  return normalized
}

/**
 * Return the angle of the line from the second point to the first point.
 * atan2 keeps the quadrant information that atan(x / y) loses.
 */
export function getTouchRotationAngle (firstPoint, secondPoint) {
  return Math.atan2(
    Number(firstPoint?.x) - Number(secondPoint?.x),
    Number(firstPoint?.y) - Number(secondPoint?.y),
  )
}

export function getTouchRotationDeltaRadians (startAngle, currentAngle) {
  return normalizeAngleDeltaRadians(Number(currentAngle) - Number(startAngle))
}

export function shouldActivateTouchRotation (deltaRadians, thresholdDeg = TOUCH_ROTATION_THRESHOLD_DEG) {
  const threshold = Number(thresholdDeg)
  if (!Number.isFinite(threshold) || threshold < 0) return false
  const deltaDeg = Math.abs(Number(deltaRadians)) * (180 / Math.PI)
  return deltaDeg + 1e-9 >= threshold
}

export function captureTouchIdentifiers (touches) {
  if (!touches || touches.length !== 2) return null
  const first = touches[0]?.identifier
  const second = touches[1]?.identifier
  if (first == null || second == null || first === second) return null
  return { first, second }
}

export function resolveTouchPair (touches, identifiers) {
  if (!touches || !identifiers) return null

  let first = null
  let second = null
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches[index]
    if (touch?.identifier === identifiers.first) first = touch
    if (touch?.identifier === identifiers.second) second = touch
  }

  return first && second ? [first, second] : null
}

function getRotationConstants (Leaflet) {
  const radToDeg = Number(Leaflet?.DomUtil?.RAD_TO_DEG)
  const degToRad = Number(Leaflet?.DomUtil?.DEG_TO_RAD)
  return {
    radToDeg: Number.isFinite(radToDeg) ? radToDeg : 180 / Math.PI,
    degToRad: Number.isFinite(degToRad) ? degToRad : Math.PI / 180,
  }
}

/**
 * Install the corrected touch gesture adapter on leaflet-rotate's 2D handler.
 * The adapter intentionally remains opt-in from the 2D entry point so the
 * Cesium page keeps its independent pointer gesture implementation.
 */
export function installStableTouchGestures (Leaflet, options = {}) {
  const prototype = Leaflet?.Map?.TouchGestures?.prototype
  if (!prototype || prototype[PATCH_FLAG]) return false

  const originalTouchStart = prototype._onTouchStart
  const originalTouchEnd = prototype._onTouchEnd
  if (!(originalTouchStart instanceof Function) ||
      !(prototype._onTouchMove instanceof Function) ||
      !(originalTouchEnd instanceof Function)) {
    return false
  }

  const thresholdDeg = Number.isFinite(Number(options.thresholdDeg))
    ? Number(options.thresholdDeg)
    : TOUCH_ROTATION_THRESHOLD_DEG
  const { radToDeg, degToRad } = getRotationConstants(Leaflet)

  prototype._onTouchStart = function (event) {
    originalTouchStart.call(this, event)
    this[TOUCH_IDENTIFIERS] = null
    this._rotationThresholdTriggered = false

    if (!(this._zooming || this._rotating)) return

    const identifiers = captureTouchIdentifiers(event?.touches)
    if (!identifiers) return
    this[TOUCH_IDENTIFIERS] = identifiers

    if (!this._rotating) return
    const touchPair = resolveTouchPair(event.touches, identifiers)
    if (!touchPair) return
    const map = this._map
    const firstPoint = map.mouseEventToContainerPoint(touchPair[0])
    const secondPoint = map.mouseEventToContainerPoint(touchPair[1])
    this._startTheta = getTouchRotationAngle(firstPoint, secondPoint)
    this._startBearing = map.getBearing()
  }

  prototype._onTouchMove = function (event) {
    if (!event?.touches || event.touches.length !== 2 || !(this._zooming || this._rotating)) return

    const touchPair = resolveTouchPair(event.touches, this[TOUCH_IDENTIFIERS])
    if (!touchPair) {
      Leaflet.DomEvent.preventDefault(event)
      return
    }

    const map = this._map
    const firstPoint = map.mouseEventToContainerPoint(touchPair[0])
    const secondPoint = map.mouseEventToContainerPoint(touchPair[1])
    const scale = this._zooming ? firstPoint.distanceTo(secondPoint) / this._startDist : 1
    let delta

    if (this._rotating) {
      const theta = getTouchRotationAngle(firstPoint, secondPoint)
      let bearingDelta = getTouchRotationDeltaRadians(this._startTheta, theta) * radToDeg

      if (!this._rotationThresholdTriggered && shouldActivateTouchRotation(
        bearingDelta * degToRad,
        thresholdDeg,
      )) {
        this._rotationThresholdTriggered = true
        // Soft-start at the first intentional rotation sample so the map does
        // not jump by the amount that accumulated while the threshold was met.
        this._startTheta = theta
        this._startBearing = map.getBearing()
        bearingDelta = 0
      }

      if (this._rotationThresholdTriggered && bearingDelta) {
        map.setBearing(this._startBearing - bearingDelta)
      }
    }

    if (this._zooming) {
      this._zoom = map.getScaleZoom(scale, this._startZoom)

      if (!map.options.bounceAtZoomLimits && (
        (this._zoom < map.getMinZoom() && scale < 1) ||
        (this._zoom > map.getMaxZoom() && scale > 1))) {
        this._zoom = map._limitZoom(this._zoom)
      }

      if (map.options.touchZoom === 'center') {
        this._center = this._startLatLng
        if (scale === 1) {
          Leaflet.DomEvent.preventDefault(event)
          return
        }
      } else {
        delta = firstPoint._add(secondPoint)._divideBy(2)._subtract(this._centerPoint)
        if (scale === 1 && delta.x === 0 && delta.y === 0) {
          Leaflet.DomEvent.preventDefault(event)
          return
        }

        const alpha = -map.getBearing() * degToRad
        this._center = map.unproject(map.project(this._pinchStartLatLng).subtract(delta.rotate(alpha)))
      }
    }

    if (!this._zooming) {
      Leaflet.DomEvent.preventDefault(event)
      return
    }

    if (!this._moved) {
      map._moveStart(true, false)
      this._moved = true
    }

    Leaflet.Util.cancelAnimFrame(this._animRequest)

    const moveFn = map._move.bind(map, this._center, this._zoom, { pinch: true, round: false }, undefined)
    this._animRequest = Leaflet.Util.requestAnimFrame(moveFn, this, true)

    Leaflet.DomEvent.preventDefault(event)
  }

  prototype._onTouchEnd = function (event) {
    const wasActive = this._zooming || this._rotating
    const result = originalTouchEnd.call(this, event)

    // leaflet-rotate returns early when no zoom frame was scheduled. That is
    // common for a rotation-only sample (or a stationary pinch), but it leaves
    // `_rotating` set and prevents the next two-finger gesture from starting.
    if (wasActive && !this._moved) {
      this._zooming = false
      this._rotating = false
      if (this._animRequest != null && Leaflet.Util?.cancelAnimFrame instanceof Function) {
        Leaflet.Util.cancelAnimFrame(this._animRequest)
      }
      const documentLike = globalThis.document
      if (documentLike && Leaflet.DomEvent?.off instanceof Function) {
        Leaflet.DomEvent
          .off(documentLike, 'touchmove', this._onTouchMove, this)
          .off(documentLike, 'touchend touchcancel', this._onTouchEnd, this)
      }
    }

    this[TOUCH_IDENTIFIERS] = null
    this._rotationThresholdTriggered = false
    return result
  }

  prototype[PATCH_FLAG] = true
  return true
}
