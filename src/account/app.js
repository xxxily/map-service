import './account.css'
import { accountApi, saveDownload } from './api.js'
import { showAccountPasswordDialog, showAccountShareAccessEventsDialog, showAccountShareDialog } from './dialogs.js'
import {
  buildShareItems,
  getAccountCapabilities,
  isAccountLocation,
  normalizeAccountTab,
  normalizeKmlSort,
  normalizePagedResult,
  parseLocalKmlFiles,
  parseTags,
  partitionKmlTrashSelection,
  registrationEnabled,
  revisionConflictPrompt,
  sanitizeReturnTo,
} from './model.js'
import { renderAccountShell, renderAuthView } from './views.js'
import {
  getAuthSnapshot,
  initializeAuth,
  login,
  logout,
  refreshAuthSession,
  register,
  subscribeAuth,
} from '../auth/session.js'
import { showAlert, showChoiceDialog, showConfirm, showEditDialog } from '../ui/dialog.js'
import {
  clearTwoBuluImportRequest,
  showTwoBuluImportDialog,
  twoBuluImportResultMessage,
} from '../ui/two-bulu-import-dialog.js'
import {
  finalizeTwoBuluImport,
  getTwoBuluHelperState,
  probeTwoBuluHelper,
  requestTwoBuluKml,
  subscribeTwoBuluHelper,
  TWO_BULU_HELPER_PROTOCOL_VERSION,
} from '../integrations/two-bulu-helper-bridge.js'

const LOCAL_KML_KEY = 'map_kml_list'
const LOCAL_MIGRATION_STATE_KEY = 'map_account_local_migration'
const KML_WRITE_ACTIONS = new Set([
  'create-kml', 'edit-kml', 'import-kml', 'import-2bulu', 'migrate-local', 'trash-selected-kml',
  'trash-kml', 'restore-kml', 'delete-kml',
])
const SHARE_ACTIONS = new Set([
  'create-share', 'go-kml-share', 'copy-share', 'edit-share', 'toggle-share',
  'share-access-events', 'sync-share', 'rotate-share', 'revoke-share',
])
const FAVORITE_ACTIONS = new Set(['edit-favorite', 'cancel-favorite-edit', 'delete-favorite'])
const SESSION_ACTIONS = new Set(['revoke-session', 'logout-other-sessions'])

const state = {
  root: null,
  auth: getAuthSnapshot(),
  authMode: 'login',
  activeTab: 'profile',
  loading: false,
  busy: false,
  notice: '',
  error: '',
  profile: null,
  kml: {
    items: [],
    usage: {},
    status: 'active',
    search: '',
    sort: 'updatedAt',
    order: 'desc',
    selected: new Set(),
  },
  favorites: { items: [], search: '' },
  favoriteDraft: null,
  shares: { items: [], search: '', status: '' },
  sessions: [],
  twoBuluHelper: getTwoBuluHelperState(),
}

function render () {
  if (!state.root) return
  state.root.setAttribute('aria-busy', String(state.busy || state.loading || state.auth.loading))
  state.root.innerHTML = state.auth.authenticated
    ? renderAccountShell(state)
    : renderAuthView(state)
}

function setMessage (notice = '', error = '') {
  state.notice = notice
  state.error = error
}

function clearPrivateState () {
  state.profile = null
  state.kml.items = []
  state.kml.usage = {}
  state.kml.selected.clear()
  state.favorites.items = []
  state.favoriteDraft = null
  state.shares.items = []
  state.sessions = []
}

function capabilities () {
  return getAccountCapabilities(state.auth.user)
}

function shareAnalyticsPolicy () {
  return state.auth.config?.analytics?.sharePolicy || {}
}

function requireCapability (key, message = '当前账号没有执行此操作的权限') {
  if (capabilities()[key]) return true
  setMessage('', message)
  render()
  return false
}

async function handleApiError (error) {
  if (error.code === 'PASSWORD_CHANGE_REQUIRED') {
    state.activeTab = 'security'
    window.history.replaceState(null, '', '#security')
    setMessage('', '请先修改临时密码')
    return
  }
  const conflict = revisionConflictPrompt(error.code)
  if (conflict) {
    setMessage('', conflict.message)
    const reload = await showConfirm(conflict.message, {
      title: conflict.title,
      confirmText: '立即重新加载',
    })
    if (!reload) return
    try {
      if (conflict.resource === 'kml') await loadKml()
      else await loadShares()
      setMessage(conflict.success, '')
    } catch (reloadError) {
      setMessage('', reloadError.message || '重新加载失败，请稍后重试')
    }
    return
  }
  setMessage('', error.message || '请求失败')
}

