import {
  Cartesian2,
  Cartesian3,
  Color,
  HeightReference,
  LabelStyle,
  VerticalOrigin,
  Math as CesiumMath,
} from 'cesium'
import { showAlert } from '../ui/dialog.js'
import { wgs84ToGcj02 } from '../map/coord-transform.js'

let targetEntity = null

function getBrowserPosition () {
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
  return {
    lat: convertedLat,
    lng: convertedLng,
  }
}

export function flyToLngLat (viewer, lng, lat, options = {}) {
  if (!viewer) return
  const height = Number(options.height || 1200)
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lng, lat, height),
    orientation: {
      heading: CesiumMath.toRadians(Number(options.heading || 0)),
      pitch: CesiumMath.toRadians(Number(options.pitch || -90)),
      roll: 0,
    },
    duration: Number(options.duration || 1.1),
  })
}

export function addTargetMarker3d (viewer, location, options = {}) {
  if (!viewer || !location) return null
  if (targetEntity) {
    viewer.entities.remove(targetEntity)
    targetEntity = null
  }

  targetEntity = viewer.entities.add({
    position: Cartesian3.fromDegrees(location.lng, location.lat, 8),
    point: {
      pixelSize: 13,
      color: Color.fromCssColorString(options.color || '#0f766e'),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: options.label || '',
      font: '12px sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -18),
      show: Boolean(options.label),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })

  return targetEntity
}

export async function updatePosition3d (viewer) {
  const result = await getBrowserPosition().catch((err) => {
    console.error('获取地理位置失败', err)
    return null
  })

  if (!isValidGpsPosition(result)) {
    await showAlert('获取地理位置失败，请手动选择')
    return
  }

  const mapPosition = getMapPositionFromGps(result)
  addTargetMarker3d(viewer, mapPosition, { label: '当前位置' })
  flyToLngLat(viewer, mapPosition.lng, mapPosition.lat, { height: 1200 })
}
