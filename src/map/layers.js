import L from 'leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@maplibre/maplibre-gl-leaflet'
import { writeMapViewToUrl } from './url-state.js'
import { triggerMapScreenshot } from './screenshot.js'
import {
  DEFAULT_TILE_EDGE_OVERSCAN_PX,
  DEFAULT_TILE_KEEP_BUFFER,
  DEFAULT_TILE_PRELOAD_BUFFER_PX,
  drawTileWithEdgeOverscan,
  getOverscannedTileSize,
} from './tile-overscan.js'

const DEFAULT_LAYER_NAME = '高德/卫星'
const VECTOR_STYLE_KIND = 'vector-style'
const VECTOR_RESOURCE_KINDS = new Set(['mvt', 'vector-tilejson', 'vector-style', 'pmtiles-vector'])
const PMTILES_RESOURCE_KINDS = new Set(['pmtiles-vector', 'pmtiles-raster'])
const FALLBACK_CATALOG = {
  sources: [
    {
      id: 'amap-satellite',
      tileUrl: '/api/v1/tiles/amap-satellite/{z}/{x}/{y}',
      minZoom: 3,
      maxZoom: 18,
      maxNativeZoom: 18,
      tileSize: 256,
    },
    {
      id: 'amap-road',
      tileUrl: '/api/v1/tiles/amap-road/{z}/{x}/{y}',
      minZoom: 3,
      maxZoom: 18,
      maxNativeZoom: 18,
      tileSize: 256,
    },
  ],
  layers: [
    {
      id: 'amap-hybrid',
      name: DEFAULT_LAYER_NAME,
      enabled: true,
      default: true,
      clients: ['2d', '3d'],
      minZoom: 3,
      maxZoom: 18,
      items: [
        { sourceId: 'amap-satellite', opacity: 1 },
        { sourceId: 'amap-road', opacity: 0.5 },
      ],
    },
  ],
}

// 对 L.GridLayer 扩展以支持可视区域外一部分瓦片图的预加载
const originalGetTiledPixelBounds = L.GridLayer.prototype._getTiledPixelBounds
L.GridLayer.prototype._getTiledPixelBounds = function (center) {
  const pixelBounds = originalGetTiledPixelBounds.call(this, center)
  if (this.options.preloadBuffer) {
    const buffer = this.options.preloadBuffer
    const min = pixelBounds.min.subtract([buffer, buffer])
    const max = pixelBounds.max.add([buffer, buffer])
    return L.bounds(min, max)
  }
  return pixelBounds
}

