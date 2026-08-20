import {
  Viewer,
  UrlTemplateImageryProvider,
  Cartesian2,
  Cartesian3,
  Cartographic,
  BoundingSphere,
  HeadingPitchRange,
  CesiumTerrainProvider,
  ArcGISTiledElevationTerrainProvider,
  EllipsoidTerrainProvider,
  Ion,
  Terrain,
  ShadowMode,
  Math as CesiumMath,
  sampleTerrain,
} from 'cesium'
import * as Cesium from 'cesium'
import AMapLoader from '@amap/amap-jsapi-loader'

import 'cesium/Source/Widgets/widgets.css'
import './styles.css'
import './map3d-styles.css'

import { initAdminApp } from './admin/dashboard.js'
import { isAdminLocation } from './admin/routes.js'
import { initIdentityEntry } from './auth/identity.js'
import { amapConfig, map3dCameraInteractionConfig, terrainConfig } from './config.js'
import { initAfterAccessCheck } from './map/access-control.js'
import { getActiveShare, getShareSpatialConfig, isShareLocation, prepareShareView } from './map/share-view.js'
import { initFavoriteActions } from './map/favorite-actions.js'
import { initAmapGeolocation } from './map/geolocation.js'
import { registerServiceWorker } from './pwa.js'
import { initGuidelines3d, toggleGuidelineMode3d } from './map3d/guidelines.js'
import { initKmlSupport3d } from './map3d/kml.js'
import {
  updatePosition3d,
  intervalLocationState3d,
  configureIntervalLocation3d,
  startIntervalLocation3d,
  stopIntervalLocation3d,
  setLocationCameraInteraction3d,
  cancelLocationCamera3d,
  destroyLocationCamera3d,
  initLocationHistoryPanel3d
} from './map3d/location.js'
import {
  applyContinuousLocationButtonState,
  formatContinuousLocationState,
} from './map/continuous-location.js'
import { showChoiceDialog, showEditDialog, showAlert } from './ui/dialog.js'
import { initAmapSearch3d, toggleSearchMode3d } from './map3d/search.js'
import {
  MAX_LOCATION_HISTORY_POINTS,
  MAX_LOCATION_INTERVAL_SECONDS,
  parseBoundedInteger,
} from './map/location-track.js'
import { installMap3dCameraInteraction } from './map3d/camera-interaction.js'
import {
  applySceneQuality,
  formatCompactTerrainStatus,
  formatTerrainStatus,
  getHeightAdjustedExaggeration,
  getTerrainProviderPlan,
  normalizeQualitySelection,
  normalizeQualityPreset,
} from './map3d/scene-quality.js'
import { getMotionSafeDuration } from './map3d/motion.js'
import {
  createTerrainRuntimeState,
  createTerrainAutoRetryState,
  canStartTerrainAutoRetry,
  consumeTerrainAutoRetryAttempt,
  evaluateTerrainVerification,
  getTerrainAutoRetryDelayMs,
  getSafeTerrainRuntimeOverride,
  getTerrainRetryControlState,
  pickSceneWorldPosition,
  reduceTerrainRuntime,
  TERRAIN_VERIFICATION_LEVEL,
  TERRAIN_VERIFICATION_REGIONS,
  TERRAIN_VERIFICATION_TIMEOUT_MS,
} from './map3d/terrain-runtime.js'

// 配置 Cesium 资源基础路径
window.CESIUM_BASE_URL = '/cesium/'

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''

function renderAppVersion () {
  const versionNode = document.getElementById('app-version')
  if (versionNode && APP_VERSION) {
    versionNode.textContent = `v${APP_VERSION}`
  }
}

async function loadAmap () {
  window._AMapSecurityConfig = {
    securityJsCode: amapConfig.securityJsCode,
  }

  return AMapLoader.load({
    key: amapConfig.key,
    version: '2.0',
    plugins: amapConfig.plugins,
  }).catch((err) => {
    console.warn('高德 JSAPI 加载失败，搜索功能不可用', err)
    return null
  })
}

// 2D 缩放级（Zoom）与 3D 相机高度（Height，单位：米）的指数映射转换公式
function zoomToHeight (zoom) {
  return 20000000.0 / Math.pow(2, zoom)
}

function heightToZoom (height) {
  const z = Math.log2(20000000.0 / height)
  return Math.max(1, Math.min(18, Math.round(z)))
}

// 经典的 JavaScript 防抖处理函数
function debounce (func, wait) {
  let timeout
  return function (...args) {
    const context = this
    clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(context, args), wait)
  }
}

let globalCatalogLayers = []
let globalCatalogSources = new Map()
const VECTOR_3D_UNSUPPORTED_KINDS = new Set(['mvt', 'vector-tilejson', 'vector-style', 'pmtiles-vector'])
const PMTILES_3D_KINDS = new Set(['pmtiles-vector', 'pmtiles-raster'])
const FALLBACK_3D_CATALOG = {
  sources: [
    {
      id: 'amap-satellite',
      tileUrl: '/api/v1/tiles/amap-satellite/{z}/{x}/{y}',
      minZoom: 3,
      maxZoom: 18,
      maxNativeZoom: 18,
      tileSize: 256,
    },
    {
      id: 'amap-road',
      tileUrl: '/api/v1/tiles/amap-road/{z}/{x}/{y}',
      minZoom: 3,
      maxZoom: 18,
      maxNativeZoom: 18,
      tileSize: 256,
    },
  ],
  layers: [
    {
      id: 'amap-hybrid',
      name: '高德/卫星',
      enabled: true,
      default: true,
      clients: ['2d', '3d'],
      minZoom: 3,
      maxZoom: 18,
      items: [
        { sourceId: 'amap-satellite', opacity: 1 },
        { sourceId: 'amap-road', opacity: 0.5 },
      ],
    },
  ],
}

