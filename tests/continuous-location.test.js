import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyContinuousLocationButtonState,
  assessPositionSample,
  createContinuousLocationController,
  formatContinuousLocationState,
} from '../src/map/continuous-location.js'

class FakeClock {
  constructor () {
    this.time = 0
    this.nextId = 1
    this.timers = new Map()
  }

  now = () => this.time

  setTimeout = (callback, delay = 0) => {
    const id = this.nextId++
    this.timers.set(id, {
      callback,
      dueAt: this.time + Math.max(0, Number(delay) || 0),
    })
    return id
  }

  clearTimeout = (id) => {
    this.timers.delete(id)
  }

  advance (milliseconds) {
    const target = this.time + milliseconds
    let iterations = 0
    while (true) {
      let nextId = null
      let nextTimer = null
      for (const [id, timer] of this.timers) {
        if (timer.dueAt <= target && (!nextTimer || timer.dueAt < nextTimer.dueAt ||
          (timer.dueAt === nextTimer.dueAt && id < nextId))) {
          nextId = id
          nextTimer = timer
        }
      }
      if (!nextTimer) break
      if (++iterations > 100_000) throw new Error('FakeClock timer loop')
      this.time = nextTimer.dueAt
      this.timers.delete(nextId)
      nextTimer.callback()
    }
    this.time = target
  }
}

class FakeSource {
  constructor () {
    this.nextId = 1
    this.watchCalls = 0
    this.clearCalls = []
    this.records = new Map()
    this.active = new Set()
    this.permissionListeners = new Set()
    this.permissionState = 'granted'
  }

  watchPosition = (success, error, options) => {
    const id = this.nextId++
    this.watchCalls += 1
    this.records.set(id, { success, error, options })
    this.active.add(id)
    return id
  }

  clearWatch = (id) => {
    this.clearCalls.push(id)
    this.active.delete(id)
  }

  subscribePermission = (listener) => {
    this.permissionListeners.add(listener)
    return () => this.permissionListeners.delete(listener)
  }

  getPermissionState = () => this.permissionState

  success (id, position) {
    this.records.get(id)?.success(position)
  }

  error (id, code) {
    this.records.get(id)?.error({ code })
  }

  setPermission (state) {
    this.permissionState = state
    for (const listener of this.permissionListeners) listener(state)
  }
}

class FakeLifecycle {
  constructor () {
    this.listeners = new Map()
    this.visibilityState = 'visible'
  }

  addEventListener (name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set())
    this.listeners.get(name).add(listener)
  }

  removeEventListener (name, listener) {
    this.listeners.get(name)?.delete(listener)
  }

  emit (name) {
    for (const listener of [...(this.listeners.get(name) || [])]) listener({ type: name })
  }

  listenerCount () {
    let count = 0
    for (const listeners of this.listeners.values()) count += listeners.size
    return count
  }
}

function point (lat, lng, timestamp, accuracy = 10) {
  return { lat, lng, timestamp, accuracy }
}

async function flushMicrotasks () {
  for (let index = 0; index < 6; index += 1) await Promise.resolve()
}

test('assessPositionSample accepts an eight-hour 100 km/h journey with the dynamic threshold', () => {
  const intervalMs = 15_000
  const metersPerSample = 100_000 / 3600 * intervalMs / 1000
  const latitudeStep = metersPerSample / 111_320
  let trackerState = { lastAccepted: point(20, 110, 0), suspect: null }

  for (let index = 1; index <= 8 * 60 * 60 * 1000 / intervalMs; index += 1) {
    const sample = point(20 + latitudeStep * index, 110, intervalMs * index)
    const result = assessPositionSample(trackerState, sample)
    assert.equal(result.accepted, true, `sample ${index} should be accepted`)
    assert.equal(result.suspect, null)
    trackerState = { lastAccepted: sample, suspect: result.suspect }
  }

  const highSpeedAnchor = point(30, 110, 0)
  const highSpeedSample = point(30 + (500_000 / 3600 * 15) / 111_320, 110, intervalMs)
  assert.equal(assessPositionSample({ lastAccepted: highSpeedAnchor }, highSpeedSample).accepted, true)
})