const SeamlessTileLayer = L.TileLayer.extend({
  createTile (coords, done) {
    const tileSize = this.getTileSize()
    const edge = DEFAULT_TILE_EDGE_OVERSCAN_PX
    const overscannedSize = getOverscannedTileSize(tileSize, edge)
    const canvas = document.createElement('canvas')
    canvas.width = overscannedSize.canvasWidth
    canvas.height = overscannedSize.canvasHeight
    canvas.setAttribute('aria-hidden', 'true')

    const image = new Image()
    canvas._sourceImage = image
    if (this.options.crossOrigin || this.options.crossOrigin === '') {
      image.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin
    }
    if (typeof this.options.referrerPolicy === 'string') {
      image.referrerPolicy = this.options.referrerPolicy
    }

    const finish = (error) => {
      if (canvas.dataset.tileCancelled === 'true') return
      image.onload = null
      image.onerror = null
      canvas._sourceImage = null
      canvas.dataset.tileReady = error ? 'error' : 'true'
      canvas.dispatchEvent(new Event(error ? 'error' : 'load'))
      done?.(error || null, canvas)
    }
    image.onload = () => {
      // 这里只向 canvas 写入一次且不会回读像素。不要启用 willReadFrequently，
      // 否则 Chromium 可能优先使用软件画布，缩放时上传大量瓦片纹理会明显卡顿。
      const context = canvas.getContext('2d')
      if (!context) {
        finish(new Error('地图瓦片画布初始化失败'))
        return
      }

      drawTileWithEdgeOverscan(context, image, tileSize, edge)
      finish()
    }
    image.onerror = () => finish(new Error('地图瓦片加载失败'))
    image.alt = ''
    image.src = this.getTileUrl(coords)
    return canvas
  },

  _abortLoading () {
    for (const [key, tile] of Object.entries(this._tiles || {})) {
      if (tile.coords.z === this._tileZoom) continue

      const canvas = tile.el
      const sourceImage = canvas?._sourceImage
      // 已完成绘制的 canvas 没有 sourceImage，必须保留为缩放期间的旧层级兜底。
      if (!sourceImage) continue

      canvas.dataset.tileCancelled = 'true'
      sourceImage.onload = null
      sourceImage.onerror = null
      sourceImage.src = L.Util.emptyImageUrl
      canvas._sourceImage = null
      L.DomUtil.remove(canvas)
      delete this._tiles[key]
      this.fire('tileabort', {
        tile: canvas,
        coords: tile.coords,
      })
    }
  },

  _removeTile (key) {
    const canvas = this._tiles[key]?.el
    const sourceImage = canvas?._sourceImage
    if (sourceImage) {
      canvas.dataset.tileCancelled = 'true'
      sourceImage.onload = null
      sourceImage.onerror = null
      sourceImage.src = L.Util.emptyImageUrl
      canvas._sourceImage = null
    }
    return L.GridLayer.prototype._removeTile.call(this, key)
  },

  _updateOpacity () {
    if (!this._map) return

    L.DomUtil.setOpacity(this._container, this.options.opacity)
    for (const tile of Object.values(this._tiles || {})) {
      if (!tile.current || !tile.loaded) continue

      // Leaflet 默认会在 200ms 内逐瓦片从 0 淡入。混合地图的两个栅格
      // 图层加载时序不同，缩放后这种亮度差会形成深色网格。瓦片本身已有
      // 真实像素保护带，可以直接显示，但仍保留 _noPrune 机制，使旧层级在
      // 缩放动画结束前继续兜底，避免快速跨级缩放时地图外围露出背景。
      L.DomUtil.setOpacity(tile.el, 1)
      if (!tile.active) {
        this._onOpaqueTile(tile)
        tile.active = true
      }
    }

    // 不在逐瓦片加载期间主动裁剪。Leaflet 的 `_tileReady` 会在当前层级
    // 的可视瓦片全部完成后再延迟调用 `_pruneTiles`；若这里按首张瓦片
    // 立即裁剪，跨级缩放时旧层级会在新层尚未覆盖外围前被移除，露出地图背景。
  },

  _initTile (tile) {
    L.TileLayer.prototype._initTile.call(this, tile)

    // Leaflet positions tiles on a 256px grid.  Keep the canvas origin one
    // pixel outside that grid and use copied edge pixels as a guard band.
    const tileSize = this.getTileSize()
    const size = getOverscannedTileSize(tileSize)
    tile.style.width = `${size.canvasWidth}px`
    tile.style.height = `${size.canvasHeight}px`
    tile.style.margin = `${-size.edge}px`
  },
})

function createTileLayer (url, options) {
  return new SeamlessTileLayer(url, {
    minZoom: 3,
    // canvas 瓦片比普通 img 更占 GPU/内存。保留邻近 2 圈并额外预载 1 圈
    // 已足以覆盖快速平移，同时避免 keepBuffer: 10 长时间累积上百张瓦片。
    keepBuffer: DEFAULT_TILE_KEEP_BUFFER,
    preloadBuffer: DEFAULT_TILE_PRELOAD_BUFFER_PX,
    ...options,
  })
}

function isVectorSource (source = {}) {
  return VECTOR_RESOURCE_KINDS.has(source.kind)
}

function isLeafletRasterSource (source = {}) {
  if (!source || isVectorSource(source) || PMTILES_RESOURCE_KINDS.has(source.kind)) return false
  const tileUrl = source.tileUrl || ''
  return Boolean(tileUrl && !tileUrl.endsWith('.pbf'))
}

function createRasterLayerFromSource (source, layer, item) {
  return createTileLayer(source.tileUrl || `/api/v1/tiles/${encodeURIComponent(source.id)}/{z}/{x}/{y}`, {
    minZoom: source.minZoom ?? layer.minZoom ?? 3,
    maxZoom: layer.maxZoom ?? source.maxZoom ?? 20,
    maxNativeZoom: source.maxNativeZoom ?? source.maxZoom ?? layer.maxZoom,
    tileSize: source.tileSize || 256,
    opacity: item.opacity ?? 1,
    attribution: source.attribution || '',
  })
}

function createMapLibreLayerFromSource (source, item) {
  if (source.kind !== VECTOR_STYLE_KIND || !source.styleUrl || !(L.maplibreGL instanceof Function)) {
    return null
  }
  const layer = L.maplibreGL({
    style: source.styleUrl,
    interactive: false,
    attributionControl: source.attribution ? { customAttribution: source.attribution } : false,
    pane: 'tilePane',
  })
  layer.on('add', () => {
    const container = layer.getContainer?.()
    if (container) {
      container.style.opacity = String(item.opacity ?? 1)
      container.style.pointerEvents = 'none'
    }
  })
  return layer
}

