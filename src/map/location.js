import L from 'leaflet'
import { showAlert } from '../ui/dialog.js'
import { getBestPosition, isValidPosition, positionToLeafletLatLng } from './geolocation.js'

// 2D 持续定位全局状态
export const intervalLocationState = {
  active: false,
  timerId: null,
  intervalSeconds: parseInt(localStorage.getItem('location_interval') || '10', 10),
  zoomLevel: parseInt(localStorage.getItem('location_zoom') || '18', 10),
  lastPosition: null, // 存入最新的定位点数据 { latlng, timestamp, accuracy }
  historyPoints: [],  // 最近 3-5 次的定位点数据数组
  historyLayers: [],  // 渲染在地图上的 L.circleMarker 图层实例数组
}

// 辅助函数：绘制历史定位轨迹点
function renderHistoryPoints (map, points) {
  // 清除旧轨迹点图层
  intervalLocationState.historyLayers.forEach(layer => map.removeLayer(layer))
  intervalLocationState.historyLayers = []

  const len = points.length
  points.forEach((pt, index) => {
    // 透明度逐渐渐变：越新的历史点越不透明（0.08 到 0.35）
    const opacity = len > 1
      ? 0.08 + (index / (len - 1)) * 0.27
      : 0.35

    const circle = L.circleMarker(pt.latlng, {
      radius: 6,
      color: '#0f766e',
      fillColor: '#0f766e',
      fillOpacity: opacity,
      weight: 1.5,
      opacity: opacity + 0.1
    })

    // 计算移动速度：
    // 优先拿当前点和其下一个点（若为最新的历史点，则和当前的主定位点）计算速度；否则和前一个点计算。
    let speedInfo = ''
    let nextPt = points[index + 1]
    if (index === len - 1 && intervalLocationState.lastPosition) {
      nextPt = intervalLocationState.lastPosition
    }

    if (nextPt) {
      const dist = L.latLng(pt.latlng).distanceTo(L.latLng(nextPt.latlng))
      const timeDiff = Math.abs(nextPt.timestamp - pt.timestamp) / 1000
      if (timeDiff > 0) {
        const speedMps = dist / timeDiff
        const speedKmh = speedMps * 3.6
        speedInfo = `<br>移动速度：${speedKmh.toFixed(1)} km/h (${speedMps.toFixed(1)} m/s)`
      }
    } else if (index > 0) {
      const prevPt = points[index - 1]
      const dist = L.latLng(pt.latlng).distanceTo(L.latLng(prevPt.latlng))
      const timeDiff = Math.abs(pt.timestamp - prevPt.timestamp) / 1000
      if (timeDiff > 0) {
        const speedMps = dist / timeDiff
        const speedKmh = speedMps * 3.6
        speedInfo = `<br>移动速度：${speedKmh.toFixed(1)} km/h (${speedMps.toFixed(1)} m/s)`
      }
    }

    const timeStr = new Date(pt.timestamp).toLocaleTimeString()
    const popupContent = `
      <div style="font-size: 12px; line-height: 1.5; color: #374151; min-width: 140px;">
        <strong style="color: #0f766e;">历史定位点 #${index + 1}</strong><br>
        定位时间：${timeStr}<br>
        定位精度：${pt.accuracy ? Math.round(pt.accuracy) + ' 米' : '未知'}${speedInfo}
      </div>
    `

    circle.bindPopup(popupContent, { closeButton: false })
    circle.addTo(map)
    intervalLocationState.historyLayers.push(circle)
  })
}