function escapeHtml (str) {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function isCesiumRasterSource (source = {}) {
  if (!source || VECTOR_3D_UNSUPPORTED_KINDS.has(source.kind) || PMTILES_3D_KINDS.has(source.kind)) return false
  const tileUrl = source.tileUrl || ''
  return Boolean(tileUrl && !tileUrl.endsWith('.pbf'))
}

function resolveCesiumRasterSource (source = {}) {
  if (isCesiumRasterSource(source)) return source
  const fallbackSourceId = source.rendering?.fallbackRasterSourceId || ''
  return fallbackSourceId ? globalCatalogSources.get(fallbackSourceId) : null
}

function isCesiumRenderableLayer (layer = {}) {
  return (layer.items || []).some((item) => {
    const source = globalCatalogSources.get(item.sourceId)
    return isCesiumRasterSource(resolveCesiumRasterSource(source))
  })
}

let viewer = null
let isRotating = false
let lastTime = 0
let interactionMode = '2d'
let amapGeolocation = null
let cameraInteraction = null
let terrainRuntime = createTerrainRuntimeState()
let terrainAutoRetry = createTerrainAutoRetryState()
let lastTerrainExaggeration = null
const spinRate = 0.035 // 自转速度（弧度/秒）
const MIN_CAMERA_HEIGHT = 150.0
const MAX_CAMERA_DISTANCE = 18000000.0
const MIN_CAMERA_PITCH = CesiumMath.toRadians(-85.0)
const MAX_CAMERA_PITCH = CesiumMath.toRadians(-15.0)
const ARCGIS_TERRAIN3D_URL = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'
const TERRAIN_LOAD_TIMEOUT_MS = 20_000

function isMapToolInteractionActive () {
  return Boolean(
    (typeof window.getIsGuidelineModeActive === 'function' && window.getIsGuidelineModeActive()) ||
    (typeof window.getIsKmlPickupModeActive === 'function' && window.getIsKmlPickupModeActive())
  )
}

function getCameraHeight () {
  return viewer?.camera?.positionCartographic?.height || 8000000.0
}

function getCameraAnimationDuration (duration) {
  try {
    return getMotionSafeDuration(
      duration,
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    )
  } catch {
    return getMotionSafeDuration(duration)
  }
}

function setInteractionMode (mode, options = {}) {
  const nextMode = mode === '3d' ? '3d' : '2d'
  const previousMode = interactionMode
  interactionMode = nextMode
  window.getMap3dInteractionMode = () => interactionMode

  if (interactionMode === '3d') {
    if (previousMode !== '3d' && options.tilt !== false) {
      enableConfiguredTerrain()
      const camera = viewer?.camera
      if (camera) {
        camera.flyTo({
          destination: camera.position,
          orientation: {
            heading: camera.heading,
            pitch: CesiumMath.toRadians(-52),
            roll: 0,
          },
          duration: getCameraAnimationDuration(options.duration ?? 0.45),
        })
      }
    } else if (previousMode !== '3d') {
      enableConfiguredTerrain()
    }
  } else {
    if (options.flatten !== false && previousMode !== '2d') {
      flattenCameraView({ keepHeading: true, duration: 0.35 })
    }
  }

  const button = document.getElementById('map3d-mode-toggle')
  if (!button) return

  const is3d = interactionMode === '3d'
  button.classList.toggle('is-3d', is3d)
  button.setAttribute('aria-pressed', String(is3d))
  button.setAttribute(
    'aria-label',
    is3d ? '当前为 3D 操作模式，切换到 2D 操作模式' : '当前为 2D 操作模式，切换到 3D 操作模式',
  )
  button.title = is3d ? '切换到 2D 操作模式' : '切换到 3D 操作模式'
  const text = button.querySelector('span')
  if (text) {
    text.textContent = is3d ? '3D' : '2D'
  }
  document.body.classList.toggle('map3d-interaction-3d', is3d)
}

function flattenCameraView (options = {}) {
  if (!viewer) return
  const {
    keepHeading = true,
    duration = 0.4,
  } = options
  const camera = viewer.camera
  camera.flyTo({
    destination: camera.position,
    orientation: {
      heading: keepHeading ? camera.heading : 0.0,
      pitch: CesiumMath.toRadians(-90.0),
      roll: 0.0,
    },
    duration: getCameraAnimationDuration(duration),
  })
}

function updateTerrainStatus (message, state = '') {
  const statusEl = document.getElementById('terrain-status')
  if (statusEl) {
    statusEl.textContent = message
    statusEl.classList.remove('is-ready', 'is-warn', 'is-error')
    if (state) {
      statusEl.classList.add(`is-${state}`)
    }
  }

  const retryButton = document.getElementById('terrain-retry-btn')
  const statusPanel = document.getElementById('terrain-status-panel')
  if (!retryButton) return
  const control = getTerrainRetryControlState(terrainRuntime.state)
  retryButton.hidden = control.hidden
  retryButton.disabled = control.disabled
  retryButton.setAttribute('aria-busy', String(control.busy))
  retryButton.setAttribute('aria-disabled', String(control.disabled))
  if (statusPanel) statusPanel.hidden = control.hidden
}

function getEffectiveTerrainConfig () {
  const override = getSafeTerrainRuntimeOverride(
    typeof window !== 'undefined' ? window.mapServiceTerrainConfig : null,
  )
  const provider = String(override.provider ?? terrainConfig.provider ?? 'arcgis-terrain3d')
  const qualitySelection = normalizeQualitySelection(
    override.quality ?? terrainConfig.quality ?? 'auto',
    'auto',
  )
  return {
    ...terrainConfig,
    ...override,
    provider,
    // URLs and credentials are deliberately not runtime-overridable.
    selfHostedUrl: terrainConfig.selfHostedUrl ?? '',
    mapTilerUrl: terrainConfig.mapTilerUrl ?? '',
    ionToken: terrainConfig.ionToken ?? '',
    // `auto` is a visible user choice; this release conservatively applies
    // balanced until frame-time based adaptation is available.
    quality: normalizeQualityPreset(qualitySelection),
    qualitySelection,
    demoView: {
      ...terrainConfig.demoView,
      ...(override.demoView || {}),
    },
  }
}

function applyCurrentSceneQuality () {
  if (!viewer) return null
  const config = getEffectiveTerrainConfig()
  return applySceneQuality(viewer, config.quality, {
    devicePixelRatio: window.devicePixelRatio,
    shadowModes: ShadowMode,
  })
}

function configureMapCanvasAccessibility () {
  const canvas = viewer?.canvas
  if (!canvas) return
  canvas.setAttribute('aria-label', '三维地图。聚焦后可使用方向键平移，使用加号或减号缩放。')
  const existingDescription = canvas.getAttribute('aria-describedby') || ''
  const descriptionIds = new Set(existingDescription.split(/\s+/).filter(Boolean))
  descriptionIds.add('map3d-keyboard-help')
  canvas.setAttribute('aria-describedby', [...descriptionIds].join(' '))
}

function getTerrainStatusStyle (state = terrainRuntime.state) {
  if (state === 'active') return 'ready'
  if (state === 'fallback') return 'error'
  return 'warn'
}

function renderTerrainStatus (detail = terrainRuntime.statusDetail || '') {
  let safeDetail = detail
  if (terrainRuntime.state === 'active' && terrainRuntime.verified && viewer?.scene) {
    updateTerrainExaggeration()
    safeDetail = `${viewer.scene.verticalExaggeration.toFixed(2)}x`
  }
  terrainRuntime.statusDetail = safeDetail
  updateTerrainStatus(
    formatTerrainStatus(terrainRuntime.state, safeDetail),
    getTerrainStatusStyle(),
  )
  updateCameraStatus()
}

function updateTerrainExaggeration (options = {}) {
  const force = options.force === true
  if (!viewer || !['loading', 'verifying', 'active', 'degraded'].includes(terrainRuntime.state)) return
  const config = getEffectiveTerrainConfig()
  const nextExaggeration = terrainRuntime.verified
    ? getHeightAdjustedExaggeration(
        getCameraHeight(),
        config.quality,
        config.exaggeration,
      )
    : 1
  const currentExaggeration = Number(viewer.scene.verticalExaggeration)
  if (!force && Number.isFinite(currentExaggeration) &&
    Math.abs(currentExaggeration - nextExaggeration) < 0.002 &&
    Math.abs((lastTerrainExaggeration ?? currentExaggeration) - nextExaggeration) < 0.002) {
    return
  }
  viewer.scene.verticalExaggeration = nextExaggeration
  viewer.scene.verticalExaggerationRelativeHeight = 0
  lastTerrainExaggeration = nextExaggeration
  cameraInteraction?.constrain?.()
}

function clearTerrainVerificationTimeout (runtime = terrainRuntime) {
  if (runtime.verificationTimeoutId !== null) {
    window.clearTimeout(runtime.verificationTimeoutId)
    runtime.verificationTimeoutId = null
  }
}

function clearTerrainAttemptResources (runtime = terrainRuntime) {
  if (runtime.timeoutId !== null) {
    window.clearTimeout(runtime.timeoutId)
    runtime.timeoutId = null
  }
  clearTerrainVerificationTimeout(runtime)
  for (const removeListener of runtime.listenerRemovers || []) {
    try {
      removeListener()
    } catch {
      // Provider completion can overlap listener cleanup.
    }
  }
  runtime.listenerRemovers = []
}

function replaceTerrainRuntime (next) {
  const loadId = terrainRuntime.loadId + 1
  clearTerrainAttemptResources()
  terrainRuntime = createTerrainRuntimeState({
    ...next,
    loadId,
  })
  return loadId
}

function clearTerrainAutoRetry () {
  if (terrainAutoRetry.timerId !== null) {
    window.clearTimeout(terrainAutoRetry.timerId)
  }
  terrainAutoRetry.timerId = null
  terrainAutoRetry.nextRetryAt = 0
}

function resetTerrainAutoRetry (key = '') {
  clearTerrainAutoRetry()
  terrainAutoRetry = createTerrainAutoRetryState({ key })
}

function ensureTerrainAutoRetryKey (key) {
  if (terrainAutoRetry.key !== key) {
    resetTerrainAutoRetry(key)
  }
}

function scheduleTerrainAutoRetry (terrainKey) {
  if (!terrainKey) return null
  ensureTerrainAutoRetryKey(terrainKey)
  if (terrainAutoRetry.timerId !== null) {
    return Math.max(0, terrainAutoRetry.nextRetryAt - Date.now())
  }

  const delay = getTerrainAutoRetryDelayMs(terrainAutoRetry.attempts)
  if (delay === null) return null

  terrainAutoRetry.nextRetryAt = Date.now() + delay
  terrainAutoRetry.timerId = window.setTimeout(() => {
    terrainAutoRetry.timerId = null
    terrainAutoRetry.nextRetryAt = 0
    if (!viewer || viewer.isDestroyed()) return
    if (!canStartTerrainAutoRetry({
      interactionMode,
      key: terrainAutoRetry.key,
      runtimeKey: terrainRuntime.key,
      state: terrainRuntime.state,
      autoRetryEligible: terrainRuntime.autoRetryEligible,
    })) return
    const retryAttempt = consumeTerrainAutoRetryAttempt(terrainAutoRetry)
    if (!retryAttempt.started) return
    terrainAutoRetry = retryAttempt.state
    enableConfiguredTerrain({ force: true, autoRetry: true })
  }, delay)
  return delay
}

function setEllipsoidTerrain (state, reason, options = {}) {
  if (!viewer || viewer.isDestroyed()) return
  const previousRuntime = terrainRuntime
  const terrainKey = options.key ?? (state === 'fallback' ? previousRuntime.key : '')
  const providerId = state === 'fallback'
    ? options.providerId ?? previousRuntime.providerId
    : 'ellipsoid'
  const nextRuntime = reduceTerrainRuntime(createTerrainRuntimeState({
    key: terrainKey,
    providerId,
    autoRetryEligible: options.autoRetryEligible === true,
    statusDetail: reason,
  }), {
    type: state === 'fallback' ? 'fallback' : 'disabled',
  })

  replaceTerrainRuntime(nextRuntime)
  // Cesium 1.142: assignment cancels `setTerrain`'s pending ready listener.
  viewer.scene.terrainProvider = new EllipsoidTerrainProvider()
  viewer.scene.verticalExaggeration = 1
  viewer.scene.verticalExaggerationRelativeHeight = 0
  lastTerrainExaggeration = 1
  applySceneQuality(viewer, 'economy', {
    devicePixelRatio: window.devicePixelRatio,
    shadowModes: ShadowMode,
  })
  renderTerrainStatus(reason)
}

function fallbackToEllipsoidTerrain (reason = '服务不可用', options = {}) {
  const terrainKey = options.key ?? terrainRuntime.key
  const providerId = options.providerId ?? terrainRuntime.providerId
  const autoRetryEligible = options.autoRetry === true
  setEllipsoidTerrain('fallback', reason, {
    key: terrainKey,
    providerId,
    autoRetryEligible,
  })
  console.warn('3D terrain unavailable; using ellipsoid fallback.')

  if (autoRetryEligible) {
    const delay = scheduleTerrainAutoRetry(terrainKey)
    if (delay !== null) {
      renderTerrainStatus(`${reason}，${Math.max(1, Math.ceil(delay / 1000))} 秒后自动重试`)
    }
  }
}

function useFlatTerrain (reason = '配置关闭') {
  resetTerrainAutoRetry()
  setEllipsoidTerrain('disabled', reason)
}

function markTerrainDegraded (detail, loadId) {
  if (!viewer || viewer.isDestroyed() || terrainRuntime.loadId !== loadId) return false
  clearTerrainVerificationTimeout()
  const nextRuntime = reduceTerrainRuntime(terrainRuntime, { type: 'verification-failed' })
  if (nextRuntime.state !== 'degraded') return false
  terrainRuntime = nextRuntime
  terrainRuntime.statusDetail = detail
  updateTerrainExaggeration({ force: true })
  renderTerrainStatus(detail)
  return true
}

function verifyTerrainProvider (provider, loadId) {
  if (!provider || terrainRuntime.loadId !== loadId || terrainRuntime.verificationStarted ||
    terrainRuntime.state !== 'verifying') return
  const regionSamples = TERRAIN_VERIFICATION_REGIONS.map(region => ({
    id: region.id,
    samples: region.positions.map(([lng, lat]) => Cartographic.fromDegrees(lng, lat)),
  }))
  const samples = regionSamples.flatMap(region => region.samples)
  terrainRuntime.verificationStarted = true
  renderTerrainStatus('')

  terrainRuntime.verificationTimeoutId = window.setTimeout(() => {
    if (terrainRuntime.loadId !== loadId || terrainRuntime.state !== 'verifying') return
    markTerrainDegraded('高程自检超时', loadId)
  }, TERRAIN_VERIFICATION_TIMEOUT_MS)

  sampleTerrain(provider, TERRAIN_VERIFICATION_LEVEL, samples).then((results) => {
    if (terrainRuntime.loadId !== loadId) return
    clearTerrainVerificationTimeout()
    if (terrainRuntime.state !== 'verifying') return

    let offset = 0
    const verifiedRegions = regionSamples.map(region => {
      const regionResults = results.slice(offset, offset + region.samples.length)
      offset += region.samples.length
      return { id: region.id, samples: regionResults }
    })
    const verification = evaluateTerrainVerification(verifiedRegions)
    if (!verification.verified) {
      markTerrainDegraded('高程自检未确认', loadId)
      return
    }

    const nextRuntime = reduceTerrainRuntime(terrainRuntime, { type: 'verification-passed' })
    // A provider tile error may have changed the state while sampling was in flight.
    if (nextRuntime.state !== 'active') return
    terrainRuntime = nextRuntime
    resetTerrainAutoRetry(terrainRuntime.key)
    updateTerrainExaggeration({ force: true })
    renderTerrainStatus()
  }).catch(() => {
    if (terrainRuntime.loadId !== loadId) return
    clearTerrainVerificationTimeout()
    if (terrainRuntime.state !== 'verifying') return
    markTerrainDegraded('高程自检暂不可用', loadId)
  })
}

function getTerrainKey (config) {
  return [
    config.enabled ? '1' : '0',
    config.provider || 'arcgis-terrain3d',
    config.selfHostedUrl || '',
    config.mapTilerUrl || '',
    config.ionToken || '',
  ].join('|')
}

function enableConfiguredTerrain (options = {}) {
  if (!viewer) return
  const force = options.force === true
  const manualRetry = options.manual === true
  const autoRetry = options.autoRetry === true
  const config = getEffectiveTerrainConfig()
  let terrainKey = getTerrainKey(config)
  let providerId = config.provider || 'arcgis-terrain3d'

  if (!config.enabled || config.provider === 'none' || config.provider === 'ellipsoid') {
    useFlatTerrain('配置关闭')
    return
  }

  try {
    const plan = getTerrainProviderPlan(config.provider, {
      mapTilerUrl: config.mapTilerUrl,
      selfHostedUrl: config.selfHostedUrl,
    })
    providerId = plan.id
    terrainKey = getTerrainKey({
      ...config,
      provider: plan.id,
      selfHostedUrl: plan.id === 'self-hosted' ? plan.url || '' : '',
      mapTilerUrl: plan.id === 'maptiler-quantized-mesh' ? plan.url || '' : '',
    })

    if (manualRetry) {
      resetTerrainAutoRetry(terrainKey)
    } else if (!autoRetry) {
      ensureTerrainAutoRetryKey(terrainKey)
    }

    // 同配置复用必须先命中缓存，且回退后只能等待受控退避或用户手动重试。
    if (!force && terrainRuntime.key === terrainKey) {
      if (terrainRuntime.terrain) {
        applyCurrentSceneQuality()
        updateTerrainExaggeration({ force: true })
        renderTerrainStatus()
        return
      }
      if (terrainRuntime.state === 'fallback') {
        if (terrainRuntime.autoRetryEligible === true) {
          const delay = scheduleTerrainAutoRetry(terrainKey)
          if (delay !== null) {
            const reason = terrainRuntime.statusDetail || '服务不可用'
            renderTerrainStatus(`${reason.split('，')[0]}，${Math.max(1, Math.ceil(delay / 1000))} 秒后自动重试`)
            return
          }
        }
        renderTerrainStatus()
        return
      }
    }

    if (plan.id === 'ellipsoid') {
      fallbackToEllipsoidTerrain(plan.reason || '未配置可用地形源', {
        key: terrainKey,
        providerId: plan.id,
      })
      return
    }

    if (plan.kind === 'cesium-world' && !config.ionToken) {
      fallbackToEllipsoidTerrain('未配置受控访问凭据', {
        key: terrainKey,
        providerId: plan.id,
      })
      return
    }

    if (plan.kind === 'cesium-world') {
      Ion.defaultAccessToken = config.ionToken
    }

    applyCurrentSceneQuality()

    let terrain
    if (plan.kind === 'arcgis') {
      terrain = new Terrain(ArcGISTiledElevationTerrainProvider.fromUrl(ARCGIS_TERRAIN3D_URL))
    } else if (plan.kind === 'quantized-mesh') {
      const terrainUrl = plan.url || ''
      if (!terrainUrl) {
        fallbackToEllipsoidTerrain('未配置受控地形地址', {
          key: terrainKey,
          providerId: plan.id,
        })
        return
      }
      terrain = new Terrain(CesiumTerrainProvider.fromUrl(terrainUrl, {
        requestWaterMask: true,
        requestVertexNormals: true,
      }))
    } else {
      terrain = Terrain.fromWorldTerrain({
        requestWaterMask: true,
        requestVertexNormals: true,
      })
    }

    const loadId = replaceTerrainRuntime({
      ...reduceTerrainRuntime(createTerrainRuntimeState(), { type: 'load' }),
      key: terrainKey,
      terrain,
      providerId: plan.id,
      autoRetryEligible: false,
      statusDetail: '',
    })
    updateTerrainExaggeration({ force: true })
    renderTerrainStatus('')

    const timeoutId = window.setTimeout(() => {
      if (terrainRuntime.loadId === loadId && terrainRuntime.terrain === terrain && terrainRuntime.loading) {
        fallbackToEllipsoidTerrain('服务不可用', {
          key: terrainKey,
          providerId: plan.id,
          autoRetry: true,
        })
      }
    }, TERRAIN_LOAD_TIMEOUT_MS)
    terrainRuntime.timeoutId = timeoutId

    const removeReadyListener = terrain.readyEvent.addEventListener((provider) => {
      if (!viewer || viewer.isDestroyed() || terrainRuntime.loadId !== loadId || terrainRuntime.terrain !== terrain) return
      window.clearTimeout(timeoutId)
      terrainRuntime.timeoutId = null
      terrainRuntime = reduceTerrainRuntime(terrainRuntime, { type: 'ready' })
      terrainRuntime.statusDetail = ''
      updateTerrainExaggeration({ force: true })
      renderTerrainStatus('')
      const removeProviderErrorListener = provider.errorEvent.addEventListener(() => {
        if (terrainRuntime.loadId !== loadId || terrainRuntime.terrain !== terrain) return
        const nextRuntime = reduceTerrainRuntime(terrainRuntime, { type: 'tile-error' })
        terrainRuntime = nextRuntime
        if (terrainRuntime.state === 'fallback') {
          fallbackToEllipsoidTerrain('瓦片持续加载异常', {
            key: terrainKey,
            providerId: plan.id,
            autoRetry: true,
          })
          return
        }
        clearTerrainVerificationTimeout()
        terrainRuntime.statusDetail = '瓦片加载异常'
        updateTerrainExaggeration({ force: true })
        renderTerrainStatus('瓦片加载异常')
        console.warn('3D terrain tile request failed; retaining current terrain.')
      })
      terrainRuntime.listenerRemovers.push(removeProviderErrorListener)
      verifyTerrainProvider(provider, loadId)
    })

    const removeErrorListener = terrain.errorEvent.addEventListener(() => {
      if (terrainRuntime.loadId !== loadId || terrainRuntime.terrain !== terrain) return
      window.clearTimeout(timeoutId)
      terrainRuntime.timeoutId = null
      fallbackToEllipsoidTerrain('服务不可用', {
        key: terrainKey,
        providerId: plan.id,
        autoRetry: true,
      })
    })
    terrainRuntime.listenerRemovers.push(removeReadyListener, removeErrorListener)

    viewer.scene.setTerrain(terrain)
  } catch {
    fallbackToEllipsoidTerrain('服务不可用', {
      key: terrainKey,
      providerId,
      autoRetry: true,
    })
  }
}

function flyToTerrainDemoView () {
  if (!viewer) return
  const { demoView } = getEffectiveTerrainConfig()
  setInteractionMode('3d')
  const targetCartographic = Cartographic.fromDegrees(demoView.lng, demoView.lat)
  const loadedHeight = viewer.scene.globe?.getHeight?.(targetCartographic)
  const target = Cartesian3.fromDegrees(
    demoView.lng,
    demoView.lat,
    Number.isFinite(loadedHeight) ? loadedHeight : 0,
  )
  const range = Math.max(10_000, Number(demoView.range ?? demoView.height) || 32_000)
  viewer.camera.flyToBoundingSphere(new BoundingSphere(target, 0), {
    offset: new HeadingPitchRange(
      CesiumMath.toRadians(demoView.heading),
      CesiumMath.toRadians(demoView.pitch),
      range,
    ),
    duration: getCameraAnimationDuration(1.6),
  })
}

// 初始化 Cesium 地球
async function init3dEarth () {
  const shareMode = isShareLocation(window.location)
  const activeShare = getActiveShare()
  const shareSpatial = shareMode ? getShareSpatialConfig(activeShare?.manifest) : { restricted: false, valid: true }
  if (shareMode && shareSpatial.restricted) {
    const publicId = activeShare?.publicId
    if (publicId) window.location.replace(`/share/${encodeURIComponent(publicId)}`)
    return
  }
  const shareViewConfig = activeShare?.manifest?.viewConfig || {}
  if (viewer) {
    const previousViewer = viewer
    if (intervalLocationState3d.active) stopIntervalLocation3d(previousViewer)
    else cancelLocationCamera3d(previousViewer)
    cameraInteraction?.destroy()
    cameraInteraction = null
    destroyLocationCamera3d(previousViewer)
    if (previousViewer.isDestroyed?.() !== true) previousViewer.destroy?.()
    viewer = null
  }
  // 1. 初始化 Viewer 并移除大部分内置控件，打造极简前卫外观
  viewer = new Viewer('cesiumContainer', {
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    // 隐藏默认底图，稍后手动添加
    imageryProvider: false
  })

  // All camera input is normalized by the adapter below so Cesium defaults cannot race it.
  const controller = viewer.scene.screenSpaceCameraController
  const canvas = viewer.canvas
  const interactionViewer = viewer
  controller.enableInputs = false
  cameraInteraction = installMap3dCameraInteraction({
    viewer,
    cesium: Cesium,
    canvas,
    getNavigationMode: () => interactionMode,
    isToolInteractionActive: isMapToolInteractionActive,
    onNavigationModeRequest: () => setInteractionMode('3d'),
    onInteractionStart: () => setLocationCameraInteraction3d(interactionViewer, true),
    onInteractionEnd: () => setLocationCameraInteraction3d(interactionViewer, false),
    onCameraChanged: () => {
      updateCameraStatus()
      syncCameraStateToUrl()
    },
    minCameraHeight: MIN_CAMERA_HEIGHT,
    maxCameraDistance: MAX_CAMERA_DISTANCE,
    minPitch: MIN_CAMERA_PITCH,
    maxPitch: MAX_CAMERA_PITCH,
    // Disabled only for controlled rollout/rollback. The compatibility
    // profile still owns predictable pan and zoom, but omits orbit/tilt.
    advancedGestures: map3dCameraInteractionConfig.enhancedGesturesEnabled,
  })
  document.body.dataset.map3dCameraInteraction = map3dCameraInteractionConfig.profile
  setInteractionMode('2d', { flatten: false })
  renderTerrainStatus('')

  // 限制最小缩放高度为 150.0 米，防止过度贴地或穿透进入地形内部
  controller.minimumZoomDistance = MIN_CAMERA_HEIGHT

  // 不展示或记录上游细节，避免错误文本携带服务地址或访问凭据。
  viewer.showErrorPanel = () => {
    console.warn('Cesium non-fatal warning/error.')
  }

  // 1.6. 限制相机俯仰角（Pitch）防止视锥过长，并在高空时将视线对齐地心，防止平移将地球移出视野
  viewer.scene.preRender.addEventListener(() => {
    if (!viewer) return
    const camera = viewer.camera

    if (interactionMode === '2d') {
      const targetPitch = CesiumMath.toRadians(-90.0)
      if (Math.abs(camera.pitch - targetPitch) > 0.00001 || Math.abs(camera.roll) > 0.00001) {
        camera.setView({
          destination: camera.position,
          orientation: {
            heading: camera.heading,
            pitch: targetPitch,
            roll: 0.0
          }
        })
      }
      return
    }

    updateTerrainExaggeration()
  })

  // 2. 动态加载底图（自适应读取 URL 或本地图层缓存，从 `/api/v1/map/catalog` 异步获取图层列表）
  let defaultLayerId = 'amap-hybrid'
  try {
    const catalogUrl = shareMode && activeShare?.publicId
      ? `/api/v1/public/kml-shares/${encodeURIComponent(activeShare.publicId)}/map/catalog`
      : '/api/v1/map/catalog'
    const res = await fetch(catalogUrl, { credentials: 'same-origin', cache: 'no-store' })
    const payload = await res.json()
    if (!res.ok || payload?.code !== 0 || !payload?.result || !Array.isArray(payload.result.layers)) {
      throw new Error(payload?.error?.message || res.statusText || '地图图层目录加载失败')
    }
    const catalog = payload.result
    globalCatalogSources = new Map((catalog.sources || []).map(source => [source.id, source]))
    const rawLayers = catalog.layers || []
    globalCatalogLayers = rawLayers.filter(l => l.enabled !== false && (l.clients || []).includes('3d') && isCesiumRenderableLayer(l))

    // 动态生成 layer-control 单选框
    const baseLayersContainer = document.querySelector('#map3d-layer-control .leaflet-control-layers-base')
    if (baseLayersContainer && globalCatalogLayers.length > 0) {
      baseLayersContainer.innerHTML = globalCatalogLayers.map((l, index) => `
        <label>
          <input type="radio" name="leaflet-base-layers" data-layer="${escapeHtml(l.id)}">
          <span> ${escapeHtml(l.name)}</span>
        </label>
      `).join('')
    }

    const defaultLayer = globalCatalogLayers.find(l => l.default) || globalCatalogLayers[0]
    if (defaultLayer) {
      defaultLayerId = defaultLayer.id
    }
  } catch (err) {
    if (shareMode) throw err
    console.error('Failed to load 3D map catalog, using backend fallback sources', err)
    globalCatalogSources = new Map(FALLBACK_3D_CATALOG.sources.map(source => [source.id, source]))
    globalCatalogLayers = FALLBACK_3D_CATALOG.layers
    defaultLayerId = 'amap-hybrid'
  }

  const urlParams = new URLSearchParams(window.location.search)
  const queryLayer = urlParams.get('layer') || ''
  let cachedLayerId = ''
  let cachedLayerName = ''
  if (!shareMode) {
    cachedLayerId = localStorage.getItem('last_map_layer_id') || ''
    cachedLayerName = localStorage.getItem('last_map_layer') || ''
  }
  
  const requestedLayer = shareViewConfig.layerId || queryLayer
  let initialLayer = requestedLayer || cachedLayerId || cachedLayerName || defaultLayerId
  let needFallbackAlert = false

  // 匹配 id 或 name
  const matchedByIdOrName = globalCatalogLayers.find(l => l.id === initialLayer || l.name === initialLayer)
  if (matchedByIdOrName) {
    initialLayer = matchedByIdOrName.id
  } else {
    if (requestedLayer) {
      needFallbackAlert = true
    }
    initialLayer = defaultLayerId
  }

  switchLayer(initialLayer)
  const activeRadio = document.querySelector(`#map3d-layer-control input[data-layer="${initialLayer}"]`)
  if (activeRadio) {
    activeRadio.checked = true
  }

  if (needFallbackAlert) {
    const toast = document.createElement('div')
    toast.className = 'screenshot-toast'
    toast.style.background = '#d97706' // 警告颜色
    toast.innerText = '原图层不可用，已切换到默认图层'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 3500)
  }

  // 3. 从 URL 或者缓存初始化相机视角（对齐 2D）
  initCameraView(shareViewConfig)
  initFavoriteActions({
    readOnly: shareMode,
  })

  // 4. 初始化地球自转动画逻辑
  lastTime = Date.now()
  viewer.scene.postRender.addEventListener((scene, time) => {
    if (!isRotating) return
    const now = Date.now()
    const delta = (now - lastTime) / 1000
    lastTime = now

    // 沿 Z 轴（自转轴）旋转相机
    viewer.camera.rotate(Cartesian3.UNIT_Z, -spinRate * delta)
  })

  // 5. 监听相机交互，拖拽时自动停用地球自转，并高频更新右下角指南针罗盘指向
  viewer.camera.moveStart.addEventListener(() => {
    if (isRotating) {
      isRotating = false
      const spinBtn = document.querySelector('[data-action="toggleRotation"]')
      if (spinBtn) spinBtn.classList.remove('active')
    }
  })

  // 监听相机位置和偏航角（Heading）实时旋转指南针
  viewer.scene.preRender.addEventListener(() => {
    if (!viewer) return
    const camera = viewer.camera
    const headingDeg = CesiumMath.toDegrees(camera.heading)
    const normalizedHeading = (headingDeg % 360 + 360) % 360

    const resetBearingBtn = document.getElementById('reset-bearing-btn')
    if (resetBearingBtn) {
      // 只要偏航角偏离正北超过 1.0 度，就显式显示罗盘按钮；否则隐去以保持对齐 2D 效果
      if (Math.abs(normalizedHeading) > 1.0 && Math.abs(normalizedHeading - 360) > 1.0) {
        resetBearingBtn.style.display = 'grid'
        const compassIcon = resetBearingBtn.querySelector('.compass-icon')
        if (compassIcon) {
          compassIcon.style.transform = `rotate(${-normalizedHeading}deg)`
        }
      } else {
        resetBearingBtn.style.display = 'none'
      }
    }
  })

  // 6. 实时更新底部的相机高度和位置信息，并防抖同步位置到 URL/缓存（对齐 2D）
  viewer.camera.changed.addEventListener(updateCameraStatus)
  viewer.camera.changed.addEventListener(syncCameraStateToUrl)
  // 初次加载也运行一次状态更新
  updateCameraStatus()

  // 7. 初始化与首页对标的地图工具能力
  const AMap = await loadAmap()
  if (AMap) {
    amapGeolocation = initAmapGeolocation(AMap)
  }
  initAmapSearch3d(viewer, AMap)
  await initKmlSupport3d(viewer)
  if (!shareMode) {
    initGuidelines3d(viewer)
    initLocationHistoryPanel3d()
  }

  // 8. 绑定界面交互事件
  bindUiEvents()
}

