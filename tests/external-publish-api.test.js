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

test('旧版单一 upstream 对外接口不再注册', async () => {
  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    const response = await fetch(`${baseUrl}/api/v1/external/tile?x=1&y=2&z=3`)
    assert.equal(response.status, 404)
  } finally {
    server.close()
  }
})

test('GET /api/v1/external/:publishId/tilejson passes token to publish resolver', async () => {
  let tileJsonOptions = null
  const restore = withMockedService({
    getExternalPublishTileJson: async (publishId, options) => {
      tileJsonOptions = { publishId, options }
      return {
        tilejson: '3.0.0',
        id: publishId,
        tiles: [`/api/v1/external/${publishId}/{z}/{x}/{y}`],
        tokenRequired: true,
      }
    },
  })

  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    const response = await fetch(`${baseUrl}/api/v1/external/google-public/tilejson?token=secret`)
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.result.id, 'google-public')
    assert.equal(tileJsonOptions.publishId, 'google-public')
    assert.equal(tileJsonOptions.options.token, 'secret')
  } finally {
    server.close()
    restore()
  }
})

test('GET /api/v1/external/:publishId/sources/:sourceId/:z/:x/:y relays layer source and logs metadata without blocking stream', async () => {
  let loggedEntry = null
  let tileOptions = null
  const restore = withMockedService({
    fetchExternalLayerSourceTile: async (publishId, sourceId, tile, options) => {
      tileOptions = { publishId, sourceId, tile, options }
      return {
        statusCode: 200,
        headers: {
          'content-type': 'image/png',
        },
        stream: Readable.from([Buffer.from('tile')]),
        cacheStatus: 'MISS',
        source: { id: sourceId },
        layer: { id: 'amap-hybrid' },
        publish: { id: 'hybrid-public', pathSlug: publishId, log: { maxLogCount: 500 } },
        proxy: {
          poolId: '',
          outboundId: '',
        },
      }
    },
    logExternalPublishRequest: async (entry) => {
      loggedEntry = entry
    },
  })

  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    const response = await fetch(`${baseUrl}/api/v1/external/hybrid-slug/sources/amap-road/3/1/2?token=secret`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'tile')
    assert.equal(tileOptions.publishId, 'hybrid-slug')
    assert.equal(tileOptions.sourceId, 'amap-road')
    assert.deepEqual(tileOptions.tile, { z: '3', x: '1', y: '2' })
    assert.equal(tileOptions.options.token, 'secret')
    assert.equal(loggedEntry.publishId, 'hybrid-public')
    assert.equal(loggedEntry.sourceId, 'amap-road')
    assert.equal(loggedEntry.layerId, 'amap-hybrid')
    assert.equal(loggedEntry.cacheStatus, 'MISS')
    assert.equal(loggedEntry.reqUrl.includes('secret'), false)
    assert.equal(loggedEntry.reqUrl.includes('token=****'), true)
  } finally {
    server.close()
    restore()
  }
})

test('GET /api/v1/admin/external-publish-logs returns all logs for diagnostics', async () => {
  const restore = withMockedService({
    verifyUserSession: token => token === 'test-session'
      ? { user: { permissions: ['system.super_admin'] } }
      : null,
    assertUserPermission: () => true,
    listExternalPublishLogs: async (id = '') => [
      { publishId: id || 'hybrid-public', sourceId: 'amap-road' },
    ],
  })

  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    const response = await fetch(`${baseUrl}/api/v1/admin/external-publish-logs`, {
      headers: {
        Cookie: 'map_user_session=test-session',
      },
    })
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.result[0].publishId, 'hybrid-public')
  } finally {
    server.close()
    restore()
  }
})

