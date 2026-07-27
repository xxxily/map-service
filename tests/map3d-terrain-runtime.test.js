import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canStartTerrainAutoRetry,
  consumeTerrainAutoRetryAttempt,
  createTerrainAutoRetryState,
  createTerrainRuntimeState,
  evaluateTerrainVerification,
  getTerrainAutoRetryDelayMs,
  getSafeTerrainRuntimeOverride,
  getTerrainRetryControlState,
  pickSceneWorldPosition,
  reduceTerrainRuntime,
} from '../src/map3d/terrain-runtime.js'

test('runtime terrain overrides exclude endpoints and credentials', () => {
  const override = getSafeTerrainRuntimeOverride({
    enabled: false,
    provider: 'arcgis-terrain3d',
    quality: 'quality',
    exaggeration: 1.45,
    ionToken: 'must-not-pass',
    selfHostedUrl: 'https://private.example.test/terrain',
    mapTilerUrl: 'https://private.example.test/maptiler',
    demoView: { lng: 120, lat: 30, range: 32_000, heading: 20, pitch: -35, ignored: 'x' },
  })

  assert.deepEqual(override, {
    enabled: false,
    provider: 'arcgis-terrain3d',
    quality: 'quality',
    exaggeration: 1.45,
    demoView: { lng: 120, lat: 30, range: 32_000, heading: 20, pitch: -35 },
  })
})

test('terrain retry is only exposed after a degraded or fallback state', () => {
  assert.deepEqual(getTerrainRetryControlState('standby'), { hidden: true, disabled: true, busy: false })
  assert.deepEqual(getTerrainRetryControlState('loading'), { hidden: true, disabled: true, busy: true })
  assert.deepEqual(getTerrainRetryControlState('verifying'), { hidden: true, disabled: true, busy: true })
  assert.deepEqual(getTerrainRetryControlState('active'), { hidden: true, disabled: true, busy: false })
  assert.deepEqual(getTerrainRetryControlState('degraded'), { hidden: false, disabled: false, busy: false })
  assert.deepEqual(getTerrainRetryControlState('fallback'), { hidden: false, disabled: false, busy: false })
})

test('terrain runtime only becomes active after verified samples and keeps tile failures degraded', () => {
  let runtime = reduceTerrainRuntime(createTerrainRuntimeState(), { type: 'load' })
  assert.equal(runtime.state, 'loading')

  runtime = reduceTerrainRuntime(runtime, { type: 'ready' })
  assert.equal(runtime.state, 'verifying')

  runtime = reduceTerrainRuntime(runtime, { type: 'verification-passed' })
  assert.equal(runtime.state, 'active')
  assert.equal(runtime.verified, true)

  runtime = reduceTerrainRuntime(runtime, { type: 'tile-error' })
  assert.equal(runtime.state, 'degraded')
  assert.equal(runtime.tileErrors, 1)
  assert.equal(reduceTerrainRuntime(runtime, { type: 'verification-passed' }).state, 'degraded')
})

test('terrain verification failures and repeated tile errors follow the safe degradation path', () => {
  let runtime = reduceTerrainRuntime(createTerrainRuntimeState(), { type: 'load' })
  runtime = reduceTerrainRuntime(runtime, { type: 'ready' })
  runtime = reduceTerrainRuntime(runtime, { type: 'verification-failed' })
  assert.equal(runtime.state, 'degraded')
  assert.equal(runtime.verified, false)

  runtime = reduceTerrainRuntime(createTerrainRuntimeState({ state: 'active', verified: true }), { type: 'tile-error' })
  assert.equal(runtime.state, 'degraded')
  runtime = reduceTerrainRuntime(runtime, { type: 'tile-error' })
  assert.equal(runtime.state, 'degraded')
  runtime = reduceTerrainRuntime(runtime, { type: 'tile-error' })
  assert.equal(runtime.state, 'fallback')
})

