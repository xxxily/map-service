import {
  buildFeatureContentView,
  buildResourceCollectionRefPlaceholder,
  formatContentSummary,
  getFeatureDescriptionText,
} from '../../shared/kml-content.js'
import {
  buildKmlMediaGallery,
  findKmlMediaGalleryIndex,
  flattenKmlFeatureMediaItems,
  getKmlFeaturePopupMedia,
} from './kml-media-gallery.js'
import { getKmlFeatureDisplayName } from './kml-feature-name.js'
import { openMediaPreview } from '../ui/media-preview.js'
import { showAlert } from '../ui/dialog.js'
import { isTouchFirstEnvironment } from '../ui/touch-environment.js'
import {
  getKmlResourceCollectionItemCount,
  isKmlResourceCollectionFeature,
  isKmlResourceCollectionStatusFeature,
  openKmlResourceCollectionPanel,
} from './kml-resource-collection.js'
import {
  getKmlResourceCollectionAccessState,
  tryNormalizeKmlResourceCollection,
  normalizeKmlResourceCollectionStatus,
} from '../../shared/kml-resource-collection.js'
import {
  bindFavoriteActionButtons,
  renderFavoriteActionButton,
} from './favorite-actions.js'
import {
  openInteractionInfo,
  openInteractionPanel,
} from '../ui/interaction.js'

const BUILD_IFRAME_ALLOWLIST = String(typeof import.meta.env === 'object' ? (import.meta.env.VITE_MAP_SERVICE_KML_IFRAME_ALLOWLIST || '') : '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)

let activeContentRequest = null
let activeContentRequestSequence = 0
const popupMediaBindings = new WeakMap()
const RESOURCE_COLLECTION_FETCH_MAX_BYTES = 2 * 1024 * 1024
const RESOURCE_COLLECTION_FETCH_TIMEOUT_MS = 15000

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getInteractionItem (kmlFile, feature) {
  return {
    sharePublicId: kmlFile?.sharePublicId || '',
    shareItemId: kmlFile?.shareItemId || kmlFile?.id || '',
    featureId: feature?.id || '',
    featureName: getKmlFeatureDisplayName(feature),
    title: getKmlFeatureDisplayName(feature),
  }
}

function renderInteractionActions (kmlFile, feature) {
  if (!kmlFile?.isShare || !kmlFile?.sharePublicId || !kmlFile?.shareItemId || !feature?.id) return ''
  return `<div class="kml-popup-interaction-actions" aria-label="点位互动"><button type="button" class="kml-popup-btn" data-kml-interaction="comments">留言</button><button type="button" class="kml-popup-btn" data-kml-interaction="info">详情</button></div>`
}

function getIframeAllowlist () {
  const browserWindow = typeof window !== 'undefined' ? window : null
  const runtimeValue = browserWindow?.MAP_SERVICE_KML_IFRAME_ALLOWLIST || browserWindow?.mapServiceKmlIframeAllowlist || ''
  const value = runtimeValue || BUILD_IFRAME_ALLOWLIST
  if (Array.isArray(value)) return value
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean)
}

export function getKmlContentOptions () {
  return {
    iframeAllowlist: getIframeAllowlist(),
  }
}

function buildLocalContentView (feature) {
  return buildFeatureContentView(feature, getKmlContentOptions())
}

export function getFeatureContentSummaryText (feature) {
  return formatContentSummary(buildLocalContentView(feature).contentSummary)
}

function getMediaTypeLabel (type) {
  return {
    image: '图片',
    video: '视频',
    audio: '音频',
    iframe: '页面',
  }[type] || '媒体'
}

function getMediaTypeIcon (type) {
  return {
    video: '▶',
    audio: '♪',
    iframe: '▣',
  }[type] || '◫'
}

function getResourceCollectionStatusLabel (value) {
  const accessState = getKmlResourceCollectionAccessState(value)
  return {
    private: '未公开',
    missing: '不存在',
    trashed: '已移除',
  }[accessState] || '不可用'
}

function getResourceCollectionStatusMessage (value) {
  const accessState = getKmlResourceCollectionAccessState(value)
  return {
    private: '该资源集合未公开，当前分享无法读取。',
    missing: '该资源集合不存在或已被移除。',
    trashed: '该资源集合已移入回收站，当前无法读取。',
  }[accessState] || '该资源集合当前不可用。'
}

function getPopupFeatureName (feature) {
  return getKmlFeatureDisplayName({ type: feature?.type || 'Point', name: feature?.name })
}

function getPopupMediaTitle (item) {
  const title = getPopupFeatureName({ name: item?.title })
  if (title) return title
  return getPopupFeatureName({ name: item?.featureName })
}

function renderPopupMediaItem (item) {
  const label = getMediaTypeLabel(item.type)
  const mediaTitle = getPopupMediaTitle(item)
  if (item.type === 'image') {
    return `
      <button type="button" class="kml-popup-media-item kml-popup-media-image" data-kml-popup-media data-media-id="${escapeHtml(item.id)}" data-media-url="${escapeHtml(item.url)}" data-media-type="image" aria-label="预览${escapeHtml(label)}${mediaTitle ? `：${escapeHtml(mediaTitle)}` : ''}">
        <img src="${escapeHtml(item.thumbnailUrl || item.renderUrl || item.url)}" alt="${escapeHtml(mediaTitle || '点位图片')}" loading="lazy" referrerpolicy="no-referrer">
        <span class="kml-popup-media-badge">${escapeHtml(label)}</span>
        <span class="kml-popup-media-error">图片加载失败</span>
      </button>
    `
  }
  return `
    <button type="button" class="kml-popup-media-item kml-popup-media-type kml-popup-media-${escapeHtml(item.type)}" data-kml-popup-media data-media-id="${escapeHtml(item.id)}" data-media-url="${escapeHtml(item.url)}" data-media-type="${escapeHtml(item.type)}" aria-label="预览${escapeHtml(label)}${mediaTitle ? `：${escapeHtml(mediaTitle)}` : ''}">
      <span class="kml-popup-media-icon" aria-hidden="true">${escapeHtml(getMediaTypeIcon(item.type))}</span>
      <span class="kml-popup-media-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(mediaTitle || '点击查看')}</small></span>
    </button>
  `
}

