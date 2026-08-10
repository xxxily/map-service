import { getPrimaryFeatureContentType } from '../../shared/kml-content.js'

const TYPE_LABELS = {
  image: '包含图片',
  video: '包含视频',
  audio: '包含音频',
  iframe: '包含页面',
  link: '包含链接',
}
const TYPE_COLORS = {
  image: '#0f766e',
  video: '#dc2626',
  audio: '#7c3aed',
  iframe: '#2563eb',
  link: '#475569',
}
const TYPE_ICON_PATHS = {
  image: '<rect x="8" y="8" width="16" height="13" rx="2"/><circle cx="13" cy="12.5" r="1.5"/><path d="m9.5 19 4.5-4 3 2.5 2-2 3.5 3.5"/>',
  video: '<rect x="8" y="8" width="16" height="13" rx="2"/><path d="m14 12 5 3-5 3z"/>',
  audio: '<path d="M9 14h3l4-4v10l-4-4H9z"/><path d="M19 12.5a4 4 0 0 1 0 5M21 10a7 7 0 0 1 0 10"/>',
  iframe: '<rect x="8" y="8" width="16" height="13" rx="2"/><path d="M8 12h16M11 10h.01M14 10h.01"/>',
  link: '<path d="M13.5 17.5 12 19a3 3 0 0 1-4.2-4.2l2.5-2.5a3 3 0 0 1 4.2 0M18.5 12.5 20 11a3 3 0 0 1 4.2 4.2l-2.5 2.5a3 3 0 0 1-4.2 0M12.5 15.5h7"/>',
}

function renderMarkerSvg (type) {
  const color = TYPE_COLORS[type]
  const iconPaths = TYPE_ICON_PATHS[type]
  if (!color || !iconPaths) return ''
  return `<svg viewBox="0 0 32 40" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path class="kml-media-marker-pin" fill="${color}" d="M16 1C7.9 1 3 6.7 3 14.1 3 24.2 16 38.5 16 38.5S29 24.2 29 14.1C29 6.7 24.1 1 16 1Z"/><path fill="none" stroke="rgba(255,255,255,.9)" stroke-width="1.2" d="M16 2.5C8.9 2.5 4.5 7.4 4.5 14.1c0 8.1 9.2 19.5 11.5 22.3 2.3-2.8 11.5-14.2 11.5-22.3C27.5 7.4 23.1 2.5 16 2.5Z"/><g fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${iconPaths}</g></svg>`
}

export function getKmlMediaMarkerDescriptor (feature) {
  const type = getPrimaryFeatureContentType(feature)
  if (!TYPE_LABELS[type]) return null
  return {
    type,
    label: TYPE_LABELS[type],
    html: `<span class="kml-media-marker kml-media-marker-${type}" role="img" aria-label="${TYPE_LABELS[type]}">${renderMarkerSvg(type)}</span>`,
    iconSize: [32, 40],
    iconAnchor: [16, 39],
    popupAnchor: [0, -36],
    // 与 KML 点位通用偏移 [-16, -18] 叠加后为 [0, -44]，留在图标正上方。
    tooltipAnchor: [16, -26],
  }
}

export function getKmlMediaBillboard (feature) {
  const descriptor = getKmlMediaMarkerDescriptor(feature)
  if (!descriptor) return null
  const svg = renderMarkerSvg(descriptor.type)
  return {
    ...descriptor,
    image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  }
}

export function getKmlMediaListIcon (feature) {
  const descriptor = getKmlMediaMarkerDescriptor(feature)
  if (!descriptor) return ''
  return `<svg class="svg-icon kml-media-list-icon kml-media-list-icon-${descriptor.type}" viewBox="0 0 32 30" role="img" aria-label="${descriptor.label}" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${TYPE_ICON_PATHS[descriptor.type]}</g></svg>`
}
