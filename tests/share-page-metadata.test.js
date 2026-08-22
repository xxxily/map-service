import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildSharePageMetaTags,
  getSharePageCanonicalUrl,
  normalizeSharePageMetadata,
  renderSharePageHtml,
  shareDescriptionText,
} from '../shared/share-page-metadata.js'

test('分享页元信息使用分享标题并清洗说明文本', () => {
  const metadata = normalizeSharePageMetadata({
    title: '周末 <徒步> 路线',
    description: '<p>沿江 &amp; 山脊</p><script>alert(1)</script>',
    canonicalUrl: 'https://map.example.test/share/abc?password=secret#map',
  })
  assert.equal(metadata.title, '周末 <徒步> 路线')
  assert.equal(metadata.description, '沿江 & 山脊')
  assert.equal(metadata.canonicalUrl, 'https://map.example.test/share/abc')
  assert.equal(metadata.imageUrl, 'https://map.example.test/pwa-icon-512.png')
  assert.equal(shareDescriptionText(''), '查看此 KML 地图分享内容。')
})

test('服务端分享 HTML 首屏输出完整社交元信息且不泄露查询密码', () => {
  const html = renderSharePageHtml(`<!doctype html><html><head><title>混合地图</title><meta name="theme-color" content="#000"></head><body></body></html>`, {
    title: '岭南路线合集',
    description: '三条可查看路线',
    canonicalUrl: 'https://map.example.test/share/abc',
  })
  assert.match(html, /<title>岭南路线合集<\/title>/)
  assert.match(html, /name="description" content="三条可查看路线"/)
  assert.match(html, /property="og:title" content="岭南路线合集"/)
  assert.match(html, /property="og:description" content="三条可查看路线"/)
  assert.match(html, /property="og:image" content="https:\/\/map\.example\.test\/pwa-icon-512\.png"/)
  assert.match(html, /name="twitter:card" content="summary_large_image"/)
  assert.match(html, /id="share-page-structured-data"/)
  assert.doesNotMatch(html, /password=secret/)
  assert.doesNotMatch(html, /name="theme-color" content="#000"/)
})

test('分享页 canonical URL 始终移除视图与密码参数', () => {
  assert.equal(
    getSharePageCanonicalUrl('a/b?x=1', { origin: 'https://map.example.test' }),
    'https://map.example.test/share/a%2Fb%3Fx%3D1',
  )
  const tags = buildSharePageMetaTags({
    title: '地图',
    canonicalUrl: 'https://map.example.test/share/abc',
  })
  assert.match(tags, /property="og:type" content="website"/)
  assert.match(tags, /application\/ld\+json/)
})
