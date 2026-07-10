import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLocationLifecycleTarget } from '../src/map/location-lifecycle.js'

function createEventTarget () {
  const listeners = new Map()
  return {
    visibilityState: 'visible',
    addEventListener (name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(listener)
    },
    removeEventListener (name, listener) {
      listeners.get(name)?.delete(listener)
    },
    emit (name) {
      for (const listener of listeners.get(name) || []) listener()
    },
  }
}

test('location lifecycle routes document and window events without leaking listeners', () => {
  const documentRef = createEventTarget()
  const windowRef = createEventTarget()
  const lifecycle = createLocationLifecycleTarget({ documentRef, windowRef })
  let freezes = 0
  let pageshows = 0
  const onFreeze = () => { freezes += 1 }
  const onPageshow = () => { pageshows += 1 }

  lifecycle.addEventListener('freeze', onFreeze)
  lifecycle.addEventListener('pageshow', onPageshow)
  documentRef.emit('freeze')
  windowRef.emit('pageshow')

  assert.equal(freezes, 1)
  assert.equal(pageshows, 1)
  assert.equal(lifecycle.isVisible(), true)

  lifecycle.removeEventListener('freeze', onFreeze)
  lifecycle.removeEventListener('pageshow', onPageshow)
  documentRef.emit('freeze')
  windowRef.emit('pageshow')
  assert.equal(freezes, 1)
  assert.equal(pageshows, 1)

  documentRef.visibilityState = 'hidden'
  assert.equal(lifecycle.isVisible(), false)
})