export function renderKmlFeaturePopupContent (kmlFile, feature, isEditable) {
  const collectionStatus = normalizeKmlResourceCollectionStatus(feature?.resourceCollectionStatus)
  const isCollection = isKmlResourceCollectionFeature(feature) || Boolean(feature?.resourceCollectionRef) || Boolean(collectionStatus)
  const collectionCount = isKmlResourceCollectionFeature(feature)
    ? getKmlResourceCollectionItemCount(feature)
    : collectionStatus ? getResourceCollectionStatusLabel(collectionStatus) : '?'
  const preview = isCollection
    ? { items: [], total: 0, remaining: 0, overflowItem: null, contentSummary: {} }
    : getKmlFeaturePopupMedia(feature, { contentOptions: getKmlContentOptions() })
  const contentSummary = isCollection
    ? collectionStatus
      ? `资源集合 · ${getResourceCollectionStatusLabel(collectionStatus)}`
      : `资源集合 · ${collectionCount} 项`
    : formatContentSummary(preview.contentSummary)
  const description = getFeatureDescriptionText(feature)
  const favoriteAction = renderFavoriteActionButton(kmlFile, feature)
  const actionsHtml = isEditable
    ? `
      <div class="kml-popup-actions">
        ${favoriteAction}
        <button type="button" class="kml-popup-btn kml-detail-btn" data-kml-id="${escapeHtml(kmlFile?.id)}" data-feature-id="${escapeHtml(feature?.id)}">查看详情</button>
        <button type="button" class="kml-popup-btn primary kml-edit-btn" data-kml-id="${escapeHtml(kmlFile?.id)}" data-feature-id="${escapeHtml(feature?.id)}">编辑</button>
        <button type="button" class="kml-popup-btn danger kml-delete-btn" data-kml-id="${escapeHtml(kmlFile?.id)}" data-feature-id="${escapeHtml(feature?.id)}">删除</button>
      </div>
    `
    : `
      <div class="kml-popup-actions">
        ${favoriteAction}
        <button type="button" class="kml-popup-btn primary kml-detail-btn" data-kml-id="${escapeHtml(kmlFile?.id)}" data-feature-id="${escapeHtml(feature?.id)}">查看详情</button>
      </div>
    `
  const previewHtml = collectionStatus
    ? `
      <section class="kml-popup-media kml-popup-resource-collection is-unavailable" aria-label="资源集合状态">
        <div class="kml-popup-media-heading"><span>资源集合</span><small>${escapeHtml(getResourceCollectionStatusLabel(collectionStatus))}</small></div>
        <p class="kml-popup-collection-status">${escapeHtml(getResourceCollectionStatusMessage(collectionStatus))}</p>
      </section>
    `
    : isCollection
    ? `
      <section class="kml-popup-media kml-popup-resource-collection" aria-label="资源集合">
        <div class="kml-popup-media-heading"><span>资源集合</span><small>${collectionCount} 项</small></div>
        <button type="button" class="kml-popup-collection-launch" data-kml-resource-collection aria-label="浏览资源集合">浏览资源</button>
      </section>
    `
    : preview.items.length
    ? `
      <section class="kml-popup-media" aria-label="点位媒体预览">
        <div class="kml-popup-media-heading"><span>媒体速览</span><small>${escapeHtml(preview.total)} 项</small></div>
        <div class="kml-popup-media-grid">
          ${preview.items.map(renderPopupMediaItem).join('')}
          ${preview.remaining && preview.overflowItem
            ? `<button type="button" class="kml-popup-media-more" data-kml-popup-media data-media-id="${escapeHtml(preview.overflowItem.id)}" data-media-url="${escapeHtml(preview.overflowItem.url)}" data-media-type="${escapeHtml(preview.overflowItem.type)}" aria-label="查看其余 ${escapeHtml(preview.remaining)} 项媒体">+${escapeHtml(preview.remaining)}</button>`
            : ''}
        </div>
      </section>
    `
    : ''

  const featureName = getPopupFeatureName(feature)
  const popupTitle = featureName ? `<div class="kml-popup-title">${escapeHtml(featureName)}</div>` : ''
  const popupDescription = description ? `<div class="kml-popup-desc">${escapeHtml(description)}</div>` : ''

  return `
    <div class="kml-popup-content">
      <div class="kml-popup-eyebrow">${escapeHtml(kmlFile?.name || 'KML 点位')}</div>
      ${popupTitle}
      ${popupDescription}
      ${contentSummary ? `<div class="kml-popup-content-summary">${escapeHtml(contentSummary)}</div>` : ''}
      ${previewHtml}
      ${renderInteractionActions(kmlFile, feature)}
      ${actionsHtml}
    </div>
  `
}

function buildPreviewItems (kmlFile, feature, view = null) {
  const featureViews = view && feature?.id ? new Map([[String(feature.id), view]]) : null
  const items = buildKmlMediaGallery(kmlFile, {
    featureViews,
    contentOptions: getKmlContentOptions(),
  })
  if (items.length) return items
  return flattenKmlFeatureMediaItems(feature, view || buildLocalContentView(feature)).map((item, galleryIndex) => ({
    ...item,
    kmlId: String(kmlFile?.id || ''),
    kmlName: String(kmlFile?.name || '').trim() || '未命名 KML',
    galleryIndex,
  }))
}

export function hasKmlFeaturePreviewMedia (feature) {
  // A collection is a separate, paged surface. Do not classify up to 300
  // collection URLs just to decide whether its marker needs an interaction.
  if (isKmlResourceCollectionFeature(feature)) {
    return getKmlResourceCollectionItemCount(feature) > 0
  }
  if (isKmlResourceCollectionStatusFeature(feature)) return true
  if (feature?.type === 'Point' && feature?.resourceCollectionRef) return true
  return getKmlFeaturePopupMedia(feature, {
    contentOptions: getKmlContentOptions(),
  }).total > 0
}

