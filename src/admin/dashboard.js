import { adminApi, getAdminToken, loginAdmin, logoutAdmin } from './api.js'
import { renderLogin, renderShell } from './layout.js'
import { adminState, setActiveTab, setNotice } from './state.js'
import { buildAdminPageUrl, getAdminPage, getAdminTabFromLocation } from './routes.js'
import { showConfirm } from '../ui/dialog.js'

function getAdminTabFromUrl () {
  return getAdminTabFromLocation(window.location)
}

function writeAdminTabToUrl (tabId) {
  window.history.replaceState(null, '', `${buildAdminPageUrl(tabId)}${window.location.hash}`)
}

function renderActivePanel () {
  return getAdminPage(adminState.activeTab).render(adminState)
}

function renderDashboard () {
  renderShell(adminState, renderActivePanel())
  getAdminPage(adminState.activeTab).afterRender?.(adminState, adminApi)
}

function getPageContext (event) {
  return {
    api: adminApi,
    event,
    renderDashboard,
    setNotice,
    showConfirm,
    state: adminState,
  }
}

async function dispatchPageHandler (handlerName, event) {
  const handler = getAdminPage(adminState.activeTab)[handlerName]
  return handler instanceof Function
    ? Boolean(await handler(getPageContext(event)))
    : false
}

async function loadDashboard () {
  adminState.loading = true
  setNotice('正在加载')
  renderDashboard()

  try {
    const [session, system, cache, visits, settings, providers, tasks] = await Promise.all([
      adminApi.session(),
      adminApi.system(),
      adminApi.cache(),
      adminApi.visits(),
      adminApi.settings(),
      adminApi.providers(),
      adminApi.tasks(),
    ])

    Object.assign(adminState, {
      session,
      system,
      cache,
      visits,
      settings,
      providers,
      tasks,
      loading: false,
    })
    setNotice('')
    renderDashboard()
    getAdminPage(adminState.activeTab).afterLoad?.(adminState, adminApi)
  } catch (err) {
    adminState.loading = false
    if (err.status === 401) {
      logoutAdmin()
      setNotice('', err.message)
      renderLogin(adminState)
    } else {
      setNotice('', err.message)
      renderDashboard()
    }
  }
}

async function handleSubmit (event) {
  const loginForm = event.target.closest('[data-admin-login]')

  if (loginForm) {
    event.preventDefault()
    setNotice('正在登录')
    renderLogin(adminState)
    try {
      await loginAdmin({
        username: loginForm.elements.username.value,
        password: loginForm.elements.password.value,
      })
      setNotice('')
      await loadDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderLogin(adminState)
    }
    return
  }

  await dispatchPageHandler('handleSubmit', event)
}

async function handleClick (event) {
  const tabTarget = event.target.closest('[data-admin-tab]')
  if (tabTarget) {
    event.preventDefault()
    setActiveTab(tabTarget.getAttribute('data-admin-tab'))
    writeAdminTabToUrl(adminState.activeTab)
    renderDashboard()
    getAdminPage(adminState.activeTab).afterEnter?.(adminState, adminApi)
    return
  }

  const actionTarget = event.target.closest('[data-admin-action]')
  if (actionTarget) {
    const action = actionTarget.getAttribute('data-admin-action')
    if (action === 'logout') {
      logoutAdmin()
      setNotice('')
      renderLogin(adminState)
      return
    }

    if (action === 'refresh') {
      await loadDashboard()
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
  writeAdminTabToUrl(adminState.activeTab)
  adminState.amapLoader = options.amapLoader || null
  adminState.root = document.getElementById('admin-root')
  adminState.root.hidden = false
  adminState.root.addEventListener('submit', handleSubmit)
  adminState.root.addEventListener('click', handleClick)
  adminState.root.addEventListener('change', handleChange)
  adminState.root.addEventListener('input', handleChange)

  if (!getAdminToken()) {
    renderLogin(adminState)
    return
  }

  await loadDashboard()
}
