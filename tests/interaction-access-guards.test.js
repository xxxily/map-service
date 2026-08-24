import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FORBIDDEN_RESPONSE_FIELDS,
  INTERACTION_ADMIN_PERMISSIONS,
  assertCommentAuthentication,
  assertInteractionAdminAccess,
  assertPublicCommentWrite,
  findForbiddenResponseFields,
  redactModerationComment,
  redactModerationComments,
} from '../service/bin/interaction/accessGuards.js'
import { createMutableInteractionPolicy } from '../service/bin/interaction/commentPolicy.js'
import {
  ADMIN_PERMISSIONS,
  BUILTIN_ROLES,
  PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
  USER_PERMISSIONS,
  isKnownPermission,
} from '../service/bin/user/permissions.js'
import { createHttpError } from '../service/bin/user/security.js'

const TEST_NOW = '2026-08-23T00:00:00.000Z'

function request (options = {}) {
  const headers = options.headers || {}
  return {
    method: options.method || 'POST',
    headers,
    get: name => headers[String(name).toLowerCase()] || '',
  }
}

function session (permissions = ['account.self.read'], overrides = {}) {
  return {
    id: 'ses_test',
    csrfHash: 'csrf-hash',
    user: { id: 'usr_1', username: 'tester', displayName: '测试用户', roles: ['user'], permissions, ...overrides },
  }
}

/** Stands in for service.verifyUserCsrf, which throws 403 CSRF_INVALID. */
function csrfVerifier (expected) {
  const calls = []
  const verify = (activeSession, token) => {
    calls.push({ session: activeSession, token })
    if (token !== expected) {
      throw createHttpError('请求安全校验失败，请刷新页面后重试', 403, 'CSRF_INVALID')
    }
  }
  return { verify, calls }
}

/** Stands in for service.assertUserPermission. */
function permissionAsserter () {
  const calls = []
  const assertPermission = (activeSession, permission) => {
    calls.push(permission)
    const granted = (activeSession && activeSession.user && activeSession.user.permissions) || []
    if (granted.includes('system.super_admin')) return
    if (!granted.includes(permission)) {
      throw createHttpError('没有访问权限', 403, 'PERMISSION_DENIED')
    }
  }
  return { assertPermission, calls }
}

function sameOriginAsserter (allowed = true) {
  const calls = []
  const assertSameOrigin = req => {
    calls.push(req)
    if (!allowed) throw createHttpError('请求来源校验失败', 403, 'CSRF_INVALID')
  }
  return { assertSameOrigin, calls }
}

function moderationRow (overrides = {}) {
  return {
    id: 'cmt_one',
    canonical_share_id: 'share_one',
    share_public_id_snapshot: 'shr_public_demo',
    share_item_id: 'shi_demo',
    feature_id: 'feature_demo',
    scope: 'feature',
    content_revision: 1,
    parent_id: null,
    thread_depth: 0,
    author_type: 'anonymous',
    author_user_id: '',
    author_key: 'anon_secret_key',
    display_name_snapshot: '访客',
    body_raw_encrypted: 'aes-256-gcm$1$iv$tag$payload',
    body_normalized: '待审内容',
    body_rendered: '待审内容',
    consent_policy_version: 1,
    contact_ciphertext: 'aes-256-gcm$1$iv$tag$contact',
    contact_hash: 'hash_of_contact',
    contact_type: 'email',
    content_status: 'active',
    moderation_status: 'pending',
    moderation_level: 'risk',
    visible_at: null,
    created_at: TEST_NOW,
    updated_at: TEST_NOW,
    approved_at: null,
    deleted_at: null,
    orphaned_at: null,
    legal_hold: 0,
    resource_snapshot_json: '{"secret":"snapshot"}',
    ...overrides,
  }
}

