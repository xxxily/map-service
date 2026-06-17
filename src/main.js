import AMapLoader from '@amap/amap-jsapi-loader'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './styles.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { amapConfig } from './config.js'
import { initLayerControl, toggleLayerControl } from './map/layers.js'
import { addTargetMarker, initAmapGeolocation, updatePosition } from './map/location.js'
import { initAmapSearch, toggleSearchMode } from './map/search.js'
import { parseDefaultView, writeMapViewToUrl } from './map/url-state.js'
import { initAdminApp } from './admin/dashboard.js'
import { registerServiceWorker } from './pwa.js'

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

async function loadAmap () {
  window._AMapSecurityConfig = {
    securityJsCode: amapConfig.securityJsCode,
  }

  return AMapLoader.load({
    key: amapConfig.key,
    version: '2.0',
    plugins: amapConfig.plugins,
  }).catch((err) => {
    console.warn('高德 JSAPI 加载失败，搜索和坐标转换功能不可用', err)
    return null
  })
}

async function initLeafletMap () {
  const defaultView = parseDefaultView()
  const AMap = await loadAmap()

  const map = L.map('map', {
    center: defaultView.center,
    zoom: defaultView.zoom,
    zoomControl: false,
    attributionControl: false,
    keyboardPanDelta: 480,
  }).setMaxBounds([[-90, 0], [90, 360]])

  window.map = map

  if (AMap) {
    initAmapSearch(map, AMap)
    initAmapGeolocation(AMap)
  }

  addTargetMarker(map, defaultView.center)

  const layerControl = initLayerControl(map)

  map.on('moveend', () => writeMapViewToUrl(map))
  map.on('zoomend', () => writeMapViewToUrl(map))

  const actionMap = {
    toggleLayerControl: () => toggleLayerControl(layerControl, map),
    toggleSearchMode,
    updatePosition: () => updatePosition(map, AMap),
    openAdmin: () => {
      window.location.href = '/?view=admin'
    },
  }

  document.getElementById('map-menu').addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-action]')
    const action = actionTarget?.getAttribute('data-action')
    if (action && actionMap[action] instanceof Function) {
      actionMap[action]()
    }
  })
}

if (new URLSearchParams(window.location.search).get('view') === 'admin') {
  initAdminApp({ amapLoader: AMapLoader })
} else {
  initLeafletMap()
}

registerServiceWorker()
