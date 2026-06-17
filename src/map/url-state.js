import { defaultMapView } from '../config.js'

export function parseDefaultView () {
  const urlParams = new URLSearchParams(window.location.search)
  const coordsParam = urlParams.get('coords')
  
  let lat = NaN
  let lng = NaN
  let zoom = NaN
  let bearing = 0

  if (coordsParam) {
    const rawCoords = coordsParam.split(',')
    lat = Number(rawCoords[0])
    lng = Number(rawCoords[1])
    zoom = Number.parseInt(rawCoords[2] || '', 10)
    bearing = Number(rawCoords[3] || 0)
  }

  // 尝试从 localStorage 恢复上一次保存的视图
  let localView = null
  try {
    const rawLocal = localStorage.getItem('last_map_view')
    if (rawLocal) {
      localView = JSON.parse(rawLocal)
    }
  } catch (e) {
    console.error('Failed to parse last_map_view from localStorage', e)
  }

  const defaultCenter = localView?.center || defaultMapView.center
  const defaultZoom = localView?.zoom || defaultMapView.zoom
  const defaultBearing = localView?.bearing || 0

  return {
    center: [
      Number.isFinite(lat) ? lat : defaultCenter[0],
      Number.isFinite(lng) ? lng : defaultCenter[1],
    ],
    zoom: Number.isFinite(zoom) ? zoom : defaultZoom,
    bearing: Number.isFinite(bearing) ? bearing : defaultBearing,
  }
}

export function writeMapViewToUrl (map) {
  const center = map.getCenter()
  const zoom = map.getZoom()
  const bearing = map.getBearing ? map.getBearing() : 0
  const coords = `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${zoom},${Math.round(bearing)}`
  
  // 写入 URL
  window.history.replaceState(null, '', `?coords=${coords}`)
  
  // 写入 localStorage
  try {
    localStorage.setItem('last_map_view', JSON.stringify({
      center: [center.lat, center.lng],
      zoom,
      bearing
    }))
  } catch (e) {
    console.error('Failed to save last_map_view to localStorage', e)
  }
}
