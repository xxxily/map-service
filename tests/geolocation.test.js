import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createContinuousGeolocationSource,
  getAmapPosition,
  getBestPosition,
  getBrowserPosition,
  normalizeBrowserPosition,
  positionToGcj02,
  positionToLeafletLatLng,
} from '../src/map/geolocation.js'
import { wgs84ToGcj02 } from '../src/map/coord-transform.js'

function createBrowserPosition ({
  lat = 23.1,
  lng = 113.2,
  accuracy = 18,
  timestamp = 1000,
} = {}) {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
    },
    timestamp,
  }
}

function createBrowserNavigator (getCurrentPosition) {
  return {
    geolocation: {
      getCurrentPosition,
    },
  }
}

async function withoutWarnings (callback) {
  const originalWarn = console.warn
  try {
    console.warn = () => {}
    return await callback()
  } finally {
    console.warn = originalWarn
  }
}

test('positionToGcj02 keeps AMap GCJ-02 coordinates unchanged', () => {
  const position = {
    lat: 23.129112,
    lng: 113.264385,
    coordType: 'gcj02',
    source: 'amap',
  }

  assert.deepEqual(positionToGcj02(position), {
    lat: position.lat,
    lng: position.lng,
    accuracy: undefined,
    source: 'amap',
    locationType: undefined,
  })
})

test('positionToGcj02 converts browser WGS84 coordinates once', () => {
  const position = {
    lat: 23.129112,
    lng: 113.264385,
    coordType: 'wgs84',
    source: 'browser',
  }
  const [expectedLng, expectedLat] = wgs84ToGcj02([position.lng, position.lat])

  assert.deepEqual(positionToGcj02(position), {
    lat: expectedLat,
    lng: expectedLng,
    accuracy: undefined,
    source: 'browser',
    locationType: undefined,
  })
})

test('positionToLeafletLatLng normalizes western longitudes for wrapped map bounds', () => {
  const position = {
    lat: 37.7749,
    lng: -122.4194,
    coordType: 'gcj02',
  }

  assert.deepEqual(positionToLeafletLatLng(position), [37.7749, 237.5806])
})

test('normalizeBrowserPosition retains coordinates, metadata, and native timestamp', () => {
  assert.deepEqual(normalizeBrowserPosition(createBrowserPosition({
    lat: 31.2,
    lng: 121.5,
    accuracy: 6.5,
    timestamp: 123456,
  })), {
    lat: 31.2,
    lng: 121.5,
    accuracy: 6.5,
    source: 'browser',
    coordType: 'wgs84',
    locationType: 'html5',
    timestamp: 123456,
  })
})

test('normalizeBrowserPosition rejects missing and out-of-range coordinates', () => {
  assert.equal(normalizeBrowserPosition({ coords: { latitude: null, longitude: 0 } }), null)
  assert.equal(normalizeBrowserPosition(createBrowserPosition({ lat: 91 })), null)
  assert.equal(normalizeBrowserPosition(createBrowserPosition({ lng: -181 })), null)
})

test('getBestPosition uses AMap first when it succeeds', async () => {
  const geolocation = {
    getCurrentPosition (callback) {
      callback('complete', {
        position: {
          getLat: () => 23.1,
          getLng: () => 113.2,
        },
        accuracy: 12,
        location_type: 'html5',
        timestamp: 3210,
      })
    },
  }

  const position = await getBestPosition(geolocation)

  assert.deepEqual(position, {
    lat: 23.1,
    lng: 113.2,
    accuracy: 12,
    source: 'amap',
    coordType: 'gcj02',
    locationType: 'html5',
    timestamp: 3210,
  })
})

test('getBestPosition falls back to browser geolocation when AMap fails', async () => {
  const navigatorLike = createBrowserNavigator((resolve) => {
    resolve(createBrowserPosition({ timestamp: 4321 }))
  })
  const geolocation = {
    getCurrentPosition (callback) {
      callback('error', { message: 'amap failed', code: 'AMAP_FAILED' })
    },
  }

  const position = await withoutWarnings(() => getBestPosition(geolocation, {
    navigator: navigatorLike,
  }))

  assert.deepEqual(position, {
    lat: 23.1,
    lng: 113.2,
    accuracy: 18,
    source: 'browser',
    coordType: 'wgs84',
    locationType: 'html5',
    timestamp: 4321,
  })
})

