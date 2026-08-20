import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyKmlFeatureBatch,
  createKmlBatchSelectionModel,
  getKmlBatchSelectionKey,
  parseKmlBatchSelectionKey,
} from '../src/map/kml-batch-operations.js'

function files () {
  return [
    { id: 'a', name: 'A', features: [{ id: 'one', type: 'Point', coordinates: [1, 1] }, { id: 'two', type: 'LineString', coordinates: [[1, 1], [2, 2]] }] },
    { id: 'b', name: 'B', features: [{ id: 'three', type: 'Point', coordinates: [3, 3] }] },
  ]
}

test('batch move preserves stable order and ids across files', () => {
  const source = files()
  const result = applyKmlFeatureBatch(source, {
    selection: [{ kmlId: 'a', featureId: 'two' }, { kmlId: 'a', featureId: 'one' }],
    mode: 'move',
    targetKmlId: 'b',
  })
  assert.deepEqual(result.files[0].features, [])
  assert.deepEqual(result.files[1].features.map(feature => feature.id), ['three', 'one', 'two'])
  assert.deepEqual(source[0].features.map(feature => feature.id), ['one', 'two'])
  assert.equal(result.movedCount, 2)
})

test('batch copy deep clones all selected features and creates unique ids', () => {
  const source = files()
  source[0].features[0].resourceCollection = { items: [{ url: 'https://example.com/a.jpg' }] }
  let id = 0
  const result = applyKmlFeatureBatch(source, {
    selection: [{ kmlId: 'a', featureId: 'one' }, { kmlId: 'b', featureId: 'three' }],
    mode: 'copy',
    targetKmlId: 'b',
    idFactory: () => `copy-${++id}`,
  })
  assert.deepEqual(result.files[1].features.map(feature => feature.id), ['three', 'copy-1', 'copy-2'])
  result.files[1].features[1].resourceCollection.items[0].url = 'https://example.com/changed.jpg'
  assert.equal(source[0].features[0].resourceCollection.items[0].url, 'https://example.com/a.jpg')
  assert.equal(result.copiedCount, 2)
})

test('batch delete is atomic when a selection is invalid', () => {
  const source = files()
  assert.throws(() => applyKmlFeatureBatch(source, {
    selection: [{ kmlId: 'a', featureId: 'one' }, { kmlId: 'missing', featureId: 'two' }],
    mode: 'delete',
  }), /来源 KML 文件不存在/)
  assert.deepEqual(source[0].features.map(feature => feature.id), ['one', 'two'])
})

test('batch move rejects target id collisions without mutating input', () => {
  const source = files()
  source[1].features.push({ id: 'one', type: 'Point', coordinates: [8, 8] })
  assert.throws(() => applyKmlFeatureBatch(source, {
    selection: [{ kmlId: 'a', featureId: 'one' }],
    mode: 'move',
    targetKmlId: 'b',
  }), /相同 ID/)
  assert.deepEqual(source[0].features.map(feature => feature.id), ['one', 'two'])
})

test('selection keys round-trip ids containing colons', () => {
  const key = getKmlBatchSelectionKey('kml:one', 'feature:two')
  assert.deepEqual(parseKmlBatchSelectionKey(key), { kmlId: 'kml:one', featureId: 'feature:two' })
})

test('moving selections already in the target is a no-op while mixed selections only move external items', () => {
  const source = files()
  const noop = applyKmlFeatureBatch(source, {
    selection: [{ kmlId: 'a', featureId: 'one' }],
    mode: 'move',
    targetKmlId: 'a',
  })
  assert.equal(noop.changed, false)
  assert.equal(noop.files, source)

  const mixed = applyKmlFeatureBatch(source, {
    selection: [{ kmlId: 'a', featureId: 'one' }, { kmlId: 'b', featureId: 'three' }],
    mode: 'move',
    targetKmlId: 'a',
  })
  assert.deepEqual(mixed.files[0].features.map(feature => feature.id), ['one', 'two', 'three'])
  assert.deepEqual(mixed.files[1].features, [])
  assert.equal(mixed.movedCount, 1)
})

test('batch selection model toggles, prunes and deactivates ephemeral selections', () => {
  const model = createKmlBatchSelectionModel()
  model.activate()
  model.select([{ kmlId: 'a', featureId: 'one' }, { kmlId: 'b', featureId: 'three' }, { kmlId: 'a', featureId: 'one' }])
  assert.equal(model.isActive(), true)
  assert.equal(model.count, 2)
  model.invert([{ kmlId: 'a', featureId: 'one' }, { kmlId: 'a', featureId: 'two' }])
  assert.deepEqual(model.getSelection(), [
    { kmlId: 'b', featureId: 'three' },
    { kmlId: 'a', featureId: 'two' },
  ])
  model.prune(item => item.kmlId === 'a')
  assert.deepEqual(model.getSelection(), [{ kmlId: 'a', featureId: 'two' }])
  model.deactivate()
  assert.equal(model.isActive(), false)
  assert.equal(model.count, 0)
})