// 切换底图图层（支持多层叠加与透明度）
function switchLayer (layerId) {
  if (!viewer) return
  const layer = globalCatalogLayers.find(l => l.id === layerId)
  if (!layer) return

  const layers = viewer.imageryLayers
  layers.removeAll()

  // 依次添加配置中的所有子图层
  ;(layer.items || []).forEach(item => {
    const source = globalCatalogSources.get(item.sourceId)
    const rasterSource = resolveCesiumRasterSource(source)
    if (!isCesiumRasterSource(rasterSource)) return
    const provider = new UrlTemplateImageryProvider({
      url: rasterSource.tileUrl || `/api/v1/tiles/${encodeURIComponent(rasterSource.id)}/{z}/{x}/{y}`,
      minimumLevel: rasterSource.minZoom ?? layer.minZoom ?? 0,
      maximumLevel: rasterSource.maxNativeZoom ?? rasterSource.maxZoom ?? layer.maxZoom,
      tileWidth: rasterSource.tileSize || 256,
      tileHeight: rasterSource.tileSize || 256,
    })
    const addedLayer = layers.addImageryProvider(provider)
    
    // 如果子图层配置了不透明度 (alpha)，则予以应用，以保证图层正确叠加显示
    if (item.opacity !== undefined) {
      addedLayer.alpha = item.opacity
    }
  })
}

