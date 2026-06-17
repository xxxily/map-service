import crypto from 'node:crypto'
import { buildTileUrl, getTileProvider, listTileProviders } from './tileProviders.js'

const MAX_LAT = 85.05112878

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
  if (total > maxTiles) {
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

export function generateTiles (plan) {
  const tiles = []
  plan.ranges.forEach((range) => {
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        tiles.push({ x, y, z: range.z })
      }
    }
  })
  return tiles
}

async function consumeStream (stream) {
  for await (const chunk of stream) {
    void chunk
  }
}

export class PrecacheManager {
  constructor (options = {}) {
    this.store = options.store
    this.fetchTile = options.fetchTile
    this.maxTiles = Number(options.maxTiles || 5000)
    this.defaultConcurrency = Number(options.defaultConcurrency || 4)
    this.maxConcurrency = Number(options.maxConcurrency || 8)
    this.tasks = []
    this.queue = Promise.resolve()
    this.ready = this.load()
  }

  async load () {
    const savedTasks = await this.store.read('precache-tasks', [])
    const now = Date.now()
    this.tasks = (Array.isArray(savedTasks) ? savedTasks : []).map((task) => {
      if (['queued', 'running'].includes(task.status)) {
        return {
          ...task,
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
      return task
    })
    await this.persist()
  }

  async persist () {
    this.tasks = this.tasks
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
    await this.store.write('precache-tasks', this.tasks)
  }

  async listTasks () {
    await this.ready
    return this.tasks
  }

  getProviders () {
    return listTileProviders()
  }

  async createTask (input = {}) {
    await this.ready
    const plan = createTilePlan(input, { maxTiles: this.maxTiles })
    const requestedConcurrency = toInteger(input.concurrency || this.defaultConcurrency, '并发数')
    const concurrency = clamp(
      requestedConcurrency,
      1,
      this.maxConcurrency
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
      completed: 0,
      succeeded: 0,
      failed: 0,
      refresh: Boolean(input.refresh),
      concurrency,
      errors: [],
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    }

    this.tasks.unshift(task)
    await this.persist()
    this.enqueue(task.id)
    return task
  }

  enqueue (taskId) {
    this.queue = this.queue
      .then(() => this.runTask(taskId))
      .catch((err) => {
        console.error(`[precache] task ${taskId} failed`, err)
      })
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

    const tiles = generateTiles(task)
    let cursor = 0
    const now = Date.now()
    task.status = 'running'
    task.startedAt = now
    task.updatedAt = now
    await this.persist()

    const worker = async () => {
      while (cursor < tiles.length) {
        const tile = tiles[cursor]
        cursor += 1
        const url = buildTileUrl(provider, tile)

        try {
          const result = await this.fetchTile(url, {
            providerId: task.providerId,
            refresh: task.refresh,
            cache: true,
          })
          await consumeStream(result.stream)
          task.succeeded += 1
        } catch (err) {
          task.failed += 1
          task.errors.push({
            tile,
            message: err.message,
            timestamp: Date.now(),
          })
          task.errors = task.errors.slice(-20)
        } finally {
          task.completed += 1
          task.updatedAt = Date.now()
          if (task.completed % 10 === 0 || task.completed === task.total) {
            await this.persist()
          }
        }
      }
    }

    await Promise.all(Array.from({ length: task.concurrency }, () => worker()))

    task.status = task.failed > 0 ? 'completed_with_errors' : 'completed'
    task.finishedAt = Date.now()
    task.updatedAt = task.finishedAt
    await this.persist()
  }
}

export default PrecacheManager
