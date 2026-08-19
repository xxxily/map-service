export const KML_FEATURE_FOCUS_ZOOM = 15
export const KML_VIEWPORT_FILTER_MIN_FEATURES = 80
export const KML_VIEWPORT_BUFFER_RATIO = 2

export function shouldVirtualizeKmlPoints (featureCount) {
  return Math.max(0, Number.parseInt(featureCount, 10) || 0) >= KML_VIEWPORT_FILTER_MIN_FEATURES
}

export function expandKmlViewportBounds (bounds, ratio = KML_VIEWPORT_BUFFER_RATIO) {
  if (!bounds) return null
  const south = Number(bounds.south)
  const west = Number(bounds.west)
  const north = Number(bounds.north)
  const east = Number(bounds.east)
  if (![south, west, north, east].every(Number.isFinite) || north < south || east < west) return null
  const safeRatio = Math.max(1, Number(ratio) || KML_VIEWPORT_BUFFER_RATIO)
  const latPad = (north - south) * (safeRatio - 1) / 2
  const lngPad = (east - west) * (safeRatio - 1) / 2
  return {
    south: Math.max(-90, south - latPad),
    west: west - lngPad,
    north: Math.min(90, north + latPad),
    east: east + lngPad,
  }
}

export function isKmlPointInsideBounds (coordinates, bounds) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !bounds) return false
  const longitude = Number(coordinates[0])
  const latitude = Number(coordinates[1])
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false
  return latitude >= bounds.south && latitude <= bounds.north &&
    longitude >= bounds.west && longitude <= bounds.east
}

export function getKmlFeatureFocusPlan (options = {}) {
  const type = String(options.type || '')
  const currentZoom = Number.isFinite(Number(options.currentZoom))
    ? Number(options.currentZoom)
    : KML_FEATURE_FOCUS_ZOOM
  if (type !== 'Point') {
    return {
      method: options.targetInView ? 'open' : 'fit-bounds',
      animate: false,
      maxZoom: KML_FEATURE_FOCUS_ZOOM,
    }
  }

  const targetZoom = Math.max(currentZoom, KML_FEATURE_FOCUS_ZOOM)
  if (options.targetInView && currentZoom >= KML_FEATURE_FOCUS_ZOOM) {
    return { method: 'open', animate: false, zoom: currentZoom }
  }
  return { method: 'set-view', animate: false, zoom: targetZoom }
}

export function getKmlLeafletPerformanceOptions () {
  return {
    preferCanvas: true,
    // These transitions keep the previous rendered frame visible while the
    // next tile level is prepared. Disabling them exposes the map background.
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
    wheelDebounceTime: 8,
    wheelPxPerZoomLevel: 45,
    zoomSnap: 0,
    zoomDelta: 0.5,
  }
}
