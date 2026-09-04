/**
 * KML Placemark visibility is intentionally sparse: an omitted value means
 * visible, while an explicit false value hides the feature.
 */
export function isKmlFeatureVisible (feature) {
  return feature?.visible !== false
}

/**
 * Parse the KML 2.2 visibility element. The result distinguishes an omitted
 * value from an invalid value so callers can keep compatibility with legacy
 * files while still surfacing malformed input to users.
 */
export function parseKmlVisibilityValue (value) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return { present: false, value: undefined, valid: true }
  if (raw === '0' || raw === 'false') return { present: true, value: false, valid: true }
  if (raw === '1' || raw === 'true') return { present: true, value: true, valid: true }
  return { present: true, value: undefined, valid: false }
}

export function normalizeKmlFeatureVisibility (feature) {
  const normalized = { ...feature }
  if (typeof normalized.visible === 'boolean') return normalized
  delete normalized.visible
  return normalized
}
