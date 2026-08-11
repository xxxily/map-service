import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getKmlFeatureDisplayName,
  getKmlFeatureFallbackName,
  getKmlFeatureNamePresentation,
} from '../src/map/kml-feature-name.js'

test('point names are optional and legacy unnamed placeholders stay visually hidden', () => {
  assert.equal(getKmlFeatureDisplayName({ type: 'Point', name: '' }), '')
  assert.equal(getKmlFeatureDisplayName({ type: 'Point', name: '   ' }), '')
  assert.equal(getKmlFeatureDisplayName({ type: 'Point', name: '未命名点位' }), '')
  assert.equal(getKmlFeatureDisplayName({ type: 'Point', name: '未命名要素 12' }), '')
  assert.equal(getKmlFeatureDisplayName({ type: 'Point', name: '  山顶机位  ' }), '山顶机位')
})

test('feature name presentation hides only unnamed points while retaining accessible and geometry fallbacks', () => {
  assert.deepEqual(getKmlFeatureNamePresentation({ type: 'Point', name: '' }), {
    displayName: '',
    accessibleName: '未命名点位',
  })
  assert.deepEqual(getKmlFeatureNamePresentation({ type: 'LineString', name: '' }), {
    displayName: '未命名线段',
    accessibleName: '未命名线段',
  })
  assert.deepEqual(getKmlFeatureNamePresentation({ type: 'Polygon', name: '' }), {
    displayName: '未命名区域',
    accessibleName: '未命名区域',
  })
  assert.equal(getKmlFeatureFallbackName({ type: 'Point' }), '未命名点位')
})
