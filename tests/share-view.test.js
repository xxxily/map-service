import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { getSharePublicId, getShareSpatialConfig, isShareLocation } from '../src/map/share-view.js'

test('share route parser accepts only one stable public id segment', () => {
  assert.equal(getSharePublicId({ pathname: '/share/abc_123' }), 'abc_123')
  assert.equal(getSharePublicId({ pathname: '/share/%E8%B7%AF%E7%BA%BF' }), '路线')
  assert.equal(getSharePublicId({ pathname: '/3d', search: '?share=abc_123' }), 'abc_123')
  assert.equal(getSharePublicId({ pathname: '/share/abc/files' }), '')
  assert.equal(isShareLocation({ pathname: '/account' }), false)
})

test('share password prompt follows the independent 4 to 128 character policy', () => {
  const source = readFileSync(new URL('../src/map/share-view.js', import.meta.url), 'utf8')
  assert.match(source, /name="password" minlength="4" maxlength="128"/)
})

test('share pages opt out of search engine indexing in HTTP and client fallbacks', () => {
  const clientSource = readFileSync(new URL('../src/map/share-view.js', import.meta.url), 'utf8')
  const serverSource = readFileSync(new URL('../service/index.js', import.meta.url), 'utf8')
  assert.match(clientSource, /meta\.content = 'noindex, nofollow'/)
  assert.match(serverSource, /res\.set\('X-Robots-Tag', 'noindex, nofollow'\)/)
})

test('空间受限分享必须提供 ready 状态的相机边界和最低缩放级别', () => {
  const valid = getShareSpatialConfig({
    spatialAccess: { version: 2, geometryType: 'BoundingBox', mode: 'kml_bounds', status: 'ready', cameraBounds: [112, 22, 113, 23], minZoom: 11 },
  })
  assert.equal(valid.restricted, true)
  assert.equal(valid.valid, true)
  assert.equal(valid.minZoom, 11)

  const unavailable = getShareSpatialConfig({
    spatialAccess: { version: 2, geometryType: 'BoundingBox', mode: 'kml_bounds', status: 'error', cameraBounds: [112, 22, 113, 23], minZoom: 11 },
  })
  assert.equal(unavailable.valid, false)

  const malformed = getShareSpatialConfig({
    spatialAccess: { version: 2, geometryType: 'BoundingBox', mode: 'kml_bounds', status: 'ready', cameraBounds: [112, 22, 113], minZoom: 11 },
  })
  assert.equal(malformed.valid, false)

  const antimeridian = getShareSpatialConfig({
    spatialAccess: { version: 2, geometryType: 'BoundingBox', mode: 'kml_bounds', status: 'ready', cameraBounds: [179, -1, 181, 1], minZoom: 8 },
  })
  assert.equal(antimeridian.valid, true)

  const oversized = getShareSpatialConfig({
    spatialAccess: { version: 2, geometryType: 'BoundingBox', mode: 'kml_bounds', status: 'ready', cameraBounds: [-181, -1, 181, 1], minZoom: 8 },
  })
  assert.equal(oversized.valid, false)

  const legacy = getShareSpatialConfig({
    spatialAccess: { version: 1, geometryType: 'PrimitiveUnion', mode: 'kml_bounds', status: 'ready', cameraBounds: [112, 22, 113, 23], minZoom: 11 },
  })
  assert.equal(legacy.valid, false)
})
