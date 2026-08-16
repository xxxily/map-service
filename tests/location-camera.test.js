import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  createLatestLocationRequestCoordinator,
  createLocationCameraCoordinator,
} from '../src/map/location-camera.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('latest location request aborts the older request and ignores stale completion', () => {
  const coordinator = createLatestLocationRequestCoordinator()
  const first = coordinator.begin()
  const second = coordinator.begin()

  assert.equal(first.signal.aborted, true)
  assert.equal(first.isCurrent(), false)
  assert.equal(second.signal.aborted, false)
  assert.equal(second.isCurrent(), true)

  first.complete()
  assert.equal(second.isCurrent(), true)

  second.complete()
  assert.equal(second.isCurrent(), false)
  assert.equal(coordinator.isActive(), false)
})

test('location camera keeps only the latest target while interaction is active', () => {
  let interacting = true
  let interactionEnd = null
  let unsubscribeCount = 0
  const applied = []
  const coordinator = createLocationCameraCoordinator({
    isInteractionActive: () => interacting,
    applyTarget: target => applied.push(target),
    subscribeInteractionEnd: callback => {
      interactionEnd = callback
      return () => {
        unsubscribeCount += 1
        interactionEnd = null
      }
    },
  })

  assert.equal(coordinator.update({ id: 'first' }), false)
  assert.equal(coordinator.update({ id: 'latest' }), false)
  assert.deepEqual(applied, [])
  assert.equal(typeof interactionEnd, 'function')

  interacting = false
  interactionEnd()

  assert.deepEqual(applied, [{ id: 'latest' }])
  assert.equal(coordinator.hasPending(), false)
  assert.equal(unsubscribeCount, 1)
})

test('location camera resubscribes when an end signal arrives before interaction settles', () => {
  let interacting = true
  let interactionEnd = null
  let subscribeCount = 0
  const applied = []
  const coordinator = createLocationCameraCoordinator({
    isInteractionActive: () => interacting,
    applyTarget: target => applied.push(target),
    subscribeInteractionEnd: callback => {
      subscribeCount += 1
      interactionEnd = callback
      return () => {}
    },
  })

  coordinator.update('target')
  interactionEnd()
  assert.deepEqual(applied, [])
  assert.equal(subscribeCount, 2)

  interacting = false
  interactionEnd()
  assert.deepEqual(applied, ['target'])
})

test('location camera cancellation drops deferred work and destroy rejects later updates', () => {
  let interacting = true
  const applied = []
  const coordinator = createLocationCameraCoordinator({
    isInteractionActive: () => interacting,
    applyTarget: target => applied.push(target),
  })

  coordinator.update('stale')
  coordinator.cancel()
  interacting = false
  assert.equal(coordinator.flush(), false)
  assert.deepEqual(applied, [])

  coordinator.destroy()
  assert.equal(coordinator.update('late'), false)
  assert.deepEqual(applied, [])
})

test('2D and 3D location integration prevents draggable fixes and overlapping tracking flights', () => {
  const location2d = fs.readFileSync(path.join(projectRoot, 'src/map/location.js'), 'utf8')
  const location3d = fs.readFileSync(path.join(projectRoot, 'src/map3d/location.js'), 'utf8')
  const app3d = fs.readFileSync(path.join(projectRoot, 'src/3d.js'), 'utf8')

  assert.doesNotMatch(location2d, /draggable:\s*true/)
  assert.match(location2d, /createLatestLocationRequestCoordinator/)
  assert.match(location2d, /createLocationCameraCoordinator/)
  assert.match(location2d, /animate:\s*false/)
  assert.match(location2d, /reset:\s*true/)

  assert.match(location3d, /createLatestLocationRequestCoordinator/)
  assert.match(location3d, /createLocationCameraCoordinator/)
  assert.match(location3d, /setLocationCameraInteraction3d/)
  assert.match(location3d, /cancelLocationCamera3d/)
  assert.doesNotMatch(location3d, /document\.addEventListener/)
  assert.doesNotMatch(location3d, /camera\?\.moveEnd/)
  assert.match(location3d, /cancelFlight\?\.\(\)/)
  assert.match(location3d, /duration:\s*isIntervalUpdate\s*\?\s*0/)
  assert.match(app3d, /const previousViewer = viewer/)
  assert.match(app3d, /previousViewer\.destroy\?\.\(\)/)
  assert.match(app3d, /const interactionViewer = viewer/)
})
