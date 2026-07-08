import {
  Cartesian2,
  Cartesian3,
  Color,
  HeightReference,
  LabelStyle,
  VerticalOrigin,
  Math as CesiumMath,
  CallbackProperty,
} from 'cesium'
import { getBestPosition, isValidPosition, positionToGcj02 } from '../map/geolocation.js'
import { createTrackKml3d, updateTrackKml3d } from './kml.js'

let targetEntity = null

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

// Audio keep alive and Screen Wake Lock for mobile background processes
let keepAliveAudio = null
let wakeLock = null
let fallbackVideo = null

async function requestWakeLock () {
  // 优先使用标准 Screen Wake Lock API
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      console.log('[WakeLock 3D] Screen Wake Lock API is active')
      return
    } catch (err) {
      console.warn(`[WakeLock 3D] Screen Wake Lock API failed: ${err.message}, falling back to video.`)
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
    console.log('[WakeLock 3D] Screen Wake Lock fallback video is playing')
  }).catch(err => {
    console.warn('[WakeLock 3D] Fallback video play blocked', err)
  })
}

function releaseWakeLock () {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null
      console.log('[WakeLock 3D] Screen Wake Lock API was released')
    }).catch(err => {
      console.warn(`[WakeLock 3D] Failed to release Screen Wake Lock API: ${err.message}`)
    })
  }

  if (fallbackVideo) {
    fallbackVideo.pause()
    console.log('[WakeLock 3D] Screen Wake Lock fallback video was paused')
  }
}

// 自动在亮屏/切回前台时重新请求被浏览器自动释放的 Wake Lock
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && intervalLocationState3d.active) {
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

// 3D 持续定位全局状态
export const intervalLocationState3d = {
  active: false,
  timerId: null,
  intervalSeconds: parseInt(localStorage.getItem('location_interval') || '10', 10),
  zoomLevel: parseInt(localStorage.getItem('location_zoom') || '18', 10),
  maxHistoryPoints: parseInt(localStorage.getItem('location_max_points') || '0', 10),
  recordTrack: localStorage.getItem('location_record_track') === 'true', // 是否开启轨迹记录
  onlyLine: localStorage.getItem('location_only_line') === 'true', // 是否仅保留路线
  autoRotate: localStorage.getItem('location_auto_rotate') === 'true', // 是否自动旋转地图
  currentHeading: 0, // 当前运行时的车头朝向航向角 (0-360)
  recordKmlId: localStorage.getItem('location_record_kml_id') || null, // 绑定的 KML ID
  lastPosition: null, // 存储最新的定位点数据 { lng, lat, timestamp, accuracy }
  historyPoints: [],  // 最近 3-5 次轨迹数据
  historyEntities: [] // 渲染在 3D 地图上的实体集合
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
      material: colorCallback,
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

  const len = points.length
  points.forEach((pt, index) => {
    const opacity = len > 1
      ? 0.08 + (index / (len - 1)) * 0.27
      : 0.35

    let speedInfo = ''
    let nextPt = points[index + 1]
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
      const prevPt = points[index - 1]
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
        <strong style="color: #0f766e;">历史定位点 #${index + 1}</strong><br>
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
      name: `历史定位点 #${index + 1}`,
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
    })
  }

  return targetEntity
}

