export const MEDIA_PREVIEW_MIN_SCALE = 1
export const MEDIA_PREVIEW_MAX_SCALE = 6

const PREVIEWABLE_TYPES = new Set(['image', 'video', 'audio', 'iframe'])

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
