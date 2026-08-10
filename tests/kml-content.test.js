import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildFeatureContentView,
  classifyContentUrl,
  extractContentReferences,
  extractContentUrls,
  getKmlMediaRenderUrl,
  getFeatureDescriptionText,
  getPrimaryFeatureContentType,
  normalizeKmlMediaRelayTarget,
} from '../service/bin/admin/kmlContent.js'

test('extractContentUrls extracts https links, deduplicates and tracks truncation', () => {
  const text = [
    '图片：https://cdn.example.com/a.webp。',
    '[重复](https://cdn.example.com/a.webp)',
    '视频 https://cdn.example.com/b.mp4, 页面 https://viewer.example.com/page?id=1',
    '忽略非 URL 文本',
  ].join('\n')

  const result = extractContentUrls(text, { limit: 2 })

  assert.equal(result.urls.length, 2)
  assert.equal(result.truncated, true)
  assert.equal(result.urls[0].toString(), 'https://cdn.example.com/a.webp')
  assert.equal(result.urls[1].toString(), 'https://cdn.example.com/b.mp4')
})

test('classifyContentUrl rejects unsafe protocols and private hosts', () => {
  assert.equal(classifyContentUrl('http://example.com/a.jpg').accepted, false)
  assert.equal(classifyContentUrl('https://localhost/a.jpg').accepted, false)
  assert.equal(classifyContentUrl('https://127.0.0.1/a.jpg').accepted, false)
  assert.equal(classifyContentUrl('https://10.0.0.5/a.jpg').accepted, false)
  assert.equal(classifyContentUrl('https://169.254.169.254/latest/meta-data').accepted, false)
})

test('classifyContentUrl detects media types and iframe allowlist', () => {
  assert.equal(classifyContentUrl('https://cdn.example.com/a.JPG').item.type, 'image')
  assert.equal(classifyContentUrl('https://cdn.example.com/a.m3u8').item.type, 'video')
  assert.equal(classifyContentUrl('https://docs.example.com/report/1', {
    iframeAllowlist: ['docs.example.com'],
  }).item.type, 'iframe')
  assert.equal(classifyContentUrl('https://docs.example.com/report/1').item.type, 'link')
})

test('buildFeatureContentView masks sensitive query params in public output', () => {
  const view = buildFeatureContentView({
    id: 'feat-1',
    description: 'https://cdn.example.com/a.jpg?token=secret&x=1 https://cdn.example.com/b.mp4?api_key=abc',
  })

  const serialized = JSON.stringify(view)
  assert.doesNotMatch(serialized, /secret/)
  assert.doesNotMatch(serialized, /api_key=abc/)
  assert.match(serialized, /token=\*\*\*\*/)
  assert.match(serialized, /api_key=\*\*\*\*/)
  assert.equal(view.contentSummary.imageCount, 1)
  assert.equal(view.contentSummary.videoCount, 1)
})

test('buildFeatureContentView returns grouped content summary', () => {
  const view = buildFeatureContentView({
    id: 'feat-2',
    description: [
      'https://cdn.example.com/a.png',
      'https://cdn.example.com/b.webm',
      'https://portal.example.com/device/1',
      'https://example.com/readme',
    ].join('\n'),
  }, {
    iframeAllowlist: ['portal.example.com'],
  })

  assert.equal(view.featureId, 'feat-2')
  assert.equal(view.contentSummary.imageCount, 1)
  assert.equal(view.contentSummary.videoCount, 1)
  assert.equal(view.contentSummary.iframeCount, 1)
  assert.equal(view.contentSummary.linkCount, 1)
  assert.equal(view.contentSummary.hasRichContent, true)
  assert.equal(view.sourceSummary.descriptionLinks, 4)
  assert.equal(view.groups.find(group => group.type === 'iframe').items[0].embedPolicy.referrerPolicy, 'no-referrer')
})