test('logged-in comment writes require a valid CSRF token', () => {
  const csrf = csrfVerifier('good-token')
  const active = session()

  const result = assertPublicCommentWrite({
    req: request({ headers: { 'x-csrf-token': 'good-token' } }),
    session: active,
    verifyCsrf: csrf.verify,
  })
  assert.deepEqual(result, { authorType: 'user', csrfChecked: true })
  assert.equal(csrf.calls.length, 1)
  assert.equal(csrf.calls[0].session, active)

  for (const headers of [{ 'x-csrf-token': 'wrong' }, {}]) {
    assert.throws(() => assertPublicCommentWrite({
      req: request({ headers }),
      session: active,
      verifyCsrf: csrf.verify,
    }), error => {
      assert.equal(error.code, 'CSRF_INVALID')
      assert.equal(error.statusCode, 403)
      return true
    })
  }
  // A missing token must reach the verifier rather than short-circuit.
  assert.equal(csrf.calls.length, 3)
  assert.equal(csrf.calls[2].token, '')
})

test('anonymous comment writes require the same-origin check instead of CSRF', () => {
  const csrf = csrfVerifier('good-token')
  const origin = sameOriginAsserter(true)

  const result = assertPublicCommentWrite({
    req: request(),
    session: null,
    verifyCsrf: csrf.verify,
    assertSameOrigin: origin.assertSameOrigin,
  })
  assert.deepEqual(result, { authorType: 'anonymous', csrfChecked: false })
  assert.equal(origin.calls.length, 1)
  // There is no session to bind a CSRF token to, so it must not be consulted.
  assert.equal(csrf.calls.length, 0)

  const blocked = sameOriginAsserter(false)
  assert.throws(() => assertPublicCommentWrite({
    req: request(),
    session: null,
    assertSameOrigin: blocked.assertSameOrigin,
  }), error => {
    assert.equal(error.code, 'CSRF_INVALID')
    assert.equal(error.statusCode, 403)
    return true
  })
})

test('a missing guard implementation fails closed rather than skipping the check', () => {
  assert.throws(() => assertPublicCommentWrite({ req: request(), session: session() }), error => {
    assert.equal(error.code, 'INTERACTION_SERVICE_UNAVAILABLE')
    assert.equal(error.statusCode, 503)
    return true
  })
  assert.throws(() => assertPublicCommentWrite({ req: request(), session: null }), error => {
    assert.equal(error.code, 'INTERACTION_SERVICE_UNAVAILABLE')
    return true
  })
  assert.throws(() => assertInteractionAdminAccess({
    session: session(['admin.comment.read']), action: 'comments.list',
  }), error => {
    assert.equal(error.code, 'INTERACTION_SERVICE_UNAVAILABLE')
    return true
  })
})

test('read-only comment requests skip the write guards', () => {
  const csrf = csrfVerifier('good-token')
  const origin = sameOriginAsserter(true)
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const result = assertPublicCommentWrite({
      req: request({ method }),
      session: null,
      verifyCsrf: csrf.verify,
      assertSameOrigin: origin.assertSameOrigin,
    })
    assert.equal(result.csrfChecked, false)
  }
  assert.equal(csrf.calls.length, 0)
  assert.equal(origin.calls.length, 0)
})

test('login is required when the policy disables anonymous comments', () => {
  const strict = createMutableInteractionPolicy()
  assert.throws(() => assertCommentAuthentication({ session: null, policy: strict }), error => {
    assert.equal(error.code, 'AUTH_REQUIRED')
    assert.equal(error.statusCode, 401)
    return true
  })
  assert.equal(assertCommentAuthentication({ session: session(), policy: strict }).id, 'ses_test')

  const open = createMutableInteractionPolicy({ comments: { anonymous: { enabled: true } } })
  assert.equal(assertCommentAuthentication({ session: null, policy: open }), null)

  // Fail closed on a malformed or missing policy.
  for (const policy of [undefined, {}, { comments: {} }, { comments: { anonymous: {} } }]) {
    assert.throws(() => assertCommentAuthentication({ session: null, policy }), error => {
      assert.equal(error.code, 'AUTH_REQUIRED')
      return true
    })
  }
})

