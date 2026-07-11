import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  HeightReference,
  LabelStyle,
  VerticalOrigin,
  Math as CesiumMath,
  CallbackProperty,
} from 'cesium'
import {
  createContinuousGeolocationSource,
  getBestPosition,
  isValidPosition,
  positionToGcj02,
} from '../map/geolocation.js'
import {
  assessPositionSample,
  createContinuousLocationController,
} from '../map/continuous-location.js'
import { createLocationLifecycleTarget } from '../map/location-lifecycle.js'
import { startLocationKeepAlive, stopLocationKeepAlive } from '../map/location-keepalive.js'
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
} from '../map/location-track.js'
import { createTrackKml3d, hasTrackKml3d, updateTrackKml3d } from './kml.js'

let targetEntity = null
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

// 3D 持续定位全局状态
export const intervalLocationState3d = {
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
  currentHeading: 0, // 当前运行时的车头朝向航向角 (0-360)
  recordKmlId: null, // 初始化为 null，新持续定位重新创建，防止脏 ID 残留覆盖旧轨迹
  lastPosition: null, // 存储最新的定位点数据 { lng, lat, timestamp, accuracy }
  suspectPosition: null, // 单个异常跳点候选，连续一致时允许安全重定基准
  lastTrackPersistAt: 0,
  lastTrackPersistAttemptAt: 0,
  nextTrackPersistRetryAt: 0,
  trackPersistFailures: 0,
  persistenceError: null,
  recordingSession: createTrackRecordingSession(),
  historyPoints: [],  // 最近 3-5 次轨迹数据
  historyEntities: [] // 渲染在 3D 地图上的实体集合
}

// 页面载入时主动清理可能存在的意外退出残留轨迹关联状态
try {
  localStorage.removeItem('location_record_kml_id')
} catch (err) {}

