import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateKmlText } from '../src/map/kml-format.js'

test('browser KML export preserves style hints and safe point marker icons in ExtendedData', () => {
  const kml = generateKmlText('图标测试', [{
    id: 'feat-1',
    type: 'Point',
    name: '观景台',
    description: '720 云全景',
    styleUrl: '#MarkerStylePicture',
    markerIcon: 'viewpoint',
    coordinates: [113.2644, 23.1291],
  }])

  assert.match(kml, /<styleUrl>#MarkerStylePicture<\/styleUrl>/)
  assert.match(kml, /<Data name="map-service:marker-icon">/)
  assert.match(kml, /<value>viewpoint<\/value>/)
})

test('browser KML export never writes unknown or non-Point marker icon values', () => {
  const kml = generateKmlText('安全图标', [{
    type: 'Point',
    name: '未知',
    description: '',
    markerIcon: '<svg onload=alert(1)>',
    coordinates: [113.2, 23.1],
  }, {
    type: 'LineString',
    name: '线路',
    description: '',
    markerIcon: 'flag',
    coordinates: [[113.2, 23.1], [113.3, 23.2]],
  }])

  assert.doesNotMatch(kml, /map-service:marker-icon|onload|<value>flag<\/value>/)
})
