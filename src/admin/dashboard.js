import './admin-user-system.css'
import {
  adminApi,
  clearAdminSessionState,
  loginAdmin,
  logoutAdmin,
} from './api.js'
import { renderLogin, renderRequiredPasswordChange, renderShell } from './layout.js'
import { adminState, setActiveTab, setNotice, registerNoticeListener } from './state.js'
import {
  buildAdminPageUrl,
  getAdminTabFromLocation,
  getAuthorizedAdminPage,
  hasAdminPermission,
} from './routes.js'
import { showCheckboxConfirm, showConfirm } from '../ui/dialog.js'

let noticeTimeoutId = null

function renderCurrentView () {
  if (!adminState.session) {
    renderLogin(adminState)
  } else if (adminState.session.user?.mustChangePassword) {
    renderRequiredPasswordChange(adminState)
  } else {
    renderDashboard()
  }
}

registerNoticeListener((message, error) => {
  if (noticeTimeoutId) {
    clearTimeout(noticeTimeoutId)
    noticeTimeoutId = null
  }
  const text = error || message
  if (text && text !== '正在加载' && text !== '正在登录') {
    noticeTimeoutId = setTimeout(() => {
      setNotice('')
      renderCurrentView()
    }, 4000)
  }
})

function getAdminTabFromUrl () {
  return getAdminTabFromLocation(window.location)
}

function writeAdminTabToUrl (tabId) {
  window.history.replaceState(null, '', `${buildAdminPageUrl(tabId)}${window.location.hash}`)
}

function activePage () {
  return getAuthorizedAdminPage(adminState.activeTab, adminState.session)
}

function ensureAuthorizedTab () {
  const page = activePage()
  if (!page) return null
  if (page.id !== adminState.activeTab) {
    setActiveTab(page.id)
    writeAdminTabToUrl(page.id)
  }
  return page
}

function renderActivePanel () {
  const page = ensureAuthorizedTab()
  if (!page) {
    return `
      <section class="admin-panel">
        <h2>无后台访问权限</h2>
        <p class="admin-panel-description">当前账号没有可用的管理权限，请联系超级管理员。</p>
      </section>
    `
  }
  return page.render(adminState)
}

function renderDashboard () {
  renderShell(adminState, renderActivePanel())
  activePage()?.afterRender?.(adminState, adminApi)
}
window.renderDashboard = renderDashboard

function getPageContext (event) {
  return {
    api: adminApi,
    event,
    renderDashboard,
    setNotice,
    showCheckboxConfirm,
    showConfirm,
    state: adminState,
  }
}

function renderDashboardIfActive (...tabIds) {
  if (adminState.session && (!tabIds.length || tabIds.includes(adminState.activeTab))) {
    renderDashboard()
  }
}

async function dispatchPageHandler (handlerName, event) {
  const handler = activePage()?.[handlerName]
  return handler instanceof Function
    ? Boolean(await handler(getPageContext(event)))
    : false
}

function normalizedSession (result) {
  if (result?.authenticated === false || !result?.user) {
    const err = new Error('请先登录管理后台')
    err.status = 401
    err.code = 'AUTH_REQUIRED'
    throw err
  }
  return result
}

async function loadDashboardStats (options = {}) {
  const cacheOnly = Boolean(options.cacheOnly)
  const canLoadCache = hasAdminPermission(adminState.session, 'admin.cache.manage')
  const canLoadVisits = hasAdminPermission(adminState.session, 'admin.overview.read')
  Object.assign(adminState, {
    cacheLoading: canLoadCache,
    cacheError: '',
    visitsLoading: cacheOnly ? adminState.visitsLoading : canLoadVisits,
    visitsError: cacheOnly ? adminState.visitsError : '',
  })
  renderDashboardIfActive('overview', 'cache')

  if (canLoadCache) {
    Promise.all([
      adminApi.cache(),
      adminApi.cacheCleanupJobs({
        page: adminState.cacheCleanupJobs?.page || 1,
        limit: adminState.cacheCleanupJobs?.limit || 20,
      }),
    ])
      .then(([cache, jobs]) => {
        adminState.cache = cache
        adminState.cacheCleanupJobs = jobs
        adminState.cacheError = ''
        if (cache.refreshing || cache.index?.refreshing || cache.activeJob) {
          window.setTimeout(() => loadDashboardStats({ cacheOnly: true }), 1500)
        }
      })
      .catch((err) => {
        adminState.cacheError = err.message
      })
      .finally(() => {
        adminState.cacheLoading = false
        renderDashboardIfActive('cache')
      })
  }

  if (cacheOnly || !canLoadVisits) return

  adminApi.visits()
    .then((visits) => {
      adminState.visits = visits
      adminState.visitsError = ''
    })
    .catch((err) => {
      adminState.visitsError = err.message
    })
    .finally(() => {
      adminState.visitsLoading = false
      renderDashboardIfActive('overview')
    })
}