async function runAction (action, options = {}) {
  if (state.busy) return null
  state.busy = true
  setMessage(options.progress || '正在处理…', '')
  render()
  try {
    const result = await action()
    setMessage(options.success || '', '')
    return result
  } catch (error) {
    await handleApiError(error)
    return null
  } finally {
    state.busy = false
    render()
  }
}

async function loadProfile () {
  state.profile = await accountApi.getProfile()
}

async function loadKml () {
  const sorting = normalizeKmlSort(state.kml.sort, state.kml.order)
  state.kml.sort = sorting.sort
  state.kml.order = sorting.order
  const result = normalizePagedResult(await accountApi.listKml({
    page: 1,
    limit: 100,
    status: state.kml.status,
    search: state.kml.search,
    sort: state.kml.sort,
    order: state.kml.order,
  }))
  state.kml.items = result.items
  state.kml.usage = result.usage || {}
  const visibleIds = new Set(result.items.map(item => item.id))
  state.kml.selected = new Set(Array.from(state.kml.selected).filter(id => visibleIds.has(id)))
}

async function loadFavorites () {
  const result = normalizePagedResult(await accountApi.listFavorites({
    page: 1,
    limit: 100,
    search: state.favorites.search,
    sort: 'updatedAt',
    order: 'desc',
  }))
  state.favorites.items = result.items
}

async function loadShares () {
  const result = normalizePagedResult(await accountApi.listShares({
    page: 1,
    limit: 100,
    search: state.shares.search,
    status: state.shares.status,
  }))
  state.shares.items = result.items
}

async function loadSessions () {
  const result = await accountApi.listSessions()
  state.sessions = Array.isArray(result) ? result : (result?.items || [])
}

async function loadActivePanel () {
  if (!state.auth.authenticated) return
  if (state.auth.user?.mustChangePassword && state.activeTab !== 'security') {
    state.activeTab = 'security'
    window.history.replaceState(null, '', '#security')
  }
  state.activeTab = normalizeAccountTab(state.activeTab, state.auth.user)
  window.history.replaceState(null, '', `#${state.activeTab}`)
  state.loading = true
  render()
  try {
    if (state.activeTab === 'kml') await loadKml()
    else if (state.activeTab === 'favorites') await loadFavorites()
    else if (state.activeTab === 'shares') await loadShares()
    else if (state.activeTab === 'security') {
      if (capabilities().canManageSessions) await loadSessions()
      else state.sessions = []
    } else await loadProfile()
    setMessage('', '')
  } catch (error) {
    await handleApiError(error)
  } finally {
    state.loading = false
    render()
  }
}

function writeActiveTab (tab) {
  state.activeTab = normalizeAccountTab(tab, state.auth.user)
  window.history.replaceState(null, '', `#${state.activeTab}`)
}

function getReturnTarget () {
  return sanitizeReturnTo(new URLSearchParams(window.location.search).get('returnTo'), '')
}

