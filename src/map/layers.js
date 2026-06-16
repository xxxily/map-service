import L from 'leaflet'
import { tileRelayEndpoint } from '../config.js'

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
    ...options,
  })
}

export function initLayerControl (map) {
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
    ]).addTo(map),

    '高德/街道': createTileLayer(autonaviRoad, {
      maxZoom: 20,
      maxNativeZoom: 18,
      attribution: '高德地图 AutoNavi.com',
      subdomains: '1234',
    }),

    '谷歌高德/卫星': L.layerGroup([
      createTileLayer(googleSatellite, {
        maxZoom: 19,
        attribution: '谷歌提供卫星图，高德提供街道图',
      }),
      createTileLayer(autonaviRoad, {
        maxZoom: 19,
        maxNativeZoom: 18,
        attribution: '高德地图 AutoNavi.com',
        subdomains: '1234',
        opacity: 0.8,
      }),
    ]),

    '谷歌/卫星': createTileLayer(googleSatellite, {
      maxZoom: 20,
      attribution: '谷歌 Google',
    }),

    '谷歌/街道': createTileLayer(googleStreet, {
      maxZoom: 20,
      attribution: '谷歌 Google',
    }),

  }

  const layerControl = L.control.layers(mapLayers, {}, {
    position: 'topright',
    collapsed: true,
  }).addTo(map)

  layerControl._container.style.display = 'none'
  return layerControl
}

export function toggleLayerControl (layerControl, map) {
  layerControl._container.style.display = layerControl._container.style.display === 'block' ? 'none' : 'block'

  const zoomControl = document.getElementsByClassName('leaflet-control-zoom')[0]
  if (zoomControl) {
    zoomControl.style.display = zoomControl.style.display === 'block' ? 'none' : 'block'
    return
  }

  L.control.zoom({
    zoomInTitle: '放大',
    zoomOutTitle: '缩小',
  }).addTo(map)
  document.getElementsByClassName('leaflet-control-zoom')[0].style.display = 'block'
}
