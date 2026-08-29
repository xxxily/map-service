import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import fs from 'fs-extra'
import path from 'node:path'
import { tmpdir } from 'node:os'
import AdminStore from '../service/bin/admin/store.js'
import CacheIndex from '../service/bin/admin/cacheIndex.js'
import CacheGovernanceService, {
  canonicalizeCacheUrl,
  normalizeCacheGovernancePolicy,
} from '../service/bin/admin/cacheGovernance.js'
import FetchRelay from '../service/bin/middleware/fetchRelay/index.js'

function tempDir (name) {
  return path.join(tmpdir(), `map-service-${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
}

function cacheMeta (overrides = {}) {
  const updatedAt = overrides.updatedAt || Date.now() - 10 * 24 * 60 * 60 * 1000
  return {
    key: overrides.key || 'cache-key',
    url: overrides.url || 'https://tiles.example.com/1/2/3.png?style=road',
    sourceId: overrides.sourceId || 'source-a',
    layerId: null,
    publishId: null,
    resourceType: 'raster',
    range: null,
    keyVersion: 'v1',
    policyRevision: 0,
    statusCode: 200,
    headers: {
      'content-type': 'image/png',
      etag: overrides.etag || 'same-etag',
    },
    size: overrides.size || 256,
    createdAt: updatedAt,
    updatedAt,
    expiresAt: overrides.expiresAt || updatedAt + 1000,
    staleExpiresAt: overrides.staleExpiresAt || updatedAt + 2000,
  }
}

async function writeCacheEntry (cacheDir, relativePath, meta) {
  const cachePath = path.join(cacheDir, relativePath)
  await fs.ensureDir(path.dirname(cachePath))
  await fs.writeFile(cachePath, Buffer.alloc(meta.size, 1))
  await fs.writeJson(`${cachePath}.meta.json`, meta, { spaces: 2 })
  return cachePath
}

async function waitFor (predicate, timeout = 3000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    const value = await predicate()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('waitFor timeout')
}

async function consume (response) {
  let bytes = 0
  for await (const chunk of response.stream) bytes += chunk.length
  return bytes
}

function createGovernance (rootDir, options = {}) {
  const cacheDir = path.join(rootDir, 'cache')
  const dataDir = path.join(rootDir, 'admin')
  const relay = new FetchRelay({
    cacheDir,
    minCacheBytes: 1,
    targetResolver: async url => ({ url, addresses: [] }),
  })
  const audits = []
  const governance = new CacheGovernanceService({
    store: new AdminStore({ dataDir }),
    fetchRelay: relay,
    tileCatalogManager: {
      listTileSources: async () => [{ id: 'source-a', name: 'Source A' }],
    },
    userSystem: { insertAudit: entry => audits.push(entry) },
    indexPath: path.join(dataDir, 'cache-index.sqlite'),
    ...options,
  })
  return { audits, cacheDir, governance, relay }
}

test('cache governance accepts administrator-defined capacity without a server-specific maximum', () => {
  const large = 100 * 1024 * 1024 * 1024 * 1024
  const policy = normalizeCacheGovernancePolicy({
    softLimitBytes: large,
    hardLimitBytes: large + 1024,
  })
  assert.equal(policy.softLimitBytes, large)
  assert.equal(policy.hardLimitBytes, large + 1024)
  assert.throws(() => normalizeCacheGovernancePolicy({
    softLimitBytes: 200,
    hardLimitBytes: 100,
  }), /软水位不能高于硬水位/)
})

test('cache URL canonicalization changes only explicitly configured hosts and query parameters', () => {
  const rule = {
    canonicalHost: 'a.tiles.example.com',
    equivalentHosts: ['a.tiles.example.com', 'b.tiles.example.com'],
    ignoredQueryParams: ['token'],
    sortQueryParams: true,
  }
  assert.equal(
    canonicalizeCacheUrl('https://b.tiles.example.com/1/2/3.png?z=3&token=secret&style=road', rule),
    'https://a.tiles.example.com/1/2/3.png?style=road&z=3'
  )
  assert.equal(
    canonicalizeCacheUrl('https://other.example.com/1.png?style=satellite&lang=zh', rule),
    'https://other.example.com/1.png?lang=zh&style=satellite'
  )
})

test('cache index previews bounded selections without reading the filesystem', () => {
  const index = new CacheIndex()
  const generation = 'generation-a'
  index.beginReconcile(generation)
  const now = Date.now()
  for (let position = 0; position < 3; position += 1) {
    index.upsert({
      relativePath: `host/${position}.png`,
      metaRelativePath: `host/${position}.png.meta.json`,
      sourceId: 'source-a',
      resourceType: 'raster',
      size: 100,
      updatedAt: now - 10000 - position,
      expiresAt: now - 5000,
      staleExpiresAt: now - 1000,
    }, { generation })
  }
  index.completeReconcile(generation)

  const preview = index.previewSelection({
    sourceIds: ['source-a'],
    states: ['expired'],
    maxFiles: 2,
    maxBytes: 250,
    now,
  }, now)
  assert.equal(preview.files, 2)
  assert.equal(preview.bytes, 200)
  assert.equal(preview.expired, 2)
  index.close()
})

test('cache cleanup requires a complete index and deletes only the previewed entries', async () => {
  const rootDir = tempDir('cache-governance-cleanup')
  const { cacheDir, governance } = createGovernance(rootDir)
  try {
    await governance.ready()
    const incompletePreview = await governance.previewCleanup({ states: ['expired'] })
    await assert.rejects(
      governance.createCleanupJob({ user: { id: 'admin-1' } }, { previewId: incompletePreview.previewId }),
      error => error.code === 'INDEX_NOT_READY'
    )

    const expiredPath = await writeCacheEntry(cacheDir, 'tiles.example.com/expired.png', cacheMeta())
    const freshPath = await writeCacheEntry(cacheDir, 'tiles.example.com/fresh.png', cacheMeta({
      key: 'fresh',
      url: 'https://tiles.example.com/fresh.png',
      updatedAt: Date.now(),
      expiresAt: Date.now() + 60000,
      staleExpiresAt: Date.now() + 120000,
    }))

    await governance.reconcileIndex({ user: { id: 'admin-1' } }, { force: true })
    await governance.reconcilePromise.promise
    const preview = await governance.previewCleanup({ states: ['expired'] })
    assert.equal(preview.files, 1)
    const job = await governance.createCleanupJob(
      { user: { id: 'admin-1' } },
      { previewId: preview.previewId },
      { ip: '127.0.0.1' }
    )
    const completed = await waitFor(async () => {
      const jobs = await governance.listCleanupJobs()
      const current = jobs.items.find(item => item.id === job.id)
      return current && ['completed', 'failed'].includes(current.status) ? current : null
    })
    assert.equal(completed.status, 'completed')
    assert.equal(completed.deletedFiles, 1)
    assert.equal(await fs.pathExists(expiredPath), false)
    assert.equal(await fs.pathExists(freshPath), true)
  } finally {
    governance.index.close()
    await fs.remove(rootDir)
  }
})

test('cache key analysis enables a source-scoped v2 key after a conflict-free review', async () => {
  const rootDir = tempDir('cache-governance-analysis')
  const { cacheDir, governance, relay } = createGovernance(rootDir)
  try {
    await writeCacheEntry(cacheDir, 'a.tiles.example.com/a.png', cacheMeta({
      key: 'a',
      url: 'https://a.tiles.example.com/1/2/3.png?style=road&token=****',
    }))
    await writeCacheEntry(cacheDir, 'b.tiles.example.com/b.png', cacheMeta({
      key: 'b',
      url: 'https://b.tiles.example.com/1/2/3.png?token=****&style=road',
    }))
    await governance.reconcileIndex({ user: { id: 'admin-1' } }, { force: true })
    await governance.reconcilePromise.promise
    const rule = {
      canonicalHost: 'a.tiles.example.com',
      equivalentHosts: ['a.tiles.example.com', 'b.tiles.example.com'],
      ignoredQueryParams: ['token'],
      sensitiveQueryParams: ['token'],
      sortQueryParams: true,
    }
    const analysis = await governance.analyzeKeyPolicy(
      { user: { id: 'admin-1' } },
      { sourceId: 'source-a', rule, sampleLimit: 100 }
    )
    assert.equal(analysis.safeToEnable, true)
    assert.equal(analysis.duplicateFiles, 1)
    await governance.updateKeyPolicy(
      { user: { id: 'admin-1' } },
      'source-a',
      { ...rule, mode: 'normalized_v2', analysisId: analysis.analysisId }
    )
    const first = await governance.getRuntimeCacheOptions(
      'source-a',
      'https://a.tiles.example.com/1/2/3.png?style=road&token=one',
      'raster'
    )
    const second = await governance.getRuntimeCacheOptions(
      'source-a',
      'https://b.tiles.example.com/1/2/3.png?token=two&style=road',
      'raster'
    )
    assert.equal(first.cacheKey, second.cacheKey)
    assert.equal(first.legacyCacheKeyFallback, true)
    const legacyAlias = await relay.getCachedEntry(
      'https://b.tiles.example.com/1/2/3.png?token=rotated&style=road',
      { ...second, cacheMeta: { sourceId: 'source-a', resourceType: 'raster' } }
    )
    assert.equal(legacyAlias.exists, true)
    assert.equal(legacyAlias.legacyAlias, true)
  } finally {
    governance.index.close()
    await fs.remove(rootDir)
  }
})

test('fetch relay can read a legacy full-URL entry after normalized v2 is enabled', async () => {
  const cacheDir = tempDir('cache-v2-fallback')
  let calls = 0
  const relay = new FetchRelay({
    cacheDir,
    minCacheBytes: 1,
    targetResolver: async url => ({ url, addresses: [] }),
    httpClient: async () => {
      calls += 1
      return {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '256' },
        data: Readable.from(Buffer.alloc(256, 1)),
      }
    },
  })
  const url = 'https://tiles.example.com/1/2/3.png?style=road'
  try {
    const first = await relay.fetch(url)
    for await (const chunk of first.stream) void chunk
    assert.equal(calls, 1)

    const second = await relay.fetch(url, {
      cacheKey: `v2|source:source-a|resource:raster|url:${url}|range:`,
      cacheNamespace: 'v2-source-a',
      cacheKeyVersion: 'v2',
      legacyCacheKeyFallback: true,
    })
    for await (const chunk of second.stream) void chunk
    assert.equal(second.cacheStatus, 'HIT')
    assert.equal(calls, 1)
    assert.equal(second.cachePath.includes('tiles.example.com'), true)
  } finally {
    await fs.remove(cacheDir)
  }
})

test('fetch relay returns upstream data without persisting when the hard limit rejects a write', async () => {
  const cacheDir = tempDir('cache-hard-limit')
  const relay = new FetchRelay({
    cacheDir,
    minCacheBytes: 1,
    targetResolver: async url => ({ url, addresses: [] }),
    httpClient: async () => ({
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '256' },
      data: Readable.from(Buffer.alloc(256, 1)),
    }),
  })
  relay.setCacheObserver({ shouldPersist: () => false })
  try {
    const result = await relay.fetch('https://tiles.example.com/limit.png')
    let bytes = 0
    for await (const chunk of result.stream) bytes += chunk.length
    assert.equal(result.cacheStatus, 'BYPASS_LIMIT')
    assert.equal(bytes, 256)
    assert.equal(await fs.pathExists(relay.getCachePaths('https://tiles.example.com/limit.png').cachePath), false)
  } finally {
    await fs.remove(cacheDir)
  }
})

test('concurrent cache misses reserve physical capacity before either response is committed', async () => {
  const rootDir = tempDir('cache-concurrent-limit')
  const { cacheDir, governance, relay } = createGovernance(rootDir)
  relay.httpClient = async () => ({
    status: 200,
    headers: { 'content-type': 'image/png', 'content-length': '600' },
    data: Readable.from(Buffer.alloc(600, 1)),
  })
  try {
    await governance.ready()
    governance.onCacheClear()
    await governance.updatePolicy(null, { hardLimitBytes: 1700 })
    const responses = await Promise.all([
      relay.fetch('https://tiles.example.com/concurrent-a.png'),
      relay.fetch('https://tiles.example.com/concurrent-b.png'),
    ])
    await Promise.all(responses.map(consume))
    assert.deepEqual(
      responses.map(item => item.cacheStatus).sort(),
      ['BYPASS_LIMIT', 'MISS']
    )
    await governance.flushPendingIndexWrites()
    const status = governance.index.getStatus()
    assert.equal(status.entries, 1)
    assert.ok(status.estimatedPhysicalBytes <= 1700)
  } finally {
    governance.index.close()
    await fs.remove(cacheDir)
    await fs.remove(rootDir)
  }
})

test('cache persistence rechecks actual response size before commit', async () => {
  const rootDir = tempDir('cache-actual-limit')
  const { governance, relay } = createGovernance(rootDir)
  relay.httpClient = async () => ({
    status: 200,
    headers: { 'content-type': 'image/png', 'content-length': '100' },
    data: Readable.from(Buffer.alloc(900, 1)),
  })
  const url = 'https://tiles.example.com/actual-size.png'
  try {
    await governance.ready()
    governance.onCacheClear()
    await governance.updatePolicy(null, { hardLimitBytes: 1100 })
    const response = await relay.fetch(url)
    assert.equal(response.cacheStatus, 'BYPASS_LIMIT')
    assert.equal(await consume(response), 900)
    await waitFor(async () => !await fs.pathExists(relay.getCachePaths(url).cachePath))
    assert.equal(governance.usage.physicalBytes, 0)
  } finally {
    governance.index.close()
    await fs.remove(rootDir)
  }
})

test('hard capacity uses a conservative bypass when upstream size is unknown', async () => {
  const rootDir = tempDir('cache-unknown-size')
  const { governance } = createGovernance(rootDir)
  try {
    await governance.ready()
    governance.onCacheClear()
    await governance.updatePolicy(null, { hardLimitBytes: 1024 * 1024 })
    const reservation = await governance.reservePersist({
      relativePath: 'tiles.example.com/unknown.png',
      estimatedSize: 0,
      estimatedMetaSize: 512,
    })
    assert.equal(reservation.allowed, false)
    assert.equal(reservation.reason, 'unknown-size')
  } finally {
    governance.index.close()
    await fs.remove(rootDir)
  }
})

test('a stale cache index is never treated as exact capacity data', () => {
  const index = new CacheIndex()
  index.beginReconcile('generation-a')
  index.upsert({
    relativePath: 'host/a.png',
    metaRelativePath: 'host/a.png.meta.json',
    size: 100,
    metaSize: 20,
    updatedAt: Date.now(),
  }, { generation: 'generation-a' })
  index.completeReconcile('generation-a')
  index.failReconcile('scan failed')
  const status = index.getStatus()
  assert.equal(status.status, 'stale')
  assert.equal(status.ready, false)
  assert.equal(status.exact, false)
  index.close()
})

test('an interrupted incremental index batch remains dirty after restart', async () => {
  const rootDir = tempDir('cache-index-dirty-restart')
  const indexPath = path.join(rootDir, 'cache-index.sqlite')
  try {
    const first = new CacheIndex({ filePath: indexPath })
    first.beginReconcile('generation-a')
    first.completeReconcile('generation-a')
    assert.equal(first.markIncrementalDirty(), true)
    first.close()

    const reopened = new CacheIndex({ filePath: indexPath })
    const status = reopened.getStatus()
    assert.equal(status.status, 'dirty')
    assert.equal(status.ready, false)
    reopened.close()
  } finally {
    await fs.remove(rootDir)
  }
})

test('an incremental index batch recovers to ready after a transient SQLite failure', async () => {
  const rootDir = tempDir('cache-index-retry')
  const { governance } = createGovernance(rootDir)
  try {
    await governance.ready()
    governance.onCacheClear()
    const originalUpsertMany = governance.index.upsertMany.bind(governance.index)
    let attempts = 0
    governance.index.upsertMany = (entries, options) => {
      attempts += 1
      if (attempts === 1) throw new Error('temporary sqlite failure')
      return originalUpsertMany(entries, options)
    }
    governance.queueIndexUpsert({
      relativePath: 'host/retry.png',
      metaRelativePath: 'host/retry.png.meta.json',
      size: 100,
      metaSize: 20,
      updatedAt: Date.now(),
    })
    await assert.rejects(governance.flushPendingIndexWrites(), /temporary sqlite failure/)
    assert.equal(governance.index.getStatus().status, 'dirty')
    await governance.flushPendingIndexWrites()
    const status = governance.index.getStatus()
    assert.equal(status.status, 'ready')
    assert.equal(status.entries, 1)
  } finally {
    governance.index.close()
    await fs.remove(rootDir)
  }
})

test('clearing cache invalidates an already scheduled index flush', async () => {
  const rootDir = tempDir('cache-index-clear-race')
  const { governance } = createGovernance(rootDir)
  try {
    await governance.ready()
    governance.onCacheClear()
    governance.queueIndexUpsert({
      relativePath: 'host/cleared.png',
      metaRelativePath: 'host/cleared.png.meta.json',
      size: 100,
      metaSize: 20,
      updatedAt: Date.now(),
    })
    const flushPromise = governance.flushPendingIndexWrites()
    governance.onCacheClear()
    await flushPromise
    const status = governance.index.getStatus()
    assert.equal(status.status, 'ready')
    assert.equal(status.entries, 0)
    assert.equal(governance.pendingIndexUpserts.size, 0)
  } finally {
    governance.index.close()
    await fs.remove(rootDir)
  }
})

test('full cache clear waits for an in-flight cache write before removing files', async () => {
  const cacheDir = tempDir('cache-clear-write-race')
  const relay = new FetchRelay({ cacheDir, minCacheBytes: 1 })
  let releaseUpsert
  let markUpsertStarted
  const upsertStarted = new Promise(resolve => { markUpsertStarted = resolve })
  const upsertBarrier = new Promise(resolve => { releaseUpsert = resolve })
  const events = []
  relay.setCacheObserver({
    onUpsert: async () => {
      events.push('upsert-started')
      markUpsertStarted()
      await upsertBarrier
      events.push('upsert-finished')
    },
    onClear: async () => {
      events.push('clear-finished')
    },
  })
  const url = 'https://tiles.example.com/1/2/3.png'
  const paths = relay.getCachePaths(url)
  try {
    const writePromise = relay.writeResponseToCache(url, {
      status: 200,
      headers: { 'content-type': 'image/png' },
      data: Readable.from(Buffer.alloc(256, 1)),
    }, paths)
    await upsertStarted

    let clearFinished = false
    const clearPromise = relay.clear().then((result) => {
      clearFinished = true
      return result
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(clearFinished, false)

    releaseUpsert()
    await writePromise
    const result = await clearPromise
    assert.equal(result.removed, 'all')
    assert.deepEqual(events, ['upsert-started', 'upsert-finished', 'clear-finished'])
    assert.equal(await fs.pathExists(paths.cachePath), false)
    assert.equal(await fs.pathExists(paths.metaPath), false)
  } finally {
    await fs.remove(cacheDir)
  }
})

test('cache responses keep an open file descriptor when full clear removes their paths', async () => {
  for (const bypass of [false, true]) {
    const cacheDir = tempDir(`cache-clear-stream-${bypass ? 'bypass' : 'stored'}`)
    const relay = new FetchRelay({
      cacheDir,
      minCacheBytes: 1,
      targetResolver: async url => ({ url, addresses: [] }),
      httpClient: async () => ({
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '256' },
        data: Readable.from(Buffer.alloc(256, 1)),
      }),
    })
    if (bypass) {
      relay.setCacheObserver({
        reservePersist: async () => ({ id: 'reservation-a', allowed: true }),
        confirmPersist: async () => false,
        releasePersist: async () => {},
      })
    }
    try {
      const response = await relay.fetch(`https://tiles.example.com/${bypass ? 'bypass' : 'stored'}.png`)
      assert.equal(Number.isInteger(response.stream.fd), true)
      await relay.clear()
      assert.equal(await consume(response), 256)
    } finally {
      await fs.remove(cacheDir)
    }
  }
})

