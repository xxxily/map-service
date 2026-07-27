const URL_LIMIT = 50
const KML_MEDIA_RELAY_ENDPOINT = '/api/v1/kml/media'
const KML_MEDIA_COMPATIBILITY_RULES = new Map([
  ['down-files.2bulu.com', new Set(['/f/dn1'])],
])

export const CONTENT_GROUP_ORDER = ['image', 'video', 'audio', 'iframe', 'link']
export const CONTENT_GROUP_TITLES = {
  image: '图片',
  video: '视频',
  audio: '音频',
  iframe: '页面',
  link: '链接',
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'svg'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'm3u8', 'ogv'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'])
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
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tr', 'ul',
])
const HTML_ENTITIES = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
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
  const raw = trimUrlBoundary(decodeHtmlEntities(value))
  if (!raw) return null
  try {
    return new URL(raw)
  } catch (err) {
    return null
  }
}

export function normalizeKmlMediaRelayTarget (value) {
  const parsed = normalizeUrl(value)
  if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password) return ''
  if (parsed.port && parsed.port !== '443') return ''
  const allowedPaths = KML_MEDIA_COMPATIBILITY_RULES.get(parsed.hostname.toLowerCase())
  if (!allowedPaths?.has(parsed.pathname)) return ''
  const queryKeys = [...parsed.searchParams.keys()]
  if (queryKeys.length !== 1 || queryKeys[0] !== 'downParams' || !parsed.searchParams.get('downParams')) return ''
  return parsed.toString()
}

export function getKmlMediaRenderUrl (value) {
  const target = normalizeKmlMediaRelayTarget(value)
  return target ? `${KML_MEDIA_RELAY_ENDPOINT}?url=${encodeURIComponent(target)}` : String(value || '')
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
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === 'metadata.google.internal' || host === '169.254.169.254') return true
  if (isPrivateIpv4(host)) return true
  if (host === '::' || host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true
  if (host.startsWith('::ffff:')) return isPrivateIpv4(host.slice(7))
  return false
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

function getExtensionType (parsed) {
  const matched = /\.([a-z0-9]+)$/i.exec(parsed.pathname)
  const extension = matched ? matched[1].toLowerCase() : ''
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  return ''
}

function matchesIframeAllowlist (parsed, allowlist = []) {
  const hostname = parsed.hostname.toLowerCase()
  const originAndPath = `${parsed.origin}${parsed.pathname}`.toLowerCase()
  return allowlist.some(entry => {
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

function decodeHtmlEntities (value) {
  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const normalized = entity.toLowerCase()
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16)
      return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10)
      return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    return HTML_ENTITIES[normalized] ?? match
  })
}

function isValidCodePoint (value) {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
}

