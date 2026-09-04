export const KML_BOUNDS_VERSION = 1

const EPSILON = 1e-7

function finiteNumber (value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function normalizeLongitude (value) {
  const number = finiteNumber(value)
  if (number === null) return null
  let normalized = ((number + 180) % 360 + 360) % 360 - 180
  if (Math.abs(normalized + 180) < EPSILON && number > 0) normalized = 180
  return normalized
}

function longitude360 (value) {
  const normalized = normalizeLongitude(value)
  if (normalized === null) return null
  return normalized < 0 ? normalized + 360 : normalized
}

function signedLongitude (value) {
  let normalized = ((Number(value) + 180) % 360 + 360) % 360 - 180
  if (Math.abs(normalized + 180) < EPSILON && Number(value) > 0) normalized = 180
  return Number(normalized.toFixed(9))
}

function isCoordinatePair (value) {
  return Array.isArray(value) && value.length >= 2 &&
    !Array.isArray(value[0]) && !Array.isArray(value[1]) &&
    finiteNumber(value[0]) !== null && finiteNumber(value[1]) !== null
}

function collectCoordinates (value, output) {
  if (isCoordinatePair(value)) {
    const longitude = normalizeLongitude(value[0])
    const latitude = finiteNumber(value[1])
    if (longitude !== null && latitude !== null && latitude >= -90 && latitude <= 90) {
      output.push([longitude, latitude])
    }
    return
  }
  if (Array.isArray(value)) value.forEach(item => collectCoordinates(item, output))
}

export function collectKmlCoordinates (features) {
  const output = []
  ;(Array.isArray(features) ? features : []).forEach(feature => {
    collectCoordinates(feature?.coordinates, output)
  })
  return output
}

function computeLongitudeInterval (longitudes) {
  const values = longitudes
    .map(longitude360)
    .filter(value => value !== null)
    .sort((left, right) => left - right)
  if (!values.length) return null
  if (values.length === 1) {
    const longitude = signedLongitude(values[0])
    return { west: longitude, east: longitude, crossesAntimeridian: false }
  }

  let largestGap = -1
  let largestGapIndex = 0
  values.forEach((value, index) => {
    const next = index + 1 < values.length ? values[index + 1] : values[0] + 360
    const gap = next - value
    if (gap > largestGap) {
      largestGap = gap
      largestGapIndex = index
    }
  })

  const west = values[(largestGapIndex + 1) % values.length]
  const width = Math.max(0, Math.min(360, 360 - largestGap))
  if (width >= 360 - EPSILON) {
    return { west: -180, east: 180, crossesAntimeridian: false }
  }
  const east = west + width
  const signedWest = signedLongitude(west)
  const signedEast = signedLongitude(east)
  return {
    west: signedWest,
    east: signedEast,
    crossesAntimeridian: signedWest > signedEast,
  }
}

export function computeKmlBounds (features) {
  const safeFeatures = Array.isArray(features) ? features : []
  const coordinates = collectKmlCoordinates(safeFeatures)
  if (!coordinates.length) {
    return {
      version: KML_BOUNDS_VERSION,
      status: 'empty',
      bbox: null,
      crossesAntimeridian: false,
      featureCount: safeFeatures.length,
    }
  }
  const latitudes = coordinates.map(item => item[1])
  const longitudeInterval = computeLongitudeInterval(coordinates.map(item => item[0]))
  if (!longitudeInterval) {
    return {
      version: KML_BOUNDS_VERSION,
      status: 'missing',
      bbox: null,
      crossesAntimeridian: false,
      featureCount: safeFeatures.length,
    }
  }
  return {
    version: KML_BOUNDS_VERSION,
    status: 'ready',
    bbox: [
      longitudeInterval.west,
      Math.min(...latitudes),
      longitudeInterval.east,
      Math.max(...latitudes),
    ],
    crossesAntimeridian: longitudeInterval.crossesAntimeridian,
    featureCount: safeFeatures.length,
  }
}

export function normalizeKmlBounds (value, options = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const status = String(value.status || '')
  const featureCount = Number.isSafeInteger(Number(value.featureCount)) && Number(value.featureCount) >= 0
    ? Number(value.featureCount)
    : (Number.isSafeInteger(Number(options.featureCount)) && Number(options.featureCount) >= 0
        ? Number(options.featureCount)
        : 0)
  if (status === 'missing' || status === 'empty') {
    return {
      version: KML_BOUNDS_VERSION,
      status,
      bbox: null,
      crossesAntimeridian: false,
      featureCount,
    }
  }
  const version = value.version === undefined ? KML_BOUNDS_VERSION : Number(value.version)
  if (status !== 'ready' || version !== KML_BOUNDS_VERSION) return null
  if (!Array.isArray(value.bbox) || value.bbox.length !== 4) return null
  const bbox = value.bbox.map(finiteNumber)
  if (bbox.some(item => item === null)) return null
  const [west, south, east, north] = bbox
  if (south < -90 || south > 90 || north < -90 || north > 90 || south > north ||
      west < -180 || west > 180 || east < -180 || east > 180) return null
  const crossesAntimeridian = value.crossesAntimeridian === true
  if ((!crossesAntimeridian && east < west) || (crossesAntimeridian && east > west)) return null
  return {
    version: KML_BOUNDS_VERSION,
    status: 'ready',
    bbox: bbox.map(item => Number(item.toFixed(9))),
    crossesAntimeridian,
    featureCount,
  }
}

export function isKmlBoundsReady (value) {
  return normalizeKmlBounds(value)?.status === 'ready'
}

function normalizeViewport (viewport) {
  if (!viewport || typeof viewport !== 'object') return null
  // Map adapters pass either a plain bounds object or an options object with
  // the bounds under `viewportBounds`. Accept both shapes so the scheduler and
  // renderers cannot silently diverge on whether a file is in view.
  const source = viewport.viewportBounds && typeof viewport.viewportBounds === 'object'
    ? viewport.viewportBounds
    : viewport
  const south = finiteNumber(source.south)
  const west = finiteNumber(source.west)
  const north = finiteNumber(source.north)
  const east = finiteNumber(source.east)
  if ([south, west, north, east].some(value => value === null) ||
      south < -90 || north > 90 || west < -180 || west > 180 || east < -180 || east > 180 ||
      south > north) return null
  const crossesAntimeridian = source.crossesAntimeridian === true || west > east
  const width = crossesAntimeridian ? east + 360 - west : east - west
  if (width < 0 || width > 360 + EPSILON) return null
  // `west === east` with an explicit wrapped flag represents a full-globe
  // footprint, not a zero-width interval. Canonicalize every near-global
  // viewport so containment and intersection use the same two-point range.
  if (width >= 360 - EPSILON) {
    return { south, west: -180, north, east: 180, width: 360, crossesAntimeridian: false }
  }
  return { south, west, north, east, width, crossesAntimeridian }
}

function longitudeSegments (west, east, crossesAntimeridian = false) {
  if (crossesAntimeridian || east < west) return [[west, 180], [-180, east]]
  return [[west, east]]
}

/**
 * Test a [longitude, latitude] coordinate against a normal or wrapped range.
 * The range may be passed directly or under a viewportBounds property.
 */
export function isKmlCoordinateInsideBounds (coordinate, boundsValue) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return false
  const bounds = normalizeViewport(boundsValue)
  if (!bounds) return false
  const longitude = normalizeLongitude(coordinate[0])
  const latitude = finiteNumber(coordinate[1])
  if (longitude === null || latitude === null || latitude < -90 || latitude > 90) return false
  if (latitude < bounds.south || latitude > bounds.north) return false
  return longitudeSegments(bounds.west, bounds.east, bounds.crossesAntimeridian)
    .some(([west, east]) => longitude >= west && longitude <= east)
}

