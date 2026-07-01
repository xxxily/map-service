import L from 'leaflet'
import { showAlert } from '../ui/dialog.js'
import { getBestPosition, isValidPosition, positionToLeafletLatLng } from './geolocation.js'

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

export async function updatePosition (map, geolocation = null) {
  const result = await getBestPosition(geolocation).catch((err) => {
    console.error('获取地理位置失败', err)
    return null
  })

  if (!isValidPosition(result)) {
    await showAlert('获取地理位置失败，请手动选择')
    return
  }

  const mapPosition = positionToLeafletLatLng(result)
  map.setView(mapPosition, 18)
  addTargetMarker(map, mapPosition)
}
