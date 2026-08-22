const DEFAULT_SHARE_TITLE = '地图分享'
const DEFAULT_SHARE_DESCRIPTION = '查看此 KML 地图分享内容。'
const DEFAULT_SHARE_IMAGE_PATH = '/pwa-icon-512.png'
const DEFAULT_SHARE_SITE_NAME = 'map-service'
const DEFAULT_SHARE_AUTHOR = 'map-service'
const DEFAULT_SHARE_APPLICATION_NAME = '地图分享'
const MAX_SHARE_DESCRIPTION_LENGTH = 300

function decodeHtmlEntities (value) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase()
    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(Math.min(codePoint, 0x10ffff)) : match
    }
    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(Math.min(codePoint, 0x10ffff)) : match
    }
    return Object.hasOwn(named, normalized) ? named[normalized] : match
  })
}

function escapeHtmlAttribute (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeText (value, fallback = '') {
  return String(value ?? fallback)
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
}

export function shareDescriptionText (value, fallback = DEFAULT_SHARE_DESCRIPTION) {
  const text = decodeHtmlEntities(normalizeText(value))
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\s*(?:script|style|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*(?:script|style|noscript)\s*>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\t\r\f ]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
  return (text || fallback).slice(0, MAX_SHARE_DESCRIPTION_LENGTH)
}

function normalizeAbsoluteUrl (value, fallback = '') {
  for (const candidate of [value, fallback]) {
    if (!candidate) continue
    try {
      const url = new URL(String(candidate))
      if (!['http:', 'https:'].includes(url.protocol)) continue
      url.search = ''
      url.hash = ''
      return url.href
    } catch {
      // Try the fallback candidate when an optional URL is malformed.
    }
  }
  return ''
}

export function getSharePageCanonicalUrl (publicId, locationLike = {}) {
  const origin = String(locationLike.origin || '').trim() || 'https://map.anzz.site'
  try {
    return new URL(`/share/${encodeURIComponent(String(publicId || ''))}`, origin).href
  } catch {
    return `https://map.anzz.site/share/${encodeURIComponent(String(publicId || ''))}`
  }
}

export function normalizeSharePageMetadata (input = {}) {
  const title = normalizeText(input.title, DEFAULT_SHARE_TITLE) || DEFAULT_SHARE_TITLE
  const description = shareDescriptionText(input.description)
  const canonicalUrl = normalizeAbsoluteUrl(input.canonicalUrl)
  const origin = (canonicalUrl ? new URL(canonicalUrl).origin : normalizeAbsoluteUrl(input.origin)).replace(/\/+$/, '')
  const imageUrl = normalizeAbsoluteUrl(input.imageUrl, `${origin || 'https://map.anzz.site'}${DEFAULT_SHARE_IMAGE_PATH}`)
  return {
    title,
    description,
    canonicalUrl,
    imageUrl,
    siteName: DEFAULT_SHARE_SITE_NAME,
    author: DEFAULT_SHARE_AUTHOR,
    applicationName: DEFAULT_SHARE_APPLICATION_NAME,
    keywords: `${title},KML,地图分享,路线地图,空间数据`,
    imageAlt: `${title}地图分享预览图`,
    origin: origin || 'https://map.anzz.site',
  }
}

function safeJsonForHtml (value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function buildShareStructuredData (metadata) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${metadata.canonicalUrl}#webpage`,
        url: metadata.canonicalUrl,
        name: metadata.title,
        description: metadata.description,
        inLanguage: 'zh-CN',
        isPartOf: { '@id': `${metadata.origin}/#website` },
        about: { '@id': `${metadata.canonicalUrl}#map` },
      },
      {
        '@type': 'Map',
        '@id': `${metadata.canonicalUrl}#map`,
        name: metadata.title,
        url: metadata.canonicalUrl,
        description: metadata.description,
        image: metadata.imageUrl,
        isAccessibleForFree: true,
        inLanguage: 'zh-CN',
        provider: {
          '@type': 'Organization',
          name: metadata.siteName,
          url: `${metadata.origin}/`,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${metadata.origin}/#website`,
        name: metadata.siteName,
        url: `${metadata.origin}/`,
        inLanguage: 'zh-CN',
      },
    ],
  }
}

