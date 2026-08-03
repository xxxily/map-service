import html2canvas from 'html2canvas'

const HIDDEN_ELEMENT_SELECTORS = [
  '.leaflet-control-container',
  '#map-menu',
  '#guideline-toolbar',
  '#kml-panel',
  '.amap-sug-result',
]

const OVERLAY_SELECTORS = [
  '.leaflet-marker-icon',
  '.leaflet-marker-shadow',
  '.leaflet-tooltip',
  '.leaflet-popup',
]

const screenshotTasks = new WeakMap()

function showScreenshotToast (text, backgroundColor = '') {
  const toast = document.createElement('div')
  toast.className = 'screenshot-toast'
  if (backgroundColor) toast.style.background = backgroundColor
  toast.innerText = text
  document.body.appendChild(toast)
  return toast
}

function nextFrame () {
  return new Promise(resolve => window.requestAnimationFrame(resolve))
}

function waitForImage (image, timeoutMs = 5000) {
  const isCanvas = image?.tagName === 'CANVAS'
  if (isCanvas && image.dataset?.tileReady) return Promise.resolve()
  if (!isCanvas && image.complete && image.naturalWidth > 0) return Promise.resolve()
  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      image.removeEventListener('load', finish)
      image.removeEventListener('error', finish)
      resolve()
    }
    const timer = window.setTimeout(finish, timeoutMs)
    image.addEventListener('load', finish, { once: true })
    image.addEventListener('error', finish, { once: true })
  })
}

async function waitForMapImages (mapContainer) {
  const images = [...mapContainer.querySelectorAll('.leaflet-tile, .leaflet-marker-icon, .leaflet-marker-shadow')]
  await Promise.all(images.map(image => waitForImage(image)))
}

function canvasToBlob (canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}

function getElementTransformMatrix (element) {
  const transform = window.getComputedStyle(element).transform
  return !transform || transform === 'none'
    ? new DOMMatrix()
    : new DOMMatrix(transform)
}

export function getElementVisualMatrix (element, stopElement) {
  const chain = []
  let current = element
  while (current && current !== stopElement) {
    chain.push(current)
    current = current.parentElement
  }

  let matrix = new DOMMatrix()
  for (let index = chain.length - 1; index >= 0; index--) {
    const currentElement = chain[index]
    const styles = window.getComputedStyle(currentElement)
    // SVGGraphicsElement 没有 HTMLElement 的 offsetLeft/offsetTop；这里必须
    // 显式回退为 0，否则矩阵会被 NaN 污染，KML 矢量层会整层消失。
    const offsetLeft = Number.isFinite(currentElement.offsetLeft) ? currentElement.offsetLeft : 0
    const offsetTop = Number.isFinite(currentElement.offsetTop) ? currentElement.offsetTop : 0
    const marginLeft = Number.parseFloat(styles.marginLeft) || 0
    const marginTop = Number.parseFloat(styles.marginTop) || 0
    const transform = getElementTransformMatrix(currentElement)
    const transformOriginParts = styles.transformOrigin.split(/\s+/)
    const originX = Number.parseFloat(transformOriginParts[0]) || 0
    const originY = Number.parseFloat(transformOriginParts[1]) || 0

    matrix = matrix
      .translate(offsetLeft + marginLeft, offsetTop + marginTop)
      .translate(originX, originY)
      .multiply(transform)
      .translate(-originX, -originY)
  }
  return matrix
}

function getElementVisualOpacity (element, stopElement) {
  let opacity = 1
  let current = element
  while (current && current !== stopElement) {
    const styles = window.getComputedStyle(current)
    if (styles.display === 'none' || styles.visibility === 'hidden') return 0
    const currentOpacity = Number.parseFloat(styles.opacity)
    if (Number.isFinite(currentOpacity)) opacity *= currentOpacity
    current = current.parentElement
  }
  return opacity
}

