import L from 'leaflet'
import { amapConfig, defaultMapView, tileRelayEndpoint } from '../../config.js'
import { escapeHtml, formatBytes, formatTime, relayTileUrl } from '../utils.js'

const TASK_STATUS_LABELS = {
  queued: '排队中',
  running: '执行中',
  pausing: '暂停中',
  paused: '已暂停',
  completed: '已完成',
  completed_with_errors: '完成有错误',
  failed: '失败',
  interrupted: '已中断',
  deleting: '删除中',
}
const PRECACHE_ESTIMATE_DELAY = 1000
const PRECACHE_TASK_REFRESH_DELAY = 1500
const ACTIVE_TASK_STATUSES = new Set(['queued', 'running', 'pausing', 'deleting'])
let estimateTimer = null
let estimateRequestId = 0
let pendingEstimateKey = ''
let lastEstimateKey = ''
let taskRefreshTimer = null
let taskRefreshRequestId = 0

function getTaskStatusLabel (status) {
  return TASK_STATUS_LABELS[status] || status
}

function getPrecacheFormState (state, providers) {
  const firstProvider = providers[0]
  const form = state.precacheForm || {}
  const providerId = providers.some(provider => provider.id === form.providerId)
    ? form.providerId
    : firstProvider?.id || ''

  return {
    providerId,
    bounds: {
      west: Number(form.bounds?.west ?? 113.24),
      south: Number(form.bounds?.south ?? 23.11),
      east: Number(form.bounds?.east ?? 113.29),
      north: Number(form.bounds?.north ?? 23.15),
    },
    minZoom: Number(form.minZoom ?? 12),
    maxZoom: Number(form.maxZoom ?? 12),
    concurrency: Number(form.concurrency ?? 4),
    refresh: Boolean(form.refresh),
  }
}

function getSelectedProvider (providers, formState) {
  return providers.find(provider => provider.id === formState.providerId) || providers[0] || null
}

function getTasksForRender (state) {
  const expandedTaskIds = state.expandedTaskIds || new Set()
  return (state.tasks || []).map(task => ({
    ...task,
    expanded: expandedTaskIds.has(task.id),
  }))
}

function hasActiveTasks (tasks = []) {
  return tasks.some(task => ACTIVE_TASK_STATUSES.has(task.status))
}

export function renderPrecachePage (state) {
  const providers = state.providers || []
  const formState = getPrecacheFormState(state, providers)
  const selectedProvider = getSelectedProvider(providers, formState)
  const tasks = getTasksForRender(state)

  return `
    <div class="admin-grid">
      <section class="admin-panel admin-panel-wide">
        <div class="admin-panel-head">
          <h2>预缓存区域</h2>
          <button type="button" data-admin-action="sync-bounds">取当前视野</button>
        </div>
        <form class="admin-search-form" data-place-search-form>
          <input name="keyword" placeholder="搜索地点，例如：广州塔" autocomplete="off">
          <button type="submit">搜索</button>
        </form>
        <div class="admin-search-results" data-place-search-results></div>
        <div id="admin-precache-map" class="admin-precache-map"></div>
        <form class="admin-form admin-precache-form" data-precache-form>
          <label>
            <span>缓存图层</span>
            <select name="providerId">
              ${providers.map(provider => `
                <option value="${escapeHtml(provider.id)}" ${provider.id === formState.providerId ? 'selected' : ''}>
                  ${escapeHtml(provider.name)} (${provider.minZoom}-${provider.maxZoom})
                </option>
              `).join('')}
            </select>
          </label>
          <div class="admin-field-grid">
            <label><span>西</span><input name="west" type="number" step="0.000001" value="${escapeHtml(formState.bounds.west)}" required></label>
            <label><span>南</span><input name="south" type="number" step="0.000001" value="${escapeHtml(formState.bounds.south)}" required></label>
            <label><span>东</span><input name="east" type="number" step="0.000001" value="${escapeHtml(formState.bounds.east)}" required></label>
            <label><span>北</span><input name="north" type="number" step="0.000001" value="${escapeHtml(formState.bounds.north)}" required></label>
          </div>
          <div class="admin-field-grid">
            <label><span>最小级别</span><input name="minZoom" type="number" min="${selectedProvider?.minZoom || 3}" max="${selectedProvider?.maxZoom || 18}" value="${escapeHtml(formState.minZoom)}" required></label>
            <label><span>最大级别</span><input name="maxZoom" type="number" min="${selectedProvider?.minZoom || 3}" max="${selectedProvider?.maxZoom || 18}" value="${escapeHtml(formState.maxZoom)}" required></label>
            <label><span>并发</span><input name="concurrency" type="number" min="1" max="8" value="${escapeHtml(formState.concurrency)}" required></label>
            <label class="admin-check admin-check-field"><input name="refresh" type="checkbox" ${formState.refresh ? 'checked' : ''}><span>刷新已有缓存</span></label>
          </div>
          ${renderPrecacheEstimate(state)}
          <button type="submit">创建任务</button>
        </form>
      </section>
      ${renderTaskPanel(tasks)}
    </div>
  `
}