test('getBestPosition treats an AMap complete response with invalid coordinates as failure', async () => {
  let browserCalls = 0
  const navigatorLike = createBrowserNavigator((resolve) => {
    browserCalls += 1
    resolve(createBrowserPosition())
  })
  const geolocation = {
    getCurrentPosition (callback) {
      callback('complete', {
        position: { lat: 95, lng: 113.2 },
        accuracy: 10,
      })
    },
  }

  const position = await withoutWarnings(() => getBestPosition(geolocation, {
    navigator: navigatorLike,
  }))

  assert.equal(position.source, 'browser')
  assert.equal(browserCalls, 1)
})

test('getBestPosition falls back when an AMap callback remains pending', async () => {
  let browserCalls = 0
  const navigatorLike = createBrowserNavigator((resolve) => {
    browserCalls += 1
    resolve(createBrowserPosition())
  })
  const geolocation = {
    getCurrentPosition () {},
  }

  const position = await withoutWarnings(() => getBestPosition(geolocation, {
    navigator: navigatorLike,
    amapDeadlineMs: 15,
    browserDeadlineMs: 50,
  }))

  assert.equal(position.source, 'browser')
  assert.equal(browserCalls, 1)
})

test('getBrowserPosition rejects when the browser callback remains pending', async () => {
  const navigatorLike = createBrowserNavigator(() => {})

  await assert.rejects(
    getBrowserPosition({ navigator: navigatorLike, deadlineMs: 15 }),
    error => error.code === 'GEOLOCATION_TIMEOUT' && error.source === 'browser',
  )
})

test('source errors retain their original error code', async () => {
  await assert.rejects(
    getAmapPosition({
      getCurrentPosition (callback) {
        callback('error', { message: '定位被拒绝', code: 7 })
      },
    }),
    error => error.code === 7 && error.message === '定位被拒绝',
  )

  const browserError = { code: 2, message: 'position unavailable' }
  const navigatorLike = createBrowserNavigator((resolve, reject) => reject(browserError))
  await assert.rejects(
    getBrowserPosition({ navigator: navigatorLike }),
    error => error === browserError && error.code === 2,
  )

  await assert.rejects(
    getAmapPosition({
      getCurrentPosition (callback) {
        callback('error', { info: 'PERMISSION_DENIED' })
      },
    }),
    error => error.code === 'PERMISSION_DENIED',
  )
})

test('AMap Error objects are copied into a sanitized public error', async () => {
  const rawError = Object.assign(new Error('高德内部失败'), {
    code: 'AMAP_INTERNAL',
    position: { lat: 23.1, lng: 113.2 },
    coords: { latitude: 23.1, longitude: 113.2 },
    cause: { token: 'secret-token' },
  })

  await assert.rejects(
    getAmapPosition({
      getCurrentPosition (callback) {
        callback('error', rawError)
      },
    }),
    error => error !== rawError &&
      error.message === '高德内部失败' &&
      error.code === 'AMAP_INTERNAL' &&
      error.source === 'amap' &&
      !('position' in error) &&
      !('coords' in error) &&
      !('cause' in error),
  )
})

test('browser timestamp falls back to the injected clock and native options remain high accuracy', async () => {
  let receivedOptions = null
  const navigatorLike = createBrowserNavigator((resolve, reject, options) => {
    receivedOptions = options
    const position = createBrowserPosition()
    delete position.timestamp
    resolve(position)
  })

  const position = await getBrowserPosition({
    navigator: navigatorLike,
    now: () => 9876,
  })

  assert.equal(position.timestamp, 9876)
  assert.deepEqual(receivedOptions, {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0,
  })
})

