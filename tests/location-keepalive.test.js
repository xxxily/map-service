import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLocationKeepAlive } from '../src/map/location-keepalive.js'

function deferred () {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createSentinel () {
  const releaseListeners = new Set()
  return {
    released: false,
    releaseCalls: 0,
    addEventListener (type, listener) {
      if (type === 'release') releaseListeners.add(listener)
    },
    removeEventListener (type, listener) {
      if (type === 'release') releaseListeners.delete(listener)
    },
    async release () {
      this.releaseCalls += 1
      this.dispatchRelease()
    },
    dispatchRelease () {
      if (this.released) return
      this.released = true
      for (const listener of [...releaseListeners]) listener()
    },
  }
}

function createMediaElement (type) {
  return {
    type,
    src: '',
    loop: false,
    muted: false,
    paused: true,
    style: {},
    playCalls: 0,
    pauseCalls: 0,
    attributes: new Map(),
    setAttribute (name, value) {
      this.attributes.set(name, value)
    },
    async play () {
      this.playCalls += 1
      this.paused = false
    },
    pause () {
      this.pauseCalls += 1
      this.paused = true
    },
  }
}

function createBrowserMocks () {
  const listeners = new Map()
  const videos = []
  const audios = []
  const appended = []
  const document = {
    visibilityState: 'visible',
    body: {
      appendChild (element) {
        appended.push(element)
      },
    },
    createElement (type) {
      const element = createMediaElement(type)
      if (type === 'video') videos.push(element)
      return element
    },
    addEventListener (type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(listener)
    },
    removeEventListener (type, listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatch (type) {
      for (const listener of [...(listeners.get(type) || [])]) listener()
    },
  }

  class MockAudio {
    constructor () {
      const audio = createMediaElement('audio')
      audios.push(audio)
      return audio
    }
  }

  return { document, MockAudio, videos, audios, appended, listeners }
}

test('Wake Lock 的并发 start/refresh 请求保持幂等', async () => {
  const mocks = createBrowserMocks()
  const pendingRequest = deferred()
  let requestCalls = 0
  const keepAlive = createLocationKeepAlive({
    document: mocks.document,
    Audio: mocks.MockAudio,
    navigator: {
      wakeLock: {
        request () {
          requestCalls += 1
          return pendingRequest.promise
        },
      },
    },
    logger: { warn () {} },
  })

  const starts = [
    keepAlive.start(),
    keepAlive.start(),
    keepAlive.refresh(),
  ]
  await Promise.resolve()
  assert.equal(requestCalls, 1)

  pendingRequest.resolve(createSentinel())
  await Promise.all(starts)
  assert.equal(requestCalls, 1)
  assert.equal(mocks.audios.length, 1)

  keepAlive.stop()
})

test('stop 会使 pending 请求失效并立即释放迟到的 sentinel', async () => {
  const mocks = createBrowserMocks()
  const pendingRequest = deferred()
  const sentinel = createSentinel()
  const keepAlive = createLocationKeepAlive({
    document: mocks.document,
    Audio: mocks.MockAudio,
    navigator: {
      wakeLock: {
        request: () => pendingRequest.promise,
      },
    },
    logger: { warn () {} },
  })

  const startPromise = keepAlive.start()
  await Promise.resolve()
  keepAlive.stop()
  pendingRequest.resolve(sentinel)
  await startPromise

  assert.equal(sentinel.releaseCalls, 1)
  assert.equal(sentinel.released, true)
})

test('pending 期间 stop 后立即重启，新代次不被旧请求阻塞', async () => {
  const mocks = createBrowserMocks()
  const firstRequest = deferred()
  const secondRequest = deferred()
  const requests = [firstRequest, secondRequest]
  const oldSentinel = createSentinel()
  const newSentinel = createSentinel()
  let requestCalls = 0
  const keepAlive = createLocationKeepAlive({
    document: mocks.document,
    Audio: mocks.MockAudio,
    navigator: {
      wakeLock: {
        request () {
          const request = requests[requestCalls]
          requestCalls += 1
          return request.promise
        },
      },
    },
    logger: { warn () {} },
  })

  const oldStart = keepAlive.start()
  await Promise.resolve()
  keepAlive.stop()
  const newStart = keepAlive.start()
  await Promise.resolve()
  assert.equal(requestCalls, 2)

  firstRequest.resolve(oldSentinel)
  secondRequest.resolve(newSentinel)
  await Promise.all([oldStart, newStart])
  assert.equal(oldSentinel.releaseCalls, 1)
  assert.equal(newSentinel.releaseCalls, 0)

  keepAlive.stop()
  assert.equal(newSentinel.releaseCalls, 1)
})

test('系统释放 sentinel 后，运行中且页面可见时安全重新申请', async () => {
  const mocks = createBrowserMocks()
  const firstSentinel = createSentinel()
  const secondSentinel = createSentinel()
  const sentinels = [firstSentinel, secondSentinel]
  let requestCalls = 0
  const keepAlive = createLocationKeepAlive({
    document: mocks.document,
    Audio: mocks.MockAudio,
    navigator: {
      wakeLock: {
        async request () {
          const sentinel = sentinels[requestCalls]
          requestCalls += 1
          return sentinel
        },
      },
    },
    logger: { warn () {} },
  })

  await keepAlive.start()
  assert.equal(requestCalls, 1)

  firstSentinel.dispatchRelease()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requestCalls, 2)

  keepAlive.stop()
  assert.equal(secondSentinel.releaseCalls, 1)
})

test('隐藏期间释放不会重取，重新可见时通过 visibilitychange 刷新', async () => {
  const mocks = createBrowserMocks()
  const firstSentinel = createSentinel()
  const secondSentinel = createSentinel()
  const sentinels = [firstSentinel, secondSentinel]
  let requestCalls = 0
  const keepAlive = createLocationKeepAlive({
    document: mocks.document,
    Audio: mocks.MockAudio,
    navigator: {
      wakeLock: {
        async request () {
          const sentinel = sentinels[requestCalls]
          requestCalls += 1
          return sentinel
        },
      },
    },
    logger: { warn () {} },
  })

  await keepAlive.start()
  mocks.document.visibilityState = 'hidden'
  firstSentinel.dispatchRelease()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requestCalls, 1)

  mocks.document.visibilityState = 'visible'
  mocks.document.dispatch('visibilitychange')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(requestCalls, 2)

  keepAlive.stop()
})

