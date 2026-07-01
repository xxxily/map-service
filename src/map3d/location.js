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
import { getBestPosition, isValidPosition, positionToGcj02 } from '../map/geolocation.js'

let targetEntity = null

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

export async function updatePosition3d (viewer, geolocation = null) {
  const result = await getBestPosition(geolocation).catch((err) => {
    console.error('获取地理位置失败', err)
    return null
  })

  if (!isValidPosition(result)) {
    await showAlert('获取地理位置失败，请手动选择')
    return
  }

  const mapPosition = positionToGcj02(result)
  addTargetMarker3d(viewer, mapPosition, { label: '当前位置' })
  flyToLngLat(viewer, mapPosition.lng, mapPosition.lat, { height: 1200 })
}
