import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gcj02ToWgs84, wgs84ToGcj02 } from '../src/map/coord-transform.js'
import { generateKmlText } from '../src/map/kml-format.js'

test('WGS84 coordinates convert to GCJ-02 for AMap display and restore accurately', () => {
  const source = [111.3950162020138, 22.3796367459376]
  const converted = wgs84ToGcj02(source)
  const restored = gcj02ToWgs84(converted)

  assert.ok(Math.abs(converted[0] - source[0]) > 0.001)
  assert.ok(Math.abs(converted[1] - source[1]) > 0.001)
  assert.ok(Math.abs(restored[0] - source[0]) < 1e-7)
  assert.ok(Math.abs(restored[1] - source[1]) < 1e-7)
})

test('KML export keeps stored standard coordinates unchanged', () => {
  const feature = {
    type: 'Point',
    name: '信宜地点',
    description: '标准 KML 坐标',
    coordinates: [111.3950162020138, 22.3796367459376],
  }

  const kml = generateKmlText('export.kml', [feature])

  assert.match(kml, /<coordinates>111\.3950162020138,22\.3796367459376,0<\/coordinates>/)
  assert.doesNotMatch(kml, /111\.400306/)
})

test('KML export is independent from file visibility state', () => {
  const kmlFile = {
    name: 'hidden.kml',
    enabled: false,
    features: [{
      type: 'Point',
      name: '隐藏点位',
      description: '禁用显示时仍允许导出',
      coordinates: [113.264385, 23.129112],
    }],
  }

  const kml = generateKmlText(kmlFile.name, kmlFile.features)

  assert.match(kml, /<name>hidden\.kml<\/name>/)
  assert.match(kml, /<name>隐藏点位<\/name>/)
  assert.match(kml, /<coordinates>113\.264385,23\.129112,0<\/coordinates>/)
})
