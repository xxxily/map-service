import test from 'node:test'
import assert from 'node:assert/strict'

import InteractionDatabase from '../service/bin/interaction/database.js'
import {
  INTERACTION_ERROR_STATUS,
  InteractionPolicyStore,
  assertCommentSubmissionAllowed,
  commentIdempotencyIdentity,
  commentOutboxDedupeKey,
  createMutableInteractionPolicy,
  deriveCommentAuthorKey,
  interactionErrorStatus,
  mapInteractionDatabaseError,
  normalizeCommentSubmission,
  resolveCommentAuthorContext,
  resolveInitialModerationState,
  toInteractionHttpError,
} from '../service/bin/interaction/commentPolicy.js'
import { encryptInteractionSecret } from '../service/bin/interaction/security.js'
import { DEFAULT_INTERACTION_POLICY } from '../shared/interaction-policy.js'

const TEST_SECRET = 'interaction-comment-policy-test-key'
const TEST_NOW = '2026-08-23T00:00:00.000Z'

function policy (overrides = {}) {
  return createMutableInteractionPolicy(overrides)
}

function userSession (overrides = {}) {
  return {
    id: 'ses_test',
    csrfHash: 'csrf-hash',
    user: { id: 'usr_1', username: 'tester', displayName: '测试用户', roles: ['user'], ...overrides },
  }
}

function commentBody (overrides = {}) {
  return {
    body: '这是一条正常留言',
    consent: true,
    resourceRef: {
      siteId: 'map-service',
      sharePublicId: 'shr_public_demo',
      shareItemId: 'shi_demo',
      featureId: 'feature_demo',
      scope: 'feature',
    },
    ...overrides,
  }
}

function withDatabase (run) {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  try {
    return run(database)
  } finally {
    database.close()
  }
}

test('interaction policy store publishes versions and fails closed without one', () => {
  withDatabase(database => {
    const store = new InteractionPolicyStore({ database, now: () => TEST_NOW })

    assert.equal(store.getActiveVersion(), null)
    assert.throws(() => store.requireActivePolicy(), error => {
      assert.equal(error.code, 'INTERACTION_SERVICE_UNAVAILABLE')
      assert.equal(error.statusCode, 503)
      return true
    })

    const first = store.publish(policy(), { createdBy: 'usr_admin' })
    assert.equal(first, 1)
    const active = store.requireActivePolicy()
    assert.equal(active.version, 1)
    assert.equal(active.policy.comments.enabled, true)
    assert.equal(active.policy.comments.anonymous.enabled, false)

    // Publishing again must supersede the previous row; the schema keeps a
    // unique partial index on active = 1.
    const second = store.publish(policy({ comments: { anonymous: { enabled: true } } }), { createdBy: 'usr_admin' })
    assert.equal(second, 2)
    assert.equal(store.requireActivePolicy().version, 2)
    assert.equal(store.requireActivePolicy().policy.comments.anonymous.enabled, true)
    assert.equal(
      database.prepare('SELECT COUNT(*) AS count FROM interaction_policy_versions WHERE active = 1').get().count,
      1
    )
    assert.equal(
      database.prepare('SELECT superseded_at FROM interaction_policy_versions WHERE version = 1').get().superseded_at,
      TEST_NOW
    )
  })
})

test('mutable policy clone does not share state with the frozen default', () => {
  const first = policy()
  first.comments.anonymous.enabled = true
  first.comments.maxLength = 10
  assert.equal(DEFAULT_INTERACTION_POLICY.comments.anonymous.enabled, false)
  assert.equal(DEFAULT_INTERACTION_POLICY.comments.maxLength, 2000)
  assert.equal(policy().comments.anonymous.enabled, false)
})

