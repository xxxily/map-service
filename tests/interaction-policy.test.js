import test from 'node:test'
import assert from 'node:assert/strict'

import {
  COMMENT_CONTENT_STATUSES,
  COMMENT_CONTENT_TRANSITIONS,
  COMMENT_MODERATION_STATUSES,
  COMMENT_MODERATION_TRANSITIONS,
  DEFAULT_INTERACTION_POLICY,
  DEFAULT_INTERACTION_RETENTION,
  DEFAULT_MODERATION_ACTIONS,
  MODERATION_LEVELS,
  REPORT_ACTIONS,
  REPORT_STATUSES,
  REPORT_STATUS_TRANSITIONS,
  REPORT_TYPES,
  canTransitionCommentContent,
  canTransitionCommentModeration,
  canTransitionReportStatus,
  createDefaultInteractionPolicy,
  isPublicComment,
  isValidReportTargetScope,
  isValidReportType,
  resolveModerationAction,
} from '../shared/interaction-policy.js'

test('default interaction policy is frozen and disables anonymous comments', () => {
  assert.equal(Object.isFrozen(DEFAULT_INTERACTION_POLICY), true)
  assert.equal(Object.isFrozen(DEFAULT_INTERACTION_POLICY.comments), true)
  assert.equal(DEFAULT_INTERACTION_POLICY.comments.anonymous.enabled, false)
  assert.equal(DEFAULT_INTERACTION_POLICY.comments.anonymous.contactRequirement, 'email_or_phone')
  assert.strictEqual(createDefaultInteractionPolicy(), DEFAULT_INTERACTION_POLICY)
})

test('comment status contract only exposes approved active comments', () => {
  assert.deepEqual(COMMENT_CONTENT_STATUSES, ['active', 'hidden', 'deleted'])
  assert.deepEqual(COMMENT_MODERATION_STATUSES, ['pending', 'approved', 'rejected', 'quarantined', 'spam', 'orphaned'])
  assert.equal(isPublicComment({ contentStatus: 'active', moderationStatus: 'approved' }), true)
  assert.equal(isPublicComment({ contentStatus: 'active', moderationStatus: 'pending' }), false)
  assert.equal(isPublicComment({ contentStatus: 'hidden', moderationStatus: 'approved' }), false)
  assert.equal(canTransitionCommentContent('active', 'hidden'), true)
  assert.equal(canTransitionCommentContent('deleted', 'active'), false)
  assert.equal(canTransitionCommentModeration('pending', 'approved'), true)
  assert.equal(canTransitionCommentModeration('approved', 'pending'), false)
  assert.ok(Object.isFrozen(COMMENT_CONTENT_TRANSITIONS))
  assert.ok(Object.isFrozen(COMMENT_MODERATION_TRANSITIONS))
})

test('moderation action matrix is fail-closed', () => {
  assert.deepEqual(DEFAULT_MODERATION_ACTIONS, {
    normal: 'approve',
    risk: 'review',
    violation: 'reject',
    illegal_or_ip: 'quarantine',
    spam: 'spam',
    unknown: 'review',
  })
  assert.equal(resolveModerationAction('normal'), 'approve')
  assert.equal(resolveModerationAction('unknown'), 'review')
  assert.equal(resolveModerationAction('not-a-level'), 'review')
  assert.equal(resolveModerationAction('normal', { normal: 'invalid' }), 'review')
  assert.deepEqual(MODERATION_LEVELS, ['normal', 'risk', 'violation', 'illegal_or_ip', 'spam', 'unknown'])
})

test('report types and target scopes are explicit', () => {
  assert.ok(REPORT_TYPES.includes('unsafe_content'))
  assert.ok(REPORT_TYPES.includes('copyright_takedown'))
  assert.equal(isValidReportType('illegal_content'), true)
  assert.equal(isValidReportType('sensitive_words'), false)
  assert.equal(isValidReportTargetScope('share'), true)
  assert.equal(isValidReportTargetScope('feature'), true)
  assert.equal(isValidReportTargetScope('media'), true)
  assert.equal(isValidReportTargetScope('comment'), false)
  assert.ok(REPORT_STATUSES.includes('investigating'))
  assert.ok(REPORT_ACTIONS.includes('block_share'))
  assert.equal(canTransitionReportStatus('new', 'triaged'), true)
  assert.equal(canTransitionReportStatus('new', 'investigating'), true)
  assert.equal(canTransitionReportStatus('new', 'actioned'), true)
  assert.equal(canTransitionReportStatus('closed', 'actioned'), false)
  assert.ok(Object.isFrozen(REPORT_STATUS_TRANSITIONS))
  assert.deepEqual(DEFAULT_INTERACTION_RETENTION, {
    approvedCommentDays: 730,
    nonPublicCommentDays: 90,
    anonymousContactDays: 90,
    aiRawResultDays: 30,
    reportDays: 730,
  })
})
