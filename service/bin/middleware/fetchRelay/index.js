import fs from 'fs-extra'
import path from 'path'
import { pipeline } from 'stream/promises'
import rootPath from '../../rootPath.js'
import utils from '../../utils/index.js'
import axios from 'axios'
import {
  createPinnedHttpAgents,
  createPinnedProxyRequestConfig,
  isLocalProxyEndpoint,
  resolvePublicHttpTarget,
  validatePublicHttpUrl,
} from '../../security/networkTarget.js'

const CACHEABLE_STATUS_MIN = 200
const CACHEABLE_STATUS_MAX = 299
const META_SUFFIX = '.meta.json'
const STATS_STATE_FILE = '.stats.json'
const HEADER_ALLOW_LIST = [
  'accept-ranges',
  'cache-control',
  'content-encoding',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'expires',
  'last-modified',
]
const SENSITIVE_QUERY_KEYS = ['key', 'token', 'tk', 'appid', 'api_key', 'apikey', 'access_token', 'session']
export const MAX_FETCH_RELAY_STATS_ENTRIES = 100
// Cache statistics are an administrative view, not part of the tile hot path.
// A long refresh interval prevents repeated full-directory walks when the
// cache is busy while still allowing a cold start to produce a fresh snapshot.
export const DEFAULT_STATS_REFRESH_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000

function now () {
  return Date.now()
}

function normalizeBoolean (value) {
  return value === true || value === 'true' || value === '1'
}

function normalizeProxyConfig (proxy) {
  if (!proxy || proxy.enabled === false) {
    return null
  }

  const host = String(proxy.host || '').trim()
  const port = Number(proxy.port)
  if (!host || !Number.isInteger(port)) {
    return null
  }

  const result = {
    host,
    port,
    protocol: proxy.protocol || 'http',
  }

  if (proxy.username) {
    result.auth = {
      username: String(proxy.username),
      password: String(proxy.password || ''),
    }
  }

  return result
}

function pickHeaders (headers = {}) {
  const result = {}
  HEADER_ALLOW_LIST.forEach((name) => {
    if (headers[name]) {
      result[name] = headers[name]
    }
  })
  return result
}

function isLikelyCacheableContent (contentType, allowedContentTypes) {
  if (!contentType) {
    return true
  }

  return allowedContentTypes.some((item) => contentType.toLowerCase().startsWith(item.toLowerCase()))
}

function maskSensitiveUrl (url) {
  try {
    const parsed = new URL(url)
    ;[...parsed.searchParams.keys()].forEach((key) => {
      if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) {
        parsed.searchParams.set(key, '****')
      }
    })
    return parsed.toString()
  } catch (err) {
    return String(url || '')
  }
}

function cacheKeyInput (url, options = {}) {
  if (options.cacheKey) return String(options.cacheKey)
  const range = options.headers?.Range || options.headers?.range
  return range ? `${url}|range:${range}` : url
}

// Keep the administrative preview bounded while the complete cache directory
// is being counted. This avoids retaining hundreds of thousands of metadata
// records just to show the newest 100 rows.
export function retainRecentStatsEntry (entries, entry, limit = MAX_FETCH_RELAY_STATS_ENTRIES) {
  if (!Array.isArray(entries) || !entry) return entries
  entries.push(entry)
  if (entries.length >= limit * 2) {
    entries.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
    entries.splice(limit)
  }
  return entries
}

class FetchRelay {
  constructor (conf) {
    const defConf = {
      cacheDir: path.join(rootPath, '.cache/fetchRelay/'),
      timeout: 1000 * 10,
      ttl: 1000 * 60 * 60 * 6,
      staleTtl: 1000 * 60 * 60 * 24 * 30,
      minCacheBytes: 128,
      statsRefreshMinIntervalMs: DEFAULT_STATS_REFRESH_MIN_INTERVAL_MS,
      allowedContentTypes: [
        'image/',
        'application/octet-stream',
        'application/json',
        'application/vnd.mapbox-vector-tile',
        'application/x-protobuf',
        'application/gzip',
      ],
    }
    this.config = utils.merge(defConf, conf || {})
    this.httpClient = this.config.httpClient || axios
    this.targetResolver = this.config.targetResolver || resolvePublicHttpTarget
    this.statsStatePath = path.join(this.config.cacheDir, STATS_STATE_FILE)
    this.statsStateLoaded = false
    this.statsStateLoadPromise = null
    this.statsStateWritePromise = null
    this.statsDirty = false
    this.statsInvalidationGeneration = 0
    this.statsSnapshot = null
    this.statsRefreshPromise = null
    this.statsRefreshTimer = null
    this.lastStatsRefreshAt = 0
  }

