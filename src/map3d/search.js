import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  HeightReference,
  LabelStyle,
  Math as CesiumMath,
  VerticalOrigin,
} from 'cesium'
import { flyToLngLat } from './location.js'
import {
  normalizeSearchHistoryItem,
  renderSearchHistoryDropdown,
  saveSearchHistory,
} from '../map/search-history.js'
import { createAmapSearchBias } from '../map/search-bias.js'

let currentSearchEntity = null

function getViewerSearchCenter (viewer) {
  const camera = viewer?.camera
  const scene = viewer?.scene
  const canvas = scene?.canvas
  const ellipsoid = scene?.globe?.ellipsoid
  if (camera?.pickEllipsoid && canvas && ellipsoid) {
    const target = camera.pickEllipsoid(
      new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
      ellipsoid,
    )
    if (target) {
      const cartographic = Cartographic.fromCartesian(target, ellipsoid)
      if (cartographic) {
        return {
          lng: CesiumMath.toDegrees(cartographic.longitude),
          lat: CesiumMath.toDegrees(cartographic.latitude),
        }
      }
    }
  }

  const fallback = camera?.positionCartographic
  if (!fallback) return null
  return {
    lng: CesiumMath.toDegrees(fallback.longitude),
    lat: CesiumMath.toDegrees(fallback.latitude),
  }
}

function showSearchResult3d (viewer, item) {
  const normalized = normalizeSearchHistoryItem(item)
  if (!viewer || !normalized) return false
  const { lng, lat } = normalized.location

  if (currentSearchEntity) {
    viewer.entities.remove(currentSearchEntity)
    currentSearchEntity = null
  }

  currentSearchEntity = viewer.entities.add({
    name: normalized.name,
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
      text: normalized.name,
      font: '12px sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -18),
      show: Boolean(normalized.name),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })

  flyToLngLat(viewer, lng, lat, { height: 1500 })
  return true
}

export function initAmapSearch3d (viewer, AMap) {
  if (!AMap?.AutoComplete) {
    console.warn('高德搜索插件加载失败，搜索功能不可用')
    return
  }

  const autoComplete = new AMap.AutoComplete({
    input: 'tipinput',
    city: '全国',
    citylimit: false,
  })

  autoComplete.on('select', (event) => {
    if (!event.poi?.location || !viewer) {
      return
    }
    const saved = saveSearchHistory('map_search_history', event.poi)
    showSearchResult3d(viewer, saved || event.poi)
  })

  const searchContainer = document.getElementById('map-search-mod')
  const searchInput = document.getElementById('tipinput')
  const searchBias = createAmapSearchBias({
    AMap,
    getCenter: () => getViewerSearchCenter(viewer),
    targets: [autoComplete],
  })
  searchBias.bindInput(searchInput)
  searchBias.refresh()
  viewer?.camera?.moveEnd?.addEventListener(searchBias.schedule)
  if (searchContainer && searchInput) {
    renderSearchHistoryDropdown(searchContainer, searchInput, 'map_search_history', item => {
      showSearchResult3d(viewer, item)
    })
  }
}

export function toggleSearchMode3d () {
  const searchMode = document.getElementById('map-search-mod')
  if (!searchMode) return
  searchMode.style.display = searchMode.style.display === 'block' ? 'none' : 'block'
  if (searchMode.style.display === 'block') {
    searchMode.querySelector('input')?.focus()
  }
}
