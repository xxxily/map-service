import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import {
  CESIUM_GROUNDED_AMBIENT_COMMENT,
  CESIUM_UPSTREAM_AMBIENT_COMMENT,
  MAPLIBRE_SHADER_STABLE_LINE,
  MAPLIBRE_SHADER_TRAILING_SPACE,
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

test('generated shader normalization matches the real MapLibre bundle and preserves unrelated spaces', () => {
  const mapLibreBundle = readFileSync(new URL('../node_modules/maplibre-gl/dist/maplibre-gl.js', import.meta.url), 'utf8')
  assert.equal(mapLibreBundle.includes(MAPLIBRE_SHADER_TRAILING_SPACE), true)

  const template = `label  \n${mapLibreBundle}next  `
  const normalized = normalizeCesiumShaderComments(template)
  assert.equal(normalized.includes(MAPLIBRE_SHADER_TRAILING_SPACE), false)
  assert.equal(normalized.includes(MAPLIBRE_SHADER_STABLE_LINE), true)
  assert.equal(normalized.startsWith('label  \n'), true)
  assert.equal(normalized.endsWith('next  '), true)
})