async function handleLogin (form) {
  await runAction(async () => {
    const next = await login({
      username: form.elements.username.value,
      password: form.elements.password.value,
      remember: form.elements.remember.checked,
    })
    state.auth = next
    const returnTo = getReturnTarget()
    if (returnTo && !isAccountLocation(returnTo.split(/[?#]/)[0])) {
      window.location.assign(returnTo)
      return
    }
    writeActiveTab(next.user?.mustChangePassword ? 'security' : state.activeTab)
    await loadActivePanel()
  }, { progress: '正在登录…' })
}

async function handleRegister (form) {
  if (!registrationEnabled(state.auth.config)) {
    setMessage('', '当前未开放注册')
    render()
    return
  }
  const password = form.elements.password.value
  if (password !== form.elements.passwordConfirm.value) {
    setMessage('', '两次输入的密码不一致')
    render()
    return
  }
  await runAction(async () => {
    await register({
      username: form.elements.username.value,
      displayName: form.elements.displayName.value,
      email: form.elements.email.value,
      password,
    })
    state.authMode = 'login'
  }, {
    progress: '正在提交注册…',
    success: '注册请求已受理。如账号可用，请使用刚才填写的用户名和密码登录。',
  })
}

async function handleProfileSubmit (form) {
  if (!requireCapability('canUpdateProfile')) return
  const result = await runAction(() => accountApi.updateProfile({
    displayName: form.elements.displayName.value,
    email: form.elements.email.value,
  }), { progress: '正在保存资料…', success: '个人资料已更新' })
  if (!result) return
  state.profile = result
  state.auth = await refreshAuthSession()
  render()
}

async function handlePasswordSubmit (form) {
  const newPassword = form.elements.newPassword.value
  if (newPassword !== form.elements.passwordConfirm.value) {
    setMessage('', '两次输入的新密码不一致')
    render()
    return
  }
  const result = await runAction(() => accountApi.changePassword({
    currentPassword: form.elements.currentPassword.value,
    newPassword,
  }), { progress: '正在更新密码…', success: '密码已更新，其他会话已注销' })
  if (!result) return
  form.reset()
  state.auth = await refreshAuthSession()
  if (capabilities().canManageSessions) await loadSessions()
  else state.sessions = []
  render()
}

async function handleFavoriteSubmit (form) {
  if (!requireCapability('canManageFavorites')) return
  const id = form.elements.id.value
  const body = {
    name: form.elements.name.value,
    note: form.elements.note.value,
    longitude: Number(form.elements.longitude.value),
    latitude: Number(form.elements.latitude.value),
    sourceType: 'map',
    address: form.elements.address.value,
    category: form.elements.category.value,
    tags: parseTags(form.elements.tags.value),
    color: form.elements.color.value,
  }
  const result = await runAction(
    () => id ? accountApi.updateFavorite(id, body) : accountApi.createFavorite(body),
    { progress: '正在保存收藏…', success: id ? '收藏已更新' : '收藏已添加' },
  )
  if (!result) return
  state.favoriteDraft = null
  await loadFavorites()
  render()
}

async function handleSubmit (event) {
  const form = event.target.closest('[data-account-form]')
  if (!form) return
  event.preventDefault()
  const type = form.dataset.accountForm
  if (type === 'login') return handleLogin(form)
  if (type === 'register') return handleRegister(form)
  if (type === 'profile') return handleProfileSubmit(form)
  if (type === 'password') return handlePasswordSubmit(form)
  if (type === 'favorite') return handleFavoriteSubmit(form)
  if (type === 'kml-filter') {
    state.kml.search = form.elements.search.value.trim()
    state.kml.status = form.elements.status.value
    const sorting = normalizeKmlSort(form.elements.sort.value, form.elements.order.value)
    state.kml.sort = sorting.sort
    state.kml.order = sorting.order
    return loadActivePanel()
  }
  if (type === 'favorite-filter') {
    state.favorites.search = form.elements.search.value.trim()
    return loadActivePanel()
  }
  if (type === 'share-filter') {
    state.shares.search = form.elements.search.value.trim()
    state.shares.status = form.elements.status.value
    return loadActivePanel()
  }
}

async function createKml () {
  if (!requireCapability('canWriteKml', '当前账号只有 KML 查看权限')) return
  const values = await showEditDialog({
    title: '新建 KML',
    fields: [
      { name: 'name', label: '文件名称' },
      { name: 'description', label: '描述', type: 'textarea' },
    ],
    values: { name: '新建 KML', description: '' },
    confirmText: '创建',
  })
  if (!values) return
  const result = await runAction(() => accountApi.createKml(values), {
    progress: '正在创建 KML…', success: 'KML 已创建',
  })
  if (result) await loadKml()
  render()
}

async function editKml (id) {
  if (!requireCapability('canWriteKml', '当前账号只有 KML 查看权限')) return
  const item = state.kml.items.find(entry => entry.id === id)
  if (!item) return
  const values = await showEditDialog({
    title: '编辑 KML 信息',
    fields: [
      { name: 'name', label: '文件名称' },
      { name: 'description', label: '描述', type: 'textarea' },
      { name: 'color', label: '主题色' },
      { name: 'theme', label: '显示主题', type: 'select', options: [{ label: '默认主题', value: 'default' }, { label: '简洁主题', value: 'simple' }] },
      { name: 'coordCorrection', label: '坐标纠偏', type: 'select', options: [{ label: 'WGS84 转 GCJ-02', value: 'wgs84-to-gcj02' }, { label: '不纠偏', value: 'none' }] },
      { name: 'enabled', label: '文件启用状态', type: 'select', options: [{ label: '启用', value: 'true' }, { label: '禁用', value: 'false' }] },
      { name: 'lockDrag', label: '拖拽锁定', type: 'select', options: [{ label: '关闭', value: 'false' }, { label: '开启', value: 'true' }] },
      {
        name: 'isDefault',
        label: '默认 KML',
        type: 'select',
        options: item.isDefault
          ? [{ label: '当前默认（保持）', value: 'true' }]
          : [{ label: '保持为普通 KML', value: 'false' }, { label: '设为默认 KML', value: 'true' }],
      },
    ],
    values: {
      name: item.name,
      description: item.description,
      color: item.color || '#0f766e',
      theme: item.theme || 'default',
      coordCorrection: item.coordCorrection || 'wgs84-to-gcj02',
      enabled: String(item.enabled !== false),
      lockDrag: String(Boolean(item.lockDrag)),
      isDefault: String(Boolean(item.isDefault)),
    },
  })
  if (!values) return
  const result = await runAction(() => accountApi.updateKml(id, {
    revision: item.revision,
    name: values.name,
    description: values.description,
    color: values.color,
    theme: values.theme,
    coordCorrection: values.coordCorrection,
    enabled: values.enabled === 'true',
    lockDrag: values.lockDrag === 'true',
    isDefault: values.isDefault === 'true',
  }), { progress: '正在更新 KML…', success: 'KML 信息已更新' })
  if (result) await loadKml()
  render()
}

async function importKmlFile (file) {
  if (!requireCapability('canWriteKml', '当前账号只有 KML 查看权限')) return
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.kml')) {
    await showAlert('请选择 .kml 文件')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    await showAlert('KML 文件不能超过 10 MB')
    return
  }
  const result = await runAction(() => accountApi.importKml(file, {
    coordCorrection: 'wgs84-to-gcj02',
  }), { progress: '正在解析并导入 KML…', success: `${file.name} 已导入` })
  if (result) await loadKml()
  render()
}

async function importTwoBuluKml () {
  if (!requireCapability('canWriteKml', '当前账号只有 KML 查看权限')) return
  if (!state.twoBuluHelper.available) {
    setMessage('', '未检测到已安装并授权当前站点的两步路浏览器助手，请安装或授权后刷新页面。')
    render()
    return
  }
  const values = await showTwoBuluImportDialog()
  if (!values) return
  const result = await runAction(async () => {
    const helperResult = await requestTwoBuluKml(values)
    try {
      const saved = await accountApi.importTwoBuluBrowserHelperKml({
        ...values,
        protocolVersion: TWO_BULU_HELPER_PROTOCOL_VERSION,
        helperVersion: helperResult.helperVersion,
        name: helperResult.name,
        kmlText: helperResult.kmlText,
        sourceMode: helperResult.sourceMode,
        completeness: helperResult.completeness,
        warnings: helperResult.warnings,
      })
      await finalizeTwoBuluImport(helperResult, {
        status: 'success',
        message: twoBuluImportResultMessage(saved),
      })
      return saved
    } catch (error) {
      await finalizeTwoBuluImport(helperResult, {
        status: 'failed',
        message: `map-service 保存失败：${error?.message || '请返回原页面查看原因后重试。'}`,
      })
      throw error
    }
  }, {
    progress: '正在通过浏览器助手读取并导入两步路轨迹…',
    success: '两步路轨迹已导入',
  })
  if (result) {
    await loadKml()
    clearTwoBuluImportRequest(values)
    setMessage(twoBuluImportResultMessage(result), '')
  }
  render()
}

function getMigrationBatchId (rawValue, fileCount) {
  const fingerprint = `${rawValue.length}:${fileCount}:${rawValue.slice(0, 64)}`
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_MIGRATION_STATE_KEY) || 'null')
    if (saved?.fingerprint === fingerprint && saved?.batchId) return saved.batchId
  } catch {}
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const batchId = `local-${randomPart}`
  localStorage.setItem(LOCAL_MIGRATION_STATE_KEY, JSON.stringify({ fingerprint, batchId }))
  return batchId
}

