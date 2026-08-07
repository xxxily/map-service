import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildShareMapCatalog, hasShareMapSource } from '../service/bin/user/shareMapCatalog.js'

test('公开分享底图目录只保留受控栅格图源并改写为分享作用域路径', () => {
  const catalog = {
    sources: [
      { id: 'road', kind: 'xyz', tileUrl: '/api/v1/tiles/road/{z}/{x}/{y}' },
      { id: 'vector', kind: 'vector-style', styleUrl: '/api/v1/vector/styles/vector/style.json' },
    ],
    layers: [
      { id: 'road-layer', default: false, items: [{ sourceId: 'road', opacity: 1 }] },
      { id: 'vector-layer', default: true, items: [{ sourceId: 'vector', opacity: 1 }] },
    ],
  }

  const result = buildShareMapCatalog(catalog, 'share/id')

  assert.equal(result.sources.length, 1)
  assert.equal(result.sources[0].id, 'road')
  assert.equal(
    result.sources[0].tileUrl,
    '/api/v1/public/kml-shares/share%2Fid/tiles/road/{z}/{x}/{y}'
  )
  assert.deepEqual(result.layers.map(layer => layer.id), ['road-layer'])
  assert.equal(result.layers[0].default, true)
  assert.equal(result.defaultLayerId, 'road-layer')
  assert.equal(hasShareMapSource(result, 'road'), true)
  assert.equal(hasShareMapSource(result, 'vector'), false)
  assert.equal(catalog.sources[0].tileUrl, '/api/v1/tiles/road/{z}/{x}/{y}')
})
