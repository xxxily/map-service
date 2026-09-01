import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

import {
  buildTwoBuluHelperPing,
  finalizeTwoBuluImport,
  getTwoBuluHelperState,
  parseTwoBuluHelperResponse,
  probeTwoBuluHelper,
  requestTwoBuluBatchPreview,
  requestTwoBuluKml,
  TWO_BULU_HELPER_PROTOCOL_VERSION,
} from '../src/integrations/two-bulu-helper-bridge.js'
import {
  DEFAULT_ALLOWED_ORIGINS,
  isKmlText,
  normalizeAllowedOrigin,
  normalizeOfficialDownloadUrl,
  normalizeTwoBuluShareUrl,
  normalizeTwoBuluTrackListUrl,
  originMatchPattern,
} from '../extensions/two-bulu-helper/protocol.js'
import {
  IMPORT_SESSION_MAX_AGE_MS,
  canAutoCloseImportHelperTab,
  canControlImportHelperTab,
  canFinalizeImportTabSession,
  canUserCloseImportHelperTab,
  createImportTabSession,
  normalizeImportTabSessions,
  sanitizeImportFeedbackText,
} from '../extensions/two-bulu-helper/import-tab-session.js'
import { parseKmlText } from '../service/bin/user/userContent.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadTwoBuluDataApi () {
  const source = fs.readFileSync(path.join(projectRoot, 'extensions/two-bulu-helper/two-bulu-data.js'), 'utf8')
  const context = vm.createContext({ URL, TextEncoder })
  vm.runInContext(source, context)
  return context.MapServiceTwoBuluData
}

function loadTwoBuluPageExportApi (options = {}) {
  const dataSource = fs.readFileSync(path.join(projectRoot, 'extensions/two-bulu-helper/two-bulu-data.js'), 'utf8')
  const exportSource = fs.readFileSync(path.join(projectRoot, 'extensions/two-bulu-helper/two-bulu-page-export.js'), 'utf8')
  const document = options.document || {
    title: '测试轨迹 - 两步路',
    querySelector: () => null,
    documentElement: { localName: 'html' },
  }
  const context = vm.createContext({
    URL,
    TextEncoder,
    TextDecoder,
    Blob,
    document,
    location: new URL(options.url || 'https://www.2bulu.com/track/track_detail.htm?trackId=test'),
    performance: { getEntriesByType: () => options.resources || [] },
    fetch: options.fetch || (async () => ({ ok: false, url: '', text: async () => '' })),
    setTimeout,
    clearTimeout,
  })
  Object.assign(context, options.globals || {})
  vm.runInContext(dataSource, context)
  vm.runInContext(exportSource, context)
  return context.MapServiceTwoBuluPageExport
}

class TestCustomEvent extends Event {
  constructor (type, options = {}) {
    super(type)
    this.detail = options.detail
  }
}

test('浏览器助手协议规范化精确站点 origin、两步路分享 URL 和官方下载地址', () => {
  assert.deepEqual(DEFAULT_ALLOWED_ORIGINS, [
    'http://127.0.0.1:3088',
    'http://localhost:3088',
    'http://127.0.0.1:5174',
    'http://localhost:5174',
  ])
  assert.equal(normalizeAllowedOrigin('http://127.0.0.1:3088/'), 'http://127.0.0.1:3088')
  assert.equal(originMatchPattern('http://127.0.0.1:3088'), 'http://127.0.0.1/*')
  assert.throws(() => normalizeAllowedOrigin('https://map.example.com/account'), /不能包含路径/)

  const normalized = normalizeTwoBuluShareUrl('https://www.2bulu.com/track/t-OavTTmw9VMzp%252FR2KBg5Tzw%253D%253D.htm')
  assert.equal(normalized.trackId, 'OavTTmw9VMzp/R2KBg5Tzw==')
  assert.match(normalized.canonicalUrl, /^https:\/\/www\.2bulu\.com\/track\/track_detail\.htm\?trackId=/)
  assert.equal(
    normalizeOfficialDownloadUrl('/download/example.kml', normalized.canonicalUrl),
    'https://www.2bulu.com/download/example.kml',
  )
  assert.throws(() => normalizeOfficialDownloadUrl('https://evil.example/track.kml'), /不在允许范围/)
  assert.equal(isKmlText('<?xml version="1.0"?><kml><Document></Document></kml>'), true)
  assert.equal(
    normalizeTwoBuluTrackListUrl('https://www.2bulu.com/spaceindex/my_track.htm?userId=ytVzFDQq3DURcjFubZmtkA%3D%3D').userId,
    'ytVzFDQq3DURcjFubZmtkA==',
  )
  assert.throws(
    () => normalizeTwoBuluTrackListUrl('https://www.2bulu.com/spaceindex/my_track.htm?userId=bad%20id'),
    /有效 userId/,
  )
})

