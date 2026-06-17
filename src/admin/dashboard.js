import L from 'leaflet'
import { adminApi, getAdminToken, loginAdmin, logoutAdmin } from './api.js'
import { defaultMapView, tileRelayEndpoint } from '../config.js'

const state = {
  root: null,
  loading: false,
  message: '',
  error: '',
  session: null,
  system: null,
  cache: null,
  visits: null,
  settings: null,
  providers: [],
  tasks: [],
  map: null,
  rectangle: null,
}

function relayTileUrl (targetUrl) {
  return `${tileRelayEndpoint}?url=${encodeURIComponent(targetUrl)
    .replace(/%7B/g, '{')
    .replace(/%7D/g, '}')}`
}

function formatBytes (bytes = 0) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function formatDuration (seconds = 0) {
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${secs}s`
  return `${secs}s`
}

function formatTime (timestamp) {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString()
}

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function setNotice (message = '', error = '') {
  state.message = message
  state.error = error
}

function renderShell () {
  state.root.innerHTML = `
    <section class="admin-shell">
      <header class="admin-topbar">
        <div>
          <p class="admin-kicker">map-service</p>
          <h1>管理后台</h1>
        </div>
        <nav class="admin-actions" aria-label="管理后台操作">
          <a class="admin-icon-link" href="/" aria-label="返回地图">⌖</a>
          <button type="button" data-admin-action="refresh" aria-label="刷新">↻</button>
          <button type="button" data-admin-action="logout" aria-label="退出">⎋</button>
        </nav>
      </header>
      ${renderNotice()}
      <div class="admin-grid">
        ${renderSystemPanel()}
        ${renderCachePanel()}
        ${renderVisitsPanel()}
        ${renderProxyPanel()}
        ${renderPrecachePanel()}
        ${renderTaskPanel()}
      </div>
    </section>
  `
  initPrecacheMap()
}

function renderNotice () {
  if (!state.message && !state.error && !state.loading) return ''
  const text = state.error || state.message || '正在加载'
  return `<div class="admin-notice ${state.error ? 'is-error' : ''}">${escapeHtml(text)}</div>`
}

function renderLogin () {
  state.root.innerHTML = `
    <section class="admin-login">
      <form class="admin-login-panel" data-admin-login>
        <p class="admin-kicker">map-service</p>
        <h1>管理后台</h1>
        ${renderNotice()}
        <label>
          <span>用户名</span>
          <input name="username" autocomplete="username" required>
        </label>
        <label>
          <span>密码</span>
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <button type="submit">登录</button>
        <a href="/">返回地图</a>
      </form>
    </section>
  `
}

function renderSystemPanel () {
  const system = state.system
  const version = system?.package?.version || '-'
  return `
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>系统</h2>
        <span class="admin-badge">${escapeHtml(version)}</span>
      </div>
      <dl class="admin-metrics">
        <div><dt>应用</dt><dd>${escapeHtml(system?.package?.name || '-')}</dd></div>
        <div><dt>Node</dt><dd>${escapeHtml(system?.node || '-')}</dd></div>
        <div><dt>进程</dt><dd>${escapeHtml(system?.pid || '-')}</dd></div>
        <div><dt>运行</dt><dd>${formatDuration(system?.uptime || 0)}</dd></div>
        <div><dt>环境</dt><dd>${escapeHtml(system?.env || '-')}</dd></div>
        <div><dt>时间</dt><dd>${formatTime(system?.serverTime)}</dd></div>
      </dl>
    </section>
  `
}

function renderCachePanel () {
  const cache = state.cache || {}
  return `
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>缓存</h2>
        <button type="button" data-admin-action="clear-cache">清空</button>
      </div>
      <dl class="admin-metrics">
        <div><dt>文件</dt><dd>${cache.files || 0}</dd></div>
        <div><dt>体积</dt><dd>${formatBytes(cache.bytes || 0)}</dd></div>
        <div><dt>新鲜</dt><dd>${cache.fresh || 0}</dd></div>
        <div><dt>可回退</dt><dd>${cache.stale || 0}</dd></div>
        <div><dt>过期</dt><dd>${cache.expired || 0}</dd></div>
      </dl>
      <div class="admin-list">
        ${Object.entries(cache.providers || {}).slice(0, 8).map(([name, count]) => `
          <div><span>${escapeHtml(name)}</span><strong>${count}</strong></div>
        `).join('') || '<p>暂无缓存</p>'}
      </div>
    </section>
  `
}

function renderVisitsPanel () {
  const visits = state.visits || {}
  return `
    <section class="admin-panel admin-panel-wide">
      <div class="admin-panel-head">
        <h2>访问</h2>
        <span class="admin-badge">${visits.total || 0}</span>
      </div>
      <div class="admin-stat-row">
        ${Object.entries(visits.statusGroups || {}).map(([group, count]) => `
          <div><span>${escapeHtml(group)}</span><strong>${count}</strong></div>
        `).join('') || '<div><span>请求</span><strong>0</strong></div>'}
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>方法</th><th>路径</th><th>状态</th><th>时间</th></tr></thead>
          <tbody>
            ${(visits.recentRequests || []).slice(0, 8).map(record => `
              <tr>
                <td>${escapeHtml(record.method)}</td>
                <td>${escapeHtml(record.path)}</td>
                <td>${escapeHtml(record.status)}</td>
                <td>${escapeHtml(record.timestamp)}</td>
              </tr>
            `).join('') || '<tr><td colspan="4">暂无访问记录</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `
}

function renderProxyPanel () {
  const proxy = state.settings?.proxy || {}
  return `
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>代理</h2>
        <span class="admin-badge">${proxy.enabled ? 'ON' : 'OFF'}</span>
      </div>
      <form class="admin-form" data-proxy-form>
        <label class="admin-check">
          <input type="checkbox" name="enabled" ${proxy.enabled ? 'checked' : ''}>
          <span>启用代理</span>
        </label>
        <div class="admin-field-row">
          <label>
            <span>协议</span>
            <select name="protocol">
              <option value="http" ${proxy.protocol === 'http' ? 'selected' : ''}>http</option>
              <option value="https" ${proxy.protocol === 'https' ? 'selected' : ''}>https</option>
            </select>
          </label>
          <label>
            <span>端口</span>
            <input name="port" type="number" min="1" max="65535" value="${escapeHtml(proxy.port || 10809)}" required>
          </label>
        </div>
        <label>
          <span>主机</span>
          <input name="host" value="${escapeHtml(proxy.host || '127.0.0.1')}" required>
        </label>
        <label>
          <span>用户名</span>
          <input name="username" value="${escapeHtml(proxy.username || '')}">
        </label>
        <label>
          <span>密码</span>
          <input name="password" type="password" placeholder="${proxy.hasPassword ? '已设置' : ''}">
        </label>
        <button type="submit">保存代理</button>
      </form>
    </section>
  `
}

function renderPrecachePanel () {
  const providers = state.providers || []
  const firstProvider = providers[0]
  return `
    <section class="admin-panel admin-panel-wide">
      <div class="admin-panel-head">
        <h2>预缓存</h2>
        <button type="button" data-admin-action="sync-bounds">取当前视野</button>
      </div>
      <div id="admin-precache-map" class="admin-precache-map"></div>
      <form class="admin-form admin-precache-form" data-precache-form>
        <label>
          <span>图层</span>
          <select name="providerId">
            ${providers.map(provider => `
              <option value="${escapeHtml(provider.id)}">${escapeHtml(provider.name)} (${provider.minZoom}-${provider.maxZoom})</option>
            `).join('')}
          </select>
        </label>
        <div class="admin-field-grid">
          <label><span>西</span><input name="west" type="number" step="0.000001" value="113.24" required></label>
          <label><span>南</span><input name="south" type="number" step="0.000001" value="23.11" required></label>
          <label><span>东</span><input name="east" type="number" step="0.000001" value="113.29" required></label>
          <label><span>北</span><input name="north" type="number" step="0.000001" value="23.15" required></label>
        </div>
        <div class="admin-field-grid">
          <label><span>最小级别</span><input name="minZoom" type="number" min="${firstProvider?.minZoom || 3}" max="${firstProvider?.maxZoom || 18}" value="12" required></label>
          <label><span>最大级别</span><input name="maxZoom" type="number" min="${firstProvider?.minZoom || 3}" max="${firstProvider?.maxZoom || 18}" value="12" required></label>
          <label><span>并发</span><input name="concurrency" type="number" min="1" max="8" value="4" required></label>
          <label class="admin-check admin-check-field"><input name="refresh" type="checkbox"><span>刷新已有缓存</span></label>
        </div>
        <button type="submit">创建任务</button>
      </form>
    </section>
  `
}

function renderTaskPanel () {
  return `
    <section class="admin-panel admin-panel-wide">
      <div class="admin-panel-head">
        <h2>任务</h2>
        <span class="admin-badge">${state.tasks.length}</span>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>状态</th><th>图层</th><th>进度</th><th>成功</th><th>失败</th><th>更新时间</th></tr></thead>
          <tbody>
            ${state.tasks.slice(0, 10).map(task => `
              <tr>
                <td><span class="admin-status">${escapeHtml(task.status)}</span></td>
                <td>${escapeHtml(task.providerId)}</td>
                <td>${escapeHtml(task.completed || 0)} / ${escapeHtml(task.total || 0)}</td>
                <td>${escapeHtml(task.succeeded || 0)}</td>
                <td>${escapeHtml(task.failed || 0)}</td>
                <td>${formatTime(task.updatedAt)}</td>
              </tr>
            `).join('') || '<tr><td colspan="6">暂无任务</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `
}

async function loadDashboard () {
  state.loading = true
  setNotice('正在加载')
  renderShell()

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

    Object.assign(state, {
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
    renderShell()
  } catch (err) {
    state.loading = false
    if (err.status === 401) {
      logoutAdmin()
      setNotice('', err.message)
      renderLogin()
    } else {
      setNotice('', err.message)
      renderShell()
    }
  }
}

function readBoundsFromForm () {
  const form = state.root.querySelector('[data-precache-form]')
  return {
    west: Number(form?.elements.west.value),
    south: Number(form?.elements.south.value),
    east: Number(form?.elements.east.value),
    north: Number(form?.elements.north.value),
  }
}

function writeBoundsToForm (bounds) {
  const form = state.root.querySelector('[data-precache-form]')
  if (!form) return

  form.elements.west.value = bounds.getWest().toFixed(6)
  form.elements.south.value = bounds.getSouth().toFixed(6)
  form.elements.east.value = bounds.getEast().toFixed(6)
  form.elements.north.value = bounds.getNorth().toFixed(6)
}

function syncRectangle (bounds) {
  if (!state.rectangle) return
  state.rectangle.setBounds(bounds)
  writeBoundsToForm(bounds)
}

function syncBoundsFromMap () {
  if (!state.map) return
  syncRectangle(state.map.getBounds())
}

function initPrecacheMap () {
  const container = state.root.querySelector('#admin-precache-map')
  if (!container) return

  if (state.map) {
    state.map.remove()
    state.map = null
    state.rectangle = null
  }

  const map = L.map(container, {
    center: defaultMapView.center,
    zoom: Math.min(defaultMapView.zoom, 13),
    zoomControl: true,
    attributionControl: false,
  })
  L.tileLayer(relayTileUrl('https://webst01.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}'), {
    minZoom: 3,
    maxZoom: 18,
    keepBuffer: 4,
  }).addTo(map)

  const formBounds = readBoundsFromForm()
  const bounds = L.latLngBounds(
    [formBounds.south, formBounds.west],
    [formBounds.north, formBounds.east]
  )
  state.rectangle = L.rectangle(bounds, {
    color: '#0f766e',
    weight: 2,
    fillColor: '#f59e0b',
    fillOpacity: 0.14,
  }).addTo(map)
  map.fitBounds(bounds)
  map.on('moveend zoomend', () => syncBoundsFromMap())

  state.map = map
}

function collectProxyForm (form) {
  const proxy = {
    enabled: form.elements.enabled.checked,
    protocol: form.elements.protocol.value,
    host: form.elements.host.value,
    port: Number(form.elements.port.value),
    username: form.elements.username.value,
  }
  const password = form.elements.password.value
  if (password || !state.settings?.proxy?.hasPassword) {
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

  if (loginForm) {
    event.preventDefault()
    setNotice('正在登录')
    renderLogin()
    try {
      await loginAdmin({
        username: loginForm.elements.username.value,
        password: loginForm.elements.password.value,
      })
      setNotice('')
      await loadDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderLogin()
    }
  }

  if (proxyForm) {
    event.preventDefault()
    try {
      state.settings = await adminApi.updateSettings(collectProxyForm(proxyForm))
      setNotice('代理设置已保存')
      renderShell()
    } catch (err) {
      setNotice('', err.message)
      renderShell()
    }
  }

  if (precacheForm) {
    event.preventDefault()
    try {
      const task = await adminApi.createTask(collectPrecacheForm(precacheForm))
      state.tasks = [task, ...state.tasks]
      setNotice('预缓存任务已创建')
      renderShell()
    } catch (err) {
      setNotice('', err.message)
      renderShell()
    }
  }
}

async function handleClick (event) {
  const actionTarget = event.target.closest('[data-admin-action]')
  if (!actionTarget) return

  const action = actionTarget.getAttribute('data-admin-action')
  if (action === 'logout') {
    logoutAdmin()
    setNotice('')
    renderLogin()
  }

  if (action === 'refresh') {
    await loadDashboard()
  }

  if (action === 'clear-cache') {
    if (!window.confirm('清空所有瓦片缓存？')) return
    try {
      await adminApi.clearCache()
      state.cache = await adminApi.cache()
      setNotice('缓存已清空')
      renderShell()
    } catch (err) {
      setNotice('', err.message)
      renderShell()
    }
  }

  if (action === 'sync-bounds') {
    syncBoundsFromMap()
  }
}

export async function initAdminApp () {
  document.body.classList.add('admin-view')
  state.root = document.getElementById('admin-root')
  state.root.hidden = false
  state.root.addEventListener('submit', handleSubmit)
  state.root.addEventListener('click', handleClick)

  if (!getAdminToken()) {
    renderLogin()
    return
  }

  await loadDashboard()
}
