function finiteDuration (value) {
  const duration = Number(value)
  return Number.isFinite(duration) ? Math.max(0, duration) : 0
}

/**
 * Cesium accepts a zero-second flight as an immediate, non-animated view
 * update. Keep the preference decision pure so every related control can use
 * the same reduced-motion behavior.
 */
export function getMotionSafeDuration (duration, prefersReducedMotion = false) {
  return prefersReducedMotion ? 0 : finiteDuration(duration)
}
