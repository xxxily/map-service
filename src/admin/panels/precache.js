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

export function renderPrecachePanel (state) {
  const providers = state.providers || []
  const formState = getPrecacheFormState(state, providers)
  const selectedProvider = getSelectedProvider(providers, formState)
  const tasks = state.tasks || []

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
          ${renderEstimate(state)}
          <button type="submit">创建任务</button>
        </form>
      </section>
      ${renderTaskPanel(tasks)}
    </div>
  `
}

function renderEstimate (state) {
  const estimate = state.precacheEstimate
  if (state.precacheEstimateStatus === 'loading') {
    return '<div class="admin-estimate"><p>正在估算瓦片数量和下载体积</p></div>'
  }

  if (state.precacheEstimateError) {
    return `<div class="admin-estimate is-error"><p>${escapeHtml(state.precacheEstimateError)}</p></div>`
  }

  if (!estimate) {
    return '<div class="admin-estimate"><p>调整区域、图层或级别后会自动估算任务规模</p></div>'
  }

  return `
    <div class="admin-estimate ${estimate.withinLimit ? '' : 'is-warning'}">
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

function renderRangeSummary (ranges) {
  if (!ranges.length) return '暂无分级明细'
  return ranges.map(range => `Z${range.z}: ${range.count}`).join('，')
}

function renderTaskPanel (tasks) {
  return `
    <section class="admin-panel admin-panel-wide">
      <div class="admin-panel-head">
        <h2>任务</h2>
        <span class="admin-badge">${tasks.length}</span>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>状态</th><th>图层</th><th>进度</th><th>体积</th><th>更新时间</th><th>操作</th></tr></thead>
          <tbody>
            ${tasks.slice(0, 10).map(task => `
              <tr>
                <td><span class="admin-status">${escapeHtml(TASK_STATUS_LABELS[task.status] || task.status)}</span></td>
                <td>${escapeHtml(task.providerId)}</td>
                <td>${renderTaskProgress(task)}</td>
                <td>${formatBytes(task.bytes || 0)}</td>
                <td>${formatTime(task.updatedAt)}</td>
                <td>${renderTaskActions(task)}</td>
              </tr>
            `).join('') || '<tr><td colspan="6">暂无任务</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
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

  return `
    <div class="admin-task-actions">
      ${canPause ? `<button type="button" data-precache-task-action="pause" data-task-id="${escapeHtml(task.id)}">暂停</button>` : ''}
      ${canResume ? `<button type="button" data-precache-task-action="resume" data-task-id="${escapeHtml(task.id)}">继续</button>` : ''}
      ${canPreview ? `<button type="button" data-precache-task-action="preview" data-task-id="${escapeHtml(task.id)}">预览</button>` : ''}
      <button type="button" class="danger" data-precache-task-action="delete" data-task-id="${escapeHtml(task.id)}">删除</button>
    </div>
  `
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

export function movePrecacheMapToPoint (state, lng, lat, zoom = 15) {
  if (!state.map) return
  state.map.setView([lat, lng], zoom)
  syncBoundsFromMap(state)
}

export function initPrecacheMap (state) {
  const container = state.root.querySelector('#admin-precache-map')
  if (!container) return

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
  map.fitBounds(bounds)
  map.on('moveend zoomend', () => syncBoundsFromMap(state))
  map.on('moveend zoomend', () => {
    if (state.onPrecacheBoundsChange instanceof Function) {
      state.onPrecacheBoundsChange()
    }
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