function addAuthorizedLoaders (loaders) {
  const can = permission => hasAdminPermission(adminState.session, permission)

  if (can('admin.overview.read')) {
    loaders.push(['system', () => adminApi.system()])
  }
  if (can('admin.cache.manage')) {
    loaders.push(['cachePolicy', () => adminApi.cachePolicy()])
    loaders.push(['cacheKeyPolicies', () => adminApi.cacheKeyPolicies()])
    loaders.push(['cacheCleanupJobs', () => adminApi.cacheCleanupJobs({ page: 1, limit: 20 })])
  }
  if (can('admin.security.manage')) {
    loaders.push(['settings', () => adminApi.settings()])
  }
  if (can('admin.precache.manage')) {
    loaders.push(['tasks', () => adminApi.tasks()])
    loaders.push(['precacheCatalog', () => adminApi.precacheCatalog()])
  }
  if (can('admin.public_kml.manage')) {
    loaders.push(['kmls', () => adminApi.kmls()])
  }
  if (can('admin.layer.manage')) {
    loaders.push(
      ['tileSources', () => adminApi.listTileSources()],
      ['sourcePresets', () => adminApi.listSourcePresets()],
      ['keyPools', () => adminApi.listKeyPools()],
      ['mapLayers', () => adminApi.listMapLayers()],
      ['proxyOutbounds', () => adminApi.listProxyOutbounds()],
      ['proxyPools', () => adminApi.listProxyPools()],
      ['externalPublishes', () => adminApi.listExternalPublishes()],
    )
  }
  if (can('admin.user.read')) {
    loaders.push(['adminUsers', () => adminApi.listUsers({
      ...adminState.adminUserFilters,
      page: 1,
      limit: adminState.adminUsers.limit,
    })])
  }
  if (can('admin.role.manage')) {
    loaders.push(['roles', () => adminApi.listRoles()])
  }
  if (can('admin.registration.manage') || can('admin.security.manage')) {
    loaders.push(['userSystemSettings', () => adminApi.getUserSystemSettings()])
  }
  if (can('admin.share.moderate')) {
    loaders.push(['moderatedShares', () => adminApi.listUserShares({
      ...adminState.shareFilters,
      page: 1,
      limit: adminState.moderatedShares.limit,
    })])
    loaders.push(['shareRuntimeMetrics', () => adminApi.getShareRuntimeMetrics()])
  }
  if (can('admin.audit.read')) {
    loaders.push(['auditLogs', () => adminApi.listAuditLogs({
      ...adminState.auditFilters,
      page: 1,
      limit: adminState.auditLogs.limit,
    })])
  }
  if (can('admin.comment.read')) loaders.push(['interactionComments', () => adminApi.listInteractionComments({ page: 1, limit: 20 })])
  if (can('admin.report.read')) loaders.push(['interactionReports', () => adminApi.listInteractionReports({ page: 1, limit: 20 })])
  if (can('admin.comment.read') || can('admin.comment.policy.manage')) loaders.push(['interactionPolicy', () => adminApi.interactionPolicy()])
  if (can('admin.moderation.ai.manage')) loaders.push(['interactionAiSettings', () => adminApi.interactionAiSettings()])
  if (can('admin.moderation.ai.manage')) loaders.push(['interactionAiPrompts', () => adminApi.interactionAiPrompts()])
  if (can('admin.moderation.keyword.manage')) loaders.push(['interactionKeywords', () => adminApi.interactionKeywords()])
  if (can('admin.moderation.ai.manage')) loaders.push(['interactionAiProviders', () => adminApi.interactionAiProviders()])
  if (can('admin.comment.policy.manage')) loaders.push(['artalkStatus', () => adminApi.artalkStatus()])
}