export function renderPrecacheEstimate (state) {
  const estimate = state.precacheEstimate
  if (state.precacheEstimateStatus === 'loading') {
    return '<div class="admin-estimate" data-precache-estimate><p>正在估算瓦片数量和下载体积</p></div>'
  }

  if (state.precacheEstimateError) {
    return `<div class="admin-estimate is-error" data-precache-estimate><p>${escapeHtml(state.precacheEstimateError)}</p></div>`
  }

  if (!estimate) {
    return '<div class="admin-estimate" data-precache-estimate><p>停止移动地图后会自动估算任务规模</p></div>'
  }

  return `
    <div class="admin-estimate ${estimate.withinLimit ? '' : 'is-warning'}" data-precache-estimate>
      <dl class="admin-metrics">
        <div><dt>预计文件</dt><dd>${escapeHtml(estimate.total || 0)}</dd></div>
        <div><dt>估算体积</dt><dd>${formatBytes(estimate.estimatedBytesRange?.min || 0)} - ${formatBytes(estimate.estimatedBytesRange?.max || 0)}</dd></div>
        <div><dt>任务上限</dt><dd>${escapeHtml(estimate.maxTiles || 0)}</dd></div>
        <div><dt>建议</dt><dd>${estimate.withinLimit ? '可以创建' : '缩小区域或降低级别'}</dd></div>
      </dl>
      <p>${renderRangeSummary(estimate.ranges || [])}</p>
    </div>
  `
}

export function updatePrecacheEstimateView (state) {
  const estimateNode = state.root?.querySelector('[data-precache-estimate]')
  if (!estimateNode) return
  estimateNode.outerHTML = renderPrecacheEstimate(state)
}

function renderRangeSummary (ranges) {
  if (!ranges.length) return '暂无分级明细'
  return ranges.map(range => `Z${range.z}: ${range.count}`).join('，')
}

function renderTaskPanel (tasks) {
  return `
    <section class="admin-panel admin-panel-wide" data-precache-task-panel>
      <div class="admin-panel-head">
        <h2>任务</h2>
        <span class="admin-badge">${tasks.length}</span>
      </div>
      <div class="admin-task-list">
        ${tasks.slice(0, 10).map(task => renderTaskCard(task)).join('') || '<p class="admin-empty">暂无任务</p>'}
      </div>
    </section>
  `
}

function renderTaskCard (task) {
  const expanded = task.expanded
  return `
    <article class="admin-task-card">
      <div class="admin-task-main">
        <div class="admin-task-title">
          <span class="admin-status">${escapeHtml(getTaskStatusLabel(task.status))}</span>
          <strong>${escapeHtml(task.providerId)}</strong>
          <small>${formatTime(task.updatedAt)}</small>
        </div>
        ${renderTaskProgress(task)}
      </div>
      <dl class="admin-task-summary">
        <div><dt>体积</dt><dd>${formatBytes(task.bytes || 0)}</dd></div>
        <div><dt>级别</dt><dd>${escapeHtml(task.minZoom)}-${escapeHtml(task.maxZoom)}</dd></div>
        <div><dt>并发</dt><dd>${escapeHtml(task.concurrency || 0)}</dd></div>
      </dl>
      ${renderTaskActions(task)}
      ${expanded ? renderTaskDetails(task) : ''}
    </article>
  `
}