test('HTML media tags classify extensionless sources and support audio', () => {
  const description = [
    '<div>现场记录</div>',
    '<picture><source srcset="https://cdn.example.com/photo?id=1" type="image/webp"><img src="https://cdn.example.com/photo?id=1" alt="入口照片"></picture>',
    '<video><source src="https://cdn.example.com/movie?id=2" type="video/mp4"></video>',
    '<audio src="https://cdn.example.com/sound?id=3" title="现场录音"></audio>',
    '<iframe src="https://portal.example.com/device?id=4" title="设备页面"></iframe>',
  ].join('')

  const references = extractContentReferences(description)
  const view = buildFeatureContentView({ id: 'feat-html', description }, {
    iframeAllowlist: ['portal.example.com'],
  })

  assert.equal(references.references.length, 4)
  assert.deepEqual(references.references.map(item => item.typeHint), ['image', 'video', 'audio', 'iframe'])
  assert.equal(view.contentSummary.imageCount, 1)
  assert.equal(view.contentSummary.videoCount, 1)
  assert.equal(view.contentSummary.audioCount, 1)
  assert.equal(view.contentSummary.iframeCount, 1)
  assert.equal(view.groups.find(group => group.type === 'image').items[0].title, '入口照片')
  assert.equal(view.groups.find(group => group.type === 'audio').items[0].title, '现场录音')
  assert.equal(getFeatureDescriptionText(description), '现场记录')
})

test('linked image keeps the large image as the sole media and uses its child image as thumbnail', () => {
  const original = 'https://down-files.2bulu.com/f/d1?downParams=original-media'
  const thumbnail = 'https://down-files.2bulu.com/f/dn1?downParams=preview-media'
  const description = `<a href="${original}" data-kml-media="image"><img src="${thumbnail}" alt="营地照片"></a>`

  const references = extractContentReferences(description)
  const view = buildFeatureContentView({ id: 'feat-linked-image', description })
  const item = view.groups.find(group => group.type === 'image').items[0]

  assert.equal(references.references.length, 1)
  assert.equal(references.references[0].url.toString(), original)
  assert.equal(references.references[0].thumbnailUrl.toString(), thumbnail)
  assert.equal(view.contentSummary.imageCount, 1)
  assert.equal(view.contentSummary.linkCount, 0)
  assert.equal(item.url, original)
  assert.equal(item.renderUrl, original)
  assert.equal(item.thumbnailUrl, getKmlMediaRenderUrl(thumbnail))
})

test('ordinary linked images are merged but unrelated link cards remain independent', () => {
  const view = buildFeatureContentView({
    description: [
      '<a href="https://cdn.example.com/photo-large.jpg"><img src="https://cdn.example.com/photo-thumb.jpg"></a>',
      '<a href="https://docs.example.com/readme">查看说明</a>',
    ].join(''),
  })

  assert.equal(view.contentSummary.imageCount, 1)
  assert.equal(view.contentSummary.linkCount, 1)
  const image = view.groups.find(group => group.type === 'image').items[0]
  assert.equal(image.url, 'https://cdn.example.com/photo-large.jpg')
  assert.equal(image.thumbnailUrl, 'https://cdn.example.com/photo-thumb.jpg')
})

test('linked image thumbnails keep URL security and masking boundaries', () => {
  const view = buildFeatureContentView({
    description: [
      '<a href="https://cdn.example.com/photo-large.jpg"><img src="https://127.0.0.1/private.jpg"></a>',
      '<a href="https://cdn.example.com/photo-two.jpg"><img src="https://cdn.example.com/photo-two-thumb.jpg?token=secret"></a>',
    ].join(''),
  })
  const images = view.groups.find(group => group.type === 'image').items

  assert.equal(images.length, 2)
  assert.equal(images[0].url, 'https://cdn.example.com/photo-large.jpg')
  assert.equal(images[0].thumbnailUrl, images[0].renderUrl)
  assert.match(images[1].thumbnailUrl, /token=\*\*\*\*/)
  assert.doesNotMatch(JSON.stringify(view), /secret|127\.0\.0\.1/)
})

