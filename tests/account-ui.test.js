import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildApiUrl,
  getCsrfToken,
  parseCookieString,
  shouldAttachCsrf,
} from '../src/auth/api.js'
import { normalizeSessionResult } from '../src/auth/session.js'
import {
  buildShareUpdateItems,
  buildShareViewConfig,
  buildShareItems,
  getAccountCapabilities,
  getAvailableAccountTabs,
  isAccountLocation,
  normalizeAccountTab,
  normalizeKmlSort,
  parseLocalKmlFiles,
  partitionKmlTrashSelection,
  revisionConflictPrompt,
  sanitizeReturnTo,
  shareAccessPolicyLabel,
} from '../src/account/model.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('认证客户端从可读 Cookie 获取 CSRF Token 且仅修改请求携带', () => {
  const cookies = parseCookieString('map_user_session=hidden; map_csrf_token=a%2Bb%3D%3D; theme=dark')
  assert.equal(cookies.map_user_session, 'hidden')
  assert.equal(getCsrfToken('map_csrf_token=a%2Bb%3D%3D'), 'a+b==')
  assert.equal(shouldAttachCsrf('GET'), false)
  assert.equal(shouldAttachCsrf('POST'), true)
  assert.equal(shouldAttachCsrf('delete'), true)
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
})

test('多 KML 分享只包含所选活跃文件且最多 20 个', () => {
  const documents = Array.from({ length: 23 }, (_, index) => ({
    id: `kml_${index}`,
    status: index === 1 ? 'trashed' : 'active',
  }))
  const items = buildShareItems(documents.map(item => item.id), documents)
  assert.equal(items.length, 20)
  assert.equal(items.some(item => item.kmlId === 'kml_1'), false)
  assert.deepEqual(items[0], {
    kmlId: 'kml_0',
    position: 0,
    visibleByDefault: true,
  })
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
  assert.match(map3dHtml, /data-admin-identity-item hidden/)
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
  assert.match(mainSource, /if \(!shareMode\) \{\s*initGuidelines\(map\)/)
  assert.match(map3dSource, /public\/kml-shares\/.*\/map\/catalog/)
  assert.match(map3dSource, /if \(isShareLocation\(window\.location\)\) return/)
  assert.match(layerSource, /options\.catalogUrl/)
  assert.match(urlStateSource, /options\.persist === false/)
})

test('用户中心 KML 与分享管理使用统一 Dialog 并具备完整编辑入口', () => {
  const appSource = fs.readFileSync(path.join(projectRoot, 'src/account/app.js'), 'utf8')
  const viewSource = fs.readFileSync(path.join(projectRoot, 'src/account/views.js'), 'utf8')
  const dialogSource = fs.readFileSync(path.join(projectRoot, 'src/account/dialogs.js'), 'utf8')
  const accountSource = `${appSource}\n${viewSource}\n${dialogSource}`
  const sessionSource = fs.readFileSync(path.join(projectRoot, 'src/auth/session.js'), 'utf8')

  assert.match(viewSource, /name="sort"/)
  assert.match(viewSource, /data-account-action="trash-selected-kml"/)
  assert.match(appSource, /for \(const item of selection\.eligible\)/)
  assert.match(appSource, /showAccountShareDialog\(\{ share, documents \}\)/)
  assert.match(dialogSource, /data-account-share-move="up"/)
  assert.match(dialogSource, /data-account-share-visible/)
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
  assert.doesNotMatch(appSource, /state\.auth = await refreshAuthSession\(\)\s*await loadSessions\(\)/)
  assert.doesNotMatch(sessionSource, /export async function logout \(\) \{[\s\S]*?\} finally \{/)
  assert.doesNotMatch(accountSource, /(?:window\.)?(?:alert|confirm|prompt)\s*\(/)
})
