import assert from 'node:assert/strict'
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
