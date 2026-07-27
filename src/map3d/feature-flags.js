const DISABLED_FEATURE_VALUES = new Set(['0', 'false', 'off', 'no'])

export function isBuildFeatureEnabled (value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback
  return !DISABLED_FEATURE_VALUES.has(String(value).trim().toLowerCase())
}

export function getCameraInteractionProfile (value, fallback = 'enhanced') {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'enhanced' || normalized === 'compatibility') return normalized
  if (normalized === '') return fallback === 'compatibility' ? 'compatibility' : 'enhanced'
  return isBuildFeatureEnabled(normalized) ? 'enhanced' : 'compatibility'
}