  resolveTarget (url, options = {}) {
    const proxySource = Object.hasOwn(options, 'proxy') ? options.proxy : null
    const proxy = normalizeProxyConfig(proxySource)
    return this.targetResolver(url, {
      label: '回源 URL',
      delegateDnsToProxy: isLocalProxyEndpoint(proxy),
    })
  }

  getCachePaths (url, options = {}) {
    const urlInfo = new URL(url)
    const hostPath = urlInfo.port ? `${urlInfo.hostname}-${urlInfo.port}` : urlInfo.hostname
    const keyInput = cacheKeyInput(url, options)
    const urlHash = utils.md5(keyInput)
    const ext = path.extname(urlInfo.pathname).replace(/[^a-zA-Z0-9.]/g, '')
    const fileName = ext ? `${urlHash}${ext}` : urlHash
    const cachePath = path.join(this.config.cacheDir, hostPath, fileName)

    return {
      cachePath,
      metaPath: `${cachePath}${META_SUFFIX}`,
      hostPath,
      fileName,
    }
  }

  async readMeta (metaPath) {
    try {
      return await fs.readJson(metaPath)
    } catch (err) {
      if (err.code === 'ENOENT') return null
      console.warn(`[fetchRelay] invalid meta file removed: ${metaPath}`, err.message)
      await fs.remove(metaPath)
      return null
    }
  }

  isFresh (meta) {
    return Boolean(meta && meta.expiresAt && meta.expiresAt > now())
  }

  isStaleUsable (meta) {
    return Boolean(meta && meta.staleExpiresAt && meta.staleExpiresAt > now())
  }

  async getCachedEntry (url, options = {}) {
    const paths = this.getCachePaths(url, options)

    if (!await fs.pathExists(paths.cachePath)) {
      return {
        ...paths,
        exists: false,
      }
    }

    const [stat, meta] = await Promise.all([
      fs.stat(paths.cachePath),
      this.readMeta(paths.metaPath),
    ])

    if (!stat.isFile() || stat.size < this.config.minCacheBytes || !meta) {
      await Promise.all([
        fs.remove(paths.cachePath),
        fs.remove(paths.metaPath),
      ])

      return {
        ...paths,
        exists: false,
      }
    }

    return {
      ...paths,
      exists: true,
      size: stat.size,
      meta,
      fresh: this.isFresh(meta),
      staleUsable: this.isStaleUsable(meta),
    }
  }

  createCachedResponse (entry, cacheStatus) {
    const stream = fs.createReadStream(entry.cachePath)
    const headers = {
      ...entry.meta.headers,
      'x-cache': cacheStatus,
      'x-cache-key': entry.meta.key,
      'x-cache-updated-at': String(entry.meta.updatedAt),
    }

    return {
      stream,
      statusCode: entry.meta.statusCode || 200,
      headers,
      cacheStatus,
      cachePath: entry.cachePath,
      meta: entry.meta,
    }
  }

