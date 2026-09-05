import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  captureTouchIdentifiers,
  getTouchRotationAngle,
  getTouchRotationDeltaRadians,
  installStableTouchGestures,
  normalizeAngleDeltaRadians,
  resolveTouchPair,
  shouldActivateTouchRotation,
  TOUCH_ROTATION_THRESHOLD_DEG,
} from '../src/map/touch-rotation.js'

class Point {
  constructor (x, y) {
    this.x = x
    this.y = y
  }

  subtract (point) {
    return new Point(this.x - point.x, this.y - point.y)
  }

  _add (point) {
    return new Point(this.x + point.x, this.y + point.y)
  }

  _divideBy (value) {
    return new Point(this.x / value, this.y / value)
  }

  distanceTo (point) {
    return Math.hypot(this.x - point.x, this.y - point.y)
  }

  rotate () {
    return this
  }
}

function touch (identifier, x, y) {
  return { identifier, clientX: x, clientY: y }
}

function createLeafletFixture () {
  const bearings = []
  const prevented = []
  const moves = []
  let bearing = 20

  class TouchGestures {
    _onTouchStart (event) {
      if (!event.touches || event.touches.length !== 2) return
      const first = this._map.mouseEventToContainerPoint(event.touches[0])
      const second = this._map.mouseEventToContainerPoint(event.touches[1])
      this._startDist = first.distanceTo(second)
      this._startZoom = 10
      this._startLatLng = { lat: 0, lng: 0 }
      this._centerPoint = new Point(100, 100)
      this._pinchStartLatLng = { lat: 0, lng: 0 }
      this._zooming = true
      this._rotating = true
      this._moved = false
    }

    _onTouchMove () {
      throw new Error('the corrected adapter must replace the original move handler')
    }

    _onTouchEnd () {
      this._zooming = false
      this._rotating = false
    }
  }

  const Leaflet = {
    Map: { TouchGestures },
    DomUtil: { RAD_TO_DEG: 180 / Math.PI, DEG_TO_RAD: Math.PI / 180 },
    DomEvent: {
      preventDefault: event => prevented.push(event),
    },
    Util: {
      cancelAnimFrame: () => {},
      requestAnimFrame: callback => {
        moves.push(callback)
        return moves.length
      },
    },
  }

  const map = {
    options: { touchZoom: 'center', bounceAtZoomLimits: false },
    mouseEventToContainerPoint: event => new Point(event.clientX, event.clientY),
    getBearing: () => bearing,
    setBearing: nextBearing => {
      bearing = nextBearing
      bearings.push(nextBearing)
    },
    getScaleZoom: (scale, startZoom) => startZoom + Math.log2(scale),
    getMinZoom: () => 0,
    getMaxZoom: () => 20,
    _limitZoom: zoom => zoom,
    _moveStart: () => {},
    _move: (...args) => moves.push(args),
    project: value => value,
    unproject: value => value,
  }

  const handler = new TouchGestures()
  handler._map = map

  return {
    bearings,
    handler,
    Leaflet,
    map,
    moves,
    prevented,
  }
}

function rotatedPair (angleDegrees, centerX = 100, centerY = 100, radius = 50) {
  const angle = angleDegrees * Math.PI / 180
  const vector = new Point(Math.sin(angle) * radius, Math.cos(angle) * radius)
  return [
    touch(1, centerX + vector.x / 2, centerY + vector.y / 2),
    touch(2, centerX - vector.x / 2, centerY - vector.y / 2),
  ]
}

test('角度计算保留四象限并使用最短有符号差值', () => {
  const angle = getTouchRotationAngle(new Point(100, 50), new Point(100, 150))
  assert.equal(Math.round(angle * 180 / Math.PI), 180)
  assert.ok(Math.abs(getTouchRotationDeltaRadians(Math.PI - 0.05, -Math.PI + 0.05) - 0.1) < 1e-12)
  assert.equal(normalizeAngleDeltaRadians(3 * Math.PI), Math.PI)
})

