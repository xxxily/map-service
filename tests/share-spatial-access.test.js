import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifyTileAgainstScope,
  computeSpatialScope,
  normalizeTileCoordinates,
  publicSpatialScope,
  isCurrentSpatialScope,
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

test('空间范围按全部点线面生成外包矩形和公开相机摘要', () => {
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
  assert.equal(result.scope.version, 2)
  assert.equal(result.scope.geometryType, 'BoundingBox')
  assert.ok(result.scope.areaKm2 > 0)
  assert.ok(result.scope.diagonalKm > 0)
  assert.equal(Number.isFinite(result.scope.rawAreaKm2), true)
  assert.equal(Number.isFinite(result.scope.rawDiagonalKm), true)
  assert.match(result.scope.sourceRevisionHash, /^sha256:[a-f0-9]{64}$/)
  assert.equal(result.scope.displayGeometry.type, 'MultiPolygon')
  assert.equal(isCurrentSpatialScope(result.scope), true)

  const publicScope = publicSpatialScope(result.scope, 4)
  assert.equal(publicScope.version, 2)
  assert.equal(publicScope.geometryType, 'BoundingBox')
  assert.equal(publicScope.mode, 'kml_bounds')
  assert.equal(publicScope.revision, 4)
  assert.equal(Object.hasOwn(publicScope, 'primitives'), false)
  assert.equal(Object.hasOwn(publicScope, 'sourceRevisionHash'), false)
})

test('标准嵌套 Polygon 环坐标会递归纳入空间范围', () => {
  const result = computeSpatialScope({
    documents: [documentWith({
      type: 'Polygon',
      coordinates: [[[
        113.25, 23.12,
      ], [
        113.29, 23.12,
      ], [
        113.29, 23.16,
      ], [
        113.25, 23.12,
      ]]],
    })],
    paddingMeters: 1000,
  })

  assert.equal(result.status, 'ready')
  assert.ok(result.scope.cameraBounds[0] < 113.25)
  assert.ok(result.scope.cameraBounds[2] > 113.29)
})

test('旧空间范围模型不会被当前瓦片判定继续使用', () => {
  const current = computeSpatialScope({
    documents: [documentWith({ type: 'Point', coordinates: [113.2644, 23.1291] })],
    paddingMeters: 1000,
  }).scope
  const legacy = { ...current, version: 1, geometryType: 'PrimitiveUnion' }
  const tile = tileForCoordinate(113.2644, 23.1291, Math.max(current.minZoom, 15))
  assert.equal(isCurrentSpatialScope(legacy), false)
  assert.equal(publicSpatialScope(legacy, 1), null)
  assert.equal(classifyTileAgainstScope(legacy, tile).decision, 'unavailable')
})

test('当前空间范围拒绝非法最低缩放和越界放宽阈值，但允许高于最低缩放级别', () => {
  const current = computeSpatialScope({
    documents: [documentWith({ type: 'Point', coordinates: [113.2644, 23.1291] })],
    paddingMeters: 1000,
  }).scope

  for (const minZoom of [Number.NaN, -1, 1.5, 25]) {
    const invalid = { ...current, minZoom }
    assert.equal(isCurrentSpatialScope(invalid), false)
    assert.equal(publicSpatialScope(invalid, 1), null)
  }

  const validThreshold = {
    ...current,
    unrestrictedTileMaxZoom: current.minZoom + 1,
  }
  assert.equal(isCurrentSpatialScope(validThreshold), true)
  assert.equal(publicSpatialScope(validThreshold, 1).unrestrictedTileMaxZoom, current.minZoom + 1)

  for (const invalidValue of [-1, 1.5, 25, 'abc']) {
    const invalidThreshold = { ...current, unrestrictedTileMaxZoom: invalidValue }
    assert.equal(isCurrentSpatialScope(invalidThreshold), false)
    assert.equal(publicSpatialScope(invalidThreshold, 1), null)
  }
})

