import AMapLoader from '@amap/amap-jsapi-loader'
import L from 'leaflet'
import 'leaflet-rotate'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { amapConfig } from './config.js'
import { initLayerControl, setLayerControlVisible } from './map/layers.js'
import { initAmapGeolocation } from './map/geolocation.js'
import {
  addTargetMarker,
  updatePosition,
  intervalLocationState,
  startIntervalLocation2d,
  stopIntervalLocation2d
} from './map/location.js'
import { showChoiceDialog, showEditDialog, showAlert } from './ui/dialog.js'
import { initAmapSearch, toggleSearchMode } from './map/search.js'
import { parseDefaultView, writeMapViewToUrl } from './map/url-state.js'
import { initAdminApp } from './admin/dashboard.js'
import { isAdminLocation } from './admin/routes.js'
import { registerServiceWorker } from './pwa.js'
import { initKmlSupport } from './map/kml.js'
import { initGuidelines, toggleGuidelineMode } from './map/guidelines.js'
import { initAfterAccessCheck } from './map/access-control.js'

// 优化移动端手势缩放时容易误触旋转的问题：加入旋转阈值(12度)与无缝软启动交互
if (L.Map.TouchGestures) {
  const originalTouchStart = L.Map.TouchGestures.prototype._onTouchStart
  L.Map.TouchGestures.prototype._onTouchStart = function (e) {
    originalTouchStart.call(this, e)
    this._rotationThresholdTriggered = false
  }

  L.Map.TouchGestures.prototype._onTouchMove = function (e) {
    if (!e.touches || e.touches.length !== 2 || !(this._zooming || this._rotating)) { return }

    const map = this._map
    const p1 = map.mouseEventToContainerPoint(e.touches[0])
    const p2 = map.mouseEventToContainerPoint(e.touches[1])
    const vector = p1.subtract(p2)
    const scale = p1.distanceTo(p2) / this._startDist
    let delta

    if (this._rotating) {
      const theta = Math.atan(vector.x / vector.y)
      let bearingDelta = (theta - this._startTheta) * L.DomUtil.RAD_TO_DEG
      if (vector.y < 0) { bearingDelta += 180 }

      // 旋转角度阈值（度），只有两指旋转超过此角度才触发旋转，防止单纯捏合放大缩小时误触
      const ROTATION_THRESHOLD = 30
      if (!this._rotationThresholdTriggered) {
        let normalizedDelta = bearingDelta
        while (normalizedDelta > 180) normalizedDelta -= 360
        while (normalizedDelta < -180) normalizedDelta += 360

        if (Math.abs(normalizedDelta) >= ROTATION_THRESHOLD) {
          this._rotationThresholdTriggered = true
          // 首次触发时重新锁定起始角度（软启动），防止画面发生角度突变跳跃，提供丝滑体验
          this._startTheta = theta
          if (vector.y < 0) {
            this._startBearing = map.getBearing() + 180
          } else {
            this._startBearing = map.getBearing()
          }
          bearingDelta = 0
        }
      }

      if (this._rotationThresholdTriggered && bearingDelta) {
        map.setBearing(this._startBearing - bearingDelta)
      }
    }

    if (this._zooming) {
      this._zoom = map.getScaleZoom(scale, this._startZoom)

      if (!map.options.bounceAtZoomLimits && (
        (this._zoom < map.getMinZoom() && scale < 1) ||
        (this._zoom > map.getMaxZoom() && scale > 1))) {
        this._zoom = map._limitZoom(this._zoom)
      }

      if (map.options.touchZoom === 'center') {
        this._center = this._startLatLng
        if (scale === 1) { return }
      } else {
        delta = p1._add(p2)._divideBy(2)._subtract(this._centerPoint)
        if (scale === 1 && delta.x === 0 && delta.y === 0) { return }

        const alpha = -map.getBearing() * L.DomUtil.DEG_TO_RAD
        this._center = map.unproject(map.project(this._pinchStartLatLng).subtract(delta.rotate(alpha)))
      }
    }

    if (!this._moved) {
      map._moveStart(true, false)
      this._moved = true
    }

    L.Util.cancelAnimFrame(this._animRequest)

    const moveFn = map._move.bind(map, this._center, this._zoom, { pinch: true, round: false }, undefined)
    this._animRequest = L.Util.requestAnimFrame(moveFn, this, true)

    L.DomEvent.preventDefault(e)
  }
}

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

