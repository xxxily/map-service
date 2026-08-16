import {
  getPrimaryFeatureContentProvider,
  getPrimaryFeatureContentType,
} from '../../shared/kml-content.js'
import {
  getKmlMarkerIconDefinition,
  normalizeKmlMarkerIcon,
} from '../../shared/kml-marker-icons.js'

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

const DOUYIN_LOGO_PATH = 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07'

const DOUYIN_LOGO = `<g class="kml-provider-logo kml-provider-logo-douyin" stroke="none">
  <circle cx="16" cy="13.6" r="8.8" fill="#050505"/>
  <path d="${DOUYIN_LOGO_PATH}" transform="translate(8.4 5.5) scale(.58)" fill="#25f4ee"/>
  <path d="${DOUYIN_LOGO_PATH}" transform="translate(9.6 6.2) scale(.58)" fill="#fe2c55"/>
  <path d="${DOUYIN_LOGO_PATH}" transform="translate(9 5.85) scale(.58)" fill="#fff"/>
</g>`

const YUN720_LOGO = `<g class="kml-provider-logo kml-provider-logo-720yun" fill="none" stroke="#51575d" stroke-linecap="round" stroke-linejoin="round">
  <path d="M22.4 7.7A8.3 8.3 0 1 0 24 11" stroke-width="1.65"/>
  <circle cx="22.9" cy="7.4" r="1.55" fill="#51575d" stroke="none"/>
  <path d="M10.3 11.2h3.7l-2.6 5.9" stroke-width="1.55"/>
  <path d="M15.1 12.2c.5-1.5 3.5-1.5 3.5.4 0 1.2-3.4 2.3-3.4 4.5h3.5" stroke-width="1.55"/>
  <path d="M21.1 11.2c-1 0-1.6.9-1.6 3s.6 3 1.6 3 1.6-.9 1.6-3-.6-3-1.6-3Z" stroke-width="1.55"/>
</g>`

const PROVIDER_MARKERS = {
  douyin: {
    type: 'douyin',
    label: '抖音视频',
    color: '#050505',
    iconPaths: DOUYIN_LOGO,
  },
  '720yun': {
    type: '720yun',
    label: '720 云全景',
    color: '#51575d',
    pinColor: '#ffffff',
    pinOutline: '#51575d',
    iconPaths: YUN720_LOGO,
  },
}

function getMarkerModel (feature) {
  const explicitIcon = normalizeKmlMarkerIcon(feature?.markerIcon)
  if (explicitIcon) {
    const definition = getKmlMarkerIconDefinition(explicitIcon)
    return definition
      ? {
          type: 'custom',
          iconKey: explicitIcon,
          label: definition.label,
          color: definition.color,
          iconPaths: definition.glyph,
        }
      : null
  }

  const provider = getPrimaryFeatureContentProvider(feature)
  if (provider && PROVIDER_MARKERS[provider]) return PROVIDER_MARKERS[provider]

  const type = getPrimaryFeatureContentType(feature)
  if (!TYPE_LABELS[type]) return null
  return {
    type,
    label: TYPE_LABELS[type],
    color: TYPE_COLORS[type],
    iconPaths: TYPE_ICON_PATHS[type],
  }
}

function renderMarkerSvg (model) {
  if (!model?.color || !model?.iconPaths) return ''
  const transform = model.iconKey ? ' transform="translate(4 4)"' : ''
  const pinColor = model.pinColor || model.color
  const pinOutline = model.pinOutline || 'rgba(255,255,255,.9)'
  return `<svg viewBox="0 0 32 40" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path class="kml-media-marker-pin" fill="${pinColor}" d="M16 1C7.9 1 3 6.7 3 14.1 3 24.2 16 38.5 16 38.5S29 24.2 29 14.1C29 6.7 24.1 1 16 1Z"/><path fill="none" stroke="${pinOutline}" stroke-width="1.2" d="M16 2.5C8.9 2.5 4.5 7.4 4.5 14.1c0 8.1 9.2 19.5 11.5 22.3 2.3-2.8 11.5-14.2 11.5-22.3C27.5 7.4 23.1 2.5 16 2.5Z"/><g${transform} fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${model.iconPaths}</g></svg>`
}

export function getKmlMediaMarkerDescriptor (feature) {
  const model = getMarkerModel(feature)
  if (!model) return null
  return {
    type: model.type,
    iconKey: model.iconKey || '',
    label: model.label,
    html: `<span class="kml-media-marker kml-media-marker-${model.type}" role="img" aria-label="${model.label}">${renderMarkerSvg(model)}</span>`,
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
  const model = getMarkerModel(feature)
  const svg = renderMarkerSvg(model)
  return {
    ...descriptor,
    image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  }
}

export function getKmlMediaListIcon (feature) {
  const descriptor = getKmlMediaMarkerDescriptor(feature)
  if (!descriptor) return ''
  const model = getMarkerModel(feature)
  const glyph = model?.iconPaths || ''
  if (!glyph) return ''
  if (model?.iconKey) {
    return `<svg class="svg-icon kml-media-list-icon kml-media-list-icon-${descriptor.type}" style="color:${model.color}" viewBox="0 0 24 24" role="img" aria-label="${descriptor.label}" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`
  }
  return `<svg class="svg-icon kml-media-list-icon kml-media-list-icon-${descriptor.type}" style="color:${model.color}" viewBox="0 0 32 30" role="img" aria-label="${descriptor.label}" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`
}
