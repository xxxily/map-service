import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BUTTON_MASK,
  clamp,
  classifyTwoPointerGesture,
  getFallbackPanWorldDelta,
  getKeyboardNavigationCommand,
  getMinimumCameraHeightAboveTerrain,
  getTouchGestureMetrics,
  getZoomFraction,
  installMap3dCameraInteraction,
  isButtonPressed,
  pickMap3dWorldPosition,
} from '../src/map3d/camera-interaction.js'

function createEventTarget () {
  const listeners = new Map()
  return {
    addEventListener (type, listener) {
      const handlers = listeners.get(type) || []
      handlers.push(listener)
      listeners.set(type, handlers)
    },
    removeEventListener (type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(handler => handler !== listener))
    },
    emit (type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event)
    },
  }
}

function createTouchEvent (pointerId, x, y, type = 'pointermove') {
  return {
    pointerId,
    pointerType: 'touch',
    clientX: x,
    clientY: y,
    buttons: BUTTON_MASK.LEFT,
    preventDefault () {},
    stopImmediatePropagation () {},
    type,
  }
}

function createPointerEvent (pointerId, x, y, overrides = {}) {
  let prevented = 0
  let stopped = 0
  return {
    pointerId,
    pointerType: 'mouse',
    button: 0,
    buttons: BUTTON_MASK.LEFT,
    clientX: x,
    clientY: y,
    preventDefault () { prevented += 1 },
    stopImmediatePropagation () { stopped += 1 },
    get prevented () { return prevented },
    get stopped () { return stopped },
    ...overrides,
  }
}

function createCameraInteractionFixture (options = {}) {
  class Cartesian2 {
    constructor (x, y) {
      this.x = x
      this.y = y
    }
  }

  class HeadingPitchRange {
    constructor (heading, pitch, range) {
      this.heading = heading
      this.pitch = pitch
      this.range = range
    }
  }

  const canvas = Object.assign(createEventTarget(), {
    clientWidth: 300,
    clientHeight: 200,
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture () {},
    hasPointerCapture: () => false,
    releasePointerCapture () {},
  })
  const controller = { enableInputs: false }
  const cameraCalls = []
  const camera = {
    position: { x: 0, y: 0, z: 1_000 },
    positionCartographic: { height: 1_000 },
    heading: 0,
    pitch: -0.5,
    getPickRay: position => ({ position }),
    pickEllipsoid: position => ({ x: position.x, y: position.y, z: 0 }),
    lookAt (target, range) {
      cameraCalls.push({ target, range })
      this.heading = range.heading
      this.pitch = range.pitch
    },
    lookAtTransform () {},
    move () {},
    moveRight () {},
    moveUp () {},
  }
  const scene = {
    screenSpaceCameraController: controller,
    globe: {
      pick: ray => ({ x: ray.position.x, y: ray.position.y, z: 0 }),
      ellipsoid: {},
      getHeight: () => undefined,
    },
    pickPosition: () => null,
  }
  const viewer = {
    canvas,
    camera,
    scene,
  }
  const windowLike = createEventTarget()
  const documentLike = Object.assign(createEventTarget(), { hidden: false })
  const interaction = installMap3dCameraInteraction({
    viewer,
    cesium: { Cartesian2, HeadingPitchRange, Matrix4: { IDENTITY: {} } },
    getNavigationMode: () => '3d',
    window: windowLike,
    document: documentLike,
    ...options,
  })

  return { camera, cameraCalls, canvas, controller, interaction, scene, windowLike }
}

test('isButtonPressed reads PointerEvent masks without confusing left and middle buttons', () => {
  assert.equal(isButtonPressed({ buttons: BUTTON_MASK.LEFT }, BUTTON_MASK.LEFT), true)
  assert.equal(isButtonPressed({ buttons: BUTTON_MASK.MIDDLE }, BUTTON_MASK.LEFT), false)
  assert.equal(isButtonPressed(BUTTON_MASK.LEFT | BUTTON_MASK.MIDDLE, BUTTON_MASK.MIDDLE), true)
  assert.equal(isButtonPressed(0, BUTTON_MASK.LEFT), false)
})

test('clamp handles regular, reversed, and invalid bounds predictably', () => {
  assert.equal(clamp(6, 0, 5), 5)
  assert.equal(clamp(-1, 0, 5), 0)
  assert.equal(clamp(3, 5, 0), 3)
  assert.equal(clamp(Number.NaN, 2, 8), 2)
})

