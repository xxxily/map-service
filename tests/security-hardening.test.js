import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import express from 'express'
import serviceConfig from '../service/config.js'
import { createCorsOptions, isOriginAllowed, parseCorsRule } from '../service/cors.conf.js'
import commonMethods from '../service/bin/middleware/commonMethods/index.js'
import service from '../service/bin/service.js'
import simpleApi from '../service/bin/simpleApi.js'
import helperUtils from '../service/bin/utils/helper.js'
import objectUtils from '../service/bin/utils/object.js'
import { InteractionDatabase } from '../service/bin/interaction/database.js'
import { InteractionService } from '../service/bin/interaction/interactionService.js'
import { endpointInfo } from '../service/bin/interaction/providerRegistry.js'
import { normalizeKmlResourceCollectionRef } from '../shared/kml-resource-collection.js'

const TEST_SECRET = '0123456789abcdef0123456789abcdef'

test('CORS whitelist enforces strict hostname matching and drops invalid domain entries', () => {
  assert.deepEqual(serviceConfig.staticService.corsWhitelist, ['do1.com.cn'])
  assert.equal(isOriginAllowed('', ['do1.com.cn']), true)
  assert.equal(isOriginAllowed('https://do1.com.cn', ['do1.com.cn']), true)
  assert.equal(isOriginAllowed('https://sub.do1.com.cn', ['do1.com.cn']), true)
  assert.equal(isOriginAllowed('https://evil-do1.com.cn', ['do1.com.cn']), false)
  assert.equal(isOriginAllowed('https://evil.example/do1.com.cn', ['do1.com.cn']), false)
  assert.equal(isOriginAllowed('ftp://do1.com.cn', ['do1.com.cn']), false)
  assert.equal(isOriginAllowed('not a url', ['do1.com.cn']), false)
  assert.equal(parseCorsRule('https://app.example.com:8443').exactOrigin, true)
  assert.equal(isOriginAllowed('https://sub.app.example.com:8443', ['https://app.example.com:8443']), false)
  assert.equal(isOriginAllowed('https://app.example.com:8443', ['https://app.example.com:8443']), true)

  const corsOptions = createCorsOptions(['do1.com.cn'])
  corsOptions.origin('https://evil-do1.com.cn', (err, allowed) => {
    assert.ok(err instanceof Error)
    assert.equal(allowed, undefined)
  })
  corsOptions.origin('https://sub.do1.com.cn', (err, allowed) => {
    assert.equal(err, null)
    assert.equal(allowed, true)
  })
})

test('resource collection and AI endpoint SSRF guards reject IPv4-compatible and reserved IPv6 addresses', () => {
  for (const host of [
    '[::7f00:1]',
    '[::127.0.0.1]',
    '[0:0:0:0:0:0:7f00:1]',
    '[::ffff:0:7f00:1]',
    '[64:ff9b::7f00:1]',
    '[fec0::1]',
    '[fe80::1]',
    '[100::1]',
    '[2001:db8::1]',
    '[2002::1]',
  ]) {
    assert.throws(
      () => normalizeKmlResourceCollectionRef({ sourceType: 'external', dataUrl: `https://${host}/rc.json` }),
      /内网主机/,
      `expected resource collection guard to reject ${host}`,
    )
    assert.throws(
      () => endpointInfo(`https://${host}/v1/chat/completions`, [host.replace(/^\[|\]$/g, '').split('%')[0]]),
      /本地或内网地址/,
      `expected AI endpointInfo to reject ${host}`,
    )
  }

  assert.throws(
    () => normalizeKmlResourceCollectionRef({ sourceType: 'external', dataUrl: 'https://[fe80::1%25eth0]/rc.json' }),
    /有效地址/,
  )
  assert.throws(
    () => endpointInfo('https://[fe80::1%25eth0]/v1/chat/completions', ['fe80::1']),
    /不合法/,
  )

  assert.equal(
    normalizeKmlResourceCollectionRef({
      sourceType: 'external',
      dataUrl: 'https://[2001:4860:4860::8888]/rc.json',
    }).dataUrl,
    'https://[2001:4860:4860::8888]/rc.json',
  )
})

