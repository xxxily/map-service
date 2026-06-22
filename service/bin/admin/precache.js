import crypto from 'node:crypto'
import { buildTileUrl, getTileProvider, listTileProviders } from './tileProviders.js'

const MAX_LAT = 85.05112878
const DEFAULT_TILE_SIZE_ESTIMATE = {
  min: 12 * 1024,
  average: 36 * 1024,
  max: 96 * 1024,
}
const TILE_SIZE_ESTIMATE_BY_CATEGORY = {
  road: {
    min: 8 * 1024,
    average: 28 * 1024,
    max: 72 * 1024,
  },
  satellite: {
    min: 24 * 1024,
    average: 72 * 1024,
    max: 180 * 1024,
  },
}
const DEFAULT_REQUEST_INTERVAL_MS = 0
const MAX_REQUEST_INTERVAL_MS = 60 * 1000
const DEFAULT_MAX_RECORDED_FAILED_TILES = 500
const DEFAULT_MAX_TASK_FAILURES = 100
const DEFAULT_RATE_LIMIT_MAX_RETRIES = 3
const DEFAULT_RATE_LIMIT_RETRY_DELAY_MS = 60 * 1000
const DEFAULT_RATE_LIMIT_RETRY_DELAY_MAX_MS = 10 * 60 * 1000

function createHttpError (message, statusCode = 400) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function clamp (value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function toFiniteNumber (value, name) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) {
    throw createHttpError(`${name} 必须是有效数字`)
  }
  return numberValue
}

function toInteger (value, name) {
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue)) {
    throw createHttpError(`${name} 必须是整数`)
  }
  return numberValue
}

async function sleep (ms, shouldStop = null) {
  if (ms <= 0) return true
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (shouldStop?.()) return false
    await new Promise(resolve => setTimeout(resolve, Math.min(250, deadline - Date.now())))
  }
  return !shouldStop?.()
}

function tileKey (tile) {
  return `${tile.z}/${tile.x}/${tile.y}`
}

function isRateLimitError (err) {
  const statusCode = Number(err?.statusCode || err?.status || err?.response?.status)
  return statusCode === 429
}

function getErrorStatusCode (err) {
  const statusCode = Number(err?.statusCode || err?.status || err?.response?.status)
  return Number.isInteger(statusCode) ? statusCode : null
}

function normalizeFailedTiles (failedTiles) {
  if (!failedTiles || typeof failedTiles !== 'object') return {}
  if (Array.isArray(failedTiles)) {
    return failedTiles.reduce((result, item) => {
      const tile = item?.tile
      if (tile) {
        result[tileKey(tile)] = item
      }
      return result
    }, {})
  }
  return failedTiles
}

function normalizeTaskFailedTiles (task) {
  const failedTiles = normalizeFailedTiles(task.failedTiles)
  if (Object.keys(failedTiles).length || !Array.isArray(task.errors)) {
    return failedTiles
  }

  return task.errors.reduce((result, error) => {
    if (error?.tile) {
      const key = tileKey(error.tile)
      result[key] = {
        tile: error.tile,
        key,
        message: error.message || '未知错误',
        statusCode: getErrorStatusCode(error),
        attempts: 1,
        firstFailedAt: error.timestamp || Date.now(),
        lastFailedAt: error.timestamp || Date.now(),
      }
    }
    return result
  }, {})
}

function countFailedTiles (task) {
  return Object.keys(task.failedTiles || {}).length
}

function normalizeLongitude (value) {
  let next = toFiniteNumber(value, '经度')
  while (next > 180) next -= 360
  while (next < -180) next += 360
  return clamp(next, -180, 180)
}

