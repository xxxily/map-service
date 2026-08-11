import Panzoom from '@panzoom/panzoom/dist/panzoom.es.js'
import {
  clampMediaPreviewScale,
  getWrappedMediaIndex,
  MEDIA_PREVIEW_MAX_SCALE,
  MEDIA_PREVIEW_MIN_SCALE,
  normalizeMediaPreviewItems,
} from './media-preview-state.js'

const TYPE_LABELS = {
  image: '图片',
  video: '视频',
  audio: '音频',
  iframe: '页面',
}

let activeItems = []
let activeIndex = 0
let previousFocus = null
let panzoom = null
let panzoomWheelTarget = null
let panzoomWheelHandler = null
let previewRoot = null
let renderGeneration = 0
let hlsInstance = null
let isMinimized = false
let activeCollectionTitle = ''
let trackObserver = null
let activeItemChangeHandler = null

function prefersReducedMotion () {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function getItemTitle (item) {
  return String(item?.title || TYPE_LABELS[item?.type] || '媒体预览')
}

function getDisplayUrl (item) {
  if (item?.displayUrl) return String(item.displayUrl)
  try {
    return new URL(item?.url).hostname
  } catch {
    return ''
  }
}

function getMediaSourceUrl (item) {
  return String(item?.renderUrl || item?.url || '')
}

function getOriginalContentUrl (item) {
  return String(item?.canonicalUrl || item?.sourceUrl || item?.url || '')
}

function getItemTypeIcon (type) {
  return {
    video: '▶',
    audio: '♪',
    iframe: '▣',
  }[type] || '◫'
}

function isHlsUrl (url) {
  return /\.m3u8(?:$|[?#])/i.test(String(url || ''))
}

function createPreviewRoot () {
  const root = document.createElement('div')
  root.id = 'app-media-preview'
  root.className = 'media-preview-root'
  root.hidden = true
  root.setAttribute('aria-hidden', 'true')
  root.innerHTML = `
    <section class="media-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="media-preview-title">
      <header class="media-preview-header">
        <div class="media-preview-heading">
          <span class="media-preview-collection" data-media-preview-collection></span>
          <span class="media-preview-kind" data-media-preview-kind></span>
          <h2 id="media-preview-title" data-media-preview-title></h2>
          <span class="media-preview-position" data-media-preview-position aria-live="polite"></span>
        </div>
        <div class="media-preview-header-actions">
          <button type="button" class="media-preview-icon-button media-preview-minimize" data-media-preview-action="minimize" aria-label="收缩为小窗" title="收缩为小窗">⌟</button>
          <a class="media-preview-source" data-media-preview-source target="_blank" rel="noopener noreferrer" title="打开原始文件">
            <span class="media-preview-source-label">原始文件</span><span aria-hidden="true">↗</span>
          </a>
          <button type="button" class="media-preview-icon-button media-preview-close" data-media-preview-action="close" aria-label="关闭预览" title="关闭预览">×</button>
        </div>
      </header>
      <div class="media-preview-stage" data-media-preview-stage tabindex="0" aria-label="媒体查看区域，使用方向键切换">
        <button type="button" class="media-preview-nav media-preview-nav-previous" data-media-preview-action="previous" aria-label="上一项" title="上一项">‹</button>
        <div class="media-preview-content" data-media-preview-content></div>
        <button type="button" class="media-preview-nav media-preview-nav-next" data-media-preview-action="next" aria-label="下一项" title="下一项">›</button>
      </div>
      <nav class="media-preview-track" data-media-preview-track aria-label="KML 媒体浏览轨道"></nav>
      <footer class="media-preview-footer">
        <div class="media-preview-zoom-controls" data-media-preview-zoom-controls hidden>
          <button type="button" class="media-preview-icon-button" data-media-preview-action="zoom-out" aria-label="缩小" title="缩小">−</button>
          <input type="range" min="1" max="6" step="0.01" value="1" data-media-preview-zoom aria-label="图片缩放比例">
          <output data-media-preview-zoom-output>100%</output>
          <button type="button" class="media-preview-icon-button" data-media-preview-action="zoom-in" aria-label="放大" title="放大">+</button>
          <button type="button" class="media-preview-icon-button media-preview-reset" data-media-preview-action="reset" aria-label="复位图片" title="复位图片">↺</button>
        </div>
        <div class="media-preview-meta">
          <strong data-media-preview-caption></strong>
          <span data-media-preview-url></span>
        </div>
      </footer>
      <button type="button" class="media-preview-restore" data-media-preview-action="restore" aria-label="展开媒体预览" title="展开媒体预览">
        <span class="media-preview-restore-icon" aria-hidden="true">▣</span>
        <span class="media-preview-restore-copy"><strong data-media-preview-restore-title>媒体预览</strong><small data-media-preview-restore-position></small></span>
        <span aria-hidden="true">↗</span>
      </button>
    </section>
  `
  root.addEventListener('click', onRootClick)
  root.addEventListener('input', onRootInput)
  document.body.appendChild(root)
  return root
}

function ensurePreviewRoot () {
  previewRoot ||= document.getElementById('app-media-preview') || createPreviewRoot()
  return previewRoot
}

function getPreviewElement (selector) {
  return ensurePreviewRoot().querySelector(selector)
}

function setText (selector, value) {
  const element = getPreviewElement(selector)
  if (element) element.textContent = value
}

function cleanupPanzoom () {
  if (panzoomWheelTarget && panzoomWheelHandler) {
    panzoomWheelTarget.removeEventListener('wheel', panzoomWheelHandler)
  }
  panzoom?.destroy()
  panzoom = null
  panzoomWheelTarget = null
  panzoomWheelHandler = null
}

function cleanupCurrentMedia () {
  cleanupPanzoom()
  hlsInstance?.destroy()
  hlsInstance = null
  const content = getPreviewElement('[data-media-preview-content]')
  content?.querySelectorAll('video, audio').forEach(media => {
    media.pause()
    media.removeAttribute('src')
    media.load()
  })
  content?.querySelectorAll('iframe').forEach(frame => frame.removeAttribute('src'))
  content?.replaceChildren()
}

function cleanupTrackObserver () {
  trackObserver?.disconnect()
  trackObserver = null
}

function renderLoadError (message, generation) {
  if (generation !== renderGeneration || previewRoot?.hidden) return
  const content = getPreviewElement('[data-media-preview-content]')
  if (!content) return
  const status = document.createElement('div')
  status.className = 'media-preview-load-error'
  status.setAttribute('role', 'status')
  status.textContent = message
  content.replaceChildren(status)
}

function syncZoomControls (scale) {
  const normalizedScale = clampMediaPreviewScale(scale)
  const slider = getPreviewElement('[data-media-preview-zoom]')
  const output = getPreviewElement('[data-media-preview-zoom-output]')
  const stage = getPreviewElement('[data-media-preview-stage]')
  if (slider) slider.value = String(normalizedScale)
  if (output) output.textContent = `${Math.round(normalizedScale * 100)}%`
  stage?.classList.toggle('is-zoomed', normalizedScale > MEDIA_PREVIEW_MIN_SCALE + 0.01)
}

function setImageScale (scale, animate = !prefersReducedMotion()) {
  if (!panzoom) return
  panzoom.zoom(clampMediaPreviewScale(scale), { animate })
}

function resetImage (animate = !prefersReducedMotion()) {
  if (!panzoom) return
  panzoom.reset({ animate })
  syncZoomControls(MEDIA_PREVIEW_MIN_SCALE)
}

function initializeImagePanzoom (image, canvas) {
  cleanupPanzoom()
  panzoom = Panzoom(image, {
    canvas: true,
    minScale: MEDIA_PREVIEW_MIN_SCALE,
    maxScale: MEDIA_PREVIEW_MAX_SCALE,
    startScale: MEDIA_PREVIEW_MIN_SCALE,
    step: 0.2,
    duration: prefersReducedMotion() ? 0 : 160,
    panOnlyWhenZoomed: true,
    pinchAndPan: true,
    cursor: 'grab',
  })
  image.addEventListener('panzoomchange', event => syncZoomControls(event.detail?.scale ?? panzoom?.getScale()))
  canvas.addEventListener('dblclick', event => {
    event.preventDefault()
    const scale = panzoom?.getScale() || MEDIA_PREVIEW_MIN_SCALE
    setImageScale(scale > 1.05 ? MEDIA_PREVIEW_MIN_SCALE : 2)
  })
  panzoomWheelTarget = canvas
  panzoomWheelHandler = panzoom.zoomWithWheel
  canvas.addEventListener('wheel', panzoomWheelHandler, { passive: false })
  syncZoomControls(MEDIA_PREVIEW_MIN_SCALE)
}

function renderImage (item, generation) {
  const content = getPreviewElement('[data-media-preview-content]')
  if (!content) return
  const canvas = document.createElement('div')
  canvas.className = 'media-preview-image-canvas'
  const image = document.createElement('img')
  image.className = 'media-preview-image'
  image.alt = getItemTitle(item)
  image.draggable = false
  image.referrerPolicy = 'no-referrer'
  image.addEventListener('load', () => {
    if (generation === renderGeneration && image.isConnected) initializeImagePanzoom(image, canvas)
  }, { once: true })
  image.addEventListener('error', () => renderLoadError('图片加载失败', generation), { once: true })
  image.src = getMediaSourceUrl(item)
  canvas.appendChild(image)
  content.appendChild(canvas)
}

async function attachHlsVideo (video, sourceUrl, generation) {
  try {
    const { default: Hls } = await import('hls.js')
    if (generation !== renderGeneration || !video.isConnected) return
    if (!Hls.isSupported()) {
      video.src = sourceUrl
      return
    }
    hlsInstance = new Hls({ enableWorker: true })
    hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
      if (data?.fatal) {
        hlsInstance?.destroy()
        hlsInstance = null
        renderLoadError('HLS 视频加载失败', generation)
      }
    })
    hlsInstance.loadSource(sourceUrl)
    hlsInstance.attachMedia(video)
  } catch {
    if (generation === renderGeneration && video.isConnected) video.src = sourceUrl
  }
}

function renderVideo (item, generation) {
  const content = getPreviewElement('[data-media-preview-content]')
  if (!content) return
  const video = document.createElement('video')
  video.className = 'media-preview-video'
  video.controls = true
  video.autoplay = true
  video.playsInline = true
  video.preload = 'metadata'
  video.referrerPolicy = 'no-referrer'
  video.addEventListener('error', () => renderLoadError('视频加载失败', generation), { once: true })
  const sourceUrl = getMediaSourceUrl(item)
  if (isHlsUrl(sourceUrl) && !video.canPlayType('application/vnd.apple.mpegurl')) {
    attachHlsVideo(video, sourceUrl, generation)
  } else {
    video.src = sourceUrl
  }
  content.appendChild(video)
  const playVideo = () => {
    if (generation !== renderGeneration || !video.isConnected) return
    video.muted = false
    const playAttempt = video.play()
    if (playAttempt?.catch) {
      playAttempt.catch(() => {
        if (generation !== renderGeneration || !video.isConnected) return
        video.muted = true
        video.play().catch(() => {})
      })
    }
  }
  playVideo()
  video.addEventListener('loadedmetadata', playVideo, { once: true })
}

function renderAudio (item, generation) {
  const content = getPreviewElement('[data-media-preview-content]')
  if (!content) return
  const shell = document.createElement('div')
  shell.className = 'media-preview-audio-shell'
  const icon = document.createElement('span')
  icon.className = 'media-preview-audio-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = '♪'
  const audio = document.createElement('audio')
  audio.controls = true
  audio.preload = 'metadata'
  audio.addEventListener('error', () => renderLoadError('音频加载失败', generation), { once: true })
  audio.src = getMediaSourceUrl(item)
  shell.append(icon, audio)
  content.appendChild(shell)
}

function renderIframe (item) {
  const content = getPreviewElement('[data-media-preview-content]')
  if (!content) return
  const policy = item.embedPolicy || {}
  const shell = document.createElement('div')
  shell.className = 'media-preview-iframe-shell'
  if (item.provider) shell.dataset.provider = String(item.provider)
  const frame = document.createElement('iframe')
  frame.className = 'media-preview-iframe'
  frame.title = getItemTitle(item)
  frame.loading = 'eager'
  frame.referrerPolicy = policy.referrerPolicy || 'no-referrer'
  frame.setAttribute('sandbox', policy.sandbox || 'allow-scripts allow-forms allow-popups')
  if (policy.allow) frame.setAttribute('allow', policy.allow)
  if (policy.allowFullscreen) frame.allowFullscreen = true
  frame.src = getMediaSourceUrl(item)
  shell.appendChild(frame)
  content.appendChild(shell)
}

function renderMediaTrack () {
  const track = getPreviewElement('[data-media-preview-track]')
  if (!track) return
  cleanupTrackObserver()
  const signature = activeItems.map(item => item.galleryId || `${item.type}:${item.url}`).join('|')
  const needsBuild = track.children.length !== activeItems.length || track.dataset.signature !== signature
  if (needsBuild) {
    track.replaceChildren()
    track.dataset.signature = signature
  }
  activeItems.forEach((item, index) => {
    if (!needsBuild) {
      const existing = track.children[index]
      if (existing) {
        existing.classList.toggle('is-active', index === activeIndex)
        existing.tabIndex = index === activeIndex ? 0 : -1
        existing.setAttribute('aria-current', index === activeIndex ? 'true' : 'false')
        return
      }
    }
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'media-preview-track-item'
    button.dataset.mediaPreviewAction = 'select'
    button.dataset.mediaPreviewIndex = String(index)
    button.tabIndex = index === activeIndex ? 0 : -1
    button.setAttribute('aria-current', index === activeIndex ? 'true' : 'false')
    button.setAttribute('aria-label', `查看第 ${index + 1} 项，${TYPE_LABELS[item.type] || '媒体'}：${getItemTitle(item)}`)
    button.title = `${getItemTitle(item)} · ${item.featureName || ''}`
    if (item.type === 'image') {
      const image = document.createElement('img')
      const imageUrl = String(item.thumbnailUrl || item.renderUrl || item.url || '')
      image.alt = ''
      image.loading = 'lazy'
      image.referrerPolicy = 'no-referrer'
      image.addEventListener('error', () => button.classList.add('is-load-error'), { once: true })
      if ('IntersectionObserver' in window) {
        image.dataset.src = imageUrl
      } else {
        image.src = imageUrl
      }
      button.appendChild(image)
    } else {
      const icon = document.createElement('span')
      icon.className = `media-preview-track-icon media-preview-track-icon-${item.type}`
      icon.setAttribute('aria-hidden', 'true')
      icon.textContent = getItemTypeIcon(item.type)
      button.appendChild(icon)
    }
    const marker = document.createElement('span')
    marker.className = 'media-preview-track-marker'
    marker.textContent = String(index + 1).padStart(2, '0')
    button.appendChild(marker)
    track.appendChild(button)
  })
  if ('IntersectionObserver' in window) {
    trackObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        const image = entry.target
        image.src = image.dataset.src || ''
        image.removeAttribute('data-src')
        trackObserver?.unobserve(image)
      })
    }, { root: track, rootMargin: '0px 160px' })
    track.querySelectorAll('img[data-src]').forEach(image => trackObserver.observe(image))
  }
  track.querySelectorAll('.media-preview-track-item').forEach((button, index) => {
    button.classList.toggle('is-active', index === activeIndex)
    button.tabIndex = index === activeIndex ? 0 : -1
    button.setAttribute('aria-current', index === activeIndex ? 'true' : 'false')
  })
  const activeButton = track.querySelector('.media-preview-track-item.is-active')
  activeButton?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
}