test('getTouchGestureMetrics calculates distance, midpoint, and angle', () => {
  const metrics = getTouchGestureMetrics({ x: 2, y: 3 }, { x: 5, y: 7 })

  assert.deepEqual(metrics.first, { x: 2, y: 3 })
  assert.deepEqual(metrics.second, { x: 5, y: 7 })
  assert.deepEqual(metrics.midpoint, { x: 3.5, y: 5 })
  assert.equal(metrics.distance, 5)
  assert.ok(Math.abs(metrics.angle - Math.atan2(4, 3)) < 1e-12)
})

test('classifyTwoPointerGesture waits below the threshold then distinguishes pinch, rotation, tilt, and pan', () => {
  const initial = getTouchGestureMetrics({ x: 0, y: 0 }, { x: 100, y: 0 })

  assert.equal(
    classifyTwoPointerGesture(initial, getTouchGestureMetrics({ x: 1, y: 1 }, { x: 101, y: 1 })),
    'pending',
  )
  assert.equal(
    classifyTwoPointerGesture(initial, getTouchGestureMetrics({ x: 0, y: 0 }, { x: 140, y: 0 })),
    'pinch',
  )
  assert.equal(
    classifyTwoPointerGesture(initial, getTouchGestureMetrics({ x: 0, y: 0 }, { x: 0, y: 100 })),
    'rotate',
  )
  assert.equal(
    classifyTwoPointerGesture(initial, getTouchGestureMetrics({ x: 2, y: 28 }, { x: 102, y: 28 })),
    'tilt',
  )
  assert.equal(
    classifyTwoPointerGesture(initial, getTouchGestureMetrics({ x: 30, y: 2 }, { x: 130, y: 2 })),
    'pan',
  )
})

test('getZoomFraction is signed and clamps large pinch changes', () => {
  assert.equal(getZoomFraction(100, 100), 0)
  assert.ok(getZoomFraction(100, 120) > 0)
  assert.ok(getZoomFraction(120, 100) < 0)
  assert.equal(getZoomFraction(100, 100_000), 0.62)
  assert.equal(getZoomFraction(100_000, 100), -0.62)
  assert.equal(getZoomFraction(100, 10_000, { maxFraction: 0.2 }), 0.2)
})

test('keyboard commands support canvas pan/zoom without browser modifier conflicts', () => {
  assert.deepEqual(getKeyboardNavigationCommand({ key: 'ArrowLeft' }), { type: 'pan', x: -56, y: 0 })
  assert.deepEqual(getKeyboardNavigationCommand({ key: 'ArrowDown' }, { panPixels: 40 }), {
    type: 'pan', x: 0, y: 40,
  })
  assert.deepEqual(getKeyboardNavigationCommand({ key: '+', shiftKey: true }), {
    type: 'zoom', fraction: 0.18,
  })
  assert.deepEqual(getKeyboardNavigationCommand({ key: '-', code: 'Minus' }), {
    type: 'zoom', fraction: -0.18,
  })
  assert.equal(getKeyboardNavigationCommand({ key: 'ArrowRight', ctrlKey: true }), null)
  assert.equal(getKeyboardNavigationCommand({ key: '+', metaKey: true }), null)
  assert.equal(getKeyboardNavigationCommand({ key: 'Process', isComposing: true }), null)
})

test('world picking prefers depth, then terrain, then ellipsoid', () => {
  const order = []
  const position = { x: 12, y: 34 }
  const camera = {
    getPickRay () {
      order.push('ray')
      return { ray: true }
    },
    pickEllipsoid () {
      order.push('ellipsoid')
      return { source: 'ellipsoid' }
    },
  }
  const scene = {
    globe: {
      ellipsoid: {},
      pick () {
        order.push('terrain')
        return { source: 'terrain' }
      },
    },
    pickPosition () {
      order.push('depth')
      return { source: 'depth' }
    },
  }

  assert.deepEqual(pickMap3dWorldPosition(scene, camera, position), { source: 'depth' })
  assert.deepEqual(order, ['depth'])

  scene.pickPosition = () => { order.push('depth-empty'); return null }
  assert.deepEqual(pickMap3dWorldPosition(scene, camera, position), { source: 'terrain' })
  assert.deepEqual(order.slice(-3), ['depth-empty', 'ray', 'terrain'])

  scene.globe.pick = () => { order.push('terrain-empty'); return null }
  assert.deepEqual(pickMap3dWorldPosition(scene, camera, position), { source: 'ellipsoid' })
  assert.deepEqual(order.slice(-4), ['depth-empty', 'ray', 'terrain-empty', 'ellipsoid'])
})