test('author context is derived from the session and never from the request body', () => {
  assert.deepEqual(resolveCommentAuthorContext(null), {
    authorType: 'anonymous', authorUserId: '', displayName: '',
  })
  assert.deepEqual(resolveCommentAuthorContext(userSession()), {
    authorType: 'user', authorUserId: 'usr_1', displayName: '测试用户',
  })
  assert.equal(resolveCommentAuthorContext(userSession({ roles: ['admin'] })).authorType, 'admin')
  assert.equal(resolveCommentAuthorContext(userSession({ roles: ['role_super_admin'] })).authorType, 'admin')

  // A logged-out caller claiming to be a user stays anonymous.
  const anonymous = normalizeCommentSubmission({
    input: commentBody({ authorType: 'user', displayName: '访客', email: 'guest@example.com' }),
    session: null,
    policy: policy({ comments: { anonymous: { enabled: true, contactRequirement: 'email_or_phone' } } }),
    consentPolicyVersion: 1,
  })
  assert.equal(anonymous.authorType, 'anonymous')
  assert.equal(anonymous.authorUserId, '')

  // A logged-in caller cannot hide behind an anonymous record.
  const identified = normalizeCommentSubmission({
    input: commentBody({ authorType: 'anonymous', displayName: '假名' }),
    session: userSession(),
    policy: policy(),
    consentPolicyVersion: 1,
  })
  assert.equal(identified.authorType, 'user')
  assert.equal(identified.authorUserId, 'usr_1')
  assert.equal(identified.displayName, '测试用户')
})

test('anonymous submissions are rejected unless the policy enables them', () => {
  assert.throws(() => assertCommentSubmissionAllowed(policy(), 'anonymous'), error => {
    assert.equal(error.code, 'ANONYMOUS_COMMENTS_DISABLED')
    assert.equal(error.statusCode, 403)
    return true
  })
  assert.equal(assertCommentSubmissionAllowed(policy({ comments: { anonymous: { enabled: true } } }), 'anonymous'), true)
  assert.equal(assertCommentSubmissionAllowed(policy(), 'user'), true)

  // Comments switched off blocks every author type, including admins.
  for (const authorType of ['anonymous', 'user', 'admin']) {
    assert.throws(() => assertCommentSubmissionAllowed(policy({ comments: { enabled: false } }), authorType), error => {
      assert.equal(error.code, 'COMMENT_POLICY_BLOCKED')
      return true
    })
  }
  // Fail closed on a malformed policy rather than defaulting to open.
  assert.throws(() => assertCommentSubmissionAllowed({}, 'user'), /未开启留言功能/)
  assert.throws(() => assertCommentSubmissionAllowed(policy(), 'robot'), error => {
    assert.equal(error.code, 'COMMENT_POLICY_BLOCKED')
    return true
  })
})

test('anonymous submission requires a display name, consent and contact', () => {
  const anonymousPolicy = policy({ comments: { anonymous: { enabled: true, contactRequirement: 'email_or_phone' } } })
  const base = { session: null, policy: anonymousPolicy, consentPolicyVersion: 1 }

  const ok = normalizeCommentSubmission({ ...base, input: commentBody({ displayName: '访客', email: 'guest@example.com' }) })
  assert.equal(ok.displayName, '访客')
  assert.equal(ok.email, 'guest@example.com')
  assert.equal(ok.type, 'email')
  assert.equal(ok.consentPolicyVersion, 1)

  assert.throws(() => normalizeCommentSubmission({ ...base, input: commentBody({ email: 'guest@example.com' }) }), error => {
    assert.equal(error.code, 'DISPLAY_NAME_REQUIRED')
    assert.equal(error.statusCode, 400)
    return true
  })
  assert.throws(() => normalizeCommentSubmission({ ...base, input: commentBody({ displayName: '访客' }) }), error => {
    assert.equal(error.code, 'CONTACT_REQUIRED')
    return true
  })
  assert.throws(() => normalizeCommentSubmission({
    ...base,
    input: commentBody({ displayName: '访客', email: 'guest@example.com', consent: false }),
  }), error => {
    assert.equal(error.code, 'CONSENT_REQUIRED')
    return true
  })
})

