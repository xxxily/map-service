import crypto from 'node:crypto'

const EARTH_RADIUS_METERS = 6371008.8
const WEB_MERCATOR_MAX_LAT = 85.05112878
const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const EPSILON = 1e-7

export const SHARE_SPATIAL_SCOPE_VERSION = 2

export function normalizeUnrestrictedTileMaxZoom (value) {
  if (value === null || value === undefined || value === '') return null
  const zoom = Number(value)
  return Number.isSafeInteger(zoom) && zoom >= 0 && zoom <= 24 ? zoom : null
}

function clamp (value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function normalizeLongitude360 (longitude) {
  const normalized = Number(longitude) % 360
  return normalized < 0 ? normalized + 360 : normalized
}

function normalizeLongitude180 (longitude) {
  const normalized = ((Number(longitude) + 180) % 360 + 360) % 360 - 180
  return normalized === -180 ? 180 : normalized
}

function minimalLongitudeArc (longitudes) {
  const values = longitudes.map(normalizeLongitude360).sort((left, right) => left - right)
  if (!values.length) return null
  if (values.length === 1) return { start: values[0], end: values[0], span: 0 }
  let largestGap = -1
  let gapIndex = 0
  for (let index = 0; index < values.length; index += 1) {
    const current = values[index]
    const next = index === values.length - 1 ? values[0] + 360 : values[index + 1]
    const gap = next - current
    if (gap > largestGap) {
      largestGap = gap
      gapIndex = index
    }
  }
  const start = values[(gapIndex + 1) % values.length]
  const span = 360 - largestGap
  return { start, end: start + span, span }
}

function unwrapLongitude (longitude, center) {
  let value = normalizeLongitude360(longitude)
  while (value - center > 180 + EPSILON) value -= 360
  while (center - value > 180 + EPSILON) value += 360
  return value
}

export function isCurrentSpatialScope (scope) {
  const minZoom = Number(scope?.minZoom)
  const rawUnrestrictedTileMaxZoom = scope?.unrestrictedTileMaxZoom
  const unrestrictedTileMaxZoom = normalizeUnrestrictedTileMaxZoom(rawUnrestrictedTileMaxZoom)
  const hasValidUnrestrictedTileMaxZoom = rawUnrestrictedTileMaxZoom === undefined ||
    rawUnrestrictedTileMaxZoom === null ||
    unrestrictedTileMaxZoom !== null
  return Boolean(
    scope &&
    Number(scope.version) === SHARE_SPATIAL_SCOPE_VERSION &&
    scope.geometryType === 'BoundingBox' &&
    scope.projection &&
    Array.isArray(scope.localBounds) &&
    scope.localBounds.length === 4 &&
    scope.localBounds.every(value => Number.isFinite(Number(value))) &&
    Number.isSafeInteger(minZoom) &&
    minZoom >= 0 && minZoom <= 24 &&
    hasValidUnrestrictedTileMaxZoom
  )
}

function containsRectangle (scope, corners) {
  const [minX, minY, maxX, maxY] = scope.localBounds
  return corners.every(point =>
    point[0] >= minX - EPSILON && point[0] <= maxX + EPSILON &&
    point[1] >= minY - EPSILON && point[1] <= maxY + EPSILON
  )
}

function rectangleIntersectsScope (scope, rectangle) {
  const bounds = scope.localBounds
  return rectangle[0] <= bounds[2] + EPSILON && rectangle[2] >= bounds[0] - EPSILON &&
    rectangle[1] <= bounds[3] + EPSILON && rectangle[3] >= bounds[1] - EPSILON
}

function projectCoordinate (coordinate, projection) {
  const longitude = unwrapLongitude(coordinate[0], projection.centerLongitude)
  return [
    EARTH_RADIUS_METERS * (longitude - projection.centerLongitude) * DEG_TO_RAD * projection.cosLatitude,
    EARTH_RADIUS_METERS * (coordinate[1] - projection.referenceLatitude) * DEG_TO_RAD,
  ]
}

function unprojectCoordinate (coordinate, projection) {
  const longitude = projection.centerLongitude + coordinate[0] / (EARTH_RADIUS_METERS * projection.cosLatitude) * RAD_TO_DEG
  const latitude = projection.referenceLatitude + coordinate[1] / EARTH_RADIUS_METERS * RAD_TO_DEG
  return [normalizeLongitude180(longitude), clamp(latitude, -90, 90)]
}

function featureCoordinates (feature) {
  if (!Array.isArray(feature?.coordinates)) return []
  const coordinates = []
  const collect = value => {
    if (!Array.isArray(value)) return
    if (value.length >= 2 && !Array.isArray(value[0]) && !Array.isArray(value[1])) {
      coordinates.push(value)
      return
    }
    value.forEach(collect)
  }
  collect(feature.coordinates)
  if (feature?.type === 'Point' && coordinates.length > 1) return []
  return coordinates
}

function collectFeatures (documents) {
  const features = []
  let invalidFeatureCount = 0
  for (const document of documents || []) {
    for (const feature of document.features || []) {
      if (!['Point', 'LineString', 'Polygon'].includes(feature?.type)) {
        invalidFeatureCount += 1
        continue
      }
      const coordinates = featureCoordinates(feature)
      if (!coordinates.length || coordinates.some(coordinate => !Array.isArray(coordinate) ||
        !Number.isFinite(Number(coordinate[0])) || !Number.isFinite(Number(coordinate[1])) ||
        Number(coordinate[0]) < -180 || Number(coordinate[0]) > 180 ||
        Number(coordinate[1]) < -90 || Number(coordinate[1]) > 90)) {
        invalidFeatureCount += 1
        continue
      }
      features.push({ type: feature.type, coordinates: coordinates.map(coordinate => [Number(coordinate[0]), Number(coordinate[1])]) })
    }
  }
  return { features, invalidFeatureCount }
}

function buildProjection (features) {
  const coordinates = features.flatMap(feature => feature.coordinates)
  if (!coordinates.length) return null
  if (coordinates.some(coordinate => Math.abs(coordinate[1]) >= WEB_MERCATOR_MAX_LAT)) {
    return { errorCode: 'SHARE_SPATIAL_POLAR_UNSUPPORTED' }
  }
  const arc = minimalLongitudeArc(coordinates.map(coordinate => coordinate[0]))
  if (!arc || arc.span >= 180 - EPSILON) return { errorCode: 'SHARE_SPATIAL_ANTIMERIDIAN_UNSTABLE' }
  const referenceLatitude = coordinates.reduce((total, coordinate) => total + coordinate[1], 0) / coordinates.length
  const cosLatitude = Math.cos(referenceLatitude * DEG_TO_RAD)
  if (!Number.isFinite(cosLatitude) || Math.abs(cosLatitude) < 0.08) return { errorCode: 'SHARE_SPATIAL_POLAR_UNSUPPORTED' }
  return {
    unwrapStart: arc.start,
    centerLongitude: arc.start + arc.span / 2,
    referenceLatitude,
    cosLatitude,
    crossesAntimeridian: arc.start < 180 && arc.end > 180,
  }
}

function projectedBounds (features, projection, paddingMeters) {
  const points = features.flatMap(feature =>
    feature.coordinates.map(coordinate => projectCoordinate(coordinate, projection))
  )
  if (!points.length) return null
  return [
    Math.min(...points.map(point => point[0])) - paddingMeters,
    Math.min(...points.map(point => point[1])) - paddingMeters,
    Math.max(...points.map(point => point[0])) + paddingMeters,
    Math.max(...points.map(point => point[1])) + paddingMeters,
  ]
}

function boundingBoxAreaKm2 (scope) {
  const [minX, minY, maxX, maxY] = scope.localBounds
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY) / 1_000_000
}

