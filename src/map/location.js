import L from 'leaflet'
import { showAlert } from '../ui/dialog.js'
import {
  createContinuousGeolocationSource,
  getBestPosition,
  isValidPosition,
  positionToGcj02,
  positionToLeafletLatLng,
} from './geolocation.js'
import {
  assessPositionSample,
  createContinuousLocationController,
} from './continuous-location.js'
import { createLocationLifecycleTarget } from './location-lifecycle.js'
import {
  createTrackRecordingSession,
  getTrackRecordingPoints,
  hasTrackRecordingData,
  normalizeHistoryPointLimit,
  pauseTrackRecordingSession,
  readBoundedIntegerSetting,
  readLocationSetting,
  recordTrackPosition,
  resetTrackRecordingSession,
  resumeTrackRecordingSession,
  trimTrackRecordingSession,
  trimTrackPointHistory,
} from './location-track.js'
import { createTrackKml2d, hasTrackKml2d, updateTrackKml2d } from './kml.js'
import { startLocationKeepAlive, stopLocationKeepAlive } from './location-keepalive.js'

const MAX_RENDERED_HISTORY_POINTS = 120
const TRACK_CHECKPOINT_MIN_INTERVAL_MS = 15000
const TRACK_PERSIST_RETRY_BASE_MS = 5000
const TRACK_PERSIST_RETRY_MAX_MS = 5 * 60_000

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

// 2D 持续定位全局状态
export const intervalLocationState = {
  active: false,
  timerId: null,
  phase: 'idle',
  generation: 0,
  lastSignalAt: null,
  lastFixAt: null,
  lastProviderTimestamp: null,
  consecutiveTimestampAnomalies: 0,
  consecutiveFailures: 0,
  restartCount: 0,
  lastError: null,
  permissionState: 'unknown',
  intervalSeconds: readBoundedIntegerSetting('location_interval', 15, { min: 1, max: 60 }),
  zoomLevel: readBoundedIntegerSetting('location_zoom', 16, { min: 3, max: 18 }),
  maxHistoryPoints: readBoundedIntegerSetting('location_max_points', 0, { min: 0, max: 100_000 }),
  recordTrack: readLocationSetting('location_record_track', 'true') !== 'false', // 是否开启轨迹记录
  onlyLine: readLocationSetting('location_only_line', 'true') !== 'false', // 是否仅保留路线
  autoRotate: readLocationSetting('location_auto_rotate', 'true') !== 'false', // 是否自动旋转地图
  recordKmlId: null, // 初始化为 null，新持续定位重新创建，防止脏 ID 残留覆盖旧轨迹
  lastPosition: null, // 存入最新的定位点数据 { latlng, timestamp, accuracy }
  suspectPosition: null, // 单个超大跳点候选；连续一致时用于安全重定基准
  lastTrackPersistAt: 0,
  lastTrackPersistAttemptAt: 0,
  nextTrackPersistRetryAt: 0,
  trackPersistFailures: 0,
  persistenceError: null,
  recordingSession: createTrackRecordingSession(),
  historyPoints: [],  // 最近 3-5 次的定位点数据数组
  historyLayers: [],  // 渲染在地图上的 L.circleMarker 图层实例数组
}

// 页面载入时主动清理可能存在的意外退出残留轨迹关联状态
try {
  localStorage.removeItem('location_record_kml_id')
} catch (err) {}

