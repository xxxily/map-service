import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildApiUrl,
  apiRequest,
  getCsrfToken,
  parseCookieString,
  shouldAttachCsrf,
} from '../src/auth/api.js'
import {
  applyEmbeddedRequestContext,
  EMBED_CONTEXT_HEADER,
  EMBED_CONTEXT_VALUE,
  isEmbeddedDocument,
} from '../src/auth/embed-context.js'
import { normalizeSessionResult } from '../src/auth/session.js'
import {
  clearTwoBuluImportRequest,
  prepareTwoBuluImportRequest,
  twoBuluImportResultMessage,
} from '../src/ui/two-bulu-import-dialog.js'
import {
  buildShareUpdateItems,
  buildShareViewConfig,
  buildShareItems,
  getAccountCapabilities,
  getAvailableAccountTabs,
  isAccountLocation,
  loadCompleteKmlPages,
  normalizeCompletePagedResult,
  normalizeAccountTab,
  normalizeKmlSort,
  normalizeResourceCollectionItemsPage,
  selectedActiveKmlIdsInDisplayOrder,
  normalizeSpatialAccess,
  passwordAccessLabel,
  parseLocalKmlFiles,
  partitionKmlTrashSelection,
  revisionConflictPrompt,
  sanitizeReturnTo,
  shareAccessPolicyLabel,
  spatialAccessLabel,
  spatialStatusLabel,
} from '../src/account/model.js'
import {
  generateStrongSharePassword,
  getShareDirectorySelectionState,
  SHARE_PASSWORD_LENGTH_OPTIONS,
} from '../src/account/dialogs.js'
import { renderAccountShell } from '../src/account/views.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('认证客户端从可读 Cookie 获取 CSRF Token 且仅修改请求携带', () => {
  const cookies = parseCookieString('map_user_session=hidden; map_csrf_token=a%2Bb%3D%3D; theme=dark')
  assert.equal(cookies.map_user_session, 'hidden')
  assert.equal(getCsrfToken('map_csrf_token=a%2Bb%3D%3D'), 'a+b==')
  assert.equal(getCsrfToken('map_csrf_token=normal; map_csrf_token_embed=partitioned', { embedded: true }), 'partitioned')
  assert.equal(getCsrfToken('map_csrf_token=normal; map_csrf_token_embed=partitioned', { embedded: false }), 'normal')
  assert.equal(shouldAttachCsrf('GET'), false)
  assert.equal(shouldAttachCsrf('POST'), true)
  assert.equal(shouldAttachCsrf('delete'), true)
})

test('嵌入页面请求携带受控上下文标记且普通标签页不携带', () => {
  const topWindow = {}
  topWindow.self = topWindow
  topWindow.top = topWindow
  const embeddedWindow = { self: {}, top: {} }

  assert.equal(isEmbeddedDocument(topWindow), false)
  assert.equal(isEmbeddedDocument(embeddedWindow), true)

  const embeddedHeaders = applyEmbeddedRequestContext(new Headers(), embeddedWindow)
  assert.equal(embeddedHeaders.get(EMBED_CONTEXT_HEADER), EMBED_CONTEXT_VALUE)
  const topHeaders = applyEmbeddedRequestContext(new Headers(), topWindow)
  assert.equal(topHeaders.has(EMBED_CONTEXT_HEADER), false)
})

