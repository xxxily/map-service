import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getRotatedViewportHalfSize,
  getRotatedPanTargetPoint,
  installRotatedShareBounds,
  limitRotatedCenterPoint,
  limitRotatedPanOffset,
  rotateVector,
} from '../src/map/rotated-share-bounds.js'

test('旋转视口包络在直角旋转时交换非正方形宽高', () => {
  const normal = getRotatedViewportHalfSize({ x: 1200, y: 700 }, 0)
  const upsideDown = getRotatedViewportHalfSize({ x: 1200, y: 700 }, 180)
  assert.ok(Math.abs(normal.x - 600) < 1e-9)
  assert.ok(Math.abs(normal.y - 350) < 1e-9)
  assert.ok(Math.abs(upsideDown.x - 600) < 1e-9)
  assert.ok(Math.abs(upsideDown.y - 350) < 1e-9)

  const quarterTurn = getRotatedViewportHalfSize({ x: 1200, y: 700 }, 90)
  assert.ok(Math.abs(quarterTurn.x - 350) < 1e-9)
  assert.ok(Math.abs(quarterTurn.y - 600) < 1e-9)
})

test('旋转后的中心限制使用屏幕四角包络，而不是固定的轴对齐半视口', () => {
  const bounds = [0, 0, 2400, 1800]
  const size = { x: 1200, y: 700 }

  assert.deepEqual(limitRotatedCenterPoint({ x: 0, y: 0 }, bounds, size, 0), { x: 600, y: 350 })

  const quarterTurn = limitRotatedCenterPoint({ x: 0, y: 0 }, bounds, size, 90)
  assert.ok(Math.abs(quarterTurn.x - 350) < 1e-9)
  assert.ok(Math.abs(quarterTurn.y - 600) < 1e-9)
})

test('视口大于授权矩形时中心保持稳定，不在旋转后产生来回跳动', () => {
  const first = limitRotatedCenterPoint({ x: 10, y: 20 }, [0, 0, 400, 300], { x: 1200, y: 700 }, 90)
  const second = limitRotatedCenterPoint(first, [0, 0, 400, 300], { x: 1200, y: 700 }, 0)
  assert.deepEqual(first, { x: 200, y: 150 })
  assert.deepEqual(second, { x: 200, y: 150 })
})

test('惯性/键盘平移偏移量按当前 bearing 转回投影坐标后再限制', () => {
  const offset = limitRotatedPanOffset(
    { x: 500, y: 0 },
    { x: 1200, y: 900 },
    [0, 0, 2400, 1800],
    { x: 1200, y: 700 },
    90,
  )

  // At 90 degrees a horizontal screen pan changes the projected Y axis,
  // while the returned constrained offset remains a screen-space offset.
  assert.ok(Math.abs(offset.x - 300) < 1e-8)
  assert.ok(Math.abs(offset.y) < 1e-8)
})

test('旋转向量保持可逆，归北后边界计算可恢复原始方向', () => {
  const original = { x: 37, y: -19 }
  const rotated = rotateVector(original, Math.PI / 2)
  const restored = rotateVector(rotated, -Math.PI / 2)
  assert.ok(Math.abs(restored.x - original.x) < 1e-9)
  assert.ok(Math.abs(restored.y - original.y) < 1e-9)
})

test('窄视口非动画平移按 bearing 转换目标中心，避免 Leaflet 超大偏移分支丢失旋转', () => {
  const northUp = getRotatedPanTargetPoint({ x: 1200, y: 900 }, { x: 500, y: 0 }, 0)
  assert.deepEqual(northUp, { x: 1700, y: 900 })

  const quarterTurn = getRotatedPanTargetPoint({ x: 1200, y: 900 }, [500, 0], 90)
  assert.ok(Math.abs(quarterTurn.x - 1200) < 1e-9)
  assert.ok(Math.abs(quarterTurn.y - 400) < 1e-9)
})

test('controller 只接管旋转窄视口的超大非动画 panBy，并在销毁时恢复原方法', () => {
  const originalPanCalls = []
  const resetCalls = []
  const originalPanBy = function (offset, options) {
    originalPanCalls.push({ offset, options })
    return this
  }
  const bounds = {
    getNorthWest: () => ({ x: 0, y: 0 }),
    getNorthEast: () => ({ x: 2000, y: 0 }),
    getSouthWest: () => ({ x: 0, y: 2000 }),
    getSouthEast: () => ({ x: 2000, y: 2000 }),
  }
  const map = {
    _rotate: true,
    _loaded: false,
    options: { maxBounds: bounds },
    _limitCenter: center => center,
    _limitOffset: offset => offset,
    panBy: originalPanBy,
    project: value => ({ x: Number(value.x), y: Number(value.y) }),
    unproject: value => ({ x: Number(value.x), y: Number(value.y) }),
    getBearing: () => 90,
    getCenter: () => ({ x: 1000, y: 1000 }),
    getZoom: () => 10,
    getSize: () => ({
      x: 320,
      y: 640,
      contains: value => Math.abs(value.x) <= 320 && Math.abs(value.y) <= 640,
    }),
    _resetView: (center, zoom) => resetCalls.push({ center, zoom }),
    on: () => map,
    off: () => map,
  }

  const controller = installRotatedShareBounds(map)
  map.panBy([500, 0])
  assert.equal(originalPanCalls.length, 0)
  assert.equal(resetCalls.length, 1)
  assert.ok(Math.abs(resetCalls[0].center.x - 1000) < 1e-9)
  assert.ok(Math.abs(resetCalls[0].center.y - 500) < 1e-9)

  map.panBy([100, 0])
  assert.equal(originalPanCalls.length, 1)

  map.panBy([500.4, 0])
  assert.equal(resetCalls.length, 2)
  assert.ok(Math.abs(resetCalls[1].center.y - 500) < 1e-9)

  map.panBy([2000, 0])
  assert.equal(resetCalls.length, 3)
  assert.ok(Math.abs(resetCalls[2].center.y - 160) < 1e-9)

  controller.destroy()
  assert.equal(map.panBy, originalPanBy)
})
