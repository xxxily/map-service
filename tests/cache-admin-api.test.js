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

async function json (baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  return { response, payload: await response.json() }
}

test('cache governance routes enforce admin permission and CSRF on every mutation', async () => {
  const adminSession = {
    id: 'ses_cache_admin',
    csrfHash: 'hash',
    user: { id: 'usr_cache_admin', permissions: ['admin.cache.manage'] },
  }
  const deniedSession = {
    id: 'ses_cache_denied',
    csrfHash: 'hash',
    user: { id: 'usr_cache_denied', permissions: [] },
  }
  const calls = []
  const restore = mockService({
    verifyUserSession: token => ({
      'cache-admin': adminSession,
      'cache-denied': deniedSession,
    })[token] || null,
    assertUserPermission: (session, permission) => {
      if (!session?.user?.permissions?.includes(permission)) {
        const error = new Error('denied')
        error.statusCode = 403
        error.code = 'PERMISSION_DENIED'
        throw error
      }
    },
    verifyUserCsrf: (session, token) => {
      if (session !== adminSession || token !== 'cache-csrf') {
        const error = new Error('csrf')
        error.statusCode = 403
        error.code = 'CSRF_INVALID'
        throw error
      }
    },
    getCacheGovernancePolicy: () => ({ hardLimitBytes: null }),
    updateCacheGovernancePolicy: (actor, input) => {
      calls.push(['policy', actor.user.id, input.hardLimitBytes])
      return { hardLimitBytes: input.hardLimitBytes }
    },
    previewCacheCleanup: (input) => {
      calls.push(['preview', input.states])
      return { previewId: 'cache-preview-1', exact: true, files: 0, bytes: 0 }
    },
    analyzeCacheKeyPolicy: (actor, input) => {
      calls.push(['analysis', actor.user.id, input.sourceId])
      return { analysisId: 'cache-analysis-1', safeToEnable: true }
    },
    updateCacheKeyPolicy: (actor, sourceId, input) => {
      calls.push(['key-policy', actor.user.id, sourceId, input.mode])
      return { sourceId, mode: input.mode }
    },
  })
  const { server, baseUrl } = await listen(createApp())
  try {
    const unauthenticated = await json(baseUrl, '/api/v1/admin/cache/policy')
    assert.equal(unauthenticated.response.status, 401)

    const denied = await json(baseUrl, '/api/v1/admin/cache/policy', {
      headers: { Cookie: 'map_user_session=cache-denied' },
    })
    assert.equal(denied.response.status, 403)

    const readable = await json(baseUrl, '/api/v1/admin/cache/policy', {
      headers: { Cookie: 'map_user_session=cache-admin' },
    })
    assert.equal(readable.response.status, 200)

    const missingCsrf = await json(baseUrl, '/api/v1/admin/cache/policy', {
      method: 'PUT',
      headers: { Cookie: 'map_user_session=cache-admin' },
      body: JSON.stringify({ hardLimitBytes: 1234 }),
    })
    assert.equal(missingCsrf.response.status, 403)
    assert.equal(missingCsrf.payload.error.code, 'CSRF_INVALID')
    assert.equal(calls.length, 0)

    const headers = {
      Cookie: 'map_user_session=cache-admin',
      'X-CSRF-Token': 'cache-csrf',
    }
    const updated = await json(baseUrl, '/api/v1/admin/cache/policy', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ hardLimitBytes: 1234 }),
    })
    assert.equal(updated.response.status, 200)
    assert.equal(updated.payload.result.hardLimitBytes, 1234)

    const preview = await json(baseUrl, '/api/v1/admin/cache/cleanup/preview', {
      method: 'POST',
      headers,
      body: JSON.stringify({ states: ['expired'] }),
    })
    assert.equal(preview.response.status, 200)

    const analysis = await json(baseUrl, '/api/v1/admin/cache/key-analysis', {
      method: 'POST',
      headers,
      body: JSON.stringify({ sourceId: 'source-a', rule: {} }),
    })
    assert.equal(analysis.response.status, 200)

    const keyPolicy = await json(baseUrl, '/api/v1/admin/cache/key-policies/source-a', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ mode: 'full_url' }),
    })
    assert.equal(keyPolicy.response.status, 200)
    assert.deepEqual(calls, [
      ['policy', 'usr_cache_admin', 1234],
      ['preview', ['expired']],
      ['analysis', 'usr_cache_admin', 'source-a'],
      ['key-policy', 'usr_cache_admin', 'source-a', 'full_url'],
    ])
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})