function expiresAtFromMode (mode) {
  if (!mode || mode === 'none') return null
  const dayCount = { '7d': 7, '30d': 30, '90d': 90 }[mode]
  return dayCount ? new Date(Date.now() + dayCount * 24 * 60 * 60 * 1000).toISOString() : undefined
}

async function migrateLocalKml () {
  if (!requireCapability('canWriteKml', '当前账号只有 KML 查看权限')) return
  let rawValue = ''
  try {
    rawValue = localStorage.getItem(LOCAL_KML_KEY) || ''
  } catch {
    await showAlert('浏览器本地存储不可用，无法读取本地 KML')
    return
  }
  const parsed = parseLocalKmlFiles(rawValue)
  if (!parsed.files.length) {
    await showAlert('未发现可迁移的本地 KML 数据')
    return
  }
  const confirmed = await showConfirm(`将 ${parsed.files.length} 个本地 KML 复制到当前账号。完成后不会自动删除浏览器本地数据。${parsed.invalidCount ? `\n已忽略 ${parsed.invalidCount} 条无效数据。` : ''}`, {
    title: '迁移本地 KML',
    confirmText: '开始迁移',
  })
  if (!confirmed) return
  const batchId = getMigrationBatchId(rawValue, parsed.files.length)
  const result = await runAction(() => accountApi.migrateLocalKml({
    batchId,
    files: parsed.files,
    conflictStrategy: 'rename',
  }), { progress: '正在迁移本地 KML…' })
  if (!result) return
  localStorage.removeItem(LOCAL_MIGRATION_STATE_KEY)
  await loadKml()
  setMessage(`迁移完成：导入 ${Number(result.importedCount || 0)} 个，跳过 ${Number(result.skippedCount || 0)} 个。本地原数据仍已保留。`, '')
  render()
}

