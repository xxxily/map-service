import assert from 'node:assert/strict'
import { test } from 'node:test'
import whitelist from '../service/bin/whitelist.js'

test('whitelist allows supported map tile endpoints', () => {
  assert.equal(whitelist.isAllowed('https://www.google.com/maps/vt?lyrs=s&x=1&y=2&z=3'), true)
  assert.equal(whitelist.isAllowed('https://www.google.cn/maps/vt?lyrs=s&x=1&y=2&z=3'), true)
  assert.equal(whitelist.isAllowed('https://webst01.is.autonavi.com/appmaptile?style=8&x=1&y=2&z=3'), true)
  assert.equal(whitelist.isAllowed('https://webrd04.is.autonavi.com/appmaptile?style=8&x=1&y=2&z=3'), true)
})

test('whitelist rejects lookalike hosts and unrelated paths', () => {
  assert.equal(whitelist.isAllowed('https://google.com.evil.test/maps/vt?x=1&y=2&z=3'), false)
  assert.equal(whitelist.isAllowed('https://www.google.com/complete/search?q=test'), false)
  assert.equal(whitelist.isAllowed('https://webst01.is.autonavi.com/anything-else?x=1&y=2&z=3'), false)
  assert.equal(whitelist.isAllowed('not-a-url'), false)
})
