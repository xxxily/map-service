import { getTrustedKmlShareEmbed, resolveKnownKmlShareLink } from './kml-share-links.js'
import { tryNormalizeKmlResourceCollection, tryNormalizeKmlResourceCollectionRef } from './kml-resource-collection.js'
import { createStableInteractionId, normalizeInteractionFeatureId } from './interaction-resource-id.js'

const URL_LIMIT = 50
const KML_MEDIA_RELAY_ENDPOINT = '/api/v1/kml/media'
const KML_MEDIA_COMPATIBILITY_RULES = new Map([
  ['down-files.2bulu.com', new Set(['/f/dn1'])],
])
const TWO_BULU_MEDIA_HOST = 'down-files.2bulu.com'
const TWO_BULU_MEDIA_PATHS = new Set(['/f/d1', '/f/dn1'])
// Media detection is used by markers, list rows, popups and the detail panel.
// Keep the parsed view on the feature object and invalidate it when the small
// content signature changes instead of running the HTML scanner for every use.
const FEATURE_CONTENT_VIEW_CACHE = new WeakMap()

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

function normalizeThumbnailUrl (value) {
  const parsed = normalizeUrl(value)
  if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password || isBlockedHostname(parsed.hostname)) {
    return null
  }
  return parsed
}

function getFirstSrcsetUrl (value) {
  return String(value || '').split(',')[0]?.trim().split(/\s+/)[0] || ''
}

function collectTagReferences (description) {
  const references = []
  const mediaStack = []
  const anchorStack = []
  const tagPattern = /<\s*(\/?)\s*([a-z][\w:-]*)\b([^>]*)>/gi
  let match

  const add = (url, typeHint, tagName, attributes, index, extra = {}) => {
    if (!url) return
    references.push({
      url,
      typeHint: typeHint || '',
      tagName,
      title: attributes.alt || attributes.title || '',
      index,
      ...extra,
    })
  }

  const closeAnchor = () => {
    const stackIndex = anchorStack.map(item => item.tagName).lastIndexOf('a')
    if (stackIndex === -1) return
    const anchor = anchorStack.splice(stackIndex, 1)[0]
    const imageUsesHref = anchor.imageUrl && (
      anchor.href === anchor.imageUrl ||
      canUseAnchorAsImageSource(anchor.href, anchor.imageUrl)
    )
    if (anchor.href && (!anchor.hasImage || !imageUsesHref)) {
      add(anchor.href, '', 'a', anchor.attributes, anchor.index)
    }
  }

  while ((match = tagPattern.exec(description)) !== null) {
    const closing = Boolean(match[1])
    const tagName = match[2].toLowerCase()
    if (closing) {
      if (tagName === 'a') {
        closeAnchor()
        continue
      }
      const stackIndex = mediaStack.map(item => item.tagName).lastIndexOf(tagName)
      if (stackIndex !== -1) mediaStack.splice(stackIndex)
      continue
    }

    const attributes = parseTagAttributes(match[3])
    const selfClosing = /\/\s*$/.test(match[3])
    if (tagName === 'img') {
      const imageUrl = attributes.src || getFirstSrcsetUrl(attributes.srcset)
      const anchor = anchorStack.at(-1)
      if (anchor) {
        anchor.hasImage = true
        anchor.imageUrl ||= imageUrl
      }
      add(imageUrl, 'image', tagName, attributes, match.index, {
        linkedUrl: anchor?.href || '',
      })
    } else if (tagName === 'image') {
      const imageUrl = attributes.href || attributes['xlink:href']
      const anchor = anchorStack.at(-1)
      if (anchor) {
        anchor.hasImage = true
        anchor.imageUrl ||= imageUrl
      }
      add(imageUrl, 'image', tagName, attributes, match.index, {
        linkedUrl: anchor?.href || '',
      })
    } else if (tagName === 'video' || tagName === 'audio') {
      add(attributes.src, tagName, tagName, attributes, match.index)
      if (!selfClosing) mediaStack.push({ tagName, type: tagName })
    } else if (tagName === 'picture') {
      if (!selfClosing) mediaStack.push({ tagName, type: 'image' })
    } else if (tagName === 'source') {
      const parentType = mediaStack.at(-1)?.type || ''
      add(attributes.src || getFirstSrcsetUrl(attributes.srcset), parentType || typeFromMime(attributes.type), tagName, attributes, match.index)
    } else if (tagName === 'iframe') {
      add(attributes.src, 'iframe', tagName, attributes, match.index, {
        provider: attributes['data-kml-share-provider'] || '',
        sourceUrl: attributes['data-kml-share-source'] || '',
        canonicalUrl: attributes['data-kml-share-canonical'] || '',
      })
    } else if (tagName === 'embed') {
      add(attributes.src, typeFromMime(attributes.type), tagName, attributes, match.index)
    } else if (tagName === 'object') {
      add(attributes.data, typeFromMime(attributes.type), tagName, attributes, match.index)
    } else if (tagName === 'a') {
      anchorStack.push({
        tagName,
        href: attributes.href || '',
        attributes,
        index: match.index,
        hasImage: false,
      })
    }
  }

  // 容错处理未闭合的锚点。正常情况下会在遇到 </a> 时完成；页面导入的
  // 富文本偶尔会缺少闭合标签，不能因此丢掉普通链接。
  while (anchorStack.length) {
    const anchor = anchorStack.pop()
    if (!anchor.hasImage && anchor.href) add(anchor.href, '', 'a', anchor.attributes, anchor.index)
  }

  return references
}