test('导入标签页会话只允许原发起页结束，并只自动关闭助手管理的安全页面', () => {
  const now = Date.now()
  const session = createImportTabSession({
    sessionId: 'import-session-one',
    sourceTab: { id: 11, windowId: 2, url: 'http://127.0.0.1:3088/' },
    helperTab: { id: 22, windowId: 2, url: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc' },
    canonicalUrl: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
    managedHelperTab: true,
    helperTabCreatedForRequest: true,
    now,
  })

  assert.equal(canFinalizeImportTabSession(session, { id: 11 }), true)
  assert.equal(canFinalizeImportTabSession(session, { id: 12 }), false)
  assert.equal(canControlImportHelperTab(session, { id: 22 }), true)
  assert.equal(canControlImportHelperTab(session, { id: 11 }), false)
  assert.equal(canAutoCloseImportHelperTab(session, {
    id: 22,
    pinned: false,
    url: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
  }), true)
  assert.equal(canAutoCloseImportHelperTab(session, {
    id: 22,
    pinned: true,
    url: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
  }), false)
  assert.equal(canUserCloseImportHelperTab(session, {
    id: 22,
    pinned: true,
    url: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
  }), true)
  assert.equal(canAutoCloseImportHelperTab(session, { id: 22, url: 'https://evil.example/' }), false)

  assert.deepEqual(normalizeImportTabSessions({ [session.sessionId]: session }, now + 1000), {
    [session.sessionId]: session,
  })
  assert.deepEqual(normalizeImportTabSessions({ [session.sessionId]: session }, now + IMPORT_SESSION_MAX_AGE_MS + 1), {})
  assert.equal(sanitizeImportFeedbackText('保存\n成功\u0000', 'fallback'), '保存 成功')
})

test('扩展完成回传后激活原页面并仅关闭受管临时标签页', async () => {
  const originalChrome = globalThis.chrome
  const sessionStore = {
    twoBuluHelperTabId: 22,
    twoBuluImportSessions: {
      'import-session-one': {
        sessionId: 'import-session-one',
        sourceTabId: 11,
        sourceWindowId: 2,
        helperTabId: 22,
        helperWindowId: 2,
        canonicalUrl: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
        managedHelperTab: true,
        helperTabCreatedForRequest: true,
        status: 'awaiting-save',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    },
  }
  const localStore = { allowedOrigins: ['http://127.0.0.1:3088'] }
  const tabs = new Map([
    [11, { id: 11, windowId: 2, url: 'http://127.0.0.1:3088/map', status: 'complete' }],
    [22, { id: 22, windowId: 2, url: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc', status: 'complete', pinned: false }],
  ])
  const calls = []
  const listeners = { updated: [], removed: [], messages: [] }
  const fakeChrome = {
    storage: {
      local: {
        get: async key => typeof key === 'string' ? { [key]: localStore[key] } : { ...localStore },
        set: async value => Object.assign(localStore, value),
      },
      session: {
        get: async key => typeof key === 'string' ? { [key]: sessionStore[key] } : { ...sessionStore },
        set: async value => Object.assign(sessionStore, value),
        remove: async key => { delete sessionStore[key] },
      },
      onChanged: { addListener: () => {} },
    },
    scripting: {
      getRegisteredContentScripts: async () => [],
      unregisterContentScripts: async () => {},
      registerContentScripts: async () => {},
    },
    permissions: { contains: async () => true },
    runtime: {
      getManifest: () => ({ version: '0.3.8' }),
      onMessage: { addListener: listener => listeners.messages.push(listener) },
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      openOptionsPage: async () => {},
      sendMessage: async () => ({}),
    },
    tabs: {
      get: async id => {
        const tab = tabs.get(Number(id))
        if (!tab) throw new Error('tab not found')
        return { ...tab }
      },
      update: async (id, changes) => {
        const tab = tabs.get(Number(id))
        if (!tab) throw new Error('tab not found')
        Object.assign(tab, changes)
        calls.push(['update', Number(id), { ...changes }])
        return { ...tab }
      },
      remove: async id => {
        calls.push(['remove', Number(id)])
        tabs.delete(Number(id))
      },
      sendMessage: async (id, message) => {
        calls.push(['sendMessage', Number(id), message])
        return { ok: true }
      },
      create: async options => {
        const tab = { id: 30, windowId: options.windowId || 2, url: options.url, status: 'complete' }
        tabs.set(tab.id, tab)
        return { ...tab }
      },
      onUpdated: { addListener: listener => listeners.updated.push(listener), removeListener: () => {} },
      onRemoved: { addListener: listener => listeners.removed.push(listener), removeListener: () => {} },
    },
    windows: { update: async (id, changes) => calls.push(['windowUpdate', id, changes]) },
    action: { onClicked: { addListener: () => {} } },
  }

  globalThis.chrome = fakeChrome
  try {
    const serviceWorker = await import(`../extensions/two-bulu-helper/service-worker.js?test=${Date.now()}`)
    const result = await serviceWorker.finalizeTwoBuluImport({
      importSessionId: 'import-session-one',
      status: 'success',
      message: '轨迹已导入',
    }, { tab: tabs.get(11) })
    assert.equal(result.ok, true)
    assert.equal(result.sourceTabActivated, true)
    assert.equal(result.helperTabClosed, true)
    assert.equal(tabs.has(22), false)
    assert.equal(sessionStore.twoBuluHelperTabId, undefined)
    assert.deepEqual(sessionStore.twoBuluImportSessions, {})
    assert.ok(calls.some(call => call[0] === 'sendMessage' && call[1] === 22 && call[2].status === 'success'))
    assert.ok(calls.some(call => call[0] === 'update' && call[1] === 11 && call[2].active === true))
    assert.ok(calls.some(call => call[0] === 'remove' && call[1] === 22))

    tabs.set(23, { id: 23, windowId: 2, url: 'https://www.2bulu.com/track/track_detail.htm?trackId=def', status: 'complete', pinned: false })
    sessionStore.twoBuluHelperTabId = 23
    sessionStore.twoBuluImportSessions = {
      'import-session-two': {
        ...sessionStore.twoBuluImportSessions['import-session-one'],
        sessionId: 'import-session-two',
        sourceTabId: 11,
        helperTabId: 23,
        canonicalUrl: 'https://www.2bulu.com/track/track_detail.htm?trackId=def',
        managedHelperTab: true,
        helperTabCreatedForRequest: false,
        status: 'awaiting-save',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    }
    const failed = await serviceWorker.finalizeTwoBuluImport({
      importSessionId: 'import-session-two',
      status: 'failed',
      message: '保存接口返回失败',
    }, { tab: tabs.get(11) })
    assert.equal(failed.ok, true)
    assert.equal(failed.helperTabClosed, false)
    assert.equal(tabs.has(23), true)
    assert.ok(calls.some(call => call[0] === 'sendMessage' && call[1] === 23 && call[2].status === 'failed'))

    tabs.set(24, { id: 24, windowId: 2, url: 'https://www.2bulu.com/track/track_detail.htm?trackId=ghi', status: 'complete', pinned: false })
    sessionStore.twoBuluImportSessions['import-session-three'] = {
      sessionId: 'import-session-three',
      sourceTabId: 11,
      sourceWindowId: 2,
      helperTabId: 24,
      helperWindowId: 2,
      canonicalUrl: 'https://www.2bulu.com/track/track_detail.htm?trackId=ghi',
      managedHelperTab: true,
      helperTabCreatedForRequest: true,
      status: 'awaiting-save',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    tabs.delete(11)
    const sourceMissing = await serviceWorker.finalizeTwoBuluImport({
      importSessionId: 'import-session-three',
      status: 'success',
      message: '轨迹已导入',
    }, { tab: { id: 11, url: 'http://127.0.0.1:3088/map' } })
    assert.equal(sourceMissing.ok, true)
    assert.equal(sourceMissing.sourceTabActivated, false)
    assert.equal(sourceMissing.helperTabClosed, false)
    assert.equal(tabs.has(24), true)
    assert.ok(calls.some(call => call[0] === 'sendMessage' && call[1] === 24 && call[2].canReturn === false))
  } finally {
    if (originalChrome === undefined) delete globalThis.chrome
    else globalThis.chrome = originalChrome
  }
})

test('网站只在收到兼容 PONG 后启用助手，并用同一 requestId 接收标准 KML', async () => {
  const originalCustomEvent = globalThis.CustomEvent
  globalThis.CustomEvent = TestCustomEvent
  const documentTarget = new EventTarget()
  const requests = []
  documentTarget.addEventListener('map-service:two-bulu-helper:request', (event) => {
    const request = JSON.parse(event.detail)
    requests.push(request)
    if (request.type === 'PING') {
      documentTarget.dispatchEvent(new TestCustomEvent('map-service:two-bulu-helper:response', {
        detail: JSON.stringify({
          protocolVersion: 1,
          type: 'PONG',
          requestId: request.requestId,
          helperVersion: '0.1.0',
          capabilities: ['2bulu-kml-import', '2bulu-import-tab-lifecycle'],
        }),
      }))
    } else if (request.type === 'IMPORT_2BULU_KML') {
      documentTarget.dispatchEvent(new TestCustomEvent('map-service:two-bulu-helper:response', {
        detail: JSON.stringify({
          protocolVersion: 1,
          type: 'IMPORT_RESULT',
          requestId: request.requestId,
          helperVersion: '0.1.0',
          status: 'success',
          importSessionId: 'import-session-one',
          tabLifecycle: 'created',
          sourceUrl: request.url,
          name: '测试路线',
          kmlText: '<kml><Document><Placemark><Point><coordinates>113,23</coordinates></Point></Placemark></Document></kml>',
        }),
      }))
    } else if (request.type === 'COMPLETE_2BULU_IMPORT') {
      documentTarget.dispatchEvent(new TestCustomEvent('map-service:two-bulu-helper:response', {
        detail: JSON.stringify({
          protocolVersion: 1,
          type: 'COMPLETE_RESULT',
          requestId: request.requestId,
          helperVersion: '0.1.0',
          ok: true,
          sourceTabActivated: true,
          helperTabClosed: true,
        }),
      }))
    }
  })

  try {
    const probed = await probeTwoBuluHelper({ document: documentTarget, force: true, timeoutMs: 200 })
    assert.equal(probed.available, true)
    assert.equal(getTwoBuluHelperState().helperVersion, '0.1.0')

    const result = await requestTwoBuluKml({
      url: 'https://www.2bulu.com/track/t-abc.htm',
      requestId: 'helper-request-one',
    }, { document: documentTarget, timeoutMs: 200 })
    assert.equal(result.name, '测试路线')
    assert.equal(result.importSessionId, 'import-session-one')
    assert.equal(result.tabLifecycle, 'created')
    assert.match(result.kmlText, /<Point>/)
    assert.match(requests.at(-1).requestId, /^operation-/)
    assert.notEqual(requests.at(-1).requestId, 'helper-request-one')
    assert.equal(requests.at(-1).url, 'https://www.2bulu.com/track/t-abc.htm')
    assert.equal(requests.at(-1).partialPolicy, 'reject')

    const completed = await finalizeTwoBuluImport(result, {
      status: 'success',
      message: '测试路线已导入',
    }, { document: documentTarget, timeoutMs: 200 })
    assert.equal(completed.ok, true)
    assert.equal(completed.sourceTabActivated, true)
    assert.equal(completed.helperTabClosed, true)
    assert.equal(requests.at(-1).type, 'COMPLETE_2BULU_IMPORT')
    assert.equal(requests.at(-1).importSessionId, 'import-session-one')
    assert.equal(requests.at(-1).status, 'success')
  } finally {
    if (originalCustomEvent === undefined) delete globalThis.CustomEvent
    else globalThis.CustomEvent = originalCustomEvent
  }
})

test('网站批量预览使用独立消息类型并保留列表元数据', async () => {
  const originalCustomEvent = globalThis.CustomEvent
  globalThis.CustomEvent = TestCustomEvent
  const documentTarget = new EventTarget()
  const requests = []
  documentTarget.addEventListener('map-service:two-bulu-helper:request', (event) => {
    const request = JSON.parse(event.detail)
    requests.push(request)
    if (request.type === 'PING') {
      documentTarget.dispatchEvent(new TestCustomEvent('map-service:two-bulu-helper:response', {
        detail: JSON.stringify({
          protocolVersion: 1,
          type: 'PONG',
          requestId: request.requestId,
          helperVersion: '0.4.0',
          capabilities: ['2bulu-kml-import', '2bulu-import-tab-lifecycle'],
        }),
      }))
    } else if (request.type === 'IMPORT_2BULU_BATCH') {
      documentTarget.dispatchEvent(new TestCustomEvent('map-service:two-bulu-helper:response', {
        detail: JSON.stringify({
          protocolVersion: 1,
          type: 'BATCH_PREVIEW_RESULT',
          requestId: request.requestId,
          status: 'success',
          sourceUrl: request.url,
          userName: '山友阿明',
          detectedCount: 1,
          items: [{ url: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc', name: '路线 A', pointCount: 12 }],
        }),
      }))
    }
  })

  try {
    const result = await requestTwoBuluBatchPreview({
      url: 'https://www.2bulu.com/spaceindex/my_track.htm?userId=user-1',
    }, { document: documentTarget, timeoutMs: 200 })
    assert.equal(result.userName, '山友阿明')
    assert.equal(result.detectedCount, 1)
    assert.equal(result.items[0].pointCount, 12)
    assert.equal(requests.at(-1).type, 'IMPORT_2BULU_BATCH')
  } finally {
    if (originalCustomEvent === undefined) delete globalThis.CustomEvent
    else globalThis.CustomEvent = originalCustomEvent
  }
})

test('助手探测消息和 Manifest 固定协议能力且不声明任意两步路凭据通道', () => {
  const ping = buildTwoBuluHelperPing('probe-request-one')
  assert.equal(ping.protocolVersion, TWO_BULU_HELPER_PROTOCOL_VERSION)
  assert.deepEqual(parseTwoBuluHelperResponse({
    protocolVersion: 1,
    type: 'PONG',
    requestId: 'probe-request-one',
  }, 'probe-request-one'), {
    protocolVersion: 1,
    type: 'PONG',
    requestId: 'probe-request-one',
  })

  const extensionDir = path.join(projectRoot, 'extensions/two-bulu-helper')
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'))
  const pageHookSource = fs.readFileSync(path.join(extensionDir, 'two-bulu-page-hook.js'), 'utf8')
  const sources = [
    'map-service-bridge.js',
    'import-tab-session.js',
    'two-bulu-data.js',
    'two-bulu-page-hook.js',
    'two-bulu-page-export.js',
    'two-bulu-list-export.js',
    'two-bulu-feedback.js',
    'two-bulu-content.js',
    'service-worker.js',
  ].map(file => fs.readFileSync(path.join(extensionDir, file), 'utf8')).join('\n')
  assert.equal(manifest.manifest_version, 3)
  assert.equal(manifest.version, '0.4.0')
  assert.deepEqual(manifest.icons, {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  })
  assert.deepEqual(manifest.action.default_icon, {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
  })
  for (const size of [16, 32, 48, 128]) {
    const iconPath = path.join(extensionDir, 'icons', `icon-${size}.png`)
    assert.ok(fs.existsSync(iconPath), `缺少 ${size}px 扩展图标`)
    const iconBuffer = fs.readFileSync(iconPath)
    assert.match(iconBuffer.subarray(0, 8).toString('hex'), /^89504e470d0a1a0a$/)
    assert.equal(iconBuffer.readUInt32BE(16), size)
    assert.equal(iconBuffer.readUInt32BE(20), size)
  }
  const twoBuluScripts = manifest.content_scripts.find(item => item.matches.includes('https://www.2bulu.com/*'))?.js
  assert.deepEqual(twoBuluScripts, ['two-bulu-page-hook.js'])
  const pageExportScripts = manifest.content_scripts.find(item => item.world === 'MAIN' && item.run_at === 'document_idle')
  assert.deepEqual(pageExportScripts?.js, ['two-bulu-data.js', 'two-bulu-page-export.js'])
  const collectorScripts = manifest.content_scripts.find(item => item.js.includes('two-bulu-content.js'))
  assert.deepEqual(collectorScripts?.js, ['two-bulu-feedback.js', 'two-bulu-data.js', 'two-bulu-content.js'])
  assert.deepEqual(manifest.permissions.sort(), ['scripting', 'storage', 'tabs'])
  assert.ok(manifest.host_permissions.every(value => /^https:\/\/(?:2bulu\.com|www\.2bulu\.com|app\.2bulu\.com|down-files\.2bulu\.com)\/\*$/.test(value)))
  assert.match(sources, /get_track_positions_list4\.htm/)
  assert.match(sources, /get_track_marker_list_new\.htm/)
  assert.match(sources, /chrome\.scripting\.executeScript/)
  assert.match(sources, /MapServiceTwoBuluPageExport\?\.collect/)
  assert.match(sources, /COMPLETE_2BULU_IMPORT/)
  assert.match(sources, /FINALIZE_2BULU_IMPORT/)
  assert.match(sources, /IMPORT_TAB_ACTION/)
  assert.match(sources, /openerTabId/)
  assert.match(sources, /chrome\.tabs\.remove/)
  assert.match(sources, /返回 map-service/)
  assert.match(sources, /__mapServiceTwoBuluCapturedResponses/)
  assert.match(sources, /decrypt:\s*true/)
  assert.match(sources, /responseType:\s*['"]arraybuffer['"]/)
  assert.doesNotMatch(pageHookSource, /globalThis\.fetch\s*=|XMLHttpRequest\.prototype/)
  assert.match(sources, /findMarkerList\?\.\(candidatePayload\)/)
  assert.match(sources, /if \(!markerResult\?\.found\) continue/)
  assert.doesNotMatch(sources, /document\.cookie/)
  assert.doesNotMatch(sources, /Authorization\s*:/i)
  assert.doesNotMatch(sources, /(?:window\.)?(?:alert|confirm|prompt)\s*\(/)
})

test('浏览器助手可将页面轨迹数组、标注点和安全媒体还原为标准 KML', () => {
  const api = loadTwoBuluDataApi()
  const result = api.convertTwoBuluRenderedData({
    title: '页面展示路线.kml',
    sourceUrl: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
    partialPolicy: 'reject',
    positionsPayload: {
      trackPositions: [
        [{ lng: 113.1, lat: 23.1, elev: 12 }, { lng: 113.2, lat: 23.2, elev: 18 }],
        [[114.1, 24.1, 30], [114.2, 24.2, 31]],
      ],
    },
    markersPayload: {
      data: [{
        longitude: 113.15,
        latitude: 23.15,
        text: '<script>危险</script>营地 & 水源',
        fileType: 0,
        centerUrl: 'https://down-files.2bulu.com/f/dn1?downParams=public-media',
        commnFileUrl: 'https://evil.example/private.jpg?token=secret',
      }],
    },
  })

  assert.equal(result.sourceMode, 'rendered-data')
  assert.equal(result.completeness, 'full')
  assert.equal(result.pointCount, 5)
  assert.match(result.kmlText, /<LineString>/)
  assert.match(result.kmlText, /downParams=public-media/)
  assert.doesNotMatch(result.kmlText, /evil\.example|token=secret|<script>/)

  const parsed = parseKmlText(result.kmlText)
  assert.equal(parsed.name, '页面展示路线')
  assert.deepEqual(parsed.features.map(item => item.type), ['LineString', 'LineString', 'Point'])
  assert.match(parsed.features.at(-1).name, /营地 & 水源$/)
  assert.match(parsed.features.at(-1).description, /<img/)
  assert.match(parsed.features.at(-1).description, /营地 &amp; 水源|营地 & 水源/)
})

test('轨迹解析器会合并嵌套对象中的全部独立线段并去重', () => {
  const api = loadTwoBuluDataApi()
  const first = [{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }]
  const second = [{ lng: 114.1, lat: 24.1 }, { lng: 114.2, lat: 24.2 }]
  const segments = api.findTrackSegments({
    data: {
      routes: [
        { trackPositions: first },
        { positions: second },
        { path: [...first].reverse() },
      ],
    },
  })

  assert.equal(segments.length, 2)
  assert.deepEqual(Array.from(segments[0], point => [point.lng, point.lat]), [[113.1, 23.1], [113.2, 23.2]])
  assert.deepEqual(Array.from(segments[1], point => [point.lng, point.lat]), [[114.1, 24.1], [114.2, 24.2]])
})

test('浏览器转换不会把仅标注点误判为完整轨迹', () => {
  const api = loadTwoBuluDataApi()

  assert.throws(
    () => api.convertTwoBuluRenderedData({
      title: '缺少轨迹线的页面',
      sourceUrl: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
      partialPolicy: 'reject',
      positionsPayload: { trackPositions: [] },
      markersPayload: {
        markers: [{ longitude: 113.15, latitude: 23.15, text: '补给点' }],
      },
    }),
    error => error.code === 'TWO_BULU_TRACK_EMPTY'
  )
})

test('浏览器转换不会为无名标注生成自动点位名称', () => {
  const api = loadTwoBuluDataApi()
  const result = api.convertTwoBuluRenderedData({
    title: '无名标注路线',
    sourceUrl: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
    partialPolicy: 'reject',
    positionsPayload: {
      trackPositions: [[{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }]],
    },
    markersPayload: {
      markers: [{
        longitude: 113.15,
        latitude: 23.15,
        fileType: 0,
        centerUrl: 'https://down-files.2bulu.com/f/d1?downParams=unnamed-preview',
      }],
    },
  })

  const point = parseKmlText(result.kmlText).features.find(feature => feature.type === 'Point')
  assert.equal(point.name, '')
  assert.doesNotMatch(result.kmlText, /两步路标注点/)
  assert.match(point.description, /downParams=unnamed-preview/)
})

test('浏览器转换过滤自动标注名但保留明确用户名称', () => {
  const api = loadTwoBuluDataApi()
  const result = api.convertTwoBuluRenderedData({
    title: '点位名称路线',
    sourceUrl: 'https://www.2bulu.com/track/track_detail.htm?trackId=abc',
    partialPolicy: 'reject',
    positionsPayload: {
      trackPositions: [[{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }]],
    },
    markersPayload: {
      markers: [
        { longitude: 113.15, latitude: 23.15, text: '两步路标注点 30' },
        { longitude: 113.16, latitude: 23.16, text: '用户命名营地' },
      ],
    },
  })

  const points = parseKmlText(result.kmlText).features.filter(feature => feature.type === 'Point')
  assert.deepEqual(points.map(point => point.name), ['', '用户命名营地'])
  assert.doesNotMatch(result.kmlText, /<name>两步路标注点 30<\/name>/)
})

test('页面仅能读取轨迹线时遵循用户选择并限制坐标数量', () => {
  const api = loadTwoBuluDataApi()
  const positionsPayload = {
    data: {
      positions: [{ longitude: 113.1, latitude: 23.1 }, { longitude: 113.2, latitude: 23.2 }],
    },
  }

  assert.throws(
    () => api.convertTwoBuluRenderedData({ positionsPayload, partialPolicy: 'reject' }),
    error => error.code === 'TWO_BULU_PARTIAL_REJECTED' && error.status === 'needs-user-action'
  )

  const allowed = api.convertTwoBuluRenderedData({ positionsPayload, partialPolicy: 'allow-track-only' })
  assert.equal(allowed.completeness, 'track-only')
  assert.match(allowed.warnings[0], /仅导入轨迹线/)

  assert.throws(
    () => api.convertTwoBuluRenderedData({ positionsPayload, partialPolicy: 'allow-track-only', maxPoints: 1 }),
    error => error.code === 'FILE_TOO_LARGE'
  )
})

test('标注解析器不会把不含标注数组的成功响应误判为已找到标注', () => {
  const api = loadTwoBuluDataApi()
  const emptyPayload = api.findMarkerList({ code: 0, message: 'ok' })
  assert.equal(emptyPayload.found, false)
  assert.equal(emptyPayload.markers.length, 0)
  const nestedPayload = api.findMarkerList({ data: { items: [{ longitude: 113.1, latitude: 23.1 }] } })
  assert.equal(nestedPayload.found, false)
  assert.equal(nestedPayload.markers.length, 0)
  assert.equal(api.findMarkerList({ data: [{ longitude: 113.1, latitude: 23.1 }] }).found, true)
})

test('页面导出脚本优先从运行态经纬度数组生成 KML', async () => {
  const api = loadTwoBuluPageExportApi({
    globals: {
      trackLngs: [113.1, 113.2, 113.3],
      trackLats: [23.1, 23.2, 23.3],
    },
  })
  const result = await api.collect({ partialPolicy: 'allow-track-only' })
  assert.equal(result.status, 'success')
  assert.equal(result.sourceMode, 'rendered-data')
  assert.equal(result.completeness, 'track-only')
  assert.match(result.kmlText, /<LineString>/)
  assert.match(result.kmlText, /113\.3,23\.3/)
})

test('页面导出脚本只有标注点时不会提前返回成功', async () => {
  const api = loadTwoBuluPageExportApi({
    globals: {
      trackMarks: [{ longitude: 113.15, latitude: 23.15, text: '补给点' }],
    },
  })

  const result = await api.collect({ partialPolicy: 'reject' })

  assert.equal(result.status, 'failed')
  assert.equal(result.code, 'TWO_BULU_TRACK_EMPTY')
})

test('页面导出脚本缺少路线时使用页面请求对象解码固定轨迹接口', async () => {
  const calls = []
  const encode = value => new TextEncoder().encode(JSON.stringify({ data: JSON.stringify(value) })).buffer
  const api = loadTwoBuluPageExportApi({
    globals: {
      request: {
        get: async (url, options) => {
          calls.push({ url, options })
          return url.includes('positions')
            ? encode({
                trackPositions: [[
                  { longitude: 113.1, latitude: 23.1 },
                  { longitude: 113.2, latitude: 23.2 },
                ]],
              })
            : encode([{ longitude: 113.15, latitude: 23.15, text: '补给点' }])
        },
      },
    },
  })

  const result = await api.collect({ partialPolicy: 'reject', trackId: 'GJmCy0jlMmfp/R2KBg5Tzw==' })
  const features = parseKmlText(result.kmlText).features

  assert.equal(result.status, 'success')
  assert.equal(result.completeness, 'full')
  assert.deepEqual(features.map(feature => feature.type), ['LineString', 'Point'])
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.options.decrypt === true && call.options.responseType === 'arraybuffer'))
  assert.ok(calls.every(call => new URL(call.url).hostname === 'www.2bulu.com'))
})

test('页面导出脚本可从 Leaflet 风格图层提取轨迹和标注媒体', async () => {
  const line = {
    getLatLngs: () => [{ lat: 23.1, lng: 113.1 }, { lat: 23.2, lng: 113.2 }],
  }
  const marker = {
    getLatLng: () => ({ lat: 23.15, lng: 113.15 }),
    pointMsg: {
      latLng: { lat: 23.15, lng: 113.15 },
      text: '营地',
    },
    getPopup: () => ({ getContent: () => '<p>营地</p><img src="https://down-files.2bulu.com/f/dn1?downParams=public" />' }),
  }
  const api = loadTwoBuluPageExportApi({
    globals: {
      trackMap: { getLayers: () => [line, marker] },
    },
  })
  const result = await api.collect({ partialPolicy: 'reject' })
  assert.equal(result.status, 'success')
  assert.equal(result.completeness, 'full')
  assert.match(result.kmlText, /downParams=public/)
  assert.match(result.kmlText, /营地/)
})

test('页面导出脚本会合并多个独立地图线图层', async () => {
  const firstLine = {
    getPath: () => [
      { lng: 113.1, lat: 23.1 },
      { lng: 113.2, lat: 23.2 },
    ],
  }
  const secondLine = {
    getPath: () => [
      { lng: 114.1, lat: 24.1 },
      { lng: 114.2, lat: 24.2 },
    ],
  }
  const api = loadTwoBuluPageExportApi({
    globals: {
      mapInstance: { getAllOverlays: () => [firstLine, secondLine] },
    },
  })

  const result = await api.collect({ partialPolicy: 'allow-track-only' })
  const lines = parseKmlText(result.kmlText).features.filter(feature => feature.type === 'LineString')
  assert.equal(result.status, 'success')
  assert.equal(lines.length, 2)
  assert.deepEqual(lines.map(line => line.coordinates), [
    [[113.1, 23.1], [113.2, 23.2]],
    [[114.1, 24.1], [114.2, 24.2]],
  ])
})

test('页面导出脚本会合并分散在多个运行态变量中的独立原始线段', async () => {
  const api = loadTwoBuluPageExportApi({
    globals: {
      trackPositions: [{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }],
      routeData: { positions: [{ lng: 114.1, lat: 24.1 }, { lng: 114.2, lat: 24.2 }] },
    },
  })

  const result = await api.collect({ partialPolicy: 'allow-track-only' })
  const lines = parseKmlText(result.kmlText).features.filter(feature => feature.type === 'LineString')
  assert.equal(lines.length, 2)
  assert.deepEqual(lines.map(line => line.coordinates), [
    [[113.1, 23.1], [113.2, 23.2]],
    [[114.1, 24.1], [114.2, 24.2]],
  ])
})

test('页面导出脚本优先保留原始 GPS 线并补充地图中的独立线段', async () => {
  const renderedDuplicate = {
    getPath: () => [
      { lng: 113.106, lat: 23.106 },
      { lng: 113.206, lat: 23.206 },
    ],
  }
  const renderedAdditional = {
    getPath: () => [
      { lng: 114.106, lat: 24.106 },
      { lng: 114.206, lat: 24.206 },
    ],
  }
  const api = loadTwoBuluPageExportApi({
    globals: {
      trackLngs: [{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }],
      mapInstance: { getAllOverlays: () => [renderedDuplicate, renderedAdditional] },
      changeMapCoordByMapType: (lng, lat) => ({ lng: lng - 0.006, lat: lat - 0.006 }),
    },
  })

  const result = await api.collect({ partialPolicy: 'allow-track-only' })
  const lines = parseKmlText(result.kmlText).features.filter(feature => feature.type === 'LineString')
  assert.equal(lines.length, 2)
  assert.deepEqual(lines.map(line => line.coordinates), [
    [[113.1, 23.1], [113.2, 23.2]],
    [[114.1, 24.1], [114.2, 24.2]],
  ])
})

test('页面只有地图折线回退时会先反算底图坐标再生成 GPS KML', async () => {
  const line = {
    getPath: () => [
      { lng: 113.106, lat: 23.106 },
      { lng: 113.206, lat: 23.206 },
    ],
  }
  const api = loadTwoBuluPageExportApi({
    globals: {
      mapInstance: { getAllOverlays: () => [line] },
      changeMapCoordByMapType: (lng, lat) => ({ lng: lng - 0.006, lat: lat - 0.006 }),
    },
  })
  const result = await api.collect({ partialPolicy: 'allow-track-only' })
  assert.equal(result.status, 'success')
  assert.match(result.kmlText, /113\.1,23\.1,0 113\.2,23\.2,0/)
  assert.doesNotMatch(result.kmlText, /113\.106,23\.106/)
})

test('页面导出脚本兼容高德地图风格路径且不会把图层标题当成用户点位名称', async () => {
  const line = {
    getPath: () => [
      { getLng: () => 113.1, getLat: () => 23.1 },
      { getLng: () => 113.2, getLat: () => 23.2 },
    ],
  }
  const marker = {
    getPosition: () => ({ getLng: () => 113.15, getLat: () => 23.15 }),
    getTitle: () => '观景点',
  }
  const api = loadTwoBuluPageExportApi({
    globals: {
      mapInstance: { getAllOverlays: () => [line, marker] },
    },
  })
  const result = await api.collect({ partialPolicy: 'reject' })
  assert.equal(result.status, 'success')
  assert.equal(result.completeness, 'full')
  const point = parseKmlText(result.kmlText).features.find(feature => feature.type === 'Point')
  assert.equal(point.name, '')
  assert.doesNotMatch(result.kmlText, /观景点/)
})

test('页面导出脚本按两步路实际运行态还原标题、标注媒体和 GPS 坐标，且不重复请求数据接口', async () => {
  let fetchCalls = 0
  const trackLngs = [
    { lng: 113.1, lat: 23.1, elevation: 12, createTime: 1769879829000, speed: 1.2 },
    { lng: 113.2, lat: 23.2, elevation: 18, createTime: 1769879929000, speed: 1.4 },
  ]
  const renderedLine = {
    // 两步路地图折线使用 changeGPSCoordByMapType 转换后的地图坐标，
    // 不能覆盖仍保留 GPS/WGS84 和海拔信息的 trackLngs。
    getPath: () => [
      { lng: 113.106, lat: 23.106 },
      { lng: 113.206, lat: 23.206 },
    ],
  }
  const marker = {
    getPosition: () => ({ lng: 113.156, lat: 23.156 }),
    pointMsg: {
      // 两步路在高德图层的 pointMsg 使用已转换的地图坐标。
      latLng: { lng: 113.156, lat: 23.156 },
      text: '起点停车位',
      params: {
        fileType: 0,
        // 页面用 fileUrl/centerUrl 展示缩略图，用 commnFileUrl 打开大图。
        fileUrl: 'https://down-files.2bulu.com/f/d1?downParams=preview-media',
        commnFileUrl: 'https://down-files.2bulu.com/f/d1?downParams=original-media',
      },
    },
  }
  const api = loadTwoBuluPageExportApi({
    document: {
      title: '2026-02-01 茂名十二火灶环线-GPS导航轨迹下载|行程线路图-步行轨迹-两步路',
      querySelector: () => null,
      documentElement: { localName: 'html' },
    },
    globals: {
      trackLngs,
      trackMarks: [marker],
      mapInstance: { getAllOverlays: () => [renderedLine, marker] },
      changeMapCoordByMapType: (lng, lat) => ({ lng: lng - 0.006, lat: lat - 0.006 }),
    },
    fetch: async () => {
      fetchCalls += 1
      throw new Error('已识别运行态时不应再读取两步路接口')
    },
  })

  const result = await api.collect({ partialPolicy: 'reject' })
  assert.equal(result.status, 'success')
  assert.equal(result.name, '2026-02-01 茂名十二火灶环线')
  assert.equal(result.completeness, 'full')
  assert.equal(fetchCalls, 0)
  assert.match(result.kmlText, /起点停车位/)
  assert.match(result.kmlText, /downParams=original-media/)
  assert.match(result.kmlText, /downParams=preview-media/)
  const parsed = parseKmlText(result.kmlText)
  assert.match(parsed.features.at(-1).description, /<a href="https:\/\/down-files\.2bulu\.com\/f\/d1\?downParams=original-media"[^>]*><img src="https:\/\/down-files\.2bulu\.com\/f\/d1\?downParams=preview-media"/)
  assert.match(result.kmlText, /113\.1,23\.1,12 113\.2,23\.2,18/)
  assert.doesNotMatch(result.kmlText, /113\.106,23\.106/)
  assert.match(result.kmlText, /113\.15,23\.15,0/)
})

test('页面导出脚本读取总里程、运动耗时和原作者并写入 KML 文档介绍', async () => {
  const api = loadTwoBuluPageExportApi({
    document: {
      title: '带统计信息的路线 - 两步路',
      body: {
        innerText: [
          '下载',
          '山友阿明<img src=x onerror=alert(1)>',
          '原作者',
          '基本信息',
          '12.34 km总里程',
          '06:05:04 运动耗时',
        ].join('\n'),
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      scripts: [],
      documentElement: { localName: 'html', innerText: '' },
    },
    globals: {
      trackLngs: [{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }],
    },
  })

  const result = await api.collect({ partialPolicy: 'allow-track-only' })
  const parsed = parseKmlText(result.kmlText)

  assert.equal(result.status, 'success')
  assert.equal(result.metadata.distance, '12.34 km')
  assert.equal(result.metadata.duration, '06:05:04')
  assert.equal(result.metadata.author, '山友阿明')
  assert.match(parsed.description, /总里程[：:]<\/strong>12\.34 km/)
  assert.match(parsed.description, /运动耗时[：:]<\/strong>06:05:04/)
  assert.match(parsed.description, /作者[：:]<\/strong>山友阿明/)
  assert.doesNotMatch(parsed.description, /script|onerror|alert\(1\)/i)
})

test('页面统计信息缺少部分字段时仍保留可确认的 KML 文档介绍', async () => {
  const api = loadTwoBuluPageExportApi({
    document: {
      title: '只有里程的路线 - 两步路',
      body: { innerText: '基本信息\n8.5 公里 总里程\n标注点' },
      querySelector: () => null,
      querySelectorAll: () => [],
      scripts: [],
      documentElement: { localName: 'html', innerText: '' },
    },
    globals: {
      trackLngs: [{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }],
    },
  })

  const result = await api.collect({ partialPolicy: 'allow-track-only' })
  const parsed = parseKmlText(result.kmlText)

  assert.equal(result.metadata.distance, '8.5 km')
  assert.equal(result.metadata.duration, '')
  assert.equal(result.metadata.author, '')
  assert.match(parsed.description, /总里程[：:]<\/strong>8\.5 km/)
  assert.doesNotMatch(parsed.description, /运动耗时|作者[：:]/)
})

test('页面统计数值和标签分行时仍能读取里程与耗时', async () => {
  const api = loadTwoBuluPageExportApi({
    document: {
      title: '分行统计信息路线 - 两步路',
      body: { innerText: '山友小林\n原作者\n12.8 km\n总里程\n07:08:09\n运动耗时' },
      querySelector: () => null,
      querySelectorAll: () => [],
      scripts: [],
      documentElement: { localName: 'html', innerText: '' },
    },
    globals: {
      trackLngs: [{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }],
    },
  })

  const result = await api.collect({ partialPolicy: 'allow-track-only' })

  assert.equal(result.metadata.distance, '12.8 km')
  assert.equal(result.metadata.duration, '07:08:09')
  assert.equal(result.metadata.author, '山友小林')
})

test('页面导出脚本读取性能资源中的实际轨迹响应，不依赖固定 trackId 变量', async () => {
  const api = loadTwoBuluPageExportApi({
    resources: [{ name: 'https://www.2bulu.com/track/get_track_positions_list_new.htm?opaque=1' }],
    fetch: async url => ({
      ok: true,
      url,
      text: async () => JSON.stringify({ data: { positions: [[113.1, 23.1], [113.2, 23.2]] } }),
    }),
  })
  const result = await api.collect({ partialPolicy: 'allow-track-only' })
  assert.equal(result.status, 'success')
  assert.equal(result.completeness, 'track-only')
  assert.match(result.kmlText, /113\.1,23\.1/)
})

test('页面导出脚本复读被动记录的实际轨迹和标注资源', async () => {
  const positionsUrl = 'https://www.2bulu.com/track/get_track_positions_list4.htm?dynamic=track'
  const markersUrl = 'https://www.2bulu.com/track/get_track_marker_list_2.htm?dynamic=marker'
  const api = loadTwoBuluPageExportApi({
    globals: {
      __mapServiceTwoBuluCapturedResponses: [{ url: positionsUrl }, { url: markersUrl }],
    },
    fetch: async url => ({
      ok: true,
      url,
      text: async () => JSON.stringify(url === positionsUrl
        ? { trackPositions: [[{ lng: 113.1, lat: 23.1 }, { lng: 113.2, lat: 23.2 }]] }
        : { markers: [{ longitude: 113.15, latitude: 23.15, text: '补给点' }] }),
    }),
  })
  const result = await api.collect({ partialPolicy: 'reject' })
  assert.equal(result.status, 'success')
  assert.equal(result.completeness, 'full')
  assert.match(result.kmlText, /补给点/)
})

test('页面导出脚本可安全解析页面内的轨迹数组字面量', async () => {
  const api = loadTwoBuluPageExportApi({
    document: {
      title: '脚本路线 - 两步路',
      querySelector: () => null,
      documentElement: { localName: 'html' },
      scripts: [{ textContent: 'var trackLngs = [113.1, 113.2]; var trackLats = [23.1, 23.2];' }],
    },
  })
  const result = await api.collect({ partialPolicy: 'allow-track-only' })
  assert.equal(result.status, 'success')
  assert.match(result.kmlText, /113\.2,23\.2/)
})

test('页面导出脚本未识别运行态数据时返回明确错误而非要求页面提供 KML', async () => {
  const api = loadTwoBuluPageExportApi()
  const result = await api.collect({ partialPolicy: 'allow-track-only' })
  assert.equal(result.status, 'unsupported')
  assert.equal(result.code, 'TWO_BULU_PAGE_DATA_NOT_RECOGNIZED')
  assert.match(result.message, /轨迹运行数据|轨迹和点位/)
  assert.doesNotMatch(result.message, /官方导出|标准 KML/)
})
