import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getMotionSafeDuration } from '../src/map3d/motion.js'

test('motion duration is immediate for reduced motion and bounded for invalid input', () => {
  assert.equal(getMotionSafeDuration(0.6, true), 0)
  assert.equal(getMotionSafeDuration(0.6, false), 0.6)
  assert.equal(getMotionSafeDuration(-1, false), 0)
  assert.equal(getMotionSafeDuration(Number.NaN, false), 0)
})
