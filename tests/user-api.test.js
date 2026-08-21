import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Readable } from 'node:stream'
import express from 'express'
import sharp from 'sharp'
import commonMethods from '../service/bin/middleware/commonMethods/index.js'
import service from '../service/bin/service.js'
import simpleApi from '../service/bin/simpleApi.js'

function createTestApp (options = {}) {
  Object.keys(simpleApi.routeSet).forEach(key => delete simpleApi.routeSet[key])
  const app = express()
  if (options.trustProxy) app.set('trust proxy', options.trustProxy)
  app.use(commonMethods)
  app.use(express.urlencoded({ extended: false }))
  app.use(express.json({ limit: '2mb' }))
  simpleApi.routeController(app, simpleApi.configList, simpleApi.basePath)
  return app
}

function listen (app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
      })
    })
  })
}

function withMockedService (methods) {
  const originals = {}
  Object.entries(methods).forEach(([name, method]) => {
    originals[name] = service[name]
    service[name] = method
  })
  return () => {
    Object.entries(originals).forEach(([name, method]) => {
      service[name] = method
    })
  }
}

async function requestJson (baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  return {
    response,
    payload: await response.json().catch(() => null),
  }
}

function cookieHeaders (response) {
  if (response.headers.getSetCookie instanceof Function) return response.headers.getSetCookie()
  const value = response.headers.get('set-cookie')
  return value ? [value] : []
}

function cookiePair (headers, name) {
  const source = headers.find(value => value.includes(`${name}=`)) || ''
  const matched = source.match(new RegExp(`(?:^|,\\s*)${name}=([^;]+)`))
  return matched ? `${name}=${matched[1]}` : ''
}

function testSession () {
  return {
    id: 'ses_test',
    csrfHash: 'csrf-hash',
    user: {
      id: 'usr_test',
      username: 'map-user',
      displayName: '地图用户',
      roles: ['user'],
      permissions: [
        'account.self.read',
        'kml.own.read',
        'kml.own.write',
        'share.own.manage',
      ],
    },
  }
}

