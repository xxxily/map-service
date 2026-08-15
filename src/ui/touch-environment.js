export const TOUCH_FIRST_MEDIA_QUERY = '(hover: none) and (pointer: coarse)'
export const COMPACT_TOUCH_MEDIA_QUERY = '(max-width: 640px)'

export function isTouchFirstEnvironment (options = {}) {
  const windowLike = options.window || globalThis.window
  const navigatorLike = options.navigator || globalThis.navigator
  const matchMedia = options.matchMedia || windowLike?.matchMedia?.bind(windowLike)
  if (!(matchMedia instanceof Function)) return false

  if (matchMedia(TOUCH_FIRST_MEDIA_QUERY).matches) return true
  const maxTouchPoints = Number(navigatorLike?.maxTouchPoints || 0)
  return maxTouchPoints > 0 && matchMedia(COMPACT_TOUCH_MEDIA_QUERY).matches
}
