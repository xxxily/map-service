import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyLodToPointList,
  cameraHeightToZoom,
  downsampleLineCoordinates,
  filterLineInViewport2d,
  filterPointsInViewport2d,
  filterPointsInViewport3d,
  getTrackDisplayFeatures,
  getTrackLodConfig,
  TRACK_LOD_CONFIGS,
  VIEWPORT_BUFFER_RATIO,
  VIEWPORT_MAX_LINE_VERTICES,
  VIEWPORT_MAX_POINTS,
} from '../src/map/location-track.js'

// ---------------------------------------------------------------------------
// getTrackLodConfig
// ---------------------------------------------------------------------------

test('getTrackLodConfig returns correct config for each zoom range', () => {
  assert.deepEqual(getTrackLodConfig(0), TRACK_LOD_CONFIGS[0])
  assert.deepEqual(getTrackLodConfig(7), TRACK_LOD_CONFIGS[0])
  assert.deepEqual(getTrackLodConfig(8), TRACK_LOD_CONFIGS[1])
  assert.deepEqual(getTrackLodConfig(12), TRACK_LOD_CONFIGS[1])
  assert.deepEqual(getTrackLodConfig(13), TRACK_LOD_CONFIGS[2])
  assert.deepEqual(getTrackLodConfig(15), TRACK_LOD_CONFIGS[2])
  assert.deepEqual(getTrackLodConfig(16), TRACK_LOD_CONFIGS[3])
  assert.deepEqual(getTrackLodConfig(20), TRACK_LOD_CONFIGS[3])
})

test('getTrackLodConfig clamps non-finite zoom to 0', () => {
  assert.deepEqual(getTrackLodConfig(NaN), TRACK_LOD_CONFIGS[0])
  assert.deepEqual(getTrackLodConfig(-5), TRACK_LOD_CONFIGS[0])
  // Infinity is not finite, so it gets clamped to 0 → first config
  assert.deepEqual(getTrackLodConfig(Infinity), TRACK_LOD_CONFIGS[0])
})

test('LOD config has increasing density at higher zoom levels', () => {
  const lowZoom = getTrackLodConfig(5)
  const midZoom = getTrackLodConfig(10)
  const cityZoom = getTrackLodConfig(14)
  const streetZoom = getTrackLodConfig(18)

  assert.equal(lowZoom.maxPoints, 0, 'low zoom should not render points')
  assert.ok(midZoom.maxPoints < cityZoom.maxPoints, 'mid zoom should have fewer points than city')
  assert.ok(cityZoom.maxPoints < streetZoom.maxPoints, 'city zoom should have fewer points than street')
  assert.ok(lowZoom.maxLineVertices < midZoom.maxLineVertices, 'low zoom should have fewer line vertices')
})

// ---------------------------------------------------------------------------
// cameraHeightToZoom
// ---------------------------------------------------------------------------

test('cameraHeightToZoom converts correctly', () => {
  // 20km height → zoom ≈ 10
  const zoom10 = cameraHeightToZoom(20000)
  assert.ok(Math.abs(zoom10 - 10) < 0.1, `expected ~10, got ${zoom10}`)

  // 305m height → zoom ≈ 16
  const zoom16 = cameraHeightToZoom(305)
  assert.ok(Math.abs(zoom16 - 16) < 0.1, `expected ~16, got ${zoom16}`)

  // Very high → low zoom
  const zoom0 = cameraHeightToZoom(20_000_000)
  assert.ok(Math.abs(zoom0) < 0.1, `expected ~0, got ${zoom0}`)
})

test('cameraHeightToZoom handles edge cases', () => {
  assert.equal(cameraHeightToZoom(0), 0)
  assert.equal(cameraHeightToZoom(-100), 0)
  assert.equal(cameraHeightToZoom(NaN), 0)
  assert.equal(cameraHeightToZoom(Infinity), 0)
})

// ---------------------------------------------------------------------------
// downsampleLineCoordinates
// ---------------------------------------------------------------------------

