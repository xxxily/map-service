import {
  buildFeatureContentView,
  formatContentSummary,
  getFeatureDescriptionText,
} from '../../shared/kml-content.js'

let activeContentRequest = null

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getIframeAllowlist () {
  const value = window.MAP_SERVICE_KML_IFRAME_ALLOWLIST || window.mapServiceKmlIframeAllowlist || []
  if (Array.isArray(value)) return value
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean)
}

function buildLocalContentView (feature) {
  return buildFeatureContentView(feature, {
    iframeAllowlist: getIframeAllowlist(),
  })
}

export function getFeatureContentSummaryText (feature) {
  return formatContentSummary(buildLocalContentView(feature).contentSummary)
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
  if (kmlFile?.isPublic && kmlFile.id && feature?.id) {
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
      ${description ? `<p>${escapeHtml(description)}</p>` : '<p class="kml-content-muted">暂无文字描述</p>'}
      <dl>
        <div><dt>图层</dt><dd>${escapeHtml(kmlFile?.name || '未命名图层')}</dd></div>
        <div><dt>类型</dt><dd>${escapeHtml(feature?.type || '未知')}</dd></div>
        ${coords ? `<div><dt>坐标</dt><dd>${escapeHtml(coords)}</dd></div>` : ''}
      </dl>
    </section>
  `
}

function renderImageItem (item) {
  return `
    <a class="kml-content-image-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(item.title || '图片')}">
      <img src="${escapeHtml(item.thumbnailUrl || item.url)}" alt="${escapeHtml(item.title || '点位图片')}" loading="lazy" referrerpolicy="no-referrer">
      <span>图片加载失败，打开原链接</span>
    </a>
  `
}

function renderVideoItem (item) {
  return `
    <article class="kml-content-card">
      <video controls preload="metadata" src="${escapeHtml(item.url)}" referrerpolicy="no-referrer"></video>
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || '打开视频')}</a>
    </article>
  `
}

function renderAudioItem (item) {
  return `
    <article class="kml-content-card kml-content-audio-card">
      <audio controls preload="metadata" src="${escapeHtml(item.url)}"></audio>
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || '打开音频')}</a>
    </article>
  `
}

function renderIframeItem (item) {
  const policy = item.embedPolicy || {}
  return `
    <article class="kml-content-card">
      <iframe src="${escapeHtml(item.url)}" title="${escapeHtml(item.title || '点位页面')}" sandbox="${escapeHtml(policy.sandbox || 'allow-scripts allow-forms allow-popups')}" referrerpolicy="${escapeHtml(policy.referrerPolicy || 'no-referrer')}" loading="lazy"></iframe>
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || '打开页面')}</a>
    </article>
  `
}

function renderLinkItem (item) {
  return `
    <a class="kml-content-link-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
      <span>${escapeHtml(item.title || '链接')}</span>
      <small>${escapeHtml(item.displayUrl || item.url)}</small>
    </a>
  `
}

function renderGroup (group) {
  if (!group.items?.length) return ''
  const renderer = {
    image: renderImageItem,
    video: renderVideoItem,
    audio: renderAudioItem,
    iframe: renderIframeItem,
    link: renderLinkItem,
  }[group.type] || renderLinkItem
  return `
    <section class="kml-content-group kml-content-group-${escapeHtml(group.type)}">
      <h3>${escapeHtml(group.title || '内容')}</h3>
      <div class="kml-content-items">
        ${group.items.map(renderer).join('')}
      </div>
    </section>
  `
}

function bindMediaLoadFallbacks (panel) {
  panel.querySelectorAll('.kml-content-image-item img').forEach(image => {
    image.addEventListener('error', () => image.closest('.kml-content-image-item')?.classList.add('is-load-error'), { once: true })
  })
  panel.querySelectorAll('.kml-content-card video, .kml-content-card audio').forEach(media => {
    media.addEventListener('error', () => media.closest('.kml-content-card')?.classList.add('is-load-error'), { once: true })
  })
}

function renderPanelContent (panel, kmlFile, feature, view, errorMessage = '') {
  const summaryText = formatContentSummary(view?.contentSummary)
  const groupsHtml = (view?.groups || []).map(renderGroup).join('')
  panel.innerHTML = `
    <header class="kml-content-header">
      <div>
        <span class="kml-content-kicker">${escapeHtml(kmlFile?.isPublic ? '公共点位' : '个人点位')}</span>
        <h2>${escapeHtml(feature?.name || '未命名点位')}</h2>
        ${summaryText ? `<p>${escapeHtml(summaryText)}</p>` : ''}
      </div>
      <button type="button" class="kml-content-close" data-kml-content-close aria-label="关闭">×</button>
    </header>
    <div class="kml-content-body">
      ${renderOverview(kmlFile, feature)}
      ${errorMessage ? `<div class="kml-content-error">${escapeHtml(errorMessage)}</div>` : ''}
      ${groupsHtml || '<div class="kml-content-empty">暂无可展示的富媒体内容</div>'}
      ${view?.sourceSummary?.truncated ? '<div class="kml-content-muted">内容较多，仅展示前 50 个链接。</div>' : ''}
    </div>
  `
  panel.querySelector('[data-kml-content-close]')?.addEventListener('click', closePanel)
  bindMediaLoadFallbacks(panel)
}

export async function openKmlFeatureContentPanel (kmlFile, feature) {
  const panel = ensurePanel()
  panel.hidden = false
  panel.innerHTML = `
    <header class="kml-content-header">
      <div>
        <span class="kml-content-kicker">${escapeHtml(kmlFile?.isPublic ? '公共点位' : '个人点位')}</span>
        <h2>${escapeHtml(feature?.name || '未命名点位')}</h2>
      </div>
      <button type="button" class="kml-content-close" data-kml-content-close aria-label="关闭">×</button>
    </header>
    <div class="kml-content-body">
      <div class="kml-content-loading">正在加载点位内容...</div>
    </div>
  `
  panel.querySelector('[data-kml-content-close]')?.addEventListener('click', closePanel)

  try {
    const view = await loadFeatureContentView(kmlFile, feature)
    renderPanelContent(panel, kmlFile, feature, view)
  } catch (err) {
    if (err.name === 'AbortError') return
    const fallback = buildLocalContentView(feature)
    renderPanelContent(panel, kmlFile, feature, fallback, err.message || '点位内容加载失败，已展示本地解析结果。')
  }
}