test('invalid comment input maps contract codes onto documented statuses', () => {
  const base = { session: userSession(), policy: policy(), consentPolicyVersion: 1 }

  assert.throws(() => normalizeCommentSubmission({ ...base, input: commentBody({ body: '' }) }), error => {
    assert.equal(error.code, 'VALIDATION_FAILED')
    assert.equal(error.statusCode, 400)
    return true
  })
  assert.throws(() => normalizeCommentSubmission({ ...base, input: commentBody({ body: '<script>x</script>' }) }), error => {
    assert.equal(error.code, 'UNSAFE_TEXT')
    assert.equal(error.statusCode, 400)
    return true
  })
  assert.throws(() => normalizeCommentSubmission({ ...base, input: commentBody({ body: 'a'.repeat(2001) }) }), error => {
    assert.equal(error.code, 'CONTENT_TOO_LARGE')
    assert.equal(error.statusCode, 413)
    return true
  })
  // The policy may lower the limit below the contract ceiling.
  assert.throws(() => normalizeCommentSubmission({
    ...base,
    policy: policy({ comments: { maxLength: 5 } }),
    input: commentBody({ body: '超过五个字的留言' }),
  }), error => {
    assert.equal(error.code, 'CONTENT_TOO_LARGE')
    return true
  })
  assert.throws(() => normalizeCommentSubmission({ ...base, consentPolicyVersion: undefined, input: commentBody() }), error => {
    assert.equal(error.code, 'CONSENT_POLICY_VERSION_INVALID')
    return true
  })
  assert.throws(() => normalizeCommentSubmission({
    ...base,
    input: commentBody({ resourceRef: { siteId: 'map-service', sharePublicId: 'shr_public_demo', scope: 'share' } }),
  }), error => {
    assert.equal(error.statusCode, 400)
    return true
  })
})

test('replies are blocked unless the policy enables public replies', () => {
  const base = { session: userSession(), consentPolicyVersion: 1 }
  assert.throws(() => normalizeCommentSubmission({
    ...base,
    policy: policy(),
    input: commentBody({ parentId: 'cmt_parent' }),
  }), error => {
    assert.equal(error.code, 'COMMENT_POLICY_BLOCKED')
    assert.equal(error.statusCode, 403)
    return true
  })

  const reply = normalizeCommentSubmission({
    ...base,
    policy: policy({ comments: { publicReplyEnabled: true } }),
    input: commentBody({ parentId: 'cmt_parent' }),
  })
  assert.equal(reply.parentId, 'cmt_parent')
  assert.equal(reply.threadDepth, 1)

  assert.equal(normalizeCommentSubmission({ ...base, policy: policy(), input: commentBody() }).threadDepth, 0)

  assert.throws(() => normalizeCommentSubmission({
    ...base,
    policy: policy({ comments: { publicReplyEnabled: true } }),
    input: commentBody({ parentId: 'not-a-comment-id' }),
  }), error => {
    assert.equal(error.code, 'PARENT_ID_INVALID')
    return true
  })
})

test('author key is stable per author and separates identities', () => {
  const userKey = deriveCommentAuthorKey({ authorType: 'user', authorUserId: 'usr_1' }, TEST_SECRET)
  assert.equal(deriveCommentAuthorKey({ authorType: 'user', authorUserId: 'usr_1' }, TEST_SECRET), userKey)
  assert.notEqual(deriveCommentAuthorKey({ authorType: 'user', authorUserId: 'usr_2' }, TEST_SECRET), userKey)
  assert.notEqual(userKey, '')
  assert.equal(userKey.includes('usr_1'), false)

  const contactKey = deriveCommentAuthorKey({ authorType: 'anonymous', contactHash: 'hash_a' }, TEST_SECRET)
  assert.equal(deriveCommentAuthorKey({ authorType: 'anonymous', contactHash: 'hash_a' }, TEST_SECRET), contactKey)
  // Contact hash wins over the IP summary so an anonymous author stays stable
  // across networks; that is what makes the idempotency index usable.
  assert.equal(
    deriveCommentAuthorKey({ authorType: 'anonymous', contactHash: 'hash_a', ipSummary: 'ip_other' }, TEST_SECRET),
    contactKey
  )
  assert.notEqual(deriveCommentAuthorKey({ authorType: 'anonymous', ipSummary: 'ip_one' }, TEST_SECRET), contactKey)

  assert.throws(() => deriveCommentAuthorKey({ authorType: 'user', authorUserId: '' }, TEST_SECRET), error => {
    assert.equal(error.code, 'AUTH_REQUIRED')
    return true
  })
  assert.throws(() => deriveCommentAuthorKey({ authorType: 'anonymous' }, TEST_SECRET), error => {
    assert.equal(error.code, 'VALIDATION_FAILED')
    return true
  })
})

