import fs from 'fs-extra'
import path from 'path'
import { open as openFile } from 'node:fs/promises'
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

function maskSensitiveUrl (url, additionalKeys = []) {
  try {
    const parsed = new URL(url)
    const sensitiveKeys = new Set([
      ...SENSITIVE_QUERY_KEYS,
      ...(Array.isArray(additionalKeys) ? additionalKeys : []),
    ].map(key => String(key).toLowerCase()))
    ;[...parsed.searchParams.keys()].forEach((key) => {
      if (sensitiveKeys.has(key.toLowerCase())) {
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

function jsonFileBytes (value) {
  return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`)
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
    this.cacheObserver = null
    this.cachePathLocks = new Map()
    this.activeCacheWrites = new Set()
    this.cacheClearGate = null
  }

  setCacheObserver (observer) {
    this.cacheObserver = observer || null
  }

  async withCachePathLock (cachePath, task) {
    const lockKey = path.resolve(String(cachePath || ''))
    const previous = this.cachePathLocks.get(lockKey) || Promise.resolve()
    let release
    const current = new Promise(resolve => { release = resolve })
    const queued = previous.catch(() => {}).then(() => current)
    this.cachePathLocks.set(lockKey, queued)
    await previous.catch(() => {})
    try {
      return await task()
    } finally {
      release()
      if (this.cachePathLocks.get(lockKey) === queued) this.cachePathLocks.delete(lockKey)
    }
  }

  async withCacheWrite (task) {
    while (this.cacheClearGate) await this.cacheClearGate
    let release
    const activeWrite = new Promise(resolve => { release = resolve })
    this.activeCacheWrites.add(activeWrite)
    try {
      return await task()
    } finally {
      this.activeCacheWrites.delete(activeWrite)
      release()
    }
  }

  async withExclusiveCacheClear (task) {
    while (this.cacheClearGate) await this.cacheClearGate
    let release
    const clearGate = new Promise(resolve => { release = resolve })
    this.cacheClearGate = clearGate
    const activeWrites = [...this.activeCacheWrites]
    try {
      await Promise.all(activeWrites)
      return await task()
    } finally {
      if (this.cacheClearGate === clearGate) this.cacheClearGate = null
      release()
    }
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
    const rawHostPath = urlInfo.port ? `${urlInfo.hostname}-${urlInfo.port}` : urlInfo.hostname
    const hostPath = options.cacheNamespace
      ? String(options.cacheNamespace).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || rawHostPath
      : rawHostPath
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
      console.warn(`[fetchRelay] invalid meta file ignored: ${metaPath}`, err.message)
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
    const primaryEntry = await this.getCachedEntryAtPaths(this.getCachePaths(url, options))
    if (primaryEntry.exists) return primaryEntry

    if (options.legacyCacheKeyFallback && (options.cacheKey || options.cacheNamespace)) {
      const legacyOptions = { ...options }
      delete legacyOptions.cacheKey
      delete legacyOptions.cacheNamespace
      delete legacyOptions.legacyCacheKeyFallback
      const legacyEntry = await this.getCachedEntryAtPaths(this.getCachePaths(url, legacyOptions))
      if (legacyEntry.exists) return { ...legacyEntry, legacy: true }

      const aliasPaths = await this.cacheObserver?.findLegacyEntry?.({
        url,
        options,
        paths: primaryEntry,
      })
      if (aliasPaths) {
        const aliasEntry = await this.getCachedEntryAtPaths(aliasPaths)
        if (aliasEntry.exists) return { ...aliasEntry, legacy: true, legacyAlias: true }
      }
    }

    return primaryEntry
  }

  async getCachedEntryAtPaths (paths) {
    return this.withCachePathLock(paths.cachePath, () => this.getCachedEntryAtPathsUnlocked(paths))
  }

  async getCachedEntryAtPathsUnlocked (paths) {

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

    if (!stat.isFile() || stat.size < this.config.minCacheBytes) {
      await Promise.all([
        fs.remove(paths.cachePath),
        fs.remove(paths.metaPath),
      ])
      await this.cacheObserver?.onDelete?.({ paths })

      return {
        ...paths,
        exists: false,
      }
    }

    if (!meta) {
      return {
        ...paths,
        exists: false,
        orphaned: true,
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

  async createCachedResponse (entry, cacheStatus) {
    return this.withCacheWrite(() => this.createCachedResponseUnlocked(entry, cacheStatus))
  }

  async createCachedResponseUnlocked (entry, cacheStatus) {
    const headers = {
      ...entry.meta.headers,
      'x-cache': cacheStatus,
      'x-cache-key': entry.meta.key,
      'x-cache-updated-at': String(entry.meta.updatedAt),
    }
    const file = await openFile(entry.cachePath, 'r')
    const stream = file.createReadStream()

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
    return this.withCacheWrite(() => this.updateMetaFromNotModifiedUnlocked(entry, options))
  }

  async updateMetaFromNotModifiedUnlocked (entry, options = {}) {
    const updatedAt = now()
    const meta = {
      ...entry.meta,
      sourceId: options.cacheMeta?.sourceId || entry.meta.sourceId || null,
      layerId: options.cacheMeta?.layerId || entry.meta.layerId || null,
      publishId: options.cacheMeta?.publishId || entry.meta.publishId || null,
      resourceType: options.cacheMeta?.resourceType || entry.meta.resourceType || null,
      updatedAt,
      expiresAt: updatedAt + Number(options.cacheTtlMs ?? this.config.ttl),
      staleExpiresAt: updatedAt + Number(options.staleCacheTtlMs ?? this.config.staleTtl),
    }

    const previousMetaSize = jsonFileBytes(entry.meta || {})
    const metaSize = jsonFileBytes(meta)
    await this.withCachePathLock(entry.cachePath, async () => {
      await fs.writeJson(entry.metaPath, meta, { spaces: 2 })
      await this.cacheObserver?.onUpsert?.({
        paths: entry,
        meta,
        metaSize,
        previousSize: Number(entry.size || entry.meta?.size || 0),
        previousMetaSize,
      })
    })
    await this.invalidateStatsSnapshot()
    return {
      ...entry,
      meta,
    }
  }

  async createTemporaryBypassResponse (tempPath, statusCode, headers, onCleanup) {
    const file = await openFile(tempPath, 'r')
    const stream = file.createReadStream()
    let removed = false
    const cleanup = () => {
      if (removed) return
      removed = true
      fs.remove(tempPath).catch(err => {
        console.warn(`[fetchRelay] failed to remove bypass temp file: ${tempPath}`, err.message)
      }).finally(() => Promise.resolve(onCleanup?.()).catch(err => {
        console.warn('[fetchRelay] failed to release bypass reservation:', err.message)
      }))
    }
    stream.once('close', cleanup)
    stream.once('error', cleanup)
    return {
      stream,
      statusCode,
      headers: { ...headers, 'x-cache': 'BYPASS_LIMIT' },
      cacheStatus: 'BYPASS_LIMIT',
      cachePath: null,
      meta: null,
      bypass: true,
    }
  }

  async writeResponseToCache (url, response, paths, options = {}, persist = {}) {
    return this.withCacheWrite(() => this.writeResponseToCacheUnlocked(url, response, paths, options, persist))
  }

  async writeResponseToCacheUnlocked (url, response, paths, options = {}, persist = {}) {
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
    try {
      await pipeline(response.data, fs.createWriteStream(tempPath))
    } catch (err) {
      await fs.remove(tempPath)
      throw err
    }

    const stat = await fs.stat(tempPath)
    if (stat.size < this.config.minCacheBytes) {
      await fs.remove(tempPath)
      throw new Error(`upstream response is too small to cache: ${stat.size} bytes`)
    }

    const updatedAt = now()
    const meta = {
      key: utils.md5(cacheKeyInput(url, options)),
      url: maskSensitiveUrl(url, options.sensitiveQueryParams),
      sourceId: options.cacheMeta?.sourceId || null,
      layerId: options.cacheMeta?.layerId || null,
      publishId: options.cacheMeta?.publishId || null,
      resourceType: options.cacheMeta?.resourceType || null,
      range: options.headers?.Range || options.headers?.range || null,
      keyVersion: options.cacheKeyVersion || 'v1',
      policyRevision: Number(options.cachePolicyRevision || 0),
      statusCode,
      headers,
      size: stat.size,
      createdAt: updatedAt,
      updatedAt,
      expiresAt: updatedAt + Number(options.cacheTtlMs ?? this.config.ttl),
      staleExpiresAt: updatedAt + Number(options.staleCacheTtlMs ?? this.config.staleTtl),
    }

    const metaSize = jsonFileBytes(meta)
    let result
    try {
      await this.withCachePathLock(paths.cachePath, async () => {
        let previousSize = 0
        let previousMetaSize = 0
        try {
          previousSize = Number((await fs.stat(paths.cachePath)).size || 0)
        } catch (err) {
          if (err.code !== 'ENOENT') throw err
        }
        try {
          previousMetaSize = Number((await fs.stat(paths.metaPath)).size || 0)
        } catch (err) {
          if (err.code !== 'ENOENT') throw err
        }
        if (persist.reservation && this.cacheObserver?.confirmPersist) {
          const confirmed = await this.cacheObserver.confirmPersist({
            reservation: persist.reservation,
            relativePath: persist.relativePath,
            bodyBytes: stat.size,
            sidecarBytes: metaSize,
            previousBodyBytes: previousSize,
            previousSidecarBytes: previousMetaSize,
          })
          if (!confirmed) {
            result = await this.createTemporaryBypassResponse(tempPath, statusCode, headers, persist.onBypassCleanup)
            return
          }
        }
        await fs.move(tempPath, paths.cachePath, { overwrite: true })
        await fs.writeJson(paths.metaPath, meta, { spaces: 2 })
        await this.cacheObserver?.onUpsert?.({
          paths,
          meta,
          metaSize,
          previousSize,
          previousMetaSize,
        })
        result = {
          ...paths,
          exists: true,
          size: stat.size,
          meta,
          fresh: true,
          staleUsable: true,
        }
      })
    } catch (err) {
      await fs.remove(tempPath)
      throw err
    }
    if (result?.bypass) return result
    await this.invalidateStatsSnapshot()
    return result
  }

  async fetchUpstream (url, options = {}, entry) {
    const paths = this.getCachePaths(url, options)
    const targetResolution = await this.resolveTarget(url, options)
    const response = await this.httpClient(this.createAxiosConfig(url, {
      ...options,
      targetResolution,
    }, entry))

    if (response.status === 304 && entry && entry.exists) {
      response.data.destroy?.()
      const refreshedResponse = await this.withCacheWrite(async () => {
        const currentEntry = await this.getCachedEntry(url, options)
        if (!currentEntry.exists) return null
        const refreshedEntry = await this.updateMetaFromNotModifiedUnlocked(currentEntry, options)
        return this.createCachedResponseUnlocked(refreshedEntry, 'REVALIDATED')
      })
      if (refreshedResponse) return refreshedResponse
      return this.fetchUpstream(url, { ...options, refresh: true }, null)
    }

    const headers = pickHeaders(response.headers)
    const contentType = headers['content-type'] || ''
    if (response.status < CACHEABLE_STATUS_MIN || response.status > CACHEABLE_STATUS_MAX) {
      response.data.destroy()
      const err = new Error(`upstream responded with non-cacheable status ${response.status}`)
      err.statusCode = response.status
      throw err
    }
    if (!isLikelyCacheableContent(contentType, this.config.allowedContentTypes)) {
      response.data.destroy()
      throw new Error(`upstream content type is not cacheable: ${contentType || 'unknown'}`)
    }

    const estimatedSize = Number(response.headers?.['content-length'] || 0)
    const relativePath = path.relative(this.config.cacheDir, paths.cachePath)
    const sameEntryPath = entry?.cachePath && path.resolve(entry.cachePath) === path.resolve(paths.cachePath)
    const previousSize = sameEntryPath ? Number(entry.size || entry.meta?.size || 0) : 0
    const previousMetaSize = sameEntryPath ? jsonFileBytes(entry.meta || {}) : 0
    const persistPayload = {
      url,
      options,
      estimatedSize,
      estimatedMetaSize: Math.max(512, Buffer.byteLength(String(url || '')) + 512),
      relativePath,
      previousSize,
      previousMetaSize,
    }
    let reservation = null
    let allowed = true
    if (this.cacheObserver?.reservePersist) {
      reservation = await this.cacheObserver.reservePersist(persistPayload)
      allowed = Boolean(reservation?.allowed)
    } else if (this.cacheObserver?.shouldPersist) {
      allowed = this.cacheObserver.shouldPersist(persistPayload)
    }
    if (!allowed) {
      return {
        stream: response.data,
        statusCode: response.status,
        headers: { ...headers, 'x-cache': 'BYPASS_LIMIT' },
        cacheStatus: 'BYPASS_LIMIT',
        cachePath: null,
        meta: null,
      }
    }

    let releaseReservation = true
    try {
      const cachedResponse = await this.withCacheWrite(async () => {
        const cachedEntry = await this.writeResponseToCacheUnlocked(url, response, paths, options, {
          reservation,
          relativePath,
          previousSize,
          previousMetaSize,
          onBypassCleanup: () => this.cacheObserver?.releasePersist?.({ reservation }),
        })
        if (cachedEntry.bypass) return cachedEntry
        return this.createCachedResponseUnlocked(cachedEntry, 'MISS')
      })
      if (cachedResponse.bypass) releaseReservation = false
      return cachedResponse
    } finally {
      if (releaseReservation) await this.cacheObserver?.releasePersist?.({ reservation })
    }
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

    const cached = await this.withCacheWrite(async () => {
      const entry = await this.getCachedEntry(url, normalizedOptions)
      if (entry.exists && entry.fresh && !normalizedOptions.refresh) {
        return {
          entry,
          response: await this.createCachedResponseUnlocked(entry, 'HIT'),
        }
      }
      return { entry, response: null }
    })
    if (cached.response) return cached.response
    const entry = cached.entry

    try {
      return await this.fetchUpstream(url, normalizedOptions, entry.exists ? entry : null)
    } catch (err) {
      if (entry.exists && entry.staleUsable && !normalizedOptions.refresh) {
        const staleResponse = await this.withCacheWrite(async () => {
          const currentEntry = await this.getCachedEntry(url, normalizedOptions)
          if (!currentEntry.exists || !currentEntry.staleUsable) return null
          return this.createCachedResponseUnlocked(currentEntry, 'STALE')
        })
        if (staleResponse) {
          console.warn(
            `[fetchRelay] upstream refresh failed, serving stale cache: ${maskSensitiveUrl(url, normalizedOptions.sensitiveQueryParams)}`,
            err.message
          )
          return staleResponse
        }
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
      let scanned = 0
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
              await this.cacheObserver?.onDelete?.({
                paths: { cachePath: itemPath, metaPath },
              })
            }
            scanned += 1
            if (scanned % 128 === 0) await new Promise(resolve => setImmediate(resolve))
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
      await this.cacheObserver?.onDelete?.({ paths })
      await this.invalidateStatsSnapshot({ force: true })

      return {
        removed: 1,
        target: targetUrl,
      }
    }

    return this.withExclusiveCacheClear(async () => {
      await fs.remove(this.config.cacheDir)
      await fs.ensureDir(this.config.cacheDir)
      await this.ensureStatsStateLoaded()
      this.statsInvalidationGeneration += 1
      this.clearStatsRefreshTimer()
      this.statsDirty = false
      this.statsSnapshot = this.createEmptyStats()
      this.lastStatsRefreshAt = now()
      await this.writeStatsState()
      await this.cacheObserver?.onClear?.({ type: 'all' })

      return {
        removed: 'all',
        target: null,
      }
    })
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

    await Promise.all(urls.map(async (targetUrl) => {
      const paths = this.getCachePaths(targetUrl)
      await Promise.all([
        fs.remove(paths.cachePath),
        fs.remove(paths.metaPath),
      ])
      await this.cacheObserver?.onDelete?.({ paths })
    }))
    await this.invalidateStatsSnapshot({ force: true })

    return {
      removed: urls.length,
      target: null,
    }
  }
}

export default FetchRelay
