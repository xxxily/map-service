import test from 'node:test'
import assert from 'node:assert/strict'

import InteractionDatabase from '../service/bin/interaction/database.js'
import {
  countPublicComments,
  decodePublicCursor,
  getOwnCommentState,
  listPublicComments,
  listPublicReplies,
  publicCommentBadgeCount,
} from '../service/bin/interaction/commentVisibility.js'
import { InteractionPolicyStore, createMutableInteractionPolicy } from '../service/bin/interaction/commentPolicy.js'
import { findForbiddenResponseFields } from '../service/bin/interaction/accessGuards.js'
import { encryptInteractionSecret, hashInteractionContact } from '../service/bin/interaction/security.js'
import { COMMENT_MODERATION_STATUSES } from '../shared/interaction-policy.js'

const TEST_SECRET = 'interaction-comment-visibility-test-key'
const TEST_NOW = '2026-08-23T00:00:00.000Z'
const RESOURCE = { canonicalShareId: 'share_one', shareItemId: 'shi_demo', featureId: 'feature_demo' }
const OTHER_RESOURCE = { canonicalShareId: 'share_one', shareItemId: 'shi_demo', featureId: 'feature_other' }

function approvedAt (minute) {
  return `2026-08-23T00:${String(minute).padStart(2, '0')}:00.000Z`
}

