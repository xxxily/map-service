export const PROTOCOL_VERSION = 1
export const HELPER_CAPABILITY = '2bulu-kml-import'
export const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'http://127.0.0.1:3088',
  'http://localhost:3088',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
])

export const TWO_BULU_PAGE_HOSTS = Object.freeze([
  '2bulu.com',
  'www.2bulu.com',
  'app.2bulu.com',
])

export const TWO_BULU_DOWNLOAD_HOSTS = Object.freeze([
  ...TWO_BULU_PAGE_HOSTS,
  'down-files.2bulu.com',
])

const PAGE_HOSTS = new Set(TWO_BULU_PAGE_HOSTS)
const DOWNLOAD_HOSTS = new Set(TWO_BULU_DOWNLOAD_HOSTS)
const TRACK_ID_PATTERN = /^[A-Za-z0-9+/_=-]{1,160}$/

function invalidUrl (message = '请输入有效的两步路公开分享链接') {
  const error = new Error(message)
  error.code = 'TWO_BULU_URL_INVALID'
  return error
}

export function normalizeAllowedOrigin (value) {
  const raw = String(value || '').trim()
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('请输入完整的 http:// 或 https:// 站点 origin')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname) {
    throw new Error('只支持无账号密码的 HTTP(S) 站点 origin')
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('站点授权只能填写 origin，不能包含路径、查询参数或片段')
  }
  return parsed.origin
}

export function originMatchPattern (origin) {
  const parsed = new URL(normalizeAllowedOrigin(origin))
  return `${parsed.protocol}//${parsed.hostname}/*`
}

function decodeTrackId (value) {
  let normalized = String(value || '').trim().replaceAll(' ', '+')
  for (let index = 0; index < 2; index += 1) {
    let decoded
    try {
      decoded = decodeURIComponent(normalized)
    } catch {
      throw invalidUrl('两步路分享链接中的轨迹标识不正确')
    }
    if (decoded === normalized) break
    normalized = decoded.replaceAll(' ', '+')
  }
  if (!TRACK_ID_PATTERN.test(normalized)) {
    throw invalidUrl('两步路分享链接中的轨迹标识不正确')
  }
  return normalized
}

export function normalizeTwoBuluShareUrl (value) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 2048) throw invalidUrl()
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw invalidUrl('两步路分享链接格式不正确')
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (parsed.protocol !== 'https:' || !PAGE_HOSTS.has(hostname) || parsed.username || parsed.password || parsed.port) {
    throw invalidUrl('只支持两步路官方 HTTPS 公开分享链接')
  }
  const pathname = parsed.pathname.replace(/;jsessionid=[^/?]*/gi, '')
  const shortLink = /^\/track\/t-([\s\S]+)\.htm$/i.exec(pathname)
  let rawTrackId = ''
  if (shortLink) rawTrackId = shortLink[1]
  else if (/^\/(?:track\/track_detail|share\/share_track)\.htm$/i.test(pathname)) {
    rawTrackId = parsed.searchParams.get('trackId') || ''
  } else {
    throw invalidUrl('该链接不是受支持的两步路公开轨迹分享页')
  }
  const trackId = decodeTrackId(rawTrackId)
  return {
    trackId,
    canonicalUrl: `https://www.2bulu.com/track/track_detail.htm?trackId=${encodeURIComponent(trackId)}`,
  }
}

export function normalizeOfficialDownloadUrl (value, baseUrl = 'https://www.2bulu.com/') {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 4096) throw invalidUrl('两步路返回的下载地址无效')
  let parsed
  try {
    parsed = new URL(raw, baseUrl)
  } catch {
    throw invalidUrl('两步路返回的下载地址无效')
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (parsed.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(hostname) || parsed.username || parsed.password || parsed.port) {
    throw invalidUrl('两步路返回的下载地址不在允许范围内')
  }
  parsed.hash = ''
  return parsed.toString()
}

export function isKmlText (value) {
  const text = String(value || '').replace(/^\uFEFF/, '').trim()
  return /^(?:<\?xml\b[^>]*>\s*)?<(?:[\w.-]+:)?kml\b/i.test(text) &&
    /<\/(?:[\w.-]+:)?kml\s*>/i.test(text)
}

export function helperError (message, code, status = 'failed') {
  return { status, code, message }
}