test('admin interaction routes map to real user-system permissions', () => {
  const known = PERMISSIONS.map(entry => entry.code)
  for (const [action, permission] of Object.entries(INTERACTION_ADMIN_PERMISSIONS)) {
    assert.equal(known.includes(permission), true, `${action} 映射到未知权限 ${permission}`)
  }
  // Read and moderate are distinct: the user system has no implication between
  // them, so a moderate-only session must not be assumed able to read.
  assert.equal(INTERACTION_ADMIN_PERMISSIONS['comments.list'], 'admin.comment.read')
  assert.equal(INTERACTION_ADMIN_PERMISSIONS['comments.review'], 'admin.comment.moderate')
  assert.equal(INTERACTION_ADMIN_PERMISSIONS['moderation.settings.write'], 'admin.comment.policy.manage')
  assert.equal(INTERACTION_ADMIN_PERMISSIONS['reports.actions'], 'admin.report.manage')

  // Policy, AI and keyword management stay super-admin only.
  assert.equal(ADMIN_PERMISSIONS.includes('admin.comment.read'), true)
  assert.equal(ADMIN_PERMISSIONS.includes('admin.comment.moderate'), true)
  assert.equal(ADMIN_PERMISSIONS.includes('admin.comment.policy.manage'), false)
  assert.equal(ADMIN_PERMISSIONS.includes('admin.moderation.ai.manage'), false)
  assert.equal(ADMIN_PERMISSIONS.includes('admin.moderation.keyword.manage'), false)
  // No ordinary user may reach any interaction admin permission.
  for (const permission of Object.values(INTERACTION_ADMIN_PERMISSIONS)) {
    assert.equal(USER_PERMISSIONS.includes(permission), false)
  }
  assert.equal(BUILTIN_ROLES.some(role => role.id === 'role_super_admin'), true)
  // Super admin holds every interaction permission by construction.
  for (const permission of Object.values(INTERACTION_ADMIN_PERMISSIONS)) {
    assert.equal(SUPER_ADMIN_PERMISSIONS.includes(permission), true)
    assert.equal(isKnownPermission(permission), true)
  }
})

test('admin access enforces RBAC per action and rejects anonymous callers', () => {
  const permissions = permissionAsserter()
  const csrf = csrfVerifier('good-token')

  const granted = assertInteractionAdminAccess({
    session: session(['admin.comment.read']),
    action: 'comments.list',
    req: request({ method: 'GET' }),
    assertPermission: permissions.assertPermission,
    verifyCsrf: csrf.verify,
  })
  assert.equal(granted.permission, 'admin.comment.read')
  assert.deepEqual(permissions.calls, ['admin.comment.read'])
  // A read is not a write, so no CSRF check is required.
  assert.equal(csrf.calls.length, 0)

  // Read permission does not imply moderate.
  assert.throws(() => assertInteractionAdminAccess({
    session: session(['admin.comment.read']),
    action: 'comments.review',
    req: request({ headers: { 'x-csrf-token': 'good-token' } }),
    assertPermission: permissions.assertPermission,
    verifyCsrf: csrf.verify,
  }), error => {
    assert.equal(error.code, 'PERMISSION_DENIED')
    assert.equal(error.statusCode, 403)
    return true
  })

  // Moderate permission does not imply policy management either.
  assert.throws(() => assertInteractionAdminAccess({
    session: session(['admin.comment.moderate']),
    action: 'moderation.settings.write',
    req: request({ headers: { 'x-csrf-token': 'good-token' } }),
    assertPermission: permissions.assertPermission,
    verifyCsrf: csrf.verify,
  }), /没有访问权限/)

  // Super admin passes everything.
  for (const action of Object.keys(INTERACTION_ADMIN_PERMISSIONS)) {
    assert.equal(assertInteractionAdminAccess({
      session: session(['system.super_admin']),
      action,
      req: request({ method: 'GET' }),
      assertPermission: permissions.assertPermission,
      verifyCsrf: csrf.verify,
    }).permission, INTERACTION_ADMIN_PERMISSIONS[action])
  }

  assert.throws(() => assertInteractionAdminAccess({
    session: null,
    action: 'comments.list',
    assertPermission: permissions.assertPermission,
  }), error => {
    assert.equal(error.code, 'AUTH_REQUIRED')
    assert.equal(error.statusCode, 401)
    return true
  })
  assert.throws(() => assertInteractionAdminAccess({
    session: session(['system.super_admin']),
    action: 'comments.nope',
    assertPermission: permissions.assertPermission,
  }), error => {
    assert.equal(error.code, 'VALIDATION_FAILED')
    return true
  })
})

