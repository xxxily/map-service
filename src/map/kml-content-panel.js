const CONTENT_URL_LIMIT = 50
const GROUP_ORDER = ['image', 'video', 'iframe', 'link']
const GROUP_TITLES = {
  image: '图片',
  video: '视频',
  iframe: '页面',
  link: '链接',
}
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'm3u8'])
const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'access_token',
  'key',
  'api_key',
  'apikey',
  'secret',
  'password',
  'signature',
  'sign',
  'session',
  'tk',
  'appid',
])

let activeContentRequest = null

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function trimUrlBoundary (value) {
  let text = String(value || '').trim()
  while (/^[<([{"'“‘]+/.test(text)) {
    text = text.slice(1)
  }
  while (/[>),.;:!?，。；：！？、\]}"'”’]+$/.test(text)) {
    text = text.slice(0, -1)
  }
  return text.trim()
}

function normalizeUrl (value) {
  try {
    return new URL(trimUrlBoundary(value))
  } catch (err) {
    return null
  }
}

function isPrivateIpv4 (hostname) {
  const parts = hostname.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  return a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
}

function isBlockedHostname (hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  return !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === 'metadata.google.internal' ||
    host === '169.254.169.254' ||
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80:') ||
    isPrivateIpv4(host)
}

function maskSensitiveQueryParams (url) {
  const parsed = new URL(url.toString())
  for (const key of [...parsed.searchParams.keys()]) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      parsed.searchParams.set(key, '****')
    }
  }
  return parsed.toString()
}

function getExtension (parsed) {
  const matched = /\.([a-z0-9]+)$/i.exec(parsed.pathname)
  return matched ? matched[1].toLowerCase() : ''
}

function getIframeAllowlist () {
  const value = window.MAP_SERVICE_KML_IFRAME_ALLOWLIST || window.mapServiceKmlIframeAllowlist || []
  if (Array.isArray(value)) return value
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean)
}

function matchesIframeAllowlist (parsed) {
  const hostname = parsed.hostname.toLowerCase()
  const originAndPath = `${parsed.origin}${parsed.pathname}`.toLowerCase()
  return getIframeAllowlist().some(entry => {
    const rule = String(entry || '').trim().toLowerCase()
    if (!rule) return false
    if (rule.startsWith('https://')) return originAndPath.startsWith(rule)
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1)
      return hostname.endsWith(suffix) && hostname !== suffix.slice(1)
    }
    return hostname === rule
  })
}

function extractContentUrls (text, limit = CONTENT_URL_LIMIT) {
  const matches = String(text || '').match(/https?:\/\/[^\s<>"'`]+/gi) || []
  const seen = new Set()
  const urls = []
  let truncated = false

  for (const match of matches) {
    const parsed = normalizeUrl(match)
    if (!parsed) continue
    const key = parsed.toString()
    if (seen.has(key)) continue
    seen.add(key)
    if (urls.length >= limit) {
      truncated = true
      continue
    }
    urls.push(parsed)
  }

  return { urls, truncated }
}

function classifyContentUrl (parsed, index) {
  if (parsed.protocol !== 'https:' || isBlockedHostname(parsed.hostname)) return null

  const extension = getExtension(parsed)
  let type = 'link'
  if (IMAGE_EXTENSIONS.has(extension)) {
    type = 'image'
  } else if (VIDEO_EXTENSIONS.has(extension)) {
    type = 'video'
  } else if (matchesIframeAllowlist(parsed)) {
    type = 'iframe'
  }

  const maskedUrl = maskSensitiveQueryParams(parsed)
  return {
    id: `description-link-${index + 1}`,
    type,
    title: parsed.hostname,
    description: '',
    url: maskedUrl,
    displayUrl: maskedUrl,
    thumbnailUrl: type === 'image' ? maskedUrl : '',
    sourceType: 'description-link',
    embedPolicy: type === 'iframe'
      ? {
          sandbox: 'allow-scripts allow-forms allow-popups',
          referrerPolicy: 'no-referrer',
        }
      : null,
  }
}

function emptyGroups () {
  return GROUP_ORDER.map(type => ({
    type,
    title: GROUP_TITLES[type],
    items: [],
  }))
}

function buildLocalContentView (feature) {
  const groups = emptyGroups()
  const groupMap = new Map(groups.map(group => [group.type, group]))
  const { urls, truncated } = extractContentUrls(feature?.description || '')
  urls.forEach((url, index) => {
    const item = classifyContentUrl(url, index)
    if (item) {
      groupMap.get(item.type)?.items.push(item)
    }
  })

  const contentSummary = {
    imageCount: groupMap.get('image').items.length,
    videoCount: groupMap.get('video').items.length,
    iframeCount: groupMap.get('iframe').items.length,
    linkCount: groupMap.get('link').items.length,
  }
  contentSummary.hasRichContent = contentSummary.imageCount > 0 ||
    contentSummary.videoCount > 0 ||
    contentSummary.iframeCount > 0 ||
    contentSummary.linkCount > 0

  return {
    featureId: String(feature?.id || ''),
    groups,
    contentSummary,
    sourceSummary: {
      bindings: 0,
      libraries: 0,
      descriptionLinks: urls.length,
      rejected: 0,
      truncated,
    },
  }
}

export function getFeatureContentSummaryText (feature) {
  return formatContentSummary(buildLocalContentView(feature).contentSummary)
}

function formatContentSummary (summary = {}) {
  const parts = []
  if (summary.imageCount) parts.push(`${summary.imageCount} 张图片`)
  if (summary.videoCount) parts.push(`${summary.videoCount} 个视频`)
  if (summary.iframeCount) parts.push(`${summary.iframeCount} 个页面`)
  if (summary.linkCount) parts.push(`${summary.linkCount} 个链接`)
  return parts.join(' / ')
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
  const description = String(feature?.description || '').trim()
  const coords = Array.isArray(feature?.coordinates) && feature.type === 'Point'
    ? `${Number(feature.coordinates[0]).toFixed(6)}, ${Number(feature.coordinates[1]).toFixed(6)}`
    : ''
  return `
    <section class="kml-content-overview">
      ${description ? `<p>${escapeHtml(description)}</p>` : '<p class="kml-content-muted">暂无描述</p>'}
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
      <img src="${escapeHtml(item.thumbnailUrl || item.url)}" alt="${escapeHtml(item.title || '点位图片')}" loading="lazy">
    </a>
  `
}

function renderVideoItem (item) {
  return `
    <article class="kml-content-card">
      <video controls preload="metadata" src="${escapeHtml(item.url)}"></video>
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || '打开视频')}</a>
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
    iframe: renderIframeItem,
    link: renderLinkItem,
  }[group.type] || renderLinkItem
  return `
    <section class="kml-content-group kml-content-group-${escapeHtml(group.type)}">
      <h3>${escapeHtml(group.title || GROUP_TITLES[group.type] || '内容')}</h3>
      <div class="kml-content-items">
        ${group.items.map(renderer).join('')}
      </div>
    </section>
  `
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
