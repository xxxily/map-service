function abortController (controller, reason) {
  if (!controller || controller.signal?.aborted) return
  try {
    controller.abort(reason)
  } catch (error) {
    controller.abort()
  }
}

function createAbortReason (message = '定位请求已取消') {
  if (typeof DOMException === 'function') {
    return new DOMException(message, 'AbortError')
  }
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

/**
 * 让同一地图上的单次定位请求遵循 latest-wins 规则。
 * 旧请求即使之后从浏览器回调，也无法再取得当前请求资格。
 */
export function createLatestLocationRequestCoordinator ({
  createAbortController: createController = () => new AbortController(),
} = {}) {
  let generation = 0
  let active = null

  const cancel = (reason = createAbortReason()) => {
    if (!active) return false
    const previous = active
    active = null
    abortController(previous.controller, reason)
    return true
  }

  const begin = () => {
    cancel(createAbortReason('定位请求已被新的请求替代'))
    const controller = createController()
    const token = {
      generation: ++generation,
      controller,
      signal: controller.signal,
      isCurrent: () => active?.token === token && !controller.signal.aborted,
      abort: (reason = createAbortReason()) => {
        if (active?.token !== token) {
          abortController(controller, reason)
          return false
        }
        active = null
        abortController(controller, reason)
        return true
      },
      complete: () => {
        if (active?.token !== token) return false
        active = null
        return true
      },
    }
    active = { controller, token }
    return token
  }

  return {
    begin,
    cancel,
    isActive: () => Boolean(active?.token?.isCurrent()),
    getGeneration: () => generation,
  }
}

/**
 * 相机更新的 latest-wins 队列。
 * 用户拖拽、缩放或旋转期间不抢占相机，交互结束后只应用最后一个定位目标。
 */
export function createLocationCameraCoordinator ({
  isInteractionActive = () => false,
  applyTarget,
  subscribeInteractionEnd = () => () => {},
} = {}) {
  if (typeof applyTarget !== 'function') {
    throw new TypeError('定位相机协调器需要 applyTarget 函数')
  }

  let pendingTarget = null
  let interactionUnsubscribe = null
  let destroyed = false

  const clearInteractionSubscription = () => {
    if (typeof interactionUnsubscribe === 'function') {
      interactionUnsubscribe()
    }
    interactionUnsubscribe = null
  }

  const flush = () => {
    if (destroyed || pendingTarget === null) return false
    if (isInteractionActive()) {
      if (!interactionUnsubscribe) {
        interactionUnsubscribe = subscribeInteractionEnd(() => {
          const unsubscribe = interactionUnsubscribe
          interactionUnsubscribe = null
          if (typeof unsubscribe === 'function') unsubscribe()
          flush()
        })
      }
      return false
    }

    const target = pendingTarget
    pendingTarget = null
    clearInteractionSubscription()
    applyTarget(target)
    return true
  }

  return {
    update: target => {
      if (destroyed) return false
      pendingTarget = target
      return flush()
    },
    flush,
    cancel: () => {
      pendingTarget = null
      clearInteractionSubscription()
    },
    destroy: () => {
      destroyed = true
      pendingTarget = null
      clearInteractionSubscription()
    },
    hasPending: () => pendingTarget !== null,
  }
}
