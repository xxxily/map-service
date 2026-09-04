import {
  expandKmlViewportForFiles,
  isKmlCoordinateInsideBounds,
} from '../../shared/kml-spatial.js'

export const KML_FEATURE_FOCUS_ZOOM = 15
export const KML_VIEWPORT_FILTER_MIN_FEATURES = 80
export const KML_VIEWPORT_BUFFER_RATIO = 2

export function shouldVirtualizeKmlPoints (featureCount) {
  return Math.max(0, Number.parseInt(featureCount, 10) || 0) >= KML_VIEWPORT_FILTER_MIN_FEATURES
}

export function expandKmlViewportBounds (bounds, ratio = KML_VIEWPORT_BUFFER_RATIO) {
  const expanded = expandKmlViewportForFiles(bounds, ratio)
  if (!expanded) return null
  // Keep the legacy object shape for ordinary ranges. Wrapped ranges carry
  // the explicit flag so consumers can test both sides of the dateline.
  if (expanded.crossesAntimeridian) return expanded
  const { south, west, north, east } = expanded
  return { south, west, north, east }
}

export function isKmlPointInsideBounds (coordinates, bounds) {
  return isKmlCoordinateInsideBounds(coordinates, bounds)
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
    // Wheel/pinch input can produce very small deltas on macOS trackpads.
    // Keep a usable half-level floor while the gesture adapter still handles
    // direction and mode boundaries independently.
    zoomSnap: 0.5,
    zoomDelta: 0.5,
  }
}
