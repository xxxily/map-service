import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildRouteDefaultName,
  buildRouteDescription,
  formatRouteDistance,
  formatRouteDuration,
  getBestRouteLocationName,
  getRoutePath,
  normalizeRoutePath,
  swapRouteEndpoints,
} from '../src/map/route-planner-utils.js'

test('route path normalization accepts AMap points and removes adjacent duplicates', () => {
  assert.deepEqual(normalizeRoutePath([
    { lat: 23.1, lng: 113.2 },
    { lat: 23.1, lng: 113.2 },
    [23.2, 113.3],
    { lat: 'bad', lng: 113.4 },
  ]), [
    { lat: 23.1, lng: 113.2 },
    { lat: 23.2, lng: 113.3 },
  ])
  assert.deepEqual(normalizeRoutePath([{ getLat: () => 23.3, getLng: () => 113.4 }]), [
    { lat: 23.3, lng: 113.4 },
  ])
  assert.deepEqual(normalizeRoutePath([{ lat: 91, lng: 113 }, { lat: 23, lng: 181 }]), [])
})

test('route path prefers the direct path and falls back to driving steps', () => {
  assert.deepEqual(getRoutePath({ path: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }] }), [
    { lat: 1, lng: 2 },
    { lat: 3, lng: 4 },
  ])
  assert.deepEqual(getRoutePath({ steps: [{ path: [{ lat: 5, lng: 6 }] }, { path: [{ lat: 7, lng: 8 }] }] }), [
    { lat: 5, lng: 6 },
    { lat: 7, lng: 8 },
  ])
  assert.deepEqual(getRoutePath({ path: [{ lat: 'bad', lng: 2 }], steps: [{ path: [{ lat: 9, lng: 10 }, { lat: 11, lng: 12 }] }] }), [
    { lat: 9, lng: 10 },
    { lat: 11, lng: 12 },
  ])
})

test('route naming and summary use concise human-readable metrics', () => {
  assert.equal(buildRouteDefaultName('广州塔', '白云山'), '广州塔-白云山')
  assert.equal(formatRouteDuration(3660), '1 小时 1 分钟')
  assert.equal(formatRouteDistance(12500), '12.5 公里')
  assert.match(buildRouteDescription({ time: 900, distance: 3200 }, '起点', '终点', 1), /路线方案：方案 2/)
})

test('route endpoint naming prefers the nearest AMap POI and falls back to address', () => {
  assert.equal(getBestRouteLocationName({
    regeocode: {
      pois: [{ name: '' }, { name: '广州塔' }],
      aois: [{ name: '珠江新城' }],
      formattedAddress: '广东省广州市海珠区阅江西路',
    },
  }, '起点'), '广州塔')
  assert.equal(getBestRouteLocationName({
    regeocode: {
      addressComponent: { district: '越秀区', street: '中山路', streetNumber: '1号' },
    },
  }, '起点'), '越秀区中山路1号')
  assert.equal(getBestRouteLocationName(null, '地图选定位置'), '地图选定位置')
})

test('route endpoint swap preserves the two endpoint objects', () => {
  const start = { name: 'A', location: { lat: 1, lng: 2 } }
  const end = { name: 'B', location: { lat: 3, lng: 4 } }
  const swapped = swapRouteEndpoints(start, end)
  assert.equal(swapped.start, end)
  assert.equal(swapped.end, start)
})