function renderTaskProgress (task) {
  const completed = Number(task.completed || 0)
  const total = Number(task.total || 0)
  const percent = total ? Math.min(100, Math.round(completed / total * 100)) : 0
  return `
    <div class="admin-task-progress">
      <span>${escapeHtml(completed)} / ${escapeHtml(total)} (${percent}%)</span>
      <small>成功 ${escapeHtml(task.succeeded || 0)}，失败 ${escapeHtml(task.failed || 0)}</small>
    </div>
  `
}

function renderTaskActions (task) {
  const canPause = ['queued', 'running'].includes(task.status)
  const canResume = ['paused', 'interrupted'].includes(task.status)
  const canPreview = ['completed', 'completed_with_errors'].includes(task.status)
  const expandedLabel = task.expanded ? '收起' : '详情'

  return `
    <div class="admin-task-actions">
      ${canPause ? `<button type="button" data-precache-task-action="pause" data-task-id="${escapeHtml(task.id)}">暂停</button>` : ''}
      ${canResume ? `<button type="button" data-precache-task-action="resume" data-task-id="${escapeHtml(task.id)}">继续</button>` : ''}
      <button type="button" data-precache-task-action="edit" data-task-id="${escapeHtml(task.id)}">编辑</button>
      <button type="button" data-precache-task-action="update" data-task-id="${escapeHtml(task.id)}">更新</button>
      ${canPreview ? `<button type="button" data-precache-task-action="preview" data-task-id="${escapeHtml(task.id)}">预览</button>` : ''}
      <button type="button" data-precache-task-action="toggle-details" data-task-id="${escapeHtml(task.id)}">${expandedLabel}</button>
      <button type="button" class="danger" data-precache-task-action="delete" data-task-id="${escapeHtml(task.id)}">删除</button>
    </div>
  `
}

function renderTaskDetails (task) {
  const bounds = task.bounds || {}
  const ranges = task.ranges || []
  const errors = task.errors || []

  return `
    <div class="admin-task-details">
      <dl>
        <div><dt>区域</dt><dd>西 ${escapeHtml(bounds.west)} / 南 ${escapeHtml(bounds.south)} / 东 ${escapeHtml(bounds.east)} / 北 ${escapeHtml(bounds.north)}</dd></div>
        <div><dt>级别明细</dt><dd>${renderRangeSummary(ranges)}</dd></div>
        <div><dt>创建时间</dt><dd>${formatTime(task.createdAt)}</dd></div>
        <div><dt>完成时间</dt><dd>${formatTime(task.finishedAt)}</dd></div>
      </dl>
      ${errors.length ? `
        <div class="admin-task-errors">
          ${errors.slice(-3).map(error => `<p>${escapeHtml(error.message || '未知错误')}</p>`).join('')}
        </div>
      ` : ''}
    </div>
  `
}

