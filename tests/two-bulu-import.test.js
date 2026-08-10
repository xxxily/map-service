import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  convertTwoBuluPublicData,
  normalizeTwoBuluPartialPolicy,
  normalizeTwoBuluRequestId,
  normalizeTwoBuluShareUrl,
  TwoBuluImportService,
} from '../service/bin/user/twoBuluImport.js'

const PUBLIC_RESOLUTION = {
  url: 'https://www.2bulu.com/',
  hostname: 'www.2bulu.com',
  addresses: [{ address: '93.184.216.34', family: 4 }],
}

function response (status, body, headers = {}) {
  return {
    status,
    data: Buffer.from(String(body), 'utf8'),
    headers,
  }
}

function queuedImporter (responses, options = {}) {
  const requests = []
  const queue = [...responses]
  const importer = new TwoBuluImportService({
    minIntervalMs: 0,
    rateMaxAttempts: 100,
    targetResolver: async url => ({ ...PUBLIC_RESOLUTION, url }),
    httpClient: async config => {
      requests.push(config)
      const next = queue.shift()
      if (next instanceof Error) throw next
      if (!next) throw new Error(`缺少 ${config.url} 的测试响应`)
      return next
    },
    ...options,
  })
  return { importer, requests, queue }
}

test('两步路分享 URL 支持短链、详情页和多重编码轨迹标识', () => {
  const shortLink = normalizeTwoBuluShareUrl(
    'https://www.2bulu.com/track/t-OavTTmw9VMzp%252FR2KBg5Tzw%253D%253D.htm#share'
  )
  assert.equal(shortLink.trackId, 'OavTTmw9VMzp/R2KBg5Tzw==')
  assert.equal(
    shortLink.canonicalUrl,
    'https://www.2bulu.com/track/track_detail.htm?trackId=OavTTmw9VMzp%2FR2KBg5Tzw%3D%3D'
  )

  assert.equal(
    normalizeTwoBuluShareUrl('https://app.2bulu.com/track/track_detail.htm?trackId=fZ%2BywxLLhQo%3D').trackId,
    'fZ+ywxLLhQo='
  )
  assert.equal(
    normalizeTwoBuluShareUrl('https://2bulu.com/share/share_track.htm;jsessionid=abc?trackId=track-123').trackId,
    'track-123'
  )
})

test('两步路 URL 校验拒绝任意主机、HTTP、端口、账号密码和错误路径', () => {
  const invalidValues = [
    'http://www.2bulu.com/track/t-abc.htm',
    'https://evil.example/track/t-abc.htm',
    'https://127.0.0.1/track/t-abc.htm',
    'https://user:pass@www.2bulu.com/track/t-abc.htm',
    'https://www.2bulu.com:8443/track/t-abc.htm',
    'https://www.2bulu.com/community/detail?id=abc',
    'https://www.2bulu.com/track/t-%E0%A4%A.htm',
  ]
  invalidValues.forEach(value => {
    assert.throws(() => normalizeTwoBuluShareUrl(value), error => error.code === 'TWO_BULU_URL_INVALID')
  })
  assert.throws(() => normalizeTwoBuluPartialPolicy('unsafe'), error => error.code === 'VALIDATION_FAILED')
  assert.equal(normalizeTwoBuluRequestId('2bulu:request-1'), '2bulu:request-1')
  assert.throws(() => normalizeTwoBuluRequestId('含中文'), error => error.code === 'VALIDATION_FAILED')
})

test('公开轨迹 JSON 转换多段线、标注点和安全媒体描述', () => {
  const converted = convertTwoBuluPublicData({
    trackName: '测试线路.kml',
    trackPositions: [
      [{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }],
      [{ longitude: 114.1, latitude: 24.1 }, { longitude: 114.2, latitude: 24.2 }],
    ],
  }, {
    sourceUrl: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
    markersPayload: [{
      longitude: 113.15,
      latitude: 23.15,
      text: '<script>危险</script>营地',
      fileType: 0,
      centerUrl: 'https://down-files.2bulu.com/f/d1?downParams=public',
    }],
  })

  assert.equal(converted.name, '测试线路')
  assert.equal(converted.completeness, 'full')
  assert.equal(converted.features.length, 3)
  assert.equal(converted.features[0].type, 'LineString')
  assert.equal(converted.features[2].type, 'Point')
  assert.match(converted.features[2].description, /<img/)
  assert.doesNotMatch(converted.features[2].description, /<script>/)
})

