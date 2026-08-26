import assert from 'node:assert/strict'
import test from 'node:test'
import {
  KML_DETAIL_LOAD_CONCURRENCY,
  loadKmlFilesWithConcurrency,
} from '../src/map/kml-detail-loading.js'

test('KML detail loading keeps input order and enforces the concurrency limit', async () => {
  const files = Array.from({ length: 11 }, (_, index) => ({ id: `file-${index}` }))
  let active = 0
  let peak = 0

  const results = await loadKmlFilesWithConcurrency(files, async (file, index) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolve => setImmediate(resolve))
    active -= 1
    return `${index}:${file.id}`
  })

  assert.equal(peak, KML_DETAIL_LOAD_CONCURRENCY)
  assert.deepEqual(results, files.map((file, index) => `${index}:${file.id}`))
})

test('KML detail loading handles empty input and clamps invalid limits', async () => {
  assert.deepEqual(await loadKmlFilesWithConcurrency([], async () => true), [])

  let active = 0
  let peak = 0
  const results = await loadKmlFilesWithConcurrency([1, 2, 3], async value => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolve => setImmediate(resolve))
    active -= 1
    return value * 2
  }, 0)

  assert.equal(peak, 1)
  assert.deepEqual(results, [2, 4, 6])
})
