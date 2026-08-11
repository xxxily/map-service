const LEGACY_UNNAMED_POINT_PATTERN = /^未命名(?:点位|要素(?:\s*\d+)?)$/

export function getKmlFeatureDisplayName (feature) {
  const name = String(feature?.name || '').trim()
  if (feature?.type === 'Point' && LEGACY_UNNAMED_POINT_PATTERN.test(name)) return ''
  return name
}

export function getKmlFeatureFallbackName (feature) {
  if (feature?.type === 'LineString') return '未命名线段'
  if (feature?.type === 'Polygon') return '未命名区域'
  return '未命名点位'
}

export function getKmlFeatureNamePresentation (feature) {
  const featureName = getKmlFeatureDisplayName(feature)
  const fallbackName = getKmlFeatureFallbackName(feature)
  const displayName = featureName || (feature?.type === 'Point' ? '' : fallbackName)
  return {
    displayName,
    accessibleName: displayName || fallbackName,
  }
}