test('downsampleLineCoordinates preserves first and last points', () => {
  const coords = Array.from({ length: 100 }, (_, i) => [i, i * 2])
  const sampled = downsampleLineCoordinates(coords, 10)

  assert.equal(sampled.length, 10)
  assert.deepEqual(sampled[0], coords[0])
  assert.deepEqual(sampled[sampled.length - 1], coords[coords.length - 1])
})

test('downsampleLineCoordinates returns original when under limit', () => {
  const coords = [[0, 0], [1, 1], [2, 2]]
  const sampled = downsampleLineCoordinates(coords, 100)
  assert.equal(sampled, coords) // same reference (no copy needed)
})

test('downsampleLineCoordinates handles edge cases', () => {
  assert.deepEqual(downsampleLineCoordinates([], 10), [])
  assert.deepEqual(downsampleLineCoordinates([[0, 0]], 10), [[0, 0]])
  assert.deepEqual(downsampleLineCoordinates([[0, 0], [1, 1]], 10), [[0, 0], [1, 1]])
})

test('downsampleLineCoordinates enforces minimum of 2 vertices', () => {
  const coords = Array.from({ length: 50 }, (_, i) => [i, i])
  const sampled = downsampleLineCoordinates(coords, 1)
  assert.equal(sampled.length, 2)
  assert.deepEqual(sampled[0], coords[0])
  assert.deepEqual(sampled[1], coords[coords.length - 1])
})

// ---------------------------------------------------------------------------
// applyLodToPointList
// ---------------------------------------------------------------------------

test('applyLodToPointList keeps the newest points and respects maxPoints', () => {
  const points = Array.from({ length: 100 }, (_, i) => ({ index: i }))
  const lodConfig = { maxPoints: 10, pointInterval: 1 }
  const result = applyLodToPointList(points, lodConfig)

  assert.equal(result.length, 10)
  assert.equal(result[result.length - 1].index, 99) // last point preserved
})

test('applyLodToPointList applies pointInterval correctly', () => {
  const points = Array.from({ length: 100 }, (_, i) => ({ index: i }))
  const lodConfig = { maxPoints: 500, pointInterval: 5 }
  const result = applyLodToPointList(points, lodConfig)

  assert.equal(result.length, 20) // 100 / 5
  assert.equal(result[result.length - 1].index, 99) // last point
  assert.equal(result[result.length - 2].index, 94) // second-to-last (99 - 5)
})

test('applyLodToPointList returns empty when maxPoints is 0', () => {
  const points = [{ index: 0 }, { index: 1 }]
  const result = applyLodToPointList(points, { maxPoints: 0, pointInterval: 1 })
  assert.equal(result.length, 0)
})

test('applyLodToPointList handles empty input', () => {
  assert.equal(applyLodToPointList([], { maxPoints: 100, pointInterval: 1 }).length, 0)
  assert.equal(applyLodToPointList(null, { maxPoints: 100, pointInterval: 1 }).length, 0)
})

// ---------------------------------------------------------------------------
// filterPointsInViewport2d
// ---------------------------------------------------------------------------

test('filterPointsInViewport2d filters points outside the viewport', () => {
  const points = [
    { lat: 23, lng: 113, latlng: [23, 113] },
    { lat: 24, lng: 114, latlng: [24, 114] },
    { lat: 40, lng: 120, latlng: [40, 120] }, // far away
  ]
  const bounds = { south: 22, west: 112, north: 25, east: 115 }
  const result = filterPointsInViewport2d(points, bounds)

  assert.equal(result.length, 2)
  assert.equal(result[0].lat, 23)
  assert.equal(result[1].lat, 24)
})

