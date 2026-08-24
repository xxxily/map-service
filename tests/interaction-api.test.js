import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import commonMethods from '../service/bin/middleware/commonMethods/index.js'
import service from '../service/bin/service.js'
import simpleApi from '../service/bin/simpleApi.js'

function createApp () {
  Object.keys(simpleApi.routeSet).forEach(key => delete simpleApi.routeSet[key])
  const app = express()
  app.use(commonMethods)
  app.use(express.json())
  simpleApi.routeController(app, simpleApi.configList, simpleApi.basePath)
  return app
}

function listen (app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve({
      server,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
    }))
  })
}

function mockService (methods) {
  const originals = {}
  for (const [name, value] of Object.entries(methods)) {
    originals[name] = service[name]
    service[name] = value
  }
  return () => {
    for (const [name, value] of Object.entries(originals)) service[name] = value
  }
}

async function json (baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  return { response, payload: await response.json() }
}

const publicContext = {
  siteAccessGranted: true,
  visitorId: 'visitor-test-1234567890',
  accessToken: '',
  ip: '127.0.0.1',
  userAgent: 'test',
}

test('public interaction routes share authorization context and expose accurate count/list contracts', async () => {
  const calls = []
  const restore = mockService({
    isAccessEnabled: () => false,
    createAnonymousShareVisitorId: () => publicContext.visitorId,
    verifyUserSession: () => null,
    getPublicInteractionCommentPolicy: (id, context) => {
      calls.push(['policy', id, context.visitorId])
      return { enabled: true, policyVersion: 3, anonymous: { enabled: false, contactRequirement: 'email_or_phone' }, maxLength: 2000, moderationRequired: true, publicReplyEnabled: false }
    },
    listPublicInteractionComments: (id, query, context) => {
      calls.push(['list', id, query, context.visitorId])
      return { count: 2, items: [{ id: 'cmt_public', body: '可见', displayName: '访客', createdAt: '2026-08-23T00:00:00.000Z', replies: [] }], hasMore: false, nextCursor: '' }
    },
    getPublicInteractionCommentCount: (id, query, context) => {
      calls.push(['count', id, query, context.visitorId])
      return { count: 2, resourceRef: { sharePublicId: id, shareItemId: query.shareItemId, featureId: query.featureId, scope: 'feature' } }
    },
  })
  const { server, baseUrl } = await listen(createApp())
  try {
    const list = await json(baseUrl, '/api/v1/public/kml-shares/shr_public/comments?shareItemId=shi_1&featureId=feature_1&limit=10')
    assert.equal(list.response.status, 200)
    assert.equal(list.payload.result.count, 2)
    const count = await json(baseUrl, '/api/v1/public/kml-shares/shr_public/comments/count?shareItemId=shi_1&featureId=feature_1')
    assert.equal(count.response.status, 200)
    assert.equal(count.payload.result.count, 2)
    const policy = await json(baseUrl, '/api/v1/public/kml-shares/shr_public/comments/policy')
    assert.equal(policy.response.status, 200)
    assert.equal(policy.payload.result.policyVersion, 3)
    assert.deepEqual(calls.map(item => item[0]), ['list', 'count', 'policy'])
    assert.equal(calls[0][2].limit, 10)
    assert.equal(calls[0][2].featureId, 'feature_1')
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('public comment submission enforces login policy, CSRF, and anonymous same-origin checks', async () => {
  const session = {
    id: 'ses_interaction',
    csrfHash: 'csrf-hash',
    user: { id: 'usr_interaction', roles: ['user'], permissions: ['account.self.read'] },
  }
  let submitted = 0
  const restore = mockService({
    isAccessEnabled: () => false,
    createAnonymousShareVisitorId: () => publicContext.visitorId,
    verifyUserSession: token => token === 'session-token' ? session : null,
    getPublicInteractionCommentPolicy: () => ({ enabled: true, policyVersion: 1, anonymous: { enabled: false, contactRequirement: 'email_or_phone' }, maxLength: 2000, moderationRequired: true, publicReplyEnabled: false }),
    verifyUserCsrf: (current, token) => {
      if (current !== session || token !== 'csrf-token') {
        const error = new Error('CSRF invalid')
        error.statusCode = 403
        error.code = 'CSRF_INVALID'
        throw error
      }
    },
    submitPublicInteractionComment: () => {
      submitted += 1
      return { id: 'cmt_new', moderationStatus: 'pending', pending: true, duplicate: false }
    },
  })
  const { server, baseUrl } = await listen(createApp())
  try {
    const anonymous = await json(baseUrl, '/api/v1/public/kml-shares/shr_public/comments', {
      method: 'POST',
      headers: { Origin: baseUrl },
      body: JSON.stringify({ body: '匿名留言' }),
    })
    assert.equal(anonymous.response.status, 401)
    assert.equal(anonymous.payload.error.code, 'AUTH_REQUIRED')
    assert.equal(submitted, 0)

    const csrf = await json(baseUrl, '/api/v1/public/kml-shares/shr_public/comments', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=session-token', Origin: baseUrl },
      body: JSON.stringify({ body: '登录留言' }),
    })
    assert.equal(csrf.response.status, 403)
    assert.equal(csrf.payload.error.code, 'CSRF_INVALID')

    const accepted = await json(baseUrl, '/api/v1/public/kml-shares/shr_public/comments', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=session-token', Origin: baseUrl, 'X-CSRF-Token': 'csrf-token' },
      body: JSON.stringify({ body: '登录留言' }),
    })
    assert.equal(accepted.response.status, 202)
    assert.equal(accepted.payload.result.accepted, true)
    assert.equal(accepted.payload.result.commentId, 'cmt_new')
    assert.equal(Object.hasOwn(accepted.payload.result, 'token'), false)
    assert.equal(submitted, 1)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('anonymous comment submission requires positive same-origin evidence', async () => {
  let submitted = 0
  const restore = mockService({
    isAccessEnabled: () => false,
    createAnonymousShareVisitorId: () => publicContext.visitorId,
    verifyUserSession: () => null,
    getPublicInteractionCommentPolicy: () => ({ enabled: true, policyVersion: 1, anonymous: { enabled: true, contactRequirement: 'email_or_phone' }, maxLength: 2000, moderationRequired: true, publicReplyEnabled: false }),
    submitPublicInteractionComment: () => {
      submitted += 1
      return { id: 'cmt_anonymous', moderationStatus: 'pending', pending: true, duplicate: false }
    },
  })
  const { server, baseUrl } = await listen(createApp())
  try {
    const missingOrigin = await json(baseUrl, '/api/v1/public/kml-shares/shr_public/comments', {
      method: 'POST',
      body: JSON.stringify({ body: '匿名留言' }),
    })
    assert.equal(missingOrigin.response.status, 403)
    assert.equal(missingOrigin.payload.error.code, 'CSRF_INVALID')

    const accepted = await json(baseUrl, '/api/v1/public/kml-shares/shr_public/comments', {
      method: 'POST',
      headers: { Origin: baseUrl },
      body: JSON.stringify({ body: '匿名留言' }),
    })
    assert.equal(accepted.response.status, 202)
    assert.equal(accepted.payload.result.commentId, 'cmt_anonymous')
    assert.equal(submitted, 1)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('admin interaction routes enforce RBAC and CSRF before service calls', async () => {
  const session = {
    id: 'ses_admin',
    csrfHash: 'csrf-hash',
    user: { id: 'usr_admin', roles: ['admin'], permissions: ['admin.comment.read', 'admin.comment.moderate'] },
  }
  let listed = 0
  let reviewed = 0
  let reprocessed = 0
  const restore = mockService({
    verifyUserSession: token => token === 'admin-session' ? session : null,
    assertUserPermission: (current, permission) => {
      if (current !== session || !session.user.permissions.includes(permission)) {
        const error = new Error('denied')
        error.statusCode = 403
        error.code = 'PERMISSION_DENIED'
        throw error
      }
    },
    verifyUserCsrf: (current, token) => {
      if (current !== session || token !== 'admin-csrf') {
        const error = new Error('csrf')
        error.statusCode = 403
        error.code = 'CSRF_INVALID'
        throw error
      }
    },
    listInteractionCommentsForAdmin: () => {
      listed += 1
      return { total: 0, page: 1, limit: 20, items: [] }
    },
    moderateInteractionComment: () => {
      reviewed += 1
      return { applied: true, moderationStatus: 'approved' }
    },
    reprocessInteractionComment: () => {
      reprocessed += 1
      return { applied: true, moderationStatus: 'pending', keywordPolicyVersion: 2 }
    },
  })
  const { server, baseUrl } = await listen(createApp())
  try {
    const unauthenticated = await json(baseUrl, '/api/v1/admin/comments')
    assert.equal(unauthenticated.response.status, 401)
    const list = await json(baseUrl, '/api/v1/admin/comments?page=1&limit=20', {
      headers: { Cookie: 'map_user_session=admin-session' },
    })
    assert.equal(list.response.status, 200)
    assert.equal(list.payload.result.total, 0)
    assert.equal(listed, 1)
    const review = await json(baseUrl, '/api/v1/admin/comments/cmt_1/review', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=admin-session', 'X-CSRF-Token': 'admin-csrf' },
      body: JSON.stringify({ moderationStatus: 'approved' }),
    })
    assert.equal(review.response.status, 200)
    assert.equal(review.payload.result.applied, true)
    assert.equal(reviewed, 1)
    const reprocess = await json(baseUrl, '/api/v1/admin/comments/cmt_1/reprocess', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=admin-session', 'X-CSRF-Token': 'admin-csrf' },
    })
    assert.equal(reprocess.response.status, 200)
    assert.equal(reprocess.payload.result.keywordPolicyVersion, 2)
    assert.equal(reprocessed, 1)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('AI provider management routes enforce permission/CSRF and redact secrets', async () => {
  const session = {
    id: 'ses_provider_admin',
    csrfHash: 'csrf-hash',
    user: { id: 'usr_provider_admin', permissions: ['admin.moderation.ai.manage'] },
  }
  const calls = []
  const restore = mockService({
    verifyUserSession: token => token === 'provider-admin' ? session : null,
    assertUserPermission: (current, permission) => {
      if (current !== session || permission !== 'admin.moderation.ai.manage') {
        const error = new Error('denied')
        error.statusCode = 403
        error.code = 'PERMISSION_DENIED'
        throw error
      }
    },
    verifyUserCsrf: (current, token) => {
      if (current !== session || token !== 'provider-csrf') {
        const error = new Error('csrf')
        error.statusCode = 403
        error.code = 'CSRF_INVALID'
        throw error
      }
    },
    listInteractionAiProvidersForAdmin: () => ({ enabled: true, defaultProviderId: 'p1', providers: [{ id: 'p1', endpoint: 'https://ai.example.test/v1', configured: false, enabled: true, isDefault: true }] }),
    configureInteractionAiProvider: (actor, body) => { calls.push([actor, body]); return { enabled: true, defaultProviderId: body.id, providers: [{ id: body.id, endpoint: body.endpoint, configured: false, enabled: body.enabled !== false, isDefault: true }] } },
  })
  const { server, baseUrl } = await listen(createApp())
  try {
    const denied = await json(baseUrl, '/api/v1/admin/moderation/providers')
    assert.equal(denied.response.status, 401)
    const listed = await json(baseUrl, '/api/v1/admin/moderation/providers', { headers: { Cookie: 'map_user_session=provider-admin' } })
    assert.equal(listed.response.status, 200)
    assert.equal(listed.payload.result.providers[0].configured, false)
    assert.equal(Object.hasOwn(listed.payload.result.providers[0], 'secretRef'), false)
    const missingSecret = await json(baseUrl, '/api/v1/admin/moderation/providers', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=provider-admin', 'X-CSRF-Token': 'provider-csrf' },
      body: JSON.stringify({ id: 'p-missing-secret', endpoint: 'https://ai.example.test/v1' }),
    })
    assert.equal(missingSecret.response.status, 400)
    assert.equal(missingSecret.payload.error.code, 'VALIDATION_FAILED')
    const created = await json(baseUrl, '/api/v1/admin/moderation/providers', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=provider-admin', 'X-CSRF-Token': 'provider-csrf' },
      body: JSON.stringify({ id: 'p2', endpoint: 'https://ai.example.test/v1', secretRef: 'vault://ai/p2', enabled: true, isDefault: true }),
    })
    assert.equal(created.response.status, 201)
    assert.equal(calls.length, 1)
    assert.equal(calls[0][1].secretRef, 'vault://ai/p2')
    const updated = await json(baseUrl, '/api/v1/admin/moderation/providers', {
      method: 'PUT',
      headers: { Cookie: 'map_user_session=provider-admin', 'X-CSRF-Token': 'provider-csrf' },
      body: JSON.stringify({ id: 'p2', endpoint: 'https://ai.example.test/v1' }),
    })
    assert.equal(updated.response.status, 200)
    assert.equal(calls.length, 2)
    assert.equal(calls[1][1].secretRef, undefined)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('report routes enforce public write guards and admin report RBAC without exposing duplicate state', async () => {
  const admin = { id: 'ses_report_admin', csrfHash: 'hash', user: { id: 'usr_report_admin', permissions: ['admin.report.read', 'admin.report.manage'] } }
  let submitted = 0
  let actioned = 0
  const restore = mockService({
    isAccessEnabled: () => false,
    createAnonymousShareVisitorId: () => publicContext.visitorId,
    verifyUserSession: token => token === 'report-admin' ? admin : null,
    assertUserPermission: (session, permission) => { if (session !== admin || !admin.user.permissions.includes(permission)) { const error = new Error('denied'); error.statusCode = 403; error.code = 'PERMISSION_DENIED'; throw error } },
    verifyUserCsrf: (session, token) => { if (session !== admin || token !== 'report-csrf') { const error = new Error('csrf'); error.statusCode = 403; error.code = 'CSRF_INVALID'; throw error } },
    submitPublicInteractionReport: () => { submitted += 1; return { id: 'rpt_public', status: 'new', duplicate: true } },
    listInteractionReportsForAdmin: () => ({ total: 1, page: 1, limit: 20, items: [{ id: 'rpt_public', status: 'new', contact: '' }] }),
    getInteractionReportForAdmin: () => ({ id: 'rpt_public', status: 'new', contact: 'v***@example.com', description: '举报说明' }),
    actionInteractionReport: () => { actioned += 1; return { applied: true, reportId: 'rpt_public', status: 'dismissed', action: 'no_action' } },
  })
  const { server, baseUrl } = await listen(createApp())
  try {
    const denied = await json(baseUrl, '/api/v1/public/kml-shares/shr_public/reports', { method: 'POST', body: JSON.stringify({}) })
    assert.equal(denied.response.status, 403)
    const accepted = await json(baseUrl, '/api/v1/public/kml-shares/shr_public/reports', { method: 'POST', headers: { Origin: baseUrl }, body: JSON.stringify({}) })
    assert.equal(accepted.response.status, 202)
    assert.equal(accepted.payload.result.reportId, 'rpt_public')
    assert.equal(Object.hasOwn(accepted.payload.result, 'duplicate'), false)
    assert.equal(submitted, 1)
    const list = await json(baseUrl, '/api/v1/admin/reports', { headers: { Cookie: 'map_user_session=report-admin' } })
    assert.equal(list.response.status, 200)
    const action = await json(baseUrl, '/api/v1/admin/reports/rpt_public/actions', { method: 'POST', headers: { Cookie: 'map_user_session=report-admin', 'X-CSRF-Token': 'report-csrf' }, body: JSON.stringify({ action: 'no_action', reason: '证据不足' }) })
    assert.equal(action.response.status, 200)
    assert.equal(actioned, 1)
  } finally { await new Promise(resolve => server.close(resolve)); restore() }
})

test('public info route reuses share authorization and exposes only redacted source/report descriptors', async () => {
  const calls = []
  const restore = mockService({
    isAccessEnabled: () => false,
    createAnonymousShareVisitorId: () => publicContext.visitorId,
    verifyUserSession: () => null,
    getPublicInteractionInfo: (id, context) => { calls.push([id, context.visitorId]); return { source: { title: '公开路线', description: '说明' }, agreements: { privacyUrl: '/privacy', termsUrl: '/terms' }, reports: { enabled: true, anonymousEnabled: true, types: ['other'] }, resource: { sharePublicId: id } } },
  })
  const { server, baseUrl } = await listen(createApp())
  try {
    const response = await json(baseUrl, '/api/v1/public/kml-shares/shr_public/info')
    assert.equal(response.response.status, 200)
    assert.equal(response.payload.result.source.title, '公开路线')
    assert.equal(response.payload.result.resource.sharePublicId, 'shr_public')
    assert.equal(Object.hasOwn(response.payload.result.resource, 'canonicalShareId'), false)
    assert.deepEqual(calls, [['shr_public', publicContext.visitorId]])
  } finally { await new Promise(resolve => server.close(resolve)); restore() }
})
