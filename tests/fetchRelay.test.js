import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import fs from 'fs-extra'
import path from 'path'
import { tmpdir } from 'node:os'
import FetchRelay from '../service/bin/middleware/fetchRelay/index.js'

function streamFrom (value) {
  return Readable.from([Buffer.from(value)])
}

function createRelay (responses, options = {}) {
  const calls = []
  const cacheDir = path.join(tmpdir(), `map-service-fetch-relay-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const relay = new FetchRelay({
    cacheDir,
    ttl: options.ttl ?? 1000 * 60,
    staleTtl: options.staleTtl ?? 1000 * 60 * 60,
    minCacheBytes: options.minCacheBytes ?? 1,
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
    cleanup: () => fs.remove(cacheDir),
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

    const stats = await relay.getStats()
    assert.equal(stats.files, 1)
    assert.equal(stats.fresh, 1)
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
    const stats = await relay.getStats()
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