test('assessPositionSample isolates one jump and confirms two consistent samples as a new anchor', () => {
  const anchor = point(23, 113, 0, 8)
  const jump = point(31, 121, 15_000, 12)
  const first = assessPositionSample({ lastAccepted: anchor, suspect: null }, jump)

  assert.equal(first.accepted, false)
  assert.equal(first.reason, 'suspect-jump')
  assert.deepEqual(first.suspect, jump)

  const confirmed = point(31.001, 121.001, 30_000, 12)
  const second = assessPositionSample({ lastAccepted: anchor, suspect: first.suspect }, confirmed)
  assert.equal(second.accepted, true)
  assert.equal(second.reanchored, true)
  assert.equal(second.reason, 'confirmed-reanchor')
  assert.equal(second.suspect, null)

  const normal = point(23.001, 113, 30_000, 8)
  const recovered = assessPositionSample({ lastAccepted: anchor, suspect: first.suspect }, normal)
  assert.equal(recovered.accepted, true)
  assert.equal(recovered.reanchored, false)
  assert.equal(recovered.suspect, null)
})

test('equal provider timestamps can still confirm two spatially independent reanchor samples', () => {
  const anchor = point(23, 113, 1000)
  const firstJump = point(31, 121, 2000)
  const first = assessPositionSample({ lastAccepted: anchor }, firstJump)
  const nearbySecond = point(31.001, 121.001, 2000)
  const confirmed = assessPositionSample({
    lastAccepted: anchor,
    suspect: first.suspect,
  }, nearbySecond)

  assert.equal(first.accepted, false)
  assert.equal(confirmed.accepted, true)
  assert.equal(confirmed.reason, 'confirmed-reanchor')
})

test('assessPositionSample supports long-gap reanchoring and rejects invalid coordinates', () => {
  const anchor = point(23, 113, 0)
  const afterTunnel = point(24, 114, 6 * 60_000)
  const longGap = assessPositionSample({ lastAccepted: anchor }, afterTunnel)
  assert.equal(longGap.accepted, true)
  assert.equal(longGap.reason, 'long-gap-reanchor')
  assert.equal(longGap.reanchored, true)

  const invalid = assessPositionSample({ lastAccepted: anchor, suspect: afterTunnel }, point(91, 114, 7 * 60_000))
  assert.equal(invalid.accepted, false)
  assert.equal(invalid.reason, 'invalid-sample')
  assert.equal(invalid.suspect, afterTunnel)
})

test('formatContinuousLocationState returns short Chinese health labels', () => {
  assert.equal(formatContinuousLocationState({ phase: 'tracking' }), '正在持续定位')
  assert.equal(formatContinuousLocationState('permission-blocked'), '定位权限已被禁止')
  assert.equal(formatContinuousLocationState('future-phase'), '定位状态未知')
})

test('applyContinuousLocationButtonState exposes a visible-label contract', () => {
  const attributes = new Map()
  const element = {
    dataset: {},
    setAttribute (name, value) {
      attributes.set(name, value)
    },
  }

  const label = applyContinuousLocationButtonState(element, { phase: 'recovering' })
  assert.equal(label, '正在恢复定位')
  assert.equal(element.dataset.locationPhase, 'recovering')
  assert.equal(element.dataset.locationLabel, '正在恢复定位')
  assert.equal(element.title, '正在恢复定位')
  assert.equal(attributes.get('aria-label'), '正在恢复定位')
})

test('controller keeps one watcher and throttles dense callbacks to the latest position', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const consumed = []
  const controller = createContinuousLocationController({
    source,
    clock,
    intervalMs: 1000,
    staleTimeoutMs: 10_000,
    onPosition: position => consumed.push(position.sequence),
  })

  controller.start()
  assert.equal(source.watchCalls, 1)
  assert.equal(source.active.size, 1)
  assert.equal(source.records.get(1).options.signal.aborted, false)
  source.success(1, { ...point(23, 113, 0), sequence: 1 })
  await flushMicrotasks()

  clock.advance(100)
  source.success(1, { ...point(23, 113.001, 100), sequence: 2 })
  clock.advance(100)
  source.success(1, { ...point(23, 113.002, 200), sequence: 3 })
  await flushMicrotasks()
  assert.deepEqual(consumed, [1])

  clock.advance(800)
  await flushMicrotasks()
  assert.deepEqual(consumed, [1, 3])
  assert.equal(source.watchCalls, 1)
  assert.equal(source.active.size, 1)
  assert.equal(controller.getState().lastProviderTimestamp, 200)

  controller.configure({ intervalSeconds: 0.1 })
  source.success(1, { ...point(23, 113.003, 1000), sequence: 4 })
  clock.advance(100)
  await flushMicrotasks()
  assert.deepEqual(consumed, [1, 3, 4])
  assert.equal(source.watchCalls, 1)
})

