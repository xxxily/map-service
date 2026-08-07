const UNSUPPORTED_SHARE_SOURCE_KINDS = new Set([
  'mvt',
  'vector-tilejson',
  'vector-style',
  'pmtiles-vector',
  'pmtiles-raster',
])

function isShareRasterSource (source) {
  return Boolean(
    source?.id &&
    source?.tileUrl &&
    !UNSUPPORTED_SHARE_SOURCE_KINDS.has(String(source.kind || '')) &&
    !String(source.tileUrl).endsWith('.pbf')
  )
}

export function buildShareMapCatalog (catalog = {}, publicId = '') {
  const encodedPublicId = encodeURIComponent(String(publicId || ''))
  const sources = (catalog.sources || [])
    .filter(isShareRasterSource)
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
  }
}

export function hasShareMapSource (catalog = {}, sourceId = '') {
  return (catalog.sources || []).some(source => source.id === String(sourceId || ''))
}

export default buildShareMapCatalog