function renderAppVersion () {
  const versionNode = document.getElementById('app-version')
  if (versionNode && APP_VERSION) {
    versionNode.textContent = `v${APP_VERSION}`
  }
}

async function loadAmap () {
  window._AMapSecurityConfig = {
    securityJsCode: amapConfig.securityJsCode,
  }

  return AMapLoader.load({
    key: amapConfig.key,
    version: '2.0',
    plugins: amapConfig.plugins,
  }).catch((err) => {
    console.warn('高德 JSAPI 加载失败，搜索功能不可用', err)
    return null
  })
}

function initDesktopShiftDragRotate (map) {
  if (!(map.setBearing instanceof Function)) return

  const container = map.getContainer()
  let rotateState = null

  const stopRotate = () => {
    if (!rotateState) return
    if (rotateState.wasDraggingEnabled && map.dragging?.enable instanceof Function) {
      map.dragging.enable()
    }
    container.classList.remove('map-shift-rotating')
    rotateState = null
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  const onMouseMove = (event) => {
    if (!rotateState) return
    event.preventDefault()
    const deltaX = event.clientX - rotateState.startX
    map.setBearing(rotateState.startBearing + deltaX * 0.5)
  }

  const onMouseUp = (event) => {
    if (rotateState) {
      event.preventDefault()
    }
    stopRotate()
  }

  const onMouseDown = (event) => {
    if (event.button !== 0 || !event.shiftKey) return
    if (event.target.closest('.leaflet-control, button, a, input, textarea, select')) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()

    rotateState = {
      startX: event.clientX,
      startBearing: map.getBearing instanceof Function ? map.getBearing() : 0,
      wasDraggingEnabled: Boolean(map.dragging?.enabled?.()),
    }

    if (rotateState.wasDraggingEnabled && map.dragging?.disable instanceof Function) {
      map.dragging.disable()
    }
    container.classList.add('map-shift-rotating')
    document.addEventListener('mousemove', onMouseMove, { passive: false })
    document.addEventListener('mouseup', onMouseUp, { passive: false })
  }

  container.addEventListener('mousedown', onMouseDown, true)
  map.on('unload', () => {
    stopRotate()
    container.removeEventListener('mousedown', onMouseDown, true)
  })
}

async function initLeafletMap () {
  const defaultView = parseDefaultView()
  const AMap = await loadAmap()

  const map = L.map('map', {
    center: defaultView.center,
    zoom: defaultView.zoom,
    bearing: defaultView.bearing || 0,
    rotate: true,
    touchRotate: true,
    shiftKeyRotate: true,
    zoomControl: false,
    attributionControl: false,
    keyboardPanDelta: 480,
  }).setMaxBounds([[-90, 0], [90, 360]])

  window.map = map
  initDesktopShiftDragRotate(map)

  let amapGeolocation = null
  if (AMap) {
    amapGeolocation = initAmapGeolocation(AMap)
    initAmapSearch(map, AMap, amapGeolocation)
  }

  addTargetMarker(map, defaultView.center)

  const layerControl = await initLayerControl(map, defaultView.layerName)

  initKmlSupport(map)
  initGuidelines(map)

  map.on('moveend', () => writeMapViewToUrl(map))
  map.on('zoomend', () => writeMapViewToUrl(map))
  map.on('rotate', () => {
    writeMapViewToUrl(map)
    const bearing = map.getBearing ? map.getBearing() : 0
    const btn = document.getElementById('reset-bearing-btn')
    if (btn) {
      if (Math.abs(bearing) > 0.1) {
        btn.style.display = 'grid'
        const icon = btn.querySelector('.compass-icon') || btn
        icon.style.transform = `rotate(${-bearing}deg)`
      } else {
        btn.style.display = 'none'
      }
    }
  })

  // 触发一次以初始化可能已经存在的旋转状态
  if (map.getBearing && Math.abs(map.getBearing()) > 0.1) {
    map.fire('rotate')
  }

  const mapMenu = document.getElementById('map-menu')
  let toolsExpanded = false
  const setToolsExpanded = (expanded) => {
    toolsExpanded = expanded
    mapMenu.classList.toggle('is-expanded', expanded)
    const moreButton = mapMenu.querySelector('[data-action="toggleLayerControl"]')
    moreButton?.setAttribute('aria-expanded', String(expanded))
    setLayerControlVisible(layerControl, map, expanded)
  }

  const actionMap = {
    toggleLayerControl: () => setToolsExpanded(!toolsExpanded),
    toggleKmlPanel: () => {
      if (window.toggleKmlPanel) {
        window.toggleKmlPanel()
      }
    },
    toggleGuidelineMode,
    toggleSearchMode,
    updatePosition: () => {
      if (skipNextClick) {
        skipNextClick = false
        return
      }
      updatePosition(map, amapGeolocation, intervalLocationState.active ? intervalLocationState.zoomLevel : 18, intervalLocationState.active)
    },
    resetBearing: () => {
      if (map.setBearing) {
        map.setBearing(0)
      }
    },
    openAdmin: () => {
      window.location.href = '/admin/overview'
    },
    open3d: () => {
      window.location.href = '/3d' + window.location.search
    },
  }

  // 绑定定位按钮 3s 长按事件
  const positionBtn = mapMenu.querySelector('[data-action="updatePosition"]')
  let skipNextClick = false
  if (positionBtn) {
    let longPressTimer = null
    let isLongPressTriggered = false
    let startX = 0
    let startY = 0

    const handleLongPress = async () => {
      if (!intervalLocationState.active) {
        await showLocationConfigDialog()
      } else {
        await showLocationManageDialog()
      }
    }

    const showLocationConfigDialog = async () => {
      const currentZoom = map.getZoom()
      const res = await showEditDialog({
        title: '定位配置',
        fields: [
          {
            name: 'interval',
            label: '定位时间间隔 (秒，最小 1s)',
            type: 'text'
          },
          {
            name: 'zoom',
            label: '定位成功后显示的图层级别 (3-18)',
            type: 'text'
          },
          {
            name: 'maxPoints',
            label: '记住最近点位数 (默认 0 记住所有)',
            type: 'text'
          },
          {
            name: 'recordTrack',
            label: '记录轨迹',
            type: 'select',
            options: [
              { label: '是', value: 'true' },
              { label: '否', value: 'false' }
            ]
          },
          {
            name: 'onlyLine',
            label: '记录方式',
            type: 'select',
            options: [
              { label: '保留路线和所有点', value: 'false' },
              { label: '仅保留最终路线 (省内存/省空间)', value: 'true' }
            ]
          },
          {
            name: 'autoRotate',
            label: '自动旋转地图',
            type: 'select',
            options: [
              { label: '是', value: 'true' },
              { label: '否', value: 'false' }
            ]
          }
        ],
        values: {
          interval: String(intervalLocationState.intervalSeconds || 15),
          zoom: String(intervalLocationState.zoomLevel || currentZoom || 16),
          maxPoints: String(intervalLocationState.maxHistoryPoints || 0),
          recordTrack: String(intervalLocationState.recordTrack !== false),
          onlyLine: String(intervalLocationState.onlyLine !== false),
          autoRotate: String(intervalLocationState.autoRotate !== false)
        },
        showReset: true,
        resetValues: {
          interval: '15',
          zoom: '16',
          maxPoints: '0',
          recordTrack: 'true',
          onlyLine: 'true',
          autoRotate: 'true'
        }
      })

      if (!res) return

      const interval = parseInt(res.interval, 10)
      const zoom = parseInt(res.zoom, 10)
      const maxHistoryPoints = parseInt(res.maxPoints, 10)
      const recordTrack = res.recordTrack === 'true'
      const onlyLine = res.onlyLine === 'true'
      const autoRotate = res.autoRotate === 'true'

      if (isNaN(interval) || interval < 1) {
        await showAlert('定位时间间隔必须是大于或等于 1 的正整数！')
        await showLocationConfigDialog()
        return
      }

      if (isNaN(zoom) || zoom < 3 || zoom > 18) {
        await showAlert('图层级别必须在 3 到 18 之间！')
        await showLocationConfigDialog()
        return
      }

      if (isNaN(maxHistoryPoints) || maxHistoryPoints < 0) {
        await showAlert('记住最近点位数必须是大于或等于 0 的整数！')
        await showLocationConfigDialog()
        return
      }

      // 如果当前定位在运行中，执行中途热编辑
      if (intervalLocationState.active) {
        intervalLocationState.intervalSeconds = interval
        intervalLocationState.zoomLevel = zoom
        intervalLocationState.maxHistoryPoints = maxHistoryPoints

        // 轨迹状态从 关 -> 开
        if (recordTrack && !intervalLocationState.recordTrack && !intervalLocationState.recordKmlId) {
          const now = new Date()
          const name = `轨迹_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
          const kmlId = createTrackKml2d(name)
          if (kmlId) {
            intervalLocationState.recordKmlId = kmlId
            localStorage.setItem('location_record_kml_id', kmlId)
          }
        }

        intervalLocationState.recordTrack = recordTrack
        intervalLocationState.onlyLine = onlyLine
        intervalLocationState.autoRotate = autoRotate

        localStorage.setItem('location_interval', String(interval))
        localStorage.setItem('location_zoom', String(zoom))
        localStorage.setItem('location_max_points', String(maxHistoryPoints))
        localStorage.setItem('location_record_track', String(recordTrack))
        localStorage.setItem('location_only_line', String(onlyLine))
        localStorage.setItem('location_auto_rotate', String(autoRotate))

        if (intervalLocationState.timerId) {
          clearInterval(intervalLocationState.timerId)
        }
        intervalLocationState.timerId = setInterval(() => {
          updatePosition(map, amapGeolocation, intervalLocationState.zoomLevel, true)
        }, interval * 1000)

        // 立即同步最新的变化到 KML
        if (intervalLocationState.recordTrack && intervalLocationState.recordKmlId) {
          updateTrackKml2d(map, intervalLocationState.recordKmlId, intervalLocationState.historyPoints, intervalLocationState.lastPosition, intervalLocationState.onlyLine)
        }

        await showAlert('定位管理参数已更新！')
      } else {
        startIntervalLocation2d(map, amapGeolocation, interval, zoom, maxHistoryPoints, recordTrack, onlyLine, autoRotate)
      }
    }

    const showLocationManageDialog = async () => {
      const choice = await showChoiceDialog({
        title: '定位管理',
        message: `当前持续定位运行中：\n时间间隔：${intervalLocationState.intervalSeconds} 秒\n图层级别：${intervalLocationState.zoomLevel}\n轨迹记录：${intervalLocationState.recordTrack ? (intervalLocationState.onlyLine ? '开启 (仅路线)' : '开启 (路线和点)') : '关闭'}`,
        choices: [
          { text: '编辑', value: 'edit', class: 'app-dialog-primary' },
          { text: '停止定位', value: 'stop', class: 'app-dialog-secondary app-dialog-danger' }
        ]
      })

      if (choice === 'edit') {
        await showLocationConfigDialog()
      } else if (choice === 'stop') {
        stopIntervalLocation2d(map)
        await showAlert('持续定位已关闭')
      }
    }

    const startTimer = (e) => {
      if (e.type === 'mousedown' && e.button !== 0) return
      const touch = e.touches ? e.touches[0] : e
      startX = touch.clientX
      startY = touch.clientY
      isLongPressTriggered = false
      longPressTimer = setTimeout(() => {
        isLongPressTriggered = true
        skipNextClick = true
        handleLongPress()
      }, 1000)
    }

    const clearTimer = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
    }

    const endTimer = (e) => {
      clearTimer()
      if (isLongPressTriggered) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const moveTouch = (e) => {
      const touch = e.touches ? e.touches[0] : e
      if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > 10) {
        clearTimer()
      }
    }

    positionBtn.addEventListener('mousedown', startTimer)
    positionBtn.addEventListener('touchstart', startTimer, { passive: true })
    positionBtn.addEventListener('mouseup', endTimer)
    positionBtn.addEventListener('touchend', endTimer)
    positionBtn.addEventListener('mousemove', moveTouch)
    positionBtn.addEventListener('touchmove', moveTouch, { passive: true })
    positionBtn.addEventListener('mouseleave', clearTimer)
    positionBtn.addEventListener('touchcancel', clearTimer)
  }

  mapMenu.addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-action]')
    const action = actionTarget?.getAttribute('data-action')
    if (action && actionMap[action] instanceof Function) {
      actionMap[action]()
    }
  })

  // 绑定全局截图快捷键 (Alt+Shift+S)
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.code === 'KeyS') {
      e.preventDefault()
      if (window.triggerMapScreenshot) {
        window.triggerMapScreenshot(map)
      }
    }
  })

  // 配合 Visibility API 对黑屏/切到后台重新唤醒时的位置补偿
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && intervalLocationState.active) {
      updatePosition(map, amapGeolocation, intervalLocationState.zoomLevel, true)
    }
  })
}

if (isAdminLocation(window.location)) {
  initAdminApp({ amapLoader: AMapLoader })
} else {
  renderAppVersion()
  initAfterAccessCheck({
    init: initLeafletMap,
    title: '私有地图服务',
    submitText: '载入地图',
  })
}

registerServiceWorker()
