export const MEDIA_PREVIEW_MIN_SCALE = 1
export const MEDIA_PREVIEW_MAX_SCALE = 6

const PREVIEWABLE_TYPES = new Set(['image', 'video', 'audio', 'iframe'])
const MEDIA_TYPE_LABELS = {
  image: '图片',
  video: '视频',
  audio: '音频',
  iframe: '页面',
}

export function getMediaPreviewFeatureName (item) {
  return String(item?.featureName || '').trim()
}

export function getMediaPreviewHeadingTitle (item) {
  return getMediaPreviewFeatureName(item) || String(item?.title || '').trim() || MEDIA_TYPE_LABELS[item?.type] || '媒体预览'
}

export function getMediaPreviewTrackLabel (item, index) {
  return getMediaPreviewFeatureName(item) || String((Number.parseInt(index, 10) || 0) + 1).padStart(2, '0')
}

export function getMediaPreviewPointKey (item) {
  const kmlId = String(item?.kmlId || '')
  const featureId = String(item?.featureId || '')
  return kmlId && featureId ? `${kmlId}:${featureId}` : ''
}

export function getWrappedMediaIndex (index, total) {
  const count = Math.max(0, Number.parseInt(total, 10) || 0)
  if (!count) return 0
  const value = Number.parseInt(index, 10) || 0
  return ((value % count) + count) % count
}

export function clampMediaPreviewScale (scale) {
  const value = Number(scale)
  if (!Number.isFinite(value)) return MEDIA_PREVIEW_MIN_SCALE
  return Math.min(MEDIA_PREVIEW_MAX_SCALE, Math.max(MEDIA_PREVIEW_MIN_SCALE, value))
}

export function getDefaultMediaPreviewTrackExpanded (total, touchFirst = false) {
  const count = Math.max(0, Number.parseInt(total, 10) || 0)
  return count > 1 && !touchFirst
}

export function getMediaPreviewTrackWindow (total, activeIndex, radius = 2) {
  const count = Math.max(0, Number.parseInt(total, 10) || 0)
  if (!count) return []
  return Array.from({ length: count }, (_, index) => index)
}

export function normalizeMediaPreviewItems (items, fallbackType = '') {
  if (!Array.isArray(items)) return []
  return items.flatMap(item => {
    const itemType = String(item?.type || '')
    const type = itemType ? itemType : fallbackType
    const url = String(item?.url || '').trim()
    if (!PREVIEWABLE_TYPES.has(type) || !/^https:\/\//i.test(url)) return []
    return [{ ...item, type, url }]
  })
}
