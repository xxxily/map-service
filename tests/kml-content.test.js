import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildFeatureContentView,
  classifyContentUrl,
  extractContentUrls,
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
