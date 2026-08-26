import assert from 'node:assert/strict'
import test from 'node:test'
import {
  loadActiveShareFile,
  loadActiveShareFiles,
  setActiveShareForTests,
  setShareFileApiRequestForTests,
} from '../src/map/share-view.js'

test.afterEach(() => {
  setActiveShareForTests(null)
  setShareFileApiRequestForTests(null)
})

test('hidden share files stay summarized until an explicit detail load', async () => {
  let requests = 0
  setActiveShareForTests({
    publicId: 'share-lazy',
    manifest: {
      allowDownload: true,
      items: [{ shareItemId: 'hidden-file', name: '隐藏文件', visibleByDefault: false, enabled: false, featureCount: 8 }],
    },
  })
  setShareFileApiRequestForTests(async () => {
    requests += 1
    return { name: '隐藏文件', features: [{ id: 'point-1', type: 'Point', coordinates: [111, 22] }] }
  })

  const [summary] = await loadActiveShareFiles()
  assert.equal(requests, 0)
  assert.equal(summary.enabled, false)
  assert.equal(summary.contentLoaded, false)
  assert.equal(summary.featureCount, 8)

  await loadActiveShareFile(summary)
  assert.equal(requests, 1)
  assert.equal(summary.enabled, false)
  assert.equal(summary.contentLoaded, true)
  assert.equal(summary.features.length, 1)
})

test('concurrent detail loads share one request and preserve explicit runtime visibility', async () => {
  let requests = 0
  let release
  const pending = new Promise(resolve => { release = resolve })
  setActiveShareForTests({ publicId: 'share-concurrent', manifest: { allowDownload: false, items: [] } })
  setShareFileApiRequestForTests(async () => {
    requests += 1
    await pending
    return { name: '并发文件', features: [{ id: 'point-1', type: 'Point', coordinates: [111, 22] }] }
  })
  const file = { shareItemId: 'file-a', visibleByDefault: false, enabled: true, contentLoaded: false, features: [] }

  const first = loadActiveShareFile(file)
  const second = loadActiveShareFile(file)
  release()
  await Promise.all([first, second])

  assert.equal(requests, 1)
  assert.equal(file.enabled, true)
  assert.equal(file.contentLoaded, true)
})

test('failed detail loads remain hidden and can be retried', async () => {
  let attempts = 0
  setActiveShareForTests({ publicId: 'share-retry', manifest: { allowDownload: true, items: [] } })
  setShareFileApiRequestForTests(async () => {
    attempts += 1
    if (attempts === 1) throw new Error('网络暂时不可用')
    return { name: '重试文件', features: [{ id: 'point-1', type: 'Point', coordinates: [111, 22] }] }
  })
  const file = { shareItemId: 'file-retry', visibleByDefault: true, enabled: true, contentLoaded: false, features: [] }

  await loadActiveShareFile(file)
  assert.equal(file.enabled, false)
  assert.equal(file.contentLoaded, false)
  assert.equal(file.loadError, '网络暂时不可用')

  await loadActiveShareFile(file)
  assert.equal(attempts, 2)
  assert.equal(file.enabled, false)
  assert.equal(file.contentLoaded, true)
  assert.equal(file.loadError, null)
})
