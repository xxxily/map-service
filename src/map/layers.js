import L from 'leaflet'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@maplibre/maplibre-gl-leaflet'
import { writeMapViewToUrl } from './url-state.js'

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

function createTileLayer (url, options) {
  return L.tileLayer(url, {
    minZoom: 3,
    keepBuffer: 10,
    preloadBuffer: 256, // 预先向四周多加载 1 圈瓦片
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

function loadHtml2Canvas () {
  if (window.html2canvas) return Promise.resolve(window.html2canvas)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'
    script.onload = () => resolve(window.html2canvas)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export function triggerMapScreenshot (map) {
  const toast = document.createElement('div')
  toast.className = 'screenshot-toast'
  toast.innerText = '正在生成地图截图...'
  document.body.appendChild(toast)

  loadHtml2Canvas().then(html2canvas => {
    const mapContainer = map.getContainer()
    const elementsToHide = [
      mapContainer.querySelector('.leaflet-control-container'),
      document.getElementById('map-menu'),
      document.getElementById('guideline-toolbar'),
      document.getElementById('kml-panel'),
      ...document.querySelectorAll('.amap-sug-result')
    ]

    const hideElements = () => {
      elementsToHide.forEach(el => {
        if (el) el.style.setProperty('display', 'none', 'important')
      })
    }
    const restoreElements = () => {
      elementsToHide.forEach(el => {
        if (el) el.style.removeProperty('display')
      })
    }

    // foreignObjectRendering 让浏览器原生渲染 DOM 快照：修复地图旋转
    // (bearing ≠ 0) 时 Leaflet SVG 线段在默认计算渲染模式下丢失的问题。
    // 不支持 foreignObject 的浏览器回退到默认渲染模式重试一次。
    const captureOptions = {
      useCORS: true,
      foreignObjectRendering: true,
      logging: false,
      backgroundColor: null,
      ignoreElements: (element) => {
        if (element.classList.contains('leaflet-control-container') ||
            element.id === 'map-menu' ||
            element.id === 'guideline-toolbar' ||
            element.id === 'kml-panel') {
          return true
        }
        return false
      }
    }

    const renderCanvas = (options) => new Promise((resolve, reject) => {
      window.requestAnimationFrame(() => {
        html2canvas(mapContainer, options).then(resolve, reject)
      })
    })

    hideElements()
    renderCanvas(captureOptions)
      .catch(() => renderCanvas({ ...captureOptions, foreignObjectRendering: false }))
      .then(canvas => {
        restoreElements()
        toast.remove()

        const dataUrl = canvas.toDataURL('image/png')
        const link = document.createElement('a')
        const timeStr = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-')
        link.download = `map_screenshot_${timeStr}.png`
        link.href = dataUrl
        link.click()

        const showToast = (text, bg) => {
          const t = document.createElement('div')
          t.className = 'screenshot-toast'
          if (bg) t.style.background = bg
          t.innerText = text
          document.body.appendChild(t)
          setTimeout(() => t.remove(), 3500)
        }

        if (navigator.clipboard && window.ClipboardItem) {
          canvas.toBlob(blob => {
            if (!blob) {
              showToast('截图已下载')
              return
            }
            try {
              const item = new ClipboardItem({ 'image/png': blob })
              navigator.clipboard.write([item]).then(() => {
                showToast('截图已保存并已复制到剪贴板！', '#0f766e')
              }).catch(err => {
                console.warn('复制到剪贴板失败，可能由于安全域/权限限制:', err)
                showToast('截图已下载 (浏览器安全限制，无法自动复制)', '#d97706')
              })
            } catch (err) {
              console.warn('创建 ClipboardItem 失败:', err)
              showToast('截图已下载')
            }
          }, 'image/png')
        } else {
          showToast('截图已下载 (当前浏览器不支持剪贴板图片写入)', '#0f766e')
        }
      }).catch(err => {
        restoreElements()
        toast.remove()
        console.error('截图失败:', err)

        const errorToast = document.createElement('div')
        errorToast.className = 'screenshot-toast'
        errorToast.style.background = '#dc2626'
        errorToast.innerText = '截图生成失败，请重试'
        document.body.appendChild(errorToast)
        setTimeout(() => errorToast.remove(), 3000)
      })
  }).catch(err => {
    toast.remove()
    console.error('加载 html2canvas 失败:', err)
  })
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
