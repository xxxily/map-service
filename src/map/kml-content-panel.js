import {
  buildFeatureContentView,
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
import { isTouchFirstEnvironment } from '../ui/touch-environment.js'
import {
  getKmlResourceCollectionItemCount,
  isKmlResourceCollectionFeature,
  openKmlResourceCollectionPanel,
} from './kml-resource-collection.js'
import {
  bindFavoriteActionButtons,
  renderFavoriteActionButton,
} from './favorite-actions.js'
import {
  openInteractionInfo,
  openInteractionPanel,
  openInteractionReport,
} from '../ui/interaction.js'

const BUILD_IFRAME_ALLOWLIST = String(typeof import.meta.env === 'object' ? (import.meta.env.VITE_MAP_SERVICE_KML_IFRAME_ALLOWLIST || '') : '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)

let activeContentRequest = null
const popupMediaBindings = new WeakMap()

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
  return `<div class="kml-popup-interaction-actions" aria-label="点位互动"><button type="button" class="kml-popup-btn" data-kml-interaction="comments">留言</button><button type="button" class="kml-popup-btn" data-kml-interaction="info">来源</button><button type="button" class="kml-popup-btn" data-kml-interaction="report">举报</button></div>`
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
  const isCollection = isKmlResourceCollectionFeature(feature)
  const preview = isCollection
    ? { items: [], total: 0, remaining: 0, overflowItem: null, contentSummary: {} }
    : getKmlFeaturePopupMedia(feature, { contentOptions: getKmlContentOptions() })
  const contentSummary = isCollection
    ? `资源集合 · ${getKmlResourceCollectionItemCount(feature)} 项`
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
  const previewHtml = isCollection
    ? `
      <section class="kml-popup-media kml-popup-resource-collection" aria-label="资源集合">
        <div class="kml-popup-media-heading"><span>资源集合</span><small>${getKmlResourceCollectionItemCount(feature)} 项</small></div>
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
  } = options
  if (isKmlResourceCollectionFeature(feature)) {
    return openKmlResourceCollectionPanel(kmlFile, feature, {
      trigger,
      contentOptions: getKmlContentOptions(),
    })
  }
  const items = buildPreviewItems(kmlFile, feature, view)
  if (!items.length) return false
  let activeFeatureKey = getKmlMediaFeatureKey({
    kmlId: kmlFile?.id,
    featureId: feature?.id,
  })
  return openMediaPreview({
    items,
    index: findKmlMediaGalleryIndex(items, {
      ...selection,
      featureId: String(feature?.id || ''),
    }),
    trigger,
    collectionTitle: String(kmlFile?.name || '').trim() || '未命名 KML',
    onActiveItemChange: item => {
      if (!linkMapFeatures) return
      const nextFeatureKey = getKmlMediaFeatureKey(item)
      if (!nextFeatureKey || nextFeatureKey === activeFeatureKey) return
      activeFeatureKey = nextFeatureKey
      window.activateKmlFeatureForMedia?.(item)
    },
  })
}

function openKmlMediaFromSelection (kmlFile, feature, selection, trigger, view = null) {
  return openKmlFeatureMediaPreview(kmlFile, feature, {
    selection,
    trigger,
    view,
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
      if (interactionTrigger.dataset.kmlInteraction === 'report') openInteractionReport(item)
      return
    }
    const collectionTrigger = event.target.closest?.('[data-kml-resource-collection]')
    if (collectionTrigger && eventRoot.contains(collectionTrigger)) {
      event.stopPropagation()
      event.preventDefault()
      const currentBinding = popupMediaBindings.get(eventRoot)
      if (currentBinding) openKmlResourceCollectionPanel(currentBinding.kmlFile, currentBinding.feature, {
        trigger: collectionTrigger,
        contentOptions: getKmlContentOptions(),
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

export async function openKmlFeatureContentPanel (kmlFile, feature) {
  if (isKmlResourceCollectionFeature(feature)) {
    openKmlResourceCollectionPanel(kmlFile, feature, { contentOptions: getKmlContentOptions() })
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
