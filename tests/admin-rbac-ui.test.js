import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import {
  canAccessAdminPage,
  filterAdminPages,
  hasAdminPermission,
} from '../src/admin/access.js'
import {
  adminApi,
  clearAdminSessionState,
  loginAdmin,
} from '../src/admin/api.js'
import { renderUsersPage } from '../src/admin/pages/users.js'
import { renderUserSystemSettingsPage } from '../src/admin/pages/userSystemSettings.js'
import { renderShareModerationPage } from '../src/admin/pages/shareModeration.js'
import { handleInteractionPolicySubmit, renderInteractionPolicyPage } from '../src/admin/pages/interaction.js'
import { ADMIN_PERMISSION_CATALOG } from '../src/admin/pages/roles.js'
import { PERMISSIONS } from '../service/bin/user/permissions.js'

function sessionWith (...permissions) {
  return {
    authenticated: true,
    user: {
      id: 'usr_test',
      username: 'operator',
      permissions,
    },
  }
}

function jsonResponse (result, options = {}) {
  return {
    ok: options.ok !== false,
    status: options.status || 200,
    statusText: options.statusText || 'OK',
    headers: { get: name => String(name).toLowerCase() === 'content-type' ? 'application/json' : null },
    json: async () => options.payload || { code: 0, result, error: null },
  }
}

test('后台导航按细粒度权限过滤，超级管理员可访问全部页面', () => {
  const pages = [
    { id: 'overview', permission: 'admin.overview.read' },
    { id: 'users', permission: 'admin.user.read' },
    { id: 'user-system', permissions: ['admin.registration.manage', 'admin.security.manage'] },
    { id: 'shares', permission: 'admin.share.moderate' },
  ]
  const shareAdmin = sessionWith('admin.overview.read', 'admin.share.moderate')
  assert.deepEqual(
    filterAdminPages(pages, shareAdmin).map(page => page.id),
    ['overview', 'shares'],
  )
  assert.equal(hasAdminPermission(shareAdmin, 'admin.user.read'), false)
  assert.equal(canAccessAdminPage(pages[1], shareAdmin), false)

  const superAdmin = sessionWith('system.super_admin')
  assert.deepEqual(
    filterAdminPages(pages, superAdmin).map(page => page.id),
    pages.map(page => page.id),
  )
})

test('角色编辑器权限目录与服务端权限种子保持一致', () => {
  const frontendPermissions = ADMIN_PERMISSION_CATALOG.map(([code]) => code)
  const backendPermissions = PERMISSIONS
    .map(permission => permission.code)
    .filter(code => code !== 'system.super_admin')

  assert.deepEqual(frontendPermissions, backendPermissions)
})

test('空间分享策略只对超级管理员呈现', () => {
  const settings = {
    userSystemSettings: {
      share: {
        spatialAccessEnabled: true,
        spatialPaddingMeters: 1000,
        spatialMaxAreaKm2: 10000,
        spatialMaxDiagonalKm: 300,
        spatialUnrestrictedTileMaxZoom: 14,
        unlimitedAccessEnabled: true,
        unlimitedAccessMaxAreaKm2: 2000,
        unlimitedAccessMaxDiagonalKm: 100,
      },
    },
    roles: [],
  }
  const securityHtml = renderUserSystemSettingsPage({ ...settings, session: sessionWith('admin.security.manage') })
  const superHtml = renderUserSystemSettingsPage({ ...settings, session: sessionWith('system.super_admin') })
  assert.doesNotMatch(securityHtml, /name="spatialAccessEnabled"/)
  assert.match(superHtml, /name="spatialAccessEnabled"/)
  assert.match(superHtml, /name="unlimitedAccessMaxAreaKm2"/)
  assert.match(superHtml, /name="spatialUnrestrictedTileMaxZoom"[^>]*max="24"/)
  assert.equal(typeof adminApi.previewUserSystemSettings, 'function')
})