export function normalizeBounds (input = {}) {
  const west = normalizeLongitude(input.west)
  const east = normalizeLongitude(input.east)
  const south = clamp(toFiniteNumber(input.south, '南纬'), -MAX_LAT, MAX_LAT)
  const north = clamp(toFiniteNumber(input.north, '北纬'), -MAX_LAT, MAX_LAT)

  if (west >= east) {
    throw createHttpError('缓存区域暂不支持跨越 180 度经线，west 必须小于 east')
  }
  if (south >= north) {
    throw createHttpError('south 必须小于 north')
  }

  return { west, south, east, north }
}

function lonToTileX (lon, zoom) {
  const scale = 2 ** zoom
  return clamp(Math.floor(((lon + 180) / 360) * scale), 0, scale - 1)
}

function latToTileY (lat, zoom) {
  const clampedLat = clamp(lat, -MAX_LAT, MAX_LAT)
  const rad = clampedLat * Math.PI / 180
  const scale = 2 ** zoom
  const y = Math.floor((1 - Math.log(Math.tan(rad) + (1 / Math.cos(rad))) / Math.PI) / 2 * scale)
  return clamp(y, 0, scale - 1)
}

export function getTileRange (bounds, zoom) {
  const minX = lonToTileX(bounds.west, zoom)
  const maxX = lonToTileX(bounds.east, zoom)
  const minY = latToTileY(bounds.north, zoom)
  const maxY = latToTileY(bounds.south, zoom)

  return {
    z: zoom,
    minX,
    maxX,
    minY,
    maxY,
    count: (maxX - minX + 1) * (maxY - minY + 1),
  }
}

export function createTilePlan (input = {}, options = {}) {
  const provider = getTileProvider(input.providerId || input.provider)
  if (!provider) {
    throw createHttpError('不支持的瓦片提供方')
  }

  const minZoom = Number(input.minZoom)
  const maxZoom = Number(input.maxZoom)
  if (!Number.isInteger(minZoom) || !Number.isInteger(maxZoom)) {
    throw createHttpError('缩放级别必须是整数')
  }
  if (minZoom > maxZoom) {
    throw createHttpError('minZoom 不能大于 maxZoom')
  }
  if (minZoom < provider.minZoom || maxZoom > provider.maxZoom) {
    throw createHttpError(`缩放级别必须位于 ${provider.minZoom}-${provider.maxZoom}`)
  }

  const bounds = normalizeBounds(input.bounds || input)
  const ranges = []
  let total = 0
  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const range = getTileRange(bounds, zoom)
    total += range.count
    ranges.push(range)
  }

  const maxTiles = Number(options.maxTiles || 5000)
  if (options.enforceMaxTiles !== false && total > maxTiles) {
    throw createHttpError(`预缓存任务包含 ${total} 个瓦片，超过上限 ${maxTiles}`)
  }

  return {
    providerId: provider.id,
    bounds,
    minZoom,
    maxZoom,
    ranges,
    total,
  }
}

function * iterateTiles (plan, startIndex = 0) {
  const start = Math.max(0, Number(startIndex || 0))
  let index = 0
  for (const range of plan.ranges) {
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        if (index >= start) {
          yield { x, y, z: range.z }
        }
        index += 1
      }
    }
  }
}

export function generateTiles (plan) {
  return Array.from(iterateTiles(plan))
}

async function consumeStream (stream) {
  let bytes = 0
  for await (const chunk of stream) {
    if (typeof chunk === 'string') {
      bytes += Buffer.byteLength(chunk)
    } else if (chunk?.byteLength) {
      bytes += chunk.byteLength
    } else {
      bytes += Buffer.byteLength(String(chunk))
    }
  }
  return bytes
}

function getTileSizeEstimate (provider) {
  return TILE_SIZE_ESTIMATE_BY_CATEGORY[provider.category] || DEFAULT_TILE_SIZE_ESTIMATE
}

function withoutRuntimeFlags (task) {
  const {
    pauseRequested,
    deleteRequested,
    ...snapshot
  } = task
  return snapshot
}

