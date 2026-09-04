import {
  expandKmlViewportForFiles,
  isKmlCoordinateInsideBounds,
} from '../../shared/kml-spatial.js'
import { wgs84ToGcj02 } from './coord-transform.js'

export const LIVE_TRACK_RENDER_POINT_LIMIT = 120
export const LIVE_TRACK_RENDER_LINE_POINT_LIMIT = 2000
export const MAX_LOCATION_INTERVAL_SECONDS = 60
export const MAX_LOCATION_HISTORY_POINTS = 100_000

// ============================================================================
// 轨迹渲染视口过滤与 LOD 分级
// 详见 docs/requirements/track-rendering-viewport-lod.md
// ============================================================================

/** 视口缓冲系数：渲染范围 = 当前视口 × 3.0，预渲染视口外 1 倍的区域 */
export const VIEWPORT_BUFFER_RATIO = 3.0

/** 硬上限：视口内最多渲染的点数（跨 LOD 绝对天花板） */
export const VIEWPORT_MAX_POINTS = 500

/** 硬上限：视口内每条线最多渲染的顶点数 */
export const VIEWPORT_MAX_LINE_VERTICES = 5000

/**
 * LOD 分级配置表：根据缩放级别决定渲染密度。
 * - maxPoints: 该级别下视口内最多渲染的点标记数
 * - maxLineVertices: 该级别下每条线最多渲染的顶点数
 * - pointInterval: 点抽取间隔（每 N 取 1），Infinity 表示不渲染点
 */
export const TRACK_LOD_CONFIGS = [
  { zoomMin: 0, zoomMax: 7, maxPoints: 0, maxLineVertices: 300, pointInterval: Infinity },
  { zoomMin: 8, zoomMax: 12, maxPoints: 80, maxLineVertices: 1000, pointInterval: 5 },
  { zoomMin: 13, zoomMax: 15, maxPoints: 200, maxLineVertices: 3000, pointInterval: 2 },
  { zoomMin: 16, zoomMax: 99, maxPoints: 500, maxLineVertices: 5000, pointInterval: 1 },
]

/** 3D 相机高度换算缩放级别的基准高度（与 startIntervalLocation3d 一致） */
const CAMERA_HEIGHT_BASE = 20_000_000
const trackDisplayCoordinatesCache = new WeakMap()

