import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createWheelGestureState,
  getWheelGestureDecision,
  getWheelInputMode,
  installStableTrackpadWheelZoom,
  TRACKPAD_PINCH_MOMENTUM_GUARD_MS,
  WHEEL_GESTURE_IDLE_MS,
} from '../src/map/trackpad-wheel-zoom.js'

test('仅将像素级 ctrl wheel 识别为触摸板捏合', () => {
  assert.equal(getWheelInputMode({ ctrlKey: true, deltaMode: 0 }), 'pinch')
  assert.equal(getWheelInputMode({ ctrlKey: false, deltaMode: 0 }), 'scroll')
  assert.equal(getWheelInputMode({ ctrlKey: true, deltaMode: 1 }), 'scroll')
})

test('同一触摸板滚动手势反向时清空旧方向累计量', () => {
  const first = getWheelGestureDecision(createWheelGestureState(), {
    delta: -20,
    mode: 'scroll',
    timestamp: 100,
  })
  assert.equal(first.action, 'reset')

  const reversed = getWheelGestureDecision(first.state, {
    delta: 2,
    mode: 'scroll',
    timestamp: 104,
  })
  assert.equal(reversed.action, 'reset')
  assert.equal(reversed.state.direction, 1)
})

test('普通滚动切换为触摸板捏合时建立新的输入边界', () => {
  const scroll = getWheelGestureDecision(createWheelGestureState(), {
    delta: -12,
    mode: 'scroll',
    timestamp: 200,
  })
  const pinch = getWheelGestureDecision(scroll.state, {
    delta: 1,
    mode: 'pinch',
    timestamp: 204,
  })

  assert.equal(pinch.action, 'reset')
  assert.equal(pinch.state.mode, 'pinch')
  assert.equal(pinch.state.lastPinchAt, 204)
})

test('捏合期间忽略普通滚动惯性尾流并保持捏合方向', () => {
  const pinch = getWheelGestureDecision(createWheelGestureState(), {
    delta: 2,
    mode: 'pinch',
    timestamp: 300,
  })
  const momentum = getWheelGestureDecision(pinch.state, {
    delta: -8,
    mode: 'scroll',
    timestamp: 300 + TRACKPAD_PINCH_MOMENTUM_GUARD_MS - 1,
  })

  assert.equal(momentum.action, 'ignore')
  assert.equal(momentum.state.mode, 'pinch')
  assert.equal(momentum.state.direction, 1)
})

test('捏合保护期结束后普通滚动可立即开始新手势', () => {
  const pinch = getWheelGestureDecision(createWheelGestureState(), {
    delta: 2,
    mode: 'pinch',
    timestamp: 400,
  })
  const scroll = getWheelGestureDecision(pinch.state, {
    delta: -8,
    mode: 'scroll',
    timestamp: 400 + TRACKPAD_PINCH_MOMENTUM_GUARD_MS + 1,
  })

  assert.equal(scroll.action, 'reset')
  assert.equal(scroll.state.mode, 'scroll')
  assert.equal(scroll.state.direction, -1)
})

test('同模式同方向连续输入只在空闲超时后重置', () => {
  const first = getWheelGestureDecision(createWheelGestureState(), {
    delta: 3,
    mode: 'scroll',
    timestamp: 500,
  })
  const continuous = getWheelGestureDecision(first.state, {
    delta: 1,
    mode: 'scroll',
    timestamp: 500 + WHEEL_GESTURE_IDLE_MS - 1,
  })
  const restarted = getWheelGestureDecision(continuous.state, {
    delta: 1,
    mode: 'scroll',
    timestamp: 500 + WHEEL_GESTURE_IDLE_MS * 2,
  })

  assert.equal(continuous.action, 'continue')
  assert.equal(restarted.action, 'reset')
})

test('零增量事件不创建手势也不污染现有方向', () => {
  const initial = createWheelGestureState()
  const decision = getWheelGestureDecision(initial, {
    delta: 0,
    mode: 'scroll',
    timestamp: 600,
  })

  assert.equal(decision.action, 'ignore')
  assert.deepEqual(decision.state, initial)
})

test('时间戳倒序的旧事件不会重新打开过期方向', () => {
  const current = getWheelGestureDecision(createWheelGestureState(), {
    delta: 4,
    mode: 'pinch',
    timestamp: 700,
  })
  const stale = getWheelGestureDecision(current.state, {
    delta: -20,
    mode: 'scroll',
    timestamp: 699,
  })

  assert.equal(stale.action, 'ignore')
  assert.deepEqual(stale.state, current.state)
})

test('Leaflet 适配器在滚动切换捏合时只保留最新方向', () => {
  const stopped = []
  function ScrollWheelZoom () {}
  ScrollWheelZoom.prototype._onWheelScroll = function (event) {
    this._delta += -event.deltaY
    this.calls.push(event)
  }
  const Leaflet = {
    Map: { ScrollWheelZoom },
    DomEvent: {
      getWheelDelta: event => -event.deltaY,
      stop: event => stopped.push(event),
    },
  }
  assert.equal(installStableTrackpadWheelZoom(Leaflet), true)
  assert.equal(installStableTrackpadWheelZoom(Leaflet), false)

  const handler = { _delta: 0, _startTime: null, _timer: null, calls: [] }
  Object.setPrototypeOf(handler, ScrollWheelZoom.prototype)
  handler._onWheelScroll({ deltaY: 60, deltaMode: 0, ctrlKey: false, timeStamp: 100 })
  handler._onWheelScroll({ deltaY: -6, deltaMode: 0, ctrlKey: true, timeStamp: 104 })

  assert.equal(handler._delta, 6)
  assert.equal(handler.calls.length, 2)
  assert.equal(stopped.length, 0)
})

test('Leaflet 适配器阻止捏合后的普通滚动惯性进入缩放累计器', () => {
  const stopped = []
  function ScrollWheelZoom () {}
  ScrollWheelZoom.prototype._onWheelScroll = function (event) {
    this._delta += -event.deltaY
    this.calls.push(event)
  }
  const Leaflet = {
    Map: { ScrollWheelZoom },
    DomEvent: {
      getWheelDelta: event => -event.deltaY,
      stop: event => stopped.push(event),
    },
  }
  installStableTrackpadWheelZoom(Leaflet)

  const handler = { _delta: 0, _startTime: null, _timer: null, calls: [] }
  Object.setPrototypeOf(handler, ScrollWheelZoom.prototype)
  handler._onWheelScroll({ deltaY: -8, deltaMode: 0, ctrlKey: true, timeStamp: 200 })
  handler._onWheelScroll({ deltaY: 20, deltaMode: 0, ctrlKey: false, timeStamp: 220 })

  assert.equal(handler._delta, 8)
  assert.equal(handler.calls.length, 1)
  assert.equal(stopped.length, 1)
})