test('图片标注优先保留大图且不会把预览图重复导入为第二个媒体', () => {
  const converted = convertTwoBuluPublicData({
    trackPositions: [[{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }]],
  }, {
    sourceUrl: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
    markersPayload: [{
      longitude: 113.15,
      latitude: 23.15,
      fileType: 0,
      centerUrl: 'https://down-files.2bulu.com/f/d1?downParams=preview-media',
      commnFileUrl: 'https://down-files.2bulu.com/f/d1?downParams=original-media',
    }],
  })
  const description = converted.features.at(-1).description

  assert.match(description, /downParams=original-media/)
  assert.match(description, /downParams=preview-media/)
  assert.equal((description.match(/<img\b/g) || []).length, 1)
  assert.match(description, /<a href="https:\/\/down-files\.2bulu\.com\/f\/d1\?downParams=original-media"[^>]*><img src="https:\/\/down-files\.2bulu\.com\/f\/d1\?downParams=preview-media"/)
})

test('服务端兼容转换读取 pointMsg.params 中的图片主资源', () => {
  const converted = convertTwoBuluPublicData({
    trackPositions: [[{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }]],
  }, {
    sourceUrl: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
    markersPayload: [{
      longitude: 113.15,
      latitude: 23.15,
      params: {
        fileType: 0,
        fileUrl: 'https://down-files.2bulu.com/f/d1?downParams=preview-media',
        commnFileUrl: 'https://down-files.2bulu.com/f/d1?downParams=original-media',
      },
    }],
  })
  const description = converted.features.at(-1).description
  assert.match(description, /downParams=original-media/)
  assert.match(description, /downParams=preview-media/)
  assert.equal((description.match(/<img\b/g) || []).length, 1)
})

test('公开标注媒体只保留固定两步路端点且不传播敏感查询参数', () => {
  const converted = convertTwoBuluPublicData({
    trackPositions: [[{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }]],
  }, {
    sourceUrl: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
    markersPayload: [
      {
        longitude: 113.15,
        latitude: 23.15,
        centerUrl: 'https://down-files.2bulu.com/f/dn1?downParams=public-media#preview',
        commnFileUrl: 'https://127.0.0.1/f/dn1?downParams=private',
        firstPicUrl: 'https://down-files.2bulu.com:8443/f/dn1?downParams=wrong-port',
        mp3FileUrl: 'https://down-files.2bulu.com/f/dn1?downParams=public&token=secret&signature=sig&captcha=code',
      },
    ],
  })
  const description = converted.features.at(-1).description

  assert.match(description, /downParams=public-media/)
  assert.doesNotMatch(description, /127\.0\.0\.1|8443|secret|signature|captcha|#preview/)
})

test('公开轨迹 JSON 的轨迹点和标注点共享前置数量上限', () => {
  assert.throws(
    () => convertTwoBuluPublicData({
      trackPositions: [[{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }]],
    }, {
      maxPoints: 2,
      markersPayload: [{ longitude: 113.15, latitude: 23.15 }],
    }),
    error => error.statusCode === 413 && error.code === 'FILE_TOO_LARGE'
  )
})

test('两步路适配器将配置的坐标上限应用到公开标注点', async () => {
  const page = '<html><head><title>公开路线</title></head><body></body></html>'
  const positions = JSON.stringify({
    trackPositions: [[{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }]],
  })
  const markers = JSON.stringify({
    markers: [{ longitude: 113.15, latitude: 23.15 }],
  })
  const { importer } = queuedImporter([
    response(200, page),
    response(200, '{"code":"0"}', { 'content-type': 'application/json' }),
    response(200, positions, { 'content-type': 'application/json' }),
    response(200, markers, { 'content-type': 'application/json' }),
  ], { maxPoints: 2 })

  await assert.rejects(
    importer.resolvePublicTrack({
      url: 'https://www.2bulu.com/track/t-abc.htm',
      partialPolicy: 'allow-track-only',
    }, { userId: 'usr_marker_limit' }),
    error => error.statusCode === 413 && error.code === 'FILE_TOO_LARGE'
  )
})

test('分享页直接返回标准 KML 时完整导入解析成功', async () => {
  const kml = '<?xml version="1.0"?><kml><Document><Placemark><Point><coordinates>113,23,0</coordinates></Point></Placemark></Document></kml>'
  const { importer, requests } = queuedImporter([
    response(200, kml, { 'content-type': 'application/vnd.google-earth.kml+xml' }),
  ])

  const result = await importer.resolvePublicTrack({
    url: 'https://www.2bulu.com/track/t-abc.htm',
  }, { userId: 'usr_one' })

  assert.equal(result.completeness, 'full')
  assert.equal(result.kmlText, kml)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].maxRedirects, 0)
  assert.equal(requests[0].proxy, false)
})