test('wall-clock rollback does not postpone position consumption until the old time catches up', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const consumed = []
  const controller = createContinuousLocationController({
    source,
    clock,
    intervalMs: 1000,
    staleTimeoutMs: 10_000,
    onPosition: position => consumed.push(position.sequence),
  })

  controller.start()
  source.success(1, { ...point(23, 113, 1000), sequence: 1 })
  await flushMicrotasks()
  clock.time = -3_600_000
  source.success(1, { ...point(23, 113.001, 1001), sequence: 2 })
  await flushMicrotasks()

  assert.deepEqual(consumed, [1, 2])
  assert.equal(controller.getState().phase, 'tracking')
})

test('a synchronous stop from onStateChange prevents source activation', () => {
  const source = new FakeSource()
  let controller
  controller = createContinuousLocationController({
    source,
    onStateChange (state) {
      if (state.phase === 'starting') controller.stop()
    },
  })

  controller.start()
  assert.equal(source.watchCalls, 0)
  assert.equal(controller.getState().phase, 'idle')
  assert.equal(controller.getState().desiredActive, false)
})

test('controller serializes async consumers and keeps only the newest pending sample', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const calls = []
  let releaseFirst
  const firstPending = new Promise(resolve => { releaseFirst = resolve })
  let running = 0
  let maximumRunning = 0
  const controller = createContinuousLocationController({
    source,
    clock,
    intervalMs: 0,
    staleTimeoutMs: 10_000,
    onPosition: async (position) => {
      calls.push(position.sequence)
      running += 1
      maximumRunning = Math.max(maximumRunning, running)
      if (position.sequence === 1) await firstPending
      running -= 1
    },
  })

  controller.start()
  source.success(1, { ...point(23, 113, 1), sequence: 1 })
  await flushMicrotasks()
  source.success(1, { ...point(23, 113, 2), sequence: 2 })
  source.success(1, { ...point(23, 113, 3), sequence: 3 })
  await flushMicrotasks()
  assert.deepEqual(calls, [1])

  releaseFirst()
  await flushMicrotasks()
  assert.deepEqual(calls, [1, 3])
  assert.equal(maximumRunning, 1)
})

test('controller remains resource-bounded throughout a virtual 24-hour journey', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  let consumed = 0
  const controller = createContinuousLocationController({
    source,
    clock,
    intervalMs: 15_000,
    staleTimeoutMs: 60_000,
    onPosition: () => { consumed += 1 },
  })

  controller.start()
  const samples = 24 * 60 * 60 / 15
  for (let index = 0; index < samples; index += 1) {
    source.success(1, point(20 + index * 0.0001, 110, clock.now()))
    await flushMicrotasks()
    clock.advance(15_000)
  }

  assert.equal(consumed, samples)
  assert.equal(source.watchCalls, 1)
  assert.equal(source.active.size, 1)
  assert.equal(clock.timers.size, 1)
  assert.equal(controller.getState().restartCount, 0)
})

test('watchdog replaces a silent watcher and leaves exactly one active watcher', () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const phases = []
  const controller = createContinuousLocationController({
    source,
    clock,
    staleTimeoutMs: 1000,
    onStateChange: state => phases.push(state.phase),
  })

  controller.start()
  clock.advance(1000)

  assert.equal(source.watchCalls, 2)
  assert.deepEqual(source.clearCalls, [1])
  assert.deepEqual([...source.active], [2])
  assert.equal(controller.getState().restartCount, 1)
  assert.ok(phases.includes('stale'))
  assert.equal(controller.getState().phase, 'recovering')
})

test('automatic source rebuild accepts a fresh timestamp baseline', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const consumed = []
  const controller = createContinuousLocationController({
    source,
    clock,
    staleTimeoutMs: 1000,
    onPosition: position => consumed.push(position.timestamp),
  })

  controller.start()
  source.success(1, point(23, 113, 10_000))
  await flushMicrotasks()
  assert.deepEqual(consumed, [10_000])

  clock.advance(1000)
  source.success(2, point(23.001, 113, 100))
  await flushMicrotasks()
  assert.deepEqual(consumed, [10_000, 100])
})