function createTrackName () {
  const now = new Date()
  return `轨迹_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
}

function ensureTrackKml2d (allowInactive = false) {
  if (!intervalLocationState.recordTrack && !allowInactive) {
    return null
  }
  if (hasTrackKml2d(intervalLocationState.recordKmlId)) {
    return intervalLocationState.recordKmlId
  }
  if (intervalLocationState.recordKmlId) clearTrackKmlSession2d()

  const kmlId = createTrackKml2d(createTrackName())
  if (!kmlId) {
    intervalLocationState.persistenceError = '无法创建轨迹文件'
    return null
  }

  intervalLocationState.recordKmlId = kmlId
  try {
    localStorage.setItem('location_record_kml_id', kmlId)
  } catch (err) {
    intervalLocationState.persistenceError = '轨迹会话标识保存失败'
  }
  return kmlId
}

function clearTrackKmlSession2d () {
  intervalLocationState.recordKmlId = null
  intervalLocationState.lastTrackPersistAt = 0
  intervalLocationState.lastTrackPersistAttemptAt = 0
  intervalLocationState.nextTrackPersistRetryAt = 0
  intervalLocationState.trackPersistFailures = 0
  try {
    localStorage.removeItem('location_record_kml_id')
  } catch (err) {}
}

function resetTrackPersistBackoff2d () {
  intervalLocationState.lastTrackPersistAt = 0
  intervalLocationState.lastTrackPersistAttemptAt = 0
  intervalLocationState.nextTrackPersistRetryAt = 0
  intervalLocationState.trackPersistFailures = 0
}

function startTrackRecording2d () {
  resumeTrackRecordingSession(intervalLocationState.recordingSession, {
    currentPosition: intervalLocationState.lastPosition,
    maxHistoryPoints: intervalLocationState.maxHistoryPoints,
  })
}

function stopTrackRecording2d () {
  pauseTrackRecordingSession(intervalLocationState.recordingSession, {
    maxHistoryPoints: intervalLocationState.maxHistoryPoints,
  })
}

function captureTrackPosition2d ({ replaceLast = false } = {}) {
  return recordTrackPosition(
    intervalLocationState.recordingSession,
    intervalLocationState.lastPosition,
    {
      replaceLast,
      maxHistoryPoints: intervalLocationState.maxHistoryPoints,
    },
  )
}

function markTrackPersistFailure2d (now) {
  intervalLocationState.trackPersistFailures += 1
  const retryDelay = Math.min(
    TRACK_PERSIST_RETRY_MAX_MS,
    TRACK_PERSIST_RETRY_BASE_MS * (2 ** Math.min(intervalLocationState.trackPersistFailures - 1, 10)),
  )
  intervalLocationState.nextTrackPersistRetryAt = now + retryDelay
  intervalLocationState.persistenceError = '轨迹保存失败，定位仍在继续'
}

function persistTrack2d (map, { force = false } = {}) {
  if (!intervalLocationState.recordTrack && !force) return false
  const now = Date.now()
  if (intervalLocationState.lastTrackPersistAttemptAt &&
      now < intervalLocationState.lastTrackPersistAttemptAt) {
    intervalLocationState.lastTrackPersistAt = 0
    intervalLocationState.nextTrackPersistRetryAt = 0
  }
  intervalLocationState.lastTrackPersistAttemptAt = now
  if (!force && now < intervalLocationState.nextTrackPersistRetryAt) return false
  if (!ensureTrackKml2d(force)) {
    markTrackPersistFailure2d(now)
    return false
  }
  const checkpointInterval = Math.max(
    TRACK_CHECKPOINT_MIN_INTERVAL_MS,
    Number(intervalLocationState.intervalSeconds || 0) * 1000
  )
  if (!force && intervalLocationState.lastTrackPersistAt &&
      now - intervalLocationState.lastTrackPersistAt < checkpointInterval) {
    return true
  }

  const recorded = getTrackRecordingPoints(intervalLocationState.recordingSession)
  const saved = updateTrackKml2d(
    map,
    intervalLocationState.recordKmlId,
    recorded.historyPoints,
    recorded.lastPosition,
    intervalLocationState.onlyLine,
    recorded.segments,
  )
  if (saved) {
    intervalLocationState.lastTrackPersistAt = now
    intervalLocationState.nextTrackPersistRetryAt = 0
    intervalLocationState.trackPersistFailures = 0
    intervalLocationState.persistenceError = null
  } else {
    markTrackPersistFailure2d(now)
  }
  return saved
}

// 辅助函数：绘制历史定位轨迹点
function renderHistoryPoints (map, points) {
  // 清除旧轨迹点图层
  intervalLocationState.historyLayers.forEach(layer => map.removeLayer(layer))
  intervalLocationState.historyLayers = []

  // 完整轨迹仍保留在内存/KML 中，但地图只绘制最近一段，避免长途运行时
  // 每轮删除并重建成千上万个 Marker 阻塞主线程。
  const visiblePoints = points.slice(-MAX_RENDERED_HISTORY_POINTS)
  const pointNumberOffset = points.length - visiblePoints.length
  const len = visiblePoints.length
  visiblePoints.forEach((pt, index) => {
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
    let nextPt = visiblePoints[index + 1]
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
      const prevPt = visiblePoints[index - 1]
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
        <strong style="color: #0f766e;">历史定位点 #${pointNumberOffset + index + 1}</strong><br>
        定位时间：${timeStr}<br>
        定位精度：${pt.accuracy ? Math.round(pt.accuracy) + ' 米' : '未知'}${speedInfo}
      </div>
    `

    circle.bindPopup(popupContent, { closeButton: false })
    circle.addTo(map)
    intervalLocationState.historyLayers.push(circle)
  })
}

