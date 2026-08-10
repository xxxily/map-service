import axios from 'axios'
import {
  createPinnedHttpAgents,
  resolvePublicHttpTarget,
} from '../security/networkTarget.js'
import { createHttpError } from './security.js'

export const TWO_BULU_SHARE_HOSTS = Object.freeze([
  '2bulu.com',
  'www.2bulu.com',
  'app.2bulu.com',
])

export const TWO_BULU_DOWNLOAD_HOSTS = Object.freeze([
  '2bulu.com',
  'www.2bulu.com',
  'app.2bulu.com',
  'down-files.2bulu.com',
])

export const TWO_BULU_PARTIAL_POLICIES = Object.freeze([
  'reject',
  'allow-track-only',
])

const SHARE_HOSTS = new Set(TWO_BULU_SHARE_HOSTS)
const DOWNLOAD_HOSTS = new Set(TWO_BULU_DOWNLOAD_HOSTS)
const PUBLIC_MEDIA_HOSTS = new Set(['down-files.2bulu.com'])
const PUBLIC_MEDIA_PATHS = new Set(['/f/d1', '/f/dn1'])
const TRACK_ID_PATTERN = /^[A-Za-z0-9+/_=-]{1,160}$/
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/
const MAX_URL_LENGTH = 2048
const DEFAULT_PAGE_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_DATA_MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_TOTAL_TIMEOUT_MS = 20000
const DEFAULT_MAX_REDIRECTS = 2
const DEFAULT_MAX_POINTS = 100000

function lowerHeaders (headers = {}) {
  if (headers?.entries instanceof Function) {
    return Object.fromEntries(Array.from(headers.entries(), ([key, value]) => [String(key).toLowerCase(), value]))
  }
  return Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]))
}

function responseStatus (response) {
  return Number(response?.status ?? response?.statusCode ?? 0)
}

function responseBuffer (response) {
  const value = response?.data ?? response?.body ?? ''
  if (Buffer.isBuffer(value)) return value
  if (value instanceof ArrayBuffer) return Buffer.from(value)
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  if (typeof value === 'string') return Buffer.from(value, 'utf8')
  if (value && typeof value === 'object') return Buffer.from(JSON.stringify(value), 'utf8')
  return Buffer.alloc(0)
}

function stripBom (value) {
  return String(value || '').replace(/^\uFEFF/, '')
}

function decodeHtmlText (value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function decodeTrackId (value) {
  let normalized = String(value || '').trim().replaceAll(' ', '+')
  for (let index = 0; index < 2; index += 1) {
    let decoded
    try {
      decoded = decodeURIComponent(normalized)
    } catch {
      throw createHttpError('两步路分享链接中的轨迹标识不正确', 400, 'TWO_BULU_URL_INVALID')
    }
    if (decoded === normalized) break
    normalized = decoded.replaceAll(' ', '+')
  }
  if (!TRACK_ID_PATTERN.test(normalized)) {
    throw createHttpError('两步路分享链接中的轨迹标识不正确', 400, 'TWO_BULU_URL_INVALID')
  }
  return normalized
}

export function normalizeTwoBuluShareUrl (value) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > MAX_URL_LENGTH) {
    throw createHttpError('请输入有效的两步路公开分享链接', 400, 'TWO_BULU_URL_INVALID')
  }

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw createHttpError('两步路分享链接格式不正确', 400, 'TWO_BULU_URL_INVALID')
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (parsed.protocol !== 'https:' || !SHARE_HOSTS.has(hostname) || parsed.username || parsed.password || parsed.port) {
    throw createHttpError('只支持两步路官方 HTTPS 公开分享链接', 400, 'TWO_BULU_URL_INVALID')
  }

  const pathname = parsed.pathname.replace(/;jsessionid=[^/?]*/gi, '')
  let rawTrackId = ''
  const shortLink = /^\/track\/t-([\s\S]+)\.htm$/i.exec(pathname)
  if (shortLink) {
    rawTrackId = shortLink[1]
  } else if (/^\/(?:track\/track_detail|share\/share_track)\.htm$/i.test(pathname)) {
    rawTrackId = parsed.searchParams.get('trackId') || ''
  } else {
    throw createHttpError('该链接不是受支持的两步路公开轨迹分享页', 400, 'TWO_BULU_URL_INVALID')
  }

  const trackId = decodeTrackId(rawTrackId)
  const canonicalUrl = `https://www.2bulu.com/track/track_detail.htm?trackId=${encodeURIComponent(trackId)}`
  return {
    provider: '2bulu',
    trackId,
    canonicalUrl,
    hostname,
  }
}