async function loadDashboard () {
  adminState.loading = true
  setNotice('正在加载')
  if (!adminState.session) renderLogin(adminState)

  try {
    adminState.session = normalizedSession(await adminApi.session())
    if (adminState.session.user.mustChangePassword) {
      adminState.loading = false
      setNotice('')
      renderRequiredPasswordChange(adminState)
      return
    }

    ensureAuthorizedTab()
    const loaders = []
    addAuthorizedLoaders(loaders)
    const values = await Promise.all(loaders.map(async ([key, loader]) => [key, await loader()]))
    values.forEach(([key, value]) => {
      adminState[key] = value
    })

    adminState.loading = false
    setNotice('')
    renderDashboard()
    activePage()?.afterLoad?.(adminState, adminApi)
    loadDashboardStats()
  } catch (err) {
    adminState.loading = false
    if (err.status === 401) {
      adminState.session = null
      clearAdminSessionState()
      setNotice('', err.message)
      renderLogin(adminState)
    } else {
      setNotice('', err.message)
      renderCurrentView()
    }
  }
}

async function handleSubmit (event) {
  const loginForm = event.target.closest('[data-admin-login]')

  if (loginForm) {
    event.preventDefault()
    const credentials = {
      username: loginForm.elements.username.value,
      password: loginForm.elements.password.value,
      remember: Boolean(loginForm.elements.remember.checked),
    }
    setNotice('正在登录')
    renderLogin(adminState)
    try {
      await loginAdmin(credentials)
      setNotice('')
      await loadDashboard()
    } catch (err) {
      adminState.session = null
      setNotice('', err.message)
      renderLogin(adminState)
    }
    return
  }

  const passwordForm = event.target.closest('[data-admin-required-password]')
  if (passwordForm) {
    event.preventDefault()
    const currentPassword = passwordForm.elements.currentPassword.value
    const newPassword = passwordForm.elements.newPassword.value
    if (newPassword !== passwordForm.elements.confirmPassword.value) {
      setNotice('', '两次输入的新密码不一致')
      renderRequiredPasswordChange(adminState)
      return
    }
    try {
      setNotice('正在修改密码')
      renderRequiredPasswordChange(adminState)
      await adminApi.updatePassword({ currentPassword, newPassword })
      adminState.session = null
      setNotice('密码修改成功，正在加载后台')
      await loadDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderRequiredPasswordChange(adminState)
    }
    return
  }

  await dispatchPageHandler('handleSubmit', event)
}

async function handleClick (event) {
  const tabTarget = event.target.closest('[data-admin-tab]')
  if (tabTarget) {
    event.preventDefault()
    const nextPage = getAuthorizedAdminPage(tabTarget.getAttribute('data-admin-tab'), adminState.session)
    if (!nextPage) return
    setActiveTab(nextPage.id)
    writeAdminTabToUrl(nextPage.id)
    renderDashboard()
    activePage()?.afterEnter?.(adminState, adminApi)
    return
  }

  const actionTarget = event.target.closest('[data-admin-action]')
  if (actionTarget) {
    const action = actionTarget.getAttribute('data-admin-action')
    if (action === 'logout') {
      try {
        await logoutAdmin()
      } catch (err) {
        if (err.status !== 401) {
          setNotice('', err.message)
          renderCurrentView()
          return
        }
      }
      adminState.session = null
      setNotice('')
      renderLogin(adminState)
      return
    }

    if (action === 'refresh') {
      await loadDashboard()
      return
    }

    if (action === 'close-notice') {
      setNotice('')
      renderCurrentView()
      return
    }
  }

  await dispatchPageHandler('handleClick', event)
}

async function handleChange (event) {
  await dispatchPageHandler('handleChange', event)
}

export async function initAdminApp (options = {}) {
  document.body.classList.add('admin-view')
  setActiveTab(getAdminTabFromUrl())
  adminState.amapLoader = options.amapLoader || null
  adminState.root = document.getElementById('admin-root')
  adminState.root.hidden = false
  adminState.root.addEventListener('submit', handleSubmit)
  adminState.root.addEventListener('click', handleClick)
  adminState.root.addEventListener('change', handleChange)
  adminState.root.addEventListener('input', handleChange)

  renderLogin(adminState)
  await loadDashboard()
}
