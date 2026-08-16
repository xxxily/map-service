import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createLeafletRotationPreview,
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
  const previewBearings = []
  let previewFinishCount = 0
  let previewStartCount = 0
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
    preview: {
      start: () => {
        previewStartCount += 1
        return true
      },
      update: ({ bearing }) => {
        previewBearings.push(bearing)
        return true
      },
      finish: () => {
        previewFinishCount += 1
      },
    },
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
    get previewFinishCount () { return previewFinishCount },
    get previewStartCount () { return previewStartCount },
    previewBearings,
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

test('Shift 拖拽每帧只更新合成层预览，松手后一次提交真实 bearing', () => {
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
  assert.deepEqual(fixture.previewBearings, [])
  assert.deepEqual(fixture.rotateEndBearings, [])
  assert.equal(fixture.flushFrame(), true)
  assert.deepEqual(fixture.bearings, [])
  assert.deepEqual(fixture.previewBearings, [10])

  fixture.documentLike.emit('mouseup', mouseEvent({ buttons: 0, clientX: 140 }))
  assert.equal(fixture.controller.isActive(), false)
  assert.equal(fixture.draggingEnabled, true)
  assert.equal(fixture.container.classList.contains('map-shift-rotating'), false)
  assert.deepEqual(fixture.bearings, [10])
  assert.equal(fixture.previewStartCount, 1)
  assert.equal(fixture.previewFinishCount, 1)
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
  assert.equal(fixture.previewFinishCount, 1)
  assert.deepEqual(fixture.rotateEndBearings, [])
})

test('地图卸载时只清理控制器，不重新启用已由 Leaflet 销毁的拖拽 handler', () => {
  const fixture = createRotationFixture()
  fixture.container.emit('mousedown', mouseEvent())

  fixture.emitMap('unload')

  assert.equal(fixture.controller.isActive(), false)
  assert.equal(fixture.draggingEnabled, false)
  assert.equal(fixture.previewFinishCount, 1)
  assert.deepEqual(fixture.rotateEndBearings, [])
})

test('合成层预览不可用时回退为逐帧 setBearing', () => {
  const fixture = createRotationFixture()
  fixture.controller.destroy()

  const container = new FakeEventTarget()
  const documentLike = new FakeEventTarget()
  let currentBearing = 30
  const bearings = []
  const frames = []
  const map = {
    getContainer: () => container,
    getBearing: () => currentBearing,
    setBearing: bearing => {
      currentBearing = bearing
      bearings.push(bearing)
    },
    dragging: { enabled: () => false },
  }
  const controller = initDesktopShiftDragRotate(map, {
    document: documentLike,
    window: new FakeEventTarget(),
    preview: null,
    requestFrame: callback => {
      frames.push(callback)
      return frames.length
    },
    cancelFrame: () => {},
  })

  container.emit('mousedown', mouseEvent())
  documentLike.emit('mousemove', mouseEvent({ clientX: 140 }))
  frames.shift()?.()

  assert.deepEqual(bearings, [10])
  controller.destroy()
})

test('Leaflet pane 预览恢复已有内联样式', () => {
  const style = {
    rotate: '',
    transform: 'translate3d(4px, 6px, 0)',
    transformOrigin: '',
    willChange: '',
  }
  const preview = createLeafletRotationPreview({
    _mapPane: { style },
    getSize: () => ({ x: 640, y: 480 }),
    _getMapPanePos: () => ({ x: 4, y: 6 }),
  })

  assert.equal(preview.start(), true)
  preview.update({ delta: -20 })
  assert.equal(style.rotate, '')
  assert.equal(style.transformOrigin, '0 0')
  assert.match(style.transform, /^translate3d\(.+px, .+px, 0\) rotate\(-20deg\)$/)
  preview.finish()
  assert.equal(style.rotate, '')
  assert.equal(style.transform, 'translate3d(4px, 6px, 0)')
  assert.equal(style.transformOrigin, '')
  assert.equal(style.willChange, '')
})

test('Leaflet pane 预览围绕页面视觉中心旋转，兼容非零 pane 平移', () => {
  const style = {
    rotate: '',
    transform: 'translate3d(0px, 40px, 0px)',
    transformOrigin: '',
    willChange: '',
  }
  const preview = createLeafletRotationPreview({
    _mapPane: { style },
    getSize: () => ({ x: 1280, y: 800 }),
    _getMapPanePos: () => ({ x: 0, y: 40 }),
  })

  assert.equal(preview.start(), true)
  assert.equal(preview.update({ delta: -100 }), true)
  assert.equal(
    style.transform,
    'translate3d(396.604px, 1092.79px, 0) rotate(-100deg)',
  )
  preview.finish()
})

test('Leaflet pane 预览在缺少地图尺寸或 pane 位置时回退', () => {
  const style = {
    rotate: '',
    transform: 'translate3d(0px, 0px, 0px)',
    transformOrigin: '',
    willChange: '',
  }
  const preview = createLeafletRotationPreview({ _mapPane: { style } })

  assert.equal(preview.start(), false)
  assert.equal(preview.update({ delta: 10 }), false)
})

test('Leaflet pane 处于缩放复合变换时不接管预览', () => {
  const style = {
    rotate: '',
    transform: 'translate3d(0px, 40px, 0px) scale(1.1)',
    transformOrigin: '',
    willChange: '',
  }
  const preview = createLeafletRotationPreview({
    _mapPane: { style },
    getSize: () => ({ x: 1280, y: 800 }),
    _getMapPanePos: () => ({ x: 0, y: 40 }),
  })

  assert.equal(preview.start(), false)
  assert.equal(style.transform, 'translate3d(0px, 40px, 0px) scale(1.1)')
})

test('Leaflet pane 预览遇到平移变化时保留最新变换并回退', () => {
  const style = {
    rotate: '',
    transform: 'translate3d(0px, 40px, 0px)',
    transformOrigin: '',
    willChange: '',
  }
  let panePosition = { x: 0, y: 40 }
  const preview = createLeafletRotationPreview({
    _mapPane: { style },
    getSize: () => ({ x: 1280, y: 800 }),
    _getMapPanePos: () => panePosition,
  })

  assert.equal(preview.start(), true)
  assert.equal(preview.update({ delta: -30 }), true)
  panePosition = { x: -64, y: 12 }
  style.transform = 'translate3d(-64px, 12px, 0) scale(1.2)'
  assert.equal(preview.update({ delta: -40 }), false)
  preview.finish()

  assert.equal(style.transform, 'translate3d(-64px, 12px, 0) scale(1.2)')
  assert.equal(style.transformOrigin, '')
  assert.equal(style.willChange, '')
})

test('Leaflet pane 缩放状态先于外部 transform 时清除自有预览', () => {
  const style = {
    rotate: '',
    transform: 'translate3d(0px, 40px, 0px)',
    transformOrigin: '',
    willChange: '',
  }
  const map = {
    _animatingZoom: false,
    _mapPane: { style },
    getSize: () => ({ x: 1280, y: 800 }),
    _getMapPanePos: () => ({ x: 0, y: 40 }),
  }
  const preview = createLeafletRotationPreview(map)

  assert.equal(preview.start(), true)
  assert.equal(preview.update({ delta: -30 }), true)
  assert.notEqual(style.transform, 'translate3d(0px, 40px, 0px)')
  map._animatingZoom = true
  assert.equal(preview.update({ delta: -40 }), false)
  preview.finish()

  assert.equal(style.transform, 'translate3d(0px, 40px, 0px)')
})
