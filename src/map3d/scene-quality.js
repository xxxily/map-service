export const QUALITY_PRESETS = Object.freeze({
  economy: Object.freeze({
    maxExaggeration: 1.08,
    maximumScreenSpaceError: 3.5,
    tileCacheSize: 60,
    resolutionCap: 1,
    enableShadows: false,
    enableAmbientOcclusion: false,
    enableHdr: false,
  }),
  balanced: Object.freeze({
    maxExaggeration: 1.2,
    maximumScreenSpaceError: 2,
    tileCacheSize: 100,
    resolutionCap: 1.5,
    enableShadows: false,
    enableAmbientOcclusion: false,
    enableHdr: false,
  }),
  quality: Object.freeze({
    maxExaggeration: 1.35,
    maximumScreenSpaceError: 1.25,
    tileCacheSize: 160,
    resolutionCap: 2,
    enableShadows: true,
    enableAmbientOcclusion: true,
    enableHdr: true,
  }),
})

export const QUALITY_SELECTIONS = Object.freeze([
  'auto',
  ...Object.keys(QUALITY_PRESETS),
])

const PROVIDER_PLANS = Object.freeze({
  'arcgis-terrain3d': Object.freeze({ id: 'arcgis-terrain3d', kind: 'arcgis', label: 'ArcGIS Terrain3D' }),
  'maptiler-quantized-mesh': Object.freeze({ id: 'maptiler-quantized-mesh', kind: 'quantized-mesh', label: 'MapTiler Terrain 3D' }),
  'cesium-world-terrain': Object.freeze({ id: 'cesium-world-terrain', kind: 'cesium-world', label: 'Cesium World Terrain' }),
  'self-hosted': Object.freeze({ id: 'self-hosted', kind: 'quantized-mesh', label: '受控自托管地形' }),
  ellipsoid: Object.freeze({ id: 'ellipsoid', kind: 'ellipsoid', label: '平面椭球体' }),
})

function finiteNumber (value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

/**
 * Keep the user's requested choice separate from the currently applied preset.
 * `auto` intentionally remains visible to the user even though this release
 * applies the conservative balanced preset until dynamic adaptation lands.
 */
export function normalizeQualitySelection (value, fallback = 'balanced') {
  if (QUALITY_SELECTIONS.includes(value)) return value
  return QUALITY_SELECTIONS.includes(fallback) ? fallback : 'balanced'
}

export function normalizeQualityPreset (value, fallback = 'balanced') {
  const selected = normalizeQualitySelection(value, fallback)
  return selected === 'auto' ? 'balanced' : selected
}

export function getRecommendedPixelRatio (devicePixelRatio, quality = 'balanced') {
  const preset = QUALITY_PRESETS[normalizeQualityPreset(quality)]
  return Math.max(0.75, Math.min(preset.resolutionCap, finiteNumber(devicePixelRatio, 1)))
}

export function getTerrainProviderPlan (providerId, options = {}) {
  const normalizedId = Object.hasOwn(PROVIDER_PLANS, providerId) ? providerId : 'arcgis-terrain3d'
  const plan = { ...PROVIDER_PLANS[normalizedId] }
  if (plan.id === 'maptiler-quantized-mesh') {
    const url = typeof options.mapTilerUrl === 'string' ? options.mapTilerUrl.trim() : ''
    if (!url) return { ...PROVIDER_PLANS.ellipsoid, reason: '未配置经审批的 MapTiler 地形服务' }
    plan.url = url
  }
  if (plan.id === 'self-hosted') {
    const url = typeof options.selfHostedUrl === 'string'
      ? options.selfHostedUrl.trim()
      : typeof options.url === 'string' ? options.url.trim() : ''
    if (!url) return { ...PROVIDER_PLANS.ellipsoid, reason: '未配置受控自托管地形地址' }
    plan.url = url
  }
  return plan
}

export function getHeightAdjustedExaggeration (height, quality = 'balanced', requested = undefined) {
  const preset = QUALITY_PRESETS[normalizeQualityPreset(quality)]
  const max = Math.min(preset.maxExaggeration, Math.max(1, finiteNumber(requested, preset.maxExaggeration)))
  const distance = Math.max(0, finiteNumber(height, 0))
  if (distance >= 2_000_000) return 1
  const factor = distance <= 2_000 ? 1 : 1 - ((distance - 2_000) / 1_998_000)
  return 1 + (max - 1) * Math.max(0, Math.min(1, factor))
}

export function applySceneQuality (input, quality = 'balanced', options = {}) {
  const viewer = input?.scene ? input : options.resolutionTarget
  const scene = input?.scene || input
  if (!scene) return null
  const normalized = normalizeQualityPreset(quality)
  const preset = QUALITY_PRESETS[normalized]
  const globe = scene.globe
  const shadows = options.shadowModes || { DISABLED: 0, ENABLED: 1, RECEIVE_ONLY: 3 }

  if (globe) {
    globe.enableLighting = true
    globe.dynamicAtmosphereLighting = true
    globe.dynamicAtmosphereLightingFromSun = true
    globe.showGroundAtmosphere = true
    globe.depthTestAgainstTerrain = true
    globe.maximumScreenSpaceError = preset.maximumScreenSpaceError
    globe.tileCacheSize = preset.tileCacheSize
    globe.preloadAncestors = true
    globe.preloadSiblings = normalized === 'quality'
    globe.shadows = preset.enableShadows ? (shadows.ENABLED ?? 1) : (shadows.RECEIVE_ONLY ?? 3)
  }

  scene.shadows = Boolean(preset.enableShadows)
  scene.highDynamicRange = Boolean(preset.enableHdr && scene.highDynamicRangeSupported !== false)
  if (scene.postProcessStages) {
    scene.postProcessStages.fxaa && (scene.postProcessStages.fxaa.enabled = true)
    scene.postProcessStages.ambientOcclusion && (scene.postProcessStages.ambientOcclusion.enabled = preset.enableAmbientOcclusion)
  }
  if (viewer) {
    viewer.resolutionScale = getRecommendedPixelRatio(options.devicePixelRatio, normalized)
  }

  return { id: normalized, ...preset, resolutionScale: getRecommendedPixelRatio(options.devicePixelRatio, normalized) }
}

export function formatTerrainStatus (state, detail = '') {
  const suffix = detail ? ` · ${detail}` : ''
  const labels = {
    standby: '地形：等待进入 3D 模式',
    disabled: '地形：平面模式',
    loading: '地形：正在加载真实地形',
    verifying: '地形：正在验证真实高程',
    active: '地形：真实地形已验证',
    degraded: '地形：局部异常，保留当前视图',
    fallback: '地形：已回退平面模式',
  }
  return `${labels[state] || labels.fallback}${suffix}`
}

export function formatCompactTerrainStatus (state, detail = '') {
  const labels = {
    standby: '地形待命',
    disabled: '平面模式',
    loading: '地形加载中',
    verifying: '地形校验中',
    active: '真实地形',
    degraded: '地形异常',
    fallback: '平面模式',
  }
  const label = labels[state] || labels.fallback
  if (state !== 'active') return label
  const normalizedDetail = String(detail || '').trim().replace(/x$/i, '×')
  return normalizedDetail ? `${label} ${normalizedDetail}` : label
}
