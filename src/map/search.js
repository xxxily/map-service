import L from 'leaflet'
import { getBestPosition, positionToGcj02 } from './geolocation.js'
import { showAlert, showConfirm } from '../ui/dialog.js'
import {
  renderSearchHistoryDropdown,
  saveSearchHistory,
} from './search-history.js'
import { createAmapSearchBias } from './search-bias.js'
import { saveRouteLineToKml } from './kml.js'
import {
  buildRouteDefaultName,
  buildRouteDescription,
  formatRouteDistance,
  formatRouteDuration,
  getBestRouteLocationName,
  getRouteMetrics,
  getRoutePath,
  swapRouteEndpoints,
} from './route-planner-utils.js'

let currentSearchMarker = null

// 路线规划相关的状态变量
let routeFeatureGroup = null
let routePolylines = []
let routeData = null
let activeRouteIndex = 0
let startPoi = null
let endPoi = null
let startPickMarker = null
let endPickMarker = null
let temporaryRouteGroup = null
let temporaryRoutes = []
let routePlanningRequestId = 0
let routeLifecycleBound = false
let routePlanningBusy = false

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function routePathForLeaflet (route) {
  return getRoutePath(route).map(point => [point.lat, point.lng])
}

function selectedRoute () {
  return routeData?.[activeRouteIndex] || null
}

function snapshotRoutePoi (poi) {
  if (!poi?.location) return null
  const lat = Number(poi.location.lat)
  const lng = Number(poi.location.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    name: String(poi.name || '').trim(),
    location: { lat, lng },
  }
}

function updateRouteActionState () {
  if (typeof document === 'undefined') return
  const hasRoute = !routePlanningBusy && Boolean(selectedRoute() && routePathForLeaflet(selectedRoute()).length >= 2)
  const swapButton = document.getElementById('route-swap-btn')
  if (swapButton) swapButton.disabled = !(startPoi?.location && endPoi?.location)
  ;['route-save-btn', 'route-add-btn', 'route-nav-btn'].forEach(id => {
    const button = document.getElementById(id)
    if (button) button.disabled = !hasRoute
  })
}

function resolveBestPoiName (AMap, poi) {
  if (!poi?.location) return Promise.resolve(String(poi?.name || ''))
  const fallback = String(poi.name || `位置 (${Number(poi.location.lat).toFixed(4)}, ${Number(poi.location.lng).toFixed(4)})`)
  if (!AMap?.plugin) return Promise.resolve(fallback)
  return new Promise(resolve => {
    let settled = false
    let timeoutId = null
    const finish = name => {
      if (settled) return
      settled = true
      if (timeoutId !== null && typeof window !== 'undefined') window.clearTimeout(timeoutId)
      resolve(String(name || fallback).trim() || fallback)
    }
    try {
      AMap.plugin('AMap.Geocoder', () => {
        try {
          const geocoder = new AMap.Geocoder({ extensions: 'all', radius: 1000 })
          geocoder.getAddress([poi.location.lng, poi.location.lat], (status, result) => {
            finish(status === 'complete' ? getBestRouteLocationName(result, fallback) : fallback)
          })
        } catch {
          finish(fallback)
        }
      })
    } catch {
      finish(fallback)
    }
    if (typeof window !== 'undefined') timeoutId = window.setTimeout(() => finish(fallback), 5000)
  })
}

async function resolveRouteEndpointNames (AMap, endpoints = {}) {
  const start = endpoints.start || startPoi
  const end = endpoints.end || endPoi
  const [startName, endName] = await Promise.all([
    resolveBestPoiName(AMap, start),
    resolveBestPoiName(AMap, end),
  ])
  if (start && start === startPoi) startPoi.name = startName
  if (end && end === endPoi) endPoi.name = endName
  const startInput = typeof document !== 'undefined' ? document.getElementById('route-start-input') : null
  const endInput = typeof document !== 'undefined' ? document.getElementById('route-end-input') : null
  if (startInput && start === startPoi && startName) startInput.value = startName
  if (endInput && end === endPoi && endName) endInput.value = endName
  return { startName, endName }
}