async function trashSelectedKml () {
  if (!requireCapability('canWriteKml', '当前账号只有 KML 查看权限')) return
  const selection = partitionKmlTrashSelection(state.kml.selected, state.kml.items)
  const skippedCount = selection.skippedDefault.length + selection.skippedInactive.length + selection.skippedMissing.length
  if (!selection.eligible.length) {
    await showAlert(`所选文件中没有可移入回收站的 KML。默认 KML 和非活跃 KML 会被跳过。${skippedCount ? `\n已跳过 ${skippedCount} 个。` : ''}`, {
      title: '无法批量移入回收站',
    })
    return
  }
  const confirmed = await showConfirm(
    `将 ${selection.eligible.length} 个 KML 逐项移入回收站，并立即从相关分享包中移除。${skippedCount ? `\n另有 ${skippedCount} 个默认、非活跃或已不在列表的文件会被跳过。` : ''}`,
    { title: '批量移入回收站', confirmText: '开始处理' },
  )
  if (!confirmed) return

  const result = await runAction(async () => {
    const succeeded = []
    const failed = []
    for (const item of selection.eligible) {
      try {
        await accountApi.trashKml(item.id)
        succeeded.push(item)
      } catch (error) {
        failed.push({ item, message: error.message || '请求失败' })
      }
    }
    return { succeeded, failed }
  }, { progress: `正在逐项处理 ${selection.eligible.length} 个 KML…` })
  if (!result) return

  result.succeeded.forEach(item => state.kml.selected.delete(item.id))
  await loadKml()
  const summary = `批量处理完成：成功 ${result.succeeded.length} 个，失败 ${result.failed.length} 个，跳过 ${skippedCount} 个。`
  setMessage(summary, '')
  render()
  if (result.failed.length) {
    const details = result.failed.slice(0, 5).map(({ item, message }) => `${item.name}：${message}`).join('\n')
    await showAlert(`${summary}\n${details}${result.failed.length > 5 ? `\n另有 ${result.failed.length - 5} 个失败项。` : ''}`, {
      title: '部分 KML 处理失败',
    })
  }
}

async function createShareFromSelection () {
  if (!requireCapability('canManageShares')) return
  const items = buildShareItems(state.kml.selected, state.kml.items)
  if (!items.length) return
  const selectedNames = state.kml.items.filter(item => state.kml.selected.has(item.id)).map(item => item.name)
  const values = await showAccountShareDialog({
    mode: 'create',
    share: {
      title: selectedNames.join('、').slice(0, 200),
      storedStatus: 'active',
      allowDownload: true,
      items,
      viewConfig: { mapMode: '2d' },
    },
    documents: state.kml.items,
    analyticsPolicy: shareAnalyticsPolicy(),
    onSpatialPreview: previewItems => accountApi.spatialPreview({
      items: previewItems,
      spatialAccess: { mode: 'kml_bounds' },
    }),
  })
  if (!values) return
  let password
  if (values.passwordAction === 'change') {
    password = await showAccountPasswordDialog({
      title: '设置分享密码',
      message: '访问者需输入该密码后才能查看分享内容，长度为 4～128 位。',
      label: '分享密码',
      minLength: 4,
      autocomplete: 'new-password',
      confirmText: '创建分享',
      generate: true,
    })
    if (!password) return
  }
  const result = await runAction(() => accountApi.createShare({
    title: values.title,
    description: values.description,
    items: values.items,
    allowDownload: values.allowDownload,
    expiresAt: expiresAtFromMode(values.expiresMode),
    spatialAccess: values.spatialAccess,
    passwordAccess: values.passwordAccess,
    analytics: values.analytics,
    viewConfig: values.viewConfig,
    ...(password ? { password } : {}),
  }), { progress: '正在创建分享链接…' })
  if (!result) return
  state.kml.selected.clear()
  await showAlert(`分享已创建：${new URL(result.shareUrl || `/share/${result.publicId}`, window.location.origin).href}`, {
    title: '分享链接已生成',
  })
  writeActiveTab('shares')
  await loadActivePanel()
}