function renderActiveItem () {
  const generation = ++renderGeneration
  cleanupCurrentMedia()
  const item = activeItems[activeIndex]
  if (!item) return

  const root = ensurePreviewRoot()
  const source = getPreviewElement('[data-media-preview-source]')
  const previousButton = getPreviewElement('[data-media-preview-action="previous"]')
  const nextButton = getPreviewElement('[data-media-preview-action="next"]')
  const zoomControls = getPreviewElement('[data-media-preview-zoom-controls]')
  const typeLabel = TYPE_LABELS[item.type] || '媒体'
  const title = getItemTitle(item)

  root.dataset.mediaType = item.type
  root.dataset.mediaIndex = String(activeIndex)
  setText('[data-media-preview-kind]', typeLabel)
  setText('[data-media-preview-collection]', activeCollectionTitle || item.kmlName || '媒体预览')
  setText('[data-media-preview-title]', title)
  setText('[data-media-preview-position]', activeItems.length > 1 ? `${activeIndex + 1} / ${activeItems.length}` : '单项')
  setText('[data-media-preview-caption]', title)
  setText('[data-media-preview-url]', getDisplayUrl(item))
  setText('[data-media-preview-restore-title]', title)
  setText('[data-media-preview-restore-position]', `${activeIndex + 1} / ${activeItems.length}`)
  if (source) {
    source.href = getOriginalContentUrl(item)
    source.title = item.type === 'iframe' ? '打开原始页面' : '打开原始文件'
  }
  setText('.media-preview-source-label', item.type === 'iframe' ? '原始页面' : '原始文件')
  const hasMultipleItems = activeItems.length > 1
  if (previousButton) previousButton.hidden = !hasMultipleItems
  if (nextButton) nextButton.hidden = !hasMultipleItems
  if (zoomControls) zoomControls.hidden = item.type !== 'image'
  syncZoomControls(MEDIA_PREVIEW_MIN_SCALE)
  renderMediaTrack()

  const renderer = {
    image: renderImage,
    video: renderVideo,
    audio: renderAudio,
    iframe: renderIframe,
  }[item.type]
  renderer?.(item, generation)
  activeItemChangeHandler?.(item)
  if (!isMinimized) {
    getPreviewElement('.media-preview-stage')?.focus({ preventScroll: true })
  }
}