test('分散点之间的外包矩形内部均允许查看', () => {
  const result = computeSpatialScope({
    documents: [documentWith(
      { type: 'Point', coordinates: [113.2, 23.1] },
      { type: 'Point', coordinates: [113.4, 23.3] }
    )],
    paddingMeters: 100,
  })
  assert.equal(result.status, 'ready')

  const middleTile = tileForCoordinate(113.3, 23.2, Math.max(result.scope.minZoom, 15))
  assert.equal(classifyTileAgainstScope(result.scope, middleTile).decision, 'allow')
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

test('低缩放范围外瓦片可按分享阈值直接放宽，高缩放仍受外包矩形限制', () => {
  const result = computeSpatialScope({
    documents: [documentWith({ type: 'Point', coordinates: [113.2644, 23.1291] })],
    paddingMeters: 3000,
    unrestrictedTileMaxZoom: 8,
  })
  assert.equal(result.status, 'ready')
  assert.equal(result.scope.unrestrictedTileMaxZoom, 8)

  const lowZoomTile = { z: 8, x: 0, y: 0 }
  assert.equal(classifyTileAgainstScope(result.scope, lowZoomTile).decision, 'allow_unrestricted')
  assert.equal(classifyTileAgainstScope(result.scope, { z: 7, x: 0, y: 0 }).decision, 'allow_unrestricted')
  assert.equal(classifyTileAgainstScope(result.scope, { z: 9, x: 0, y: 0 }).decision, 'outside')
  assert.equal(classifyTileAgainstScope(result.scope, { z: 24, x: 0, y: 0 }).decision, 'outside')

  const highZoom = Math.max(result.scope.minZoom, 17)
  const highZoomTile = { z: highZoom, x: 0, y: 0 }
  assert.equal(classifyTileAgainstScope(result.scope, highZoomTile).decision, 'outside')
})

test('低缩放放宽阈值可以高于分享最低缩放级别', () => {
  const base = computeSpatialScope({
    documents: [documentWith({ type: 'Point', coordinates: [113.2644, 23.1291] })],
    paddingMeters: 3000,
  })
  const result = computeSpatialScope({
    documents: [documentWith({ type: 'Point', coordinates: [113.2644, 23.1291] })],
    paddingMeters: 3000,
    unrestrictedTileMaxZoom: base.scope.minZoom + 1,
  })
  assert.equal(result.status, 'ready')
  assert.equal(result.scope.unrestrictedTileMaxZoom, base.scope.minZoom + 1)
})

test('未设置低缩放放宽阈值时保持低于最低缩放拒绝', () => {
  const result = computeSpatialScope({
    documents: [documentWith({ type: 'Point', coordinates: [113.2644, 23.1291] })],
    paddingMeters: 3000,
  })
  const tile = tileForCoordinate(113.2644, 23.1291, Math.max(0, result.scope.minZoom - 1))
  assert.equal(classifyTileAgainstScope(result.scope, tile).decision, 'below_min_zoom')
})

test('分散点首屏瓦片保持为可遮罩边界而不是误判范围外', () => {
  const points = Array.from({ length: 140 }, (_, index) => ({
    type: 'Point',
    coordinates: [111.0686406 + (index % 14) * 0.036, 22.2961005 + Math.floor(index / 14) * 0.04],
  }))
  const result = computeSpatialScope({ documents: [documentWith(...points)], paddingMeters: 1000 })
  assert.equal(result.status, 'ready')
  assert.ok(result.scope.minZoom <= 11)
  const tile = tileForCoordinate(points[0].coordinates[0], points[0].coordinates[1], result.scope.minZoom)
  assert.equal(classifyTileAgainstScope(result.scope, tile).decision, 'boundary')
})

test('细线穿过瓦片时即使不命中角点或中心也会判定为边界', () => {
  const result = computeSpatialScope({
    documents: [documentWith({
      type: 'LineString',
      coordinates: [[113.2001, 23.1001], [113.2999, 23.1001]],
    })],
    paddingMeters: 100,
  })
  assert.equal(result.status, 'ready')
  const zoom = Math.max(result.scope.minZoom, 14)
  const tile = tileForCoordinate(113.25, 23.105, zoom)
  assert.equal(classifyTileAgainstScope(result.scope, tile).decision, 'boundary')
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