test('GET /api/v1/admin/source-access-logs returns source access diagnostics separately', async () => {
  const restore = withMockedService({
    verifyUserSession: token => token === 'test-session'
      ? { user: { permissions: ['system.super_admin'] } }
      : null,
    assertUserPermission: () => true,
    listSourceAccessLogs: async (id = '') => [
      { sourceId: id || 'google-satellite', proxyOutboundId: 'proxy-a', cacheStatus: 'HIT' },
    ],
  })

  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    const response = await fetch(`${baseUrl}/api/v1/admin/source-access-logs`, {
      headers: {
        Cookie: 'map_user_session=test-session',
      },
    })
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.result[0].sourceId, 'google-satellite')
    assert.equal(payload.result[0].proxyOutboundId, 'proxy-a')
  } finally {
    server.close()
    restore()
  }
})

test('external publish tile route respects disabled publish logging', async () => {
  let loggedEntry = null
  const restore = withMockedService({
    fetchExternalPublishTile: async (publishId) => ({
      statusCode: 200,
      headers: {
        'content-type': 'image/png',
      },
      stream: Readable.from([Buffer.from('tile')]),
      cacheStatus: 'HIT',
      source: { id: 'amap-road' },
      publish: { id: publishId, log: { enabled: false, maxLogCount: 500 } },
      proxy: { poolId: '', outboundId: '' },
    }),
    logExternalPublishRequest: async (entry) => {
      loggedEntry = entry
    },
  })

  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    const response = await fetch(`${baseUrl}/api/v1/external/no-log-public/3/1/2`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'tile')
    assert.equal(loggedEntry, null)
  } finally {
    server.close()
    restore()
  }
})

test('sprite@2x routes work without ref for both vector and external publish endpoints', async () => {
  const calls = []
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    fetchVectorResource: async (sourceId, resourceType, params) => {
      calls.push({ kind: 'vector', sourceId, resourceType, params })
      return {
        statusCode: 200,
        headers: { 'content-type': resourceType.includes('json') ? 'application/json' : 'image/png' },
        stream: Readable.from([Buffer.from(resourceType)]),
      }
    },
    fetchExternalVectorResource: async (publishId, resourceType, params) => {
      calls.push({ kind: 'external', publishId, resourceType, params })
      return {
        statusCode: 200,
        headers: { 'content-type': resourceType.includes('json') ? 'application/json' : 'image/png' },
        stream: Readable.from([Buffer.from(resourceType)]),
      }
    },
  })

  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    for (const [urlPath, expected] of [
      ['/api/v1/vector/sprites/src-a/sprite@2x.json', { kind: 'vector', sourceId: 'src-a', resourceType: 'sprite-json-2x', params: {} }],
      ['/api/v1/vector/sprites/src-a/sprite@2x.png', { kind: 'vector', sourceId: 'src-a', resourceType: 'sprite-png-2x', params: {} }],
      ['/api/v1/external/pub-a/sprites/sprite@2x.json', { kind: 'external', publishId: 'pub-a', resourceType: 'sprite-json-2x', params: {} }],
      ['/api/v1/external/pub-a/sprites/sprite@2x.png', { kind: 'external', publishId: 'pub-a', resourceType: 'sprite-png-2x', params: {} }],
    ]) {
      const response = await fetch(`${baseUrl}${urlPath}`)
      assert.equal(response.status, 200)
      assert.equal(await response.text(), expected.resourceType)
    }

    assert.equal(calls.length, 4)
  } finally {
    server.close()
    restore()
  }
})

test('external publish tile error path respects disabled publish logging', async () => {
  let logged = false
  const restore = withMockedService({
    findExternalPublish: (id) => ({
      id,
      log: { enabled: false, maxLogCount: 500 },
    }),
    fetchExternalPublishTile: async () => {
      const err = new Error('图源已禁用')
      err.statusCode = 403
      throw err
    },
    logExternalPublishRequest: async () => {
      logged = true
    },
  })

  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    const response = await fetch(`${baseUrl}/api/v1/external/disabled-log-pub/3/1/2`)
    assert.equal(response.status, 403)
    assert.equal(logged, false)
  } finally {
    server.close()
    restore()
  }
})