function parseTagAttributes (source) {
  const attributes = {}
  const pattern = /([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

function typeFromMime (value) {
  const mime = String(value || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return ''
}

function getFirstSrcsetUrl (value) {
  return String(value || '').split(',')[0]?.trim().split(/\s+/)[0] || ''
}

function collectTagReferences (description) {
  const references = []
  const mediaStack = []
  const tagPattern = /<\s*(\/?)\s*([a-z][\w:-]*)\b([^>]*)>/gi
  let match

  const add = (url, typeHint, tagName, attributes, index) => {
    if (!url) return
    references.push({
      url,
      typeHint: typeHint || '',
      tagName,
      title: attributes.alt || attributes.title || '',
      index,
    })
  }

  while ((match = tagPattern.exec(description)) !== null) {
    const closing = Boolean(match[1])
    const tagName = match[2].toLowerCase()
    if (closing) {
      const stackIndex = mediaStack.map(item => item.tagName).lastIndexOf(tagName)
      if (stackIndex !== -1) mediaStack.splice(stackIndex)
      continue
    }

    const attributes = parseTagAttributes(match[3])
    const selfClosing = /\/\s*$/.test(match[3])
    if (tagName === 'img') {
      add(attributes.src || getFirstSrcsetUrl(attributes.srcset), 'image', tagName, attributes, match.index)
    } else if (tagName === 'image') {
      add(attributes.href || attributes['xlink:href'], 'image', tagName, attributes, match.index)
    } else if (tagName === 'video' || tagName === 'audio') {
      add(attributes.src, tagName, tagName, attributes, match.index)
      if (!selfClosing) mediaStack.push({ tagName, type: tagName })
    } else if (tagName === 'picture') {
      if (!selfClosing) mediaStack.push({ tagName, type: 'image' })
    } else if (tagName === 'source') {
      const parentType = mediaStack.at(-1)?.type || ''
      add(attributes.src || getFirstSrcsetUrl(attributes.srcset), parentType || typeFromMime(attributes.type), tagName, attributes, match.index)
    } else if (tagName === 'iframe' || tagName === 'embed') {
      add(attributes.src, 'iframe', tagName, attributes, match.index)
    } else if (tagName === 'object') {
      add(attributes.data, 'iframe', tagName, attributes, match.index)
    } else if (tagName === 'a') {
      add(attributes.href, '', tagName, attributes, match.index)
    }
  }

  return references
}

export function extractContentReferences (text, options = {}) {
  const limit = Number.isInteger(options.limit) ? options.limit : URL_LIMIT
  const description = String(text || '')
  const candidates = collectTagReferences(description)
  const plainUrlPattern = /https?:\/\/[^\s<>"'`]+/gi
  let match
  while ((match = plainUrlPattern.exec(description)) !== null) {
    candidates.push({
      url: match[0],
      typeHint: '',
      tagName: '',
      title: '',
      index: match.index,
    })
  }
  candidates.sort((a, b) => a.index - b.index)

  const references = []
  const referencesByUrl = new Map()
  let truncated = false
  for (const candidate of candidates) {
    const parsed = normalizeUrl(candidate.url)
    if (!parsed) continue
    const key = parsed.toString()
    const existing = referencesByUrl.get(key)
    if (existing) {
      if (!existing.typeHint && candidate.typeHint) {
        existing.typeHint = candidate.typeHint
        existing.tagName = candidate.tagName
      }
      if (!existing.title && candidate.title) existing.title = candidate.title
      continue
    }
    if (references.length >= limit) {
      truncated = true
      continue
    }
    const reference = {
      url: parsed,
      typeHint: candidate.typeHint,
      tagName: candidate.tagName,
      title: candidate.title,
    }
    references.push(reference)
    referencesByUrl.set(key, reference)
  }

  return { references, truncated }
}

export function extractContentUrls (text, options = {}) {
  const { references, truncated } = extractContentReferences(text, options)
  return {
    urls: references.map(reference => reference.url),
    truncated,
  }
}

function createContentItem (parsed, index, options = {}) {
  const explicitType = ['image', 'video', 'audio', 'iframe'].includes(options.typeHint)
    ? options.typeHint
    : ''
  let type = ['image', 'video', 'audio'].includes(explicitType)
    ? explicitType
    : getExtensionType(parsed) || 'link'
  if (explicitType === 'iframe' || (type === 'link' && matchesIframeAllowlist(parsed, options.iframeAllowlist))) {
    type = matchesIframeAllowlist(parsed, options.iframeAllowlist) ? 'iframe' : 'link'
  }

  const maskedUrl = maskSensitiveQueryParams(parsed)
  const renderUrl = type === 'image'
    ? getKmlMediaRenderUrl(maskedUrl)
    : maskedUrl
  return {
    id: `description-link-${index + 1}`,
    type,
    title: String(options.title || '').trim() || parsed.hostname,
    description: '',
    url: maskedUrl,
    renderUrl,
    displayUrl: maskedUrl,
    thumbnailUrl: type === 'image' ? renderUrl : '',
    sourceType: 'description-link',
    embedPolicy: type === 'iframe'
      ? {
          sandbox: 'allow-scripts allow-forms allow-popups',
          referrerPolicy: 'no-referrer',
        }
      : null,
  }
}

export function classifyContentUrl (value, options = {}) {
  const parsed = normalizeUrl(value)
  if (!parsed) {
    return { accepted: false, reason: 'URL 格式不合法' }
  }
  if (parsed.protocol !== 'https:') {
    return { accepted: false, reason: '仅支持 HTTPS URL' }
  }
  if (isBlockedHostname(parsed.hostname)) {
    return { accepted: false, reason: 'URL 主机不允许访问' }
  }
  return {
    accepted: true,
    item: createContentItem(parsed, Number(options.index || 0), options),
  }
}

export function buildFeatureContentView (feature, options = {}) {
  const { references, truncated } = extractContentReferences(feature?.description || '', options)
  const rejected = []
  const groups = CONTENT_GROUP_ORDER.map(type => ({
    type,
    title: CONTENT_GROUP_TITLES[type],
    items: [],
  }))
  const groupMap = new Map(groups.map(group => [group.type, group]))

  references.forEach((reference, index) => {
    const classified = classifyContentUrl(reference.url.toString(), {
      ...options,
      index,
      typeHint: reference.typeHint,
      title: reference.title,
    })
    if (!classified.accepted) {
      rejected.push({
        url: maskSensitiveQueryParams(reference.url),
        reason: classified.reason,
      })
      return
    }
    groupMap.get(classified.item.type)?.items.push(classified.item)
  })

  const contentSummary = {
    imageCount: groupMap.get('image').items.length,
    videoCount: groupMap.get('video').items.length,
    audioCount: groupMap.get('audio').items.length,
    iframeCount: groupMap.get('iframe').items.length,
    linkCount: groupMap.get('link').items.length,
  }
  contentSummary.hasRichContent = CONTENT_GROUP_ORDER.some(type => groupMap.get(type).items.length > 0)

  return {
    featureId: String(feature?.id || ''),
    groups,
    contentSummary,
    sourceSummary: {
      bindings: 0,
      libraries: 0,
      descriptionLinks: references.length,
      rejected: rejected.length,
      truncated,
    },
    rejected,
  }
}

export function formatContentSummary (summary = {}) {
  const parts = []
  if (summary.imageCount) parts.push(`${summary.imageCount} 张图片`)
  if (summary.videoCount) parts.push(`${summary.videoCount} 个视频`)
  if (summary.audioCount) parts.push(`${summary.audioCount} 段音频`)
  if (summary.iframeCount) parts.push(`${summary.iframeCount} 个页面`)
  if (summary.linkCount) parts.push(`${summary.linkCount} 个链接`)
  return parts.join(' / ')
}

export function getFeatureDescriptionText (featureOrDescription) {
  let text = typeof featureOrDescription === 'object'
    ? String(featureOrDescription?.description || '')
    : String(featureOrDescription || '')
  text = text.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/i, '$1')
  text = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*([a-z][\w:-]*)\s*>/gi, (match, tagName) => BLOCK_TAGS.has(tagName.toLowerCase()) ? '\n' : '')
    .replace(/<[^>]*>/g, '')
  return decodeHtmlEntities(text)
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map(line => line.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

export function inferKmlStyleContentType (styleUrl) {
  const style = String(styleUrl || '').toLowerCase()
  if (/(?:picture|photo|image)/.test(style)) return 'image'
  if (/video/.test(style)) return 'video'
  if (/(?:sound|audio)/.test(style)) return 'audio'
  return ''
}

export function getFeatureContentTypes (feature, options = {}) {
  const { references } = extractContentReferences(feature?.description || '', options)
  const detected = references.flatMap((reference, index) => {
    const classified = classifyContentUrl(reference.url.toString(), {
      ...options,
      index,
      typeHint: reference.typeHint,
    })
    if (!classified.accepted) return []
    return reference.typeHint || classified.item.type
  })
  const styleType = inferKmlStyleContentType(feature?.styleUrl)
  return [...new Set([styleType, ...detected].filter(Boolean))]
}

export function getPrimaryFeatureContentType (feature, options = {}) {
  return getFeatureContentTypes(feature, options)[0] || ''
}
