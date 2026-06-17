import fs from 'fs-extra'
import path from 'path'
import { pipeline } from 'stream/promises'
import rootPath from '../../rootPath.js'
import utils from '../../utils/index.js'
import axios from 'axios'

const CACHEABLE_STATUS_MIN = 200
const CACHEABLE_STATUS_MAX = 299
const META_SUFFIX = '.meta.json'
const HEADER_ALLOW_LIST = [
  'cache-control',
  'content-type',
  'etag',
  'expires',
  'last-modified',
]

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

  if (proxy === true) {
    return {
      host: '127.0.0.1',
      port: 10809,
      protocol: 'http',
    }
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

class FetchRelay {
  constructor (conf) {
    const defConf = {
      cacheDir: path.join(rootPath, '.cache/fetchRelay/'),
      timeout: 1000 * 10,
      ttl: 1000 * 60 * 60 * 6,
      staleTtl: 1000 * 60 * 60 * 24 * 30,
      minCacheBytes: 128,
      allowedContentTypes: [
        'image/',
        'application/octet-stream',
      ],
    }
    this.config = utils.merge(defConf, conf || {})
    this.httpClient = this.config.httpClient || axios
  }

  getCachePaths (url) {
    const urlInfo = new URL(url)
    const hostPath = urlInfo.port ? `${urlInfo.hostname}-${urlInfo.port}` : urlInfo.hostname
    const urlHash = utils.md5(url)
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
    if (!await fs.pathExists(metaPath)) {
      return null
    }

    try {
      return await fs.readJson(metaPath)
    } catch (err) {
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

  async getCachedEntry (url) {
    const paths = this.getCachePaths(url)

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
      statusCode: 200,
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

    const proxySource = Object.hasOwn(options, 'proxy')
      ? options.proxy
      : normalizeBoolean(options.useProxy)
          ? this.config.proxy || true
          : null
    const proxy = normalizeProxyConfig(proxySource)
    if (proxy) {
      axiosConf.proxy = proxy
    }

    return axiosConf
  }

  async updateMetaFromNotModified (entry) {
    const updatedAt = now()
    const meta = {
      ...entry.meta,
      updatedAt,
      expiresAt: updatedAt + this.config.ttl,
      staleExpiresAt: updatedAt + this.config.staleTtl,
    }

    await fs.writeJson(entry.metaPath, meta, { spaces: 2 })
    return {
      ...entry,
      meta,
    }
  }

  async writeResponseToCache (url, response, paths) {
    const statusCode = response.status
    const headers = pickHeaders(response.headers)
    const contentType = headers['content-type'] || ''

    if (statusCode < CACHEABLE_STATUS_MIN || statusCode > CACHEABLE_STATUS_MAX) {
      response.data.destroy()
      throw new Error(`upstream responded with non-cacheable status ${statusCode}`)
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
      key: utils.md5(url),
      url,
      statusCode,
      headers,
      size: stat.size,
      createdAt: updatedAt,
      updatedAt,
      expiresAt: updatedAt + this.config.ttl,
      staleExpiresAt: updatedAt + this.config.staleTtl,
    }

    await fs.move(tempPath, paths.cachePath, { overwrite: true })
    await fs.writeJson(paths.metaPath, meta, { spaces: 2 })

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
    const paths = this.getCachePaths(url)
    const response = await this.httpClient(this.createAxiosConfig(url, options, entry))

    if (response.status === 304 && entry && entry.exists) {
      const refreshedEntry = await this.updateMetaFromNotModified(entry)
      return this.createCachedResponse(refreshedEntry, 'REVALIDATED')
    }

    const cachedEntry = await this.writeResponseToCache(url, response, paths)
    return this.createCachedResponse(cachedEntry, 'MISS')
  }

  async fetch (url, options = {}) {
    if (!url) {
      throw new Error('url is required')
    }

    const urlInfo = new URL(url)
    if (!urlInfo.hostname) {
      throw new Error('url hostname is required')
    }

    const normalizedOptions = {
      ...options,
      refresh: normalizeBoolean(options.refresh) || normalizeBoolean(options.noCache),
      cache: options.cache !== false && options.cache !== 'false',
    }

    if (!normalizedOptions.cache) {
      const response = await this.httpClient({
        ...this.createAxiosConfig(url, normalizedOptions),
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

    const entry = await this.getCachedEntry(url)

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
    await fs.ensureDir(this.config.cacheDir)

    let files = 0
    let bytes = 0
    let fresh = 0
    let stale = 0
    let expired = 0
    const providers = {}
    const entries = []

    const walk = async (dir) => {
      const items = await fs.readdir(dir, { withFileTypes: true })
      for (const item of items) {
        const itemPath = path.join(dir, item.name)
        if (item.isDirectory()) {
          await walk(itemPath)
        } else if (!item.name.endsWith(META_SUFFIX)) {
          const stat = await fs.stat(itemPath)
          const meta = await this.readMeta(`${itemPath}${META_SUFFIX}`)
          const relPath = path.relative(this.config.cacheDir, itemPath)
          const provider = relPath.split(path.sep)[0] || 'unknown'
          files += 1
          bytes += stat.size
          providers[provider] = (providers[provider] || 0) + 1

          const state = this.isFresh(meta)
            ? 'fresh'
            : this.isStaleUsable(meta)
                ? 'stale'
                : 'expired'

          if (state === 'fresh') fresh += 1
          if (state === 'stale') stale += 1
          if (state === 'expired') expired += 1

          entries.push({
            key: meta?.key || path.basename(itemPath),
            url: meta?.url || null,
            state,
            size: stat.size,
            updatedAt: meta?.updatedAt || stat.mtimeMs,
            expiresAt: meta?.expiresAt || null,
          })
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
      entries: entries
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 100),
    }
  }

  async clear (targetUrl) {
    if (targetUrl) {
      const paths = this.getCachePaths(targetUrl)
      await Promise.all([
        fs.remove(paths.cachePath),
        fs.remove(paths.metaPath),
      ])

      return {
        removed: 1,
        target: targetUrl,
      }
    }

    await fs.remove(this.config.cacheDir)
    await fs.ensureDir(this.config.cacheDir)

    return {
      removed: 'all',
      target: null,
    }
  }
}

export default FetchRelay