test('repeatedly unhealthy watchers degrade to single-flight polling', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const pendingPolls = []
  let pollCalls = 0
  source.pollPosition = () => {
    pollCalls += 1
    return new Promise(resolve => pendingPolls.push(resolve))
  }
  const controller = createContinuousLocationController({
    source,
    clock,
    staleTimeoutMs: 1000,
    intervalMs: 100,
    watchFailuresBeforePoll: 2,
  })

  controller.start()
  clock.advance(1000)
  assert.equal(source.watchCalls, 2)
  assert.equal(pollCalls, 0)

  clock.advance(1000)
  assert.equal(controller.getState().activeSource, 'poll')
  assert.equal(source.active.size, 0)
  assert.equal(pollCalls, 1)

  clock.advance(500)
  assert.equal(pollCalls, 1)
  pendingPolls[0](point(23, 113, clock.now()))
  await flushMicrotasks()
  clock.advance(100)
  assert.equal(pollCalls, 2)
})

test('temporary errors use capped exponential recovery and permission denial waits for recovery', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const controller = createContinuousLocationController({
    source,
    clock,
    retryBaseMs: 100,
    retryMaxMs: 250,
    staleTimeoutMs: 10_000,
  })

  controller.start()
  source.error(1, 'GEOLOCATION_UNAVAILABLE')
  assert.equal(controller.getState().phase, 'recovering')
  clock.advance(99)
  assert.equal(source.watchCalls, 1)
  clock.advance(1)
  assert.equal(source.watchCalls, 2)

  source.error(2, 'GEOLOCATION_TIMEOUT')
  clock.advance(199)
  assert.equal(source.watchCalls, 2)
  clock.advance(1)
  assert.equal(source.watchCalls, 3)

  source.error(3, 2)
  clock.advance(249)
  assert.equal(source.watchCalls, 3)
  clock.advance(1)
  assert.equal(source.watchCalls, 4)

  source.error(4, 'GEOLOCATION_PERMISSION_DENIED')
  assert.equal(controller.getState().phase, 'permission-blocked')
  assert.equal(controller.getState().permissionState, 'denied')
  clock.advance(60_000)
  assert.equal(source.watchCalls, 4)

  source.setPermission('granted')
  await flushMicrotasks()
  assert.equal(source.watchCalls, 5)
  assert.equal(source.active.size, 1)
})

test('synchronous watch failure falls back to single-flight polling', async () => {
  const clock = new FakeClock()
  const pending = []
  let pollCalls = 0
  const controller = createContinuousLocationController({
    watchPosition () {
      throw new Error('broken watch')
    },
    clearWatch () {},
    pollPosition () {
      pollCalls += 1
      return new Promise((resolve, reject) => pending.push({ resolve, reject }))
    },
    clock,
    intervalMs: 100,
    staleTimeoutMs: 1000,
  })

  controller.start()
  assert.equal(controller.getState().activeSource, 'poll')
  assert.equal(pollCalls, 1)
  clock.advance(500)
  assert.equal(pollCalls, 1)

  pending[0].resolve(point(23, 113, 500))
  await flushMicrotasks()
  clock.advance(99)
  assert.equal(pollCalls, 1)
  clock.advance(1)
  assert.equal(pollCalls, 2)

  controller.stop()
  pending[1].resolve(point(23, 113.1, 600))
  await flushMicrotasks()
  clock.advance(5000)
  assert.equal(pollCalls, 2)
})

test('an unsupported polling environment settles without a retry loop', async () => {
  const clock = new FakeClock()
  let pollCalls = 0
  const controller = createContinuousLocationController({
    pollPosition () {
      pollCalls += 1
      return Promise.reject(Object.assign(new Error('unsupported'), {
        code: 'GEOLOCATION_UNSUPPORTED',
      }))
    },
    clock,
    retryBaseMs: 10,
    staleTimeoutMs: 100,
  })

  controller.start()
  await flushMicrotasks()
  assert.equal(controller.getState().phase, 'unsupported')
  assert.equal(controller.getState().lastError.code, 'unsupported')
  clock.advance(10_000)
  await flushMicrotasks()
  assert.equal(pollCalls, 1)
})

