import { wgs84ToGcj02 } from './coord-transform.js'

const BROWSER_GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 0,
}

// 浏览器和高德自身都有 12 秒超时，但部分 WebView/插件异常时不会触发回调。
// 应用层 deadline 略晚于底层超时，保证 Promise 最终一定结束。
const DEFAULT_APPLICATION_DEADLINE_MS = BROWSER_GEOLOCATION_OPTIONS.timeout + 1000

export function initAmapGeolocation (AMap) {
  if (!AMap?.Geolocation) {
    console.warn('高德定位插件加载失败，将仅使用浏览器定位')
    return null
  }

  return new AMap.Geolocation({
    enableHighAccuracy: true,
    noIpLocate: 3,
    timeout: 12000,
    maximumAge: 0,
    convert: true,
    showButton: false,
    showMarker: false,
    showCircle: false,
    panToLocation: false,
    zoomToAccuracy: false,
  })
}

function toFiniteNumber (value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function isValidPosition (position) {
  const lat = toFiniteNumber(position?.lat)
  const lng = toFiniteNumber(position?.lng)
  return lat !== null &&
    lng !== null &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
}

function normalizeLngForLeaflet (lng) {
  return lng < 0 ? lng + 360 : lng
}

export function positionToGcj02 (position) {
  const lat = Number(position.lat)
  const lng = Number(position.lng)

  if (position.coordType === 'gcj02') {
    return {
      lat,
      lng,
      accuracy: position.accuracy,
      source: position.source,
      coordType: 'gcj02',
      locationType: position.locationType,
    }
  }

  const [convertedLng, convertedLat] = wgs84ToGcj02([lng, lat])
  return {
    lat: convertedLat,
    lng: convertedLng,
    accuracy: position.accuracy,
    source: position.source,
    coordType: 'gcj02',
    locationType: position.locationType,
  }
}

export function positionToLeafletLatLng (position) {
  const mapPosition = positionToGcj02(position)
  return [
    mapPosition.lat,
    normalizeLngForLeaflet(mapPosition.lng),
  ]
}

function createGeolocationError (message, code, source, cause) {
  const error = new Error(message)
  if (code !== undefined && code !== null) error.code = code
  if (source) error.source = source
  if (cause !== undefined) error.cause = cause
  return error
}

function createAbortError (signal) {
  if (signal?.reason instanceof Error) return signal.reason

  const error = typeof DOMException === 'function'
    ? new DOMException('定位请求已取消', 'AbortError')
    : createGeolocationError('定位请求已取消', 'ABORT_ERR')

  if (signal?.reason !== undefined && !('cause' in error)) {
    try {
      error.cause = signal.reason
    } catch (err) {}
  }
  return error
}

function createDeadlineError (source, deadlineMs) {
  return createGeolocationError(
    `${source === 'amap' ? '高德' : '浏览器'}定位等待超时（超过 ${deadlineMs} 毫秒）`,
    'GEOLOCATION_TIMEOUT',
    source,
  )
}

function resolveDeadlineMs (options, source) {
  const sourceDeadline = source === 'amap'
    ? options?.amapDeadlineMs
    : options?.browserDeadlineMs
  const deadline = toFiniteNumber(sourceDeadline ?? options?.deadlineMs)
  return deadline !== null && deadline >= 0
    ? deadline
    : DEFAULT_APPLICATION_DEADLINE_MS
}

function runWithDeadline (executor, options, source) {
  const deadlineMs = resolveDeadlineMs(options, source)
  const signal = options?.signal
  const setTimer = options?.setTimeoutFn || globalThis.setTimeout
  const clearTimer = options?.clearTimeoutFn || globalThis.clearTimeout

  return new Promise((resolve, reject) => {
    let settled = false
    let timerId = null

    const cleanup = () => {
      if (timerId !== null) {
        clearTimer(timerId)
        timerId = null
      }
      signal?.removeEventListener?.('abort', handleAbort)
    }

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      cleanup()
      callback(value)
    }

    const handleAbort = () => {
      finish(reject, createAbortError(signal))
    }

    if (signal?.aborted) {
      handleAbort()
      return
    }

    signal?.addEventListener?.('abort', handleAbort, { once: true })
    timerId = setTimer(() => {
      finish(reject, createDeadlineError(source, deadlineMs))
    }, deadlineMs)

    try {
      executor(
        value => finish(resolve, value),
        error => finish(reject, error),
        () => !settled,
      )
    } catch (err) {
      finish(reject, err)
    }
  })
}

function resolveNow (now) {
  const value = toFiniteNumber(typeof now === 'function' ? now() : Date.now())
  return value ?? Date.now()
}