function createTrackName3d () {
  const now = new Date()
  return `轨迹_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
}

function ensureTrackKml3d (allowInactive = false) {
  if (!intervalLocationState3d.recordTrack && !allowInactive) {
    return null
  }
  if (hasTrackKml3d(intervalLocationState3d.recordKmlId)) {
    return intervalLocationState3d.recordKmlId
  }
  if (intervalLocationState3d.recordKmlId) clearTrackKmlSession3d()

  const kmlId = createTrackKml3d(createTrackName3d())
  if (!kmlId) {
    intervalLocationState3d.persistenceError = '无法创建轨迹文件'
    return null
  }

  intervalLocationState3d.recordKmlId = kmlId
  try {
    localStorage.setItem('location_record_kml_id', kmlId)
  } catch (err) {
    intervalLocationState3d.persistenceError = '轨迹会话标识保存失败'
  }
  return kmlId
}

function clearTrackKmlSession3d () {
  intervalLocationState3d.recordKmlId = null
  intervalLocationState3d.lastTrackPersistAt = 0
  intervalLocationState3d.lastTrackPersistAttemptAt = 0
  intervalLocationState3d.nextTrackPersistRetryAt = 0
  intervalLocationState3d.trackPersistFailures = 0
  try {
    localStorage.removeItem('location_record_kml_id')
  } catch (err) {}
}

function resetTrackPersistBackoff3d () {
  intervalLocationState3d.lastTrackPersistAt = 0
  intervalLocationState3d.lastTrackPersistAttemptAt = 0
  intervalLocationState3d.nextTrackPersistRetryAt = 0
  intervalLocationState3d.trackPersistFailures = 0
}

function startTrackRecording3d () {
  resumeTrackRecordingSession(intervalLocationState3d.recordingSession, {
    currentPosition: intervalLocationState3d.lastPosition,
    maxHistoryPoints: intervalLocationState3d.maxHistoryPoints,
  })
}

function stopTrackRecording3d () {
  pauseTrackRecordingSession(intervalLocationState3d.recordingSession, {
    maxHistoryPoints: intervalLocationState3d.maxHistoryPoints,
  })
}

function captureTrackPosition3d ({ replaceLast = false } = {}) {
  return recordTrackPosition(
    intervalLocationState3d.recordingSession,
    intervalLocationState3d.lastPosition,
    {
      replaceLast,
      maxHistoryPoints: intervalLocationState3d.maxHistoryPoints,
    },
  )
}

function markTrackPersistFailure3d (now) {
  intervalLocationState3d.trackPersistFailures += 1
  const retryDelay = Math.min(
    TRACK_PERSIST_RETRY_MAX_MS,
    TRACK_PERSIST_RETRY_BASE_MS * (2 ** Math.min(intervalLocationState3d.trackPersistFailures - 1, 10)),
  )
  intervalLocationState3d.nextTrackPersistRetryAt = now + retryDelay
  intervalLocationState3d.persistenceError = '轨迹保存失败，定位仍在继续'
}

function persistTrack3d ({ force = false } = {}) {
  if (!intervalLocationState3d.recordTrack && !force) return false
  const now = Date.now()
  if (intervalLocationState3d.lastTrackPersistAttemptAt &&
      now < intervalLocationState3d.lastTrackPersistAttemptAt) {
    intervalLocationState3d.lastTrackPersistAt = 0
    intervalLocationState3d.nextTrackPersistRetryAt = 0
  }
  intervalLocationState3d.lastTrackPersistAttemptAt = now
  if (!force && now < intervalLocationState3d.nextTrackPersistRetryAt) return false
  if (!ensureTrackKml3d(force)) {
    markTrackPersistFailure3d(now)
    return false
  }
  const checkpointInterval = Math.max(
    TRACK_CHECKPOINT_MIN_INTERVAL_MS,
    Number(intervalLocationState3d.intervalSeconds || 0) * 1000
  )
  if (!force && intervalLocationState3d.lastTrackPersistAt &&
      now - intervalLocationState3d.lastTrackPersistAt < checkpointInterval) {
    return true
  }

  const recorded = getTrackRecordingPoints(intervalLocationState3d.recordingSession)
  const saved = updateTrackKml3d(
    intervalLocationState3d.recordKmlId,
    recorded.historyPoints,
    recorded.lastPosition,
    intervalLocationState3d.onlyLine,
    recorded.segments,
  )
  if (saved) {
    intervalLocationState3d.lastTrackPersistAt = now
    intervalLocationState3d.nextTrackPersistRetryAt = 0
    intervalLocationState3d.trackPersistFailures = 0
    intervalLocationState3d.persistenceError = null
  } else {
    markTrackPersistFailure3d(now)
  }
  return saved
}

// 辅助函数：触发 3D 定位扩散波纹
function triggerRipple3d (viewer, position) {
  let radius = 10
  const maxRadius = 150
  let alpha = 0.8

  const radiusCallback = new CallbackProperty(() => radius, false)
  const colorCallback = new CallbackProperty(() => Color.fromCssColorString('#0f766e').withAlpha(alpha), false)

  const rippleEntity = viewer.entities.add({
    position: Cartesian3.fromDegrees(position.lng, position.lat, 2),
    ellipse: {
      semiMajorAxis: radiusCallback,
      semiMinorAxis: radiusCallback,
      material: new ColorMaterialProperty(colorCallback),
      height: 0,
      heightReference: HeightReference.CLAMP_TO_GROUND
    }
  })

  const startTime = Date.now()
  const duration = 1200
  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime
    const ratio = Math.min(1, elapsed / duration)

    radius = 10 + ratio * (maxRadius - 10)
    alpha = 0.8 * (1 - ratio)

    if (ratio >= 1) {
      clearInterval(timer)
      viewer.entities.remove(rippleEntity)
    }
  }, 30)
}

// 辅助函数：绘制 3D 轨迹点
function renderHistoryPoints3d (viewer, points) {
  intervalLocationState3d.historyEntities.forEach(ent => viewer.entities.remove(ent))
  intervalLocationState3d.historyEntities = []

  // 完整轨迹继续用于 KML；3D 场景只保留最近一段可视实体，防止长途
  // 运行时每轮全量重建造成实体数量和主线程耗时无限增长。
  const visiblePoints = points.slice(-MAX_RENDERED_HISTORY_POINTS)
  const pointNumberOffset = points.length - visiblePoints.length
  const len = visiblePoints.length
  visiblePoints.forEach((pt, index) => {
    const opacity = len > 1
      ? 0.08 + (index / (len - 1)) * 0.27
      : 0.35

    let speedInfo = ''
    let nextPt = visiblePoints[index + 1]
    if (index === len - 1 && intervalLocationState3d.lastPosition) {
      nextPt = intervalLocationState3d.lastPosition
    }

    if (nextPt) {
      const ptCartesian = Cartesian3.fromDegrees(pt.lng, pt.lat, 0)
      const nextCartesian = Cartesian3.fromDegrees(nextPt.lng, nextPt.lat, 0)
      const dist = Cartesian3.distance(ptCartesian, nextCartesian)
      const timeDiff = Math.abs(nextPt.timestamp - pt.timestamp) / 1000
      if (timeDiff > 0) {
        const speedMps = dist / timeDiff
        const speedKmh = speedMps * 3.6
        speedInfo = `<br>移动速度：${speedKmh.toFixed(1)} km/h (${speedMps.toFixed(1)} m/s)`
      }
    } else if (index > 0) {
      const prevPt = visiblePoints[index - 1]
      const ptCartesian = Cartesian3.fromDegrees(pt.lng, pt.lat, 0)
      const prevCartesian = Cartesian3.fromDegrees(prevPt.lng, prevPt.lat, 0)
      const dist = Cartesian3.distance(ptCartesian, prevCartesian)
      const timeDiff = Math.abs(pt.timestamp - prevPt.timestamp) / 1000
      if (timeDiff > 0) {
        const speedMps = dist / timeDiff
        const speedKmh = speedMps * 3.6
        speedInfo = `<br>移动速度：${speedKmh.toFixed(1)} km/h (${speedMps.toFixed(1)} m/s)`
      }
    }

    const timeStr = new Date(pt.timestamp).toLocaleTimeString()
    const descriptionHtml = `
      <div style="font-size: 13px; line-height: 1.5; color: #374151;">
        <strong style="color: #0f766e;">历史定位点 #${pointNumberOffset + index + 1}</strong><br>
        定位时间：${timeStr}<br>
        定位精度：${pt.accuracy ? Math.round(pt.accuracy) + ' 米' : '未知'}${speedInfo}
      </div>
    `

    const entity = viewer.entities.add({
      position: Cartesian3.fromDegrees(pt.lng, pt.lat, 4),
      point: {
        pixelSize: 10,
        color: Color.fromCssColorString('#0f766e').withAlpha(opacity),
        outlineColor: Color.WHITE.withAlpha(opacity + 0.1),
        outlineWidth: 1.5,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      name: `历史定位点 #${pointNumberOffset + index + 1}`,
      description: descriptionHtml
    })

    intervalLocationState3d.historyEntities.push(entity)
  })
}

