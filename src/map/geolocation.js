import { wgs84ToGcj02 } from './coord-transform.js'

const BROWSER_GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 0,
}

export function initAmapGeolocation (AMap) {
  if (!AMap?.Geolocation) {
    console.warn('高德定位插件加载失败，将仅使用浏览器定位')
    return null
  }

  return new AMap.Geolocation({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0,
    convert: true,
    showButton: false,
    showMarker: false,
    showCircle: false,
    panToLocation: false,
    zoomToAccuracy: false,
  })
}

function toFiniteNumber (value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function isValidPosition (position) {
  const lat = toFiniteNumber(position?.lat)
  const lng = toFiniteNumber(position?.lng)
  return lat !== null &&
    lng !== null &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
}

function normalizeLngForLeaflet (lng) {
  return lng < 0 ? lng + 360 : lng
}

export function positionToGcj02 (position) {
  const lat = Number(position.lat)
  const lng = Number(position.lng)

  if (position.coordType === 'gcj02') {
    return {
      lat,
      lng,
      accuracy: position.accuracy,
      source: position.source,
      locationType: position.locationType,
    }
  }

  const [convertedLng, convertedLat] = wgs84ToGcj02([lng, lat])
  return {
    lat: convertedLat,
    lng: convertedLng,
    accuracy: position.accuracy,
    source: position.source,
    locationType: position.locationType,
  }
}

export function positionToLeafletLatLng (position) {
  const mapPosition = positionToGcj02(position)
  return [
    mapPosition.lat,
    normalizeLngForLeaflet(mapPosition.lng),
  ]
}

function extractAmapPosition (result) {
  const lngLat = result?.position
  const lat = toFiniteNumber(typeof lngLat?.getLat === 'function' ? lngLat.getLat() : lngLat?.lat)
  const lng = toFiniteNumber(typeof lngLat?.getLng === 'function' ? lngLat.getLng() : lngLat?.lng)
  if (lat === null || lng === null) return null

  return {
    lat,
    lng,
    accuracy: toFiniteNumber(result.accuracy),
    source: 'amap',
    coordType: 'gcj02',
    locationType: result.location_type || result.locationType || '',
  }
}

export function getAmapPosition (geolocation) {
  return new Promise((resolve, reject) => {
    if (!geolocation?.getCurrentPosition) {
      reject(new Error('高德定位实例不可用'))
      return
    }

    geolocation.getCurrentPosition((status, result) => {
      if (status === 'complete') {
        const position = extractAmapPosition(result)
        if (position) {
          resolve(position)
          return
        }
      }

      const message = result?.message || result?.info || '高德定位失败'
      reject(new Error(message))
    })
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
        accuracy: toFiniteNumber(position.coords.accuracy),
        source: 'browser',
        coordType: 'wgs84',
        locationType: 'html5',
      })
    }, reject, BROWSER_GEOLOCATION_OPTIONS)
  })
}

export async function getBestPosition (geolocation) {
  if (geolocation) {
    try {
      return await getAmapPosition(geolocation)
    } catch (err) {
      console.warn('高德定位失败，改用浏览器定位', err)
    }
  }

  return getBrowserPosition()
}