function getKmlMediaFeatureKey (item) {
  const kmlId = String(item?.kmlId || '')
  const featureId = String(item?.featureId || '')
  return kmlId && featureId ? `${kmlId}:${featureId}` : ''
}

export function openKmlFeatureMediaPreview (kmlFile, feature, options = {}) {
  const {
    selection = {},
    trigger = null,
    view = null,
    linkMapFeatures = !isTouchFirstEnvironment(),
    keepInitialFeaturePopup = false,
  } = options
  let activeFeatureKey = getKmlMediaFeatureKey({
    kmlId: kmlFile?.id,
    featureId: feature?.id,
  })
  let isInitialPreviewItem = true
  let hasHandledPreviewNavigation = false
  const onActiveItemChange = item => {
    if (!linkMapFeatures) return
    const isInitialItem = isInitialPreviewItem
    isInitialPreviewItem = false
    const nextFeatureKey = getKmlMediaFeatureKey(item)
    if (!nextFeatureKey || isInitialItem) return
    if (nextFeatureKey === activeFeatureKey && (keepInitialFeaturePopup || hasHandledPreviewNavigation)) return
    hasHandledPreviewNavigation = true
    activeFeatureKey = nextFeatureKey
    window.activateKmlFeatureForMedia?.(item)
  }

  if (isKmlResourceCollectionStatusFeature(feature)) {
    return openKmlFeatureContentPanel(kmlFile, feature)
  }
  if (isKmlResourceCollectionFeature(feature)) {
    return openKmlResourceCollectionPanel(kmlFile, feature, {
      trigger,
      contentOptions: getKmlContentOptions(),
      onClose: options.onClose,
      onActiveItemChange,
    })
  }
  if (feature?.type === 'Point' && feature?.resourceCollectionRef) {
    return openKmlFeatureContentPanel(kmlFile, feature)
  }
  const items = buildPreviewItems(kmlFile, feature, view)
  if (!items.length) return false
  return openMediaPreview({
    items,
    index: findKmlMediaGalleryIndex(items, {
      ...selection,
      featureId: String(feature?.id || ''),
    }),
    trigger,
    collectionTitle: String(kmlFile?.name || '').trim() || '未命名 KML',
    onActiveItemChange,
  })
}

function openKmlMediaFromSelection (kmlFile, feature, selection, trigger, view = null) {
  return openKmlFeatureMediaPreview(kmlFile, feature, {
    selection,
    trigger,
    view,
    keepInitialFeaturePopup: true,
  })
}

export function bindKmlFeaturePopupMediaActions (container, kmlFile, feature) {
  if (!container) return
  bindFavoriteActionButtons(container, kmlFile, feature)
  const eventRoot = container.querySelector('.leaflet-popup-content') || container
  const existingBinding = popupMediaBindings.get(eventRoot)
  if (existingBinding) {
    existingBinding.kmlFile = kmlFile
    existingBinding.feature = feature
    return
  }

  const binding = { kmlFile, feature }
  popupMediaBindings.set(eventRoot, binding)
  eventRoot.addEventListener('click', event => {
    const interactionTrigger = event.target.closest?.('[data-kml-interaction]')
    if (interactionTrigger && eventRoot.contains(interactionTrigger)) {
      event.stopPropagation()
      event.preventDefault()
      const currentBinding = popupMediaBindings.get(eventRoot)
      if (!currentBinding) return
      const item = getInteractionItem(currentBinding.kmlFile, currentBinding.feature)
      if (interactionTrigger.dataset.kmlInteraction === 'comments') openInteractionPanel(item, interactionTrigger)
      if (interactionTrigger.dataset.kmlInteraction === 'info') openInteractionInfo(item)
      return
    }
    const collectionTrigger = event.target.closest?.('[data-kml-resource-collection]')
    if (collectionTrigger && eventRoot.contains(collectionTrigger)) {
      event.stopPropagation()
      event.preventDefault()
      const currentBinding = popupMediaBindings.get(eventRoot)
      if (currentBinding) openKmlFeatureMediaPreview(currentBinding.kmlFile, currentBinding.feature, {
        trigger: collectionTrigger,
        keepInitialFeaturePopup: true,
      })
      return
    }
    const trigger = event.target.closest?.('[data-kml-popup-media]')
    if (!trigger || !eventRoot.contains(trigger)) return
    event.stopPropagation()
    event.preventDefault()
    const currentBinding = popupMediaBindings.get(eventRoot)
    if (!currentBinding) return
    openKmlMediaFromSelection(currentBinding.kmlFile, currentBinding.feature, {
      id: trigger.dataset.mediaId,
      url: trigger.dataset.mediaUrl,
      type: trigger.dataset.mediaType,
    }, trigger)
  })
  eventRoot.addEventListener('error', event => {
    const image = event.target
    if (!image?.matches?.('.kml-popup-media-image img')) return
    image.closest('.kml-popup-media-image')?.classList.add('is-load-error')
  }, true)
}

function ensurePanel () {
  let panel = document.getElementById('kml-feature-content-panel')
  if (!panel) {
    panel = document.createElement('section')
    panel.id = 'kml-feature-content-panel'
    panel.className = 'kml-content-panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'false')
    panel.hidden = true
    document.body.appendChild(panel)
  }
  return panel
}

function closePanel () {
  activeContentRequestSequence += 1
  activeContentRequest?.abort()
  activeContentRequest = null
  const panel = document.getElementById('kml-feature-content-panel')
  if (panel) {
    panel.hidden = true
    panel.innerHTML = ''
  }
}

async function loadFeatureContentView (kmlFile, feature) {
  if (kmlFile?.isPublic && !kmlFile?.isShare && kmlFile.id && feature?.id) {
    activeContentRequest?.abort()
    activeContentRequest = new AbortController()
    try {
      const res = await window.fetch(`/api/v1/kml/shared/${encodeURIComponent(kmlFile.id)}/features/${encodeURIComponent(feature.id)}/content`, {
        signal: activeContentRequest.signal,
      })
      const payload = await res.json()
      if (!res.ok || payload.code !== 0) {
        throw new Error(payload.error?.message || '点位内容加载失败')
      }
      return payload.result
    } finally {
      activeContentRequest = null
    }
  }
  return buildLocalContentView(feature)
}

