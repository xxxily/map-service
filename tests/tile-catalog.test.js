import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import express from 'express'
import fs from 'fs-extra'
import path from 'path'
import { tmpdir } from 'node:os'
import AdminStore from '../service/bin/admin/store.js'
import TileCatalogManager from '../service/bin/admin/tileCatalog.js'
import commonMethods from '../service/bin/middleware/commonMethods/index.js'
import service from '../service/bin/service.js'
import simpleApi from '../service/bin/simpleApi.js'

function tempDir (name) {
  return path.join(tmpdir(), `map-service-${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
}

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

test('tile catalog initializes default sources, layers and proxy pool', async () => {
  const dataDir = tempDir('tile-catalog-defaults')
  const manager = new TileCatalogManager({
    store: new AdminStore({ dataDir }),
    defaults: {
      proxy: {
        enabled: true,
        protocol: 'http',
        host: '127.0.0.1',
        port: 7890,
      },
    },
  })

  try {
    const catalog = await manager.getPublicCatalog()
    assert.ok(catalog.sources.some(source => source.id === 'google-satellite'))
    assert.ok(catalog.layers.some(layer => layer.id === 'amap-hybrid'))
    assert.equal(catalog.defaultLayerId, 'amap-hybrid')
    assert.equal(catalog.sources.some(source => Object.hasOwn(source, 'template')), false)

    const outbounds = await manager.listProxyOutbounds()
    assert.equal(outbounds[0].id, 'default-proxy-outbound')
    assert.equal(outbounds[0].hasPassword, false)
    assert.equal(Object.hasOwn(outbounds[0], 'password'), false)
  } finally {
    await fs.remove(dataDir)
  }
})

test('tile catalog creates proxy pool and resolves source tile request through it', async () => {
  const dataDir = tempDir('tile-catalog-proxy')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })

  try {
    await manager.createProxyOutbound({
      id: 'proxy-a',
      name: 'Proxy A',
      protocol: 'http',
      host: 'proxy.example.com',
      port: 8080,
      username: 'user',
      password: 'pass',
    })
    await manager.createProxyPool({
      id: 'google-pool',
      name: 'Google Pool',
      strategy: 'priority',
      members: [{ outboundId: 'proxy-a', priority: 10 }],
    })
    await manager.updateTileSource('google-satellite', {
      proxy: {
        mode: 'pool',
        poolId: 'google-pool',
      },
    })

    const request = await manager.createSourceTileRequest('google-satellite', {
      z: 3,
      x: 4,
      y: 5,
    }, {
      scale: 2,
    })

    assert.equal(request.proxy.enabled, true)
    assert.equal(request.proxy.host, 'proxy.example.com')
    assert.equal(request.proxy.username, 'user')
    assert.equal(request.url.includes('x=4'), true)
    assert.equal(request.cacheMeta.sourceId, 'google-satellite')
  } finally {
    await fs.remove(dataDir)
  }
})

test('tile catalog normalizes legacy proxy inherit to direct and rejects arbitrary tile size', async () => {
  const dataDir = tempDir('tile-catalog-policy')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })

  try {
    const source = await manager.updateTileSource('google-satellite', {
      proxy: {
        mode: 'inherit',
        poolId: 'default-proxy-pool',
      },
    })

    assert.equal(source.proxy.mode, 'never')
    assert.equal(source.proxy.poolId, '')

    const request = await manager.createSourceTileRequest('google-satellite', {
      z: 3,
      x: 4,
      y: 5,
    })
    assert.equal(request.proxy.enabled, false)

    await assert.rejects(() => manager.updateTileSource('google-satellite', {
      tileSize: 512,
    }), /瓦片网格尺寸当前固定为 256/)

    const scaledSource = await manager.updateTileSource('google-satellite', {
      tileSize: 256,
      retina: {
        mode: 'fixed',
        param: 'scale',
        normalValue: '3',
        retinaValue: '3',
      },
    })
    assert.equal(scaledSource.retina.normalValue, '3')
    assert.equal(scaledSource.tileSize, 256)

    const renamedSource = await manager.updateTileSource('google-satellite', {
      name: 'Google Satellite Renamed',
    })
    assert.equal(renamedSource.retina.normalValue, '3')

    const modeOnlySource = await manager.updateTileSource('google-satellite', {
      retina: {
        mode: 'fixed',
      },
    })
    assert.equal(modeOnlySource.retina.normalValue, '3')
  } finally {
    await fs.remove(dataDir)
  }
})

test('external publish supports token reset and validates token for tile requests', async () => {
  const dataDir = tempDir('tile-catalog-external')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })

  try {
    const created = await manager.createExternalPublish({
      id: 'amap-public',
      name: 'AMap Public',
      enabled: true,
      targetType: 'source',
      targetId: 'amap-road',
      auth: {
        mode: 'token',
      },
    })

    assert.ok(created.token)
    assert.equal(created.publish.auth.hasToken, true)
    assert.equal(Object.hasOwn(created.publish.auth, 'tokenHash'), false)

    await assert.rejects(() => manager.createExternalTileRequest('amap-public', {
      z: 3,
      x: 1,
      y: 2,
    }, {
      token: 'bad-token',
    }), /Token 校验失败/)

    const request = await manager.createExternalTileRequest('amap-public', {
      z: 3,
      x: 1,
      y: 2,
    }, {
      token: created.token,
    })
    assert.equal(request.publish.id, 'amap-public')
    assert.equal(request.cacheMeta.publishId, 'amap-public')
    assert.equal(request.cacheMeta.sourceId, 'amap-road')
  } finally {
    await fs.remove(dataDir)
  }
})

test('external layer publish exposes source tilejson and source-specific tile requests', async () => {
  const dataDir = tempDir('tile-catalog-layer-publish')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })

  try {
    const created = await manager.createExternalPublish({
      id: 'hybrid-public',
      name: 'Hybrid Public',
      enabled: true,
      targetType: 'layer',
      targetId: 'amap-hybrid',
      auth: {
        mode: 'token',
      },
    })

    const tileJson = await manager.getExternalPublishTileJson('hybrid-public', {
      token: created.token,
    })
    assert.equal(tileJson.type, 'layer')
    assert.equal(tileJson.tokenRequired, true)
    assert.equal(tileJson.sources.some(source => source.id === 'amap-road'), true)
    assert.equal(tileJson.sources.some(source => Object.hasOwn(source, 'template')), false)
    assert.equal(tileJson.sources.find(source => source.id === 'amap-road').tileUrl.includes('token='), false)

    const request = await manager.createExternalLayerSourceTileRequest('hybrid-public', 'amap-road', {
      z: 3,
      x: 1,
      y: 2,
    }, {
      token: created.token,
    })
    assert.equal(request.publish.id, 'hybrid-public')
    assert.equal(request.layer.id, 'amap-hybrid')
    assert.equal(request.source.id, 'amap-road')
    assert.equal(request.cacheMeta.publishId, 'hybrid-public')
    assert.equal(request.cacheMeta.layerId, 'amap-hybrid')

    await assert.rejects(() => manager.createExternalLayerSourceTileRequest('hybrid-public', 'google-satellite', {
      z: 3,
      x: 1,
      y: 2,
    }, {
      token: created.token,
    }), /不包含该图源/)
  } finally {
    await fs.remove(dataDir)
  }
})

test('GET /api/v1/external/:publishId/:z/:x/:y relays published source and logs metadata', async () => {
  let loggedEntry = null
  let tileOptions = null
  const restore = withMockedService({
    fetchExternalPublishTile: async (publishId, tile, options) => {
      tileOptions = { publishId, tile, options }
      return {
        statusCode: 200,
        headers: {
          'content-type': 'image/png',
        },
        stream: Readable.from([Buffer.from('tile')]),
        cacheStatus: 'HIT',
        source: { id: 'google-satellite' },
        publish: { id: publishId, log: { maxLogCount: 1000 } },
        proxy: {
          poolId: 'default-proxy-pool',
          outboundId: 'default-proxy-outbound',
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
    const response = await fetch(`${baseUrl}/api/v1/external/google-public/3/1/2?token=secret`)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'tile')
    assert.equal(tileOptions.publishId, 'google-public')
    assert.deepEqual(tileOptions.tile, { z: '3', x: '1', y: '2' })
    assert.equal(tileOptions.options.token, 'secret')
    assert.equal(loggedEntry.sourceId, 'google-satellite')
    assert.equal(loggedEntry.cacheStatus, 'HIT')
    assert.equal(loggedEntry.proxyOutboundId, 'default-proxy-outbound')
  } finally {
    server.close()
    restore()
  }
})