// 重置相机到默认视角（中国）
function resetCameraView () {
  if (!viewer) return
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(104.2, 35.8, 8000000.0),
    orientation: {
      heading: CesiumMath.toRadians(0.0),
      pitch: CesiumMath.toRadians(-90.0),
      roll: 0.0
    },
    duration: getCameraAnimationDuration(2.0)
  })
}

// 从 URL 或者 localStorage 恢复上一次停留的位置，高度对齐 2D 地图
function initCameraView (viewConfig = {}) {
  if (!viewer) return

  const shareMode = isShareLocation(window.location)
  const urlParams = new URLSearchParams(window.location.search)
  const coordsParam = urlParams.get('coords')

  const configuredCenter = Array.isArray(viewConfig.center) && viewConfig.center.length === 2
    ? viewConfig.center.map(Number)
    : []
  let lat = Number.isFinite(configuredCenter[0]) ? configuredCenter[0] : NaN
  let lng = Number.isFinite(configuredCenter[1]) ? configuredCenter[1] : NaN
  let zoom = Number.isFinite(Number(viewConfig.zoom)) ? Number(viewConfig.zoom) : NaN
  let bearing = Number.isFinite(Number(viewConfig.bearing)) ? Number(viewConfig.bearing) : NaN
  const pitch = Number.isFinite(Number(viewConfig.pitch)) ? Number(viewConfig.pitch) : 0

  if (!shareMode && coordsParam) {
    const rawCoords = coordsParam.split(',')
    lat = Number(rawCoords[0])
    lng = Number(rawCoords[1])
    zoom = Number.parseInt(rawCoords[2] || '', 10)
    bearing = Number(rawCoords[3] || 0)
  }

  if (!shareMode && (Number.isNaN(lat) || Number.isNaN(lng))) {
    // 尝试从 localStorage 中恢复
    try {
      const rawLocal = localStorage.getItem('last_map_view')
      if (rawLocal) {
        const localView = JSON.parse(rawLocal)
        if (localView && localView.center) {
          lat = localView.center[0]
          lng = localView.center[1]
          zoom = localView.zoom
          bearing = localView.bearing
        }
      }
    } catch (e) {
      console.error('Failed to parse last_map_view from localStorage', e)
    }
  }

  // 如果没有缓存，则使用兜底默认值（中国上空）
  if (Number.isNaN(lat) || Number.isNaN(lng)) lat = 35.8
  if (Number.isNaN(lng)) lng = 104.2
  if (Number.isNaN(zoom)) zoom = 3
  if (Number.isNaN(bearing)) bearing = 0

  // 将 Zoom 换算为 Height
  const height = zoomToHeight(zoom)

  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(lng, lat, height),
    orientation: {
      heading: CesiumMath.toRadians(bearing),
      pitch: CesiumMath.toRadians(Math.max(-90, Math.min(-5, -90 + pitch))),
      roll: 0.0
    }
  })
  if (pitch > 0) setInteractionMode('3d', { tilt: false })
}

