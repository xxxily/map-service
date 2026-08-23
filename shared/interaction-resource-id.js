/**
 * Deterministic, non-secret identifiers for published interaction resources.
 * This module is shared by browser and service code and has no persistence or
 * framework dependencies.
 */

const FNV64_MASK = (1n << 64n) - 1n
const FNV64_OFFSET = 14695981039346656037n
const FNV64_PRIME = 1099511628211n

export const INTERACTION_FEATURE_ID_PATTERN = /^(?=.{1,160}$)[^\p{Cc}\p{Cf}\s/\\?#%<>"']+$/u

function fnv64 (bytes, seed) {
  let hash = (FNV64_OFFSET ^ BigInt(seed)) & FNV64_MASK
  for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * FNV64_PRIME) & FNV64_MASK
  return hash.toString(16).padStart(16, '0')
}

export function stableInteractionDigest (value) {
  const bytes = new TextEncoder().encode(String(value ?? ''))
  return `${fnv64(bytes, 0n)}${fnv64(bytes, 0x9e3779b97f4a7c15n)}`
}

export function createStableInteractionId (prefix, value) {
  const normalizedPrefix = String(prefix || '').trim().replace(/[^A-Za-z0-9_-]/g, '') || 'resource'
  return `${normalizedPrefix}_${stableInteractionDigest(value)}`
}

export function normalizeInteractionFeatureId (value) {
  const normalized = String(value ?? '').normalize('NFKC').trim()
  if (INTERACTION_FEATURE_ID_PATTERN.test(normalized)) return normalized
  return createStableInteractionId('feature', normalized || 'missing')
}