function isLikelyImageUrl (value) {
  const parsed = value instanceof URL ? value : normalizeUrl(value)
  if (!parsed) return false
  return IMAGE_EXTENSIONS.has((/\.([a-z0-9]+)$/i.exec(parsed.pathname)?.[1] || '').toLowerCase())
}

function canUseAnchorAsImageSource (anchorUrl, imageUrl) {
  if (!anchorUrl || !imageUrl) return false
  if (anchorUrl.toString() === imageUrl.toString()) return false
  const anchor = anchorUrl instanceof URL ? anchorUrl : normalizeUrl(anchorUrl)
  const image = imageUrl instanceof URL ? imageUrl : normalizeUrl(imageUrl)
  if (!anchor || !image || anchor.protocol !== 'https:' || image.protocol !== 'https:') return false
  // 两步路及多数图片 CDN 会用相同路径、不同 downParams/尺寸参数提供
  // 原图和缩略图；这种结构应合并为一个媒体项。
  if (anchor.hostname.toLowerCase() === image.hostname.toLowerCase() && anchor.pathname === image.pathname) return true
  if (anchor.hostname.toLowerCase() === TWO_BULU_MEDIA_HOST &&
      image.hostname.toLowerCase() === TWO_BULU_MEDIA_HOST &&
      TWO_BULU_MEDIA_PATHS.has(anchor.pathname) && TWO_BULU_MEDIA_PATHS.has(image.pathname)) return true
  // 也兼容常见的 /large.jpg 与 /thumb.jpg 链接包裹形式。
  return isLikelyImageUrl(anchor) && isLikelyImageUrl(image)
}

function isUrlInsideMarkup (text, index) {
  const opening = String(text || '').lastIndexOf('<', index)
  const closing = String(text || '').lastIndexOf('>', index)
  return opening > closing
}