test('lifecycle recovery coalesces an event storm into one watcher rebuild', () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const lifecycle = new FakeLifecycle()
  const controller = createContinuousLocationController({
    source,
    lifecycle,
    clock,
    lifecycleDebounceMs: 50,
    staleTimeoutMs: 10_000,
  })

  controller.start()
  assert.equal(lifecycle.listenerCount(), 7)
  lifecycle.emit('pagehide')
  assert.equal(controller.getState().phase, 'suspended')
  assert.equal(source.active.size, 0)

  lifecycle.emit('visibilitychange')
  lifecycle.emit('pageshow')
  lifecycle.emit('resume')
  lifecycle.emit('focus')
  lifecycle.emit('online')
  clock.advance(49)
  assert.equal(source.watchCalls, 1)
  clock.advance(1)
  assert.equal(source.watchCalls, 2)
  assert.equal(source.active.size, 1)
  assert.equal(controller.getState().restartCount, 1)
})

test('stop and restart invalidate timers, lifecycle events, permission events, and late callbacks', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const lifecycle = new FakeLifecycle()
  const consumed = []
  const controller = createContinuousLocationController({
    source,
    lifecycle,
    clock,
    intervalMs: 0,
    staleTimeoutMs: 1000,
    onPosition: position => consumed.push(position.sequence),
  })

  controller.start()
  const firstGeneration = controller.getState().generation
  controller.stop()
  assert.equal(lifecycle.listenerCount(), 0)
  source.success(1, { ...point(23, 113, 1), sequence: 'late-after-stop' })
  lifecycle.emit('pageshow')
  source.setPermission('granted')
  clock.advance(10_000)
  await flushMicrotasks()
  assert.deepEqual(consumed, [])
  assert.equal(source.watchCalls, 1)
  assert.equal(controller.getState().phase, 'idle')

  controller.start()
  assert.ok(controller.getState().generation > firstGeneration)
  source.success(1, { ...point(23, 113, 2), sequence: 'old-generation' })
  source.success(2, { ...point(23, 113, 3), sequence: 'new-generation' })
  await flushMicrotasks()
  assert.deepEqual(consumed, ['new-generation'])
})

test('an explicit new session resets provider timestamp ordering', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const consumed = []
  const controller = createContinuousLocationController({
    source,
    clock,
    intervalMs: 0,
    staleTimeoutMs: 1000,
    onPosition: position => consumed.push(position.timestamp),
  })

  controller.start()
  source.success(1, point(23, 113, 1000))
  await flushMicrotasks()
  controller.stop()
  controller.start()
  source.success(2, point(23, 113, 10))
  await flushMicrotasks()

  assert.deepEqual(consumed, [1000, 10])
  assert.equal(controller.getState().lastProviderTimestamp, 10)
})

test('stop aborts an in-flight consumer and its completion cannot update controller health', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  let resolveConsumer
  let consumerSignal
  const controller = createContinuousLocationController({
    source,
    clock,
    intervalMs: 0,
    staleTimeoutMs: 1000,
    onPosition: (_position, context) => {
      consumerSignal = context.signal
      return new Promise(resolve => { resolveConsumer = resolve })
    },
  })

  controller.start()
  source.success(1, point(23, 113, 1))
  await flushMicrotasks()
  assert.equal(consumerSignal.aborted, false)

  controller.stop()
  assert.equal(consumerSignal.aborted, true)
  resolveConsumer(true)
  await flushMicrotasks()
  assert.equal(controller.getState().phase, 'idle')
  assert.equal(controller.getState().lastFixAt, null)
  assert.equal(clock.timers.size, 0)
})

test('out-of-order provider samples are ignored without making the watcher unhealthy', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const consumed = []
  const controller = createContinuousLocationController({
    source,
    clock,
    intervalMs: 0,
    staleTimeoutMs: 1000,
    onPosition: position => consumed.push(position.timestamp),
  })

  controller.start()
  source.success(1, point(23, 113, 100))
  await flushMicrotasks()
  clock.advance(10)
  source.success(1, point(23, 113.1, 90))
  await flushMicrotasks()

  assert.deepEqual(consumed, [100])
  assert.equal(controller.getState().lastProviderTimestamp, 100)
  assert.equal(controller.getState().lastSignalAt, 10)
  assert.equal(controller.getState().phase, 'tracking')
})