test('embed video uses the KML video style hint instead of a page iframe', () => {
  const view = buildFeatureContentView({
    styleUrl: '#MarkerStyleVideo',
    description: '<embed src="https://cdn.example.com/movie?id=embed" type="video/mp4">',
  })
  assert.equal(view.contentSummary.videoCount, 1)
  assert.equal(view.contentSummary.iframeCount, 0)
  assert.equal(view.groups.find(group => group.type === 'video').items[0].autoplay, true)
})

test('embed video without a MIME type inherits a video style hint', () => {
  const view = buildFeatureContentView({
    styleUrl: '#MarkerStyleVideo',
    description: '<embed src="https://cdn.example.com/movie?id=embed">',
  })
  assert.equal(view.groups.find(group => group.type === 'video').items.length, 1)
})

test('embed and object video URLs use their media extension when no MIME is present', () => {
  const view = buildFeatureContentView({
    description: '<embed src="https://cdn.example.com/movie.mp4"><object data="https://cdn.example.com/clip.webm"></object>',
  })
  assert.equal(view.contentSummary.videoCount, 2)
  assert.equal(view.contentSummary.iframeCount, 0)
  assert.equal(view.groups.find(group => group.type === 'video').items.every(item => item.autoplay), true)
})

test('ordinary and embedded video tags all opt into autoplay', () => {
  const view = buildFeatureContentView({
    description: '<video src="https://cdn.example.com/manual.mp4"></video><embed src="https://cdn.example.com/embed.mp4" type="video/mp4">',
  })
  const videos = view.groups.find(group => group.type === 'video').items
  assert.equal(videos.length, 2)
  assert.equal(videos[0].autoplay, true)
  assert.equal(videos[1].autoplay, true)
})

test('HTML media tags retain URL security boundaries', () => {
  const description = [
    '<img src="http://cdn.example.com/insecure">',
    '<video src="https://127.0.0.1/private"></video>',
    '<iframe src="https://portal.example.com/device/1"></iframe>',
  ].join('')
  const view = buildFeatureContentView({ description })

  assert.equal(view.contentSummary.imageCount, 0)
  assert.equal(view.contentSummary.videoCount, 0)
  assert.equal(view.contentSummary.iframeCount, 0)
  assert.equal(view.contentSummary.linkCount, 1)
  assert.equal(view.sourceSummary.rejected, 2)
})

test('KML style hints drive the primary marker media type', () => {
  const feature = {
    styleUrl: '#MarkerStylePicture',
    description: '<div><img src="https://down-files.example.com/f/dn1?id=1"></div>',
  }

  assert.equal(getPrimaryFeatureContentType(feature), 'image')
  assert.equal(getFeatureDescriptionText(feature), '')
  assert.equal(getFeatureDescriptionText('无效实体 &#99999999;'), '无效实体 &#99999999;')
})

test('legacy 2bulu images use the fixed KML media compatibility endpoint', () => {
  const target = 'https://down-files.2bulu.com/f/dn1?downParams=opaque-value'
  const view = buildFeatureContentView({
    description: `<img src="${target}" alt="现场照片">`,
  })
  const item = view.groups.find(group => group.type === 'image').items[0]

  assert.equal(normalizeKmlMediaRelayTarget(target), target)
  assert.equal(item.url, target)
  assert.equal(item.renderUrl, getKmlMediaRenderUrl(target))
  assert.equal(item.thumbnailUrl, item.renderUrl)
  assert.match(item.renderUrl, /^\/api\/v1\/kml\/media\?url=/)
  assert.equal(normalizeKmlMediaRelayTarget('https://down-files.2bulu.com/private?id=1'), '')
  assert.equal(normalizeKmlMediaRelayTarget('https://evil.example/f/dn1?id=1'), '')
  assert.equal(normalizeKmlMediaRelayTarget('http://down-files.2bulu.com/f/dn1?id=1'), '')
  assert.equal(normalizeKmlMediaRelayTarget('https://down-files.2bulu.com/f/dn1?other=1'), '')
  assert.equal(normalizeKmlMediaRelayTarget('https://down-files.2bulu.com/f/dn1?downParams='), '')
})