function normalizeAccuracy (value) {
  const accuracy = toFiniteNumber(value)
  return accuracy !== null && accuracy >= 0 ? accuracy : null
}

function extractAmapPosition (result, now) {
  const lngLat = result?.position
  const lat = toFiniteNumber(typeof lngLat?.getLat === 'function' ? lngLat.getLat() : lngLat?.lat)
  const lng = toFiniteNumber(typeof lngLat?.getLng === 'function' ? lngLat.getLng() : lngLat?.lng)
  const sourceTimestamp = result?.timestamp ?? result?.time ?? lngLat?.timestamp
  const timestamp = toFiniteNumber(sourceTimestamp) ?? resolveNow(now)
  const position = {
    lat,
    lng,
    accuracy: normalizeAccuracy(result?.accuracy),
    source: 'amap',
    coordType: 'gcj02',
    locationType: result?.location_type || result?.locationType || '',
    timestamp,
  }

  return isValidPosition(position) ? position : null
}

function createAmapError (result, fallbackMessage, fallbackCode) {
  const message = result?.message || result?.info || fallbackMessage
  const code = result?.code ?? result?.errorCode ?? result?.infoCode ?? result?.info ?? fallbackCode
  // SDK 失败对象可能携带定位诊断或原始坐标，不挂到 Error.cause，避免被日志
  // 采集器意外持久化。对上层仅保留可分类的 code/message。
  return createGeolocationError(message, code, 'amap')
}

export function normalizeBrowserPosition (position, now = Date.now) {
  const coords = position?.coords
  const normalized = {
    lat: toFiniteNumber(coords?.latitude),
    lng: toFiniteNumber(coords?.longitude),
    accuracy: normalizeAccuracy(coords?.accuracy),
    source: 'browser',
    coordType: 'wgs84',
    locationType: 'html5',
    timestamp: toFiniteNumber(position?.timestamp) ?? resolveNow(now),
  }

  return isValidPosition(normalized) ? normalized : null
}

export function getAmapPosition (geolocation, options = {}) {
  return runWithDeadline((resolve, reject, isActive) => {
    if (typeof geolocation?.getCurrentPosition !== 'function') {
      reject(createGeolocationError('高德定位实例不可用', 'GEOLOCATION_UNAVAILABLE', 'amap'))
      return
    }

    geolocation.getCurrentPosition((status, result) => {
      if (!isActive()) return
      try {
        if (status === 'complete') {
          const position = extractAmapPosition(result, options.now)
          if (position) {
            resolve(position)
            return
          }
          reject(createAmapError(result, '高德定位返回了无效坐标', 'POSITION_INVALID'))
          return
        }

        reject(createAmapError(result, '高德定位失败', 'GEOLOCATION_FAILED'))
      } catch (err) {
        reject(err)
      }
    })
  }, options, 'amap')
}

function getNavigator (options) {
  if (Object.prototype.hasOwnProperty.call(options || {}, 'navigator')) {
    return options.navigator
  }
  return globalThis.navigator
}

function getBrowserPositionOptions (options = {}) {
  const overrides = options.browserOptions || options.positionOptions || {}
  const directOptions = {}
  for (const key of ['enableHighAccuracy', 'timeout', 'maximumAge']) {
    if (options[key] !== undefined) directOptions[key] = options[key]
  }
  return {
    ...BROWSER_GEOLOCATION_OPTIONS,
    ...overrides,
    ...directOptions,
  }
}

export function getBrowserPosition (options = {}) {
  return runWithDeadline((resolve, reject, isActive) => {
    const navigatorLike = getNavigator(options)
    if (typeof navigatorLike?.geolocation?.getCurrentPosition !== 'function') {
      reject(createGeolocationError(
        '你的浏览器不支持当前地理位置信息获取',
        'GEOLOCATION_UNSUPPORTED',
        'browser',
      ))
      return
    }

    navigatorLike.geolocation.getCurrentPosition((position) => {
      if (!isActive()) return
      try {
        const normalized = normalizeBrowserPosition(position, options.now)
        if (!normalized) {
          reject(createGeolocationError(
            '浏览器返回了无效的定位坐标',
            'POSITION_INVALID',
            'browser',
          ))
          return
        }
        resolve(normalized)
      } catch (err) {
        reject(err)
      }
    }, reject, getBrowserPositionOptions(options))
  }, options, 'browser')
}

export function getBestPosition (_geolocation, options = {}) {
  // 单次定位、持续 watch 和 watchdog 轮询统一使用浏览器 Geolocation：
  // 它提供明确的 WGS-84 契约。高德 JSAPI 2.0 在不同运行环境中可能
  // 返回无法可靠判定是否已经偏移的坐标，不能再用于设备位置仲裁。
  return getBrowserPosition(options)
}

