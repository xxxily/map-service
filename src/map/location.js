import L from 'leaflet'
import { showAlert } from '../ui/dialog.js'
import { getBestPosition, isValidPosition, positionToLeafletLatLng } from './geolocation.js'
import { createTrackKml2d, updateTrackKml2d } from './kml.js'

// Audio keep alive and Screen Wake Lock for mobile background processes
let keepAliveAudio = null
let wakeLock = null
let fallbackVideo = null

function calculateBearing (lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180
  const lat1Rad = lat1 * Math.PI / 180
  const lat2Rad = lat2 * Math.PI / 180

  const y = Math.sin(dLng) * Math.cos(lat2Rad)
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)
  let brng = Math.atan2(y, x) * 180 / Math.PI
  return (brng + 360) % 360
}

async function requestWakeLock () {
  // 优先使用标准 Screen Wake Lock API
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      console.log('[WakeLock] Screen Wake Lock API is active')
      return
    } catch (err) {
      console.warn(`[WakeLock] Screen Wake Lock API failed: ${err.message}, falling back to video.`)
    }
  }

  // 降级方案：动态在后台播放 1x1 像素的极简无声音频/视频源
  if (!fallbackVideo) {
    fallbackVideo = document.createElement('video')
    // 1x1 像素、静音、无内容极简 MP4 Base64
    const silentMp4 = 'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tc252cwAAAChmcmVlAAAAAG1kYXQAAAAIZ29vZwAAArxtb292AABhY212aGQAAAAA0t2u1tLdrtYAAAPoAAAAKAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAACNnRyYWsAAABcdGtoZAAAAAPQ3a7W0N2u1gAAAAEAAAAAAAD6AAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEgbWRpYQAAACxtZGhkAAAAANLdrtbS3a7WAAAAAAAAB1QAAAAAc254aAAAAAAALWhkcmxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAACdmlkZW9saW5rAAAAAIJtaW5mAAAAEHZtstraightAAAAAAAJZGluawAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAB8c3RibAAAAGRzdHNkAAAAAAAAAAEAAABUYXZjMQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAQABAAUAAAAFAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAaP//AAAAJHdyaXRlAAAAAAAAAAEAAAAQYXZjQ0ABAQAA/wADAAAAAEJ0ZHN0cwAAAAAAAAABAAAAAQAAA+gAAAAUc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAAADwAAA+gAAAAQc3RjbwAAAAAAAAABAAAAMAAA'
    fallbackVideo.src = silentMp4
    fallbackVideo.setAttribute('playsinline', '')
    fallbackVideo.setAttribute('muted', '')
    fallbackVideo.loop = true
    fallbackVideo.muted = true
    fallbackVideo.style.position = 'absolute'
    fallbackVideo.style.width = '1px'
    fallbackVideo.style.height = '1px'
    fallbackVideo.style.opacity = '0.01'
    fallbackVideo.style.pointerEvents = 'none'
    document.body.appendChild(fallbackVideo)
  }

  fallbackVideo.play().then(() => {
    console.log('[WakeLock] Screen Wake Lock fallback video is playing')
  }).catch(err => {
    console.warn('[WakeLock] Fallback video play blocked', err)
  })
}

