import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import fs from 'fs-extra'
import path from 'path'
import { tmpdir } from 'node:os'
import createAdminAuth from '../service/bin/admin/auth.js'
import AdminStore from '../service/bin/admin/store.js'
import AdminSettings, { getAccessHash } from '../service/bin/admin/settings.js'
import { createTilePlan, generateTiles, PrecacheManager } from '../service/bin/admin/precache.js'
import { getTileProviderByUrl, listTileProviders } from '../service/bin/admin/tileProviders.js'
import { getVisitStats } from '../service/bin/admin/visitStats.js'
import FetchRelay from '../service/bin/middleware/fetchRelay/index.js'

function tempDir (name) {
  return path.join(tmpdir(), `map-service-${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
}

test('admin auth creates expiring bearer tokens and rejects bad credentials', async () => {
  const auth = createAdminAuth({
    username: 'operator',
    password: 'secret',
    tokenSecret: 'test-secret',
    tokenTtl: 1000,
  })

  await assert.rejects(() => auth.login({ username: 'operator', password: 'bad' }), /用户名或密码不正确/)

  const login = await auth.login({ username: 'operator', password: 'secret' })
  assert.equal(login.tokenType, 'Bearer')
  assert.equal(login.user.username, 'operator')

  const session = auth.verifyToken(login.token)
  assert.equal(session.username, 'operator')
  assert.ok(session.expiresAt > Date.now())
  assert.equal(auth.verifyToken(`${login.token}x`), null)
})

test('admin auth supports custom store and password updates', async () => {
  const dataDir = tempDir('admin-auth-update')
  const store = new AdminStore({ dataDir })
  const auth = createAdminAuth({
    username: 'operator',
    password: 'initial-password',
    tokenSecret: 'test-secret',
  }, store)

  try {
    // 初始密码登录
    const login1 = await auth.login({ username: 'operator', password: 'initial-password' })
    assert.equal(login1.user.username, 'operator')

    // 错误当前密码修改失败
    await assert.rejects(() => auth.updatePassword('wrong-password', 'new-password'), /当前密码不正确/)

    // 密码太短修改失败
    await assert.rejects(() => auth.updatePassword('initial-password', '123'), /新密码长度至少为 4 位/)

    // 正确修改密码
    const res = await auth.updatePassword('initial-password', 'new-password')
    assert.equal(res.status, 'ok')

    // 新密码登录成功
    const login2 = await auth.login({ username: 'operator', password: 'new-password' })
    assert.equal(login2.user.username, 'operator')

    // 旧密码登录失败
    await assert.rejects(() => auth.login({ username: 'operator', password: 'initial-password' }), /用户名或密码不正确/)
  } finally {
    await fs.remove(dataDir)
  }
})

test('admin settings persist proxy config and sanitize password', async () => {
  const dataDir = tempDir('admin-settings')
  const store = new AdminStore({ dataDir })
  const settings = new AdminSettings(store, {
    proxy: {
      enabled: false,
      protocol: 'http',
      host: '127.0.0.1',
      port: 10809,
      username: '',
      password: '',
    },
  })

  try {
    const sanitized = await settings.update({
      proxy: {
        enabled: true,
        protocol: 'http',
        host: '10.0.0.2',
        port: 7890,
        username: 'proxy-user',
        password: 'proxy-pass',
      },
    })

    assert.equal(sanitized.proxy.enabled, true)
    assert.equal(sanitized.proxy.host, '10.0.0.2')
    assert.equal(sanitized.proxy.hasPassword, true)
    assert.equal(Object.hasOwn(sanitized.proxy, 'password'), false)

    const raw = await settings.readRaw()
    assert.equal(raw.proxy.password, 'proxy-pass')

    const googleProxy = await settings.getProxyForRequest({ providerId: 'google-satellite' })
    const amapProxy = await settings.getProxyForRequest({ providerId: 'amap-road' })
    assert.equal(googleProxy.enabled, false)
    assert.equal(amapProxy.enabled, false)
  } finally {
    await fs.remove(dataDir)
  }
})

test('admin settings support provider-level proxy policy', async () => {
  const dataDir = tempDir('admin-provider-proxy')
  const store = new AdminStore({ dataDir })
  const settings = new AdminSettings(store, {
    proxy: {
      enabled: true,
      protocol: 'http',
      host: '127.0.0.1',
      port: 10809,
      username: '',
      password: '',
      providerPolicy: {
        'amap-road': false,
        'google-satellite': true,
      },
    },
  })

  try {
    const googleProxy = await settings.getProxyForRequest({ providerId: 'google-satellite' })
    const amapProxy = await settings.getProxyForRequest({ providerId: 'amap-road' })
    const forcedProxy = await settings.getProxyForRequest({ providerId: 'amap-road', forceProxy: true })

    assert.equal(googleProxy.enabled, true)
    assert.equal(amapProxy.enabled, false)
    assert.equal(forcedProxy.enabled, true)

    const sanitized = await settings.update({
      proxy: {
        providerPolicy: {
          'amap-road': true,
        },
      },
    })
    assert.equal(sanitized.proxy.providerPolicy['amap-road'], true)
    assert.equal(sanitized.proxy.providerPolicy['google-satellite'], true)
  } finally {
    await fs.remove(dataDir)
  }
})

test('admin settings default proxy policy targets google layers', async () => {
  const dataDir = tempDir('admin-default-provider-proxy')
  const store = new AdminStore({ dataDir })
  const settings = new AdminSettings(store, {
    proxy: {
      enabled: true,
      protocol: 'http',
      host: '127.0.0.1',
      port: 10809,
      username: '',
      password: '',
      providerPolicy: {
        'amap-satellite': false,
        'amap-road': false,
        'google-satellite': true,
        'google-street': true,
      },
    },
  })

  try {
    assert.equal((await settings.getProxyForRequest({ providerId: 'google-satellite' })).enabled, true)
    assert.equal((await settings.getProxyForRequest({ providerId: 'google-street' })).enabled, true)
    assert.equal((await settings.getProxyForRequest({ providerId: 'amap-road' })).enabled, false)
  } finally {
    await fs.remove(dataDir)
  }
})


test('tile provider catalog exposes layer config and detects providers by url', () => {
  const providers = listTileProviders()
  const google = providers.find(provider => provider.id === 'google-satellite')
  const amap = providers.find(provider => provider.id === 'amap-road')

  assert.equal(Boolean(google.template), true)
  assert.equal(google.proxyDefault, true)
  assert.equal(amap.proxyDefault, false)
  assert.equal(getTileProviderByUrl('https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x=1&y=2&z=3')?.id, 'google-satellite')
  assert.equal(getTileProviderByUrl('https://webst01.is.autonavi.com/appmaptile?style=8&x=1&y=2&z=3')?.id, 'amap-road')
  assert.equal(getTileProviderByUrl('https://webst04.is.autonavi.com/appmaptile?style=8&x=1&y=2&z=3')?.id, 'amap-road')
})

test('fetch relay forwards configured proxy to upstream request', async () => {
  const cacheDir = tempDir('fetch-relay-proxy')
  const calls = []
  const relay = new FetchRelay({
    cacheDir,
    minCacheBytes: 1,
    httpClient: async (config) => {
      calls.push(config)
      return {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
        data: Readable.from([Buffer.from('tile')]),
      }
    },
  })

  try {
    const result = await relay.fetch('https://www.google.com/maps/vt?lyrs=s&x=1&y=2&z=3', {
      proxy: {
        enabled: true,
        protocol: 'http',
        host: '127.0.0.1',
        port: 7890,
        username: 'u',
        password: 'p',
      },
    })
    for await (const chunk of result.stream) {
      void chunk
    }

    assert.deepEqual(calls[0].proxy, {
      host: '127.0.0.1',
      port: 7890,
      protocol: 'http',
      auth: {
        username: 'u',
        password: 'p',
      },
    })
  } finally {
    await fs.remove(cacheDir)
  }
})

test('fetch relay keeps default proxy behavior for useProxy option', async () => {
  const cacheDir = tempDir('fetch-relay-default-proxy')
  const calls = []
  const relay = new FetchRelay({
    cacheDir,
    minCacheBytes: 1,
    httpClient: async (config) => {
      calls.push(config)
      return {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
        data: Readable.from([Buffer.from('tile')]),
      }
    },
  })

  try {
    const result = await relay.fetch('https://www.google.com/maps/vt?lyrs=s&x=2&y=3&z=4', {
      useProxy: true,
    })
    for await (const chunk of result.stream) {
      void chunk
    }

    assert.deepEqual(calls[0].proxy, {
      host: '127.0.0.1',
      port: 10809,
      protocol: 'http',
    })
  } finally {
    await fs.remove(cacheDir)
  }
})

test('precache tile plan expands bounds and enforces max tile count', () => {
  const plan = createTilePlan({
    providerId: 'amap-road',
    bounds: {
      west: 113.24,
      south: 23.11,
      east: 113.29,
      north: 23.15,
    },
    minZoom: 12,
    maxZoom: 12,
  }, {
    maxTiles: 100,
  })

  assert.equal(plan.providerId, 'amap-road')
  assert.equal(plan.total, generateTiles(plan).length)
  assert.ok(plan.total > 0)

  assert.throws(() => createTilePlan({
    providerId: 'amap-road',
    bounds: {
      west: 113,
      south: 23,
      east: 114,
      north: 24,
    },
    minZoom: 3,
    maxZoom: 18,
  }, {
    maxTiles: 1,
  }), /超过上限/)
})

test('precache manager persists and completes queued tasks', async () => {
  const dataDir = tempDir('precache-manager')
  const store = new AdminStore({ dataDir })
  const fetchedCalls = []
  const manager = new PrecacheManager({
    store,
    maxTiles: 20,
    defaultConcurrency: 2,
    maxConcurrency: 4,
    fetchTile: async (url, options) => {
      fetchedCalls.push({ url, options })
      return {
        stream: Readable.from([Buffer.from('tile')]),
      }
    },
  })

  try {
    const task = await manager.createTask({
      providerId: 'amap-road',
      bounds: {
        west: 113.24,
        south: 23.11,
        east: 113.29,
        north: 23.15,
      },
      minZoom: 3,
      maxZoom: 3,
      concurrency: 2,
    })
    await manager.queue

    const tasks = await manager.listTasks()
    assert.equal(tasks[0].id, task.id)
    assert.equal(tasks[0].status, 'completed')
    assert.equal(tasks[0].failed, 0)
    assert.equal(tasks[0].succeeded, tasks[0].total)
    assert.equal(fetchedCalls.length, tasks[0].total)
    assert.equal(fetchedCalls[0].options.providerId, 'amap-road')

    await assert.rejects(() => manager.createTask({
      providerId: 'amap-road',
      bounds: {
        west: 113.24,
        south: 23.11,
        east: 113.29,
        north: 23.15,
      },
      minZoom: 3,
      maxZoom: 3,
      concurrency: 'fast',
    }), /并发数 必须是整数/)
  } finally {
    await fs.remove(dataDir)
  }
})


test('visit stats parses morgan access logs without failing on invalid lines', async () => {
  const logDir = tempDir('visit-stats')
  await fs.ensureDir(logDir)
  await fs.writeFile(path.join(logDir, 'access.log'), [
    'invalid',
    '127.0.0.1 - - [2026/6/17 12:00:00] "GET /api/v1/health HTTP/1.1" 200 42 "-" "node"',
    '127.0.0.1 - - [2026/6/17 12:01:00] "DELETE /api/v1/admin/cache HTTP/1.1" 401 88 "-" "browser"',
  ].join('\n'))

  try {
    const stats = await getVisitStats({ logDir })
    assert.equal(stats.total, 2)
    assert.equal(stats.statusCodes['200'], 1)
    assert.equal(stats.statusCodes['401'], 1)
    assert.equal(stats.topPaths[0].path, '/api/v1/health')
  } finally {
    await fs.remove(logDir)
  }
})

test('admin settings support access control settings and verification', async () => {
  const dataDir = tempDir('admin-access-control')
  const store = new AdminStore({ dataDir })
  const settings = new AdminSettings(store)

  try {
    // 默认不开启密码
    assert.equal(await settings.isAccessEnabled(), false)
    assert.equal(await settings.verifyAccess('invalid_token'), true)

    // 启用访问控制
    const sanitized = await settings.update({
      access: {
        enabled: true,
        password: 'my_access_password',
      },
    })
    
    assert.equal(sanitized.access.enabled, true)
    assert.equal(sanitized.access.hasPassword, true)
    assert.equal(await settings.isAccessEnabled(), true)
    
    // 验证校验逻辑
    assert.equal(await settings.checkPassword('my_access_password'), true)
    assert.equal(await settings.checkPassword('wrong_password'), false)

    // 生成 token 并验证
    const expectedHash = getAccessHash('my_access_password')
    assert.equal(await settings.verifyAccess(expectedHash), true)
    assert.equal(await settings.verifyAccess('wrong_token'), false)
  } finally {
    await fs.remove(dataDir)
  }
})
