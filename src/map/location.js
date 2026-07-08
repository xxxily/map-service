import L from 'leaflet'
import { showAlert } from '../ui/dialog.js'
import { getBestPosition, isValidPosition, positionToLeafletLatLng } from './geolocation.js'

// Audio keep alive and Screen Wake Lock for mobile background processes
let keepAliveAudio = null
let wakeLock = null

async function requestWakeLock () {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      console.log('[WakeLock] Screen Wake Lock is active')
    } catch (err) {
      console.warn(`[WakeLock] Failed to request Screen Wake Lock: ${err.message}`)
    }
  }
}

function releaseWakeLock () {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null
      console.log('[WakeLock] Screen Wake Lock was released')
    }).catch(err => {
      console.warn(`[WakeLock] Failed to release Screen Wake Lock: ${err.message}`)
    })
  }
}

// 自动在亮屏/切回前台时重新请求被浏览器自动释放的 Wake Lock
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && intervalLocationState.active) {
    await requestWakeLock()
  }
})

function startKeepAlive () {
  const silentWav = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
  if (!keepAliveAudio) {
    keepAliveAudio = new Audio(silentWav)
    keepAliveAudio.loop = true
  }
  keepAliveAudio.play().catch(err => {
    console.warn('Audio keep alive play blocked', err)
  })
}

function stopKeepAlive () {
  if (keepAliveAudio) {
    keepAliveAudio.pause()
  }
}


// 2D 持续定位全局状态
export const intervalLocationState = {
  active: false,
  timerId: null,
  intervalSeconds: parseInt(localStorage.getItem('location_interval') || '10', 10),
  zoomLevel: parseInt(localStorage.getItem('location_zoom') || '18', 10),
  maxHistoryPoints: parseInt(localStorage.getItem('location_max_points') || '0', 10),
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

async function getFilteredPosition2d (map, geolocation, customZoom, isIntervalUpdate, retryCount = 0) {
  const result = await getBestPosition(geolocation).catch((err) => {
    console.error('获取地理位置失败', err)
    return null
  })

  if (!isValidPosition(result)) {
    return null
  }

  const mapPosition = positionToLeafletLatLng(result)

  // 仅在持续定位且有上一点位置记录时，过滤突变大（>200米）的漂移脏点
  if (isIntervalUpdate && intervalLocationState.lastPosition) {
    const dist = L.latLng(mapPosition).distanceTo(L.latLng(intervalLocationState.lastPosition.latlng))
    if (dist > 200) {
      console.warn(`[2D 定位] 检测到可能的漂移脏点，距离上一点 ${Math.round(dist)} 米`)
      if (retryCount === 0) {
        console.log('[2D 定位] 立即进行重试定位一次...')
        await new Promise(resolve => setTimeout(resolve, 500))
        return await getFilteredPosition2d(map, geolocation, customZoom, isIntervalUpdate, 1)
      } else {
        console.warn('[2D 定位] 重试后依然偏差过大，丢弃该定位点')
        return null
      }
    }
  }

  return { result, mapPosition }
}

export async function updatePosition (map, geolocation = null, customZoom = 18, isIntervalUpdate = false) {
  const filtered = await getFilteredPosition2d(map, geolocation, customZoom, isIntervalUpdate)

  if (!filtered) {
    if (!isIntervalUpdate) {
      await showAlert('获取地理位置失败，请手动选择')
    }
    return
  }

  const { result, mapPosition } = filtered
  
  // 更新地图视口与主定位图标
  map.setView(mapPosition, customZoom)
  
  // 若是持续定位模式，记录历史轨迹点
  if (isIntervalUpdate) {
    let isStationary = false
    if (intervalLocationState.lastPosition) {
      const dist = L.latLng(mapPosition).distanceTo(L.latLng(intervalLocationState.lastPosition.latlng))
      if (dist < 10) {
        isStationary = true
      }
    }

    if (isStationary) {
      // 移动幅度小，不生产新轨迹点，但累计在当前位置的停留时间
      const now = Date.now()
      if (!intervalLocationState.lastPosition.firstTimestamp) {
        intervalLocationState.lastPosition.firstTimestamp = intervalLocationState.lastPosition.timestamp
      }
      intervalLocationState.lastPosition.staySeconds = (now - intervalLocationState.lastPosition.firstTimestamp) / 1000

      // 主 Marker 重新在该坐标触发扩散波纹
      addTargetMarker(map, mapPosition, { isInterval: true, playRipple: true })
    } else {
      // 移动幅度大，生产新点
      if (intervalLocationState.lastPosition) {
        if (!intervalLocationState.lastPosition.firstTimestamp) {
          intervalLocationState.lastPosition.firstTimestamp = intervalLocationState.lastPosition.timestamp
        }
        if (!intervalLocationState.lastPosition.staySeconds) {
          intervalLocationState.lastPosition.staySeconds = 0
        }

        intervalLocationState.historyPoints.push(intervalLocationState.lastPosition)

        const maxPts = intervalLocationState.maxHistoryPoints || 0
        if (maxPts > 0 && intervalLocationState.historyPoints.length > maxPts) {
          intervalLocationState.historyPoints.shift()
        }
      }

      intervalLocationState.lastPosition = {
        latlng: mapPosition,
        timestamp: Date.now(),
        firstTimestamp: Date.now(),
        staySeconds: 0,
        accuracy: result.accuracy
      }

      // 绘制轨迹点
      renderHistoryPoints(map, intervalLocationState.historyPoints)

      // 主 Marker 呼吸灯 + 伴随扩散波纹
      addTargetMarker(map, mapPosition, { isInterval: true, playRipple: true })
    }
  } else {
    // 常规模式使用默认图标，不带轨迹
    addTargetMarker(map, mapPosition, { isInterval: false, playRipple: false })
  }
}

// 启动 2D 持续定位
export function startIntervalLocation2d (map, geolocation, interval, zoom, maxHistoryPoints = 0) {
  if (intervalLocationState.timerId) {
    clearInterval(intervalLocationState.timerId)
  }

  // 记录到 localStorage 以便持久化记忆
  try {
    localStorage.setItem('location_interval', String(interval))
    localStorage.setItem('location_zoom', String(zoom))
    localStorage.setItem('location_max_points', String(maxHistoryPoints))
  } catch (err) {
    console.error('Failed to save location settings:', err)
  }

  intervalLocationState.active = true
  intervalLocationState.intervalSeconds = interval
  intervalLocationState.zoomLevel = zoom
  intervalLocationState.maxHistoryPoints = maxHistoryPoints
  intervalLocationState.lastPosition = null
  intervalLocationState.historyPoints = []
  
  // 清空之前的轨迹图层
  intervalLocationState.historyLayers.forEach(layer => map.removeLayer(layer))
  intervalLocationState.historyLayers = []

  // 启动音频后台保活与防止休眠暗屏的 Wake Lock
  startKeepAlive()
  requestWakeLock()

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

  // 停止音频后台保活并释放 Wake Lock
  stopKeepAlive()
  releaseWakeLock()

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