async function editShare (id) {
  if (!requireCapability('canManageShares')) return
  const loaded = await runAction(async () => {
    const [share, kmlResult] = await Promise.all([
      accountApi.getShare(id),
      capabilities().canReadKml
        ? accountApi.listKml({ page: 1, limit: 100, status: 'active', sort: 'name', order: 'asc' })
        : Promise.resolve({ items: [] }),
    ])
    return { share, documents: normalizePagedResult(kmlResult).items }
  }, { progress: '正在读取分享和可选 KML…' })
  if (!loaded) return
  const { share, documents } = loaded
  if (share.status === 'blocked' || share.storedStatus === 'blocked') {
    await showAlert(`该分享已被管理员封禁，不能编辑。${share.blockedReason ? `\n封禁原因：${share.blockedReason}` : ''}`, {
      title: '分享不可编辑',
    })
    return
  }
  const values = await showAccountShareDialog({
    // showAccountShareDialog({ share, documents }) keeps the edit dialog contract stable.
    share,
    documents,
    analyticsPolicy: shareAnalyticsPolicy(),
    onSpatialPreview: previewItems => accountApi.spatialPreview({
      items: previewItems,
      spatialAccess: { mode: 'kml_bounds' },
    }),
  })
  if (!values) return
  const body = {
    revision: share.revision,
    title: values.title,
    description: values.description,
    status: values.status,
    allowDownload: values.allowDownload,
    items: values.items,
    viewConfig: values.viewConfig,
    spatialAccess: values.spatialAccess,
    passwordAccess: values.passwordAccess,
    analytics: values.analytics,
  }
  const expiresAt = expiresAtFromMode(values.expiresMode)
  if (expiresAt !== undefined) body.expiresAt = expiresAt
  if (values.passwordAction === 'remove') body.password = null
  if (values.passwordAction === 'change') {
    const password = await showAccountPasswordDialog({
      title: '更换分享密码',
      message: '修改后，已通过旧密码验证的访问者需重新验证；新密码长度为 4～128 位。',
      label: '新分享密码',
      minLength: 4,
      autocomplete: 'new-password',
      generate: true,
    })
    if (!password) return
    body.password = password
  }
  const result = await runAction(() => accountApi.updateShare(id, body), {
    progress: '正在更新分享…', success: '分享设置已更新，原链接保持不变',
  })
  if (result) await loadShares()
  render()
}

async function rotateShare (id) {
  if (!requireCapability('canManageShares')) return
  const confirmed = await showConfirm('轮换后旧分享链接会立即失效，内容和分享设置保持不变。', {
    title: '轮换分享链接', confirmText: '继续',
  })
  if (!confirmed) return
  const password = await showAccountPasswordDialog({
    title: '再次验证身份',
    message: '这是一项高风险操作，请输入当前账号密码。',
  })
  if (!password) return
  const reauthenticated = await runAction(() => accountApi.reauthenticate(password), { progress: '正在验证身份…' })
  if (!reauthenticated) return
  const result = await runAction(() => accountApi.rotateShareLink(id), {
    progress: '正在轮换链接…', success: '分享链接已轮换，旧链接已失效',
  })
  if (result) await loadShares()
  render()
}

async function syncShareContent (id, revision) {
  if (!requireCapability('canManageShares')) return
  const confirmed = await showConfirm('将当前 KML 内容发布到此分享链接，并重新计算可查看地图范围。同步失败时外部链接仍保留原内容。', {
    title: '同步分享内容',
    confirmText: '同步内容',
  })
  if (!confirmed) return
  const result = await runAction(() => accountApi.syncShare(id, { revision }), {
    progress: '正在同步分享内容…',
    success: '分享内容已同步',
  })
  if (result) await loadShares()
  render()
}

async function copyTextValue (value, options = {}) {
  const text = String(value || '')
  try {
    await navigator.clipboard.writeText(text)
    setMessage(options.success || '已复制', '')
    render()
  } catch {
    await showAlert(text, { title: options.title || '复制内容' })
  }
}

async function copyShareUrl (value) {
  return copyTextValue(new URL(value, window.location.origin).href, {
    success: '分享链接已复制',
    title: '分享链接',
  })
}