let currentLocationMarker = null

export function addTargetMarker (map, location, options = {}) {
  // 清除地图上已有的定位 Marker
  if (currentLocationMarker) {
    map.removeLayer(currentLocationMarker)
    currentLocationMarker = null
  }

  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      const iconOptions = layer.options?.icon?.options
      if (iconOptions?.className === 'custom-location-marker') {
        map.removeLayer(layer)
      }
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
  currentLocationMarker = marker
  marker.on('dragend', (event) => {
    const latlng = event.target.getLatLng()
    const coords = `${latlng.lat},${latlng.lng},${map.getZoom()}`
    window.history.replaceState(null, '', `?coords=${coords}`)
  })

  if (options.detailInfo) {
    const popupContent = createLocationPopupContent(options.detailInfo)
    marker.bindPopup(popupContent)
  }

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

function createLocationPopupContent (info) {
  const timeStr = new Date(info.timestamp).toLocaleTimeString()
  const dateStr = new Date(info.timestamp).toLocaleDateString()
  let extraHtml = ''
  
  if (info.isInterval) {
    extraHtml += `<br>定位模式：持续追踪`
    if (info.staySeconds > 0) {
      const stayText = info.staySeconds > 60 
        ? `${Math.floor(info.staySeconds / 60)} 分 ${Math.round(info.staySeconds % 60)} 秒`
        : `${Math.round(info.staySeconds)} 秒`
      extraHtml += `<br>停留时长：${stayText}`
    }
    if (info.speed) {
      extraHtml += `<br>移动速度：${info.speed}`
    }
  } else {
    extraHtml += `<br>定位模式：单次定位`
  }

  return `
    <div style="font-size: 12px; line-height: 1.6; color: #374151; min-width: 180px;">
      <strong style="color: #0f766e; font-size: 13px;">${info.isInterval ? '设备追踪位置' : '当前定位位置'}</strong><br>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 4px 0 6px 0;">
      经纬度 (GCJ-02)：${info.lat.toFixed(6)}, ${info.lng.toFixed(6)}<br>
      原始经纬度 (WGS-84)：${info.rawLat.toFixed(6)}, ${info.rawLng.toFixed(6)}<br>
      定位精度：${info.accuracy ? Math.round(info.accuracy) + ' 米' : '未知'}<br>
      定位源：${info.source === 'browser' ? '浏览器 / GPS' : info.source}<br>
      定位时间：${dateStr} ${timeStr}
      ${extraHtml}
    </div>
  `
}

function waitForLocationRetry (signal, delay = 500) {
  if (signal?.aborted) return Promise.resolve(false)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', handleAbort)
      resolve(true)
    }, delay)
    const handleAbort = () => {
      clearTimeout(timer)
      resolve(false)
    }
    signal?.addEventListener?.('abort', handleAbort, { once: true })
  })
}

