import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPublishedFeatureResourceRefs,
  decoratePublishedSnapshot,
  inspectPublishedResourceReferences,
  normalizePublishedFeatureId,
  resolvePublishedResourceRef,
} from '../shared/interaction-resource-ref.js'

function duplicateMediaContentView (mediaId = 'media_shared') {
  const item = {
    id: 'description-link-1',
    type: 'image',
    sourceType: 'description-link',
    url: 'https://cdn.example.com/duplicate.jpg',
    displayUrl: 'https://cdn.example.com/duplicate.jpg',
    mediaId,
  }
  return {
    groups: [{ type: 'image', items: [item, { ...item, id: 'description-link-2' }] }],
    sourceSummary: { truncated: false },
  }
}

function snapshotFor (description, featureId = 'point-one') {
  return {
    features: [{
      id: featureId,
      type: 'Point',
      name: '入口',
      description,
      coordinates: [113.2, 23.1],
    }],
  }
}

test('published resource index keeps media identity across title edits', () => {
  const initial = decoratePublishedSnapshot(snapshotFor('<img src="https://cdn.example.com/a.jpg" alt="旧标题">'), { force: true })
  const renamed = decoratePublishedSnapshot(snapshotFor('<img src="https://cdn.example.com/a.jpg" alt="新标题">'), { force: true })
  const changedUrl = decoratePublishedSnapshot(snapshotFor('<img src="https://cdn.example.com/b.jpg" alt="新标题">'), { force: true })

  const initialMedia = initial.features[0].resourceRefs.media[0]
  assert.match(initialMedia.mediaId, /^media_[a-f0-9]{32}$/)
  assert.equal(renamed.features[0].resourceRefs.media[0].mediaId, initialMedia.mediaId)
  assert.notEqual(changedUrl.features[0].resourceRefs.media[0].mediaId, initialMedia.mediaId)
  assert.deepEqual(inspectPublishedResourceReferences(initial), [])
})

test('duplicate media URLs receive distinct stable IDs even when content view reused mediaId', () => {
  const feature = { id: 'point-one' }
  const first = buildPublishedFeatureResourceRefs(feature, {
    contentView: duplicateMediaContentView(),
  })
  const second = buildPublishedFeatureResourceRefs(feature, {
    contentView: duplicateMediaContentView(),
  })

  assert.equal(first.media.length, 2)
  assert.notEqual(first.media[0].mediaId, first.media[1].mediaId)
  assert.deepEqual(first.media.map(item => item.mediaId), second.media.map(item => item.mediaId))
  assert.match(first.media[1].mediaId, /^media_[a-f0-9]{32}$/)
})

test('legacy feature IDs are retained when safe and normalized when unsafe', () => {
  assert.equal(normalizePublishedFeatureId('point-one'), 'point-one')
  assert.equal(normalizePublishedFeatureId('入口点位'), '入口点位')
  assert.match(normalizePublishedFeatureId('bad/id'), /^feature_[a-f0-9]{32}$/)
  assert.match(normalizePublishedFeatureId('bad\u0000id'), /^feature_[a-f0-9]{32}$/)
  assert.match(normalizePublishedFeatureId('bad\u200Bid'), /^feature_[a-f0-9]{32}$/)
})

test('partially present resource metadata fails closed instead of being treated as legacy', () => {
  const snapshot = decoratePublishedSnapshot(snapshotFor('<img src="https://cdn.example.com/a.jpg">'), { force: true })
  const missingMedia = structuredClone(snapshot)
  delete missingMedia.features[0].resourceRefs.media
  assert.ok(inspectPublishedResourceReferences(missingMedia).some(issue => issue.code === 'MEDIA_REFS_INVALID'))

  const unknownField = structuredClone(snapshot)
  unknownField.features[0].resourceRefs.media[0].url = 'https://secret.example.com/?token=hidden'
  assert.ok(inspectPublishedResourceReferences(unknownField).some(issue => issue.code === 'MEDIA_REF_UNKNOWN_FIELD'))

  const missingRootVersion = structuredClone(snapshot)
  delete missingRootVersion.resourceRefsVersion
  assert.ok(inspectPublishedResourceReferences(missingRootVersion).some(issue => issue.code === 'RESOURCE_REFS_VERSION_MISSING'))
})

test('tampered published resource metadata fails closed and valid refs resolve', () => {
  const snapshot = decoratePublishedSnapshot(snapshotFor('<img src="https://cdn.example.com/a.jpg">'), { force: true })
  const feature = snapshot.features[0]
  const mediaId = feature.resourceRefs.media[0].mediaId
  const ref = {
    sharePublicId: 'public_alias_1234567890',
    shareItemId: 'shi_item_123',
    featureId: feature.resourceRefs.featureId,
    mediaId,
    scope: 'media',
  }
  assert.equal(resolvePublishedResourceRef(snapshot, ref).valid, true)

  const tampered = structuredClone(snapshot)
  tampered.features[0].resourceRefs.media[0].mediaId = 'media_tampered'
  assert.ok(inspectPublishedResourceReferences(tampered).some(issue => issue.code === 'MEDIA_REFS_MISMATCH'))
  assert.equal(resolvePublishedResourceRef(tampered, ref).valid, false)
})
