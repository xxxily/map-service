import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  MAX_SEARCH_HISTORY_ITEMS,
  normalizeSearchHistoryItem,
  normalizeSearchLocation,
  readSearchHistory,
  saveSearchHistory,
} from '../src/map/search-history.js'

function createStorage () {
  const data = new Map()
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
  }
}

test('搜索位置会将高德 LngLat 实例规范化为可持久化数字坐标', () => {
  const location = normalizeSearchLocation({
    getLng: () => 113.2644,
    getLat: () => 23.1291,
  })
  assert.deepEqual(location, { lng: 113.2644, lat: 23.1291 })
  assert.deepEqual(normalizeSearchLocation({ lng: '114.1', lat: '22.5' }), { lng: 114.1, lat: 22.5 })
  assert.equal(normalizeSearchLocation({ lng: 500, lat: 22.5 }), null)
})

test('搜索历史只保存可定位条目并以普通 JSON 坐标恢复', () => {
  const storage = createStorage()
  const saved = saveSearchHistory('search', {
    name: '广州塔',
    location: {
      getLng: () => 113.3308,
      getLat: () => 23.1085,
    },
  }, storage)

  assert.deepEqual(saved, {
    name: '广州塔',
    location: { lng: 113.3308, lat: 23.1085 },
  })
  assert.deepEqual(readSearchHistory('search', storage), [saved])
  assert.equal(normalizeSearchHistoryItem({ name: '只有文本' }), null)
})

test('搜索历史去重置顶并限制数量', () => {
  const storage = createStorage()
  for (let index = 0; index < MAX_SEARCH_HISTORY_ITEMS + 3; index += 1) {
    saveSearchHistory('search', {
      name: `位置 ${index}`,
      location: { lng: 110 + index / 100, lat: 20 + index / 100 },
    }, storage)
  }
  saveSearchHistory('search', {
    name: '位置 8',
    location: { lng: 110.08, lat: 20.08 },
  }, storage)

  const history = readSearchHistory('search', storage)
  assert.equal(history.length, MAX_SEARCH_HISTORY_ITEMS)
  assert.equal(history[0].name, '位置 8')
  assert.equal(history.filter(item => item.name === '位置 8').length, 1)
})

test('旧历史中的文本占位条目会被过滤，兼容 longitude/latitude 坐标', () => {
  const storage = createStorage()
  storage.setItem('search', JSON.stringify([
    { name: '不可定位' },
    { name: '有效位置', location: { longitude: 112.1, latitude: 21.4 } },
  ]))

  assert.deepEqual(readSearchHistory('search', storage), [
    { name: '有效位置', location: { lng: 112.1, lat: 21.4 } },
  ])
})