export function normalizeTwoBuluPartialPolicy (value) {
  const normalized = String(value || 'reject')
  if (!TWO_BULU_PARTIAL_POLICIES.includes(normalized)) {
    throw createHttpError('两步路部分导入策略不正确', 400, 'VALIDATION_FAILED')
  }
  return normalized
}

export function normalizeTwoBuluRequestId (value) {
  if (value === undefined || value === null || value === '') return ''
  const normalized = String(value).trim()
  if (!REQUEST_ID_PATTERN.test(normalized)) {
    throw createHttpError('导入请求 ID 格式不正确', 400, 'VALIDATION_FAILED')
  }
  return normalized
}

function isKmlText (value) {
  const text = stripBom(value).trim()
  return /^(?:<\?xml\b[^>]*>\s*)?<(?:[\w.-]+:)?kml\b/i.test(text) && /<\/(?:[\w.-]+:)?kml\s*>/i.test(text)
}

function isHtmlText (value) {
  const text = stripBom(value).trim().slice(0, 1000)
  return /<!doctype\s+html|<html\b|<head\b|<body\b/i.test(text)
}

function isUpstreamBlockPage (value) {
  const text = String(value || '').slice(0, 100000)
  return /safeline|sl-session|\.safeline\/static|confirm you are human|客户端异常，请确认您是合法用户/i.test(text)
}

function isLoginOrCaptchaPage (value) {
  const text = String(value || '').slice(0, 100000)
  return /请[^<]{0,20}登录|登录后|<title[^>]*>[^<]*登录|type=["']password["']|(?:action|href)=["'][^"']*login|验证码|captcha|aliyun|nc_1_n1z|人机验证/i.test(text)
}

function isLoginPayload (payload, text = '') {
  const message = String(payload?.message ?? payload?.msg ?? text)
  return /nologin|not.?login|请.*登录|登录后|验证码|captcha/i.test(message)
}

function safeJsonParse (value) {
  const text = stripBom(value).trim()
  if (!text || isHtmlText(text)) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function extractPageTitle (html) {
  const ogTitle = /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1]
  const title = ogTitle || /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1] || ''
  return decodeHtmlText(title)
    .replace(/\s*[-_|].*(?:轨迹|两步路).*$/i, '')
    .replace(/\.(?:kml|kmz|gpx)$/i, '')
    .slice(0, 200)
    .trim()
}

function extractPageVariable (html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const scriptValue = new RegExp(`(?:var|let|const)\\s+${escaped}\\s*=\\s*["']([^"']+)["']`, 'i').exec(html)?.[1]
  const inputValue = new RegExp(`<input\\b[^>]*(?:id|name)=["']${escaped}["'][^>]*value=["']([^"']+)["']`, 'i').exec(html)?.[1]
  return decodeHtmlText(scriptValue || inputValue || '')
}

