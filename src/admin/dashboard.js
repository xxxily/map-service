import { adminApi, getAdminToken, loginAdmin, logoutAdmin } from './api.js'
import { renderLogin, renderShell } from './layout.js'
import { adminState, setActiveTab, setNotice } from './state.js'
import { renderOverviewPanel } from './panels/overview.js'
import { renderCachePanel } from './panels/cache.js'
import { renderPrecachePanel, initPrecacheMap, movePrecacheMapToPoint, searchPlaces, syncBoundsFromMap } from './panels/precache.js'
import { renderLayersPanel } from './panels/layers.js'
import { renderSettingsPanel } from './panels/settings.js'
import { showConfirm } from '../ui/dialog.js'

function renderActivePanel () {
  if (adminState.activeTab === 'cache') {
    return renderCachePanel(adminState)
  }
  if (adminState.activeTab === 'precache') {
    return renderPrecachePanel(adminState)
  }
  if (adminState.activeTab === 'layers') {
    return renderLayersPanel(adminState)
  }
  if (adminState.activeTab === 'settings') {
    return renderSettingsPanel(adminState)
  }
  return renderOverviewPanel(adminState)
}

function renderDashboard () {
  renderShell(adminState, renderActivePanel())
  if (adminState.activeTab === 'precache') {
    initPrecacheMap(adminState)
  }
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

function collectProxyForm (form) {
  const providerPolicy = {}
  ;[...form.elements].forEach((element) => {
    if (element.name?.startsWith('providerPolicy:')) {
      providerPolicy[element.name.replace('providerPolicy:', '')] = element.checked
    }
  })

  const proxy = {
    enabled: form.elements.enabled.checked,
    protocol: form.elements.protocol.value,
    host: form.elements.host.value,
    port: Number(form.elements.port.value),
    username: form.elements.proxyUsername.value,
    providerPolicy,
  }
  const password = form.elements.proxyPassword.value
  if (password || !adminState.settings?.proxy?.hasPassword) {
    proxy.password = password
  }

  return {
    proxy,
  }
}

function collectPrecacheForm (form) {
  return {
    providerId: form.elements.providerId.value,
    bounds: {
      west: Number(form.elements.west.value),
      south: Number(form.elements.south.value),
      east: Number(form.elements.east.value),
      north: Number(form.elements.north.value),
    },
    minZoom: Number(form.elements.minZoom.value),
    maxZoom: Number(form.elements.maxZoom.value),
    concurrency: Number(form.elements.concurrency.value),
    refresh: form.elements.refresh.checked,
  }
}

async function handleSubmit (event) {
  const loginForm = event.target.closest('[data-admin-login]')
  const proxyForm = event.target.closest('[data-proxy-form]')
  const precacheForm = event.target.closest('[data-precache-form]')
  const placeSearchForm = event.target.closest('[data-place-search-form]')
  const accessForm = event.target.closest('[data-access-form]')
  const adminPasswordForm = event.target.closest('[data-admin-password-form]')

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
  }

  if (proxyForm) {
    event.preventDefault()
    try {
      adminState.settings = await adminApi.updateSettings(collectProxyForm(proxyForm))
      setNotice('代理设置已保存')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
  }

  if (precacheForm) {
    event.preventDefault()
    try {
      const task = await adminApi.createTask(collectPrecacheForm(precacheForm))
      adminState.tasks = [task, ...adminState.tasks]
      setNotice('预缓存任务已创建')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
  }

  if (placeSearchForm) {
    event.preventDefault()
    const keyword = placeSearchForm.elements.keyword.value.trim()
    if (keyword) {
      await searchPlaces(adminState, keyword)
    }
  }

  if (accessForm) {
    event.preventDefault()
    try {
      const accessEnabled = accessForm.elements.accessEnabled.checked
      const accessPassword = accessForm.elements.accessPassword.value.trim()

      const payload = {
        access: {
          enabled: accessEnabled,
        },
      }

      if (accessPassword) {
        payload.access.password = accessPassword
      } else if (accessEnabled && !adminState.settings?.access?.hasPassword) {
        setNotice('', '启用访问密码时，必须设置访问密码')
        renderDashboard()
        return
      }

      adminState.settings = await adminApi.updateSettings(payload)
      setNotice('访问控制已保存')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
  }

  if (adminPasswordForm) {
    event.preventDefault()
    const currentPassword = adminPasswordForm.elements.currentPassword.value
    const newPassword = adminPasswordForm.elements.newPassword.value
    const confirmPassword = adminPasswordForm.elements.confirmPassword.value

    if (newPassword.length < 4) {
      setNotice('', '新密码长度至少为 4 位')
      renderDashboard()
      return
    }

    if (newPassword !== confirmPassword) {
      setNotice('', '两次输入的新密码不一致')
      renderDashboard()
      return
    }

    try {
      await adminApi.updatePassword({
        currentPassword,
        newPassword,
      })
      setNotice('管理密码修改成功！')
      adminPasswordForm.reset()
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
  }
}

async function handleClick (event) {
  const tabTarget = event.target.closest('[data-admin-tab]')
  if (tabTarget) {
    setActiveTab(tabTarget.getAttribute('data-admin-tab'))
    renderDashboard()
    return
  }

  const placeTarget = event.target.closest('[data-place-lng][data-place-lat]')
  if (placeTarget) {
    movePrecacheMapToPoint(
      adminState,
      Number(placeTarget.getAttribute('data-place-lng')),
      Number(placeTarget.getAttribute('data-place-lat'))
    )
    return
  }

  const actionTarget = event.target.closest('[data-admin-action]')
  if (!actionTarget) return

  const action = actionTarget.getAttribute('data-admin-action')
  if (action === 'logout') {
    logoutAdmin()
    setNotice('')
    renderLogin(adminState)
  }

  if (action === 'refresh') {
    await loadDashboard()
  }

  if (action === 'clear-cache') {
    if (!await showConfirm('清空所有瓦片缓存？')) return
    try {
      await adminApi.clearCache()
      adminState.cache = await adminApi.cache()
      setNotice('缓存已清空')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
  }

  if (action === 'sync-bounds') {
    syncBoundsFromMap(adminState)
  }
}

export async function initAdminApp (options = {}) {
  document.body.classList.add('admin-view')
  adminState.amapLoader = options.amapLoader || null
  adminState.root = document.getElementById('admin-root')
  adminState.root.hidden = false
  adminState.root.addEventListener('submit', handleSubmit)
  adminState.root.addEventListener('click', handleClick)

  if (!getAdminToken()) {
    renderLogin(adminState)
    return
  }

  await loadDashboard()
}
