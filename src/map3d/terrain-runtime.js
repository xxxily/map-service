function finiteNumber (value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export const TERRAIN_TILE_ERROR_FALLBACK_THRESHOLD = 3
export const TERRAIN_VERIFICATION_TIMEOUT_MS = 12_000
export const TERRAIN_AUTO_RETRY_MAX_ATTEMPTS = 2
export const TERRAIN_AUTO_RETRY_BASE_DELAY_MS = 1_500

const TERRAIN_RUNTIME_DEFAULTS = Object.freeze({
  key: '',
  terrain: null,
  loading: false,
  ready: false,
  verified: false,
  verificationStarted: false,
  state: 'standby',
  providerId: 'ellipsoid',
  tileErrors: 0,
  loadId: 0,
  timeoutId: null,
  verificationTimeoutId: null,
  listenerRemovers: [],
})

export function createTerrainRuntimeState (input = {}) {
  const runtime = {
    ...TERRAIN_RUNTIME_DEFAULTS,
    ...input,
  }
  runtime.listenerRemovers = Array.isArray(input.listenerRemovers)
    ? input.listenerRemovers
    : []
  return runtime
}

/**
 * Keep terrain status transitions pure so delayed provider events cannot
 * accidentally promote an already-degraded attempt back to "active".
 */
export function reduceTerrainRuntime (runtime, event = {}) {
  const current = createTerrainRuntimeState(runtime)
  const type = event.type

  if (type === 'load') {
    return {
      ...current,
      loading: true,
      ready: false,
      verified: false,
      verificationStarted: false,
      state: 'loading',
      tileErrors: 0,
    }
  }

  if (type === 'ready') {
    if (current.state !== 'loading') return current
    return {
      ...current,
      loading: false,
      ready: true,
      state: 'verifying',
    }
  }

  if (type === 'verification-passed') {
    if (current.state !== 'verifying' || current.tileErrors > 0) return current
    return {
      ...current,
      verified: true,
      state: 'active',
    }
  }

  if (type === 'verification-failed') {
    if (current.state === 'disabled' || current.state === 'standby' || current.state === 'fallback') return current
    return {
      ...current,
      loading: false,
      verified: false,
      state: 'degraded',
    }
  }

  if (type === 'tile-error') {
    if (current.state === 'disabled' || current.state === 'standby' || current.state === 'fallback') return current
    const threshold = Math.max(
      1,
      Math.floor(finiteNumber(event.threshold) ?? TERRAIN_TILE_ERROR_FALLBACK_THRESHOLD),
    )
    const tileErrors = current.tileErrors + 1
    return {
      ...current,
      tileErrors,
      loading: false,
      state: tileErrors >= threshold ? 'fallback' : 'degraded',
    }
  }

  if (type === 'fallback') {
    return {
      ...current,
      loading: false,
      ready: false,
      verified: false,
      verificationStarted: false,
      state: 'fallback',
    }
  }

  if (type === 'disabled') {
    return {
      ...current,
      loading: false,
      ready: false,
      verified: false,
      verificationStarted: false,
      state: 'disabled',
      providerId: 'ellipsoid',
    }
  }

  return current
}

export function evaluateTerrainVerification (samples, options = {}) {
  const minimumSamples = Math.max(2, Math.floor(finiteNumber(options.minimumSamples) ?? 2))
  const minimumSpread = Math.max(0, finiteNumber(options.minimumSpread) ?? 100)
  const heights = (Array.isArray(samples) ? samples : [])
    .map(sample => Number(sample?.height))
    .filter(Number.isFinite)
  const spread = heights.length > 1 ? Math.max(...heights) - Math.min(...heights) : 0

  return {
    verified: heights.length >= minimumSamples && spread > minimumSpread,
    heightCount: heights.length,
    spread,
  }
}

export function getTerrainAutoRetryDelayMs (attempt, options = {}) {
  const maxAttempts = Math.max(
    0,
    Math.floor(finiteNumber(options.maxAttempts) ?? TERRAIN_AUTO_RETRY_MAX_ATTEMPTS),
  )
  const index = Math.max(0, Math.floor(finiteNumber(attempt) ?? 0))
  if (index >= maxAttempts) return null

  const baseDelay = Math.max(0, finiteNumber(options.baseDelay) ?? TERRAIN_AUTO_RETRY_BASE_DELAY_MS)
  const maximumDelay = Math.max(baseDelay, finiteNumber(options.maximumDelay) ?? 30_000)
  return Math.min(maximumDelay, baseDelay * (2 ** index))
}

// 运行时只允许调节展示项；凭据和受控地址只能来自构建配置。
export function getSafeTerrainRuntimeOverride (input) {
  if (!input || typeof input !== 'object') return {}

  const override = {}
  if (typeof input.enabled === 'boolean') override.enabled = input.enabled
  if (typeof input.provider === 'string') override.provider = input.provider
  if (typeof input.quality === 'string') override.quality = input.quality

  const exaggeration = finiteNumber(input.exaggeration)
  if (exaggeration !== null) override.exaggeration = exaggeration

  if (input.demoView && typeof input.demoView === 'object') {
    const demoView = {}
    for (const key of ['lng', 'lat', 'height', 'heading', 'pitch']) {
      const value = finiteNumber(input.demoView[key])
      if (value !== null) demoView[key] = value
    }
    if (Object.keys(demoView).length > 0) override.demoView = demoView
  }

  return override
}

export function getTerrainRetryControlState (state) {
  const retryable = state === 'fallback' || state === 'degraded'
  const busy = state === 'loading' || state === 'verifying'
  return {
    hidden: !retryable,
    disabled: !retryable || busy,
    busy,
  }
}

// 依次使用深度、地形射线和椭球体，兼容未来的 3D Tiles 锚点。
export function pickSceneWorldPosition (camera, scene, position) {
  if (!camera || !scene || !position) return null

  try {
    const depthPosition = scene.pickPosition?.(position)
    if (depthPosition) return depthPosition
  } catch {
    // Depth picking is optional and may be unavailable before the first frame.
  }

  try {
    const ray = camera.getPickRay?.(position)
    const terrainPosition = ray ? scene.globe?.pick?.(ray, scene) : null
    if (terrainPosition) return terrainPosition
  } catch {
    // Terrain can be temporarily unavailable while an async provider starts.
  }

  try {
    return camera.pickEllipsoid?.(position, scene.globe?.ellipsoid) || null
  } catch {
    return null
  }
}