test('filterPointsInViewport2d applies buffer ratio', () => {
  const points = [
    { lat: 21.7, lng: 111.7, latlng: [21.7, 111.7] }, // outside strict bounds, inside buffer
    { lat: 23, lng: 113, latlng: [23, 113] }, // inside bounds
    { lat: 50, lng: 150, latlng: [50, 150] }, // far outside
  ]
  // Bounds: south=22, west=112, north=24, east=114
  // With 3.0 buffer: pad = range * 1.0 = lat 2, lng 2
  // Extended: south=20, west=110, north=26, east=116
  const bounds = { south: 22, west: 112, north: 24, east: 114 }
  const result = filterPointsInViewport2d(points, bounds)

  assert.equal(result.length, 2) // first two points inside buffer
})

test('filterPointsInViewport2d handles missing bounds gracefully', () => {
  const points = [{ lat: 23, lng: 113, latlng: [23, 113] }]
  assert.equal(filterPointsInViewport2d(points, null).length, 1)
  assert.equal(filterPointsInViewport2d(points, {}).length, 1)
})

test('filterPointsInViewport2d accepts both {lat,lng} and {latlng} point formats', () => {
  const points = [
    { lat: 23, lng: 113 }, // {lat, lng} format
    { latlng: [23.5, 113.5] }, // [lat, lng] format
    { latlng: { lat: 40, lng: 120 } }, // {lat, lng} in latlng
  ]
  const bounds = { south: 22, west: 112, north: 25, east: 115 }
  const result = filterPointsInViewport2d(points, bounds)

  assert.equal(result.length, 2)
})

// ---------------------------------------------------------------------------
// filterPointsInViewport3d
// ---------------------------------------------------------------------------

test('filterPointsInViewport3d filters based on camera position and height', () => {
  const points = [
    { lat: 23, lng: 113 }, // near camera
    { lat: 40, lng: 120 }, // far from camera
  ]
  const viewer = {
    camera: {
      positionCartographic: {
        height: 1000, // ~zoom 14, visible range ~13.5 km
        latitude: (23 * Math.PI) / 180,
        longitude: (113 * Math.PI) / 180,
      },
    },
  }
  const result = filterPointsInViewport3d(points, viewer)

  assert.equal(result.length, 1)
  assert.equal(result[0].lat, 23)
})

test('filterPointsInViewport3d handles missing viewer gracefully', () => {
  const points = [{ lat: 23, lng: 113 }]
  assert.equal(filterPointsInViewport3d(points, null).length, 1)
  assert.equal(filterPointsInViewport3d(points, {}).length, 1)
  assert.equal(filterPointsInViewport3d(points, { camera: null }).length, 1)
})

// ---------------------------------------------------------------------------
// filterLineInViewport2d
// ---------------------------------------------------------------------------

test('filterLineInViewport2d preserves viewport-intersecting vertices and neighbors', () => {
  const coords = Array.from({ length: 20 }, (_, i) => [110 + i, 20 + i])
  const bounds = { south: 22, west: 112, north: 28, east: 118 }
  const result = filterLineInViewport2d(coords, bounds)

  // With 3.0 buffer: extended bounds include more points
  // Points in or near viewport+buffer should be preserved
  assert.ok(result.length >= 10, `expected at least 10, got ${result.length}`)
  assert.ok(result.length <= 20, `expected at most 20, got ${result.length}`)
  // First point should be early in the array (neighbor before bounds)
  assert.ok(result[0][0] <= 112, `first lng should be <= 112, got ${result[0][0]}`)
  // Last point should be late in the array (neighbor after bounds)
  assert.ok(result[result.length - 1][0] >= 118, `last lng should be >= 118, got ${result[result.length - 1][0]}`)
})

test('filterLineInViewport2d returns original if all points outside viewport', () => {
  const coords = [[100, 0], [101, 1], [102, 2]]
  const bounds = { south: 22, west: 112, north: 25, east: 115 }
  const result = filterLineInViewport2d(coords, bounds)

  // All points outside, result would be < 2 points, so fallback to original
  assert.equal(result, coords)
})

test('filterLineInViewport2d handles short arrays', () => {
  assert.deepEqual(filterLineInViewport2d([], { south: 0, west: 0, north: 10, east: 10 }), [])
  assert.deepEqual(filterLineInViewport2d([[5, 5]], { south: 0, west: 0, north: 10, east: 10 }), [[5, 5]])
})

