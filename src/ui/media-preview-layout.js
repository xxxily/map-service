export const MEDIA_PREVIEW_LAYOUT_STORAGE_KEY = 'map_media_preview_layout_v1'
export const MEDIA_PREVIEW_WINDOW_STORAGE_KEY = 'map_media_preview_window_v1'
export const MEDIA_PREVIEW_CENTERED_MAX_WIDTH = 1500
export const MEDIA_PREVIEW_LAYOUT_MODES = Object.freeze({
  CENTERED: 'centered',
  WIDE: 'wide',
})

export const MEDIA_PREVIEW_WINDOW_LIMITS = Object.freeze({
  minWidth: 280,
  minHeight: 180,
  defaultWidth: 360,
  defaultHeight: 240,
  margin: 16,
})

function finiteNumber (value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function getDefaultStorage () {
  try {
    return globalThis?.localStorage
  } catch {
    return null
  }
}

function getViewportSize (viewport = {}) {
  return {
    width: Math.max(0, finiteNumber(viewport.width, 0)),
    height: Math.max(0, finiteNumber(viewport.height, 0)),
  }
}

export function normalizeMediaPreviewLayout (value, fallback = MEDIA_PREVIEW_LAYOUT_MODES.CENTERED) {
  const normalizedFallback = fallback === MEDIA_PREVIEW_LAYOUT_MODES.WIDE
    ? MEDIA_PREVIEW_LAYOUT_MODES.WIDE
    : MEDIA_PREVIEW_LAYOUT_MODES.CENTERED
  return value === MEDIA_PREVIEW_LAYOUT_MODES.WIDE || value === MEDIA_PREVIEW_LAYOUT_MODES.CENTERED
    ? value
    : normalizedFallback
}

export function readMediaPreviewLayout (storage = getDefaultStorage()) {
  try {
    return normalizeMediaPreviewLayout(storage?.getItem?.(MEDIA_PREVIEW_LAYOUT_STORAGE_KEY))
  } catch {
    return MEDIA_PREVIEW_LAYOUT_MODES.CENTERED
  }
}

export function writeMediaPreviewLayout (value, storage = getDefaultStorage()) {
  const normalized = normalizeMediaPreviewLayout(value)
  try {
    storage?.setItem?.(MEDIA_PREVIEW_LAYOUT_STORAGE_KEY, normalized)
  } catch {
    // 私有浏览模式或存储配额不足时，布局仍可在当前页面生效。
  }
  return normalized
}

export function isMediaPreviewWideAvailable (viewportWidth, options = {}) {
  const width = Math.max(0, finiteNumber(viewportWidth, 0))
  const centeredMaxWidth = Math.max(0, finiteNumber(options.centeredMaxWidth, MEDIA_PREVIEW_CENTERED_MAX_WIDTH))
  const requiredExtraSpace = Math.max(0, finiteNumber(options.requiredExtraSpace, MEDIA_PREVIEW_WINDOW_LIMITS.margin * 2))
  return width > centeredMaxWidth + requiredExtraSpace
}

export function getDefaultMediaPreviewWindow (viewport = {}, options = {}) {
  const { width: viewportWidth, height: viewportHeight } = getViewportSize(viewport)
  const margin = Math.max(0, finiteNumber(options.margin, MEDIA_PREVIEW_WINDOW_LIMITS.margin))
  const availableWidth = Math.max(1, viewportWidth - margin * 2)
  const availableHeight = Math.max(1, viewportHeight - margin * 2)
  const windowWidth = Math.min(
    Math.max(MEDIA_PREVIEW_WINDOW_LIMITS.minWidth, finiteNumber(options.width, MEDIA_PREVIEW_WINDOW_LIMITS.defaultWidth)),
    availableWidth,
  )
  const windowHeight = Math.min(
    Math.max(MEDIA_PREVIEW_WINDOW_LIMITS.minHeight, finiteNumber(options.height, MEDIA_PREVIEW_WINDOW_LIMITS.defaultHeight)),
    availableHeight,
  )
  return {
    left: Math.max(margin, viewportWidth - windowWidth - margin),
    top: Math.max(margin, viewportHeight - windowHeight - margin),
    width: windowWidth,
    height: windowHeight,
  }
}

export function clampMediaPreviewWindow (value, viewport = {}, options = {}) {
  const { width: viewportWidth, height: viewportHeight } = getViewportSize(viewport)
  const margin = Math.max(0, finiteNumber(options.margin, MEDIA_PREVIEW_WINDOW_LIMITS.margin))
  const minWidth = Math.max(1, finiteNumber(options.minWidth, MEDIA_PREVIEW_WINDOW_LIMITS.minWidth))
  const minHeight = Math.max(1, finiteNumber(options.minHeight, MEDIA_PREVIEW_WINDOW_LIMITS.minHeight))
  const maxWidth = Math.max(1, viewportWidth - margin * 2)
  const maxHeight = Math.max(1, viewportHeight - margin * 2)
  const effectiveMinWidth = Math.min(minWidth, maxWidth)
  const effectiveMinHeight = Math.min(minHeight, maxHeight)
  const width = Math.min(maxWidth, Math.max(effectiveMinWidth, finiteNumber(value?.width, MEDIA_PREVIEW_WINDOW_LIMITS.defaultWidth)))
  const height = Math.min(maxHeight, Math.max(effectiveMinHeight, finiteNumber(value?.height, MEDIA_PREVIEW_WINDOW_LIMITS.defaultHeight)))
  const left = Math.min(
    Math.max(margin, finiteNumber(value?.left, viewportWidth - width - margin)),
    Math.max(margin, viewportWidth - width - margin),
  )
  const top = Math.min(
    Math.max(margin, finiteNumber(value?.top, viewportHeight - height - margin)),
    Math.max(margin, viewportHeight - height - margin),
  )
  return { left, top, width, height }
}

export function resizeMediaPreviewWindow (value, direction = 'se', delta = {}, viewport = {}, options = {}) {
  const base = clampMediaPreviewWindow(value, viewport, options)
  const { width: viewportWidth, height: viewportHeight } = getViewportSize(viewport)
  const margin = Math.max(0, finiteNumber(options.margin, MEDIA_PREVIEW_WINDOW_LIMITS.margin))
  const maxWidth = Math.max(1, viewportWidth - margin * 2)
  const maxHeight = Math.max(1, viewportHeight - margin * 2)
  const minWidth = Math.min(maxWidth, Math.max(1, finiteNumber(options.minWidth, MEDIA_PREVIEW_WINDOW_LIMITS.minWidth)))
  const minHeight = Math.min(maxHeight, Math.max(1, finiteNumber(options.minHeight, MEDIA_PREVIEW_WINDOW_LIMITS.minHeight)))
  const deltaX = finiteNumber(delta.x, 0)
  const deltaY = finiteNumber(delta.y, 0)
  const normalizedDirection = ['nw', 'ne', 'sw', 'se'].includes(direction) ? direction : 'se'
  const right = base.left + base.width
  const bottom = base.top + base.height
  const next = { ...base }

  if (normalizedDirection.includes('w')) {
    next.left = Math.min(right - minWidth, Math.max(margin, base.left + deltaX))
    next.width = right - next.left
  } else {
    next.width = Math.min(Math.max(minWidth, viewportWidth - margin - base.left), Math.max(minWidth, base.width + deltaX))
  }

  if (normalizedDirection.includes('n')) {
    next.top = Math.min(bottom - minHeight, Math.max(margin, base.top + deltaY))
    next.height = bottom - next.top
  } else {
    next.height = Math.min(Math.max(minHeight, viewportHeight - margin - base.top), Math.max(minHeight, base.height + deltaY))
  }

  return clampMediaPreviewWindow(next, viewport, options)
}

export function readMediaPreviewWindow (storage = getDefaultStorage(), viewport = {}, options = {}) {
  let parsed = null
  try {
    const raw = storage?.getItem?.(MEDIA_PREVIEW_WINDOW_STORAGE_KEY)
    if (raw) parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  return clampMediaPreviewWindow(parsed || getDefaultMediaPreviewWindow(viewport, options), viewport, options)
}

export function writeMediaPreviewWindow (value, storage = getDefaultStorage(), viewport = {}, options = {}) {
  const normalized = clampMediaPreviewWindow(value, viewport, options)
  try {
    storage?.setItem?.(MEDIA_PREVIEW_WINDOW_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // 布局持久化失败不应阻断预览操作。
  }
  return normalized
}
