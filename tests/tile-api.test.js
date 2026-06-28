import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import express from 'express'
import commonMethods from '../service/bin/middleware/commonMethods/index.js'
import service from '../service/bin/service.js'
import simpleApi from '../service/bin/simpleApi.js'
import TileApiLogger from '../service/bin/admin/tileApiLogger.js'

class MockStore {
  constructor () {
    this.data = {}
  }
  async read (name, fallback) {
    return this.data[name] !== undefined ? JSON.parse(JSON.stringify(this.data[name])) : fallback
  }
  async write (name, value) {
    this.data[name] = JSON.parse(JSON.stringify(value))
    return value
  }
}

test('TileApiLogger FIFO capping, list and clear', async () => {
  const store = new MockStore()
  const logger = new TileApiLogger({ store })

  // 1. Initially empty
  let list = await logger.list()
  assert.equal(list.length, 0)

  // 2. Add log entries
  await logger.addLog({ id: 1, name: 'log1' }, 3)
  await logger.addLog({ id: 2, name: 'log2' }, 3)
  await logger.addLog({ id: 3, name: 'log3' }, 3)
  
  list = await logger.list()
  assert.equal(list.length, 3)
  assert.equal(list[0].id, 3) // Latest at front

  // 3. Add 4th log entry, should cap to 3
  await logger.addLog({ id: 4, name: 'log4' }, 3)
  list = await logger.list()
  assert.equal(list.length, 3)
  assert.equal(list[0].id, 4) // Latest
  assert.equal(list[2].id, 2) // Earliest (log1 is evicted)

  // 4. Clear logs
  await logger.clear()
  list = await logger.list()
  assert.equal(list.length, 0)
})

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

test('GET /api/v1/external/tile responds with 403 when disabled', async () => {
  const restore = withMockedService({
    getRawSettings: async () => ({
      tileApi: {
        enabled: false
      }
    }),
    logTileApiRequest: async () => {}
  })

  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    const response = await fetch(`${baseUrl}/api/v1/external/tile?x=1&y=2&z=3`)
    assert.equal(response.status, 403)
    const payload = await response.json()
    assert.equal(payload.error.message, '对外图层接口未开放')
  } finally {
    server.close()
    restore()
  }
})

test('GET /api/v1/external/tile checks token authentication and strips it before relay', async () => {
  let loggedEntry = null
  let fetchedTargetUrl = ''
  
  const restore = withMockedService({
    getRawSettings: async () => ({
      tileApi: {
        enabled: true,
        upstreamUrl: 'http://upstream.mock/maps/{z}/{x}/{y}.png?scale={scale}',
        useProxy: false,
        tokenEnabled: true,
        token: 'secret-token',
        maxLogCount: 500
      }
    }),
    logTileApiRequest: async (entry) => {
      loggedEntry = entry
    },
    fetchRelay: async (targetUrl, options) => {
      fetchedTargetUrl = targetUrl
      return {
        statusCode: 200,
        headers: {
          'content-type': 'image/png'
        },
        stream: Readable.from([Buffer.from('tile')]),
        cacheStatus: 'MISS'
      }
    }
  })

  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    // 1. Without token -> 401
    let response = await fetch(`${baseUrl}/api/v1/external/tile?x=1&y=2&z=3`)
    assert.equal(response.status, 401)
    
    // 2. With wrong token -> 401
    response = await fetch(`${baseUrl}/api/v1/external/tile?x=1&y=2&z=3&token=wrong`)
    assert.equal(response.status, 401)

    // 3. With correct token -> 200 & masked token in logs
    response = await fetch(`${baseUrl}/api/v1/external/tile?x=1&y=2&z=3&token=secret-token`)
    assert.equal(response.status, 200)
    
    // Check coordinate placeholder replacement
    assert.equal(fetchedTargetUrl, 'http://upstream.mock/maps/3/1/2.png?scale=2')
    
    // Check that log entry exists and preserves the original token
    assert.ok(loggedEntry)
    assert.ok(loggedEntry.reqUrl.includes('secret-token'))

    // 4. With custom query parameters -> forwarded correctly
    response = await fetch(`${baseUrl}/api/v1/external/tile?x=1&y=2&z=3&token=secret-token&scale=3&custom_param=val`)
    assert.equal(response.status, 200)
    assert.equal(fetchedTargetUrl, 'http://upstream.mock/maps/3/1/2.png?scale=3&custom_param=val')
  } finally {
    server.close()
    restore()
  }
})