test('configureAiProviderForAdmin ignores client-supplied allowHosts and internal override fields', () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  const providerAdapters = {
    test: {
      create: () => ({
        request: async () => ({ ok: true }),
        healthCheck: async () => true,
      }),
    },
  }
  const interaction = new InteractionService({
    userContent: { insertAudit: () => {} },
    config: { secretEncryptionKey: TEST_SECRET, ai: { allowHosts: ['ai.example.test'] } },
    database,
    providerAdapters,
    now: () => '2026-11-13T12:00:00.000Z',
  })

  try {
    assert.throws(
      () => interaction.configureAiProviderForAdmin({ user: { id: 'usr_admin' } }, {
        id: 'ssrf-attempt',
        endpoint: 'https://attacker.example/v1',
        allowHosts: ['attacker.example'],
        adapterId: 'test',
        secretRef: 'vault://ai/test',
      }),
      /allowlist/u,
    )

    interaction.configureAiProviderForAdmin({ user: { id: 'usr_admin' } }, {
      id: 'valid-provider',
      endpoint: 'https://ai.example.test/v1',
      adapterId: 'test',
      secretRef: 'vault://ai/test',
      healthStatus: 'verified',
      lastVerifiedAt: '2026-11-13T12:00:00.000Z',
      trustedFunction: true,
    })
    const registered = interaction.aiRegistry.get('valid-provider')
    assert.equal(registered.healthStatus, 'unknown')
    assert.equal(registered.enabled, false)
    assert.equal(registered.trustedFunction, false)
  } finally {
    database.close()
  }
})

test('GET /api/v1/routes and /api/v1/openapi.json require admin overview permission', async () => {
  Object.keys(simpleApi.routeSet).forEach(key => delete simpleApi.routeSet[key])
  const app = express()
  app.use(commonMethods)
  app.use(express.json())
  simpleApi.routeController(app, simpleApi.configList, simpleApi.basePath)

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
  })
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const originalVerify = service.verifyUserSession
  const originalRefresh = service.refreshUserSession

  try {
    service.verifyUserSession = () => null
    service.refreshUserSession = () => null

    for (const pathname of ['/api/v1/routes', '/api/v1/openapi.json']) {
      const res = await fetch(`${baseUrl}${pathname}`)
      const payload = await res.json()
      assert.equal(res.status, 401)
      assert.equal(payload.error?.code, 'AUTH_REQUIRED')
    }

    service.verifyUserSession = () => ({
      id: 'ses_regular',
      csrfHash: 'csrf',
      user: { id: 'usr_1', roles: ['user'], permissions: ['kml.own.read'] },
    })

    for (const pathname of ['/api/v1/routes', '/api/v1/openapi.json']) {
      const res = await fetch(`${baseUrl}${pathname}`, {
        headers: { Cookie: 'map_user_session=regular-token' },
      })
      const payload = await res.json()
      assert.equal(res.status, 403)
      assert.equal(payload.error?.code, 'PERMISSION_DENIED')
    }

    service.verifyUserSession = () => ({
      id: 'ses_admin',
      csrfHash: 'csrf',
      user: { id: 'usr_admin', roles: ['admin'], permissions: ['admin.overview.read'] },
    })

    const routesRes = await fetch(`${baseUrl}/api/v1/routes`, {
      headers: { Cookie: 'map_user_session=admin-token' },
    })
    const routesPayload = await routesRes.json()
    assert.equal(routesRes.status, 200)
    assert.equal(routesPayload.code, 0)
    assert.ok(Array.isArray(routesPayload.result))
    assert.ok(routesPayload.result.length > 0)

    const openApiRes = await fetch(`${baseUrl}/api/v1/openapi.json`, {
      headers: { Cookie: 'map_user_session=admin-token' },
    })
    const openApiPayload = await openApiRes.json()
    assert.equal(openApiRes.status, 200)
    assert.equal(openApiPayload.result?.openapi, '3.1.0')
  } finally {
    service.verifyUserSession = originalVerify
    service.refreshUserSession = originalRefresh
    await new Promise(resolve => server.close(resolve))
  }
})

test('legacy helper stringifyParams and object mergeObj block invalid types and prototype pollution', () => {
  assert.equal(helperUtils.stringifyParams('not-an-object'), '')
  assert.equal(helperUtils.stringifyParams(null), '')
  assert.equal(helperUtils.stringifyParams(['a']), '')
  assert.equal(helperUtils.stringifyParams({ a: 1, b: [2, 3], c: '' }), 'a=1&b=2,3')

  const malicious = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted2":"yes"}},"safe":42}')
  const merged = objectUtils.mergeObj({ nested: { keep: true } }, malicious)
  assert.equal(merged.safe, 42)
  assert.equal(({}).polluted, undefined)
  assert.equal(({}).polluted2, undefined)

  const cloned = objectUtils.clone(malicious)
  assert.equal(cloned.safe, 42)
  assert.equal(({}).polluted, undefined)
  assert.equal(objectUtils.clone(null), null)
})

