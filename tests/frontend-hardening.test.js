import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { amapConfig } from '../src/config.js'
import { handleUserSystemSettingsSubmit } from '../src/admin/pages/userSystemSettings.js'

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('前端高德配置优先读取环境变量并保留受控默认值', () => {
  const source = readSource('../src/config.js')
  assert.match(source, /import\.meta\.env\.VITE_AMAP_KEY/)
  assert.match(source, /import\.meta\.env\.VITE_AMAP_SECURITY_JS_CODE/)
  assert.equal(typeof amapConfig.key, 'string')
  assert.ok(amapConfig.key.length > 0)
  assert.equal(typeof amapConfig.securityJsCode, 'string')
  assert.ok(amapConfig.securityJsCode.length > 0)

  const amapBlock = source.match(/export const amapConfig = \{[\s\S]*?\}/)?.[0]
  assert.ok(amapBlock)

  const evalWithEnv = (env) => {
    const code = 'const hasViteEnv = typeof __env__ === "object" && __env__ !== null;\n' +
      amapBlock
        .replace('export const amapConfig =', 'const amapConfig =')
        .replaceAll('import.meta.env', '__env__') + '\n; amapConfig'
    return vm.runInNewContext(code, { __env__: env })
  }

  const fallbackConfig = evalWithEnv({})
  assert.equal(fallbackConfig.key, amapConfig.key)
  assert.equal(fallbackConfig.securityJsCode, amapConfig.securityJsCode)

  const overrideConfig = evalWithEnv({
    VITE_AMAP_KEY: 'env-key',
    VITE_AMAP_SECURITY_JS_CODE: 'env-sec',
  })
  assert.equal(overrideConfig.key, 'env-key')
  assert.equal(overrideConfig.securityJsCode, 'env-sec')
})

test('用户系统设置提交严格校验 spatialPaddingMeters 为大于等于 0 的有限数字', async () => {
  const originalFormData = globalThis.FormData
  let apiCalls = 0
  let lastErrorNotice = ''
  let rendered = 0

  class MockFormData {
    constructor (form) {
      this.values = form.values || {}
    }

    get (key) {
      return this.values[key] ?? null
    }
  }

  globalThis.FormData = MockFormData
  try {
    for (const invalidPadding of ['-1', 'abc']) {
      lastErrorNotice = ''
      const fakeForm = {
        values: {
          publicAccessPolicy: 'inherit_site_access',
          passwordlessSharingEnabled: 'false',
          kmlClusterForceEnabled: 'false',
          kmlClusterMaxZoom: '12',
          kmlClusterMinPoints: '10',
          maxFilesPerShare: '20',
          spatialAccessEnabled: 'true',
          spatialPaddingMeters: invalidPadding,
          spatialMaxAreaKm2: '50',
          spatialMaxDiagonalKm: '20',
          spatialUnrestrictedTileMaxZoom: '12',
          unlimitedAccessEnabled: 'false',
          unlimitedAccessMaxAreaKm2: '0',
          unlimitedAccessMaxDiagonalKm: '0',
        },
      }
      const handled = await handleUserSystemSettingsSubmit({
        api: {
          previewUserSystemSettings: async () => {
            apiCalls += 1
            return {}
          },
          updateUserSystemSettings: async () => {
            apiCalls += 1
            return {}
          },
        },
        event: {
          preventDefault () {},
          target: {
            closest (selector) {
              return selector === '[data-admin-user-share-settings]' ? fakeForm : null
            },
          },
        },
        renderDashboard: () => {
          rendered += 1
        },
        setNotice: (_ok, error) => {
          lastErrorNotice = error || ''
        },
        showConfirm: async () => true,
        state: {
          session: { authenticated: true, user: { permissions: ['system.super_admin'] } },
          userSystemSettings: { share: {} },
        },
      })
      assert.equal(handled, true)
      assert.ok(lastErrorNotice.length > 0, `期望 ${invalidPadding} 触发校验错误提示`)
    }
    assert.equal(apiCalls, 0)
    assert.equal(rendered, 2)
  } finally {
    globalThis.FormData = originalFormData
  }
})