async function getFilteredPosition2d (map, geolocation, customZoom, isIntervalUpdate, retryCount = 0, runtime = {}) {
  const result = retryCount === 0 && runtime.position
    ? runtime.position
    : await getBestPosition(geolocation, { signal: runtime.signal })

  if (runtime.signal?.aborted) return null

  if (!isValidPosition(result)) {
    return null
  }

  const gcjPosition = positionToGcj02(result)
  const mapPosition = positionToLeafletLatLng(result)

  // 使用时间差、精度和合理最大速度判断异常点；一个超大跳点只作为候选，
  // 第二个与候选一致的独立样本会安全重定基准，避免旧 200 米锚点永久锁死。
  if (isIntervalUpdate && intervalLocationState.lastPosition) {
    const locationSample = {
      lat: gcjPosition.lat,
      lng: gcjPosition.lng,
      accuracy: result.accuracy,
      timestamp: Number.isFinite(Number(result.timestamp)) ? Number(result.timestamp) : Date.now(),
    }
    const assessment = assessPositionSample({
      lastAccepted: intervalLocationState.lastPosition.locationSample,
      suspect: intervalLocationState.suspectPosition,
    }, locationSample, {
      defaultIntervalMs: intervalLocationState.intervalSeconds * 1000,
    })

    intervalLocationState.suspectPosition = assessment.suspect
    if (!assessment.accepted) {
      console.warn(`[2D 定位] 隔离疑似漂移点：距旧点 ${Math.round(assessment.distanceMeters || 0)} 米，动态允许 ${Math.round(assessment.allowedDistanceMeters || 0)} 米`)
      if (retryCount === 0) {
        const shouldRetry = await waitForLocationRetry(runtime.signal)
        if (shouldRetry) {
          return getFilteredPosition2d(map, geolocation, customZoom, isIntervalUpdate, 1, {
            ...runtime,
            position: null,
          })
        }
      }
      return null
    }

    intervalLocationState.suspectPosition = null
    if (assessment.reanchored) {
      console.info('[2D 定位] 连续新位置已确认，自动重新建立轨迹基准')
    }
    return { result, mapPosition, locationSample, reanchored: assessment.reanchored }
  }

  return {
    result,
    mapPosition,
    locationSample: {
      lat: gcjPosition.lat,
      lng: gcjPosition.lng,
      accuracy: result.accuracy,
      timestamp: Number.isFinite(Number(result.timestamp)) ? Number(result.timestamp) : Date.now(),
    },
    reanchored: false,
  }
}

