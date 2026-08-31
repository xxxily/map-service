import {
  expandKmlViewportForFiles,
  isKmlBoundsReady,
  kmlBoundsCenter,
  kmlBoundsIntersectsViewport,
  normalizeKmlBounds,
  wrappedLongitudeDistance,
} from '../../shared/kml-spatial.js'

export const KML_FILE_VIEWPORT_DEFAULTS = Object.freeze({
  concurrency: 3,
  maxConcurrency: 6,
  delayMs: 40,
  retryDelayMs: 900,
  maxRetries: 1,
  bufferRatio: 1.8,
  loadAllZoom: 4,
})

function fileId (file) {
  return String(file?.id || file?.shareItemId || '')
}

function isEnabled (file) {
  return Boolean(file && file.enabled !== false && file.status !== 'trashed')
}

function viewportBounds (viewport) {
  if (!viewport || typeof viewport !== 'object') return null
  const candidate = viewport.viewportBounds && typeof viewport.viewportBounds === 'object'
    ? viewport.viewportBounds
    : viewport
  const values = ['south', 'west', 'north', 'east'].map(key => Number(candidate[key]))
  if (!values.every(Number.isFinite) || values[0] > values[2]) return null
  const crossesAntimeridian = candidate.crossesAntimeridian === true || values[1] > values[3]
  const width = crossesAntimeridian ? values[3] + 360 - values[1] : values[3] - values[1]
  if (width < 0 || width > 360 + 1e-7) return null
  return {
    south: values[0],
    west: values[1],
    north: values[2],
    east: values[3],
    crossesAntimeridian,
  }
}

function viewportCenter (viewport) {
  const bounds = viewportBounds(viewport)
  if (Number.isFinite(Number(viewport?.center?.lat)) && Number.isFinite(Number(viewport?.center?.lng))) {
    return { lat: Number(viewport.center.lat), lng: Number(viewport.center.lng) }
  }
  if (!bounds) return null
  const { south, north, west, east, crossesAntimeridian } = bounds
  const width = crossesAntimeridian ? east + 360 - west : east - west
  return {
    lat: (south + north) / 2,
    lng: ((west + width / 2 + 540) % 360) - 180,
  }
}

function candidateDistance (file, center) {
  const bounds = normalizeKmlBounds(file?.bounds, { featureCount: file?.featureCount })
  const point = kmlBoundsCenter(bounds)
  if (!point || !center) return Number.POSITIVE_INFINITY
  const latDistance = Math.abs(point.lat - center.lat)
  const lngDistance = wrappedLongitudeDistance(point.lng, center.lng)
  return Math.hypot(latDistance, lngDistance * Math.max(0.2, Math.cos(center.lat * Math.PI / 180)))
}

/**
 * Return the files which should be considered by the detail loader, ordered
 * from the most useful file to the least useful one.
 */