test('只有公开轨迹线时默认拒绝，用户显式允许后返回警告', async () => {
  const page = '<html><head><title>公开路线-GPS导航轨迹下载-两步路</title></head><body></body></html>'
  const positions = JSON.stringify({
    trackPositions: [[{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }]],
  })

  const strict = queuedImporter([
    response(200, page),
    response(200, '{"code":"1"}', { 'content-type': 'application/json' }),
    response(200, positions, { 'content-type': 'application/json' }),
    response(200, 'encrypted-binary'),
  ]).importer
  await assert.rejects(
    strict.resolvePublicTrack({
      url: 'https://www.2bulu.com/track/t-abc.htm',
      partialPolicy: 'reject',
    }, { userId: 'usr_strict' }),
    error => error.statusCode === 422 && error.code === 'TWO_BULU_PARTIAL_REJECTED'
  )

  const allowed = queuedImporter([
    response(200, page),
    response(200, '{"code":"1"}', { 'content-type': 'application/json' }),
    response(200, positions, { 'content-type': 'application/json' }),
    response(200, 'encrypted-binary'),
  ]).importer
  const result = await allowed.resolvePublicTrack({
    url: 'https://www.2bulu.com/track/t-abc.htm',
    partialPolicy: 'allow-track-only',
  }, { userId: 'usr_allowed' })
  assert.equal(result.completeness, 'track-only')
  assert.equal(result.document.features.length, 1)
  assert.match(result.warnings[0], /只能导入轨迹线/)
})

test('WAF 页面映射为稳定错误且不回传上游正文', async () => {
  const waf = '<!doctype html><html><title>Confirm You Are Human</title><script src="/.safeline/static/main.js"></script></html>'
  const { importer } = queuedImporter([
    response(468, waf),
    response(468, waf),
    response(468, waf),
  ])
  await assert.rejects(
    importer.resolvePublicTrack({
      url: 'https://www.2bulu.com/track/t-abc.htm',
      partialPolicy: 'allow-track-only',
    }, { userId: 'usr_blocked' }),
    error => error.statusCode === 502 &&
      error.code === 'TWO_BULU_UPSTREAM_BLOCKED' &&
      !error.message.includes('/.safeline/static')
  )
})

test('登录和验证码页面映射为降级导入提示', async () => {
  const captcha = '<!doctype html><html><title>轨迹验证</title><div>请输入验证码</div><script src="aliyun-captcha.js"></script></html>'
  const { importer } = queuedImporter([
    response(200, captcha),
    response(200, captcha),
    response(200, captcha),
  ])
  await assert.rejects(
    importer.resolvePublicTrack({
      url: 'https://www.2bulu.com/track/t-abc.htm',
      partialPolicy: 'allow-track-only',
    }, { userId: 'usr_login_required' }),
    error => error.statusCode === 422 && error.code === 'TWO_BULU_LOGIN_REQUIRED'
  )
})

