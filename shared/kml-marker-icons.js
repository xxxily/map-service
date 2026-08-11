export const KML_MARKER_ICON_AUTO = 'auto'

const ICON_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: 'pin',
    label: '经典标记',
    color: '#0f766e',
    glyph: '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  }),
  Object.freeze({
    key: 'star',
    label: '星标',
    color: '#d97706',
    glyph: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  }),
  Object.freeze({
    key: 'flag',
    label: '旗帜',
    color: '#dc2626',
    glyph: '<path d="M7 21V4m0 1h10l-2 3 2 3H7"/>',
  }),
  Object.freeze({
    key: 'viewpoint',
    label: '观景',
    color: '#0284c7',
    glyph: '<path d="m3 18 5.2-7 3.2 4 2.8-3.5L21 18H3Z"/><path d="m6.8 13 1.4 1.1 1.4-1.1M16.5 6.5h.01"/>',
  }),
  Object.freeze({
    key: 'camera',
    label: '相机',
    color: '#7c3aed',
    glyph: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.2"/>',
  }),
  Object.freeze({
    key: 'campsite',
    label: '营地',
    color: '#15803d',
    glyph: '<path d="m4 19 8-14 8 14M8 19l4-7 4 7M3 19h18"/>',
  }),
  Object.freeze({
    key: 'food',
    label: '餐饮',
    color: '#ea580c',
    glyph: '<path d="M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18m0-18c3 2 4 5 4 8h-4"/>',
  }),
  Object.freeze({
    key: 'lodging',
    label: '住宿',
    color: '#4f46e5',
    glyph: '<path d="M4 19V9m16 10v-7a3 3 0 0 0-3-3H9v10M4 14h16M7 9V6h4v3"/>',
  }),
  Object.freeze({
    key: 'parking',
    label: '停车',
    color: '#0369a1',
    glyph: '<path d="M7 20V4h6a5 5 0 0 1 0 10H7m0-5h6a1.8 1.8 0 0 0 0-3.6H7"/>',
  }),
  Object.freeze({
    key: 'warning',
    label: '提醒',
    color: '#c2410c',
    glyph: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  }),
  Object.freeze({
    key: 'heart',
    label: '爱心',
    color: '#e11d48',
    glyph: '<path d="M20.8 8.6c0 5.3-8.8 11-8.8 11s-8.8-5.7-8.8-11A4.6 4.6 0 0 1 12 6.5a4.6 4.6 0 0 1 8.8 2.1Z"/>',
  }),
  Object.freeze({
    key: 'home',
    label: '住所',
    color: '#475569',
    glyph: '<path d="m3 11 9-7 9 7"/><path d="M5.5 9.5V20h13V9.5M10 20v-6h4v6"/>',
  }),
  Object.freeze({
    key: 'water',
    label: '饮水',
    color: '#0891b2',
    glyph: '<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z"/><path d="M9.2 15.2a3.2 3.2 0 0 0 2.8 1.6"/>',
  }),
  Object.freeze({
    key: 'restroom',
    label: '卫生间',
    color: '#64748b',
    glyph: '<circle cx="8" cy="5" r="1.5"/><circle cx="16" cy="5" r="1.5"/><path d="M8 8v5m-3-2 1-3h4l1 3m-3 2v7m-2.5 0L8 13l2.5 7M16 8v12m-3-8 1-4h4l1 4"/>',
  }),
  Object.freeze({
    key: 'hospital',
    label: '医疗',
    color: '#dc2626',
    glyph: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>',
  }),
  Object.freeze({
    key: 'shop',
    label: '商店',
    color: '#9333ea',
    glyph: '<path d="M4 9h16l-1.5-5h-13L4 9Z"/><path d="M5 9v11h14V9M9 20v-6h6v6M4 9a3 3 0 0 0 5 0 3 3 0 0 0 6 0 3 3 0 0 0 5 0"/>',
  }),
  Object.freeze({
    key: 'charging',
    label: '充电',
    color: '#16a34a',
    glyph: '<rect x="5" y="4" width="12" height="16" rx="2"/><path d="M9 4V2m4 2V2m4 7h1.5A1.5 1.5 0 0 1 20 10.5v4A1.5 1.5 0 0 1 18.5 16H17M12 7l-3 5h3l-1 5 4-6h-3V7Z"/>',
  }),
  Object.freeze({
    key: 'bus',
    label: '公交',
    color: '#2563eb',
    glyph: '<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M7 7h10M7 13h10M8 19v2m8-2v2"/><circle cx="8.5" cy="16" r="1"/><circle cx="15.5" cy="16" r="1"/>',
  }),
  Object.freeze({
    key: 'train',
    label: '火车',
    color: '#0f766e',
    glyph: '<path d="M7 3h10a2 2 0 0 1 2 2v10a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V5a2 2 0 0 1 2-2Z"/><path d="M7 8h10M8 22l3-3m5 3-3-3"/><circle cx="8.5" cy="15" r="1"/><circle cx="15.5" cy="15" r="1"/>',
  }),
  Object.freeze({
    key: 'bicycle',
    label: '骑行',
    color: '#059669',
    glyph: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="m6 16 4-7 4 7H6Zm4-7h4m0 0 4 7m-6-10h3"/>',
  }),
  Object.freeze({
    key: 'hiking',
    label: '徒步',
    color: '#b45309',
    glyph: '<circle cx="13" cy="4.5" r="1.8"/><path d="m11 8 3 2 2.5 4M11 8l-2 5 3 2-2 6m2-6 4 2 2 4M7 11l-2 4m13-7v13"/>',
  }),
  Object.freeze({
    key: 'summit',
    label: '山峰',
    color: '#334155',
    glyph: '<path d="m3 20 7-12 3 5 2-3 6 10H3Z"/><path d="M10 8V3m0 0h6l-1.5 2L16 7h-6"/>',
  }),
  Object.freeze({
    key: 'waterfall',
    label: '瀑布',
    color: '#0284c7',
    glyph: '<path d="M6 3h12M8 3v9m4-9v11m4-11v9"/><path d="M5 17c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0 2.3-1 3.5 0 2.3 1 3.5 0M5 21c1.2-1 2.3-1 3.5 0s2.3 1 3.5 0 2.3-1 3.5 0 2.3 1 3.5 0"/>',
  }),
])