test('service worker isolates shell cache keys and skips error, 206, and dynamic share navigation responses', async () => {
  const swSource = fs.readFileSync(path.resolve('public/sw.js'), 'utf8')
  const listeners = {}
  const stored = new Map()
  const fetchQueue = []

  const cacheObj = {
    async addAll () {},
    async put (key, res) {
      const k = typeof key === 'string' ? key : key.url
      stored.set(k, res)
    },
  }
  const sandbox = {
    URL,
    caches: {
      async open () { return cacheObj },
      async keys () { return [] },
      async delete () {},
      async match (key) {
        const k = typeof key === 'string' ? key : key.url
        return stored.get(k) || null
      },
    },
    fetch: async () => {
      const next = fetchQueue.shift()
      if (next instanceof Error) throw next
      return next
    },
    self: {
      location: { origin: 'https://example.com' },
      addEventListener (type, fn) { listeners[type] = fn },
      async skipWaiting () {},
      clients: { async claim () {} },
    },
  }
  vm.runInNewContext(swSource, sandbox)

  const runFetch = (url, { mode = 'cors', method = 'GET', headers = new Map() } = {}) => new Promise((resolve) => {
    let responsePromise = null
    listeners.fetch({
      request: { url, mode, method, headers },
      respondWith (p) { responsePromise = p },
    })
    if (!responsePromise) return resolve(null)
    Promise.resolve(responsePromise).then(resolve)
  })
  const makeResponse = (body, { status = 200, type = 'basic' } = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    type,
    body,
    clone () { return makeResponse(body, { status, type }) },
  })

  await stored.set('/offline.html', makeResponse('offline'))
  fetchQueue.push(makeResponse('home-ok'))
  await runFetch('https://example.com/', { mode: 'navigate' })
  assert.equal(stored.get('/')?.body, 'home-ok')

  fetchQueue.push(makeResponse('3d-ok'))
  await runFetch('https://example.com/3d', { mode: 'navigate' })
  assert.equal(stored.get('/')?.body, 'home-ok')
  assert.equal(stored.get('/3d')?.body, '3d-ok')

  fetchQueue.push(makeResponse('home-500', { status: 500 }))
  await runFetch('https://example.com/', { mode: 'navigate' })
  assert.equal(stored.get('/')?.body, 'home-ok')

  fetchQueue.push(makeResponse('share-3d', { status: 200 }))
  await runFetch('https://example.com/3d?share=pub_1', { mode: 'navigate' })
  assert.equal(stored.get('/3d')?.body, '3d-ok')

  fetchQueue.push(new Error('offline'))
  const offlineShare = await runFetch('https://example.com/share/pub_1', { mode: 'navigate' })
  assert.equal(offlineShare?.body, 'offline')

  fetchQueue.push(makeResponse('partial', { status: 206 }))
  await runFetch('https://example.com/location-keepalive.mp4', { mode: 'no-cors' })
  assert.equal(stored.has('https://example.com/location-keepalive.mp4'), false)

  fetchQueue.push(makeResponse('ranged', { status: 200 }))
  const rangeRes = await runFetch('https://example.com/location-keepalive.mp4', {
    mode: 'no-cors',
    headers: new Map([['range', 'bytes=0-10']]),
  })
  assert.equal(rangeRes, null)
})

test('service/index.js registers /3d before static middleware, disables HTML immutable caching, and bounds 2bulu helper JSON', () => {
  const indexSource = fs.readFileSync(path.resolve('service/index.js'), 'utf8')
  const staticIndex = indexSource.indexOf("app.use('/', express.static(serviceConfig.appDir, appOptions))")
  const threeDIndex = indexSource.indexOf("app.get('/3d'")
  assert.ok(threeDIndex > 0 && threeDIndex < staticIndex)
  assert.match(indexSource, /extname\(filePath\)\.toLowerCase\(\) === '\.html'/)
  assert.match(indexSource, /app\.use\('\/api\/v1\/kml\/import\/2bulu\/browser-helper',\s*express\.json\(\{\s*limit:\s*'16mb'\s*\}\)\)/)
  const kmlTransportBlock = indexSource.slice(indexSource.indexOf("'/api/v1/kml/files'"), indexSource.indexOf('express.json({ limit: kmlJsonTransportMaxBytes() })'))
  assert.equal(kmlTransportBlock.includes('2bulu/browser-helper'), false)
})
