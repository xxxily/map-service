import fs from 'fs-extra'
import path from 'path'
import rootPath from '../rootPath.js'

const ACCESS_LOG_PATTERN = /^(\S+) - (\S+) \[(.+?)] "(\S+) ([^"]*) HTTP\/([^"]*)" (\d{3}) (\S+) "([^"]*)" "([^"]*)"$/
const ACCESS_LOG_FILENAME_PATTERN = /^(?:\d{8}-\d{4}-\d{2}-)?access\.log(?:\.\d+)?$/u
const DEFAULT_STATS_TTL = 30 * 1000
const MAX_STATS_CACHE_ENTRIES = 64

const statsCache = new Map()

function getCachedStats (cacheKey, ttl) {
  const cached = statsCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() - cached.generatedAt >= ttl) {
    statsCache.delete(cacheKey)
    return null
  }
  statsCache.delete(cacheKey)
  statsCache.set(cacheKey, cached)
  return cached.result
}

function setCachedStats (cacheKey, result) {
  if (statsCache.has(cacheKey)) {
    statsCache.delete(cacheKey)
  }
  while (statsCache.size >= MAX_STATS_CACHE_ENTRIES) {
    const oldestKey = statsCache.keys().next().value
    if (oldestKey === undefined) break
    statsCache.delete(oldestKey)
  }
  statsCache.set(cacheKey, {
    generatedAt: result.generatedAt,
    result,
  })
}

function statusGroup (status) {
  const family = Math.floor(Number(status) / 100)
  return `${family}xx`
}

function parseLine (line) {
  const matched = ACCESS_LOG_PATTERN.exec(line)
  if (!matched) {
    return null
  }

  const [, remoteAddress, remoteUser, timestamp, method, url, httpVersion, status, bytes, referrer, userAgent] = matched
  let pathname = url

  try {
    pathname = new URL(url, 'http://map-service.local').pathname
  } catch (err) {
    pathname = url.split('?')[0] || url
  }

  return {
    remoteAddress,
    remoteUser,
    timestamp,
    method,
    url,
    path: pathname,
    httpVersion,
    status: Number(status),
    bytes: bytes === '-' ? 0 : Number(bytes),
    referrer,
    userAgent,
  }
}

async function getAccessLogFiles (logDir) {
  if (!await fs.pathExists(logDir)) {
    return []
  }

  const items = await fs.readdir(logDir)
  const files = []
  for (const item of items) {
    if (!ACCESS_LOG_FILENAME_PATTERN.test(item)) {
      continue
    }

    const filePath = path.join(logDir, item)
    const stat = await fs.stat(filePath)
    if (stat.isFile()) {
      files.push({
        filePath,
        mtimeMs: stat.mtimeMs,
      })
    }
  }

  return files.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

export async function getVisitStats (options = {}) {
  const logDir = options.logDir || path.join(rootPath, './log/visitRecorder')
  const maxLines = Number(options.maxLines || 2000)
  const ttl = Number(options.ttl || DEFAULT_STATS_TTL)
  const cacheKey = `${logDir}:${maxLines}`
  const cachedResult = getCachedStats(cacheKey, ttl)
  if (cachedResult) {
    return cachedResult
  }

  const files = await getAccessLogFiles(logDir)
  const lines = []

  for (const file of files.slice(0, 5)) {
    const content = await fs.readFile(file.filePath, 'utf8')
    const fileLines = content.split(/\r?\n/).filter(Boolean)
    lines.unshift(...fileLines)
    if (lines.length >= maxLines) {
      break
    }
  }

  const selectedLines = lines.slice(-maxLines)
  const records = selectedLines
    .map(parseLine)
    .filter(Boolean)

  const statusCodes = {}
  const statusGroups = {}
  const paths = {}

  records.forEach((record) => {
    const statusKey = String(record.status)
    const groupKey = statusGroup(record.status)
    statusCodes[statusKey] = (statusCodes[statusKey] || 0) + 1
    statusGroups[groupKey] = (statusGroups[groupKey] || 0) + 1
    paths[record.path] = (paths[record.path] || 0) + 1
  })

  const topPaths = Object.entries(paths)
    .map(([requestPath, count]) => ({ path: requestPath, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  const result = {
    logDir,
    total: records.length,
    scannedLines: selectedLines.length,
    statusCodes,
    statusGroups,
    topPaths,
    recentRequests: records.slice(-50).reverse(),
    generatedAt: Date.now(),
  }
  setCachedStats(cacheKey, result)
  return result
}

export default getVisitStats