function finiteNumber (value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function shouldCorrectTrackCoordinates (kmlFile) {
  return kmlFile?.coordCorrection !== 'none'
}

function isCoordinatePair (value) {
  return Array.isArray(value) && value.length >= 2 &&
    !Array.isArray(value[0]) && !Array.isArray(value[1])
}

function cameraViewportBounds (viewer, bufferRatio = VIEWPORT_BUFFER_RATIO) {
  const carto = viewer?.camera?.positionCartographic
  if (!carto) return null
  const heightMeters = finiteNumber(carto.height)
  const camLat = finiteNumber(Number(carto.latitude) * 180 / Math.PI)
  const camLng = finiteNumber(Number(carto.longitude) * 180 / Math.PI)
  if (heightMeters === null || heightMeters <= 0 || camLat === null || camLng === null) return null

  const safeRatio = Math.max(1, Number(bufferRatio) || VIEWPORT_BUFFER_RATIO)
  const latRange = Math.min(90, (heightMeters / 111000) * 1.5 * safeRatio)
  const lngRange = Math.min(180, latRange / Math.max(0.1, Math.cos(camLat * Math.PI / 180)))
  const south = Math.max(-90, camLat - latRange)
  const north = Math.min(90, camLat + latRange)
  if (lngRange >= 180 - 1e-7) {
    return { south, west: -180, north, east: 180, crossesAntimeridian: false }
  }

  const westRaw = camLng - lngRange
  const eastRaw = camLng + lngRange
  const west = ((westRaw + 180) % 360 + 360) % 360 - 180
  const east = ((eastRaw + 180) % 360 + 360) % 360 - 180
  return {
    south,
    west,
    north,
    east,
    crossesAntimeridian: westRaw < -180 || eastRaw > 180 || west > east,
  }
}

/**
 * Return one track coordinate in the same coordinate space as the map view.
 * Track data is persisted as WGS84 while KML layers normally render GCJ-02.
 * Invalid or malformed data is returned as null so viewport filtering can
 * reject only that feature without making the entire render fail.
 */
function getTrackDisplayCoordinate (kmlFile, coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null
  const lng = finiteNumber(coordinate[0])
  const lat = finiteNumber(coordinate[1])
  if (lng === null || lat === null) return null
  const source = [lng, lat]
  if (!shouldCorrectTrackCoordinates(kmlFile)) return source
  const transformed = wgs84ToGcj02(source)
  const displayLng = finiteNumber(transformed?.[0])
  const displayLat = finiteNumber(transformed?.[1])
  return displayLng === null || displayLat === null ? source : [displayLng, displayLat]
}

function mapTrackDisplayCoordinates (kmlFile, value) {
  if (!Array.isArray(value)) return value
  if (isCoordinatePair(value)) return getTrackDisplayCoordinate(kmlFile, value)
  return value.map(item => mapTrackDisplayCoordinates(kmlFile, item))
}

function coordinateEdgeSignature (value) {
  if (!Array.isArray(value)) return String(value)
  if (isCoordinatePair(value)) return `${value.length}:${String(value[0])},${String(value[1])}`
  if (!value.length) return '0:'
  return `${value.length}:${coordinateEdgeSignature(value[0])}|${coordinateEdgeSignature(value[value.length - 1])}`
}

function filterLineByPredicate (coordinates, predicate) {
  if (!Array.isArray(coordinates) || coordinates.length <= 2 || typeof predicate !== 'function') {
    return { coordinates: coordinates || [], indices: null }
  }
  const visible = coordinates.map(predicate)
  const indices = new Set()
  for (let index = 0; index < visible.length; index += 1) {
    if (visible[index] || visible[index - 1] || visible[index + 1]) indices.add(index)
  }
  if (indices.size < 2) return { coordinates, indices: null }
  return {
    coordinates: coordinates.filter((_, index) => indices.has(index)),
    indices,
  }
}

function getTrackDisplayCoordinates (kmlFile, feature) {
  const coordinates = feature?.coordinates
  if (!Array.isArray(coordinates) || !shouldCorrectTrackCoordinates(kmlFile)) return coordinates
  const cached = feature && typeof feature === 'object'
    ? trackDisplayCoordinatesCache.get(feature)
    : null
  const corrected = kmlFile?.coordCorrection !== 'none'
  const sourceLength = coordinates.length
  const sourceFirst = coordinateEdgeSignature(coordinates[0])
  const sourceLast = coordinateEdgeSignature(coordinates[sourceLength - 1])
  const sourceRevision = feature?.coordinatesRevision ?? feature?.revision ?? null
  if (cached?.source === coordinates && cached.corrected === corrected &&
      cached.sourceLength === sourceLength && cached.sourceFirst === sourceFirst &&
      cached.sourceLast === sourceLast && cached.sourceRevision === sourceRevision) {
    return cached.value
  }

  const value = mapTrackDisplayCoordinates(kmlFile, coordinates)
  if (feature && typeof feature === 'object') {
    trackDisplayCoordinatesCache.set(feature, {
      source: coordinates,
      corrected,
      sourceLength,
      sourceFirst,
      sourceLast,
      sourceRevision,
      value,
    })
  }
  return value
}

function filterTrackLineCoordinates (kmlFile, feature, viewportBounds, viewer3d) {
  const coordinates = feature?.coordinates
  if (!Array.isArray(coordinates)) return coordinates || []

  if (!shouldCorrectTrackCoordinates(kmlFile)) {
    return viewer3d
      ? filterLineInViewport3d(coordinates, viewer3d)
      : filterLineInViewport2d(coordinates, viewportBounds)
  }

  const displayCoordinates = getTrackDisplayCoordinates(kmlFile, feature)
  if (!Array.isArray(displayCoordinates)) return coordinates
  const displayBounds = viewer3d
    ? cameraViewportBounds(viewer3d)
    : expandKmlViewportForFiles(viewportBounds, VIEWPORT_BUFFER_RATIO)
  if (!displayBounds) return coordinates

  const filtered = filterLineByPredicate(
    displayCoordinates,
    coordinate => isKmlCoordinateInsideBounds(coordinate, displayBounds),
  )
  if (!filtered.indices) return coordinates

  // Preserve the original WGS84 vertices in the feature so the renderer
  // performs the correction exactly once when it creates the geometry.
  return coordinates.filter((_, index) => filtered.indices.has(index))
}

export function parseBoundedInteger (value, { min, max }) {
  if (typeof value === 'string' && !/^-?\d+$/.test(value.trim())) return null
  const number = Number(value)
  return Number.isInteger(number) && number >= min && number <= max ? number : null
}

export function readLocationSetting (key, fallbackValue, getStorage = () => globalThis.localStorage) {
  try {
    const value = getStorage()?.getItem?.(key)
    return value === null || value === undefined ? fallbackValue : value
  } catch (err) {
    return fallbackValue
  }
}

export function readBoundedIntegerSetting (
  key,
  fallbackValue,
  { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {},
  getStorage = () => globalThis.localStorage,
) {
  const value = Number(readLocationSetting(key, String(fallbackValue), getStorage))
  return Number.isInteger(value) && value >= min && value <= max ? value : fallbackValue
}

export function normalizeHistoryPointLimit (value) {
  const number = finiteNumber(value)
  return number === null ? 0 : Math.max(0, Math.floor(number))
}

export function safeStorageGet (storage, key, fallback = null) {
  try {
    return storage?.getItem?.(key) ?? fallback
  } catch (err) {
    return fallback
  }
}

export function trimTrackPointHistory (points, maxHistoryPoints) {
  if (!Array.isArray(points)) return false
  const limit = normalizeHistoryPointLimit(maxHistoryPoints)
  if (limit === 0 || points.length <= limit) return false
  points.splice(0, points.length - limit)
  return true
}

function cloneLatLng (latlng) {
  if (Array.isArray(latlng)) return [...latlng]
  if (latlng && typeof latlng === 'object') return { ...latlng }
  return latlng
}

export function cloneTrackPoint (point) {
  if (!point || typeof point !== 'object') return null
  return {
    ...point,
    latlng: cloneLatLng(point.latlng),
    locationSample: point.locationSample && typeof point.locationSample === 'object'
      ? { ...point.locationSample }
      : point.locationSample,
  }
}

export function createTrackRecordingSession () {
  return {
    active: false,
    segments: [],
    historyPoints: [],
    lastPosition: null,
  }
}

export function resetTrackRecordingSession (session, {
  active = false,
  currentPosition = null,
  maxHistoryPoints = 0,
  preserveSegments = false,
} = {}) {
  if (!session || typeof session !== 'object') return session
  session.active = Boolean(active)
  if (!preserveSegments) session.segments = []
  session.historyPoints = []
  session.lastPosition = session.active
    ? createRecordingSeed(currentPosition)
    : null
  trimTrackRecordingSession(session, maxHistoryPoints)
  return session
}

function createRecordingSeed (point) {
  const seed = cloneTrackPoint(point)
  if (!seed) return null
  seed.firstTimestamp = seed.timestamp
  seed.staySeconds = 0
  return seed
}

export function pauseTrackRecordingSession (session, { maxHistoryPoints = 0 } = {}) {
  if (!session || typeof session !== 'object') return session
  if (session.active && (session.historyPoints.length > 0 || session.lastPosition)) {
    session.segments.push({
      historyPoints: session.historyPoints,
      lastPosition: session.lastPosition,
    })
  }
  session.active = false
  session.historyPoints = []
  session.lastPosition = null
  trimTrackRecordingSession(session, maxHistoryPoints)
  return session
}

export function resumeTrackRecordingSession (session, {
  currentPosition = null,
  maxHistoryPoints = 0,
} = {}) {
  if (!session || typeof session !== 'object') return session
  session.active = true
  session.historyPoints = []
  session.lastPosition = createRecordingSeed(currentPosition)
  trimTrackRecordingSession(session, maxHistoryPoints)
  return session
}

export function recordTrackPosition (session, position, {
  replaceLast = false,
  maxHistoryPoints = 0,
} = {}) {
  if (!session?.active || !position) return false
  const nextPosition = cloneTrackPoint(position)
  if (!nextPosition) return false

  if (replaceLast && session.lastPosition) {
    const recordingStartedAt = session.lastPosition.firstTimestamp
    if (Number.isFinite(recordingStartedAt)) {
      nextPosition.firstTimestamp = recordingStartedAt
      nextPosition.staySeconds = Number.isFinite(nextPosition.timestamp)
        ? Math.max(0, (nextPosition.timestamp - recordingStartedAt) / 1000)
        : session.lastPosition.staySeconds
    }
    session.lastPosition = nextPosition
  } else {
    if (session.lastPosition) session.historyPoints.push(session.lastPosition)
    session.lastPosition = nextPosition
  }
  trimTrackRecordingSession(session, maxHistoryPoints)
  return true
}

function countSegmentPoints (segment) {
  return (Array.isArray(segment?.historyPoints) ? segment.historyPoints.length : 0) +
    (segment?.lastPosition ? 1 : 0)
}

export function trimTrackRecordingSession (session, maxHistoryPoints) {
  if (!session || typeof session !== 'object') return false
  const limit = normalizeHistoryPointLimit(maxHistoryPoints)
  if (limit === 0) return false

  const segments = Array.isArray(session.segments) ? session.segments : (session.segments = [])
  const activeHistory = Array.isArray(session.historyPoints) ? session.historyPoints : (session.historyPoints = [])
  const maximumPoints = limit + 1
  let totalPoints = segments.reduce((total, segment) => total + countSegmentPoints(segment), 0) +
    activeHistory.length + (session.lastPosition ? 1 : 0)
  let excess = totalPoints - maximumPoints
  if (excess <= 0) return false

  while (excess > 0 && segments.length > 0) {
    const segment = segments[0]
    const history = Array.isArray(segment?.historyPoints) ? segment.historyPoints : []
    const removeHistory = Math.min(excess, history.length)
    if (removeHistory > 0) {
      history.splice(0, removeHistory)
      excess -= removeHistory
    }
    if (excess > 0 && segment?.lastPosition) {
      segment.lastPosition = null
      excess -= 1
    }
    if (countSegmentPoints(segment) === 0) segments.shift()
  }

  if (excess > 0 && activeHistory.length > 0) {
    const removeActive = Math.min(excess, activeHistory.length)
    activeHistory.splice(0, removeActive)
    excess -= removeActive
  }

  totalPoints = segments.reduce((total, segment) => total + countSegmentPoints(segment), 0) +
    activeHistory.length + (session.lastPosition ? 1 : 0)
  return totalPoints <= maximumPoints
}

export function getTrackRecordingPoints (session) {
  if (!session) return { segments: [], historyPoints: [], lastPosition: null }
  const segments = Array.isArray(session.segments) ? [...session.segments] : []
  if (!session.active) return { segments, historyPoints: [], lastPosition: null }
  return {
    segments,
    historyPoints: Array.isArray(session.historyPoints) ? session.historyPoints : [],
    lastPosition: session.lastPosition || null,
  }
}

export function hasTrackRecordingData (session) {
  if (!session || typeof session !== 'object') return false
  if (Array.isArray(session.segments) && session.segments.some(segment => countSegmentPoints(segment) > 0)) {
    return true
  }
  if (!session.active) return false
  return (Array.isArray(session.historyPoints) && session.historyPoints.length > 0) ||
    Boolean(session.lastPosition)
}

export function buildTrackSegments (historyPoints, lastPosition, completedSegments = []) {
  const segments = []
  for (const segment of Array.isArray(completedSegments) ? completedSegments : []) {
    const points = [...(segment?.historyPoints || [])]
    if (segment?.lastPosition) points.push(segment.lastPosition)
    if (points.length > 0) segments.push(points)
  }
  const activePoints = [...(historyPoints || [])]
  if (lastPosition) activePoints.push(lastPosition)
  if (activePoints.length > 0) segments.push(activePoints)
  return segments
}

/**
 * 根据缩放级别获取 LOD 配置。
 * @param {number} zoom - 地图缩放级别
 * @returns {{ maxPoints: number, maxLineVertices: number, pointInterval: number }}
 */
export function getTrackLodConfig (zoom) {
  const z = Number.isFinite(zoom) ? Math.max(0, Math.floor(zoom)) : 0
  const config = TRACK_LOD_CONFIGS.find(c => z >= c.zoomMin && z <= c.zoomMax)
  return config || TRACK_LOD_CONFIGS[TRACK_LOD_CONFIGS.length - 1]
}

/**
 * 3D 相机高度 → 缩放级别换算。
 * @param {number} cameraHeightMeters - 相机高度（米）
 * @returns {number} 等效缩放级别
 */
export function cameraHeightToZoom (cameraHeightMeters) {
  if (!Number.isFinite(cameraHeightMeters) || cameraHeightMeters <= 0) return 0
  return Math.max(0, Math.log2(CAMERA_HEIGHT_BASE / cameraHeightMeters))
}

/**
 * 均匀采样线坐标（首尾必保留）。
 * @param {Array} coordinates - 原始坐标数组
 * @param {number} maxVertices - 最大顶点数
 * @returns {Array} 采样后的坐标数组
 */
export function downsampleLineCoordinates (coordinates, maxVertices) {
  if (!Array.isArray(coordinates) || coordinates.length <= 2) return coordinates || []
  const limit = Math.max(2, Math.floor(maxVertices))
  if (coordinates.length <= limit) return coordinates

  const result = [coordinates[0]]
  for (let i = 1; i < limit - 1; i += 1) {
    const sourceIndex = Math.floor(i * (coordinates.length - 1) / (limit - 1))
    result.push(coordinates[sourceIndex])
  }
  result.push(coordinates[coordinates.length - 1])
  return result
}

/**
 * 对点列表按 LOD 配置进行间隔抽样 + 上限截断。
 * 始终保留最新的点（数组末尾）。
 * @param {Array} points - 原始点数组（按时间排序，末尾为最新）
 * @param {{ maxPoints: number, pointInterval: number }} lodConfig
 * @returns {Array} 抽样后的点数组
 */
export function applyLodToPointList (points, lodConfig) {
  if (!Array.isArray(points) || points.length === 0) return []
  const interval = Math.max(1, Math.floor(lodConfig.pointInterval) || 1)
  const maxPoints = Math.max(0, Math.floor(lodConfig.maxPoints) || 0)
  if (maxPoints === 0) return []

  // 间隔抽样：从末尾（最新）向前取，每 interval 取 1
  const sampled = []
  for (let i = points.length - 1; i >= 0 && sampled.length < maxPoints; i -= interval) {
    sampled.unshift(points[i])
  }
  return sampled
}

/**
 * 2D 视口过滤：根据 Leaflet bounds 过滤点。
 * 接受 { lat, lng } 或 [lat, lng] 格式的点。
 * @param {Array} points - 点数组
 * @param {{ south: number, west: number, north: number, east: number }} bounds - 视口边界
 * @param {number} [bufferRatio=1.5] - 缓冲系数
 * @returns {Array} 视口内的点
 */
export function filterPointsInViewport2d (points, bounds, bufferRatio = VIEWPORT_BUFFER_RATIO) {
  if (!Array.isArray(points) || !bounds) return points || []
  const expanded = expandKmlViewportForFiles(bounds, bufferRatio)
  if (!expanded) return points
  return points.filter(pt => {
    const lat = typeof pt.lat === 'number' ? pt.lat : (Array.isArray(pt.latlng) ? pt.latlng[0] : pt.latlng?.lat)
    const lng = typeof pt.lng === 'number' ? pt.lng : (Array.isArray(pt.latlng) ? pt.latlng[1] : pt.latlng?.lng)
    return isKmlCoordinateInsideBounds([lng, lat], expanded)
  })
}

/**
 * 3D 视口过滤：根据 Cesium 相机视口过滤点。
 * 通过相机高度和位置估算可见范围。
 * @param {Array} points - 点数组
 * @param {object} viewer - Cesium Viewer 实例
 * @param {number} [bufferRatio=1.5] - 缓冲系数
 * @returns {Array} 视口内的点
 */
export function filterPointsInViewport3d (points, viewer, bufferRatio = VIEWPORT_BUFFER_RATIO) {
  if (!Array.isArray(points) || !viewer?.camera) return points || []
  const viewport = cameraViewportBounds(viewer, bufferRatio)
  if (!viewport) return points
  return points.filter(pt => {
    const lat = typeof pt.lat === 'number' ? pt.lat : (Array.isArray(pt.latlng) ? pt.latlng[0] : pt.latlng?.lat)
    const lng = typeof pt.lng === 'number' ? pt.lng : (Array.isArray(pt.latlng) ? pt.latlng[1] : pt.latlng?.lng)
    return isKmlCoordinateInsideBounds([lng, lat], viewport)
  })
}

/**
 * 2D 视口过滤线坐标：保留视口内及相邻段的顶点。
 * @param {Array} coordinates - [lng, lat] 坐标数组（WGS84）
 * @param {{ south: number, west: number, north: number, east: number }} bounds
 * @param {number} [bufferRatio=1.5]
 * @returns {Array} 过滤后的坐标数组
 */
export function filterLineInViewport2d (coordinates, bounds, bufferRatio = VIEWPORT_BUFFER_RATIO) {
  if (!Array.isArray(coordinates) || coordinates.length <= 2 || !bounds) return coordinates || []
  const expanded = expandKmlViewportForFiles(bounds, bufferRatio)
  if (!expanded) return coordinates

  const isInBounds = (coord) => {
    return isKmlCoordinateInsideBounds(coord, expanded)
  }

  return filterLineByPredicate(coordinates, isInBounds).coordinates
}

/**
 * 3D 视口过滤线坐标。
 * @param {Array} coordinates - [lng, lat] 坐标数组
 * @param {object} viewer - Cesium Viewer 实例
 * @param {number} [bufferRatio=1.5]
 * @returns {Array} 过滤后的坐标数组
 */
export function filterLineInViewport3d (coordinates, viewer, bufferRatio = VIEWPORT_BUFFER_RATIO) {
  if (!Array.isArray(coordinates) || coordinates.length <= 2 || !viewer?.camera) return coordinates || []
  const viewport = cameraViewportBounds(viewer, bufferRatio)
  if (!viewport) return coordinates

  const isInBounds = (coord) => {
    return isKmlCoordinateInsideBounds(coord, viewport)
  }

  return filterLineByPredicate(coordinates, isInBounds).coordinates
}

/**
 * 获取轨迹显示特征（视口感知增强版）。
 *
 * @param {object} kmlFile - KML 文件对象
 * @param {object} [options] - 可选参数
 * @param {{ south: number, west: number, north: number, east: number } | null} [options.viewportBounds]
 *        视口边界，提供时启用视口过滤
 * @param {number | null} [options.zoom]
 *        缩放级别，提供时启用 LOD 过滤；不提供时退化为旧逻辑
 * @param {object | null} [options.viewer3d]
 *        Cesium Viewer 实例，3D 模式下用于视口过滤（优先于 viewportBounds）
 * @returns {Array} 过滤后的特征数组
 */
export function getTrackDisplayFeatures (kmlFile, options = {}) {
  const features = Array.isArray(kmlFile?.features) ? kmlFile.features : []
  if (!kmlFile?.isLiveTrack) return features

  const { viewportBounds = null, zoom = null, viewer3d = null } = options
  const useViewport = Boolean(viewportBounds || viewer3d)
  const useLod = Number.isFinite(zoom)

  // 无视口和 LOD 参数时，退化为旧逻辑（向后兼容）
  if (!useViewport && !useLod) {
    return getTrackDisplayFeaturesLegacy(kmlFile)
  }

  const lodConfig = useLod
    ? getTrackLodConfig(zoom)
    : { maxPoints: LIVE_TRACK_RENDER_POINT_LIMIT, maxLineVertices: LIVE_TRACK_RENDER_LINE_POINT_LIMIT, pointInterval: 1 }

  // 线特征数，用于分配每条线的顶点预算
  const lineCount = features.filter(feature => feature?.type === 'LineString').length
  const perLinePointLimit = Math.max(2, Math.floor(lodConfig.maxLineVertices / Math.max(1, lineCount)))

  // 第一遍：过滤线特征（视口裁剪 + 顶点抽稀）
  const processedLines = []
  for (let index = 0; index < features.length; index += 1) {
    const feature = features[index]
    if (feature?.type !== 'LineString' || !Array.isArray(feature.coordinates)) {
      if (feature?.type === 'LineString') processedLines.push({ index, feature })
      continue
    }

    // 视口过滤必须在显示坐标（通常为 GCJ-02）中进行；保留的顶点仍以
    // WGS84 存储，后续由 KML 渲染器统一完成一次坐标转换。
    let coords = filterTrackLineCoordinates(kmlFile, feature, viewportBounds, viewer3d)

    // LOD 顶点抽稀
    coords = downsampleLineCoordinates(coords, perLinePointLimit)

    if (coords.length >= 2) {
      processedLines.push({ index, feature: { ...feature, coordinates: coords } })
    }
  }

  // 第二遍：过滤点特征（视口过滤 + LOD 抽样）
  let pointFeatures = []
  for (let index = 0; index < features.length; index += 1) {
    const feature = features[index]
    if (feature?.type !== 'Point') continue
    pointFeatures.push({ index, feature })
  }

  // 视口过滤点
  if (viewer3d) {
    const viewport = cameraViewportBounds(viewer3d)
    if (viewport) {
      pointFeatures = pointFeatures.filter(({ feature }) => (
        isKmlCoordinateInsideBounds(getTrackDisplayCoordinates(kmlFile, feature), viewport)
      ))
    }
  } else if (viewportBounds) {
    const viewport = expandKmlViewportForFiles(viewportBounds, VIEWPORT_BUFFER_RATIO)
    if (viewport) {
      pointFeatures = pointFeatures.filter(({ feature }) => (
        isKmlCoordinateInsideBounds(getTrackDisplayCoordinates(kmlFile, feature), viewport)
      ))
    }
  }

  // LOD 点抽样（从末尾向前，保留最新点）
  const maxPoints = Math.min(lodConfig.maxPoints, VIEWPORT_MAX_POINTS)
  if (maxPoints === 0) {
    pointFeatures = []
  } else if (pointFeatures.length > maxPoints) {
    const interval = Math.max(1, Math.floor(lodConfig.pointInterval) || 1)
    const sampled = []
    for (let i = pointFeatures.length - 1; i >= 0 && sampled.length < maxPoints; i -= interval) {
      sampled.unshift(pointFeatures[i])
    }
    pointFeatures = sampled
  } else if (lodConfig.pointInterval > 1 && pointFeatures.length > 0) {
    // 点数未超上限但需要按间隔抽样
    const interval = Math.max(1, Math.floor(lodConfig.pointInterval) || 1)
    if (interval > 1) {
      const sampled = []
      for (let i = pointFeatures.length - 1; i >= 0; i -= interval) {
        sampled.unshift(pointFeatures[i])
      }
      pointFeatures = sampled
    }
  }

  // 合并结果，保持原始顺序
  const keepIndices = new Set([
    ...processedLines.map(item => item.index),
    ...pointFeatures.map(item => item.index),
  ])

  const lineMap = new Map(processedLines.map(item => [item.index, item.feature]))

  return features.flatMap((feature, index) => {
    if (!keepIndices.has(index)) return []
    const replacement = lineMap.get(index)
    return replacement ? [replacement] : [feature]
  })
}

/**
 * 旧版 getTrackDisplayFeatures 逻辑（向后兼容 fallback）。
 * 当不提供视口和 LOD 参数时使用。
 */
function getTrackDisplayFeaturesLegacy (kmlFile) {
  const features = Array.isArray(kmlFile?.features) ? kmlFile.features : []

  const configuredLimit = finiteNumber(kmlFile.renderPointLimit)
  const pointLimit = configuredLimit === null
    ? LIVE_TRACK_RENDER_POINT_LIMIT
    : Math.max(0, Math.floor(configuredLimit))
  let remainingPoints = pointLimit
  const keep = new Array(features.length).fill(false)
  const lineCount = features.filter(feature => feature?.type === 'LineString').length
  const configuredLineLimit = finiteNumber(kmlFile.renderLinePointLimit)
  const totalLinePointLimit = configuredLineLimit === null
    ? LIVE_TRACK_RENDER_LINE_POINT_LIMIT
    : Math.max(2, Math.floor(configuredLineLimit))
  const perLinePointLimit = Math.max(2, Math.floor(totalLinePointLimit / Math.max(1, lineCount)))

  for (let index = features.length - 1; index >= 0; index -= 1) {
    if (features[index]?.type !== 'Point') {
      keep[index] = true
      continue
    }
    if (remainingPoints > 0) {
      keep[index] = true
      remainingPoints -= 1
    }
  }

  return features.flatMap((feature, index) => {
    if (feature?.type === 'Point' && !keep[index]) return []
    if (feature?.type !== 'LineString' || !Array.isArray(feature.coordinates) ||
        feature.coordinates.length <= perLinePointLimit) {
      return [feature]
    }

    const coordinates = [feature.coordinates[0]]
    for (let pointIndex = 1; pointIndex < perLinePointLimit - 1; pointIndex += 1) {
      const sourceIndex = Math.floor(
        pointIndex * (feature.coordinates.length - 1) / (perLinePointLimit - 1),
      )
      coordinates.push(feature.coordinates[sourceIndex])
    }
    coordinates.push(feature.coordinates[feature.coordinates.length - 1])
    return [{ ...feature, coordinates }]
  })
}
