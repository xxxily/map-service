import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reorderKmlFeature, transferKmlFeature } from '../src/map/kml-feature-operations.js'

function files () {
  return [
    { id: 'a', name: 'A', features: [{ id: 'one', type: 'Point', coordinates: [1, 1] }, { id: 'two', type: 'LineString', coordinates: [[1, 1], [2, 2]] }, { id: 'three', type: 'Point', coordinates: [3, 3] }] },
    { id: 'b', name: 'B', features: [{ id: 'four', type: 'Point', coordinates: [4, 4] }] },
  ]
}

test('reorders a feature before another feature without mutating input', () => {
  const source = files()
  const result = reorderKmlFeature(source, { kmlId: 'a', featureId: 'three', beforeFeatureId: 'one' })

  assert.deepEqual(result.files[0].features.map(feature => feature.id), ['three', 'one', 'two'])
  assert.deepEqual(source[0].features.map(feature => feature.id), ['one', 'two', 'three'])
  assert.equal(result.changed, true)
})

test('moves a feature across files and keeps its id', () => {
  const result = transferKmlFeature(files(), {
    sourceKmlId: 'a',
    targetKmlId: 'b',
    featureId: 'two',
    mode: 'move',
  })

  assert.deepEqual(result.files[0].features.map(feature => feature.id), ['one', 'three'])
  assert.deepEqual(result.files[1].features.map(feature => feature.id), ['four', 'two'])
  assert.equal(result.featureId, 'two')
})

test('moving rejects a target feature id collision', () => {
  const source = files()
  source[1].features.push({ id: 'two', type: 'Point', coordinates: [5, 5] })

  assert.throws(() => transferKmlFeature(source, {
    sourceKmlId: 'a',
    targetKmlId: 'b',
    featureId: 'two',
    mode: 'move',
  }), /相同 ID/)
  assert.deepEqual(source[0].features.map(feature => feature.id), ['one', 'two', 'three'])
})

test('copies an edited feature with a new id and keeps source unchanged', () => {
  const result = transferKmlFeature(files(), {
    sourceKmlId: 'a',
    targetKmlId: 'b',
    featureId: 'one',
    mode: 'copy',
    featurePatch: { name: '副本' },
    idFactory: () => 'copy-one',
  })

  assert.equal(result.files[0].features[0].name, undefined)
  assert.deepEqual(result.files[0].features.map(feature => feature.id), ['one', 'two', 'three'])
  assert.equal(result.files[1].features.at(-1).id, 'copy-one')
  assert.equal(result.files[1].features.at(-1).name, '副本')
})

test('clones nested polygon coordinates so later edits cannot mutate the source', () => {
  const source = files()
  source[0].features.push({
    id: 'area',
    type: 'Polygon',
    coordinates: [[[1, 1], [2, 2], [1, 1]]],
  })

  const result = transferKmlFeature(source, {
    sourceKmlId: 'a',
    targetKmlId: 'b',
    featureId: 'area',
    mode: 'copy',
    idFactory: () => 'copy-area',
  })
  result.files[1].features.at(-1).coordinates[0][0][0] = 99

  assert.equal(source[0].features.at(-1).coordinates[0][0][0], 1)
})

test('same-file copy can insert before a target and same-file no-op reorder preserves order', () => {
  const source = files()
  const copied = transferKmlFeature(source, {
    sourceKmlId: 'a',
    targetKmlId: 'a',
    featureId: 'two',
    mode: 'copy',
    beforeFeatureId: 'three',
    idFactory: () => 'copy-two',
  })
  assert.deepEqual(copied.files[0].features.map(feature => feature.id), ['one', 'two', 'copy-two', 'three'])

  const noop = reorderKmlFeature(source, { kmlId: 'a', featureId: 'two', beforeFeatureId: 'two' })
  assert.deepEqual(noop.files[0].features.map(feature => feature.id), ['one', 'two', 'three'])
  assert.equal(noop.changed, false)
})

test('same-file move applies an edit patch and reports content changes', () => {
  const source = files()
  const result = transferKmlFeature(source, {
    sourceKmlId: 'a',
    targetKmlId: 'a',
    featureId: 'one',
    mode: 'move',
    beforeFeatureId: 'one',
    featurePatch: { name: '已更新' },
  })

  assert.equal(result.changed, true)
  assert.equal(result.files[0].features[0].name, '已更新')
  assert.equal(source[0].features[0].name, undefined)
})

test('copy only rejects an id collision in the target file', () => {
  const source = files()
  source[0].features.push({ id: 'shared-id', type: 'Point', coordinates: [5, 5] })

  const result = transferKmlFeature(source, {
    sourceKmlId: 'a',
    targetKmlId: 'b',
    featureId: 'one',
    mode: 'copy',
    idFactory: () => 'shared-id',
  })

  assert.equal(result.files[1].features.at(-1).id, 'shared-id')
})

test('copying a resource collection deep-clones items and null patches remove the optional field', () => {
  const source = files()
  source[0].features[0].resourceCollection = {
    version: 1,
    viewMode: 'grid',
    items: [{ id: 'res-1', title: '原始', url: 'https://example.com/a.jpg', type: 'image' }],
  }
  const copied = transferKmlFeature(source, {
    sourceKmlId: 'a',
    targetKmlId: 'b',
    featureId: 'one',
    mode: 'copy',
    idFactory: () => 'copy-collection',
  })
  copied.files[1].features.at(-1).resourceCollection.items[0].title = '副本'
  assert.equal(source[0].features[0].resourceCollection.items[0].title, '原始')

  const removed = transferKmlFeature(source, {
    sourceKmlId: 'a',
    targetKmlId: 'b',
    featureId: 'one',
    mode: 'copy',
    featurePatch: { resourceCollection: null },
    idFactory: () => 'copy-without-collection',
  })
  assert.equal(Object.hasOwn(removed.files[1].features.at(-1), 'resourceCollection'), false)
})

test('transferring a status-only collection point can explicitly clear its status', () => {
  const source = files()
  source[0].features[0].resourceCollectionStatus = { version: 1, sourceType: 'personal', accessState: 'private' }
  const result = transferKmlFeature(source, {
    sourceKmlId: 'a',
    targetKmlId: 'b',
    featureId: 'one',
    mode: 'copy',
    featurePatch: {
      resourceCollection: null,
      resourceCollectionRef: null,
      resourceCollectionStatus: null,
    },
    idFactory: () => 'copy-status-cleared',
  })
  assert.equal(Object.hasOwn(result.files[1].features.at(-1), 'resourceCollectionStatus'), false)
})

test('dropping a feature on its file appends it to the end', () => {
  const result = reorderKmlFeature(files(), { kmlId: 'a', featureId: 'one' })

  assert.deepEqual(result.files[0].features.map(feature => feature.id), ['two', 'three', 'one'])
  assert.equal(result.changed, true)
})