test('initial moderation state never auto-approves without an explicit policy', () => {
  const strict = resolveInitialModerationState(policy(), { level: 'normal', now: TEST_NOW })
  assert.equal(strict.moderationStatus, 'pending')
  assert.equal(strict.approvedAt, null)
  assert.equal(strict.visibleAt, null)

  const relaxed = policy({ comments: { moderationRequired: false }, moderation: { autoApproveLevels: ['normal'] } })
  const auto = resolveInitialModerationState(relaxed, { level: 'normal', now: TEST_NOW })
  assert.equal(auto.moderationStatus, 'approved')
  // The schema CHECK requires approved_at whenever the status is approved.
  assert.equal(auto.approvedAt, TEST_NOW)
  assert.equal(auto.visibleAt, TEST_NOW)

  // Unknown level is fail-closed even with moderation disabled.
  const unknown = resolveInitialModerationState(
    policy({ comments: { moderationRequired: false }, moderation: { autoApproveLevels: ['normal', 'unknown'] } }),
    { level: 'unknown', now: TEST_NOW }
  )
  assert.equal(unknown.moderationStatus, 'pending')

  assert.equal(resolveInitialModerationState(relaxed, { level: 'risk', now: TEST_NOW }).moderationStatus, 'pending')
  assert.equal(resolveInitialModerationState(relaxed, { level: 'violation', now: TEST_NOW }).moderationStatus, 'rejected')
  assert.equal(resolveInitialModerationState(relaxed, { level: 'illegal_or_ip', now: TEST_NOW }).moderationStatus, 'quarantined')
  assert.equal(resolveInitialModerationState(relaxed, { level: 'spam', now: TEST_NOW }).moderationStatus, 'spam')
  // A level the policy did not opt into cannot approve even when the keyword
  // rule suggests `approve`.
  assert.equal(
    resolveInitialModerationState(
      policy({ comments: { moderationRequired: false }, moderation: { autoApproveLevels: [] } }),
      { level: 'normal', now: TEST_NOW }
    ).moderationStatus,
    'pending'
  )
  // The shipped default lists `normal` in autoApproveLevels, so
  // `moderationRequired: true` is the only thing keeping submissions in the
  // queue. Assert that guard explicitly: it is the whole "未审核内容永不公开"
  // invariant.
  assert.equal(DEFAULT_INTERACTION_POLICY.comments.moderationRequired, true)
  assert.deepEqual(DEFAULT_INTERACTION_POLICY.moderation.autoApproveLevels, ['normal'])
  assert.equal(
    resolveInitialModerationState(policy({ comments: { moderationRequired: true } }), { level: 'normal', now: TEST_NOW }).moderationStatus,
    'pending'
  )
})

test('idempotency identity and dedupe keys are deterministic', () => {
  const identity = commentIdempotencyIdentity({
    canonicalShareId: 'share_one',
    shareItemId: 'shi_demo',
    featureId: 'feature_demo',
    authorType: 'user',
    authorKey: 'key_1',
    clientRequestId: 'req_1',
  })
  assert.deepEqual(identity, {
    canonicalShareId: 'share_one',
    shareItemId: 'shi_demo',
    featureId: 'feature_demo',
    authorType: 'user',
    authorKey: 'key_1',
    clientRequestId: 'req_1',
  })
  assert.equal(commentIdempotencyIdentity({}).authorType, 'anonymous')
  assert.equal(commentIdempotencyIdentity({}).clientRequestId, '')

  assert.equal(commentOutboxDedupeKey('comment.published', 'cmt_1'), 'comment.published:cmt_1:1')
  assert.equal(commentOutboxDedupeKey('comment.published', 'cmt_1', 3), 'comment.published:cmt_1:3')
  // The dedupe index is unconditionally unique, so an empty key is unusable.
  assert.throws(() => commentOutboxDedupeKey('', 'cmt_1'), /缺少事件去重键要素/)
  assert.throws(() => commentOutboxDedupeKey('comment.published', ''), /缺少事件去重键要素/)
})

