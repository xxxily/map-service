import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildShareMapCatalog,
  hasShareMapSource,
  isShareMapSourceAllowed,
} from '../service/bin/user/shareMapCatalog.js'

test('公开分享底图目录只保留受控栅格图源并改写为分享作用域路径', () => {
  const catalog = {
    sources: [
      { id: 'road', kind: 'xyz', coordinateSystem: 'EPSG:3857', tileUrl: '/api/v1/tiles/road/{z}/{x}/{y}' },
      { id: 'wgs84', kind: 'xyz', coordinateSystem: 'EPSG:4326', tileUrl: '/api/v1/tiles/wgs84/{z}/{x}/{y}' },
      { id: 'vector', kind: 'vector-style', styleUrl: '/api/v1/vector/styles/vector/style.json' },
    ],
    layers: [
      { id: 'road-layer', default: false, items: [{ sourceId: 'road', opacity: 1 }] },
      { id: 'wgs84-layer', default: false, items: [{ sourceId: 'wgs84', opacity: 1 }] },
      { id: 'vector-layer', default: true, items: [{ sourceId: 'vector', opacity: 1 }] },
    ],
  }

  const result = buildShareMapCatalog(catalog, 'share/id')

  assert.equal(result.sources.length, 2)
  assert.equal(result.sources[0].id, 'road')
  assert.equal(
    result.sources[0].tileUrl,
    '/api/v1/public/kml-shares/share%2Fid/tiles/road/{z}/{x}/{y}'
  )
  assert.deepEqual(result.layers.map(layer => layer.id), ['road-layer', 'wgs84-layer'])
  assert.equal(result.layers[0].default, true)
  assert.equal(result.defaultLayerId, 'road-layer')
  assert.equal(hasShareMapSource(result, 'road'), true)
  assert.equal(hasShareMapSource(result, 'wgs84'), true)
  assert.equal(hasShareMapSource(result, 'vector'), false)
  assert.equal(isShareMapSourceAllowed(catalog.sources[0]), true)
  assert.equal(isShareMapSourceAllowed(catalog.sources[2]), false)
  assert.equal(catalog.sources[0].tileUrl, '/api/v1/tiles/road/{z}/{x}/{y}')
})

test('公开分享底图目录拒绝非 Web Mercator 图源并携带脱敏空间摘要', () => {
  const result = buildShareMapCatalog({
    sources: [
      { id: 'wgs84', kind: 'xyz-raster', coordinateSystem: 'EPSG:4326', tileUrl: '/api/v1/tiles/wgs84/{z}/{x}/{y}' },
      { id: 'road', kind: 'xyz-raster', coordinateSystem: 'EPSG:3857', tileUrl: '/api/v1/tiles/road/{z}/{x}/{y}' },
    ],
    layers: [{ id: 'base', default: true, items: [{ sourceId: 'wgs84' }, { sourceId: 'road' }] }],
  }, 'share-1', {
    spatialAccess: {
      mode: 'kml_bounds',
      status: 'ready',
      areaKm2: 1,
      unrestrictedTileMaxZoom: 8,
      internalScope: { primitives: ['secret'] },
      sourceRevisionHash: 'sha256:secret',
    },
  })

  assert.deepEqual(result.sources.map(source => source.id), ['road'])
  assert.deepEqual(result.layers[0].items.map(item => item.sourceId), ['road'])
  assert.deepEqual(result.spatialAccess, {
    mode: 'kml_bounds',
    status: 'ready',
    version: 2,
    geometryType: 'BoundingBox',
    revision: 0,
    areaKm2: 1,
    unrestrictedTileMaxZoom: 8,
    crossesAntimeridian: false,
    unlimitedAccessEligible: false,
  })
  assert.equal(Object.hasOwn(result.spatialAccess, 'internalScope'), false)
  assert.equal(Object.hasOwn(result.spatialAccess, 'sourceRevisionHash'), false)
  assert.equal(isShareMapSourceAllowed(result.sources[0], result.spatialAccess), true)
  assert.equal(isShareMapSourceAllowed({
    id: 'wgs84',
    kind: 'xyz-raster',
    coordinateSystem: 'EPSG:4326',
    tileUrl: '/api/v1/tiles/wgs84/{z}/{x}/{y}',
  }, result.spatialAccess), false)
})