function geographicBounds (localBounds, projection) {
  const southwest = unprojectCoordinate([localBounds[0], localBounds[1]], projection)
  const northeast = unprojectCoordinate([localBounds[2], localBounds[3]], projection)
  const westUnwrapped = projection.centerLongitude + localBounds[0] /
    (EARTH_RADIUS_METERS * projection.cosLatitude) * RAD_TO_DEG
  const eastUnwrapped = projection.centerLongitude + localBounds[2] /
    (EARTH_RADIUS_METERS * projection.cosLatitude) * RAD_TO_DEG
  const south = southwest[1]
  const north = northeast[1]
  const cameraBounds = [westUnwrapped, south, eastUnwrapped, north]
  const segments = []
  const startWorld = Math.floor((westUnwrapped + 180) / 360)
  const endWorld = Math.floor((eastUnwrapped + 180 - EPSILON) / 360)
  for (let world = startWorld; world <= endWorld; world += 1) {
    const worldWest = -180 + world * 360
    const worldEast = 180 + world * 360
    const segmentWest = Math.max(westUnwrapped, worldWest)
    const segmentEast = Math.min(eastUnwrapped, worldEast)
    if (segmentEast > segmentWest) {
      segments.push([
        clamp(segmentWest - world * 360, -180, 180),
        south,
        clamp(segmentEast - world * 360, -180, 180),
        north,
      ])
    }
  }
  if (!segments.length) segments.push([southwest[0], south, northeast[0], north])
  return { cameraBounds, bbox: segments[0], bboxSegments: segments }
}

