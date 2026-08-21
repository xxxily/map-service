import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isMapViewInsideBounds, parseMapUrlState } from '../src/map/url-state.js'

test('分享 URL 状态保留小数缩放级别并标记显式视图', () => {
  const state = parseMapUrlState('?coords=22.603671%2C111.214256%2C14.5%2C12&layer=%E8%B0%B7%E6%AD%8C%E9%AB%98%E5%BE%B7%2F%E5%8D%AB%E6%98%9F')
  assert.deepEqual(state.coords, {
    center: [22.603671, 111.214256],
    zoom: 14.5,
    bearing: 12,
  })
  assert.equal(state.layerName, '谷歌高德/卫星')
  assert.equal(state.hasUrlCoords, true)
  assert.equal(state.hasUrlLayer, true)
  assert.equal(state.hasExplicitViewState, true)
})

test('非法或越界坐标状态安全回退且不阻止 KML 自动适配', () => {
  const invalid = parseMapUrlState('?coords=91%2C111%2C14%2C0&layer=amap-road')
  assert.equal(invalid.coords, null)
  assert.equal(invalid.hasUrlCoords, false)
  assert.equal(invalid.hasUrlLayer, true)
  assert.equal(invalid.hasExplicitViewState, false)

  const malformed = parseMapUrlState('?coords=22%2C111%2C25%2C0')
  assert.equal(malformed.coords, null)
  assert.equal(malformed.hasExplicitViewState, false)

  const invalidBearing = parseMapUrlState('?coords=22%2C111%2C14%2C999')
  assert.equal(invalidBearing.coords, null)
  assert.equal(invalidBearing.hasExplicitViewState, false)
})

test('没有 URL 状态时不标记显式视图', () => {
  assert.deepEqual(parseMapUrlState(''), {
    coords: null,
    layerName: '',
    hasUrlCoords: false,
    hasUrlLayer: false,
    hasExplicitViewState: false,
  })
})

test('空间受限分享只接受范围内且不低于最低层级的 URL 视图', () => {
  const bounds = [[22, 179], [23, 181]]
  assert.equal(isMapViewInsideBounds({ center: [22.5, -179.5], zoom: 12 }, bounds, 10), true)
  assert.equal(isMapViewInsideBounds({ center: [22.5, -179.5], zoom: 9 }, bounds, 10), false)
  assert.equal(isMapViewInsideBounds({ center: [24, -179.5], zoom: 12 }, bounds, 10), false)
  assert.equal(isMapViewInsideBounds({ center: [22.5, 120], zoom: 12 }, bounds, 10), false)
})
