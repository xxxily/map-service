import axios from 'axios'
import {
  DEFAULT_SHARE_LINK_LIMIT,
  createKmlShareEmbedItem,
  extractKmlShareLinkCandidates,
  getKmlShareLinkProvider,
  resolveKnownKmlShareLink,
} from '../../../shared/kml-share-links.js'
import {
  createPinnedHttpAgents,
  resolvePublicHttpTarget,
} from '../security/networkTarget.js'
import { createHttpError } from './security.js'

const DEFAULT_TEXT_MAX_LENGTH = 100000
const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_TOTAL_TIMEOUT_MS = 10000
const DEFAULT_MAX_REDIRECTS = 3

function lowerHeaders (headers = {}) {
  if (headers?.entries instanceof Function) {
    return Object.fromEntries(Array.from(headers.entries(), ([key, value]) => [String(key).toLowerCase(), value]))
  }
  return Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), value]))
}

function responseStatus (response) {
  return Number(response?.status ?? response?.statusCode ?? 0)
}

function actorKey (actor, context = {}) {
  return String(actor?.user?.id || actor?.userId || actor?.id || context.userId || context.ip || 'anonymous')
}

function providerError (message, statusCode = 502, code = 'SHARE_LINK_UPSTREAM_FAILED') {
  return createHttpError(message, statusCode, code)
}