function collectPrecacheForm (state, form) {
  updatePrecacheFormState(state, form)
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

function replaceTaskInState (state, task) {
  state.tasks = state.tasks.map(item => item.id === task.id ? task : item)
}

function removeTaskFromState (state, taskId) {
  state.tasks = state.tasks.filter(item => item.id !== taskId)
}

function updatePrecacheTaskPanelView (state) {
  const taskPanel = state.root?.querySelector('[data-precache-task-panel]')
  if (!taskPanel) return
  taskPanel.outerHTML = renderTaskPanel(getTasksForRender(state))
}

function stableStringify (value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function clearPrecacheEstimateForPendingChange (state) {
  estimateRequestId += 1
  pendingEstimateKey = ''
  state.precacheEstimate = null
  state.precacheEstimateStatus = ''
  state.precacheEstimateError = ''
  updatePrecacheEstimateView(state)
}

export function schedulePrecacheEstimate (state, api, delay = PRECACHE_ESTIMATE_DELAY) {
  if (state.activeTab !== 'precache') return
  window.clearTimeout(estimateTimer)
  estimateTimer = window.setTimeout(() => {
    refreshPrecacheEstimate(state, api)
  }, delay)
}

async function refreshPrecacheEstimate (state, api) {
  if (state.activeTab !== 'precache') return

  const form = state.root?.querySelector('[data-precache-form]')
  if (!form) return

  const payload = collectPrecacheForm(state, form)
  const payloadKey = stableStringify(payload)
  if (payloadKey === lastEstimateKey || payloadKey === pendingEstimateKey) {
    return
  }

  const requestId = estimateRequestId + 1
  estimateRequestId = requestId
  pendingEstimateKey = payloadKey
  state.precacheEstimateStatus = 'loading'
  state.precacheEstimateError = ''
  updatePrecacheEstimateView(state)

  try {
    const estimate = await api.estimateTask(payload)
    if (requestId !== estimateRequestId) return
    state.precacheEstimate = estimate
    state.precacheEstimateStatus = ''
    state.precacheEstimateError = ''
    lastEstimateKey = payloadKey
    pendingEstimateKey = ''
    updatePrecacheEstimateView(state)
  } catch (err) {
    if (requestId !== estimateRequestId) return
    state.precacheEstimate = null
    state.precacheEstimateStatus = ''
    state.precacheEstimateError = err.message
    pendingEstimateKey = ''
    updatePrecacheEstimateView(state)
  }
}

export function schedulePrecacheTaskRefresh (state, api, delay = PRECACHE_TASK_REFRESH_DELAY) {
  window.clearTimeout(taskRefreshTimer)
  if (state.activeTab !== 'precache' || !hasActiveTasks(state.tasks)) return

  taskRefreshTimer = window.setTimeout(() => {
    refreshPrecacheTasks(state, api)
  }, delay)
}

async function refreshPrecacheTasks (state, api) {
  if (state.activeTab !== 'precache') return

  const requestId = taskRefreshRequestId + 1
  taskRefreshRequestId = requestId

  try {
    const tasks = await api.tasks()
    if (requestId !== taskRefreshRequestId || state.activeTab !== 'precache') return
    state.tasks = tasks
    updatePrecacheTaskPanelView(state)
    schedulePrecacheTaskRefresh(state, api)
  } catch (err) {
    console.warn('预缓存任务状态刷新失败', err)
    schedulePrecacheTaskRefresh(state, api, PRECACHE_TASK_REFRESH_DELAY * 2)
  }
}

export async function handlePrecacheSubmit ({ api, event, renderDashboard, setNotice, state }) {
  const precacheForm = event.target.closest('[data-precache-form]')
  const placeSearchForm = event.target.closest('[data-place-search-form]')

  if (precacheForm) {
    event.preventDefault()
    try {
      const task = await api.createTask(collectPrecacheForm(state, precacheForm))
      state.tasks = [task, ...state.tasks]
      setNotice('预缓存任务已创建')
      renderDashboard()
      schedulePrecacheTaskRefresh(state, api, 300)
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  if (placeSearchForm) {
    event.preventDefault()
    const keyword = placeSearchForm.elements.keyword.value.trim()
    if (keyword) {
      await searchPlaces(state, keyword)
    }
    return true
  }

  return false
}

export async function handlePrecacheClick ({ api, event, renderDashboard, setNotice, showConfirm, state }) {
  const taskActionTarget = event.target.closest('[data-precache-task-action]')
  if (taskActionTarget) {
    await handlePrecacheTaskAction({
      actionTarget: taskActionTarget,
      api,
      renderDashboard,
      setNotice,
      showConfirm,
      state,
    })
    return true
  }

  const placeTarget = event.target.closest('[data-place-lng][data-place-lat]')
  if (placeTarget) {
    movePrecacheMapToPoint(
      state,
      Number(placeTarget.getAttribute('data-place-lng')),
      Number(placeTarget.getAttribute('data-place-lat'))
    )
    return true
  }

  const actionTarget = event.target.closest('[data-admin-action]')
  if (actionTarget?.getAttribute('data-admin-action') === 'sync-bounds') {
    syncBoundsFromMap(state)
    clearPrecacheEstimateForPendingChange(state)
    schedulePrecacheEstimate(state, api)
    return true
  }

  return false
}

export async function handlePrecacheChange ({ api, event, state }) {
  const precacheForm = event.target.closest('[data-precache-form]')
  if (!precacheForm) return false

  updatePrecacheFormState(state, precacheForm)
  clearPrecacheEstimateForPendingChange(state)
  schedulePrecacheEstimate(state, api)
  return true
}

async function handlePrecacheTaskAction ({ actionTarget, api, renderDashboard, setNotice, showConfirm, state }) {
  const action = actionTarget.getAttribute('data-precache-task-action')
  const taskId = actionTarget.getAttribute('data-task-id')
  const task = state.tasks.find(item => item.id === taskId)
  if (!action || !taskId) return

  try {
    if (action === 'pause') {
      replaceTaskInState(state, await api.pauseTask(taskId))
      setNotice('预缓存任务已暂停')
      renderDashboard()
      schedulePrecacheTaskRefresh(state, api, 300)
      return
    }

    if (action === 'resume') {
      replaceTaskInState(state, await api.resumeTask(taskId))
      setNotice('预缓存任务已继续')
      renderDashboard()
      schedulePrecacheTaskRefresh(state, api, 300)
      return
    }

    if (action === 'delete') {
      if (!await showConfirm('删除此预缓存任务？执行中的任务会停止并从列表移除。')) return
      await api.deleteTask(taskId)
      removeTaskFromState(state, taskId)
      setNotice('预缓存任务已删除')
      renderDashboard()
      return
    }

    if (action === 'edit' && task) {
      applyTaskToPrecacheForm(state, task)
      clearPrecacheEstimateForPendingChange(state)
      schedulePrecacheEstimate(state, api)
      setNotice('任务参数已回填，可调整后创建新任务')
      renderDashboard()
      return
    }

    if (action === 'update' && task) {
      const updatedTask = await api.createTask({
        providerId: task.providerId,
        bounds: task.bounds,
        minZoom: task.minZoom,
        maxZoom: task.maxZoom,
        concurrency: task.concurrency,
        refresh: false,
      })
      state.tasks = [updatedTask, ...state.tasks]
      setNotice('更新任务已创建，将跳过新鲜缓存并补齐缺失瓦片')
      renderDashboard()
      schedulePrecacheTaskRefresh(state, api, 300)
      return
    }

    if (action === 'toggle-details') {
      if (state.expandedTaskIds.has(taskId)) {
        state.expandedTaskIds.delete(taskId)
      } else {
        state.expandedTaskIds.add(taskId)
      }
      renderDashboard()
      return
    }

    if (action === 'preview' && task) {
      window.location.href = buildTaskPreviewUrl(task)
    }
  } catch (err) {
    setNotice('', err.message)
    renderDashboard()
    schedulePrecacheTaskRefresh(state, api, 300)
  }
}

export async function loadAmapForAdmin (state) {
  if (state.AMap) return state.AMap

  window._AMapSecurityConfig = {
    securityJsCode: amapConfig.securityJsCode,
  }

  if (!state.amapLoader) {
    console.warn('高德 JSAPI Loader 未初始化，后台地点搜索不可用')
    return null
  }

  state.AMap = await state.amapLoader.load({
    key: amapConfig.key,
    version: '2.0',
    plugins: amapConfig.plugins,
  }).catch((err) => {
    console.warn('高德 JSAPI 加载失败，后台地点搜索不可用', err)
    return null
  })
  return state.AMap
}

function readBoundsFromForm (state) {
  const form = state.root.querySelector('[data-precache-form]')
  return {
    west: Number(form?.elements.west.value),
    south: Number(form?.elements.south.value),
    east: Number(form?.elements.east.value),
    north: Number(form?.elements.north.value),
  }
}

function writeBoundsToForm (state, bounds) {
  const form = state.root.querySelector('[data-precache-form]')
  if (!form) return

  form.elements.west.value = bounds.getWest().toFixed(6)
  form.elements.south.value = bounds.getSouth().toFixed(6)
  form.elements.east.value = bounds.getEast().toFixed(6)
  form.elements.north.value = bounds.getNorth().toFixed(6)
  updatePrecacheFormState(state, form)
}

export function syncBoundsFromMap (state) {
  if (!state.map || !state.rectangle) return
  const bounds = state.map.getBounds()
  state.rectangle.setBounds(bounds)
  writeBoundsToForm(state, bounds)
}

export function updatePrecacheFormState (state, form) {
  if (!form) return null
  state.precacheForm = {
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
  return state.precacheForm
}

export function buildTaskPreviewUrl (task) {
  const bounds = task.bounds || {}
  const centerLat = (Number(bounds.south) + Number(bounds.north)) / 2
  const centerLng = (Number(bounds.west) + Number(bounds.east)) / 2
  const zoom = Number(task.maxZoom || task.minZoom || defaultMapView.zoom)

  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
    return '/'
  }

  const coords = [
    centerLat.toFixed(6),
    centerLng.toFixed(6),
    Math.max(3, Math.min(20, zoom)),
    0,
  ].join(',')
  return `/?coords=${encodeURIComponent(coords)}`
}

export function applyTaskToPrecacheForm (state, task) {
  if (!task) return
  const bounds = task.bounds || {}

  state.precacheForm = {
    providerId: task.providerId || state.precacheForm?.providerId || '',
    bounds: {
      west: Number(bounds.west),
      south: Number(bounds.south),
      east: Number(bounds.east),
      north: Number(bounds.north),
    },
    minZoom: Number(task.minZoom),
    maxZoom: Number(task.maxZoom),
    concurrency: Number(task.concurrency || state.precacheForm?.concurrency || 4),
    refresh: false,
  }
}

export function movePrecacheMapToPoint (state, lng, lat, zoom = 15) {
  if (!state.map) return
  state.map.setView([lat, lng], zoom)
  syncBoundsFromMap(state)
  if (state.onPrecacheBoundsChange instanceof Function) {
    state.onPrecacheBoundsChange()
  }
}

export function initPrecacheMap (state, api) {
  schedulePrecacheTaskRefresh(state, api)

  const container = state.root.querySelector('#admin-precache-map')
  if (!container) return
  state.onPrecacheBoundsChange = () => schedulePrecacheEstimate(state, api)

  // 移除之前切换面板残留的高德搜索建议气泡 DOM 节点，防止内存泄露和气泡悬空
  document.querySelectorAll('.amap-sug-result').forEach(el => el.remove())

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
  L.tileLayer(relayTileUrl(tileRelayEndpoint, 'https://webst01.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}'), {
    minZoom: 3,
    maxZoom: 18,
    keepBuffer: 4,
  }).addTo(map)

  const formBounds = readBoundsFromForm(state)
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
  let readyForBoundsChange = false
  map.fitBounds(bounds)
  map.on('moveend zoomend', () => syncBoundsFromMap(state))
  map.on('moveend zoomend', () => {
    if (readyForBoundsChange && state.onPrecacheBoundsChange instanceof Function) {
      state.onPrecacheBoundsChange()
    }
  })
  window.requestAnimationFrame(() => {
    readyForBoundsChange = true
  })

  state.map = map

  // 为后台预缓存搜索输入框绑定高德 AutoComplete 插件以支持搜索预填充
  const searchInput = state.root.querySelector('[data-place-search-form] input[name="keyword"]')
  if (searchInput) {
    searchInput.id = 'admin-precache-search-input'
    loadAmapForAdmin(state).then((AMap) => {
      if (AMap && AMap.AutoComplete) {
        const autoComplete = new AMap.AutoComplete({
          input: 'admin-precache-search-input',
        })
        autoComplete.on('select', (event) => {
          if (event.poi?.location) {
            const { lng, lat } = event.poi.location
            movePrecacheMapToPoint(state, lng, lat)
          }
        })
      }
    })
  }
}

export async function searchPlaces (state, keyword) {
  const resultsNode = state.root.querySelector('[data-place-search-results]')
  if (!resultsNode) return

  const AMap = await loadAmapForAdmin(state)
  if (!AMap) {
    resultsNode.innerHTML = '<p>高德搜索暂不可用</p>'
    return
  }

  const placeSearch = new AMap.PlaceSearch({
    pageSize: 8,
    pageIndex: 1,
  })

  resultsNode.innerHTML = '<p>正在搜索</p>'
  placeSearch.search(keyword, (status, result) => {
    if (status !== 'complete' || !result?.poiList?.pois?.length) {
      resultsNode.innerHTML = '<p>没有找到匹配地点</p>'
      return
    }

    resultsNode.innerHTML = result.poiList.pois.map((poi) => {
      const location = poi.location
      return `
        <button type="button" data-place-lng="${location.lng}" data-place-lat="${location.lat}">
          <strong>${escapeHtml(poi.name)}</strong>
          <span>${escapeHtml(poi.address || poi.district || '')}</span>
        </button>
      `
    }).join('')
  })
}
