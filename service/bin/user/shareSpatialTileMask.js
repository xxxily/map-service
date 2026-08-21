import crypto from 'node:crypto'
import sharp from 'sharp'

const MAX_INPUT_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_EDGE = 1024
const DEFAULT_CACHE_BYTES = 24 * 1024 * 1024
const DEFAULT_MAX_CONCURRENCY = 2
const DEFAULT_MAX_QUEUE = 24
const EPSILON = 1e-7
const EARTH_RADIUS_METERS = 6371008.8
const DEG_TO_RAD = Math.PI / 180

sharp.cache({ memory: 16, files: 0, items: 32 })
sharp.concurrency(1)

function clamp (value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function unwrapLongitude (longitude, center) {
  let value = ((Number(longitude) % 360) + 360) % 360
  while (value - center > 180 + EPSILON) value -= 360
  while (center - value > 180 + EPSILON) value += 360
  return value
}

function tileLongitude (x, zoom) {
  return x / (2 ** zoom) * 360 - 180
}

function tileLatitude (y, zoom) {
  const mercator = Math.PI * (1 - 2 * y / (2 ** zoom))
  return Math.atan(Math.sinh(mercator)) / DEG_TO_RAD
}

function projectCoordinate (coordinate, projection) {
  const longitude = unwrapLongitude(coordinate[0], projection.centerLongitude)
  return [
    EARTH_RADIUS_METERS * (longitude - projection.centerLongitude) * DEG_TO_RAD * projection.cosLatitude,
    EARTH_RADIUS_METERS * (coordinate[1] - projection.referenceLatitude) * DEG_TO_RAD,
  ]
}

function pointSegmentDistanceSquared (point, start, end) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2
  }
  const ratio = clamp(
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy),
    0,
    1
  )
  const projected = [start[0] + ratio * dx, start[1] + ratio * dy]
  return (point[0] - projected[0]) ** 2 + (point[1] - projected[1]) ** 2
}

function pointInRing (point, ring) {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index]
    const previousPoint = ring[previous]
    const intersects = ((currentPoint[1] > point[1]) !== (previousPoint[1] > point[1])) &&
      (point[0] < (previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1]) /
        ((previousPoint[1] - currentPoint[1]) || EPSILON) + currentPoint[0])
    if (intersects) inside = !inside
  }
  return inside
}

function distanceToRingSquared (point, ring) {
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 1; index < ring.length; index += 1) {
    minimum = Math.min(minimum, pointSegmentDistanceSquared(point, ring[index - 1], ring[index]))
  }
  return minimum
}

function containsPoint (scope, point, insetMeters = 0) {
  const padding = Math.max(0, Number(scope.paddingMeters || 0) - insetMeters)
  const radiusSquared = padding * padding
  for (const center of scope.primitives.points || []) {
    if ((point[0] - center[0]) ** 2 + (point[1] - center[1]) ** 2 <= radiusSquared + EPSILON) return true
  }
  for (const segment of scope.primitives.segments || []) {
    if (pointSegmentDistanceSquared(point, segment[0], segment[1]) <= radiusSquared + EPSILON) return true
  }
  for (const ring of scope.primitives.polygons || []) {
    if (pointInRing(point, ring) || distanceToRingSquared(point, ring) <= radiusSquared + EPSILON) return true
  }
  return false
}

function tilePointProjector (scope, tile, width, height) {
  const scale = 2 ** tile.z
  const westWorld = tile.x / scale
  const northWorld = tile.y / scale
  return (pixelX, pixelY) => {
    const worldX = westWorld + pixelX / width / scale
    const worldY = northWorld + pixelY / height / scale
    const longitude = worldX * 360 - 180
    const mercator = Math.PI * (1 - 2 * worldY)
    const latitude = Math.atan(Math.sinh(mercator)) / DEG_TO_RAD
    return projectCoordinate([longitude, latitude], scope.projection)
  }
}

function boundsIntersect (left, right) {
  return left[0] <= right[2] + EPSILON && left[2] >= right[0] - EPSILON &&
    left[1] <= right[3] + EPSILON && left[3] >= right[1] - EPSILON
}

function primitiveBounds (points, padding) {
  return [
    Math.min(...points.map(point => point[0])) - padding,
    Math.min(...points.map(point => point[1])) - padding,
    Math.max(...points.map(point => point[0])) + padding,
    Math.max(...points.map(point => point[1])) + padding,
  ]
}

function scopeForTile (scope, projectPixel, width, height) {
  const corners = [projectPixel(0, 0), projectPixel(width, 0), projectPixel(width, height), projectPixel(0, height)]
  const tileBounds = primitiveBounds(corners, 0)
  const padding = Number(scope.paddingMeters || 0)
  return {
    ...scope,
    primitives: {
      points: (scope.primitives.points || []).filter(point =>
        boundsIntersect(tileBounds, primitiveBounds([point], padding))
      ),
      segments: (scope.primitives.segments || []).filter(segment =>
        boundsIntersect(tileBounds, primitiveBounds(segment, padding))
      ),
      polygons: (scope.primitives.polygons || []).filter(ring =>
        boundsIntersect(tileBounds, primitiveBounds(ring, padding))
      ),
    },
  }
}

