const DEFAULT_INTERVAL_MS = 15_000
const DEFAULT_BACKOFF_MS = 1_000
const DEFAULT_MAX_BACKOFF_MS = 30_000
const DEFAULT_LIFECYCLE_DEBOUNCE_MS = 100
const MIN_DEFAULT_STALE_TIMEOUT_MS = 45_000
const DEFAULT_MAX_SPEED_KMH = 500
const DEFAULT_REANCHOR_AFTER_MS = 5 * 60_000
const DEFAULT_WATCH_FAILURES_BEFORE_POLL = 2
const DEFAULT_TIMESTAMP_NON_PROGRESS_LIMIT = 3
const DEFAULT_CONSUMER_TIMEOUT_MS = 30_000
const EARTH_RADIUS_METERS = 6_371_008.8

export const CONTINUOUS_LOCATION_PHASE_LABELS = Object.freeze({
  idle: '已停止',
  starting: '正在启动定位',
  tracking: '正在持续定位',
  stale: '定位信号已中断',
  recovering: '正在恢复定位',
  suspended: '定位已暂停，等待页面恢复',
  'permission-blocked': '定位权限已被禁止',
  unsupported: '当前环境不支持持续定位',
})

function finiteNumber (value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function nonNegativeNumber (value, fallback) {
  const number = finiteNumber(value)
  return number !== null && number >= 0 ? number : fallback
}

function getCoordinate (position, primary, secondary) {
  return finiteNumber(position?.[primary] ?? position?.coords?.[secondary])
}

function getTimestamp (position) {
  return finiteNumber(position?.timestamp ?? position?.providerTimestamp ?? position?.receivedAt)
}

function getAccuracy (position, maxAccuracyMeters) {
  const accuracy = nonNegativeNumber(position?.accuracy ?? position?.coords?.accuracy, 0)
  return Math.min(accuracy, maxAccuracyMeters)
}

function isUsableCoordinate (position) {
  const lat = getCoordinate(position, 'lat', 'latitude')
  const lng = getCoordinate(position, 'lng', 'longitude')
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function isSameProviderFix (left, right) {
  if (!left || !right) return false
  return getCoordinate(left, 'lat', 'latitude') === getCoordinate(right, 'lat', 'latitude') &&
    getCoordinate(left, 'lng', 'longitude') === getCoordinate(right, 'lng', 'longitude')
}

function distanceInMeters (from, to) {
  const fromLat = getCoordinate(from, 'lat', 'latitude') * Math.PI / 180
  const toLat = getCoordinate(to, 'lat', 'latitude') * Math.PI / 180
  const deltaLat = toLat - fromLat
  const deltaLng = (getCoordinate(to, 'lng', 'longitude') - getCoordinate(from, 'lng', 'longitude')) * Math.PI / 180
  const sinLat = Math.sin(deltaLat / 2)
  const sinLng = Math.sin(deltaLng / 2)
  const haversine = sinLat * sinLat + Math.cos(fromLat) * Math.cos(toLat) * sinLng * sinLng
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

function movementAllowance (from, to, options) {
  const fromTimestamp = getTimestamp(from)
  const toTimestamp = getTimestamp(to)
  const fallbackIntervalMs = nonNegativeNumber(options.defaultIntervalMs, DEFAULT_INTERVAL_MS)
  const deltaMs = fromTimestamp !== null && toTimestamp !== null
    ? Math.max(0, toTimestamp - fromTimestamp)
    : fallbackIntervalMs
  const maxSpeedKmh = nonNegativeNumber(options.maxSpeedKmh, DEFAULT_MAX_SPEED_KMH)
  const maxSpeedMetersPerSecond = maxSpeedKmh * 1000 / 3600
  const baseToleranceMeters = nonNegativeNumber(options.baseToleranceMeters, 30)
  const maxAccuracyMeters = nonNegativeNumber(options.maxAccuracyMeters, 5000)
  return baseToleranceMeters +
    maxSpeedMetersPerSecond * deltaMs / 1000 +
    getAccuracy(from, maxAccuracyMeters) +
    getAccuracy(to, maxAccuracyMeters)
}

function copySuspect (sample) {
  return sample && typeof sample === 'object' ? { ...sample } : sample
}

/**
 * 判断一个定位样本是否可被轨迹接受。输入状态不会被修改。
 * 
 * 调用方在 accepted=true 时将 sample 保存为 lastAccepted，并始终保存返回的 suspect。
 */
export function assessPositionSample (trackerState = {}, sample, options = {}) {
  const lastAccepted = trackerState?.lastAccepted ?? null
  const previousSuspect = trackerState?.suspect ?? null

  if (!isUsableCoordinate(sample)) {
    return {
      accepted: false,
      reason: 'invalid-sample',
      distanceMeters: null,
      allowedDistanceMeters: null,
      reanchored: false,
      suspect: previousSuspect,
    }
  }

  const accuracy = finiteNumber(sample?.accuracy ?? sample?.coords?.accuracy)
  if (accuracy !== null && accuracy > 50) {
    return {
      accepted: false,
      reason: 'poor-accuracy',
      distanceMeters: null,
      allowedDistanceMeters: null,
      reanchored: false,
      suspect: previousSuspect,
    }
  }

  if (!lastAccepted || !isUsableCoordinate(lastAccepted)) {
    return {
      accepted: true,
      reason: 'initial-sample',
      distanceMeters: 0,
      allowedDistanceMeters: null,
      reanchored: false,
      suspect: null,
    }
  }

  const distanceMeters = distanceInMeters(lastAccepted, sample)
  const allowedDistanceMeters = movementAllowance(lastAccepted, sample, options)
  const lastTimestamp = getTimestamp(lastAccepted)
  const sampleTimestamp = getTimestamp(sample)
  const reanchorAfterMs = nonNegativeNumber(options.reanchorAfterMs, DEFAULT_REANCHOR_AFTER_MS)
  const hasLongGap = lastTimestamp !== null && sampleTimestamp !== null &&
    sampleTimestamp - lastTimestamp >= reanchorAfterMs

  if (hasLongGap) {
    return {
      accepted: true,
      reason: 'long-gap-reanchor',
      distanceMeters,
      allowedDistanceMeters,
      reanchored: true,
      suspect: null,
    }
  }

  if (distanceMeters <= allowedDistanceMeters) {
    return {
      accepted: true,
      reason: 'within-dynamic-threshold',
      distanceMeters,
      allowedDistanceMeters,
      reanchored: false,
      suspect: null,
    }
  }

  if (previousSuspect && isUsableCoordinate(previousSuspect)) {
    const suspectTimestamp = getTimestamp(previousSuspect)
    const suspectDistance = distanceInMeters(previousSuspect, sample)
    const isIndependent = suspectTimestamp === null || sampleTimestamp === null ||
      sampleTimestamp > suspectTimestamp ||
      (sampleTimestamp === suspectTimestamp && suspectDistance > 0.5)
    const suspectAllowance = Math.max(
      nonNegativeNumber(options.suspectRadiusMeters, 150),
      movementAllowance(previousSuspect, sample, options),
    )

    if (isIndependent && suspectDistance <= suspectAllowance) {
      return {
        accepted: true,
        reason: 'confirmed-reanchor',
        distanceMeters,
        allowedDistanceMeters,
        reanchored: true,
        suspect: null,
      }
    }

    if (!isIndependent) {
      return {
        accepted: false,
        reason: 'duplicate-suspect',
        distanceMeters,
        allowedDistanceMeters,
        reanchored: false,
        suspect: previousSuspect,
      }
    }
  }

  return {
    accepted: false,
    reason: 'suspect-jump',
    distanceMeters,
    allowedDistanceMeters,
    reanchored: false,
    suspect: copySuspect(sample),
  }
}

export function formatContinuousLocationState (stateOrPhase) {
  const phase = typeof stateOrPhase === 'string' ? stateOrPhase : stateOrPhase?.phase
  return CONTINUOUS_LOCATION_PHASE_LABELS[phase] || '定位状态未知'
}

export function applyContinuousLocationButtonState (element, state) {
  const phase = typeof state === 'string' ? state : state?.phase
  const label = formatContinuousLocationState(state)
  if (!element) return label
  if (element.dataset) {
    element.dataset.locationPhase = phase || 'unknown'
    element.dataset.locationLabel = label
  }
  element.title = label
  element.setAttribute?.('aria-label', label)
  return label
}

function normalizePermissionState (value) {
  const state = typeof value === 'string' ? value : value?.state
  return ['granted', 'prompt', 'denied'].includes(state) ? state : 'unknown'
}

function normalizeSourceError (error, now) {
  const rawCode = finiteNumber(error?.code)
  const namedCode = String(error?.code ?? error?.name ?? '').toUpperCase()
  let code = 'source-error'
  if (rawCode === 1 || namedCode === 'GEOLOCATION_PERMISSION_DENIED' || namedCode === 'PERMISSION_DENIED') {
    code = 'permission-denied'
  } else if (rawCode === 2 || namedCode === 'GEOLOCATION_UNAVAILABLE' || namedCode === 'POSITION_UNAVAILABLE') {
    code = 'position-unavailable'
  } else if (rawCode === 3 || namedCode === 'GEOLOCATION_TIMEOUT' || namedCode === 'TIMEOUT') {
    code = 'timeout'
  } else if (namedCode === 'GEOLOCATION_UNSUPPORTED' || namedCode === 'GEOLOCATION_WATCH_UNSUPPORTED') {
    code = 'unsupported'
  }
  const messages = {
    'permission-denied': '定位权限已被禁止',
    'position-unavailable': '暂时无法获取定位',
    timeout: '获取定位超时',
    unsupported: '当前环境不支持持续定位',
    'source-error': '定位服务暂时异常',
  }
  return { code, message: messages[code], at: now }
}

function createAbortController () {
  if (typeof AbortController === 'function') return new AbortController()
  const signal = { aborted: false }
  return {
    signal,
    abort () {
      signal.aborted = true
    },
  }
}

function bindMethod (owner, directMethod, methodName) {
  const method = directMethod || owner?.[methodName]
  if (typeof method !== 'function') return null
  return (...args) => method.apply(directMethod ? undefined : owner, args)
}

function clockAdapter (clock = {}) {
  return {
    now: typeof clock.now === 'function' ? () => clock.now() : () => Date.now(),
    setTimeout: typeof clock.setTimeout === 'function'
      ? (callback, delay) => clock.setTimeout(callback, delay)
      : (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: typeof clock.clearTimeout === 'function'
      ? id => clock.clearTimeout(id)
      : id => globalThis.clearTimeout(id),
  }
}

function lifecycleIsVisible (lifecycle) {
  if (!lifecycle) return true
  if (typeof lifecycle.isVisible === 'function') return lifecycle.isVisible() !== false
  if (typeof lifecycle.visibilityState === 'function') return lifecycle.visibilityState() !== 'hidden'
  if (typeof lifecycle.visibilityState === 'string') return lifecycle.visibilityState !== 'hidden'
  return true
}

function addLifecycleListener (lifecycle, eventName, listener) {
  if (typeof lifecycle?.addEventListener === 'function') {
    lifecycle.addEventListener(eventName, listener)
    return () => lifecycle.removeEventListener?.(eventName, listener)
  }
  if (typeof lifecycle?.on === 'function') {
    lifecycle.on(eventName, listener)
    return () => lifecycle.off?.(eventName, listener)
  }
  return () => {}
}

/**
 * 创建无 DOM/地图框架依赖的持续定位控制器。
 *
 * source.watchPosition/clearWatch 遵循 Geolocation API；pollPosition 返回 Promise。
 */
export function createContinuousLocationController (options = {}) {
  const source = options.source || null
  const watchPosition = bindMethod(source, options.watchPosition, 'watchPosition')
  const clearWatch = bindMethod(source, options.clearWatch, 'clearWatch')
  const pollPosition = bindMethod(source, options.pollPosition, 'pollPosition')
  const subscribePermission = bindMethod(source, options.subscribePermission, 'subscribePermission') ||
    bindMethod(source, options.onPermissionChange, 'onPermissionChange')
  const getPermissionState = bindMethod(source, options.getPermissionState, 'getPermissionState')
  const lifecycle = options.lifecycle || null
  const timerClock = clockAdapter(options.clock)
  const onPosition = typeof options.onPosition === 'function' ? options.onPosition : () => {}
  const onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : () => {}

  let config = {
    intervalMs: nonNegativeNumber(options.intervalMs, DEFAULT_INTERVAL_MS),
    pollIntervalMs: nonNegativeNumber(options.pollIntervalMs, nonNegativeNumber(options.intervalMs, DEFAULT_INTERVAL_MS)),
    staleTimeoutMs: nonNegativeNumber(
      options.staleTimeoutMs,
      Math.max(MIN_DEFAULT_STALE_TIMEOUT_MS, nonNegativeNumber(options.intervalMs, DEFAULT_INTERVAL_MS) * 4),
    ),
    retryBaseMs: nonNegativeNumber(options.retryBaseMs, DEFAULT_BACKOFF_MS),
    retryMaxMs: nonNegativeNumber(options.retryMaxMs, DEFAULT_MAX_BACKOFF_MS),
    lifecycleDebounceMs: nonNegativeNumber(options.lifecycleDebounceMs, DEFAULT_LIFECYCLE_DEBOUNCE_MS),
    watchFailuresBeforePoll: Math.max(1, Math.floor(nonNegativeNumber(
      options.watchFailuresBeforePoll,
      DEFAULT_WATCH_FAILURES_BEFORE_POLL,
    ))),
    timestampNonProgressLimit: Math.max(1, Math.floor(nonNegativeNumber(
      options.timestampNonProgressLimit,
      DEFAULT_TIMESTAMP_NON_PROGRESS_LIMIT,
    ))),
    consumerTimeoutMs: nonNegativeNumber(
      options.consumerTimeoutMs,
      Math.max(DEFAULT_CONSUMER_TIMEOUT_MS, nonNegativeNumber(options.intervalMs, DEFAULT_INTERVAL_MS) * 2),
    ),
    positionOptions: options.positionOptions,
  }
  let staleTimeoutWasDefault = options.staleTimeoutMs === undefined
  let pollIntervalWasDefault = options.pollIntervalMs === undefined
  let consumerTimeoutWasDefault = options.consumerTimeoutMs === undefined

  const state = {
    desiredActive: false,
    phase: 'idle',
    generation: 0,
    watchId: null,
    activeSource: null,
    lastSignalAt: null,
    lastFixAt: null,
    lastProviderTimestamp: null,
    consecutiveTimestampAnomalies: 0,
    consecutiveFailures: 0,
    restartCount: 0,
    lastError: null,
    permissionState: normalizePermissionState(options.permissionState ?? source?.permissionState),
  }

  let destroyed = false
  let watchDisabled = false
  let watchdogTimer = null
  let recoveryTimer = null
  let pollTimer = null
  let consumeTimer = null
  let consumerDeadlineTimer = null
  let activeAbortController = null
  let pendingPosition = null
  let consumerRunning = false
  let consumerRunToken = 0
  let lastConsumeAt = null
  let lifecycleCleanups = []
  let permissionCleanup = null
  let permissionCheckToken = 0
  let sourceStartedAt = null
  let consecutiveWatchFailures = 0
  let acceptedProviderTimestampCount = 0
  let lastProviderPosition = null

  function snapshot () {
    return {
      ...state,
      lastError: state.lastError ? { ...state.lastError } : null,
      intervalMs: config.intervalMs,
      staleTimeoutMs: config.staleTimeoutMs,
      consumerTimeoutMs: config.consumerTimeoutMs,
    }
  }

  function emitState () {
    try {
      onStateChange(snapshot())
    } catch {
      // 状态展示层异常不得影响定位源。
    }
  }

  function clearTimer (name) {
    const id = name === 'watchdog'
      ? watchdogTimer
      : name === 'recovery'
        ? recoveryTimer
        : name === 'poll'
          ? pollTimer
          : consumeTimer
    if (id === null) return
    timerClock.clearTimeout(id)
    if (name === 'watchdog') watchdogTimer = null
    else if (name === 'recovery') recoveryTimer = null
    else if (name === 'poll') pollTimer = null
    else consumeTimer = null
  }

  function clearCurrentWatch () {
    const id = state.watchId
    state.watchId = null
    if (id === null || !clearWatch) return
    try {
      clearWatch(id)
    } catch {
      // 无法弥补 provider 内部清理失败，但不让控制器卡死。
    }
  }

  function abortConsumerGeneration () {
    activeAbortController?.abort()
    activeAbortController = null
    pendingPosition = null
    clearTimer('consume')
    if (consumerDeadlineTimer !== null) {
      timerClock.clearTimeout(consumerDeadlineTimer)
      consumerDeadlineTimer = null
    }
    consumerRunToken += 1
    consumerRunning = false
    lastConsumeAt = null
  }

  function clearActiveSource () {
    clearCurrentWatch()
    clearTimer('watchdog')
    clearTimer('poll')
    state.activeSource = null
    sourceStartedAt = null
    abortConsumerGeneration()
  }

  function invalidateActiveSource () {
    state.generation += 1
    // provider/WebView 在重建后可能重置时间戳基准或遇到系统时钟回拨。
    // generation 已隔离旧回调，因此新源应重新建立自己的时间戳水位线。
    state.lastProviderTimestamp = null
    state.consecutiveTimestampAnomalies = 0
    acceptedProviderTimestampCount = 0
    lastProviderPosition = null
    clearActiveSource()
    return state.generation
  }

  function isCurrent (generation) {
    return state.desiredActive && !destroyed && generation === state.generation
  }

  function repairClockRollback (now) {
    if (sourceStartedAt !== null && now < sourceStartedAt) sourceStartedAt = now
    if (state.lastSignalAt !== null && now < state.lastSignalAt) state.lastSignalAt = now
    if (lastConsumeAt !== null && now < lastConsumeAt) lastConsumeAt = null
  }

  function scheduleWatchdog (generation) {
    clearTimer('watchdog')
    if (!isCurrent(generation) || state.phase === 'suspended' || state.phase === 'permission-blocked') return
    const currentNow = timerClock.now()
    repairClockRollback(currentNow)
    const healthBaseline = state.lastSignalAt !== null && state.lastSignalAt >= sourceStartedAt
      ? state.lastSignalAt
      : sourceStartedAt
    const elapsed = healthBaseline === null ? 0 : Math.max(0, currentNow - healthBaseline)
    const delay = Math.max(0, config.staleTimeoutMs - elapsed)
    watchdogTimer = timerClock.setTimeout(() => {
      watchdogTimer = null
      if (!isCurrent(generation)) return
      repairClockRollback(timerClock.now())
      const latestBaseline = state.lastSignalAt !== null && state.lastSignalAt >= sourceStartedAt
        ? state.lastSignalAt
        : sourceStartedAt
      const silentFor = latestBaseline === null
        ? config.staleTimeoutMs
        : Math.max(0, timerClock.now() - latestBaseline)
      if (silentFor < config.staleTimeoutMs) {
        scheduleWatchdog(generation)
        return
      }
      state.phase = 'stale'
      state.lastError = {
        code: 'provider-stale',
        message: '长时间未收到定位信号',
        at: timerClock.now(),
      }
      emitState()
      if (state.activeSource === 'watch') {
        consecutiveWatchFailures += 1
        if (consecutiveWatchFailures >= config.watchFailuresBeforePoll && pollPosition) {
          watchDisabled = true
        }
      }
      scheduleRebuild(0)
    }, delay)
  }

  function calculateBackoff () {
    const exponent = Math.max(0, state.consecutiveFailures - 1)
    return Math.min(config.retryMaxMs, config.retryBaseMs * (2 ** Math.min(exponent, 20)))
  }

  function recordConsumerFailure () {
    state.lastError = {
      code: 'consumer-error',
      message: '地图位置更新失败，定位将继续',
      at: timerClock.now(),
    }
    emitState()
  }

  function drainPendingPosition (generation) {
    if (!isCurrent(generation) || consumerRunning || !pendingPosition) return
    const now = timerClock.now()
    repairClockRollback(now)
    const wait = lastConsumeAt === null ? 0 : Math.max(0, config.intervalMs - (now - lastConsumeAt))
    if (wait > 0) {
      if (consumeTimer === null) {
        consumeTimer = timerClock.setTimeout(() => {
          consumeTimer = null
          drainPendingPosition(generation)
        }, wait)
      }
      return
    }

    const item = pendingPosition
    pendingPosition = null
    consumerRunning = true
    lastConsumeAt = now
    const runToken = ++consumerRunToken
    const signal = activeAbortController?.signal

    const consumerPromise = Promise.resolve()
      .then(() => onPosition(item.position, {
        generation,
        signal,
        providerTimestamp: item.providerTimestamp,
      }))

    const guardedConsumer = config.consumerTimeoutMs > 0
      ? Promise.race([
          consumerPromise,
          new Promise((resolve, reject) => {
            consumerDeadlineTimer = timerClock.setTimeout(() => {
              consumerDeadlineTimer = null
              const error = new Error('地图位置更新等待超时')
              error.code = 'consumer-timeout'
              reject(error)
            }, config.consumerTimeoutMs)
          }),
        ])
      : consumerPromise

    guardedConsumer
      .then((result) => {
        if (!isCurrent(generation) || runToken !== consumerRunToken || signal?.aborted) return
        if (result === false) {
          recordConsumerFailure()
          return
        }
        state.lastFixAt = timerClock.now()
        state.lastError = null
        emitState()
      })
      .catch((error) => {
        if (isCurrent(generation) && runToken === consumerRunToken && !signal?.aborted) {
          if (error?.code === 'consumer-timeout') {
            state.consecutiveFailures += 1
            state.lastError = {
              code: 'consumer-timeout',
              message: '地图位置更新超时，正在自动恢复定位',
              at: timerClock.now(),
            }
            emitState()
            scheduleRebuild(0)
          } else {
            recordConsumerFailure()
          }
        }
      })
      .finally(() => {
        if (runToken !== consumerRunToken) return
        if (consumerDeadlineTimer !== null) {
          timerClock.clearTimeout(consumerDeadlineTimer)
          consumerDeadlineTimer = null
        }
        consumerRunning = false
        if (isCurrent(generation)) drainPendingPosition(generation)
      })
  }

  function handlePosition (position, generation) {
    if (!isCurrent(generation)) return
    if (!isUsableCoordinate(position)) {
      handleSourceError({ code: 'POSITION_INVALID' }, generation)
      return
    }
    const now = timerClock.now()
    repairClockRollback(now)
    // lastSignalAt 表示 provider 回调活性；时间戳是否推进由独立计数保护。
    // 少量乱序仍算 watcher 有信号，连续异常达到阈值则立即重建，不会永久假健康。
    state.lastSignalAt = now
    scheduleWatchdog(generation)
    const rawTimestamp = getTimestamp(position)
    const providerTimestamp = rawTimestamp === null ? now : rawTimestamp
    const timestampRegressed = state.lastProviderTimestamp !== null &&
      providerTimestamp < state.lastProviderTimestamp
    const cachedFixRepeated = state.lastProviderTimestamp !== null &&
      providerTimestamp === state.lastProviderTimestamp &&
      isSameProviderFix(position, lastProviderPosition)
    if (timestampRegressed || cachedFixRepeated) {
      state.consecutiveTimestampAnomalies += 1
      if (state.consecutiveTimestampAnomalies >= config.timestampNonProgressLimit) {
        if (state.activeSource === 'watch') {
          consecutiveWatchFailures += 1
          if (consecutiveWatchFailures >= config.watchFailuresBeforePoll && pollPosition) {
            watchDisabled = true
          }
        }
        state.consecutiveFailures += 1
        state.lastError = {
          code: 'provider-timestamp-not-progressing',
          message: '定位数据持续未推进，正在自动重建定位源',
          at: now,
        }
        scheduleRebuild(0)
        return
      }
      emitState()
      return
    }

    state.consecutiveTimestampAnomalies = 0
    state.lastProviderTimestamp = state.lastProviderTimestamp === null
      ? providerTimestamp
      : Math.max(state.lastProviderTimestamp, providerTimestamp)
    lastProviderPosition = position
    acceptedProviderTimestampCount += 1
    if (state.activeSource === 'watch' && acceptedProviderTimestampCount >= 2) {
      consecutiveWatchFailures = 0
    }
    state.consecutiveFailures = 0
    state.permissionState = 'granted'
    state.phase = 'tracking'
    pendingPosition = { position, providerTimestamp }
    emitState()
    drainPendingPosition(generation)
  }

  function blockForPermission (error) {
    state.permissionState = 'denied'
    state.consecutiveFailures += 1
    state.lastError = error
    invalidateActiveSource()
    clearTimer('recovery')
    state.phase = 'permission-blocked'
    emitState()
  }

  function handleSourceError (rawError, generation) {
    if (!isCurrent(generation)) return
    state.lastSignalAt = timerClock.now()
    const error = normalizeSourceError(rawError, timerClock.now())
    if (error.code === 'permission-denied') {
      blockForPermission(error)
      return
    }
    if (error.code === 'unsupported') {
      state.lastError = error
      invalidateActiveSource()
      clearTimer('recovery')
      state.phase = 'unsupported'
      emitState()
      return
    }

    if (state.activeSource === 'watch') {
      consecutiveWatchFailures += 1
      if (consecutiveWatchFailures >= config.watchFailuresBeforePoll && pollPosition) {
        watchDisabled = true
      }
    }

    state.consecutiveFailures += 1
    state.lastError = error
    emitState()
    scheduleRebuild(calculateBackoff())
  }

  function scheduleNextPoll (generation) {
    clearTimer('poll')
    if (!isCurrent(generation) || state.activeSource !== 'poll') return
    pollTimer = timerClock.setTimeout(() => {
      pollTimer = null
      runPoll(generation)
    }, config.pollIntervalMs)
  }

  function runPoll (generation) {
    if (!isCurrent(generation) || state.activeSource !== 'poll' || !pollPosition) return
    let result
    try {
      result = pollPosition({
        generation,
        signal: activeAbortController?.signal,
        now: timerClock.now,
        setTimeoutFn: timerClock.setTimeout,
        clearTimeoutFn: timerClock.clearTimeout,
      })
    } catch (error) {
      handleSourceError(error, generation)
      return
    }

    Promise.resolve(result)
      .then(position => {
        if (isCurrent(generation)) handlePosition(position, generation)
      })
      .catch(error => {
        if (isCurrent(generation)) handleSourceError(error, generation)
      })
      .finally(() => {
        if (isCurrent(generation) && state.activeSource === 'poll') scheduleNextPoll(generation)
      })
  }

  function fallBackToPoll (generation) {
    if (!pollPosition || !isCurrent(generation)) return false
    watchDisabled = true
    state.watchId = null
    state.activeSource = 'poll'
    scheduleWatchdog(generation)
    emitState()
    runPoll(generation)
    return true
  }

  function activateSource (generation, isRestart) {
    if (!isCurrent(generation)) return
    clearTimer('recovery')
    activeAbortController = createAbortController()
    state.phase = isRestart ? 'recovering' : 'starting'
    sourceStartedAt = timerClock.now()
    state.activeSource = null
    if (isRestart) state.restartCount += 1
    emitState()
    if (!isCurrent(generation)) return

    if (watchPosition && !watchDisabled) {
      let id
      try {
        id = watchPosition(
          position => {
            if (state.activeSource === 'poll') return
            handlePosition(position, generation)
          },
          error => {
            if (state.activeSource === 'poll') return
            handleSourceError(error, generation)
          },
          {
            ...(config.positionOptions || {}),
            signal: activeAbortController.signal,
            now: timerClock.now,
          },
        )
      } catch (error) {
        if (fallBackToPoll(generation)) return
        handleSourceError(error, generation)
        return
      }

      if (!isCurrent(generation)) {
        if (id !== undefined && id !== null && clearWatch) {
          try {
            clearWatch(id)
          } catch {}
        }
        return
      }

      if (id === undefined || id === null) {
        if (fallBackToPoll(generation)) return
        handleSourceError({ code: 'GEOLOCATION_WATCH_UNSUPPORTED' }, generation)
        return
      }
      state.watchId = id
      state.activeSource = 'watch'
      scheduleWatchdog(generation)
      emitState()
      return
    }

    if (fallBackToPoll(generation)) return
    state.phase = 'unsupported'
    state.lastError = {
      code: 'unsupported',
      message: '当前环境不支持持续定位',
      at: timerClock.now(),
    }
    emitState()
  }

  function scheduleRebuild (delay) {
    if (!state.desiredActive || destroyed) return
    clearTimer('recovery')
    const generation = invalidateActiveSource()
    state.phase = 'recovering'
    emitState()
    if (delay <= 0) {
      activateSource(generation, true)
      return
    }
    recoveryTimer = timerClock.setTimeout(() => {
      recoveryTimer = null
      activateSource(generation, true)
    }, delay)
  }

  function suspend () {
    if (!state.desiredActive || state.phase === 'suspended') return
    clearTimer('recovery')
    invalidateActiveSource()
    state.phase = 'suspended'
    emitState()
  }

  function recoverAfterLifecycle () {
    if (!state.desiredActive || destroyed || !lifecycleIsVisible(lifecycle)) return
    if (state.phase === 'permission-blocked') {
      refreshPermission(true)
      return
    }
    const now = timerClock.now()
    repairClockRollback(now)
    const silentFor = state.lastSignalAt === null ? Infinity : now - state.lastSignalAt
    if (state.phase === 'suspended' || !state.activeSource || silentFor >= config.staleTimeoutMs) {
      scheduleRebuild(0)
    }
  }

  function scheduleLifecycleRecovery () {
    if (!state.desiredActive || destroyed || !lifecycleIsVisible(lifecycle)) return
    if (recoveryTimer !== null) return
    const generation = state.generation
    recoveryTimer = timerClock.setTimeout(() => {
      recoveryTimer = null
      if (!isCurrent(generation)) return
      recoverAfterLifecycle()
    }, config.lifecycleDebounceMs)
  }

  function handlePermissionState (value, allowUnknownProbe = false) {
    if (!state.desiredActive || destroyed) return
    const permissionState = normalizePermissionState(value)
    state.permissionState = permissionState
    if (permissionState === 'denied') {
      blockForPermission({
        code: 'permission-denied',
        message: '定位权限已被禁止',
        at: timerClock.now(),
      })
      return
    }
    emitState()
    if (state.phase === 'permission-blocked' || (!state.activeSource && state.phase !== 'suspended')) {
      scheduleRebuild(0)
    } else if (allowUnknownProbe && permissionState === 'unknown' && state.phase === 'permission-blocked') {
      scheduleRebuild(0)
    }
  }

  function refreshPermission (allowUnknownProbe = false) {
    if (!getPermissionState) {
      if (allowUnknownProbe && state.phase === 'permission-blocked') {
        state.permissionState = 'unknown'
        scheduleRebuild(0)
      }
      return
    }
    const token = ++permissionCheckToken
    let result
    try {
      result = getPermissionState()
    } catch {
      if (allowUnknownProbe && state.phase === 'permission-blocked') scheduleRebuild(0)
      return
    }
    Promise.resolve(result).then((value) => {
      if (token !== permissionCheckToken || !state.desiredActive || destroyed) return
      handlePermissionState(value, allowUnknownProbe)
    }).catch(() => {
      if (token === permissionCheckToken && allowUnknownProbe && state.phase === 'permission-blocked') {
        scheduleRebuild(0)
      }
    })
  }

  function bindRuntimeListeners () {
    if (lifecycleCleanups.length === 0 && lifecycle) {
      lifecycleCleanups = [
        addLifecycleListener(lifecycle, 'pagehide', suspend),
        addLifecycleListener(lifecycle, 'freeze', suspend),
        addLifecycleListener(lifecycle, 'visibilitychange', scheduleLifecycleRecovery),
        addLifecycleListener(lifecycle, 'pageshow', scheduleLifecycleRecovery),
        addLifecycleListener(lifecycle, 'resume', scheduleLifecycleRecovery),
        addLifecycleListener(lifecycle, 'focus', scheduleLifecycleRecovery),
        addLifecycleListener(lifecycle, 'online', scheduleLifecycleRecovery),
      ]
    }
    if (!permissionCleanup && subscribePermission) {
      try {
        const cleanup = subscribePermission(value => handlePermissionState(value))
        permissionCleanup = typeof cleanup === 'function' ? cleanup : () => {}
      } catch {
        permissionCleanup = () => {}
      }
    }
  }

  function unbindRuntimeListeners () {
    for (const cleanup of lifecycleCleanups.splice(0)) {
      try {
        cleanup()
      } catch {}
    }
    if (permissionCleanup) {
      try {
        permissionCleanup()
      } catch {}
      permissionCleanup = null
    }
    permissionCheckToken += 1
  }

  function start () {
    if (destroyed || state.desiredActive) return snapshot()
    state.desiredActive = true
    watchDisabled = false
    state.lastSignalAt = null
    state.lastFixAt = null
    state.lastProviderTimestamp = null
    state.consecutiveTimestampAnomalies = 0
    state.consecutiveFailures = 0
    state.restartCount = 0
    consecutiveWatchFailures = 0
    acceptedProviderTimestampCount = 0
    lastProviderPosition = null
    state.lastError = null
    bindRuntimeListeners()

    if (state.permissionState === 'denied') {
      state.generation += 1
      state.phase = 'permission-blocked'
      emitState()
      refreshPermission()
      return snapshot()
    }

    state.generation += 1
    activateSource(state.generation, false)
    refreshPermission()
    return snapshot()
  }

  function stop () {
    if (!state.desiredActive && state.phase === 'idle') return snapshot()
    state.desiredActive = false
    state.generation += 1
    clearTimer('recovery')
    clearActiveSource()
    unbindRuntimeListeners()
    state.phase = 'idle'
    state.watchId = null
    state.activeSource = null
    state.lastProviderTimestamp = null
    state.consecutiveTimestampAnomalies = 0
    acceptedProviderTimestampCount = 0
    lastProviderPosition = null
    state.consecutiveFailures = 0
    state.lastError = null
    emitState()
    return snapshot()
  }

  function configure (patch = {}) {
    const previousInterval = config.intervalMs
    if (patch.intervalSeconds !== undefined && patch.intervalMs === undefined) {
      patch = { ...patch, intervalMs: Number(patch.intervalSeconds) * 1000 }
    }
    if (patch.intervalMs !== undefined) config.intervalMs = nonNegativeNumber(patch.intervalMs, config.intervalMs)
    if (patch.pollIntervalMs !== undefined) {
      config.pollIntervalMs = nonNegativeNumber(patch.pollIntervalMs, config.pollIntervalMs)
      pollIntervalWasDefault = false
    } else if (pollIntervalWasDefault && config.intervalMs !== previousInterval) {
      config.pollIntervalMs = config.intervalMs
    }
    if (patch.staleTimeoutMs !== undefined) {
      config.staleTimeoutMs = nonNegativeNumber(patch.staleTimeoutMs, config.staleTimeoutMs)
      staleTimeoutWasDefault = false
    } else if (staleTimeoutWasDefault && config.intervalMs !== previousInterval) {
      config.staleTimeoutMs = Math.max(MIN_DEFAULT_STALE_TIMEOUT_MS, config.intervalMs * 4)
    }
    if (patch.retryBaseMs !== undefined) config.retryBaseMs = nonNegativeNumber(patch.retryBaseMs, config.retryBaseMs)
    if (patch.retryMaxMs !== undefined) config.retryMaxMs = nonNegativeNumber(patch.retryMaxMs, config.retryMaxMs)
    if (patch.lifecycleDebounceMs !== undefined) {
      config.lifecycleDebounceMs = nonNegativeNumber(patch.lifecycleDebounceMs, config.lifecycleDebounceMs)
    }
    if (patch.timestampNonProgressLimit !== undefined) {
      config.timestampNonProgressLimit = Math.max(1, Math.floor(nonNegativeNumber(
        patch.timestampNonProgressLimit,
        config.timestampNonProgressLimit,
      )))
    }
    if (patch.consumerTimeoutMs !== undefined) {
      config.consumerTimeoutMs = nonNegativeNumber(patch.consumerTimeoutMs, config.consumerTimeoutMs)
      consumerTimeoutWasDefault = false
    } else if (consumerTimeoutWasDefault && config.intervalMs !== previousInterval) {
      config.consumerTimeoutMs = Math.max(DEFAULT_CONSUMER_TIMEOUT_MS, config.intervalMs * 2)
    }
    if (patch.positionOptions !== undefined) config.positionOptions = patch.positionOptions

    if (state.desiredActive) {
      if (state.activeSource === 'poll' && pollTimer !== null) scheduleNextPoll(state.generation)
      if (state.activeSource) scheduleWatchdog(state.generation)
      if (pendingPosition) {
        clearTimer('consume')
        drainPendingPosition(state.generation)
      }
    }
    emitState()
    return snapshot()
  }

  function checkHealth () {
    if (!state.desiredActive || destroyed) return snapshot()
    recoverAfterLifecycle()
    return snapshot()
  }

  function destroy () {
    stop()
    destroyed = true
  }

  return {
    start,
    stop,
    configure,
    checkHealth,
    destroy,
    getState: snapshot,
  }
}
