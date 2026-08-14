import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  getDesktopDragBearing,
  initDesktopShiftDragRotate,
} from '../src/map/desktop-rotation.js'

class FakeEventTarget {
  constructor () {
    this.listeners = new Map()
    this.classNames = new Set()
    this.classList = {
      add: name => this.classNames.add(name),
      remove: name => this.classNames.delete(name),
      contains: name => this.classNames.has(name),
    }
  }

  addEventListener (type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type).add(listener)
  }

  removeEventListener (type, listener) {
    this.listeners.get(type)?.delete(listener)
  }

  emit (type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event)
  }
}

function createRotationFixture () {
  const container = new FakeEventTarget()
  const documentLike = new FakeEventTarget()
  const windowLike = new FakeEventTarget()
  const frames = new Map()
  const bearings = []
  const rotateEndBearings = []
  let nextFrameId = 1
  let draggingEnabled = true
  let currentBearing = 30
  const mapEvents = new Map()
  const map = {
    getContainer: () => container,
    getBearing: () => currentBearing,
    setBearing: bearing => {
      currentBearing = bearing
      bearings.push(bearing)
    },
    dragging: {
      enabled: () => draggingEnabled,
      disable: () => { draggingEnabled = false },
      enable: () => { draggingEnabled = true },
    },
    on: (type, listener) => mapEvents.set(type, listener),
    off: (type, listener) => {
      if (mapEvents.get(type) === listener) mapEvents.delete(type)
    },
  }
  const controller = initDesktopShiftDragRotate(map, {
    document: documentLike,
    window: windowLike,
    requestFrame: callback => {
      const frameId = nextFrameId++
      frames.set(frameId, callback)
      return frameId
    },
    cancelFrame: frameId => frames.delete(frameId),
    onRotateEnd: event => rotateEndBearings.push(event.bearing),
  })

  return {
    bearings,
    container,
    controller,
    documentLike,
    flushFrame () {
      const entry = frames.entries().next().value
      if (!entry) return false
      const [frameId, callback] = entry
      frames.delete(frameId)
      callback()
      return true
    },
    emitMap (type) {
      mapEvents.get(type)?.()
    },
    get draggingEnabled () { return draggingEnabled },
    get pendingFrameCount () { return frames.size },
    rotateEndBearings,
  }
}

function mouseEvent (overrides = {}) {
  return {
    button: 0,
    buttons: 1,
    clientX: 100,
    shiftKey: true,
    target: { closest: () => null },
    preventDefault () {},
    stopPropagation () {},
    stopImmediatePropagation () {},
    ...overrides,
  }
}

test('桌面拖拽按观察方向计算角度，向右拖动时地图内容逆时针旋转', () => {
  assert.equal(getDesktopDragBearing(30, 100, 140), 10)
  assert.equal(getDesktopDragBearing(30, 100, 60), 50)
})

test('Shift 拖拽将高频 mousemove 合并为每个动画帧一次旋转', () => {
  const fixture = createRotationFixture()
  fixture.container.emit('mousedown', mouseEvent())

  assert.equal(fixture.controller.isActive(), true)
  assert.equal(fixture.draggingEnabled, false)
  assert.equal(fixture.container.classList.contains('map-shift-rotating'), true)

  fixture.documentLike.emit('mousemove', mouseEvent({ clientX: 110 }))
  fixture.documentLike.emit('mousemove', mouseEvent({ clientX: 125 }))
  fixture.documentLike.emit('mousemove', mouseEvent({ clientX: 140 }))

  assert.equal(fixture.pendingFrameCount, 1)
  assert.deepEqual(fixture.bearings, [])
  assert.deepEqual(fixture.rotateEndBearings, [])
  assert.equal(fixture.flushFrame(), true)
  assert.deepEqual(fixture.bearings, [10])

  fixture.documentLike.emit('mouseup', mouseEvent({ buttons: 0, clientX: 140 }))
  assert.equal(fixture.controller.isActive(), false)
  assert.equal(fixture.draggingEnabled, true)
  assert.equal(fixture.container.classList.contains('map-shift-rotating'), false)
  assert.deepEqual(fixture.rotateEndBearings, [10])
  fixture.controller.destroy()
})

test('普通拖拽和地图控件上的 Shift 拖拽不会进入旋转模式', () => {
  const fixture = createRotationFixture()
  fixture.container.emit('mousedown', mouseEvent({ shiftKey: false }))
  fixture.container.emit('mousedown', mouseEvent({
    target: { closest: () => ({ className: 'leaflet-control' }) },
  }))

  assert.equal(fixture.controller.isActive(), false)
  assert.equal(fixture.draggingEnabled, true)
  assert.equal(fixture.pendingFrameCount, 0)
  fixture.controller.destroy()
})

test('点位、矢量线面和弹窗上的 Shift 拖拽不会抢占要素交互', () => {
  for (const className of ['leaflet-marker-icon', 'leaflet-interactive', 'leaflet-popup']) {
    const fixture = createRotationFixture()
    fixture.container.emit('mousedown', mouseEvent({
      target: { closest: selector => selector.includes(className) ? {} : null },
    }))

    assert.equal(fixture.controller.isActive(), false, className)
    fixture.controller.destroy()
  }
})

test('销毁活动控制器会恢复地图拖拽但不提交一次伪造的旋转完成', () => {
  const fixture = createRotationFixture()
  fixture.container.emit('mousedown', mouseEvent())

  fixture.controller.destroy()

  assert.equal(fixture.controller.isActive(), false)
  assert.equal(fixture.draggingEnabled, true)
  assert.deepEqual(fixture.rotateEndBearings, [])
})

test('地图卸载时只清理控制器，不重新启用已由 Leaflet 销毁的拖拽 handler', () => {
  const fixture = createRotationFixture()
  fixture.container.emit('mousedown', mouseEvent())

  fixture.emitMap('unload')

  assert.equal(fixture.controller.isActive(), false)
  assert.equal(fixture.draggingEnabled, false)
  assert.deepEqual(fixture.rotateEndBearings, [])
})
