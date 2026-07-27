import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { normalizeKmlMediaRelayTarget } from '../../../shared/kml-content.js'

export const KML_MEDIA_MAX_BYTES = 20 * 1024 * 1024

function createError (message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function isBlockedIpv4 (address) {
  const parts = String(address || '').split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b, c] = parts
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
}

function isBlockedIpv6 (address) {
  const normalized = String(address || '').toLowerCase()
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('::ffff:')) return isBlockedIpv4(normalized.slice(7))
  return normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('ff')
}

export function isBlockedKmlMediaAddress (address) {
  const family = isIP(String(address || ''))
  if (family === 4) return isBlockedIpv4(address)
  if (family === 6) return isBlockedIpv6(address)
  return true
}

export function validateKmlMediaTarget (value) {
  if (!String(value || '').trim()) throw createError('缺少媒体 URL', 400)
  const target = normalizeKmlMediaRelayTarget(value)
  if (!target) throw createError('媒体 URL 不在兼容白名单内', 403)
  return target
}

export async function assertKmlMediaPublicAddress (target, lookup = dnsLookup) {
  let addresses
  try {
    addresses = await lookup(new URL(target).hostname, { all: true, verbatim: true })
  } catch {
    throw createError('媒体域名解析失败', 502)
  }
  if (!addresses.length || addresses.some(item => isBlockedKmlMediaAddress(item.address))) {
    throw createError('媒体域名解析到了不允许的地址', 403)
  }
  return addresses
}

export function validateKmlMediaResponse (relayResult) {
  const headers = relayResult?.headers || {}
  const contentType = String(headers['content-type'] || '').toLowerCase()
  if (!contentType.startsWith('image/')) {
    throw createError('上游内容不是受支持的图片', 415)
  }
  const contentLength = Number(headers['content-length'])
  if (!Number.isInteger(contentLength) || contentLength <= 0) {
    throw createError('上游未提供有效的图片大小', 502)
  }
  if (contentLength > KML_MEDIA_MAX_BYTES) {
    throw createError('图片大小超过 20 MB 限制', 413)
  }
  return relayResult
}
