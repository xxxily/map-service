import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import SharedKmlManager from '../service/bin/admin/sharedKml.js'
import {
  buildKmlMediaGallery,
  findKmlMediaGalleryIndex,
  flattenKmlFeatureMediaItems,
  getKmlFeaturePopupMedia,
} from '../src/map/kml-media-gallery.js'
import { renderKmlFeaturePopupContent } from '../src/map/kml-content-panel.js'

class MockStore {
  constructor () {
    this.data = {}
  }

  async read (name, fallback) {
    return this.data[name] === undefined ? fallback : structuredClone(this.data[name])
  }

  async write (name, value) {
    this.data[name] = structuredClone(value)
    return value
  }
}

function createFeature (id, name, description) {
  return {
    id,
    type: 'Point',
    name,
    description,
    coordinates: [113.2, 23.1],
  }
}

test('KML gallery flattens media across points and keeps the selected point index', () => {
  const first = createFeature('feature-a', '入口', '<img src="https://cdn.example.com/a.jpg" alt="入口">')
  const second = createFeature('feature-b', '营地', '<video src="https://cdn.example.com/b.mp4"></video><img src="https://cdn.example.com/b.jpg">')
  const kml = { id: 'kml-1', name: '徒步图层', features: [first, second] }
  const gallery = buildKmlMediaGallery(kml)

  assert.deepEqual(gallery.map(item => item.type), ['image', 'video', 'image'])
  assert.deepEqual(gallery.map(item => item.featureName), ['入口', '营地', '营地'])
  assert.deepEqual(gallery.map(item => item.title), ['入口', '营地', '营地'])
  assert.equal(findKmlMediaGalleryIndex(gallery, { featureId: 'feature-b', id: gallery[2].id }), 2)
  assert.equal(findKmlMediaGalleryIndex(gallery, { featureId: 'feature-b', type: 'video' }), 1)
  assert.equal(findKmlMediaGalleryIndex(gallery, { featureId: 'missing' }), 0)
})

test('unnamed point media keeps titles empty instead of inventing a placeholder', () => {
  const feature = createFeature('feature-unnamed', '', '<img src="https://cdn.example.com/unnamed.jpg">')
  const [item] = flattenKmlFeatureMediaItems(feature)
  assert.equal(item.featureName, '')
  assert.equal(item.title, '')

  const [legacyItem] = flattenKmlFeatureMediaItems(createFeature(
    'feature-legacy-unnamed',
    '未命名要素 9',
    '<video src="https://cdn.example.com/unnamed.mp4"></video>',
  ))
  assert.equal(legacyItem.featureName, '')
  assert.equal(legacyItem.title, '')
})

test('KML popup renders a first-click media preview and keeps details as a separate action', () => {
  const feature = createFeature('feature-a', '入口', '<img src="https://cdn.example.com/a.jpg" alt="入口照片"><video src="https://cdn.example.com/a.mp4"></video>')
  const html = renderKmlFeaturePopupContent({ id: 'kml-1', name: '徒步图层' }, feature, false)
  const unnamedImageHtml = renderKmlFeaturePopupContent({ id: 'kml-1', name: '徒步图层' }, createFeature('unnamed', '', '<img src="https://cdn.example.com/unnamed.jpg">'), false)
  const unnamedVideoHtml = renderKmlFeaturePopupContent({ id: 'kml-1', name: '徒步图层' }, createFeature('unnamed-video', '', '<embed type="video/mp4" src="https://cdn.example.com/unnamed.mp4">'), false)

  assert.match(html, /kml-popup-media/)
  assert.match(html, /data-kml-popup-media/)
  assert.match(html, /class="kml-popup-title">入口<\/div>/)
  assert.match(html, /查看详情/)
  assert.doesNotMatch(html, /可浏览整个 KML/)
  assert.doesNotMatch(unnamedImageHtml, /kml-popup-title/)
  assert.doesNotMatch(unnamedImageHtml, /未命名点位/)
  assert.doesNotMatch(unnamedVideoHtml, /未命名点位/)
  assert.match(unnamedVideoHtml, /<small>点击查看<\/small>/)
  assert.doesNotMatch(renderKmlFeaturePopupContent({ id: 'kml-1', name: '徒步图层' }, createFeature('legacy-unnamed', '未命名要素 8', '<img src="https://cdn.example.com/legacy.jpg">'), false), /kml-popup-title/)
  assert.doesNotMatch(renderKmlFeaturePopupContent({ id: 'kml-1', name: '徒步图层' }, createFeature('desc-only', '', '<img src="https://cdn.example.com/desc.jpg">'), false), /此点位包含可预览媒体/)
  assert.doesNotMatch(html, /可浏览整个 KML/)
  assert.doesNotMatch(html, /<video[^>]*>/)
  assert.doesNotMatch(html, /<iframe[^>]*>/)

  const preview = getKmlFeaturePopupMedia(feature)
  assert.equal(preview.total, 2)
  assert.equal(preview.items[0].type, 'image')
})

