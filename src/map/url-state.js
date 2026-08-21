const DEFAULT_MAP_VIEW = {
  center: [23.129112, 113.264385],
  zoom: 16,
}

const MIN_MAP_ZOOM = 0
const MAX_MAP_ZOOM = 24

function parseUrlCoords (coordsParam) {
  if (typeof coordsParam !== 'string' || !coordsParam.trim()) return null

  const rawCoords = coordsParam.split(',')
  if (rawCoords.length < 3 || rawCoords.length > 4) return null

  const lat = Number(rawCoords[0])
  const lng = Number(rawCoords[1])
  const zoom = Number(rawCoords[2])
  const bearing = rawCoords[3] === undefined || rawCoords[3] === '' ? 0 : Number(rawCoords[3])
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null
  // Leaflet may expose wrapped longitudes in [0, 360], while 3D writes [-180, 180].
  if (!Number.isFinite(lng) || lng < -360 || lng > 360) return null
  if (!Number.isFinite(zoom) || zoom < MIN_MAP_ZOOM || zoom > MAX_MAP_ZOOM) return null
  if (!Number.isFinite(bearing) || bearing < -360 || bearing > 360) return null

  return {
    center: [lat, lng],
    zoom,
    bearing,
  }
}

export function parseMapUrlState (search = '') {
  const urlParams = new URLSearchParams(search)
  const coords = parseUrlCoords(urlParams.get('coords'))
  const layerParam = urlParams.get('layer') || ''
  const layerName = layerParam.trim()

  return {
    coords,
    layerName,
    hasUrlCoords: Boolean(coords),
    hasUrlLayer: Boolean(layerName),
    hasExplicitViewState: Boolean(coords),
  }
}

export function isMapViewInsideBounds (view, bounds, minZoom = MIN_MAP_ZOOM) {
  if (!view || !Array.isArray(view.center) || view.center.length !== 2) return false
  if (!Array.isArray(bounds) || bounds.length !== 2) return false

  const [lat, lng] = view.center.map(Number)
  const south = Number(bounds[0]?.[0])
  const west = Number(bounds[0]?.[1])
  const north = Number(bounds[1]?.[0])
  const east = Number(bounds[1]?.[1])
  const zoom = Number(view.zoom)
  const minimumZoom = Number(minZoom)
  if (![lat, lng, south, west, north, east, zoom, minimumZoom].every(Number.isFinite)) return false
  if (south > north || west > east || lat < south || lat > north || zoom < minimumZoom) return false

  return [lng, lng - 360, lng + 360].some(value => value >= west && value <= east)
}

function normalizeStoredCenter (center) {
  if (!Array.isArray(center) || center.length !== 2) return null
  const lat = Number(center[0])
  const lng = Number(center[1])
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null
  if (!Number.isFinite(lng) || lng < -360 || lng > 360) return null
  return [lat, lng]
}

function normalizeStoredZoom (zoom) {
  const value = Number(zoom)
  return Number.isFinite(value) && value >= MIN_MAP_ZOOM && value <= MAX_MAP_ZOOM ? value : null
}

export function parseDefaultView (options = {}) {
  const includeUrl = options.includeUrl !== false
  const useStoredState = options.useStoredState !== false
  const urlState = includeUrl
    ? parseMapUrlState(typeof window === 'undefined' ? '' : window.location.search)
    : parseMapUrlState('')

  // 尝试从 localStorage 恢复上一次保存的视图
  let localView = null
  if (useStoredState && typeof localStorage !== 'undefined') {
    try {
      const rawLocal = localStorage.getItem('last_map_view')
      if (rawLocal) {
        localView = JSON.parse(rawLocal)
      }
    } catch (e) {
      console.error('Failed to parse last_map_view from localStorage', e)
    }
  }

  let localLayerName = ''
  if (useStoredState && typeof localStorage !== 'undefined') {
    try {
      localLayerName = localStorage.getItem('last_map_layer') || ''
    } catch (e) {
      console.error('Failed to read last_map_layer from localStorage', e)
    }
  }

  const fallbackCenter = normalizeStoredCenter(options.defaultCenter) || DEFAULT_MAP_VIEW.center
  const fallbackZoom = normalizeStoredZoom(options.defaultZoom) ?? DEFAULT_MAP_VIEW.zoom
  const defaultCenter = normalizeStoredCenter(localView?.center) || fallbackCenter
  const defaultZoom = normalizeStoredZoom(localView?.zoom) ?? fallbackZoom
  const defaultBearing = Number.isFinite(Number(localView?.bearing)) ? Number(localView.bearing) : 0
  const defaultLayerName = urlState.layerName || localView?.layer || localLayerName
  const center = urlState.coords?.center || defaultCenter
  const zoom = urlState.coords?.zoom ?? defaultZoom
  const bearing = urlState.coords?.bearing ?? defaultBearing

  return {
    center,
    zoom,
    bearing,
    layerName: defaultLayerName,
    hasUrlCoords: urlState.hasUrlCoords,
    hasUrlLayer: urlState.hasUrlLayer,
    hasExplicitViewState: urlState.hasExplicitViewState,
  }
}

export function writeMapViewToUrl (map, options = {}) {
  const center = map.getCenter()
  const zoom = map.getZoom()
  const bearing = map.getBearing ? map.getBearing() : 0
  const coords = `${center.lat.toFixed(6)},${center.lng.toFixed(6)},${zoom},${Math.round(bearing)}`
  const layerName = options.layerName || map._activeLayerName || ''
  
  // 写入 URL
  const urlParams = new URLSearchParams(window.location.search)
  urlParams.set('coords', coords)
  if (layerName) {
    urlParams.set('layer', layerName)
  } else {
    urlParams.delete('layer')
  }

  const query = urlParams.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
  
  // 分享页是只读访客视图，不应覆盖访问者自己的地图偏好。
  if (options.persist === false) return

  // 写入 localStorage
  try {
    localStorage.setItem('last_map_view', JSON.stringify({
      center: [center.lat, center.lng],
      zoom,
      bearing,
      layer: layerName,
    }))
  } catch (e) {
    console.error('Failed to save last_map_view to localStorage', e)
  }
}