test('音频和视频降级资源跨重启只创建一次，停止时全部暂停', async () => {
  const mocks = createBrowserMocks()
  const keepAlive = createLocationKeepAlive({
    document: mocks.document,
    Audio: mocks.MockAudio,
    navigator: {},
    logger: { warn () {} },
  })

  await keepAlive.start()
  await keepAlive.refresh()
  assert.equal(mocks.audios.length, 1)
  assert.equal(mocks.videos.length, 1)
  assert.equal(mocks.appended.length, 1)
  assert.equal(mocks.audios[0].paused, false)
  assert.equal(mocks.videos[0].paused, false)

  keepAlive.stop()
  assert.equal(mocks.audios[0].paused, true)
  assert.equal(mocks.videos[0].paused, true)
  assert.equal(mocks.listeners.get('visibilitychange')?.size || 0, 0)

  await keepAlive.start()
  keepAlive.stop()
  assert.equal(mocks.audios.length, 1)
  assert.equal(mocks.videos.length, 1)
  assert.equal(mocks.appended.length, 1)
})

test('缺少浏览器 API 时 start、refresh 和 stop 都安全降级', async () => {
  const keepAlive = createLocationKeepAlive({
    document: null,
    navigator: null,
    Audio: null,
    logger: { warn () {} },
  })

  assert.equal(await keepAlive.start(), true)
  assert.equal(await keepAlive.refresh(), true)
  assert.doesNotThrow(() => keepAlive.stop())
})

test('Wake Lock 不可用时使用可缓存的同源 MP4 降级资源', async () => {
  const mocks = createBrowserMocks()
  const keepAlive = createLocationKeepAlive({
    document: mocks.document,
    Audio: mocks.MockAudio,
    navigator: {},
    logger: { warn () {} },
  })

  await keepAlive.start()

  assert.equal(mocks.videos.length, 1)
  assert.equal(mocks.videos[0].src, '/location-keepalive.mp4')
  assert.equal(mocks.videos[0].referrerPolicy, 'no-referrer')
  assert.equal(mocks.videos[0].attributes.get('referrerpolicy'), 'no-referrer')
  keepAlive.stop()
})