test('user login uses HttpOnly session cookie and readable CSRF cookie without returning tokens', async () => {
  const session = testSession()
  let loginContext = null
  const restore = withMockedService({
    loginUser: async (input, context) => {
      loginContext = context
      return {
        sessionToken: 'session-token',
        csrfToken: 'csrf-token',
        maxAge: 3600000,
        expiresAt: '2030-01-01T00:00:00.000Z',
        user: session.user,
      }
    },
    verifyUserSession: token => token === 'session-token' ? session : null,
    getUserSessionView: current => ({ authenticated: Boolean(current), user: current?.user || null }),
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const login = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'X-Forwarded-For': '198.51.100.200' },
      body: JSON.stringify({ username: 'map-user', password: 'long-passphrase' }),
    })
    assert.equal(login.response.status, 200)
    assert.equal(login.payload.result.user.id, 'usr_test')
    assert.equal(Object.hasOwn(login.payload.result, 'sessionToken'), false)
    assert.equal(Object.hasOwn(login.payload.result, 'csrfToken'), false)
    assert.notEqual(loginContext.ip, '198.51.100.200')

    const cookies = cookieHeaders(login.response)
    const sessionCookie = cookiePair(cookies, 'map_user_session')
    assert.ok(sessionCookie)
    assert.ok(cookies.some(value => /map_user_session=.*HttpOnly/i.test(value)))
    assert.ok(cookies.some(value => /map_csrf_token=csrf-token/i.test(value)))
    assert.ok(cookies.some(value => /map_csrf_token=csrf-token/i.test(value) && !/map_csrf_token=[^,]*HttpOnly/i.test(value)))

    const current = await requestJson(baseUrl, '/api/v1/auth/session', {
      headers: { Cookie: sessionCookie },
    })
    assert.equal(current.payload.result.authenticated, true)
    assert.equal(current.response.headers.get('cache-control'), 'no-store')
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('SidePanel iframe login issues partitioned cookies and supports authenticated KML writes', async () => {
  const session = testSession()
  let created = 0
  const restore = withMockedService({
    loginUser: async () => ({
      sessionToken: 'embedded-session-token',
      csrfToken: 'embedded-csrf-token',
      maxAge: 3600000,
      expiresAt: '2030-01-01T00:00:00.000Z',
      user: session.user,
    }),
    verifyUserSession: token => token === 'embedded-session-token' ? session : null,
    getUserSessionView: current => ({ authenticated: Boolean(current), user: current?.user || null }),
    verifyUserCsrf: (current, token) => {
      if (current !== session || token !== 'embedded-csrf-token') {
        const err = new Error('请求安全校验失败')
        err.statusCode = 403
        err.code = 'CSRF_INVALID'
        throw err
      }
    },
    assertUserPermission: (current, permission) => {
      assert.equal(current, session)
      assert.equal(permission, 'kml.own.write')
    },
    createUserKml: () => {
      created += 1
      return { id: 'kml_sidepanel', revision: 1 }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())
  const embeddedHeaders = {
    Origin: baseUrl,
    Referer: `${baseUrl}/`,
    'Sec-Fetch-Site': 'cross-site',
    'X-Map-Embed-Context': 'iframe',
  }

  try {
    const login = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      headers: embeddedHeaders,
      body: JSON.stringify({ username: 'map-user', password: 'long-passphrase' }),
    })
    assert.equal(login.response.status, 200)
    const cookies = cookieHeaders(login.response)
    const cookieText = cookies.join('\n')
    const embeddedSessionCookie = cookiePair(cookies, 'map_user_session_embed')
    assert.ok(embeddedSessionCookie)
    assert.match(cookieText, /map_user_session_embed=embedded-session-token/i)
    assert.match(cookieText, /map_user_session_embed=[\s\S]*?HttpOnly/i)
    assert.match(cookieText, /map_user_session_embed=[\s\S]*?Secure/i)
    assert.match(cookieText, /map_user_session_embed=[\s\S]*?Partitioned/i)
    assert.match(cookieText, /map_user_session_embed=[\s\S]*?Priority=High/i)
    assert.match(cookieText, /map_user_session_embed=[\s\S]*?SameSite=None/i)
    assert.match(cookieText, /map_csrf_token_embed=embedded-csrf-token/i)

    const current = await requestJson(baseUrl, '/api/v1/auth/session', {
      headers: {
        Cookie: embeddedSessionCookie,
        'X-Map-Embed-Context': 'iframe',
      },
    })
    assert.equal(current.response.status, 200)
    assert.equal(current.payload.result.authenticated, true)

    const createdKml = await requestJson(baseUrl, '/api/v1/kml/files', {
      method: 'POST',
      headers: {
        Cookie: embeddedSessionCookie,
        'X-CSRF-Token': 'embedded-csrf-token',
        'X-Map-Embed-Context': 'iframe',
      },
      body: JSON.stringify({ name: '侧栏 KML' }),
    })
    assert.equal(createdKml.response.status, 201)
    assert.equal(createdKml.payload.result.id, 'kml_sidepanel')
    assert.equal(created, 1)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('SidePanel stale partitioned session cookies are cleared without affecting the ordinary session', async () => {
  const session = testSession()
  let syncCalls = 0
  const restore = withMockedService({
    verifyUserSession: token => token === 'ordinary-session' ? session : null,
    verifyUserCsrf: (current, token) => {
      if (current !== session || token !== 'ordinary-csrf') {
        const err = new Error('请求安全校验失败')
        err.statusCode = 403
        err.code = 'CSRF_INVALID'
        throw err
      }
    },
    assertUserPermission: (current, permission) => {
      assert.equal(current, session)
      assert.equal(permission, 'kml.own.write')
    },
    syncUserKmlFiles: () => {
      syncCalls += 1
      return { results: [], syncedAt: '2030-01-01T00:00:00.000Z' }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())
  const cookie = [
    'map_user_session_embed=revoked-session',
    'map_csrf_token_embed=revoked-csrf',
    'map_user_session=ordinary-session',
    'map_csrf_token=ordinary-csrf',
  ].join('; ')

  try {
    const stale = await requestJson(baseUrl, '/api/v1/kml/sync', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'X-CSRF-Token': 'revoked-csrf',
        'X-Map-Embed-Context': 'iframe',
      },
      body: JSON.stringify({ operations: [{ action: 'update', kmlId: 'kml_test', data: {} }] }),
    })
    assert.equal(stale.response.status, 403)
    assert.equal(stale.payload.error.code, 'CSRF_INVALID')
    assert.ok(cookieHeaders(stale.response).some(value => /map_user_session_embed=;/i.test(value)))
    assert.ok(cookieHeaders(stale.response).some(value => /map_csrf_token_embed=;/i.test(value)))
    assert.equal(syncCalls, 0)

    const recovered = await requestJson(baseUrl, '/api/v1/kml/sync', {
      method: 'POST',
      headers: {
        Cookie: 'map_user_session=ordinary-session; map_csrf_token=ordinary-csrf',
        'X-CSRF-Token': 'ordinary-csrf',
        'X-Map-Embed-Context': 'iframe',
      },
      body: JSON.stringify({ operations: [{ action: 'update', kmlId: 'kml_test', data: {} }] }),
    })
    assert.equal(recovered.response.status, 200)
    assert.equal(syncCalls, 1)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('browser login and registration reject cross-site credential requests', async () => {
  let loginCalls = 0
  let registerCalls = 0
  const restore = withMockedService({
    loginUser: async () => {
      loginCalls += 1
      throw new Error('不应调用登录服务')
    },
    registerUser: async () => {
      registerCalls += 1
      throw new Error('不应调用注册服务')
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    for (const path of ['/api/v1/auth/login', '/api/v1/admin/auth/login', '/api/v1/auth/register']) {
      for (const headers of [
        { Origin: 'https://attacker.example', 'Sec-Fetch-Site': 'cross-site' },
        { 'Sec-Fetch-Site': 'same-site' },
        {
          Origin: 'https://attacker.example',
          'Sec-Fetch-Site': 'cross-site',
          'X-Map-Embed-Context': 'iframe',
        },
      ]) {
        const result = await requestJson(baseUrl, path, {
          method: 'POST',
          headers,
          body: JSON.stringify({ username: 'map-user', password: 'long-passphrase' }),
        })
        assert.equal(result.response.status, 403)
        assert.equal(result.payload.error.code, 'CSRF_INVALID')
      }
    }
    assert.equal(loginCalls, 0)
    assert.equal(registerCalls, 0)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('same-origin Fetch Metadata accepts credential requests when Chrome rewrites loopback Origin without its port', async () => {
  const session = testSession()
  const adminUser = {
    ...session.user,
    permissions: [...session.user.permissions, 'admin.user.read'],
  }
  let loginCalls = 0
  const restore = withMockedService({
    loginUser: async () => {
      loginCalls += 1
      return {
        sessionToken: 'same-origin-session',
        csrfToken: 'same-origin-csrf',
        maxAge: 3600000,
        expiresAt: '2030-01-01T00:00:00.000Z',
        user: adminUser,
      }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const login = await requestJson(baseUrl, '/api/v1/admin/auth/login', {
      method: 'POST',
      headers: {
        Origin: 'http://127.0.0.1',
        Referer: `${baseUrl}/admin`,
        'Sec-Fetch-Site': 'same-origin',
      },
      body: JSON.stringify({ username: 'map-user', password: 'long-passphrase' }),
    })
    assert.equal(login.response.status, 200)
    assert.equal(login.payload.result.user.id, 'usr_test')
    assert.equal(loginCalls, 1)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('trusted proxy configuration controls forwarded client IP and Secure cookies', async () => {
  const session = testSession()
  let loginContext = null
  const restore = withMockedService({
    loginUser: async (input, context) => {
      loginContext = context
      return {
        sessionToken: 'proxy-session',
        csrfToken: 'proxy-csrf',
        maxAge: 3600000,
        expiresAt: '2030-01-01T00:00:00.000Z',
        user: session.user,
      }
    },
  })
  const { server, baseUrl } = await listen(createTestApp({ trustProxy: 1 }))

  try {
    const login = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'X-Forwarded-For': '198.51.100.201',
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({ username: 'map-user', password: 'long-passphrase' }),
    })
    assert.equal(login.response.status, 200)
    assert.equal(loginContext.ip, '198.51.100.201')
    assert.ok(cookieHeaders(login.response).every(value => /;\s*Secure/i.test(value)))
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('private writes require both a valid session and matching CSRF header', async () => {
  const session = testSession()
  let created = 0
  const restore = withMockedService({
    verifyUserSession: token => token === 'session-token' ? session : null,
    verifyUserCsrf: (current, token) => {
      if (current !== session || token !== 'csrf-token') {
        const err = new Error('请求安全校验失败')
        err.statusCode = 403
        err.code = 'CSRF_INVALID'
        throw err
      }
    },
    assertUserPermission: () => true,
    createUserKml: () => {
      created += 1
      return { id: 'kml_created', revision: 1 }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    let result = await requestJson(baseUrl, '/api/v1/kml/files', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=session-token' },
      body: JSON.stringify({ name: '测试 KML' }),
    })
    assert.equal(result.response.status, 403)
    assert.equal(result.payload.error.code, 'CSRF_INVALID')
    assert.equal(created, 0)

    result = await requestJson(baseUrl, '/api/v1/kml/files', {
      method: 'POST',
      headers: {
        Cookie: 'map_user_session=session-token',
        'X-CSRF-Token': 'csrf-token',
      },
      body: JSON.stringify({ name: '测试 KML' }),
    })
    assert.equal(result.response.status, 201)
    assert.equal(result.payload.result.id, 'kml_created')
    assert.equal(created, 1)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('share spatial preview requires authenticated CSRF-protected owner access', async () => {
  const session = testSession()
  let received = null
  const restore = withMockedService({
    verifyUserSession: token => token === 'session-token' ? session : null,
    verifyUserCsrf: (current, token) => {
      if (current !== session || token !== 'csrf-token') {
        const err = new Error('请求安全校验失败')
        err.statusCode = 403
        err.code = 'CSRF_INVALID'
        throw err
      }
    },
    assertUserPermission: (current, permission) => {
      assert.equal(current, session)
      assert.equal(permission, 'share.own.manage')
    },
    getUserKmlShareSpatialPreview: (current, input) => {
      received = { current, input }
      return { mode: 'kml_bounds', status: 'ready', areaKm2: 2.5 }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const result = await requestJson(baseUrl, '/api/v1/kml/shares/spatial-preview', {
      method: 'POST',
      headers: {
        Cookie: 'map_user_session=session-token',
        'X-CSRF-Token': 'csrf-token',
      },
      body: JSON.stringify({ spatialAccess: { mode: 'kml_bounds' }, items: [{ kmlId: 'kml-1' }] }),
    })
    assert.equal(result.response.status, 200)
    assert.equal(result.payload.result.areaKm2, 2.5)
    assert.equal(received.current, session)
    assert.equal(received.input.items[0].kmlId, 'kml-1')
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('share password details require owner session, CSRF and permission and return only no-store copy fields', async () => {
  const session = testSession()
  let currentSession = session
  let received = null
  const restore = withMockedService({
    verifyUserSession: token => token === 'session-token' ? currentSession : null,
    verifyUserCsrf: (current, token) => {
      if (current !== currentSession || token !== 'csrf-token') {
        const error = new Error('请求安全校验失败')
        error.statusCode = 403
        error.code = 'CSRF_INVALID'
        throw error
      }
    },
    assertUserPermission: (current, permission) => {
      if (permission !== 'share.own.manage' || !current?.user?.permissions?.includes(permission)) {
        const error = new Error('没有执行此操作的权限')
        error.statusCode = 403
        error.code = 'PERMISSION_DENIED'
        throw error
      }
    },
    createUserKmlSharePasswordUrl: (current, id) => {
      received = { current, id }
      return {
        shareUrl: '/share/public-test?password=secret%3Fvalue',
        password: 'secret?value',
      }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    let result = await requestJson(baseUrl, '/api/v1/kml/shares/shr_test/password-url', {
      method: 'POST',
    })
    assert.equal(result.response.status, 401)
    assert.equal(result.payload.error.code, 'AUTH_REQUIRED')

    result = await requestJson(baseUrl, '/api/v1/kml/shares/shr_test/password-url', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=session-token' },
    })
    assert.equal(result.response.status, 403)
    assert.equal(result.payload.error.code, 'CSRF_INVALID')

    currentSession = {
      ...session,
      user: { ...session.user, permissions: ['account.self.read'] },
    }
    result = await requestJson(baseUrl, '/api/v1/kml/shares/shr_test/password-url', {
      method: 'POST',
      headers: {
        Cookie: 'map_user_session=session-token',
        'X-CSRF-Token': 'csrf-token',
      },
    })
    assert.equal(result.response.status, 403)
    assert.equal(result.payload.error.code, 'PERMISSION_DENIED')

    currentSession = session
    result = await requestJson(baseUrl, '/api/v1/kml/shares/shr_test/password-url', {
      method: 'POST',
      headers: {
        Cookie: 'map_user_session=session-token',
        'X-CSRF-Token': 'csrf-token',
      },
    })
    assert.equal(result.response.status, 200)
    assert.equal(result.response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(result.payload.result, {
      shareUrl: '/share/public-test?password=secret%3Fvalue',
      password: 'secret?value',
    })
    assert.equal(JSON.stringify(result.payload).includes('hash'), false)
    assert.equal(JSON.stringify(result.payload).includes('secret_cipher'), false)
    assert.deepEqual(received, { current: session, id: 'shr_test' })
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('manual share content sync requires authenticated CSRF-protected owner access', async () => {
  const session = testSession()
  let received = null
  const restore = withMockedService({
    verifyUserSession: token => token === 'session-token' ? session : null,
    verifyUserCsrf: (current, token) => {
      if (current !== session || token !== 'csrf-token') {
        const err = new Error('请求安全校验失败')
        err.statusCode = 403
        err.code = 'CSRF_INVALID'
        throw err
      }
    },
    assertUserPermission: (current, permission) => {
      assert.equal(current, session)
      assert.equal(permission, 'share.own.manage')
    },
    syncUserKmlShareContent: (current, id, input) => {
      received = { current, id, input }
      return { id, revision: input.revision + 1, syncStatus: 'synced' }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    let result = await requestJson(baseUrl, '/api/v1/kml/shares/shr_test/sync', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=session-token' },
      body: JSON.stringify({ revision: 3 }),
    })
    assert.equal(result.response.status, 403)
    assert.equal(result.payload.error.code, 'CSRF_INVALID')
    assert.equal(received, null)

    result = await requestJson(baseUrl, '/api/v1/kml/shares/shr_test/sync', {
      method: 'POST',
      headers: {
        Cookie: 'map_user_session=session-token',
        'X-CSRF-Token': 'csrf-token',
      },
      body: JSON.stringify({ revision: 3 }),
    })
    assert.equal(result.response.status, 200)
    assert.equal(result.payload.result.syncStatus, 'synced')
    assert.deepEqual(received, {
      current: session,
      id: 'shr_test',
      input: { revision: 3 },
    })
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('two-bulu KML import requires login, CSRF and personal KML write permission', async () => {
  const session = testSession()
  const readonlySession = {
    ...session,
    id: 'ses_readonly',
    user: {
      ...session.user,
      id: 'usr_readonly',
      permissions: ['kml.own.read'],
    },
  }
  let currentSession = session
  let imported = 0
  let received = null
  const restore = withMockedService({
    verifyUserSession: token => token === 'session-token' ? currentSession : null,
    verifyUserCsrf: (current, token) => {
      if (current !== currentSession || token !== 'csrf-token') {
        const err = new Error('请求安全校验失败')
        err.statusCode = 403
        err.code = 'CSRF_INVALID'
        throw err
      }
    },
    assertUserPermission: (current, permission) => {
      assert.equal(permission, 'kml.own.write')
      if (!current?.user?.permissions?.includes(permission)) {
        const err = new Error('没有执行此操作的权限')
        err.statusCode = 403
        err.code = 'PERMISSION_DENIED'
        throw err
      }
    },
    importTwoBuluUserKml: async (current, input, context) => {
      imported += 1
      received = { current, input, context }
      return {
        id: 'kml_2bulu',
        name: '两步路轨迹',
        featureCount: 1,
        importSummary: { provider: '2bulu', completeness: 'full', warnings: [] },
      }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    let result = await requestJson(baseUrl, '/api/v1/kml/import/2bulu', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://www.2bulu.com/track/t-abc.htm' }),
    })
    assert.equal(result.response.status, 401)
    assert.equal(result.payload.error.code, 'AUTH_REQUIRED')
    assert.equal(imported, 0)

    result = await requestJson(baseUrl, '/api/v1/kml/import/2bulu', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=session-token' },
      body: JSON.stringify({ url: 'https://www.2bulu.com/track/t-abc.htm' }),
    })
    assert.equal(result.response.status, 403)
    assert.equal(result.payload.error.code, 'CSRF_INVALID')
    assert.equal(imported, 0)

    currentSession = readonlySession
    result = await requestJson(baseUrl, '/api/v1/kml/import/2bulu', {
      method: 'POST',
      headers: {
        Cookie: 'map_user_session=session-token',
        'X-CSRF-Token': 'csrf-token',
      },
      body: JSON.stringify({ url: 'https://www.2bulu.com/track/t-abc.htm' }),
    })
    assert.equal(result.response.status, 403)
    assert.equal(result.payload.error.code, 'PERMISSION_DENIED')
    assert.equal(imported, 0)

    currentSession = session
    result = await requestJson(baseUrl, '/api/v1/kml/import/2bulu', {
      method: 'POST',
      headers: {
        Cookie: 'map_user_session=session-token',
        'X-CSRF-Token': 'csrf-token',
      },
      body: JSON.stringify({
        url: 'https://www.2bulu.com/track/t-abc.htm',
        partialPolicy: 'reject',
        requestId: '2bulu-request-one',
      }),
    })
    assert.equal(result.response.status, 201)
    assert.equal(result.payload.result.id, 'kml_2bulu')
    assert.equal(imported, 1)
    assert.equal(received.current, session)
    assert.equal(received.input.partialPolicy, 'reject')
    assert.ok(received.context.ip)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('browser-helper KML import requires login, CSRF and write permission and never forwards credentials', async () => {
  const session = testSession()
  const readonlySession = {
    ...session,
    id: 'ses_browser_helper_readonly',
    user: { ...session.user, id: 'usr_browser_helper_readonly', permissions: ['kml.own.read'] },
  }
  let currentSession = session
  let imported = 0
  let received = null
  const restore = withMockedService({
    verifyUserSession: token => token === 'session-token' ? currentSession : null,
    verifyUserCsrf: (current, token) => {
      if (current !== currentSession || token !== 'csrf-token') {
        const error = new Error('请求安全校验失败')
        error.statusCode = 403
        error.code = 'CSRF_INVALID'
        throw error
      }
    },
    assertUserPermission: (current, permission) => {
      if (permission !== 'kml.own.write' || !current?.user?.permissions?.includes(permission)) {
        const error = new Error('没有执行此操作的权限')
        error.statusCode = 403
        error.code = 'PERMISSION_DENIED'
        throw error
      }
    },
    importTwoBuluBrowserHelperKml: async (current, input, context) => {
      imported += 1
      received = { current, input, context }
      return {
        id: 'kml_browser_helper',
        name: '浏览器路线',
        featureCount: 2,
        importSummary: { provider: '2bulu', completeness: 'full', helperVersion: '0.1.0' },
      }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())
  try {
    let result = await requestJson(baseUrl, '/api/v1/kml/import/2bulu/browser-helper', {
      method: 'POST',
      body: JSON.stringify({ protocolVersion: 1, helperVersion: '0.1.0', url: 'https://www.2bulu.com/track/t-abc.htm', kmlText: '<kml/>' }),
    })
    assert.equal(result.response.status, 401)
    assert.equal(result.payload.error.code, 'AUTH_REQUIRED')
    assert.equal(imported, 0)

    result = await requestJson(baseUrl, '/api/v1/kml/import/2bulu/browser-helper', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=session-token' },
      body: JSON.stringify({ protocolVersion: 1, helperVersion: '0.1.0', url: 'https://www.2bulu.com/track/t-abc.htm', kmlText: '<kml/>' }),
    })
    assert.equal(result.response.status, 403)
    assert.equal(result.payload.error.code, 'CSRF_INVALID')
    assert.equal(imported, 0)

    currentSession = readonlySession
    result = await requestJson(baseUrl, '/api/v1/kml/import/2bulu/browser-helper', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=session-token', 'X-CSRF-Token': 'csrf-token' },
      body: JSON.stringify({ protocolVersion: 1, helperVersion: '0.1.0', url: 'https://www.2bulu.com/track/t-abc.htm', kmlText: '<kml/>' }),
    })
    assert.equal(result.response.status, 403)
    assert.equal(result.payload.error.code, 'PERMISSION_DENIED')

    currentSession = session
    result = await requestJson(baseUrl, '/api/v1/kml/import/2bulu/browser-helper', {
      method: 'POST',
      headers: { Cookie: 'map_user_session=session-token', 'X-CSRF-Token': 'csrf-token' },
      body: JSON.stringify({
        protocolVersion: 1,
        helperVersion: '0.1.0',
        url: 'https://www.2bulu.com/track/t-abc.htm',
        kmlText: '<kml><Document><Placemark><Point><coordinates>113,23</coordinates></Point></Placemark></Document></kml>',
        requestId: 'helper-request-one',
      }),
    })
    assert.equal(result.response.status, 201)
    assert.equal(result.payload.result.id, 'kml_browser_helper')
    assert.equal(imported, 1)
    assert.equal(received.input.kmlText.includes('kml'), true)
    assert.equal(Object.hasOwn(received.input, 'cookie'), false)
    assert.equal(Object.hasOwn(received.input, 'authorization'), false)
    assert.ok(received.context.ip)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('kml.any.manage implies read access at the API permission guard', async () => {
  const session = {
    id: 'ses_auditor',
    user: {
      id: 'usr_auditor',
      username: 'kml-auditor',
      displayName: 'KML 审核员',
      roles: ['kml_auditor'],
      permissions: ['kml.any.manage'],
    },
  }
  let receivedSession = null
  const restore = withMockedService({
    verifyUserSession: token => token === 'auditor-session' ? session : null,
    hasUserPermission: (current, permission) => {
      assert.equal(current, session)
      return permission === 'kml.any.read' && current.user.permissions.includes('kml.any.manage')
    },
    assertUserPermission: (current, permission) => {
      assert.equal(current, session)
      assert.equal(permission, 'kml.any.read')
    },
    getUserKml: current => {
      receivedSession = current
      return { id: 'kml_other_user', name: '受审 KML', features: [] }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const result = await requestJson(baseUrl, '/api/v1/kml/files/kml_other_user', {
      headers: { Cookie: 'map_user_session=auditor-session' },
    })
    assert.equal(result.response.status, 200)
    assert.equal(result.payload.result.id, 'kml_other_user')
    assert.equal(receivedSession, session)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('share runtime metrics require moderation permission and return aggregated data', async () => {
  const session = {
    ...testSession(),
    user: {
      ...testSession().user,
      roles: ['share_moderator'],
      permissions: ['admin.share.moderate'],
    },
  }
  const restore = withMockedService({
    verifyUserSession: token => token === 'moderator-session' ? session : null,
    assertUserPermission: (current, permission) => {
      assert.equal(current, session)
      assert.equal(permission, 'admin.share.moderate')
    },
    getUserKmlShareRuntimeMetrics: current => {
      assert.equal(current, session)
      return {
        generatedAt: '2026-08-16T00:00:00.000Z',
        itemCount: 1,
        items: [{ shareId: 'shr_internal', event: 'tile_decision', decision: 'outside', count: 3 }],
      }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const result = await requestJson(baseUrl, '/api/v1/admin/kml/shares/runtime-metrics', {
      headers: { Cookie: 'map_user_session=moderator-session' },
    })
    assert.equal(result.response.status, 200)
    assert.equal(result.response.headers.get('cache-control'), 'no-store')
    assert.equal(result.payload.result.items[0].decision, 'outside')
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('admin compatibility login, session and logout use the unified cookie session', async () => {
  const session = {
    ...testSession(),
    user: {
      ...testSession().user,
      roles: ['operations_observer'],
      permissions: ['admin.user.read'],
    },
  }
  let loggedOut = false
  const restore = withMockedService({
    loginUser: async () => ({
      sessionToken: 'admin-session',
      csrfToken: 'admin-csrf',
      maxAge: 3600000,
      expiresAt: '2030-01-01T00:00:00.000Z',
      user: session.user,
    }),
    verifyUserSession: token => token === 'admin-session' ? session : null,
    getUserSessionView: current => ({ authenticated: true, user: current.user }),
    verifyUserCsrf: (current, token) => {
      assert.equal(current, session)
      assert.equal(token, 'admin-csrf')
    },
    logoutUser: () => {
      loggedOut = true
      return { status: 'ok' }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const login = await requestJson(baseUrl, '/api/v1/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'operator', password: 'long-passphrase' }),
    })
    const cookies = cookieHeaders(login.response)
    const sessionCookie = cookiePair(cookies, 'map_user_session')
    assert.ok(sessionCookie)
    assert.equal(Object.hasOwn(login.payload.result, 'token'), false)

    const current = await requestJson(baseUrl, '/api/v1/admin/auth/session', {
      headers: { Cookie: sessionCookie },
    })
    assert.equal(current.response.status, 200)
    assert.deepEqual(current.payload.result.user.roles, ['operations_observer'])
    assert.deepEqual(current.payload.result.user.permissions, ['admin.user.read'])

    const compatibilitySession = await requestJson(baseUrl, '/api/v1/admin/session', {
      headers: { Cookie: sessionCookie },
    })
    assert.equal(compatibilitySession.response.status, 200)
    assert.deepEqual(compatibilitySession.payload.result.user.roles, ['operations_observer'])
    assert.deepEqual(compatibilitySession.payload.result.user.permissions, ['admin.user.read'])

    const logout = await requestJson(baseUrl, '/api/v1/admin/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'X-CSRF-Token': 'admin-csrf',
      },
      body: JSON.stringify({}),
    })
    assert.equal(logout.response.status, 200)
    assert.equal(loggedOut, true)
    assert.ok(cookieHeaders(logout.response).some(value => /map_user_session=;/i.test(value)))
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('admin endpoints reject legacy Bearer tokens after the user-system migration', async () => {
  let legacyVerifierCalled = false
  const restore = withMockedService({
    verifyUserSession: () => null,
    verifyAdminToken: () => {
      legacyVerifierCalled = true
      return { username: 'legacy-admin' }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const result = await requestJson(baseUrl, '/api/v1/admin/session', {
      headers: { Authorization: 'Bearer legacy-token' },
    })
    assert.equal(result.response.status, 401)
    assert.equal(result.payload.error.code, 'AUTH_REQUIRED')
    assert.equal(legacyVerifierCalled, false)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('public share password creates a share-scoped HttpOnly cookie and never returns the token', async () => {
  let receivedAccessToken = ''
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    verifyAccess: async () => false,
    authorizePublicKmlShare: async () => ({
      passwordRequired: true,
      accessToken: 'share-secret-token',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
    getPublicKmlShareManifest: (publicId, context) => {
      receivedAccessToken = context.accessToken
      return { publicId, title: '路线合集', items: [] }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const authorization = await requestJson(baseUrl, '/api/v1/public/kml-shares/public-123/access', {
      method: 'POST',
      body: JSON.stringify({ password: 'share-password' }),
    })
    assert.equal(authorization.response.status, 200)
    assert.equal(Object.hasOwn(authorization.payload.result, 'accessToken'), false)
    const cookies = cookieHeaders(authorization.response)
    const cookie = cookiePair(cookies, 'map_share_access_public-123')
    assert.ok(cookie)
    assert.ok(cookies.some(value => /HttpOnly/i.test(value)))
    assert.ok(cookies.some(value => /Path=\/api\/v1\/public\/kml-shares\/public-123/i.test(value)))

    const manifest = await requestJson(baseUrl, '/api/v1/public/kml-shares/public-123', {
      headers: { Cookie: cookie },
    })
    assert.equal(manifest.response.status, 200)
    assert.equal(receivedAccessToken, 'share-secret-token')
    assert.equal(manifest.payload.result.title, '路线合集')
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('public share routes issue and reuse a stable HttpOnly anonymous visitor cookie', async () => {
  const contexts = []
  let generated = 0
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    createAnonymousShareVisitorId: () => `visitor_${String(++generated).padStart(20, '0')}`,
    getPublicKmlShareManifest: (publicId, context) => {
      contexts.push(context)
      return { publicId, title: '访客标识测试', items: [] }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const first = await requestJson(baseUrl, '/api/v1/public/kml-shares/public-visitor')
    assert.equal(first.response.status, 200)
    const cookies = cookieHeaders(first.response)
    const visitorCookie = cookiePair(cookies, 'map_share_visitor')
    assert.ok(visitorCookie)
    assert.ok(cookies.some(value => /map_share_visitor=.*HttpOnly/i.test(value)))
    assert.equal(contexts[0].visitorId, 'visitor_00000000000000000001')

    const second = await requestJson(baseUrl, '/api/v1/public/kml-shares/public-visitor', {
      headers: { Cookie: visitorCookie },
    })
    assert.equal(second.response.status, 200)
    assert.equal(contexts[1].visitorId, contexts[0].visitorId)
    assert.equal(generated, 1)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('unlimited public share authorization uses a persistent bounded browser cookie', async () => {
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    verifyAccess: async () => false,
    authorizePublicKmlShare: async () => ({
      passwordRequired: true,
      ttlMode: 'unlimited',
      accessToken: 'unlimited-share-token',
      expiresAt: null,
    }),
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const authorization = await requestJson(baseUrl, '/api/v1/public/kml-shares/public-long/access', {
      method: 'POST',
      body: JSON.stringify({ password: 'share-password' }),
    })
    assert.equal(authorization.response.status, 200)
    assert.equal(authorization.payload.result.ttlMode, 'unlimited')
    assert.equal(authorization.payload.result.expiresAt, null)
    const cookies = cookieHeaders(authorization.response)
    assert.ok(cookies.some(value => /map_share_access_public-long=.*Max-Age=34560000/i.test(value)))
    assert.ok(cookies.some(value => /HttpOnly/i.test(value)))
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('public share map catalog reuses share-scoped authorization without requiring a user session', async () => {
  let receivedContext = null
  const restore = withMockedService({
    isAccessEnabled: async () => true,
    verifyAccess: async token => token === 'site-token',
    getPublicKmlShareMapCatalog: async (publicId, context) => {
      receivedContext = context
      return {
        sources: [{
          id: 'road',
          tileUrl: `/api/v1/public/kml-shares/${publicId}/tiles/road/{z}/{x}/{y}`,
        }],
        layers: [{ id: 'road-layer', items: [{ sourceId: 'road' }] }],
      }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const result = await requestJson(baseUrl, '/api/v1/public/kml-shares/public-123/map/catalog', {
      headers: {
        Cookie: 'map_access_token=site-token; map_share_access_public-123=share-token',
      },
    })
    assert.equal(result.response.status, 200)
    assert.equal(result.payload.result.sources[0].id, 'road')
    assert.equal(receivedContext.siteAccessGranted, true)
    assert.equal(receivedContext.accessToken, 'share-token')
    assert.equal(result.response.headers.get('cache-control'), 'no-store')
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('public share tile route rejects sources outside the scoped public catalog before relay', async () => {
  let relayCalled = false
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    assertPublicKmlShareMapSource: async (publicId, sourceId, tile, context) => {
      assert.equal(publicId, 'public-123')
      assert.equal(sourceId, 'private-source')
      assert.deepEqual(tile, { z: '1', x: '0', y: '0' })
      assert.equal(context.siteAccessGranted, true)
      const error = new Error('分享底图不存在')
      error.statusCode = 404
      error.code = 'RESOURCE_NOT_FOUND'
      throw error
    },
    fetchTileSource: async () => {
      relayCalled = true
      throw new Error('不应发起图源请求')
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const result = await requestJson(
      baseUrl,
      '/api/v1/public/kml-shares/public-123/tiles/private-source/1/0/0'
    )
    assert.equal(result.response.status, 404)
    assert.equal(result.payload.error.code, 'RESOURCE_NOT_FOUND')
    assert.equal(relayCalled, false)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('public share tile route returns transparent tile for spatially disallowed tile without relay', async () => {
  let relayCalled = false
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    assertPublicKmlShareMapSource: async (publicId, sourceId, tile) => {
      assert.equal(publicId, 'public-123')
      assert.equal(sourceId, 'road')
      assert.deepEqual(tile, { z: '1', x: '0', y: '0' })
      return { decision: 'outside' }
    },
    fetchTileSource: async () => {
      relayCalled = true
      throw new Error('不应发起图源请求')
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const response = await fetch(`${baseUrl}/api/v1/public/kml-shares/public-123/tiles/road/1/0/0`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(response.headers.get('x-kml-share-spatial-decision'), 'outside')
    const body = Buffer.from(await response.arrayBuffer())
    const metadata = await sharp(body).metadata()
    assert.equal(metadata.format, 'png')
    assert.equal(metadata.hasAlpha, true)
    assert.equal(relayCalled, false)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('public share boundary tile route returns the server-masked PNG', async () => {
  let received = null
  const masked = await sharp({
    create: { width: 2, height: 2, channels: 4, background: { r: 20, g: 80, b: 40, alpha: 0.5 } },
  }).png().toBuffer()
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    assertPublicKmlShareMapSource: async () => ({
      decision: 'boundary',
      tile: { z: 9, x: 413, y: 223 },
      spatialScope: { sourceRevisionHash: 'sha256:test' },
    }),
    fetchPublicKmlShareBoundaryTile: async (sourceId, tile, options) => {
      received = { sourceId, tile, scope: options.scope }
      return { result: { cacheStatus: 'HIT' }, body: masked }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const response = await fetch(`${baseUrl}/api/v1/public/kml-shares/public-123/tiles/road/9/413/223`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(response.headers.get('x-kml-share-spatial-decision'), 'boundary')
    assert.equal(response.headers.get('x-cache'), 'HIT')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(received, {
      sourceId: 'road',
      tile: { z: 9, x: 413, y: 223 },
      scope: { sourceRevisionHash: 'sha256:test' },
    })
    assert.equal(Buffer.compare(Buffer.from(await response.arrayBuffer()), masked), 0)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('public share boundary tile route falls back to a valid transparent PNG when masking fails', async () => {
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    assertPublicKmlShareMapSource: async () => ({
      decision: 'boundary',
      tile: { z: 9, x: 413, y: 223 },
      spatialScope: { sourceRevisionHash: 'sha256:test' },
    }),
    fetchPublicKmlShareBoundaryTile: async () => {
      const error = new Error('瓦片解码失败')
      error.code = 'SHARE_TILE_MASK_DECODE_FAILED'
      throw error
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const response = await fetch(`${baseUrl}/api/v1/public/kml-shares/public-123/tiles/road/9/413/223`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(response.headers.get('x-kml-share-spatial-decision'), 'boundary-error')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    const body = Buffer.from(await response.arrayBuffer())
    const metadata = await sharp(body).metadata()
    assert.equal(metadata.format, 'png')
    assert.equal(metadata.hasAlpha, true)
    const pixel = await sharp(body).raw().toBuffer()
    assert.equal(pixel[3], 0)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('public share tile route relays the normalized world-wrapped x coordinate', async () => {
  let receivedTile = null
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    assertPublicKmlShareMapSource: async (publicId, sourceId, tile) => {
      assert.deepEqual(tile, { z: '2', x: '-1', y: '1' })
      return { decision: 'allow', tile: { z: 2, x: 3, y: 1 } }
    },
    fetchTileSource: async (sourceId, tile) => {
      receivedTile = { sourceId, tile }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'image/png' },
        cacheStatus: 'MISS',
        stream: Readable.from([Buffer.from('tile')]),
      }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const response = await fetch(`${baseUrl}/api/v1/public/kml-shares/public-123/tiles/road/2/-1/1`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(receivedTile, { sourceId: 'road', tile: { z: 2, x: 3, y: 1 } })
    assert.equal(await response.text(), 'tile')
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('public share routes preserve manifest and tile rate-limit error codes', async () => {
  const manifestError = new Error('分享数据请求过于频繁，请稍后再试')
  manifestError.statusCode = 429
  manifestError.code = 'SHARE_MANIFEST_RATE_LIMITED'
  const tileError = new Error('分享地图请求过于频繁，请稍后再试')
  tileError.statusCode = 429
  tileError.code = 'SHARE_TILE_RATE_LIMITED'
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    getPublicKmlShareManifest: () => { throw manifestError },
    assertPublicKmlShareMapSource: async () => { throw tileError },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const manifest = await requestJson(baseUrl, '/api/v1/public/kml-shares/public-123')
    assert.equal(manifest.response.status, 429)
    assert.equal(manifest.payload.error.code, 'SHARE_MANIFEST_RATE_LIMITED')

    const tile = await requestJson(baseUrl, '/api/v1/public/kml-shares/public-123/tiles/road/10/1/1')
    assert.equal(tile.response.status, 429)
    assert.equal(tile.payload.error.code, 'SHARE_TILE_RATE_LIMITED')
    assert.equal(tile.response.headers.get('cache-control'), 'private, no-store')
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('unexpected server errors do not expose internal exception details', async () => {
  const restore = withMockedService({
    getAuthConfig: () => {
      throw new Error('SQLITE_ERROR: no such table users; path=/private/map-service.sqlite')
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const result = await requestJson(baseUrl, '/api/v1/auth/config')
    assert.equal(result.response.status, 500)
    assert.equal(result.payload.error.code, 'INTERNAL_ERROR')
    assert.equal(result.payload.error.message, '服务器处理请求失败')
    assert.doesNotMatch(JSON.stringify(result.payload), /SQLITE_ERROR|private\/map-service/)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})