test('index reconciliation preserves invalid sidecars and accounts for their files as orphaned cache', async () => {
  const rootDir = tempDir('cache-invalid-sidecar')
  const { cacheDir, governance } = createGovernance(rootDir)
  const cachePath = path.join(cacheDir, 'tiles.example.com', 'invalid.png')
  const metaPath = `${cachePath}.meta.json`
  try {
    await fs.ensureDir(path.dirname(cachePath))
    await fs.writeFile(cachePath, Buffer.alloc(128, 1))
    await fs.writeFile(metaPath, '{invalid json')
    const task = await governance.reconcileIndex({ user: { id: 'admin-1' } }, { force: true })
    await governance.reconcilePromise.promise
    assert.equal(task.status, 'completed')
    assert.equal(task.invalidMetadataEntries, 1)
    assert.equal(await fs.pathExists(metaPath), true)
    const status = governance.index.getStatus()
    assert.equal(status.entries, 1)
    assert.ok(status.estimatedPhysicalBytes >= 128)
    const orphaned = governance.index.previewSelection({
      orphanedOnly: true,
      states: ['expired'],
      now: Date.now(),
    }, Date.now())
    assert.equal(orphaned.files, 1)
  } finally {
    governance.index.close()
    await fs.remove(rootDir)
  }
})

