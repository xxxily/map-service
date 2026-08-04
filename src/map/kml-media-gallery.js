import { buildFeatureContentView } from '../../shared/kml-content.js'

export const KML_PREVIEWABLE_MEDIA_TYPES = ['image', 'video', 'audio', 'iframe']

const PREVIEWABLE_MEDIA_TYPE_SET = new Set(KML_PREVIEWABLE_MEDIA_TYPES)

function getSourceOrder (item, groupIndex, itemIndex) {
  const idMatch = /description-link-(\d+)$/i.exec(String(item?.id || ''))
  if (idMatch) return Number(idMatch[1])
  const sortOrder = Number(item?.sortOrder)
  if (Number.isFinite(sortOrder)) return sortOrder
  return 100000 + (groupIndex * 10000) + itemIndex
}

function getFeatureViewOverride (overrides, featureId) {
  if (!overrides) return null
  if (overrides instanceof Map) return overrides.get(featureId) || null
  return overrides[featureId] || null
}

function getUrlHostname (value) {
  try {
    return new URL(value).hostname
  } catch {
    return ''
  }
}

export function flattenKmlFeatureMediaItems (feature, view, options = {}) {
  const contentView = view || buildFeatureContentView(feature, options.contentOptions)
  const featureName = String(feature?.name || '').trim() || '未命名点位'
  const featureId = String(feature?.id || '')
  const orderedItems = []

  ;(contentView?.groups || []).forEach((group, groupIndex) => {
    if (!PREVIEWABLE_MEDIA_TYPE_SET.has(group?.type)) return
    ;(group.items || []).forEach((item, itemIndex) => {
      const itemTitle = String(item?.title || '').trim()
      orderedItems.push({
        ...item,
        title: itemTitle && itemTitle !== getUrlHostname(item?.url)
          ? itemTitle
          : featureName,
        type: group.type,
        featureId,
        featureName,
        featureType: String(feature?.type || ''),
        sourceOrder: getSourceOrder(item, groupIndex, itemIndex),
      })
    })
  })

  orderedItems.sort((left, right) => left.sourceOrder - right.sourceOrder)
  return orderedItems.map((item, featureMediaIndex) => ({
    ...item,
    featureMediaIndex,
    galleryId: `${featureId || 'feature'}:${item.id || item.type}:${featureMediaIndex}`,
  }))
}

export function buildKmlMediaGallery (kmlFile, options = {}) {
  const features = Array.isArray(kmlFile?.features) ? kmlFile.features : []
  const kmlId = String(kmlFile?.id || '')
  const kmlName = String(kmlFile?.name || '').trim() || '未命名 KML'

  return features.flatMap((feature, featureIndex) => {
    const featureId = String(feature?.id || '')
    const view = getFeatureViewOverride(options.featureViews, featureId)
    return flattenKmlFeatureMediaItems(feature, view, options).map(item => ({
      ...item,
      kmlId,
      kmlName,
      featureIndex,
    }))
  }).map((item, galleryIndex) => ({ ...item, galleryIndex }))
}

export function findKmlMediaGalleryIndex (items, selection = {}) {
  if (!Array.isArray(items) || !items.length) return 0
  const featureId = String(selection.featureId || '')
  const selectedId = String(selection.id || '')
  const selectedUrl = String(selection.url || '')
  const selectedType = String(selection.type || '')
  const featureMediaIndex = Number(selection.featureMediaIndex)

  let index = items.findIndex(item => {
    if (featureId && item.featureId !== featureId) return false
    if (selectedType && item.type !== selectedType) return false
    if (selectedId && item.id === selectedId) return true
    if (selectedUrl && item.url === selectedUrl && (!selectedType || item.type === selectedType)) return true
    if (!selectedId && !selectedUrl && selectedType) return true
    return Number.isInteger(featureMediaIndex) && item.featureMediaIndex === featureMediaIndex
  })

  if (index === -1 && featureId) {
    index = items.findIndex(item => item.featureId === featureId)
  }
  return index === -1 ? 0 : index
}

export function getKmlFeaturePopupMedia (feature, options = {}) {
  const limit = Math.max(1, Number.parseInt(options.limit, 10) || 4)
  const view = options.view || buildFeatureContentView(feature, options.contentOptions)
  const items = flattenKmlFeatureMediaItems(feature, view, options)
  const visibleLimit = items.length > limit ? Math.max(1, limit - 1) : limit
  const visibleItems = items.slice(0, visibleLimit)
  return {
    items: visibleItems,
    overflowItem: items[visibleItems.length] || null,
    total: items.length,
    remaining: Math.max(0, items.length - visibleLimit),
    contentSummary: view?.contentSummary || {},
  }
}
