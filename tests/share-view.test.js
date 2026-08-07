import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { getSharePublicId, isShareLocation } from '../src/map/share-view.js'

test('share route parser accepts only one stable public id segment', () => {
  assert.equal(getSharePublicId({ pathname: '/share/abc_123' }), 'abc_123')
  assert.equal(getSharePublicId({ pathname: '/share/%E8%B7%AF%E7%BA%BF' }), '路线')
  assert.equal(getSharePublicId({ pathname: '/3d', search: '?share=abc_123' }), 'abc_123')
  assert.equal(getSharePublicId({ pathname: '/share/abc/files' }), '')
  assert.equal(isShareLocation({ pathname: '/account' }), false)
})

test('share password prompt follows the independent 4 to 128 character policy', () => {
  const source = readFileSync(new URL('../src/map/share-view.js', import.meta.url), 'utf8')
  assert.match(source, /name="password" minlength="4" maxlength="128"/)
})