export function rankKmlFilesForViewport (files, viewport, options = {}) {
  const config = { ...KML_FILE_VIEWPORT_DEFAULTS, ...options }
  const priorityIds = new Set((options.priorityIds || []).map(value => String(value || '')).filter(Boolean))
  const boundsViewport = viewportBounds(viewport)
  const expanded = expandKmlViewportForFiles(boundsViewport, config.bufferRatio)
  const center = viewportCenter(viewport)
  const zoom = Number(viewport?.zoom)
  const loadAll = !boundsViewport || !Number.isFinite(zoom) || zoom <= Number(config.loadAllZoom)

  return (Array.isArray(files) ? files : [])
    .map(file => {
      const id = fileId(file)
      if (!id || !isEnabled(file) || file.contentLoaded !== false) return null
      const bounds = normalizeKmlBounds(file.bounds, { featureCount: file.featureCount })
      const hasBounds = isKmlBoundsReady(bounds)
      const inside = hasBounds && Boolean(boundsViewport && kmlBoundsIntersectsViewport(bounds, boundsViewport))
      const inBuffer = hasBounds && Boolean(expanded && kmlBoundsIntersectsViewport(bounds, expanded))
      const explicit = priorityIds.has(id)
      const fallback = !hasBounds || !boundsViewport
      const candidate = explicit || loadAll || fallback || inBuffer
      if (!candidate) return null
      const priority = explicit
        ? 0
        : inside
          ? 1
          : inBuffer
            ? 2
            : fallback
              ? 3
              : 4
      return {
        file,
        id,
        priority,
        distance: candidateDistance(file, center),
        inside,
        inBuffer,
        hasBounds,
        explicit,
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.priority - right.priority ||
      left.distance - right.distance ||
      Number(left.file.position || 0) - Number(right.file.position || 0) ||
      left.id.localeCompare(right.id))
}

export function shouldRenderKmlFileInViewport (file, viewport, options = {}) {
  if (!isEnabled(file)) return false
  const bounds = normalizeKmlBounds(file?.bounds, { featureCount: file?.featureCount })
  if (!isKmlBoundsReady(bounds) || !viewport) return true
  const zoom = Number(viewport.zoom)
  if (Number.isFinite(zoom) && zoom <= Number(options.loadAllZoom ?? KML_FILE_VIEWPORT_DEFAULTS.loadAllZoom)) return true
  const expanded = expandKmlViewportForFiles(viewport, options.bufferRatio ?? KML_FILE_VIEWPORT_DEFAULTS.bufferRatio)
  // Invalid or temporarily unavailable viewport data must take the
  // compatibility path rather than hiding a valid file for one frame.
  if (!expanded) return true
  return kmlBoundsIntersectsViewport(bounds, expanded)
}

function deferred () {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * A small, map-instance-scoped scheduler. It deliberately does not abort an
 * already started fetch: the result can still warm the file cache, while the
 * generation guard prevents stale map instances from rendering it.
 */
export function createKmlFileViewportScheduler (options = {}) {
  const config = {
    ...KML_FILE_VIEWPORT_DEFAULTS,
    ...options,
    concurrency: Math.max(1, Math.min(
      Number(options.maxConcurrency || KML_FILE_VIEWPORT_DEFAULTS.maxConcurrency),
      Math.floor(Number(options.concurrency || KML_FILE_VIEWPORT_DEFAULTS.concurrency) || KML_FILE_VIEWPORT_DEFAULTS.concurrency),
    )),
  }
  const getFiles = options.getFiles instanceof Function ? options.getFiles : () => []
  const loadFile = options.loadFile instanceof Function ? options.loadFile : async () => false
  const onLoaded = options.onLoaded instanceof Function ? options.onLoaded : () => {}
  const onError = options.onError instanceof Function ? options.onError : () => {}
  const setTimeoutFn = options.setTimeoutFn instanceof Function ? options.setTimeoutFn : globalThis.setTimeout
  const clearTimeoutFn = options.clearTimeoutFn instanceof Function ? options.clearTimeoutFn : globalThis.clearTimeout
  const now = options.nowFn instanceof Function ? options.nowFn : () => Date.now()

  let generation = 0
  let disposed = false
  let queue = []
  let active = 0
  let timer = null
  let nextStartAt = 0
  let currentViewport = null
  const queued = new Map()
  const inFlight = new Map()
  const waiters = new Map()
  const attempts = new Map()
  const metrics = {
    queued: 0,
    active: 0,
    completed: 0,
    failed: 0,
    retried: 0,
    lastGeneration: 0,
  }

  const clearPumpTimer = () => {
    if (timer !== null) clearTimeoutFn(timer)
    timer = null
  }

  const settleWaiters = (id, value, error = null) => {
    const pending = waiters.get(id) || []
    waiters.delete(id)
    pending.forEach(item => {
      if (error) item.reject(error)
      else item.resolve(value)
    })
  }

  const notify = (callback, ...args) => {
    try {
      callback(...args)
    } catch {
      // Rendering diagnostics must never turn a successful detail load into a
      // failed/retried network task.
    }
  }

  const currentFileForId = id => (Array.isArray(getFiles())
    ? getFiles().find(candidate => fileId(candidate) === String(id || ''))
    : null)

  const isCurrentFile = file => {
    const current = currentFileForId(fileId(file))
    return current === file
  }

  const enqueue = (file, entry = {}) => {
    const id = fileId(file)
    if (!id || disposed || file.contentLoaded !== false) return false
    if (inFlight.has(id)) return false
    const existing = queued.get(id)
    if (existing) {
      if (Number(entry.priority) < Number(existing.priority)) {
        existing.priority = Number(entry.priority)
        existing.distance = Number(entry.distance)
        existing.explicit = Boolean(entry.explicit || existing.explicit)
        existing.generation = Math.max(existing.generation, Number(entry.generation || generation))
        queue.sort(compareQueue)
      }
      return false
    }
    const item = {
      file,
      id,
      priority: Number(entry.priority ?? 4),
      distance: Number(entry.distance ?? Number.POSITIVE_INFINITY),
      explicit: Boolean(entry.explicit),
      generation: Number(entry.generation || generation),
      notBefore: Number(entry.notBefore || 0),
      attempt: Number(entry.attempt || 0),
    }
    queued.set(id, item)
    queue.push(item)
    queue.sort(compareQueue)
    metrics.queued = queue.length
    return true
  }

  const compareQueue = (left, right) => Number(left.priority) - Number(right.priority) ||
    Number(left.distance) - Number(right.distance) ||
    Number(left.notBefore || 0) - Number(right.notBefore || 0) ||
    left.id.localeCompare(right.id)

  const schedulePump = (delay = 0) => {
    if (disposed || timer !== null) return
    timer = setTimeoutFn(() => {
      timer = null
      pump()
    }, Math.max(0, delay))
  }

  const start = item => {
    queued.delete(item.id)
    metrics.queued = queue.length
    active += 1
    metrics.active = active
    const startedAt = now()
    let retryEntry = null
    const task = (async () => {
      try {
        const result = await loadFile(item.file, {
          generation: item.generation,
          explicit: item.explicit,
          attempt: item.attempt,
        })
        if (result) {
          metrics.completed += 1
          attempts.delete(item.id)
          settleWaiters(item.id, true)
          if (!disposed && isCurrentFile(item.file)) {
            notify(onLoaded, item.file, { generation: item.generation, durationMs: now() - startedAt })
          }
          return true
        }
        throw new Error(item.file?.loadError || 'KML 文件详情加载失败')
      } catch (error) {
        const attempt = item.attempt + 1
        const previous = attempts.get(item.id) || 0
        attempts.set(item.id, attempt)
        if (!disposed && attempt <= Number(config.maxRetries) && (previous < attempt)) {
          metrics.retried += 1
          retryEntry = {
            ...item,
            attempt,
            notBefore: now() + Number(config.retryDelayMs),
            generation: generation,
          }
        } else if (!disposed) {
          metrics.failed += 1
          settleWaiters(item.id, false)
          notify(onError, item.file, error, { generation: item.generation, durationMs: now() - startedAt })
        }
        return false
      } finally {
        active -= 1
        metrics.active = active
        inFlight.delete(item.id)
        if (retryEntry && !disposed && isCurrentFile(item.file)) enqueue(item.file, retryEntry)
        nextStartAt = Math.max(nextStartAt, now() + Number(config.delayMs))
        pump()
      }
    })()
    inFlight.set(item.id, task)
  }

  function pump () {
    if (disposed) return
    clearPumpTimer()
    while (active < config.concurrency && queue.length) {
      const currentTime = now()
      // Drop stale non-explicit work before selecting the next ready item.
      queue = queue.filter(item => {
        if (item.file?.contentLoaded !== false) {
          queued.delete(item.id)
          settleWaiters(item.id, Boolean(!item.file?.loadError))
          return false
        }
        if (item.generation < generation && !item.explicit) {
          queued.delete(item.id)
          return false
        }
        return true
      })
      if (!queue.length) break
      const ready = queue.filter(item => Number(item.notBefore || 0) <= currentTime).sort(compareQueue)
      if (!ready.length) {
        const nextAt = Math.min(...queue.map(item => Number(item.notBefore || 0)))
        schedulePump(Math.max(0, nextAt - currentTime))
        break
      }
      const item = ready[0]
      const wait = Math.max(0, nextStartAt - now())
      if (wait > 0) {
        schedulePump(wait)
        break
      }
      queue.splice(queue.indexOf(item), 1)
      start(item)
      nextStartAt = now() + Number(config.delayMs)
    }
    metrics.queued = queue.length
  }

  function refresh (viewport, refreshOptions = {}) {
    if (disposed) return { generation, queued: 0, candidates: [] }
    generation += 1
    metrics.lastGeneration = generation
    currentViewport = viewport || null
    const files = Array.isArray(getFiles()) ? getFiles() : []
    const ranked = rankKmlFilesForViewport(files, currentViewport, {
      ...config,
      priorityIds: refreshOptions.priorityIds,
    })
    const explicitQueued = queue.filter(item => item.explicit)
    queue = []
    queued.clear()
    explicitQueued.forEach(item => {
      if (item.file?.contentLoaded !== false) {
        settleWaiters(item.id, Boolean(!item.file?.loadError))
      } else if (files.includes(item.file)) {
        enqueue(item.file, { ...item, generation })
      } else {
        settleWaiters(item.id, false)
      }
    })
    ranked.forEach(item => enqueue(item.file, { ...item, generation }))
    pump()
    return { generation, queued: queue.length, candidates: ranked }
  }

  function request (file, requestOptions = {}) {
    const id = fileId(file)
    if (!id || disposed) return Promise.resolve(false)
    if (file.contentLoaded !== false) return Promise.resolve(!file.loadError)
    // A user-initiated request is an explicit retry after an exhausted
    // automatic attempt. Promote any delayed queue entry and clear its retry
    // bookkeeping so the request cannot remain asleep behind retry delay.
    attempts.delete(id)
    file.loadError = ''
    const existing = queued.get(id)
    if (existing) {
      existing.notBefore = 0
      existing.attempt = 0
      existing.explicit = true
      existing.priority = Math.min(existing.priority, Number(requestOptions.priority ?? 0))
    }
    const waiter = deferred()
    const list = waiters.get(id) || []
    list.push(waiter)
    waiters.set(id, list)
    const accepted = enqueue(file, {
      priority: requestOptions.priority ?? 0,
      distance: 0,
      explicit: true,
      generation,
      attempt: 0,
    })
    if (!accepted && !queued.has(id) && !inFlight.has(id)) {
      settleWaiters(id, Boolean(file.contentLoaded !== false && !file.loadError))
    }
    pump()
    return waiter.promise
  }

  function dispose () {
    if (disposed) return
    disposed = true
    clearPumpTimer()
    queue = []
    queued.clear()
    attempts.clear()
    waiters.forEach(list => list.forEach(item => item.resolve(false)))
    waiters.clear()
  }

  return {
    refresh,
    request,
    dispose,
    getGeneration: () => generation,
    getViewport: () => currentViewport,
    getMetrics: () => ({ ...metrics, queued: queue.length, active }),
    isLoading: id => !disposed && inFlight.has(String(id || '')),
  }
}