// 实时将相机位置和图层同步写入 URL 及 localStorage，高度对齐 2D 地图（添加防抖限制防止高频卡顿）
const syncCameraStateToUrl = debounce(() => {
  if (!viewer) return
  const camera = viewer.camera
  const scene = viewer.scene

  // 1. 计算当前视口中心点投影到地球表面的三维世界坐标
  const canvas = viewer.canvas
  const centerScreenPos = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
  let centerCartesian = pickSceneWorldPosition(camera, scene, centerScreenPos)
  if (!centerCartesian) {
    centerCartesian = camera.position // 若无交点（外太空远景），回退至相机物理位置
  }

  const cartographic = scene.globe?.ellipsoid?.cartesianToCartographic?.(centerCartesian)
  if (!cartographic || !Number.isFinite(cartographic.latitude) || !Number.isFinite(cartographic.longitude)) return
  const lat = CesiumMath.toDegrees(cartographic.latitude)
  const lng = CesiumMath.toDegrees(cartographic.longitude)

  // 2. 将相机当前海拔高度转换为 2D 缩放级 zoom
  const cameraHeight = camera.positionCartographic ? camera.positionCartographic.height : 8000000.0
  const zoom = heightToZoom(cameraHeight)

  // 3. 计算偏航角为 2D 罗盘旋转度 bearing
  const headingDeg = CesiumMath.toDegrees(camera.heading)
  const bearing = Math.round((headingDeg % 360 + 360) % 360)

  // 4. 当前选中的底图图层名称
  const activeRadio = document.querySelector('#map3d-layer-control input[name="leaflet-base-layers"]:checked')
  const layerId = activeRadio ? activeRadio.getAttribute('data-layer') : 'amap-hybrid'
  const activeLayer = globalCatalogLayers.find(layer => layer.id === layerId)
  const layerName2D = activeLayer?.name || layerId

  // 5. 拼装符合 2D 规范的坐标字符串coords
  const coords = `${lat.toFixed(6)},${lng.toFixed(6)},${zoom},${bearing}`

  // 6. 写入 URL 属性
  const urlParams = new URLSearchParams(window.location.search)
  urlParams.set('coords', coords)
  if (layerName2D) {
    urlParams.set('layer', layerName2D)
  } else {
    urlParams.delete('layer')
  }

  const query = urlParams.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)

  if (isShareLocation(window.location)) return

  // 7. 写入 localStorage 缓存
  try {
    localStorage.setItem('last_map_view', JSON.stringify({
      center: [Number(lat.toFixed(6)), Number(lng.toFixed(6))],
      zoom,
      bearing,
      layer: layerName2D
    }))
    localStorage.setItem('last_map_layer', layerName2D)
  } catch (err) {
    console.error('Failed to save last_map_view to localStorage', err)
  }
}, 300)

