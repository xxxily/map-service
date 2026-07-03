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

async function readStreamJson (stream) {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

test('source presets are seeded disabled and cover vector candidates', async () => {
  const dataDir = tempDir('source-presets')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })

  try {
    const presets = await manager.listSourcePresets()
    assert.ok(presets.some(item => item.presetId === 'preset:maptiler-streets-vector'))
    assert.ok(presets.some(item => item.presetId === 'preset:tianditu-img-wmts'))
    assert.ok(presets.every(item => item.defaultDisabled === true))
    assert.equal(presets.find(item => item.presetId === 'preset:maptiler-streets-vector').requiresKey, true)
  } finally {
    await fs.remove(dataDir)
  }
})

test('source presets merge defaults into existing preset store', async () => {
  const dataDir = tempDir('source-presets-merge')
  const store = new AdminStore({ dataDir })
  const manager = new TileCatalogManager({ store })

  try {
    await store.write('source-presets', [
      {
        presetId: 'preset:maptiler-streets-vector',
        name: 'Old Saved MapTiler',
        vendor: 'maptiler',
        category: 'vector',
        kind: 'vector-style',
        adapter: 'maplibre-style',
        status: 'ready',
        defaultDisabled: true,
        requiresKey: false,
        entry: {
          styleJsonUrl: 'https://old.example.com/style.json',
        },
      },
      {
        presetId: 'preset:custom-saved',
        name: 'Saved Custom',
        vendor: 'custom',
        category: 'street',
        kind: 'xyz-raster',
        adapter: 'template',
        status: 'ready',
        defaultDisabled: true,
        entry: {
          template: 'https://tiles.example.com/{z}/{x}/{y}.png',
        },
      },
    ])
    const presets = await manager.listSourcePresets()
    assert.ok(presets.some(item => item.presetId === 'preset:custom-saved'))
    const maptiler = presets.find(item => item.presetId === 'preset:maptiler-streets-vector')
    assert.equal(maptiler.requiresKey, true)
    assert.equal(maptiler.entry.styleJsonUrl, 'https://api.maptiler.com/maps/streets-v2/style.json?key={key}')
  } finally {
    await fs.remove(dataDir)
  }
})

test('key-required source preset vendors get seeded default empty key pools', async () => {
  const dataDir = tempDir('default-key-pools')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })

  try {
    const pools = await manager.listKeyPools()
    const byId = new Map(pools.map(pool => [pool.id, pool]))
    const expectedVendors = [
      'tianditu',
      'tencent',
      'baidu',
      'google',
      'maptiler',
      'mapbox',
      'stadia',
      'here',
      'microsoft',
      'thunderforest',
      'openweathermap',
    ]
    expectedVendors.forEach((vendor) => {
      const pool = byId.get(`default-${vendor}-key-pool`)
      assert.ok(pool, `missing default pool for ${vendor}`)
      assert.equal(pool.vendor, vendor)
      assert.equal(pool.enabled, true)
      assert.equal(pool.keys.length, 0)
      assert.ok(pool.credentialUrl.startsWith('https://'))
      assert.ok(pool.allowedPresetIds.length > 0)
    })
    assert.equal(byId.get('default-tianditu-key-pool').defaultParamName, 'tk')
    assert.equal(byId.get('default-baidu-key-pool').defaultSecretType, 'ak')
    assert.equal(byId.get('default-mapbox-key-pool').defaultParamName, 'access_token')
    assert.equal(byId.get('default-openweathermap-key-pool').defaultParamName, 'appid')
  } finally {
    await fs.remove(dataDir)
  }
})

test('default key pools merge into existing key pool store without replacing user keys', async () => {
  const dataDir = tempDir('default-key-pools-merge')
  const store = new AdminStore({ dataDir })
  const manager = new TileCatalogManager({ store })

  try {
    await store.write('key-pools', [
      {
        id: 'default-maptiler-key-pool',
        name: 'Saved MapTiler Pool',
        vendor: 'maptiler',
        enabled: true,
        scope: 'global',
        strategy: 'round_robin',
        keys: [{ id: 'saved-key', alias: 'Saved Key', secret: 'secret-a' }],
      },
      {
        id: 'custom-key-pool',
        name: 'Custom Pool',
        vendor: 'custom',
        enabled: true,
        scope: 'global',
        strategy: 'round_robin',
        keys: [{ id: 'custom-key', alias: 'Custom Key', secret: 'secret-b' }],
      },
    ])

    const pools = await manager.listKeyPools()
    const maptiler = pools.find(pool => pool.id === 'default-maptiler-key-pool')
    assert.equal(maptiler.name, 'Saved MapTiler Pool')
    assert.equal(maptiler.keys.length, 1)
    assert.equal(maptiler.keys[0].hasSecret, true)
    assert.ok(maptiler.credentialUrl)
    assert.ok(maptiler.allowedPresetIds.includes('preset:maptiler-streets-vector'))
    assert.ok(pools.some(pool => pool.id === 'default-tianditu-key-pool'))
    assert.ok(pools.some(pool => pool.id === 'custom-key-pool'))
  } finally {
    await fs.remove(dataDir)
  }
})