test('terrain clearance uses loaded terrain height and falls back without async sampling', () => {
  const cartographic = { height: 900 }
  let calls = 0
  const scene = {
    globe: {
      getHeight (value) {
        calls += 1
        assert.equal(value, cartographic)
        return 1_240
      },
    },
  }
  assert.equal(getMinimumCameraHeightAboveTerrain(scene, cartographic, 150), 1_390)
  assert.equal(calls, 1)
  scene.verticalExaggeration = 1.35
  scene.verticalExaggerationRelativeHeight = 1_000
  assert.equal(getMinimumCameraHeightAboveTerrain(scene, cartographic, 150), 1_474)
  assert.equal(getMinimumCameraHeightAboveTerrain({ globe: { getHeight: () => undefined } }, cartographic, 150), 150)
})

test('canvas keydown handles navigation only while the canvas owns focus', () => {
  const focusedDocument = { hidden: false, activeElement: null }
  const fixture = createCameraInteractionFixture({ document: focusedDocument })
  focusedDocument.activeElement = fixture.canvas
  const key = createPointerEvent(0, 0, 0, {
    key: 'ArrowRight',
    code: 'ArrowRight',
    target: fixture.canvas,
    buttons: 0,
  })
  fixture.canvas.emit('keydown', key)
  assert.equal(key.prevented, 1)
  assert.notEqual(fixture.camera.position.x, 0)

  focusedDocument.activeElement = { tagName: 'INPUT' }
  const ignored = createPointerEvent(0, 0, 0, {
    key: 'ArrowLeft',
    target: fixture.canvas,
    buttons: 0,
  })
  const before = fixture.camera.position.x
  fixture.canvas.emit('keydown', ignored)
  assert.equal(ignored.prevented, 0)
  assert.equal(fixture.camera.position.x, before)
  fixture.interaction.destroy()
})

test('fallback pan maps CSS pixels through camera height, fovy, and canvas dimensions', () => {
  const base = {
    cameraHeight: 1_000,
    canvasWidth: 400,
    canvasHeight: 200,
    maxCssPixels: 1_000,
    maxWorldDistance: 1_000_000,
  }
  const narrow = getFallbackPanWorldDelta({ x: 20, y: 0 }, {
    ...base,
    fovy: Math.PI / 6,
  })
  const wide = getFallbackPanWorldDelta({ x: 20, y: 0 }, {
    ...base,
    fovy: Math.PI / 2,
  })
  const tallCanvas = getFallbackPanWorldDelta({ x: 20, y: 0 }, {
    ...base,
    canvasHeight: 400,
    fovy: Math.PI / 2,
  })

  assert.ok(wide.x > narrow.x, 'wider fovy reveals more world distance per CSS pixel')
  assert.ok(Math.abs(wide.x / narrow.x - (Math.tan(Math.PI / 4) / Math.tan(Math.PI / 12))) < 1e-12)
  assert.ok(Math.abs(tallCanvas.x - wide.x / 2) < 1e-9, 'CSS canvas height changes the pixel-to-world scale')
})

test('fallback pan clamps runaway CSS and world deltas per frame', () => {
  const cssCapped = getFallbackPanWorldDelta({ x: 10_000, y: 0 }, {
    cameraHeight: 1_000,
    fovy: Math.PI / 2,
    canvasWidth: 200,
    canvasHeight: 200,
    maxCssPixels: 20,
    maxWorldDistance: 1_000,
  })
  const worldCapped = getFallbackPanWorldDelta({ x: 10_000, y: 10_000 }, {
    cameraHeight: 1_000_000,
    fovy: Math.PI / 2,
    canvasWidth: 200,
    canvasHeight: 200,
    maxCssPixels: 100,
    maxWorldDistance: 250,
  })

  assert.ok(Math.abs(cssCapped.x - 200) < 1e-9, 'CSS-pixel cap is applied before world projection')
  assert.ok(Math.abs(cssCapped.y) < 1e-12)
  assert.ok(Math.abs(Math.hypot(worldCapped.x, worldCapped.y) - 250) < 1e-9,
    'world-space cap prevents a single missed event from jumping the camera')
})