function navigatePreview (offset) {
  if (activeItems.length < 2) return
  activeIndex = getWrappedMediaIndex(activeIndex + offset, activeItems.length)
  renderActiveItem()
}

function onRootClick (event) {
  const root = ensurePreviewRoot()
  if (event.target === root) {
    closeMediaPreview()
    return
  }
  const action = event.target.closest('[data-media-preview-action]')?.dataset.mediaPreviewAction
  if (!action) return
  if (action === 'close') closeMediaPreview()
  if (action === 'previous') navigatePreview(-1)
  if (action === 'next') navigatePreview(1)
  if (action === 'select') {
    activeIndex = getWrappedMediaIndex(event.target.closest('[data-media-preview-action]')?.dataset.mediaPreviewIndex, activeItems.length)
    renderActiveItem()
  }
  if (action === 'minimize') setPreviewMinimized(true)
  if (action === 'restore') setPreviewMinimized(false)
  if (action === 'zoom-in') setImageScale((panzoom?.getScale() || 1) + 0.5)
  if (action === 'zoom-out') setImageScale((panzoom?.getScale() || 1) - 0.5)
  if (action === 'reset') resetImage()
}

function onRootInput (event) {
  if (!event.target.matches('[data-media-preview-zoom]')) return
  setImageScale(Number(event.target.value), false)
}

