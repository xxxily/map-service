import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createKmlFileViewportScheduler,
  rankKmlFilesForViewport,
} from '../src/map/kml-file-viewport-loading.js'

const bounds = (west, south = 0, east = west + 1, north = south + 1) => ({
  version: 1,
  status: 'ready',
  bbox: [west, south, east, north],
  crossesAntimeridian: west > east,
  featureCount: 1,
})

const file = (id, west, options = {}) => ({
  id,
  enabled: true,
  contentLoaded: false,
  bounds: options.bounds === undefined ? bounds(west) : options.bounds,
  position: options.position || 0,
  ...options,
})

function deferred () {
  let resolve
  const promise = new Promise(res => { resolve = res })
  return { promise, resolve }
}

test('rankKmlFilesForViewport unwraps map options and orders inside files by distance', () => {
  const ranked = rankKmlFilesForViewport([
    file('far-inside', 20),
    file('near-inside', 10),
    file('outside', 100),
    file('fallback', 0, { bounds: null }),
  ], {
    viewportBounds: { south: -1, west: 9, north: 3, east: 14 },
    center: { lat: 1, lng: 11 },
    zoom: 10,
  })
  assert.deepEqual(ranked.map(item => item.id), ['near-inside', 'fallback'])
  assert.equal(ranked[0].inside, true)
  assert.equal(ranked[1].hasBounds, false)
})

test('scheduler enforces concurrency and does not let a delayed retry block ready work', async () => {
  const pending = new Map()
  const started = []
  let active = 0
  let maxActive = 0
  let failOnce = true
  const files = [file('retry', 10), file('ready', 12), file('later', 13)]
  const scheduler = createKmlFileViewportScheduler({
    getFiles: () => files,
    concurrency: 1,
    delayMs: 0,
    retryDelayMs: 25,
    maxRetries: 1,
    loadFile: async current => {
      started.push(current.id)
      active += 1
      maxActive = Math.max(maxActive, active)
      if (current.id === 'retry' && failOnce) {
        failOnce = false
        active -= 1
        return false
      }
      const wait = deferred()
      pending.set(current.id, wait)
      await wait.promise
      current.contentLoaded = true
      active -= 1
      return true
    },
  })

  scheduler.refresh({ south: -1, west: 9, north: 3, east: 14, zoom: 10, center: { lat: 1, lng: 11 } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(started[0], 'retry')
  pending.get('ready')?.resolve()
  pending.get('later')?.resolve()
  // The first failure schedules a delayed retry. Ready candidates must still
  // be allowed to start before that retry becomes eligible.
  await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(started.includes('ready') || started.includes('later'))
  pending.get('ready')?.resolve()
  pending.get('later')?.resolve()
  await new Promise(resolve => setTimeout(resolve, 35))
  assert.ok(maxActive <= 1)
  scheduler.dispose()
})

test('scheduler deduplicates explicit requests, retries exhausted files, and resolves on dispose', async () => {
  const wait = deferred()
  const target = file('target', 10)
  let calls = 0
  let loadedCallback = 0
  const scheduler = createKmlFileViewportScheduler({
    getFiles: () => [target],
    concurrency: 2,
    delayMs: 0,
    loadFile: async current => {
      calls += 1
      await wait.promise
      current.contentLoaded = true
      return true
    },
    onLoaded: () => { loadedCallback += 1 },
  })
  const first = scheduler.request(target)
  const second = scheduler.request(target)
  assert.equal(scheduler.getMetrics().active, 1)
  wait.resolve()
  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.equal(calls, 1)
  assert.equal(loadedCallback, 1)

  const never = file('never', 20)
  const pending = scheduler.request(never)
  scheduler.dispose()
  assert.equal(await pending, false)
  assert.equal(scheduler.getMetrics().queued, 0)
})

test('scheduler drops queued work that was loaded externally and suppresses callbacks for replaced files', async () => {
  const blocker = file('blocker', 10)
  const original = file('same-id', 12)
  let files = [blocker, original]
  const started = []
  let loadedCallbacks = 0
  const firstGate = deferred()
  const secondGate = deferred()
  const scheduler = createKmlFileViewportScheduler({
    getFiles: () => files,
    concurrency: 1,
    delayMs: 0,
    loadFile: async current => {
      started.push(current)
      if (current === blocker) await firstGate.promise
      if (current === original) await secondGate.promise
      current.contentLoaded = true
      return true
    },
    onLoaded: () => { loadedCallbacks += 1 },
  })

  scheduler.refresh({ south: -1, west: 9, north: 3, east: 14, zoom: 10, center: { lat: 1, lng: 11 } })
  original.contentLoaded = true
  firstGate.resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(started, [blocker])

  const replacement = file('same-id', 10)
  original.contentLoaded = false
  files = [original]
  const pending = scheduler.request(original)
  files = [replacement]
  secondGate.resolve()
  assert.equal(await pending, true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(loadedCallbacks, 1)
  assert.equal(scheduler.isLoading('same-id'), false)
  scheduler.dispose()
})
