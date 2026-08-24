import test from 'node:test'
import assert from 'node:assert/strict'

import InteractionDatabase from '../service/bin/interaction/database.js'
import { CommentModerationService, moderationActionForStatus } from '../service/bin/interaction/commentModeration.js'
import { InteractionPolicyStore, createMutableInteractionPolicy } from '../service/bin/interaction/commentPolicy.js'
import { countPublicComments } from '../service/bin/interaction/commentVisibility.js'
import { encryptInteractionSecret } from '../service/bin/interaction/security.js'

const TEST_SECRET = 'interaction-comment-moderation-test-key'
const TEST_NOW = '2026-08-23T00:00:00.000Z'
const LATER = '2026-08-23T01:00:00.000Z'
const RESOURCE = { canonicalShareId: 'share_one', shareItemId: 'shi_demo', featureId: 'feature_demo' }

function ciphertext (value) {
  return encryptInteractionSecret(value, TEST_SECRET, 'comment-body')
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
    bodyNormalized: '待审内容',
    contentStatus: 'active',
    moderationStatus: 'pending',
    moderationLevel: 'unknown',
    approvedAt: null,
    visibleAt: null,
    deletedAt: null,
    orphanedAt: null,
    legalHold: 0,
    legalHoldReason: '',
    legalHoldAt: null,
    ...overrides,
  }
  database.prepare(`
    INSERT INTO comments (
      id, site_id, canonical_share_id, share_public_id_snapshot, share_item_id,
      feature_id, scope, parent_id, thread_depth, author_type, author_user_id,
      author_key, display_name_snapshot, body_raw_encrypted, body_normalized,
      body_rendered, consent_policy_version, content_status, moderation_status,
      moderation_level, visible_at, approved_at, deleted_at, orphaned_at,
      legal_hold, legal_hold_reason, legal_hold_at, created_at, updated_at
    ) VALUES (?, 'map-service', ?, 'shr_public_demo', ?, ?, 'feature', ?, ?, ?, ?,
      ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.canonicalShareId, row.shareItemId, row.featureId, row.parentId,
    row.threadDepth, row.authorType, row.authorUserId, row.authorKey,
    row.displayName, ciphertext(row.bodyNormalized), row.bodyNormalized,
    row.bodyNormalized, row.contentStatus, row.moderationStatus,
    row.moderationLevel, row.visibleAt, row.approvedAt, row.deletedAt,
    row.orphanedAt, row.legalHold, row.legalHoldReason, row.legalHoldAt,
    TEST_NOW, TEST_NOW
  )
  return row
}

function setup (options = {}) {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  new InteractionPolicyStore({ database, now: () => TEST_NOW }).publish(createMutableInteractionPolicy())
  const audits = []
  const service = new CommentModerationService({
    database,
    now: () => options.now || LATER,
    auditSink: entry => audits.push(entry),
  })
  return { database, service, audits, close: () => database.close() }
}

test('pending to approved stamps timestamps, records a decision and writes audit', () => {
  const { database, service, audits, close } = setup()
  try {
    insertComment(database, { id: 'cmt_one' })

    const result = service.applyModerationDecision({
      commentId: 'cmt_one',
      toStatus: 'approved',
      level: 'normal',
      actorUserId: 'usr_admin',
      reason: '人工复核通过',
      idempotencyKey: 'review_1',
      ipSummary: 'ip_abcdef0123456789',
    })

    assert.equal(result.changed, true)
    assert.equal(result.replayed, false)
    assert.equal(result.fromStatus, 'pending')
    assert.equal(result.toStatus, 'approved')
    assert.equal(result.comment.moderation_status, 'approved')
    // The schema CHECK requires approved_at; visible_at only exists once the
    // comment is genuinely public.
    assert.equal(result.comment.approved_at, LATER)
    assert.equal(result.comment.visible_at, LATER)
    assert.equal(result.comment.updated_at, LATER)
    assert.equal(result.comment.moderation_level, 'normal')

    const decisions = service.listDecisions('cmt_one')
    assert.equal(decisions.length, 1)
    assert.equal(decisions[0].stage, 'human')
    assert.equal(decisions[0].suggested_action, 'approve')
    assert.equal(decisions[0].actor_user_id, 'usr_admin')
    assert.equal(decisions[0].id.startsWith('cmd_'), true)

    // The decision table has no from/to columns, so the audit entry is the only
    // record of the actual transition.
    assert.equal(audits.length, 1)
    assert.equal(audits[0].action, 'interaction.comment.moderate')
    assert.equal(audits[0].targetType, 'interaction_comment')
    assert.equal(audits[0].targetId, 'cmt_one')
    assert.equal(audits[0].actorUserId, 'usr_admin')
    assert.equal(audits[0].reason, '人工复核通过')
    assert.equal(audits[0].metadata.fromStatus, 'pending')
    assert.equal(audits[0].metadata.toStatus, 'approved')
    assert.equal(audits[0].metadata.decisionId, decisions[0].id)
    assert.equal(audits[0].ipSummary, 'ip_abcdef0123456789')
  } finally {
    close()
  }
})

test('approval makes a comment public and counts it exactly once', () => {
  const { database, service, close } = setup()
  try {
    insertComment(database, { id: 'cmt_one' })
    insertComment(database, { id: 'cmt_two' })
    assert.equal(countPublicComments(database, RESOURCE).total, 0)

    service.applyModerationDecision({ commentId: 'cmt_one', toStatus: 'approved', level: 'normal', actorUserId: 'usr_admin' })
    assert.equal(countPublicComments(database, RESOURCE).total, 1)

    // Re-approving an already approved comment must not double count.
    service.applyModerationDecision({ commentId: 'cmt_one', toStatus: 'approved', level: 'normal', actorUserId: 'usr_admin' })
    assert.equal(countPublicComments(database, RESOURCE).total, 1)

    service.applyModerationDecision({ commentId: 'cmt_two', toStatus: 'rejected', level: 'violation', actorUserId: 'usr_admin' })
    assert.equal(countPublicComments(database, RESOURCE).total, 1)
  } finally {
    close()
  }
})

test('illegal moderation transitions are refused as 409 without side effects', () => {
  const { database, service, audits, close } = setup()
  try {
    insertComment(database, { id: 'cmt_one', moderationStatus: 'spam' })

    // spam may only go to pending, rejected or orphaned.
    assert.throws(() => service.applyModerationDecision({
      commentId: 'cmt_one', toStatus: 'approved', actorUserId: 'usr_admin',
    }), error => {
      assert.equal(error.code, 'MODERATION_TRANSITION_INVALID')
      assert.equal(error.statusCode, 409)
      return true
    })

    assert.equal(service.getComment('cmt_one').moderation_status, 'spam')
    assert.equal(service.listDecisions('cmt_one').length, 0)
    assert.equal(audits.length, 0)

    assert.throws(() => service.applyModerationDecision({
      commentId: 'cmt_one', toStatus: 'quarantined', actorUserId: 'usr_admin',
    }), /不能从 spam 变更为 quarantined/)

    // Not an allowed human target status at all.
    assert.throws(() => service.applyModerationDecision({
      commentId: 'cmt_one', toStatus: 'deleted', actorUserId: 'usr_admin',
    }), error => {
      assert.equal(error.code, 'VALIDATION_FAILED')
      return true
    })
  } finally {
    close()
  }
})

test('a repeated idempotency key replays instead of writing a second decision', () => {
  const { database, service, audits, close } = setup()
  try {
    insertComment(database, { id: 'cmt_one' })

    const first = service.applyModerationDecision({
      commentId: 'cmt_one', toStatus: 'approved', level: 'normal',
      actorUserId: 'usr_admin', idempotencyKey: 'review_1',
    })
    const second = service.applyModerationDecision({
      commentId: 'cmt_one', toStatus: 'rejected', level: 'violation',
      actorUserId: 'usr_admin', idempotencyKey: 'review_1',
    })

    assert.equal(first.changed, true)
    assert.equal(second.changed, false)
    assert.equal(second.replayed, true)
    assert.equal(second.decisionId, first.decisionId)
    // The replay must not apply the second, conflicting decision.
    assert.equal(service.getComment('cmt_one').moderation_status, 'approved')
    assert.equal(service.listDecisions('cmt_one').length, 1)
    assert.equal(audits.length, 1)

    // A different key from the same actor is a genuine new decision.
    const third = service.applyModerationDecision({
      commentId: 'cmt_one', toStatus: 'rejected', level: 'violation',
      actorUserId: 'usr_admin', idempotencyKey: 'review_2',
    })
    assert.equal(third.changed, true)
    assert.equal(third.toStatus, 'rejected')
    assert.equal(service.listDecisions('cmt_one').length, 2)
    assert.equal(audits.length, 2)
  } finally {
    close()
  }
})

test('a no-op transition writes no decision and no audit', () => {
  const { database, service, audits, close } = setup()
  try {
    insertComment(database, { id: 'cmt_one', moderationStatus: 'approved', approvedAt: TEST_NOW, visibleAt: TEST_NOW })

    const result = service.applyModerationDecision({
      commentId: 'cmt_one', toStatus: 'approved', level: 'normal', actorUserId: 'usr_admin',
    })
    assert.equal(result.changed, false)
    assert.equal(result.replayed, false)
    assert.equal(result.decisionId, '')
    assert.equal(service.listDecisions('cmt_one').length, 0)
    assert.equal(audits.length, 0)
    // The original approval timestamp is preserved as the public sort key.
    assert.equal(service.getComment('cmt_one').approved_at, TEST_NOW)
  } finally {
    close()
  }
})

test('approved_at survives a reject and re-approve round trip', () => {
  const { database, service, close } = setup()
  try {
    insertComment(database, { id: 'cmt_one', moderationStatus: 'approved', approvedAt: TEST_NOW, visibleAt: TEST_NOW })

    service.applyModerationDecision({ commentId: 'cmt_one', toStatus: 'rejected', level: 'violation', actorUserId: 'usr_admin' })
    const rejected = service.getComment('cmt_one')
    assert.equal(rejected.moderation_status, 'rejected')
    // No longer public, so visible_at is cleared, but approved_at is kept for
    // audit and for a stable re-publication order.
    assert.equal(rejected.visible_at, null)
    assert.equal(rejected.approved_at, TEST_NOW)

    service.applyModerationDecision({ commentId: 'cmt_one', toStatus: 'approved', level: 'normal', actorUserId: 'usr_admin' })
    const reapproved = service.getComment('cmt_one')
    assert.equal(reapproved.approved_at, TEST_NOW)
    assert.equal(reapproved.visible_at, LATER)
  } finally {
    close()
  }
})

test('orphaned transitions stamp orphaned_at as the schema requires', () => {
  const { database, service, close } = setup()
  try {
    insertComment(database, { id: 'cmt_one' })
    const result = service.applyModerationDecision({
      commentId: 'cmt_one', toStatus: 'orphaned', level: 'unknown', actorUserId: 'usr_admin',
    })
    assert.equal(result.comment.moderation_status, 'orphaned')
    assert.equal(result.comment.orphaned_at, LATER)
    assert.equal(result.comment.visible_at, null)
  } finally {
    close()
  }
})

test('human review requires an actor and an unknown comment is a 404', () => {
  const { database, service, close } = setup()
  try {
    insertComment(database, { id: 'cmt_one' })

    assert.throws(() => service.applyModerationDecision({ commentId: 'cmt_one', toStatus: 'approved' }), error => {
      assert.equal(error.code, 'AUTH_REQUIRED')
      assert.equal(error.statusCode, 401)
      return true
    })
    assert.throws(() => service.applyModerationDecision({
      commentId: 'cmt_missing', toStatus: 'approved', actorUserId: 'usr_admin',
    }), error => {
      assert.equal(error.code, 'RESOURCE_NOT_FOUND')
      assert.equal(error.statusCode, 404)
      return true
    })
    // Automated stages legitimately have no actor.
    const keyword = service.applyModerationDecision({
      commentId: 'cmt_one', toStatus: 'rejected', stage: 'keyword', level: 'violation',
    })
    assert.equal(keyword.changed, true)
    assert.equal(service.listDecisions('cmt_one')[0].stage, 'keyword')

    assert.throws(() => service.applyModerationDecision({
      commentId: 'cmt_one', toStatus: 'pending', actorUserId: 'usr_admin', idempotencyKey: 'bad key!',
    }), error => {
      assert.equal(error.code, 'IDEMPOTENCY_KEY_INVALID')
      assert.equal(error.statusCode, 400)
      return true
    })
  } finally {
    close()
  }
})

test('legal hold blocks non-approving moderation and deletion', () => {
  const { database, service, close } = setup()
  try {
    insertComment(database, {
      id: 'cmt_one', legalHold: 1, legalHoldReason: '司法协助', legalHoldAt: TEST_NOW,
    })

    assert.throws(() => service.applyModerationDecision({
      commentId: 'cmt_one', toStatus: 'rejected', actorUserId: 'usr_admin',
    }), error => {
      assert.equal(error.code, 'COMMENT_POLICY_BLOCKED')
      assert.equal(error.statusCode, 403)
      return true
    })
    assert.throws(() => service.applyContentStatus({
      commentId: 'cmt_one', toStatus: 'deleted', actorUserId: 'usr_admin',
    }), error => {
      assert.equal(error.code, 'COMMENT_POLICY_BLOCKED')
      return true
    })

    // An explicit override exists for the dedicated legal workflow.
    const overridden = service.applyModerationDecision({
      commentId: 'cmt_one', toStatus: 'rejected', actorUserId: 'usr_legal', allowLegalHoldChange: true,
    })
    assert.equal(overridden.toStatus, 'rejected')
  } finally {
    close()
  }
})

test('content status transitions are validated on their own axis', () => {
  const { database, service, audits, close } = setup()
  try {
    insertComment(database, { id: 'cmt_one', moderationStatus: 'approved', approvedAt: TEST_NOW, visibleAt: TEST_NOW })

    const hidden = service.applyContentStatus({ commentId: 'cmt_one', toStatus: 'hidden', actorUserId: 'usr_admin' })
    assert.equal(hidden.changed, true)
    assert.equal(hidden.comment.content_status, 'hidden')
    // Still approved, but no longer public.
    assert.equal(hidden.comment.moderation_status, 'approved')
    assert.equal(hidden.comment.visible_at, null)
    assert.equal(countPublicComments(database, RESOURCE).total, 0)

    const restored = service.applyContentStatus({ commentId: 'cmt_one', toStatus: 'active', actorUserId: 'usr_admin' })
    assert.equal(restored.comment.visible_at, LATER)
    assert.equal(countPublicComments(database, RESOURCE).total, 1)

    const deleted = service.applyContentStatus({ commentId: 'cmt_one', toStatus: 'deleted', actorUserId: 'usr_admin' })
    // The schema CHECK requires deleted_at whenever content_status is deleted.
    assert.equal(deleted.comment.deleted_at, LATER)
    assert.equal(countPublicComments(database, RESOURCE).total, 0)

    // deleted is terminal.
    assert.throws(() => service.applyContentStatus({
      commentId: 'cmt_one', toStatus: 'active', actorUserId: 'usr_admin',
    }), error => {
      assert.equal(error.code, 'CONTENT_STATUS_TRANSITION_INVALID')
      assert.equal(error.statusCode, 409)
      return true
    })

    assert.deepEqual(
      audits.map(entry => entry.action),
      ['interaction.comment.content_status', 'interaction.comment.content_status', 'interaction.comment.content_status']
    )
    assert.deepEqual(audits[0].metadata, { fromStatus: 'active', toStatus: 'hidden', contentRevision: 1 })
  } finally {
    close()
  }
})

test('hiding a parent cascades replies out of the public set', () => {
  const { database, service, close } = setup()
  try {
    insertComment(database, {
      id: 'cmt_parent', moderationStatus: 'approved', approvedAt: TEST_NOW, visibleAt: TEST_NOW,
    })
    insertComment(database, {
      id: 'cmt_reply', parentId: 'cmt_parent', threadDepth: 1,
      moderationStatus: 'approved', approvedAt: TEST_NOW, visibleAt: TEST_NOW,
    })
    assert.equal(countPublicComments(database, RESOURCE).total, 2)
    assert.equal(countPublicComments(database, RESOURCE).replies, 1)

    service.applyModerationDecision({
      commentId: 'cmt_parent', toStatus: 'rejected', level: 'violation', actorUserId: 'usr_admin',
    })

    // The schema trigger flips the reply to hidden; neither row may remain
    // countable, and restoring the parent must not resurrect the reply.
    assert.equal(service.getComment('cmt_reply').content_status, 'hidden')
    assert.equal(countPublicComments(database, RESOURCE).total, 0)

    service.applyModerationDecision({
      commentId: 'cmt_parent', toStatus: 'approved', level: 'normal', actorUserId: 'usr_admin',
    })
    assert.equal(service.getComment('cmt_reply').content_status, 'hidden')
    assert.equal(countPublicComments(database, RESOURCE).total, 1)
  } finally {
    close()
  }
})

test('publishing a reply under a non-public parent is refused fail-closed', () => {
  const { database, service, close } = setup()
  try {
    insertComment(database, { id: 'cmt_parent', moderationStatus: 'pending' })
    insertComment(database, { id: 'cmt_reply', parentId: 'cmt_parent', threadDepth: 1, moderationStatus: 'pending' })
  } catch (error) {
    // A pending parent cannot even accept the reply row.
    assert.match(String(error.message), /COMMENT_PARENT_INVALID/)
    close()
    return
  }

  try {
    assert.throws(() => service.applyModerationDecision({
      commentId: 'cmt_reply', toStatus: 'approved', level: 'normal', actorUserId: 'usr_admin',
    }), error => {
      assert.equal(error.code, 'COMMENT_PARENT_INVALID')
      assert.equal(error.statusCode, 404)
      return true
    })
    assert.equal(countPublicComments(database, RESOURCE).total, 0)
  } finally {
    close()
  }
})

test('moderation action names round trip with their target status', () => {
  assert.equal(moderationActionForStatus('approved'), 'approve')
  assert.equal(moderationActionForStatus('pending'), 'review')
  assert.equal(moderationActionForStatus('rejected'), 'reject')
  assert.equal(moderationActionForStatus('quarantined'), 'quarantine')
  assert.equal(moderationActionForStatus('spam'), 'spam')
  // orphaned has no operator action; fall back to review rather than approve.
  assert.equal(moderationActionForStatus('orphaned'), 'review')
})