function trapFocus (event) {
  if (isMinimized) return
  const root = ensurePreviewRoot()
  const focusable = [...root.querySelectorAll('a[href], button:not([hidden]):not([tabindex="-1"]), input:not([hidden]), video[controls], audio[controls]')]
    .filter(element => !element.disabled && element.getClientRects().length)
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable.at(-1)
  if (!root.contains(document.activeElement)) {
    event.preventDefault()
    first.focus()
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function onDocumentKeydown (event) {
  if (ensurePreviewRoot().hidden) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMediaPreview()
    return
  }
  // 小窗状态只在焦点位于小窗内部时接管左右键；其余快捷键继续交给地图。
  if (isMinimized) {
    const root = ensurePreviewRoot()
    if (root.contains(event.target) && event.key === 'ArrowLeft') {
      event.preventDefault()
      navigatePreview(-1)
    }
    if (root.contains(event.target) && event.key === 'ArrowRight') {
      event.preventDefault()
      navigatePreview(1)
    }
    return
  }
  if (event.key === 'Tab' && !isMinimized) {
    trapFocus(event)
    return
  }
  const interactiveMedia = event.target.matches?.('input, video, audio')
  if (!interactiveMedia && (event.key === 'ArrowLeft' || event.key === 'ArrowUp')) {
    event.preventDefault()
    navigatePreview(-1)
  }
  if (!interactiveMedia && (event.key === 'ArrowRight' || event.key === 'ArrowDown')) {
    event.preventDefault()
    navigatePreview(1)
  }
  if (!interactiveMedia && activeItems[activeIndex]?.type === 'image') {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      setImageScale((panzoom?.getScale() || 1) + 0.5)
    }
    if (event.key === '-') {
      event.preventDefault()
      setImageScale((panzoom?.getScale() || 1) - 0.5)
    }
    if (event.key === '0') {
      event.preventDefault()
      resetImage()
    }
  }
}