export class PrecacheManager {
  constructor (options = {}) {
    this.store = options.store
    this.fetchTile = options.fetchTile
    this.maxTiles = Number(options.maxTiles || 5000)
    this.defaultConcurrency = Number(options.defaultConcurrency || 4)
    this.maxConcurrency = Number(options.maxConcurrency || 8)
    this.defaultRequestIntervalMs = Number(options.defaultRequestIntervalMs || DEFAULT_REQUEST_INTERVAL_MS)
    this.maxRequestIntervalMs = Number(options.maxRequestIntervalMs || MAX_REQUEST_INTERVAL_MS)
    this.maxRecordedFailedTiles = Number(options.maxRecordedFailedTiles || DEFAULT_MAX_RECORDED_FAILED_TILES)
    this.maxTaskFailures = Number(options.maxTaskFailures || DEFAULT_MAX_TASK_FAILURES)
    this.rateLimitMaxRetries = Number(options.rateLimitMaxRetries || DEFAULT_RATE_LIMIT_MAX_RETRIES)
    this.rateLimitRetryDelayMs = Number(options.rateLimitRetryDelayMs || DEFAULT_RATE_LIMIT_RETRY_DELAY_MS)
    this.rateLimitRetryDelayMaxMs = Number(options.rateLimitRetryDelayMaxMs || DEFAULT_RATE_LIMIT_RETRY_DELAY_MAX_MS)
    this.nextRequestAt = 0
    this.tasks = []
    this.queue = Promise.resolve()
    this.ready = this.load()
  }

  async load () {
    const savedTasks = await this.store.read('precache-tasks', [])
    const now = Date.now()
    this.tasks = (Array.isArray(savedTasks) ? savedTasks : []).map((task) => {
      const normalizedTask = {
        ...task,
        bytes: Number(task.bytes || 0),
        failedTiles: normalizeTaskFailedTiles(task),
        requestIntervalMs: Number(task.requestIntervalMs || 0),
        rateLimitRetries: Number(task.rateLimitRetries || 0),
        rateLimitResumeAt: Number(task.rateLimitResumeAt || 0),
        maxTaskFailures: Number(task.maxTaskFailures || this.maxTaskFailures),
        pauseRequested: false,
        deleteRequested: false,
      }

      if (['queued', 'running', 'pausing', 'deleting'].includes(task.status)) {
        return {
          ...normalizedTask,
          status: 'interrupted',
          updatedAt: now,
          finishedAt: now,
          errors: [
            ...(task.errors || []),
            {
              message: '服务重启导致任务中断',
              timestamp: now,
            },
          ].slice(-20),
        }
      }
      return normalizedTask
    })
    await this.persist()
  }

  async persist () {
    this.tasks = this.tasks
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
    await this.store.write('precache-tasks', this.tasks
      .filter(task => !task.deleteRequested)
      .map(withoutRuntimeFlags))
  }

  async listTasks () {
    await this.ready
    return this.tasks
      .filter(task => !task.deleteRequested)
      .map(withoutRuntimeFlags)
  }

  getProviders () {
    return listTileProviders()
  }

  async estimateTask (input = {}) {
    await this.ready
    return estimateTilePlan(input, { maxTiles: this.maxTiles })
  }

  async createTask (input = {}) {
    await this.ready
    const plan = createTilePlan(input, {
      maxTiles: this.maxTiles,
      enforceMaxTiles: false,
    })
    const estimate = estimateTilePlan(input, { maxTiles: this.maxTiles })
    const requestedConcurrency = toInteger(input.concurrency || this.defaultConcurrency, '并发数')
    const concurrency = clamp(
      requestedConcurrency,
      1,
      this.maxConcurrency
    )
    const requestedRequestIntervalMs = toInteger(input.requestIntervalMs ?? this.defaultRequestIntervalMs, '请求间隔')
    const requestIntervalMs = clamp(
      requestedRequestIntervalMs,
      0,
      this.maxRequestIntervalMs
    )
    const now = Date.now()
    const task = {
      id: crypto.randomUUID(),
      status: 'queued',
      providerId: plan.providerId,
      bounds: plan.bounds,
      minZoom: plan.minZoom,
      maxZoom: plan.maxZoom,
      ranges: plan.ranges,
      total: plan.total,
      estimatedBytes: estimate.estimatedBytes,
      estimatedBytesRange: estimate.estimatedBytesRange,
      bytes: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      failedTiles: {},
      refresh: Boolean(input.refresh),
      concurrency,
      requestIntervalMs,
      maxTaskFailures: this.maxTaskFailures,
      rateLimitRetries: 0,
      rateLimitResumeAt: 0,
      errors: [],
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    }

    this.tasks.unshift(task)
    await this.persist()
    this.enqueue(task.id)
    return withoutRuntimeFlags(task)
  }