export class KmlShareLinkResolverService {
  constructor (options = {}) {
    this.httpClient = options.httpClient || axios
    this.targetResolver = options.targetResolver || resolvePublicHttpTarget
    this.clock = options.clock || (() => Date.now())
    this.timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS)
    this.totalTimeoutMs = Number(options.totalTimeoutMs || DEFAULT_TOTAL_TIMEOUT_MS)
    this.maxRedirects = Number(options.maxRedirects ?? DEFAULT_MAX_REDIRECTS)
    this.maxLinks = Number(options.maxLinks || DEFAULT_SHARE_LINK_LIMIT)
    this.textMaxLength = Number(options.textMaxLength || DEFAULT_TEXT_MAX_LENGTH)
    this.rateWindowMs = Number(options.rateWindowMs || 10 * 60 * 1000)
    this.rateMaxAttempts = Number(options.rateMaxAttempts || 30)
    this.attempts = new Map()
  }

  normalizeInputText (value) {
    if (typeof value !== 'string' || !value.trim()) {
      throw createHttpError('分享文本不能为空', 400, 'VALIDATION_FAILED')
    }
    if (value.length > this.textMaxLength) {
      throw createHttpError(`分享文本不能超过 ${this.textMaxLength} 个字符`, 400, 'VALIDATION_FAILED')
    }
    return value
  }

  assertRateLimit (key) {
    const now = this.clock()
    const recent = (this.attempts.get(key) || []).filter(timestamp => now - timestamp < this.rateWindowMs)
    if (recent.length >= this.rateMaxAttempts) {
      throw createHttpError('分享链接解析过于频繁，请稍后再试', 429, 'SHARE_LINK_RATE_LIMITED')
    }
    recent.push(now)
    this.attempts.set(key, recent)
  }

  remainingTime (deadlineAt) {
    const remaining = Number(deadlineAt) - this.clock()
    if (!Number.isFinite(remaining) || remaining <= 0) {
      throw providerError('读取分享链接超时', 504, 'SHARE_LINK_TIMEOUT')
    }
    return Math.max(1, remaining)
  }

  async resolveTarget (url, deadlineAt) {
    const remaining = this.remainingTime(deadlineAt)
    let timer = null
    try {
      return await Promise.race([
        this.targetResolver(url, { label: '分享链接上游地址' }),
        new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(providerError('读取分享链接超时', 504, 'SHARE_LINK_TIMEOUT')), remaining)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  assertProviderUrl (value, provider) {
    let parsed
    try {
      parsed = new URL(value)
    } catch {
      throw providerError('分享平台返回了无效地址')
    }
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !provider.redirectHosts.includes(hostname)
    ) {
      throw providerError('分享平台返回了不允许访问的地址', 502, 'SHARE_LINK_UPSTREAM_BLOCKED')
    }
    parsed.hostname = hostname
    return parsed
  }

  async resolveDouyinShortLink (candidate, deadlineAt) {
    const provider = getKmlShareLinkProvider('douyin')
    let currentUrl = candidate.sourceUrl

    for (let redirectCount = 0; redirectCount <= this.maxRedirects; redirectCount += 1) {
      const parsed = this.assertProviderUrl(currentUrl, provider)
      const known = resolveKnownKmlShareLink(parsed.toString())
      if (known.item) {
        return createKmlShareEmbedItem(provider.id, known.item.resourceId, candidate.sourceUrl)
      }

      let resolution
      try {
        resolution = await this.resolveTarget(parsed.toString(), deadlineAt)
      } catch (error) {
        if (error?.code === 'SHARE_LINK_TIMEOUT') throw error
        throw providerError('分享链接上游地址未通过公共网络校验', 502, 'SHARE_LINK_UPSTREAM_BLOCKED')
      }

      let response
      try {
        response = await this.httpClient({
          url: parsed.toString(),
          method: 'HEAD',
          responseType: 'arraybuffer',
          timeout: Math.min(this.timeoutMs, this.remainingTime(deadlineAt)),
          maxRedirects: 0,
          maxContentLength: 64 * 1024,
          maxBodyLength: 64 * 1024,
          decompress: false,
          proxy: false,
          validateStatus: () => true,
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': 'map-service-share-link-resolver/1.0',
          },
          ...createPinnedHttpAgents(resolution.addresses),
        })
      } catch (error) {
        if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || /timeout/i.test(String(error?.message || ''))) {
          throw providerError('读取分享链接超时', 504, 'SHARE_LINK_TIMEOUT')
        }
        throw providerError('读取分享链接失败')
      }

      const status = responseStatus(response)
      const location = lowerHeaders(response?.headers).location
      if (status >= 300 && status < 400 && location) {
        if (redirectCount >= this.maxRedirects) {
          throw providerError('分享链接重定向次数过多')
        }
        currentUrl = new URL(location, parsed).toString()
        continue
      }
      throw providerError('分享链接没有返回可识别的公开视频地址')
    }

    throw providerError('分享链接重定向次数过多')
  }

  async resolveCandidate (candidate, deadlineAt) {
    if (candidate.item) return candidate.item
    if (candidate.provider === 'douyin' && candidate.requiresServerResolution) {
      return this.resolveDouyinShortLink(candidate, deadlineAt)
    }
    throw providerError('该分享链接暂不支持自动解析')
  }

  warningForError (candidate, error) {
    const provider = getKmlShareLinkProvider(candidate.provider)
    const label = provider?.label || '第三方平台'
    if (error?.code === 'SHARE_LINK_TIMEOUT') return `${label}分享链接读取超时，已保留原链接`
    if (error?.code === 'SHARE_LINK_UPSTREAM_BLOCKED') return `${label}分享链接跳转到了不允许的地址，已保留原链接`
    return `${label}分享链接暂时无法转换，已保留原链接`
  }

  async resolve (actor, input = {}, context = {}) {
    const text = this.normalizeInputText(input.text)
    const extracted = extractKmlShareLinkCandidates(text, { limit: this.maxLinks })
    if (extracted.truncated) {
      throw createHttpError(`一次最多解析 ${this.maxLinks} 个受支持分享链接`, 413, 'SHARE_LINK_LIMIT_EXCEEDED')
    }
    if (!extracted.candidates.length) return { items: [], warnings: [] }

    const requiresUpstream = extracted.candidates.some(candidate => candidate.requiresServerResolution)
    if (requiresUpstream) this.assertRateLimit(actorKey(actor, context))

    const deadlineAt = this.clock() + this.totalTimeoutMs
    const results = await Promise.all(extracted.candidates.map(async candidate => {
      try {
        return { item: await this.resolveCandidate(candidate, deadlineAt), warning: '' }
      } catch (error) {
        return { item: null, warning: this.warningForError(candidate, error) }
      }
    }))

    const seen = new Set()
    const items = []
    const warnings = []
    results.forEach(result => {
      if (result.warning && !warnings.includes(result.warning)) warnings.push(result.warning)
      if (!result.item) return
      const key = `${result.item.provider}:${result.item.resourceId}`
      if (seen.has(key)) return
      seen.add(key)
      items.push(result.item)
    })
    return { items, warnings }
  }
}

export default KmlShareLinkResolverService