function bboxDisplayGeometry (bboxSegments) {
  return {
    type: 'MultiPolygon',
    coordinates: bboxSegments.map(([west, south, east, north]) => [[
      [west, south], [east, south], [east, north], [west, north], [west, south],
    ]]),
  }
}

function mercatorLatitude (latitude) {
  const bounded = clamp(Number(latitude), -WEB_MERCATOR_MAX_LAT, WEB_MERCATOR_MAX_LAT)
  const radians = bounded * DEG_TO_RAD
  return (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2
}

function calculateMinZoom (cameraBounds) {
  if (!Array.isArray(cameraBounds) || cameraBounds.length !== 4) return 0
  const longitudeSpan = Math.max(EPSILON, Math.min(360, Number(cameraBounds[2]) - Number(cameraBounds[0])))
  const latitudeSpan = Math.max(EPSILON, Math.abs(
    mercatorLatitude(cameraBounds[3]) - mercatorLatitude(cameraBounds[1])
  ))
  // Keep the minimum zoom tied to the complete allowed envelope rather than
  // only the padding width. Long tracks must still fit in the first view;
  // the server-side tile decision remains the authoritative boundary.
  const worldFraction = Math.min(1, Math.max(longitudeSpan / 360, latitudeSpan))
  return clamp(Math.floor(Math.log2(1 / worldFraction)), 0, 22)
}

function roundMetric (value, digits = 3) {
  const factor = 10 ** digits
  return Math.round(Number(value) * factor) / factor
}

export function computeSpatialScope (options = {}) {
  const paddingMeters = Number(options.paddingMeters)
  if (!Number.isFinite(paddingMeters) || paddingMeters <= 0) {
    return { status: 'error', reasonCode: 'SHARE_SPATIAL_PADDING_INVALID' }
  }
  const unrestrictedTileMaxZoom = normalizeUnrestrictedTileMaxZoom(options.unrestrictedTileMaxZoom)
  if (options.unrestrictedTileMaxZoom !== undefined &&
      options.unrestrictedTileMaxZoom !== null && options.unrestrictedTileMaxZoom !== '' &&
      unrestrictedTileMaxZoom === null) {
    return { status: 'error', reasonCode: 'SHARE_SPATIAL_TILE_ZOOM_INVALID' }
  }
  const { features, invalidFeatureCount } = collectFeatures(options.documents || [])
  if (!features.length) return { status: 'empty', reasonCode: 'SHARE_SPATIAL_BOUNDS_EMPTY', invalidFeatureCount }
  const projection = buildProjection(features)
  if (!projection || projection.errorCode) {
    return { status: 'error', reasonCode: projection?.errorCode || 'SHARE_SPATIAL_BOUNDS_EMPTY', invalidFeatureCount }
  }
  const localBounds = projectedBounds(features, projection, paddingMeters)
  if (!localBounds) return { status: 'empty', reasonCode: 'SHARE_SPATIAL_BOUNDS_EMPTY', invalidFeatureCount }
  const scope = {
    version: SHARE_SPATIAL_SCOPE_VERSION,
    projection,
    localBounds,
    paddingMeters,
  }
  const areaKm2 = boundingBoxAreaKm2(scope)
  const diagonalKm = Math.hypot(localBounds[2] - localBounds[0], localBounds[3] - localBounds[1]) / 1000
  const bounds = geographicBounds(localBounds, projection)
  const minZoom = calculateMinZoom(bounds.cameraBounds)
  const sourceRevisionHash = `sha256:${crypto.createHash('sha256').update(JSON.stringify({
    sources: options.sourceRevisions || [],
    paddingMeters,
    unrestrictedTileMaxZoom,
    policyRevision: Number(options.policyRevision || 1),
    scopeVersion: SHARE_SPATIAL_SCOPE_VERSION,
    localBounds,
  })).digest('hex')}`
  return {
    status: 'ready',
    reasonCode: null,
    scope: {
      ...scope,
      ...bounds,
      displayGeometry: bboxDisplayGeometry(bounds.bboxSegments),
      geometryType: 'BoundingBox',
      rawAreaKm2: areaKm2,
      rawDiagonalKm: diagonalKm,
      areaKm2: roundMetric(areaKm2),
      diagonalKm: roundMetric(diagonalKm),
      minZoom,
      unrestrictedTileMaxZoom,
      maxCameraHeight: Math.max(2000, Math.round(diagonalKm * 2500)),
      crossesAntimeridian: projection.crossesAntimeridian,
      sourceRevisions: Array.isArray(options.sourceRevisions) ? options.sourceRevisions : [],
      sourceRevisionHash,
      policyRevision: Number(options.policyRevision || 1),
      computedAt: options.computedAt || new Date().toISOString(),
      invalidFeatureCount,
    },
  }
}

export function publicSpatialScope (scope, revision = 0) {
  if (!isCurrentSpatialScope(scope) || !Array.isArray(scope.cameraBounds)) return null
  return {
    version: SHARE_SPATIAL_SCOPE_VERSION,
    geometryType: 'BoundingBox',
    mode: 'kml_bounds',
    status: 'ready',
    bbox: scope.bbox,
    bboxSegments: scope.bboxSegments,
    cameraBounds: scope.cameraBounds,
    displayGeometry: scope.displayGeometry,
    paddingMeters: Number(scope.paddingMeters),
    areaKm2: Number(scope.areaKm2),
    diagonalKm: Number(scope.diagonalKm),
    minZoom: Number(scope.minZoom),
    unrestrictedTileMaxZoom: normalizeUnrestrictedTileMaxZoom(scope.unrestrictedTileMaxZoom),
    maxCameraHeight: Number(scope.maxCameraHeight),
    crossesAntimeridian: Boolean(scope.crossesAntimeridian),
    revision: Number(revision || 0),
  }
}

function tileLongitude (x, zoom) {
  return x / (2 ** zoom) * 360 - 180
}

function tileLatitude (y, zoom) {
  const mercator = Math.PI * (1 - 2 * y / (2 ** zoom))
  return Math.atan(Math.sinh(mercator)) * RAD_TO_DEG
}

export function normalizeTileCoordinates (tile = {}) {
  const z = Number(tile.z)
  const x = Number(tile.x)
  const y = Number(tile.y)
  if (!Number.isSafeInteger(z) || z < 0 || z > 24 || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
    return null
  }
  const size = 2 ** z
  if (y < 0 || y >= size) return null
  return { z, x: ((x % size) + size) % size, y }
}

export function classifyTileAgainstScope (scope, tile) {
  const normalized = normalizeTileCoordinates(tile)
  if (!normalized) return { decision: 'invalid', tile: null }
  if (!isCurrentSpatialScope(scope)) {
    return { decision: 'unavailable', tile: normalized }
  }
  const unrestrictedTileMaxZoom = normalizeUnrestrictedTileMaxZoom(scope.unrestrictedTileMaxZoom)
  if (unrestrictedTileMaxZoom !== null && normalized.z <= unrestrictedTileMaxZoom) {
    return { decision: 'allow_unrestricted', tile: normalized }
  }
  if (unrestrictedTileMaxZoom === null && normalized.z < Number(scope.minZoom || 0)) {
    return { decision: 'below_min_zoom', tile: normalized }
  }
  const west = tileLongitude(normalized.x, normalized.z)
  const east = tileLongitude(normalized.x + 1, normalized.z)
  const north = tileLatitude(normalized.y, normalized.z)
  const south = tileLatitude(normalized.y + 1, normalized.z)
  const geographicCorners = [[west, north], [east, north], [east, south], [west, south]]
  const corners = geographicCorners.map(coordinate => projectCoordinate(coordinate, scope.projection))
  if (containsRectangle(scope, corners)) return { decision: 'allow', tile: normalized }
  const rectangle = [
    Math.min(...corners.map(point => point[0])),
    Math.min(...corners.map(point => point[1])),
    Math.max(...corners.map(point => point[0])),
    Math.max(...corners.map(point => point[1])),
  ]
  return { decision: rectangleIntersectsScope(scope, rectangle) ? 'boundary' : 'outside', tile: normalized }
}

export function spatialPolicyEligibility (scope, settings = {}) {
  if (!scope) return {
    spatialAccessEligible: false,
    unlimitedAccessEligible: false,
    reasonCode: 'SHARE_SPATIAL_BOUNDS_EMPTY',
  }
  const areaKm2 = Number.isFinite(Number(scope.rawAreaKm2))
    ? Number(scope.rawAreaKm2)
    : Number(scope.areaKm2)
  const diagonalKm = Number.isFinite(Number(scope.rawDiagonalKm))
    ? Number(scope.rawDiagonalKm)
    : Number(scope.diagonalKm)
  const spatialMaxAreaKm2 = Number(settings.spatialMaxAreaKm2)
  const spatialMaxDiagonalKm = Number(settings.spatialMaxDiagonalKm)
  const unlimitedMaxAreaKm2 = Number(settings.unlimitedAccessMaxAreaKm2)
  const unlimitedMaxDiagonalKm = Number(settings.unlimitedAccessMaxDiagonalKm)
  if (![areaKm2, diagonalKm, spatialMaxAreaKm2, spatialMaxDiagonalKm].every(Number.isFinite)) {
    return {
      spatialAccessEligible: false,
      unlimitedAccessEligible: false,
      reasonCode: 'SHARE_SPATIAL_POLICY_INVALID',
    }
  }
  if (areaKm2 > spatialMaxAreaKm2 + EPSILON ||
      diagonalKm > spatialMaxDiagonalKm + EPSILON) {
    return {
      spatialAccessEligible: false,
      unlimitedAccessEligible: false,
      reasonCode: 'SHARE_SPATIAL_RANGE_TOO_LARGE',
    }
  }
  if (settings.unlimitedAccessEnabled !== true) {
    return {
      spatialAccessEligible: true,
      unlimitedAccessEligible: false,
      reasonCode: 'SHARE_UNLIMITED_ACCESS_DISABLED',
    }
  }
  if (![unlimitedMaxAreaKm2, unlimitedMaxDiagonalKm].every(Number.isFinite)) {
    return {
      spatialAccessEligible: true,
      unlimitedAccessEligible: false,
      reasonCode: 'SHARE_SPATIAL_POLICY_INVALID',
    }
  }
  if (areaKm2 > unlimitedMaxAreaKm2 + EPSILON ||
      diagonalKm > unlimitedMaxDiagonalKm + EPSILON) {
    return {
      spatialAccessEligible: true,
      unlimitedAccessEligible: false,
      reasonCode: 'SHARE_UNLIMITED_ACCESS_RANGE_TOO_LARGE',
    }
  }
  return { spatialAccessEligible: true, unlimitedAccessEligible: true, reasonCode: null }
}

export const TRANSPARENT_TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==',
  'base64'
)