export async function updatePosition (map, geolocation = null, customZoom = 18, isIntervalUpdate = false, runtime = {}) {
  if (!isIntervalUpdate) {
    updateLocationStatusBar2d('正在定位...')
  }

  let filtered = null
  try {
    filtered = await getFilteredPosition2d(map, geolocation, customZoom, isIntervalUpdate, 0, runtime)
  } catch (err) {
    if (!runtime.signal?.aborted) {
      console.error(`获取地理位置失败（${String(err?.code || err?.name || 'unknown')}）`)
    }
  }

  if (!filtered) {
    if (!isIntervalUpdate && !runtime.signal?.aborted) {
      updateLocationStatusBar2d('定位失败')
      await showAlert('获取地理位置失败，请手动选择')
    }
    return false
  }

  if (runtime.signal?.aborted) return false

  const { result, mapPosition, locationSample, reanchored } = filtered
  
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
      const currentPosition = intervalLocationState.lastPosition
      if (!Number.isFinite(currentPosition.firstTimestamp)) {
        currentPosition.firstTimestamp = currentPosition.timestamp
      }
      currentPosition.latlng = mapPosition
      currentPosition.timestamp = locationSample.timestamp
      currentPosition.accuracy = result.accuracy
      currentPosition.locationSample = locationSample
      currentPosition.reanchored = reanchored
      currentPosition.staySeconds = Math.max(
        0,
        (locationSample.timestamp - currentPosition.firstTimestamp) / 1000,
      )
      captureTrackPosition2d({ replaceLast: true })

      const detailInfo = {
        isInterval: true,
        lat: mapPosition[0],
        lng: mapPosition[1],
        rawLat: result.lat,
        rawLng: result.lng,
        accuracy: result.accuracy,
        source: result.source,
        timestamp: locationSample.timestamp,
        staySeconds: currentPosition.staySeconds,
      }

      // 主 Marker 重新在该坐标触发扩散波纹
      addTargetMarker(map, mapPosition, { isInterval: true, playRipple: true, detailInfo })
      updateLocationStatusBar2d('持续定位中', result.accuracy, locationSample.timestamp)
      addPanelHistoryRecord2d({
        timestamp: locationSample.timestamp,
        accuracy: result.accuracy,
        staySeconds: currentPosition.staySeconds
      }, true)

      // 节流检查点，避免 1 秒间隔的长途轨迹每秒全量序列化和重绘。
      if (intervalLocationState.recordTrack) persistTrack2d(map)
    } else {
      // 移动幅度大，生产新点
      if (intervalLocationState.lastPosition) {
        if (!Number.isFinite(intervalLocationState.lastPosition.firstTimestamp)) {
          intervalLocationState.lastPosition.firstTimestamp = intervalLocationState.lastPosition.timestamp
        }
        if (!intervalLocationState.lastPosition.staySeconds) {
          intervalLocationState.lastPosition.staySeconds = 0
        }

        // 自动计算旋转角使得历史轨迹呈现车辆朝上效果
        if (intervalLocationState.autoRotate && !reanchored) {
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

        trimTrackPointHistory(intervalLocationState.historyPoints, intervalLocationState.maxHistoryPoints)
      }

      intervalLocationState.lastPosition = {
        latlng: mapPosition,
        timestamp: locationSample.timestamp,
        firstTimestamp: locationSample.timestamp,
        staySeconds: 0,
        accuracy: result.accuracy,
        locationSample,
        reanchored,
      }
      captureTrackPosition2d()

      // 绘制轨迹点
      renderHistoryPoints(map, intervalLocationState.historyPoints)

      let speed = ''
      if (intervalLocationState.historyPoints.length > 0) {
        const pt = intervalLocationState.historyPoints[intervalLocationState.historyPoints.length - 1]
        const dist = L.latLng(mapPosition).distanceTo(L.latLng(pt.latlng))
        const timeDiff = Math.abs(locationSample.timestamp - pt.timestamp) / 1000
        if (timeDiff > 0) {
          const speedMps = dist / timeDiff
          const speedKmh = speedMps * 3.6
          speed = `${speedKmh.toFixed(1)} km/h (${speedMps.toFixed(1)} m/s)`
        }
      }

      const detailInfo = {
        isInterval: true,
        lat: mapPosition[0],
        lng: mapPosition[1],
        rawLat: result.lat,
        rawLng: result.lng,
        accuracy: result.accuracy,
        source: result.source,
        timestamp: locationSample.timestamp,
        staySeconds: 0,
        speed,
      }

      // 主 Marker 呼吸灯 + 伴随扩散波纹
      addTargetMarker(map, mapPosition, { isInterval: true, playRipple: true, detailInfo })
      updateLocationStatusBar2d('持续定位中', result.accuracy, locationSample.timestamp)
      addPanelHistoryRecord2d({
        timestamp: locationSample.timestamp,
        accuracy: result.accuracy,
        staySeconds: 0
      }, false)

      if (intervalLocationState.recordTrack) persistTrack2d(map)
    }
  } else {
    const detailInfo = {
      isInterval: false,
      lat: mapPosition[0],
      lng: mapPosition[1],
      rawLat: result.lat,
      rawLng: result.lng,
      accuracy: result.accuracy,
      source: result.source,
      timestamp: locationSample.timestamp,
    }
    // 常规模式使用默认图标，不带轨迹
    addTargetMarker(map, mapPosition, { isInterval: false, playRipple: false, detailInfo })
    updateLocationStatusBar2d('已定位', result.accuracy, locationSample.timestamp)
    addPanelHistoryRecord2d({
      timestamp: locationSample.timestamp,
      accuracy: result.accuracy,
      staySeconds: 0
    }, false)
  }
  return true
}

let intervalLocationController2d = null

function persistLocationSettings2d () {
  try {
    localStorage.setItem('location_interval', String(intervalLocationState.intervalSeconds))
    localStorage.setItem('location_zoom', String(intervalLocationState.zoomLevel))
    localStorage.setItem('location_max_points', String(intervalLocationState.maxHistoryPoints))
    localStorage.setItem('location_record_track', String(intervalLocationState.recordTrack))
    localStorage.setItem('location_only_line', String(intervalLocationState.onlyLine))
    localStorage.setItem('location_auto_rotate', String(intervalLocationState.autoRotate))
  } catch (err) {
    console.error('保存定位设置失败', err)
  }
}

