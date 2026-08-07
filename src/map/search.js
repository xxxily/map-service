import L from 'leaflet'
import { getBestPosition, positionToGcj02 } from './geolocation.js'
import { showAlert } from '../ui/dialog.js'
import { setFavoriteCandidate } from './favorite-actions.js'

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

function setSearchResultFavorite (poi, marker = null) {
  if (!poi?.location) return
  const candidate = {
    name: poi.name || '搜索结果',
    address: poi.address || poi.district || '',
    longitude: poi.location.lng,
    latitude: poi.location.lat,
    coordType: 'gcj02',
    sourceType: 'search',
  }
  setFavoriteCandidate(candidate)
  marker?.on('dragend', event => {
    const latlng = event.target.getLatLng()
    setFavoriteCandidate({
      ...candidate,
      longitude: latlng.lng,
      latitude: latlng.lat,
    })
  })
}

// 获取 localStorage 中的历史记录
function getHistory (key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || []
  } catch (e) {
    return []
  }
}

// 写入一条历史记录（上限10条，名字去重置顶）
function saveHistory (key, poi) {
  if (!poi || !poi.name) return
  let history = getHistory(key)
  history = history.filter(item => item.name !== poi.name)
  history.unshift({ name: poi.name, location: poi.location })
  if (history.length > 10) {
    history = history.slice(0, 10)
  }
  localStorage.setItem(key, JSON.stringify(history))
}

// 清除历史记录
function clearHistory (key) {
  localStorage.removeItem(key)
}

// 绑定并渲染历史记录下拉菜单
function renderHistoryDropdown (container, input, key, onSelect) {
  if (!container || !input) return

  let dropdown = container.querySelector('.history-dropdown')
  if (!dropdown) {
    dropdown = document.createElement('div')
    dropdown.className = 'history-dropdown amap-sug-result'
    dropdown.style.cssText = 'display: none; position: absolute; top: 100%; left: 0; width: 100%; z-index: 20000; box-sizing: border-box;'
    container.appendChild(dropdown)
  }

  const showDropdown = () => {
    if (input.value.trim()) {
      dropdown.style.display = 'none'
      return
    }
    const history = getHistory(key)
    if (history.length === 0) {
      dropdown.style.display = 'none'
      return
    }

    dropdown.innerHTML = ''
    history.forEach(item => {
      const div = document.createElement('div')
      div.className = 'auto-item'
      div.innerHTML = `<span class="sug-key">${item.name}</span>`
      div.addEventListener('mousedown', (e) => {
        e.preventDefault()
        input.value = item.name
        onSelect(item)
        dropdown.style.display = 'none'
      })
      dropdown.appendChild(div)
    })

    // 清除历史记录按钮
    const clearDiv = document.createElement('div')
    clearDiv.className = 'auto-item'
    clearDiv.style.cssText = 'text-align: right; font-size: 11px !important; color: #94a3b8 !important; border-top: 1px dashed #edf2f7; padding: 6px 12px !important; cursor: pointer;'
    clearDiv.innerHTML = '<span>清除历史</span>'
    clearDiv.addEventListener('mousedown', (e) => {
      e.preventDefault()
      clearHistory(key)
      dropdown.style.display = 'none'
    })
    dropdown.appendChild(clearDiv)

    dropdown.style.display = 'block'
  }

  input.addEventListener('focus', showDropdown)
  input.addEventListener('click', showDropdown)
  input.addEventListener('input', () => {
    if (input.value.trim()) {
      dropdown.style.display = 'none'
    } else {
      showDropdown()
    }
  })
  input.addEventListener('blur', () => {
    setTimeout(() => {
      dropdown.style.display = 'none'
    }, 200)
  })
}