const AUTO_DEFINITION = Object.freeze({
  key: KML_MARKER_ICON_AUTO,
  label: '自动识别内容',
  color: '#475569',
  glyph: '<path d="m12 3 .8 2.4L15 6.2l-2.2.8-.8 2.4L11.2 7 9 6.2l2.2-.8L12 3Zm-5 7 .9 2.6 2.6.9-2.6.9L7 17l-.9-2.6-2.6-.9 2.6-.9L7 10Zm9 1 1.1 3.2 3.2 1.1-3.2 1.1L16 19.6l-1.1-3.2-3.2-1.1 3.2-1.1L16 11Z"/>',
})

const ICON_DEFINITION_MAP = new Map(ICON_DEFINITIONS.map(definition => [definition.key, definition]))

export const KML_MARKER_ICON_KEYS = Object.freeze(ICON_DEFINITIONS.map(definition => definition.key))
export const KML_MARKER_ICON_OPTIONS = Object.freeze([AUTO_DEFINITION, ...ICON_DEFINITIONS])

export function getKmlMarkerIconDefinition (value) {
  const key = String(value || '').trim().toLowerCase()
  if (key === KML_MARKER_ICON_AUTO) return AUTO_DEFINITION
  return ICON_DEFINITION_MAP.get(key) || null
}

export function normalizeKmlMarkerIcon (value, options = {}) {
  const key = String(value || '').trim().toLowerCase()
  if (!key || (options.allowAuto && key === KML_MARKER_ICON_AUTO)) {
    return options.allowAuto ? KML_MARKER_ICON_AUTO : ''
  }
  return ICON_DEFINITION_MAP.has(key) ? key : ''
}

export function isKmlMarkerIcon (value) {
  return Boolean(normalizeKmlMarkerIcon(value))
}

export function renderKmlMarkerIconGlyph (value, options = {}) {
  const definition = getKmlMarkerIconDefinition(value)
  if (!definition) return ''
  const className = String(options.className || '').replace(/[^A-Za-z0-9_-]/g, '')
  const classAttribute = className ? ` class="${className}"` : ''
  return `<svg${classAttribute} viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${definition.glyph}</g></svg>`
}