function emitContinuousLocationState2d (snapshot) {
  if (typeof window?.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return
  window.dispatchEvent(new CustomEvent('continuous-location-statechange', {
    detail: { mode: '2d', ...snapshot },
  }))
}

function syncControllerState2d (map, snapshot) {
  const previousPhase = intervalLocationState.phase
  intervalLocationState.active = snapshot.desiredActive
  intervalLocationState.phase = snapshot.phase
  intervalLocationState.generation = snapshot.generation
  intervalLocationState.lastSignalAt = snapshot.lastSignalAt
  intervalLocationState.lastFixAt = snapshot.lastFixAt
  intervalLocationState.lastProviderTimestamp = snapshot.lastProviderTimestamp
  intervalLocationState.consecutiveTimestampAnomalies = snapshot.consecutiveTimestampAnomalies
  intervalLocationState.consecutiveFailures = snapshot.consecutiveFailures
  intervalLocationState.restartCount = snapshot.restartCount
  intervalLocationState.lastError = snapshot.lastError
  intervalLocationState.permissionState = snapshot.permissionState
  intervalLocationState.timerId = null

  if (intervalLocationState.recordTrack &&
      snapshot.phase === 'suspended' && previousPhase !== 'suspended' &&
      (intervalLocationState.lastPosition || intervalLocationState.historyPoints.length > 0)) {
    persistTrack2d(map, { force: true })
  }
  emitContinuousLocationState2d(snapshot)

  const phaseTexts = {
    idle: '',
    starting: '正在定位...',
    tracking: '持续定位中',
    stale: '信号弱',
    recovering: '正在自动恢复...',
    suspended: '已挂起',
    'permission-blocked': '权限受限',
    unsupported: '设备不支持'
  }
  const statusText = phaseTexts[snapshot.phase] || ''
  if (snapshot.phase === 'idle') {
    updateLocationStatusBar2d()
  } else {
    const lastPos = intervalLocationState.lastPosition
    if (lastPos) {
      updateLocationStatusBar2d(statusText, lastPos.accuracy, lastPos.timestamp)
    } else {
      updateLocationStatusBar2d(statusText)
    }
  }
}

export function configureIntervalLocation2d (map, {
  interval,
  zoom,
  maxHistoryPoints = intervalLocationState.maxHistoryPoints,
  recordTrack = intervalLocationState.recordTrack,
  onlyLine = intervalLocationState.onlyLine,
  autoRotate = intervalLocationState.autoRotate,
}) {
  const wasRecording = intervalLocationState.recordTrack
  let finalPersistSucceeded = wasRecording && !recordTrack &&
    hasTrackRecordingData(intervalLocationState.recordingSession)
    ? persistTrack2d(map, { force: true })
    : true

  const normalizedMaxHistoryPoints = normalizeHistoryPointLimit(maxHistoryPoints)

  intervalLocationState.intervalSeconds = interval
  intervalLocationState.zoomLevel = zoom
  intervalLocationState.maxHistoryPoints = normalizedMaxHistoryPoints
  intervalLocationState.recordTrack = recordTrack
  intervalLocationState.onlyLine = onlyLine
  intervalLocationState.autoRotate = autoRotate

  const historyTrimmed = trimTrackPointHistory(
    intervalLocationState.historyPoints,
    normalizedMaxHistoryPoints,
  )
  trimTrackRecordingSession(
    intervalLocationState.recordingSession,
    normalizedMaxHistoryPoints,
  )
  if (historyTrimmed) renderHistoryPoints(map, intervalLocationState.historyPoints)

  if (wasRecording && !recordTrack) {
    stopTrackRecording2d()
  } else if (!wasRecording && recordTrack) {
    startTrackRecording2d()
    resetTrackPersistBackoff2d()
  }
  persistLocationSettings2d()

  if (recordTrack) {
    finalPersistSucceeded = persistTrack2d(map, { force: true }) && finalPersistSucceeded
  }
  intervalLocationController2d?.configure({ intervalMs: interval * 1000 })
  return { ...intervalLocationState, finalPersistSucceeded }
}

// 启动 2D 持续定位
export function startIntervalLocation2d (map, geolocation, interval, zoom, maxHistoryPoints = 0, recordTrack = false, onlyLine = false, autoRotate = false) {
  intervalLocationController2d?.destroy()
  intervalLocationController2d = null

  intervalLocationState.intervalSeconds = interval
  intervalLocationState.zoomLevel = zoom
  intervalLocationState.maxHistoryPoints = normalizeHistoryPointLimit(maxHistoryPoints)
  intervalLocationState.recordTrack = recordTrack
  intervalLocationState.onlyLine = onlyLine
  intervalLocationState.autoRotate = autoRotate
  intervalLocationState.lastTrackPersistAt = 0
  intervalLocationState.persistenceError = null
  clearTrackKmlSession2d()

  intervalLocationState.lastPosition = null
  intervalLocationState.suspectPosition = null
  intervalLocationState.historyPoints = []
  resetTrackRecordingSession(intervalLocationState.recordingSession, { active: recordTrack })
  persistLocationSettings2d()
  if (recordTrack) ensureTrackKml2d()
  
  // 清空之前的轨迹图层
  intervalLocationState.historyLayers.forEach(layer => map.removeLayer(layer))
  intervalLocationState.historyLayers = []

  void startLocationKeepAlive()

  const source = createContinuousGeolocationSource(geolocation)
  intervalLocationController2d = createContinuousLocationController({
    source,
    lifecycle: createLocationLifecycleTarget(),
    intervalMs: interval * 1000,
    positionOptions: {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    },
    onPosition: (position, runtime) => updatePosition(
      map,
      geolocation,
      intervalLocationState.zoomLevel,
      true,
      { ...runtime, position },
    ),
    onStateChange: snapshot => syncControllerState2d(map, snapshot),
  })
  intervalLocationController2d.start()
}

// 停止 2D 持续定位
export function stopIntervalLocation2d (map) {
  // 先撤销用户运行意图并使旧 generation 失效，随后才执行最终落盘。
  intervalLocationController2d?.stop()
  intervalLocationController2d?.destroy()
  intervalLocationController2d = null

  // 停止定位时做最后的 KML 写入，必须确保当前内存中存在至少一个定位点或历史点，防止刷新页面后由于内存清空而覆盖擦除已有的 KML 轨迹数据
  const recorded = getTrackRecordingPoints(intervalLocationState.recordingSession)
  let finalPersistSucceeded = true
  const hasRecordedData = recorded.segments.length > 0 ||
    recorded.historyPoints.length > 0 || recorded.lastPosition !== null
  const needsFinalPersist = hasRecordedData && (
    intervalLocationState.recordTrack ||
    Boolean(intervalLocationState.persistenceError) ||
    !hasTrackKml2d(intervalLocationState.recordKmlId)
  )
  if (needsFinalPersist) {
    finalPersistSucceeded = persistTrack2d(map, { force: true })
  }
  const finalPersistenceError = finalPersistSucceeded ? null : intervalLocationState.persistenceError

  // 停止音频后台保活并释放 Wake Lock
  stopLocationKeepAlive()

  intervalLocationState.active = false
  intervalLocationState.phase = 'idle'
  clearTrackKmlSession2d()
  intervalLocationState.lastPosition = null
  intervalLocationState.suspectPosition = null
  resetTrackRecordingSession(intervalLocationState.recordingSession)
  
  // 清理历史点图层
  intervalLocationState.historyLayers.forEach(layer => map.removeLayer(layer))
  intervalLocationState.historyLayers = []
  intervalLocationState.historyPoints = []

  // 重新在最后定位处绘制默认常规 Marker
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      const iconOptions = layer.options?.icon?.options
      if (iconOptions?.className === 'custom-location-marker' || layer === currentLocationMarker) {
        const latlng = layer.getLatLng()
        // 清除呼吸灯 Marker
        map.removeLayer(layer)
        // 重新绘制普通靶心 Marker
        currentLocationMarker = L.marker(latlng, { opacity: 1, draggable: true }).addTo(map)
        currentLocationMarker.on('dragend', (event) => {
          const coords = `${event.target.getLatLng().lat},${event.target.getLatLng().lng},${map.getZoom()}`
          window.history.replaceState(null, '', `?coords=${coords}`)
        })
      }
    }
  })

  return {
    finalPersistSucceeded,
    persistenceError: finalPersistenceError,
  }
}

