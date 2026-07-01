import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getBestPosition,
  positionToGcj02,
  positionToLeafletLatLng,
} from '../src/map/geolocation.js'
import { wgs84ToGcj02 } from '../src/map/coord-transform.js'

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
  })
})

test('getBestPosition falls back to browser geolocation when AMap fails', async () => {
  const originalNavigator = globalThis.navigator
  const originalWarn = console.warn
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition (resolve) {
          resolve({
            coords: {
              latitude: 23.1,
              longitude: 113.2,
              accuracy: 18,
            },
          })
        },
      },
    },
  })

  const geolocation = {
    getCurrentPosition (callback) {
      callback('error', { message: 'amap failed' })
    },
  }

  try {
    console.warn = () => {}
    const position = await getBestPosition(geolocation)
    assert.deepEqual(position, {
      lat: 23.1,
      lng: 113.2,
      accuracy: 18,
      source: 'browser',
      coordType: 'wgs84',
      locationType: 'html5',
    })
  } finally {
    console.warn = originalWarn
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    })
  }
})
