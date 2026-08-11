import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import commonMethods from '../service/bin/middleware/commonMethods/index.js'
import service from '../service/bin/service.js'
import simpleApi from '../service/bin/simpleApi.js'

function createTestApp () {
  Object.keys(simpleApi.routeSet).forEach(key => delete simpleApi.routeSet[key])
  const app = express()
  app.use(commonMethods)
  app.use(express.json())
  simpleApi.routeController(app, simpleApi.configList, simpleApi.basePath)
  return app
}

function listen (app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` })
    })
  })
}

function withMockedService (methods) {
  const originals = {}
  Object.entries(methods).forEach(([name, method]) => {
    originals[name] = service[name]
    service[name] = method
  })
  return () => Object.entries(originals).forEach(([name, method]) => { service[name] = method })
}

test('POST KML share link resolver requires session, CSRF and write permission', async () => {
  const calls = []
  const session = { user: { id: 'user-1', permissions: ['kml.own.write'] }, csrfToken: 'csrf-token' }
  const restore = withMockedService({
    verifyUserSession: token => token === 'session-token' ? session : null,
    verifyUserCsrf: (current, token) => {
      assert.equal(current, session)
      assert.equal(token, 'csrf-token')
    },
    hasUserPermission: (_current, permission) => permission === 'kml.own.write',
    assertUserPermission: () => {},
    resolveKmlShareLinks: async (actor, input, context) => {
      calls.push({ actor, input, context })
      return { items: [{ provider: 'douyin' }], warnings: [] }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const response = await fetch(`${baseUrl}/api/v1/kml/share-links/resolve`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'map_user_session=session-token',
        'x-csrf-token': 'csrf-token',
      },
      body: JSON.stringify({ text: 'https://v.douyin.com/Xi6sjYn-rps/' }),
    })
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.code, 0)
    assert.equal(payload.result.items[0].provider, 'douyin')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].actor, session)
    assert.equal(calls[0].input.text, 'https://v.douyin.com/Xi6sjYn-rps/')
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('POST KML share link resolver rejects unauthenticated callers before service execution', async () => {
  let called = false
  const restore = withMockedService({
    verifyUserSession: () => null,
    resolveKmlShareLinks: async () => {
      called = true
      return { items: [], warnings: [] }
    },
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const response = await fetch(`${baseUrl}/api/v1/kml/share-links/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'https://v.douyin.com/Xi6sjYn-rps/' }),
    })
    const payload = await response.json()

    assert.equal(response.status, 401)
    assert.equal(payload.error.code, 'AUTH_REQUIRED')
    assert.equal(called, false)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('POST KML share link resolver rejects users without a KML write permission', async () => {
  const restore = withMockedService({
    verifyUserSession: () => ({ user: { id: 'reader' } }),
    verifyUserCsrf: () => {},
    hasUserPermission: () => false,
  })
  const { server, baseUrl } = await listen(createTestApp())

  try {
    const response = await fetch(`${baseUrl}/api/v1/kml/share-links/resolve`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'map_user_session=reader-token',
        'x-csrf-token': 'csrf-token',
      },
      body: JSON.stringify({ text: 'https://v.douyin.com/Xi6sjYn-rps/' }),
    })
    const payload = await response.json()

    assert.equal(response.status, 403)
    assert.equal(payload.error.code, 'PERMISSION_DENIED')
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})
