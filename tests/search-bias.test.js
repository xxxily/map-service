import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createAmapSearchBias,
  normalizeSearchBiasCenter,
  resolveSearchBiasCity,
} from '../src/map/search-bias.js'

test('搜索偏置中心只接受合法经纬度', () => {
  assert.deepEqual(normalizeSearchBiasCenter({ lng: '113.2644', lat: '23.1291' }), {
    lng: 113.2644,
    lat: 23.1291,
  })
  assert.equal(normalizeSearchBiasCenter({ lng: 181, lat: 23 }), null)
  assert.equal(normalizeSearchBiasCenter(null), null)
})

test('搜索偏置优先使用反向地理编码的城市名称', () => {
  assert.equal(resolveSearchBiasCity({
    regeocode: {
      addressComponent: {
        province: '广东省',
        city: '广州市',
        citycode: '020',
        adcode: '440106',
      },
    },
  }), '广州市')
  assert.equal(resolveSearchBiasCity({
    regeocode: {
      addressComponent: {
        province: '北京市',
        city: [],
        citycode: '010',
      },
    },
  }), '北京市')
})

test('高德搜索根据当前视图城市更新联想优先级且不重复反查', async () => {
  const appliedCities = []
  const requests = []
  const target = {
    setCity: city => appliedCities.push(city),
  }
  const AMap = {
    Geocoder: class {
      getAddress (coordinates, callback) {
        requests.push(coordinates)
        callback('complete', {
          regeocode: {
            addressComponent: { city: '广州市' },
          },
        })
      }
    },
  }
  let center = { lng: 113.2644, lat: 23.1291 }
  const bias = createAmapSearchBias({
    AMap,
    getCenter: () => center,
    targets: [target],
  })

  assert.deepEqual(appliedCities, ['全国'])
  assert.equal(await bias.refresh(), '广州市')
  assert.deepEqual(requests, [[113.2644, 23.1291]])
  assert.equal(appliedCities.at(-1), '广州市')

  center = { lng: 113.266, lat: 23.131 }
  await bias.refresh()
  assert.equal(requests.length, 1)
  bias.destroy()
})