test('嵌入写请求遇到过期分区 CSRF 后刷新上下文并只重试一次', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  let cookieValue = 'map_csrf_token=ordinary-csrf; map_csrf_token_embed=stale-csrf'
  const calls = []
  globalThis.window = { self: {}, top: {} }
  globalThis.document = {
    get cookie () {
      return cookieValue
    },
    set cookie (value) {
      if (value.startsWith('map_csrf_token_embed=')) cookieValue = 'map_csrf_token=ordinary-csrf'
    },
  }
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options, csrf: options.headers?.get?.('X-CSRF-Token') || '' })
    if (url === '/api/v1/auth/session') {
      return new Response(JSON.stringify({ code: 0, result: { authenticated: true }, error: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        code: -1,
        result: null,
        error: { code: 'CSRF_INVALID', message: '请求安全校验失败' },
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ code: 0, result: { synced: true }, error: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = await apiRequest('/kml/sync', {
      method: 'POST',
      body: { operations: [{ action: 'update' }] },
    })
    assert.deepEqual(result, { synced: true })
    assert.equal(calls.length, 3)
    assert.equal(calls[0].csrf, 'stale-csrf')
    assert.equal(calls[1].url, '/api/v1/auth/session')
    assert.equal(calls[2].csrf, 'ordinary-csrf')
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.fetch = previousFetch
  }
})

test('普通页面 CSRF 错误不会触发嵌入上下文重试', async () => {
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  let calls = 0
  const topWindow = {}
  topWindow.self = topWindow
  topWindow.top = topWindow
  globalThis.window = topWindow
  globalThis.document = { cookie: 'map_csrf_token=csrf-token' }
  globalThis.fetch = async () => {
    calls += 1
    return new Response(JSON.stringify({
      code: -1,
      result: null,
      error: { code: 'CSRF_INVALID', message: '请求安全校验失败' },
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    await assert.rejects(
      apiRequest('/kml/sync', { method: 'POST', body: { operations: [{ action: 'update' }] } }),
      error => error.code === 'CSRF_INVALID',
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.fetch = previousFetch
  }
})

test('API URL 只生成 /api/v1 同源路径并忽略空查询值', () => {
  assert.equal(
    buildApiUrl('kml/files', { page: 1, status: 'active', search: '', enabled: false }),
    '/api/v1/kml/files?page=1&status=active&enabled=false',
  )
})

test('会话响应必须以服务端 authenticated 和 user 为事实来源', () => {
  assert.deepEqual(normalizeSessionResult(null), {
    authenticated: false,
    user: null,
    session: null,
  })
  assert.deepEqual(normalizeSessionResult({
    authenticated: true,
    user: { id: 'usr_1' },
    expiresAt: '2026-08-12T00:00:00.000Z',
  }), {
    authenticated: true,
    user: { id: 'usr_1' },
    session: { expiresAt: '2026-08-12T00:00:00.000Z' },
  })
})

test('用户中心路由和回跳地址不允许开放重定向', () => {
  assert.equal(isAccountLocation('/account'), true)
  assert.equal(isAccountLocation({ pathname: '/account/security' }), true)
  assert.equal(isAccountLocation('/accounts'), false)
  assert.equal(normalizeAccountTab('#shares'), 'shares')
  assert.equal(normalizeAccountTab('#unknown'), 'profile')
  assert.equal(sanitizeReturnTo('/?coords=23,113,12,0'), '/?coords=23,113,12,0')
  assert.equal(sanitizeReturnTo('//evil.example/path'), '/')
  assert.equal(sanitizeReturnTo('https://evil.example/path'), '/')
  assert.equal(sanitizeReturnTo('/\\evil.example'), '/')
})

test('用户中心按自定义角色权限裁剪页签和 KML 写能力', () => {
  const readOnlyUser = {
    permissions: ['account.self.read', 'kml.own.read'],
  }
  assert.deepEqual(getAvailableAccountTabs(readOnlyUser), ['profile', 'kml', 'security'])
  assert.equal(getAccountCapabilities(readOnlyUser).canWriteKml, false)
  assert.equal(normalizeAccountTab('#favorites', readOnlyUser), 'profile')

  const writeOnlyUser = {
    permissions: ['kml.own.write'],
  }
  assert.equal(getAccountCapabilities(writeOnlyUser).canReadKml, true)
  assert.deepEqual(getAvailableAccountTabs(writeOnlyUser), ['kml', 'security'])

  const shareUser = {
    permissions: ['kml.own.read', 'share.own.manage'],
  }
  assert.deepEqual(getAvailableAccountTabs(shareUser), ['kml', 'shares', 'security'])

  const collectionManager = {
    permissions: ['resource_collection.own.manage'],
  }
  assert.equal(getAccountCapabilities(collectionManager).canReadCollections, true)
  assert.equal(getAccountCapabilities(collectionManager).canWriteCollections, true)
  assert.deepEqual(getAvailableAccountTabs(collectionManager), ['collections', 'security'])
})

test('资源集合项分页响应严格校验分页、版本和资源地址', () => {
  const valid = normalizeResourceCollectionItemsPage({
    collectionId: 'rc_1',
    items: [
      { id: 'item-2', url: 'https://cdn.example.com/2.jpg', title: '第二项' },
      { id: 'item-3', url: 'https://cdn.example.com/3.jpg', title: '第三项' },
    ],
    pagination: { page: 2, limit: 2, total: 4, pageCount: 2, hasNext: false },
    collectionRevision: 7,
    revision: 7,
    itemsRevision: 4,
  }, { page: 2, limit: 2 })
  assert.equal(valid.page, 2)
  assert.equal(valid.total, 4)
  assert.equal(valid.collectionRevision, 7)
  assert.equal(valid.itemsRevision, 4)

  const invalidCases = [
    ['missing pagination', { items: valid.items, collectionRevision: 7, itemsRevision: 4 }],
    ['wrong page count', { ...valid, page: 2, limit: 2, total: 4, pageCount: 3, hasNext: false }],
    ['wrong item count', { ...valid, items: valid.items.slice(0, 1) }],
    ['duplicate item id', { ...valid, items: [valid.items[0], { ...valid.items[1], id: valid.items[0].id }] }],
    ['unsafe item url', { ...valid, items: [valid.items[0], { ...valid.items[1], url: 'http://cdn.example.com/3.jpg' }] }],
    ['missing revision', { ...valid, itemsRevision: 0 }],
  ]
  for (const [label, payload] of invalidCases) {
    assert.throws(() => normalizeResourceCollectionItemsPage(payload, { page: 2, limit: 2 }), error => {
      assert.equal(error.code, 'RESOURCE_COLLECTION_SCHEMA_INVALID', label)
      return true
    })
  }
})

test('多 KML 分享构造保留全部所选活跃文件，由后台配置限制最终数量', () => {
  const documents = Array.from({ length: 23 }, (_, index) => ({
    id: `kml_${index}`,
    status: index === 1 ? 'trashed' : 'active',
    enabled: index !== 0,
  }))
  const items = buildShareItems(documents.map(item => item.id), documents)
  assert.equal(items.length, 22)
  assert.equal(items.some(item => item.kmlId === 'kml_1'), false)
  assert.deepEqual(items[0], {
    kmlId: 'kml_0',
    position: 0,
    visibleByDefault: false,
  })
})

test('分享构造与编辑不会在客户端静默截断超过旧 20 个上限的文件', () => {
  const documents = Array.from({ length: 25 }, (_, index) => ({ id: `kml_${index}`, status: 'active', enabled: true }))
  assert.equal(buildShareItems(documents.map(item => item.id), documents).length, 25)
  assert.equal(buildShareUpdateItems(documents.map(item => ({ kmlId: item.id }))).length, 25)

  const dialogSource = fs.readFileSync(path.join(projectRoot, 'src/account/dialogs.js'), 'utf8')
  assert.match(dialogSource, /maxFilesPerShare/)
  assert.doesNotMatch(dialogSource, /一个分享最多包含 20 个 KML/)
})

test('新加入分享的 KML 继承源文件显隐状态', () => {
  assert.deepEqual(buildShareItems(new Set(['visible', 'hidden']), [
    { id: 'visible', status: 'active', enabled: true },
    { id: 'hidden', status: 'active', enabled: false },
  ]), [
    { kmlId: 'visible', position: 0, visibleByDefault: true },
    { kmlId: 'hidden', position: 1, visibleByDefault: false },
  ])

  const dialogSource = fs.readFileSync(path.join(projectRoot, 'src/account/dialogs.js'), 'utf8')
  assert.match(dialogSource, /defaultVisibilityForKml/)
  assert.doesNotMatch(dialogSource, /selectedItems\.push\(\{ kmlId, visibleByDefault: true, displayName: '' \}\)/)
})

test('KML 排序和批量回收选择只接受服务端支持的安全范围', () => {
  assert.deepEqual(normalizeKmlSort('name', 'asc'), { sort: 'name', order: 'asc' })
  assert.deepEqual(normalizeKmlSort('ownerId', 'sideways'), { sort: 'updatedAt', order: 'desc' })

  const documents = [
    { id: 'kml_default', name: '默认', status: 'active', isDefault: true },
    { id: 'kml_active', name: '路线', status: 'active', isDefault: false },
    { id: 'kml_trashed', name: '旧路线', status: 'trashed', isDefault: false },
  ]
  const selection = partitionKmlTrashSelection(
    new Set(['kml_default', 'kml_active', 'kml_trashed', 'kml_missing']),
    documents,
  )
  assert.deepEqual(selection.eligible.map(item => item.id), ['kml_active'])
  assert.deepEqual(selection.skippedDefault.map(item => item.id), ['kml_default'])
  assert.deepEqual(selection.skippedInactive.map(item => item.id), ['kml_trashed'])
  assert.deepEqual(selection.skippedMissing, ['kml_missing'])
})

test('KML 批量移动选择按目录和文件显示顺序生成跨目录 ID', () => {
  const directories = {
    items: [
      { id: 'dir-b', name: '目录乙', position: 1 },
      { id: 'dir-a', name: '目录甲', position: 0 },
    ],
    uncategorized: { id: null, name: '未分类' },
  }
  const documents = [
    { id: 'a-2', directoryId: 'dir-a', position: 1, status: 'active' },
    { id: 'root', directoryId: null, position: 0, status: 'active' },
    { id: 'b-1', directoryId: 'dir-b', position: 0, status: 'active' },
    { id: 'a-1', directoryId: 'dir-a', position: 0, status: 'active' },
    { id: 'trashed', directoryId: 'dir-a', position: 2, status: 'trashed' },
  ]
  assert.deepEqual(selectedActiveKmlIdsInDisplayOrder(
    new Set(['root', 'a-2', 'b-1', 'a-1', 'trashed', 'missing']),
    documents,
    directories,
  ), ['a-1', 'a-2', 'b-1', 'root'])
})

test('KML 分页规范化拒绝不完整响应并保留服务端分页契约', () => {
  assert.deepEqual(normalizeCompletePagedResult({
    items: [{ id: 'kml-a' }],
    page: 1,
    limit: 100,
    total: 1,
  }, { page: 1, limit: 100 }), {
    items: [{ id: 'kml-a' }],
    page: 1,
    limit: 100,
    total: 1,
  })
  assert.throws(
    () => normalizeCompletePagedResult(null, { page: 1, limit: 100 }),
    error => error.code === 'KML_LIST_INCOMPLETE',
  )
  assert.throws(
    () => normalizeCompletePagedResult({ items: [{ name: '无 ID' }], page: 1, limit: 100, total: 1 }, { page: 1, limit: 100 }),
    error => error.code === 'KML_LIST_INCOMPLETE',
  )
})

test('KML 完整分页加载接受最终短页并拒绝中断、变更和重复项', async () => {
  const documents = Array.from({ length: 150 }, (_, index) => ({ id: `kml-${index}` }))
  const complete = await loadCompleteKmlPages(({ page, limit }) => ({
    items: documents.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: documents.length,
  }))
  assert.equal(complete.items.length, 150)
  assert.equal(complete.total, 150)

  await assert.rejects(
    loadCompleteKmlPages(() => ({ items: [{ id: 'kml-a' }], page: 1, limit: 100, total: 2 })),
    error => error.code === 'KML_LIST_INCOMPLETE',
  )
  await assert.rejects(
    loadCompleteKmlPages(({ page, limit }) => ({
      items: Array.from({ length: page === 1 ? 100 : 49 }, (_, index) => ({ id: `changed-${page}-${index}` })),
      page,
      limit,
      total: page === 1 ? 150 : 149,
    })),
    error => error.code === 'KML_LIST_CHANGED',
  )
  await assert.rejects(
    loadCompleteKmlPages(({ page, limit }) => ({
      items: page === 1
        ? Array.from({ length: 100 }, (_, index) => ({ id: `duplicate-${index}` }))
        : [{ id: 'duplicate-99' }],
      page,
      limit,
      total: 101,
    })),
    error => error.code === 'KML_LIST_INCOMPLETE',
  )
})

test('账号 KML 目录和文件拖拽使用独立协议并接入持久化 API', () => {
  const appSource = fs.readFileSync(path.join(projectRoot, 'src/account/app.js'), 'utf8')
  const viewSource = fs.readFileSync(path.join(projectRoot, 'src/account/views.js'), 'utf8')

  assert.match(viewSource, /data-account-kml-directory-draggable="true"/)
  assert.match(viewSource, /data-account-kml-file-draggable="true"/)
  assert.match(appSource, /application\/x-map-service-kml-directory/)
  assert.match(appSource, /application\/x-map-service-kml-file/)
  assert.match(appSource, /addEventListener\('dragstart'/)
  assert.match(appSource, /addEventListener\('dragover'/)
  assert.match(appSource, /addEventListener\('drop'/)
  assert.match(appSource, /accountApi\.reorderKmlDirectories\(ids\)/)
  assert.match(appSource, /accountApi\.moveKml\(source\.id, \{ directoryId, beforeId \}\)/)
  assert.match(appSource, /loadCompleteKmlPages\(\(\{ page, limit \}\) =>/)
})

test('分享编辑会重排去重文件并校验完整地图视图', () => {
  assert.deepEqual(buildShareUpdateItems([
    { kmlId: 'kml_b', visibleByDefault: false, displayName: '备用' },
    { kmlId: 'kml_a', visibleByDefault: true },
    { kmlId: 'kml_b', visibleByDefault: true },
  ]), [
    { kmlId: 'kml_b', visibleByDefault: false, displayName: '备用', position: 0 },
    { kmlId: 'kml_a', visibleByDefault: true, displayName: '', position: 1 },
  ])

  assert.deepEqual(buildShareViewConfig({
    mapMode: '3d',
    center: [23.1291, 113.2644],
    zoom: 13,
    bearing: -20,
    pitch: 45,
  }, { layerId: 'amap-road', showOwnerDisplayName: true }), {
    mapMode: '3d',
    center: [23.1291, 113.2644],
    zoom: 13,
    bearing: -20,
    pitch: 45,
    layerId: 'amap-road',
    showOwnerDisplayName: true,
  })
  assert.throws(() => buildShareViewConfig({ mapMode: '2d', center: [91, 0] }), /有效的纬度和经度/)
  assert.throws(() => buildShareViewConfig({ mapMode: '2d', pitch: 90 }), /0～85/)
  assert.throws(() => buildShareViewConfig({
    kmlPointClustering: { enabled: true, minClusterPoints: 2500 },
  }), /2～1000/)
})

test('分享目录勾选状态会随单文件选择保持全选和半选一致', () => {
  const fileIds = ['kml_a', 'kml_b', 'kml_c']
  assert.deepEqual(getShareDirectorySelectionState(fileIds, []), {
    checked: false,
    indeterminate: false,
  })
  assert.deepEqual(getShareDirectorySelectionState(fileIds, [{ kmlId: 'kml_a' }]), {
    checked: false,
    indeterminate: true,
  })
  assert.deepEqual(getShareDirectorySelectionState(fileIds, [
    { kmlId: 'kml_a' },
    { kmlId: 'kml_b' },
    { kmlId: 'kml_c' },
  ]), {
    checked: true,
    indeterminate: false,
  })
})

test('分享访问策略与并发冲突提示明确说明重新加载且不覆盖', () => {
  assert.equal(shareAccessPolicyLabel({ accessMode: 'public_link', passwordProtected: true }), '公开链接（密码保护）')
  const kmlConflict = revisionConflictPrompt('KML_REVISION_CONFLICT')
  const shareConflict = revisionConflictPrompt('SHARE_REVISION_CONFLICT')
  assert.equal(kmlConflict.resource, 'kml')
  assert.match(kmlConflict.message, /没有覆盖服务器内容.*重新加载/)
  assert.equal(shareConflict.resource, 'shares')
  assert.match(shareConflict.message, /没有覆盖服务器内容.*重新加载/)
})

test('空间分享摘要保留空值并区分范围、状态和密码授权', () => {
  assert.deepEqual(normalizeSpatialAccess({
    spatialAccess: { mode: 'kml_bounds', status: 'ready', areaKm2: null, diagonalKm: '', paddingMeters: undefined },
  }), {
    mode: 'kml_bounds',
    status: 'ready',
    version: null,
    geometryType: null,
    bbox: null,
    areaKm2: null,
    diagonalKm: null,
    paddingMeters: null,
    minZoom: null,
    unrestrictedTileMaxZoom: null,
    maxCameraHeight: null,
    displayGeometry: null,
    revision: 0,
    unlimitedAccessEligible: false,
    reasonCode: null,
  })
  assert.equal(spatialAccessLabel({ spatialAccess: { mode: 'kml_bounds' } }), '限制在 KML 区域')
  assert.equal(spatialStatusLabel({ spatialAccess: { mode: 'kml_bounds', status: 'out_of_policy' } }), '超出策略')
  assert.equal(passwordAccessLabel({ passwordProtected: true, passwordAccess: { ttlMode: 'unlimited' } }), '不限固定期限')
  assert.equal(passwordAccessLabel({ passwordProtected: false }), '不适用')
})

test('本地 KML 迁移只导入明确数据并保留默认文件标识', () => {
  const parsed = parseLocalKmlFiles(JSON.stringify([
    { id: 'default-kml', name: '默认标注', features: [{ id: 'p1' }] },
    null,
    { id: 'kml-local-2', name: '路线', enabled: false },
  ]))
  assert.equal(parsed.files.length, 2)
  assert.equal(parsed.invalidCount, 1)
  assert.equal(parsed.files[0].isDefault, true)
  assert.equal(parsed.files[0].features.length, 1)
  assert.equal(parsed.files[1].enabled, false)
})

test('静态入口声明 account 根节点、地图身份入口和 SPA fallback', () => {
  const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8')
  const map3dHtml = fs.readFileSync(path.join(projectRoot, '3d.html'), 'utf8')
  const mainSource = fs.readFileSync(path.join(projectRoot, 'src/main.js'), 'utf8')
  const map3dSource = fs.readFileSync(path.join(projectRoot, 'src/3d.js'), 'utf8')
  const serviceSource = fs.readFileSync(path.join(projectRoot, 'service/index.js'), 'utf8')
  assert.match(indexHtml, /id="account-root"/)
  assert.match(indexHtml, /data-action="openAccount"/)
  assert.match(map3dHtml, /data-action="openAccount"/)
  assert.doesNotMatch(indexHtml, /data-action="openAdmin"/)
  assert.doesNotMatch(map3dHtml, /data-action="openAdmin"/)
  assert.match(indexHtml, /id="close-search-panel-btn"/)
  assert.match(map3dHtml, /id="close-search-panel-btn"/)
  assert.match(mainSource, /isAccountLocation\(window\.location\)/)
  assert.match(map3dSource, /initIdentityEntry\(/)
  assert.match(serviceSource, /app\.get\(\[[^\]]*'\/account'/)
})

test('公开分享地图使用作用域底图接口且不写入访客私有状态', () => {
  const mainSource = fs.readFileSync(path.join(projectRoot, 'src/main.js'), 'utf8')
  const map3dSource = fs.readFileSync(path.join(projectRoot, 'src/3d.js'), 'utf8')
  const layerSource = fs.readFileSync(path.join(projectRoot, 'src/map/layers.js'), 'utf8')
  const urlStateSource = fs.readFileSync(path.join(projectRoot, 'src/map/url-state.js'), 'utf8')

  assert.match(mainSource, /public\/kml-shares\/.*\/map\/catalog/)
  assert.match(mainSource, /persist: !shareMode/)
  assert.match(mainSource, /urlState\.hasUrlLayer/)
  assert.match(mainSource, /useUrlView = urlState\.hasUrlCoords/)
  assert.match(mainSource, /url\.searchParams\.set\('share', publicId\)/)
  assert.match(mainSource, /if \(!shareMode\) \{\s*initGuidelines\(map\)/)
  assert.match(map3dSource, /public\/kml-shares\/.*\/map\/catalog/)
  assert.match(map3dSource, /urlState\.hasUrlLayer/)
  assert.match(map3dSource, /initCameraView\(shareViewConfig, urlState, defaultView\)/)
  assert.match(map3dSource, /url\.searchParams\.delete\('share'\)/)
  assert.match(map3dSource, /if \(isShareLocation\(window\.location\)\) return/)
  assert.match(layerSource, /options\.catalogUrl/)
  assert.match(urlStateSource, /options\.persist === false/)
})

test('用户中心 KML 与分享管理使用统一 Dialog 并具备完整编辑入口', () => {
  const appSource = fs.readFileSync(path.join(projectRoot, 'src/account/app.js'), 'utf8')
  const apiSource = fs.readFileSync(path.join(projectRoot, 'src/account/api.js'), 'utf8')
  const viewSource = fs.readFileSync(path.join(projectRoot, 'src/account/views.js'), 'utf8')
  const dialogSource = fs.readFileSync(path.join(projectRoot, 'src/account/dialogs.js'), 'utf8')
  const accountSource = `${appSource}\n${viewSource}\n${dialogSource}`
  const sessionSource = fs.readFileSync(path.join(projectRoot, 'src/auth/session.js'), 'utf8')

  assert.match(viewSource, /name="sort"/)
  assert.match(viewSource, /data-account-action="trash-selected-kml"/)
  assert.match(viewSource, /data-account-action="move-selected-kml"/)
  assert.match(viewSource, /data-account-action="open-kml-trash"/)
  assert.match(viewSource, /data-account-action="back-kml-active"/)
  assert.match(viewSource, /data-account-action="back-kml-active"[^>]*>返回<\/button>/)
  assert.match(viewSource, /account-kml-directory-title/)
  assert.match(viewSource, /account-kml-directory-count/)
  assert.match(appSource, /state\.kml\.trashCount/)
  assert.match(appSource, /for \(const item of selection\.eligible\)/)
  assert.match(appSource, /accountApi\.batchMoveKml\(\{ ids, directoryId: targetId \}\)/)
  assert.match(apiSource, /batchMoveKml: body => apiRequest\('\/kml\/files\/batch-move'/)
  assert.match(apiSource, /batchResourceCollectionItems: \(id, body\) => apiRequest\(`\/resource-collections\/\$\{pathId\(id\)\}\/items\/batch`/)
  assert.match(apiSource, /reorderResourceCollectionItems: \(id, body\) => apiRequest\(`\/resource-collections\/\$\{pathId\(id\)\}\/items\/reorder`/)
  assert.match(viewSource, /data-collection-batch/)
  assert.match(viewSource, /data-account-action="move-collection-item"/)
  assert.match(appSource, /resourceCollectionRefVersion|loadAllCollectionItems/)
  assert.match(appSource, /coverUrl: values\.coverUrl\?\.trim\(\) \|\| ''/)
  assert.match(appSource, /name: 'color', label: '主题色', type: 'color'/)
  assert.match(appSource, /passwordlessSharingEnabled: passwordlessSharingEnabled\(\)/)
  assert.match(appSource, /spatialUnrestrictedTileMaxZoom: spatialTileZoomMax\(\)/)
  assert.match(dialogSource, /data-account-share-move="up"/)
  assert.match(dialogSource, /data-account-share-visible/)
  assert.match(dialogSource, /data-account-spatial-preview/)
  assert.match(dialogSource, /name="unrestrictedTileMaxZoom" type="number" min="0" max="\$\{spatialTileZoomMax\}"/)
  assert.match(dialogSource, /不能高于管理员设置的最大级别/)
  assert.match(dialogSource, /data-account-password-access-field/)
  assert.match(dialogSource, /form\.elements\.passwordAccessTtlMode\.value = 'finite'/)
  assert.match(apiSource, /spatialPreview: body => apiRequest/)
  assert.match(apiSource, /syncShare: \(id, body\) => apiRequest\(`\/kml\/shares\/\$\{pathId\(id\)\}\/sync`/)
  assert.match(apiSource, /deleteShare: id => apiRequest\(`\/kml\/shares\/\$\{pathId\(id\)\}`, \{ method: 'DELETE' \}\)/)
  assert.match(apiSource, /pauseShare: id => apiRequest\(`\/kml\/shares\/\$\{pathId\(id\)\}\/pause`/)
  assert.match(apiSource, /resumeShare: id => apiRequest\(`\/kml\/shares\/\$\{pathId\(id\)\}\/resume`/)
  assert.match(viewSource, /data-account-action="sync-share"/)
  assert.match(viewSource, /data-account-action="delete-share"/)
  assert.match(viewSource, /个 KML 待同步/)
  assert.match(viewSource, /outdatedShareReferenceCount/)
  assert.match(appSource, /showConfirm\('将当前 KML 内容发布到此分享链接/)
  assert.match(appSource, /accountApi\.syncShare\(id, \{ revision \}\)/)
  assert.match(appSource, /accountApi\.resumeShare\(id\)/)
  assert.match(appSource, /accountApi\.pauseShare\(id\)/)
  assert.match(appSource, /accountApi\.deleteShare\(id\)/)
  assert.match(dialogSource, /centerLatitude/)
  assert.match(dialogSource, /centerLongitude/)
  assert.match(dialogSource, /name="bearing"/)
  assert.match(dialogSource, /name="pitch"/)
  assert.match(viewSource, /item\.blockedReason/)
  assert.match(viewSource, /getAvailableAccountTabs\(user\)/)
  assert.match(viewSource, /capabilities\.canWriteKml/)
  assert.match(appSource, /requireCapability\('canWriteKml'/)
  assert.match(appSource, /label: '分享密码',\s*minLength: 4/)
  assert.match(appSource, /label: '新分享密码',\s*minLength: 4/)
  assert.match(appSource, /const loggedOut = await runAction\(\(\) => logout\(\)/)
  assert.match(appSource, /if \(!loggedOut\) return/)
  assert.match(appSource, /if \(capabilities\(\)\.canManageSessions\) await loadSessions\(\)\s*else state\.sessions = \[\]/)
  assert.match(appSource, /showChoiceDialog\([\s\S]*复制带密码链接/)
  assert.match(appSource, /getSharePasswordDetails/)
  assert.match(appSource, /复制密码/)
  assert.doesNotMatch(appSource, /确认分享密码/)
  assert.match(appSource, /share-access-events/)
  assert.match(viewSource, /访问记录/)
  assert.match(viewSource, /analytics\?\.mode/)
  assert.match(dialogSource, /generateStrongSharePassword/)
  assert.match(dialogSource, /data-account-password-action="copy"/)
  assert.match(dialogSource, /passwordlessSharingEnabled/)
  assert.match(dialogSource, /hasStoredPassword/)
  assert.match(dialogSource, /'<option value="change" selected>设置新密码<\/option>'/)
  assert.match(dialogSource, /passwordAccessTtlMode === 'unlimited' && !willHavePassword\(\)/)
  assert.match(dialogSource, /passwordLength/)
  assert.match(dialogSource, /passwordIncludeSpecial/)
  assert.match(dialogSource, /analyticsMode/)
  assert.doesNotMatch(appSource, /state\.auth = await refreshAuthSession\(\)\s*await loadSessions\(\)/)
  assert.doesNotMatch(sessionSource, /export async function logout \(\) \{[\s\S]*?\} finally \{/)
  assert.doesNotMatch(accountSource, /(?:window\.)?(?:alert|confirm|prompt)\s*\(/)
})

test('KML 回收站条目显示删除时间和原目录', () => {
  const html = renderAccountShell({
    auth: {
      user: {
        username: 'trash-owner',
        displayName: '回收站用户',
        permissions: ['account.self.read', 'kml.own.write'],
      },
      config: {},
    },
    activeTab: 'kml',
    loading: false,
    notice: '',
    error: '',
    kml: {
      status: 'trashed',
      search: '',
      sort: 'updatedAt',
      order: 'desc',
      selected: new Set(),
      trashCount: 2,
      usage: {},
      directories: { items: [], uncategorized: { name: '未分类' } },
      items: [
        {
          id: 'kml-in-directory',
          name: '已删除路线',
          status: 'trashed',
          directoryId: 'directory-a',
          directoryName: '旧项目',
          deletedAt: '2026-08-27T02:30:00.000Z',
          updatedAt: '2026-08-26T01:00:00.000Z',
          featureCount: 8,
          byteSize: 1024,
        },
        {
          id: 'kml-uncategorized',
          name: '未分类文件',
          status: 'trashed',
          deletedAt: '2026-08-27T03:30:00.000Z',
          updatedAt: '2026-08-26T01:00:00.000Z',
          featureCount: 2,
          byteSize: 512,
        },
      ],
    },
  })

  assert.match(html, /删除时间：/)
  assert.match(html, /原目录：旧项目/)
  assert.match(html, /原目录：未分类/)
  assert.match(html, /data-account-action="restore-kml"/)
  assert.match(html, /data-account-action="delete-kml"/)
})

test('个人资源集合详情提供封面、批量添加和跨页排序入口', () => {
  const html = renderAccountShell({
    auth: {
      user: {
        username: 'collection-owner',
        displayName: '集合用户',
        permissions: ['account.self.read', 'resource_collection.own.read', 'resource_collection.own.write'],
      },
      config: {},
    },
    activeTab: 'collections',
    loading: false,
    busy: false,
    notice: '',
    error: '',
    collections: {
      items: [],
      search: '',
      status: 'active',
      page: 1,
      limit: 20,
      sort: 'updatedAt',
      order: 'desc',
      total: 0,
      itemPage: 2,
      itemLimit: 2,
      itemTotal: 4,
      selected: {
        id: 'rc_collection',
        name: '公开素材',
        description: '可复用资源',
        isPublic: true,
        itemCount: 4,
        itemsRevision: 3,
      },
      itemResult: {
        items: [{
          id: 'rci_3',
          position: 2,
          title: '第三项',
          url: 'https://cdn.example.com/3.jpg',
          coverUrl: 'https://cdn.example.com/3-cover.jpg',
          type: 'image',
        }],
        total: 4,
      },
    },
    kml: { items: [], directories: { items: [], uncategorized: { name: '未分类' } }, selected: new Set(), usage: {} },
    favorites: { items: [], search: '' },
    shares: { items: [], search: '', status: '' },
    sessions: [],
  })

  assert.match(html, /data-collection-batch/)
  assert.match(html, /data-account-action="batch-add-collection-items"/)
  assert.match(html, /<details class="account-collection-batch">/)
  assert.match(html, /data-account-action="batch-add-collection-items"[^>]*>开始添加/)
  assert.equal((html.match(/data-account-action="add-collection-item"/g) || []).length, 1)
  assert.match(html, /data-account-action="move-collection-item"[^>]*data-direction="up"/)
  assert.match(html, /封面：https:\/\/cdn\.example\.com\/3-cover\.jpg/)
  assert.match(html, /第 2 页，共 2 页 · 共 4 项/)
})

test('资源集合回收站详情只读，空集合保留添加入口', () => {
  const base = {
    auth: {
      user: {
        username: 'collection-owner',
        displayName: '集合用户',
        permissions: ['account.self.read', 'resource_collection.own.read', 'resource_collection.own.write'],
      },
      config: {},
    },
    activeTab: 'collections',
    loading: false,
    busy: false,
    notice: '',
    error: '',
    kml: { items: [], directories: { items: [], uncategorized: { name: '未分类' } }, selected: new Set(), usage: {} },
    favorites: { items: [], search: '' },
    shares: { items: [], search: '', status: '' },
    sessions: [],
  }
  const trashed = renderAccountShell({
    ...base,
    collections: {
      items: [], search: '', status: 'trashed', visibility: 'all', page: 1, limit: 20, sort: 'updatedAt', order: 'desc', total: 0,
      selected: { id: 'rc-trashed', name: '已归档集合', status: 'trashed', visibility: 'private', itemCount: 1, revision: 3, itemsRevision: 2 },
      itemResult: { items: [{ id: 'item-1', position: 0, title: '只读资源', url: 'https://example.com/a', type: 'image' }], total: 1 },
      itemPage: 1, itemLimit: 40, itemTotal: 1, itemPageCount: 1, itemHasNext: false, batchText: '',
    },
  })
  assert.match(trashed, /data-account-action="restore-collection"/)
  assert.doesNotMatch(trashed, /data-account-action="batch-add-collection-items"/)
  assert.doesNotMatch(trashed, /data-account-action="edit-collection-item"/)
  assert.doesNotMatch(trashed, /data-account-action="delete-collection-item"/)

  const empty = renderAccountShell({
    ...base,
    collections: {
      items: [], search: '', status: 'active', visibility: 'all', page: 1, limit: 20, sort: 'updatedAt', order: 'desc', total: 0,
      selected: { id: 'rc-empty', name: '待维护集合', status: 'active', visibility: 'private', itemCount: 0, revision: 1, itemsRevision: 1 },
      itemResult: { items: [], total: 0 },
      itemPage: 1, itemLimit: 40, itemTotal: 0, itemPageCount: 1, itemHasNext: false, batchText: '',
    },
  })
  assert.match(empty, /添加第一项/)
  assert.match(empty, /data-account-action="batch-add-collection-items"/)
  assert.match(empty, /data-account-action="add-collection-item"/)
})

test('资源集合来源选择器使用纵向选项布局，资源项标题可选而地址必填', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'src/map/resource-collection-source.js'), 'utf8')
  const dialogSource = fs.readFileSync(path.join(projectRoot, 'src/ui/dialog.js'), 'utf8')
  const appSource = fs.readFileSync(path.join(projectRoot, 'src/account/app.js'), 'utf8')
  const accountDialogSource = fs.readFileSync(path.join(projectRoot, 'src/account/dialogs.js'), 'utf8')
  const cssSource = fs.readFileSync(path.join(projectRoot, 'src/account/account.css'), 'utf8')
  assert.match(source, /choiceLayout: 'stacked'/)
  assert.match(source, /dataUrl/)
  assert.match(appSource, /name: 'title', label: '标题', required: false/)
  assert.match(appSource, /name: 'url', label: '资源地址', inputType: 'url', placeholder: 'https:\/\/', required: true/)
  assert.match(dialogSource, /const inputType = \['text', 'url', 'email', 'number', 'password'\]/)
  assert.match(accountDialogSource, /let closed = false/)
  assert.match(accountDialogSource, /closed = true[\s\S]*requestSequence \+= 1/)
  assert.match(accountDialogSource, /new AbortController\(\)/)
  assert.match(accountDialogSource, /requestController\?\.abort\(\)/)
  assert.match(accountDialogSource, /if \(closed \|\| sequence !== requestSequence\) return/)
  assert.match(cssSource, /\.account-collection-card-list\s*\{[\s\S]*grid-template-columns: repeat\(2/)
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.account-collection-card-list|@media \(max-width: 980px\)[\s\S]*\.account-collection-card-list/)
})

test('KML 配额只显示使用中占用并单列回收站物理存储', () => {
  const html = renderAccountShell({
    auth: {
      user: {
        username: 'quota-owner',
        displayName: '配额用户',
        permissions: ['account.self.read', 'kml.own.write'],
      },
      config: {},
    },
    activeTab: 'kml',
    loading: false,
    busy: false,
    notice: '',
    error: '',
    kml: {
      status: 'active',
      search: '',
      sort: 'position',
      order: 'asc',
      selected: new Set(),
      trashCount: 107,
      usage: {
        fileCount: 21,
        featureCount: 7000,
        trashCount: 107,
        trashFeatureCount: 855,
        trashByteSize: 2048,
        quota: { maxKmlFiles: 20000 },
      },
      directories: { items: [], uncategorized: { name: '未分类' } },
      items: [],
    },
    favorites: { items: [], search: '' },
    shares: { items: [], search: '', status: '' },
    sessions: [],
  })

  assert.match(html, /使用中已占用 21 \/ 20000 个文件，7,000 个要素/)
  assert.match(html, /回收站另有 107 个文件，855 个要素，2\.0 KB；不计入可用配额，清理前仍占存储/)
  assert.doesNotMatch(html, /使用中已占用 128/)
})

test('我的 KML 工具栏按筛选、文件操作和批量操作分区并使用短分享文案', () => {
  const html = renderAccountShell({
    auth: {
      user: {
        username: 'toolbar-owner',
        displayName: '工具栏用户',
        permissions: ['account.self.read', 'kml.own.write', 'share.own.manage'],
      },
      config: {},
    },
    activeTab: 'kml',
    loading: false,
    notice: '',
    error: '',
    twoBuluHelper: { available: true },
    kml: {
      status: 'active',
      search: '',
      sort: 'position',
      order: 'asc',
      selected: new Set(),
      trashCount: 3,
      usage: {},
      directories: { items: [], uncategorized: { name: '未分类' } },
      items: [{
        id: 'kml-toolbar',
        name: '工具栏测试',
        status: 'active',
        enabled: true,
        updatedAt: '2026-08-29T00:00:00.000Z',
        featureCount: 1,
        byteSize: 128,
      }],
    },
  })

  assert.match(html, /class="account-toolbar-query"/)
  assert.match(html, /class="account-toolbar-file-actions"/)
  assert.match(html, /class="account-toolbar-selection"/)
  assert.match(html, /class="account-import-menu"/)
  assert.match(html, /<summary>导入<\/summary>/)
  assert.match(html, /data-account-action="import-kml"/)
  assert.match(html, /data-account-action="import-2bulu"/)
  assert.match(html, /data-account-action="migrate-local"/)
  assert.match(html, /data-account-action="create-share"[^>]*>分享<\/button>/)
  assert.doesNotMatch(html, /创建多 KML 分享/)
})

test('分享密码生成器支持长度和特殊字符选项，并排除 URL 查询分隔符', () => {
  assert.deepEqual(SHARE_PASSWORD_LENGTH_OPTIONS, [8, 12, 16, 20, 24, 32])
  const password = generateStrongSharePassword(32)
  assert.equal(password.length, 32)
  assert.match(password, /[A-Z]/)
  assert.match(password, /[a-z]/)
  assert.match(password, /[2-9]/)
  assert.match(password, /[!$*+@]/)
  assert.doesNotMatch(password, /[?&#%=]/)

  const withoutSpecial = generateStrongSharePassword(16, { includeSpecialCharacters: false })
  assert.equal(withoutSpecial.length, 16)
  assert.doesNotMatch(withoutSpecial, /[^A-Za-z2-9]/)
})

test('两步路公开轨迹导入仅对登录写用户展示并复用同一弹窗契约', () => {
  const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8')
  const accountViewSource = fs.readFileSync(path.join(projectRoot, 'src/account/views.js'), 'utf8')
  const accountAppSource = fs.readFileSync(path.join(projectRoot, 'src/account/app.js'), 'utf8')
  const mapSource = fs.readFileSync(path.join(projectRoot, 'src/map/kml.js'), 'utf8')
  const syncSource = fs.readFileSync(path.join(projectRoot, 'src/map/kml-account-sync.js'), 'utf8')
  const dialogSource = fs.readFileSync(path.join(projectRoot, 'src/ui/two-bulu-import-dialog.js'), 'utf8')
  const allSources = `${accountAppSource}\n${mapSource}\n${dialogSource}`
  const mapImportHandler = mapSource.slice(
    mapSource.indexOf('async function handleTwoBuluImport'),
    mapSource.indexOf('function bindKmlPopupActions'),
  )

  assert.match(indexHtml, /id="kml-import-2bulu"[^>]*hidden/)
  assert.match(indexHtml, /data-kml-action="import-2bulu"/)
  assert.match(indexHtml, /id="kml-import-2bulu-batch"[^>]*hidden/)
  assert.match(accountViewSource, /data-account-action="import-2bulu"/)
  assert.match(accountViewSource, /data-account-action="import-2bulu-batch"/)
  assert.match(accountViewSource, /canImportTwoBulu[\s\S]*data-account-action="import-2bulu"/)
  assert.match(accountAppSource, /showTwoBuluImportDialog\(\)/)
  assert.match(accountAppSource, /requestTwoBuluKml\(values\)/)
  assert.match(accountAppSource, /finalizeTwoBuluImport\(helperResult,[\s\S]*status: 'success'/)
  assert.match(accountAppSource, /finalizeTwoBuluImport\(helperResult,[\s\S]*status: 'failed'/)
  assert.match(accountAppSource, /importTwoBuluBrowserHelperKml/)
  assert.match(accountAppSource, /requestTwoBuluBatchPreview/)
  assert.match(accountAppSource, /directoryId/)
  assert.match(accountAppSource, /sourceMode: helperResult\.sourceMode/)
  assert.match(accountAppSource, /completeness: helperResult\.completeness/)
  assert.match(accountAppSource, /warnings: helperResult\.warnings/)
  assert.match(mapSource, /twoBuluImportButton\.hidden = !canImportTwoBuluKml\(\)/)
  assert.match(mapSource, /auth\.authenticated[\s\S]*isAccountKmlWritable\(\)[\s\S]*hasPermission\('kml\.own\.write'/)
  assert.match(mapSource, /requestTwoBuluKml\(input\)/)
  assert.match(mapImportHandler, /finalizeTwoBuluImport\(helperResult/)
  assert.match(mapImportHandler, /status: savedResult \? 'success' : 'failed'/)
  assert.match(mapSource, /apiRequest\('\/kml\/import\/2bulu\/browser-helper'/)
  assert.match(mapImportHandler, /sourceMode: helperResult\.sourceMode/)
  assert.match(mapImportHandler, /completeness: helperResult\.completeness/)
  assert.match(mapImportHandler, /warnings: helperResult\.warnings/)
  assert.match(mapSource, /getTwoBuluHelperState\(\)\.available/)
  assert.ok(mapImportHandler.indexOf('registerKmlAccountDocument(importedKml)') < mapImportHandler.indexOf('saveToStorage()'))
  assert.match(mapSource, /fitKmlFilesBounds\(map, \[importedKml\]\)/)
  assert.match(syncSource, /export function registerKmlAccountDocument \(document, options = \{\}\)/)
  assert.match(dialogSource, /partialPolicy/)
  assert.match(dialogSource, /allow-track-only/)
  assert.doesNotMatch(allSources, /(?:window\.)?(?:alert|confirm|prompt)\s*\(/)
  assert.equal(twoBuluImportResultMessage({
    name: '测试轨迹',
    importSummary: { warnings: ['仅导入轨迹线'] },
  }), '测试轨迹 已导入；仅导入轨迹线')
})

test('两步路导入在响应未知时复用请求 ID，成功确认后才释放', () => {
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
  const intent = {
    url: 'https://www.2bulu.com/track/t-abc.htm',
    coordCorrection: 'wgs84-to-gcj02',
    partialPolicy: 'reject',
  }
  const first = prepareTwoBuluImportRequest(intent, { storage })
  const retry = prepareTwoBuluImportRequest(intent, { storage })
  const partial = prepareTwoBuluImportRequest({ ...intent, partialPolicy: 'allow-track-only' }, { storage })

  assert.equal(retry.requestId, first.requestId)
  assert.notEqual(partial.requestId, first.requestId)
  assert.equal(clearTwoBuluImportRequest(first, { storage }), true)
  assert.notEqual(prepareTwoBuluImportRequest(intent, { storage }).requestId, first.requestId)
})