// 更新位置/状态信息栏
function updateCameraStatus () {
  if (!viewer) return
  const camera = viewer.camera
  const position = camera.positionCartographic
  if (!position) return

  const lon = CesiumMath.toDegrees(position.longitude).toFixed(5)
  const lat = CesiumMath.toDegrees(position.latitude).toFixed(5)
  const alt = (position.height / 1000).toFixed(1) // 转换为千米

  const statusEl = document.getElementById('camera-status')
  if (statusEl) {
    const terrainLabel = formatCompactTerrainStatus(terrainRuntime.state, terrainRuntime.statusDetail)
    statusEl.textContent = `经度 ${lon}° · 纬度 ${lat}° · 海拔 ${alt} km · ${terrainLabel}`
    statusEl.setAttribute('aria-label', `${statusEl.textContent}。${formatTerrainStatus(terrainRuntime.state, terrainRuntime.statusDetail)}`)
  }
}

// 绑定 3D 控制面板上的 UI 事件（高度对齐 2D）
function bindUiEvents () {
  const menu = document.getElementById('map-menu')
  const layerControlPanel = document.getElementById('map3d-layer-control')
  if (!menu) return
  const shareMode = isShareLocation(window.location)

  initIdentityEntry({
    button: menu.querySelector('[data-action="openAccount"]'),
  })

  configureMapCanvasAccessibility()

  const modeToggleBtn = document.getElementById('map3d-mode-toggle')
  if (modeToggleBtn) {
    modeToggleBtn.addEventListener('click', () => {
      setInteractionMode(interactionMode === '3d' ? '2d' : '3d')
    })
  }

  const terrainRetryBtn = document.getElementById('terrain-retry-btn')
  if (terrainRetryBtn) {
    terrainRetryBtn.addEventListener('click', () => {
      if (terrainRetryBtn.disabled) return
      enableConfiguredTerrain({ force: true, manual: true })
    })
    renderTerrainStatus()
  }

  // 1. 图层面板选项切换绑定（Radio 方式，对齐 2D 底层逻辑）
  if (layerControlPanel) {
    layerControlPanel.addEventListener('change', (e) => {
      const radioInput = e.target.closest('input[name="leaflet-base-layers"]')
      if (radioInput) {
        const layerId = radioInput.getAttribute('data-layer')
        if (layerId) {
          switchLayer(layerId)
          if (!shareMode) {
            try {
              const matchedLayer = globalCatalogLayers.find(l => l.id === layerId)
              const layerName = matchedLayer ? matchedLayer.name : layerId
              localStorage.setItem('last_map_layer_id', layerId)
              localStorage.setItem('last_map_layer', layerName)
            } catch (err) {
              console.error('Failed to save last_map_layer in localStorage', err)
            }
          }
          syncCameraStateToUrl()
        }
      }
    })

    // 仿 2D Leaflet 逻辑：支持点击 Toggle 图标展开面板，以及点击外部空白区域自动折叠
    const layerToggle = layerControlPanel.querySelector('.leaflet-control-layers-toggle')
    if (layerToggle) {
      layerToggle.addEventListener('click', (e) => {
        e.stopPropagation()
        layerControlPanel.classList.add('leaflet-control-layers-expanded')
      })
    }

    // 全局点击空白折叠图层卡片
    document.addEventListener('click', (e) => {
      if (!layerControlPanel.contains(e.target)) {
        layerControlPanel.classList.remove('leaflet-control-layers-expanded')
      }
    })
  }

  // 2. 更多工具与图层切换（对齐 2D：同步展开右下角菜单 + 显示/隐藏右上角图层卡片）
  const layerControlBtn = menu.querySelector('[data-action="toggleLayerControl"]')
  if (layerControlBtn && layerControlPanel) {
    // 读取 localStorage 中保存的菜单展开状态
    let expanded = false
    if (!shareMode) {
      try {
        expanded = localStorage.getItem('3d_menu_expanded') === 'true'
      } catch (err) {
        console.error(err)
      }
    }

    const updateExpandedState = (state) => {
      expanded = state
      if (!shareMode) {
        try {
          localStorage.setItem('3d_menu_expanded', state)
        } catch (err) {
          console.error(err)
        }
      }

      if (expanded) {
        menu.classList.add('is-expanded')
        layerControlPanel.style.display = 'block'
        layerControlBtn.setAttribute('aria-expanded', 'true')
      } else {
        menu.classList.remove('is-expanded')
        layerControlPanel.style.display = 'none'
        layerControlBtn.setAttribute('aria-expanded', 'false')
      }
    }

    // 初始化展开状态
    updateExpandedState(expanded)

    layerControlBtn.addEventListener('click', () => {
      updateExpandedState(!expanded)
    })
  }

  // 3. 重置指南针偏航角为正北（Heading = 0），保留当前倾斜度
  const resetBearingBtn = document.getElementById('reset-bearing-btn')
  if (resetBearingBtn) {
    resetBearingBtn.addEventListener('click', () => {
      if (interactionMode === '2d') {
        flattenCameraView({ keepHeading: false, duration: 0.6 })
        return
      }
      const camera = viewer.camera
      camera.flyTo({
        destination: camera.position,
        orientation: {
          heading: 0.0,
          pitch: camera.pitch,
          roll: camera.roll
        },
        duration: getCameraAnimationDuration(0.6)
      })
    })
  }

  const kmlBtn = menu.querySelector('[data-action="toggleKmlPanel"]')
  if (kmlBtn) {
    kmlBtn.addEventListener('click', () => {
      window.toggleKmlPanel?.()
    })
  }

  const guidelineBtn = menu.querySelector('[data-action="toggleGuidelineMode"]')
  if (shareMode) guidelineBtn?.closest('li')?.setAttribute('hidden', '')
  if (guidelineBtn && !shareMode) {
    guidelineBtn.addEventListener('click', () => {
      toggleGuidelineMode3d()
    })
  }

  const searchBtn = menu.querySelector('[data-action="toggleSearchMode"]')
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      toggleSearchMode3d()
    })
  }

  const positionBtn = menu.querySelector('[data-action="updatePosition"]')
  if (shareMode) positionBtn?.closest('li')?.setAttribute('hidden', '')
  let skipNextClick = false
  if (positionBtn && !shareMode) {
    let longPressTimer = null
    let isLongPressTriggered = false
    let startX = 0
    let startY = 0

    const handleLongPress = async () => {
      if (!intervalLocationState3d.active) {
        await showLocationConfigDialog()
      } else {
        await showLocationManageDialog()
      }
    }

    const showLocationConfigDialog = async () => {
      const currentHeight = getCameraHeight()
      const currentZoom = heightToZoom(currentHeight)

      const res = await showEditDialog({
        title: '定位配置',
        fields: [
          {
            name: 'interval',
            label: '定位时间间隔 (秒，最小 1s)',
            type: 'text'
          },
          {
            name: 'zoom',
            label: '定位成功后显示的图层级别 (3-18)',
            type: 'text'
          },
          {
            name: 'maxPoints',
            label: '记住最近点位数 (默认 0 记住所有)',
            type: 'text'
          },
          {
            name: 'recordTrack',
            label: '记录轨迹',
            type: 'select',
            options: [
              { label: '是', value: 'true' },
              { label: '否', value: 'false' }
            ]
          },
          {
            name: 'onlyLine',
            label: '记录方式',
            type: 'select',
            options: [
              { label: '保留路线和所有点', value: 'false' },
              { label: '仅保留最终路线 (省内存/省空间)', value: 'true' }
            ]
          },
          {
            name: 'autoRotate',
            label: '自动旋转地图',
            type: 'select',
            options: [
              { label: '是', value: 'true' },
              { label: '否', value: 'false' }
            ]
          }
        ],
        values: {
          interval: String(intervalLocationState3d.intervalSeconds || 15),
          zoom: String(intervalLocationState3d.zoomLevel || currentZoom || 16),
          maxPoints: String(intervalLocationState3d.maxHistoryPoints || 0),
          recordTrack: String(intervalLocationState3d.recordTrack !== false),
          onlyLine: String(intervalLocationState3d.onlyLine !== false),
          autoRotate: String(intervalLocationState3d.autoRotate !== false)
        },
        showReset: true,
        resetValues: {
          interval: '15',
          zoom: '16',
          maxPoints: '0',
          recordTrack: 'true',
          onlyLine: 'true',
          autoRotate: 'true'
        }
      })

      if (!res) return

      const interval = parseBoundedInteger(res.interval, { min: 1, max: MAX_LOCATION_INTERVAL_SECONDS })
      const zoom = parseBoundedInteger(res.zoom, { min: 3, max: 18 })
      const maxHistoryPoints = parseBoundedInteger(res.maxPoints, { min: 0, max: MAX_LOCATION_HISTORY_POINTS })
      const recordTrack = res.recordTrack === 'true'
      const onlyLine = res.onlyLine === 'true'
      const autoRotate = res.autoRotate === 'true'

      if (interval === null) {
        await showAlert(`定位时间间隔必须是 1 到 ${MAX_LOCATION_INTERVAL_SECONDS} 之间的整数！`)
        await showLocationConfigDialog()
        return
      }

      if (zoom === null) {
        await showAlert('图层级别必须在 3 到 18 之间！')
        await showLocationConfigDialog()
        return
      }

      if (maxHistoryPoints === null) {
        await showAlert(`记住最近点位数必须是 0 到 ${MAX_LOCATION_HISTORY_POINTS} 之间的整数！`)
        await showLocationConfigDialog()
        return
      }

      // 如果当前定位在运行中，支持热编辑同步
      if (intervalLocationState3d.active) {
        const configureResult = configureIntervalLocation3d(viewer, {
          interval,
          zoom,
          maxHistoryPoints,
          recordTrack,
          onlyLine,
          autoRotate,
        })

        await showAlert(configureResult.finalPersistSucceeded === false
          ? '定位参数已更新，但暂停前的最新轨迹未能完整保存；定位采集不受影响，请检查浏览器存储空间。'
          : '定位管理参数已更新！')
      } else {
        startIntervalLocation3d(viewer, amapGeolocation, interval, zoom, maxHistoryPoints, recordTrack, onlyLine, autoRotate)
      }
    }

    const showLocationManageDialog = async () => {
      const lastFixText = intervalLocationState3d.lastFixAt
        ? new Date(intervalLocationState3d.lastFixAt).toLocaleTimeString()
        : '尚未收到有效位置'
      const errorText = intervalLocationState3d.lastError?.message
        ? `\n最近异常：${intervalLocationState3d.lastError.message}`
        : ''
      const persistenceText = intervalLocationState3d.persistenceError
        ? `\n轨迹保存：${intervalLocationState3d.persistenceError}`
        : ''
      const choice = await showChoiceDialog({
        title: '定位管理',
        message: `实际状态：${formatContinuousLocationState(intervalLocationState3d)}\n最后更新：${lastFixText}\n连续失败：${intervalLocationState3d.consecutiveFailures} 次\n自动恢复：${intervalLocationState3d.restartCount} 次\n时间间隔：${intervalLocationState3d.intervalSeconds} 秒\n图层级别：${intervalLocationState3d.zoomLevel}\n轨迹记录：${intervalLocationState3d.recordTrack ? (intervalLocationState3d.onlyLine ? '开启 (仅路线)' : '开启 (路线和点)') : '关闭'}${errorText}${persistenceText}`,
        choices: [
          { text: '编辑', value: 'edit', class: 'app-dialog-primary' },
          { text: '停止定位', value: 'stop', class: 'app-dialog-secondary app-dialog-danger' }
        ]
      })

      if (choice === 'edit') {
        await showLocationConfigDialog()
      } else if (choice === 'stop') {
        const stopResult = stopIntervalLocation3d(viewer)
        await showAlert(stopResult.finalPersistSucceeded === false
          ? '持续定位已关闭，但最后一段轨迹未能完整保存，请检查浏览器存储空间。'
          : '持续定位已关闭')
      }
    }

    const startTimer = (e) => {
      if (e.type === 'mousedown' && e.button !== 0) return
      const touch = e.touches ? e.touches[0] : e
      startX = touch.clientX
      startY = touch.clientY
      isLongPressTriggered = false
      longPressTimer = setTimeout(() => {
        isLongPressTriggered = true
        skipNextClick = true
        handleLongPress()
      }, 1000)
    }

    const clearTimer = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }
    }

    const endTimer = (e) => {
      clearTimer()
      if (isLongPressTriggered) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    const moveTouch = (e) => {
      const touch = e.touches ? e.touches[0] : e
      if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > 10) {
        clearTimer()
      }
    }

    positionBtn.addEventListener('mousedown', startTimer)
    positionBtn.addEventListener('touchstart', startTimer, { passive: true })
    positionBtn.addEventListener('mouseup', endTimer)
    positionBtn.addEventListener('touchend', endTimer)
    positionBtn.addEventListener('mousemove', moveTouch)
    positionBtn.addEventListener('touchmove', moveTouch, { passive: true })
    positionBtn.addEventListener('mouseleave', clearTimer)
    positionBtn.addEventListener('touchcancel', clearTimer)

    window.addEventListener('continuous-location-statechange', (event) => {
      if (event.detail?.mode !== '3d') return
      applyContinuousLocationButtonState(positionBtn, event.detail)
    })

    positionBtn.addEventListener('click', () => {
      if (skipNextClick) {
        skipNextClick = false
        return
      }
      const targetHeight = intervalLocationState3d.active 
        ? zoomToHeight(intervalLocationState3d.zoomLevel) 
        : 1200
      updatePosition3d(viewer, amapGeolocation, targetHeight, false)
    })

  }

  // 4. 地球自转控制
  const spinBtn = menu.querySelector('[data-action="toggleRotation"]')
  if (spinBtn) {
    // 同步初始化状态
    if (isRotating) {
      spinBtn.classList.add('active')
    }

    spinBtn.addEventListener('click', () => {
      isRotating = !isRotating
      if (isRotating) {
        lastTime = Date.now()
        spinBtn.classList.add('active')
      } else {
        spinBtn.classList.remove('active')
      }
    })
  }

  // 5. 视角复位
  const resetBtn = menu.querySelector('[data-action="resetView"]')
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetCameraView()
    })
  }

  const terrainDemoBtn = menu.querySelector('[data-action="flyTerrainDemo"]')
  if (terrainDemoBtn) {
    terrainDemoBtn.addEventListener('click', () => {
      flyToTerrainDemoView()
    })
  }

  const accountBtn = menu.querySelector('[data-action="openAccount"]')
  if (accountBtn) {
    accountBtn.addEventListener('click', () => {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.href = `/account?returnTo=${encodeURIComponent(returnTo)}`
    })
  }

  // 6. 返回 2D 视图
  const backBtn = menu.querySelector('[data-action="back2d"]')
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const publicId = getActiveShare()?.publicId
      window.location.href = shareMode && publicId
        ? `/share/${encodeURIComponent(publicId)}`
        : '/' + window.location.search
    })
  }
}

if (isShareLocation(window.location)) {
  renderAppVersion()
  prepareShareView(init3dEarth)
} else if (isAdminLocation(window.location)) {
  initAdminApp({ amapLoader: AMapLoader })
} else {
  renderAppVersion()
  initAfterAccessCheck({
    init: init3dEarth,
    title: '私有地图三维视图',
    submitText: '载入三维地球',
  })
}

registerServiceWorker()