export function updateLocationStatusBar2d (statusText, accuracy, timestamp) {
  const container = document.getElementById('location-status-bar')
  const divider = document.querySelector('.footer-divider')
  if (!container) return

  if (!statusText && accuracy === undefined) {
    container.style.display = 'none'
    if (divider) divider.style.display = 'none'
    return
  }

  if (divider) divider.style.display = 'inline'
  container.style.display = 'inline-flex'

  let timeHtml = ''
  if (timestamp) {
    const timeStr = new Date(timestamp).toTimeString().split(' ')[0]
    timeHtml = `<span class="status-time" style="margin-left: 4px;">${timeStr}</span>`
  }

  let signalHtml = ''
  if (accuracy !== undefined && accuracy !== null) {
    let signalClass = 'location-signal-strong'
    let inactiveClass2 = ''
    let inactiveClass3 = ''
    let inactiveClass4 = ''

    if (accuracy <= 15) {
      signalClass = 'location-signal-strong'
    } else if (accuracy <= 30) {
      signalClass = 'location-signal-strong'
      inactiveClass4 = 'inactive'
    } else if (accuracy <= 50) {
      signalClass = 'location-signal-medium'
      inactiveClass3 = 'inactive'
      inactiveClass4 = 'inactive'
    } else {
      signalClass = 'location-signal-weak'
      inactiveClass2 = 'inactive'
      inactiveClass3 = 'inactive'
      inactiveClass4 = 'inactive'
    }

    signalHtml = `
      <span class="location-signal-wifi ${signalClass}" title="定位精度: ${Math.round(accuracy)}米" style="margin-left: 6px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" width="12" height="12">
          <circle cx="12" cy="18" r="1.5" fill="currentColor"></circle>
          <path d="M8.5 14.5a5 5 0 0 1 7 0" class="${inactiveClass2}"></path>
          <path d="M5 11a10 10 0 0 1 14 0" class="${inactiveClass3}"></path>
          <path d="M1.5 7.5a15 15 0 0 1 21 0" class="${inactiveClass4}"></path>
        </svg>
        <span class="status-accuracy-val" style="margin-left: 2px;">${Math.round(accuracy)}m</span>
      </span>
    `
  }

  container.innerHTML = `
    <span class="status-text">${statusText}</span>
    ${timeHtml}
    ${signalHtml}
  `
}

