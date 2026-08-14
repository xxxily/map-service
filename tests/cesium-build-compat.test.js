import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CESIUM_GROUNDED_AMBIENT_COMMENT,
  CESIUM_UPSTREAM_AMBIENT_COMMENT,
  normalizeCesiumShaderComments,
} from '../scripts/cesium-build-compat.js'

test('Cesium shader bundle keeps the ambient term but replaces the upstream placeholder comment', () => {
  const source = `${CESIUM_UPSTREAM_AMBIENT_COMMENT}\nvec3 materialDiffuse = material.diffuse * 0.5;\n${CESIUM_UPSTREAM_AMBIENT_COMMENT}`
  const normalized = normalizeCesiumShaderComments(source)

  assert.equal(normalized.includes(CESIUM_UPSTREAM_AMBIENT_COMMENT), false)
  assert.equal(normalized.split(CESIUM_GROUNDED_AMBIENT_COMMENT).length - 1, 2)
  assert.match(normalized, /vec3 materialDiffuse = material\.diffuse \* 0\.5;/)
})

test('Cesium shader comment normalization leaves non-string bundle values unchanged', () => {
  const value = { type: 'chunk' }
  assert.equal(normalizeCesiumShaderComments(value), value)
})