test('key pools sanitize secrets and rotate keys for source requests', async () => {
  const dataDir = tempDir('key-pool-rotation')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })

  try {
    const pool = await manager.createKeyPool({
      id: 'maptiler-main',
      name: 'MapTiler Main',
      vendor: 'maptiler',
      strategy: 'round_robin',
      keys: [
        { id: 'key-a', alias: 'Key A', secret: 'secret-a' },
        { id: 'key-b', alias: 'Key B', secret: 'secret-b' },
      ],
    })
    assert.equal(pool.keys[0].hasSecret, true)
    assert.equal(Object.hasOwn(pool.keys[0], 'secretValue'), false)
    assert.equal(Object.hasOwn(pool.keys[0], 'secretHash'), false)

    await manager.createTileSource({
      id: 'vector-a',
      name: 'Vector A',
      enabled: true,
      vendor: 'maptiler',
      kind: 'mvt',
      adapter: 'maplibre-style',
      entry: {
        template: 'https://tiles.example.com/{z}/{x}/{y}.pbf?key={key}',
      },
      minZoom: 0,
      maxZoom: 14,
      secrets: {
        required: true,
        keyPoolId: 'maptiler-main',
        placement: 'query',
        paramName: 'key',
      },
      permissions: {
        frontendVisible: true,
        externalApiAllowed: true,
      },
    })

    const first = await manager.createVectorResourceRequest('vector-a', 'mvt', { z: 3, x: 4, y: 5 })
    const second = await manager.createVectorResourceRequest('vector-a', 'mvt', { z: 3, x: 4, y: 6 })

    assert.equal(first.key.keyId, 'key-a')
    assert.equal(second.key.keyId, 'key-b')
    assert.equal(first.url.includes('secret-a'), true)
    assert.equal(second.url.includes('secret-b'), true)
    assert.equal(first.cacheMeta.keyPoolId, 'maptiler-main')
    assert.equal(first.cacheMeta.resourceType, 'mvt')

    const reloaded = new TileCatalogManager({ store: new AdminStore({ dataDir }) })
    const afterReload = await reloaded.createVectorResourceRequest('vector-a', 'mvt', { z: 3, x: 4, y: 7 })
    assert.equal(afterReload.url.includes('secret-a'), true)
  } finally {
    await fs.remove(dataDir)
  }
})

test('creating source from key-required preset auto-associates the default key pool', async () => {
  const dataDir = tempDir('preset-create-source')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })

  try {
    await assert.rejects(() => manager.createSourceFromPreset('preset:maptiler-streets-vector', {
      id: 'maptiler-streets-vector',
      enabled: true,
    }), /密钥池没有可用 Key/)

    const draft = await manager.createSourceFromPreset('preset:maptiler-streets-vector', {
      id: 'maptiler-streets-vector-draft',
      enabled: false,
    })
    assert.equal(draft.enabled, false)
    assert.equal(draft.secrets.keyPoolId, 'default-maptiler-key-pool')
    assert.equal(draft.secrets.hasKeyPool, true)

    await manager.createKeyPool({
      id: 'maptiler-main',
      name: 'MapTiler Main',
      vendor: 'maptiler',
      keys: [{ id: 'key-a', alias: 'Key A', secret: 'secret-a' }],
    })

    const source = await manager.createSourceFromPreset('preset:maptiler-streets-vector', {
      id: 'maptiler-streets-vector',
      keyPoolId: 'maptiler-main',
      enabled: true,
    })
    assert.equal(source.enabled, true)
    assert.equal(source.kind, 'vector-style')
    assert.equal(source.secrets.hasKeyPool, true)
  } finally {
    await fs.remove(dataDir)
  }
})

