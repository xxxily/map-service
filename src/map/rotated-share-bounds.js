const DEG_TO_RAD = Math.PI / 180
const EPSILON = 1

function finiteNumber (value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function point (value) {
  if (Array.isArray(value)) {
    return {
      x: finiteNumber(value[0]),
      y: finiteNumber(value[1]),
    }
  }
  return {
    x: finiteNumber(value?.x),
    y: finiteNumber(value?.y),
  }
}

function normalizeProjectedBounds (bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4) return null
  const values = bounds.map(Number)
  if (!values.every(Number.isFinite)) return null
  return [
    Math.min(values[0], values[2]),
    Math.min(values[1], values[3]),
    Math.max(values[0], values[2]),
    Math.max(values[1], values[3]),
  ]
}

export function rotateVector (value, radians) {
  const input = point(value)
  const sin = Math.sin(finiteNumber(radians))
  const cos = Math.cos(finiteNumber(radians))
  return {
    x: input.x * cos - input.y * sin,
    y: input.x * sin + input.y * cos,
  }
}

export function getRotatedViewportHalfSize (size, bearing = 0) {
  const width = Math.max(0, finiteNumber(size?.x))
  const height = Math.max(0, finiteNumber(size?.y))
  const radians = finiteNumber(bearing) * DEG_TO_RAD
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  return {
    x: (cos * width + sin * height) / 2,
    y: (sin * width + cos * height) / 2,
  }
}

function clampAxis (value, minimum, maximum) {
  if (minimum <= maximum) return Math.max(minimum, Math.min(maximum, value))
  // At this zoom the viewport is larger than the allowed envelope. There is
  // no fully contained center, so keep the envelope centered and stable.
  return (minimum + maximum) / 2
}

export function limitRotatedCenterPoint (center, projectedBounds, viewportSize, bearing = 0) {
  const normalizedBounds = normalizeProjectedBounds(projectedBounds)
  if (!normalizedBounds) return point(center)

  const halfSize = getRotatedViewportHalfSize(viewportSize, bearing)
  const centerPoint = point(center)
  return {
    x: clampAxis(centerPoint.x, normalizedBounds[0] + halfSize.x, normalizedBounds[2] - halfSize.x),
    y: clampAxis(centerPoint.y, normalizedBounds[1] + halfSize.y, normalizedBounds[3] - halfSize.y),
  }
}

export function limitRotatedPanOffset (offset, center, projectedBounds, viewportSize, bearing = 0) {
  const rawOffset = point(offset)
  const centerPoint = point(center)
  const bearingRadians = finiteNumber(bearing) * DEG_TO_RAD
  const centerDelta = rotateVector(rawOffset, -bearingRadians)
  const candidateCenter = {
    x: centerPoint.x + centerDelta.x,
    y: centerPoint.y + centerDelta.y,
  }
  const limitedCenter = limitRotatedCenterPoint(candidateCenter, projectedBounds, viewportSize, bearing)
  const limitedDelta = {
    x: limitedCenter.x - centerPoint.x,
    y: limitedCenter.y - centerPoint.y,
  }
  const limitedOffset = rotateVector(limitedDelta, bearingRadians)
  return limitedOffset
}

export function getRotatedPanTargetPoint (center, offset, bearing = 0) {
  const centerPoint = point(center)
  const screenOffset = point(offset)
  const bearingRadians = finiteNumber(bearing) * DEG_TO_RAD
  const centerDelta = rotateVector(screenOffset, -bearingRadians)
  return {
    x: centerPoint.x + centerDelta.x,
    y: centerPoint.y + centerDelta.y,
  }
}

function getLatLngCorners (bounds) {
  if (!bounds) return []
  if (typeof bounds.getNorthWest === 'function') {
    const northWest = bounds.getNorthWest()
    const northEast = bounds.getNorthEast()
    const southWest = bounds.getSouthWest()
    const southEast = bounds.getSouthEast()
    return [northWest, northEast, southWest, southEast]
  }
  return []
}