// ---------------------------------------------------------------------------
// getTrackDisplayFeatures with viewport + LOD options
// ---------------------------------------------------------------------------

test('getTrackDisplayFeatures without options falls back to legacy behavior', () => {
  const coordinates = Array.from({ length: 10_000 }, (_, i) => [113 + i / 100_000, 23])
  const kmlFile = {
    isLiveTrack: true,
    renderPointLimit: 120,
    renderLinePointLimit: 2000,
    features: [
      { id: 'line', type: 'LineString', coordinates },
      ...Array.from({ length: 500 }, (_, i) => ({
        id: `point-${i}`,
        type: 'Point',
        coordinates: coordinates[i],
      })),
    ],
  }

  const displayed = getTrackDisplayFeatures(kmlFile)
  const displayedLine = displayed.find(f => f.type === 'LineString')
  const displayedPoints = displayed.filter(f => f.type === 'Point')

  // Legacy behavior: 120 points, 2000 line vertices
  assert.equal(displayedPoints.length, 120)
  assert.equal(displayedLine.coordinates.length, 2000)
})

test('getTrackDisplayFeatures with viewport bounds filters points outside viewport', () => {
  const pointFeatures = Array.from({ length: 100 }, (_, i) => ({
    id: `point-${i}`,
    type: 'Point',
    coordinates: [110 + i * 0.1, 20 + i * 0.1], // spread from 110,20 to 119.9,29.9
  }))
  const kmlFile = {
    isLiveTrack: true,
    features: [
      { id: 'line', type: 'LineString', coordinates: [[110, 20], [120, 30]] },
      ...pointFeatures,
    ],
  }

  // Viewport covering only a small area
  const viewportBounds = { south: 24, west: 114, north: 26, east: 116 }
  const displayed = getTrackDisplayFeatures(kmlFile, { viewportBounds, zoom: 16 })
  const displayedPoints = displayed.filter(f => f.type === 'Point')

  // Should be much less than 100 points (3x buffer includes more area)
  assert.ok(displayedPoints.length < 80, `expected < 80, got ${displayedPoints.length}`)
  // All displayed points should be within viewport+buffer (3x buffer: pad=2)
  displayedPoints.forEach(pt => {
    const [lng, lat] = pt.coordinates
    assert.ok(lat >= 22 && lat <= 28, `lat ${lat} outside viewport`)
    assert.ok(lng >= 112 && lng <= 118, `lng ${lng} outside viewport`)
  })
})

test('getTrackDisplayFeatures with low zoom hides all points', () => {
  const pointFeatures = Array.from({ length: 50 }, (_, i) => ({
    id: `point-${i}`,
    type: 'Point',
    coordinates: [110 + i * 0.1, 20 + i * 0.1],
  }))
  const kmlFile = {
    isLiveTrack: true,
    features: [
      { id: 'line', type: 'LineString', coordinates: [[110, 20], [115, 25]] },
      ...pointFeatures,
    ],
  }

  const viewportBounds = { south: 10, west: 100, north: 40, east: 130 }
  const displayed = getTrackDisplayFeatures(kmlFile, { viewportBounds, zoom: 5 })
  const displayedPoints = displayed.filter(f => f.type === 'Point')

  // At zoom 0-7, maxPoints is 0 → no points rendered
  assert.equal(displayedPoints.length, 0)

  // Line should still be present
  const displayedLine = displayed.find(f => f.type === 'LineString')
  assert.ok(displayedLine, 'line should still be rendered at low zoom')
})