test('terrain verification samples and automatic retry delays are bounded and deterministic', () => {
  const verified = evaluateTerrainVerification([
    { id: 'a', samples: [{ height: 1_000 }, { height: 1_250 }, { height: 1_120 }] },
    { id: 'b', samples: [{ height: 400 }, { height: 720 }, { height: 510 }] },
  ])
  assert.equal(verified.verified, true)
  assert.equal(verified.verifiedRegionCount, 2)
  assert.deepEqual(verified.regions.map(region => region.spread), [250, 320])

  const distantButFlat = evaluateTerrainVerification([
    { id: 'low-flat', samples: [{ height: 100 }, { height: 130 }, { height: 125 }] },
    { id: 'high-flat', samples: [{ height: 4_000 }, { height: 4_040 }, { height: 4_020 }] },
  ])
  assert.equal(distantButFlat.verified, false,
    'absolute height differences between regions must not impersonate local terrain relief')
  assert.equal(distantButFlat.verifiedRegionCount, 0)

  const missingRegion = evaluateTerrainVerification([
    { id: 'valid', samples: [{ height: 1_000 }, { height: 1_250 }] },
    { id: 'missing', samples: [{ height: Number.NaN }] },
  ])
  assert.equal(missingRegion.verified, false)
  assert.equal(missingRegion.regions[1].heightCount, 0)

  assert.equal(getTerrainAutoRetryDelayMs(0), 1_500)
  assert.equal(getTerrainAutoRetryDelayMs(1), 3_000)
  assert.equal(getTerrainAutoRetryDelayMs(2), null)
})

test('automatic retry budget is consumed only when a matching 3D fallback starts', () => {
  const retryable = {
    interactionMode: '3d',
    key: 'terrain-a',
    runtimeKey: 'terrain-a',
    state: 'fallback',
    autoRetryEligible: true,
  }
  assert.equal(canStartTerrainAutoRetry(retryable), true)
  assert.equal(canStartTerrainAutoRetry({ ...retryable, interactionMode: '2d' }), false)
  assert.equal(canStartTerrainAutoRetry({ ...retryable, runtimeKey: 'terrain-b' }), false)
  assert.equal(canStartTerrainAutoRetry({ ...retryable, state: 'active' }), false)

  let state = createTerrainAutoRetryState({ key: 'terrain-a' })
  let consumed = consumeTerrainAutoRetryAttempt(state)
  assert.equal(consumed.started, true)
  assert.equal(consumed.state.attempts, 1)
  state = consumed.state
  consumed = consumeTerrainAutoRetryAttempt(state)
  assert.equal(consumed.started, true)
  assert.equal(consumed.state.attempts, 2)
  consumed = consumeTerrainAutoRetryAttempt(consumed.state)
  assert.equal(consumed.started, false)
  assert.equal(consumed.state.attempts, 2)
})

test('scene world pick prefers depth then terrain then ellipsoid', () => {
  const calls = []
  const camera = {
    getPickRay: () => {
      calls.push('ray')
      return { id: 'ray' }
    },
    pickEllipsoid: () => {
      calls.push('ellipsoid')
      return { id: 'ellipsoid' }
    },
  }
  const scene = {
    pickPosition: () => {
      calls.push('depth')
      return { id: 'depth' }
    },
    globe: {
      pick: () => {
        calls.push('terrain')
        return { id: 'terrain' }
      },
      ellipsoid: {},
    },
  }

  assert.deepEqual(pickSceneWorldPosition(camera, scene, { x: 1, y: 2 }), { id: 'depth' })
  assert.deepEqual(calls, ['depth'])

  scene.pickPosition = () => null
  calls.length = 0
  assert.deepEqual(pickSceneWorldPosition(camera, scene, { x: 1, y: 2 }), { id: 'terrain' })
  assert.deepEqual(calls, ['ray', 'terrain'])

  scene.globe.pick = () => {
    calls.push('terrain')
    return null
  }
  calls.length = 0
  assert.deepEqual(pickSceneWorldPosition(camera, scene, { x: 1, y: 2 }), { id: 'ellipsoid' })
  assert.deepEqual(calls, ['ray', 'terrain', 'ellipsoid'])
})