function renderOverview (kmlFile, feature) {
  const description = getFeatureDescriptionText(feature)
  const coords = Array.isArray(feature?.coordinates) && feature.type === 'Point'
    ? `${Number(feature.coordinates[0]).toFixed(6)}, ${Number(feature.coordinates[1]).toFixed(6)}`
    : ''
  return `
    <section class="kml-content-overview">
      <div class="kml-content-overview-copy">
        <span>点位说明</span>
        ${description ? `<p>${escapeHtml(description)}</p>` : '<p class="kml-content-muted">暂无文字描述</p>'}
      </div>
      <dl>
        <div><dt>图层</dt><dd>${escapeHtml(kmlFile?.name || '未命名图层')}</dd></div>
        <div><dt>类型</dt><dd>${escapeHtml(feature?.type || '未知')}</dd></div>
        ${coords ? `<div><dt>坐标</dt><dd>${escapeHtml(coords)}</dd></div>` : ''}
      </dl>
    </section>
  `
}

function renderImageItem (item, itemIndex, groupIndex) {
  return `
    <button type="button" class="kml-content-image-item" data-kml-media-preview data-kml-media-group="${groupIndex}" data-kml-media-index="${itemIndex}" title="预览${escapeHtml(item.title || '图片')}" aria-label="预览${escapeHtml(item.title || '图片')}">
      <img src="${escapeHtml(item.thumbnailUrl || item.renderUrl || item.url)}" alt="${escapeHtml(item.title || '点位图片')}" loading="lazy" referrerpolicy="no-referrer">
      <span class="kml-content-image-caption"><strong>${escapeHtml(item.title || '点位图片')}</strong><small>点击预览</small></span>
      <span class="kml-content-image-error">图片加载失败</span>
    </button>
  `
}

function renderMediaLaunchItem (item, itemIndex, groupIndex, type, label, icon) {
  return `
    <button type="button" class="kml-content-card kml-content-media-launch kml-content-media-${escapeHtml(type)}" data-kml-media-preview data-kml-media-group="${groupIndex}" data-kml-media-index="${itemIndex}" aria-label="预览${escapeHtml(label)}：${escapeHtml(item.title || label)}">
      <span class="kml-content-media-launch-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <span class="kml-content-media-launch-copy">
        <strong>${escapeHtml(item.title || label)}</strong>
        <small>${escapeHtml(item.displayUrl || label)}</small>
      </span>
      <span class="kml-content-media-launch-arrow" aria-hidden="true">›</span>
    </button>
  `
}

function renderVideoItem (item, itemIndex, groupIndex) {
  return renderMediaLaunchItem(item, itemIndex, groupIndex, 'video', '视频', '▶')
}

function renderAudioItem (item, itemIndex, groupIndex) {
  return renderMediaLaunchItem(item, itemIndex, groupIndex, 'audio', '音频', '♪')
}

function renderIframeItem (item, itemIndex, groupIndex) {
  return renderMediaLaunchItem(item, itemIndex, groupIndex, 'iframe', '页面', '▣')
}

function renderLinkItem (item) {
  return `
    <a class="kml-content-link-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      <span>${escapeHtml(item.title || '链接')}</span>
      <small>${escapeHtml(item.displayUrl || item.url)}</small>
    </a>
  `
}

function renderGroup (group, groupIndex) {
  if (!group.items?.length) return ''
  const renderer = {
    image: renderImageItem,
    video: renderVideoItem,
    audio: renderAudioItem,
    iframe: renderIframeItem,
    link: renderLinkItem,
  }[group.type] || renderLinkItem
  const typeIcon = {
    image: '◫',
    video: '▶',
    audio: '♪',
    iframe: '▣',
    link: '↗',
  }[group.type] || '•'
  return `
    <section class="kml-content-group kml-content-group-${escapeHtml(group.type)}">
      <header class="kml-content-group-heading">
        <span aria-hidden="true">${escapeHtml(typeIcon)}</span>
        <div><h3>${escapeHtml(group.title || '内容')}</h3><p>${group.items.length} 项内容</p></div>
      </header>
      <div class="kml-content-items">
        ${group.items.map((item, itemIndex) => renderer(item, itemIndex, groupIndex)).join('')}
      </div>
    </section>
  `
}

function bindMediaLoadFallbacks (panel) {
  panel.querySelectorAll('.kml-content-image-item img').forEach(image => {
    image.addEventListener('error', () => image.closest('.kml-content-image-item')?.classList.add('is-load-error'), { once: true })
  })
}

function bindMediaPreviewActions (panel, kmlFile, feature, view) {
  const groups = view?.groups || []
  panel.querySelectorAll('[data-kml-media-preview]').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const group = groups[Number(trigger.dataset.kmlMediaGroup)]
      const item = group?.items?.[Number(trigger.dataset.kmlMediaIndex)]
      if (!item) return
      openKmlMediaFromSelection(kmlFile, feature, {
        id: item.id,
        url: item.url,
        type: group.type,
      }, trigger, view)
    })
  })
}

