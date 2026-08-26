import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createKmlDirectoryBatchSelectionModel,
  toggleKmlDirectoryBatchSelectionAll,
} from '../src/map/kml-directory-batch.js'

test('directory batch selection is isolated to one directory and resets on mode changes', () => {
  const selection = createKmlDirectoryBatchSelectionModel()

  assert.equal(selection.active, false)
  selection.activate('directory-a')
  assert.equal(selection.isActive('directory-a'), true)
  assert.equal(selection.isActive('directory-b'), false)
  assert.equal(selection.toggle('file-a'), true)
  assert.equal(selection.toggle('file-a'), false)

  selection.selectAll(['file-a', 'file-b', 'file-b', ''])
  assert.deepEqual(selection.getSelectedIds(), ['file-a', 'file-b'])
  selection.activate('directory-b')
  assert.equal(selection.count, 0)
  assert.equal(selection.directoryId, 'directory-b')

  selection.deactivate()
  assert.equal(selection.active, false)
  assert.deepEqual(selection.getSelectedIds(), [])
})

test('directory batch selection prunes files that leave the active directory', () => {
  const selection = createKmlDirectoryBatchSelectionModel()
  selection.activate('directory-a')
  selection.selectAll(['file-a', 'file-b', 'file-c'])

  assert.equal(selection.prune(['file-a', 'file-c']), 2)
  assert.deepEqual(selection.getSelectedIds(), ['file-a', 'file-c'])
  selection.clear()
  assert.equal(selection.count, 0)
  assert.equal(selection.toggle(''), false)
})

test('directory select-all changes selection only after every KML detail loads', async () => {
  const selection = createKmlDirectoryBatchSelectionModel()
  const files = [{ id: 'file-a' }, { id: 'file-b' }, { id: 'file-c' }]
  selection.activate('directory-a')
  selection.toggle('file-a')

  const failed = await toggleKmlDirectoryBatchSelectionAll({
    selection,
    directoryId: 'directory-a',
    files,
    loadFiles: async () => [true, false, true],
  })
  assert.equal(failed.changed, false)
  assert.equal(failed.failedFile, files[1])
  assert.deepEqual(selection.getSelectedIds(), ['file-a'])

  let loadCalls = 0
  const selected = await toggleKmlDirectoryBatchSelectionAll({
    selection,
    directoryId: 'directory-a',
    files,
    loadFiles: async () => {
      loadCalls += 1
      return [true, true, true]
    },
  })
  assert.equal(selected.changed, true)
  assert.equal(selected.selected, true)
  assert.deepEqual(selection.getSelectedIds(), ['file-a', 'file-b', 'file-c'])

  const cleared = await toggleKmlDirectoryBatchSelectionAll({
    selection,
    directoryId: 'directory-a',
    files,
    loadFiles: async () => {
      loadCalls += 1
      return [true, true, true]
    },
  })
  assert.equal(cleared.selected, false)
  assert.equal(loadCalls, 1)
  assert.deepEqual(selection.getSelectedIds(), [])
})

test('directory select-all keeps selection when detail loading throws', async () => {
  const selection = createKmlDirectoryBatchSelectionModel()
  selection.activate('directory-a')
  selection.toggle('file-a')

  const result = await toggleKmlDirectoryBatchSelectionAll({
    selection,
    directoryId: 'directory-a',
    files: [{ id: 'file-a' }, { id: 'file-b' }],
    loadFiles: async () => { throw new Error('network unavailable') },
  })
  assert.equal(result.changed, false)
  assert.equal(result.reason, 'load-failed')
  assert.match(result.error.message, /network unavailable/)
  assert.deepEqual(selection.getSelectedIds(), ['file-a'])
})

test('directory select-all discards a stale result after selection mode is cancelled', async () => {
  const selection = createKmlDirectoryBatchSelectionModel()
  selection.activate('directory-a')
  let resolveLoad
  const resultPromise = toggleKmlDirectoryBatchSelectionAll({
    selection,
    directoryId: 'directory-a',
    files: [{ id: 'file-a' }, { id: 'file-b' }],
    loadFiles: () => new Promise(resolve => { resolveLoad = resolve }),
  })

  selection.deactivate()
  resolveLoad([true, true])

  const result = await resultPromise
  assert.deepEqual(result, { changed: false, reason: 'stale' })
  assert.equal(selection.active, false)
  assert.deepEqual(selection.getSelectedIds(), [])
})

test('directory select-all cannot overwrite a newer directory selection session', async () => {
  const selection = createKmlDirectoryBatchSelectionModel()
  selection.activate('directory-a')
  let resolveLoad
  const resultPromise = toggleKmlDirectoryBatchSelectionAll({
    selection,
    directoryId: 'directory-a',
    files: [{ id: 'file-a' }, { id: 'file-b' }],
    loadFiles: () => new Promise(resolve => { resolveLoad = resolve }),
  })

  selection.activate('directory-b')
  selection.toggle('file-c')
  resolveLoad([true, true])

  const result = await resultPromise
  assert.deepEqual(result, { changed: false, reason: 'stale' })
  assert.equal(selection.directoryId, 'directory-b')
  assert.deepEqual(selection.getSelectedIds(), ['file-c'])
})