export function addTargetMarker (map, location, options = {}) {
  // 清除地图上已有的定位 Marker
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer)
    }
  })

  const markerOptions = {
    opacity: 1,
    draggable: true,
  }

  // 持续定位状态下使用带呼吸灯效果的 divIcon
  if (options.isInterval) {
    markerOptions.icon = L.divIcon({
      className: 'custom-location-marker',
      html: '<div class="location-marker-glow"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })
  }

  const marker = L.marker(location, markerOptions).addTo(map)
    .on('dragend', (event) => {
      const latlng = event.target.getLatLng()
      const coords = `${latlng.lat},${latlng.lng},${map.getZoom()}`
      window.history.replaceState(null, '', `?coords=${coords}`)
    })

  // 播放瞬间定位更新的扩散波纹
  if (options.playRipple) {
    const rippleIcon = L.divIcon({
      className: 'custom-location-marker',
      html: '<div class="location-update-ripple"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })
    const rippleMarker = L.marker(location, {
      icon: rippleIcon,
      keyboard: false,
      alt: '',
      zIndexOffset: -100
    }).addTo(map)

    setTimeout(() => {
      map.removeLayer(rippleMarker)
    }, 1200)
  }

  return marker
}

export async function updatePosition (map, geolocation = null, customZoom = 18, isIntervalUpdate = false) {
  const result = await getBestPosition(geolocation).catch((err) => {
    console.error('获取地理位置失败', err)
    return null
  })

  if (!isValidPosition(result)) {
    if (!isIntervalUpdate) {
      await showAlert('获取地理位置失败，请手动选择')
    }
    return
  }

  const mapPosition = positionToLeafletLatLng(result)
  
  // 更新地图视口与主定位图标
  map.setView(mapPosition, customZoom)
  
  // 若是持续定位模式，记录历史轨迹点
  if (isIntervalUpdate) {
    if (intervalLocationState.lastPosition) {
      intervalLocationState.historyPoints.push(intervalLocationState.lastPosition)
      if (intervalLocationState.historyPoints.length > 5) {
        intervalLocationState.historyPoints.shift()
      }
    }
    
    intervalLocationState.lastPosition = {
      latlng: mapPosition,
      timestamp: Date.now(),
      accuracy: result.accuracy
    }

    // 绘制轨迹点
    renderHistoryPoints(map, intervalLocationState.historyPoints)
    
    // 主 Marker 使用呼吸灯 + 伴随扩散波纹
    addTargetMarker(map, mapPosition, { isInterval: true, playRipple: true })
  } else {
    // 常规模式使用默认图标，不带轨迹
    addTargetMarker(map, mapPosition, { isInterval: false, playRipple: false })
  }
}

// 启动 2D 持续定位
export function startIntervalLocation2d (map, geolocation, interval, zoom) {
  if (intervalLocationState.timerId) {
    clearInterval(intervalLocationState.timerId)
  }

  // 记录到 localStorage 以便持久化记忆
  try {
    localStorage.setItem('location_interval', String(interval))
    localStorage.setItem('location_zoom', String(zoom))
  } catch (err) {
    console.error('Failed to save location settings:', err)
  }

  intervalLocationState.active = true
  intervalLocationState.intervalSeconds = interval
  intervalLocationState.zoomLevel = zoom
  intervalLocationState.lastPosition = null
  intervalLocationState.historyPoints = []
  
  // 清空之前的轨迹图层
  intervalLocationState.historyLayers.forEach(layer => map.removeLayer(layer))
  intervalLocationState.historyLayers = []

  // 立即触发第一次定位
  updatePosition(map, geolocation, zoom, true)

  // 启动定时循环
  intervalLocationState.timerId = setInterval(() => {
    updatePosition(map, geolocation, intervalLocationState.zoomLevel, true)
  }, interval * 1000)
}

// 停止 2D 持续定位
export function stopIntervalLocation2d (map) {
  if (intervalLocationState.timerId) {
    clearInterval(intervalLocationState.timerId)
    intervalLocationState.timerId = null
  }

  intervalLocationState.active = false
  intervalLocationState.lastPosition = null
  
  // 清理历史点图层
  intervalLocationState.historyLayers.forEach(layer => map.removeLayer(layer))
  intervalLocationState.historyLayers = []
  intervalLocationState.historyPoints = []

  // 重新在最后定位处绘制默认常规 Marker
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      const latlng = layer.getLatLng()
      // 清除呼吸灯 Marker
      map.removeLayer(layer)
      // 重新绘制普通靶心 Marker
      L.marker(latlng, { opacity: 1, draggable: true }).addTo(map)
        .on('dragend', (event) => {
          const coords = `${event.target.getLatLng().lat},${event.target.getLatLng().lng},${map.getZoom()}`
          window.history.replaceState(null, '', `?coords=${coords}`)
        })
    }
  })
}

