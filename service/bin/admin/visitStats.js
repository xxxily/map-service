import fs from 'fs-extra'
import path from 'path'
import rootPath from '../rootPath.js'

const ACCESS_LOG_PATTERN = /^(\S+) - (\S+) \[(.+?)] "(\S+) ([^"]*) HTTP\/([^"]*)" (\d{3}) (\S+) "([^"]*)" "([^"]*)"$/

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
    if (!item.includes('access.log')) {
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
  const files = await getAccessLogFiles(logDir)
  const lines = []

  for (const file of files.slice(0, 5).reverse()) {
    const content = await fs.readFile(file.filePath, 'utf8')
    lines.push(...content.split(/\r?\n/).filter(Boolean))
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

  return {
    logDir,
    total: records.length,
    scannedLines: selectedLines.length,
    statusCodes,
    statusGroups,
    topPaths,
    recentRequests: records.slice(-50).reverse(),
    generatedAt: Date.now(),
  }
}

export default getVisitStats