export function flyToLngLat (viewer, lng, lat, options = {}) {
  if (!viewer) return
  const height = Number(options.height || 1200)
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lng, lat, height),
    orientation: {
      heading: CesiumMath.toRadians(Number(options.heading || 0)),
      pitch: CesiumMath.toRadians(Number(options.pitch || -90)),
      roll: 0,
    },
    duration: Number(options.duration || 1.1),
  })
}

export function addTargetMarker3d (viewer, location, options = {}) {
  if (!viewer || !location) return null
  if (targetEntity) {
    viewer.entities.remove(targetEntity)
    targetEntity = null
  }

  let pixelSizeVal = 13
  let sizeDirection = 1

  if (options.isInterval) {
    // 持续定位状态：使用 CallbackProperty 实现呼吸动画点
    const sizeCallback = new CallbackProperty(() => {
      pixelSizeVal += sizeDirection * 0.2
      if (pixelSizeVal >= 17) sizeDirection = -1
      if (pixelSizeVal <= 13) sizeDirection = 1
      return pixelSizeVal
    }, false)

    targetEntity = viewer.entities.add({
      position: Cartesian3.fromDegrees(location.lng, location.lat, 8),
      point: {
        pixelSize: sizeCallback,
        color: Color.fromCssColorString(options.color || '#0f766e'),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: options.label || '',
        font: '12px sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -20),
        show: Boolean(options.label),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      name: options.detailInfo ? (options.detailInfo.isInterval ? '设备追踪位置' : '当前定位位置') : '',
      description: options.detailInfo ? createLocationPopupContent3d(options.detailInfo) : '',
    })
  } else {
    // 常规状态为普通点
    targetEntity = viewer.entities.add({
      position: Cartesian3.fromDegrees(location.lng, location.lat, 8),
      point: {
        pixelSize: 13,
        color: Color.fromCssColorString(options.color || '#0f766e'),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: options.label || '',
        font: '12px sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -18),
        show: Boolean(options.label),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      name: options.detailInfo ? (options.detailInfo.isInterval ? '设备追踪位置' : '当前定位位置') : '',
      description: options.detailInfo ? createLocationPopupContent3d(options.detailInfo) : '',
    })
  }

  return targetEntity
}

function createLocationPopupContent3d (info) {
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

function waitForLocationRetry3d (signal, delay = 500) {
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

async function getFilteredPosition3d (viewer, geolocation, customHeight, isIntervalUpdate, retryCount = 0, runtime = {}) {
  const result = retryCount === 0 && runtime.position
    ? runtime.position
    : await getBestPosition(geolocation, { signal: runtime.signal })

  if (runtime.signal?.aborted) return null

  if (!isValidPosition(result)) {
    return null
  }

  const mapPosition = positionToGcj02(result)

  // 动态阈值同时考虑时间、精度和合理速度；连续两个一致的新位置可以
  // 自动重定基准，避免高速/隧道恢复后被旧 200 米阈值永久锁死。
  if (isIntervalUpdate && intervalLocationState3d.lastPosition) {
    const locationSample = {
      lat: mapPosition.lat,
      lng: mapPosition.lng,
      accuracy: result.accuracy,
      timestamp: Number.isFinite(Number(result.timestamp)) ? Number(result.timestamp) : Date.now(),
    }
    const assessment = assessPositionSample({
      lastAccepted: intervalLocationState3d.lastPosition.locationSample,
      suspect: intervalLocationState3d.suspectPosition,
    }, locationSample, {
      defaultIntervalMs: intervalLocationState3d.intervalSeconds * 1000,
    })

    intervalLocationState3d.suspectPosition = assessment.suspect
    if (!assessment.accepted) {
      console.warn(`[3D 定位] 隔离疑似漂移点：距旧点 ${Math.round(assessment.distanceMeters || 0)} 米，动态允许 ${Math.round(assessment.allowedDistanceMeters || 0)} 米`)
      if (retryCount === 0) {
        const shouldRetry = await waitForLocationRetry3d(runtime.signal)
        if (shouldRetry) {
          return getFilteredPosition3d(viewer, geolocation, customHeight, isIntervalUpdate, 1, {
            ...runtime,
            position: null,
          })
        }
      }
      return null
    }

    intervalLocationState3d.suspectPosition = null
    if (assessment.reanchored) {
      console.info('[3D 定位] 连续新位置已确认，自动重新建立轨迹基准')
    }
    return { result, mapPosition, locationSample, reanchored: assessment.reanchored }
  }

  return {
    result,
    mapPosition,
    locationSample: {
      lat: mapPosition.lat,
      lng: mapPosition.lng,
      accuracy: result.accuracy,
      timestamp: Number.isFinite(Number(result.timestamp)) ? Number(result.timestamp) : Date.now(),
    },
    reanchored: false,
  }
}

export async function updatePosition3d (viewer, geolocation = null, customHeight = 1200, isIntervalUpdate = false, runtime = {}) {
  if (!isIntervalUpdate) {
    updateLocationStatusBar3d('正在定位...')
  }

  let filtered = null
  try {
    filtered = await getFilteredPosition3d(viewer, geolocation, customHeight, isIntervalUpdate, 0, runtime)
  } catch (err) {
    if (!runtime.signal?.aborted) {
      console.error(`获取地理位置失败（${String(err?.code || err?.name || 'unknown')}）`)
    }
  }

  if (!filtered) {
    if (!isIntervalUpdate && !runtime.signal?.aborted) {
      updateLocationStatusBar3d('定位失败')
      await showAlert('获取地理位置失败，请手动选择')
    }
    return false
  }

  if (runtime.signal?.aborted) return false

  const { result, mapPosition, locationSample, reanchored } = filtered
  
  // 飞往位置（开启自动旋转时代入最新计算出的航向角）
  const headingVal = intervalLocationState3d.autoRotate ? (intervalLocationState3d.currentHeading || 0) : 0
  flyToLngLat(viewer, mapPosition.lng, mapPosition.lat, { height: customHeight, heading: headingVal })

  if (isIntervalUpdate) {
    let isStationary = false
    if (intervalLocationState3d.lastPosition) {
      const ptCartesian = Cartesian3.fromDegrees(intervalLocationState3d.lastPosition.lng, intervalLocationState3d.lastPosition.lat, 0)
      const nextCartesian = Cartesian3.fromDegrees(mapPosition.lng, mapPosition.lat, 0)
      const dist = Cartesian3.distance(ptCartesian, nextCartesian)
      if (dist < 10) {
        isStationary = true
      }
    }

    if (isStationary) {
      // 移动幅度小，不生产新轨迹点，但累计在当前位置的停留时间
      const currentPosition = intervalLocationState3d.lastPosition
      if (!Number.isFinite(currentPosition.firstTimestamp)) {
        currentPosition.firstTimestamp = currentPosition.timestamp
      }
      currentPosition.lng = mapPosition.lng
      currentPosition.lat = mapPosition.lat
      currentPosition.timestamp = locationSample.timestamp
      currentPosition.accuracy = result.accuracy
      currentPosition.locationSample = locationSample
      currentPosition.reanchored = reanchored
      currentPosition.staySeconds = Math.max(
        0,
        (locationSample.timestamp - currentPosition.firstTimestamp) / 1000,
      )
      captureTrackPosition3d({ replaceLast: true })

      const detailInfo = {
        isInterval: true,
        lat: mapPosition.lat,
        lng: mapPosition.lng,
        rawLat: result.lat,
        rawLng: result.lng,
        accuracy: result.accuracy,
        source: result.source,
        timestamp: locationSample.timestamp,
        staySeconds: currentPosition.staySeconds,
      }

      // 主定位点重新在该坐标触发扩散波纹
      addTargetMarker3d(viewer, mapPosition, { label: '', isInterval: true, detailInfo })
      triggerRipple3d(viewer, mapPosition)
      updateLocationStatusBar3d('持续定位中', result.accuracy, locationSample.timestamp)
      addPanelHistoryRecord3d({
        timestamp: locationSample.timestamp,
        accuracy: result.accuracy,
        staySeconds: currentPosition.staySeconds
      }, true)

      if (intervalLocationState3d.recordTrack) persistTrack3d()
    } else {
      // 移动幅度大，生产新点
      if (intervalLocationState3d.lastPosition) {
        if (!Number.isFinite(intervalLocationState3d.lastPosition.firstTimestamp)) {
          intervalLocationState3d.lastPosition.firstTimestamp = intervalLocationState3d.lastPosition.timestamp
        }
        if (!intervalLocationState3d.lastPosition.staySeconds) {
          intervalLocationState3d.lastPosition.staySeconds = 0
        }

        // 自动计算旋转偏角
        if (intervalLocationState3d.autoRotate && !reanchored) {
          const p1 = intervalLocationState3d.lastPosition
          const p2 = mapPosition
          if (p1 && typeof p1.lng === 'number' && typeof p1.lat === 'number') {
            const ptCartesian = Cartesian3.fromDegrees(p1.lng, p1.lat, 0)
            const nextCartesian = Cartesian3.fromDegrees(p2.lng, p2.lat, 0)
            const dist = Cartesian3.distance(ptCartesian, nextCartesian)
            // 大于 2 米位移才触发视角转向，防止静止抖动带来的方向瞬变
            if (dist > 2) {
              const brng = calculateBearing(p1.lat, p1.lng, p2.lat, p2.lng)
              intervalLocationState3d.currentHeading = brng
              console.log(`[3D Rotate] Heading updated to ${brng} deg`)
            }
          }
        }

        intervalLocationState3d.historyPoints.push(intervalLocationState3d.lastPosition)

        trimTrackPointHistory(intervalLocationState3d.historyPoints, intervalLocationState3d.maxHistoryPoints)
      }

      intervalLocationState3d.lastPosition = {
        lng: mapPosition.lng,
        lat: mapPosition.lat,
        timestamp: locationSample.timestamp,
        firstTimestamp: locationSample.timestamp,
        staySeconds: 0,
        accuracy: result.accuracy,
        locationSample,
        reanchored,
      }
      captureTrackPosition3d()

      // 绘制 3D 轨迹点
      renderHistoryPoints3d(viewer, intervalLocationState3d.historyPoints)

      let speed = ''
      if (intervalLocationState3d.historyPoints.length > 0) {
        const pt = intervalLocationState3d.historyPoints[intervalLocationState3d.historyPoints.length - 1]
        const ptCartesian = Cartesian3.fromDegrees(mapPosition.lng, mapPosition.lat, 0)
        const prevCartesian = Cartesian3.fromDegrees(pt.lng, pt.lat, 0)
        const dist = Cartesian3.distance(ptCartesian, prevCartesian)
        const timeDiff = Math.abs(locationSample.timestamp - pt.timestamp) / 1000
        if (timeDiff > 0) {
          const speedMps = dist / timeDiff
          const speedKmh = speedMps * 3.6
          speed = `${speedKmh.toFixed(1)} km/h (${speedMps.toFixed(1)} m/s)`
        }
      }

      const detailInfo = {
        isInterval: true,
        lat: mapPosition.lat,
        lng: mapPosition.lng,
        rawLat: result.lat,
        rawLng: result.lng,
        accuracy: result.accuracy,
        source: result.source,
        timestamp: locationSample.timestamp,
        staySeconds: 0,
        speed,
      }

      // 创建带呼吸的定位点及生成瞬间波纹 Entity
      addTargetMarker3d(viewer, mapPosition, { label: '', isInterval: true, detailInfo })
      triggerRipple3d(viewer, mapPosition)
      updateLocationStatusBar3d('持续定位中', result.accuracy, locationSample.timestamp)
      addPanelHistoryRecord3d({
        timestamp: locationSample.timestamp,
        accuracy: result.accuracy,
        staySeconds: 0
      }, false)

      if (intervalLocationState3d.recordTrack) persistTrack3d()
    }
  } else {
    const detailInfo = {
      isInterval: false,
      lat: mapPosition.lat,
      lng: mapPosition.lng,
      rawLat: result.lat,
      rawLng: result.lng,
      accuracy: result.accuracy,
      source: result.source,
      timestamp: locationSample.timestamp,
    }
    // 普通点定位
    addTargetMarker3d(viewer, mapPosition, { label: '当前位置', isInterval: false, detailInfo })
    updateLocationStatusBar3d('已定位', result.accuracy, locationSample.timestamp)
    addPanelHistoryRecord3d({
      timestamp: locationSample.timestamp,
      accuracy: result.accuracy,
      staySeconds: 0
    }, false)
  }
  return true
}

let intervalLocationController3d = null

function persistLocationSettings3d () {
  try {
    localStorage.setItem('location_interval', String(intervalLocationState3d.intervalSeconds))
    localStorage.setItem('location_zoom', String(intervalLocationState3d.zoomLevel))
    localStorage.setItem('location_max_points', String(intervalLocationState3d.maxHistoryPoints))
    localStorage.setItem('location_record_track', String(intervalLocationState3d.recordTrack))
    localStorage.setItem('location_only_line', String(intervalLocationState3d.onlyLine))
    localStorage.setItem('location_auto_rotate', String(intervalLocationState3d.autoRotate))
  } catch (err) {
    console.error('保存定位设置失败', err)
  }
}

function emitContinuousLocationState3d (snapshot) {
  if (typeof window?.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return
  window.dispatchEvent(new CustomEvent('continuous-location-statechange', {
    detail: { mode: '3d', ...snapshot },
  }))
}

function syncControllerState3d (snapshot) {
  const previousPhase = intervalLocationState3d.phase
  intervalLocationState3d.active = snapshot.desiredActive
  intervalLocationState3d.phase = snapshot.phase
  intervalLocationState3d.generation = snapshot.generation
  intervalLocationState3d.lastSignalAt = snapshot.lastSignalAt
  intervalLocationState3d.lastFixAt = snapshot.lastFixAt
  intervalLocationState3d.lastProviderTimestamp = snapshot.lastProviderTimestamp
  intervalLocationState3d.consecutiveTimestampAnomalies = snapshot.consecutiveTimestampAnomalies
  intervalLocationState3d.consecutiveFailures = snapshot.consecutiveFailures
  intervalLocationState3d.restartCount = snapshot.restartCount
  intervalLocationState3d.lastError = snapshot.lastError
  intervalLocationState3d.permissionState = snapshot.permissionState
  intervalLocationState3d.timerId = null

  if (intervalLocationState3d.recordTrack &&
      snapshot.phase === 'suspended' && previousPhase !== 'suspended' &&
      (intervalLocationState3d.lastPosition || intervalLocationState3d.historyPoints.length > 0)) {
    persistTrack3d({ force: true })
  }
  emitContinuousLocationState3d(snapshot)

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
    updateLocationStatusBar3d()
  } else {
    const lastPos = intervalLocationState3d.lastPosition
    if (lastPos) {
      updateLocationStatusBar3d(statusText, lastPos.accuracy, lastPos.timestamp)
    } else {
      updateLocationStatusBar3d(statusText)
    }
  }
}

export function configureIntervalLocation3d (viewer, {
  interval,
  zoom,
  maxHistoryPoints = intervalLocationState3d.maxHistoryPoints,
  recordTrack = intervalLocationState3d.recordTrack,
  onlyLine = intervalLocationState3d.onlyLine,
  autoRotate = intervalLocationState3d.autoRotate,
}) {
  const wasRecording = intervalLocationState3d.recordTrack
  let finalPersistSucceeded = wasRecording && !recordTrack &&
    hasTrackRecordingData(intervalLocationState3d.recordingSession)
    ? persistTrack3d({ force: true })
    : true

  const normalizedMaxHistoryPoints = normalizeHistoryPointLimit(maxHistoryPoints)

  intervalLocationState3d.intervalSeconds = interval
  intervalLocationState3d.zoomLevel = zoom
  intervalLocationState3d.maxHistoryPoints = normalizedMaxHistoryPoints
  intervalLocationState3d.recordTrack = recordTrack
  intervalLocationState3d.onlyLine = onlyLine
  intervalLocationState3d.autoRotate = autoRotate

  const historyTrimmed = trimTrackPointHistory(
    intervalLocationState3d.historyPoints,
    normalizedMaxHistoryPoints,
  )
  trimTrackRecordingSession(
    intervalLocationState3d.recordingSession,
    normalizedMaxHistoryPoints,
  )
  if (historyTrimmed) renderHistoryPoints3d(viewer, intervalLocationState3d.historyPoints)

  if (wasRecording && !recordTrack) {
    stopTrackRecording3d()
  } else if (!wasRecording && recordTrack) {
    startTrackRecording3d()
    resetTrackPersistBackoff3d()
  }
  persistLocationSettings3d()

  if (recordTrack) {
    finalPersistSucceeded = persistTrack3d({ force: true }) && finalPersistSucceeded
  }
  intervalLocationController3d?.configure({ intervalMs: interval * 1000 })
  return { ...intervalLocationState3d, finalPersistSucceeded }
}

// 启动 3D 持续定位
export function startIntervalLocation3d (viewer, geolocation, interval, zoom, maxHistoryPoints = 0, recordTrack = false, onlyLine = false, autoRotate = false) {
  intervalLocationController3d?.destroy()
  intervalLocationController3d = null

  intervalLocationState3d.intervalSeconds = interval
  intervalLocationState3d.zoomLevel = zoom
  intervalLocationState3d.maxHistoryPoints = normalizeHistoryPointLimit(maxHistoryPoints)
  intervalLocationState3d.recordTrack = recordTrack
  intervalLocationState3d.onlyLine = onlyLine
  intervalLocationState3d.autoRotate = autoRotate
  intervalLocationState3d.currentHeading = 0
  intervalLocationState3d.lastTrackPersistAt = 0
  intervalLocationState3d.persistenceError = null
  clearTrackKmlSession3d()

  intervalLocationState3d.lastPosition = null
  intervalLocationState3d.suspectPosition = null
  intervalLocationState3d.historyPoints = []
  resetTrackRecordingSession(intervalLocationState3d.recordingSession, { active: recordTrack })
  persistLocationSettings3d()
  if (recordTrack) ensureTrackKml3d()

  intervalLocationState3d.historyEntities.forEach(ent => viewer.entities.remove(ent))
  intervalLocationState3d.historyEntities = []

  void startLocationKeepAlive()

  const source = createContinuousGeolocationSource(geolocation)
  intervalLocationController3d = createContinuousLocationController({
    source,
    lifecycle: createLocationLifecycleTarget(),
    intervalMs: interval * 1000,
    positionOptions: {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    },
    onPosition: (position, runtime) => {
      const currentHeight = 20000000.0 / Math.pow(2, intervalLocationState3d.zoomLevel)
      return updatePosition3d(
        viewer,
        geolocation,
        currentHeight,
        true,
        { ...runtime, position },
      )
    },
    onStateChange: syncControllerState3d,
  })
  intervalLocationController3d.start()
}

// 停止 3D 持续定位
export function stopIntervalLocation3d (viewer) {
  intervalLocationController3d?.stop()
  intervalLocationController3d?.destroy()
  intervalLocationController3d = null

  // 停止定位时做最后的 KML 写入，必须确保当前内存中存在至少一个定位点或历史点，防止刷新页面后由于内存清空而覆盖擦除已有的 KML 轨迹数据
  const recorded = getTrackRecordingPoints(intervalLocationState3d.recordingSession)
  let finalPersistSucceeded = true
  const hasRecordedData = recorded.segments.length > 0 ||
    recorded.historyPoints.length > 0 || recorded.lastPosition !== null
  const needsFinalPersist = hasRecordedData && (
    intervalLocationState3d.recordTrack ||
    Boolean(intervalLocationState3d.persistenceError) ||
    !hasTrackKml3d(intervalLocationState3d.recordKmlId)
  )
  if (needsFinalPersist) {
    finalPersistSucceeded = persistTrack3d({ force: true })
  }
  const finalPersistenceError = finalPersistSucceeded ? null : intervalLocationState3d.persistenceError

  // 停止音频后台保活并释放 Wake Lock
  stopLocationKeepAlive()

  intervalLocationState3d.active = false
  intervalLocationState3d.phase = 'idle'
  clearTrackKmlSession3d()
  intervalLocationState3d.lastPosition = null
  intervalLocationState3d.suspectPosition = null
  resetTrackRecordingSession(intervalLocationState3d.recordingSession)

  intervalLocationState3d.historyEntities.forEach(ent => viewer.entities.remove(ent))
  intervalLocationState3d.historyEntities = []
  intervalLocationState3d.historyPoints = []

  // 重新绘制普通定位点
  if (targetEntity) {
    const pos = targetEntity.position.getValue(viewer.clock.currentTime)
    if (pos) {
      const carto = viewer.scene.globe.ellipsoid.cartesianToCartographic(pos)
      const lng = CesiumMath.toDegrees(carto.longitude)
      const lat = CesiumMath.toDegrees(carto.latitude)
      addTargetMarker3d(viewer, { lng, lat }, { label: '当前位置', isInterval: false })
    }
  }

  return {
    finalPersistSucceeded,
    persistenceError: finalPersistenceError,
  }
}

export function updateLocationStatusBar3d (statusText, accuracy, timestamp) {
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

export const panelHistoryList3d = []

export function renderHistoryTable3d () {
  const tbody = document.getElementById('history-table-body')
  if (!tbody) return

  if (panelHistoryList3d.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8; padding: 12px 8px;">暂无定位数据</td></tr>'
    return
  }

  // 最近的排在最前
  const rows = [...panelHistoryList3d].reverse().map(item => {
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

export function initLocationHistoryPanel3d () {
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
        renderHistoryTable3d()
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

export function addPanelHistoryRecord3d (item, replaceLast = false) {
  if (replaceLast && panelHistoryList3d.length > 0) {
    const last = panelHistoryList3d[panelHistoryList3d.length - 1]
    last.timestamp = item.timestamp
    last.accuracy = item.accuracy
    last.staySeconds = item.staySeconds
  } else {
    panelHistoryList3d.push({
      timestamp: item.timestamp,
      accuracy: item.accuracy,
      staySeconds: item.staySeconds || 0
    })
    if (panelHistoryList3d.length > 100) {
      panelHistoryList3d.shift()
    }
  }

  const panel = document.getElementById('location-history-panel')
  if (panel && !panel.hasAttribute('hidden')) {
    renderHistoryTable3d()
  }
}
