export const MEDIA_PREVIEW_HISTORY_STATE_KEY = '__mapServiceMediaPreview'

export function createMediaPreviewHistoryGuard (options = {}) {
  const windowLike = options.window || globalThis.window
  const historyLike = options.history || windowLike?.history
  const isEnabled = options.isEnabled || (() => true)
  const onBack = options.onBack || (() => {})
  const setTimer = options.setTimeout || globalThis.setTimeout
  const clearTimer = options.clearTimeout || globalThis.clearTimeout
  const fallbackDelay = Math.max(0, Number(options.fallbackDelay ?? 500))
  let active = false
  let closeRequested = false
  let fallbackTimer = null
  let sequence = 0

  const clearFallback = () => {
    if (fallbackTimer !== null) clearTimer(fallbackTimer)
    fallbackTimer = null
  }

  const completeBack = () => {
    if (!active) return false
    clearFallback()
    active = false
    closeRequested = false
    onBack()
    return true
  }

  const onPopState = () => completeBack()
  windowLike?.addEventListener?.('popstate', onPopState)

  return {
    activate () {
      if (active || !isEnabled() || !(historyLike?.pushState instanceof Function)) return false
      const currentState = historyLike.state && typeof historyLike.state === 'object'
        ? historyLike.state
        : {}
      const url = String(windowLike?.location?.href || '')
      try {
        historyLike.pushState({
          ...currentState,
          [MEDIA_PREVIEW_HISTORY_STATE_KEY]: ++sequence,
        }, '', url)
        active = true
        closeRequested = false
        return true
      } catch {
        return false
      }
    },
    requestClose () {
      if (!active || closeRequested || !(historyLike?.back instanceof Function)) return false
      closeRequested = true
      fallbackTimer = setTimer(() => completeBack(), fallbackDelay)
      try {
        historyLike.back()
      } catch {
        clearFallback()
        closeRequested = false
        return false
      }
      return true
    },
    release () {
      clearFallback()
      active = false
      closeRequested = false
    },
    destroy () {
      clearFallback()
      active = false
      closeRequested = false
      windowLike?.removeEventListener?.('popstate', onPopState)
    },
    isActive: () => active,
    isCloseRequested: () => closeRequested,
  }
}
