import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import express from 'express'
import commonMethods from '../service/bin/middleware/commonMethods/index.js'
import service from '../service/bin/service.js'
import simpleApi from '../service/bin/simpleApi.js'

function createTestApp () {
  Object.keys(simpleApi.routeSet).forEach((key) => {
    delete simpleApi.routeSet[key]
  })

  const app = express()
  app.use(commonMethods)
  app.use(express.urlencoded({ extended: false }))
  app.use(express.json())
  simpleApi.routeController(app, simpleApi.configList, simpleApi.basePath)
  return app
}

function listen (app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      })
    })
  })
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
  const payload = await response.json().catch(() => null)
  return {
    response,
    payload,
  }
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

test('access API uses httpOnly cookie tokens and protects tile relay', async () => {
  let activeToken = 'signed-token-v1'
  const restore = withMockedService({
    isAccessEnabled: async () => true,
    verifyAccess: async (token) => token === activeToken,
    checkAccessPassword: async (password) => password === 'correct-access-password',
    createAccessToken: async () => ({
      token: activeToken,
      expiresAt: Date.now() + 1000,
      maxAge: 1000,
    }),
    fetchRelay: async () => ({
      statusCode: 200,
      headers: {
        'content-type': 'image/png',
      },
      stream: Readable.from([Buffer.from('tile')]),
      cacheStatus: 'MISS',
    }),
  })
  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    let result = await requestJson(baseUrl, '/api/v1/access/status')
    assert.equal(result.response.status, 200)
    assert.equal(result.payload.result.required, true)

    const target = encodeURIComponent('https://www.google.com/maps/vt?lyrs=s&x=1&y=2&z=3')
    result = await requestJson(baseUrl, `/api/v1/tiles/relay?url=${target}&access_token=${activeToken}`)
    assert.equal(result.response.status, 401)

    result = await requestJson(baseUrl, '/api/v1/access/verify', {
      method: 'POST',
      body: JSON.stringify({ password: 'correct-access-password' }),
    })
    assert.equal(result.response.status, 200)
    assert.equal(Object.hasOwn(result.payload.result, 'token'), false)

    const setCookie = result.response.headers.get('set-cookie') || ''
    assert.match(setCookie, /map_access_token=/)
    assert.match(setCookie, /HttpOnly/i)
    assert.match(setCookie, /SameSite=Lax/i)
    const cookie = setCookie.split(';')[0]

    result = await requestJson(baseUrl, '/api/v1/access/status', {
      headers: {
        Cookie: cookie,
      },
    })
    assert.equal(result.payload.result.required, false)

    const tileResponse = await fetch(`${baseUrl}/api/v1/tiles/relay?url=${target}`, {
      headers: {
        Cookie: cookie,
      },
    })
    assert.equal(tileResponse.status, 200)
    assert.equal(await tileResponse.text(), 'tile')

    activeToken = 'signed-token-v2'
    result = await requestJson(baseUrl, '/api/v1/access/status', {
      headers: {
        Cookie: cookie,
      },
    })
    assert.equal(result.payload.result.required, true)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('access verify rate limits repeated bad passwords', async () => {
  const restore = withMockedService({
    isAccessEnabled: async () => true,
    checkAccessPassword: async () => false,
  })
  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    for (let index = 0; index < 5; index += 1) {
      const result = await requestJson(baseUrl, '/api/v1/access/verify', {
        method: 'POST',
        headers: {
          'User-Agent': 'map-service-rate-limit-test',
        },
        body: JSON.stringify({ password: `wrong-${index}` }),
      })
      assert.equal(result.response.status, 403)
    }

    const blocked = await requestJson(baseUrl, '/api/v1/access/verify', {
      method: 'POST',
      headers: {
        'User-Agent': 'map-service-rate-limit-test',
      },
      body: JSON.stringify({ password: 'still-wrong' }),
    })
    assert.equal(blocked.response.status, 429)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})