  createAxiosConfig (url, options = {}, entry) {
    const axiosConf = {
      url,
      timeout: this.config.timeout,
      responseType: 'stream',
      validateStatus: () => true,
      maxRedirects: 0,
      headers: {},
    }

    if (entry && entry.meta && !options.refresh) {
      if (entry.meta.headers.etag) {
        axiosConf.headers['If-None-Match'] = entry.meta.headers.etag
      }
      if (entry.meta.headers['last-modified']) {
        axiosConf.headers['If-Modified-Since'] = entry.meta.headers['last-modified']
      }
    }

    if (options.headers && typeof options.headers === 'object') {
      Object.entries(options.headers).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          axiosConf.headers[key] = value
        }
      })
    }

    const proxySource = Object.hasOwn(options, 'proxy') ? options.proxy : null
    const proxy = normalizeProxyConfig(proxySource)
    if (proxy) {
      const pinnedTarget = createPinnedProxyRequestConfig(options.targetResolution, proxy)
      const { headers: pinnedHeaders, ...pinnedTransport } = pinnedTarget
      Object.assign(axiosConf, pinnedTransport)
      Object.keys(axiosConf.headers).forEach((name) => {
        if (name.toLowerCase() === 'host') delete axiosConf.headers[name]
      })
      Object.assign(axiosConf.headers, pinnedHeaders)
    } else if (options.targetResolution?.addresses?.length) {
      Object.assign(axiosConf, createPinnedHttpAgents(options.targetResolution.addresses))
    }

    return axiosConf
  }

  async updateMetaFromNotModified (entry, options = {}) {
    const updatedAt = now()
    const meta = {
      ...entry.meta,
      updatedAt,
      expiresAt: updatedAt + Number(options.cacheTtlMs ?? this.config.ttl),
      staleExpiresAt: updatedAt + Number(options.staleCacheTtlMs ?? this.config.staleTtl),
    }

    await fs.writeJson(entry.metaPath, meta, { spaces: 2 })
    await this.invalidateStatsSnapshot()
    return {
      ...entry,
      meta,
    }
  }

  async writeResponseToCache (url, response, paths, options = {}) {
    const statusCode = response.status
    const headers = pickHeaders(response.headers)
    const contentType = headers['content-type'] || ''

    if (statusCode < CACHEABLE_STATUS_MIN || statusCode > CACHEABLE_STATUS_MAX) {
      response.data.destroy()
      const err = new Error(`upstream responded with non-cacheable status ${statusCode}`)
      err.statusCode = statusCode
      throw err
    }

    if (!isLikelyCacheableContent(contentType, this.config.allowedContentTypes)) {
      response.data.destroy()
      throw new Error(`upstream content type is not cacheable: ${contentType || 'unknown'}`)
    }

    await fs.ensureDir(path.dirname(paths.cachePath))

    const tempPath = `${paths.cachePath}.tmp-${process.pid}-${Date.now()}`
    await pipeline(response.data, fs.createWriteStream(tempPath))

    const stat = await fs.stat(tempPath)
    if (stat.size < this.config.minCacheBytes) {
      await fs.remove(tempPath)
      throw new Error(`upstream response is too small to cache: ${stat.size} bytes`)
    }

    const updatedAt = now()
    const meta = {
      key: utils.md5(cacheKeyInput(url, options)),
      url: maskSensitiveUrl(url),
      sourceId: options.cacheMeta?.sourceId || null,
      layerId: options.cacheMeta?.layerId || null,
      publishId: options.cacheMeta?.publishId || null,
      resourceType: options.cacheMeta?.resourceType || null,
      range: options.headers?.Range || options.headers?.range || null,
      statusCode,
      headers,
      size: stat.size,
      createdAt: updatedAt,
      updatedAt,
      expiresAt: updatedAt + Number(options.cacheTtlMs ?? this.config.ttl),
      staleExpiresAt: updatedAt + Number(options.staleCacheTtlMs ?? this.config.staleTtl),
    }

    await fs.move(tempPath, paths.cachePath, { overwrite: true })
    await fs.writeJson(paths.metaPath, meta, { spaces: 2 })
    await this.invalidateStatsSnapshot()

    return {
      ...paths,
      exists: true,
      size: stat.size,
      meta,
      fresh: true,
      staleUsable: true,
    }
  }

  async fetchUpstream (url, options = {}, entry) {
    const paths = this.getCachePaths(url, options)
    const targetResolution = await this.resolveTarget(url, options)
    const response = await this.httpClient(this.createAxiosConfig(url, {
      ...options,
      targetResolution,
    }, entry))

    if (response.status === 304 && entry && entry.exists) {
      const refreshedEntry = await this.updateMetaFromNotModified(entry, options)
      return this.createCachedResponse(refreshedEntry, 'REVALIDATED')
    }

    const cachedEntry = await this.writeResponseToCache(url, response, paths, options)
    return this.createCachedResponse(cachedEntry, 'MISS')
  }

  async fetch (url, options = {}) {
    if (!url) {
      throw new Error('url is required')
    }

    const urlInfo = validatePublicHttpUrl(url, { label: '回源 URL' })
    if (!urlInfo.hostname) {
      throw new Error('url hostname is required')
    }

    const normalizedOptions = {
      ...options,
      refresh: normalizeBoolean(options.refresh) || normalizeBoolean(options.noCache),
      cache: options.cache !== false && options.cache !== 'false',
    }

    if (!normalizedOptions.cache) {
      const targetResolution = await this.resolveTarget(url, normalizedOptions)
      const response = await this.httpClient({
        ...this.createAxiosConfig(url, {
          ...normalizedOptions,
          targetResolution,
        }),
        validateStatus: status => status >= CACHEABLE_STATUS_MIN && status <= CACHEABLE_STATUS_MAX,
      })

      return {
        stream: response.data,
        statusCode: response.status,
        headers: {
          ...pickHeaders(response.headers),
          'x-cache': 'BYPASS',
        },
        cacheStatus: 'BYPASS',
        cachePath: null,
        meta: null,
      }
    }

    const entry = await this.getCachedEntry(url, normalizedOptions)

    if (entry.exists && entry.fresh && !normalizedOptions.refresh) {
      return this.createCachedResponse(entry, 'HIT')
    }

    try {
      return await this.fetchUpstream(url, normalizedOptions, entry.exists ? entry : null)
    } catch (err) {
      if (entry.exists && entry.staleUsable && !normalizedOptions.refresh) {
        console.warn(`[fetchRelay] upstream refresh failed, serving stale cache: ${url}`, err.message)
        return this.createCachedResponse(entry, 'STALE')
      }

      throw err
    }
  }

  async getStats () {
    await this.ensureStatsStateLoaded()

    if (!this.statsDirty && this.statsSnapshot) {
      return this.statsSnapshot
    }

    if (this.statsRefreshPromise) {
      return this.statsSnapshot
        ? { ...this.statsSnapshot, refreshing: true }
        : this.statsRefreshPromise
    }

    const refreshMinIntervalMs = Math.max(0, Number(this.config.statsRefreshMinIntervalMs) || 0)
    if (this.statsSnapshot && refreshMinIntervalMs > 0 &&
      now() - this.lastStatsRefreshAt < refreshMinIntervalMs) {
      this.scheduleStatsRefresh(refreshMinIntervalMs - (now() - this.lastStatsRefreshAt))
      return { ...this.statsSnapshot, refreshing: true }
    }

    const scanGeneration = this.statsInvalidationGeneration
    this.statsRefreshPromise = this.collectStats()
      .then((stats) => {
        const isCurrentGeneration = scanGeneration === this.statsInvalidationGeneration
        if (isCurrentGeneration || !this.statsSnapshot) {
          this.statsSnapshot = stats
        }
        this.lastStatsRefreshAt = now()
        if (isCurrentGeneration) {
          this.statsDirty = false
          this.clearStatsRefreshTimer()
        }
        return this.writeStatsState().then(() => this.statsSnapshot)
      })
      .catch((err) => {
        if (this.statsSnapshot) {
          console.warn('[fetchRelay] cache stats refresh failed, serving previous snapshot:', err.message)
          return this.statsSnapshot
        }
        throw err
      })
      .finally(() => {
        this.statsRefreshPromise = null
        if (this.statsDirty) {
          const refreshMinIntervalMs = Math.max(0, Number(this.config.statsRefreshMinIntervalMs) || 0)
          this.scheduleStatsRefresh(refreshMinIntervalMs)
        }
      })

    if (this.statsSnapshot) {
      return {
        ...this.statsSnapshot,
        refreshing: true,
      }
    }

    return this.statsRefreshPromise
  }

  clearStatsRefreshTimer () {
    if (!this.statsRefreshTimer) return
    clearTimeout(this.statsRefreshTimer)
    this.statsRefreshTimer = null
  }

  scheduleStatsRefresh (delayMs) {
    if (this.statsRefreshTimer || !this.statsDirty) return
    const delay = Math.max(0, Number(delayMs) || 0)
    this.statsRefreshTimer = setTimeout(() => {
      this.statsRefreshTimer = null
      this.getStats().catch(err => {
        console.warn('[fetchRelay] deferred cache stats refresh failed:', err.message)
      })
    }, delay)
    this.statsRefreshTimer.unref?.()
  }

  async ensureStatsStateLoaded () {
    if (this.statsStateLoaded) return
    if (this.statsStateLoadPromise) return this.statsStateLoadPromise

    this.statsStateLoadPromise = (async () => {
      await fs.ensureDir(this.config.cacheDir)

      try {
        const state = await fs.readJson(this.statsStatePath)
        this.statsDirty = Boolean(state.dirty)
        this.statsSnapshot = state.snapshot || null
        this.lastStatsRefreshAt = Number(this.statsSnapshot?.generatedAt || 0)
      } catch (err) {
        this.statsDirty = false
        this.statsSnapshot = null
      }

      this.statsStateLoaded = true
    })().finally(() => {
      this.statsStateLoadPromise = null
    })

    return this.statsStateLoadPromise
  }

  async writeStatsState () {
    await fs.ensureDir(this.config.cacheDir)
    const state = {
      dirty: this.statsDirty,
      snapshot: this.statsSnapshot,
      updatedAt: now(),
    }
    const previousWrite = this.statsStateWritePromise?.catch(() => {}) || Promise.resolve()
    this.statsStateWritePromise = previousWrite.then(() => fs.writeJson(this.statsStatePath, state, { spaces: 2 }))
    return this.statsStateWritePromise
  }

  async invalidateStatsSnapshot ({ force = false } = {}) {
    await this.ensureStatsStateLoaded()
    this.statsInvalidationGeneration += 1
    if (force) {
      this.lastStatsRefreshAt = 0
      this.clearStatsRefreshTimer()
    }
    if (this.statsDirty) return

    this.statsDirty = true
    await this.writeStatsState()
  }

  createEmptyStats () {
    return {
      cacheDir: this.config.cacheDir,
      files: 0,
      bytes: 0,
      fresh: 0,
      stale: 0,
      expired: 0,
      providers: {},
      bySource: {},
      byLayer: {},
      byPublish: {},
      byResourceType: {},
      entries: [],
      generatedAt: now(),
      refreshing: false,
    }
  }

  incrementStatsGroup (group, id, state, size) {
    if (!id) return
    if (!group[id]) {
      group[id] = {
        files: 0,
        bytes: 0,
        fresh: 0,
        stale: 0,
        expired: 0,
      }
    }
    group[id].files += 1
    group[id].bytes += size
    group[id][state] += 1
  }

  async collectStats () {
    await fs.ensureDir(this.config.cacheDir)

    let files = 0
    let bytes = 0
    let fresh = 0
    let stale = 0
    let expired = 0
    const providers = {}
    const bySource = {}
    const byLayer = {}
    const byPublish = {}
    const byResourceType = {}
    const entries = []
    let scanned = 0

    const walk = async (dir, provider = 'unknown') => {
      let directory
      try {
        directory = await fs.opendir(dir)
      } catch (err) {
        if (err.code === 'ENOENT') return
        throw err
      }

      for await (const item of directory) {
        if (item.name === STATS_STATE_FILE) {
          continue
        }

        const itemPath = path.join(dir, item.name)
        if (item.isDirectory()) {
          await walk(itemPath, provider === 'unknown' ? item.name : provider)
        } else if (!item.name.endsWith(META_SUFFIX) && item.isFile()) {
          const meta = await this.readMeta(`${itemPath}${META_SUFFIX}`)
          const metadataSize = Number(meta?.size)
          const metadataUpdatedAt = Number(meta?.updatedAt)
          const hasMetadataSize = Number.isFinite(metadataSize) && metadataSize >= 0
          const hasMetadataUpdatedAt = Number.isFinite(metadataUpdatedAt) && metadataUpdatedAt >= 0
          let stat = null
          // Cache writes persist both values in the sidecar. Reuse them for
          // the large-directory scan and stat only legacy/incomplete entries.
          if (!hasMetadataSize || !hasMetadataUpdatedAt) {
            try {
              stat = await fs.stat(itemPath)
            } catch (err) {
              if (err.code === 'ENOENT') continue
              throw err
            }
          }
          const size = hasMetadataSize ? metadataSize : stat.size
          const updatedAt = hasMetadataUpdatedAt ? metadataUpdatedAt : stat.mtimeMs
          files += 1
          bytes += size
          providers[provider] = (providers[provider] || 0) + 1

          const state = this.isFresh(meta)
            ? 'fresh'
            : this.isStaleUsable(meta)
                ? 'stale'
                : 'expired'

          if (state === 'fresh') fresh += 1
          if (state === 'stale') stale += 1
          if (state === 'expired') expired += 1
          this.incrementStatsGroup(bySource, meta?.sourceId, state, size)
          this.incrementStatsGroup(byLayer, meta?.layerId, state, size)
          this.incrementStatsGroup(byPublish, meta?.publishId, state, size)
          this.incrementStatsGroup(byResourceType, meta?.resourceType, state, size)

          retainRecentStatsEntry(entries, {
            key: meta?.key || path.basename(itemPath),
            url: meta?.url || null,
            sourceId: meta?.sourceId || null,
            layerId: meta?.layerId || null,
            publishId: meta?.publishId || null,
            resourceType: meta?.resourceType || null,
            range: meta?.range || null,
            state,
            size,
            updatedAt,
            expiresAt: meta?.expiresAt || null,
          })
          scanned += 1
          if (scanned % 128 === 0) {
            await new Promise(resolve => setImmediate(resolve))
          }
        }
      }
    }

    await walk(this.config.cacheDir)

    return {
      cacheDir: this.config.cacheDir,
      files,
      bytes,
      fresh,
      stale,
      expired,
      providers,
      bySource,
      byLayer,
      byPublish,
      byResourceType,
      entries: entries
        .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
        .slice(0, MAX_FETCH_RELAY_STATS_ENTRIES),
      generatedAt: now(),
      refreshing: false,
    }
  }

  async clear (targetUrl, sourceId) {
    if (sourceId) {
      await fs.ensureDir(this.config.cacheDir)
      const walk = async (dir) => {
        let directory
        try {
          directory = await fs.opendir(dir)
        } catch (err) {
          if (err.code === 'ENOENT') return
          throw err
        }
        for await (const item of directory) {
          const itemPath = path.join(dir, item.name)
          if (item.isDirectory()) {
            await walk(itemPath)
          } else if (!item.name.endsWith(META_SUFFIX) && item.name !== STATS_STATE_FILE) {
            const metaPath = `${itemPath}${META_SUFFIX}`
            const meta = await this.readMeta(metaPath)
            if (meta && meta.sourceId === sourceId) {
              await fs.remove(itemPath)
              await fs.remove(metaPath)
            }
          }
        }
      }
      await walk(this.config.cacheDir)
      await this.invalidateStatsSnapshot({ force: true })
      return {
        removed: 'source',
        target: sourceId,
      }
    }

    if (targetUrl) {
      const paths = this.getCachePaths(targetUrl)
      await Promise.all([
        fs.remove(paths.cachePath),
        fs.remove(paths.metaPath),
      ])
      await this.invalidateStatsSnapshot({ force: true })

      return {
        removed: 1,
        target: targetUrl,
      }
    }

    await fs.remove(this.config.cacheDir)
    await fs.ensureDir(this.config.cacheDir)
    await this.ensureStatsStateLoaded()
    this.statsInvalidationGeneration += 1
    this.clearStatsRefreshTimer()
    this.statsDirty = false
    this.statsSnapshot = this.createEmptyStats()
    this.lastStatsRefreshAt = now()
    await this.writeStatsState()

    return {
      removed: 'all',
      target: null,
    }
  }

  async clearMany (targetUrls = []) {
    const urls = [...new Set((Array.isArray(targetUrls) ? targetUrls : [])
      .filter(Boolean))]

    if (!urls.length) {
      return {
        removed: 0,
        target: null,
      }
    }

    await Promise.all(urls.map((targetUrl) => {
      const paths = this.getCachePaths(targetUrl)
      return Promise.all([
        fs.remove(paths.cachePath),
        fs.remove(paths.metaPath),
      ])
    }))
    await this.invalidateStatsSnapshot({ force: true })

    return {
      removed: urls.length,
      target: null,
    }
  }
}

export default FetchRelay
