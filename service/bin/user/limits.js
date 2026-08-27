function positiveSafeInteger (value, fallback) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

const MEBIBYTE = 1024 * 1024
const STORED_QUOTA_FIELDS = Object.freeze([
  'maxKmlFiles',
  'maxKmlFileBytes',
  'maxFeaturesPerKml',
  'maxFeaturesPerUser',
  'trashRetentionDays',
])

export const KML_IMPORT_TRANSPORT_MAX_BYTES = positiveSafeInteger(
  process.env.MAP_SERVICE_KML_IMPORT_MAX_BYTES,
  50 * MEBIBYTE,
)

export const KML_JSON_TRANSPORT_MAX_BYTES = positiveSafeInteger(
  process.env.MAP_SERVICE_KML_JSON_MAX_BYTES,
  Math.max(64 * MEBIBYTE, Math.ceil(KML_IMPORT_TRANSPORT_MAX_BYTES * 1.25)),
)

export function kmlImportTransportMaxBytes () {
  return KML_IMPORT_TRANSPORT_MAX_BYTES
}

export function kmlJsonTransportMaxBytes () {
  return KML_JSON_TRANSPORT_MAX_BYTES
}

export function kmlTransportLimits () {
  return {
    kmlImportTransportMaxBytes: KML_IMPORT_TRANSPORT_MAX_BYTES,
    kmlJsonTransportMaxBytes: KML_JSON_TRANSPORT_MAX_BYTES,
  }
}

function storedPositiveQuotaValues (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result = {}
  STORED_QUOTA_FIELDS.forEach(key => {
    const parsed = Number(value[key])
    if (Number.isSafeInteger(parsed) && parsed > 0) result[key] = parsed
  })
  return result
}

function applyStoredQuotaBoundaries (quota) {
  const next = { ...quota }
  if (Number.isSafeInteger(next.maxKmlFileBytes)) {
    next.maxKmlFileBytes = Math.min(next.maxKmlFileBytes, kmlImportTransportMaxBytes())
  }
  if (Number.isSafeInteger(next.maxFeaturesPerKml) &&
      Number.isSafeInteger(next.maxFeaturesPerUser) &&
      next.maxFeaturesPerUser < next.maxFeaturesPerKml) {
    next.maxFeaturesPerKml = next.maxFeaturesPerUser
  }
  return next
}

// 历史配置可能来自旧版本。读取时只保留已知正整数，并收敛到当前真实技术边界；不在此处改写数据库。
export function normalizeStoredQuotaSettings (value, fallback = {}) {
  return applyStoredQuotaBoundaries({
    ...storedPositiveQuotaValues(fallback),
    ...storedPositiveQuotaValues(value),
  })
}

export function normalizeStoredQuotaOverrides (value, fallback = {}) {
  const base = normalizeStoredQuotaSettings(fallback)
  const overrides = storedPositiveQuotaValues(value)
  if (Number.isSafeInteger(overrides.maxKmlFileBytes)) {
    overrides.maxKmlFileBytes = Math.min(overrides.maxKmlFileBytes, kmlImportTransportMaxBytes())
  }
  const effectiveMaxFeaturesPerKml = Number(overrides.maxFeaturesPerKml ?? base.maxFeaturesPerKml)
  const effectiveMaxFeaturesPerUser = Number(overrides.maxFeaturesPerUser ?? base.maxFeaturesPerUser)
  if (Number.isSafeInteger(effectiveMaxFeaturesPerKml) &&
      Number.isSafeInteger(effectiveMaxFeaturesPerUser) &&
      effectiveMaxFeaturesPerUser < effectiveMaxFeaturesPerKml) {
    if (Object.hasOwn(overrides, 'maxFeaturesPerKml')) {
      overrides.maxFeaturesPerKml = effectiveMaxFeaturesPerUser
    } else if (Object.hasOwn(overrides, 'maxFeaturesPerUser')) {
      overrides.maxFeaturesPerUser = effectiveMaxFeaturesPerKml
    }
  }
  return overrides
}

export function handleJsonPayloadTooLarge (err, req, res, next) {
  if (err?.type !== 'entity.too.large') {
    next(err)
    return
  }
  const requestPath = String(req?.path || req?.originalUrl || '').split('?')[0]
  const isKmlJsonRequest = requestPath.startsWith('/api/v1/kml/')
  res.status(413).jsonErr({
    code: isKmlJsonRequest ? 'KML_JSON_TRANSPORT_LIMIT_EXCEEDED' : 'REQUEST_BODY_TOO_LARGE',
    message: isKmlJsonRequest
      ? `KML 保存请求超过服务运输层上限 ${kmlJsonTransportMaxBytes()} 字节，请减少单次同步内容后重试`
      : '请求内容超过服务运输层上限',
  })
}