function onWindowResize () {
  if (!ensurePreviewRoot().hidden && !isMinimized && activeItems[activeIndex]?.type === 'image') resetImage(false)
}

function setPreviewMinimized (minimized) {
  const root = ensurePreviewRoot()
  if (root.hidden) return
  isMinimized = Boolean(minimized)
  root.classList.toggle('is-minimized', isMinimized)
  getPreviewElement('.media-preview-dialog')?.setAttribute('aria-modal', isMinimized ? 'false' : 'true')
  document.body.classList.toggle('media-preview-open', !isMinimized)
  const minimizeButton = getPreviewElement('[data-media-preview-action="minimize"]')
  if (minimizeButton) {
    minimizeButton.hidden = isMinimized
    minimizeButton.setAttribute('aria-label', isMinimized ? '预览已收缩' : '收缩为小窗')
  }
  if (isMinimized) {
    requestAnimationFrame(() => getPreviewElement('[data-media-preview-action="restore"]')?.focus())
  } else {
    requestAnimationFrame(() => getPreviewElement('.media-preview-stage')?.focus({ preventScroll: true }))
  }
}

export function closeMediaPreview () {
  const root = previewRoot || document.getElementById('app-media-preview')
  if (!root || root.hidden) return
  renderGeneration += 1
  cleanupCurrentMedia()
  cleanupTrackObserver()
  root.hidden = true
  root.setAttribute('aria-hidden', 'true')
  root.removeAttribute('data-media-type')
  root.classList.remove('is-minimized')
  document.body.classList.remove('media-preview-open')
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('resize', onWindowResize)
  activeItems = []
  activeIndex = 0
  activeCollectionTitle = ''
  activeItemChangeHandler = null
  isMinimized = false
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  previousFocus = null
}