function removeTemporaryRoute (map, id) {
  const index = temporaryRoutes.findIndex(item => item.id === String(id || ''))
  if (index < 0) return false
  const [item] = temporaryRoutes.splice(index, 1)
  if (item.layer) {
    item.layer.closePopup?.()
    temporaryRouteGroup?.removeLayer(item.layer)
    if (!temporaryRouteGroup && map.hasLayer?.(item.layer)) map.removeLayer(item.layer)
  }
  if (temporaryRouteGroup && temporaryRouteGroup.getLayers?.().length === 0) {
    map.removeLayer(temporaryRouteGroup)
    temporaryRouteGroup = null
  }
  return true
}

function clearTemporaryRoutes (map) {
  temporaryRoutes.forEach(item => item.layer?.closePopup?.())
  if (temporaryRouteGroup) map.removeLayer(temporaryRouteGroup)
  temporaryRouteGroup = null
  temporaryRoutes = []
}

function renderTemporaryRoutePopup (item) {
  return `
    <div class="route-temp-popup-content">
      <div class="route-temp-popup-eyebrow">临时路线 · 方案 ${item.routeIndex + 1}</div>
      <div class="route-temp-popup-title">${escapeHtml(item.name)}</div>
      <div class="route-temp-popup-meta">${escapeHtml(formatRouteDistance(item.metrics.meters))} · ${escapeHtml(formatRouteDuration(item.metrics.seconds))}</div>
      <div class="route-temp-popup-endpoints">${escapeHtml(item.startName)} → ${escapeHtml(item.endName)}</div>
      <div class="route-temp-popup-actions">
        <button type="button" class="route-temp-popup-btn primary" data-temp-route-save="${escapeHtml(item.id)}" title="保存路线">保存</button>
        <button type="button" class="route-temp-popup-btn danger" data-temp-route-delete="${escapeHtml(item.id)}" title="删除临时路线">删除</button>
      </div>
    </div>
  `
}

function bindTemporaryRoutePopup (map, AMap, item, popup) {
  const container = popup?.getElement?.()
  if (!container || container.dataset.routeTempBound === 'true') return
  container.dataset.routeTempBound = 'true'
  L.DomEvent.disableClickPropagation(container)
  container.querySelector('[data-temp-route-save]')?.addEventListener('click', async event => {
    event.preventDefault()
    event.stopPropagation()
    const saved = await saveRouteLineToKml(map, {
      latlngs: item.path,
      name: buildRouteDefaultName(item.startName, item.endName),
      description: buildRouteDescription(item.route, item.startName, item.endName, item.routeIndex),
    })
    if (saved) {
      item.layer?.closePopup?.()
      await showAlert(`路线已保存到“${saved.kmlName || '目标 KML'}”。`, { title: '保存成功' })
    }
  })
  container.querySelector('[data-temp-route-delete]')?.addEventListener('click', async event => {
    event.preventDefault()
    event.stopPropagation()
    if (!(await showConfirm('确认删除这条临时路线吗？', { title: '删除临时路线', confirmText: '删除' }))) return
    removeTemporaryRoute(map, item.id)
  })
}

