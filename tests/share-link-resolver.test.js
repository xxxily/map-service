import assert from 'node:assert/strict'
import { test } from 'node:test'
import { KmlShareLinkResolverService } from '../service/bin/user/shareLinkResolver.js'

const VIDEO_ID = '7645601561687440101'

function publicResolution (url) {
  return {
    url,
    hostname: new URL(url).hostname,
    addresses: [{ address: '8.8.8.8', family: 4 }],
  }
}

test('resolver returns direct Douyin video items without upstream requests', async () => {
  let requests = 0
  const service = new KmlShareLinkResolverService({
    httpClient: async () => {
      requests += 1
      throw new Error('unexpected request')
    },
  })

  const result = await service.resolve({ user: { id: 'user-1' } }, {
    text: `看看这个 https://www.douyin.com/video/${VIDEO_ID}`,
  })

  assert.equal(requests, 0)
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].embedUrl, `https://open.douyin.com/player/video?vid=${VIDEO_ID}`)
  assert.deepEqual(result.warnings, [])
})

test('resolver returns direct 720yun panorama items without upstream requests or rate usage', async () => {
  let requests = 0
  const service = new KmlShareLinkResolverService({
    rateMaxAttempts: 1,
    httpClient: async () => {
      requests += 1
      throw new Error('unexpected request')
    },
  })

  const input = { text: '全景 https://720yun.com/vr/f4ejtOsf5y0?scene_id=12#view' }
  const first = await service.resolve({ user: { id: 'user-720' } }, input)
  const second = await service.resolve({ user: { id: 'user-720' } }, input)

  assert.equal(requests, 0)
  assert.deepEqual(first, second)
  assert.equal(first.items[0].provider, '720yun')
  assert.equal(first.items[0].resourceId, 'vr:f4ejtOsf5y0')
  assert.equal(first.items[0].sourceUrl, 'https://www.720yun.com/vr/f4ejtOsf5y0?scene_id=12#view')
  assert.equal(first.items[0].embedUrl, first.items[0].sourceUrl)
  assert.deepEqual(first.warnings, [])
})

test('resolver expands a fixed Douyin short host and strips redirect tracking data', async () => {
  const calls = []
  const service = new KmlShareLinkResolverService({
    targetResolver: async url => publicResolution(url),
    httpClient: async config => {
      calls.push(config)
      return {
        status: 302,
        headers: {
          location: `https://www.iesdouyin.com/share/video/${VIDEO_ID}/?share_sign=secret&utm_source=copy`,
        },
      }
    },
  })

  const result = await service.resolve({ user: { id: 'user-1' } }, {
    text: 'https://v.douyin.com/Xi6sjYn-rps/',
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'HEAD')
  assert.equal(calls[0].maxRedirects, 0)
  assert.equal(calls[0].headers.Authorization, undefined)
  assert.equal(result.items[0].sourceUrl, 'https://v.douyin.com/Xi6sjYn-rps/')
  assert.equal(result.items[0].canonicalUrl, `https://www.douyin.com/video/${VIDEO_ID}`)
  assert.doesNotMatch(JSON.stringify(result), /secret|utm_source/)
})

test('resolver rejects redirects outside provider allowlist as a non-blocking warning', async () => {
  const service = new KmlShareLinkResolverService({
    targetResolver: async url => publicResolution(url),
    httpClient: async () => ({
      status: 302,
      headers: { location: 'https://127.0.0.1/private' },
    }),
  })

  const result = await service.resolve({ user: { id: 'user-1' } }, {
    text: 'https://v.douyin.com/Xi6sjYn-rps/',
  })

  assert.deepEqual(result.items, [])
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0], /不允许的地址/)
})

test('resolver enforces input, link count and per-user rate limits', async () => {
  const service = new KmlShareLinkResolverService({
    maxLinks: 1,
    rateMaxAttempts: 1,
    targetResolver: async url => publicResolution(url),
    httpClient: async () => ({ status: 500, headers: {} }),
  })

  await assert.rejects(() => service.resolve({}, { text: '' }), error => error.code === 'VALIDATION_FAILED')
  await assert.rejects(() => service.resolve({}, {
    text: `https://www.douyin.com/video/${VIDEO_ID} https://v.douyin.com/SecondCode/`,
  }), error => error.code === 'SHARE_LINK_LIMIT_EXCEEDED' && error.statusCode === 413)

  await service.resolve({ user: { id: 'limited-user' } }, { text: 'https://v.douyin.com/FirstCode/' })
  await assert.rejects(
    () => service.resolve({ user: { id: 'limited-user' } }, { text: 'https://v.douyin.com/SecondCode/' }),
    error => error.code === 'SHARE_LINK_RATE_LIMITED' && error.statusCode === 429
  )
})