function drawTransformedImage (context, image, mapContainer) {
  const isCanvas = image?.tagName === 'CANVAS'
  if (isCanvas && image.dataset?.tileReady === 'error') return false
  if (!isCanvas && (!image.complete || image.naturalWidth <= 0)) return false
  const opacity = getElementVisualOpacity(image, mapContainer)
  if (opacity <= 0) return false

  const width = image.offsetWidth || image.width || image.naturalWidth
  const height = image.offsetHeight || image.height || image.naturalHeight
  const matrix = getElementVisualMatrix(image, mapContainer)
  context.save()
  context.globalAlpha = opacity
  context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
  context.drawImage(image, 0, 0, width, height)
  context.restore()
  return true
}

function createRasterLayerCanvas (mapContainer, images) {
  const canvas = document.createElement('canvas')
  canvas.width = mapContainer.clientWidth
  canvas.height = mapContainer.clientHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  let drawn = 0
  for (const image of images) {
    if (drawTransformedImage(context, image, mapContainer)) drawn++
  }
  return drawn > 0 ? canvas : null
}

function cloneSvgForRasterization (svg) {
  const clone = svg.cloneNode(true)
  const viewBox = svg.viewBox?.baseVal
  const width = Number.parseFloat(svg.getAttribute('width')) || svg.clientWidth || viewBox?.width || 0
  const height = Number.parseFloat(svg.getAttribute('height')) || svg.clientHeight || viewBox?.height || 0
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.style.transform = 'none'
  clone.style.transformOrigin = '0 0'
  return { clone, width, height }
}

function svgToImage (svg) {
  const { clone, width, height } = cloneSvgForRasterization(svg)
  return new Promise(resolve => {
    const image = new Image()
    image.onload = () => resolve({ image, width, height })
    image.onerror = () => resolve(null)
    const source = new XMLSerializer().serializeToString(clone)
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
  })
}

async function createVectorLayerCanvas (mapContainer, svgs) {
  const rendered = await Promise.all(svgs.map(svgToImage))
  const canvas = document.createElement('canvas')
  canvas.width = mapContainer.clientWidth
  canvas.height = mapContainer.clientHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  let drawn = 0

  svgs.forEach((svg, index) => {
    const item = rendered[index]
    if (!item) return
    const opacity = getElementVisualOpacity(svg, mapContainer)
    if (opacity <= 0) return
    const matrix = getElementVisualMatrix(svg, mapContainer)
    context.save()
    context.globalAlpha = opacity
    context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
    context.drawImage(item.image, 0, 0, item.width, item.height)
    context.restore()
    drawn++
  })

  return drawn > 0 ? canvas : null
}

function createOverlayClone (mapContainer, overlayElements) {
  const overlay = document.createElement('div')
  overlay.setAttribute('data-map-screenshot-overlay', '')
  overlay.style.position = 'absolute'
  overlay.style.inset = '0'
  overlay.style.overflow = 'hidden'
  overlay.style.pointerEvents = 'none'
  const mapRect = mapContainer.getBoundingClientRect()

  for (const element of overlayElements) {
    const rect = element.getBoundingClientRect()
    if (rect.right <= mapRect.left || rect.bottom <= mapRect.top || rect.left >= mapRect.right || rect.top >= mapRect.bottom) {
      continue
    }
    const clone = element.cloneNode(true)
    clone.style.position = 'absolute'
    clone.style.left = `${rect.left - mapRect.left}px`
    clone.style.top = `${rect.top - mapRect.top}px`
    clone.style.width = `${rect.width}px`
    clone.style.height = `${rect.height}px`
    clone.style.margin = '0'
    clone.style.transform = 'none'
    clone.style.transformOrigin = '0 0'
    clone.style.zIndex = window.getComputedStyle(element).zIndex
    clone.style.opacity = String(getElementVisualOpacity(element, mapContainer))
    overlay.appendChild(clone)
  }
  return overlay
}

