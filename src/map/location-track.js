export const LIVE_TRACK_RENDER_POINT_LIMIT = 120
export const LIVE_TRACK_RENDER_LINE_POINT_LIMIT = 2000
export const MAX_LOCATION_INTERVAL_SECONDS = 60
export const MAX_LOCATION_HISTORY_POINTS = 100_000

function finiteNumber (value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
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

export function getTrackDisplayFeatures (kmlFile) {
  const features = Array.isArray(kmlFile?.features) ? kmlFile.features : []
  if (!kmlFile?.isLiveTrack) return features

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