function notifySoon (callback, value) {
  if (typeof callback !== 'function') return
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(() => callback(value))
    return
  }
  Promise.resolve().then(() => callback(value))
}

export function createContinuousGeolocationSource (amap, deps = {}) {
  const navigatorLike = Object.prototype.hasOwnProperty.call(deps, 'navigator')
    ? deps.navigator
    : globalThis.navigator
  const activeWatches = new Map()
  let nextWatchId = 1

  const clearWatch = (watchId) => {
    const watch = activeWatches.get(watchId)
    if (!watch) return
    activeWatches.delete(watchId)
    watch.active = false
    watch.signal?.removeEventListener?.('abort', watch.handleAbort)
    try {
      if (watch.nativeWatchId !== null && watch.nativeWatchId !== undefined) {
        navigatorLike?.geolocation?.clearWatch?.(watch.nativeWatchId)
      }
    } catch (err) {
      console.warn('停止浏览器持续定位监听失败', err)
    }
  }

  const watchPosition = (onPosition, onError, options = {}) => {
    if (typeof onPosition !== 'function') {
      throw new TypeError('持续定位成功回调必须是函数')
    }

    const browserGeolocation = navigatorLike?.geolocation
    if (typeof browserGeolocation?.watchPosition !== 'function') {
      return null
    }

    if (options.signal?.aborted) {
      return null
    }

    const watchId = nextWatchId++
    const watch = {
      active: true,
      nativeWatchId: null,
      signal: options.signal,
      handleAbort: null,
    }
    activeWatches.set(watchId, watch)

    watch.handleAbort = () => clearWatch(watchId)
    watch.signal?.addEventListener?.('abort', watch.handleAbort, { once: true })

    try {
      watch.nativeWatchId = browserGeolocation.watchPosition((position) => {
        if (!watch.active || options.signal?.aborted) return
        try {
          const normalized = normalizeBrowserPosition(position, options.now || deps.now)
          if (!normalized) {
            onError?.(createGeolocationError(
              '浏览器持续定位返回了无效坐标',
              'POSITION_INVALID',
              'browser',
            ))
            return
          }
          onPosition(normalized)
        } catch (err) {
          onError?.(err)
        }
      }, (error) => {
        if (!watch.active || options.signal?.aborted) return
        onError?.(error)
      }, getBrowserPositionOptions({
        ...(deps.positionOptions || {}),
        ...options,
      }))
    } catch (err) {
      clearWatch(watchId)
      throw err
    }

    if (!watch.active) {
      try {
        browserGeolocation.clearWatch?.(watch.nativeWatchId)
      } catch (err) {}
      return null
    }
    return watchId
  }

  const pollPosition = (options = {}) => getBestPosition(amap, {
    ...(deps.positionOptions || {}),
    ...options,
    navigator: navigatorLike,
    now: options.now || deps.now,
    setTimeoutFn: options.setTimeoutFn || deps.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn || deps.clearTimeoutFn,
  })

  const subscribePermission = (listener) => {
    if (typeof listener !== 'function') {
      throw new TypeError('定位权限监听器必须是函数')
    }

    let active = true
    let permissionStatus = null
    let changeHandler = null
    let previousOnChange = null

    const emit = (state, error) => {
      if (active) listener(state, error)
    }

    const unsubscribe = () => {
      if (!active) return
      active = false
      if (!permissionStatus || !changeHandler) return
      if (typeof permissionStatus.removeEventListener === 'function') {
        permissionStatus.removeEventListener('change', changeHandler)
      } else if (permissionStatus.onchange === changeHandler) {
        permissionStatus.onchange = previousOnChange
      }
    }

    const permissions = navigatorLike?.permissions
    if (typeof permissions?.query !== 'function') {
      notifySoon(() => emit('unknown'))
      return unsubscribe
    }

    Promise.resolve()
      .then(() => permissions.query({ name: 'geolocation' }))
      .then((status) => {
        if (!active) return
        permissionStatus = status
        changeHandler = () => emit(permissionStatus?.state || 'unknown')
        if (typeof permissionStatus?.addEventListener === 'function') {
          permissionStatus.addEventListener('change', changeHandler)
        } else if (permissionStatus) {
          previousOnChange = permissionStatus.onchange
          permissionStatus.onchange = changeHandler
        }
        emit(permissionStatus?.state || 'unknown')
      })
      .catch(error => emit('unknown', error))

    return unsubscribe
  }

  return {
    watchPosition,
    clearWatch,
    pollPosition,
    subscribePermission,
    permissions: {
      subscribe: subscribePermission,
    },
  }
}