  findTask (taskId) {
    const task = this.tasks.find(item => item.id === taskId && !item.deleteRequested)
    if (!task) {
      throw createHttpError('预缓存任务不存在', 404)
    }
    return task
  }

  async pauseTask (taskId) {
    await this.ready
    const task = this.findTask(taskId)
    const now = Date.now()

    if (task.status === 'queued') {
      task.status = 'paused'
      task.updatedAt = now
      await this.persist()
      return withoutRuntimeFlags(task)
    }

    if (task.status === 'running') {
      task.pauseRequested = true
      task.status = 'pausing'
      task.updatedAt = now
      await this.persist()
      return withoutRuntimeFlags(task)
    }

    if (task.status === 'pausing' || task.status === 'paused') {
      return withoutRuntimeFlags(task)
    }

    throw createHttpError('当前任务状态不支持暂停')
  }

  async resumeTask (taskId) {
    await this.ready
    const task = this.findTask(taskId)
    const now = Date.now()

    if (task.status === 'pausing') {
      throw createHttpError('任务正在暂停，请稍后继续')
    }

    if (!['paused', 'interrupted', 'failed', 'completed_with_errors'].includes(task.status)) {
      throw createHttpError('当前任务状态不支持继续')
    }

    if (task.completed >= task.total && countFailedTiles(task) === 0) {
      task.status = task.failed > 0 ? 'completed_with_errors' : 'completed'
      task.finishedAt = now
      task.updatedAt = now
      await this.persist()
      return withoutRuntimeFlags(task)
    }

    task.status = 'queued'
    task.pauseRequested = false
    task.deleteRequested = false
    task.finishedAt = null
    task.rateLimitRetries = 0
    task.rateLimitResumeAt = 0
    task.updatedAt = now
    await this.persist()
    this.enqueue(task.id)
    return withoutRuntimeFlags(task)
  }

  async deleteTask (taskId) {
    await this.ready
    const task = this.findTask(taskId)
    const previousStatus = task.status
    task.deleteRequested = true
    task.status = 'deleting'
    task.updatedAt = Date.now()
    if (!['running', 'pausing'].includes(previousStatus)) {
      this.tasks = this.tasks.filter(item => item.id !== task.id)
    }
    await this.persist()
    return {
      id: task.id,
      status: 'deleted',
    }
  }

  enqueue (taskId) {
    this.queue = this.queue
      .then(() => this.runTask(taskId))
      .catch((err) => {
        console.error(`[precache] task ${taskId} failed`, err)
      })
  }

  shouldStopTask (task) {
    return task.deleteRequested || task.pauseRequested || task.status === 'pausing'
  }

  createPendingTileQueue (task) {
    const cursor = clamp(Number(task.completed || 0), 0, Number(task.total || 0))
    const failedTiles = Object.values(task.failedTiles || {})
      .map(item => item.tile)
      .filter(Boolean)
    const failedKeys = new Set(failedTiles.map(tile => tileKey(tile)))

    return {
      failedTiles,
      failedIndex: 0,
      failedKeys,
      remainingTiles: iterateTiles(task, cursor),
    }
  }