async function copyShare (share) {
  if (!share) return
  let url = share.shareUrl || `/share/${share.publicId}`
  if (share.passwordProtected) {
    const choice = await showChoiceDialog({
      title: '复制分享链接',
      message: '带密码链接打开后会自动验证；修改分享密码后旧链接失效。',
      choices: [
        { text: '复制普通链接', value: 'plain', class: 'app-dialog-secondary' },
        { text: '复制带密码链接', value: 'password', class: 'app-dialog-primary' },
        { text: '复制密码', value: 'password-only', class: 'app-dialog-secondary' },
      ],
    })
    if (choice === 'cancel') return
    if (choice === 'password' || choice === 'password-only') {
      const result = await runAction(() => accountApi.getSharePasswordDetails(share.id), {
        progress: choice === 'password' ? '正在生成带密码链接…' : '正在读取分享密码…',
      })
      if (!result) return
      if (choice === 'password-only') {
        await copyTextValue(result.password, { success: '分享密码已复制', title: '分享密码' })
        return
      }
      url = result.shareUrl
    }
  }
  await copyShareUrl(url)
}

function showShareAccessEvents (share) {
  if (!share) return
  showAccountShareAccessEventsDialog({
    share,
    onLoad: query => accountApi.listShareAccessEvents(share.id, query),
  })
}

async function handleClick (event) {
  const tabTarget = event.target.closest('[data-account-tab]')
  if (tabTarget) {
    event.preventDefault()
    writeActiveTab(tabTarget.dataset.accountTab)
    await loadActivePanel()
    return
  }
  const target = event.target.closest('[data-account-action]')
  if (!target) return
  const action = target.dataset.accountAction
  const id = target.dataset.id

  if (KML_WRITE_ACTIONS.has(action) && !requireCapability('canWriteKml', '当前账号只有 KML 查看权限')) return
  if (SHARE_ACTIONS.has(action) && !requireCapability('canManageShares')) return
  if (FAVORITE_ACTIONS.has(action) && !requireCapability('canManageFavorites')) return
  if (SESSION_ACTIONS.has(action) && !requireCapability('canManageSessions')) return
  if (action === 'select-all-kml' && !capabilities().canWriteKml && !capabilities().canManageShares) {
    requireCapability('canWriteKml', '当前账号没有选择 KML 的操作权限')
    return
  }

  if (action === 'show-login') {
    state.authMode = 'login'
    setMessage('', '')
    render()
  } else if (action === 'show-register') {
    state.authMode = 'register'
    setMessage('', '')
    render()
  } else if (action === 'dismiss-notice') {
    setMessage('', '')
    render()
  } else if (action === 'logout') {
    const confirmed = await showConfirm('退出后，当前页面不再保留可操作的私有 KML、收藏和分享数据。', { title: '退出登录' })
    if (!confirmed) return
    const loggedOut = await runAction(() => logout(), { progress: '正在退出…' })
    if (!loggedOut) return
    state.auth = getAuthSnapshot()
    clearPrivateState()
    render()
  } else if (action === 'create-kml') {
    await createKml()
  } else if (action === 'edit-kml') {
    await editKml(id)
  } else if (action === 'import-kml') {
    document.getElementById('account-kml-import')?.click()
  } else if (action === 'import-2bulu') {
    await importTwoBuluKml()
  } else if (action === 'migrate-local') {
    await migrateLocalKml()
  } else if (action === 'select-all-kml') {
    const activeIds = state.kml.items.filter(item => item.status === 'active').map(item => item.id)
    const alreadyAll = activeIds.length && activeIds.every(itemId => state.kml.selected.has(itemId))
    state.kml.selected = alreadyAll ? new Set() : new Set(activeIds)
    render()
  } else if (action === 'create-share') {
    await createShareFromSelection()
  } else if (action === 'trash-selected-kml') {
    await trashSelectedKml()
  } else if (action === 'export-kml') {
    const item = state.kml.items.find(entry => entry.id === id)
    const result = await runAction(() => accountApi.exportKml(id), { progress: '正在导出 KML…' })
    if (result) saveDownload(result, `${item?.name || 'map'}.kml`)
  } else if (action === 'trash-kml') {
    const confirmed = await showConfirm('文件将移入回收站，并立即从所有分享包中移除。', { title: '移入回收站' })
    if (!confirmed) return
    const result = await runAction(() => accountApi.trashKml(id), { progress: '正在移入回收站…', success: 'KML 已移入回收站' })
    if (result) await loadKml()
  } else if (action === 'restore-kml') {
    const result = await runAction(() => accountApi.restoreKml(id), { progress: '正在恢复 KML…', success: 'KML 已恢复' })
    if (result) await loadKml()
  } else if (action === 'delete-kml') {
    const confirmed = await showConfirm('永久删除后无法恢复。请先确认该文件不再需要。', { title: '永久删除 KML', confirmText: '永久删除' })
    if (!confirmed) return
    const result = await runAction(() => accountApi.deleteKmlPermanently(id), { progress: '正在永久删除…', success: 'KML 已永久删除' })
    if (result) await loadKml()
  } else if (action === 'edit-favorite') {
    state.favoriteDraft = state.favorites.items.find(item => item.id === id) || null
    render()
  } else if (action === 'cancel-favorite-edit') {
    state.favoriteDraft = null
    render()
  } else if (action === 'delete-favorite') {
    const confirmed = await showConfirm('确定删除这个位置收藏吗？', { title: '删除收藏' })
    if (!confirmed) return
    const result = await runAction(() => accountApi.deleteFavorite(id), { progress: '正在删除收藏…', success: '收藏已删除' })
    if (result) await loadFavorites()
  } else if (action === 'go-kml-share') {
    writeActiveTab('kml')
    await loadActivePanel()
  } else if (action === 'copy-share') {
    await copyShare(state.shares.items.find(item => item.id === id))
  } else if (action === 'share-access-events') {
    showShareAccessEvents(state.shares.items.find(item => item.id === id))
  } else if (action === 'edit-share') {
    await editShare(id)
  } else if (action === 'sync-share') {
    await syncShareContent(id, Number(target.dataset.revision || 0))
  } else if (action === 'toggle-share') {
    const result = await runAction(() => accountApi.updateShare(id, {
      revision: Number(target.dataset.revision),
      status: target.dataset.status,
    }), { progress: '正在更新分享状态…', success: '分享状态已更新' })
    if (result) await loadShares()
  } else if (action === 'rotate-share') {
    await rotateShare(id)
  } else if (action === 'revoke-share') {
    const confirmed = await showConfirm('撤销后旧链接立即失效，且该分享包不能恢复。', { title: '撤销分享', confirmText: '永久撤销' })
    if (!confirmed) return
    const result = await runAction(() => accountApi.revokeShare(id), { progress: '正在撤销分享…', success: '分享已撤销' })
    if (result) await loadShares()
  } else if (action === 'revoke-session') {
    const confirmed = await showConfirm('该设备将立即退出登录。', { title: '注销会话' })
    if (!confirmed) return
    const result = await runAction(() => accountApi.revokeSession(id), { progress: '正在注销会话…', success: '会话已注销' })
    if (result) await loadSessions()
  } else if (action === 'logout-other-sessions') {
    const confirmed = await showConfirm('将保留当前设备，并注销账号的其他所有活跃会话。', { title: '注销其他会话' })
    if (!confirmed) return
    const result = await runAction(() => accountApi.logoutAll(true), { progress: '正在注销其他会话…', success: '其他会话已注销' })
    if (result) await loadSessions()
  }
  render()
}

