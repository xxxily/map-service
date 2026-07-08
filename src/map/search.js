import L from 'leaflet'
import { getBestPosition } from './geolocation.js'

let currentSearchMarker = null

// 路线规划相关的状态变量
let routeFeatureGroup = null
let routePolylines = []
let routeData = null
let activeRouteIndex = 0
let startPoi = null
let endPoi = null

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
  if (resultsList) resultsList.style.display = 'none'
  if (navigateBox) navigateBox.style.display = 'none'
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
        opacity: 0.9,
      })
      polyline.bringToFront()
    } else {
      polyline.setStyle({
        color: '#94a3b8',
        weight: 4,
        opacity: 0.6,
      })
    }
  })

  // 更新面板卡片样式
  const cards = document.querySelectorAll('.route-card')
  cards.forEach((card, idx) => {
    if (idx === index) {
      card.classList.add('active')
    } else {
      card.classList.remove('active')
    }
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

    const location = [event.poi.location.lat, event.poi.location.lng]
    map.setView(location, 18)

    // 清理先前的搜索标记，防止标记无限累积
    if (currentSearchMarker) {
      map.removeLayer(currentSearchMarker)
    }

    currentSearchMarker = L.marker(location, {
      opacity: 1,
      draggable: true,
      title: event.poi.name,
    }).addTo(map)
  })

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
    }
  })

  // 监听输入框变化，清空已失效的 POI 对象缓存并擦除路线
  const startInput = document.getElementById('route-start-input')
  const endInput = document.getElementById('route-end-input')

  if (startInput) {
    startInput.addEventListener('input', () => {
      startPoi = null
      clearRouteLayers(map)
    })
  }

  if (endInput) {
    endInput.addEventListener('input', () => {
      endPoi = null
      clearRouteLayers(map)
    })
  }

  // 3. 切换面板交互
  const toggleRouteBtn = document.getElementById('toggle-route-panel-btn')
  const toggleSearchBtn = document.getElementById('toggle-search-panel-btn')
  const searchPanel = document.getElementById('search-mode-panel')
  const routePanel = document.getElementById('route-mode-panel')

  if (toggleRouteBtn && searchPanel && routePanel) {
    toggleRouteBtn.addEventListener('click', () => {
      searchPanel.style.display = 'none'
      routePanel.style.display = 'block'
      // 切换模式时清理普通搜索的 marker
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

      // 清空路线规划状态和图层
      if (startInput) startInput.value = ''
      if (endInput) endInput.value = ''
      startPoi = null
      endPoi = null
      clearRouteLayers(map)
    })
  }

  // 3.5. 在地图上选点交互
  const startMapBtn = document.getElementById('route-start-map-btn')
  const endMapBtn = document.getElementById('route-end-map-btn')

  function initMapPicker (btn, input, isStart) {
    if (!btn || !input) return

    btn.addEventListener('click', () => {
      const isPicking = btn.classList.contains('active')

      // 重置所有选点状态
      if (startMapBtn) startMapBtn.classList.remove('active')
      if (endMapBtn) endMapBtn.classList.remove('active')
      L.DomUtil.removeClass(map.getContainer(), 'map-crosshair-pick')
      map.off('click', handleMapClick)

      if (isPicking) {
        input.placeholder = isStart ? '输入起点位置' : '输入终点位置'
        return
      }

      // 激活选点状态
      btn.classList.add('active')
      L.DomUtil.addClass(map.getContainer(), 'map-crosshair-pick')
      input.value = ''
      input.placeholder = '请在地图上点击选择位置...'

      // 处理点击事件
      async function handleMapClick (e) {
        const lat = e.latlng.lat
        const lng = e.latlng.lng

        // 还原状态
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

        // 高德逆地理编码
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
            clearRouteLayers(map)
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
        startPoi = {
          name: '我的位置',
          location: {
            lng: position.lng,
            lat: position.lat,
          },
        }
        startInput.value = '我的位置'
      } catch (err) {
        console.error('路线定位获取当前位置失败:', err)
        startInput.value = ''
        alert('无法获取当前位置，请手动输入起点。')
      } finally {
        startInput.disabled = false
      }
    })
  }

  // 5. “开始规划”按钮交互
  const searchRouteBtn = document.getElementById('route-search-btn')
  if (searchRouteBtn) {
    searchRouteBtn.addEventListener('click', () => {
      const startText = startInput ? startInput.value.trim() : ''
      const endText = endInput ? endInput.value.trim() : ''

      if (!startText) {
        alert('请输入起点位置')
        return
      }
      if (!endText) {
        alert('请输入终点位置')
        return
      }

      if (!startPoi) {
        alert('请选择起点（可以通过联想列表选择，或点击我的位置/地图选点获取）')
        return
      }
      if (!endPoi) {
        alert('请选择终点（可以通过联想列表选择，或点击地图选点获取）')
        return
      }

      // 开始进行高德路线规划
      AMap.plugin('AMap.Driving', () => {
        const driving = new AMap.Driving({
          policy: 10, // 多路径复合推荐方案
          extensions: 'all', // 获取多路线
        })

        const startLngLat = new AMap.LngLat(startPoi.location.lng, startPoi.location.lat)
        const endLngLat = new AMap.LngLat(endPoi.location.lng, endPoi.location.lat)

        driving.search(startLngLat, endLngLat, (status, result) => {
          if (status !== 'complete' || !result.routes || result.routes.length === 0) {
            alert('路线规划失败: ' + (result?.info || '未知错误'))
            return
          }

          // 成功规划，开始绘制
          clearRouteLayers(map)
          routeFeatureGroup = L.featureGroup().addTo(map)
          routeData = result.routes

          // 循环每一条路线，在 Leaflet 上绘制折线
          routeData.forEach((route, idx) => {
            const pathPoints = []
            route.steps.forEach((step) => {
              step.path.forEach((pt) => {
                pathPoints.push([pt.lat, pt.lng]) // 翻转经纬度适配 Leaflet
              })
            })

            // 备用样式
            const polyline = L.polyline(pathPoints, {
              color: '#94a3b8',
              weight: 4,
              opacity: 0.6,
            }).addTo(routeFeatureGroup)

            // 监听折线点击事件
            polyline.on('click', (e) => {
              L.DomEvent.stopPropagation(e)
              selectRoute(idx)
            })

            routePolylines.push(polyline)
          })

          // 绘制起点和终点标记
          L.marker([startPoi.location.lat, startPoi.location.lng], {
            title: '起点',
            icon: L.divIcon({
              className: 'route-marker start',
              html: `<div style="background-color: #10b981; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3)">起</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })
          }).addTo(routeFeatureGroup)

          L.marker([endPoi.location.lat, endPoi.location.lng], {
            title: '终点',
            icon: L.divIcon({
              className: 'route-marker end',
              html: `<div style="background-color: #ef4444; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3)">终</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            })
          }).addTo(routeFeatureGroup)

          // 面板卡片展示
          const resultsList = document.getElementById('route-results-list')
          if (resultsList) {
            resultsList.style.display = 'block'
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

            // 绑定面板卡片点击
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

          // 自适应缩放
          map.fitBounds(routeFeatureGroup.getBounds(), { padding: [50, 50] })

          // 默认选中第一条路线
          selectRoute(0)
        })
      })
    })
  }

  // 6. “开始导航”按钮交互
  const navBtn = document.getElementById('route-nav-btn')
  if (navBtn) {
    navBtn.addEventListener('click', () => {
      if (!startPoi || !endPoi) return

      // 构建高德 URI API 导航链接（支持免 App 网页版自动唤起）
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
