import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getKmlMediaBillboard,
  getKmlMediaListIcon,
  getKmlMediaMarkerDescriptor,
} from '../src/map/kml-media-marker.js'

test('KML image feature receives an identifiable 2D marker icon', () => {
  const descriptor = getKmlMediaMarkerDescriptor({
    description: '<img src="https://cdn.example.com/media?id=1">',
  })

  assert.equal(descriptor.type, 'image')
  assert.equal(descriptor.label, '包含图片')
  assert.deepEqual(descriptor.iconSize, [32, 40])
  assert.match(descriptor.html, /kml-media-marker-image/)
  assert.match(descriptor.html, /aria-label="包含图片"/)
  assert.match(getKmlMediaListIcon({ description: '<img src="https://cdn.example.com/media?id=1">' }), /kml-media-list-icon-image/)
})

test('KML audio feature receives a Cesium SVG billboard', () => {
  const billboard = getKmlMediaBillboard({
    description: '<audio src="https://cdn.example.com/media?id=2"></audio>',
  })

  const decodedImage = decodeURIComponent(billboard.image)
  assert.equal(billboard.type, 'audio')
  assert.match(billboard.image, /^data:image\/svg\+xml/)
  assert.match(decodedImage, /<svg/)
  assert.match(decodedImage, /#7c3aed/)
})

test('plain KML points keep their existing marker rendering', () => {
  assert.equal(getKmlMediaMarkerDescriptor({ description: '普通文字说明' }), null)
})
