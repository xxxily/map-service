import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCommentThreadKey,
  createArtalkAdapterLocator,
  createCommentProviderLocator,
  createRemark42AdapterLocator,
} from '../poc/comment-provider-adapters.js'

const ref = Object.freeze({
  sharePublicId: 'public_alias_1234567890',
  shareItemId: 'shi_item_123',
  featureId: 'point-one',
  scope: 'feature',
})

test('provider thread keys use the internal stable share identity', () => {
  const first = buildCommentThreadKey(ref, { canonicalShareId: 'shr_internal_1' })
  const rotated = buildCommentThreadKey({ ...ref, sharePublicId: 'rotated_alias_123456' }, {
    canonicalShareId: 'shr_internal_1',
  })
  const otherShare = buildCommentThreadKey(ref, { canonicalShareId: 'shr_internal_2' })

  assert.equal(first, rotated)
  assert.notEqual(first, otherShare)
  assert.match(first, /^msp_comment_v1_[a-f0-9]{32}$/)
  assert.equal(first.includes('shr_internal_1'), false)
  assert.equal(first.includes(ref.featureId), false)
})

test('Artalk and Remark42 locators share one canonical thread key', () => {
  const options = {
    canonicalShareId: 'shr_internal_1',
    pageTitle: '入口点位',
    publicOrigin: 'https://map.example.com',
  }
  const artalk = createArtalkAdapterLocator(ref, options)
  const remark42 = createRemark42AdapterLocator(ref, options)

  assert.equal(artalk.threadKey, remark42.threadKey)
  assert.equal(artalk.pageKey, artalk.threadKey)
  assert.equal(remark42.url, `https://map.example.com/interaction/comments/${remark42.threadKey}`)
  assert.equal(artalk.authMode, 'interaction-adapter')
  assert.equal(remark42.moderationAuthority, 'internal')
})

test('provider POC rejects media threads, invalid origins and unknown providers', () => {
  assert.throws(
    () => buildCommentThreadKey({ ...ref, scope: 'media', mediaId: 'media_123' }, { canonicalShareId: 'shr_internal_1' }),
    error => error.code === 'COMMENT_SCOPE_UNSUPPORTED',
  )
  assert.throws(
    () => createRemark42AdapterLocator(ref, { canonicalShareId: 'shr_internal_1', publicOrigin: 'http://map.example.com' }),
    error => error.code === 'COMMENT_PROVIDER_POC_CONFIG_INVALID',
  )
  assert.throws(
    () => createCommentProviderLocator('unknown', ref, { canonicalShareId: 'shr_internal_1' }),
    error => error.code === 'COMMENT_PROVIDER_UNSUPPORTED',
  )
})