export function buildSharePageMetaTags (input = {}) {
  const metadata = normalizeSharePageMetadata(input)
  const attr = escapeHtmlAttribute
  const structuredData = safeJsonForHtml(buildShareStructuredData(metadata))
  return [
    `<meta name="description" content="${attr(metadata.description)}">`,
    `<meta name="keywords" content="${attr(metadata.keywords)}">`,
    `<meta name="author" content="${attr(metadata.author)}">`,
    `<meta name="application-name" content="${attr(metadata.applicationName)}">`,
    '<meta name="robots" content="noindex, nofollow, max-image-preview:large">',
    '<meta name="format-detection" content="telephone=no">',
    '<meta name="theme-color" content="#0f766e">',
    '<meta name="referrer" content="no-referrer">',
    `<link rel="canonical" href="${attr(metadata.canonicalUrl)}">`,
    `<link rel="image_src" href="${attr(metadata.imageUrl)}">`,
    `<meta property="og:site_name" content="${attr(metadata.siteName)}">`,
    '<meta property="og:locale" content="zh_CN">',
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${attr(metadata.title)}">`,
    `<meta property="og:description" content="${attr(metadata.description)}">`,
    `<meta property="og:url" content="${attr(metadata.canonicalUrl)}">`,
    `<meta property="og:image" content="${attr(metadata.imageUrl)}">`,
    `<meta property="og:image:secure_url" content="${attr(metadata.imageUrl)}">`,
    '<meta property="og:image:type" content="image/png">',
    '<meta property="og:image:width" content="512">',
    '<meta property="og:image:height" content="512">',
    `<meta property="og:image:alt" content="${attr(metadata.imageAlt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${attr(metadata.title)}">`,
    `<meta name="twitter:description" content="${attr(metadata.description)}">`,
    `<meta name="twitter:url" content="${attr(metadata.canonicalUrl)}">`,
    `<meta name="twitter:image" content="${attr(metadata.imageUrl)}">`,
    `<meta name="twitter:image:alt" content="${attr(metadata.imageAlt)}">`,
    `<meta itemprop="name" content="${attr(metadata.title)}">`,
    `<meta itemprop="description" content="${attr(metadata.description)}">`,
    `<meta itemprop="image" content="${attr(metadata.imageUrl)}">`,
    `<script id="share-page-structured-data" type="application/ld+json">${structuredData}</script>`,
  ].join('\n    ')
}

function upsertMetaTag (selector, attributes, content) {
  if (typeof document === 'undefined') return
  let node = document.head?.querySelector(selector)
  if (!node) {
    node = document.createElement('meta')
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value))
    document.head?.appendChild(node)
  }
  node.setAttribute('content', content)
}

function upsertLinkTag (rel, href) {
  if (typeof document === 'undefined') return
  let node = document.head?.querySelector(`link[rel="${rel}"]`)
  if (!node) {
    node = document.createElement('link')
    node.setAttribute('rel', rel)
    document.head?.appendChild(node)
  }
  node.setAttribute('href', href)
}

