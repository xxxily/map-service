import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkPublishedResourceReferences,
  inspectPublishedResourceReferences,
  isValidResourceRef,
  normalizeResourceRef,
  validateResourceRef,
} from '../shared/interaction-resource-ref.js'

const ids = {
  sharePublicId: 'shr_public_abc123',
  shareItemId: 'shi_item123',
  featureId: 'feature_point123',
  mediaId: 'media_image123',
}

test('normalizes a feature reference and applies the site default', () => {
  const { mediaId: _mediaId, ...featureIds } = ids
  const result = normalizeResourceRef({ ...featureIds, scope: ' FEATURE ' })
  assert.equal(result.valid, true)
  assert.deepEqual(result.resourceRef, { siteId: 'map-service', ...featureIds, scope: 'feature', mediaId: '' })
  assert.deepEqual(validateResourceRef(result.resourceRef), [])
  assert.equal(isValidResourceRef(result.resourceRef), true)
})

test('enforces scope fields and rejects unknown fields', () => {
  const result = normalizeResourceRef({ ...ids, scope: 'share', extra: 'nope' })
  assert.equal(result.valid, false)
  assert.deepEqual(result.issues.map(item => item.code), ['UNKNOWN_FIELD', 'FIELD_NOT_ALLOWED', 'FIELD_NOT_ALLOWED'])
  assert.equal(isValidResourceRef({ sharePublicId: ids.sharePublicId, scope: 'share' }), true)
  assert.equal(isValidResourceRef({ sharePublicId: ids.sharePublicId, scope: 'media', shareItemId: ids.shareItemId, featureId: ids.featureId }), false)
})

test('rejects malformed and overlong stable identifiers', () => {
  const result = normalizeResourceRef({ sharePublicId: 'shr_public_!', scope: 'feature', shareItemId: 'shi_x', featureId: `feature_${'x'.repeat(160)}` })
  assert.equal(result.valid, false)
  assert.ok(result.issues.some(item => item.code === 'ID_INVALID' && item.path === 'sharePublicId'))
  assert.ok(result.issues.some(item => item.code === 'ID_TOO_LONG' && item.path === 'featureId'))
})

test('published snapshot inspection reports missing, duplicate and invalid feature/media IDs', () => {
  const issues = inspectPublishedResourceReferences({
    features: [
      { id: 'feature_a', media: [{ id: 'media_a' }, { id: 'media_a' }, {}] },
      { id: 'feature_a', media: [{ id: 'bad media id' }] },
      { media: [] },
    ],
  })
  assert.deepEqual(issues.map(item => item.code), [
    'MEDIA_ID_DUPLICATE', 'MEDIA_ID_MISSING', 'FEATURE_ID_DUPLICATE',
    'MEDIA_ID_INVALID', 'FEATURE_ID_MISSING',
  ])
  assert.deepEqual(checkPublishedResourceReferences({ features: [{ id: 'feature_a', media: [{ id: 'media_a' }] }] }), [])
})

test('snapshot inspection can require valid share identifiers', () => {
  const issues = inspectPublishedResourceReferences({ features: [] }, { requireShareIds: true, sharePublicId: 'bad', shareItemId: '' })
  assert.deepEqual(issues.map(item => item.code), ['SHARE_PUBLIC_ID_INVALID', 'SHARE_ITEM_ID_INVALID'])
})

test('snapshot inspection rejects malformed snapshots instead of treating them as empty', () => {
  assert.deepEqual(inspectPublishedResourceReferences({}), [
    { code: 'FEATURES_INVALID', path: 'features', message: 'published snapshot 的 features 必须是数组' },
  ])
  assert.deepEqual(inspectPublishedResourceReferences(null), [
    { code: 'SNAPSHOT_INVALID', path: '', message: '公开快照必须是对象' },
    { code: 'FEATURES_INVALID', path: 'features', message: 'published snapshot 的 features 必须是数组' },
  ])
})