function renderPanelContent (panel, kmlFile, feature, view, errorMessage = '') {
  const summaryText = formatContentSummary(view?.contentSummary)
  const groupsHtml = (view?.groups || []).map(renderGroup).join('')
  const featureName = getKmlFeatureDisplayName(feature)
  panel.innerHTML = `
    <header class="kml-content-header">
      <div>
        <span class="kml-content-kicker">${escapeHtml(kmlFile?.isPublic ? '公共点位' : '个人点位')}</span>
        ${featureName ? `<h2>${escapeHtml(featureName)}</h2>` : ''}
        ${summaryText ? `<p>${escapeHtml(summaryText)}</p>` : ''}
      </div>
      <div class="kml-content-header-actions">
        ${renderFavoriteActionButton(kmlFile, feature)}
        <button type="button" class="kml-content-close" data-kml-content-close aria-label="关闭">×</button>
      </div>
    </header>
    <div class="kml-content-body">
      ${renderOverview(kmlFile, feature)}
      ${errorMessage ? `<div class="kml-content-error">${escapeHtml(errorMessage)}</div>` : ''}
      ${groupsHtml || '<div class="kml-content-empty">暂无可展示的富媒体内容</div>'}
      ${view?.sourceSummary?.truncated ? '<div class="kml-content-muted">内容较多，仅展示前 50 个链接。</div>' : ''}
    </div>
  `
  panel.querySelector('[data-kml-content-close]')?.addEventListener('click', closePanel)
  bindFavoriteActionButtons(panel, kmlFile, feature)
  bindMediaLoadFallbacks(panel)
  bindMediaPreviewActions(panel, kmlFile, feature, view)
}

function unwrapCollectionPayload (payload) {
  if (payload && typeof payload === 'object' && payload.result !== undefined) return unwrapCollectionPayload(payload.result)
  if (payload && typeof payload === 'object' && payload.data !== undefined) return unwrapCollectionPayload(payload.data)
  return payload && typeof payload === 'object' ? payload : {}
}

function collectionErrorState (error) {
  const status = Number(error?.status || 0)
  if (error?.name === 'AbortError') return 'cancelled'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 408 || error?.code === 'TIMEOUT') return 'timeout'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'server_error'
  if (error?.code === 'TOO_LARGE') return 'too_large'
  if (error?.code === 'BLOCKED_BY_POLICY') return 'blocked_by_policy'
  if (error?.code === 'INVALID_SCHEMA') return 'invalid_schema'
  if (error?.code === 'REVISION_CHANGED') return 'revision_changed'
  if (error?.name === 'TypeError' || error?.code === 'NETWORK_ERROR') return 'network_error'
  return 'unauthorized'
}

function collectionErrorMessage (error) {
  const state = collectionErrorState(error)
  return {
    unauthorized: '资源集合未授权跨域读取或当前会话无权访问。',
    forbidden: '资源集合拒绝了当前访问。',
    not_found: '资源集合不存在或已被移除。',
    timeout: '资源集合读取超时，请稍后重试。',
    rate_limited: '资源集合请求过于频繁，请稍后重试。',
    server_error: '资源集合服务暂时不可用，请稍后重试。',
    too_large: '资源集合响应超过安全大小限制。',
    blocked_by_policy: '资源集合地址未通过安全策略。',
    invalid_schema: '资源集合返回的数据格式不受支持。',
    revision_changed: '资源集合在读取期间发生变化，请重试。',
    network_error: '资源集合网络请求失败，可能未授权跨域读取。',
  }[state] || error?.message || '资源集合加载失败，请稍后重试。'
}

export function normalizeCollectionFetchError (error, requestOptions = {}) {
  if (!error || typeof error !== 'object') return error
  // Browsers surface `redirect: 'error'` as a generic TypeError. Distinguish
  // messages that explicitly identify a redirect from ordinary CORS/network
  // failures so the UI can report the policy decision accurately.
  if (requestOptions.redirect === 'error' && error.name === 'TypeError') {
    const detail = `${error.message || ''} ${error.type || ''} ${error.code || ''}`.toLowerCase()
    if (/redirect|opaqueredirect|disallowed\s+redirect|redirected/.test(detail)) {
      error.code = 'BLOCKED_BY_POLICY'
    } else if (!error.code) {
      error.code = 'NETWORK_ERROR'
    }
  }
  return error
}

async function readJsonResponseBounded (response, signal) {
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase()
  if (contentType && !contentType.includes('application/json') && !contentType.includes('+json')) {
    const error = new Error('资源集合响应不是 JSON')
    error.code = 'INVALID_SCHEMA'
    throw error
  }
  const length = Number(response.headers?.get?.('content-length') || 0)
  if (length > RESOURCE_COLLECTION_FETCH_MAX_BYTES) {
    const error = new Error('资源集合响应过大')
    error.code = 'TOO_LARGE'
    throw error
  }
  if (typeof response.body?.getReader === 'function') {
    const reader = response.body.getReader()
    const chunks = []
    let size = 0
    try {
      while (true) {
        if (signal?.aborted) {
          await reader.cancel().catch(() => {})
          const error = new DOMException('The operation was aborted', 'AbortError')
          throw error
        }
        let next
        try {
          next = await reader.read()
        } catch (error) {
          if (signal?.aborted) await reader.cancel().catch(() => {})
          throw error
        }
        if (next.done) break
        if (signal?.aborted) {
          await reader.cancel().catch(() => {})
          const error = new DOMException('The operation was aborted', 'AbortError')
          throw error
        }
        size += next.value?.byteLength || next.value?.length || 0
        if (size > RESOURCE_COLLECTION_FETCH_MAX_BYTES) {
          await reader.cancel().catch(() => {})
          const error = new Error('资源集合响应过大')
          error.code = 'TOO_LARGE'
          throw error
        }
        chunks.push(next.value)
      }
    } finally {
      reader.releaseLock?.()
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.byteLength || chunk.length || 0 })
    const text = new TextDecoder().decode(bytes)
    try { return JSON.parse(text) } catch {
      const error = new Error('资源集合响应不是有效 JSON')
      error.code = 'INVALID_SCHEMA'
      throw error
    }
  }
  if (signal?.aborted) {
    const error = new DOMException('The operation was aborted', 'AbortError')
    throw error
  }
  const text = await response.text()
  if (signal?.aborted) {
    const error = new DOMException('The operation was aborted', 'AbortError')
    throw error
  }
  if (new TextEncoder().encode(text).byteLength > RESOURCE_COLLECTION_FETCH_MAX_BYTES) {
    const error = new Error('资源集合响应过大')
    error.code = 'TOO_LARGE'
    throw error
  }
  try { return JSON.parse(text) } catch {
    const error = new Error('资源集合响应不是有效 JSON')
    error.code = 'INVALID_SCHEMA'
    throw error
  }
}