test('AMap failures enter a finite per-instance cooldown', async () => {
  let now = 1000
  let amapCalls = 0
  let browserCalls = 0
  const geolocation = {
    getCurrentPosition (callback) {
      amapCalls += 1
      callback('error', { message: 'temporary error', code: 'TEMPORARY' })
    },
  }
  const navigatorLike = createBrowserNavigator((resolve) => {
    browserCalls += 1
    resolve(createBrowserPosition({ timestamp: now }))
  })
  const options = {
    navigator: navigatorLike,
    now: () => now,
    amapCooldownMs: 100,
  }

  await withoutWarnings(async () => {
    await getBestPosition(geolocation, options)
    await getBestPosition(geolocation, options)
    now = 1100
    await getBestPosition(geolocation, options)
  })

  assert.equal(amapCalls, 2)
  assert.equal(browserCalls, 3)
})

test('an aborted request rejects promptly and ignores a late browser result', async () => {
  let browserSuccess = null
  let coordinateReads = 0
  const navigatorLike = createBrowserNavigator((resolve) => {
    browserSuccess = resolve
  })
  const controller = new AbortController()
  const promise = getBrowserPosition({
    navigator: navigatorLike,
    signal: controller.signal,
    deadlineMs: 100,
  })

  controller.abort()
  await assert.rejects(promise, error => error.name === 'AbortError')

  browserSuccess({
    coords: {
      get latitude () {
        coordinateReads += 1
        return 23.1
      },
      longitude: 113.2,
      accuracy: 8,
    },
    timestamp: 1234,
  })
  await Promise.resolve()
  assert.equal(coordinateReads, 0)
})

test('getBestPosition does not start browser fallback after aborting a pending AMap request', async () => {
  let browserCalls = 0
  const navigatorLike = createBrowserNavigator(() => {
    browserCalls += 1
  })
  const controller = new AbortController()
  const promise = getBestPosition({ getCurrentPosition () {} }, {
    navigator: navigatorLike,
    signal: controller.signal,
    deadlineMs: 100,
  })

  controller.abort()
  await assert.rejects(promise, error => error.name === 'AbortError')
  assert.equal(browserCalls, 0)
})

test('continuous source normalizes watch updates, forwards errors, and clears the native watch', () => {
  let onNativePosition = null
  let onNativeError = null
  let watchOptions = null
  const cleared = []
  const nativeError = { code: 2, message: 'unavailable' }
  const navigatorLike = {
    geolocation: {
      watchPosition (onPosition, onError, options) {
        onNativePosition = onPosition
        onNativeError = onError
        watchOptions = options
        return 77
      },
      clearWatch (watchId) {
        cleared.push(watchId)
      },
    },
  }
  const source = createContinuousGeolocationSource(null, { navigator: navigatorLike })
  const positions = []
  const errors = []
  const watchId = source.watchPosition(
    position => positions.push(position),
    error => errors.push(error),
  )

  onNativePosition(createBrowserPosition({ timestamp: 5555 }))
  onNativeError(nativeError)

  assert.deepEqual(positions, [{
    lat: 23.1,
    lng: 113.2,
    accuracy: 18,
    source: 'browser',
    coordType: 'wgs84',
    locationType: 'html5',
    timestamp: 5555,
  }])
  assert.deepEqual(errors, [nativeError])
  assert.deepEqual(watchOptions, {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0,
  })

  source.clearWatch(watchId)
  onNativePosition(createBrowserPosition({ timestamp: 6666 }))
  assert.deepEqual(cleared, [77])
  assert.equal(positions.length, 1)
})

test('continuous source rejects invalid watch updates without stopping later valid updates', () => {
  let onNativePosition = null
  const navigatorLike = {
    geolocation: {
      watchPosition (onPosition) {
        onNativePosition = onPosition
        return 1
      },
      clearWatch () {},
    },
  }
  const source = createContinuousGeolocationSource(null, { navigator: navigatorLike })
  const positions = []
  const errors = []
  source.watchPosition(
    position => positions.push(position),
    error => errors.push(error),
  )

  onNativePosition(createBrowserPosition({ lat: 100 }))
  onNativePosition(createBrowserPosition())

  assert.equal(errors[0].code, 'POSITION_INVALID')
  assert.equal(positions.length, 1)
})

