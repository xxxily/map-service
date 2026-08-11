import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createKmlShareEmbedItem,
  extractGeneratedKmlShareEmbeds,
  extractKmlShareLinkCandidates,
  getTrustedKmlShareEmbed,
  mergeKmlShareEmbeds,
  normalizeKmlShareLinksInText,
  resolveKnownKmlShareLink,
  stripGeneratedKmlShareEmbeds,
} from '../shared/kml-share-links.js'

const VIDEO_ID = '7645601561687440101'
const SEVEN_TWENTY_VR_ID = 'f4ejtOsf5y0'
const SEVEN_TWENTY_EMBED_ID = 'c2ejup4kOn8'

test('extractKmlShareLinkCandidates recognizes a Douyin link inside copied share text', () => {
  const result = extractKmlShareLinkCandidates(
    '8.74 复制打开抖音，看看【万两的作品】生活不用精彩 https://v.douyin.com/Xi6sjYn-rps/ 06/18 :6pm'
  )

  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].provider, 'douyin')
  assert.equal(result.candidates[0].sourceUrl, 'https://v.douyin.com/Xi6sjYn-rps/')
  assert.equal(result.candidates[0].requiresServerResolution, true)
})

test('known Douyin page forms build the same official player item without server resolution', () => {
  const urls = [
    `https://www.douyin.com/video/${VIDEO_ID}`,
    `https://www.iesdouyin.com/share/video/${VIDEO_ID}/?utm_source=copy`,
    `https://open.douyin.com/player/video?vid=${VIDEO_ID}`,
  ]
  const resolved = urls.map(resolveKnownKmlShareLink)

  assert.equal(resolved.every(item => item.recognized && !item.requiresServerResolution), true)
  assert.deepEqual(resolved.map(item => item.item.embedUrl), Array(3).fill(`https://open.douyin.com/player/video?vid=${VIDEO_ID}`))
  assert.deepEqual(resolved.map(item => item.item.canonicalUrl), Array(3).fill(`https://www.douyin.com/video/${VIDEO_ID}`))
})

test('720yun public and official embed URLs are normalized locally without server resolution', () => {
  const publicResult = resolveKnownKmlShareLink(`https://720yun.com/vr/${SEVEN_TWENTY_VR_ID}/?utm_source=share#scene`)
  const embedResult = resolveKnownKmlShareLink(`https://www.720yun.com/t/${SEVEN_TWENTY_EMBED_ID}`)

  assert.equal(publicResult.recognized, true)
  assert.equal(publicResult.requiresServerResolution, false)
  assert.equal(publicResult.provider, '720yun')
  assert.equal(publicResult.sourceUrl, `https://www.720yun.com/vr/${SEVEN_TWENTY_VR_ID}`)
  assert.equal(publicResult.item.resourceId, `vr:${SEVEN_TWENTY_VR_ID}`)
  assert.equal(publicResult.item.embedUrl, publicResult.sourceUrl)
  assert.equal(embedResult.item.resourceId, `t:${SEVEN_TWENTY_EMBED_ID}`)
  assert.equal(embedResult.item.embedUrl, `https://www.720yun.com/t/${SEVEN_TWENTY_EMBED_ID}`)
})