test('用户体系设置展示 KML 批量下载与强制聚合开关且默认关闭', () => {
  const html = renderUserSystemSettingsPage({
    userSystemSettings: {},
    roles: [],
    session: sessionWith('admin.security.manage'),
  })

  assert.match(html, /name="kmlBatchDownloadEnabled"/)
  assert.match(html, /value="false" selected>禁止/)
  assert.match(html, /name="kmlClusterForceEnabled"/)
  assert.match(html, /name="kmlClusterForceEnabled"[\s\S]*value="false" selected>关闭/)
})

test('分享治理页展示空间范围、授权模式和安全摘要', () => {
  const html = renderShareModerationPage({
    shareFilters: {},
    moderatedShares: {
      total: 1,
      items: [{
        id: 'share_1',
        title: '巡检分享',
        itemCount: 2,
        owner: { username: 'operator', displayName: '操作员' },
        status: 'active',
        passwordProtected: true,
        passwordAccess: { ttlMode: 'unlimited' },
        spatialAccess: { mode: 'kml_bounds', status: 'ready', areaKm2: 12.3, diagonalKm: 8.4 },
        accessCount: 3,
      }],
    },
  })
  assert.match(html, /空间与授权/)
  assert.match(html, /data-admin-action="delete-share"/)
  assert.equal(typeof adminApi.deleteUserShare, 'function')
  assert.match(html, /限制在 KML 区域/)
  assert.match(html, /12\.3 km²/)
  assert.match(html, /8\.4 km/)
  assert.match(html, /不限授权/)
})

test('留言策略页提供匿名留言开关，并保留未展示策略字段', async () => {
  const state = {
    session: sessionWith('admin.comment.policy.manage'),
    interactionPolicy: {
      version: 3,
      published: true,
      policy: {
        comments: {
          enabled: true,
          anonymous: { enabled: false, contactRequirement: 'email_or_phone', requireConsent: true },
          maxLength: 2000,
          moderationRequired: true,
          publicReplyEnabled: false,
          retention: { approvedCommentDays: 30 },
        },
        moderation: { ai: { enabled: true }, keywords: { enabled: true } },
        reports: { enabled: true, types: ['privacy'], targetScopes: ['media'] },
        mediaDetails: { generalDescription: '当前统一详情说明' },
      },
    },
  }
  const html = renderInteractionPolicyPage(state)
  assert.match(html, /允许匿名留言/)
  assert.match(html, /name="anonymousCommentsEnabled"/)
  assert.match(html, /name="mediaDetailsGeneralDescription"/)
  assert.match(html, /maxlength="1000"/)
  assert.match(html, /当前统一详情说明/)
  assert.match(html, /data-interaction-policy-form/)

  const values = {
    commentsEnabled: { checked: true },
    anonymousCommentsEnabled: { checked: true },
    anonymousContactRequirement: { value: 'email' },
    anonymousRequireConsent: { checked: true },
    commentsMaxLength: { value: '1800' },
    commentsModerationRequired: { checked: false },
    reportsEnabled: { checked: true },
    anonymousReportsEnabled: { checked: true },
    mediaDetailsGeneralDescription: { value: '新的统一详情说明' },
  }
  const form = { elements: values, closest: selector => selector === '[data-interaction-policy-form]' ? form : null }
  const event = { preventDefault: () => {}, target: { closest: selector => selector === '[data-interaction-policy-form]' ? form : null } }
  let payload
  await handleInteractionPolicySubmit({
    api: { updateInteractionPolicy: async value => { payload = value; return { version: 4 } } },
    event,
    renderDashboard: () => {},
    setNotice: () => {},
    state,
  })
  assert.equal(payload.comments.anonymous.enabled, true)
  assert.equal(payload.comments.maxLength, 1800)
  assert.equal(payload.comments.publicReplyEnabled, false)
  assert.deepEqual(payload.comments.retention, { approvedCommentDays: 30 })
  assert.deepEqual(payload.moderation, { ai: { enabled: true }, keywords: { enabled: true } })
  assert.deepEqual(payload.reports.types, ['privacy'])
  assert.equal(payload.mediaDetails.generalDescription, '新的统一详情说明')
})