test('admin write actions require both RBAC and CSRF', () => {
  const permissions = permissionAsserter()
  const csrf = csrfVerifier('good-token')
  const moderator = session(['admin.comment.moderate'])

  const granted = assertInteractionAdminAccess({
    session: moderator,
    action: 'comments.review',
    req: request({ headers: { 'x-csrf-token': 'good-token' } }),
    assertPermission: permissions.assertPermission,
    verifyCsrf: csrf.verify,
  })
  assert.equal(granted.permission, 'admin.comment.moderate')
  assert.equal(csrf.calls.length, 1)

  // Correct permission but a bad CSRF token is still refused.
  assert.throws(() => assertInteractionAdminAccess({
    session: moderator,
    action: 'comments.review',
    req: request({ headers: { 'x-csrf-token': 'stale' } }),
    assertPermission: permissions.assertPermission,
    verifyCsrf: csrf.verify,
  }), error => {
    assert.equal(error.code, 'CSRF_INVALID')
    return true
  })
  // Permission is checked before CSRF, so an unauthorized caller learns
  // nothing about token validity: the RBAC failure wins even when the token is
  // also bad.
  assert.equal(permissions.calls.length, 2)
  assert.throws(() => assertInteractionAdminAccess({
    session: session(['admin.comment.read']),
    action: 'comments.review',
    req: request({ headers: { 'x-csrf-token': 'stale' } }),
    assertPermission: permissions.assertPermission,
    verifyCsrf: csrf.verify,
  }), error => {
    assert.equal(error.code, 'PERMISSION_DENIED')
    return true
  })
  assert.equal(csrf.calls.length, 2)
})

test('the admin comment projection redacts every sensitive field', () => {
  const view = redactModerationComment(moderationRow())

  assert.deepEqual(findForbiddenResponseFields(view), [])
  const serialized = JSON.stringify(view)
  assert.equal(serialized.includes('aes-256-gcm'), false)
  assert.equal(serialized.includes('hash_of_contact'), false)
  assert.equal(serialized.includes('anon_secret_key'), false)
  assert.equal(serialized.includes('snapshot'), false)

  // Moderators still get what they need to decide.
  assert.equal(view.body, '待审内容')
  assert.equal(view.moderationStatus, 'pending')
  assert.equal(view.moderationLevel, 'risk')
  assert.equal(view.contactType, 'email')
  assert.equal(view.contactProvided, true)
  assert.equal(view.authorRegistered, false)
  assert.equal(view.legalHold, false)

  const registered = redactModerationComment(moderationRow({
    author_type: 'user', author_user_id: 'usr_42', contact_type: '', contact_ciphertext: '', contact_hash: '',
  }))
  assert.equal(registered.authorRegistered, true)
  assert.equal(registered.contactProvided, false)
  assert.equal(JSON.stringify(registered).includes('usr_42'), false)

  assert.equal(redactModerationComment(null), null)
  assert.equal(redactModerationComments([moderationRow(), null]).length, 1)
  assert.equal(redactModerationComments().length, 0)
  assert.equal(FORBIDDEN_RESPONSE_FIELDS.includes('contactCiphertext'), true)
  assert.equal(Object.isFrozen(FORBIDDEN_RESPONSE_FIELDS), true)
})