function getProjectedBounds (map, bounds, zoom) {
  const corners = getLatLngCorners(bounds)
  if (corners.length !== 4 || typeof map?.project !== 'function') return null
  const points = corners.map(corner => map.project(corner, zoom)).map(point)
  return [
    Math.min(...points.map(value => value.x)),
    Math.min(...points.map(value => value.y)),
    Math.max(...points.map(value => value.x)),
    Math.max(...points.map(value => value.y)),
  ]
}

function pointsEqual (left, right, tolerance = EPSILON) {
  return Boolean(left && right) &&
    Math.abs(Number(left.x) - Number(right.x)) <= tolerance &&
    Math.abs(Number(left.y) - Number(right.y)) <= tolerance
}

export function installRotatedShareBounds (map, options = {}) {
  if (!map || map._rotate !== true || typeof map.project !== 'function' || typeof map.unproject !== 'function') return null

  const bounds = options.bounds || map.options?.maxBounds
  if (!bounds || typeof bounds.getNorthWest !== 'function') return null

  const originalLimitCenter = map._limitCenter
  const originalLimitOffset = map._limitOffset
  const originalPanBy = map.panBy
  const getBearing = () => typeof map.getBearing === 'function' ? map.getBearing() : 0
  const getViewportSize = () => typeof map.getSize === 'function' ? map.getSize() : { x: 0, y: 0 }
  const projectedBoundsAt = zoom => getProjectedBounds(map, bounds, zoom)
  const isShareBounds = requestedBounds => requestedBounds === bounds ||
    (typeof requestedBounds?.equals === 'function' && requestedBounds.equals(bounds))

  map._limitCenter = function (center, zoom, requestedBounds) {
    if (!isShareBounds(requestedBounds) || typeof map.getSize !== 'function') {
      return originalLimitCenter.call(map, center, zoom, requestedBounds)
    }
    const projectedBounds = projectedBoundsAt(zoom)
    if (!projectedBounds) return originalLimitCenter.call(map, center, zoom, requestedBounds)
    const currentPoint = map.project(center, zoom)
    const limitedPoint = limitRotatedCenterPoint(currentPoint, projectedBounds, getViewportSize(), getBearing())
    if (Math.abs(limitedPoint.x - currentPoint.x) <= EPSILON && Math.abs(limitedPoint.y - currentPoint.y) <= EPSILON) {
      return center
    }
    return map.unproject(limitedPoint, zoom)
  }

  map._limitOffset = function (offset, requestedBounds) {
    if (!isShareBounds(requestedBounds) || typeof map.getCenter !== 'function') {
      return originalLimitOffset.call(map, offset, requestedBounds)
    }
    const zoom = typeof map.getZoom === 'function' ? map.getZoom() : undefined
    const projectedBounds = projectedBoundsAt(zoom)
    if (!projectedBounds) return originalLimitOffset.call(map, offset, requestedBounds)
    const centerPoint = map.project(map.getCenter(), zoom)
    return limitRotatedPanOffset(offset, centerPoint, projectedBounds, getViewportSize(), getBearing())
  }

  // Leaflet's oversized non-animated pan path converts the offset directly
  // with project/unproject. Convert screen-space offsets back through bearing
  // first so keyboard and programmatic pans keep the same visual direction.
  map.panBy = function (offset, options) {
    const rawOffset = point(offset)
    const normalizedOffset = {
      x: Math.round(rawOffset.x),
      y: Math.round(rawOffset.y),
    }
    const bearing = getBearing()
    const animate = options?.animate
    const oversized = typeof map.getSize === 'function' && !map.getSize().contains(normalizedOffset)
    if (!bearing || animate === true || !oversized || typeof map._resetView !== 'function' || typeof map.getCenter !== 'function') {
      return originalPanBy.call(map, offset, options)
    }
    const zoom = typeof map.getZoom === 'function' ? map.getZoom() : undefined
    const centerPoint = map.project(map.getCenter(), zoom)
    const targetPoint = getRotatedPanTargetPoint(centerPoint, normalizedOffset, bearing)
    const targetCenter = map.unproject(targetPoint, zoom)
    const limitedCenter = map._limitCenter(targetCenter, zoom, bounds)
    map._resetView(limitedCenter, zoom)
    return map
  }

  let enforcing = false
  const enforceCurrentView = () => {
    if (enforcing || !map._loaded || typeof map.getCenter !== 'function') return false
    const center = map.getCenter()
    const zoom = map.getZoom()
    const limited = map._limitCenter(center, zoom, bounds)
    if (center.equals?.(limited) || pointsEqual(map.project(center, zoom), map.project(limited, zoom))) return false
    enforcing = true
    try {
      map.setView(limited, zoom, { animate: false })
    } finally {
      enforcing = false
    }
    return true
  }

  const drag = map.dragging
  const draggable = drag?._draggable
  let dragState = null
  const defaultPreDragLimit = drag?._onPreDragLimit
  const onDragStart = () => {
    if (!draggable || !draggable._startPos || typeof map.getCenter !== 'function') return
    const startPosition = draggable._startPos.clone?.() || point(draggable._startPos)
    dragState = {
      startPosition,
      startCenter: map.project(map.getCenter(), map.getZoom()),
      zoom: map.getZoom(),
      bearing: getBearing(),
      projectedBounds: projectedBoundsAt(map.getZoom()),
    }
  }
  const onPreDrag = () => {
    if (!dragState || !draggable?._newPos || !dragState.projectedBounds) return
    const rawOffset = draggable._newPos.subtract
      ? draggable._newPos.subtract(dragState.startPosition)
      : {
          x: draggable._newPos.x - dragState.startPosition.x,
          y: draggable._newPos.y - dragState.startPosition.y,
        }
    const bearingRadians = finiteNumber(dragState.bearing) * DEG_TO_RAD
    const centerDelta = rotateVector(rawOffset, -bearingRadians)
    const candidateCenter = {
      x: dragState.startCenter.x - centerDelta.x,
      y: dragState.startCenter.y - centerDelta.y,
    }
    const limitedCenter = limitRotatedCenterPoint(
      candidateCenter,
      dragState.projectedBounds,
      getViewportSize(),
      dragState.bearing,
    )
    const limitedDelta = {
      x: limitedCenter.x - dragState.startCenter.x,
      y: limitedCenter.y - dragState.startCenter.y,
    }
    const limitedCenterDelta = rotateVector(limitedDelta, dragState.bearing * DEG_TO_RAD)
    const limitedOffset = {
      x: -limitedCenterDelta.x,
      y: -limitedCenterDelta.y,
    }
    const viscosity = Math.min(1, Math.max(0, Number(map.options?.maxBoundsViscosity) || 0))
    const appliedOffset = {
      x: rawOffset.x + (limitedOffset.x - rawOffset.x) * viscosity,
      y: rawOffset.y + (limitedOffset.y - rawOffset.y) * viscosity,
    }
    if (draggable._startPos.add) draggable._newPos = draggable._startPos.add(appliedOffset)
    else draggable._newPos = { x: dragState.startPosition.x + appliedOffset.x, y: dragState.startPosition.y + appliedOffset.y }
  }
  const onDragEnd = () => { dragState = null }

  if (draggable) {
    if (defaultPreDragLimit) draggable.off('predrag', defaultPreDragLimit, drag)
    draggable.on('predrag', onPreDrag)
  }
  map.on('dragstart', onDragStart)
  map.on('dragend', onDragEnd)
  map.on('rotate', enforceCurrentView)
  map.on('zoomend', enforceCurrentView)
  map.on('resize', enforceCurrentView)
  map.on('moveend', enforceCurrentView)
  enforceCurrentView()

  return {
    enforce: enforceCurrentView,
    destroy () {
      map._limitCenter = originalLimitCenter
      map._limitOffset = originalLimitOffset
      map.panBy = originalPanBy
      map.off('dragstart', onDragStart)
      map.off('dragend', onDragEnd)
      map.off('rotate', enforceCurrentView)
      map.off('zoomend', enforceCurrentView)
      map.off('resize', enforceCurrentView)
      map.off('moveend', enforceCurrentView)
      if (draggable) {
        draggable.off('predrag', onPreDrag)
        if (defaultPreDragLimit) draggable.on('predrag', defaultPreDragLimit, drag)
      }
    },
  }
}