test('read-only metadata inspection never deletes an invalid sidecar', async () => {
  const rootDir = tempDir('cache-read-meta')
  const relay = new FetchRelay({ cacheDir: rootDir })
  const metaPath = path.join(rootDir, 'invalid.meta.json')
  try {
    await fs.ensureDir(rootDir)
    await fs.writeFile(metaPath, '{invalid json')
    assert.equal(await relay.readMeta(metaPath), null)
    assert.equal(await fs.pathExists(metaPath), true)
  } finally {
    await fs.remove(rootDir)
  }
})

test('cache fetch preserves the body and malformed sidecar when upstream refresh fails', async () => {
  const cacheDir = tempDir('cache-preserve-invalid-meta')
  const relay = new FetchRelay({
    cacheDir,
    minCacheBytes: 1,
    targetResolver: async url => ({ url, addresses: [] }),
    httpClient: async () => {
      throw new Error('upstream unavailable')
    },
  })
  const url = 'https://tiles.example.com/invalid.png'
  const paths = relay.getCachePaths(url)
  try {
    await fs.ensureDir(path.dirname(paths.cachePath))
    await fs.writeFile(paths.cachePath, Buffer.alloc(256, 1))
    await fs.writeFile(paths.metaPath, '{invalid json')
    await assert.rejects(relay.fetch(url), /upstream unavailable/)
    assert.equal(await fs.pathExists(paths.cachePath), true)
    assert.equal(await fs.pathExists(paths.metaPath), true)
  } finally {
    await fs.remove(cacheDir)
  }
})