export function openMediaPreview ({ items, index = 0, type = '', trigger = null, collectionTitle = '', onActiveItemChange = null } = {}) {
  const normalizedItems = normalizeMediaPreviewItems(items, type)
  if (!normalizedItems.length) return false
  const root = ensurePreviewRoot()
  if (root.hidden || isMinimized) previousFocus = trigger || document.activeElement
  activeItems = normalizedItems
  activeIndex = getWrappedMediaIndex(index, activeItems.length)
  activeCollectionTitle = String(collectionTitle || normalizedItems[activeIndex]?.kmlName || '').trim()
  activeItemChangeHandler = typeof onActiveItemChange === 'function' ? onActiveItemChange : null
  isMinimized = false
  root.classList.remove('is-minimized')
  getPreviewElement('.media-preview-dialog')?.setAttribute('aria-modal', 'true')
  const minimizeButton = getPreviewElement('[data-media-preview-action="minimize"]')
  if (minimizeButton) minimizeButton.hidden = false
  root.hidden = false
  root.setAttribute('aria-hidden', 'false')
  document.body.classList.add('media-preview-open')
  document.removeEventListener('keydown', onDocumentKeydown)
  document.addEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('resize', onWindowResize)
  window.addEventListener('resize', onWindowResize)
  renderActiveItem()
  requestAnimationFrame(() => getPreviewElement('.media-preview-stage')?.focus({ preventScroll: true }))
  return true
}