export function buildShareTileAlphaMask (scope, tile, width, height) {
  if (!scope?.projection || !scope?.primitives) throw new Error('分享空间范围不可用')
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
    throw new Error('分享瓦片尺寸不受支持')
  }
  const projectPixel = tilePointProjector(scope, tile, width, height)
  const tileScope = scopeForTile(scope, projectPixel, width, height)
  const northWest = projectPixel(0, 0)
  const southEast = projectPixel(1, 1)
  const pixelInset = Math.hypot(southEast[0] - northWest[0], southEast[1] - northWest[1]) / 2
  const mask = Buffer.alloc(width * height)
  let opaquePixels = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = projectPixel(x + 0.5, y + 0.5)
      if (!containsPoint(tileScope, point, pixelInset)) continue
      mask[y * width + x] = 255
      opaquePixels += 1
    }
  }
  return { mask, opaquePixels, totalPixels: width * height }
}

async function streamToLimitedBuffer (stream, limit = MAX_INPUT_BYTES) {
  const chunks = []
  let size = 0
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > limit) throw new Error('分享瓦片正文过大')
      chunks.push(buffer)
    }
  } catch (error) {
    stream?.destroy?.()
    throw error
  }
  return Buffer.concat(chunks, size)
}

function queueFullError () {
  const error = new Error('分享瓦片遮罩队列已满')
  error.code = 'SHARE_TILE_MASK_QUEUE_FULL'
  return error
}

class ByteLruCache {
  constructor (maxBytes) {
    this.maxBytes = maxBytes
    this.bytes = 0
    this.entries = new Map()
  }

  get (key) {
    const value = this.entries.get(key)
    if (!value) return null
    this.entries.delete(key)
    this.entries.set(key, value)
    return value.buffer
  }

  set (key, buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length > this.maxBytes) return
    const current = this.entries.get(key)
    if (current) {
      this.bytes -= current.buffer.length
      this.entries.delete(key)
    }
    this.entries.set(key, { buffer })
    this.bytes += buffer.length
    while (this.bytes > this.maxBytes && this.entries.size) {
      const oldestKey = this.entries.keys().next().value
      const oldest = this.entries.get(oldestKey)
      this.entries.delete(oldestKey)
      this.bytes -= oldest.buffer.length
    }
  }
}

export class ShareSpatialTileMasker {
  constructor (options = {}) {
    this.maxConcurrency = Math.max(1, Number(options.maxConcurrency) || DEFAULT_MAX_CONCURRENCY)
    this.maxQueue = Math.max(0, Number.isFinite(Number(options.maxQueue))
      ? Number(options.maxQueue)
      : DEFAULT_MAX_QUEUE)
    this.active = 0
    this.waiters = []
    this.cache = new ByteLruCache(Math.max(1024 * 1024, Number(options.cacheBytes) || DEFAULT_CACHE_BYTES))
    this.inflight = new Map()
  }

  async acquire (stream) {
    if (this.active < this.maxConcurrency) {
      this.active += 1
      return
    }
    if (this.waiters.length >= this.maxQueue) {
      stream?.destroy?.()
      throw queueFullError()
    }
    await new Promise(resolve => this.waiters.push(resolve))
  }

  release () {
    const next = this.waiters.shift()
    if (next) {
      next()
      return
    }
    this.active = Math.max(0, this.active - 1)
  }

  cacheKey (scope, sourceId, tile, input) {
    const scopeKey = scope.sourceRevisionHash || JSON.stringify([
      scope.policyRevision, scope.paddingMeters, scope.localBounds, scope.primitives,
    ])
    const inputHash = crypto.createHash('sha256').update(input).digest('base64url').slice(0, 22)
    return `${scopeKey}|${sourceId}|${tile.z}/${tile.x}/${tile.y}|${inputHash}`
  }

  async maskRelayResult (relayResult, options = {}) {
    const stream = relayResult?.stream
    await this.acquire(stream)
    let acquired = true
    try {
      const input = await streamToLimitedBuffer(stream)
      const key = this.cacheKey(options.scope, options.sourceId, options.tile, input)
      const cached = this.cache.get(key)
      if (cached) return cached
      const pending = this.inflight.get(key)
      if (pending) {
        this.release()
        acquired = false
        return await pending
      }
      const work = this.process(input, options)
      this.inflight.set(key, work)
      try {
        const result = await work
        this.cache.set(key, result)
        return result
      } finally {
        if (this.inflight.get(key) === work) this.inflight.delete(key)
      }
    } finally {
      if (acquired) this.release()
    }
  }

  async process (input, options) {
    const metadata = await sharp(input, { limitInputPixels: MAX_IMAGE_EDGE * MAX_IMAGE_EDGE }).metadata()
    const width = Number(metadata.width)
    const height = Number(metadata.height)
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
        width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
      throw new Error('分享瓦片尺寸不受支持')
    }
    const { mask, opaquePixels } = buildShareTileAlphaMask(options.scope, options.tile, width, height)
    if (opaquePixels === 0) return null
    const decoded = await sharp(input, { limitInputPixels: MAX_IMAGE_EDGE * MAX_IMAGE_EDGE })
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    for (let index = 0; index < mask.length; index += 1) {
      const alphaOffset = index * 4 + 3
      decoded.data[alphaOffset] = Math.min(decoded.data[alphaOffset], mask[index])
    }
    return sharp(decoded.data, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 6, adaptiveFiltering: false })
      .toBuffer()
  }
}

export const shareSpatialTileMasker = new ShareSpatialTileMasker()