function insertComment (database, overrides = {}) {
  const row = {
    id: 'cmt_default',
    canonicalShareId: RESOURCE.canonicalShareId,
    shareItemId: RESOURCE.shareItemId,
    featureId: RESOURCE.featureId,
    parentId: null,
    threadDepth: 0,
    authorType: 'anonymous',
    authorUserId: '',
    authorKey: 'anon_default',
    displayName: '访客',
    body: '公开内容',
    contactCiphertext: '',
    contactHash: '',
    contactType: '',
    contentStatus: 'active',
    moderationStatus: 'approved',
    moderationLevel: 'normal',
    approvedAtValue: TEST_NOW,
    visibleAt: TEST_NOW,
    deletedAt: null,
    orphanedAt: null,
    ...overrides,
  }
  database.prepare(`
    INSERT INTO comments (
      id, site_id, canonical_share_id, share_public_id_snapshot, share_item_id,
      feature_id, scope, parent_id, thread_depth, author_type, author_user_id,
      author_key, display_name_snapshot, body_raw_encrypted, body_normalized,
      body_rendered, consent_policy_version, contact_ciphertext, contact_hash,
      contact_type, content_status, moderation_status, moderation_level,
      visible_at, approved_at, deleted_at, orphaned_at, created_at, updated_at
    ) VALUES (?, 'map-service', ?, 'shr_public_demo', ?, ?, 'feature', ?, ?, ?, ?,
      ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.canonicalShareId, row.shareItemId, row.featureId, row.parentId,
    row.threadDepth, row.authorType, row.authorUserId, row.authorKey,
    row.displayName, encryptInteractionSecret(row.body, TEST_SECRET, 'comment-body'),
    row.body, row.body, row.contactCiphertext, row.contactHash, row.contactType,
    row.contentStatus, row.moderationStatus, row.moderationLevel, row.visibleAt,
    row.approvedAtValue, row.deletedAt, row.orphanedAt, TEST_NOW, TEST_NOW
  )
  return row
}

function setup () {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  new InteractionPolicyStore({ database, now: () => TEST_NOW }).publish(createMutableInteractionPolicy())
  return { database, close: () => database.close() }
}

test('only approved and active comments are counted', () => {
  const { database, close } = setup()
  try {
    // One comment per moderation status, all with content_status active.
    let index = 0
    for (const moderationStatus of COMMENT_MODERATION_STATUSES) {
      index += 1
      insertComment(database, {
        id: `cmt_mod_${index}`,
        moderationStatus,
        approvedAtValue: moderationStatus === 'approved' ? TEST_NOW : null,
        orphanedAt: moderationStatus === 'orphaned' ? TEST_NOW : null,
        visibleAt: moderationStatus === 'approved' ? TEST_NOW : null,
      })
    }
    assert.equal(countPublicComments(database, RESOURCE).total, 1)

    // Approved but hidden or deleted must not count either.
    insertComment(database, { id: 'cmt_hidden', contentStatus: 'hidden', visibleAt: null })
    insertComment(database, { id: 'cmt_deleted', contentStatus: 'deleted', deletedAt: TEST_NOW, visibleAt: null })
    assert.equal(countPublicComments(database, RESOURCE).total, 1)

    insertComment(database, { id: 'cmt_public_2' })
    assert.equal(countPublicComments(database, RESOURCE).total, 2)
    assert.equal(publicCommentBadgeCount(database, RESOURCE), 2)
  } finally {
    close()
  }
})

test('counts are scoped to one resource and split by thread depth', () => {
  const { database, close } = setup()
  try {
    insertComment(database, { id: 'cmt_parent' })
    insertComment(database, { id: 'cmt_reply_1', parentId: 'cmt_parent', threadDepth: 1 })
    insertComment(database, { id: 'cmt_reply_2', parentId: 'cmt_parent', threadDepth: 1 })
    insertComment(database, { id: 'cmt_other', featureId: OTHER_RESOURCE.featureId })

    assert.deepEqual(countPublicComments(database, RESOURCE), { total: 3, topLevel: 1, replies: 2 })
    assert.deepEqual(countPublicComments(database, OTHER_RESOURCE), { total: 1, topLevel: 1, replies: 0 })
    // A different share must not see this feature's comments.
    assert.equal(countPublicComments(database, { ...RESOURCE, canonicalShareId: 'share_two' }).total, 0)
    assert.equal(countPublicComments(database, { ...RESOURCE, shareItemId: 'shi_other' }).total, 0)
  } finally {
    close()
  }
})

test('an empty resource reports zero so the badge can be hidden', () => {
  const { database, close } = setup()
  try {
    assert.deepEqual(countPublicComments(database, RESOURCE), { total: 0, topLevel: 0, replies: 0 })
    assert.equal(publicCommentBadgeCount(database, RESOURCE), 0)
    assert.deepEqual(listPublicComments(database, RESOURCE), { items: [], count: 0, hasMore: false, nextCursor: '' })

    for (const missing of [{}, { canonicalShareId: 'share_one' }, { ...RESOURCE, featureId: '' }]) {
      assert.throws(() => countPublicComments(database, missing), error => {
        assert.equal(error.code, 'VALIDATION_FAILED')
        assert.equal(error.statusCode, 400)
        return true
      })
    }
  } finally {
    close()
  }
})

test('the public list exposes no sensitive fields', () => {
  const { database, close } = setup()
  try {
    const contactHash = hashInteractionContact('email', 'guest@example.com', TEST_SECRET)
    insertComment(database, {
      id: 'cmt_one',
      contactType: 'email',
      contactCiphertext: encryptInteractionSecret('guest@example.com', TEST_SECRET, 'contact'),
      contactHash,
    })
    insertComment(database, {
      id: 'cmt_two', authorType: 'user', authorUserId: 'usr_1', displayName: '登录用户', authorKey: 'user_1',
    })

    const result = listPublicComments(database, RESOURCE)
    assert.equal(result.items.length, 2)
    assert.deepEqual(Object.keys(result.items[0]).sort(), ['avatar', 'body', 'createdAt', 'displayName', 'gender', 'id', 'replies'])
    assert.deepEqual(findForbiddenResponseFields(result), [])

    const serialized = JSON.stringify(result)
    assert.equal(serialized.includes('guest@example.com'), false)
    assert.equal(serialized.includes(contactHash), false)
    assert.equal(serialized.includes('aes-256-gcm'), false)
    assert.equal(serialized.includes('usr_1'), false)
    assert.equal(serialized.includes('user_1'), false)
    assert.equal(serialized.includes('normal'), false)
  } finally {
    close()
  }
})

test('the public list nests only approved replies and hides pending ones', () => {
  const { database, close } = setup()
  try {
    insertComment(database, { id: 'cmt_parent', body: '父留言' })
    insertComment(database, { id: 'cmt_reply_ok', parentId: 'cmt_parent', threadDepth: 1, body: '通过的回复' })
    insertComment(database, {
      id: 'cmt_reply_pending', parentId: 'cmt_parent', threadDepth: 1, body: '待审回复',
      moderationStatus: 'pending', approvedAtValue: null, visibleAt: null,
    })

    const result = listPublicComments(database, RESOURCE)
    // Replies are nested, never separate top-level entries.
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].id, 'cmt_parent')
    assert.equal(result.items[0].replies.length, 1)
    assert.equal(result.items[0].replies[0].body, '通过的回复')
    assert.equal(JSON.stringify(result).includes('待审核'), false)
    assert.equal(JSON.stringify(result).includes('待审回复'), false)

    // The badge counts approved comments at both depths.
    assert.equal(result.count, 2)
    assert.deepEqual(listPublicReplies(database, 'cmt_parent').map(reply => reply.id), ['cmt_reply_ok'])
  } finally {
    close()
  }
})

test('an anonymous comment without a display name falls back to a neutral label', () => {
  const { database, close } = setup()
  try {
    insertComment(database, { id: 'cmt_one', displayName: '' })
    const [item] = listPublicComments(database, RESOURCE).items
    assert.equal(item.displayName, '匿名用户')
  } finally {
    close()
  }
})

test('public list pagination is keyset based and stable', () => {
  const { database, close } = setup()
  try {
    for (let index = 1; index <= 5; index += 1) {
      insertComment(database, {
        id: `cmt_${index}`, body: `留言 ${index}`, approvedAtValue: approvedAt(index), visibleAt: approvedAt(index),
      })
    }

    const first = listPublicComments(database, RESOURCE, { limit: 2 })
    assert.deepEqual(first.items.map(item => item.body), ['留言 1', '留言 2'])
    assert.equal(first.hasMore, true)
    assert.equal(first.count, 5)
    assert.notEqual(first.nextCursor, '')

    const second = listPublicComments(database, RESOURCE, { limit: 2, cursor: first.nextCursor })
    assert.deepEqual(second.items.map(item => item.body), ['留言 3', '留言 4'])
    assert.equal(second.hasMore, true)

    const third = listPublicComments(database, RESOURCE, { limit: 2, cursor: second.nextCursor })
    assert.deepEqual(third.items.map(item => item.body), ['留言 5'])
    assert.equal(third.hasMore, false)
    assert.equal(third.nextCursor, '')

    // The count stays the resource total, independent of the page.
    assert.equal(third.count, 5)
    assert.deepEqual(decodePublicCursor(first.nextCursor), { approvedAt: approvedAt(2), id: 'cmt_2' })

    for (const bad of ['not-a-cursor', Buffer.from('nope', 'utf8').toString('base64url')]) {
      assert.throws(() => listPublicComments(database, RESOURCE, { cursor: bad }), error => {
        assert.equal(error.code, 'CURSOR_INVALID')
        return true
      })
    }
    for (const bad of [0, -1, 1.5, 'many']) {
      assert.throws(() => listPublicComments(database, RESOURCE, { limit: bad }), error => {
        assert.equal(error.code, 'VALIDATION_FAILED')
        return true
      })
    }
    // The page size is capped rather than trusted.
    assert.equal(listPublicComments(database, RESOURCE, { limit: 5000 }).items.length, 5)
  } finally {
    close()
  }
})

test('public pages cap top-level rows while preserving large avatar projections and all replies', () => {
  const { database, close } = setup()
  try {
    const avatar = `data:image/png;base64,${'A'.repeat(4_000)}`
    for (let index = 1; index <= 25; index += 1) {
      insertComment(database, {
        id: `cmt_avatar_${index}`,
        body: `头像留言 ${index}`,
        approvedAtValue: approvedAt(index),
        visibleAt: approvedAt(index),
      })
      database.prepare('UPDATE comments SET avatar_snapshot = ?, gender_snapshot = ? WHERE id = ?')
        .run(avatar, 'female', `cmt_avatar_${index}`)
    }

    const first = listPublicComments(database, RESOURCE, { limit: 5000 })
    assert.equal(first.items.length, 20)
    assert.equal(first.hasMore, true)
    assert.equal(first.items[0].avatar, avatar)
    assert.equal(first.items[0].gender, 'female')
    assert.ok(Buffer.byteLength(JSON.stringify(first), 'utf8') < 110_000)

    const second = listPublicComments(database, RESOURCE, { cursor: first.nextCursor, limit: 20 })
    assert.equal(second.items.length, 5)
    assert.equal(second.hasMore, false)
    assert.equal(second.count, 25)

    insertComment(database, {
      id: 'cmt_avatar_parent',
      body: '带大量回复的留言',
      approvedAtValue: approvedAt(30),
      visibleAt: approvedAt(30),
    })
    for (let index = 1; index <= 30; index += 1) {
      insertComment(database, {
        id: `cmt_avatar_reply_${index}`,
        parentId: 'cmt_avatar_parent',
        threadDepth: 1,
        body: `回复 ${index}`,
        approvedAtValue: `2026-08-23T01:${String(index).padStart(2, '0')}:00.000Z`,
        visibleAt: `2026-08-23T01:${String(index).padStart(2, '0')}:00.000Z`,
      })
    }
    const replyPage = listPublicComments(database, RESOURCE, { cursor: first.nextCursor, limit: 20 })
    const parent = replyPage.items.find(item => item.id === 'cmt_avatar_parent')
    assert.ok(parent)
    assert.equal(parent.replies.length, 30)
    assert.equal(replyPage.count, 56)
  } finally {
    close()
  }
})

test('a logged-in author sees only their own pending placeholder', () => {
  const { database, close } = setup()
  try {
    insertComment(database, {
      id: 'cmt_mine', authorType: 'user', authorUserId: 'usr_1', authorKey: 'user_1',
      moderationStatus: 'pending', approvedAtValue: null, visibleAt: null,
    })
    insertComment(database, {
      id: 'cmt_theirs', authorType: 'user', authorUserId: 'usr_2', authorKey: 'user_2',
      moderationStatus: 'pending', approvedAtValue: null, visibleAt: null,
    })

    assert.deepEqual(getOwnCommentState(database, 'cmt_mine', 'usr_1'), {
      id: 'cmt_mine', status: 'pending', createdAt: TEST_NOW,
    })

    // Another user's pending comment must be indistinguishable from missing.
    assert.throws(() => getOwnCommentState(database, 'cmt_theirs', 'usr_1'), error => {
      assert.equal(error.code, 'RESOURCE_NOT_FOUND')
      assert.equal(error.statusCode, 404)
      return true
    })
    assert.throws(() => getOwnCommentState(database, 'cmt_mine', ''), error => {
      assert.equal(error.code, 'AUTH_REQUIRED')
      assert.equal(error.statusCode, 401)
      return true
    })
    // Pending comments stay out of the public list and count entirely.
    assert.equal(listPublicComments(database, RESOURCE).count, 0)
    assert.equal(listPublicComments(database, RESOURCE).items.length, 0)

    database.prepare(`
      UPDATE comments SET moderation_status = 'approved', approved_at = ?, visible_at = ? WHERE id = 'cmt_mine'
    `).run(TEST_NOW, TEST_NOW)
    assert.equal(getOwnCommentState(database, 'cmt_mine', 'usr_1').status, 'published')
  } finally {
    close()
  }
})

test('a comment whose stored text is no longer safe is dropped fail-closed', () => {
  const { database, close } = setup()
  try {
    insertComment(database, { id: 'cmt_ok', body: '正常内容' })
    insertComment(database, { id: 'cmt_bad', body: '正常内容' })
    // Simulate stored text that would not pass normalization today.
    database.prepare('UPDATE comments SET body_normalized = ? WHERE id = ?')
      .run('<script>alert(1)</script>', 'cmt_bad')

    const result = listPublicComments(database, RESOURCE)
    assert.deepEqual(result.items.map(item => item.id), ['cmt_ok'])
    assert.equal(JSON.stringify(result).includes('<script>'), false)
    // The count comes from the database predicate, so it can legitimately
    // exceed the rendered items when a row fails serialization.
    assert.equal(result.count, 2)
  } finally {
    close()
  }
})

test('forbidden field detection walks nested payloads', () => {
  assert.deepEqual(findForbiddenResponseFields({ id: 'cmt_1', body: 'ok' }), [])
  assert.deepEqual(findForbiddenResponseFields({ items: [{ id: 'cmt_1', email: 'a@b.com' }] }), ['$.items[0].email'])
  assert.deepEqual(
    findForbiddenResponseFields({ comment: { contactHash: 'x', nested: { authorUserId: 'usr_1' } } }).sort(),
    ['$.comment.contactHash', '$.comment.nested.authorUserId']
  )
  const cyclic = { id: 'cmt_1' }
  cyclic.self = cyclic
  assert.deepEqual(findForbiddenResponseFields(cyclic), [])
  assert.deepEqual(findForbiddenResponseFields(null), [])
  assert.deepEqual(findForbiddenResponseFields('string'), [])
})