test('同用户并发优先返回 409 且总流程使用统一截止时间', async () => {
  const concurrent = queuedImporter([]).importer
  concurrent.activeUsers.add('usr_busy')
  await assert.rejects(
    concurrent.resolvePublicTrack({
      url: 'https://www.2bulu.com/track/t-abc.htm',
    }, { userId: 'usr_busy' }),
    error => error.statusCode === 409 && error.code === 'TWO_BULU_IMPORT_IN_PROGRESS'
  )

  let now = 1000
  const requests = []
  const timed = new TwoBuluImportService({
    clock: () => now,
    timeoutMs: 8000,
    totalTimeoutMs: 10000,
    minIntervalMs: 0,
    rateMaxAttempts: 100,
    targetResolver: async url => ({ ...PUBLIC_RESOLUTION, url }),
    httpClient: async config => {
      requests.push(config)
      now += 6000
      return requests.length === 1
        ? response(200, '<html><head><title>公开轨迹</title></head><body></body></html>')
        : response(200, '{}', { 'content-type': 'application/json' })
    },
  })
  await assert.rejects(
    timed.resolvePublicTrack({
      url: 'https://www.2bulu.com/track/t-abc.htm',
    }, { userId: 'usr_timeout' }),
    error => error.statusCode === 504 && error.code === 'TWO_BULU_TIMEOUT'
  )
  assert.deepEqual(requests.map(item => item.timeout), [8000, 4000])
})

test('DNS 解析阻塞时受总截止时间约束且不会发起后续 HTTP 请求', async () => {
  let httpRequestCount = 0
  const importer = new TwoBuluImportService({
    timeoutMs: 100,
    totalTimeoutMs: 20,
    minIntervalMs: 0,
    rateMaxAttempts: 100,
    targetResolver: () => new Promise(() => {}),
    httpClient: async () => {
      httpRequestCount += 1
      return response(200, '{}')
    },
  })
  const startedAt = Date.now()

  await assert.rejects(
    importer.resolvePublicTrack({
      url: 'https://www.2bulu.com/track/t-abc.htm',
    }, { userId: 'usr_dns_timeout' }),
    error => error.statusCode === 504 && error.code === 'TWO_BULU_TIMEOUT'
  )

  assert.equal(httpRequestCount, 0)
  assert.ok(Date.now() - startedAt < 1000)
})

test('外部请求限制跨域重定向、超限响应和用户级频率', async () => {
  const redirected = queuedImporter([
    response(302, '', { location: 'https://evil.example/track.kml' }),
  ]).importer
  await assert.rejects(
    redirected.requestBuffer('https://www.2bulu.com/track/track_detail.htm?trackId=abc'),
    error => error.code === 'TWO_BULU_UPSTREAM_BLOCKED'
  )

  const oversized = queuedImporter([
    response(200, 'small', { 'content-length': '9999' }),
  ], { dataMaxBytes: 100 }).importer
  await assert.rejects(
    oversized.requestBuffer('https://www.2bulu.com/track/track_detail.htm?trackId=abc', { maxBytes: 100 }),
    error => error.statusCode === 413 && error.code === 'FILE_TOO_LARGE'
  )

  let now = 10000
  const limited = new TwoBuluImportService({
    clock: () => now,
    minIntervalMs: 2000,
    rateMaxAttempts: 2,
  })
  limited.assertRateLimit('usr_rate')
  assert.throws(() => limited.assertRateLimit('usr_rate'), error => error.code === 'TWO_BULU_RATE_LIMITED')
  now += 2000
  limited.assertRateLimit('usr_rate')
  now += 2000
  assert.throws(() => limited.assertRateLimit('usr_rate'), error => error.code === 'TWO_BULU_RATE_LIMITED')
})