  takeNextPendingTile (queue) {
    if (queue.failedIndex < queue.failedTiles.length) {
      const tile = queue.failedTiles[queue.failedIndex]
      queue.failedIndex += 1
      return { tile, isRetry: true }
    }

    while (true) {
      const next = queue.remainingTiles.next()
      if (next.done) return null
      if (!queue.failedKeys.has(tileKey(next.value))) {
        return { tile: next.value, isRetry: false }
      }
    }
  }

  async waitForRateLimitBackoff (task) {
    const waitMs = Math.max(0, Number(task.rateLimitResumeAt || 0) - Date.now())
    if (waitMs <= 0) return true
    return sleep(waitMs, () => this.shouldStopTask(task))
  }

  async waitForRequestSlot (task) {
    const intervalMs = Number(task.requestIntervalMs || 0)
    if (intervalMs <= 0) return true

    const currentTime = Date.now()
    const waitMs = Math.max(0, this.nextRequestAt - currentTime)
    this.nextRequestAt = Math.max(currentTime, this.nextRequestAt) + intervalMs
    const canContinue = await sleep(waitMs, () => this.shouldStopTask(task))
    if (!canContinue) {
      this.nextRequestAt = Math.min(this.nextRequestAt, Date.now())
    }
    return canContinue
  }

  recordTileSuccess (task, tile, bytes) {
    const key = tileKey(tile)
    if (task.failedTiles?.[key]) {
      delete task.failedTiles[key]
    }
    task.bytes += bytes
    task.succeeded = Math.min(Number(task.succeeded || 0) + 1, Number(task.total || 0))
    task.failed = countFailedTiles(task)
    if (!task.rateLimitResumeAt || Date.now() >= Number(task.rateLimitResumeAt || 0)) {
      task.rateLimitRetries = 0
      task.rateLimitResumeAt = 0
    }
  }

  recordTileFailure (task, tile, err) {
    const key = tileKey(tile)
    const now = Date.now()
    const previous = task.failedTiles?.[key]
    const statusCode = getErrorStatusCode(err)
    task.failedTiles[key] = {
      tile,
      key,
      message: err.message,
      statusCode,
      attempts: Number(previous?.attempts || 0) + 1,
      firstFailedAt: previous?.firstFailedAt || now,
      lastFailedAt: now,
    }
    task.failed = countFailedTiles(task)
    task.errors.push({
      tile,
      message: err.message,
      statusCode,
      timestamp: now,
    })
    task.errors = task.errors.slice(-20)

    const entries = Object.entries(task.failedTiles)
    if (entries.length > this.maxRecordedFailedTiles) {
      entries
        .sort(([, a], [, b]) => Number(a.lastFailedAt || 0) - Number(b.lastFailedAt || 0))
        .slice(0, entries.length - this.maxRecordedFailedTiles)
        .forEach(([oldKey]) => {
          delete task.failedTiles[oldKey]
        })
      task.failed = countFailedTiles(task)
    }
  }

  async handleRateLimitFailure (task, err) {
    task.rateLimitRetries = Number(task.rateLimitRetries || 0) + 1
    if (task.rateLimitRetries > this.rateLimitMaxRetries) {
      task.pauseRequested = true
      task.status = 'pausing'
      task.errors.push({
        message: '上游返回 429 过多，任务已暂停，等待手动继续',
        statusCode: 429,
        timestamp: Date.now(),
      })
      task.errors = task.errors.slice(-20)
      return false
    }

    const delayMs = Math.min(
      this.rateLimitRetryDelayMaxMs,
      this.rateLimitRetryDelayMs * (2 ** (task.rateLimitRetries - 1))
    )
    task.rateLimitResumeAt = Math.max(Number(task.rateLimitResumeAt || 0), Date.now() + delayMs)
    task.updatedAt = Date.now()
    await this.persist()
    return this.waitForRateLimitBackoff(task)
  }

