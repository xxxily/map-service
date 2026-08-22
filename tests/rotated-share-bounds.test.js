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

test('连续旋转和缩放后每一帧都按最新视口包络限制中心', () => {
  const bounds = [0, 0, 4000, 3000]
  const sizes = [
    { x: 1200, y: 700 },
    { x: 900, y: 1200 },
    { x: 1600, y: 800 },
  ]
  const bearings = [0, 37, 91, 179, 241, 315, 0]
  let center = { x: -500, y: 4200 }

  for (let index = 0; index < bearings.length; index += 1) {
    const size = sizes[index % sizes.length]
    const bearing = bearings[index]
    center = limitRotatedCenterPoint(center, bounds, size, bearing)
    const half = getRotatedViewportHalfSize(size, bearing)
    assert.ok(center.x >= bounds[0] + half.x - 1e-9)
    assert.ok(center.x <= bounds[2] - half.x + 1e-9)
    assert.ok(center.y >= bounds[1] + half.y - 1e-9)
    assert.ok(center.y <= bounds[3] - half.y + 1e-9)

    // Simulate a zoom recalculation followed by another large pan. The
    // result must be bounded from the current zoom/bearing, not stale state.
    center = limitRotatedCenterPoint({ x: center.x + 5000, y: center.y - 5000 }, bounds, size, bearing)
    assert.ok(center.x <= bounds[2] - half.x + 1e-9)
    assert.ok(center.y >= bounds[1] + half.y - 1e-9)
  }
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

test('拖到旋转视口边缘时即使 maxBoundsViscosity 为 1 也保留回弹反馈位移', () => {
  const listeners = new Map()
  const predragListeners = []
  const draggable = {
    _startPos: { x: 0, y: 0 },
    _newPos: { x: 500, y: 0 },
    on: (event, handler) => {
      if (event === 'predrag') predragListeners.push(handler)
      return draggable
    },
    off: () => draggable,
  }
  const bounds = {
    getNorthWest: () => ({ x: 0, y: 0 }),
    getNorthEast: () => ({ x: 1000, y: 0 }),
    getSouthWest: () => ({ x: 0, y: 1000 }),
    getSouthEast: () => ({ x: 1000, y: 1000 }),
  }
  const map = {
    _rotate: true,
    _loaded: true,
    options: { maxBounds: bounds, maxBoundsViscosity: 1 },
    dragging: { _draggable: draggable },
    _limitCenter: center => center,
    _limitOffset: offset => offset,
    panBy: () => map,
    project: value => ({ x: Number(value.x), y: Number(value.y) }),
    unproject: value => ({ x: Number(value.x), y: Number(value.y) }),
    getBearing: () => 45,
    // Start exactly at the rotated west edge, then drag farther outward.
    // This is the state that previously felt completely frozen.
    getCenter: () => ({ x: 282.842712474619, y: 500 }),
    getZoom: () => 10,
    getSize: () => ({ x: 400, y: 400 }),
    setView: () => map,
    on: (event, handler) => {
      listeners.set(event, handler)
      return map
    },
    off: () => map,
  }

  const controller = installRotatedShareBounds(map)
  listeners.get('dragstart')()
  predragListeners[0]()

  // A hard clamp leaves the pointer at the exact boundary and feels frozen.
  // Spatial shares must retain a small resisted overscroll even though their
  // Leaflet maxBoundsViscosity is 1, then settle back on drag end.
  assert.ok(draggable._newPos.x > 0)
  assert.ok(draggable._newPos.x < 500)
  controller.destroy()
})
