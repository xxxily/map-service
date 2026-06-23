import L from 'leaflet'
import { showAlert } from '../ui/dialog.js'
import { wgs84ToGcj02 } from './coord-transform.js'

export function initAmapGeolocation (AMap) {
  if (!AMap?.Geolocation) {
    console.warn('高德定位插件加载失败，将仅使用浏览器定位')
    return null
  }

  return new AMap.Geolocation({
    enableHighAccuracy: true,
    noIpLocate: 3,
    timeout: 10000,
    maximumAge: 10,
    convert: false,
    showButton: false,
    buttonPosition: 'LB',
    showMarker: false,
    showCircle: false,
    panToLocation: false,
    zoomToAccuracy: false,
  })
}

export function getBrowserPosition () {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('你的浏览器不支持当前地理位置信息获取'))
      return
    }

    navigator.geolocation.getCurrentPosition((position) => {
      resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      })
    }, reject)
  })
}

export function addTargetMarker (map, location) {
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer)
    }
  })

  L.marker(location, {
    opacity: 1,
    draggable: true,
  }).addTo(map)
    .on('dragend', (event) => {
      const latlng = event.target.getLatLng()
      const coords = `${latlng.lat},${latlng.lng},${map.getZoom()}`
      window.history.replaceState(null, '', `?coords=${coords}`)
    })
}

function isValidGpsPosition (position) {
  const lat = Number(position?.lat)
  const lng = Number(position?.lng)
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
}

function getMapPositionFromGps (position) {
  const lat = Number(position.lat)
  const lng = Number(position.lng)
  const [convertedLng, convertedLat] = wgs84ToGcj02([lng, lat])
  const mapLng = convertedLng < 0 ? convertedLng + 360 : convertedLng
  return [convertedLat, mapLng]
}

export async function updatePosition (map) {
  const result = await getBrowserPosition().catch((err) => {
    console.error('获取地理位置失败', err)
    return null
  })

  if (!isValidGpsPosition(result)) {
    await showAlert('获取地理位置失败，请手动选择')
    return
  }

  const mapPosition = getMapPositionFromGps(result)
  map.setView(mapPosition, 18)
  addTargetMarker(map, mapPosition)
}