test('trusted embed validation requires exact official origin path and query', () => {
  const trustedEmbed = getTrustedKmlShareEmbed(`https://open.douyin.com/player/video?vid=${VIDEO_ID}`)
  const previewUrl = new URL(trustedEmbed.previewUrl)
  assert.equal(trustedEmbed.provider, 'douyin')
  assert.equal(previewUrl.searchParams.get('width'), '100vw')
  assert.equal(previewUrl.searchParams.get('height'), 'calc(100vh + 48px)')
  assert.match(trustedEmbed.previewUrl, /height=calc\(100vh%20%2B%2048px\)$/)
  assert.equal(getTrustedKmlShareEmbed(`https://open.douyin.com/player/video?vid=${VIDEO_ID}&width=100vw&height=100vh`), null)
  assert.equal(getTrustedKmlShareEmbed(`https://open.douyin.com/player/video?vid=${VIDEO_ID}&token=secret`), null)
  assert.equal(getTrustedKmlShareEmbed(`https://open.douyin.com/other?vid=${VIDEO_ID}`), null)
  assert.equal(getTrustedKmlShareEmbed(`https://evil.example.com/player/video?vid=${VIDEO_ID}`), null)

  const panorama = getTrustedKmlShareEmbed(`https://www.720yun.com/vr/${SEVEN_TWENTY_VR_ID}`)
  assert.equal(panorama.provider, '720yun')
  assert.equal(panorama.resourceId, `vr:${SEVEN_TWENTY_VR_ID}`)
  assert.match(panorama.embedPolicy.allow, /gyroscope/)
  assert.equal(panorama.embedPolicy.allowFullscreen, true)
  assert.equal(getTrustedKmlShareEmbed(`https://www.720yun.com/vr/${SEVEN_TWENTY_VR_ID}?token=secret`), null)
  assert.equal(getTrustedKmlShareEmbed(`https://www.720yun.com/vr/${SEVEN_TWENTY_VR_ID}/extra`), null)
})

test('generated share iframe is hidden for editing and rebuilt idempotently', () => {
  const original = '现场记录 https://v.douyin.com/Xi6sjYn-rps/'
  const item = createKmlShareEmbedItem('douyin', VIDEO_ID, 'https://v.douyin.com/Xi6sjYn-rps/')
  const first = mergeKmlShareEmbeds(original, [item])
  const second = mergeKmlShareEmbeds(first, [item, item])

  assert.equal(extractGeneratedKmlShareEmbeds(second).length, 1)
  assert.equal(stripGeneratedKmlShareEmbeds(second), original)
  assert.equal((second.match(/<iframe/g) || []).length, 1)
  assert.match(second, /data-kml-share-provider="douyin"/)
  assert.match(second, /data-kml-share-source="https:\/\/v\.douyin\.com\/Xi6sjYn-rps\/"/)
})

test('unsupported or malformed links are ignored and limits are reported', () => {
  const result = extractKmlShareLinkCandidates([
    'https://example.com/video/123',
    `https://www.douyin.com/video/${VIDEO_ID}`,
    'https://v.douyin.com/SecondCode/',
  ].join(' '), { limit: 1 })

  assert.equal(result.candidates.length, 1)
  assert.equal(result.supportedCount, 2)
  assert.equal(result.truncated, true)
  assert.equal(resolveKnownKmlShareLink('http://v.douyin.com/unsafe/').recognized, false)
  assert.equal(resolveKnownKmlShareLink('https://www.douyin.com/video/not-a-number').recognized, false)
  assert.equal(resolveKnownKmlShareLink(`http://www.720yun.com/vr/${SEVEN_TWENTY_VR_ID}`).recognized, false)
  assert.equal(resolveKnownKmlShareLink(`https://www.720yun.com:8443/vr/${SEVEN_TWENTY_VR_ID}`).recognized, false)
  assert.equal(resolveKnownKmlShareLink(`https://fake.720yun.com/vr/${SEVEN_TWENTY_VR_ID}`).recognized, false)
  assert.equal(resolveKnownKmlShareLink('https://www.720yun.com/vr/not_ok').recognized, false)
})

test('supported URLs in user text are normalized without changing surrounding copy', () => {
  const text = `视频：https://www.iesdouyin.com/share/video/${VIDEO_ID}/?share_sign=secret&utm_source=copy。全景：https://720yun.com/vr/${SEVEN_TWENTY_VR_ID}?from=copy。`
  const normalized = normalizeKmlShareLinksInText(text)

  assert.equal(normalized, `视频：https://www.douyin.com/video/${VIDEO_ID}。全景：https://www.720yun.com/vr/${SEVEN_TWENTY_VR_ID}。`)
  assert.doesNotMatch(normalized, /secret|utm_source/)
})
