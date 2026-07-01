import { Cartesian3, Color, HeightReference, LabelStyle, VerticalOrigin, Cartesian2 } from 'cesium'
import { flyToLngLat } from './location.js'

let currentSearchEntity = null

export function initAmapSearch3d (viewer, AMap) {
  if (!AMap?.AutoComplete) {
    console.warn('高德搜索插件加载失败，搜索功能不可用')
    return
  }

  const autoComplete = new AMap.AutoComplete({
    input: 'tipinput',
  })

  autoComplete.on('select', (event) => {
    if (!event.poi?.location || !viewer) {
      return
    }

    const lng = Number(event.poi.location.lng)
    const lat = Number(event.poi.location.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return

    if (currentSearchEntity) {
      viewer.entities.remove(currentSearchEntity)
      currentSearchEntity = null
    }

    currentSearchEntity = viewer.entities.add({
      name: event.poi.name || '搜索结果',
      position: Cartesian3.fromDegrees(lng, lat, 8),
      point: {
        pixelSize: 12,
        color: Color.fromCssColorString('#2563eb'),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: event.poi.name || '',
        font: '12px sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -18),
        show: Boolean(event.poi.name),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })

    flyToLngLat(viewer, lng, lat, { height: 1500 })
  })
}

export function toggleSearchMode3d () {
  const searchMode = document.getElementById('map-search-mod')
  if (!searchMode) return
  searchMode.style.display = searchMode.style.display === 'block' ? 'none' : 'block'
  if (searchMode.style.display === 'block') {
    searchMode.querySelector('input')?.focus()
  }
}
