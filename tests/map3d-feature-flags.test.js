import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getCameraInteractionProfile,
  isBuildFeatureEnabled,
} from '../src/map3d/feature-flags.js'

test('build feature flags accept explicit rollback values and preserve defaults', () => {
  assert.equal(isBuildFeatureEnabled(undefined, true), true)
  assert.equal(isBuildFeatureEnabled('', false), false)
  assert.equal(isBuildFeatureEnabled('false'), false)
  assert.equal(isBuildFeatureEnabled('OFF'), false)
  assert.equal(isBuildFeatureEnabled('1'), true)
})

test('camera interaction profile maps rollout flags to enhanced or compatibility', () => {
  assert.equal(getCameraInteractionProfile(undefined), 'enhanced')
  assert.equal(getCameraInteractionProfile('enhanced'), 'enhanced')
  assert.equal(getCameraInteractionProfile('true'), 'enhanced')
  assert.equal(getCameraInteractionProfile('compatibility'), 'compatibility')
  assert.equal(getCameraInteractionProfile('false'), 'compatibility')
  assert.equal(getCameraInteractionProfile('', 'compatibility'), 'compatibility')
})