test('未认证会话不会触发预缓存任务后台轮询', async () => {
  let taskRequests = 0
  let scheduleCalls = 0
  let scheduledCallback = null
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  globalThis.window = {
    screen: {},
    setTimeout: (fn) => {
      scheduleCalls += 1
      scheduledCallback = fn
      return scheduleCalls
    },
    clearTimeout: () => {},
  }
  globalThis.document = {
    documentElement: { style: {} },
    createElement: () => ({ style: {}, getContext: () => null }),
  }
  try {
    const { schedulePrecacheTaskRefresh } = await import('../src/admin/pages/precache.js')
    const state = {
      activeTab: 'precache',
      session: { authenticated: false },
      tasks: [{ id: 't1', status: 'running' }],
    }
    const api = {
      tasks: async () => {
        taskRequests += 1
        return []
      },
    }
    schedulePrecacheTaskRefresh(state, api, 1000)
    assert.equal(scheduleCalls, 0)

    // 先在已认证状态排入定时器，触发前会话失效时不应再请求 tasks
    state.session.authenticated = true
    schedulePrecacheTaskRefresh(state, api, 1000)
    assert.equal(scheduleCalls, 1)
    assert.equal(typeof scheduledCallback, 'function')
    state.session.authenticated = false
    await scheduledCallback()
    assert.equal(taskRequests, 0)
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})

test('管理端入口与页面模块补全异常兜底和空查找保护', () => {
  const mainSource = readSource('../src/main.js')
  const page3dSource = readSource('../src/3d.js')
  const cacheSource = readSource('../src/admin/pages/cache.js')
  const interactionSource = readSource('../src/admin/pages/interaction.js')
  const proxySource = readSource('../src/admin/pages/proxy.js')
  const tileSourcesSource = readSource('../src/admin/pages/tileSources.js')

  assert.match(mainSource, /import\(['"]\.\/account\/app\.js['"]\)[\s\S]{0,120}\.catch\(/)
  assert.match(mainSource, /import\(['"]\.\/admin\/dashboard\.js['"]\)[\s\S]{0,120}\.catch\(/)
  assert.match(page3dSource, /import\(['"]\.\/admin\/dashboard\.js['"]\)[\s\S]{0,120}\.catch\(/)
  assert.match(cacheSource, /!context\?\.state\?\.session\?\.authenticated/)
  assert.match(interactionSource, /筛选加载失败/)
  assert.match(proxySource, /未找到指定的代理出口/)
  assert.match(proxySource, /未找到指定的代理池/)
  assert.doesNotMatch(proxySource, /querySelector\(`\[name="pool_/)
  assert.match(tileSourcesSource, /未找到指定的图层组合/)
  assert.match(tileSourcesSource, /未找到指定的对外发布项/)
})

test('2D/3D 地图交互、辅助线、定位波纹与 KML 导入具备防泄漏与大小保护', () => {
  const g2d = readSource('../src/map/guidelines.js')
  const g3d = readSource('../src/map3d/guidelines.js')
  const loc2d = readSource('../src/map/location.js')
  const loc3d = readSource('../src/map3d/location.js')
  const kml2d = readSource('../src/map/kml.js')
  const kml3d = readSource('../src/map3d/kml.js')
  const layers = readSource('../src/map/layers.js')

  assert.match(g2d, /isEditableKeyboardTarget/)
  assert.match(g2d, /map\.on\('unload'/)
  assert.match(g3d, /isEditableKeyboardTarget/)
  assert.match(g3d, /requestAnimationFrame\(renderPreviewFrame\)/)
  assert.match(loc2d, /rippleMarker\._isLocationRipple\s*=\s*true/)
  assert.match(loc2d, /clearActiveRipples2d\(map\)/)
  assert.match(loc2d, /locationHistoryBound/)
  assert.match(loc3d, /activeRippleEffects3d/)
  assert.match(loc3d, /clearActiveRipples3d\(viewer\)/)
  assert.match(loc3d, /Math\.sin\(phase \* Math\.PI \* 2\)/)
  assert.match(kml2d, /MAX_KML_UPLOAD_BYTES\s*=\s*50 \* 1024 \* 1024/)
  assert.match(kml2d, /刷新公共图层失败/)
  assert.match(kml3d, /MAX_KML_UPLOAD_BYTES\s*=\s*50 \* 1024 \* 1024/)
  assert.match(kml3d, /if \(!canWritePersonalKml\(\) && !isEditingPublicKml\) return/)
  assert.match(kml3d, /kmlKeyboardBound3d/)
  assert.equal((layers.match(/addEventListener\('click', handleScreenshotClick, true\)/g) || []).length, 1)
})