test('getTrackDisplayFeatures with LOD downsamples line vertices', () => {
  const coordinates = Array.from({ length: 10_000 }, (_, i) => [113 + i / 100_000, 23])
  const kmlFile = {
    isLiveTrack: true,
    features: [
      { id: 'line', type: 'LineString', coordinates },
    ],
  }

  const viewportBounds = { south: 20, west: 110, north: 30, east: 120 }
  const displayedZoom10 = getTrackDisplayFeatures(kmlFile, { viewportBounds, zoom: 10 })
  const lineZoom10 = displayedZoom10.find(f => f.type === 'LineString')
  // At zoom 8-12, maxLineVertices = 1000
  assert.ok(lineZoom10.coordinates.length <= 1000, `expected <= 1000, got ${lineZoom10.coordinates.length}`)

  const displayedZoom18 = getTrackDisplayFeatures(kmlFile, { viewportBounds, zoom: 18 })
  const lineZoom18 = displayedZoom18.find(f => f.type === 'LineString')
  // At zoom 16+, maxLineVertices = 5000
  assert.ok(lineZoom18.coordinates.length <= 5000, `expected <= 5000, got ${lineZoom18.coordinates.length}`)
})

test('getTrackDisplayFeatures preserves original kmlFile features unmodified', () => {
  const coordinates = Array.from({ length: 1000 }, (_, i) => [113 + i / 100_000, 23])
  const kmlFile = {
    isLiveTrack: true,
    features: [
      { id: 'line', type: 'LineString', coordinates },
      ...Array.from({ length: 200 }, (_, i) => ({
        id: `point-${i}`,
        type: 'Point',
        coordinates: coordinates[i],
      })),
    ],
  }

  const viewportBounds = { south: 22, west: 112, north: 24, east: 114 }
  getTrackDisplayFeatures(kmlFile, { viewportBounds, zoom: 16 })

  // Original data should be untouched
  assert.equal(kmlFile.features[0].coordinates.length, 1000)
  assert.equal(kmlFile.features.length, 201)
})

test('getTrackDisplayFeatures respects VIEWPORT_MAX_POINTS hard cap', () => {
  // Create 1000 points all within the viewport
  const pointFeatures = Array.from({ length: 1000 }, (_, i) => ({
    id: `point-${i}`,
    type: 'Point',
    coordinates: [113 + (i % 10) * 0.001, 23 + Math.floor(i / 10) * 0.001],
  }))
  const kmlFile = {
    isLiveTrack: true,
    features: pointFeatures,
  }

  const viewportBounds = { south: 22, west: 112, north: 25, east: 115 }
  const displayed = getTrackDisplayFeatures(kmlFile, { viewportBounds, zoom: 18 })
  const displayedPoints = displayed.filter(f => f.type === 'Point')

  // At zoom 16+, maxPoints = 500, VIEWPORT_MAX_POINTS = 500
  assert.ok(displayedPoints.length <= VIEWPORT_MAX_POINTS, `expected <= ${VIEWPORT_MAX_POINTS}, got ${displayedPoints.length}`)
})

test('getTrackDisplayFeatures for non-live-track returns all features', () => {
  const kmlFile = {
    isLiveTrack: false,
    features: [
      { id: 'p1', type: 'Point', coordinates: [113, 23] },
      { id: 'l1', type: 'LineString', coordinates: [[113, 23], [114, 24]] },
    ],
  }

  const displayed = getTrackDisplayFeatures(kmlFile, { viewportBounds: { south: 0, west: 0, north: 1, east: 1 }, zoom: 5 })
  assert.equal(displayed.length, 2)
})

test('getTrackDisplayFeatures respects VIEWPORT_MAX_LINE_VERTICES hard cap', () => {
  const coordinates = Array.from({ length: 20_000 }, (_, i) => [113 + i / 100_000, 23])
  const kmlFile = {
    isLiveTrack: true,
    features: [
      { id: 'line', type: 'LineString', coordinates },
    ],
  }

  const viewportBounds = { south: 20, west: 110, north: 30, east: 120 }
  const displayed = getTrackDisplayFeatures(kmlFile, { viewportBounds, zoom: 18 })
  const line = displayed.find(f => f.type === 'LineString')

  assert.ok(line.coordinates.length <= VIEWPORT_MAX_LINE_VERTICES,
    `expected <= ${VIEWPORT_MAX_LINE_VERTICES}, got ${line.coordinates.length}`)
})
