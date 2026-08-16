import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifyTileAgainstScope,
  computeSpatialScope,
  normalizeTileCoordinates,
  publicSpatialScope,
  spatialPolicyEligibility,
} from '../service/bin/user/shareSpatialAccess.js'

function documentWith (...features) {
  return { features }
}

function tileForCoordinate (longitude, latitude, zoom) {
  const scale = 2 ** zoom
  const latitudeRadians = latitude * Math.PI / 180
  return {
    z: zoom,
    x: Math.floor((longitude + 180) / 360 * scale),
    y: Math.floor((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale),
  }
}

test('空间范围合并点线面并生成公开相机摘要', () => {
  const result = computeSpatialScope({
    documents: [documentWith(
      { type: 'Point', coordinates: [113.2644, 23.1291] },
      { type: 'LineString', coordinates: [[113.26, 23.12], [113.28, 23.14]] },
      { type: 'Polygon', coordinates: [[113.25, 23.12], [113.27, 23.12], [113.27, 23.13], [113.25, 23.12]] }
    )],
    paddingMeters: 1000,
    sourceRevisions: [{ id: 'kml_one', revision: 3 }],
    policyRevision: 2,
    computedAt: '2026-08-16T00:00:00.000Z',
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.scope.policyRevision, 2)
  assert.equal(result.scope.paddingMeters, 1000)
  assert.ok(result.scope.areaKm2 > 0)
  assert.ok(result.scope.diagonalKm > 0)
  assert.equal(Number.isFinite(result.scope.rawAreaKm2), true)
  assert.equal(Number.isFinite(result.scope.rawDiagonalKm), true)
  assert.match(result.scope.sourceRevisionHash, /^sha256:[a-f0-9]{64}$/)
  assert.equal(result.scope.displayGeometry.type, 'MultiPolygon')

  const publicScope = publicSpatialScope(result.scope, 4)
  assert.equal(publicScope.mode, 'kml_bounds')
  assert.equal(publicScope.revision, 4)
  assert.equal(Object.hasOwn(publicScope, 'primitives'), false)
  assert.equal(Object.hasOwn(publicScope, 'sourceRevisionHash'), false)
})

test('空间范围拒绝空几何、非法坐标和不稳定极区', () => {
  assert.deepEqual(computeSpatialScope({ documents: [], paddingMeters: 1000 }), {
    status: 'empty',
    reasonCode: 'SHARE_SPATIAL_BOUNDS_EMPTY',
    invalidFeatureCount: 0,
  })

  const invalid = computeSpatialScope({
    documents: [documentWith({ type: 'Point', coordinates: [Number.NaN, 23] })],
    paddingMeters: 1000,
  })
  assert.equal(invalid.status, 'empty')
  assert.equal(invalid.invalidFeatureCount, 1)

  const polar = computeSpatialScope({
    documents: [documentWith({ type: 'Point', coordinates: [10, 86] })],
    paddingMeters: 1000,
  })
  assert.equal(polar.status, 'error')
  assert.equal(polar.reasonCode, 'SHARE_SPATIAL_POLAR_UNSUPPORTED')
})

test('空间范围按最小经度弧处理反经线', () => {
  const result = computeSpatialScope({
    documents: [documentWith({
      type: 'LineString',
      coordinates: [[179.9, 10], [-179.9, 10.05]],
    })],
    paddingMeters: 1000,
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.scope.crossesAntimeridian, true)
  assert.equal(result.scope.bboxSegments.length, 2)
  assert.ok(result.scope.bboxSegments[0][0] > 179)
  assert.equal(result.scope.bboxSegments[0][2], 180)
  assert.equal(result.scope.bboxSegments[1][0], -180)
  assert.ok(result.scope.bboxSegments[1][2] < -179)
  assert.ok(result.scope.diagonalKm < 30)
})

test('长轨迹的最低缩放按完整相机范围计算', () => {
  const result = computeSpatialScope({
    documents: [documentWith({
      type: 'LineString',
      coordinates: [[100, 20], [110, 20]],
    })],
    paddingMeters: 1000,
  })

  assert.equal(result.status, 'ready')
  assert.ok(result.scope.cameraBounds[2] - result.scope.cameraBounds[0] >= 10)
  assert.ok(result.scope.minZoom <= 6)
})

test('瓦片判定规范化世界环绕并区分允许、边界和范围外', () => {
  const result = computeSpatialScope({
    documents: [documentWith({ type: 'Point', coordinates: [113.2644, 23.1291] })],
    paddingMeters: 3000,
  })
  assert.equal(result.status, 'ready')

  const zoom = Math.max(result.scope.minZoom, 17)
  const centerTile = tileForCoordinate(113.2644, 23.1291, zoom)
  assert.equal(classifyTileAgainstScope(result.scope, centerTile).decision, 'allow')
  assert.equal(
    classifyTileAgainstScope(result.scope, { ...centerTile, x: centerTile.x + 2 ** zoom }).decision,
    'allow'
  )
  assert.equal(
    classifyTileAgainstScope(result.scope, { ...centerTile, x: centerTile.x + 100 }).decision,
    'outside'
  )
  assert.equal(
    classifyTileAgainstScope(
      result.scope,
      tileForCoordinate(113.2644, 23.1291, Math.max(0, result.scope.minZoom - 1))
    ).decision,
    'below_min_zoom'
  )
  assert.equal(classifyTileAgainstScope(result.scope, { z: -1, x: 0, y: 0 }).decision, 'invalid')
  assert.deepEqual(normalizeTileCoordinates({ z: 2, x: -1, y: 1 }), { z: 2, x: 3, y: 1 })
})

test('空间和不限授权资格使用总体与更严格阈值', () => {
  const scope = { areaKm2: 10, diagonalKm: 8 }
  const settings = {
    spatialMaxAreaKm2: 100,
    spatialMaxDiagonalKm: 50,
    unlimitedAccessEnabled: true,
    unlimitedAccessMaxAreaKm2: 20,
    unlimitedAccessMaxDiagonalKm: 10,
  }
  assert.deepEqual(spatialPolicyEligibility(scope, settings), {
    spatialAccessEligible: true,
    unlimitedAccessEligible: true,
    reasonCode: null,
  })
  assert.equal(spatialPolicyEligibility({ ...scope, diagonalKm: 60 }, settings).reasonCode, 'SHARE_SPATIAL_RANGE_TOO_LARGE')
  assert.equal(spatialPolicyEligibility({ ...scope, diagonalKm: 12 }, settings).reasonCode, 'SHARE_UNLIMITED_ACCESS_RANGE_TOO_LARGE')
  assert.equal(spatialPolicyEligibility(scope, { ...settings, unlimitedAccessEnabled: false }).reasonCode, 'SHARE_UNLIMITED_ACCESS_DISABLED')

  const unrounded = { areaKm2: 10, rawAreaKm2: 10.001, diagonalKm: 8, rawDiagonalKm: 8 }
  assert.equal(spatialPolicyEligibility(unrounded, { ...settings, spatialMaxAreaKm2: 10 }).reasonCode, 'SHARE_SPATIAL_RANGE_TOO_LARGE')
})
