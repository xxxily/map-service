import { defaultMapView } from '../config.js'

export function parseDefaultView () {
  const urlParams = new URLSearchParams(window.location.search)
  const rawCoords = (urlParams.get('coords') || '').split(',')
  const lat = Number(rawCoords[0])
  const lng = Number(rawCoords[1])
  const zoom = Number.parseInt(rawCoords[2] || defaultMapView.zoom, 10)

  return {
    center: [
      Number.isFinite(lat) ? lat : defaultMapView.center[0],
      Number.isFinite(lng) ? lng : defaultMapView.center[1],
    ],
    zoom: Number.isFinite(zoom) ? zoom : defaultMapView.zoom,
  }
}

export function writeMapViewToUrl (map) {
  const center = map.getCenter()
  const zoom = map.getZoom()
  const coords = `${center.lat},${center.lng},${zoom}`
  window.history.replaceState(null, '', `?coords=${coords}`)
}