function handleChange (event) {
  const kmlSelect = event.target.closest('[data-kml-select]')
  if (kmlSelect) {
    if (!capabilities().canWriteKml && !capabilities().canManageShares) return
    if (kmlSelect.checked) state.kml.selected.add(kmlSelect.dataset.kmlSelect)
    else state.kml.selected.delete(kmlSelect.dataset.kmlSelect)
    render()
    return
  }
  if (event.target.id === 'account-kml-import') {
    if (!requireCapability('canWriteKml', '当前账号只有 KML 查看权限')) return
    const file = event.target.files?.[0]
    event.target.value = ''
    importKmlFile(file)
  }
}

export async function initAccountApp () {
  document.body.classList.add('account-view')
  state.root = document.getElementById('account-root')
  if (!state.root) throw new Error('缺少用户中心根节点')
  state.root.hidden = false
  const pathTab = window.location.pathname.split('/').filter(Boolean)[1]
  state.activeTab = normalizeAccountTab(window.location.hash || pathTab)
  state.root.addEventListener('submit', handleSubmit)
  state.root.addEventListener('click', handleClick)
  state.root.addEventListener('change', handleChange)
  subscribeAuth(auth => {
    state.auth = auth
    if (!auth.authenticated) clearPrivateState()
    else state.activeTab = normalizeAccountTab(state.activeTab, auth.user)
    render()
  })
  subscribeTwoBuluHelper(helper => {
    state.twoBuluHelper = helper
    render()
  })
  render()
  probeTwoBuluHelper().catch(() => {})
  try {
    state.auth = await initializeAuth()
  } catch (error) {
    setMessage('', error.message || '无法读取账号服务状态')
  }
  if (state.auth.authenticated) await loadActivePanel()
  else render()
}

export { isAccountLocation }
