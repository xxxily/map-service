import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Readable } from 'node:stream'
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

test('GET shared KML feature content passes ids and returns content view', async () => {
  const calls = []
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    getSharedKmlFeatureContent: async (id, featureId, isAdmin) => {
      calls.push({ id, featureId, isAdmin })
      return {
        sharedKmlId: id,
        featureId,
        groups: [],
        contentSummary: {
          hasRichContent: false,
        },
      }
    },
  })
  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    const response = await fetch(`${baseUrl}/api/v1/kml/shared/shared-1/features/feat-1/content`)
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.equal(payload.code, 0)
    assert.equal(payload.result.sharedKmlId, 'shared-1')
    assert.equal(payload.result.featureId, 'feat-1')
    assert.deepEqual(calls, [{ id: 'shared-1', featureId: 'feat-1', isAdmin: false }])
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('GET shared KML feature content inherits public access control', async () => {
  const restore = withMockedService({
    isAccessEnabled: async () => true,
    verifyAccess: async () => false,
  })
  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    const response = await fetch(`${baseUrl}/api/v1/kml/shared/shared-1/features/feat-1/content`)
    const payload = await response.json()

    assert.equal(response.status, 401)
    assert.equal(payload.code, -1)
    assert.match(payload.error.message, /拒绝访问/)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('GET KML media streams an access-controlled compatibility image', async () => {
  const calls = []
  const body = Buffer.from('test-image')
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    fetchKmlMedia: async (url) => {
      calls.push(url)
      return {
        statusCode: 200,
        headers: {
          'content-type': 'image/jpeg',
          'content-length': String(body.length),
        },
        stream: Readable.from(body),
        cacheStatus: 'MISS',
      }
    },
  })
  const app = createTestApp()
  const { server, baseUrl } = await listen(app)
  const target = 'https://down-files.2bulu.com/f/dn1?downParams=opaque-value'

  try {
    const response = await fetch(`${baseUrl}/api/v1/kml/media?url=${encodeURIComponent(target)}`)

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/jpeg')
    assert.equal(response.headers.get('x-cache'), 'MISS')
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), body.toString())
    assert.deepEqual(calls, [target])
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})

test('GET KML media inherits public access control', async () => {
  const restore = withMockedService({
    isAccessEnabled: async () => true,
    verifyAccess: async () => false,
  })
  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    const target = 'https://down-files.2bulu.com/f/dn1?id=1'
    const response = await fetch(`${baseUrl}/api/v1/kml/media?url=${encodeURIComponent(target)}`)
    const payload = await response.json()

    assert.equal(response.status, 401)
    assert.equal(payload.code, -1)
    assert.match(payload.error.message, /拒绝访问/)
  } finally {
    await new Promise(resolve => server.close(resolve))
    restore()
  }
})