function applyScreenshotClone (clonedDoc, layerCanvases, overlayClone) {
  const clonedMap = clonedDoc.getElementById('map')
  if (!clonedMap) return

  const clonedMapPane = clonedMap.querySelector('.leaflet-map-pane')
  if (clonedMapPane) clonedMapPane.style.display = 'none'

  const snapshotRoot = clonedDoc.createElement('div')
  snapshotRoot.setAttribute('data-map-screenshot-root', '')
  snapshotRoot.style.position = 'absolute'
  snapshotRoot.style.inset = '0'
  snapshotRoot.style.overflow = 'hidden'
  snapshotRoot.style.pointerEvents = 'none'

  for (const layerCanvas of layerCanvases) {
    if (!layerCanvas) continue
    layerCanvas.style.position = 'absolute'
    layerCanvas.style.inset = '0'
    layerCanvas.style.width = '100%'
    layerCanvas.style.height = '100%'
    snapshotRoot.appendChild(layerCanvas)
  }
  snapshotRoot.appendChild(overlayClone.cloneNode(true))
  clonedMap.insertBefore(snapshotRoot, clonedMap.firstChild)
}

function createCaptureOptions (layerCanvases, overlayClone) {
  return {
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: null,
    ignoreElements: element => HIDDEN_ELEMENT_SELECTORS.some(selector => element.matches?.(selector)),
    onclone: clonedDoc => applyScreenshotClone(clonedDoc, layerCanvases, overlayClone),
  }
}

async function buildScreenshotLayers (mapContainer) {
  await waitForMapImages(mapContainer)
  await nextFrame()

  const tileCanvas = createRasterLayerCanvas(
    mapContainer,
    [...mapContainer.querySelectorAll('.leaflet-tile')]
  )
  const vectorCanvas = await createVectorLayerCanvas(
    mapContainer,
    [...mapContainer.querySelectorAll('.leaflet-overlay-pane svg')]
  )
  const overlayClone = createOverlayClone(
    mapContainer,
    [...mapContainer.querySelectorAll(OVERLAY_SELECTORS.join(','))]
  )

  return { layerCanvases: [tileCanvas, vectorCanvas], overlayClone }
}

function downloadCanvas (canvas) {
  const link = document.createElement('a')
  const timeStr = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-')
  link.download = `map_screenshot_${timeStr}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

async function copyCanvasToClipboard (canvas) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    const toast = showScreenshotToast('截图已下载 (当前浏览器不支持剪贴板图片写入)', '#0f766e')
    window.setTimeout(() => toast.remove(), 3500)
    return
  }

  const blob = await canvasToBlob(canvas)
  if (!blob) {
    const toast = showScreenshotToast('截图已下载')
    window.setTimeout(() => toast.remove(), 3500)
    return
  }

  try {
    const item = new window.ClipboardItem({ 'image/png': blob })
    await navigator.clipboard.write([item])
    const toast = showScreenshotToast('截图已保存并已复制到剪贴板！', '#0f766e')
    window.setTimeout(() => toast.remove(), 3500)
  } catch (err) {
    console.warn('复制到剪贴板失败，可能由于安全域/权限限制:', err)
    const toast = showScreenshotToast('截图已下载 (浏览器安全限制，无法自动复制)', '#d97706')
    window.setTimeout(() => toast.remove(), 3500)
  }
}

export async function captureMapCanvas (map, options = {}) {
  const mapContainer = map.getContainer()
  const renderer = options.renderer || html2canvas
  const { layerCanvases, overlayClone } = await buildScreenshotLayers(mapContainer)
  await nextFrame()
  return renderer(mapContainer, createCaptureOptions(layerCanvases, overlayClone))
}

async function runMapScreenshot (map) {
  const progressToast = showScreenshotToast('正在生成地图截图...')
  try {
    const canvas = await captureMapCanvas(map)
    downloadCanvas(canvas)
    await copyCanvasToClipboard(canvas)
  } catch (err) {
    console.error('截图失败:', err)
    const toast = showScreenshotToast('截图生成失败，请重试', '#dc2626')
    window.setTimeout(() => toast.remove(), 3000)
  } finally {
    progressToast.remove()
  }
}

export function triggerMapScreenshot (map) {
  const currentTask = screenshotTasks.get(map)
  if (currentTask) return currentTask

  const task = runMapScreenshot(map).finally(() => screenshotTasks.delete(map))
  screenshotTasks.set(map, task)
  return task
}