export function expandKmlViewportForFiles (viewport, ratio = 1.8) {
  const normalized = normalizeViewport(viewport)
  if (!normalized) return null
  const safeRatio = Math.max(1, Number(ratio) || 1.8)
  const latPad = (normalized.north - normalized.south) * (safeRatio - 1) / 2
  const lngPad = normalized.width * (safeRatio - 1) / 2
  const south = Math.max(-90, normalized.south - latPad)
  const north = Math.min(90, normalized.north + latPad)
  if (!normalized.crossesAntimeridian && normalized.width + lngPad * 2 < 360 - EPSILON) {
    const west = normalized.west - lngPad
    const east = normalized.east + lngPad
    if (west < -180 || east > 180) {
      return { south, west: signedLongitude(west), north, east: signedLongitude(east), crossesAntimeridian: true }
    }
    return { south, west, north, east, crossesAntimeridian: false }
  }
  if (normalized.width + lngPad * 2 >= 360 - EPSILON) {
    return { south, west: -180, north, east: 180, crossesAntimeridian: false }
  }
  const west = normalized.west - lngPad
  const east = normalized.east + lngPad
  return {
    south,
    west: signedLongitude(west),
    north,
    east: signedLongitude(east),
    crossesAntimeridian: signedLongitude(west) > signedLongitude(east),
  }
}

export function kmlBoundsIntersectsViewport (boundsValue, viewportValue) {
  const bounds = normalizeKmlBounds(boundsValue)
  const viewport = normalizeViewport(viewportValue)
  if (!bounds || bounds.status !== 'ready' || !viewport) return false
  const [, south, , north] = bounds.bbox
  if (north < viewport.south || south > viewport.north) return false
  const [west, , east] = bounds.bbox
  const boundsSegments = longitudeSegments(west, east, bounds.crossesAntimeridian)
  const viewportSegments = longitudeSegments(viewport.west, viewport.east, viewport.crossesAntimeridian)
  return boundsSegments.some(left => viewportSegments.some(right => left[0] <= right[1] && left[1] >= right[0]))
}

export function kmlBoundsCenter (boundsValue) {
  const bounds = normalizeKmlBounds(boundsValue)
  if (!bounds || bounds.status !== 'ready') return null
  const [west, south, east, north] = bounds.bbox
  const width = bounds.crossesAntimeridian ? east + 360 - west : east - west
  return {
    lat: (south + north) / 2,
    lng: signedLongitude(west + width / 2),
  }
}

export function wrappedLongitudeDistance (left, right) {
  const a = longitude360(left)
  const b = longitude360(right)
  if (a === null || b === null) return Number.POSITIVE_INFINITY
  const difference = Math.abs(a - b)
  return Math.min(difference, 360 - difference)
}