function extractDirectKmlUrls (html, baseUrl) {
  const results = []
  const seen = new Set()
  const pattern = /(?:href|src|data-kml-url)\s*=\s*["']([^"']+)["']/gi
  let match
  while ((match = pattern.exec(html)) !== null && results.length < 3) {
    const candidate = match[1].replace(/&amp;/gi, '&')
    if (!/\.kml(?:$|[?#])/i.test(candidate)) continue
    try {
      const parsed = new URL(candidate, baseUrl)
      if (parsed.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(parsed.hostname.toLowerCase()) || parsed.username || parsed.password || parsed.port) continue
      const normalized = parsed.toString()
      if (!seen.has(normalized)) {
        seen.add(normalized)
        results.push(normalized)
      }
    } catch {}
  }
  return results
}

function coordinateFromPoint (value) {
  let longitude
  let latitude
  if (Array.isArray(value)) {
    longitude = Number(value[0])
    latitude = Number(value[1])
  } else if (value && typeof value === 'object') {
    longitude = Number(value.lng ?? value.lon ?? value.longitude ?? value.x)
    latitude = Number(value.lat ?? value.latitude ?? value.y)
  }
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null
  return [longitude, latitude]
}

function findTrackSegments (payload) {
  const candidates = [
    payload?.trackPositions,
    payload?.positions,
    payload?.data?.trackPositions,
    payload?.data?.positions,
    payload?.data,
    payload,
  ]
  for (const candidate of candidates) {
    if (!Array.isArray(candidate) || candidate.length === 0) continue
    if (coordinateFromPoint(candidate[0])) return [candidate]
    if (Array.isArray(candidate[0])) return candidate
  }
  return []
}

function findMarkerList (payload) {
  const candidates = [payload?.markers, payload?.trackMarkers, payload?.data?.markers, payload?.data, payload]
  return candidates.find(candidate => Array.isArray(candidate)) || null
}

function normalizePublicMediaUrl (value, baseUrl) {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 2048) return ''
  try {
    const parsed = new URL(raw, baseUrl)
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return ''
    if (!PUBLIC_MEDIA_HOSTS.has(hostname) || !PUBLIC_MEDIA_PATHS.has(parsed.pathname)) return ''
    const queryKeys = [...parsed.searchParams.keys()]
    if (queryKeys.length !== 1 || queryKeys[0] !== 'downParams' || !parsed.searchParams.get('downParams')) return ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return ''
  }
}

function markerFeature (marker, index, baseUrl) {
  if (!marker || typeof marker !== 'object') return null
  const coordinates = coordinateFromPoint(marker)
  if (!coordinates) return null
  const params = marker.params && typeof marker.params === 'object' ? marker.params : {}
  const media = { ...marker, ...params }
  const text = decodeHtmlText(media.text ?? media.name ?? media.title ?? '')
  const fileType = Number(media.fileType)
  const mediaType = fileType === 0 ? 'image' : fileType === 1 ? 'audio' : fileType === 2 ? 'video' : 'link'
  // 两步路同一标注会同时返回预览图 centerUrl/fileUrl 和大图/原资源
  // commnFileUrl；它们不是两个附件。大图作为唯一媒体 URL，预览图写入
  // <img> 的缩略图并通过 <a> 指向大图，保持服务端兼容转换与浏览器助手一致。
  const originalMediaCandidates = mediaType === 'image'
    ? [media.commnFileUrl, media.commonFileUrl, media.mediaUrl]
    : mediaType === 'audio'
      ? [media.mp3FileUrl, media.audioUrl, media.commnFileUrl, media.commonFileUrl, media.mediaUrl, media.centerUrl, media.fileUrl]
      : mediaType === 'video'
        ? [media.videoUrl, media.commnFileUrl, media.commonFileUrl, media.mediaUrl, media.centerUrl, media.fileUrl]
        : [media.commnFileUrl, media.commonFileUrl, media.mediaUrl, media.centerUrl, media.fileUrl]
  const previewMediaCandidates = mediaType === 'image'
    ? [media.centerUrl, media.fileUrl, media.firstPicUrl]
    : []
  const originalUrl = originalMediaCandidates
    .map(value => normalizePublicMediaUrl(value, baseUrl))
    .find(Boolean) || ''
  const previewUrl = previewMediaCandidates
    .map(value => normalizePublicMediaUrl(value, baseUrl))
    .find(Boolean) || ''
  const mediaUrl = originalUrl || previewUrl
  const mediaHtml = mediaUrl ? (() => {
    const safeUrl = escapeHtml(mediaUrl)
    if (mediaType === 'image') {
      const thumbnailUrl = originalUrl && previewUrl && originalUrl !== previewUrl ? escapeHtml(previewUrl) : safeUrl
      return originalUrl && previewUrl && originalUrl !== previewUrl
        ? `<a href="${safeUrl}" data-kml-media="image"><img src="${thumbnailUrl}" alt="两步路标注图片"></a>`
        : `<img src="${safeUrl}" alt="两步路标注图片">`
    }
    if (mediaType === 'audio') return `<audio src="${safeUrl}" controls></audio>`
    if (mediaType === 'video') return `<video src="${safeUrl}" controls></video>`
    return `<a href="${safeUrl}">查看两步路公开附件</a>`
  })() : ''
  const mediaUrls = mediaUrl ? [mediaUrl] : []
  return {
    id: `2bulu-marker-${index + 1}`,
    type: 'Point',
    name: text.slice(0, 200) || `两步路标注点 ${index + 1}`,
    description: [text ? `<p>${escapeHtml(text)}</p>` : '', mediaHtml].filter(Boolean).join('\n'),
    coordinates,
    ...(mediaUrls.length ? { styleUrl: `#2bulu-${mediaType}` } : {}),
  }
}

export function convertTwoBuluPublicData (positionsPayload, options = {}) {
  const maxPoints = Number(options.maxPoints || DEFAULT_MAX_POINTS)
  const sourceUrl = String(options.sourceUrl || 'https://www.2bulu.com/')
  const title = decodeHtmlText(
    options.title || positionsPayload?.trackName || positionsPayload?.name || positionsPayload?.title || ''
  ).replace(/\.(?:kml|kmz|gpx)$/i, '').slice(0, 200)
  const segments = findTrackSegments(positionsPayload)
  let pointCount = 0
  let invalidPointCount = 0
  const features = []

  segments.forEach((segment, segmentIndex) => {
    if (!Array.isArray(segment)) return
    const coordinates = []
    segment.forEach((point) => {
      const coordinate = coordinateFromPoint(point)
      if (coordinate) {
        pointCount += 1
        if (pointCount > maxPoints) {
          throw createHttpError('两步路轨迹坐标数量超过导入限制', 413, 'FILE_TOO_LARGE')
        }
        coordinates.push(coordinate)
      } else {
        invalidPointCount += 1
      }
    })
    if (coordinates.length >= 2) {
      features.push({
        id: `2bulu-line-${segmentIndex + 1}`,
        type: 'LineString',
        name: segments.length > 1 ? `轨迹分段 ${segmentIndex + 1}` : (title || '两步路轨迹'),
        description: '',
        coordinates,
      })
    } else if (coordinates.length === 1) {
      features.push({
        id: `2bulu-line-point-${segmentIndex + 1}`,
        type: 'Point',
        name: title || '两步路轨迹点',
        description: '',
        coordinates: coordinates[0],
      })
    }
  })

  const markers = options.markersPayload === undefined ? null : findMarkerList(options.markersPayload)
  if (markers) {
    if (pointCount + markers.length > maxPoints) {
      throw createHttpError('两步路轨迹坐标和标注点数量超过导入限制', 413, 'FILE_TOO_LARGE')
    }
    markers.forEach((marker, index) => {
      const feature = markerFeature(marker, index, sourceUrl)
      if (feature) {
        pointCount += 1
        features.push(feature)
      }
      else invalidPointCount += 1
    })
  }

  if (!features.length) {
    throw createHttpError('两步路公开分享中未找到有效轨迹数据', 422, 'TWO_BULU_TRACK_EMPTY')
  }

  const warnings = []
  if (invalidPointCount) warnings.push(`已忽略 ${invalidPointCount} 个无效坐标或标注点`)
  if (markers === null) warnings.push('两步路未提供可公开读取的标注点或媒体，本次只能导入轨迹线')
  const completeness = markers === null ? 'track-only' : 'full'
  const sourceDescription = `<p>来源：<a href="${escapeHtml(sourceUrl)}">两步路公开分享轨迹</a></p>`

  return {
    name: title || '两步路公开轨迹',
    description: sourceDescription,
    features,
    completeness,
    warnings,
    pointCount,
  }
}

function upstreamError (message, code = 'TWO_BULU_UPSTREAM_INVALID', statusCode = 502) {
  return createHttpError(message, statusCode, code)
}

export class TwoBuluImportService {
  constructor (options = {}) {
    this.httpClient = options.httpClient || axios
    this.targetResolver = options.targetResolver || resolvePublicHttpTarget
    this.clock = options.clock || (() => Date.now())
    this.timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS)
    this.totalTimeoutMs = Number(options.totalTimeoutMs || DEFAULT_TOTAL_TIMEOUT_MS)
    this.pageMaxBytes = Number(options.pageMaxBytes || DEFAULT_PAGE_MAX_BYTES)
    this.dataMaxBytes = Number(options.dataMaxBytes || DEFAULT_DATA_MAX_BYTES)
    this.maxRedirects = Number(options.maxRedirects ?? DEFAULT_MAX_REDIRECTS)
    this.maxPoints = Number.isSafeInteger(Number(options.maxPoints)) && Number(options.maxPoints) > 0
      ? Number(options.maxPoints)
      : DEFAULT_MAX_POINTS
    this.rateWindowMs = Number(options.rateWindowMs || 10 * 60 * 1000)
    this.rateMaxAttempts = Number(options.rateMaxAttempts || 5)
    this.minIntervalMs = Number(options.minIntervalMs ?? 2000)
    this.attempts = new Map()
    this.activeUsers = new Set()
  }

  assertRateLimit (userKey) {
    const key = String(userKey || '')
    const now = this.clock()
    const recent = (this.attempts.get(key) || []).filter(timestamp => now - timestamp < this.rateWindowMs)
    const lastAttempt = recent.at(-1) || 0
    if (lastAttempt && now - lastAttempt < this.minIntervalMs) {
      throw createHttpError('两步路导入操作过于频繁，请稍后再试', 429, 'TWO_BULU_RATE_LIMITED')
    }
    if (recent.length >= this.rateMaxAttempts) {
      throw createHttpError('两步路导入次数已达上限，请稍后再试', 429, 'TWO_BULU_RATE_LIMITED')
    }
    recent.push(now)
    this.attempts.set(key, recent)
  }

  remainingRequestTime (deadlineAt) {
    const remainingMs = Number(deadlineAt) - this.clock()
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      throw upstreamError('读取两步路公开轨迹超时', 'TWO_BULU_TIMEOUT', 504)
    }
    return Math.max(1, remainingMs)
  }

  async resolveTarget (url, deadlineAt) {
    const remainingMs = this.remainingRequestTime(deadlineAt)
    let timer = null
    try {
      return await Promise.race([
        this.targetResolver(url, { label: '两步路上游地址' }),
        new Promise((resolve, reject) => {
          timer = setTimeout(() => {
            reject(upstreamError('读取两步路公开轨迹超时', 'TWO_BULU_TIMEOUT', 504))
          }, remainingMs)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async requestBuffer (inputUrl, options = {}) {
    const allowedHosts = options.allowedHosts || SHARE_HOSTS
    const maxBytes = Number(options.maxBytes || this.dataMaxBytes)
    let currentUrl = String(inputUrl)
    const requestDeadlineAt = Math.min(
      Number.isFinite(Number(options.deadlineAt)) ? Number(options.deadlineAt) : Number.POSITIVE_INFINITY,
      this.clock() + this.timeoutMs
    )

    for (let redirectCount = 0; redirectCount <= this.maxRedirects; redirectCount += 1) {
      let parsed
      try {
        parsed = new URL(currentUrl)
      } catch {
        throw upstreamError('两步路返回了无效地址')
      }
      const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
      if (parsed.protocol !== 'https:' || !allowedHosts.has(hostname) || parsed.username || parsed.password || parsed.port) {
        throw upstreamError('两步路返回了不允许访问的地址', 'TWO_BULU_UPSTREAM_BLOCKED')
      }

      let resolution
      try {
        resolution = await this.resolveTarget(parsed.toString(), requestDeadlineAt)
      } catch (error) {
        if (error?.code === 'TWO_BULU_TIMEOUT') throw error
        throw upstreamError('两步路上游地址未通过公共网络校验', 'TWO_BULU_UPSTREAM_BLOCKED')
      }
      const requestTimeoutMs = this.remainingRequestTime(requestDeadlineAt)

      let response
      try {
        response = await this.httpClient({
          url: parsed.toString(),
          method: 'GET',
          responseType: 'arraybuffer',
          timeout: requestTimeoutMs,
          maxRedirects: 0,
          maxContentLength: maxBytes,
          maxBodyLength: maxBytes,
          decompress: true,
          proxy: false,
          validateStatus: () => true,
          headers: {
            Accept: options.accept || 'application/vnd.google-earth.kml+xml, application/json, text/html;q=0.8',
            'User-Agent': 'map-service-two-bulu-import/1.0',
            'X-Requested-With': 'XMLHttpRequest',
          },
          ...createPinnedHttpAgents(resolution.addresses),
        })
      } catch (error) {
        if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || /timeout/i.test(String(error?.message || ''))) {
          throw upstreamError('读取两步路公开轨迹超时', 'TWO_BULU_TIMEOUT', 504)
        }
        if (error?.code === 'ERR_BAD_RESPONSE' && /maxContentLength|maxBodyLength/i.test(String(error?.message || ''))) {
          throw createHttpError('两步路返回内容超过导入限制', 413, 'FILE_TOO_LARGE')
        }
        throw upstreamError('读取两步路公开轨迹失败')
      }

      const status = responseStatus(response)
      const headers = lowerHeaders(response?.headers)
      const declaredLength = Number(headers['content-length'])
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw createHttpError('两步路返回内容超过导入限制', 413, 'FILE_TOO_LARGE')
      }
      const buffer = responseBuffer(response)
      if (buffer.length > maxBytes) {
        throw createHttpError('两步路返回内容超过导入限制', 413, 'FILE_TOO_LARGE')
      }

      if (status >= 300 && status < 400 && headers.location) {
        if (redirectCount >= this.maxRedirects) throw upstreamError('两步路返回的重定向次数过多')
        currentUrl = new URL(headers.location, parsed).toString()
        continue
      }

      return {
        url: parsed.toString(),
        status,
        headers,
        buffer,
        text: buffer.toString('utf8'),
      }
    }

    throw upstreamError('两步路返回的重定向次数过多')
  }

  async tryJsonEndpoint (url, signals, options = {}) {
    try {
      const response = await this.requestBuffer(url, {
        allowedHosts: SHARE_HOSTS,
        maxBytes: options.maxBytes || this.dataMaxBytes,
        accept: 'application/json, text/plain;q=0.9',
        deadlineAt: options.deadlineAt,
      })
      const blocked = response.status === 468 || isUpstreamBlockPage(response.text)
      if (blocked) signals.blocked = true
      if (response.status === 401 || response.status === 403 || (!blocked && isLoginOrCaptchaPage(response.text))) {
        signals.login = true
      }
      if (response.status < 200 || response.status >= 300) {
        if (!blocked && response.status !== 401 && response.status !== 403) signals.invalid = true
        return null
      }
      const payload = safeJsonParse(response.text)
      if (!payload) {
        if (response.buffer.length && !isHtmlText(response.text)) signals.encrypted = true
        return null
      }
      if (isLoginPayload(payload, response.text)) {
        signals.login = true
        return null
      }
      if (Number(payload?.errorCode) === 22007) {
        signals.blocked = true
        return null
      }
      return { response, payload }
    } catch (error) {
      if (error.code === 'TWO_BULU_TIMEOUT') signals.timeout = true
      else if (error.code === 'FILE_TOO_LARGE') throw error
      else signals.invalid = true
      return null
    }
  }

  async tryDirectKml (url, signals, options = {}) {
    try {
      const response = await this.requestBuffer(url, {
        allowedHosts: DOWNLOAD_HOSTS,
        maxBytes: this.dataMaxBytes,
        accept: 'application/vnd.google-earth.kml+xml, application/xml, text/xml, application/octet-stream',
        deadlineAt: options.deadlineAt,
      })
      const blocked = response.status === 468 || isUpstreamBlockPage(response.text)
      if (blocked) signals.blocked = true
      if (response.status === 401 || response.status === 403 || (!blocked && isLoginOrCaptchaPage(response.text))) {
        signals.login = true
      }
      if (response.status >= 200 && response.status < 300 && isKmlText(response.text)) {
        return {
          kmlText: response.text,
          sourceByteSize: response.buffer.length,
          completeness: 'full',
          warnings: [],
        }
      }
    } catch (error) {
      if (error.code === 'TWO_BULU_TIMEOUT') signals.timeout = true
      else if (error.code === 'FILE_TOO_LARGE') throw error
      else signals.invalid = true
    }
    return null
  }

  async resolvePublicTrack (input = {}, context = {}) {
    const normalized = normalizeTwoBuluShareUrl(input.url)
    const partialPolicy = normalizeTwoBuluPartialPolicy(input.partialPolicy)
    const userKey = String(context.userId || context.userKey || 'anonymous')
    if (this.activeUsers.has(userKey)) {
      throw createHttpError('当前账号已有两步路导入正在执行', 409, 'TWO_BULU_IMPORT_IN_PROGRESS')
    }
    this.assertRateLimit(userKey)

    this.activeUsers.add(userKey)
    const deadlineAt = this.clock() + this.totalTimeoutMs
    const signals = { login: false, blocked: false, encrypted: false, timeout: false, invalid: false }
    try {
      let pageTitle = ''
      let pageTrackId = ''
      let operationCode = ''
      let pageResponse = null
      try {
        pageResponse = await this.requestBuffer(normalized.canonicalUrl, {
          allowedHosts: SHARE_HOSTS,
          maxBytes: this.pageMaxBytes,
          accept: 'text/html, application/vnd.google-earth.kml+xml;q=0.9',
          deadlineAt,
        })
        const pageBlocked = pageResponse.status === 468 || isUpstreamBlockPage(pageResponse.text)
        if (pageBlocked) signals.blocked = true
        if (pageResponse.status === 401 || pageResponse.status === 403 || (!pageBlocked && isLoginOrCaptchaPage(pageResponse.text))) {
          signals.login = true
        }
        if (pageResponse.status >= 200 && pageResponse.status < 300 && isKmlText(pageResponse.text)) {
          return {
            provider: '2bulu',
            sourceUrl: normalized.canonicalUrl,
            trackId: normalized.trackId,
            kmlText: pageResponse.text,
            sourceByteSize: pageResponse.buffer.length,
            completeness: 'full',
            warnings: [],
          }
        }
        if (pageResponse.status >= 200 && pageResponse.status < 300 && isHtmlText(pageResponse.text) && !pageBlocked && !isLoginOrCaptchaPage(pageResponse.text)) {
          pageTitle = extractPageTitle(pageResponse.text)
          pageTrackId = extractPageVariable(pageResponse.text, 'trackStr') || extractPageVariable(pageResponse.text, 'encryptTrackId')
          operationCode = extractPageVariable(pageResponse.text, 'operationCode')
          for (const directUrl of extractDirectKmlUrls(pageResponse.text, normalized.canonicalUrl)) {
            const direct = await this.tryDirectKml(directUrl, signals, { deadlineAt })
            if (direct) {
              return {
                provider: '2bulu',
                sourceUrl: normalized.canonicalUrl,
                trackId: normalized.trackId,
                name: pageTitle,
                ...direct,
              }
            }
          }
        }
      } catch (error) {
        if (error.code === 'TWO_BULU_TIMEOUT') signals.timeout = true
        else if (error.code === 'FILE_TOO_LARGE') throw error
        else signals.invalid = true
      }

      const downloadDiscoveryUrl = `https://www.2bulu.com/space/download_track.htm?trackId=${encodeURIComponent(normalized.trackId)}&type=1`
      const discovery = await this.tryJsonEndpoint(downloadDiscoveryUrl, signals, {
        maxBytes: 1024 * 1024,
        deadlineAt,
      })
      if (discovery && String(discovery.payload?.code) === '1') signals.login = true
      if (discovery && String(discovery.payload?.code) === '2' && discovery.payload?.url) {
        let directUrl = ''
        try {
          const parsedDirect = new URL(String(discovery.payload.url), normalized.canonicalUrl)
          if (parsedDirect.protocol === 'https:' && DOWNLOAD_HOSTS.has(parsedDirect.hostname.toLowerCase()) && !parsedDirect.username && !parsedDirect.password && !parsedDirect.port) {
            directUrl = parsedDirect.toString()
          }
        } catch {}
        if (directUrl) {
          const direct = await this.tryDirectKml(directUrl, signals, { deadlineAt })
          if (direct) {
            return {
              provider: '2bulu',
              sourceUrl: normalized.canonicalUrl,
              trackId: normalized.trackId,
              name: pageTitle,
              ...direct,
            }
          }
        }
      }

      const trackIds = [...new Set([pageTrackId, normalized.trackId].filter(Boolean).map((value) => {
        try {
          return decodeTrackId(value)
        } catch {
          return ''
        }
      }).filter(Boolean))]

      for (const trackId of trackIds) {
        const positionsUrl = `https://www.2bulu.com/track/get_track_positions_list4.htm?trackId=${encodeURIComponent(trackId)}`
        const positions = await this.tryJsonEndpoint(positionsUrl, signals, { deadlineAt })
        if (!positions) continue

        const markerParams = new URLSearchParams({ trackId })
        if (operationCode) markerParams.set('operationCode', operationCode)
        const markersUrl = `https://www.2bulu.com/track/get_track_marker_list_new.htm?${markerParams}`
        const markers = await this.tryJsonEndpoint(markersUrl, signals, { deadlineAt })
        const converted = convertTwoBuluPublicData(positions.payload, {
          markersPayload: markers?.payload,
          title: pageTitle,
          sourceUrl: normalized.canonicalUrl,
          maxPoints: this.maxPoints,
        })
        if (converted.completeness === 'track-only' && partialPolicy !== 'allow-track-only') {
          throw createHttpError(
            '两步路当前只能公开返回轨迹线，未能确认标注点和媒体完整性；如确认可接受，请选择“允许仅导入轨迹线”后重试',
            422,
            'TWO_BULU_PARTIAL_REJECTED'
          )
        }
        return {
          provider: '2bulu',
          sourceUrl: normalized.canonicalUrl,
          trackId: normalized.trackId,
          document: {
            name: converted.name,
            description: converted.description,
            features: converted.features,
          },
          sourceByteSize: positions.response.buffer.length + Number(markers?.response.buffer.length || 0),
          completeness: converted.completeness,
          warnings: converted.warnings,
        }
      }

      if (signals.login) {
        throw createHttpError(
          '两步路当前要求登录或验证码，系统不会代替你绕过验证；请先在两步路导出 KML，再使用文件导入',
          422,
          'TWO_BULU_LOGIN_REQUIRED'
        )
      }
      if (signals.blocked || signals.encrypted) {
        throw upstreamError(
          '两步路当前拒绝服务器读取该公开轨迹，请稍后重试或改用本地 KML 导入',
          'TWO_BULU_UPSTREAM_BLOCKED'
        )
      }
      if (signals.timeout) {
        throw upstreamError('读取两步路公开轨迹超时', 'TWO_BULU_TIMEOUT', 504)
      }
      throw upstreamError('两步路未返回可导入的公开 KML 或轨迹数据')
    } finally {
      this.activeUsers.delete(userKey)
    }
  }
}

export default TwoBuluImportService