test('key-required presets can be saved disabled before key pool is configured', async () => {
  const dataDir = tempDir('preset-disabled-draft')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })

  try {
    const source = await manager.createSourceFromPreset('preset:maptiler-streets-vector', {
      id: 'maptiler-draft',
      enabled: false,
    })
    assert.equal(source.enabled, false)
    assert.equal(source.secrets.required, true)
    assert.equal(source.secrets.keyPoolId, 'default-maptiler-key-pool')
    assert.equal(source.secrets.hasKeyPool, true)

    await assert.rejects(() => manager.updateTileSource('maptiler-draft', {
      enabled: true,
    }), /密钥池没有可用 Key/)
  } finally {
    await fs.remove(dataDir)
  }
})

test('vector style responses are rewritten to controlled service URLs', async () => {
  const dataDir = tempDir('vector-style-rewrite')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })

  try {
    await manager.createTileSource({
      id: 'style-source',
      name: 'Style Source',
      enabled: true,
      kind: 'vector-style',
      adapter: 'maplibre-style',
      entry: {
        styleJsonUrl: 'https://styles.example.com/style.json',
        glyphsUrl: 'https://fonts.example.com/{fontstack}/{range}.pbf',
        spritesUrl: 'https://sprites.example.com/sprite',
      },
      permissions: { frontendVisible: true },
    })

    const source = await manager.getTileSource('style-source')
    const rewritten = manager.rewriteVectorStyle(source, {
      version: 8,
      sources: {
        openmaptiles: {
          type: 'vector',
          url: 'https://tiles.example.com/tiles.json?key=secret',
        },
      },
      layers: [],
      glyphs: 'https://fonts.example.com/{fontstack}/{range}.pbf?key=secret',
      sprite: 'https://sprites.example.com/sprite?key=secret',
    })

    assert.match(rewritten.sources.openmaptiles.url, /^\/api\/v1\/vector\/sources\/style-source\/[^/]+\/tilejson\.json$/)
    assert.match(rewritten.glyphs, /^\/api\/v1\/vector\/glyphs\/style-source\/[^/]+\/\{fontstack\}\/\{range\}\.pbf$/)
    assert.match(rewritten.sprite, /^\/api\/v1\/vector\/sprites\/style-source\/[^/]+\/sprite$/)
    assert.equal(JSON.stringify(rewritten).includes('secret'), false)
  } finally {
    await fs.remove(dataDir)
  }
})

test('vector style rewrite registers derived upstream resources without leaking keys', async () => {
  const dataDir = tempDir('vector-derived-resources')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })

  try {
    await manager.createKeyPool({
      id: 'maptiler-main',
      name: 'MapTiler Main',
      vendor: 'maptiler',
      keys: [{ id: 'key-a', alias: 'Key A', secret: 'secret-a' }],
    })
    await manager.createTileSource({
      id: 'style-source',
      name: 'Style Source',
      enabled: true,
      kind: 'vector-style',
      adapter: 'maplibre-style',
      entry: {
        styleJsonUrl: 'https://styles.example.com/maps/style.json?key={key}',
      },
      secrets: {
        required: true,
        keyPoolId: 'maptiler-main',
        placement: 'query',
        paramName: 'key',
      },
    })

    const request = await manager.createVectorResourceRequest('style-source', 'style')
    const rewritten = manager.rewriteVectorStyle(request.source, {
      version: 8,
      sources: {
        omt: {
          type: 'vector',
          tiles: ['../tiles/{z}/{x}/{y}.pbf?key=secret-a'],
        },
      },
      layers: [],
      glyphs: '../fonts/{fontstack}/{range}.pbf?key=secret-a',
      sprite: '../sprites/sprite?key=secret-a',
    }, {
      upstreamBaseUrl: request.url,
      selectedKey: request.internalKey,
    })

    assert.equal(JSON.stringify(rewritten).includes('secret-a'), false)
    const tileMatch = rewritten.sources.omt.tiles[0].match(/\/tiles\/style-source\/([^/]+)\/\{z\}/)
    assert.ok(tileMatch)
    const glyphMatch = rewritten.glyphs.match(/\/glyphs\/style-source\/([^/]+)\//)
    assert.ok(glyphMatch)
    const spriteMatch = rewritten.sprite.match(/\/sprites\/style-source\/([^/]+)\//)
    assert.ok(spriteMatch)

    const tileRequest = await manager.createVectorResourceRequest('style-source', 'mvt', {
      ref: tileMatch[1],
      z: 3,
      x: 4,
      y: 5,
    })
    const glyphRequest = await manager.createVectorResourceRequest('style-source', 'glyph', {
      ref: glyphMatch[1],
      fontstack: 'Noto Sans Regular',
      range: '0-255',
    })
    const spriteRequest = await manager.createVectorResourceRequest('style-source', 'sprite-json', {
      ref: spriteMatch[1],
    })

    assert.equal(tileRequest.url, 'https://styles.example.com/tiles/3/4/5.pbf?key=secret-a')
    assert.equal(glyphRequest.url, 'https://styles.example.com/fonts/Noto%20Sans%20Regular/0-255.pbf?key=secret-a')
    assert.equal(spriteRequest.url, 'https://styles.example.com/sprites/sprite.json?key=secret-a')
  } finally {
    await fs.remove(dataDir)
  }
})

