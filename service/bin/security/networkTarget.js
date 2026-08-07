import { lookup as dnsLookup } from 'node:dns/promises'
import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import { BlockList, isIP } from 'node:net'
import HttpsProxyAgent from 'https-proxy-agent'

const blockedAddresses = new BlockList()

;[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['168.63.129.16', 32],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) => blockedAddresses.addSubnet(address, prefix, 'ipv4'))

;[
  ['::', 96],
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
].forEach(([address, prefix]) => blockedAddresses.addSubnet(address, prefix, 'ipv6'))

const BLOCKED_HOST_SUFFIXES = [
  '.arpa',
  '.corp',
  '.home',
  '.internal',
  '.intranet',
  '.lan',
  '.local',
  '.localdomain',
  '.localhost',
]

function createHttpError (message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function normalizeHostname (value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .split('%')[0]
}

export function isBlockedNetworkAddress (address) {
  const normalized = normalizeHostname(address)
  const family = isIP(normalized)
  if (!family) return true
  if (family === 6 && normalized.startsWith('::ffff:')) return true
  return blockedAddresses.check(normalized, family === 4 ? 'ipv4' : 'ipv6')
}

export function isBlockedNetworkHostname (hostname) {
  const normalized = normalizeHostname(hostname)
  if (!normalized) return true

  const family = isIP(normalized)
  if (family) return isBlockedNetworkAddress(normalized)
  if (!normalized.includes('.')) return true
  if (BLOCKED_HOST_SUFFIXES.some(suffix => normalized.endsWith(suffix))) return true

  const firstLabel = normalized.split('.')[0]
  return firstLabel === 'metadata' || firstLabel === 'instance-data'
}

export function validatePublicHttpUrl (value, options = {}) {
  const label = options.label || 'URL'
  const normalized = String(value || '').trim()
  if (!normalized) throw createHttpError(`${label}不能为空`, 400)

  let parsed
  try {
    parsed = new URL(normalized)
  } catch {
    throw createHttpError(`${label}不是有效 URL`, 400)
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createHttpError(`${label}仅支持 http 或 https`, 400)
  }
  if (parsed.username || parsed.password) {
    throw createHttpError(`${label}不能包含账号密码`, 400)
  }
  if (isBlockedNetworkHostname(parsed.hostname)) {
    throw createHttpError(`${label}不能指向 localhost、内网或保留地址`, 403)
  }
  return parsed
}

export async function resolvePublicHttpTarget (value, options = {}) {
  const label = options.label || 'URL'
  const lookup = options.lookup || dnsLookup
  const parsed = validatePublicHttpUrl(value, { label })
  const hostname = normalizeHostname(parsed.hostname)
  const literalFamily = isIP(hostname)

  let resolved
  if (literalFamily) {
    resolved = [{ address: hostname, family: literalFamily }]
  } else {
    try {
      const result = await lookup(hostname, { all: true, verbatim: true })
      resolved = Array.isArray(result) ? result : [result]
    } catch {
      throw createHttpError(`${label}域名解析失败`, 502)
    }
  }

  const addresses = resolved
    .map(item => typeof item === 'string' ? { address: item, family: isIP(item) } : item)
    .map(item => ({
      address: normalizeHostname(item?.address),
      family: Number(item?.family) || isIP(normalizeHostname(item?.address)),
    }))
    .filter(item => item.address && item.family)

  if (!addresses.length || addresses.some(item => isBlockedNetworkAddress(item.address))) {
    throw createHttpError(`${label}解析到了不允许的地址`, 403)
  }

  const unique = []
  const seen = new Set()
  addresses.forEach((item) => {
    const key = `${item.family}:${item.address}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(item)
    }
  })

  return {
    url: parsed.toString(),
    hostname,
    addresses: unique,
  }
}

export function createPinnedLookup (addresses = []) {
  const resolved = addresses.map(item => ({
    address: normalizeHostname(item.address),
    family: Number(item.family) || isIP(normalizeHostname(item.address)),
  })).filter(item => item.address && item.family && !isBlockedNetworkAddress(item.address))
  let cursor = 0

  return (hostname, options, callback) => {
    const lookupOptions = typeof options === 'object' && options ? options : { family: Number(options) || 0 }
    const family = Number(lookupOptions.family) || 0
    const candidates = family ? resolved.filter(item => item.family === family) : resolved
    if (!candidates.length) {
      callback(createHttpError('回源域名没有可用的公开地址', 502))
      return
    }
    if (lookupOptions.all) {
      callback(null, candidates.map(item => ({ ...item })))
      return
    }
    const selected = candidates[cursor % candidates.length]
    cursor += 1
    callback(null, selected.address, selected.family)
  }
}

export function createPinnedHttpAgents (addresses) {
  const lookup = createPinnedLookup(addresses)
  return {
    httpAgent: new HttpAgent({ lookup }),
    httpsAgent: new HttpsAgent({ lookup }),
  }
}

function createPinnedHttpsProxyAgent (proxy, originHostname) {
  const protocol = String(proxy?.protocol || 'http').replace(/:$/, '').toLowerCase()
  const hostname = normalizeHostname(proxy?.hostname || proxy?.host)
  const port = Number(proxy?.port)
  if (!['http', 'https'].includes(protocol) || !hostname || !Number.isInteger(port)) {
    throw createHttpError('代理出口配置不正确', 400)
  }

  let auth
  if (proxy.auth && typeof proxy.auth === 'object') {
    auth = `${String(proxy.auth.username || '')}:${String(proxy.auth.password || '')}`
  } else if (proxy.auth) {
    auth = String(proxy.auth)
  }

  const options = {
    protocol: `${protocol}:`,
    hostname,
    port,
    auth,
  }
  if (protocol === 'https') {
    options.ALPNProtocols = ['http/1.1']
    if (!isIP(hostname)) options.servername = hostname
  }

  const agent = new HttpsProxyAgent(options)
  const createSocket = agent.callback
  agent.callback = function pinnedProxyCallback (request, requestOptions) {
    const servername = isIP(originHostname) ? undefined : originHostname
    return createSocket.call(this, request, servername
      ? { ...requestOptions, servername }
      : requestOptions)
  }
  return agent
}

export function createPinnedProxyRequestConfig (targetResolution, proxy = null) {
  const parsed = validatePublicHttpUrl(targetResolution?.url, { label: '代理回源 URL' })
  const hostname = normalizeHostname(targetResolution?.hostname || parsed.hostname)
  if (hostname !== normalizeHostname(parsed.hostname)) {
    throw createHttpError('代理回源域名与校验结果不一致', 400)
  }

  const addresses = (targetResolution?.addresses || [])
    .map(item => ({
      address: normalizeHostname(item?.address),
      family: Number(item?.family) || isIP(normalizeHostname(item?.address)),
    }))
    .filter(item => item.address && item.family)
  if (!addresses.length || addresses.some(item => isBlockedNetworkAddress(item.address))) {
    throw createHttpError('代理回源地址未通过公共网络校验', 403)
  }

  const selected = addresses[0]
  const pinnedUrl = new URL(parsed)
  pinnedUrl.hostname = selected.family === 6 ? `[${selected.address}]` : selected.address
  const config = {
    url: pinnedUrl.toString(),
    headers: {
      Host: parsed.host,
    },
  }

  if (proxy && parsed.protocol === 'https:') {
    config.proxy = false
    config.httpsAgent = createPinnedHttpsProxyAgent(proxy, hostname)
  } else if (proxy) {
    config.proxy = proxy
  } else if (parsed.protocol === 'https:' && !isIP(hostname)) {
    config.httpsAgent = new HttpsAgent({ servername: hostname })
  }
  return config
}
