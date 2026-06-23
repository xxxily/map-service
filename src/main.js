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
import { addTargetMarker, initAmapGeolocation, updatePosition } from './map/location.js'
import { initAmapSearch, toggleSearchMode } from './map/search.js'
import { parseDefaultView, writeMapViewToUrl } from './map/url-state.js'
import { initAdminApp } from './admin/dashboard.js'
import { isAdminLocation } from './admin/routes.js'
import { registerServiceWorker } from './pwa.js'
import { getAccessStatus, verifyAccessPassword } from './admin/api.js'
import { initKmlSupport } from './map/kml.js'
import { escapeHtml } from './admin/utils.js'

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

  if (AMap) {
    initAmapSearch(map, AMap)
    initAmapGeolocation(AMap)
  }

  addTargetMarker(map, defaultView.center)

  const layerControl = initLayerControl(map, defaultView.layerName)

  initKmlSupport(map)

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
    toggleSearchMode,
    updatePosition: () => updatePosition(map),
    resetBearing: () => {
      if (map.setBearing) {
        map.setBearing(0)
      }
    },
    openAdmin: () => {
      window.location.href = '/admin/overview'
    },
  }

  mapMenu.addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-action]')
    const action = actionTarget?.getAttribute('data-action')
    if (action && actionMap[action] instanceof Function) {
      actionMap[action]()
    }
  })
}

async function checkMapAccessBeforeInit () {
  try {
    const status = await getAccessStatus()
    if (status.required) {
      showPasswordLockScreen()
    } else {
      initLeafletMap()
    }
  } catch (err) {
    console.error('Failed to check map access status', err)
    showPasswordLockScreen({
      message: '访问状态检查失败，请稍后重试',
      allowRetry: true,
    })
  }
}

function showPasswordLockScreen (options = {}) {
  document.getElementById('map-lock-screen')?.remove()

  const lockScreen = document.createElement('div')
  lockScreen.id = 'map-lock-screen'
  lockScreen.className = 'lock-screen-backdrop'
  const message = options.message || '管理员启用了访问控制，请输入密码解锁'
  lockScreen.innerHTML = `
    <div class="lock-screen-card">
      <div class="lock-screen-icon">🔒</div>
      <h2>私有地图服务</h2>
      <p>${escapeHtml(message)}</p>
      <form id="lock-screen-form" autocomplete="off">
        <div class="lock-screen-field">
          <input type="password" name="password" placeholder="请输入访问密码" required autofocus>
        </div>
        <div id="lock-screen-error" class="lock-screen-error" style="${options.message ? '' : 'display: none;'}">${escapeHtml(options.message || '')}</div>
        <button type="submit">载入地图</button>
        ${options.allowRetry ? '<button type="button" class="lock-screen-secondary" data-lock-retry>重试检查</button>' : ''}
      </form>
    </div>
  `

  document.body.appendChild(lockScreen)

  const form = document.getElementById('lock-screen-form')
  const errorNode = document.getElementById('lock-screen-error')
  const retryButton = lockScreen.querySelector('[data-lock-retry]')

  retryButton?.addEventListener('click', () => {
    lockScreen.remove()
    checkMapAccessBeforeInit()
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errorNode.style.display = 'none'
    const password = form.elements.password.value.trim()
    if (!password) return

    try {
      const btn = form.querySelector('button')
      btn.disabled = true
      btn.textContent = '正在验证...'

      await verifyAccessPassword(password)

      lockScreen.remove()
      initLeafletMap()
    } catch (err) {
      const btn = form.querySelector('button')
      btn.disabled = false
      btn.textContent = '载入地图'
      errorNode.textContent = err.message || '访问密码错误'
      errorNode.style.display = 'block'
    }
  })
}

if (isAdminLocation(window.location)) {
  initAdminApp({ amapLoader: AMapLoader })
} else {
  renderAppVersion()
  checkMapAccessBeforeInit()
}

registerServiceWorker()