test('popup media reserves the last cell for an accurate remaining count', () => {
  const feature = createFeature('feature-many', '多媒体点位', [1, 2, 3, 4, 5]
    .map(index => `<img src="https://cdn.example.com/${index}.jpg">`)
    .join(''))
  const preview = getKmlFeaturePopupMedia(feature, { limit: 4 })
  assert.equal(preview.items.length, 3)
  assert.equal(preview.remaining, 2)
  assert.equal(preview.overflowItem.url, 'https://cdn.example.com/4.jpg')
  const html = renderKmlFeaturePopupContent({ id: 'kml-many', name: '多媒体图层' }, feature, false)
  assert.match(html, /class="kml-popup-media-more"[^>]*data-kml-popup-media/)
})

test('archived KML fixtures cover small and large media galleries', async () => {
  const manager = new SharedKmlManager({ store: new MockStore() })
  const fixtures = [
    ['tests/fixtures/kml/kmltest1.kml', { image: 11 }, false],
    ['tests/fixtures/kml/kmltest2.kml', { image: 143, video: 7 }, true],
  ]

  for (const [file, expectedCounts, large] of fixtures) {
    const imported = await manager.import(readFileSync(file), file)
    const gallery = buildKmlMediaGallery(imported)
    const counts = gallery.reduce((result, item) => {
      result[item.type] = (result[item.type] || 0) + 1
      return result
    }, {})
    assert.deepEqual(counts, expectedCounts, file)
    const expectedMediaCount = Object.values(expectedCounts).reduce((total, count) => total + count, 0)
    assert.equal(gallery.length, expectedMediaCount, file)
    assert.equal(gallery.at(0).kmlName, imported.name)
    assert.equal(gallery.at(-1).galleryIndex, expectedMediaCount - 1)
    if (large) assert.ok(imported.features.length > 100)
  }
})

test('flattened feature media preserves content view overrides for public feature responses', () => {
  const feature = createFeature('feature-public', '公共点位', '')
  const view = {
    groups: [
      { type: 'image', items: [{ id: 'library-image', url: 'https://cdn.example.com/library.webp', title: '绑定图片' }] },
      { type: 'video', items: [] },
      { type: 'audio', items: [] },
      { type: 'iframe', items: [] },
    ],
  }
  const items = flattenKmlFeatureMediaItems(feature, view)
  assert.equal(items.length, 1)
  assert.equal(items[0].id, 'library-image')
  assert.equal(items[0].featureName, '公共点位')
})

test('2D popup binds media actions through the central popupopen lifecycle', () => {
  const source = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const panelSource = readFileSync(new URL('../src/map/kml-content-panel.js', import.meta.url), 'utf8')
  assert.match(source, /map\.on\('popupopen',[\s\S]*bindKmlFeaturePopupMediaActions\(container, kmlFile, feature\)/)
  assert.doesNotMatch(source, /layer\.on\('popupopen',[\s\S]*bindKmlFeaturePopupMediaActions/)
  assert.match(source, /window\.activateKmlFeatureForMedia/)
  assert.match(panelSource, /popupMediaBindings\s*=\s*new WeakMap\(\)/)
  assert.match(panelSource, /const eventRoot = container\.querySelector\('\.leaflet-popup-content'\) \|\| container/)
  assert.match(panelSource, /eventRoot\.addEventListener\('click',[\s\S]*event\.target\.closest\?\.\('\[data-kml-popup-media\]'\)/)
  assert.doesNotMatch(panelSource, /trigger\.dataset\.kmlPopupMediaBound/)
  assert.match(panelSource, /if \(!nextFeatureKey \|\| nextFeatureKey === activeFeatureKey\) return/)
})
