const DEFAULT_SHARE_LINK_LIMIT = 10
const DOUYIN_VIDEO_ID_PATTERN = /^\d{10,32}$/
const DOUYIN_SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{4,100}$/
const SEVEN_TWENTY_RESOURCE_ID_PATTERN = /^[A-Za-z0-9]{6,64}$/

function trimUrlBoundary (value) {
  let text = String(value || '').trim()
  while (/^[<([{"'“‘]+/.test(text)) text = text.slice(1)
  while (/[>),.;:!?，。；：！？、\]}"'”’]+$/.test(text)) text = text.slice(0, -1)
  return text.trim()
}

function normalizeHttpsUrl (value) {
  const raw = trimUrlBoundary(value)
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null
    parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
    return parsed
  } catch {
    return null
  }
}

function normalizeDouyinSourceUrl (parsed) {
  const normalized = new URL(parsed)
  normalized.hash = ''
  if (normalized.hostname === 'v.douyin.com') {
    normalized.search = ''
    const pathSegments = normalized.pathname.split('/').filter(Boolean)
    if (pathSegments.length !== 1) return ''
    const shortCode = pathSegments[0] || ''
    if (!DOUYIN_SHORT_CODE_PATTERN.test(shortCode)) return ''
    normalized.pathname = `/${shortCode}/`
    return normalized.toString()
  }

  const videoId = extractDouyinVideoId(normalized)
  if (!videoId) return ''
  return buildDouyinCanonicalUrl(videoId)
}

function extractDouyinVideoId (parsed) {
  const hostname = parsed.hostname.toLowerCase()
  let videoId = ''
  if (hostname === 'open.douyin.com' && parsed.pathname === '/player/video') {
    videoId = parsed.searchParams.get('vid') || ''
  } else if (hostname === 'douyin.com' || hostname === 'www.douyin.com') {
    videoId = /^\/video\/(\d+)\/?$/i.exec(parsed.pathname)?.[1] || ''
  } else if (hostname === 'iesdouyin.com' || hostname === 'www.iesdouyin.com') {
    videoId = /^\/share\/video\/(\d+)\/?$/i.exec(parsed.pathname)?.[1] || ''
  }
  return DOUYIN_VIDEO_ID_PATTERN.test(videoId) ? videoId : ''
}

function buildDouyinCanonicalUrl (videoId) {
  return `https://www.douyin.com/video/${videoId}`
}

function buildDouyinEmbedUrl (videoId) {
  return `https://open.douyin.com/player/video?vid=${videoId}`
}

function buildDouyinPreviewUrl (videoId) {
  const url = new URL(buildDouyinEmbedUrl(videoId))
  // 抖音官方播放器在移动布局默认只创建 324×672px 的播放器；使用
  // 视口单位让它跟随 iframe 视口。额外预留官方播放器底部跳转栏的高度，
  // 让该跳转栏落在 iframe 可视区域之外，避免露出白色空白区域。
  url.searchParams.set('width', '100vw')
  // 抖音播放器读取原始查询串时不兼容 URLSearchParams 把空格编码成 `+`，
  // 因此这里保留 `%20`，否则 calc() 会被当成无效高度并重新露出白色页脚。
  return `${url.toString()}&height=${encodeURIComponent('calc(100vh + 48px)')}`
}

function parse720yunResource (parsed) {
  if (!parsed || !['720yun.com', 'www.720yun.com'].includes(parsed.hostname.toLowerCase())) return null
  const match = /^\/(vr|t)\/([A-Za-z0-9]{6,64})\/?$/i.exec(parsed.pathname)
  if (!match || !SEVEN_TWENTY_RESOURCE_ID_PATTERN.test(match[2])) return null
  return {
    kind: match[1].toLowerCase(),
    id: match[2],
    resourceId: `${match[1].toLowerCase()}:${match[2]}`,
  }
}

function split720yunResourceId (value) {
  const match = /^(vr|t):([A-Za-z0-9]{6,64})$/i.exec(String(value || '').trim())
  if (!match || !SEVEN_TWENTY_RESOURCE_ID_PATTERN.test(match[2])) return null
  return { kind: match[1].toLowerCase(), id: match[2] }
}

function build720yunUrl (resourceId) {
  const resource = split720yunResourceId(resourceId)
  return resource ? `https://www.720yun.com/${resource.kind}/${resource.id}` : ''
}

function normalize720yunSourceUrl (parsed) {
  const resource = parse720yunResource(parsed)
  if (!resource) return ''
  const normalized = new URL(build720yunUrl(resource.resourceId))
  normalized.search = parsed.search
  normalized.hash = parsed.hash
  return normalized.toString()
}

function build720yunEmbedUrl (resourceId, sourceUrl = '') {
  const canonicalUrl = build720yunUrl(resourceId)
  const parsedSource = normalizeHttpsUrl(sourceUrl)
  if (!parsedSource) return canonicalUrl
  const sourceResource = parse720yunResource(parsedSource)
  return sourceResource?.resourceId === resourceId
    ? normalize720yunSourceUrl(parsedSource)
    : canonicalUrl
}

const DOUYIN_PROVIDER = Object.freeze({
  id: 'douyin',
  label: '抖音',
  title: '抖音视频',
  shortHosts: Object.freeze(['v.douyin.com']),
  redirectHosts: Object.freeze([
    'v.douyin.com',
    'douyin.com',
    'www.douyin.com',
    'iesdouyin.com',
    'www.iesdouyin.com',
  ]),
  match (parsed) {
    return [
      'v.douyin.com',
      'douyin.com',
      'www.douyin.com',
      'iesdouyin.com',
      'www.iesdouyin.com',
      'open.douyin.com',
    ].includes(parsed.hostname.toLowerCase())
  },
  normalizeSourceUrl: normalizeDouyinSourceUrl,
  extractResourceId: extractDouyinVideoId,
  validateResourceId: value => DOUYIN_VIDEO_ID_PATTERN.test(String(value || '')),
  requiresServerResolution (parsed) {
    return parsed.hostname.toLowerCase() === 'v.douyin.com' && !extractDouyinVideoId(parsed)
  },
  buildCanonicalUrl: buildDouyinCanonicalUrl,
  buildEmbedUrl: buildDouyinEmbedUrl,
  buildPreviewUrl: buildDouyinPreviewUrl,
  embedPolicy: Object.freeze({
    sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation',
    referrerPolicy: 'no-referrer',
    allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
    allowFullscreen: true,
  }),
})

const SEVEN_TWENTY_PROVIDER = Object.freeze({
  id: '720yun',
  label: '720 云',
  title: '720 云全景',
  shortHosts: Object.freeze(['720yun.com', 'www.720yun.com']),
  redirectHosts: Object.freeze(['720yun.com', 'www.720yun.com']),
  match (parsed) {
    return Boolean(parse720yunResource(parsed))
  },
  normalizeSourceUrl: normalize720yunSourceUrl,
  extractResourceId (parsed) {
    return parse720yunResource(parsed)?.resourceId || ''
  },
  validateResourceId: value => Boolean(split720yunResourceId(value)),
  requiresServerResolution: () => false,
  buildCanonicalUrl: build720yunUrl,
  buildEmbedUrl: build720yunEmbedUrl,
  embedPolicy: Object.freeze({
    sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-presentation',
    referrerPolicy: 'no-referrer',
    allow: 'autoplay; fullscreen; gyroscope; accelerometer; picture-in-picture; xr-spatial-tracking',
    allowFullscreen: true,
  }),
})

export const KML_SHARE_LINK_PROVIDERS = Object.freeze([DOUYIN_PROVIDER, SEVEN_TWENTY_PROVIDER])

export function getKmlShareLinkProvider (providerId) {
  return KML_SHARE_LINK_PROVIDERS.find(provider => provider.id === String(providerId || '')) || null
}

function providerForUrl (parsed) {
  return KML_SHARE_LINK_PROVIDERS.find(provider => provider.match(parsed)) || null
}

export function createKmlShareEmbedItem (providerId, resourceId, sourceUrl = '') {
  const provider = getKmlShareLinkProvider(providerId)
  const id = String(resourceId || '').trim()
  if (!provider || !provider.validateResourceId?.(id)) return null

  const canonicalUrl = provider.buildCanonicalUrl(id)
  let normalizedSourceUrl = canonicalUrl
  const parsedSource = normalizeHttpsUrl(sourceUrl)
  if (parsedSource && provider.match(parsedSource)) {
    const sourceResourceId = provider.extractResourceId(parsedSource)
    if (!sourceResourceId || sourceResourceId === id) {
      normalizedSourceUrl = provider.normalizeSourceUrl(parsedSource) || canonicalUrl
    }
  }

  return {
    provider: provider.id,
    providerLabel: provider.label,
    mediaType: 'iframe',
    resourceId: id,
    title: provider.title,
    sourceUrl: normalizedSourceUrl,
    canonicalUrl,
    embedUrl: provider.buildEmbedUrl(id, normalizedSourceUrl),
  }
}

export function resolveKnownKmlShareLink (value) {
  const parsed = normalizeHttpsUrl(value)
  if (!parsed) return { recognized: false }
  const provider = providerForUrl(parsed)
  if (!provider) return { recognized: false }
  const sourceUrl = provider.normalizeSourceUrl(parsed)
  if (!sourceUrl) return { recognized: false }
  const resourceId = provider.extractResourceId(parsed)
  if (resourceId) {
    return {
      recognized: true,
      requiresServerResolution: false,
      provider: provider.id,
      sourceUrl,
      item: createKmlShareEmbedItem(provider.id, resourceId, sourceUrl),
    }
  }
  if (provider.requiresServerResolution(parsed)) {
    return {
      recognized: true,
      requiresServerResolution: true,
      provider: provider.id,
      sourceUrl,
      item: null,
    }
  }
  return { recognized: false }
}

export function extractKmlShareLinkCandidates (text, options = {}) {
  const limit = Number.isSafeInteger(Number(options.limit)) && Number(options.limit) > 0
    ? Number(options.limit)
    : DEFAULT_SHARE_LINK_LIMIT
  const source = String(text || '')
  const pattern = /https?:\/\/[^\s<>"'`，。；：！？、]+/gi
  const candidates = []
  const seen = new Set()
  let supportedCount = 0
  let match

  while ((match = pattern.exec(source)) !== null) {
    const openingTag = source.lastIndexOf('<', match.index)
    const closingTag = source.lastIndexOf('>', match.index)
    if (openingTag > closingTag) continue
    const resolved = resolveKnownKmlShareLink(match[0])
    if (!resolved.recognized || seen.has(resolved.sourceUrl)) continue
    seen.add(resolved.sourceUrl)
    supportedCount += 1
    if (candidates.length < limit) {
      candidates.push({
        index: match.index,
        rawUrl: trimUrlBoundary(match[0]),
        ...resolved,
      })
    }
  }

  return {
    candidates,
    supportedCount,
    truncated: supportedCount > candidates.length,
    limit,
  }
}

export function normalizeKmlShareLinksInText (text) {
  const source = String(text || '')
  const pattern = /https?:\/\/[^\s<>"'`，。；：！？、]+/gi
  return source.replace(pattern, (matched, offset) => {
    const openingTag = source.lastIndexOf('<', offset)
    const closingTag = source.lastIndexOf('>', offset)
    if (openingTag > closingTag) return matched
    const rawUrl = trimUrlBoundary(matched)
    const resolved = resolveKnownKmlShareLink(rawUrl)
    if (!resolved.recognized) return matched
    const start = matched.indexOf(rawUrl)
    return `${matched.slice(0, start)}${resolved.sourceUrl}${matched.slice(start + rawUrl.length)}`
  })
}

function decodeHtmlAttribute (value) {
  return String(value || '')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function parseTagAttributes (source) {
  const attributes = {}
  const pattern = /([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    attributes[match[1].toLowerCase()] = decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

function escapeHtmlAttribute (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function getTrustedKmlShareEmbed (value) {
  const parsed = normalizeHttpsUrl(value)
  if (!parsed) return null
  const provider = providerForUrl(parsed)
  if (!provider) return null
  const resourceId = provider.extractResourceId(parsed)
  const sourceUrl = provider.normalizeSourceUrl(parsed)
  const item = createKmlShareEmbedItem(provider.id, resourceId, sourceUrl)
  if (!item || parsed.toString() !== item.embedUrl) return null
  return {
    ...item,
    previewUrl: provider.buildPreviewUrl?.(resourceId) || item.embedUrl,
    embedPolicy: { ...provider.embedPolicy },
  }
}

export function isTrustedKmlShareEmbedUrl (value) {
  return Boolean(getTrustedKmlShareEmbed(value))
}

export function normalizeKmlShareEmbedItem (value) {
  if (!value || typeof value !== 'object') return null
  return createKmlShareEmbedItem(value.provider, value.resourceId, value.sourceUrl)
}

export function extractGeneratedKmlShareEmbeds (description) {
  const items = []
  const seen = new Set()
  const pattern = /<iframe\b([^>]*)>\s*<\/iframe\s*>/gi
  let match
  while ((match = pattern.exec(String(description || ''))) !== null) {
    const attributes = parseTagAttributes(match[1])
    const providerId = attributes['data-kml-share-provider'] || ''
    if (!providerId) continue
    const trusted = getTrustedKmlShareEmbed(attributes.src)
    if (!trusted || trusted.provider !== providerId) continue
    const item = createKmlShareEmbedItem(providerId, trusted.resourceId, attributes['data-kml-share-source'])
    const key = `${item.provider}:${item.resourceId}`
    if (!seen.has(key)) {
      seen.add(key)
      items.push(item)
    }
  }
  return items
}

export function stripGeneratedKmlShareEmbeds (description) {
  return String(description || '')
    .replace(/<iframe\b([^>]*)>\s*<\/iframe\s*>/gi, (markup, attributesSource) => {
      const attributes = parseTagAttributes(attributesSource)
      return attributes['data-kml-share-provider'] ? '' : markup
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function renderKmlShareEmbedMarkup (value) {
  const item = normalizeKmlShareEmbedItem(value)
  if (!item) return ''
  return `<iframe src="${escapeHtmlAttribute(item.embedUrl)}" title="${escapeHtmlAttribute(item.title)}" data-kml-share-provider="${escapeHtmlAttribute(item.provider)}" data-kml-share-source="${escapeHtmlAttribute(item.sourceUrl)}" data-kml-share-canonical="${escapeHtmlAttribute(item.canonicalUrl)}"></iframe>`
}

export function mergeKmlShareEmbeds (description, items = []) {
  const base = stripGeneratedKmlShareEmbeds(description)
  const seen = new Set()
  const markup = []
  items.forEach(value => {
    const item = normalizeKmlShareEmbedItem(value)
    if (!item) return
    const key = `${item.provider}:${item.resourceId}`
    if (seen.has(key)) return
    seen.add(key)
    markup.push(renderKmlShareEmbedMarkup(item))
  })
  return [base, ...markup].filter(Boolean).join('\n\n')
}

export { DEFAULT_SHARE_LINK_LIMIT }