test('continuous source abort clears a watch and ignores late native callbacks', () => {
  let onNativePosition = null
  const cleared = []
  const navigatorLike = {
    geolocation: {
      watchPosition (onPosition) {
        onNativePosition = onPosition
        return 9
      },
      clearWatch (watchId) {
        cleared.push(watchId)
      },
    },
  }
  const source = createContinuousGeolocationSource(null, { navigator: navigatorLike })
  const positions = []
  const controller = new AbortController()
  source.watchPosition(position => positions.push(position), null, {
    signal: controller.signal,
  })

  controller.abort()
  onNativePosition(createBrowserPosition())

  assert.deepEqual(cleared, [9])
  assert.deepEqual(positions, [])
})

test('continuous source reports an unavailable watch only through its null return', async () => {
  const source = createContinuousGeolocationSource(null, {
    navigator: { geolocation: {} },
  })
  const errors = []

  assert.equal(source.watchPosition(() => {}, error => errors.push(error)), null)
  await Promise.resolve()
  assert.deepEqual(errors, [])
})

test('continuous source rethrows synchronous native watch failures without a second callback', async () => {
  const nativeError = Object.assign(new Error('watch failed'), { code: 2 })
  const source = createContinuousGeolocationSource(null, {
    navigator: {
      geolocation: {
        watchPosition () {
          throw nativeError
        },
        clearWatch () {},
      },
    },
  })
  const errors = []

  assert.throws(
    () => source.watchPosition(() => {}, error => errors.push(error)),
    error => error === nativeError,
  )
  await Promise.resolve()
  assert.deepEqual(errors, [])
})

test('continuous source can poll successfully when a watch remains silent', async () => {
  const navigatorLike = {
    geolocation: {
      watchPosition () {
        return 3
      },
      clearWatch () {},
      getCurrentPosition (resolve) {
        resolve(createBrowserPosition({ timestamp: 7654 }))
      },
    },
  }
  const source = createContinuousGeolocationSource(null, { navigator: navigatorLike })
  const watchId = source.watchPosition(() => {})
  const position = await source.pollPosition({ deadlineMs: 50 })

  assert.equal(watchId, 1)
  assert.equal(position.source, 'browser')
  assert.equal(position.timestamp, 7654)
})

test('continuous source permission subscription emits current state, changes, and unsubscribes', async () => {
  const listeners = new Set()
  const permissionStatus = {
    state: 'prompt',
    addEventListener (event, listener) {
      assert.equal(event, 'change')
      listeners.add(listener)
    },
    removeEventListener (event, listener) {
      assert.equal(event, 'change')
      listeners.delete(listener)
    },
  }
  const navigatorLike = {
    permissions: {
      async query (descriptor) {
        assert.deepEqual(descriptor, { name: 'geolocation' })
        return permissionStatus
      },
    },
  }
  const source = createContinuousGeolocationSource(null, { navigator: navigatorLike })
  const states = []
  assert.equal(source.permissions.subscribe, source.subscribePermission)
  const unsubscribe = source.subscribePermission(state => states.push(state))

  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(states, ['prompt'])

  permissionStatus.state = 'granted'
  for (const listener of listeners) listener()
  assert.deepEqual(states, ['prompt', 'granted'])

  unsubscribe()
  permissionStatus.state = 'denied'
  for (const listener of listeners) listener()
  assert.deepEqual(states, ['prompt', 'granted'])
  assert.equal(listeners.size, 0)
})

test('continuous source reports unknown when Permissions API is unavailable', async () => {
  const source = createContinuousGeolocationSource(null, { navigator: {} })
  const states = []
  source.subscribePermission(state => states.push(state))

  await Promise.resolve()
  assert.deepEqual(states, ['unknown'])
})