async function getFilteredPosition3d (viewer, geolocation, customHeight, isIntervalUpdate, retryCount = 0) {
  const result = await getBestPosition(geolocation).catch((err) => {
    console.error('获取地理位置失败', err)
    return null
  })

  if (!isValidPosition(result)) {
    return null
  }

  const mapPosition = positionToGcj02(result)

  // 仅在持续定位且有上一轨迹点时，过滤突变大（>200米）的漂移脏点
  if (isIntervalUpdate && intervalLocationState3d.lastPosition) {
    const ptCartesian = Cartesian3.fromDegrees(intervalLocationState3d.lastPosition.lng, intervalLocationState3d.lastPosition.lat, 0)
    const nextCartesian = Cartesian3.fromDegrees(mapPosition.lng, mapPosition.lat, 0)
    const dist = Cartesian3.distance(ptCartesian, nextCartesian)

    if (dist > 200) {
      console.warn(`[3D 定位] 检测到可能的漂移脏点，距离上一点 ${Math.round(dist)} 米`)
      if (retryCount === 0) {
        console.log('[3D 定位] 立即进行重试定位一次...')
        await new Promise(resolve => setTimeout(resolve, 500))
        return await getFilteredPosition3d(viewer, geolocation, customHeight, isIntervalUpdate, 1)
      } else {
        console.warn('[3D 定位] 重试后依然偏差过大，丢弃该定位点')
        return null
      }
    }
  }

  return { result, mapPosition }
}

export async function updatePosition3d (viewer, geolocation = null, customHeight = 1200, isIntervalUpdate = false) {
  const filtered = await getFilteredPosition3d(viewer, geolocation, customHeight, isIntervalUpdate)

  if (!filtered) {
    if (!isIntervalUpdate) {
      await showAlert('获取地理位置失败，请手动选择')
    }
    return
  }

  const { result, mapPosition } = filtered
  
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
      const now = Date.now()
      if (!intervalLocationState3d.lastPosition.firstTimestamp) {
        intervalLocationState3d.lastPosition.firstTimestamp = intervalLocationState3d.lastPosition.timestamp
      }
      intervalLocationState3d.lastPosition.staySeconds = (now - intervalLocationState3d.lastPosition.firstTimestamp) / 1000

      // 主定位点重新在该坐标触发扩散波纹
      addTargetMarker3d(viewer, mapPosition, { label: '当前位置', isInterval: true })
      triggerRipple3d(viewer, mapPosition)

      // 实时同步停留时间到 KML 中
      if (intervalLocationState3d.recordTrack) {
        if (!intervalLocationState3d.recordKmlId) {
          const now = new Date()
          const name = `轨迹_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
          const kmlId = createTrackKml3d(name)
          if (kmlId) {
            intervalLocationState3d.recordKmlId = kmlId
            localStorage.setItem('location_record_kml_id', kmlId)
          }
        }
        if (intervalLocationState3d.recordKmlId) {
          updateTrackKml3d(intervalLocationState3d.recordKmlId, intervalLocationState3d.historyPoints, intervalLocationState3d.lastPosition, intervalLocationState3d.onlyLine)
        }
      }
      // 移动幅度大，生产新点
      if (intervalLocationState3d.lastPosition) {
        if (!intervalLocationState3d.lastPosition.firstTimestamp) {
          intervalLocationState3d.lastPosition.firstTimestamp = intervalLocationState3d.lastPosition.timestamp
        }
        if (!intervalLocationState3d.lastPosition.staySeconds) {
          intervalLocationState3d.lastPosition.staySeconds = 0
        }

        // 自动计算旋转偏角
        if (intervalLocationState3d.autoRotate) {
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

        const maxPts = intervalLocationState3d.maxHistoryPoints || 0
        if (maxPts > 0 && intervalLocationState3d.historyPoints.length > maxPts) {
          intervalLocationState3d.historyPoints.shift()
        }
      }

      intervalLocationState3d.lastPosition = {
        lng: mapPosition.lng,
        lat: mapPosition.lat,
        timestamp: Date.now(),
        firstTimestamp: Date.now(),
        staySeconds: 0,
        accuracy: result.accuracy
      }

      // 绘制 3D 轨迹点
      renderHistoryPoints3d(viewer, intervalLocationState3d.historyPoints)

      // 创建带呼吸的定位点及生成瞬间波纹 Entity
      addTargetMarker3d(viewer, mapPosition, { label: '当前位置', isInterval: true })
      triggerRipple3d(viewer, mapPosition)

      // 实时同步新点位到 KML 中
      if (intervalLocationState3d.recordTrack) {
        if (!intervalLocationState3d.recordKmlId) {
          const now = new Date()
          const name = `轨迹_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
          const kmlId = createTrackKml3d(name)
          if (kmlId) {
            intervalLocationState3d.recordKmlId = kmlId
            localStorage.setItem('location_record_kml_id', kmlId)
          }
        }
        if (intervalLocationState3d.recordKmlId) {
          updateTrackKml3d(intervalLocationState3d.recordKmlId, intervalLocationState3d.historyPoints, intervalLocationState3d.lastPosition, intervalLocationState3d.onlyLine)
        }
      }
    }
  } else {
    // 普通点定位
    addTargetMarker3d(viewer, mapPosition, { label: '当前位置', isInterval: false })
  }
}

