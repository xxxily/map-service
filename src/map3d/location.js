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
import { showAlert } from '../ui/dialog.js'
import { getBestPosition, isValidPosition, positionToGcj02 } from '../map/geolocation.js'

let targetEntity = null

// Audio keep alive for background processes on mobile
let keepAliveAudio = null

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

export async function updatePosition3d (viewer, geolocation = null, customHeight = 1200, isIntervalUpdate = false) {
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

  const mapPosition = positionToGcj02(result)
  
  // 飞往位置
  flyToLngLat(viewer, mapPosition.lng, mapPosition.lat, { height: customHeight })

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
    } else {
      // 移动幅度大，生产新点
      if (intervalLocationState3d.lastPosition) {
        if (!intervalLocationState3d.lastPosition.firstTimestamp) {
          intervalLocationState3d.lastPosition.firstTimestamp = intervalLocationState3d.lastPosition.timestamp
        }
        if (!intervalLocationState3d.lastPosition.staySeconds) {
          intervalLocationState3d.lastPosition.staySeconds = 0
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
    }
  } else {
    // 普通点定位
    addTargetMarker3d(viewer, mapPosition, { label: '当前位置', isInterval: false })
  }
}

// 启动 3D 持续定位
export function startIntervalLocation3d (viewer, geolocation, interval, zoom, maxHistoryPoints = 0) {
  if (intervalLocationState3d.timerId) {
    clearInterval(intervalLocationState3d.timerId)
  }

  // 记录到 localStorage 以便持久化记忆
  try {
    localStorage.setItem('location_interval', String(interval))
    localStorage.setItem('location_zoom', String(zoom))
    localStorage.setItem('location_max_points', String(maxHistoryPoints))
  } catch (err) {
    console.error('Failed to save location settings:', err)
  }

  const height = 20000000.0 / Math.pow(2, zoom)

  intervalLocationState3d.active = true
  intervalLocationState3d.intervalSeconds = interval
  intervalLocationState3d.zoomLevel = zoom
  intervalLocationState3d.maxHistoryPoints = maxHistoryPoints
  intervalLocationState3d.lastPosition = null
  intervalLocationState3d.historyPoints = []

  intervalLocationState3d.historyEntities.forEach(ent => viewer.entities.remove(ent))
  intervalLocationState3d.historyEntities = []

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

  // 停止音频后台保活
  stopKeepAlive()

  intervalLocationState3d.active = false
  intervalLocationState3d.lastPosition = null

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

