import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import fs from 'fs-extra'
import path from 'path'
import { tmpdir } from 'node:os'
import FetchRelay from '../service/bin/middleware/fetchRelay/index.js'
import { resolvePublicHttpTarget } from '../service/bin/security/networkTarget.js'

async function resolveTestTarget (url) {
  return {
    url,
    hostname: new URL(url).hostname,
    addresses: [{ address: '203.12.34.56', family: 4 }],
  }
}

function streamFrom (value) {
  return Readable.from([Buffer.from(value)])
}

async function removeDir (dir) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs.remove(dir)
      return
    } catch (err) {
      if (err.code !== 'ENOTEMPTY' || attempt === 4) {
        throw err
      }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }
}

function createRelay (responses, options = {}) {
  const calls = []
  const cacheDir = path.join(tmpdir(), `map-service-fetch-relay-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const relay = new FetchRelay({
    cacheDir,
    ttl: options.ttl ?? 1000 * 60,
    staleTtl: options.staleTtl ?? 1000 * 60 * 60,
    minCacheBytes: options.minCacheBytes ?? 1,
    targetResolver: resolveTestTarget,
    httpClient: async (config) => {
      calls.push(config)
      const nextResponse = responses.shift()

      if (nextResponse instanceof Error) {
        throw nextResponse
      }

      return {
        status: 200,
        headers: {
          'content-type': 'image/png',
          etag: '"test-etag"',
        },
        data: streamFrom('tile-data'),
        ...nextResponse,
      }
    },
  })

  return {
    relay,
    cacheDir,
    calls,
    cleanup: () => removeDir(cacheDir),
  }
}

async function readStream (stream) {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString()
}

test('fetch relay writes metadata and serves fresh cache without upstream call', async () => {
  const targetUrl = 'https://www.google.com/maps/vt?lyrs=s&x=1&y=2&z=3'
  const { relay, calls, cleanup } = createRelay([{}])

  try {
    const first = await relay.fetch(targetUrl)
    assert.equal(first.cacheStatus, 'MISS')
    assert.equal(await readStream(first.stream), 'tile-data')
    assert.equal(calls.length, 1)

    const second = await relay.fetch(targetUrl)
    assert.equal(second.cacheStatus, 'HIT')
    assert.equal(await readStream(second.stream), 'tile-data')
    assert.equal(calls.length, 1)

    let stats = await relay.getStats()
    assert.equal(stats.files, 1)
    assert.equal(stats.fresh, 1)
  } finally {
    await cleanup()
  }
})

test('fetch relay forwards a bounded redirect policy without writing cache', async () => {
  const targetUrl = 'https://down-files.2bulu.com/f/dn1?downParams=opaque-value'
  const { relay, calls, cleanup } = createRelay([{}])

  try {
    const result = await relay.fetch(targetUrl, { cache: false, maxRedirects: 0 })
    assert.equal(await readStream(result.stream), 'tile-data')
    assert.equal(result.cacheStatus, 'BYPASS')
    assert.equal(calls[0].maxRedirects, 0)
    assert.ok(calls[0].httpAgent)
    assert.ok(calls[0].httpsAgent)
    assert.equal(await fs.pathExists(relay.getCachePaths(targetUrl).cachePath), false)
  } finally {
    await cleanup()
  }
})

test('fetch relay proxy mode pins the validated origin address and preserves TLS identity', async () => {
  const targetUrl = 'https://tiles.example.com/3/1/2.png'
  const { relay, calls, cleanup } = createRelay([{}])

  try {
    const result = await relay.fetch(targetUrl, {
      cache: false,
      proxy: {
        enabled: true,
        protocol: 'http',
        host: 'proxy.example.net',
        port: 8080,
      },
    })
    assert.equal(await readStream(result.stream), 'tile-data')
    assert.equal(calls[0].url, 'https://203.12.34.56/3/1/2.png')
    assert.equal(calls[0].url.includes('tiles.example.com'), false)
    assert.equal(calls[0].headers.Host, 'tiles.example.com')
    assert.equal(calls[0].proxy, false)
    assert.equal(calls[0].httpsAgent.proxy.host, 'proxy.example.net')
    assert.equal(calls[0].httpsAgent.proxy.protocol, 'http:')
  } finally {
    await cleanup()
  }
})

test('fetch relay permits fake-IP resolution only for a loopback proxy', async () => {
  const calls = []
  const resolverOptions = []
  const cacheDir = path.join(tmpdir(), `map-service-fetch-relay-fake-ip-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const relay = new FetchRelay({
    cacheDir,
    minCacheBytes: 1,
    targetResolver: async (url, options = {}) => {
      resolverOptions.push(options)
      return resolvePublicHttpTarget(url, {
        ...options,
        lookup: async () => [{ address: '198.18.0.44', family: 4 }],
      })
    },
    httpClient: async (config) => {
      calls.push(config)
      return {
        status: 200,
        headers: { 'content-type': 'image/png' },
        data: streamFrom('tile'),
      }
    },
  })

  try {
    const result = await relay.fetch('https://www.google.com/maps/vt?x=1&y=2&z=3', {
      cache: false,
      proxy: { enabled: true, protocol: 'http', host: '127.0.0.1', port: 7890 },
    })
    assert.equal(await readStream(result.stream), 'tile')
    assert.equal(resolverOptions[0].allowProxySyntheticAddresses, true)
    assert.equal(calls[0].url.includes('198.18.0.44'), true)
    assert.equal(calls[0].httpsAgent.proxy.host, '127.0.0.1')

    await assert.rejects(relay.fetch('https://www.google.com/maps/vt?x=4&y=5&z=6', {
      cache: false,
      proxy: { enabled: true, protocol: 'http', host: 'proxy.example.net', port: 8080 },
    }), { statusCode: 403 })
    assert.equal(resolverOptions[1].allowProxySyntheticAddresses, false)
  } finally {
    await removeDir(cacheDir)
  }
})