// 启动 3D 持续定位
export function startIntervalLocation3d (viewer, geolocation, interval, zoom, maxHistoryPoints = 0, recordTrack = false, onlyLine = false, autoRotate = false) {
  if (intervalLocationState3d.timerId) {
    clearInterval(intervalLocationState3d.timerId)
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

  const height = 20000000.0 / Math.pow(2, zoom)

  intervalLocationState3d.active = true
  intervalLocationState3d.intervalSeconds = interval
  intervalLocationState3d.zoomLevel = zoom
  intervalLocationState3d.maxHistoryPoints = maxHistoryPoints
  intervalLocationState3d.recordTrack = recordTrack
  intervalLocationState3d.onlyLine = onlyLine
  intervalLocationState3d.autoRotate = autoRotate
  intervalLocationState3d.currentHeading = 0

  // 仅在首次启动时重新创建 KML 文件；如果中途编辑/重连则继续使用现有的 recordKmlId
  if (recordTrack && !intervalLocationState3d.recordKmlId) {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const date = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const defaultName = `轨迹_${year}${month}${date}_${hours}${minutes}`
    
    const kmlId = createTrackKml3d(defaultName)
    if (kmlId) {
      intervalLocationState3d.recordKmlId = kmlId
      localStorage.setItem('location_record_kml_id', kmlId)
    }
  }

  intervalLocationState3d.lastPosition = null
  intervalLocationState3d.historyPoints = []

  intervalLocationState3d.historyEntities.forEach(ent => viewer.entities.remove(ent))
  intervalLocationState3d.historyEntities = []

  // 启动音频后台保活与防止暗屏休眠的 Wake Lock
  startKeepAlive()
  requestWakeLock()

  // 立即进行首次定位
  updatePosition3d(viewer, geolocation, height, true)

  intervalLocationState3d.timerId = setInterval(() => {
    const currentHeight = 20000000.0 / Math.pow(2, intervalLocationState3d.zoomLevel)
    updatePosition3d(viewer, geolocation, currentHeight, true)
  }, interval * 1000)
}

// 停止 3D 持续定位
export function stopIntervalLocation3d (viewer) {
  if (intervalLocationState3d.timerId) {
    clearInterval(intervalLocationState3d.timerId)
    intervalLocationState3d.timerId = null
  }

  // 停止定位时做最后的 KML 写入（保存最后一个点位到 KML）
  if (intervalLocationState3d.recordTrack && intervalLocationState3d.recordKmlId) {
    updateTrackKml3d(intervalLocationState3d.recordKmlId, intervalLocationState3d.historyPoints, intervalLocationState3d.lastPosition, intervalLocationState3d.onlyLine)
  }

  // 停止音频后台保活并释放 Wake Lock
  stopKeepAlive()
  releaseWakeLock()

  intervalLocationState3d.active = false
  intervalLocationState3d.recordKmlId = null
  localStorage.removeItem('location_record_kml_id')
  intervalLocationState3d.lastPosition = null
  
  // 视口归正
  const headingToReset = 0
  intervalLocationState3d.currentHeading = headingToReset

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
}

