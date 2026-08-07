import { normalizeKmlMediaRelayTarget } from '../../../shared/kml-content.js'
import {
  isBlockedNetworkAddress,
  resolvePublicHttpTarget,
} from '../security/networkTarget.js'

export const KML_MEDIA_MAX_BYTES = 20 * 1024 * 1024

function createError (message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

export function isBlockedKmlMediaAddress (address) {
  return isBlockedNetworkAddress(address)
}

export function validateKmlMediaTarget (value) {
  if (!String(value || '').trim()) throw createError('缺少媒体 URL', 400)
  const target = normalizeKmlMediaRelayTarget(value)
  if (!target) throw createError('媒体 URL 不在兼容白名单内', 403)
  return target
}

export async function assertKmlMediaPublicAddress (target, lookup) {
  try {
    const resolution = await resolvePublicHttpTarget(target, {
      label: '媒体 URL',
      ...(lookup ? { lookup } : {}),
    })
    return resolution.addresses
  } catch (err) {
    if (err.statusCode === 502) throw createError('媒体域名解析失败', 502)
    throw createError('媒体域名解析到了不允许的地址', 403)
  }
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