  async runTask (taskId) {
    const task = this.tasks.find(item => item.id === taskId)
    if (!task || task.status !== 'queued') {
      return
    }

    const provider = getTileProvider(task.providerId)
    if (!provider) {
      task.status = 'failed'
      task.errors.push({ message: '瓦片提供方不存在', timestamp: Date.now() })
      await this.persist()
      return
    }

    task.failedTiles = normalizeFailedTiles(task.failedTiles)
    const pendingTileQueue = this.createPendingTileQueue(task)
    const now = Date.now()
    task.status = 'running'
    task.startedAt = task.startedAt || now
    task.finishedAt = null
    task.updatedAt = now
    await this.persist()

    const worker = async () => {
      while (true) {
        if (task.deleteRequested || task.pauseRequested || task.status === 'pausing') {
          return
        }

        const pendingTile = this.takeNextPendingTile(pendingTileQueue)
        if (!pendingTile) {
          return
        }
        const tile = pendingTile.tile
        const url = buildTileUrl(provider, tile)

        let completedAttempt = false
        let retryCurrentTile = false
        do {
          retryCurrentTile = false
          if (this.shouldStopTask(task)) {
            return
          }

          try {
            if (!await this.waitForRateLimitBackoff(task)) {
              return
            }
            if (!await this.waitForRequestSlot(task)) {
              return
            }
            const result = await this.fetchTile(url, {
              providerId: task.providerId,
              refresh: task.refresh,
              cache: true,
            })
            this.recordTileSuccess(task, tile, await consumeStream(result.stream))
            completedAttempt = true
          } catch (err) {
            this.recordTileFailure(task, tile, err)
            completedAttempt = true
            if (task.failed >= Number(task.maxTaskFailures || this.maxTaskFailures)) {
              task.pauseRequested = true
              task.status = 'pausing'
              task.errors.push({
                message: `失败瓦片达到 ${task.failed} 个，任务已暂停，等待手动继续`,
                timestamp: Date.now(),
              })
              task.errors = task.errors.slice(-20)
            } else if (isRateLimitError(err)) {
              retryCurrentTile = await this.handleRateLimitFailure(task, err)
            }
          }
        } while (retryCurrentTile)

        try {
          if (completedAttempt && !pendingTile.isRetry && task.completed < task.total) {
            task.completed += 1
          }
        } finally {
          task.updatedAt = Date.now()
          if (task.completed % 10 === 0 || task.completed === task.total) {
            await this.persist()
          }
        }
      }
    }

    await Promise.all(Array.from({ length: task.concurrency }, () => worker()))

    if (task.deleteRequested) {
      this.tasks = this.tasks.filter(item => item.id !== task.id)
      await this.persist()
      return
    }

    if (task.pauseRequested || task.status === 'pausing') {
      task.status = 'paused'
      task.pauseRequested = false
      task.finishedAt = null
      task.failed = countFailedTiles(task)
      task.updatedAt = Date.now()
      await this.persist()
      return
    }

    task.failed = countFailedTiles(task)
    task.status = task.failed > 0 ? 'completed_with_errors' : 'completed'
    task.finishedAt = Date.now()
    task.updatedAt = task.finishedAt
    await this.persist()
  }
}

export function estimateTilePlan (input = {}, options = {}) {
  const provider = getTileProvider(input.providerId || input.provider)
  if (!provider) {
    throw createHttpError('不支持的瓦片提供方')
  }

  const plan = createTilePlan(input, {
    ...options,
    enforceMaxTiles: false,
  })
  const tileSizeEstimate = getTileSizeEstimate(provider)
  const maxTiles = Number(options.maxTiles || 5000)

  return {
    ...plan,
    maxTiles,
    withinLimit: plan.total <= maxTiles,
    tileSizeEstimate,
    estimatedBytes: plan.total * tileSizeEstimate.average,
    estimatedBytesRange: {
      min: plan.total * tileSizeEstimate.min,
      max: plan.total * tileSizeEstimate.max,
    },
  }
}

export default PrecacheManager