test('触摸标识捕获后可从重排的 TouchList 恢复同一双指', () => {
  const initial = [touch(7, 10, 20), touch(11, 40, 50)]
  const identifiers = captureTouchIdentifiers(initial)
  assert.deepEqual(identifiers, { first: 7, second: 11 })
  assert.deepEqual(resolveTouchPair([initial[1], initial[0]], identifiers), [initial[0], initial[1]])
  assert.equal(resolveTouchPair([touch(7, 10, 20)], identifiers), null)
})

test('30 度阈值保持不变，刚越过阈值时采用软启动', () => {
  assert.equal(TOUCH_ROTATION_THRESHOLD_DEG, 30)
  assert.equal(shouldActivateTouchRotation(29 * Math.PI / 180), false)
  assert.equal(shouldActivateTouchRotation(30 * Math.PI / 180), true)

  const fixture = createLeafletFixture()
  assert.equal(installStableTouchGestures(fixture.Leaflet), true)
  fixture.handler._onTouchStart({ touches: rotatedPair(0) })

  fixture.handler._onTouchMove({ touches: rotatedPair(31) })
  assert.deepEqual(fixture.bearings, [], 'threshold crossing must not jump the map')

  fixture.handler._onTouchMove({ touches: rotatedPair(41) })
  assert.equal(fixture.bearings.length, 1)
  assert.ok(Math.abs(fixture.bearings[0] - 10) < 1e-9)
})

test('负 Y 象限的静止捏合不会触发旋转', () => {
  const fixture = createLeafletFixture()
  installStableTouchGestures(fixture.Leaflet)
  const pair = rotatedPair(180)
  fixture.handler._onTouchStart({ touches: pair })
  fixture.handler._onTouchMove({ touches: [pair[1], pair[0]] })

  assert.deepEqual(fixture.bearings, [])
  assert.equal(fixture.prevented.length, 1)
})

test('TouchList 重排不会制造 180 度旋转，缩放仍按同一双指继续', () => {
  const fixture = createLeafletFixture()
  installStableTouchGestures(fixture.Leaflet)
  const initial = [touch(1, 75, 100), touch(2, 125, 100)]
  fixture.handler._onTouchStart({ touches: initial })

  const moved = [touch(2, 140, 100), touch(1, 60, 100)]
  fixture.handler._onTouchMove({ touches: moved })

  assert.deepEqual(fixture.bearings, [])
  assert.equal(fixture.handler._zoom, 10 + Math.log2(80 / 50))
  assert.equal(fixture.prevented.length, 1)
})

test('已捕获手指被替换时安全忽略事件，不猜测新的触摸身份', () => {
  const fixture = createLeafletFixture()
  installStableTouchGestures(fixture.Leaflet)
  fixture.handler._onTouchStart({ touches: [touch(41, 75, 100), touch(42, 125, 100)] })
  fixture.handler._onTouchMove({ touches: [touch(41, 75, 100), touch(99, 125, 100)] })

  assert.deepEqual(fixture.bearings, [])
  assert.equal(fixture.handler._zoom, undefined)
  assert.equal(fixture.prevented.length, 1)
})

test('适配器只安装一次，并在触摸结束后清理稳定标识', () => {
  const fixture = createLeafletFixture()
  assert.equal(installStableTouchGestures(fixture.Leaflet), true)
  assert.equal(installStableTouchGestures(fixture.Leaflet), false)
  const firstGesture = rotatedPair(0)
  fixture.handler._onTouchStart({ touches: firstGesture })
  fixture.handler._onTouchEnd()
  assert.equal(fixture.handler._rotationThresholdTriggered, false)
  assert.equal(fixture.handler._rotating, false)

  fixture.handler._onTouchStart({ touches: rotatedPair(0) })
  assert.equal(fixture.handler._rotating, true)
})