test('plain left clicks pass through, while drag starts after the CSS-pixel threshold', () => {
  const { canvas, controller, interaction, windowLike } = createCameraInteractionFixture()
  const down = createPointerEvent(7, 20, 20)
  const tinyMove = createPointerEvent(7, 23, 23)
  const up = createPointerEvent(7, 23, 23, { buttons: 0 })

  canvas.emit('pointerdown', down)
  windowLike.emit('pointermove', tinyMove)
  canvas.emit('pointerup', up)
  assert.equal(down.prevented, 0, 'a normal click keeps Cesium LEFT_CLICK alive')
  assert.equal(down.stopped, 0)
  assert.equal(tinyMove.prevented, 0, 'sub-threshold movement remains a click candidate')
  assert.equal(controller.enableInputs, false)

  const dragDown = createPointerEvent(8, 40, 40)
  const thresholdMove = createPointerEvent(8, 46, 40)
  const laterMove = createPointerEvent(8, 55, 40)
  canvas.emit('pointerdown', dragDown)
  windowLike.emit('pointermove', thresholdMove)
  windowLike.emit('pointermove', laterMove)
  assert.equal(thresholdMove.prevented, 1, 'threshold-crossing move disables native drag without stopping Cesium tracking')
  assert.equal(thresholdMove.stopped, 0)
  assert.equal(laterMove.stopped, 1, 'later drag movement is exclusively handled by the adapter')
  canvas.emit('pointerup', createPointerEvent(8, 55, 40, { buttons: 0 }))
  interaction.destroy()
})

test('compatibility profile keeps pan while disabling shift and middle-button orbit', () => {
  const { camera, cameraCalls, canvas, interaction, windowLike } = createCameraInteractionFixture({
    advancedGestures: false,
  })
  const down = createPointerEvent(20, 40, 40, { shiftKey: true })
  canvas.emit('pointerdown', down)
  windowLike.emit('pointermove', createPointerEvent(20, 60, 40, { shiftKey: true }))
  assert.equal(cameraCalls.length, 0, 'shift-drag does not orbit in compatibility mode')
  assert.notEqual(camera.position.x, 0, 'the same drag remains a predictable pan')
  canvas.emit('pointerup', createPointerEvent(20, 60, 40, { buttons: 0 }))

  const middle = createPointerEvent(21, 60, 60, {
    button: 1,
    buttons: BUTTON_MASK.MIDDLE,
  })
  canvas.emit('pointerdown', middle)
  windowLike.emit('pointermove', createPointerEvent(21, 80, 60, {
    button: 1,
    buttons: BUTTON_MASK.MIDDLE,
  }))
  assert.equal(cameraCalls.length, 0)
  interaction.destroy()
})

test('window pointer moves keep a drag active when pointer capture is unavailable', () => {
  const { canvas, camera, interaction, windowLike } = createCameraInteractionFixture()
  canvas.setPointerCapture = undefined
  canvas.hasPointerCapture = undefined

  canvas.emit('pointerdown', createPointerEvent(12, 50, 50))
  windowLike.emit('pointermove', createPointerEvent(12, 70, 50))

  assert.notEqual(camera.position.x, 0, 'a window-level move still pans after canvas drag start')
  windowLike.emit('pointerup', createPointerEvent(12, 70, 50, { buttons: 0 }))
  interaction.destroy()
})

test('two-pointer operation waits for a threshold, locks its type, and ends only after both fingers lift', () => {
  const { cameraCalls, canvas, controller, interaction, windowLike } = createCameraInteractionFixture()

  canvas.emit('pointerdown', createTouchEvent(1, 0, 0, 'pointerdown'))
  canvas.emit('pointerdown', createTouchEvent(2, 100, 0, 'pointerdown'))
  windowLike.emit('pointermove', createTouchEvent(1, 1, 1))
  assert.equal(cameraCalls.length, 0, 'sub-threshold movement must not pan or rotate first')

  windowLike.emit('pointermove', createTouchEvent(1, 0, 0))
  windowLike.emit('pointermove', createTouchEvent(2, 0, 100))
  assert.equal(cameraCalls.length, 1)
  assert.equal(cameraCalls.at(-1).range.pitch, -0.5, 'the gesture initially locks as heading rotation')

  // This would classify as pinch from the initial pair, but must remain rotation.
  windowLike.emit('pointermove', createTouchEvent(1, 0, 30))
  assert.equal(cameraCalls.length, 2)
  assert.equal(cameraCalls.at(-1).range.pitch, -0.5)

  canvas.emit('pointerup', createTouchEvent(1, 0, 30, 'pointerup'))
  windowLike.emit('pointermove', createTouchEvent(2, 0, 130))
  assert.equal(cameraCalls.length, 2, 'no one-finger operation starts after a locked two-finger gesture')
  assert.equal(controller.enableInputs, false)

  canvas.emit('pointerup', createTouchEvent(2, 0, 130, 'pointerup'))
  assert.equal(controller.enableInputs, false, 'the original controller input state is restored exactly')
  interaction.destroy()
})