test('fetch relay rejects a target that fails runtime address validation before the HTTP client runs', async () => {
  const cacheDir = path.join(tmpdir(), `map-service-fetch-relay-ssrf-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  let requestCount = 0
  const denied = new Error('回源 URL 解析到了不允许的地址')
  denied.statusCode = 403
  const relay = new FetchRelay({
    cacheDir,
    targetResolver: async () => { throw denied },
    httpClient: async () => {
      requestCount += 1
      throw new Error('不应发起请求')
    },
  })

  try {
    await assert.rejects(relay.fetch('https://tiles.example.com/0/0/0.png', { cache: false }), { statusCode: 403 })
    assert.equal(requestCount, 0)
  } finally {
    await removeDir(cacheDir)
  }
})

test('fetch relay stores source/layer/publish metadata and source ttl policy', async () => {
  const targetUrl = 'https://www.google.com/maps/vt?lyrs=s&x=41&y=42&z=12'
  const { relay, cleanup } = createRelay([{}])

  try {
    const before = Date.now()
    const result = await relay.fetch(targetUrl, {
      cacheTtlMs: 1234,
      staleCacheTtlMs: 5678,
      cacheMeta: {
        sourceId: 'google-satellite',
        layerId: 'google-amap-hybrid',
        publishId: 'google-public',
      },
    })
    await readStream(result.stream)

    const meta = await fs.readJson(relay.getCachePaths(targetUrl).metaPath)
    assert.equal(meta.sourceId, 'google-satellite')
    assert.equal(meta.layerId, 'google-amap-hybrid')
    assert.equal(meta.publishId, 'google-public')
    assert.ok(meta.expiresAt >= before + 1234)
    assert.ok(meta.staleExpiresAt >= before + 5678)

    const stats = await relay.getStats()
    assert.equal(stats.bySource['google-satellite'].files, 1)
    assert.equal(stats.byLayer['google-amap-hybrid'].files, 1)
    assert.equal(stats.byPublish['google-public'].files, 1)
    assert.equal(stats.entries[0].sourceId, 'google-satellite')
  } finally {
    await cleanup()
  }
})

test('fetch relay revalidates stale cache with conditional headers', async () => {
  const targetUrl = 'https://www.google.com/maps/vt?lyrs=s&x=4&y=5&z=6'
  const { relay, calls, cleanup } = createRelay([
    {},
    {
      status: 304,
      data: streamFrom(''),
    },
  ], {
    ttl: 1,
  })

  try {
    const first = await relay.fetch(targetUrl)
    assert.equal(first.cacheStatus, 'MISS')
    await readStream(first.stream)

    await new Promise(resolve => setTimeout(resolve, 5))

    const second = await relay.fetch(targetUrl)
    assert.equal(second.cacheStatus, 'REVALIDATED')
    assert.equal(await readStream(second.stream), 'tile-data')
    assert.equal(calls.length, 2)
    assert.equal(calls[1].headers['If-None-Match'], '"test-etag"')
  } finally {
    await cleanup()
  }
})

test('fetch relay serves stale cache when refresh fails within stale window', async () => {
  const targetUrl = 'https://www.google.com/maps/vt?lyrs=s&x=7&y=8&z=9'
  const { relay, cleanup } = createRelay([
    {},
    new Error('upstream unavailable'),
  ], {
    ttl: 1,
    staleTtl: 1000,
  })

  try {
    const first = await relay.fetch(targetUrl)
    await readStream(first.stream)

    await new Promise(resolve => setTimeout(resolve, 5))

    const second = await relay.fetch(targetUrl)
    assert.equal(second.cacheStatus, 'STALE')
    assert.equal(await readStream(second.stream), 'tile-data')
  } finally {
    await cleanup()
  }
})

test('fetch relay does not cache upstream errors', async () => {
  const targetUrl = 'https://www.google.com/maps/vt?lyrs=s&x=10&y=11&z=12'
  const { relay, cleanup } = createRelay([
    {
      status: 500,
      headers: {
        'content-type': 'text/html',
      },
      data: streamFrom('<html>error</html>'),
    },
  ])

  try {
    await assert.rejects(() => relay.fetch(targetUrl), /non-cacheable status 500/)
    let stats = await relay.getStats()
    assert.equal(stats.files, 0)
  } finally {
    await cleanup()
  }
})

test('fetch relay cache=false bypasses local writes', async () => {
  const targetUrl = 'https://www.google.com/maps/vt?lyrs=s&x=13&y=14&z=15'
  const { relay, cleanup } = createRelay([{}])

  try {
    const result = await relay.fetch(targetUrl, { cache: false })
    assert.equal(result.cacheStatus, 'BYPASS')
    assert.equal(await readStream(result.stream), 'tile-data')

    const stats = await relay.getStats()
    assert.equal(stats.files, 0)
  } finally {
    await cleanup()
  }
})

test('fetch relay clears all cache entries', async () => {
  const targetUrl = 'https://www.google.com/maps/vt?lyrs=s&x=16&y=17&z=18'
  const { relay, cleanup } = createRelay([{}])

  try {
    const result = await relay.fetch(targetUrl)
    await readStream(result.stream)

    let stats = await relay.getStats()
    assert.equal(stats.files, 1)

    const clearResult = await relay.clear()
    assert.equal(clearResult.removed, 'all')

    stats = await relay.getStats()
    assert.equal(stats.files, 0)
  } finally {
    await cleanup()
  }
})

test('fetch relay clears selected cache entries in batches', async () => {
  const firstUrl = 'https://www.google.com/maps/vt?lyrs=s&x=30&y=31&z=12'
  const secondUrl = 'https://www.google.com/maps/vt?lyrs=s&x=32&y=33&z=12'
  const { relay, cleanup } = createRelay([{}, {}])

  try {
    await readStream((await relay.fetch(firstUrl)).stream)
    await readStream((await relay.fetch(secondUrl)).stream)

    const stats = await relay.getStats()
    assert.equal(stats.files, 2)

    const clearResult = await relay.clearMany([firstUrl])
    assert.equal(clearResult.removed, 1)

    assert.equal(await fs.pathExists(relay.getCachePaths(firstUrl).cachePath), false)
    assert.equal(await fs.pathExists(relay.getCachePaths(firstUrl).metaPath), false)
    assert.equal(await fs.pathExists(relay.getCachePaths(secondUrl).cachePath), true)
    assert.equal(await fs.pathExists(relay.getCachePaths(secondUrl).metaPath), true)
  } finally {
    await cleanup()
  }
})

test('fetch relay forwards custom headers and caches vector tile content type', async () => {
  const targetUrl = 'https://tiles.example.com/3/1/2.pbf'
  const calls = []
  const cacheDir = path.join(tmpdir(), `map-service-fetch-relay-vector-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const relay = new FetchRelay({
    cacheDir,
    minCacheBytes: 1,
    targetResolver: resolveTestTarget,
    httpClient: async (config) => {
      calls.push(config)
      return {
        status: 200,
        headers: {
          'content-type': 'application/vnd.mapbox-vector-tile',
        },
        data: streamFrom('vector-tile-data'),
      }
    },
  })

  try {
    const result = await relay.fetch(targetUrl, {
      headers: {
        'x-api-key': 'secret-key',
      },
    })
    assert.equal(result.cacheStatus, 'MISS')
    assert.equal(await readStream(result.stream), 'vector-tile-data')
    assert.equal(calls[0].headers['x-api-key'], 'secret-key')

    const cached = await relay.fetch(targetUrl)
    assert.equal(cached.cacheStatus, 'HIT')
    assert.equal(await readStream(cached.stream), 'vector-tile-data')
  } finally {
    await removeDir(cacheDir)
  }
})

test('fetch relay uses range-aware cache keys and masks sensitive cache metadata', async () => {
  const targetUrl = 'https://tiles.example.com/world.pmtiles?key=secret-key'
  const calls = []
  const cacheDir = path.join(tmpdir(), `map-service-fetch-relay-range-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const relay = new FetchRelay({
    cacheDir,
    minCacheBytes: 1,
    targetResolver: resolveTestTarget,
    httpClient: async (config) => {
      calls.push(config)
      return {
        status: 206,
        headers: {
          'content-type': 'application/octet-stream',
          'content-range': config.headers.Range === 'bytes=0-10' ? 'bytes 0-10/100' : 'bytes 11-20/100',
          'accept-ranges': 'bytes',
        },
        data: streamFrom(config.headers.Range === 'bytes=0-10' ? 'range-a' : 'range-b'),
      }
    },
  })

  try {
    const first = await relay.fetch(targetUrl, {
      headers: { Range: 'bytes=0-10' },
      cacheMeta: { sourceId: 'pmtiles-source', resourceType: 'pmtiles-range' },
    })
    assert.equal(first.statusCode, 206)
    assert.equal(await readStream(first.stream), 'range-a')

    const second = await relay.fetch(targetUrl, {
      headers: { Range: 'bytes=11-20' },
      cacheMeta: { sourceId: 'pmtiles-source', resourceType: 'pmtiles-range' },
    })
    assert.equal(await readStream(second.stream), 'range-b')
    assert.equal(calls.length, 2)

    const cachedFirst = await relay.fetch(targetUrl, {
      headers: { Range: 'bytes=0-10' },
    })
    assert.equal(cachedFirst.statusCode, 206)
    assert.equal(cachedFirst.headers['content-range'], 'bytes 0-10/100')
    assert.equal(await readStream(cachedFirst.stream), 'range-a')
    assert.equal(calls.length, 2)

    const stats = await relay.getStats()
    assert.equal(stats.files, 2)
    assert.equal(stats.byResourceType['pmtiles-range'].files, 2)
    assert.equal(stats.entries[0].url.includes('secret-key'), false)
    assert.ok(stats.entries.some(entry => entry.range === 'bytes=0-10'))
  } finally {
    await removeDir(cacheDir)
  }
})

test('fetch relay persists cache stats and reuses snapshot without cache changes', async () => {
  const targetUrl = 'https://www.google.com/maps/vt?lyrs=s&x=19&y=20&z=21'
  const { relay, cacheDir, cleanup } = createRelay([{}])

  try {
    const result = await relay.fetch(targetUrl)
    await readStream(result.stream)

    const stats = await relay.getStats()
    assert.equal(stats.files, 1)
    assert.equal(stats.refreshing, false)

    const reusedRelay = new FetchRelay({
      cacheDir,
      minCacheBytes: 1,
      targetResolver: resolveTestTarget,
      httpClient: async () => {
        throw new Error('stats snapshot should not fetch upstream')
      },
    })
    reusedRelay.collectStats = async () => {
      throw new Error('stats snapshot should not be recomputed')
    }

    const reusedStats = await reusedRelay.getStats()
    assert.equal(reusedStats.files, 1)
    assert.equal(reusedStats.generatedAt, stats.generatedAt)
  } finally {
    await cleanup()
  }
})

test('fetch relay clears cache entries by sourceId', async () => {
  const firstUrl = 'https://www.google.com/maps/vt?lyrs=s&x=50&y=51&z=12'
  const secondUrl = 'https://www.google.com/maps/vt?lyrs=s&x=52&y=53&z=12'
  const { relay, cleanup } = createRelay([{}, {}])

  try {
    await readStream((await relay.fetch(firstUrl, { cacheMeta: { sourceId: 'source-a' } })).stream)
    await readStream((await relay.fetch(secondUrl, { cacheMeta: { sourceId: 'source-b' } })).stream)

    let stats = await relay.getStats()
    assert.equal(stats.files, 2)

    const clearResult = await relay.clear(null, 'source-a')
    assert.equal(clearResult.removed, 'source')
    assert.equal(clearResult.target, 'source-a')

    assert.equal(await fs.pathExists(relay.getCachePaths(firstUrl).cachePath), false)
    assert.equal(await fs.pathExists(relay.getCachePaths(firstUrl).metaPath), false)
    assert.equal(await fs.pathExists(relay.getCachePaths(secondUrl).cachePath), true)
    assert.equal(await fs.pathExists(relay.getCachePaths(secondUrl).metaPath), true)
  } finally {
    await cleanup()
  }
})