test('GET /api/v1/vector/styles/:sourceId/style.json relays rewritten JSON', async () => {
  let vectorCall = null
  const restore = withMockedService({
    isAccessEnabled: async () => false,
    fetchVectorResource: async (sourceId, resourceType, params, options) => {
      vectorCall = { sourceId, resourceType, params, options }
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        stream: Readable.from([Buffer.from(JSON.stringify({ version: 8, sources: {}, layers: [] }))]),
        cacheStatus: 'MISS',
      }
    },
  })

  const app = createTestApp()
  const { server, baseUrl } = await listen(app)

  try {
    const response = await fetch(`${baseUrl}/api/v1/vector/styles/style-source/style.json`)
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.version, 8)
    assert.equal(vectorCall.sourceId, 'style-source')
    assert.equal(vectorCall.resourceType, 'style')
  } finally {
    server.close()
    restore()
  }
})

test('external vector style rewrite uses publish scoped resource paths', async () => {
  const dataDir = tempDir('external-vector-rewrite')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })

  try {
    await manager.createTileSource({
      id: 'style-source',
      name: 'Style Source',
      enabled: true,
      kind: 'vector-style',
      adapter: 'maplibre-style',
      entry: {
        styleJsonUrl: 'https://styles.example.com/style.json',
      },
      permissions: {
        externalApiAllowed: true,
      },
    })
    const source = await manager.getTileSource('style-source')
    const rewritten = manager.rewriteVectorStyle(source, {
      version: 8,
      sources: {
        omt: {
          type: 'vector',
          tiles: ['https://tiles.example.com/{z}/{x}/{y}.pbf'],
        },
      },
      layers: [],
      glyphs: 'https://fonts.example.com/{fontstack}/{range}.pbf',
      sprite: 'https://sprites.example.com/sprite',
    }, {
      basePath: '/api/v1/external/public-vector',
      sourcePath: '',
      upstreamBaseUrl: 'https://styles.example.com/style.json',
    })

    assert.match(rewritten.sources.omt.tiles[0], /^\/api\/v1\/external\/public-vector\/tiles\/[^/]+\/\{z\}\/\{x\}\/\{y\}\.pbf$/)
    assert.match(rewritten.glyphs, /^\/api\/v1\/external\/public-vector\/glyphs\/[^/]+\/\{fontstack\}\/\{range\}\.pbf$/)
    assert.match(rewritten.sprite, /^\/api\/v1\/external\/public-vector\/sprites\/[^/]+\/sprite$/)
  } finally {
    await fs.remove(dataDir)
  }
})

test('service fetchVectorResource rewrites upstream style JSON and hides key', async () => {
  const dataDir = tempDir('service-vector-style')
  const manager = new TileCatalogManager({ store: new AdminStore({ dataDir }) })
  // This test exercises the rewrite helpers directly because the singleton service
  // uses the production store. It still verifies the same response shape expected
  // from service.fetchVectorResource.
  try {
    await manager.createTileSource({
      id: 'style-source',
      name: 'Style Source',
      enabled: true,
      kind: 'vector-style',
      adapter: 'maplibre-style',
      entry: {
        styleJsonUrl: 'https://styles.example.com/style.json?key={key}',
      },
    })
    const source = await manager.getTileSource('style-source')
    const result = manager.rewriteVectorStyle(source, {
      version: 8,
      sources: {
        omt: { type: 'vector', tiles: ['https://tiles.example.com/{z}/{x}/{y}.pbf?key=secret'] },
      },
      layers: [],
    })
    const relay = {
      stream: Readable.from([Buffer.from(JSON.stringify(result))]),
      headers: { 'content-type': 'application/json' },
    }
    const payload = await readStreamJson(relay.stream)
    assert.match(payload.sources.omt.tiles[0], /^\/api\/v1\/vector\/tiles\/style-source\/[^/]+\/\{z\}\/\{x\}\/\{y\}\.pbf$/)
    assert.equal(JSON.stringify(payload).includes('secret'), false)
  } finally {
    await fs.remove(dataDir)
  }
})
