import { getFeatureDescriptionText } from '../../shared/kml-content.js'

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeFeatureCount (value) {
  const count = Number(value)
  return Number.isSafeInteger(count) && count >= 0 ? count : 0
}

export function buildKmlFileOverview (kmlFile = {}) {
  const features = Array.isArray(kmlFile.features) ? kmlFile.features : null
  const declaredFeatureCount = normalizeFeatureCount(kmlFile.featureCount)
  const hasLoadedFeatures = Boolean(features && (features.length > 0 || declaredFeatureCount === 0))
  const typeCounts = { Point: 0, LineString: 0, Polygon: 0 }
  if (features) {
    features.forEach(feature => {
      if (Object.prototype.hasOwnProperty.call(typeCounts, feature?.type)) typeCounts[feature.type] += 1
    })
  }
  return {
    name: String(kmlFile.name || '未命名 KML').slice(0, 200),
    descriptionText: getFeatureDescriptionText(kmlFile.description).slice(0, 5000),
    featureCount: features?.length || declaredFeatureCount,
    hasLoadedFeatures,
    typeCounts,
  }
}

function renderTypeStats (overview) {
  if (!overview.hasLoadedFeatures) return ''
  const stats = [
    overview.typeCounts.Point ? `${overview.typeCounts.Point} 个点位` : '',
    overview.typeCounts.LineString ? `${overview.typeCounts.LineString} 条线` : '',
    overview.typeCounts.Polygon ? `${overview.typeCounts.Polygon} 个面` : '',
  ].filter(Boolean)
  return stats.map(value => `<span>${escapeHtml(value)}</span>`).join('')
}

export function renderKmlFileOverview (kmlFile = {}) {
  const overview = buildKmlFileOverview(kmlFile)
  return `
    <section class="kml-file-overview" aria-label="KML 文件详情">
      <header>
        <span>KML 详情</span>
        <small>${overview.featureCount.toLocaleString()} 个要素</small>
      </header>
      <p class="${overview.descriptionText ? '' : 'is-empty'}">${escapeHtml(overview.descriptionText || '暂无文件介绍')}</p>
      <div class="kml-file-overview-stats">${renderTypeStats(overview)}</div>
    </section>
  `
}