test('cleanup skips a cache path that was replaced after the selection cutoff', async () => {
  const rootDir = tempDir('cache-cleanup-race')
  const { cacheDir, governance } = createGovernance(rootDir)
  const relativePath = 'tiles.example.com/race.png'
  try {
    await writeCacheEntry(cacheDir, relativePath, cacheMeta({ size: 128 }))
    await governance.reconcileIndex({ user: { id: 'admin-1' } }, { force: true })
    await governance.reconcilePromise.promise
    const selected = governance.index.selectBatch({ states: ['expired'], maxFiles: 1 }, Date.now())[0]
    const replacement = cacheMeta({
      key: 'replacement',
      size: 128,
      updatedAt: Date.now(),
      expiresAt: Date.now() + 60000,
      staleExpiresAt: Date.now() + 120000,
    })
    await writeCacheEntry(cacheDir, relativePath, replacement)
    assert.equal(await governance.removeIndexedEntry(selected), null)
    assert.equal(await fs.pathExists(path.join(cacheDir, relativePath)), true)
  } finally {
    governance.index.close()
    await fs.remove(rootDir)
  }
})

test('URL analysis blocks malformed metadata and never returns query values', () => {
  const rootDir = tempDir('cache-analysis-redaction')
  const { governance } = createGovernance(rootDir)
  try {
    const rule = {
      canonicalHost: 'a.tiles.example.com',
      equivalentHosts: ['a.tiles.example.com', 'b.tiles.example.com'],
      ignoredQueryParams: [],
      sensitiveQueryParams: [],
      sortQueryParams: true,
    }
    const analysis = governance.analyzeRows('source-a', rule, [
      { url: 'https://a.tiles.example.com/1.png?token=super-secret&style=road', size: 100, etag: 'a', contentType: 'image/png' },
      { url: 'https://b.tiles.example.com/1.png?style=road&token=super-secret', size: 200, etag: 'b', contentType: 'image/png' },
      { url: 'not-a-url', size: 100 },
    ], 3, 3)
    assert.equal(analysis.safeToEnable, false)
    assert.equal(analysis.malformedCount, 1)
    assert.equal(analysis.conflictCount, 1)
    assert.equal(analysis.collisions[0].canonicalUrl.includes('super-secret'), false)
    assert.match(analysis.collisions[0].canonicalUrl, /\?style&token$/)
  } finally {
    governance.index.close()
    fs.removeSync(rootDir)
  }
})

test('cleanup selection never bypasses the configured physical byte ceiling for one large file', () => {
  const index = new CacheIndex()
  const now = Date.now()
  index.beginReconcile('generation-a')
  index.upsert({
    relativePath: 'host/large.png',
    metaRelativePath: 'host/large.png.meta.json',
    size: 500,
    metaSize: 50,
    updatedAt: now - 1000,
    expiresAt: now - 500,
    staleExpiresAt: now - 100,
  }, { generation: 'generation-a' })
  index.completeReconcile('generation-a')
  assert.deepEqual(index.selectBatch({ states: ['expired'], maxFiles: 1, maxBytes: 100, now }, now), [])
  index.close()
})