function buildExternalCollectionUrl (dataUrl) {
  try {
    const url = new URL(dataUrl)
    if (!url.searchParams.has('page')) url.searchParams.set('page', '1')
    if (!url.searchParams.has('limit')) url.searchParams.set('limit', '40')
    return url.toString()
  } catch {
    const error = new Error('外部资源集合地址不正确')
    error.code = 'BLOCKED_BY_POLICY'
    throw error
  }
}

function buildInternalCollectionPageUrl (path, page, limit = 40) {
  const url = new URL(path, window.location.origin)
  url.searchParams.set('page', String(page))
  url.searchParams.set('limit', String(limit))
  return `${url.pathname}${url.search}`
}

export function validateCollectionPagePayload (data, expectedPage, fallbackLimit = 40, options = {}) {
  const pagination = data?.pagination && typeof data.pagination === 'object' && !Array.isArray(data.pagination)
    ? data.pagination
    : null
  const rawPage = pagination?.page ?? data?.page ?? expectedPage
  const page = Number(rawPage)
  if (!Number.isSafeInteger(page) || page < 1 || page !== Number(expectedPage)) {
    const error = new Error('资源集合当前页码不一致')
    error.code = 'INVALID_SCHEMA'
    throw error
  }
  const rawLimit = pagination?.limit ?? data?.limit ?? fallbackLimit
  const limit = Number(rawLimit)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    const error = new Error('资源集合分页信息不合法')
    error.code = 'INVALID_SCHEMA'
    throw error
  }
  const rawTotal = pagination?.total ?? data?.total
  const total = rawTotal === null || rawTotal === undefined ? null : Number(rawTotal)
  if (total !== null && (!Number.isSafeInteger(total) || total < 0)) {
    const error = new Error('资源集合总数不合法')
    error.code = 'INVALID_SCHEMA'
    throw error
  }
  const rawPageCount = pagination?.pageCount ?? data?.pageCount
  const pageCount = rawPageCount === null || rawPageCount === undefined
    ? (total === null ? null : Math.max(1, Math.ceil(total / limit)))
    : Number(rawPageCount)
  if (pageCount !== null && (!Number.isSafeInteger(pageCount) || pageCount < 1)) {
    const error = new Error('资源集合页数不合法')
    error.code = 'INVALID_SCHEMA'
    throw error
  }
  if (total === null && pageCount !== null) {
    const error = new Error('资源集合总数未知时不能提供固定页数')
    error.code = 'INVALID_SCHEMA'
    throw error
  }
  if (total !== null && pageCount !== Math.max(1, Math.ceil(total / limit))) {
    const error = new Error('资源集合总数与页数不一致')
    error.code = 'INVALID_SCHEMA'
    throw error
  }
  if (pageCount !== null && page > pageCount) {
    const error = new Error('资源集合当前页超出总页数')
    error.code = 'INVALID_SCHEMA'
    throw error
  }
  const rawHasNext = pagination?.hasNext ?? data?.hasNext
  const hasNext = rawHasNext === undefined
    ? (pageCount === null ? (Array.isArray(data?.items) && data.items.length >= limit) : page < pageCount)
    : rawHasNext === true
  if (rawHasNext !== undefined && typeof rawHasNext !== 'boolean') {
    const error = new Error('资源集合下一页标记不合法')
    error.code = 'INVALID_SCHEMA'
    throw error
  }
  if (pageCount !== null && rawHasNext !== undefined && rawHasNext !== (page < pageCount)) {
    const error = new Error('资源集合下一页标记与页数不一致')
    error.code = 'INVALID_SCHEMA'
    throw error
  }
  if (options.requireItems !== false && !Array.isArray(data?.items)) {
    const error = new Error('资源集合缺少 items 数组')
    error.code = 'INVALID_SCHEMA'
    throw error
  }
  if (Array.isArray(data?.items) && data.items.length > limit) {
    const error = new Error('资源集合当前页超过请求上限')
    error.code = 'TOO_LARGE'
    throw error
  }
  return {
    pagination: { page, limit, total, pageCount, hasNext },
    page,
    limit,
    total,
    pageCount,
    hasNext,
  }
}