test('duplicate client request ids are rejected by the idempotency index as 409', () => {
  withDatabase(database => {
    new InteractionPolicyStore({ database, now: () => TEST_NOW }).publish(policy())
    const authorKey = deriveCommentAuthorKey({ authorType: 'user', authorUserId: 'usr_1' }, TEST_SECRET)

    const insert = (id, clientRequestId) => database.prepare(`
      INSERT INTO comments (
        id, site_id, canonical_share_id, share_public_id_snapshot, share_item_id,
        feature_id, scope, thread_depth, author_type, author_user_id, author_key,
        display_name_snapshot, body_raw_encrypted, body_normalized, body_rendered,
        consent_policy_version, content_status, moderation_status, client_request_id,
        created_at, updated_at
      ) VALUES (?, 'map-service', 'share_one', 'shr_public_demo', 'shi_demo',
        'feature_demo', 'feature', 0, 'user', 'usr_1', ?, '测试用户', ?, '内容', '内容',
        1, 'active', 'pending', ?, ?, ?)
    `).run(id, authorKey, encryptInteractionSecret('内容', TEST_SECRET, 'comment-body'), clientRequestId, TEST_NOW, TEST_NOW)

    insert('cmt_first', 'req_1')
    let mapped = null
    try {
      insert('cmt_second', 'req_1')
    } catch (error) {
      mapped = mapInteractionDatabaseError(error)
    }
    assert.ok(mapped, '重复 clientRequestId 必须被唯一索引拒绝')
    assert.equal(mapped.code, 'DUPLICATE_REQUEST')
    assert.equal(mapped.statusCode, 409)

    // An empty client request id is outside the partial index, so unrelated
    // submissions from the same author still succeed.
    insert('cmt_third', '')
    insert('cmt_fourth', '')
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM comments').get().count, 3)
  })
})

test('database trigger aborts map to fail-closed interaction errors', () => {
  const parentInvalid = mapInteractionDatabaseError(new Error('COMMENT_PARENT_INVALID'))
  // Anti-enumeration: a pending parent must look identical to a missing one.
  assert.equal(parentInvalid.code, 'COMMENT_PARENT_INVALID')
  assert.equal(parentInvalid.statusCode, 404)
  assert.match(parentInvalid.message, /资源不存在或不可评论/)

  const hasReplies = mapInteractionDatabaseError(new Error('COMMENT_PARENT_HAS_REPLIES'))
  assert.equal(hasReplies.code, 'COMMENT_PARENT_HAS_REPLIES')
  assert.equal(hasReplies.statusCode, 409)

  const decisionDuplicate = mapInteractionDatabaseError(
    new Error('UNIQUE constraint failed: index idx_comment_decisions_idempotency')
  )
  assert.equal(decisionDuplicate.code, 'DUPLICATE_REQUEST')
  const outboxDuplicate = mapInteractionDatabaseError(
    new Error('UNIQUE constraint failed: index idx_comment_outbox_dedupe')
  )
  assert.equal(outboxDuplicate.code, 'DUPLICATE_REQUEST')
})

test('interaction error codes carry the documented http statuses', () => {
  assert.equal(interactionErrorStatus('AUTH_REQUIRED'), 401)
  assert.equal(interactionErrorStatus('ANONYMOUS_COMMENTS_DISABLED'), 403)
  assert.equal(interactionErrorStatus('COMMENT_POLICY_BLOCKED'), 403)
  assert.equal(interactionErrorStatus('SHARE_ACCESS_REQUIRED'), 403)
  assert.equal(interactionErrorStatus('CSRF_INVALID'), 403)
  assert.equal(interactionErrorStatus('PERMISSION_DENIED'), 403)
  assert.equal(interactionErrorStatus('RESOURCE_NOT_FOUND'), 404)
  assert.equal(interactionErrorStatus('DUPLICATE_REQUEST'), 409)
  assert.equal(interactionErrorStatus('CONTENT_TOO_LARGE'), 413)
  assert.equal(interactionErrorStatus('RATE_LIMITED'), 429)
  assert.equal(interactionErrorStatus('INTERACTION_SERVICE_UNAVAILABLE'), 503)
  // Unknown codes default to 400 rather than leaking a 500.
  assert.equal(interactionErrorStatus('SOMETHING_ELSE'), 400)
  assert.equal(interactionErrorStatus(undefined), 400)
  assert.equal(Object.isFrozen(INTERACTION_ERROR_STATUS), true)

  // An error that already carries a status keeps it.
  const routeError = Object.assign(new Error('已存在'), { statusCode: 418, code: 'TEAPOT' })
  assert.equal(toInteractionHttpError(routeError).statusCode, 418)
  const contractError = Object.assign(new Error('内容过长'), { code: 'CONTENT_TOO_LARGE' })
  assert.equal(toInteractionHttpError(contractError).statusCode, 413)
})