async function addTemporaryRoute (map, AMap, routeIndex = activeRouteIndex) {
  const route = routeData?.[routeIndex]
  const path = routePathForLeaflet(route)
  if (!route || path.length < 2) return false
  const endpoints = { start: snapshotRoutePoi(startPoi), end: snapshotRoutePoi(endPoi) }
  const names = await resolveRouteEndpointNames(AMap, endpoints)
  if (!temporaryRouteGroup) temporaryRouteGroup = L.featureGroup().addTo(map)
  const item = {
    id: `temporary-route-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    route,
    routeIndex,
    path,
    startName: names.startName || endpoints.start?.name || '起点',
    endName: names.endName || endpoints.end?.name || '终点',
    name: buildRouteDefaultName(names.startName, names.endName),
    metrics: getRouteMetrics(route),
    layer: null,
  }
  item.layer = L.polyline(path, {
    color: '#c2410c',
    weight: 6,
    opacity: 0.9,
    dashArray: '10 7',
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(temporaryRouteGroup)
  item.layer.bindPopup(renderTemporaryRoutePopup(item), {
    closeButton: false,
    className: 'route-temp-popup',
    maxWidth: 300,
    minWidth: 230,
  })
  item.layer.on('click', event => {
    L.DomEvent.stopPropagation(event)
    item.layer.openPopup()
  })
  item.layer.on('popupopen', event => bindTemporaryRoutePopup(map, AMap, item, event.popup))
  temporaryRoutes.push(item)
  return true
}

async function saveSelectedRoute (map, AMap, routeIndex = activeRouteIndex) {
  const route = routeData?.[routeIndex]
  const path = routePathForLeaflet(route)
  if (!route || path.length < 2) return false
  const endpoints = { start: snapshotRoutePoi(startPoi), end: snapshotRoutePoi(endPoi) }
  const names = await resolveRouteEndpointNames(AMap, endpoints)
  if (routeData?.[routeIndex] !== route) return false
  const saved = await saveRouteLineToKml(map, {
    latlngs: path,
    name: buildRouteDefaultName(names.startName, names.endName),
    description: buildRouteDescription(route, names.startName, names.endName, routeIndex),
  })
  if (saved) {
    await showAlert(`路线已保存到“${saved.kmlName || '目标 KML'}”。`, { title: '保存成功' })
    return true
  }
  return false
}

// 清理路线相关的地图图层和状态
function clearRouteLayers (map, options = {}) {
  if (options.invalidate !== false) {
    routePlanningRequestId += 1
    routePlanningBusy = false
  }
  if (routeFeatureGroup) {
    map.removeLayer(routeFeatureGroup)
    routeFeatureGroup = null
  }
  routePolylines = []
  routeData = null
  activeRouteIndex = 0

  const resultsList = document.getElementById('route-results-list')
  const navigateBox = document.getElementById('route-navigate-box')
  if (resultsList) {
    resultsList.innerHTML = ''
    resultsList.style.display = 'none'
  }
  if (navigateBox) navigateBox.style.display = 'none'
  updateRouteActionState()
}

// 清理所有地图上的选点大头针
function clearAllRoutePickers (map) {
  if (startPickMarker) {
    map.removeLayer(startPickMarker)
    startPickMarker = null
  }
  if (endPickMarker) {
    map.removeLayer(endPickMarker)
    endPickMarker = null
  }
}

// 切换当前激活的折线和卡片
function selectRoute (index) {
  if (!routePolylines || routePolylines.length === 0) return
  const requestedIndex = Number(index)
  const normalizedIndex = Number.isInteger(requestedIndex) ? requestedIndex : 0
  activeRouteIndex = Math.max(0, Math.min(normalizedIndex, routePolylines.length - 1))

  // 更新地图折线样式
  routePolylines.forEach((polyline, idx) => {
    if (idx === activeRouteIndex) {
      polyline.setStyle({
        color: '#0f766e',
        weight: 7,
        opacity: 0.95,
      })
      polyline.bringToFront()
    } else {
      polyline.setStyle({
        color: '#94a3b8',
        weight: 5,
        opacity: 0.75,
      })
    }
  })

  // 更新面板卡片样式
  const cards = document.querySelectorAll('.route-card')
  cards.forEach((card, idx) => {
    if (idx === activeRouteIndex) {
      card.classList.add('active')
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    } else {
      card.classList.remove('active')
    }
  })
  updateRouteActionState()
}

// 更新或绘制大头针标记
function updatePickMarker (map, latlng, isStart) {
  const iconHtml = isStart
    ? `<div class="route-marker-pin start-pin">起</div>`
    : `<div class="route-marker-pin end-pin">终</div>`

  const icon = L.divIcon({
    html: iconHtml,
    className: 'custom-route-pin',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  })

  if (isStart) {
    if (startPickMarker) {
      startPickMarker.setLatLng(latlng)
    } else {
      startPickMarker = L.marker(latlng, { draggable: true, icon: icon }).addTo(map)
      bindMarkerDragEvents(map, startPickMarker, true)
    }
  } else {
    if (endPickMarker) {
      endPickMarker.setLatLng(latlng)
    } else {
      endPickMarker = L.marker(latlng, { draggable: true, icon: icon }).addTo(map)
      bindMarkerDragEvents(map, endPickMarker, false)
    }
  }
}

// 绑定大头针拖拽重新规划事件
function bindMarkerDragEvents (map, marker, isStart) {
  const startInput = document.getElementById('route-start-input')
  const endInput = document.getElementById('route-end-input')

  marker.on('dragend', async (event) => {
    const latlng = event.target.getLatLng()
    const lat = latlng.lat
    const lng = latlng.lng

    const input = isStart ? startInput : endInput
    if (!input) return

    const displayName = `地图选定位置 (${lat.toFixed(4)}, ${lng.toFixed(4)})`
    input.value = '正在解析位置...'

    const poi = {
      name: displayName,
      location: { lng, lat },
    }

    clearRouteLayers(map)
    if (isStart) {
      startPoi = poi
    } else {
      endPoi = poi
    }
    updateRouteActionState()
    const endpointRequestId = routePlanningRequestId

    AMap.plugin('AMap.Geocoder', () => {
      const geocoder = new AMap.Geocoder()
      geocoder.getAddress([lng, lat], (status, result) => {
        if (endpointRequestId !== routePlanningRequestId) return
        if (status === 'complete' && result.regeocode) {
          const address = result.regeocode.formattedAddress || displayName
          poi.name = address
          input.value = address
        } else {
          input.value = displayName
        }
        saveSearchHistory('map_route_history', poi)
        if (startPoi && endPoi) {
          triggerRoutePlanning(map, AMap)
        } else {
          clearRouteLayers(map)
        }
      })
    })
  })
}

// 提取路线计算逻辑为自适应重新规划纯函数
function triggerRoutePlanning (map, AMap) {
  if (!startPoi || !endPoi) return
  clearRouteLayers(map)
  const planningStart = snapshotRoutePoi(startPoi)
  const planningEnd = snapshotRoutePoi(endPoi)
  if (!planningStart || !planningEnd) return
  const requestId = ++routePlanningRequestId
  routePlanningBusy = true
  updateRouteActionState()

  AMap.plugin('AMap.Driving', () => {
    const driving = new AMap.Driving({
      policy: 10,
      extensions: 'all',
    })

    const startLngLat = new AMap.LngLat(planningStart.location.lng, planningStart.location.lat)
    const endLngLat = new AMap.LngLat(planningEnd.location.lng, planningEnd.location.lat)

    driving.search(startLngLat, endLngLat, async (status, result) => {
      if (requestId !== routePlanningRequestId) return
      const routes = Array.isArray(result?.routes)
        ? result.routes.filter(route => routePathForLeaflet(route).length >= 2)
        : []
      if (status !== 'complete' || routes.length === 0) {
        routePlanningBusy = false
        updateRouteActionState()
        await showAlert('路线规划失败: ' + (result?.info || '未知错误'))
        return
      }

      saveSearchHistory('map_route_history', planningStart)
      saveSearchHistory('map_route_history', planningEnd)

      clearRouteLayers(map, { invalidate: false })
      routePlanningBusy = true
      routeFeatureGroup = L.featureGroup().addTo(map)
      routeData = routes

      // 确保地图选点大头针被画出并且更新到最新位置
      updatePickMarker(map, [planningStart.location.lat, planningStart.location.lng], true)
      updatePickMarker(map, [planningEnd.location.lat, planningEnd.location.lng], false)

      routeData.forEach((route, idx) => {
        const pathPoints = routePathForLeaflet(route)
        if (pathPoints.length < 2) return

        const polyline = L.polyline(pathPoints, {
          color: '#94a3b8',
          weight: 5,
          opacity: 0.75,
        }).addTo(routeFeatureGroup)

        polyline.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          selectRoute(idx)
        })

        routePolylines.push(polyline)
      })

      // 面板卡片展示
      const resultsList = document.getElementById('route-results-list')
      if (resultsList) {
        resultsList.style.display = ''
        resultsList.innerHTML = routeData.map((route, idx) => {
          const metrics = getRouteMetrics(route)
          const activeClass = idx === 0 ? 'active' : ''
          return `
            <div class="route-card ${activeClass}" data-route-idx="${idx}">
              <div class="route-card-main">
                <div class="route-card-title">方案 ${idx + 1}</div>
                <div class="route-card-meta">${escapeHtml(formatRouteDuration(metrics.seconds))} · ${escapeHtml(formatRouteDistance(metrics.meters))}</div>
              </div>
              <div class="route-card-actions" aria-label="方案 ${idx + 1} 操作">
                <button type="button" class="route-card-icon-btn" data-route-action="save" data-route-idx="${idx}" title="保存路线" aria-label="保存方案 ${idx + 1}">
                  <svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-6h8v6"/></svg>
                </button>
                <button type="button" class="route-card-icon-btn" data-route-action="add" data-route-idx="${idx}" title="添加到地图" aria-label="添加方案 ${idx + 1} 到地图">
                  <svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                </button>
              </div>
            </div>
          `
        }).join('')

        resultsList.querySelectorAll('.route-card').forEach((card) => {
          card.addEventListener('click', () => {
            const idx = parseInt(card.getAttribute('data-route-idx'), 10)
            selectRoute(idx)
          })
        })
        resultsList.querySelectorAll('[data-route-action]').forEach(button => {
          button.addEventListener('click', async event => {
            event.preventDefault()
            event.stopPropagation()
            const idx = Number(button.getAttribute('data-route-idx'))
            selectRoute(idx)
            if (button.getAttribute('data-route-action') === 'save') await saveSelectedRoute(map, AMap, idx)
            else await addTemporaryRoute(map, AMap, idx)
          })
        })
      }

      // 开启导航栏展示
      const navigateBox = document.getElementById('route-navigate-box')
      if (navigateBox) {
        navigateBox.style.display = 'block'
      }

      // 规划成功后，自动将输入框隐退收起，展示极简概览条
      const summaryBar = document.getElementById('route-minimized-summary')
      const summaryText = document.getElementById('route-summary-text')
      const panelBody = document.getElementById('route-panel-body')
      if (summaryBar && summaryText && panelBody) {
        summaryText.textContent = `${planningStart.name || '起点'} ➔ ${planningEnd.name || '终点'}`
        summaryBar.style.display = 'flex'

        const fields = panelBody.querySelector('.route-fields')
        const actions = panelBody.querySelector('.route-actions')
        if (fields) fields.style.display = 'none'
        if (actions) actions.style.display = 'none'
      }

      // 自适应缩放
      if (routePolylines.length > 0) {
        map.fitBounds(routeFeatureGroup.getBounds(), { padding: [50, 50] })
      }

      selectRoute(0)
      routePlanningBusy = false
      updateRouteActionState()
    })
  })
}

export function initAmapSearch (map, AMap, amapGeolocation) {
  const searchContainer = document.getElementById('map-search-mod')
  const closeSearchButton = document.getElementById('close-search-panel-btn')
  if (searchContainer && closeSearchButton && closeSearchButton.dataset.searchCloseBound !== 'true') {
    closeSearchButton.dataset.searchCloseBound = 'true'
    closeSearchButton.addEventListener('click', () => {
      searchContainer.style.display = 'none'
    })
  }

  if (map && !routeLifecycleBound) {
    routeLifecycleBound = true
    map.on('unload', () => {
      clearTemporaryRoutes(map)
      routeFeatureGroup = null
      routePolylines = []
      routeData = null
      routePlanningRequestId += 1
      routePlanningBusy = false
      routeLifecycleBound = false
    })
  }

  if (!AMap?.AutoComplete || !AMap?.PlaceSearch) {
    console.warn('高德搜索插件加载失败，搜索功能不可用')
    return
  }

  // 1. 初始化普通搜索联想
  const autoComplete = new AMap.AutoComplete({
    input: 'tipinput',
    city: '全国',
    citylimit: false,
  })

  autoComplete.on('select', (event) => {
    if (!event.poi?.location) {
      return
    }

    saveSearchHistory('map_search_history', event.poi)

    const location = [event.poi.location.lat, event.poi.location.lng]
    map.setView(location, 18)

    if (currentSearchMarker) {
      map.removeLayer(currentSearchMarker)
    }

    currentSearchMarker = L.marker(location, {
      opacity: 1,
      draggable: true,
      title: event.poi.name,
    }).addTo(map)
  })

  // 绑定普通位置搜索框历史记录下拉
  const searchInput = document.getElementById('tipinput')
  if (searchContainer && searchInput) {
    renderSearchHistoryDropdown(searchContainer, searchInput, 'map_search_history', (item) => {
      if (item.location) {
        const location = [item.location.lat, item.location.lng]
        map.setView(location, 18)
        if (currentSearchMarker) {
          map.removeLayer(currentSearchMarker)
        }
        currentSearchMarker = L.marker(location, {
          opacity: 1,
          draggable: true,
          title: item.name,
        }).addTo(map)
      }
    })
  }

  // 2. 初始化路线规划面板中的起终点联想
  const startAutoComplete = new AMap.AutoComplete({
    input: 'route-start-input',
    city: '全国',
    citylimit: false,
  })
  const endAutoComplete = new AMap.AutoComplete({
    input: 'route-end-input',
    city: '全国',
    citylimit: false,
  })

  // 绑定联想选中事件
  startAutoComplete.on('select', (event) => {
    if (event.poi?.location) {
      clearRouteLayers(map)
      startPoi = {
        name: event.poi.name,
        location: {
          lng: event.poi.location.lng,
          lat: event.poi.location.lat,
        },
      }
      updateRouteActionState()
      saveSearchHistory('map_route_history', startPoi)
      updatePickMarker(map, [startPoi.location.lat, startPoi.location.lng], true)
      if (startPoi && endPoi) {
        triggerRoutePlanning(map, AMap)
      }
    }
  })

  endAutoComplete.on('select', (event) => {
    if (event.poi?.location) {
      clearRouteLayers(map)
      endPoi = {
        name: event.poi.name,
        location: {
          lng: event.poi.location.lng,
          lat: event.poi.location.lat,
        },
      }
      updateRouteActionState()
      saveSearchHistory('map_route_history', endPoi)
      updatePickMarker(map, [endPoi.location.lat, endPoi.location.lng], false)
      if (startPoi && endPoi) {
        triggerRoutePlanning(map, AMap)
      }
    }
  })

  // 监听输入框变化，清空已失效的 POI 对象缓存并擦除路线及地图 Marker
  const startInput = document.getElementById('route-start-input')
  const endInput = document.getElementById('route-end-input')
  const searchBias = createAmapSearchBias({
    AMap,
    getCenter: () => map.getCenter?.(),
    targets: [autoComplete, startAutoComplete, endAutoComplete],
  })
  ;[searchInput, startInput, endInput].forEach(input => searchBias.bindInput(input))
  searchBias.refresh()
  map.on('moveend', searchBias.schedule)
  map.on('unload', () => {
    map.off('moveend', searchBias.schedule)
    searchBias.destroy()
  })

  if (startInput) {
    startInput.addEventListener('input', () => {
      startPoi = null
      clearRouteLayers(map)
      updateRouteActionState()
      if (!startInput.value.trim() && startPickMarker) {
        map.removeLayer(startPickMarker)
        startPickMarker = null
      }
    })
  }

  if (endInput) {
    endInput.addEventListener('input', () => {
      endPoi = null
      clearRouteLayers(map)
      updateRouteActionState()
      if (!endInput.value.trim() && endPickMarker) {
        map.removeLayer(endPickMarker)
        endPickMarker = null
      }
    })
  }

  // 绑定起终点规划框历史记录下拉
  if (startInput) {
    const container = startInput.closest('.route-input-container')
    renderSearchHistoryDropdown(container, startInput, 'map_route_history', (item) => {
      clearRouteLayers(map)
      startPoi = item
      updateRouteActionState()
      if (item.location) {
        updatePickMarker(map, [item.location.lat, item.location.lng], true)
        if (startPoi && endPoi) {
          triggerRoutePlanning(map, AMap)
        }
      }
    })
  }

  if (endInput) {
    const container = endInput.closest('.route-input-container')
    renderSearchHistoryDropdown(container, endInput, 'map_route_history', (item) => {
      clearRouteLayers(map)
      endPoi = item
      updateRouteActionState()
      if (item.location) {
        updatePickMarker(map, [item.location.lat, item.location.lng], false)
        if (startPoi && endPoi) {
          triggerRoutePlanning(map, AMap)
        }
      }
    })
  }

  // 3. 切换面板交互
  const toggleRouteBtn = document.getElementById('toggle-route-panel-btn')
  const toggleSearchBtn = document.getElementById('toggle-search-panel-btn')
  const searchPanel = document.getElementById('search-mode-panel')
  const routePanel = document.getElementById('route-mode-panel')

  // 折叠状态逻辑
  const collapseBtn = document.getElementById('route-panel-collapse-btn')
  const panelBody = document.getElementById('route-panel-body')

  function resetCollapseState () {
    if (collapseBtn && panelBody) {
      collapseBtn.classList.remove('collapsed')
      panelBody.style.display = 'block'
    }
  }

  if (collapseBtn && panelBody) {
    collapseBtn.addEventListener('click', () => {
      const isCollapsed = collapseBtn.classList.toggle('collapsed')
      panelBody.style.display = isCollapsed ? 'none' : 'block'
    })
  }

  // 恢复可编辑状态逻辑
  function resetRouteMinimization () {
    const summaryBar = document.getElementById('route-minimized-summary')
    if (summaryBar && panelBody) {
      summaryBar.style.display = 'none'
      const fields = panelBody.querySelector('.route-fields')
      const actions = panelBody.querySelector('.route-actions')
      if (fields) fields.style.display = 'block'
      if (actions) actions.style.display = 'block'
    }
  }

  const editBtn = document.getElementById('route-edit-btn')
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      resetRouteMinimization()
      resetCollapseState()
      clearRouteLayers(map)
    })
  }

  if (toggleRouteBtn && searchPanel && routePanel) {
    toggleRouteBtn.addEventListener('click', () => {
      searchPanel.style.display = 'none'
      routePanel.style.display = 'block'
      if (currentSearchMarker) {
        map.removeLayer(currentSearchMarker)
        currentSearchMarker = null
      }
    })
  }

  if (toggleSearchBtn && searchPanel && routePanel) {
    toggleSearchBtn.addEventListener('click', () => {
      routePanel.style.display = 'none'
      searchPanel.style.display = 'block'

      if (startInput) startInput.value = ''
      if (endInput) endInput.value = ''
      startPoi = null
      endPoi = null
      clearRouteLayers(map)
      clearAllRoutePickers(map)
      resetRouteMinimization()
      resetCollapseState()
    })
  }

  // 3.5. 在地图上选点交互
  const startMapBtn = document.getElementById('route-start-map-btn')
  const endMapBtn = document.getElementById('route-end-map-btn')

  function initMapPicker (btn, input, isStart) {
    if (!btn || !input) return

    btn.addEventListener('click', () => {
      const isPicking = btn.classList.contains('active')

      if (startMapBtn) startMapBtn.classList.remove('active')
      if (endMapBtn) endMapBtn.classList.remove('active')
      L.DomUtil.removeClass(map.getContainer(), 'map-crosshair-pick')
      map.off('click', handleMapClick)

      if (isPicking) {
        input.placeholder = isStart ? '输入起点位置' : '输入终点位置'
        return
      }

      btn.classList.add('active')
      L.DomUtil.addClass(map.getContainer(), 'map-crosshair-pick')
      input.value = ''
      input.placeholder = '请在地图上点击选择位置...'

      async function handleMapClick (e) {
        const lat = e.latlng.lat
        const lng = e.latlng.lng

        btn.classList.remove('active')
        L.DomUtil.removeClass(map.getContainer(), 'map-crosshair-pick')
        input.placeholder = isStart ? '输入起点位置' : '输入终点位置'

        const displayName = `地图选定位置 (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        input.value = '正在解析位置...'

        const poi = {
          name: displayName,
          location: { lng, lat }
        }

        clearRouteLayers(map)
        if (isStart) {
          startPoi = poi
        } else {
          endPoi = poi
        }
        updateRouteActionState()
        const endpointRequestId = routePlanningRequestId

        updatePickMarker(map, [lat, lng], isStart)

        AMap.plugin('AMap.Geocoder', () => {
          const geocoder = new AMap.Geocoder()
          geocoder.getAddress([lng, lat], (status, result) => {
            if (endpointRequestId !== routePlanningRequestId) return
            if (status === 'complete' && result.regeocode) {
              const address = result.regeocode.formattedAddress || displayName
              poi.name = address
              input.value = address
            } else {
              input.value = displayName
            }
            saveSearchHistory('map_route_history', poi)
            if (startPoi && endPoi) {
              triggerRoutePlanning(map, AMap)
            } else {
              clearRouteLayers(map)
            }
          })
        })
      }

      map.once('click', handleMapClick)
    })
  }

  initMapPicker(startMapBtn, startInput, true)
  initMapPicker(endMapBtn, endInput, false)

  // 4. “我的位置”定位按钮交互
  const myLocationBtn = document.getElementById('route-my-location-btn')
  if (myLocationBtn && startInput) {
    myLocationBtn.addEventListener('click', async () => {
      clearRouteLayers(map)
      const locationRequestId = routePlanningRequestId
      startInput.value = '正在定位中...'
      startInput.disabled = true
      startPoi = null
      updateRouteActionState()

      try {
        const position = await getBestPosition(amapGeolocation)
        if (locationRequestId !== routePlanningRequestId) return
        const mapPosition = positionToGcj02(position)
        startPoi = {
          name: '我的位置',
          location: {
            lng: mapPosition.lng,
            lat: mapPosition.lat,
          },
        }
        updateRouteActionState()
        startInput.value = '我的位置'
        saveSearchHistory('map_route_history', startPoi)
        updatePickMarker(map, [mapPosition.lat, mapPosition.lng], true)
        if (startPoi && endPoi) {
          triggerRoutePlanning(map, AMap)
        }
      } catch (err) {
        console.error('路线定位获取当前位置失败:', err)
        startInput.value = ''
        await showAlert('无法获取当前位置，请手动输入起点。')
      } finally {
        startInput.disabled = false
      }
    })
  }

  // 5. 路线工具栏：规划、交换起终点、保存和临时添加
  const searchRouteBtn = document.getElementById('route-search-btn')
  if (searchRouteBtn) {
    searchRouteBtn.addEventListener('click', async () => {
      const startText = startInput ? startInput.value.trim() : ''
      const endText = endInput ? endInput.value.trim() : ''

      if (!startText) {
        await showAlert('请输入起点位置')
        return
      }
      if (!endText) {
        await showAlert('请输入终点位置')
        return
      }

      if (!startPoi) {
        await showAlert('请选择起点（可以通过联想列表选择，或点击我的位置/地图选点获取）')
        return
      }
      if (!endPoi) {
        await showAlert('请选择终点（可以通过联想列表选择，或点击地图选点获取）')
        return
      }

      triggerRoutePlanning(map, AMap)
    })
  }

  const swapRouteBtn = document.getElementById('route-swap-btn')
  if (swapRouteBtn) {
    swapRouteBtn.addEventListener('click', async () => {
      if (!startPoi || !endPoi) return
      clearRouteLayers(map)
      const swapped = swapRouteEndpoints(startPoi, endPoi)
      startPoi = swapped.start
      endPoi = swapped.end
      updateRouteActionState()
      if (startInput) startInput.value = startPoi?.name || ''
      if (endInput) endInput.value = endPoi?.name || ''
      clearAllRoutePickers(map)
      if (startPoi?.location) updatePickMarker(map, [startPoi.location.lat, startPoi.location.lng], true)
      if (endPoi?.location) updatePickMarker(map, [endPoi.location.lat, endPoi.location.lng], false)
      saveSearchHistory('map_route_history', startPoi)
      saveSearchHistory('map_route_history', endPoi)
      triggerRoutePlanning(map, AMap)
    })
  }

  const saveRouteBtn = document.getElementById('route-save-btn')
  if (saveRouteBtn) {
    saveRouteBtn.addEventListener('click', async () => {
      await saveSelectedRoute(map, AMap)
    })
  }

  const addRouteBtn = document.getElementById('route-add-btn')
  if (addRouteBtn) {
    addRouteBtn.addEventListener('click', async () => {
      await addTemporaryRoute(map, AMap)
    })
  }

  // 6. “开始导航”按钮交互
  const navBtn = document.getElementById('route-nav-btn')
  if (navBtn) {
    navBtn.addEventListener('click', () => {
      if (!startPoi || !endPoi) return

      const url = `https://uri.amap.com/navigation?from=${startPoi.location.lng},${startPoi.location.lat},${encodeURIComponent(startPoi.name)}&to=${endPoi.location.lng},${endPoi.location.lat},${encodeURIComponent(endPoi.name)}&mode=car&src=MapService&coordinate=gaode&callnative=1`
      window.open(url, '_blank')
    })
  }
}

export function toggleSearchMode () {
  const searchMode = document.getElementById('map-search-mod')
  if (searchMode) {
    searchMode.style.display = searchMode.style.display === 'block' ? 'none' : 'block'
  }
}