export const panelHistoryList2d = []

export function renderHistoryTable2d () {
  const tbody = document.getElementById('history-table-body')
  if (!tbody) return

  if (panelHistoryList2d.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 12px 8px;">暂无定位数据</td></tr>'
    return
  }

  // 最近的排在最前
  const rows = [...panelHistoryList2d].reverse().map(item => {
    const timeStr = new Date(item.timestamp).toTimeString().split(' ')[0]
    const accStr = item.accuracy ? `${Math.round(item.accuracy)}m` : '未知'
    let stayStr = '-'
    if (item.staySeconds > 0) {
      stayStr = item.staySeconds > 60
        ? `${Math.floor(item.staySeconds / 60)}分${Math.round(item.staySeconds % 60)}秒`
        : `${Math.round(item.staySeconds)}秒`
    }
    return `
      <tr>
        <td>${timeStr}</td>
        <td>${accStr}</td>
        <td>${stayStr}</td>
      </tr>
    `
  }).join('')

  tbody.innerHTML = rows
}

export function initLocationHistoryPanel2d () {
  const footerBar = document.getElementById('footer-bar')
  const panel = document.getElementById('location-history-panel')
  const closeBtn = document.getElementById('history-close-btn')

  if (footerBar && panel) {
    footerBar.title = '点击查看最近 100 次定位历史记录'
    footerBar.style.pointerEvents = 'auto'
    footerBar.style.cursor = 'pointer'

    footerBar.addEventListener('click', () => {
      const isHidden = panel.hasAttribute('hidden')
      if (isHidden) {
        panel.removeAttribute('hidden')
        renderHistoryTable2d()
      } else {
        panel.setAttribute('hidden', '')
      }
    })
  }

  if (closeBtn && panel) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      panel.setAttribute('hidden', '')
    })
  }
}

export function addPanelHistoryRecord2d (item, replaceLast = false) {
  if (replaceLast && panelHistoryList2d.length > 0) {
    const last = panelHistoryList2d[panelHistoryList2d.length - 1]
    last.timestamp = item.timestamp
    last.accuracy = item.accuracy
    last.staySeconds = item.staySeconds
  } else {
    panelHistoryList2d.push({
      timestamp: item.timestamp,
      accuracy: item.accuracy,
      staySeconds: item.staySeconds || 0
    })
    if (panelHistoryList2d.length > 100) {
      panelHistoryList2d.shift()
    }
  }

  const panel = document.getElementById('location-history-panel')
  if (panel && !panel.hasAttribute('hidden')) {
    renderHistoryTable2d()
  }
}