test('后台修改请求使用同源 Cookie 和 CSRF，不发送 Bearer Token', async () => {
  const calls = []
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  globalThis.document = { cookie: 'map_csrf_token=csrf%20value' }
  globalThis.window = {
    FormData: globalThis.FormData,
  }
  globalThis.fetch = async (...args) => {
    calls.push(args)
    return jsonResponse({ status: 'ok' })
  }

  try {
    await adminApi.updateUser('usr/with slash', { status: 'disabled' })
    const [url, options] = calls[0]
    assert.equal(url, '/api/v1/admin/users/usr%2Fwith%20slash')
    assert.equal(options.method, 'PUT')
    assert.equal(options.credentials, 'same-origin')
    assert.equal(options.headers.get('X-CSRF-Token'), 'csrf value')
    assert.equal(options.headers.has('Authorization'), false)
    assert.deepEqual(JSON.parse(options.body), { status: 'disabled' })
  } finally {
    clearAdminSessionState()
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.fetch = previousFetch
  }
})

test('管理登录使用统一兼容入口且不会读取 LocalStorage Token', async () => {
  const calls = []
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousFetch = globalThis.fetch
  globalThis.document = { cookie: '' }
  globalThis.window = {
    FormData: globalThis.FormData,
    localStorage: new Proxy({}, {
      get () {
        throw new Error('不应访问 localStorage')
      },
    }),
  }
  globalThis.fetch = async (...args) => {
    calls.push(args)
    return jsonResponse({
      user: { username: 'admin', permissions: ['admin.overview.read'] },
      expiresAt: '2026-08-06T00:00:00.000Z',
    })
  }

  try {
    await loginAdmin({ username: 'admin', password: 'safe-password' })
    const [url, options] = calls[0]
    assert.equal(url, '/api/v1/admin/auth/login')
    assert.equal(options.credentials, 'same-origin')
    assert.equal(options.headers.has('Authorization'), false)
    assert.equal(options.headers.has('X-CSRF-Token'), false)
  } finally {
    clearAdminSessionState()
    globalThis.window = previousWindow
    globalThis.document = previousDocument
    globalThis.fetch = previousFetch
  }
})

test('用户管理页面转义账号数据并按权限隐藏管理操作', () => {
  const html = renderUsersPage({
    session: sessionWith('admin.user.read'),
    roles: [],
    adminUserFilters: {},
    adminUsers: {
      items: [{
        id: 'usr_1',
        username: '<script>alert(1)</script>',
        displayName: '<img src=x onerror=alert(1)>',
        status: 'active',
        roles: ['user'],
        usage: {},
      }],
      page: 1,
      limit: 20,
      total: 1,
    },
  })

  assert.equal(html.includes('<script>'), false)
  assert.equal(html.includes('<img src=x'), false)
  assert.match(html, /&lt;script&gt;/)
  assert.equal(html.includes('data-admin-action="edit-user"'), false)
  assert.equal(html.includes('data-admin-user-create'), false)
})

test('后台源码不再保存旧管理 Token，也不使用原生阻塞弹窗', async () => {
  const adminDir = path.resolve('src/admin')
  const files = []
  async function collect (dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name)
      if (entry.isDirectory()) await collect(target)
      else if (entry.name.endsWith('.js')) files.push(target)
    }
  }
  await collect(adminDir)
  const source = (await Promise.all(files.map(file => fs.readFile(file, 'utf8')))).join('\n')

  assert.equal(source.includes('mapServiceAdminToken'), false)
  assert.doesNotMatch(source, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/)

  const routesSource = await fs.readFile(path.join(adminDir, 'routes.js'), 'utf8')
  for (const permission of [
    'admin.overview.read',
    'admin.cache.manage',
    'admin.public_kml.manage',
    'admin.precache.manage',
    'admin.layer.manage',
    'admin.user.read',
    'admin.role.manage',
    'admin.registration.manage',
    'admin.security.manage',
    'admin.share.moderate',
    'admin.audit.read',
  ]) {
    assert.match(routesSource, new RegExp(`['"]${permission.replaceAll('.', '\\.')}['"]`))
  }
})
