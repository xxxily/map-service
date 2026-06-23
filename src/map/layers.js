import L from 'leaflet'
import { tileRelayEndpoint } from '../config.js'
import { writeMapViewToUrl } from './url-state.js'

const DEFAULT_LAYER_NAME = '高德/卫星'

// 对 L.GridLayer 扩展以支持可视区域外一部分瓦片图的预加载
const originalGetTiledPixelBounds = L.GridLayer.prototype._getTiledPixelBounds
L.GridLayer.prototype._getTiledPixelBounds = function (center) {
  const pixelBounds = originalGetTiledPixelBounds.call(this, center)
  if (this.options.preloadBuffer) {
    const buffer = this.options.preloadBuffer
    const min = pixelBounds.min.subtract([buffer, buffer])
    const max = pixelBounds.max.add([buffer, buffer])
    return L.bounds(min, max)
  }
  return pixelBounds
}

function relayTileUrl (targetUrl) {
  const encodedTarget = encodeURIComponent(targetUrl)
    .replace(/%7B/g, '{')
    .replace(/%7D/g, '}')

  return `${tileRelayEndpoint}?url=${encodedTarget}`
}

const googleSatellite = relayTileUrl('https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}')
const googleStreet = relayTileUrl('https://www.google.com/maps/vt?lyrs=m@189&gl=cn&x={x}&y={y}&z={z}')
const autonaviSatellite = relayTileUrl('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}')
const autonaviRoad = relayTileUrl('https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}')

function createTileLayer (url, options) {
  return L.tileLayer(url, {
    minZoom: 3,
    keepBuffer: 10,
    preloadBuffer: 256, // 预先向四周多加载 1 圈瓦片
    ...options,
  })
}

export function initLayerControl (map, initialLayerName = '') {
  // 从 localStorage 获取用户上一次选择的图层，默认使用 '高德/卫星'
  let savedLayerName = DEFAULT_LAYER_NAME
  try {
    savedLayerName = localStorage.getItem('last_map_layer') || DEFAULT_LAYER_NAME
  } catch (e) {
    console.error('Failed to read last_map_layer from localStorage', e)
  }

  const mapLayers = {
    '高德/卫星': L.layerGroup([
      createTileLayer(autonaviSatellite, {
        maxZoom: 20,
        maxNativeZoom: 18,
        attribution: '高德地图 AutoNavi.com',
        subdomains: '1234',
      }),
      createTileLayer(autonaviRoad, {
        maxZoom: 20,
        maxNativeZoom: 18,
        subdomains: '1234',
        opacity: 0.5,
      }),
    ]),

    '高德/街道': createTileLayer(autonaviRoad, {
      maxZoom: 20,
      maxNativeZoom: 18,
      attribution: '高德地图 AutoNavi.com',
      subdomains: '1234',
    }),

    '谷歌高德/卫星': L.layerGroup([
      createTileLayer(googleSatellite, {
        maxZoom: 22,
        attribution: '谷歌提供卫星图，高德提供街道图',
      }),
      createTileLayer(autonaviRoad, {
        maxZoom: 22,
        maxNativeZoom: 18,
        attribution: '高德地图 AutoNavi.com',
        subdomains: '1234',
        opacity: 0.8,
      }),
    ]),

    '谷歌/卫星': createTileLayer(googleSatellite, {
      maxZoom: 22,
      attribution: '谷歌 Google',
    }),

    '谷歌/街道': createTileLayer(googleStreet, {
      maxZoom: 22,
      attribution: '谷歌 Google',
    }),
  }

  // 渲染选中的默认图层
  const activeLayerName = [initialLayerName, savedLayerName, DEFAULT_LAYER_NAME].find(name => mapLayers[name]) || DEFAULT_LAYER_NAME
  map._activeLayerName = activeLayerName
  mapLayers[activeLayerName].addTo(map)

  const layerControl = L.control.layers(mapLayers, {}, {
    position: 'topright',
    collapsed: true,
  }).addTo(map)

  // 监听基准底图切换事件，将用户当前选择记录进本地缓存中
  map.on('baselayerchange', (event) => {
    map._activeLayerName = event.name
    try {
      localStorage.setItem('last_map_layer', event.name)
    } catch (e) {
      console.error('Failed to save last_map_layer to localStorage', e)
    }
    writeMapViewToUrl(map, { layerName: event.name })
  })

  layerControl._container.style.display = 'none'
  return layerControl
}

export function setLayerControlVisible (layerControl, map, visible) {
  layerControl._container.style.display = visible ? 'block' : 'none'
  const zoomControl = document.getElementsByClassName('leaflet-control-zoom')[0]
  if (zoomControl) {
    zoomControl.style.display = visible ? 'block' : 'none'
    return
  }

  if (!visible) return

  L.control.zoom({
    zoomInTitle: '放大',
    zoomOutTitle: '缩小',
  }).addTo(map)
  document.getElementsByClassName('leaflet-control-zoom')[0].style.display = 'block'
}

export function toggleLayerControl (layerControl, map) {
  const visible = layerControl._container.style.display !== 'block'
  setLayerControlVisible(layerControl, map, visible)
  return visible
}
