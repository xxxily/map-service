import L from 'leaflet'
import { amapConfig, defaultMapView, tileRelayEndpoint } from '../../config.js'
import { escapeHtml, formatTime, relayTileUrl } from '../utils.js'

export function renderPrecachePanel (state) {
  const providers = state.providers || []
  const firstProvider = providers[0]
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
      ${renderTaskPanel(tasks)}
    </div>
  `
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
          <thead><tr><th>状态</th><th>图层</th><th>进度</th><th>成功</th><th>失败</th><th>更新时间</th></tr></thead>
          <tbody>
            ${tasks.slice(0, 10).map(task => `
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
}

export function syncBoundsFromMap (state) {
  if (!state.map || !state.rectangle) return
  const bounds = state.map.getBounds()
  state.rectangle.setBounds(bounds)
  writeBoundsToForm(state, bounds)
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