// 清理路线相关的地图图层和状态
function clearRouteLayers (map) {
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
  activeRouteIndex = index

  // 更新地图折线样式
  routePolylines.forEach((polyline, idx) => {
    if (idx === index) {
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
    if (idx === index) {
      card.classList.add('active')
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    } else {
      card.classList.remove('active')
    }
  })
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

    if (isStart) {
      startPoi = poi
    } else {
      endPoi = poi
    }

    AMap.plugin('AMap.Geocoder', () => {
      const geocoder = new AMap.Geocoder()
      geocoder.getAddress([lng, lat], (status, result) => {
        if (status === 'complete' && result.regeocode) {
          const address = result.regeocode.formattedAddress || displayName
          poi.name = address
          input.value = address
        } else {
          input.value = displayName
        }
        saveHistory('map_route_history', poi)
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

  AMap.plugin('AMap.Driving', () => {
    const driving = new AMap.Driving({
      policy: 10,
      extensions: 'all',
    })

    const startLngLat = new AMap.LngLat(startPoi.location.lng, startPoi.location.lat)
    const endLngLat = new AMap.LngLat(endPoi.location.lng, endPoi.location.lat)

    driving.search(startLngLat, endLngLat, async (status, result) => {
      if (status !== 'complete' || !result.routes || result.routes.length === 0) {
        await showAlert('路线规划失败: ' + (result?.info || '未知错误'))
        return
      }

      saveHistory('map_route_history', startPoi)
      saveHistory('map_route_history', endPoi)

      clearRouteLayers(map)
      routeFeatureGroup = L.featureGroup().addTo(map)
      routeData = result.routes

      // 确保地图选点大头针被画出并且更新到最新位置
      updatePickMarker(map, [startPoi.location.lat, startPoi.location.lng], true)
      updatePickMarker(map, [endPoi.location.lat, endPoi.location.lng], false)

      routeData.forEach((route, idx) => {
        const pathPoints = []
        route.steps.forEach((step) => {
          step.path.forEach((pt) => {
            pathPoints.push([pt.lat, pt.lng])
          })
        })

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
          const minutes = Math.round(route.time / 60)
          const km = parseFloat((route.distance / 1000).toFixed(1))
          const activeClass = idx === 0 ? 'active' : ''
          return `
            <div class="route-card ${activeClass}" data-route-idx="${idx}">
              <div class="route-card-title">方案 ${idx + 1}</div>
              <div class="route-card-meta">约 ${minutes} 分钟 | ${km} 公里</div>
            </div>
          `
        }).join('')

        resultsList.querySelectorAll('.route-card').forEach((card) => {
          card.addEventListener('click', () => {
            const idx = parseInt(card.getAttribute('data-route-idx'), 10)
            selectRoute(idx)
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
        summaryText.innerHTML = `${startPoi.name} ➔ ${endPoi.name}`
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
    })
  })
}

export function initAmapSearch (map, AMap, amapGeolocation) {
  if (!AMap?.AutoComplete || !AMap?.PlaceSearch) {
    console.warn('高德搜索插件加载失败，搜索功能不可用')
    return
  }

  // 1. 初始化普通搜索联想
  const autoComplete = new AMap.AutoComplete({
    input: 'tipinput',
  })

  autoComplete.on('select', (event) => {
    if (!event.poi?.location) {
      return
    }

    saveHistory('map_search_history', event.poi)

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
    setSearchResultFavorite(event.poi, currentSearchMarker)
  })

  // 绑定普通位置搜索框历史记录下拉
  const searchContainer = document.getElementById('map-search-mod')
  const searchInput = document.getElementById('tipinput')
  if (searchContainer && searchInput) {
    renderHistoryDropdown(searchContainer, searchInput, 'map_search_history', (item) => {
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
        setSearchResultFavorite(item, currentSearchMarker)
      }
    })
  }

  // 2. 初始化路线规划面板中的起终点联想
  const startAutoComplete = new AMap.AutoComplete({
    input: 'route-start-input',
  })
  const endAutoComplete = new AMap.AutoComplete({
    input: 'route-end-input',
  })

  // 绑定联想选中事件
  startAutoComplete.on('select', (event) => {
    if (event.poi?.location) {
      startPoi = {
        name: event.poi.name,
        location: {
          lng: event.poi.location.lng,
          lat: event.poi.location.lat,
        },
      }
      saveHistory('map_route_history', startPoi)
      updatePickMarker(map, [startPoi.location.lat, startPoi.location.lng], true)
      if (startPoi && endPoi) {
        triggerRoutePlanning(map, AMap)
      }
    }
  })

  endAutoComplete.on('select', (event) => {
    if (event.poi?.location) {
      endPoi = {
        name: event.poi.name,
        location: {
          lng: event.poi.location.lng,
          lat: event.poi.location.lat,
        },
      }
      saveHistory('map_route_history', endPoi)
      updatePickMarker(map, [endPoi.location.lat, endPoi.location.lng], false)
      if (startPoi && endPoi) {
        triggerRoutePlanning(map, AMap)
      }
    }
  })

  // 监听输入框变化，清空已失效的 POI 对象缓存并擦除路线及地图 Marker
  const startInput = document.getElementById('route-start-input')
  const endInput = document.getElementById('route-end-input')

  if (startInput) {
    startInput.addEventListener('input', () => {
      startPoi = null
      clearRouteLayers(map)
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
      if (!endInput.value.trim() && endPickMarker) {
        map.removeLayer(endPickMarker)
        endPickMarker = null
      }
    })
  }

  // 绑定起终点规划框历史记录下拉
  if (startInput) {
    const container = startInput.closest('.route-input-container')
    renderHistoryDropdown(container, startInput, 'map_route_history', (item) => {
      startPoi = item
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
    renderHistoryDropdown(container, endInput, 'map_route_history', (item) => {
      endPoi = item
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

        if (isStart) {
          startPoi = poi
        } else {
          endPoi = poi
        }

        updatePickMarker(map, [lat, lng], isStart)

        AMap.plugin('AMap.Geocoder', () => {
          const geocoder = new AMap.Geocoder()
          geocoder.getAddress([lng, lat], (status, result) => {
            if (status === 'complete' && result.regeocode) {
              const address = result.regeocode.formattedAddress || displayName
              poi.name = address
              input.value = address
            } else {
              input.value = displayName
            }
            saveHistory('map_route_history', poi)
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
      startInput.value = '正在定位中...'
      startInput.disabled = true
      startPoi = null

      try {
        const position = await getBestPosition(amapGeolocation)
        const mapPosition = positionToGcj02(position)
        startPoi = {
          name: '我的位置',
          location: {
            lng: mapPosition.lng,
            lat: mapPosition.lat,
          },
        }
        startInput.value = '我的位置'
        saveHistory('map_route_history', startPoi)
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

  // 5. “开始规划”按钮交互
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