function releaseWakeLock () {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null
      console.log('[WakeLock] Screen Wake Lock API was released')
    }).catch(err => {
      console.warn(`[WakeLock] Failed to release Screen Wake Lock API: ${err.message}`)
    })
  }

  if (fallbackVideo) {
    fallbackVideo.pause()
    console.log('[WakeLock] Screen Wake Lock fallback video was paused')
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
  recordTrack: localStorage.getItem('location_record_track') === 'true', // 是否开启轨迹记录
  onlyLine: localStorage.getItem('location_only_line') === 'true', // 是否仅保留路线
  autoRotate: localStorage.getItem('location_auto_rotate') === 'true', // 是否自动旋转地图
  recordKmlId: localStorage.getItem('location_record_kml_id') || null, // 绑定的 KML ID
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

      // 实时同步停留时间到 KML 中
      if (intervalLocationState.recordTrack) {
        if (!intervalLocationState.recordKmlId) {
          const now = new Date()
          const name = `轨迹_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
          const kmlId = createTrackKml2d(name)
          if (kmlId) {
            intervalLocationState.recordKmlId = kmlId
            localStorage.setItem('location_record_kml_id', kmlId)
          }
        }
        if (intervalLocationState.recordKmlId) {
          updateTrackKml2d(map, intervalLocationState.recordKmlId, intervalLocationState.historyPoints, intervalLocationState.lastPosition)
        }
      }
      // 移动幅度大，生产新点
      if (intervalLocationState.lastPosition) {
        if (!intervalLocationState.lastPosition.firstTimestamp) {
          intervalLocationState.lastPosition.firstTimestamp = intervalLocationState.lastPosition.timestamp
        }
        if (!intervalLocationState.lastPosition.staySeconds) {
          intervalLocationState.lastPosition.staySeconds = 0
        }

        // 自动计算旋转角使得历史轨迹呈现车辆朝上效果
        if (intervalLocationState.autoRotate) {
          const p1 = intervalLocationState.lastPosition.latlng
          const p2 = mapPosition
          let lat1 = null, lng1 = null, lat2 = null, lng2 = null
          if (Array.isArray(p1)) { lat1 = p1[0]; lng1 = p1[1] }
          else if (p1) { lat1 = p1.lat; lng1 = p1.lng }
          
          if (Array.isArray(p2)) { lat2 = p2[0]; lng2 = p2[1] }
          else if (p2) { lat2 = p2.lat; lng2 = p2.lng }

          if (typeof lat1 === 'number' && typeof lat2 === 'number' && typeof lng1 === 'number' && typeof lng2 === 'number') {
            const dist = L.latLng([lat1, lng1]).distanceTo(L.latLng([lat2, lng2]))
            // 距离大于 2 米时才触发旋转，防止静止抖动带来的眩晕
            if (dist > 2) {
              const brng = calculateBearing(lat1, lng1, lat2, lng2)
              const mapBearing = (360 - brng) % 360
              if (map.setBearing) {
                map.setBearing(mapBearing)
                console.log(`[2D Rotate] Bearing updated to ${mapBearing} deg (heading: ${brng} deg)`)
              }
            }
          }
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

      // 实时同步新点位到 KML 中
      if (intervalLocationState.recordTrack) {
        if (!intervalLocationState.recordKmlId) {
          const now = new Date()
          const name = `轨迹_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
          const kmlId = createTrackKml2d(name)
          if (kmlId) {
            intervalLocationState.recordKmlId = kmlId
            localStorage.setItem('location_record_kml_id', kmlId)
          }
        }
        if (intervalLocationState.recordKmlId) {
          updateTrackKml2d(map, intervalLocationState.recordKmlId, intervalLocationState.historyPoints, intervalLocationState.lastPosition)
        }
      }
    }
  } else {
    // 常规模式使用默认图标，不带轨迹
    addTargetMarker(map, mapPosition, { isInterval: false, playRipple: false })
  }
}

// 启动 2D 持续定位
export function startIntervalLocation2d (map, geolocation, interval, zoom, maxHistoryPoints = 0, recordTrack = false, onlyLine = false, autoRotate = false) {
  if (intervalLocationState.timerId) {
    clearInterval(intervalLocationState.timerId)
  }

  // 记录到 localStorage 以便持久化记忆
  try {
    localStorage.setItem('location_interval', String(interval))
    localStorage.setItem('location_zoom', String(zoom))
    localStorage.setItem('location_max_points', String(maxHistoryPoints))
    localStorage.setItem('location_record_track', String(recordTrack))
    localStorage.setItem('location_only_line', String(onlyLine))
    localStorage.setItem('location_auto_rotate', String(autoRotate))
  } catch (err) {
    console.error('Failed to save location settings:', err)
  }

  intervalLocationState.active = true
  intervalLocationState.intervalSeconds = interval
  intervalLocationState.zoomLevel = zoom
  intervalLocationState.maxHistoryPoints = maxHistoryPoints
  intervalLocationState.recordTrack = recordTrack
  intervalLocationState.onlyLine = onlyLine
  intervalLocationState.autoRotate = autoRotate
  
  // 仅在首次启动时重新创建 KML 文件；如果中途编辑/重连则继续使用现有的 recordKmlId
  if (recordTrack && !intervalLocationState.recordKmlId) {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const date = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const defaultName = `轨迹_${year}${month}${date}_${hours}${minutes}`
    
    const kmlId = createTrackKml2d(defaultName)
    if (kmlId) {
      intervalLocationState.recordKmlId = kmlId
      localStorage.setItem('location_record_kml_id', kmlId)
    }
  }

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

  // 停止定位时做最后的 KML 写入（保存最后一个点位到 KML）
  if (intervalLocationState.recordTrack && intervalLocationState.recordKmlId) {
    updateTrackKml2d(map, intervalLocationState.recordKmlId, intervalLocationState.historyPoints, intervalLocationState.lastPosition, intervalLocationState.onlyLine)
  }

  // 停止音频后台保活并释放 Wake Lock
  stopKeepAlive()
  releaseWakeLock()

  intervalLocationState.active = false
  intervalLocationState.recordKmlId = null
  localStorage.removeItem('location_record_kml_id')
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

