import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickGuidelineWorldPosition } from '../src/map3d/guidelines.js'
import { pickKmlWorldPosition } from '../src/map3d/kml.js'

const pickers = [
  ['KML', pickKmlWorldPosition],
  ['辅助线', pickGuidelineWorldPosition],
]

function createPickingFixture () {
  const calls = []
  const camera = {
    getPickRay (position) {
      calls.push('ray')
      return { position }
    },
    pickEllipsoid () {
      calls.push('ellipsoid')
      return { source: 'ellipsoid' }
    },
  }
  const scene = {
    pickPositionSupported: true,
    pickPosition () {
      calls.push('depth')
      return null
    },
    globe: {
      ellipsoid: {},
      pick () {
        calls.push('terrain')
        return { source: 'terrain' }
      },
    },
  }

  return { calls, camera, scene }
}

for (const [name, pickWorldPosition] of pickers) {
  test(`${name} 取点在深度不可用时回退到地形射线`, () => {
    const { calls, camera, scene } = createPickingFixture()

    assert.deepEqual(pickWorldPosition(scene, camera, { x: 12, y: 34 }), { source: 'terrain' })
    assert.deepEqual(calls, ['depth', 'ray', 'terrain'])
  })

  test(`${name} 取点在地形射线不可用时回退到椭球`, () => {
    const { calls, camera, scene } = createPickingFixture()
    scene.globe.pick = () => {
      calls.push('terrain')
      return null
    }

    assert.deepEqual(pickWorldPosition(scene, camera, { x: 12, y: 34 }), { source: 'ellipsoid' })
    assert.deepEqual(calls, ['depth', 'ray', 'terrain', 'ellipsoid'])
  })
}