async function loadResourceCollectionReference (kmlFile, feature, signal, page = 1) {
  const ref = feature?.resourceCollectionRef
  const normalized = buildResourceCollectionRefPlaceholder(ref).ref
  const isShare = Boolean(kmlFile?.isShare && kmlFile?.sharePublicId && kmlFile?.shareItemId)
  const isPublicKml = Boolean(kmlFile?.isPublic && !isShare)
  let endpoint
  let requestOptions
  if (normalized.sourceType === 'personal') {
    endpoint = isShare
      ? `/api/v1/public/kml-shares/${encodeURIComponent(kmlFile.sharePublicId)}/files/${encodeURIComponent(kmlFile.shareItemId)}/features/${encodeURIComponent(feature.id)}/resource-collection`
      : isPublicKml
        ? `/api/v1/public/resource-collections/${encodeURIComponent(normalized.collectionId)}`
        : `/api/v1/resource-collections/${encodeURIComponent(normalized.collectionId)}`
    requestOptions = { credentials: isPublicKml ? 'omit' : 'same-origin', redirect: 'error' }
  } else {
    endpoint = buildExternalCollectionUrl(normalized.dataUrl)
    const externalUrl = new URL(endpoint)
    externalUrl.searchParams.set('page', String(page))
    externalUrl.searchParams.set('limit', '40')
    endpoint = externalUrl.toString()
    requestOptions = {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      headers: { Accept: 'application/vnd.map-service.resource-collection+json;version=1, application/json' },
    }
  }
  const requestController = new AbortController()
  let timedOut = false
  const abortFromCaller = () => requestController.abort()
  if (signal?.aborted) requestController.abort()
  else signal?.addEventListener?.('abort', abortFromCaller, { once: true })
  const timeout = setTimeout(() => { timedOut = true; requestController.abort() }, RESOURCE_COLLECTION_FETCH_TIMEOUT_MS)
  const fetchPage = async (pageEndpoint) => {
    let response
    try {
      response = await window.fetch(pageEndpoint, { ...requestOptions, signal: requestController.signal })
    } catch (error) {
      throw normalizeCollectionFetchError(error, requestOptions)
    }
    let payload = null
    try { payload = await readJsonResponseBounded(response, requestController.signal) } catch (error) {
      if (response.ok) throw error
    }
    if (!response.ok) {
      const error = new Error(payload?.error?.message || payload?.message || `资源集合读取失败（HTTP ${response.status}）`)
      error.status = response.status
      error.code = `HTTP_${response.status}`
      throw error
    }
    return unwrapCollectionPayload(payload)
  }
  try {
    let data
    let metadata = null
    if (normalized.sourceType === 'personal') {
      metadata = await fetchPage(endpoint)
      if (metadata.accessState) return { accessState: String(metadata.accessState), ref: normalized }
      if (metadata.version !== undefined && Number(metadata.version) !== 1) {
        const error = new Error('资源集合版本不受支持')
        error.code = 'INVALID_SCHEMA'
        throw error
      }
      const itemsEndpoint = isShare
        ? `${endpoint}/items`
        : isPublicKml
          ? `/api/v1/public/resource-collections/${encodeURIComponent(normalized.collectionId)}/items`
          : `/api/v1/resource-collections/${encodeURIComponent(normalized.collectionId)}/items`
      data = await fetchPage(buildInternalCollectionPageUrl(itemsEndpoint, page, 40))
      if (data.accessState) return { accessState: String(data.accessState), ref: normalized }
      if (data.version !== undefined && Number(data.version) !== 1) {
        const error = new Error('资源集合版本不受支持')
        error.code = 'INVALID_SCHEMA'
        throw error
      }
    } else {
      data = await fetchPage(endpoint)
      if (data.accessState) return { accessState: String(data.accessState), ref: normalized }
      if (data.version !== undefined && Number(data.version) !== 1) {
        const error = new Error('资源集合版本不受支持')
        error.code = 'INVALID_SCHEMA'
        throw error
      }
    }
    const pageInfo = validateCollectionPagePayload(data, page, 40)
    const collection = data.collection && typeof data.collection === 'object'
      ? data.collection
      : metadata?.collection && typeof metadata.collection === 'object'
        ? metadata.collection
        : data
    const normalizedCollection = tryNormalizeKmlResourceCollection({
      version: 1,
      viewMode: data.viewMode || collection.viewMode || metadata?.viewMode || normalized.viewMode || 'grid',
      items: data.items,
    })
    if (!normalizedCollection.value) {
      const error = normalizedCollection.error || new Error('资源集合项格式不正确')
      error.code = 'INVALID_SCHEMA'
      throw error
    }
    return {
      ref: normalized,
      collection: normalizedCollection.value,
      metadata: collection,
      pagination: pageInfo.pagination,
      page: pageInfo.page,
      pageCount: pageInfo.pageCount,
      revision: data.itemsRevision ?? data.revision ?? metadata?.itemsRevision ?? metadata?.revision ?? null,
    }
  } catch (error) {
    if (timedOut && error?.name === 'AbortError') {
      const timeoutError = new Error('资源集合读取超时')
      timeoutError.code = 'TIMEOUT'
      throw timeoutError
    }
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener?.('abort', abortFromCaller)
  }
}