function getLayerControlName (layer, usedNames) {
  const baseName = layer.name || layer.id
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName)
    return baseName
  }
  const name = `${baseName} (${layer.id})`
  usedNames.add(name)
  return name
}

function normalizeCatalogPayload (payload) {
  if (!payload || payload.code !== 0 || !payload.result || !Array.isArray(payload.result.layers)) {
    throw new Error(payload?.error?.message || '地图图层目录响应格式不正确')
  }
  return payload.result
}

function createLayerFromCatalog (layer, sourceById) {
  const tileLayers = (layer.items || [])
    .map((item) => {
      const source = sourceById.get(item.sourceId)
      if (!source) return null
      if (source.kind === VECTOR_STYLE_KIND) {
        return createMapLibreLayerFromSource(source, item)
      }
      if (isLeafletRasterSource(source)) {
        return createRasterLayerFromSource(source, layer, item)
      }
      const fallbackSourceId = source.rendering?.fallbackRasterSourceId || ''
      const fallbackSource = fallbackSourceId ? sourceById.get(fallbackSourceId) : null
      return isLeafletRasterSource(fallbackSource)
        ? createRasterLayerFromSource(fallbackSource, layer, item)
        : null
    })
    .filter(Boolean)

  if (!tileLayers.length) return null
  const group = L.layerGroup(tileLayers)
  group._layerId = layer.id
  group._layerName = layer.name
  return group
}

export async function initLayerControl (map, initialLayerName = '') {
  let savedLayerId = ''
  let savedLayerName = ''
  try {
    savedLayerId = localStorage.getItem('last_map_layer_id') || ''
    savedLayerName = localStorage.getItem('last_map_layer') || ''
  } catch (e) {
    console.error('Failed to read layer from localStorage', e)
  }

  let mapLayers = {}
  let layerByControlName = new Map()
  let catalogLayers = []
  let defaultLayer = null

  try {
    const res = await fetch('/api/v1/map/catalog')
    const payload = await res.json()
    if (!res.ok) {
      throw new Error(payload?.error?.message || res.statusText || '地图图层目录加载失败')
    }
    const catalog = normalizeCatalogPayload(payload)
    const sourceById = new Map((catalog.sources || []).map(source => [source.id, source]))
    const layers = catalog.layers || []
    
    // 过滤出启用且支持 2D 的图层
    catalogLayers = layers.filter(l => l.enabled !== false && (l.clients || []).includes('2d'))

    const usedNames = new Set()
    catalogLayers.forEach(layer => {
      const layerGroup = createLayerFromCatalog(layer, sourceById)
      if (layerGroup) {
        const controlName = getLayerControlName(layer, usedNames)
        mapLayers[controlName] = layerGroup
        layerByControlName.set(controlName, layer)
        if (layer.default) {
          defaultLayer = { ...layer, controlName }
        }
      }
    })
  } catch (err) {
    console.error('Failed to fetch map catalog layers, using backend fallback sources', err)
  }

  // 兜底底图
  if (Object.keys(mapLayers).length === 0) {
    const sourceById = new Map(FALLBACK_CATALOG.sources.map(source => [source.id, source]))
    const fallbackLayer = FALLBACK_CATALOG.layers[0]
    const fallbackGroup = createLayerFromCatalog(fallbackLayer, sourceById)
    if (fallbackGroup) {
      mapLayers[DEFAULT_LAYER_NAME] = fallbackGroup
      layerByControlName.set(DEFAULT_LAYER_NAME, fallbackLayer)
      catalogLayers = [fallbackLayer]
      defaultLayer = { ...fallbackLayer, controlName: DEFAULT_LAYER_NAME }
    }
  }

  const fallbackDefault = defaultLayer || { id: 'amap-hybrid', name: DEFAULT_LAYER_NAME, controlName: DEFAULT_LAYER_NAME }

  // 决定要激活哪个图层
  let activeLayerName = ''
  let needFallbackAlert = false

  const checkKeys = [initialLayerName, savedLayerId, savedLayerName].filter(Boolean)
  for (const key of checkKeys) {
    const matched = catalogLayers.find(l => l.id === key || l.name === key)
    const controlName = matched
      ? [...layerByControlName.entries()].find(([, layer]) => layer.id === matched.id)?.[0]
      : ''
    if (matched && controlName && mapLayers[controlName]) {
      activeLayerName = controlName
      break
    }
  }

  if (initialLayerName && !activeLayerName) {
    needFallbackAlert = true
  }

  if (!activeLayerName) {
    activeLayerName = fallbackDefault.controlName || fallbackDefault.name
  }

  map._activeLayerName = activeLayerName
  map._activeLayerId = mapLayers[activeLayerName]?._layerId || ''
  mapLayers[activeLayerName].addTo(map)

  const layerControl = L.control.layers(mapLayers, {}, {
    position: 'topright',
    collapsed: true,
  }).addTo(map)

  // 监听基准底图切换事件，将用户当前选择记录进本地缓存中
  map.on('baselayerchange', (event) => {
    map._activeLayerName = event.name
    const matchedLayer = layerByControlName.get(event.name)
    const layerId = matchedLayer ? matchedLayer.id : (event.layer?._layerId || '')
    map._activeLayerId = layerId
    try {
      localStorage.setItem('last_map_layer_id', layerId)
      localStorage.setItem('last_map_layer', matchedLayer?.name || event.name)
    } catch (e) {
      console.error('Failed to save last_map_layer to localStorage', e)
    }
    writeMapViewToUrl(map, { layerName: layerId })
  })

  layerControl._container.style.display = 'none'

  // 如果需要，显示原图层不可用，已切换到默认图层的非阻塞提示
  if (needFallbackAlert) {
    const toast = document.createElement('div')
    toast.className = 'screenshot-toast'
    toast.style.background = '#d97706' // 警告颜色
    toast.innerText = '原图层不可用，已切换到默认图层'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 3500)
  }

  return layerControl
}

