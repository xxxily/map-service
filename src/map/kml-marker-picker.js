import {
  KML_MARKER_ICON_AUTO,
  KML_MARKER_ICON_OPTIONS,
  normalizeKmlMarkerIcon,
  renderKmlMarkerIconGlyph,
} from '../../shared/kml-marker-icons.js'
import { tryNormalizeKmlResourceCollection } from '../../shared/kml-resource-collection.js'

export const KML_MARKER_RECENT_STORAGE_KEY = 'map_kml_marker_recent_icons_v1'
export const KML_MARKER_RECENT_LIMIT = 5
export const KML_MARKER_QUICK_LIMIT = 8

const DEFAULT_QUICK_ICON_KEYS = Object.freeze([
  'pin',
  'star',
  'viewpoint',
  'camera',
  'campsite',
  'parking',
])

function getBrowserStorage (storage) {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function buildIconOption (option) {
  return {
    value: option.key,
    label: option.label,
    iconHtml: `<span class="kml-marker-picker-glyph" style="color:${option.color}">${renderKmlMarkerIconGlyph(option.key)}</span>`,
  }
}

export function normalizeKmlMarkerRecentIcons (values) {
  if (!Array.isArray(values)) return []
  const normalized = []
  for (const value of values) {
    const icon = normalizeKmlMarkerIcon(value)
    if (!icon || normalized.includes(icon)) continue
    normalized.push(icon)
    if (normalized.length >= KML_MARKER_RECENT_LIMIT) break
  }
  return normalized
}

export function readKmlMarkerRecentIcons (storage) {
  const target = getBrowserStorage(storage)
  if (!target) return []
  try {
    return normalizeKmlMarkerRecentIcons(JSON.parse(target.getItem(KML_MARKER_RECENT_STORAGE_KEY) || '[]'))
  } catch {
    return []
  }
}

export function recordKmlMarkerRecentIcon (value, storage) {
  const icon = normalizeKmlMarkerIcon(value)
  const existing = readKmlMarkerRecentIcons(storage)
  if (!icon) return existing
  const recent = normalizeKmlMarkerRecentIcons([icon, ...existing])
  const target = getBrowserStorage(storage)
  if (target) {
    try {
      target.setItem(KML_MARKER_RECENT_STORAGE_KEY, JSON.stringify(recent))
    } catch {
      // localStorage 不可用时只影响快捷排序，不影响点位保存。
    }
  }
  return recent
}

export function buildKmlMarkerQuickIconKeys (selectedValue, recentIcons = []) {
  const selected = normalizeKmlMarkerIcon(selectedValue, { allowAuto: true })
  const candidates = [
    KML_MARKER_ICON_AUTO,
    selected,
    ...normalizeKmlMarkerRecentIcons(recentIcons),
    ...DEFAULT_QUICK_ICON_KEYS,
  ]
  const keys = []
  for (const key of candidates) {
    if (!key || keys.includes(key)) continue
    keys.push(key)
    if (keys.length >= KML_MARKER_QUICK_LIMIT) break
  }
  return keys
}

export function buildKmlMarkerIconField (selectedValue = KML_MARKER_ICON_AUTO, options = {}) {
  const allOptions = KML_MARKER_ICON_OPTIONS.map(buildIconOption)
  const recentIcons = Array.isArray(options.recentIcons)
    ? normalizeKmlMarkerRecentIcons(options.recentIcons)
    : readKmlMarkerRecentIcons(options.storage)
  const quickValues = buildKmlMarkerQuickIconKeys(selectedValue, recentIcons)
  return {
    name: 'markerIcon',
    label: '点位图标',
    type: 'icon-picker',
    hint: '自动模式按内容匹配图标。',
    options: allOptions,
    quickValues,
    quickLimit: KML_MARKER_QUICK_LIMIT,
    autoValue: KML_MARKER_ICON_AUTO,
  }
}

export function getEditableKmlMarkerIcon (feature) {
  return normalizeKmlMarkerIcon(feature?.markerIcon) || KML_MARKER_ICON_AUTO
}

export function applyKmlMarkerIconSelection (feature, value) {
  const markerIcon = normalizeKmlMarkerIcon(value)
  if (markerIcon) feature.markerIcon = markerIcon
  else delete feature.markerIcon
  return feature
}

export function normalizeKmlFeatureMarkerIcon (feature) {
  const normalized = { ...feature }
  if (normalized.type === 'Point') {
    applyKmlMarkerIconSelection(normalized, normalized.markerIcon)
    if (normalized.resourceCollection !== undefined) {
      const result = tryNormalizeKmlResourceCollection(normalized.resourceCollection)
      if (result.value) normalized.resourceCollection = result.value
      else delete normalized.resourceCollection
    }
    return normalized
  }
  delete normalized.markerIcon
  delete normalized.resourceCollection
  return normalized
}