function getSafeExternalCollectionUrl (feature) {
  const refResult = buildResourceCollectionRefPlaceholder(feature?.resourceCollectionRef)
  if (!refResult.ok || refResult.ref?.sourceType !== 'external') return ''
  try {
    const url = new URL(refResult.ref.dataUrl)
    if (url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

async function copyExternalCollectionUrl (url, statusNode) {
  if (!url) return
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url)
    else {
      const input = document.createElement('textarea')
      input.value = url
      input.setAttribute('readonly', '')
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    if (statusNode) statusNode.textContent = '地址已复制'
  } catch {
    if (statusNode) statusNode.textContent = '复制失败，请手动复制'
  }
}

function renderCollectionLoadState (kmlFile, feature, message, options = {}) {
  const panel = ensurePanel()
  panel.hidden = false
  const featureName = getKmlFeatureDisplayName(feature)
  const externalUrl = options.externalUrl || getSafeExternalCollectionUrl(feature)
  const externalActions = externalUrl
    ? '<div class="kml-content-actions kml-content-external-actions"><button type="button" class="kml-popup-btn" data-kml-collection-open-external>打开原地址</button><button type="button" class="kml-popup-btn" data-kml-collection-copy-external>复制地址</button><span class="kml-content-action-status" data-kml-collection-external-status aria-live="polite"></span></div>'
    : ''
  panel.innerHTML = `
    <header class="kml-content-header"><div><span class="kml-content-kicker">资源集合</span>${featureName ? `<h2>${escapeHtml(featureName)}</h2>` : ''}</div><div class="kml-content-header-actions"><button type="button" class="kml-content-close" data-kml-content-close aria-label="关闭">×</button></div></header>
    <div class="kml-content-body"><div class="kml-content-error${options.state ? ` is-${escapeHtml(options.state)}` : ''}">${escapeHtml(message)}</div>${options.retry === false ? '' : '<div class="kml-content-actions"><button type="button" class="kml-popup-btn primary" data-kml-collection-retry>重试</button></div>'}${externalActions}</div>
  `
  panel.querySelector('[data-kml-content-close]')?.addEventListener('click', closePanel)
  panel.querySelector('[data-kml-collection-retry]')?.addEventListener('click', () => openKmlFeatureContentPanel(kmlFile, feature))
  panel.querySelector('[data-kml-collection-open-external]')?.addEventListener('click', () => {
    window.open(externalUrl, '_blank', 'noopener,noreferrer')
  })
  panel.querySelector('[data-kml-collection-copy-external]')?.addEventListener('click', event => {
    copyExternalCollectionUrl(externalUrl, panel.querySelector('[data-kml-collection-external-status]'))
    event.currentTarget.blur?.()
  })
  return options.state || ''
}

function bindRemoteCollectionPager (kmlFile, feature, loaded) {
  const panel = document.getElementById('kml-resource-collection-panel')
  if (!panel || !loaded) return
  const localPager = panel.querySelector('footer:not(.kml-resource-collection-remote-pager)')
  if (localPager) localPager.hidden = true
  const page = Number(loaded.page || 1)
  const pageCount = loaded.pageCount == null ? null : Number(loaded.pageCount)
  const pagination = loaded.pagination || {}
  const total = pagination.total
  const totalLabel = Number.isSafeInteger(Number(total)) ? `${total} 项` : '总数未知'
  const hasNext = pagination.hasNext === true || (pageCount !== null && page < pageCount)
  const footer = document.createElement('footer')
  footer.className = 'kml-resource-collection-remote-pager'
  footer.innerHTML = `<button type="button" data-remote-page="prev" ${page <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${page} 页${pageCount !== null ? ` / ${pageCount} 页` : ''} · ${totalLabel}</span><button type="button" data-remote-page="next" ${hasNext ? '' : 'disabled'}>下一页</button>`
  panel.querySelectorAll('.kml-resource-collection-remote-pager').forEach(node => node.remove())
  panel.appendChild(footer)
  footer.addEventListener('click', async event => {
    const direction = event.target?.dataset?.remotePage
    if (!direction) return
    const nextPage = direction === 'next' ? page + 1 : page - 1
    if (nextPage < 1 || (pageCount !== null && nextPage > pageCount) || (direction === 'next' && !hasNext)) return
    activeContentRequest?.abort()
    const controller = new AbortController()
    activeContentRequest = controller
    const sequence = ++activeContentRequestSequence
    try {
      const next = await loadResourceCollectionReference(kmlFile, feature, controller.signal, nextPage)
      if (sequence !== activeContentRequestSequence || controller.signal.aborted) return
      openKmlFeatureMediaPreview(kmlFile, { ...feature, resourceCollection: next.collection, resourceCollectionRef: null }, {
        keepInitialFeaturePopup: true,
        onClose: () => {
          activeContentRequestSequence += 1
          activeContentRequest?.abort()
          activeContentRequest = null
        },
      })
      bindRemoteCollectionPager(kmlFile, feature, next)
    } catch (error) {
      if (error?.name !== 'AbortError' && sequence === activeContentRequestSequence) renderCollectionLoadState(kmlFile, feature, collectionErrorMessage(error), { state: collectionErrorState(error) })
    } finally { if (activeContentRequest === controller) activeContentRequest = null }
  })
}

export async function openKmlFeatureContentPanel (kmlFile, feature) {
  if (isKmlResourceCollectionFeature(feature)) {
    openKmlFeatureMediaPreview(kmlFile, feature, { keepInitialFeaturePopup: true })
    return
  }
  if (isKmlResourceCollectionStatusFeature(feature)) {
    renderCollectionLoadState(kmlFile, feature, getResourceCollectionStatusMessage(feature.resourceCollectionStatus), { retry: false, state: 'unavailable' })
    return
  }
  if (feature?.type === 'Point' && feature?.resourceCollectionRef) {
    const refResult = buildResourceCollectionRefPlaceholder(feature.resourceCollectionRef)
    if (refResult.ok) {
      activeContentRequest?.abort()
      const controller = new AbortController()
      activeContentRequest = controller
      const requestSequence = ++activeContentRequestSequence
      try {
        const loaded = await loadResourceCollectionReference(kmlFile, feature, controller.signal)
        if (requestSequence !== activeContentRequestSequence || controller.signal.aborted) return
        if (loaded.accessState) {
          renderCollectionLoadState(kmlFile, feature, getResourceCollectionStatusMessage({ version: 1, sourceType: 'personal', accessState: loaded.accessState }), { retry: false, state: 'unavailable' })
          return
        }
        openKmlFeatureMediaPreview(kmlFile, { ...feature, resourceCollection: loaded.collection, resourceCollectionRef: null }, {
          keepInitialFeaturePopup: true,
          onClose: () => {
            activeContentRequestSequence += 1
            activeContentRequest?.abort()
            activeContentRequest = null
          },
        })
        bindRemoteCollectionPager(kmlFile, feature, loaded)
      } catch (error) {
        if (error?.name !== 'AbortError' && requestSequence === activeContentRequestSequence) renderCollectionLoadState(kmlFile, feature, collectionErrorMessage(error), { state: collectionErrorState(error) })
      } finally {
        if (activeContentRequest === controller) activeContentRequest = null
      }
      return
    }
    renderCollectionLoadState(kmlFile, feature, refResult.error?.message || '资源集合引用格式不正确')
    return
  }
  const panel = ensurePanel()
  const featureName = getKmlFeatureDisplayName(feature)
  panel.hidden = false
  panel.innerHTML = `
    <header class="kml-content-header">
      <div>
        <span class="kml-content-kicker">${escapeHtml(kmlFile?.isPublic ? '公共点位' : '个人点位')}</span>
        ${featureName ? `<h2>${escapeHtml(featureName)}</h2>` : ''}
      </div>
      <div class="kml-content-header-actions">
        ${renderFavoriteActionButton(kmlFile, feature)}
        <button type="button" class="kml-content-close" data-kml-content-close aria-label="关闭">×</button>
      </div>
    </header>
    <div class="kml-content-body">
      <div class="kml-content-loading">正在加载点位内容...</div>
    </div>
  `
  panel.querySelector('[data-kml-content-close]')?.addEventListener('click', closePanel)
  bindFavoriteActionButtons(panel, kmlFile, feature)

  try {
    const view = await loadFeatureContentView(kmlFile, feature)
    renderPanelContent(panel, kmlFile, feature, view)
  } catch (err) {
    if (err.name === 'AbortError') return
    const fallback = buildLocalContentView(feature)
    renderPanelContent(panel, kmlFile, feature, fallback, err.message || '点位内容加载失败，已展示本地解析结果。')
  }
}
