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
  assert.deepEqual(descriptor.tooltipAnchor, [16, -26])
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

test('Douyin and 720yun features receive distinct provider-specific marker icons', () => {
  const douyin = getKmlMediaMarkerDescriptor({
    description: '<iframe src="https://open.douyin.com/player/video?vid=7645601561687440101"></iframe>',
  })
  const panorama = getKmlMediaMarkerDescriptor({
    description: 'https://www.720yun.com/vr/f4ejtOsf5y0',
  })

  assert.equal(douyin.type, 'douyin')
  assert.equal(douyin.label, '抖音视频')
  assert.match(douyin.html, /kml-media-marker-douyin/)
  assert.match(douyin.html, /kml-provider-logo-douyin/)
  assert.match(douyin.html, /M12\.525\.02/)
  assert.match(douyin.html, /#25f4ee/)
  assert.match(douyin.html, /#fe2c55/)
  assert.equal(panorama.type, '720yun')
  assert.equal(panorama.label, '720 云全景')
  assert.match(panorama.html, /kml-media-marker-720yun/)
  assert.match(panorama.html, /kml-provider-logo-720yun/)
  assert.match(panorama.html, /fill="#ffffff"/)
  assert.match(panorama.html, /stroke="#51575d"/)
  assert.notEqual(douyin.html, panorama.html)

  const douyinListIcon = getKmlMediaListIcon({
    description: '<iframe src="https://open.douyin.com/player/video?vid=7645601561687440101"></iframe>',
  })
  const panoramaBillboard = decodeURIComponent(getKmlMediaBillboard({
    description: 'https://www.720yun.com/vr/f4ejtOsf5y0',
  }).image)
  assert.match(douyinListIcon, /kml-provider-logo-douyin/)
  assert.match(panoramaBillboard, /kml-provider-logo-720yun/)
})

test('an explicit user marker icon overrides provider and generic media icons', () => {
  const feature = {
    markerIcon: 'campsite',
    description: 'https://www.720yun.com/vr/f4ejtOsf5y0',
  }
  const descriptor = getKmlMediaMarkerDescriptor(feature)

  assert.equal(descriptor.type, 'custom')
  assert.equal(descriptor.iconKey, 'campsite')
  assert.equal(descriptor.label, '营地')
  assert.match(descriptor.html, /kml-media-marker-custom/)
  assert.match(getKmlMediaListIcon(feature), /kml-media-list-icon-custom/)
})
