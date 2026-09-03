const MAX_HISTORY = 50

function clonePoints (points) {
  return points.map(point => ({
    id: String(point.id),
    lat: Number(point.lat),
    lng: Number(point.lng),
  }))
}

function normalizePoint (point, fallbackId) {
  const lat = Number(point?.lat)
  const lng = Number(point?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    id: String(point?.id || fallbackId),
    lat,
    lng,
  }
}

export function createKmlLineEditorState (initialPoints = []) {
  let points = initialPoints
    .map((point, index) => normalizePoint(point, `line-point-${index + 1}`))
    .filter(Boolean)
  let selectedId = points.at(-1)?.id || null
  const undoStack = []
  const redoStack = []

  const snapshot = () => clonePoints(points)

  const ensureSelection = () => {
    if (!selectedId || !points.some(point => point.id === selectedId)) {
      selectedId = points.at(-1)?.id || null
    }
  }

  const pushHistory = () => {
    undoStack.push(snapshot())
    if (undoStack.length > MAX_HISTORY) undoStack.shift()
    redoStack.length = 0
  }

  const setPoint = (id, lat, lng) => {
    const point = points.find(item => item.id === String(id))
    if (!point || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return false
    point.lat = Number(lat)
    point.lng = Number(lng)
    selectedId = point.id
    return true
  }

  return {
    getPoints: () => snapshot(),
    getSelectedId: () => selectedId,
    get canUndo () { return undoStack.length > 0 },
    get canRedo () { return redoStack.length > 0 },
    get size () { return points.length },
    select (id) {
      const nextId = String(id || '')
      if (!points.some(point => point.id === nextId)) return false
      selectedId = nextId
      return true
    },
    pushHistory,
    addPoint (point) {
      const next = normalizePoint(point, `line-point-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      if (!next) return false
      pushHistory()
      points.push(next)
      selectedId = next.id
      return true
    },
    movePoint (id, lat, lng, { history = true } = {}) {
      if (history) pushHistory()
      return setPoint(id, lat, lng)
    },
    deletePoint (id = selectedId) {
      const targetId = String(id || '')
      const index = points.findIndex(point => point.id === targetId)
      if (index < 0) return false
      pushHistory()
      points.splice(index, 1)
      selectedId = points[Math.min(index, points.length - 1)]?.id || null
      return true
    },
    clear () {
      if (!points.length) return false
      pushHistory()
      points = []
      selectedId = null
      return true
    },
    undo () {
      if (!undoStack.length) return false
      redoStack.push(snapshot())
      points = undoStack.pop()
      ensureSelection()
      return true
    },
    redo () {
      if (!redoStack.length) return false
      undoStack.push(snapshot())
      points = redoStack.pop()
      ensureSelection()
      return true
    },
  }
}

export function lineEditorPointsToLatLngs (points = []) {
  return points.map(point => [Number(point.lat), Number(point.lng)])
}