export function extractContentReferences (text, options = {}) {
  const limit = Number.isInteger(options.limit) ? options.limit : URL_LIMIT
  const description = String(text || '')
  const candidates = collectTagReferences(description)
  const plainUrlPattern = /https?:\/\/[^\s<>"'`，。；：！？、]+/gi
  let match
  while ((match = plainUrlPattern.exec(description)) !== null) {
    // 标签属性中的 href/src 会由结构化标签解析处理；跳过这里，避免
    // `<a href="原图"><img src="缩略图"></a>` 被拆成额外的链接/图片媒体。
    if (isUrlInsideMarkup(description, match.index)) continue
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
    let parsed = normalizeUrl(candidate.url)
    if (!parsed) continue

    let thumbnailUrl = null
    if (candidate.typeHint === 'image' && candidate.linkedUrl) {
      const linked = normalizeUrl(candidate.linkedUrl)
      if (canUseAnchorAsImageSource(linked, parsed)) {
        thumbnailUrl = parsed
        parsed = linked
      }
    }
    const key = parsed.toString()
    const existing = referencesByUrl.get(key)
    if (existing) {
      if (!existing.typeHint && candidate.typeHint) {
        existing.typeHint = candidate.typeHint
        existing.tagName = candidate.tagName
      }
      if (!existing.title && candidate.title) existing.title = candidate.title
      if (!existing.thumbnailUrl && thumbnailUrl) existing.thumbnailUrl = thumbnailUrl
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
      thumbnailUrl,
      provider: candidate.provider || '',
      sourceUrl: candidate.sourceUrl || '',
      canonicalUrl: candidate.canonicalUrl || '',
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
  const directTrustedShareEmbed = getTrustedKmlShareEmbed(parsed)
  // Canonical provider URLs (for example www.douyin.com/video/<id>) are
  // safe to upgrade locally even though the persisted player URL is the
  // provider's official embed endpoint. Short links without a resource ID
  // still remain ordinary links until the server resolver expands them.
  const trustedShareEmbed = directTrustedShareEmbed || (() => {
    const known = resolveKnownKmlShareLink(parsed.toString())
    if (!known.item) return null
    const embed = getTrustedKmlShareEmbed(known.item.embedUrl)
    return embed
      ? { ...embed, sourceUrl: known.item.sourceUrl, canonicalUrl: known.item.canonicalUrl }
      : null
  })()
  const explicitType = ['image', 'video', 'audio', 'iframe'].includes(options.typeHint)
    ? options.typeHint
    : ''
  let type = ['image', 'video', 'audio'].includes(explicitType)
    ? explicitType
    : getExtensionType(parsed) || 'link'
  if (trustedShareEmbed || explicitType === 'iframe' || (type === 'link' && matchesIframeAllowlist(parsed, options.iframeAllowlist))) {
    type = trustedShareEmbed || matchesIframeAllowlist(parsed, options.iframeAllowlist) ? 'iframe' : 'link'
  }

  const maskedUrl = maskSensitiveQueryParams(parsed)
  const renderUrl = type === 'image'
    ? getKmlMediaRenderUrl(maskedUrl)
    : type === 'iframe'
      ? (trustedShareEmbed?.previewUrl || maskedUrl)
      : maskedUrl
  const thumbnailParsed = type === 'image' ? normalizeThumbnailUrl(options.thumbnailUrl) : null
  const maskedThumbnailUrl = thumbnailParsed ? maskSensitiveQueryParams(thumbnailParsed) : ''
  const thumbnailRenderUrl = maskedThumbnailUrl ? getKmlMediaRenderUrl(maskedThumbnailUrl) : ''
  let shareSourceUrl = ''
  if (trustedShareEmbed) {
    const sourceCandidate = resolveKnownKmlShareLink(options.sourceUrl || '')
    if (
      sourceCandidate.recognized &&
      sourceCandidate.provider === trustedShareEmbed.provider &&
      (!sourceCandidate.item || sourceCandidate.item.resourceId === trustedShareEmbed.resourceId)
    ) {
      shareSourceUrl = sourceCandidate.sourceUrl
    } else {
      shareSourceUrl = trustedShareEmbed.canonicalUrl
    }
  }
  const maskedShareSourceUrl = shareSourceUrl
    ? maskSensitiveQueryParams(new URL(shareSourceUrl))
    : ''
  const itemTitle = String(options.title || '').trim() || trustedShareEmbed?.title || parsed.hostname
  return {
    id: `description-link-${index + 1}`,
    type,
    title: itemTitle,
    description: '',
    url: maskedUrl,
    renderUrl,
    displayUrl: trustedShareEmbed?.canonicalUrl || maskedShareSourceUrl || maskedUrl,
    thumbnailUrl: type === 'image' ? (thumbnailRenderUrl || renderUrl) : '',
    sourceType: trustedShareEmbed ? 'description-share-embed' : 'description-link',
    ...(trustedShareEmbed ? {
      provider: trustedShareEmbed.provider,
      providerLabel: trustedShareEmbed.providerLabel,
      resourceId: trustedShareEmbed.resourceId,
      sourceUrl: maskedShareSourceUrl,
      canonicalUrl: trustedShareEmbed.canonicalUrl,
    } : {}),
    autoplay: type === 'video',
    embedPolicy: type === 'iframe'
      ? (trustedShareEmbed?.embedPolicy || {
          sandbox: 'allow-scripts allow-forms allow-popups',
          referrerPolicy: 'no-referrer',
        })
      : null,
  }
}

/**
 * Return a deterministic opaque media identifier for interaction services.
 * The source key deliberately includes the normalized media URL for
 * description links and the collection item ID for collection resources.
 * `featureId` is part of the namespace, so identical URLs on two points do
 * not share a thread accidentally.
 */
export function createInteractionMediaId (featureId, item, occurrence = 0) {
  const sourceType = String(item?.sourceType || 'description').trim() || 'description'
  const type = String(item?.type || 'unknown').trim() || 'unknown'
  const source = sourceType === 'resource-collection'
    ? String(item?.collectionItemId || item?.id || occurrence).trim()
    : String(item?.canonicalUrl || item?.displayUrl || item?.url || '').trim()
  const duplicateSuffix = Number(occurrence) > 0 ? `|${Number(occurrence)}` : ''
  return createStableInteractionId('media', `${normalizeInteractionFeatureId(featureId)}|${sourceType}|${type}|${source}${duplicateSuffix}`)
}

function attachInteractionMediaId (featureId, item, occurrence = 0) {
  return {
    ...item,
    mediaId: item?.mediaId || createInteractionMediaId(featureId, item, occurrence),
  }
}

function interactionMediaSourceKey (item) {
  const sourceType = String(item?.sourceType || 'description').trim() || 'description'
  const type = String(item?.type || 'unknown').trim() || 'unknown'
  const source = sourceType === 'resource-collection'
    ? String(item?.collectionItemId || item?.id || '').trim()
    : String(item?.canonicalUrl || item?.displayUrl || item?.url || '').trim()
  return `${sourceType}|${type}|${source}`
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

export function buildResourceCollectionContentView (resourceCollection, options = {}) {
  const normalized = options.normalizedResourceCollection === true
    ? resourceCollection
    : tryNormalizeKmlResourceCollection(resourceCollection).value
  const groups = CONTENT_GROUP_ORDER.map(type => ({
    type,
    title: CONTENT_GROUP_TITLES[type],
    items: [],
  }))
  const groupMap = new Map(groups.map(group => [group.type, group]))
  const rejected = []
  const items = normalized?.items || []
  items.forEach((resource, index) => {
    const classified = classifyContentUrl(resource.url, {
      ...options,
      index,
      typeHint: resource.type === 'auto' ? '' : resource.type,
      title: resource.title,
    })
    if (!classified.accepted) {
      rejected.push({ url: resource.url, reason: classified.reason, collectionItemId: resource.id })
      return
    }
    const item = {
      ...classified.item,
      id: `resource-collection-${resource.id}`,
      collectionItemId: resource.id,
      sourceType: 'resource-collection',
    }
    groupMap.get(item.type)?.items.push(attachInteractionMediaId(options.featureId, item))
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
    featureId: '',
    groups,
    contentSummary,
    sourceSummary: {
      bindings: 0,
      libraries: 0,
      descriptionLinks: 0,
      collectionItems: items.length,
      rejected: rejected.length,
      truncated: false,
    },
    rejected,
  }
}

export function buildResourceCollectionRefPlaceholder (resourceCollectionRef, options = {}) {
  const result = tryNormalizeKmlResourceCollectionRef(resourceCollectionRef)
  if (!result.value) return { ok: false, error: result.error }
  const ref = result.value
  return {
    ok: true,
    ref,
    featureId: String(options.featureId || ''),
    groups: [],
    contentSummary: { imageCount: 0, videoCount: 0, audioCount: 0, iframeCount: 0, linkCount: 0, hasRichContent: false },
    sourceSummary: { bindings: 0, libraries: 0, descriptionLinks: 0, collectionItems: 0, rejected: 0, truncated: false, collectionRef: ref.sourceType },
    rejected: [],
    needsLoad: true,
  }
}

function getEmbeddedShareSourceUrls (references) {
  return new Set(references.flatMap(reference => {
    const trusted = getTrustedKmlShareEmbed(reference.url)
    const source = trusted ? resolveKnownKmlShareLink(reference.sourceUrl || '') : null
    return source?.recognized ? [source.sourceUrl] : []
  }))
}

function isEmbeddedShareSourceReference (reference, sourceUrls) {
  const sourceLink = resolveKnownKmlShareLink(reference.url)
  return !reference.typeHint && sourceLink.recognized && sourceUrls.has(sourceLink.sourceUrl)
}

function getFeatureContentViewCacheKey (feature, options = {}) {
  const allowlist = Array.isArray(options.iframeAllowlist)
    ? options.iframeAllowlist.map(value => String(value || '').trim()).join(',')
    : String(options.iframeAllowlist || '')
  return {
    id: String(feature?.id || ''),
    description: String(feature?.description || ''),
    styleUrl: String(feature?.styleUrl || ''),
    resourceCollection: feature?.resourceCollection || null,
    resourceCollectionRef: feature?.resourceCollectionRef || null,
    includeResourceCollections: options.includeResourceCollections !== false,
    allowlist,
    limit: Number.isInteger(options.limit) ? options.limit : URL_LIMIT,
  }
}

function isFeatureContentViewCacheKeyEqual (left, right) {
  return Boolean(left && right) &&
    left.id === right.id &&
    left.description === right.description &&
    left.styleUrl === right.styleUrl &&
    left.resourceCollection === right.resourceCollection &&
    left.resourceCollectionRef === right.resourceCollectionRef &&
    left.includeResourceCollections === right.includeResourceCollections &&
    left.allowlist === right.allowlist &&
    left.limit === right.limit
}

function buildFeatureContentViewUncached (feature, options = {}) {
  const { references, truncated } = extractContentReferences(feature?.description || '', options)
  const embeddedShareSourceUrls = getEmbeddedShareSourceUrls(references)
  const styleType = inferKmlStyleContentType(feature?.styleUrl)
  const rejected = []
  const mediaOccurrences = new Map()
  const groups = CONTENT_GROUP_ORDER.map(type => ({
    type,
    title: CONTENT_GROUP_TITLES[type],
    items: [],
  }))
  const groupMap = new Map(groups.map(group => [group.type, group]))

  references.forEach((reference, index) => {
    if (isEmbeddedShareSourceReference(reference, embeddedShareSourceUrls)) return
    const typeHint = ['embed', 'object'].includes(reference.tagName) && !reference.typeHint && styleType === 'video'
      ? 'video'
      : reference.typeHint
    const classified = classifyContentUrl(reference.url.toString(), {
      ...options,
      index,
      typeHint,
      title: reference.title,
      tagName: reference.tagName,
      thumbnailUrl: reference.thumbnailUrl,
      provider: reference.provider,
      sourceUrl: reference.sourceUrl,
      canonicalUrl: reference.canonicalUrl,
    })
    if (!classified.accepted) {
      rejected.push({
        url: maskSensitiveQueryParams(reference.url),
        reason: classified.reason,
      })
      return
    }
    const item = classified.item
    const sourceKey = interactionMediaSourceKey(item)
    const occurrence = Number(mediaOccurrences.get(sourceKey) || 0)
    mediaOccurrences.set(sourceKey, occurrence + 1)
    groupMap.get(item.type)?.items.push(
      attachInteractionMediaId(feature?.id, item, occurrence)
    )
  })

  const collectionItems = options.includeResourceCollections === false
    ? []
    : Array.isArray(feature?.resourceCollection?.items)
    ? feature.resourceCollection.items
    : []
  collectionItems.forEach((resource, index) => {
    const classified = classifyContentUrl(resource?.url, {
      ...options,
      index: references.length + index,
      typeHint: resource?.type === 'auto' ? '' : resource?.type,
      title: resource?.title,
    })
    if (!classified.accepted) {
      rejected.push({
        url: String(resource?.url || ''),
        reason: classified.reason,
        collectionItemId: String(resource?.id || ''),
      })
      return
    }
    const item = {
      ...classified.item,
      id: `resource-collection-${String(resource?.id || index + 1)}`,
      collectionItemId: String(resource?.id || ''),
      sourceType: 'resource-collection',
    }
    const sourceKey = interactionMediaSourceKey(item)
    const occurrence = Number(mediaOccurrences.get(sourceKey) || 0)
    mediaOccurrences.set(sourceKey, occurrence + 1)
    groupMap.get(item.type)?.items.push(attachInteractionMediaId(feature?.id, item, occurrence))
  })

  const collectionRef = options.includeResourceCollections === false ? null : feature?.resourceCollectionRef
  const refResult = collectionRef ? tryNormalizeKmlResourceCollectionRef(collectionRef) : null
  if (refResult?.value) {
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
        collectionItems: 0,
        collectionRef: refResult.value.sourceType,
        rejected: rejected.length,
        truncated,
      },
      rejected,
      collectionRef: refResult.value,
      needsCollectionLoad: true,
    }
  }

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
      collectionItems: collectionItems.length,
      rejected: rejected.length,
      truncated,
    },
    rejected,
  }
}

export function buildFeatureContentView (feature, options = {}) {
  if (!feature || typeof feature !== 'object') return buildFeatureContentViewUncached(feature, options)
  const key = getFeatureContentViewCacheKey(feature, options)
  const cached = FEATURE_CONTENT_VIEW_CACHE.get(feature)
  if (isFeatureContentViewCacheKeyEqual(cached?.key, key)) return cached.value
  const value = buildFeatureContentViewUncached(feature, options)
  FEATURE_CONTENT_VIEW_CACHE.set(feature, { key, value })
  return value
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
  const view = buildFeatureContentView(feature, options)
  const detected = view.groups
    .filter(group => group.items.length > 0)
    .map(group => group.type)
  const styleType = inferKmlStyleContentType(feature?.styleUrl)
  return [...new Set([styleType, ...detected].filter(Boolean))]
}

export function getFeatureContentProviders (feature, options = {}) {
  const view = buildFeatureContentView(feature, options)
  return [...new Set(view.groups.flatMap(group => group.items
    .map(item => String(item?.provider || '').trim())
    .filter(Boolean)))]
}

export function getPrimaryFeatureContentProvider (feature, options = {}) {
  return getFeatureContentProviders(feature, options)[0] || ''
}

export function getPrimaryFeatureContentType (feature, options = {}) {
  return getFeatureContentTypes(feature, options)[0] || ''
}