export function setLayerControlVisible (layerControl, map, visible) {
  layerControl._container.style.display = visible ? 'block' : 'none'
  let zoomControl = document.getElementsByClassName('leaflet-control-zoom')[0]
  let screenshotControl = document.getElementsByClassName('leaflet-control-screenshot')[0]

  if (!zoomControl && visible) {
    L.control.zoom({
      zoomInTitle: '放大',
      zoomOutTitle: '缩小',
    }).addTo(map)
    zoomControl = document.getElementsByClassName('leaflet-control-zoom')[0]
    if (zoomControl) {
      zoomControl.style.display = 'block'
    }

    initScreenshotControl(map)
    screenshotControl = document.getElementsByClassName('leaflet-control-screenshot')[0]
  }

  if (zoomControl) {
    zoomControl.style.display = visible ? 'block' : 'none'
  }
  if (screenshotControl) {
    screenshotControl.style.display = visible ? 'block' : 'none'
  }
}

export function toggleLayerControl (layerControl, map) {
  const visible = layerControl._container.style.display !== 'block'
  setLayerControlVisible(layerControl, map, visible)
  return visible
}

function initScreenshotControl (map) {
  const ScreenshotControl = L.Control.extend({
    options: {
      position: 'topleft'
    },
    onAdd: function (map) {
      const container = L.DomUtil.create('div', 'leaflet-control-screenshot leaflet-bar leaflet-control')
      const button = L.DomUtil.create('a', 'leaflet-control-screenshot-btn', container)
      button.href = '#'
      button.title = '地图截图保存 (Alt+Shift+S / ⌥+⇧+S)'
      button.role = 'button'
      button.style.display = 'flex'
      button.style.alignItems = 'center'
      button.style.justifyContent = 'center'
      button.style.width = '30px'
      button.style.height = '30px'
      button.style.background = 'transparent'
      button.style.color = 'inherit'
      button.innerHTML = `
        <svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      `

      L.DomEvent.disableClickPropagation(container)
      L.DomEvent.disableScrollPropagation(container)

      // 使用原生捕获模式 (capture: true)，确保在事件分发给 Leaflet 前优先处理，防止被 Leaflet 手势或地图点击拦截
      const handleScreenshotClick = (e) => {
        e.stopPropagation()
        e.preventDefault()
        triggerMapScreenshot(map)
      }

      container.addEventListener('click', handleScreenshotClick, true)
      button.addEventListener('click', handleScreenshotClick, true)

      // 阻止 mousedown/touchstart/pointerdown 阶段冒泡，避免被 Leaflet 地图误认作拖拽或缩放操作
      const preventDefaultPropagation = (e) => {
        e.stopPropagation()
      }
      container.addEventListener('mousedown', preventDefaultPropagation, true)
      container.addEventListener('touchstart', preventDefaultPropagation, true)
      container.addEventListener('pointerdown', preventDefaultPropagation, true)

      return container
    }
  })

  new ScreenshotControl().addTo(map)
}

window.triggerMapScreenshot = triggerMapScreenshot
