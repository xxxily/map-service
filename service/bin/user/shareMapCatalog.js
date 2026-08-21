const UNSUPPORTED_SHARE_SOURCE_KINDS = new Set([
  'mvt',
  'vector-tilejson',
  'vector-style',
  'pmtiles-vector',
  'pmtiles-raster',
])

const SHARE_SPATIAL_SCOPE_VERSION = 2

const WEB_MERCATOR_COORDINATE_SYSTEMS = new Set([
  'EPSG:3857',
  'EPSG:900913',
  'WEBMERCATOR',
  'WEB_MERCATOR',
])

function finiteNumber (value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function numberArray (value, length) {
  if (!Array.isArray(value) || value.length !== length) return null
  const numbers = value.map(finiteNumber)
  return numbers.every(number => number !== null) ? numbers : null
}

function sanitizeSpatialAccess (value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const mode = source.mode === 'kml_bounds' ? 'kml_bounds' : 'unrestricted'
  const result = {
    mode,
    status: mode === 'kml_bounds' ? String(source.status || 'error') : 'ready',
    revision: Math.max(0, Number.parseInt(String(source.revision || 0), 10) || 0),
  }
  if (mode !== 'kml_bounds') return result

  result.version = SHARE_SPATIAL_SCOPE_VERSION
  result.geometryType = 'BoundingBox'

  const bbox = numberArray(source.bbox, 4)
  const cameraBounds = numberArray(source.cameraBounds, 4)
  const bboxSegments = Array.isArray(source.bboxSegments)
    ? source.bboxSegments.map(segment => numberArray(segment, 4)).filter(Boolean)
    : []
  if (bbox) result.bbox = bbox
  if (cameraBounds) result.cameraBounds = cameraBounds
  if (bboxSegments.length) result.bboxSegments = bboxSegments
  if (source.displayGeometry && typeof source.displayGeometry === 'object' && !Array.isArray(source.displayGeometry)) {
    result.displayGeometry = source.displayGeometry
  }
  for (const key of ['paddingMeters', 'areaKm2', 'diagonalKm', 'minZoom', 'maxCameraHeight']) {
    const number = finiteNumber(source[key])
    if (number !== null) result[key] = number
  }
  result.crossesAntimeridian = source.crossesAntimeridian === true
  result.unlimitedAccessEligible = source.unlimitedAccessEligible === true
  if (source.reasonCode) result.reasonCode = String(source.reasonCode)
  return result
}

function isShareRasterSource (source) {
  const coordinateSystem = String(source?.coordinateSystem || '').trim().toUpperCase()
  return Boolean(
    source?.id &&
    source?.tileUrl &&
    !UNSUPPORTED_SHARE_SOURCE_KINDS.has(String(source.kind || '')) &&
    !String(source.tileUrl).endsWith('.pbf') &&
    WEB_MERCATOR_COORDINATE_SYSTEMS.has(coordinateSystem)
  )
}

function isShareSource (source) {
  return Boolean(
    source?.id &&
    source?.tileUrl &&
    !UNSUPPORTED_SHARE_SOURCE_KINDS.has(String(source.kind || '')) &&
    !String(source.tileUrl).endsWith('.pbf')
  )
}

export function isShareMapSourceAllowed (source, spatialAccess = {}) {
  const spatial = sanitizeSpatialAccess(spatialAccess)
  return spatial.mode === 'kml_bounds'
    ? isShareRasterSource(source)
    : isShareSource(source)
}

export function buildShareMapCatalog (catalog = {}, publicId = '', options = {}) {
  const encodedPublicId = encodeURIComponent(String(publicId || ''))
  const spatialAccess = sanitizeSpatialAccess(options.spatialAccess)
  const sources = (catalog.sources || [])
    .filter(source => isShareMapSourceAllowed(source, spatialAccess))
    .map(source => ({
      ...source,
      tileUrl: `/api/v1/public/kml-shares/${encodedPublicId}/tiles/${encodeURIComponent(source.id)}/{z}/{x}/{y}`,
    }))
  const sourceIds = new Set(sources.map(source => source.id))
  const layers = (catalog.layers || [])
    .map(layer => ({
      ...layer,
      items: (layer.items || []).filter(item => sourceIds.has(item.sourceId)),
    }))
    .filter(layer => layer.items.length > 0)

  if (layers.length && !layers.some(layer => layer.default)) {
    layers[0] = { ...layers[0], default: true }
  }

  const defaultLayerId = layers.find(layer => layer.default)?.id || layers[0]?.id || ''

  return {
    ...catalog,
    sources,
    layers,
    defaultLayerId,
    spatialAccess,
  }
}

export function hasShareMapSource (catalog = {}, sourceId = '') {
  return (catalog.sources || []).some(source => source.id === String(sourceId || ''))
}

export default buildShareMapCatalog
