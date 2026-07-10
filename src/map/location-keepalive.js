const SILENT_AUDIO_SOURCE = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

// 有效的 16x16 H.264 MP4；仅在 Screen Wake Lock 不可用时尽力降级。
const SILENT_VIDEO_SOURCE = '/location-keepalive.mp4'

function resolveDependency (dependencies, name) {
  if (Object.prototype.hasOwnProperty.call(dependencies, name)) {
    return dependencies[name]
  }
  return globalThis?.[name]
}

function noop () {}

/**
 * 创建一组可独立测试的定位保活控制器。
 *
 * dependencies 可注入 navigator、document、Audio 和 logger。所有浏览器依赖都在
 * 创建/启动控制器时惰性解析，服务端渲染及 node:test 导入本模块时不会访问 DOM。
 */
export function createLocationKeepAlive (dependencies = {}) {
  const navigatorRef = resolveDependency(dependencies, 'navigator')
  const documentRef = resolveDependency(dependencies, 'document')
  const AudioConstructor = resolveDependency(dependencies, 'Audio')
  const logger = resolveDependency(dependencies, 'logger') || globalThis.console

  let active = false
  let generation = 0
  let visibilityListenerAttached = false
  let wakeLockSentinel = null
  let wakeLockReleaseCleanup = noop
  let wakeLockRequest = null
  let wakeLockRetryGeneration = null

  const audioState = {
    element: null,
    playPromise: null,
    playing: false,
  }
  const videoState = {
    element: null,
    playPromise: null,
    playing: false,
    attached: false,
  }

  function warn (message, error) {
    try {
      logger?.warn?.(`[LocationKeepAlive] ${message}`, error)
    } catch (err) {}
  }

  function isVisible () {
    if (!documentRef) return true
    if (typeof documentRef.visibilityState === 'string') {
      return documentRef.visibilityState === 'visible'
    }
    if (typeof documentRef.hidden === 'boolean') {
      return !documentRef.hidden
    }
    return true
  }

  function configureMediaElement (element, source, { muted = false } = {}) {
    if (!element) return null

    try {
      element.src = source
      element.loop = true
      element.setAttribute?.('playsinline', '')
      if (muted) {
        element.muted = true
        element.setAttribute?.('muted', '')
      }
    } catch (err) {
      warn('初始化媒体保活资源失败', err)
    }
    return element
  }

  function getAudio () {
    if (audioState.element) return audioState.element

    try {
      if (typeof AudioConstructor === 'function') {
        audioState.element = configureMediaElement(
          new AudioConstructor(SILENT_AUDIO_SOURCE),
          SILENT_AUDIO_SOURCE,
        )
      } else if (typeof documentRef?.createElement === 'function') {
        audioState.element = configureMediaElement(
          documentRef.createElement('audio'),
          SILENT_AUDIO_SOURCE,
        )
      }
    } catch (err) {
      warn('创建音频保活资源失败', err)
    }

    return audioState.element
  }

  function attachFallbackVideo () {
    const video = videoState.element
    if (!video || videoState.attached || !documentRef?.body?.appendChild) return

    try {
      documentRef.body.appendChild(video)
      videoState.attached = true
    } catch (err) {
      warn('挂载视频保活资源失败', err)
    }
  }

  function getFallbackVideo () {
    if (!videoState.element) {
      if (typeof documentRef?.createElement !== 'function') return null

      try {
        const video = configureMediaElement(
          documentRef.createElement('video'),
          SILENT_VIDEO_SOURCE,
          { muted: true },
        )
        if (video) {
          // 地图 URL 含精确 coords；媒体请求禁止携带 Referer，避免坐标进入访问日志。
          video.referrerPolicy = 'no-referrer'
          video.setAttribute?.('referrerpolicy', 'no-referrer')
        }
        if (video?.style) {
          video.style.position = 'absolute'
          video.style.width = '1px'
          video.style.height = '1px'
          video.style.opacity = '0.01'
          video.style.pointerEvents = 'none'
        }
        videoState.element = video
      } catch (err) {
        warn('创建视频保活资源失败', err)
      }
    }

    attachFallbackVideo()
    return videoState.element
  }

  function pauseMedia (state) {
    state.playing = false
    if (!state.element) return

    try {
      state.element.pause?.()
    } catch (err) {
      warn('暂停媒体保活资源失败', err)
    }
  }

  function ensureMediaPlaying (state, getElement, label) {
    if (!active) return Promise.resolve(false)

    const element = getElement()
    if (!element || typeof element.play !== 'function') {
      return Promise.resolve(false)
    }

    if (state.playing && element.paused !== true) {
      return Promise.resolve(true)
    }
    if (state.playPromise) return state.playPromise

    let playResult
    try {
      playResult = element.play()
    } catch (err) {
      warn(`${label}保活播放失败`, err)
      return Promise.resolve(false)
    }

    const playPromise = Promise.resolve(playResult)
      .then(() => {
        if (!active) {
          pauseMedia(state)
          return false
        }
        state.playing = true
        return true
      })
      .catch((err) => {
        state.playing = false
        warn(`${label}保活播放失败`, err)
        return false
      })
      .finally(() => {
        if (state.playPromise === playPromise) {
          state.playPromise = null
        }
      })

    state.playPromise = playPromise
    return playPromise
  }

  function ensureAudioPlaying () {
    return ensureMediaPlaying(audioState, getAudio, '音频')
  }

  function ensureFallbackVideoPlaying () {
    return ensureMediaPlaying(videoState, getFallbackVideo, '视频')
  }

  function detachWakeLockReleaseListener () {
    wakeLockReleaseCleanup()
    wakeLockReleaseCleanup = noop
  }

  function attachWakeLockReleaseListener (sentinel, requestGeneration) {
    detachWakeLockReleaseListener()

    const handleRelease = () => {
      if (wakeLockSentinel !== sentinel) return
      wakeLockSentinel = null
      detachWakeLockReleaseListener()

      if (active && generation === requestGeneration && isVisible()) {
        // sentinel 可能在 request Promise 尚未完成时就被系统释放。此时 refresh
        // 会命中同一个 pending Promise，需等 finally 清理后再发起下一次申请。
        if (wakeLockRequest?.generation === requestGeneration) {
          wakeLockRetryGeneration = requestGeneration
        } else {
          void refresh()
        }
      }
    }

    if (typeof sentinel?.addEventListener === 'function') {
      sentinel.addEventListener('release', handleRelease, { once: true })
      wakeLockReleaseCleanup = () => {
        try {
          sentinel.removeEventListener?.('release', handleRelease)
        } catch (err) {}
      }
      if (sentinel.released === true) handleRelease()
      return
    }

    if (sentinel && 'onrelease' in sentinel) {
      const previousHandler = sentinel.onrelease
      sentinel.onrelease = function (...args) {
        try {
          previousHandler?.apply(this, args)
        } finally {
          handleRelease()
        }
      }
      wakeLockReleaseCleanup = () => {
        if (sentinel.onrelease !== previousHandler) {
          sentinel.onrelease = previousHandler || null
        }
      }
      if (sentinel.released === true) handleRelease()
    }
  }

  async function releaseSentinel (sentinel) {
    if (!sentinel || sentinel.released === true || typeof sentinel.release !== 'function') return

    try {
      await sentinel.release()
    } catch (err) {
      warn('释放 Screen Wake Lock 失败', err)
    }
  }

  function ensureWakeLock (requestGeneration) {
    if (!active || generation !== requestGeneration || !isVisible()) {
      return Promise.resolve(null)
    }

    if (wakeLockSentinel?.released !== true) {
      if (wakeLockSentinel) {
        pauseMedia(videoState)
        return Promise.resolve(wakeLockSentinel)
      }
    } else {
      wakeLockSentinel = null
      detachWakeLockReleaseListener()
    }

    if (wakeLockRequest?.generation === requestGeneration) {
      return wakeLockRequest.promise
    }

    const wakeLockApi = navigatorRef?.wakeLock
    if (typeof wakeLockApi?.request !== 'function') {
      return ensureFallbackVideoPlaying().then(() => null)
    }

    const requestPromise = Promise.resolve()
      .then(() => wakeLockApi.request('screen'))
      .then(async (sentinel) => {
        if (!sentinel) {
          if (active && generation === requestGeneration && isVisible()) {
            await ensureFallbackVideoPlaying()
          }
          return null
        }

        // stop 或新一轮 start 已发生时，迟到的 sentinel 不得复活旧会话。
        if (!active || generation !== requestGeneration || !isVisible()) {
          await releaseSentinel(sentinel)
          return null
        }

        if (sentinel.released === true) {
          await ensureFallbackVideoPlaying()
          return null
        }

        // 理论上同一代请求已去重；这一判断防止异常实现返回并行 sentinel。
        if (wakeLockSentinel && wakeLockSentinel !== sentinel && wakeLockSentinel.released !== true) {
          await releaseSentinel(sentinel)
          return wakeLockSentinel
        }

        wakeLockSentinel = sentinel
        attachWakeLockReleaseListener(sentinel, requestGeneration)
        pauseMedia(videoState)
        return wakeLockSentinel === sentinel ? sentinel : null
      })
      .catch(async (err) => {
        if (active && generation === requestGeneration && isVisible()) {
          warn('申请 Screen Wake Lock 失败，启用视频降级保活', err)
          await ensureFallbackVideoPlaying()
        }
        return null
      })
      .finally(() => {
        if (wakeLockRequest?.promise === requestPromise) {
          wakeLockRequest = null
        }
        if (wakeLockRetryGeneration === requestGeneration) {
          wakeLockRetryGeneration = null
          if (active && generation === requestGeneration && isVisible()) {
            void refresh()
          }
        }
      })

    wakeLockRequest = {
      generation: requestGeneration,
      promise: requestPromise,
    }
    return requestPromise
  }

  function handleVisibilityChange () {
    if (active && isVisible()) {
      void refresh()
    }
  }

  function attachVisibilityListener () {
    if (visibilityListenerAttached || typeof documentRef?.addEventListener !== 'function') return

    try {
      documentRef.addEventListener('visibilitychange', handleVisibilityChange)
      visibilityListenerAttached = true
    } catch (err) {
      warn('监听页面可见性变化失败', err)
    }
  }

  function detachVisibilityListener () {
    if (!visibilityListenerAttached) return

    try {
      documentRef?.removeEventListener?.('visibilitychange', handleVisibilityChange)
    } catch (err) {}
    visibilityListenerAttached = false
  }

  async function refresh () {
    if (!active) return false

    attachVisibilityListener()
    const currentGeneration = generation
    const results = await Promise.allSettled([
      ensureAudioPlaying(),
      ensureWakeLock(currentGeneration),
    ])
    return active && generation === currentGeneration && results.length === 2
  }

  function start () {
    if (!active) {
      active = true
      generation += 1
      attachVisibilityListener()
    }
    return refresh()
  }

  function stop () {
    active = false
    generation += 1
    wakeLockRetryGeneration = null
    detachVisibilityListener()

    const sentinel = wakeLockSentinel
    wakeLockSentinel = null
    detachWakeLockReleaseListener()
    pauseMedia(audioState)
    pauseMedia(videoState)

    // 不等待可能永不返回的旧 request；其完成分支会按代次立即释放迟到 sentinel。
    void releaseSentinel(sentinel)
  }

  return {
    start,
    stop,
    refresh,
    startLocationKeepAlive: start,
    stopLocationKeepAlive: stop,
    refreshLocationKeepAlive: refresh,
  }
}

let sharedLocationKeepAlive = null

function getSharedLocationKeepAlive () {
  if (!sharedLocationKeepAlive) {
    sharedLocationKeepAlive = createLocationKeepAlive()
  }
  return sharedLocationKeepAlive
}

export function startLocationKeepAlive () {
  return getSharedLocationKeepAlive().start()
}

export function stopLocationKeepAlive () {
  return getSharedLocationKeepAlive().stop()
}

export function refreshLocationKeepAlive () {
  return getSharedLocationKeepAlive().refresh()
}