export function applySharePageMetadata (input = {}) {
  if (typeof document === 'undefined') return normalizeSharePageMetadata(input)
  const metadata = normalizeSharePageMetadata(input)
  document.title = metadata.title
  upsertMetaTag('meta[name="description"]', { name: 'description' }, metadata.description)
  upsertMetaTag('meta[name="keywords"]', { name: 'keywords' }, metadata.keywords)
  upsertMetaTag('meta[name="author"]', { name: 'author' }, metadata.author)
  upsertMetaTag('meta[name="application-name"]', { name: 'application-name' }, metadata.applicationName)
  upsertMetaTag('meta[name="robots"]', { name: 'robots' }, 'noindex, nofollow, max-image-preview:large')
  upsertMetaTag('meta[name="format-detection"]', { name: 'format-detection' }, 'telephone=no')
  upsertMetaTag('meta[name="theme-color"]', { name: 'theme-color' }, '#0f766e')
  upsertMetaTag('meta[name="referrer"]', { name: 'referrer' }, 'no-referrer')
  upsertLinkTag('canonical', metadata.canonicalUrl)
  upsertLinkTag('image_src', metadata.imageUrl)
  upsertMetaTag('meta[property="og:site_name"]', { property: 'og:site_name' }, metadata.siteName)
  upsertMetaTag('meta[property="og:locale"]', { property: 'og:locale' }, 'zh_CN')
  upsertMetaTag('meta[property="og:type"]', { property: 'og:type' }, 'website')
  upsertMetaTag('meta[property="og:title"]', { property: 'og:title' }, metadata.title)
  upsertMetaTag('meta[property="og:description"]', { property: 'og:description' }, metadata.description)
  upsertMetaTag('meta[property="og:url"]', { property: 'og:url' }, metadata.canonicalUrl)
  upsertMetaTag('meta[property="og:image"]', { property: 'og:image' }, metadata.imageUrl)
  upsertMetaTag('meta[property="og:image:secure_url"]', { property: 'og:image:secure_url' }, metadata.imageUrl)
  upsertMetaTag('meta[property="og:image:type"]', { property: 'og:image:type' }, 'image/png')
  upsertMetaTag('meta[property="og:image:width"]', { property: 'og:image:width' }, '512')
  upsertMetaTag('meta[property="og:image:height"]', { property: 'og:image:height' }, '512')
  upsertMetaTag('meta[property="og:image:alt"]', { property: 'og:image:alt' }, metadata.imageAlt)
  upsertMetaTag('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image')
  upsertMetaTag('meta[name="twitter:title"]', { name: 'twitter:title' }, metadata.title)
  upsertMetaTag('meta[name="twitter:description"]', { name: 'twitter:description' }, metadata.description)
  upsertMetaTag('meta[name="twitter:url"]', { name: 'twitter:url' }, metadata.canonicalUrl)
  upsertMetaTag('meta[name="twitter:image"]', { name: 'twitter:image' }, metadata.imageUrl)
  upsertMetaTag('meta[name="twitter:image:alt"]', { name: 'twitter:image:alt' }, metadata.imageAlt)
  upsertMetaTag('meta[itemprop="name"]', { itemprop: 'name' }, metadata.title)
  upsertMetaTag('meta[itemprop="description"]', { itemprop: 'description' }, metadata.description)
  upsertMetaTag('meta[itemprop="image"]', { itemprop: 'image' }, metadata.imageUrl)
  let structuredData = document.head.querySelector('#share-page-structured-data')
  if (!structuredData) {
    structuredData = document.createElement('script')
    structuredData.id = 'share-page-structured-data'
    structuredData.type = 'application/ld+json'
    document.head.appendChild(structuredData)
  }
  structuredData.textContent = safeJsonForHtml(buildShareStructuredData(metadata))
  return metadata
}

const DYNAMIC_META_PATTERN = /<meta\b[^>]*\b(?:name|property|itemprop)=["'](?:description|keywords|author|application-name|robots|format-detection|theme-color|referrer|og:[^"']+|twitter:[^"']+|name|image|description)["'][^>]*>\s*/gi
const DYNAMIC_LINK_PATTERN = /<link\b[^>]*\brel=["'](?:canonical|image_src)["'][^>]*>\s*/gi
const DYNAMIC_TITLE_PATTERN = /<title\b[^>]*>[\s\S]*?<\/title\s*>/i
const DYNAMIC_JSONLD_PATTERN = /<script\b[^>]*\bid=["']share-page-structured-data["'][^>]*>[\s\S]*?<\/script\s*>\s*/gi

export function renderSharePageHtml (html, input = {}) {
  const metadata = normalizeSharePageMetadata(input)
  const title = escapeHtmlAttribute(metadata.title)
  const tags = buildSharePageMetaTags(metadata)
  let result = String(html || '')
    .replace(DYNAMIC_META_PATTERN, '')
    .replace(DYNAMIC_LINK_PATTERN, '')
    .replace(DYNAMIC_JSONLD_PATTERN, '')
    .replace(DYNAMIC_TITLE_PATTERN, `<title>${title}</title>`)
  if (!DYNAMIC_TITLE_PATTERN.test(String(html || ''))) {
    result = result.replace(/<head\b[^>]*>/i, match => `${match}\n    <title>${title}</title>`)
  }
  return result.replace(/<\/head\s*>/i, `    ${tags}\n  </head>`)
}