test('a future provider timestamp cannot permanently lock out later normal fixes', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const consumed = []
  const controller = createContinuousLocationController({
    source,
    clock,
    intervalMs: 0,
    staleTimeoutMs: 10_000,
    timestampNonProgressLimit: 3,
    onPosition: position => consumed.push(position.timestamp),
  })

  controller.start()
  source.success(1, point(23, 113, 9_999_999_999))
  await flushMicrotasks()

  for (const timestamp of [100, 101, 102]) {
    clock.advance(10)
    source.success(1, point(23, 113, timestamp))
    await flushMicrotasks()
  }

  assert.equal(source.watchCalls, 2)
  assert.deepEqual([...source.active], [2])
  assert.deepEqual(consumed, [9_999_999_999])
  assert.equal(controller.getState().restartCount, 1)

  source.success(2, point(23.001, 113, 103))
  await flushMicrotasks()
  assert.deepEqual(consumed, [9_999_999_999, 103])
  assert.equal(controller.getState().phase, 'tracking')
})

test('repeated cached fixes rebuild while equal timestamps with changed coordinates remain usable', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  const consumed = []
  const controller = createContinuousLocationController({
    source,
    clock,
    intervalMs: 0,
    staleTimeoutMs: 10_000,
    timestampNonProgressLimit: 3,
    onPosition: position => consumed.push(position.sequence),
  })

  controller.start()
  source.success(1, { ...point(23, 113, 100), sequence: 'initial' })
  await flushMicrotasks()
  source.success(1, { ...point(23, 113.001, 100), sequence: 'same-time-moved' })
  await flushMicrotasks()
  assert.deepEqual(consumed, ['initial', 'same-time-moved'])
  assert.equal(source.watchCalls, 1)

  for (let index = 0; index < 3; index += 1) {
    clock.advance(10)
    source.success(1, {
      ...point(23, 113.001, 100, 11 + index),
      sequence: `cached-${index}`,
    })
    await flushMicrotasks()
  }

  assert.equal(source.watchCalls, 2)
  assert.deepEqual([...source.active], [2])
  assert.equal(controller.getState().restartCount, 1)
  assert.equal(controller.getState().lastSignalAt, 30)
})

test('a hung map consumer times out, aborts its generation, and later fixes recover', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  let calls = 0
  const controller = createContinuousLocationController({
    source,
    clock,
    intervalMs: 0,
    staleTimeoutMs: 10_000,
    consumerTimeoutMs: 50,
    onPosition () {
      calls += 1
      if (calls === 1) return new Promise(() => {})
      return true
    },
  })

  controller.start()
  source.success(1, point(23, 113, 1))
  await flushMicrotasks()
  clock.advance(50)
  await flushMicrotasks()

  assert.equal(source.watchCalls, 2)
  assert.deepEqual([...source.active], [2])
  assert.equal(controller.getState().restartCount, 1)

  source.success(2, point(23.001, 113, 2))
  await flushMicrotasks()
  assert.equal(calls, 2)
  assert.equal(controller.getState().phase, 'tracking')
  assert.equal(controller.getState().lastFixAt, 50)

  controller.stop()
  assert.equal(clock.timers.size, 0)
})

test('consumer false/exception is isolated and a later sample still succeeds', async () => {
  const clock = new FakeClock()
  const source = new FakeSource()
  let call = 0
  const controller = createContinuousLocationController({
    source,
    clock,
    intervalMs: 0,
    staleTimeoutMs: 1000,
    onPosition () {
      call += 1
      if (call === 1) return false
      if (call === 2) throw new Error('render failed')
      return true
    },
  })

  controller.start()
  source.success(1, point(23, 113, 1))
  await flushMicrotasks()
  assert.equal(controller.getState().lastError.code, 'consumer-error')
  assert.equal(source.active.size, 1)

  source.success(1, point(23, 113.1, 2))
  await flushMicrotasks()
  assert.equal(controller.getState().lastError.code, 'consumer-error')
  assert.equal(source.watchCalls, 1)

  clock.advance(1)
  source.success(1, point(23, 113.2, 3))
  await flushMicrotasks()
  assert.equal(controller.getState().lastError, null)
  assert.equal(controller.getState().lastFixAt, 1)
  assert.equal(source.active.size, 1)
})
