import assert from 'node:assert/strict'
import test from 'node:test'

import {
  computeKmlBounds,
  expandKmlViewportForFiles,
  kmlBoundsCenter,
  kmlBoundsIntersectsViewport,
  normalizeKmlBounds,
} from '../shared/kml-spatial.js'

const point = (id, lng, lat) => ({ id, type: 'Point', coordinates: [lng, lat] })

test('KML bounds traverses nested line and polygon coordinates', () => {
  const bounds = computeKmlBounds([
    point('point', 113.1, 22.1),
    { id: 'line', type: 'LineString', coordinates: [[112.8, 21.9], [113.8, 22.7]] },
    { id: 'polygon', type: 'Polygon', coordinates: [[[112.9, 22.2], [113.3, 22.2]]] },
  ])
  assert.equal(bounds.status, 'ready')
  assert.deepEqual(bounds.bbox, [112.8, 21.9, 113.8, 22.7])
  assert.equal(bounds.crossesAntimeridian, false)
  assert.equal(bounds.featureCount, 3)
})

test('KML bounds chooses the shortest longitude interval across the antimeridian', () => {
  const bounds = computeKmlBounds([point('east', 179.2, 10), point('west', -179.4, 11)])
  assert.deepEqual(bounds.bbox, [179.2, 10, -179.4, 11])
  assert.equal(bounds.crossesAntimeridian, true)
  assert.deepEqual(kmlBoundsCenter(bounds), { lat: 10.5, lng: 179.9 })
  assert.equal(kmlBoundsIntersectsViewport(bounds, {
    south: 9,
    west: 178,
    north: 12,
    east: -178,
  }), true)
  assert.equal(kmlBoundsIntersectsViewport(bounds, {
    south: 9,
    west: -170,
    north: 12,
    east: -160,
  }), false)
})

test('invalid or empty coordinates produce an explicit compatibility status', () => {
  assert.equal(computeKmlBounds([point('bad-lat', 10, 100)]).status, 'empty')
  assert.equal(computeKmlBounds([]).status, 'empty')
  assert.equal(normalizeKmlBounds({ status: 'ready', version: 1, bbox: [0, 0, 1] }), null)
  assert.equal(normalizeKmlBounds({ status: 'missing', version: 1, bbox: null }).status, 'missing')
})

test('viewport expansion accepts wrapped and nested viewport options', () => {
  const expanded = expandKmlViewportForFiles({
    viewportBounds: { south: 0, west: 179, north: 2, east: -179, crossesAntimeridian: true },
    zoom: 10,
  }, 1.8)
  assert.equal(expanded.crossesAntimeridian, true)
  assert.ok(expanded.west > expanded.east)
  assert.equal(kmlBoundsIntersectsViewport(
    computeKmlBounds([point('wrapped', -179.6, 1)]),
    expanded,
  ), true)
})
