import L from 'leaflet'
import { tileRelayEndpoint } from '../config.js'
import { writeMapViewToUrl } from './url-state.js'

const DEFAULT_LAYER_NAME = '高德/卫星'

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

function relayTileUrl (targetUrl) {
  const encodedTarget = encodeURIComponent(targetUrl)
    .replace(/%7B/g, '{')
    .replace(/%7D/g, '}')

  return `${tileRelayEndpoint}?url=${encodedTarget}`
}

const isRetina = L.Browser.retina
const autonaviScale = isRetina ? '2' : '1'
const googleScale = isRetina ? '2' : '1'

const googleSatellite = relayTileUrl(`https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}&scale=${googleScale}`)
const googleStreet = relayTileUrl(`https://www.google.com/maps/vt?lyrs=m@189&gl=cn&x={x}&y={y}&z={z}&scale=${googleScale}`)
const autonaviSatellite = relayTileUrl(`https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=6&x={x}&y={y}&z={z}&scl=${autonaviScale}`)
const autonaviRoad = relayTileUrl(`https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}&scl=${autonaviScale}`)

function createTileLayer (url, options) {
  return L.tileLayer(url, {
    minZoom: 3,
    keepBuffer: 10,
    preloadBuffer: 256, // 预先向四周多加载 1 圈瓦片
    ...options,
  })
}

export function initLayerControl (map, initialLayerName = '') {
  // 从 localStorage 获取用户上一次选择的图层，默认使用 '高德/卫星'
  let savedLayerName = DEFAULT_LAYER_NAME
  try {
    savedLayerName = localStorage.getItem('last_map_layer') || DEFAULT_LAYER_NAME
  } catch (e) {
    console.error('Failed to read last_map_layer from localStorage', e)
  }

  const mapLayers = {
    '高德/卫星': L.layerGroup([
      createTileLayer(autonaviSatellite, {
        maxZoom: 20,
        maxNativeZoom: 18,
        attribution: '高德地图 AutoNavi.com',
        subdomains: '1234',
      }),
      createTileLayer(autonaviRoad, {
        maxZoom: 20,
        maxNativeZoom: 18,
        subdomains: '1234',
        opacity: 0.5,
      }),
    ]),

    '高德/街道': createTileLayer(autonaviRoad, {
      maxZoom: 20,
      maxNativeZoom: 18,
      attribution: '高德地图 AutoNavi.com',
      subdomains: '1234',
    }),

    '谷歌高德/卫星': L.layerGroup([
      createTileLayer(googleSatellite, {
        maxZoom: 22,
        attribution: '谷歌提供卫星图，高德提供街道图',
      }),
      createTileLayer(autonaviRoad, {
        maxZoom: 22,
        maxNativeZoom: 18,
        attribution: '高德地图 AutoNavi.com',
        subdomains: '1234',
        opacity: 0.8,
      }),
    ]),

    '谷歌/卫星': createTileLayer(googleSatellite, {
      maxZoom: 22,
      attribution: '谷歌 Google',
    }),

    '谷歌/街道': createTileLayer(googleStreet, {
      maxZoom: 22,
      attribution: '谷歌 Google',
    }),
  }

  // 渲染选中的默认图层
  const activeLayerName = [initialLayerName, savedLayerName, DEFAULT_LAYER_NAME].find(name => mapLayers[name]) || DEFAULT_LAYER_NAME
  map._activeLayerName = activeLayerName
  mapLayers[activeLayerName].addTo(map)

  const layerControl = L.control.layers(mapLayers, {}, {
    position: 'topright',
    collapsed: true,
  }).addTo(map)

  // 监听基准底图切换事件，将用户当前选择记录进本地缓存中
  map.on('baselayerchange', (event) => {
    map._activeLayerName = event.name
    try {
      localStorage.setItem('last_map_layer', event.name)
    } catch (e) {
      console.error('Failed to save last_map_layer to localStorage', e)
    }
    writeMapViewToUrl(map, { layerName: event.name })
  })

  layerControl._container.style.display = 'none'
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

    elementsToHide.forEach(el => {
      if (el) el.style.setProperty('display', 'none', 'important')
    })

    window.requestAnimationFrame(() => {
      html2canvas(mapContainer, {
        useCORS: true,
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
      }).then(canvas => {
        elementsToHide.forEach(el => {
          if (el) el.style.removeProperty('display')
        })
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
        elementsToHide.forEach(el => {
          if (el) el.style.removeProperty('display')
        })
        toast.remove()
        console.error('截图失败:', err)

        const errorToast = document.createElement('div')
        errorToast.className = 'screenshot-toast'
        errorToast.style.background = '#dc2626'
        errorToast.innerText = '截图生成失败，请重试'
        document.body.appendChild(errorToast)
        setTimeout(() => errorToast.remove(), 3000)
      })
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
      button.title = '地图截图保存 (Alt+S / ⌥+S)'
      button.role = 'button'
      button.style.display = 'flex'
      button.style.alignItems = 'center'
      button.style.justifyContent = 'center'
      button.style.width = '30px'
      button.style.height = '30px'
      button.style.background = '#fff'
      button.style.color = '#0f766e'
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
