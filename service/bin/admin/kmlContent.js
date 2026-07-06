import { isIP } from 'node:net'

const URL_LIMIT = 50
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
  const raw = trimUrlBoundary(value)
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    parsed.hash = parsed.hash || ''
    return parsed
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
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  if (host === 'metadata.google.internal') return true
  if (host === '169.254.169.254') return true

  const ipVersion = isIP(host)
  if (ipVersion === 4) return isPrivateIpv4(host)
  if (ipVersion === 6) {
    return host === '::1' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80:')
  }
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

function getExtension (parsed) {
  const pathname = parsed.pathname.toLowerCase()
  const matched = /\.([a-z0-9]+)$/.exec(pathname)
  return matched ? matched[1] : ''
}

function matchesIframeAllowlist (parsed, allowlist = []) {
  const hostname = parsed.hostname.toLowerCase()
  const originAndPath = `${parsed.origin}${parsed.pathname}`
  return allowlist.some(entry => {
    const rule = String(entry || '').trim().toLowerCase()
    if (!rule) return false
    if (rule.startsWith('https://')) {
      return originAndPath.toLowerCase().startsWith(rule)
    }
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1)
      return hostname.endsWith(suffix) && hostname !== suffix.slice(1)
    }
    return hostname === rule
  })
}

function createContentItem (parsed, index, options = {}) {
  const extension = getExtension(parsed)
  let type = 'link'
  if (IMAGE_EXTENSIONS.has(extension)) {
    type = 'image'
  } else if (VIDEO_EXTENSIONS.has(extension)) {
    type = 'video'
  } else if (matchesIframeAllowlist(parsed, options.iframeAllowlist)) {
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

export function extractContentUrls (text, options = {}) {
  const limit = Number.isInteger(options.limit) ? options.limit : URL_LIMIT
  const source = String(text || '')
  const matches = source.match(/https?:\/\/[^\s<>"'`]+/gi) || []
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

export function classifyContentUrl (value, options = {}) {
  const parsed = normalizeUrl(value)
  if (!parsed) {
    return {
      accepted: false,
      reason: 'URL 格式不合法',
    }
  }
  if (parsed.protocol !== 'https:') {
    return {
      accepted: false,
      reason: '仅支持 HTTPS URL',
    }
  }
  if (isBlockedHostname(parsed.hostname)) {
    return {
      accepted: false,
      reason: 'URL 主机不允许访问',
    }
  }
  return {
    accepted: true,
    item: createContentItem(parsed, Number(options.index || 0), options),
  }
}

export function buildFeatureContentView (feature, options = {}) {
  const { urls, truncated } = extractContentUrls(feature?.description || '', options)
  const rejected = []
  const groups = GROUP_ORDER.map(type => ({
    type,
    title: GROUP_TITLES[type],
    items: [],
  }))
  const groupMap = new Map(groups.map(group => [group.type, group]))

  urls.forEach((url, index) => {
    const classified = classifyContentUrl(url.toString(), {
      ...options,
      index,
    })
    if (!classified.accepted) {
      rejected.push({
        url: maskSensitiveQueryParams(url),
        reason: classified.reason,
      })
      return
    }
    groupMap.get(classified.item.type)?.items.push(classified.item)
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
      rejected: rejected.length,
      truncated,
    },
    rejected,
  }
}
