import {
  createHttpError,
  decryptSecret,
  encryptSecret,
  hashPasswordSync,
  hashToken,
  randomId,
  randomToken,
  verifyPassword,
} from './security.js'
import { normalizeKmlMarkerIcon } from '../../../shared/kml-marker-icons.js'
import { computeKmlBounds, normalizeKmlBounds } from '../../../shared/kml-spatial.js'
import {
  decoratePublishedSnapshot,
  inspectPublishedResourceReferences,
} from '../../../shared/interaction-resource-ref.js'
import {
  normalizeKmlResourceCollection,
  normalizeKmlResourceCollectionRef,
  serializeKmlResourceCollection,
  serializeKmlResourceCollectionRef,
  sanitizeKmlResourceCollectionRef,
  tryNormalizeKmlResourceCollection,
  tryNormalizeKmlResourceCollectionRef,
} from '../../../shared/kml-resource-collection.js'
import {
  computeSpatialScope,
  isCurrentSpatialScope,
  normalizeUnrestrictedTileMaxZoom,
  publicSpatialScope,
  spatialPolicyEligibility,
} from './shareSpatialAccess.js'
import {
  normalizeShareAnalyticsConfig,
  resolveShareAnalyticsDescriptor,
} from './analytics.js'
import {
  normalizeStoredQuotaOverrides,
  normalizeStoredQuotaSettings,
} from './limits.js'

const DEFAULT_SETTINGS = Object.freeze({
  quota: {
    maxKmlFiles: 100,
    maxKmlFileBytes: 10 * 1024 * 1024,
    maxFeaturesPerKml: 50000,
    maxFeaturesPerUser: 200000,
    trashRetentionDays: 30,
  },
  resourceCollection: {
    maxCollectionsPerUser: 1000,
    maxItemsPerCollection: 10000,
    maxCollectionBytesPerUser: 100 * 1024 * 1024,
    maxBatchItemsPerRequest: 100,
    publicCollectionReadRateLimit: 300,
  },
  share: {
    publicAccessPolicy: 'inherit_site_access',
    maxFilesPerShare: 20,
    accessTtlMs: 1000 * 60 * 60 * 12,
    // Passwordless links are an explicit administrator opt-in.
    passwordlessSharingEnabled: false,
    spatialAccessEnabled: true,
    spatialPaddingMeters: 1000,
    spatialMaxAreaKm2: 10000,
    spatialMaxDiagonalKm: 300,
    spatialUnrestrictedTileMaxZoom: 14,
    unlimitedAccessEnabled: false,
    unlimitedAccessMaxAreaKm2: 2000,
    unlimitedAccessMaxDiagonalKm: 100,
    spatialPolicyRevision: 1,
  },
})

const KML_SOURCE_TYPES = new Set(['created', 'imported', 'migrated', 'copied'])
const KML_COORD_CORRECTIONS = new Set(['none', 'wgs84-to-gcj02'])
const KML_THEMES = new Set(['default', 'simple'])
const FEATURE_TYPES = new Set(['Point', 'LineString', 'Polygon'])
const FAVORITE_SOURCE_TYPES = new Set(['search', 'map', 'location', 'kml', 'manual'])
const SHARE_EDITABLE_STATUSES = new Set(['draft', 'active', 'paused'])
const SPATIAL_ACCESS_MODES = new Set(['unrestricted', 'kml_bounds'])
const PASSWORD_ACCESS_TTL_MODES = new Set(['finite', 'unlimited'])
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const SHARE_SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000

const SHARE_PASSWORD_LIMIT = Object.freeze({
  maxAttempts: 5,
  windowMs: 1000 * 60 * 10,
  blockMs: 1000 * 60 * 15,
})

const SHARE_TILE_RATE_LIMIT = Object.freeze({
  maxRequests: 600,
  windowMs: 1000 * 60,
  maxEntries: 10000,
})

const SHARE_MANIFEST_RATE_LIMIT = Object.freeze({
  maxRequests: 120,
  windowMs: 1000 * 60,
  maxEntries: 10000,
})

const SHARE_ACCESS_EVENT_DEDUP_MS = 15 * 60 * 1000
const SHARE_ACCESS_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const KML_DIRECTORY_LIMIT = 200
const KML_DIRECTORY_NAME_MAX_LENGTH = 80
const DEFAULT_KML_POINT_CLUSTERING = Object.freeze({
  enabled: false,
  minZoom: 0,
  maxClusterZoom: 13,
  gridSize: 64,
  minClusterPoints: 2,
  maxMembersPerCluster: 5000,
})

const KML_SYNC_ERROR_SUGGESTIONS = Object.freeze({
  VALIDATION_FAILED: '请检查文件名、目录、位置和 KML 内容格式后重试。',
  RESOURCE_NOT_FOUND: '请刷新 KML 列表，确认该文件仍存在后重试。',
  PERMISSION_DENIED: '请确认当前账号仍有 KML 管理权限。',
  KML_MOVE_INVALID: '请重新加载 KML 后再保存；若仍失败，请检查文件所在目录的顺序。',
  KML_REVISION_CONFLICT: '请刷新 KML 列表，确认最新内容后再保存。',
  KML_DIRECTORY_NOT_FOUND: '请刷新目录列表，并重新选择有效目录。',
  KML_NOT_ACTIVE: '请先恢复该 KML，再进行编辑或移动。',
  DEFAULT_KML_PROTECTED: '请先将另一个 KML 设为默认文件后重试。',
  KML_CREATE_REPLAY_DELETED: '请刷新 KML 列表；若要重新创建副本，请使用新的本地同步标识。',
  KML_DELETE_CONFIRMATION_REQUIRED: '请在确认删除后重试，未确认的文件不会移入回收站。',
  KML_RESOURCE_COLLECTION_REF_UNSUPPORTED: '当前客户端不支持安全编辑资源集合引用，请升级客户端；如需解除绑定，请显式提交 resourceCollectionRef:null。',
  QUOTA_EXCEEDED: '请减少文件或要素数量，或联系管理员调整配额。',
  FILE_TOO_LARGE: '请压缩或拆分 KML 文件后再保存。',
})

const RESOURCE_COLLECTION_MAX_ITEMS = 10000
const RESOURCE_COLLECTION_MAX_BYTES = 20 * 1024 * 1024
const RESOURCE_COLLECTION_MAX_BATCH_OPERATIONS = 100
const RESOURCE_COLLECTION_EXPORT_MAX_BYTES = 64 * 1024 * 1024
const RESOURCE_COLLECTION_SORT_FIELDS = Object.freeze({
  name: 'name',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  itemCount: 'item_count',
})

function parseJson (value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ''))
    return parsed === undefined || parsed === null ? fallback : parsed
  } catch (err) {
    return fallback
  }
}

function clone (value) {
  return JSON.parse(JSON.stringify(value))
}

function isPlainObject (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function requireObject (value, message = '请求数据格式不正确') {
  if (!isPlainObject(value)) {
    throw createHttpError(message, 400, 'VALIDATION_FAILED')
  }
  return value
}

function normalizePage (input = {}) {
  const page = Number(input.page)
  const limit = Number(input.limit)
  return {
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000000) : 1,
    limit: Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20,
  }
}

function normalizeOrder (value, fallback = 'desc') {
  const normalized = String(value ?? fallback).toLowerCase()
  if (!['asc', 'desc'].includes(normalized)) {
    throw createHttpError('排序方向只支持 asc 或 desc', 400, 'VALIDATION_FAILED')
  }
  return normalized
}

function normalizeResourceCollectionListQuery (input = {}) {
  const { page, limit } = normalizePage(input)
  const status = String(input.status || 'active').toLowerCase()
  if (!['active', 'trashed', 'all'].includes(status)) {
    throw createHttpError('资源集合状态筛选值不正确', 400, 'VALIDATION_FAILED')
  }
  const visibility = String(input.visibility || 'all').toLowerCase()
  if (!['private', 'public', 'all'].includes(visibility)) {
    throw createHttpError('资源集合公开状态筛选值不正确', 400, 'VALIDATION_FAILED')
  }
  const sort = String(input.sort || 'updatedAt')
  if (!Object.hasOwn(RESOURCE_COLLECTION_SORT_FIELDS, sort)) {
    throw createHttpError('资源集合排序字段不正确', 400, 'VALIDATION_FAILED')
  }
  const order = normalizeOrder(input.order, 'desc')
  const search = normalizeText(input.search, { maxLength: 100 })
  return { page, limit, status, visibility, sort, order, search }
}

function normalizeResourceCollectionRevision (value, options = {}) {
  if (value === undefined || value === null || value === '') {
    if (options.optional) return null
    throw createHttpError('资源集合 revision 格式不正确', 400, 'VALIDATION_FAILED')
  }
  const revision = Number(value)
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw createHttpError('资源集合 revision 格式不正确', 400, 'VALIDATION_FAILED')
  }
  return revision
}

function normalizeResourceCollectionRuntimeSettings (input, fallback = DEFAULT_SETTINGS.resourceCollection) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const result = { ...fallback }
  for (const key of Object.keys(fallback)) {
    const value = Number(source[key])
    if (Number.isSafeInteger(value) && value > 0) result[key] = value
  }
  if (result.maxBatchItemsPerRequest > result.maxItemsPerCollection) {
    result.maxBatchItemsPerRequest = result.maxItemsPerCollection
  }
  return result
}

function normalizeSyncClientId (value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) {
    throw createHttpError(
      '同步创建操作必须提供 1～160 个 ASCII 字母、数字、点、下划线、冒号或连字符组成的稳定 clientId',
      400,
      'VALIDATION_FAILED'
    )
  }
  return value
}

function normalizeText (value, options = {}) {
  const minLength = options.minLength ?? 0
  const maxLength = options.maxLength ?? 1000
  const fallback = options.fallback ?? ''
  const normalized = String(value ?? fallback)
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw createHttpError(options.message || `文本长度需为 ${minLength}～${maxLength} 个字符`, 400, 'VALIDATION_FAILED')
  }
  return normalized
}

function sanitizeRichText (value, maxLength = 100000) {
  let normalized = normalizeText(value, { maxLength })
  normalized = normalized
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|base|meta|link|form|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|base|meta|link|form|object|embed)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src)\s*=\s*(["'])\s*(?:javascript|vbscript|data):[\s\S]*?\2/gi, '')
    .replace(/\s+(href|src)\s*=\s*(?:javascript|vbscript|data):[^\s>]*/gi, '')
  return normalized
}

function normalizeBoolean (value, fallback = false) {
  if (value === undefined) return Boolean(fallback)
  if (typeof value !== 'boolean') {
    throw createHttpError('布尔字段格式不正确', 400, 'VALIDATION_FAILED')
  }
  return value
}

function normalizeKmlDirectoryId (value) {
  if (value === undefined || value === null || value === '') return null
  return normalizeText(value, {
    minLength: 1,
    maxLength: 160,
    message: 'KML 目录 ID 格式不正确',
  })
}

function normalizeKmlDirectoryName (value, fallback = '') {
  return normalizeText(value, {
    fallback,
    minLength: 1,
    maxLength: KML_DIRECTORY_NAME_MAX_LENGTH,
    message: `KML 目录名称长度需为 1～${KML_DIRECTORY_NAME_MAX_LENGTH} 个字符`,
  })
}

function normalizedDirectoryNameKey (value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('zh-CN')
}

function normalizeIntegerField (value, options = {}) {
  const number = Number(value)
  const minimum = Number(options.minimum ?? 0)
  const maximum = Number(options.maximum ?? Number.MAX_SAFE_INTEGER)
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw createHttpError(options.message || '整数参数格式不正确', 400, options.code || 'VALIDATION_FAILED')
  }
  return number
}

function sanitizeSyncDetailText (value, maxLength = 500) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function normalizeKmlPointClustering (value, fallback = DEFAULT_KML_POINT_CLUSTERING) {
  const source = value === undefined
    ? (fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : DEFAULT_KML_POINT_CLUSTERING)
    : requireObject(value, '点位聚合配置格式不正确')
  const enabled = normalizeBoolean(source.enabled, false)
  if (!enabled) return { enabled: false }
  const minZoom = normalizeIntegerField(source.minZoom ?? DEFAULT_KML_POINT_CLUSTERING.minZoom, {
    minimum: 0,
    maximum: 24,
    code: 'SHARE_CLUSTER_CONFIG_INVALID',
    message: '点位聚合起始缩放级别需为 0～24 的整数',
  })
  const maxClusterZoom = normalizeIntegerField(source.maxClusterZoom ?? DEFAULT_KML_POINT_CLUSTERING.maxClusterZoom, {
    minimum: 0,
    maximum: 24,
    code: 'SHARE_CLUSTER_CONFIG_INVALID',
    message: '点位聚合结束缩放级别需为 0～24 的整数',
  })
  if (minZoom > maxClusterZoom) {
    throw createHttpError('点位聚合起始缩放级别不能高于结束级别', 400, 'SHARE_CLUSTER_CONFIG_INVALID')
  }
  return {
    enabled: true,
    minZoom,
    maxClusterZoom,
    gridSize: normalizeIntegerField(source.gridSize ?? DEFAULT_KML_POINT_CLUSTERING.gridSize, {
      minimum: 24,
      maximum: 128,
      code: 'SHARE_CLUSTER_CONFIG_INVALID',
      message: '点位聚合网格大小需为 24～128 像素的整数',
    }),
    minClusterPoints: normalizeIntegerField(source.minClusterPoints ?? DEFAULT_KML_POINT_CLUSTERING.minClusterPoints, {
      minimum: 2,
      maximum: 1000,
      code: 'SHARE_CLUSTER_CONFIG_INVALID',
      message: '强制聚合最少点位数需为 2～1000 的整数',
    }),
    maxMembersPerCluster: normalizeIntegerField(
      source.maxMembersPerCluster ?? DEFAULT_KML_POINT_CLUSTERING.maxMembersPerCluster,
      {
        minimum: 100,
        maximum: 20000,
        code: 'SHARE_CLUSTER_CONFIG_INVALID',
        message: '单个点位聚合成员上限需为 100～20000 的整数',
      }
    ),
  }
}

// 强制策略与分享配置采用“更积极聚合”合成，避免分享通过收窄范围或提高阈值绕过策略。
function applyForcedKmlPointClusteringPolicy (value, policy) {
  if (policy?.kmlClusterForceEnabled !== true) return value
  const adminMaxZoom = Number(policy.kmlClusterMaxZoom ?? 12)
  const adminMinPoints = Number(policy.kmlClusterMinPoints ?? 250)
  const user = value?.enabled === true ? normalizeKmlPointClustering(value) : null
  const base = user || {
    enabled: true,
    minZoom: 0,
    maxClusterZoom: adminMaxZoom,
    gridSize: 64,
    minClusterPoints: adminMinPoints,
    maxMembersPerCluster: 5000,
  }
  return {
    ...base,
    enabled: true,
    minZoom: Math.min(base.minZoom, 0),
    maxClusterZoom: Math.max(base.maxClusterZoom, adminMaxZoom),
    gridSize: Math.max(base.gridSize, 64),
    minClusterPoints: Math.min(base.minClusterPoints, adminMinPoints),
    forcedByPolicy: true,
  }
}

function normalizeColor (value, fallback) {
  const normalized = String(value ?? fallback).trim().toLowerCase()
  if (!COLOR_PATTERN.test(normalized)) {
    throw createHttpError('颜色必须是 6 位十六进制颜色值', 400, 'VALIDATION_FAILED')
  }
  return normalized
}

function normalizeEnum (value, allowed, fallback, message) {
  const normalized = String(value ?? fallback)
  if (!allowed.has(normalized)) {
    throw createHttpError(message, 400, 'VALIDATION_FAILED')
  }
  return normalized
}

export function normalizeKmlCoordCorrection (value, fallback = 'wgs84-to-gcj02') {
  return normalizeEnum(value, KML_COORD_CORRECTIONS, fallback, '坐标纠偏模式不正确')
}

function normalizeRevision (value, options = {}) {
  if (value === undefined && options.optional) return null
  const revision = Number(value)
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw createHttpError('revision 必须是正整数', 400, 'VALIDATION_FAILED')
  }
  return revision
}

function normalizeCoordinatePair (value, label = '坐标') {
  if (!Array.isArray(value) || value.length < 2) {
    throw createHttpError(`${label}格式不正确`, 400, 'VALIDATION_FAILED')
  }
  const longitude = Number(value[0])
  const latitude = Number(value[1])
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw createHttpError(`${label}必须是有效的 WGS84 经纬度`, 400, 'VALIDATION_FAILED')
  }
  return [longitude, latitude]
}

function normalizeFeatureCoordinates (type, coordinates) {
  if (type === 'Point') return normalizeCoordinatePair(coordinates)
  if (!Array.isArray(coordinates)) {
    throw createHttpError('要素坐标格式不正确', 400, 'VALIDATION_FAILED')
  }
  const minimum = type === 'LineString' ? 2 : 3
  if (coordinates.length < minimum) {
    throw createHttpError(`${type} 至少需要 ${minimum} 个坐标点`, 400, 'VALIDATION_FAILED')
  }
  const normalized = coordinates.map((coordinate, index) => normalizeCoordinatePair(coordinate, `第 ${index + 1} 个坐标`))
  if (type === 'Polygon') {
    const first = normalized[0]
    const last = normalized.at(-1)
    if (first[0] !== last[0] || first[1] !== last[1]) normalized.push([...first])
    if (normalized.length < 4) {
      throw createHttpError('Polygon 必须包含可闭合的外环', 400, 'VALIDATION_FAILED')
    }
  }
  return normalized
}

export function normalizeKmlFeatures (value) {
  if (!Array.isArray(value)) {
    throw createHttpError('features 必须是数组', 400, 'VALIDATION_FAILED')
  }
  const ids = new Set()
  return value.map((rawFeature, index) => {
    const feature = requireObject(rawFeature, `第 ${index + 1} 个要素格式不正确`)
    const type = normalizeEnum(feature.type, FEATURE_TYPES, '', '仅支持 Point、LineString 和 Polygon 要素')
    const id = normalizeText(feature.id || randomId('feat'), {
      minLength: 1,
      maxLength: 160,
      message: '要素 ID 长度不正确',
    })
    if (ids.has(id)) {
      throw createHttpError('要素 ID 不能重复', 400, 'VALIDATION_FAILED')
    }
    ids.add(id)
    const normalized = {
      id,
      type,
      name: normalizeText(feature.name, { maxLength: 200 }),
      description: sanitizeRichText(feature.description, 100000),
      coordinates: normalizeFeatureCoordinates(type, feature.coordinates),
    }
    if (feature.styleUrl !== undefined) {
      normalized.styleUrl = normalizeText(feature.styleUrl, { maxLength: 500 })
    }
    if (type === 'Point') {
      const markerIcon = normalizeKmlMarkerIcon(feature.markerIcon)
      if (String(feature.markerIcon ?? '').trim() && !markerIcon) {
        throw createHttpError('点位图标不受支持', 400, 'VALIDATION_FAILED')
      }
      if (markerIcon) normalized.markerIcon = markerIcon
      const hasInlineCollection = feature.resourceCollection !== undefined && feature.resourceCollection !== null
      const hasCollectionRef = feature.resourceCollectionRef !== undefined && feature.resourceCollectionRef !== null
      if (hasInlineCollection && hasCollectionRef) {
        throw createHttpError('点位不能同时绑定内嵌资源集合和资源集合引用', 400, 'VALIDATION_FAILED')
      }
      if (hasInlineCollection) {
        try {
          normalized.resourceCollection = normalizeKmlResourceCollection(feature.resourceCollection, {
            createId: () => randomId('res'),
          })
        } catch (error) {
          throw createHttpError(error.message || '资源集合格式不正确', 400, 'VALIDATION_FAILED')
        }
      } else if (hasCollectionRef) {
        try {
          normalized.resourceCollectionRef = normalizeKmlResourceCollectionRef(feature.resourceCollectionRef)
        } catch (error) {
          throw createHttpError(error.message || '资源集合引用格式不正确', 400, 'VALIDATION_FAILED')
        }
      } else if (feature.resourceCollectionStatus !== undefined && feature.resourceCollectionStatus !== null) {
        const status = requireObject(feature.resourceCollectionStatus, '资源集合状态格式不正确')
        if (Number(status.version || 1) !== 1 || status.sourceType !== 'personal' || !['private', 'missing', 'trashed'].includes(status.accessState)) {
          throw createHttpError('资源集合状态格式不正确', 400, 'VALIDATION_FAILED')
        }
        normalized.resourceCollectionStatus = {
          version: 1,
          sourceType: 'personal',
          accessState: status.accessState,
        }
      }
    }
    return normalized
  })
}

function sanitizePublishedKmlFeatures (value, options = {}) {
  return (Array.isArray(value) ? value : []).map(rawFeature => {
    if (!rawFeature || typeof rawFeature !== 'object' || Array.isArray(rawFeature)) return rawFeature
    const feature = { ...rawFeature }
    if (feature.type !== 'Point') {
      delete feature.resourceCollection
      delete feature.resourceCollectionRef
      delete feature.resourceCollectionStatus
      return feature
    }
    const hasInline = feature.resourceCollection !== undefined && feature.resourceCollection !== null
    const hasRef = feature.resourceCollectionRef !== undefined && feature.resourceCollectionRef !== null
    if (hasInline && hasRef) delete feature.resourceCollectionRef
    if (hasInline) {
      const result = tryNormalizeKmlResourceCollection(feature.resourceCollection)
      if (result.value) feature.resourceCollection = result.value
      else delete feature.resourceCollection
      delete feature.resourceCollectionStatus
      return feature
    }
    if (hasRef) {
      const result = tryNormalizeKmlResourceCollectionRef(feature.resourceCollectionRef)
      if (!result.value) {
        delete feature.resourceCollectionRef
        return feature
      }
      feature.resourceCollectionRef = result.value
      delete feature.resourceCollectionStatus
      if (options.publicProjection === true && result.value.sourceType === 'personal') {
        const accessState = typeof options.resourceCollectionAccessResolver === 'function'
          ? options.resourceCollectionAccessResolver(result.value)
          : 'missing'
        if (accessState !== 'public') {
          delete feature.resourceCollectionRef
          feature.resourceCollectionStatus = {
            version: 1,
            sourceType: 'personal',
            accessState: ['private', 'trashed'].includes(accessState) ? accessState : 'missing',
          }
        }
      }
      return feature
    }
    if (feature.resourceCollectionStatus) {
      try {
        const status = requireObject(feature.resourceCollectionStatus, '资源集合状态格式不正确')
        if (Number(status.version || 1) === 1 && status.sourceType === 'personal' && ['private', 'missing', 'trashed'].includes(status.accessState)) {
          feature.resourceCollectionStatus = { version: 1, sourceType: 'personal', accessState: status.accessState }
        } else delete feature.resourceCollectionStatus
      } catch {
        delete feature.resourceCollectionStatus
      }
    }
    return feature
  })
}

function preparePublishedInteractionSnapshot (snapshot, options = {}) {
  const source = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? snapshot
    : {}
  const sanitized = {
    ...source,
    features: Array.isArray(source.features)
      ? sanitizePublishedKmlFeatures(source.features)
      : source.features,
  }
  const hasExistingResourceRefs = sanitized.resourceRefsVersion !== undefined ||
    (Array.isArray(sanitized.features) && sanitized.features.some(feature => (
      feature && typeof feature === 'object' && feature.resourceRefs !== undefined
    )))
  const prepared = options.force === true || !hasExistingResourceRefs
    ? decoratePublishedSnapshot(sanitized, { force: options.force === true })
    : sanitized
  const issues = inspectPublishedResourceReferences(prepared, options)
  if (issues.length) {
    const statusCode = options.phase === 'publish' ? 409 : 503
    throw createHttpError(
      options.phase === 'publish'
        ? `公开快照资源引用校验失败：${issues[0].message}`
        : '公开分享资源引用暂不可用',
      statusCode,
      'PUBLISHED_RESOURCE_REFERENCE_INVALID'
    )
  }
  return prepared
}

function serializedByteSize (value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function escapeXml (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function decodeXml (value) {
  return String(value || '')
    .replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/i, '$1')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
}

function readXmlElement (source, tagName) {
  const match = new RegExp(`<(?:[\\w.-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tagName}\\s*>`, 'i').exec(source)
  return match ? decodeXml(match[1]).trim() : ''
}

function readExtendedDataValueFromXml (source, name) {
  const escapedName = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const data = new RegExp(`<(?:[\\w.-]+:)?Data\\b[^>]*\\bname\\s*=\\s*["']${escapedName}["'][^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?Data\\s*>`, 'i')
    .exec(String(source || ''))?.[1] || ''
  const value = /<(?:[\w.-]+:)?value\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?value\s*>/i
    .exec(data)?.[1] || ''
  return decodeXml(value)
}

function readMarkerIconFromXml (source) {
  return normalizeKmlMarkerIcon(readExtendedDataValueFromXml(source, 'map-service:marker-icon'))
}

function parseCoordinateText (value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => {
      const coordinate = part.split(',').slice(0, 2).map(Number)
      return normalizeCoordinatePair(coordinate)
    })
}

export function parseKmlText (value) {
  const text = String(value || '').replace(/^\uFEFF/, '')
  if (!text.trim() || !/<(?:[\w.-]+:)?kml\b/i.test(text) || !/<\/(?:[\w.-]+:)?kml\s*>/i.test(text)) {
    throw createHttpError('KML 文件格式不正确', 400, 'KML_PARSE_FAILED')
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b|\b(?:SYSTEM|PUBLIC)\s+["']/i.test(text)) {
    throw createHttpError('KML 文件包含不允许的外部实体声明', 400, 'KML_UNSAFE_XML')
  }

  const withoutComments = text.replace(/<!--[\s\S]*?-->/g, '')
  const documentMatch = /<(?:[\w.-]+:)?Document\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Document\s*>/i.exec(withoutComments)
  const documentSource = documentMatch?.[1] || withoutComments
  const documentHeader = documentSource.replace(/<(?:[\w.-]+:)?Placemark\b[\s\S]*$/i, '')
  const documentName = readXmlElement(documentHeader, 'name')
  const documentDescription = sanitizeRichText(readXmlElement(documentHeader, 'description'), 10000)
  const features = []
  const warnings = []
  const placemarkPattern = /<(?:[\w.-]+:)?Placemark\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Placemark\s*>/gi
  let match
  while ((match = placemarkPattern.exec(documentSource)) !== null) {
    const source = match[1]
    const point = /<(?:[\w.-]+:)?Point\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Point\s*>/i.exec(source)
    const line = /<(?:[\w.-]+:)?LineString\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?LineString\s*>/i.exec(source)
    const polygon = /<(?:[\w.-]+:)?Polygon\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Polygon\s*>/i.exec(source)
    let type
    let coordinates
    if (point) {
      type = 'Point'
      coordinates = parseCoordinateText(readXmlElement(point[1], 'coordinates'))[0]
    } else if (line) {
      type = 'LineString'
      coordinates = parseCoordinateText(readXmlElement(line[1], 'coordinates'))
    } else if (polygon) {
      type = 'Polygon'
      const outer = readXmlElement(polygon[1], 'outerBoundaryIs') || polygon[1]
      coordinates = parseCoordinateText(readXmlElement(outer, 'coordinates'))
    } else {
      continue
    }
    const markerIcon = type === 'Point' ? readMarkerIconFromXml(source) : ''
    const rawResourceCollection = type === 'Point'
      ? readExtendedDataValueFromXml(source, 'map-service:resource-collection')
      : ''
    const rawResourceCollectionRef = type === 'Point'
      ? readExtendedDataValueFromXml(source, 'map-service:resource-collection-ref')
      : ''
    const rawResourceCollectionStatus = type === 'Point'
      ? readExtendedDataValueFromXml(source, 'map-service:resource-collection-status')
      : ''
    const parsedResourceCollection = rawResourceCollection
      ? tryNormalizeKmlResourceCollection(rawResourceCollection, { createId: () => randomId('res') })
      : { value: null, error: null }
    if (parsedResourceCollection.error) {
      warnings.push(`第 ${features.length + 1} 个标注的资源集合已忽略：${parsedResourceCollection.error.message}`)
    }
    const parsedResourceCollectionRef = rawResourceCollectionRef
      ? tryNormalizeKmlResourceCollectionRef(rawResourceCollectionRef)
      : { value: null, error: null }
    if (parsedResourceCollectionRef.error) {
      warnings.push(`第 ${features.length + 1} 个标注的资源集合引用已忽略：${parsedResourceCollectionRef.error.message}`)
    }
    let parsedResourceCollectionStatus = null
    if (rawResourceCollectionStatus && !parsedResourceCollection.value && !parsedResourceCollectionRef.value) {
      try {
        const status = JSON.parse(rawResourceCollectionStatus)
        if (status && status.version === 1 && status.sourceType === 'personal' && ['private', 'missing', 'trashed'].includes(status.accessState)) {
          parsedResourceCollectionStatus = { version: 1, sourceType: 'personal', accessState: status.accessState }
        }
      } catch {
        warnings.push(`第 ${features.length + 1} 个标注的资源集合状态已忽略：格式不正确`)
      }
    }
    if (parsedResourceCollection.value && parsedResourceCollectionRef.value) {
      warnings.push(`第 ${features.length + 1} 个标注同时包含内嵌资源集合和资源集合引用，已忽略引用`)
    }
    features.push({
      id: randomId('feat'),
      type,
      name: readXmlElement(source, 'name'),
      description: readXmlElement(source, 'description'),
      coordinates,
      ...(readXmlElement(source, 'styleUrl') ? { styleUrl: readXmlElement(source, 'styleUrl') } : {}),
      ...(markerIcon ? { markerIcon } : {}),
      ...(parsedResourceCollection.value ? { resourceCollection: parsedResourceCollection.value } : {}),
      ...(!parsedResourceCollection.value && parsedResourceCollectionRef.value ? { resourceCollectionRef: parsedResourceCollectionRef.value } : {}),
      ...(!parsedResourceCollection.value && !parsedResourceCollectionRef.value && parsedResourceCollectionStatus ? { resourceCollectionStatus: parsedResourceCollectionStatus } : {}),
    })
  }
  return {
    name: normalizeText(documentName || '导入的 KML', { minLength: 1, maxLength: 200 }),
    description: documentDescription,
    features: normalizeKmlFeatures(features),
    warnings,
  }
}

export function generateKmlText (name, features, description = '') {
  const options = arguments[3] || {}
  const normalizedFeatures = normalizeKmlFeatures(features)
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${escapeXml(name)}</name>`,
  ]
  if (description) parts.push(`    <description>${escapeXml(description)}</description>`)
  normalizedFeatures.forEach(feature => {
    parts.push('    <Placemark>')
    parts.push(`      <name>${escapeXml(feature.name)}</name>`)
    parts.push(`      <description>${escapeXml(feature.description)}</description>`)
    if (feature.styleUrl) parts.push(`      <styleUrl>${escapeXml(feature.styleUrl)}</styleUrl>`)
    const markerIcon = feature.type === 'Point' ? normalizeKmlMarkerIcon(feature.markerIcon) : ''
    const resourceCollection = feature.type === 'Point' && feature.resourceCollection
      ? normalizeKmlResourceCollection(feature.resourceCollection, { createId: () => randomId('res') })
      : null
    let resourceCollectionRef = feature.type === 'Point' && feature.resourceCollectionRef
      ? normalizeKmlResourceCollectionRef(feature.resourceCollectionRef)
      : null
    let resourceCollectionStatus = feature.type === 'Point' && feature.resourceCollectionStatus
      ? feature.resourceCollectionStatus
      : null
    if (resourceCollection && resourceCollectionRef) resourceCollectionRef = null
    if (resourceCollectionRef && options.publicProjection === true && resourceCollectionRef.sourceType === 'personal') {
      const accessState = typeof options.resourceCollectionAccessResolver === 'function'
        ? options.resourceCollectionAccessResolver(resourceCollectionRef)
        : 'missing'
      if (accessState !== 'public') {
        resourceCollectionStatus = { version: 1, sourceType: 'personal', accessState: ['private', 'trashed'].includes(accessState) ? accessState : 'missing' }
        resourceCollectionRef = null
      }
    }
    if (resourceCollectionStatus && (!resourceCollectionRef || options.publicProjection === true)) {
      const state = String(resourceCollectionStatus.accessState || '')
      if (!['private', 'missing', 'trashed'].includes(state)) resourceCollectionStatus = null
    } else {
      resourceCollectionStatus = null
    }
    if (markerIcon || resourceCollection || resourceCollectionRef || resourceCollectionStatus) {
      parts.push('      <ExtendedData>')
      if (markerIcon) {
        parts.push('        <Data name="map-service:marker-icon">')
        parts.push(`          <value>${escapeXml(markerIcon)}</value>`)
        parts.push('        </Data>')
      }
      if (resourceCollection) {
        parts.push('        <Data name="map-service:resource-collection">')
        parts.push(`          <value>${escapeXml(serializeKmlResourceCollection(resourceCollection))}</value>`)
        parts.push('        </Data>')
      }
      if (resourceCollectionRef) {
        parts.push('        <Data name="map-service:resource-collection-ref">')
        parts.push(`          <value>${escapeXml(serializeKmlResourceCollectionRef(resourceCollectionRef))}</value>`)
        parts.push('        </Data>')
      }
      if (resourceCollectionStatus) {
        parts.push('        <Data name="map-service:resource-collection-status">')
        parts.push(`          <value>${escapeXml(JSON.stringify({ version: 1, sourceType: 'personal', accessState: resourceCollectionStatus.accessState }))}</value>`)
        parts.push('        </Data>')
      }
      parts.push('      </ExtendedData>')
    }
    if (feature.type === 'Point') {
      parts.push('      <Point>')
      parts.push(`        <coordinates>${feature.coordinates[0]},${feature.coordinates[1]},0</coordinates>`)
      parts.push('      </Point>')
    } else if (feature.type === 'LineString') {
      parts.push('      <LineString>')
      parts.push(`        <coordinates>${feature.coordinates.map(item => `${item[0]},${item[1]},0`).join(' ')}</coordinates>`)
      parts.push('      </LineString>')
    } else {
      parts.push('      <Polygon>')
      parts.push('        <outerBoundaryIs><LinearRing>')
      parts.push(`          <coordinates>${feature.coordinates.map(item => `${item[0]},${item[1]},0`).join(' ')}</coordinates>`)
      parts.push('        </LinearRing></outerBoundaryIs>')
      parts.push('      </Polygon>')
    }
    parts.push('    </Placemark>')
  })
  parts.push('  </Document>')
  parts.push('</kml>')
  return parts.join('\n')
}

function resourceCollectionRefFingerprint (value) {
  const result = tryNormalizeKmlResourceCollectionRef(value)
  return result.value ? JSON.stringify(result.value) : ''
}

function resourceCollectionRefCapabilityVersion (input = {}) {
  const value = input.resourceCollectionRefVersion ?? input.capabilities?.resourceCollectionRefVersion
  return Number.isSafeInteger(Number(value)) && Number(value) === 1 ? 1 : 0
}

// A pre-reference client serializes a complete feature array without knowing
// how to preserve the new field. Merge omitted references for capable clients
// and reject destructive/ambiguous writes from older clients.
function prepareKmlResourceCollectionRefUpdate (input, currentFeatures) {
  if (input?.features === undefined) return { input, changedFeatureIds: new Set() }
  if (!Array.isArray(input.features)) return { input, changedFeatureIds: new Set() }
  const capable = resourceCollectionRefCapabilityVersion(input) === 1
  const currentById = new Map(
    (Array.isArray(currentFeatures) ? currentFeatures : [])
      .filter(feature => feature && typeof feature === 'object' && feature.resourceCollectionRef)
      .map(feature => [String(feature.id || ''), feature])
      .filter(([id]) => id),
  )
  const incomingIds = new Set()
  const changedFeatureIds = new Set()
  const mergedFeatures = input.features.map(rawFeature => {
    if (!rawFeature || typeof rawFeature !== 'object' || Array.isArray(rawFeature)) return rawFeature
    const id = String(rawFeature.id || '')
    if (id) incomingIds.add(id)
    const current = currentById.get(id)
    if (!current) {
      if (Object.hasOwn(rawFeature, 'resourceCollectionRef') && rawFeature.resourceCollectionRef !== null) changedFeatureIds.add(id)
      return rawFeature
    }
    const currentFingerprint = resourceCollectionRefFingerprint(current.resourceCollectionRef)
    const hasRefField = Object.hasOwn(rawFeature, 'resourceCollectionRef') && rawFeature.resourceCollectionRef !== undefined
    if (!hasRefField) {
      if (!capable) {
        throw createHttpError(
          '当前客户端不支持安全编辑资源集合引用，请升级客户端后重试',
          409,
          'KML_RESOURCE_COLLECTION_REF_UNSUPPORTED',
        )
      }
      return { ...rawFeature, resourceCollectionRef: clone(current.resourceCollectionRef) }
    }
    if (rawFeature.resourceCollectionRef === null) {
      // An explicit null is an intentional, backwards-compatible unbind.
      // Capability negotiation is only required for implicit deletion or
      // replacing a reference with a different source.
      return rawFeature
    }
    const incomingFingerprint = resourceCollectionRefFingerprint(rawFeature.resourceCollectionRef)
    if (!capable && incomingFingerprint !== currentFingerprint) {
      throw createHttpError(
        '当前客户端不支持替换资源集合引用，请升级客户端后重试',
        409,
        'KML_RESOURCE_COLLECTION_REF_UNSUPPORTED',
      )
    }
    if (incomingFingerprint !== currentFingerprint) changedFeatureIds.add(id)
    return rawFeature
  })
  if (!capable) {
    for (const [id] of currentById) {
      if (!incomingIds.has(id)) {
        throw createHttpError(
          '当前客户端不支持安全编辑资源集合引用，请升级客户端后重试',
          409,
          'KML_RESOURCE_COLLECTION_REF_UNSUPPORTED',
        )
      }
    }
  }
  return {
    input: { ...input, features: mergedFeatures },
    changedFeatureIds,
  }
}

function normalizeKmlInput (input = {}, current = {}) {
  requireObject(input)
  const features = input.features === undefined
    ? clone(current.features || [])
    : normalizeKmlFeatures(input.features)
  const bounds = computeKmlBounds(features)
  return {
    name: normalizeText(input.name, {
      fallback: current.name || '新建 KML 文件',
      minLength: 1,
      maxLength: 200,
      message: 'KML 名称长度需为 1～200 个字符',
    }),
    description: sanitizeRichText(input.description ?? current.description ?? '', 10000),
    coordCorrection: normalizeKmlCoordCorrection(
      input.coordCorrection,
      current.coordCorrection || 'wgs84-to-gcj02'
    ),
    theme: normalizeEnum(input.theme, KML_THEMES, current.theme || 'default', 'KML 主题不正确'),
    color: normalizeColor(input.color, current.color || '#0f766e'),
    lockDrag: normalizeBoolean(input.lockDrag, current.lockDrag),
    enabled: normalizeBoolean(input.enabled, current.enabled ?? true),
    isLiveTrack: normalizeBoolean(input.isLiveTrack, current.isLiveTrack),
    features,
    bounds,
    featureCount: features.length,
    byteSize: serializedByteSize(features),
  }
}

function normalizeTags (value, fallback = []) {
  const source = value === undefined ? fallback : value
  if (!Array.isArray(source)) {
    throw createHttpError('标签必须是字符串数组', 400, 'VALIDATION_FAILED')
  }
  const tags = []
  const seen = new Set()
  source.forEach(item => {
    const tag = normalizeText(item, { minLength: 1, maxLength: 30, message: '单个标签长度需为 1～30 个字符' })
    const key = tag.toLocaleLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      tags.push(tag)
    }
  })
  if (tags.length > 20) {
    throw createHttpError('标签数量不能超过 20 个', 400, 'VALIDATION_FAILED')
  }
  return tags
}

function normalizeFavoriteInput (input = {}, current = {}) {
  requireObject(input)
  const longitude = input.longitude === undefined ? Number(current.longitude) : Number(input.longitude)
  const latitude = input.latitude === undefined ? Number(current.latitude) : Number(input.latitude)
  const [normalizedLongitude, normalizedLatitude] = normalizeCoordinatePair([longitude, latitude])
  return {
    name: normalizeText(input.name, {
      fallback: current.name,
      minLength: 1,
      maxLength: 120,
      message: '收藏名称长度需为 1～120 个字符',
    }),
    note: normalizeText(input.note, { fallback: current.note, maxLength: 2000 }),
    longitude: normalizedLongitude,
    latitude: normalizedLatitude,
    sourceType: normalizeEnum(input.sourceType, FAVORITE_SOURCE_TYPES, current.sourceType || 'manual', '收藏来源类型不正确'),
    sourceRef: normalizeText(input.sourceRef, { fallback: current.sourceRef, maxLength: 200 }),
    address: normalizeText(input.address, { fallback: current.address, maxLength: 500 }),
    category: normalizeText(input.category, { fallback: current.category, maxLength: 80 }),
    tags: normalizeTags(input.tags, current.tags || []),
    color: normalizeColor(input.color, current.color || '#2563eb'),
  }
}

function normalizeExpiresAt (value, fallback = null) {
  if (value === undefined) return fallback
  if (value === null || value === '') return null
  const milliseconds = Date.parse(String(value))
  if (!Number.isFinite(milliseconds)) {
    throw createHttpError('过期时间格式不正确', 400, 'VALIDATION_FAILED')
  }
  return new Date(milliseconds).toISOString()
}

function normalizeViewConfig (input, fallback = {}) {
  if (input === undefined) return clone(fallback || {})
  requireObject(input, '地图视图配置格式不正确')
  const result = {}
  if (input.center !== undefined) {
    if (!Array.isArray(input.center) || input.center.length !== 2) {
      throw createHttpError('地图中心点格式不正确', 400, 'VALIDATION_FAILED')
    }
    const latitude = Number(input.center[0])
    const longitude = Number(input.center[1])
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw createHttpError('地图中心点必须是有效经纬度', 400, 'VALIDATION_FAILED')
    }
    result.center = [latitude, longitude]
  }
  if (input.zoom !== undefined) {
    const zoom = Number(input.zoom)
    if (!Number.isFinite(zoom) || zoom < 0 || zoom > 24) {
      throw createHttpError('地图缩放级别需在 0～24 之间', 400, 'VALIDATION_FAILED')
    }
    result.zoom = zoom
  }
  if (input.bearing !== undefined) {
    const bearing = Number(input.bearing)
    if (!Number.isFinite(bearing) || bearing < -360 || bearing > 360) {
      throw createHttpError('地图旋转角度不正确', 400, 'VALIDATION_FAILED')
    }
    result.bearing = bearing
  }
  if (input.pitch !== undefined) {
    const pitch = Number(input.pitch)
    if (!Number.isFinite(pitch) || pitch < 0 || pitch > 85) {
      throw createHttpError('地图俯仰角需在 0～85 之间', 400, 'VALIDATION_FAILED')
    }
    result.pitch = pitch
  }
  if (input.layerId !== undefined) {
    result.layerId = normalizeText(input.layerId, { maxLength: 160 })
  }
  if (input.mapMode !== undefined) {
    result.mapMode = normalizeEnum(input.mapMode, new Set(['2d', '3d']), '2d', '地图模式只支持 2d 或 3d')
  }
  if (input.showOwnerDisplayName !== undefined) {
    result.showOwnerDisplayName = normalizeBoolean(input.showOwnerDisplayName)
  }
  if (input.kmlPointClustering !== undefined || fallback?.kmlPointClustering !== undefined) {
    result.kmlPointClustering = normalizeKmlPointClustering(
      input.kmlPointClustering,
      fallback?.kmlPointClustering
    )
  }
  return result
}

function normalizeSharePassword (value, currentHash) {
  if (value === undefined) return currentHash || null
  if (value === null || value === '') return null
  const password = String(value)
  if (password.length < 4) {
    throw createHttpError('分享密码长度至少为 4 位', 400, 'VALIDATION_FAILED')
  }
  if (password.length > 128) {
    throw createHttpError('分享密码长度不能超过 128 位', 400, 'VALIDATION_FAILED')
  }
  return hashPasswordSync(password, { allowWeak: true, maxLength: 128 })
}

function assertPasswordlessSharingAllowed (passwordHash, settings) {
  if (passwordHash || settings.share.passwordlessSharingEnabled === true) return
  throw spatialError('SHARE_PASSWORDLESS_DISABLED')
}

function normalizeSpatialAccessSettings (value, fallbackMode = 'unrestricted', fallbackZoom = null) {
  if (value === undefined) {
    return { mode: fallbackMode, unrestrictedTileMaxZoom: fallbackMode === 'kml_bounds' ? fallbackZoom : null }
  }
  const input = requireObject(value, '空间访问设置格式不正确')
  const forbiddenFields = ['geometry', 'displayGeometry', 'bbox', 'bboxSegments', 'cameraBounds', 'areaKm2', 'diagonalKm']
  if (forbiddenFields.some(field => Object.hasOwn(input, field))) {
    throw createHttpError('空间范围只能由服务端根据 KML 计算', 400, 'VALIDATION_FAILED')
  }
  const mode = String(input.mode || '')
  if (!SPATIAL_ACCESS_MODES.has(mode)) {
    throw createHttpError('空间访问模式不正确', 400, 'SHARE_SPATIAL_MODE_INVALID')
  }
  const hasZoom = Object.hasOwn(input, 'unrestrictedTileMaxZoom')
  const rawZoom = hasZoom ? input.unrestrictedTileMaxZoom : fallbackZoom
  const unrestrictedTileMaxZoom = normalizeUnrestrictedTileMaxZoom(rawZoom)
  if (hasZoom && rawZoom !== null && rawZoom !== undefined && rawZoom !== '' && unrestrictedTileMaxZoom === null) {
    throw createHttpError('低缩放瓦片放宽级别需为 0～24 的整数', 400, 'SHARE_SPATIAL_TILE_ZOOM_INVALID')
  }
  return {
    mode,
    unrestrictedTileMaxZoom: mode === 'kml_bounds' ? unrestrictedTileMaxZoom : null,
  }
}

function normalizePasswordAccessTtlMode (value, fallback = 'finite') {
  if (value === undefined) return fallback
  const input = requireObject(value, '密码授权设置格式不正确')
  const mode = String(input.ttlMode || '')
  if (!PASSWORD_ACCESS_TTL_MODES.has(mode)) {
    throw createHttpError('密码授权模式不正确', 400, 'SHARE_PASSWORD_ACCESS_MODE_INVALID')
  }
  return mode
}

function spatialError (reasonCode) {
  const messages = {
    SHARE_SPATIAL_DISABLED: '后台未开放空间受限分享',
    SHARE_SPATIAL_BOUNDS_EMPTY: '分享内没有可计算范围的有效几何',
    SHARE_SPATIAL_RANGE_TOO_LARGE: 'KML 范围超过空间限制阈值',
    SHARE_SPATIAL_POLAR_UNSUPPORTED: '当前 KML 接近极区，无法安全限制地图范围',
    SHARE_SPATIAL_ANTIMERIDIAN_UNSTABLE: '当前 KML 跨越范围过大，无法安全限制地图范围',
    SHARE_SPATIAL_PADDING_INVALID: '空间边界余量配置不正确',
    SHARE_SPATIAL_TILE_ZOOM_INVALID: '范围外底图放宽级别需为 0～24 的整数',
    SHARE_SPATIAL_TILE_ZOOM_TOO_HIGH: '范围外底图放宽级别不能高于管理员设置的最大级别',
    SHARE_SPATIAL_POLICY_INVALID: '空间访问策略配置不正确',
    SHARE_SPATIAL_RECALCULATING: '分享空间范围正在重新计算',
    SHARE_UNLIMITED_ACCESS_DISABLED: '后台未开放不限授权',
    SHARE_UNLIMITED_ACCESS_REQUIRES_PASSWORD: '不限授权需要先设置分享密码',
    SHARE_PASSWORDLESS_DISABLED: '后台未开放无密码分享',
    SHARE_UNLIMITED_ACCESS_REQUIRES_SPATIAL: '不限授权需要启用空间范围限制',
    SHARE_UNLIMITED_ACCESS_RANGE_TOO_LARGE: 'KML 范围超过不限授权阈值',
  }
  const statusCode = reasonCode === 'SHARE_SPATIAL_RECALCULATING' ? 409 : 422
  return createHttpError(messages[reasonCode] || '分享空间范围暂不可用', statusCode, reasonCode || 'SHARE_SPATIAL_BOUNDS_EMPTY')
}

class AttemptLimiter {
  constructor (options, clock) {
    this.options = options
    this.clock = clock
    this.entries = new Map()
  }

  state (key) {
    const now = this.clock()
    const current = this.entries.get(key)
    if (!current || now - current.firstFailedAt > this.options.windowMs) {
      return { count: 0, firstFailedAt: now, blockedUntil: 0 }
    }
    return current
  }

  assertAllowed (key) {
    if (this.state(key).blockedUntil > this.clock()) {
      throw createHttpError('分享密码尝试次数过多，请稍后再试', 429, 'RATE_LIMITED')
    }
  }

  recordFailure (key) {
    const state = this.state(key)
    state.count += 1
    if (state.count >= this.options.maxAttempts) state.blockedUntil = this.clock() + this.options.blockMs
    this.entries.set(key, state)
  }

  clear (key) {
    this.entries.delete(key)
  }
}

class FixedWindowLimiter {
  constructor (options, clock) {
    this.options = {
      maxRequests: Math.max(1, Number(options?.maxRequests) || 1),
      windowMs: Math.max(1000, Number(options?.windowMs) || 1000),
      maxEntries: Math.max(1, Number(options?.maxEntries) || 10000),
    }
    this.clock = clock
    this.entries = new Map()
  }

  prune (now) {
    for (const [key, entry] of this.entries) {
      if (now - entry.startedAt >= this.options.windowMs) this.entries.delete(key)
    }
    // Keep the in-memory limiter bounded even when all active keys are within
    // the current window. Map insertion order gives us a deterministic oldest
    // entry to evict under pressure.
    while (this.entries.size >= this.options.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }

  consume (key, errorMessage, errorCode) {
    const now = this.clock()
    const normalizedKey = String(key || '').slice(0, 320)
    let entry = this.entries.get(normalizedKey)
    if (!entry || now - entry.startedAt >= this.options.windowMs) {
      this.prune(now)
      entry = { startedAt: now, count: 0 }
    }
    if (entry.count >= this.options.maxRequests) {
      throw createHttpError(errorMessage, 429, errorCode)
    }
    entry.count += 1
    this.entries.set(normalizedKey, entry)
  }

  configure (options = {}) {
    this.options = {
      maxRequests: Math.max(1, Number(options.maxRequests) || this.options.maxRequests),
      windowMs: Math.max(1000, Number(options.windowMs) || this.options.windowMs),
      maxEntries: Math.max(1, Number(options.maxEntries) || this.options.maxEntries),
    }
  }
}

export class UserContentService {
  constructor (options = {}) {
    if (!options.database) throw new Error('UserContentService requires database')
    this.database = options.database
    this.userSystem = options.userSystem || null
    this.settingsProvider = options.settingsProvider || (() => this.userSystem?.getSettings?.() || DEFAULT_SETTINGS)
    this.clock = options.clock || (() => Date.now())
    this.isSiteAccessEnabled = options.isSiteAccessEnabled || (() => false)
    this.sharePasswordLimiter = new AttemptLimiter(options.sharePasswordLimit || SHARE_PASSWORD_LIMIT, this.clock)
    this.shareTileLimiter = new FixedWindowLimiter(options.shareTileRateLimit || SHARE_TILE_RATE_LIMIT, this.clock)
    this.shareManifestLimiter = new FixedWindowLimiter(options.shareManifestRateLimit || SHARE_MANIFEST_RATE_LIMIT, this.clock)
    this.publicCollectionReadLimiter = new FixedWindowLimiter({
      maxRequests: options.publicCollectionReadRateLimit || 300,
      windowMs: 60000,
      maxEntries: 10000,
    }, this.clock)
    this.useRuntimeTileRateLimit = options.shareTileRateLimit === undefined
    this.useRuntimeManifestRateLimit = options.shareManifestRateLimit === undefined
    this.shareSecretEncryptionKey = String(options.shareSecretEncryptionKey || 'map-service-dev-share-secret')
    // IP fallback digests are keyed per process so low-entropy addresses are
    // not directly reversible from the persisted access-event table.
    this.sharePrivacySecret = String(options.sharePrivacySecret || randomToken(32))
    this.shareRuntimeMetrics = new Map()
    this.shareRuntimeMetricLimit = Math.max(100, Number(options.shareRuntimeMetricLimit) || 2000)
    this.lastShareAccessCleanupAt = 0
  }

  nowIso () {
    return new Date(this.clock()).toISOString()
  }

  recordShareRuntimeMetric (shareId, event, options = {}) {
    const normalizedShareId = String(shareId || '').slice(0, 160)
    const normalizedEvent = String(event || '').slice(0, 80)
    if (!normalizedShareId || !normalizedEvent) return
    const sourceId = String(options.sourceId || '').slice(0, 120)
    const decision = String(options.decision || '').slice(0, 80)
    const durationMs = Number.isFinite(Number(options.durationMs))
      ? Math.max(0, Math.round(Number(options.durationMs)))
      : 0
    const key = `${normalizedShareId}:${normalizedEvent}:${sourceId}:${decision}`
    const current = this.shareRuntimeMetrics.get(key)
    if (!current && this.shareRuntimeMetrics.size >= this.shareRuntimeMetricLimit) {
      const oldest = this.shareRuntimeMetrics.keys().next()
      if (!oldest.done) this.shareRuntimeMetrics.delete(oldest.value)
    }
    const now = this.nowIso()
    this.shareRuntimeMetrics.set(key, {
      shareId: normalizedShareId,
      event: normalizedEvent,
      sourceId,
      decision,
      count: Number(current?.count || 0) + 1,
      totalDurationMs: Number(current?.totalDurationMs || 0) + durationMs,
      maxDurationMs: Math.max(Number(current?.maxDurationMs || 0), durationMs),
      firstAt: current?.firstAt || now,
      lastAt: now,
    })
  }

  getShareRuntimeMetrics (actor) {
    this.assertPermission(actor, 'admin.share.moderate')
    const now = this.nowIso()
    const shareCounts = this.database.prepare(`
      SELECT
        COUNT(*) AS total_shares,
        SUM(CASE WHEN spatial_access_mode = 'kml_bounds' THEN 1 ELSE 0 END) AS spatial_shares,
        SUM(CASE WHEN spatial_access_mode = 'kml_bounds' AND status = 'active' AND password_hash IS NULL THEN 1 ELSE 0 END) AS passwordless_spatial_shares,
        SUM(CASE WHEN spatial_access_mode = 'kml_bounds' AND spatial_status = 'ready' THEN 1 ELSE 0 END) AS spatial_ready,
        SUM(CASE WHEN spatial_access_mode = 'kml_bounds' AND spatial_status = 'out_of_policy' THEN 1 ELSE 0 END) AS spatial_out_of_policy,
        SUM(CASE WHEN spatial_access_mode = 'kml_bounds' AND spatial_status IN ('empty', 'error') THEN 1 ELSE 0 END) AS spatial_invalid
      FROM kml_shares
      WHERE status != 'revoked'
    `).get() || {}
    const sessionCounts = this.database.prepare(`
      SELECT
        SUM(CASE WHEN ttl_mode = 'finite' AND revoked_at IS NULL AND expires_at > ? THEN 1 ELSE 0 END) AS finite_sessions,
        SUM(CASE WHEN ttl_mode = 'unlimited' AND revoked_at IS NULL THEN 1 ELSE 0 END) AS unlimited_sessions
      FROM share_access_sessions
    `).get(now) || {}
    const items = [...this.shareRuntimeMetrics.values()]
      .sort((left, right) => String(right.lastAt).localeCompare(String(left.lastAt)))
      .map(item => ({ ...item }))
    return {
      generatedAt: now,
      summary: {
        totalShares: Number(shareCounts.total_shares || 0),
        spatialShares: Number(shareCounts.spatial_shares || 0),
        semiPublicShares: this.getSettings().share.publicAccessPolicy === 'independent'
          ? Number(shareCounts.passwordless_spatial_shares || 0)
          : 0,
        spatialReady: Number(shareCounts.spatial_ready || 0),
        spatialOutOfPolicy: Number(shareCounts.spatial_out_of_policy || 0),
        spatialInvalid: Number(shareCounts.spatial_invalid || 0),
        finiteSessions: Number(sessionCounts.finite_sessions || 0),
        unlimitedSessions: Number(sessionCounts.unlimited_sessions || 0),
      },
      itemCount: items.length,
      items,
    }
  }

  getSettings () {
    const settings = this.settingsProvider() || {}
    return {
      quota: normalizeStoredQuotaSettings(settings.quota, DEFAULT_SETTINGS.quota),
      resourceCollection: normalizeResourceCollectionRuntimeSettings(
        settings.resourceCollection || settings.resourceCollections?.settings,
        DEFAULT_SETTINGS.resourceCollection,
      ),
      share: {
        ...DEFAULT_SETTINGS.share,
        ...(settings.share || {}),
        rateLimit: {
          enabled: true,
          windowMs: 60 * 1000,
          tileMaxRequests: 3000,
          manifestMaxRequests: 300,
          maxEntries: 10000,
          ...(settings.share?.rateLimit || {}),
        },
      },
      analytics: settings.analytics || {},
    }
  }

  shareRateLimitSettings () {
    const rateLimit = this.getSettings().share.rateLimit || {}
    return {
      enabled: rateLimit.enabled !== false,
      windowMs: Math.max(1000, Number(rateLimit.windowMs) || 60 * 1000),
      tileMaxRequests: Math.max(1, Number(rateLimit.tileMaxRequests) || 3000),
      manifestMaxRequests: Math.max(1, Number(rateLimit.manifestMaxRequests) || 300),
      maxEntries: Math.max(1, Number(rateLimit.maxEntries) || 10000),
    }
  }

  shareClientKey (shareId, context = {}) {
    const visitorId = String(context.visitorId || '').slice(0, 160)
    const fallback = hashToken([
      this.sharePrivacySecret,
      String(context.ip || '').slice(0, 120),
      String(context.userAgent || '').slice(0, 255),
    ].join('|')).slice(0, 24)
    return `${shareId}:${visitorId || fallback}`
  }

  consumeShareRateLimit (kind, shareId, context = {}) {
    if (kind === 'tile' && !this.useRuntimeTileRateLimit) {
      try {
        this.shareTileLimiter.consume(
          this.shareClientKey(shareId, context),
          '分享地图请求过于频繁，请稍后再试',
          'SHARE_TILE_RATE_LIMITED'
        )
      } catch (error) {
        if (error?.code === 'SHARE_TILE_RATE_LIMITED') this.recordShareRuntimeMetric(shareId, 'tile_rate_limited')
        throw error
      }
      return
    }
    if (kind === 'manifest' && !this.useRuntimeManifestRateLimit) {
      try {
        this.shareManifestLimiter.consume(
          this.shareClientKey(shareId, context),
          '分享数据请求过于频繁，请稍后再试',
          'SHARE_MANIFEST_RATE_LIMITED'
        )
      } catch (error) {
        if (error?.code === 'SHARE_MANIFEST_RATE_LIMITED') this.recordShareRuntimeMetric(shareId, 'manifest_rate_limited')
        throw error
      }
      return
    }
    const settings = this.shareRateLimitSettings()
    if (!settings.enabled) return
    const limiter = kind === 'tile' ? this.shareTileLimiter : this.shareManifestLimiter
    const maxRequests = kind === 'tile' ? settings.tileMaxRequests : settings.manifestMaxRequests
    limiter.configure({ maxRequests, windowMs: settings.windowMs, maxEntries: settings.maxEntries })
    const errorCode = kind === 'tile' ? 'SHARE_TILE_RATE_LIMITED' : 'SHARE_MANIFEST_RATE_LIMITED'
    const message = kind === 'tile' ? '分享地图请求过于频繁，请稍后再试' : '分享数据请求过于频繁，请稍后再试'
    try {
      limiter.consume(this.shareClientKey(shareId, context), message, errorCode)
    } catch (error) {
      if (error?.code === errorCode) this.recordShareRuntimeMetric(shareId, `${kind}_rate_limited`)
      throw error
    }
  }

  publicCollectionRateLimitSettings () {
    const configured = Number(this.getSettings().resourceCollection?.publicCollectionReadRateLimit)
    return {
      maxRequests: Number.isSafeInteger(configured) && configured > 0 ? configured : 300,
      windowMs: 60 * 1000,
      maxEntries: 10000,
    }
  }

  consumePublicCollectionRateLimit (key, context = {}) {
    const settings = this.publicCollectionRateLimitSettings()
    this.publicCollectionReadLimiter.configure(settings)
    const clientKey = hashToken([
      this.sharePrivacySecret,
      String(context.ip || '').slice(0, 120),
      String(context.userAgent || '').slice(0, 255),
      String(context.visitorId || '').slice(0, 160),
    ].join('|')).slice(0, 24)
    this.publicCollectionReadLimiter.consume(
      `${String(key || '').slice(0, 180)}:${clientKey}`,
      '公开资源集合读取过于频繁，请稍后再试',
      'RESOURCE_COLLECTION_RATE_LIMITED',
    )
  }

  spatialSettings (settings = this.getSettings()) {
    return settings.share || DEFAULT_SETTINGS.share
  }

  cappedSpatialTileZoom (value, settings = this.getSettings()) {
    const zoom = normalizeUnrestrictedTileMaxZoom(value)
    if (zoom === null) return null
    const configuredMax = normalizeUnrestrictedTileMaxZoom(this.spatialSettings(settings).spatialUnrestrictedTileMaxZoom) ??
      DEFAULT_SETTINGS.share.spatialUnrestrictedTileMaxZoom
    return Math.min(zoom, configuredMax)
  }

  shareItemsForSpatialScope (shareId) {
    return this.database.prepare(`
      SELECT i.kml_id, i.published_revision, i.published_snapshot_json
      FROM kml_share_items i
      WHERE i.share_id = ?
      ORDER BY i.position, i.id
    `).all(shareId).map(row => ({
      kmlId: row.kml_id,
      revision: Number(row.published_revision),
      features: parseJson(row.published_snapshot_json, {}).features || [],
    }))
  }

  shareItemRevisionSnapshot (shareId) {
    return this.database.prepare(`
      SELECT i.kml_id, i.published_revision
      FROM kml_share_items i
      WHERE i.share_id = ?
      ORDER BY i.position, i.id
    `).all(shareId).map(row => ({
      id: row.kml_id,
      revision: Number(row.published_revision),
    }))
  }

  spatialSnapshotEqual (left, right) {
    return JSON.stringify(left || []) === JSON.stringify(right || [])
  }

  computeSpatialState (items, settings = this.getSettings(), options = {}) {
    const shareSettings = this.spatialSettings(settings)
    const unrestrictedTileMaxZoom = normalizeUnrestrictedTileMaxZoom(options.unrestrictedTileMaxZoom)
    const configuredMaxZoom = normalizeUnrestrictedTileMaxZoom(shareSettings.spatialUnrestrictedTileMaxZoom) ??
      DEFAULT_SETTINGS.share.spatialUnrestrictedTileMaxZoom
    if (unrestrictedTileMaxZoom !== null && unrestrictedTileMaxZoom > configuredMaxZoom) {
      return {
        status: 'error',
        scope: null,
        eligibility: {
          spatialAccessEligible: false,
          unlimitedAccessEligible: false,
          reasonCode: 'SHARE_SPATIAL_TILE_ZOOM_TOO_HIGH',
        },
        errorCode: 'SHARE_SPATIAL_TILE_ZOOM_TOO_HIGH',
      }
    }
    const documents = (items || []).map(item => ({
      features: Array.isArray(item.features) ? item.features : [],
    }))
    const result = computeSpatialScope({
      documents,
      paddingMeters: shareSettings.spatialPaddingMeters,
      sourceRevisions: (items || []).map(item => ({ id: item.kmlId, revision: item.revision })),
      policyRevision: shareSettings.spatialPolicyRevision,
      unrestrictedTileMaxZoom,
      computedAt: this.nowIso(),
    })
    if (result.status !== 'ready') {
      return {
        status: result.status === 'empty' ? 'empty' : 'error',
        scope: null,
        eligibility: {
          spatialAccessEligible: false,
          unlimitedAccessEligible: false,
          reasonCode: result.reasonCode,
        },
        errorCode: result.reasonCode,
      }
    }
    const eligibility = spatialPolicyEligibility(result.scope, shareSettings)
    if (!eligibility.spatialAccessEligible) {
      return {
        status: 'out_of_policy',
        scope: result.scope,
        eligibility,
        errorCode: eligibility.reasonCode,
      }
    }
    return {
      status: 'ready',
      scope: result.scope,
      eligibility,
      errorCode: null,
    }
  }

  normalizeSpatialPreviewItems (ownerId, value) {
    return this.normalizeShareItems(ownerId, value, { allowEmpty: true })
  }

  getSpatialPreview (actor, input = {}) {
    this.assertPermission(actor, 'share.own.manage')
    requireObject(input)
    const ownerId = this.actorUser(actor).id
    const spatialAccess = normalizeSpatialAccessSettings(input.spatialAccess, 'unrestricted')
    if (spatialAccess.mode === 'unrestricted') {
      return {
        mode: spatialAccess.mode,
        status: 'ready',
        spatialAccessEligible: false,
        unlimitedAccessEligible: false,
        reasonCode: null,
      }
    }
    const settings = this.getSettings()
    if (settings.share.spatialAccessEnabled !== true) throw spatialError('SHARE_SPATIAL_DISABLED')
    const items = this.normalizeSpatialPreviewItems(ownerId, input.items)
    const state = this.computeSpatialState(items, settings, spatialAccess)
    if (state.status !== 'ready') throw spatialError(state.errorCode)
    return {
      mode: spatialAccess.mode,
      status: state.status,
      ...publicSpatialScope(state.scope, 0),
      spatialAccessEligible: state.eligibility.spatialAccessEligible,
      unlimitedAccessEligible: state.eligibility.unlimitedAccessEligible,
      reasonCode: state.eligibility.reasonCode,
    }
  }

  resolveShareSpatialState (items, mode, settings, options = {}) {
    if (mode === 'unrestricted') {
      return {
        status: 'ready',
        scope: null,
        eligibility: {
          spatialAccessEligible: false,
          unlimitedAccessEligible: false,
          reasonCode: null,
        },
        errorCode: null,
      }
    }
    if (settings.share.spatialAccessEnabled !== true) throw spatialError('SHARE_SPATIAL_DISABLED')
    const state = this.computeSpatialState(items, settings, options)
    if (state.status !== 'ready') throw spatialError(state.errorCode)
    return state
  }

  assertPasswordAccessMode (ttlMode, passwordHash, spatialMode, spatialState, settings) {
    if (ttlMode !== 'unlimited') return
    if (!passwordHash) throw spatialError('SHARE_UNLIMITED_ACCESS_REQUIRES_PASSWORD')
    if (spatialMode !== 'kml_bounds') throw spatialError('SHARE_UNLIMITED_ACCESS_REQUIRES_SPATIAL')
    if (settings.share.unlimitedAccessEnabled !== true) {
      throw spatialError('SHARE_UNLIMITED_ACCESS_DISABLED')
    }
    if (spatialState.status !== 'ready') throw spatialError(spatialState.errorCode)
    if (!spatialState.eligibility.unlimitedAccessEligible) {
      throw spatialError(spatialState.eligibility.reasonCode || 'SHARE_UNLIMITED_ACCESS_RANGE_TOO_LARGE')
    }
  }

  shareSpatialView (row, options = {}) {
    const mode = row.spatial_access_mode || 'unrestricted'
    const status = row.spatial_status || 'ready'
    const scope = parseJson(row.spatial_scope_json, null)
    const result = {
      mode,
      status,
      revision: Number(row.spatial_scope_revision || 0),
    }
    if (mode === 'kml_bounds' && scope && status === 'ready') {
      Object.assign(result, publicSpatialScope(scope, Number(row.spatial_scope_revision || 0)))
      const eligibility = spatialPolicyEligibility(scope, this.spatialSettings())
      result.unlimitedAccessEligible = eligibility.unlimitedAccessEligible
      result.reasonCode = row.spatial_error_code || eligibility.reasonCode || null
    } else if (mode === 'kml_bounds') {
      result.reasonCode = row.spatial_error_code || null
    }
    if (options.internal === true) result.internalScope = scope
    return result
  }

  passwordAccessView (row) {
    const hasPassword = Boolean(row.password_hash)
    const ttlMode = hasPassword ? (row.password_access_ttl_mode || 'finite') : 'not_applicable'
    return {
      ttlMode,
      effectiveTtlMs: ttlMode === 'finite' ? Number(this.getSettings().share.accessTtlMs) : null,
    }
  }

  shareAnalyticsView (row) {
    const config = parseJson(row.analytics_config_json, {})
    const descriptor = resolveShareAnalyticsDescriptor(
      config,
      this.getSettings().analytics?.share,
      { disabled: Boolean(row.analytics_disabled) }
    )
    return {
      mode: config.mode || 'none',
      websiteId: config.mode === 'provider' ? String(config.websiteId || '') : '',
      script: config.mode === 'custom' ? (config.script || null) : null,
      effective: Boolean(descriptor),
      disabledByAdmin: Boolean(row.analytics_disabled),
      disabledReason: row.analytics_disabled ? String(row.analytics_disabled_reason || '') : '',
    }
  }

  revokeShareSessions (shareId, reason = 'revoked', options = {}) {
    const now = this.nowIso()
    const where = options.unlimitedOnly ? " AND ttl_mode = 'unlimited'" : ''
    const result = this.database.prepare(`
      UPDATE share_access_sessions
      SET revoked_at = COALESCE(revoked_at, ?), revoke_reason = CASE
        WHEN revoked_at IS NULL OR revoke_reason = '' THEN ? ELSE revoke_reason END
      WHERE share_id = ? AND revoked_at IS NULL${where}
    `).run(now, reason, shareId)
    return Number(result.changes || 0)
  }

  revalidateSpatialShare (shareId, settings = this.getSettings(), options = {}) {
    // 空间计算可能跨越 KML 更新或策略保存；失败时重算，绝不把旧结果写回覆盖新版本。
    const startedAt = this.clock()
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = this.revalidateSpatialShareOnce(shareId, settings, options)
        if (!result.recalculating) {
          this.recordShareRuntimeMetric(shareId, 'spatial_recalculate', {
            decision: result.status || 'skipped',
            durationMs: this.clock() - startedAt,
          })
          if (result.downgraded) {
            this.recordShareRuntimeMetric(shareId, 'spatial_auto_downgrade', { decision: result.status || 'unknown' })
          }
          return result
        }
        settings = this.getSettings()
      }
      const result = {
        affected: false,
        downgraded: false,
        revokedUnlimitedSessions: 0,
        status: 'recalculating',
        recalculating: true,
      }
      this.recordShareRuntimeMetric(shareId, 'spatial_recalculate', {
        decision: 'conflict',
        durationMs: this.clock() - startedAt,
      })
      return result
    } catch (error) {
      this.recordShareRuntimeMetric(shareId, 'spatial_recalculate', {
        decision: error?.code || 'error',
        durationMs: this.clock() - startedAt,
      })
      throw error
    }
  }

  revalidateSpatialShareOnce (shareId, settings = this.getSettings(), options = {}) {
    const row = this.database.prepare('SELECT * FROM kml_shares WHERE id = ?').get(shareId)
    if (!row || (row.spatial_access_mode || 'unrestricted') !== 'kml_bounds') {
      return { affected: false, downgraded: false, revokedUnlimitedSessions: 0 }
    }
    const items = this.shareItemsForSpatialScope(shareId)
    const sourceRevisions = items.map(item => ({ id: item.kmlId, revision: Number(item.revision) }))
    const previousScope = parseJson(row.spatial_scope_json, null)
    const state = this.computeSpatialState(items, settings, {
      unrestrictedTileMaxZoom: this.cappedSpatialTileZoom(previousScope?.unrestrictedTileMaxZoom, settings),
    })
    const previousHash = previousScope?.sourceRevisionHash || ''
    const nextHash = state.scope?.sourceRevisionHash || ''
    const policyRevision = Number(settings.share.spatialPolicyRevision || 1)
    const policyChanged = Number(row.access_policy_revision || 1) !== policyRevision ||
      (options.policyChanged === true && Number(row.access_policy_revision || 1) !== policyRevision)
    const scopeChanged = previousHash !== nextHash || row.spatial_status !== state.status ||
      Number(previousScope?.paddingMeters || 0) !== Number(state.scope?.paddingMeters || 0) ||
      normalizeUnrestrictedTileMaxZoom(previousScope?.unrestrictedTileMaxZoom) !==
        normalizeUnrestrictedTileMaxZoom(state.scope?.unrestrictedTileMaxZoom)
    let ttlMode = row.password_access_ttl_mode || 'finite'
    const downgraded = ttlMode === 'unlimited' && (!row.password_hash || state.status !== 'ready' ||
      !state.eligibility.unlimitedAccessEligible)
    if (downgraded) ttlMode = 'finite'
    // Spatial diagnostics must not change the share lifecycle. A source edit,
    // transient geometry failure, or policy mismatch is reported through the
    // spatial status while pause/block/revoke remain explicit actions.
    const nextStatus = row.status
    const revisionChanged = scopeChanged || policyChanged || downgraded
    let committed = false
    let revokedUnlimitedSessions = 0

    this.database.transaction(() => {
      const current = this.database.prepare('SELECT * FROM kml_shares WHERE id = ?').get(shareId)
      if (!current || Number(current.revision) !== Number(row.revision) ||
          Number(current.access_policy_revision || 1) !== Number(row.access_policy_revision || 1) ||
          Number(this.getSettings().share.spatialPolicyRevision || 1) !== policyRevision ||
          !this.spatialSnapshotEqual(this.shareItemRevisionSnapshot(shareId), sourceRevisions)) {
        return
      }
      const result = this.database.prepare(`
        UPDATE kml_shares SET
          password_access_ttl_mode = ?, spatial_scope_json = ?, spatial_scope_revision = ?,
          spatial_status = ?, spatial_error_code = ?, access_policy_revision = ?,
          status = ?, revision = revision + ?, updated_at = ?
        WHERE id = ? AND revision = ? AND access_policy_revision = ?
      `).run(
        ttlMode,
        JSON.stringify(state.scope || {}),
        Number(row.spatial_scope_revision || 0) + (scopeChanged || policyChanged ? 1 : 0),
        state.status,
        state.errorCode || '',
        policyRevision,
        nextStatus,
        revisionChanged ? 1 : 0,
        this.nowIso(),
        shareId,
        row.revision,
        row.access_policy_revision || 1
      )
      if (Number(result.changes || 0) !== 1) return
      committed = true
      if (downgraded) {
        revokedUnlimitedSessions = this.revokeShareSessions(shareId, 'share.password-access.auto-downgrade', { unlimitedOnly: true })
      } else if (ttlMode === 'unlimited' && policyChanged) {
        revokedUnlimitedSessions = this.revokeShareSessions(shareId, 'admin.share-spatial-policy.update', { unlimitedOnly: true })
      }
      if (downgraded) {
        this.insertAudit({
          actorUserId: row.owner_id,
          action: 'share.password-access.auto-downgrade',
          targetType: 'kml-share',
          targetId: shareId,
          metadata: {
            reasonCode: state.errorCode || state.eligibility.reasonCode || 'SHARE_UNLIMITED_ACCESS_REQUIRES_PASSWORD',
            areaKm2: state.scope?.areaKm2 || null,
            diagonalKm: state.scope?.diagonalKm || null,
            revokedUnlimitedSessions,
          },
        })
      }
    })

    if (!committed) {
      return {
        affected: false,
        downgraded: false,
        revokedUnlimitedSessions: 0,
        status: 'recalculating',
        recalculating: true,
      }
    }
    return {
      affected: revisionChanged,
      downgraded,
      revokedUnlimitedSessions,
      status: state.status,
    }
  }

  revalidateAllSpatialShares (shareSettings = this.spatialSettings(), previousSettings = null) {
    const rows = this.database.prepare(`
      SELECT id FROM kml_shares WHERE spatial_access_mode = 'kml_bounds'
    `).all()
    const stats = {
      affectedShares: 0,
      downgradedShares: 0,
      revokedUnlimitedSessions: 0,
      recalculatedShares: rows.length,
    }
    const settings = { share: { ...this.getSettings().share, ...shareSettings } }
    const policyChanged = Boolean(previousSettings) &&
      Number(previousSettings.spatialPolicyRevision || 1) !== Number(shareSettings.spatialPolicyRevision || 1)
    rows.forEach(row => {
      const result = this.revalidateSpatialShare(row.id, settings, { policyChanged })
      if (result.affected) stats.affectedShares += 1
      if (result.downgraded) stats.downgradedShares += 1
      stats.revokedUnlimitedSessions += result.revokedUnlimitedSessions
    })
    return stats
  }

  previewSpatialPolicyImpact (shareSettings = this.spatialSettings(), previousSettings = null) {
    const rows = this.database.prepare(`
      SELECT * FROM kml_shares WHERE spatial_access_mode = 'kml_bounds'
    `).all()
    const settings = { share: { ...this.getSettings().share, ...shareSettings } }
    const policyChanged = Boolean(previousSettings) &&
      Number(previousSettings.spatialPolicyRevision || 1) !== Number(shareSettings.spatialPolicyRevision || 1)
    const stats = {
      affectedShares: 0,
      downgradedShares: 0,
      revokedUnlimitedSessions: 0,
      recalculatedShares: rows.length,
    }

    rows.forEach(row => {
      const previousScope = parseJson(row.spatial_scope_json, null)
      const state = this.computeSpatialState(this.shareItemsForSpatialScope(row.id), settings, {
        unrestrictedTileMaxZoom: this.cappedSpatialTileZoom(previousScope?.unrestrictedTileMaxZoom, settings),
      })
      const scopeChanged = (previousScope?.sourceRevisionHash || '') !== (state.scope?.sourceRevisionHash || '') ||
        row.spatial_status !== state.status ||
        Number(previousScope?.paddingMeters || 0) !== Number(state.scope?.paddingMeters || 0) ||
        normalizeUnrestrictedTileMaxZoom(previousScope?.unrestrictedTileMaxZoom) !==
          normalizeUnrestrictedTileMaxZoom(state.scope?.unrestrictedTileMaxZoom)
      const downgraded = (row.password_access_ttl_mode || 'finite') === 'unlimited' &&
        (!row.password_hash || state.status !== 'ready' || !state.eligibility.unlimitedAccessEligible)
      const revokesUnlimited = (row.password_access_ttl_mode || 'finite') === 'unlimited' &&
        (downgraded || policyChanged)
      if (scopeChanged || policyChanged || downgraded) stats.affectedShares += 1
      if (downgraded) stats.downgradedShares += 1
      if (revokesUnlimited) {
        stats.revokedUnlimitedSessions += Number(this.database.prepare(`
          SELECT COUNT(*) AS count FROM share_access_sessions
          WHERE share_id = ? AND ttl_mode = 'unlimited' AND revoked_at IS NULL
        `).get(row.id)?.count || 0)
      }
    })

    return stats
  }

  revalidateSharesForKml (kmlId) {
    const rows = this.database.prepare(`
      SELECT DISTINCT share_id FROM kml_share_items WHERE kml_id = ?
    `).all(kmlId)
    rows.forEach(row => this.refreshShareAfterContentChange(row.share_id))
    return rows.length
  }

  refreshShareAfterContentChange (shareId) {
    const row = this.database.prepare('SELECT * FROM kml_shares WHERE id = ?').get(shareId)
    if (!row) return null
    // Revalidation updates only spatial diagnostics and authorization
    // metadata. It never implicitly pauses or deletes a share.
    return this.revalidateSpatialShare(shareId)
  }

  actorUser (actor) {
    if (!actor?.user?.id) throw createHttpError('请先登录', 401, 'AUTH_REQUIRED')
    return actor.user
  }

  hasPermission (actor, permission) {
    const permissions = actor?.user?.permissions || []
    if (permissions.includes(permission) || permissions.includes('system.super_admin')) return true
    if (permission === 'kml.own.read' && permissions.includes('kml.own.write')) return true
    if (permission === 'kml.any.read' && permissions.includes('kml.any.manage')) return true
    if (permission === 'resource_collection.own.read' && (
      permissions.includes('resource_collection.own.write') ||
      permissions.includes('resource_collection.own.manage')
    )) return true
    if (permission === 'resource_collection.own.write' && permissions.includes('resource_collection.own.manage')) return true
    if (permission === 'resource_collection.any.read' && permissions.includes('resource_collection.any.manage')) return true
    return false
  }

  assertPermission (actor, permission) {
    this.actorUser(actor)
    if (!this.hasPermission(actor, permission)) {
      throw createHttpError('没有执行此操作的权限', 403, 'PERMISSION_DENIED')
    }
  }

  insertAudit (entry = {}) {
    if (this.userSystem?.insertAudit) {
      this.userSystem.insertAudit(entry)
      return
    }
    this.database.prepare(`
      INSERT INTO audit_logs(
        id, actor_user_id, action, target_type, target_id, result,
        reason, metadata_json, ip_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomId('aud'),
      entry.actorUserId || null,
      String(entry.action || 'unknown').slice(0, 120),
      String(entry.targetType || 'unknown').slice(0, 80),
      String(entry.targetId || '').slice(0, 160),
      String(entry.result || 'success').slice(0, 20),
      String(entry.reason || '').slice(0, 500),
      JSON.stringify(entry.metadata && isPlainObject(entry.metadata) ? entry.metadata : {}),
      String(entry.ipSummary || '').slice(0, 80),
      this.nowIso()
    )
  }

  quotaForUser (userId) {
    const row = this.database.prepare('SELECT quota_json FROM users WHERE id = ?').get(userId)
    if (!row) throw createHttpError('用户不存在', 404, 'RESOURCE_NOT_FOUND')
    const quotaSettings = this.getSettings().quota
    const overrides = normalizeStoredQuotaOverrides(parseJson(row.quota_json, {}), quotaSettings)
    return normalizeStoredQuotaSettings(overrides, quotaSettings)
  }

  getKmlUsage (actor, ownerId = this.actorUser(actor).id) {
    const actorUser = this.actorUser(actor)
    if (actorUser.id !== ownerId && !this.hasPermission(actor, 'kml.any.read')) {
      throw createHttpError('资源不存在', 404, 'RESOURCE_NOT_FOUND')
    }
    const usage = this.database.prepare(`
      SELECT
        COUNT(*) AS total_file_count,
        COALESCE(SUM(feature_count), 0) AS total_feature_count,
        COALESCE(SUM(byte_size), 0) AS total_byte_size,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS file_count,
        COALESCE(SUM(CASE WHEN status = 'active' THEN feature_count ELSE 0 END), 0) AS feature_count,
        COALESCE(SUM(CASE WHEN status = 'active' THEN byte_size ELSE 0 END), 0) AS byte_size,
        SUM(CASE WHEN status = 'trashed' THEN 1 ELSE 0 END) AS trash_count,
        COALESCE(SUM(CASE WHEN status = 'trashed' THEN feature_count ELSE 0 END), 0) AS trash_feature_count,
        COALESCE(SUM(CASE WHEN status = 'trashed' THEN byte_size ELSE 0 END), 0) AS trash_byte_size
      FROM kml_documents WHERE owner_id = ?
    `).get(ownerId)
    return {
      fileCount: Number(usage.file_count || 0),
      featureCount: Number(usage.feature_count || 0),
      byteSize: Number(usage.byte_size || 0),
      trashCount: Number(usage.trash_count || 0),
      trashFeatureCount: Number(usage.trash_feature_count || 0),
      trashByteSize: Number(usage.trash_byte_size || 0),
      totalFileCount: Number(usage.total_file_count || 0),
      totalFeatureCount: Number(usage.total_feature_count || 0),
      totalByteSize: Number(usage.total_byte_size || 0),
      quota: this.quotaForUser(ownerId),
    }
  }

  assertKmlQuota (ownerId, document, existing = null, sourceByteSize = 0) {
    const quota = this.quotaForUser(ownerId)
    const usage = this.database.prepare(`
      SELECT SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS file_count,
             COALESCE(SUM(CASE WHEN status = 'active' THEN feature_count ELSE 0 END), 0) AS feature_count
      FROM kml_documents WHERE owner_id = ?
    `).get(ownerId)
    const existingIsActive = existing?.status === 'active'
    const nextFileCount = Number(usage.file_count || 0) + (existing ? 0 : 1)
    const nextFeatureCount = Number(usage.feature_count || 0) -
      (existingIsActive ? Number(existing.feature_count || 0) : 0) +
      (existing ? (existingIsActive ? document.featureCount : 0) : document.featureCount)
    const measuredBytes = Math.max(document.byteSize, Number(sourceByteSize || 0))
    if (measuredBytes > quota.maxKmlFileBytes) {
      throw createHttpError('KML 文件超过单文件大小限制', 413, 'FILE_TOO_LARGE')
    }
    if (document.featureCount > quota.maxFeaturesPerKml) {
      throw createHttpError('KML 要素数量超过单文件限制', 422, 'QUOTA_EXCEEDED')
    }
    if (nextFileCount > quota.maxKmlFiles || nextFeatureCount > quota.maxFeaturesPerUser) {
      throw createHttpError('用户 KML 配额不足', 422, 'QUOTA_EXCEEDED')
    }
  }

  shareReferenceCount (kmlId) {
    return Number(this.database.prepare(`
      SELECT COUNT(*) AS count FROM kml_share_items WHERE kml_id = ?
    `).get(kmlId)?.count || 0)
  }

  outdatedShareReferenceCount (kmlId) {
    return Number(this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM kml_share_items i
      JOIN kml_documents k ON k.id = i.kml_id
      WHERE i.kml_id = ? AND i.published_revision != k.revision
    `).get(kmlId)?.count || 0)
  }

  requireOwnedKmlDirectory (actor, directoryId) {
    this.assertPermission(actor, 'kml.own.read')
    const ownerId = this.actorUser(actor).id
    const id = normalizeKmlDirectoryId(directoryId)
    if (!id) throw createHttpError('KML 目录不存在', 404, 'KML_DIRECTORY_NOT_FOUND')
    const row = this.database.prepare(`
      SELECT * FROM kml_directories WHERE id = ? AND owner_id = ?
    `).get(id, ownerId)
    if (!row) throw createHttpError('KML 目录不存在', 404, 'KML_DIRECTORY_NOT_FOUND')
    return row
  }

  assertOwnedDirectoryId (actor, directoryId) {
    const id = normalizeKmlDirectoryId(directoryId)
    if (!id) return null
    return this.requireOwnedKmlDirectory(actor, id).id
  }

  kmlDirectoryViewFromRow (row) {
    if (!row) return null
    const counts = this.database.prepare(`
      SELECT COUNT(*) AS file_count,
             COALESCE(SUM(CASE WHEN enabled = 1 AND status = 'active' THEN 1 ELSE 0 END), 0) AS visible_file_count,
             COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_file_count
      FROM kml_documents WHERE owner_id = ? AND directory_id = ?
    `).get(row.owner_id, row.id)
    const activeFileCount = Number(counts?.active_file_count || 0)
    const visibleFileCount = Number(counts?.visible_file_count || 0)
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      position: Number(row.position || 0),
      enabled: Boolean(row.enabled),
      fileCount: Number(counts?.file_count || 0),
      activeFileCount,
      visibleFileCount,
      visibilityState: activeFileCount === 0 || visibleFileCount === activeFileCount
        ? 'visible'
        : visibleFileCount === 0 ? 'hidden' : 'mixed',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  listKmlDirectories (actor) {
    this.assertPermission(actor, 'kml.own.read')
    const ownerId = this.actorUser(actor).id
    const items = this.database.prepare(`
      SELECT * FROM kml_directories WHERE owner_id = ? ORDER BY position, id
    `).all(ownerId).map(row => this.kmlDirectoryViewFromRow(row))
    const uncategorizedCounts = this.database.prepare(`
      SELECT COUNT(*) AS file_count,
             COALESCE(SUM(CASE WHEN enabled = 1 AND status = 'active' THEN 1 ELSE 0 END), 0) AS visible_file_count,
             COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_file_count
      FROM kml_documents WHERE owner_id = ? AND directory_id IS NULL
    `).get(ownerId)
    const activeFileCount = Number(uncategorizedCounts?.active_file_count || 0)
    const visibleFileCount = Number(uncategorizedCounts?.visible_file_count || 0)
    return {
      items,
      uncategorized: {
        id: null,
        name: '未分类',
        position: items.length,
        enabled: activeFileCount === 0 || visibleFileCount > 0,
        fileCount: Number(uncategorizedCounts?.file_count || 0),
        activeFileCount,
        visibleFileCount,
        visibilityState: activeFileCount === 0 || visibleFileCount === activeFileCount
          ? 'visible'
          : visibleFileCount === 0 ? 'hidden' : 'mixed',
      },
    }
  }

  createKmlDirectory (actor, input = {}) {
    this.assertPermission(actor, 'kml.own.write')
    requireObject(input)
    const ownerId = this.actorUser(actor).id
    const count = Number(this.database.prepare(`
      SELECT COUNT(*) AS count FROM kml_directories WHERE owner_id = ?
    `).get(ownerId)?.count || 0)
    if (count >= KML_DIRECTORY_LIMIT) {
      throw createHttpError(`KML 目录数量不能超过 ${KML_DIRECTORY_LIMIT} 个`, 422, 'KML_DIRECTORY_LIMIT_EXCEEDED')
    }
    const name = normalizeKmlDirectoryName(input.name)
    const nameKey = normalizedDirectoryNameKey(name)
    if (this.database.prepare(`
      SELECT 1 FROM kml_directories WHERE owner_id = ? AND name_normalized = ?
    `).get(ownerId, nameKey)) {
      throw createHttpError('同名 KML 目录已存在', 409, 'KML_DIRECTORY_NAME_CONFLICT')
    }
    const position = Number(this.database.prepare(`
      SELECT COALESCE(MAX(position), -1) + 1 AS position FROM kml_directories WHERE owner_id = ?
    `).get(ownerId)?.position || 0)
    const id = randomId('kmd')
    const now = this.nowIso()
    this.database.prepare(`
      INSERT INTO kml_directories(id, owner_id, name, name_normalized, position, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, ownerId, name, nameKey, position, now, now)
    this.insertAudit({ actorUserId: ownerId, action: 'kml.directory.create', targetType: 'kml-directory', targetId: id })
    return this.kmlDirectoryViewFromRow(this.database.prepare('SELECT * FROM kml_directories WHERE id = ?').get(id))
  }

  updateKmlDirectory (actor, directoryId, input = {}) {
    this.assertPermission(actor, 'kml.own.write')
    requireObject(input)
    const row = this.requireOwnedKmlDirectory(actor, directoryId)
    const name = input.name === undefined ? row.name : normalizeKmlDirectoryName(input.name, row.name)
    const nameKey = normalizedDirectoryNameKey(name)
    const duplicate = this.database.prepare(`
      SELECT 1 FROM kml_directories WHERE owner_id = ? AND name_normalized = ? AND id <> ?
    `).get(row.owner_id, nameKey, row.id)
    if (duplicate) throw createHttpError('同名 KML 目录已存在', 409, 'KML_DIRECTORY_NAME_CONFLICT')
    const enabled = normalizeBoolean(input.enabled, Boolean(row.enabled))
    const now = this.nowIso()
    this.database.prepare(`
      UPDATE kml_directories SET name = ?, name_normalized = ?, enabled = ?, updated_at = ? WHERE id = ?
    `).run(name, nameKey, enabled ? 1 : 0, now, row.id)
    if (input.enabled !== undefined) this.setKmlDirectoryVisibility(actor, row.id, enabled)
    return this.kmlDirectoryViewFromRow(this.database.prepare('SELECT * FROM kml_directories WHERE id = ?').get(row.id))
  }

  deleteKmlDirectory (actor, directoryId) {
    this.assertPermission(actor, 'kml.own.write')
    const row = this.requireOwnedKmlDirectory(actor, directoryId)
    const now = this.nowIso()
    const files = this.database.transaction(() => {
      // Repair both sides before moving rows. Only active files participate in
      // the user-visible order; trashed files retain no meaningful position.
      this.reindexKmlDirectoryOrder(row.owner_id, null, { now, touchRevision: false })
      this.reindexKmlDirectoryOrder(row.owner_id, row.id, { now, touchRevision: false })
      const targetStart = Number(this.database.prepare(`
        SELECT COUNT(*) AS count
        FROM kml_documents
        WHERE owner_id = ? AND directory_id IS NULL AND status = 'active'
      `).get(row.owner_id)?.count || 0)
      const activeFiles = this.database.prepare(`
        SELECT id FROM kml_documents
        WHERE owner_id = ? AND directory_id = ? AND status = 'active'
        ORDER BY position, id
      `).all(row.owner_id, row.id)
      const trashedFiles = this.database.prepare(`
        SELECT id FROM kml_documents
        WHERE owner_id = ? AND directory_id = ? AND status = 'trashed'
        ORDER BY deleted_at, position, id
      `).all(row.owner_id, row.id)
      const move = this.database.prepare(`
        UPDATE kml_documents
        SET directory_id = NULL, position = ?, revision = revision + 1, updated_at = ?
        WHERE id = ?
      `)
      activeFiles.forEach((file, index) => move.run(targetStart + index, now, file.id))
      const clearTrashed = this.database.prepare(`
        UPDATE kml_documents
        SET directory_id = NULL, position = 0, revision = revision + 1, updated_at = ?
        WHERE id = ?
      `)
      trashedFiles.forEach(file => clearTrashed.run(now, file.id))
      this.database.prepare('DELETE FROM kml_directories WHERE id = ?').run(row.id)
      this.reindexKmlDirectoryOrder(row.owner_id, null, { now, touchRevision: false })
      this.reindexKmlDirectories(row.owner_id)
      this.insertAudit({
        actorUserId: row.owner_id,
        action: 'kml.directory.delete',
        targetType: 'kml-directory',
        targetId: row.id,
        metadata: { movedFileCount: activeFiles.length + trashedFiles.length },
      })
      return [...activeFiles, ...trashedFiles]
    })
    return {
      id: row.id,
      status: 'deleted',
      movedFileCount: files.length,
      documents: files.map(file => this.kmlViewFromRow(
        this.database.prepare('SELECT * FROM kml_documents WHERE id = ?').get(file.id)
      )),
    }
  }

  reindexKmlDirectories (ownerId) {
    const rows = this.database.prepare(`
      SELECT id FROM kml_directories WHERE owner_id = ? ORDER BY position, id
    `).all(ownerId)
    const update = this.database.prepare('UPDATE kml_directories SET position = ? WHERE id = ?')
    rows.forEach((row, index) => update.run(index, row.id))
  }

  reindexKmlDirectoryOrder (ownerId, directoryId, options = {}) {
    const normalizedDirectoryId = directoryId || null
    const rows = this.database.prepare(`
      SELECT id, position
      FROM kml_documents
      WHERE owner_id = ? AND directory_id IS ? AND status = 'active'
      ORDER BY position, id
    `).all(ownerId, normalizedDirectoryId)
    const now = options.now || this.nowIso()
    const touchRevision = options.touchRevision === true
    const update = this.database.prepare(`
      UPDATE kml_documents
      SET position = ?,
          updated_at = ?,
          revision = revision + ?
      WHERE id = ? AND owner_id = ? AND status = 'active'
    `)
    const changedIds = []
    rows.forEach((row, index) => {
      if (Number(row.position) === index) return
      update.run(index, now, touchRevision ? 1 : 0, row.id, ownerId)
      changedIds.push(row.id)
    })
    return changedIds
  }

  reorderKmlDirectories (actor, input = {}) {
    this.assertPermission(actor, 'kml.own.write')
    requireObject(input)
    const ownerId = this.actorUser(actor).id
    const ids = Array.isArray(input.ids) ? input.ids.map(normalizeKmlDirectoryId) : null
    if (!ids || ids.some(id => !id) || new Set(ids).size !== ids.length) {
      throw createHttpError('KML 目录顺序格式不正确', 400, 'KML_REORDER_INVALID')
    }
    const current = this.database.prepare(`
      SELECT id FROM kml_directories WHERE owner_id = ? ORDER BY position, id
    `).all(ownerId).map(row => row.id)
    if (ids.length !== current.length || ids.some(id => !current.includes(id))) {
      throw createHttpError('必须提交当前用户的完整目录顺序', 409, 'KML_REORDER_INVALID')
    }
    const now = this.nowIso()
    const update = this.database.prepare('UPDATE kml_directories SET position = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    this.database.transaction(() => ids.forEach((id, index) => update.run(index, now, id, ownerId)))
    return this.listKmlDirectories(actor)
  }

  setKmlDirectoryVisibility (actor, directoryId, enabled) {
    this.assertPermission(actor, 'kml.own.write')
    const ownerId = this.actorUser(actor).id
    const normalizedEnabled = normalizeBoolean(enabled)
    const id = normalizeKmlDirectoryId(directoryId)
    if (id) this.requireOwnedKmlDirectory(actor, id)
    const rows = this.database.prepare(`
      SELECT id FROM kml_documents
      WHERE owner_id = ? AND directory_id IS ? AND status = 'active' AND enabled <> ?
    `).all(ownerId, id, normalizedEnabled ? 1 : 0)
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE kml_documents
        SET enabled = ?, revision = revision + 1, updated_at = ?
        WHERE owner_id = ? AND directory_id IS ? AND status = 'active' AND enabled <> ?
      `).run(normalizedEnabled ? 1 : 0, now, ownerId, id, normalizedEnabled ? 1 : 0)
      if (id) {
        this.database.prepare('UPDATE kml_directories SET enabled = ?, updated_at = ? WHERE id = ?')
          .run(normalizedEnabled ? 1 : 0, now, id)
      }
      rows.forEach(row => this.revalidateSharesForKml(row.id))
    })
    return {
      directoryId: id,
      enabled: normalizedEnabled,
      affectedFileCount: rows.length,
      documents: rows.map(row => this.kmlViewFromRow(
        this.database.prepare('SELECT * FROM kml_documents WHERE id = ?').get(row.id)
      )),
    }
  }

  kmlIdsInDirectory (ownerId, directoryId) {
    return this.database.prepare(`
      SELECT id FROM kml_documents
      WHERE owner_id = ? AND directory_id IS ? AND status = 'active'
      ORDER BY position, id
    `).all(ownerId, directoryId).map(row => row.id)
  }

  writeKmlDirectoryOrder (ownerId, directoryId, ids, options = {}) {
    const excludedId = options.excludeId ? String(options.excludeId) : ''
    const update = this.database.prepare(`
      UPDATE kml_documents
      SET directory_id = ?, position = ?,
          revision = revision + CASE WHEN id = ? THEN 0 ELSE 1 END,
          updated_at = ?
      WHERE id = ? AND owner_id = ?
        AND NOT (directory_id IS ? AND position = ?)
    `)
    const now = this.nowIso()
    const changedIds = []
    ids.forEach((id, index) => {
      const result = update.run(directoryId, index, excludedId, now, id, ownerId, directoryId, index)
      if (Number(result.changes) === 1) changedIds.push(id)
    })
    return changedIds
  }

  reorderKmlFiles (actor, input = {}) {
    this.assertPermission(actor, 'kml.own.write')
    requireObject(input)
    const ownerId = this.actorUser(actor).id
    const directoryId = this.assertOwnedDirectoryId(actor, input.directoryId)
    const ids = Array.isArray(input.ids) ? input.ids.map(id => String(id || '')) : null
    if (!ids || ids.some(id => !id) || new Set(ids).size !== ids.length) {
      throw createHttpError('KML 文件顺序格式不正确', 400, 'KML_REORDER_INVALID')
    }
    const current = this.kmlIdsInDirectory(ownerId, directoryId)
    if (ids.length !== current.length || ids.some(id => !current.includes(id))) {
      throw createHttpError('必须提交目标目录的完整 KML 文件顺序', 409, 'KML_REORDER_INVALID')
    }
    const changedIds = this.database.transaction(() => this.writeKmlDirectoryOrder(ownerId, directoryId, ids))
    return {
      directoryId,
      ids,
      documents: changedIds.map(id => this.kmlViewFromRow(
        this.database.prepare('SELECT * FROM kml_documents WHERE id = ?').get(id)
      )),
    }
  }

  moveKmlFile (actor, kmlId, input = {}) {
    this.assertPermission(actor, 'kml.own.write')
    requireObject(input)
    const row = this.requireKmlAccess(actor, kmlId, 'write')
    if (row.status !== 'active') throw createHttpError('回收站中的 KML 不能移动目录', 409, 'KML_MOVE_INVALID')
    const targetDirectoryId = this.assertOwnedDirectoryId(actor, input.directoryId)
    const sourceDirectoryId = row.directory_id || null
    const sourceIds = this.kmlIdsInDirectory(row.owner_id, sourceDirectoryId).filter(id => id !== row.id)
    const targetIds = sourceDirectoryId === targetDirectoryId
      ? sourceIds
      : this.kmlIdsInDirectory(row.owner_id, targetDirectoryId).filter(id => id !== row.id)
    const beforeId = input.beforeId === undefined || input.beforeId === null || input.beforeId === ''
      ? null
      : String(input.beforeId)
    let insertionIndex = targetIds.length
    if (beforeId) {
      insertionIndex = targetIds.indexOf(beforeId)
      if (insertionIndex < 0) throw createHttpError('目标插入位置不属于指定目录', 409, 'KML_MOVE_INVALID')
    }
    targetIds.splice(insertionIndex, 0, row.id)
    const changedIds = this.database.transaction(() => {
      const changed = []
      if (sourceDirectoryId !== targetDirectoryId) changed.push(...this.writeKmlDirectoryOrder(row.owner_id, sourceDirectoryId, sourceIds))
      changed.push(...this.writeKmlDirectoryOrder(row.owner_id, targetDirectoryId, targetIds))
      return [...new Set(changed)]
    })
    return {
      ...this.getKml(actor, row.id),
      affectedDocuments: changedIds.map(id => this.kmlViewFromRow(
        this.database.prepare('SELECT * FROM kml_documents WHERE id = ?').get(id)
      )),
    }
  }

  batchMoveKmlFiles (actor, input = {}) {
    this.assertPermission(actor, 'kml.own.write')
    requireObject(input)
    if (!Array.isArray(input.ids) || input.ids.length === 0 || input.ids.some(id => typeof id !== 'string')) {
      throw createHttpError('KML 文件 ID 列表格式不正确', 400, 'KML_MOVE_INVALID')
    }
    let ids
    try {
      ids = input.ids.map(id => normalizeText(id, {
        minLength: 1,
        maxLength: 160,
        message: 'KML 文件 ID 格式不正确',
      }))
    } catch {
      throw createHttpError('KML 文件 ID 列表格式不正确', 400, 'KML_MOVE_INVALID')
    }
    if (new Set(ids).size !== ids.length) {
      throw createHttpError('KML 文件 ID 不能重复', 400, 'KML_MOVE_INVALID')
    }

    const ownerId = this.actorUser(actor).id
    return this.database.transaction(() => {
      const targetDirectoryId = this.assertOwnedDirectoryId(actor, input.directoryId)
      const select = this.database.prepare('SELECT * FROM kml_documents WHERE id = ? AND owner_id = ?')
      const rows = ids.map(id => {
        const row = select.get(id, ownerId)
        if (!row) throw createHttpError('资源不存在', 404, 'RESOURCE_NOT_FOUND')
        if (row.status !== 'active') {
          throw createHttpError('回收站中的 KML 不能移动目录', 409, 'KML_MOVE_INVALID')
        }
        return row
      })
      const skippedIds = rows
        .filter(row => (row.directory_id || null) === targetDirectoryId)
        .map(row => row.id)
      const movedRows = rows.filter(row => (row.directory_id || null) !== targetDirectoryId)
      const movedIds = movedRows.map(row => row.id)
      if (!movedIds.length) {
        return {
          directoryId: targetDirectoryId,
          movedIds,
          skippedIds,
          movedCount: 0,
          skippedCount: skippedIds.length,
          documents: [],
          affectedDocuments: [],
        }
      }

      const movedSet = new Set(movedIds)
      const changedIds = []
      const sourceDirectoryIds = [...new Set(movedRows
        .map(row => row.directory_id || null)
        .filter(directoryId => directoryId !== targetDirectoryId))]
      sourceDirectoryIds.forEach(directoryId => {
        const remainingIds = this.kmlIdsInDirectory(ownerId, directoryId)
          .filter(id => !movedSet.has(id))
        changedIds.push(...this.writeKmlDirectoryOrder(ownerId, directoryId, remainingIds))
      })
      const targetIds = this.kmlIdsInDirectory(ownerId, targetDirectoryId)
        .filter(id => !movedSet.has(id))
      targetIds.push(...movedIds)
      changedIds.push(...this.writeKmlDirectoryOrder(ownerId, targetDirectoryId, targetIds))

      const uniqueChangedIds = [...new Set(changedIds)]
      const view = id => this.kmlViewFromRow(
        this.database.prepare('SELECT * FROM kml_documents WHERE id = ?').get(id)
      )
      return {
        directoryId: targetDirectoryId,
        movedIds,
        skippedIds,
        movedCount: movedIds.length,
        skippedCount: skippedIds.length,
        documents: movedIds.map(view),
        affectedDocuments: uniqueChangedIds.map(view),
      }
    })
  }

  kmlViewFromRow (row, options = {}) {
    if (!row) return null
    const includeFeatures = options.includeFeatures === true
    const features = includeFeatures ? parseJson(row.features_json, []) : null
    const storedBounds = normalizeKmlBounds(
      parseJson(row.bounds_json, null),
      { featureCount: Number(row.feature_count || 0) },
    )
    const result = {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description,
      isDefault: Boolean(row.is_default),
      status: row.status,
      coordCorrection: row.coord_correction,
      theme: row.theme,
      color: row.color,
      lockDrag: Boolean(row.lock_drag),
      enabled: Boolean(row.enabled),
      isLiveTrack: Boolean(row.is_live_track),
      featureCount: Number(row.feature_count),
      bounds: storedBounds || (includeFeatures ? computeKmlBounds(features) : null),
      byteSize: Number(row.byte_size),
      revision: Number(row.revision),
      sourceType: row.source_type,
      shareReferenceCount: this.shareReferenceCount(row.id),
      outdatedShareReferenceCount: this.outdatedShareReferenceCount(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at || null,
      directoryId: row.directory_id || null,
      directoryName: row.directory_id
        ? String(this.database.prepare('SELECT name FROM kml_directories WHERE id = ?').get(row.directory_id)?.name || '')
        : '',
      position: Number(row.position || 0),
    }
    if (row.sync_client_id) result.syncClientId = row.sync_client_id
    if (includeFeatures) result.features = features
    return result
  }

  requireKmlAccess (actor, kmlId, mode = 'read') {
    const actorUser = this.actorUser(actor)
    const row = this.database.prepare('SELECT * FROM kml_documents WHERE id = ?').get(String(kmlId || ''))
    if (!row) throw createHttpError('资源不存在', 404, 'RESOURCE_NOT_FOUND')
    const ownAllowed = mode === 'read'
      ? this.hasPermission(actor, 'kml.own.read') || this.hasPermission(actor, 'kml.own.write')
      : this.hasPermission(actor, 'kml.own.write')
    const anyAllowed = mode === 'read'
      ? this.hasPermission(actor, 'kml.any.read') || this.hasPermission(actor, 'kml.any.manage')
      : this.hasPermission(actor, 'kml.any.manage')
    if (row.owner_id === actorUser.id) {
      if (!ownAllowed && !anyAllowed) {
        throw createHttpError('没有执行此操作的权限', 403, 'PERMISSION_DENIED')
      }
    } else if (!anyAllowed) {
      throw createHttpError('资源不存在', 404, 'RESOURCE_NOT_FOUND')
    }
    if (row.owner_id !== actorUser.id) {
      this.insertAudit({
        actorUserId: actorUser.id,
        action: `admin.kml.${mode}`,
        targetType: 'kml',
        targetId: row.id,
        metadata: { ownerId: row.owner_id },
      })
    }
    return row
  }

  ensureDefaultKmlForOwner (ownerId) {
    const existing = this.database.prepare(`
      SELECT * FROM kml_documents
      WHERE owner_id = ? AND is_default = 1 AND status = 'active'
    `).get(ownerId)
    if (existing) return this.kmlViewFromRow(existing, { includeFeatures: true })
    return this.database.transaction(() => {
      const repeated = this.database.prepare(`
        SELECT * FROM kml_documents
        WHERE owner_id = ? AND is_default = 1 AND status = 'active'
      `).get(ownerId)
      if (repeated) return this.kmlViewFromRow(repeated, { includeFeatures: true })
      return this.createKmlForOwner(ownerId, {
        name: '默认标注',
        isDefault: true,
        features: [],
      }, { skipDefaultCheck: true })
    })
  }

  ensureDefaultKml (actor) {
    this.assertPermission(actor, 'kml.own.write')
    return this.ensureDefaultKmlForOwner(this.actorUser(actor).id)
  }

  createKmlForOwner (ownerId, input = {}, options = {}) {
    const syncClientId = options.syncClientId
      ? normalizeSyncClientId(options.syncClientId)
      : null
    if (syncClientId) {
      const createKey = this.database.prepare(`
        SELECT kml_id FROM kml_sync_create_keys
        WHERE owner_id = ? AND client_id = ?
      `).get(ownerId, syncClientId)
      if (createKey) {
        const existing = this.database.prepare(`
          SELECT * FROM kml_documents WHERE id = ? AND owner_id = ?
        `).get(createKey.kml_id, ownerId)
        if (existing) return this.kmlViewFromRow(existing, { includeFeatures: true })
        throw createHttpError(
          '该同步创建操作对应的 KML 已永久删除，请使用新的 clientId 明确创建副本',
          409,
          'KML_CREATE_REPLAY_DELETED'
        )
      }
      const deleteTombstone = this.database.prepare(`
        SELECT 1 FROM kml_sync_delete_tombstones
        WHERE owner_id = ? AND client_id = ?
      `).get(ownerId, syncClientId)
      if (deleteTombstone) {
        throw createHttpError(
          '该同步创建操作已被删除请求撤销，请使用新的 clientId 明确创建副本',
          409,
          'KML_CREATE_REPLAY_DELETED'
        )
      }
    }
    const normalized = normalizeKmlInput(input)
    const directoryId = normalizeKmlDirectoryId(input.directoryId)
    if (directoryId && !this.database.prepare(`
      SELECT 1 FROM kml_directories WHERE id = ? AND owner_id = ?
    `).get(directoryId, ownerId)) {
      throw createHttpError('KML 目录不存在', 404, 'KML_DIRECTORY_NOT_FOUND')
    }
    const sourceType = normalizeEnum(input.sourceType, KML_SOURCE_TYPES, options.sourceType || 'created', 'KML 来源类型不正确')
    this.validateResourceCollectionReferences(ownerId, normalized.features, { allowUnresolved: sourceType === 'imported' || sourceType === 'migrated' })
    const isDefault = Boolean(input.isDefault)
    const now = this.nowIso()
    const id = randomId('kml')
    this.database.transaction(() => {
      this.assertKmlQuota(ownerId, normalized, null, options.sourceByteSize)
      // Positions are scoped to active files. Recycle-bin rows must never
      // consume an insertion slot or leave gaps in the visible order.
      const position = Number(this.database.prepare(`
        SELECT COUNT(*) AS count
        FROM kml_documents
        WHERE owner_id = ? AND directory_id IS ? AND status = 'active'
      `).get(ownerId, directoryId)?.count || 0)
      this.reindexKmlDirectoryOrder(ownerId, directoryId, { now, touchRevision: false })
      if (isDefault) {
        this.database.prepare(`UPDATE kml_documents SET is_default = 0 WHERE owner_id = ?`).run(ownerId)
      }
      this.database.prepare(`
        INSERT INTO kml_documents(
          id, owner_id, name, description, is_default, status,
          coord_correction, theme, color, lock_drag, enabled, is_live_track,
          features_json, feature_count, bounds_json, byte_size, revision, source_type,
          sync_client_id, directory_id, position, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        ownerId,
        normalized.name,
        normalized.description,
        isDefault ? 1 : 0,
        normalized.coordCorrection,
        normalized.theme,
        normalized.color,
        normalized.lockDrag ? 1 : 0,
        normalized.enabled ? 1 : 0,
        normalized.isLiveTrack ? 1 : 0,
        JSON.stringify(normalized.features),
        normalized.featureCount,
        JSON.stringify(normalized.bounds),
        normalized.byteSize,
        sourceType,
        syncClientId,
        directoryId,
        position,
        now,
        now
      )
      if (syncClientId) {
        this.database.prepare(`
          INSERT INTO kml_sync_create_keys(
            owner_id, client_id, kml_id, created_at, deleted_at
          ) VALUES (?, ?, ?, ?, NULL)
        `).run(ownerId, syncClientId, id, now)
      }
      this.syncResourceCollectionBindings(id, normalized.features)
    })
    return this.kmlViewFromRow(this.database.prepare('SELECT * FROM kml_documents WHERE id = ?').get(id), { includeFeatures: true })
  }

  createKml (actor, input = {}, options = {}) {
    this.assertPermission(actor, 'kml.own.write')
    const ownerId = this.actorUser(actor).id
    if (!options.skipEnsureDefault) this.ensureDefaultKmlForOwner(ownerId)
    return this.createKmlForOwner(ownerId, input, options)
  }

  getKmlBySyncClientId (actor, clientId) {
    this.assertPermission(actor, 'kml.own.write')
    const ownerId = this.actorUser(actor).id
    const normalizedClientId = normalizeSyncClientId(clientId)
    const row = this.database.prepare(`
      SELECT d.*, k.deleted_at AS sync_deleted_at
      FROM kml_sync_create_keys k
      LEFT JOIN kml_documents d ON d.id = k.kml_id AND d.owner_id = k.owner_id
      WHERE k.owner_id = ? AND k.client_id = ?
    `).get(ownerId, normalizedClientId)
    if (!row) return null
    if (row.sync_deleted_at || !row.id) {
      throw createHttpError(
        '该同步创建操作对应的 KML 已永久删除，请使用新的 clientId 明确创建副本',
        409,
        'KML_CREATE_REPLAY_DELETED'
      )
    }
    return this.kmlViewFromRow(row, { includeFeatures: true })
  }

  listKml (actor, input = {}) {
    this.assertPermission(actor, 'kml.own.read')
    const ownerId = this.actorUser(actor).id
    if (this.hasPermission(actor, 'kml.own.write')) this.ensureDefaultKmlForOwner(ownerId)
    const { page, limit } = normalizePage(input)
    const status = String(input.status || 'active')
    if (!['active', 'trashed', 'all'].includes(status)) {
      throw createHttpError('KML 状态筛选值不正确', 400, 'VALIDATION_FAILED')
    }
    const sortMap = {
      updatedAt: 'updated_at',
      createdAt: 'created_at',
      name: 'name',
      featureCount: 'feature_count',
      position: 'position',
    }
    if (input.sort !== undefined && !Object.hasOwn(sortMap, input.sort)) {
      throw createHttpError('KML 排序字段不正确', 400, 'VALIDATION_FAILED')
    }
    const sort = sortMap[input.sort] || sortMap.updatedAt
    const order = normalizeOrder(input.order).toUpperCase()
    const where = ['owner_id = ?']
    const params = [ownerId]
    if (status !== 'all') {
      where.push('status = ?')
      params.push(status)
    }
    if (input.search) {
      where.push("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')")
      const search = `%${String(input.search).slice(0, 200)}%`
      params.push(search, search)
    }
    if (input.directoryId !== undefined) {
      const directoryId = normalizeKmlDirectoryId(input.directoryId)
      if (directoryId) this.requireOwnedKmlDirectory(actor, directoryId)
      where.push('directory_id IS ?')
      params.push(directoryId)
    }
    if (input.updatedAfter) {
      const parsed = normalizeExpiresAt(input.updatedAfter)
      where.push('updated_at >= ?')
      params.push(parsed)
    }
    if (input.updatedBefore) {
      const parsed = normalizeExpiresAt(input.updatedBefore)
      where.push('updated_at <= ?')
      params.push(parsed)
    }
    const clause = where.join(' AND ')
    const total = Number(this.database.prepare(`SELECT COUNT(*) AS count FROM kml_documents WHERE ${clause}`).get(...params)?.count || 0)
    const rows = this.database.prepare(`
      SELECT * FROM kml_documents WHERE ${clause}
      ORDER BY is_default DESC, ${sort} ${order}, id ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit)
    return {
      items: rows.map(row => this.kmlViewFromRow(row)),
      page,
      limit,
      total,
      usage: this.getKmlUsage(actor),
    }
  }

  listKmlFiles (actor, input = {}) {
    return this.listKml(actor, input)
  }

  resourceCollectionView (row, options = {}) {
    if (!row) return null
    const collectionRevision = Number(row.revision || 1)
    const itemsRevision = Number(row.items_revision || 1)
    if (options.public === true) {
      return {
        id: row.id,
        name: row.name,
        viewMode: row.view_mode,
        itemCount: Number(row.item_count || 0),
        byteSize: Number(row.byte_size || 0),
        collectionRevision,
        itemsRevision,
        // Keep the historical field as an alias for clients that only know
        // one revision, while exposing the two independent clocks explicitly.
        revision: collectionRevision,
        updatedAt: row.updated_at,
      }
    }
    const result = {
      id: row.id,
      name: row.name,
      description: row.description || '',
      visibility: row.visibility,
      status: row.status,
      viewMode: row.view_mode,
      isPublic: row.visibility === 'public',
      itemCount: Number(row.item_count || 0),
      byteSize: Number(row.byte_size || 0),
      collectionRevision,
      itemsRevision,
      revision: collectionRevision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at || null,
    }
    const references = this.resourceCollectionReferenceStats(row.id)
    result.referenceCount = references.referenceCount
    result.publicReferenceCount = references.publicReferenceCount
    if (options.includeItems) result.items = this.listResourceCollectionItems({ user: { id: row.owner_id, permissions: ['resource_collection.own.read'] } }, row.id, options)
    return result
  }

  resourceCollectionReferenceStats (collectionId) {
    const referenceCount = Number(this.database.prepare("SELECT COUNT(*) AS count FROM resource_collection_bindings WHERE collection_id=? AND status='active'").get(collectionId)?.count || 0)
    const visibility = this.database.prepare('SELECT visibility FROM resource_collections WHERE id=?').get(collectionId)?.visibility
    return { referenceCount, publicReferenceCount: visibility === 'public' ? referenceCount : 0 }
  }

  resourceCollectionHasLiveReference (collectionId) {
    const bindings = this.database.prepare(`
      SELECT * FROM resource_collection_bindings
      WHERE collection_id=?
    `).all(String(collectionId || ''))
    for (const binding of bindings) {
      // Binding status is a derived index. Check the source payload as well so
      // a collection moved to the recycle bin cannot be deleted while a KML
      // or published snapshot still contains the reference.
      if (this.resourceCollectionBindingSource(binding).matches) return true
    }
    return false
  }

  syncResourceCollectionBindings (kmlId, features) {
    const now = this.nowIso()
    const refs = []
    for (const feature of Array.isArray(features) ? features : []) {
      const ref = tryNormalizeKmlResourceCollectionRef(feature?.resourceCollectionRef)
      if (ref.value?.sourceType === 'personal') refs.push({ collectionId: ref.value.collectionId, featureId: feature.id })
    }
    this.database.prepare("UPDATE resource_collection_bindings SET status='stale',updated_at=? WHERE kml_id=? AND source_scope='owner_kml' AND status='active'").run(now, kmlId)
    for (const ref of refs) {
      // Imported/migrated KML may intentionally retain an unresolved personal
      // reference. The binding table is a derived index with a foreign key;
      // skip missing or trashed collections instead of rejecting the KML write.
      const collection = this.database.prepare("SELECT status FROM resource_collections WHERE id=?").get(ref.collectionId)
      if (!collection || collection.status !== 'active') continue
      this.database.prepare(`
        INSERT INTO resource_collection_bindings(
          id,collection_id,kml_id,feature_id,source_scope,status,created_at,updated_at
        ) VALUES (?,?,?,?,'owner_kml','active',?,?)
        ON CONFLICT(collection_id,kml_id,feature_id,source_scope)
        DO UPDATE SET status='active',updated_at=?
      `).run(randomId('rcb'), ref.collectionId, kmlId, String(ref.featureId || ''), now, now, now)
    }
  }

  markPublishedResourceCollectionBindingsStale (shareId) {
    const itemIds = this.database.prepare('SELECT id FROM kml_share_items WHERE share_id=?').all(shareId).map(row => String(row.id))
    if (!itemIds.length) return
    const now = this.nowIso()
    const update = this.database.prepare("UPDATE resource_collection_bindings SET status='stale',updated_at=? WHERE source_scope='published_share' AND status='active' AND feature_id LIKE ?")
    itemIds.forEach(itemId => update.run(now, `${itemId}::%`))
  }

  syncPublishedResourceCollectionBindings (shareId, items) {
    const now = this.nowIso()
    for (const item of Array.isArray(items) ? items : []) {
      const itemId = String(item.id || '')
      if (!itemId) continue
      const features = Array.isArray(item.publishedSnapshot?.features)
        ? item.publishedSnapshot.features
        : Array.isArray(item.features) ? item.features : []
      for (const feature of features) {
        const ref = tryNormalizeKmlResourceCollectionRef(feature?.resourceCollectionRef)
        if (ref.value?.sourceType !== 'personal') continue
        const collection = this.database.prepare("SELECT status FROM resource_collections WHERE id=?").get(ref.value.collectionId)
        if (!collection || collection.status !== 'active') continue
        const featureId = `${itemId}::${String(feature.id || '')}`
        if (featureId.length > 320) continue
        this.database.prepare(`
          INSERT INTO resource_collection_bindings(
            id,collection_id,kml_id,feature_id,source_scope,status,created_at,updated_at
          ) VALUES (?,?,?,?,'published_share','active',?,?)
          ON CONFLICT(collection_id,kml_id,feature_id,source_scope)
          DO UPDATE SET status='active',updated_at=?
        `).run(randomId('rcb'), ref.value.collectionId, String(item.kmlId || ''), featureId, now, now, now)
      }
    }
  }

  normalizeResourceItem (input = {}, current = {}) {
    const result = tryNormalizeKmlResourceCollection({
      version: 1,
      viewMode: 'grid',
      items: [{
        title: input.title ?? current.title ?? '',
        url: input.url ?? current.url ?? '',
        type: input.type ?? current.type ?? 'auto',
        coverUrl: input.coverUrl ?? current.coverUrl ?? current.cover_url ?? '',
      }],
    })
    if (!result.value) throw createHttpError(result.error?.message || '资源项格式不正确', 400, 'RESOURCE_COLLECTION_ITEM_INVALID')
    const item = result.value.items[0]
    return { title: item.title, url: item.url, type: item.type, coverUrl: item.coverUrl || '' }
  }

  resourceCollectionSettings () {
    return normalizeResourceCollectionRuntimeSettings(
      this.getSettings().resourceCollection,
      DEFAULT_SETTINGS.resourceCollection,
    )
  }

  collectionPage (input = {}, fallbackLimit = 40) {
    const rawPage = input.page === undefined ? 1 : Number(input.page)
    const rawLimit = input.limit === undefined ? fallbackLimit : Number(input.limit)
    if (!Number.isSafeInteger(rawPage) || rawPage < 1 || !Number.isSafeInteger(rawLimit) || rawLimit < 1) {
      throw createHttpError('资源集合分页参数不正确', 400, 'VALIDATION_FAILED')
    }
    return { page: Math.min(rawPage, 1000000), limit: Math.min(rawLimit, 100) }
  }

  collectionItemsFromRows (rows) {
    return rows.map(row => ({
      id: row.id,
      position: Number(row.position),
      title: row.title,
      url: row.url,
      type: row.type,
      coverUrl: row.cover_url ?? row.coverUrl ?? '',
      createdAt: row.created_at ?? row.createdAt,
      updatedAt: row.updated_at ?? row.updatedAt,
    }))
  }

  collectionByteSize (items, viewMode = 'grid') {
    return Buffer.byteLength(JSON.stringify({ version: 1, viewMode, items }), 'utf8')
  }

  assertResourceCollectionCapacity (ownerId, collectionId, itemCount, byteSize, options = {}) {
    const settings = this.resourceCollectionSettings()
    const maxItems = Math.min(settings.maxItemsPerCollection, 1000000)
    if (itemCount > maxItems) {
      throw createHttpError(`资源集合最多包含 ${maxItems} 项`, 409, 'RESOURCE_COLLECTION_QUOTA_EXCEEDED')
    }
    const maxBytes = settings.maxCollectionBytesPerUser
    if (byteSize > maxBytes) {
      throw createHttpError('资源集合数据超过每用户容量限制', 409, 'RESOURCE_COLLECTION_QUOTA_EXCEEDED')
    }
    const otherBytes = Number(this.database.prepare(`
      SELECT COALESCE(SUM(byte_size), 0) AS bytes
      FROM resource_collections
      WHERE owner_id = ? AND status = 'active' AND id <> ?
    `).get(ownerId, collectionId || '')?.bytes || 0)
    if (otherBytes + byteSize > maxBytes) {
      throw createHttpError('资源集合数据超过每用户容量限制', 409, 'RESOURCE_COLLECTION_QUOTA_EXCEEDED')
    }
    if (options.transportBytes !== undefined && Number(options.transportBytes) > RESOURCE_COLLECTION_EXPORT_MAX_BYTES) {
      throw createHttpError('资源集合请求超过安全大小限制', 413, 'RESOURCE_COLLECTION_PAYLOAD_TOO_LARGE')
    }
  }

  normalizeInitialCollectionItems (value) {
    if (value === undefined) return []
    if (!Array.isArray(value)) throw createHttpError('资源集合 items 必须是数组', 400, 'RESOURCE_COLLECTION_ITEM_INVALID')
    const settings = this.resourceCollectionSettings()
    if (value.length > settings.maxItemsPerCollection || value.length > 1000000) {
      throw createHttpError('资源集合项数超过配额', 409, 'RESOURCE_COLLECTION_QUOTA_EXCEEDED')
    }
    const seen = new Set()
    return value.map((raw, index) => {
      const item = this.normalizeResourceItem(raw)
      if (seen.has(item.url)) throw createHttpError(`第 ${index + 1} 项与已有资源地址重复`, 409, 'RESOURCE_COLLECTION_DUPLICATE_URL')
      seen.add(item.url)
      return { ...item, id: randomId('rci'), position: index }
    })
  }

  listResourceCollections (actor, input = {}) {
    this.assertPermission(actor, 'resource_collection.own.read')
    const ownerId = this.actorUser(actor).id
    const query = normalizeResourceCollectionListQuery(input)
    const where = ['owner_id = ?']
    const params = [ownerId]
    if (query.status !== 'all') { where.push('status = ?'); params.push(query.status) }
    if (query.visibility !== 'all') { where.push('visibility = ?'); params.push(query.visibility) }
    if (query.search) {
      where.push("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')")
      const search = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`
      params.push(search, search)
    }
    const clause = where.join(' AND ')
    const total = Number(this.database.prepare(`SELECT COUNT(*) AS count FROM resource_collections WHERE ${clause}`).get(...params)?.count || 0)
    const sortColumn = RESOURCE_COLLECTION_SORT_FIELDS[query.sort]
    const order = query.order.toUpperCase()
    const rows = this.database.prepare(`
      SELECT * FROM resource_collections WHERE ${clause}
      ORDER BY ${sortColumn} ${order}, id ASC
      LIMIT ? OFFSET ?
    `).all(...params, query.limit, (query.page - 1) * query.limit)
    return {
      items: rows.map(row => this.resourceCollectionView(row)),
      page: query.page,
      limit: query.limit,
      pageCount: Math.max(1, Math.ceil(total / query.limit)),
      total,
    }
  }

  createResourceCollection (actor, input = {}, context = {}) {
    this.assertPermission(actor, 'resource_collection.own.write')
    requireObject(input)
    const ownerId = this.actorUser(actor).id
    const name = normalizeText(input.name, { minLength: 1, maxLength: 200 })
    const description = sanitizeRichText(input.description || '', 5000)
    const visibility = input.visibility === undefined && input.isPublic === undefined
      ? 'private'
      : input.visibility === 'public' || input.isPublic === true ? 'public' : input.visibility === 'private' || input.isPublic === false ? 'private' : null
    if (!visibility) throw createHttpError('资源集合公开状态不正确', 400, 'VALIDATION_FAILED')
    const viewMode = input.viewMode === undefined ? 'grid' : String(input.viewMode)
    if (!['grid', 'list'].includes(viewMode)) throw createHttpError('资源集合视图不正确', 400, 'VALIDATION_FAILED')
    const items = this.normalizeInitialCollectionItems(input.items)
    const byteSize = this.collectionByteSize(items, viewMode)
    const settings = this.resourceCollectionSettings()
    const activeCount = Number(this.database.prepare("SELECT COUNT(*) AS count FROM resource_collections WHERE owner_id=? AND status='active'").get(ownerId)?.count || 0)
    if (activeCount >= settings.maxCollectionsPerUser) throw createHttpError('活动资源集合数量超过配额', 409, 'RESOURCE_COLLECTION_QUOTA_EXCEEDED')
    const id = randomId('rc')
    const now = this.nowIso()
    this.database.transaction(() => {
      this.assertResourceCollectionCapacity(ownerId, id, items.length, byteSize, { transportBytes: Buffer.byteLength(JSON.stringify(input), 'utf8') })
      this.database.prepare(`
        INSERT INTO resource_collections(
          id,owner_id,name,description,visibility,status,view_mode,
          revision,items_revision,item_count,byte_size,created_at,updated_at
        ) VALUES (?,?,?,?,?,'active','?',1,1,?,?,?,?)
      `.replace("'?'", '?')).run(id, ownerId, name, description, visibility, viewMode, items.length, byteSize, now, now)
      const insert = this.database.prepare(`
        INSERT INTO resource_collection_items(
          id,collection_id,position,title,url,type,cover_url,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?)
      `)
      items.forEach(item => insert.run(item.id, id, item.position, item.title, item.url, item.type, item.coverUrl, now, now))
      this.insertAudit({ actorUserId: ownerId, action: 'resource-collection.create', targetType: 'resource-collection', targetId: id, metadata: { itemCount: items.length, visibility }, ipSummary: context.ip })
    })
    return this.getResourceCollection(actor, id)
  }

  requireOwnedResourceCollection (actor, id, mode = 'read', options = {}) {
    this.assertPermission(actor, mode === 'read' ? 'resource_collection.own.read' : 'resource_collection.own.write')
    const ownerId = this.actorUser(actor).id
    const row = this.database.prepare('SELECT * FROM resource_collections WHERE id = ? AND owner_id = ?').get(String(id), ownerId)
    if (!row) throw createHttpError('资源集合不存在', 404, 'RESOURCE_NOT_FOUND')
    if (options.activeOnly && row.status !== 'active') throw createHttpError('资源集合已移入回收站', 409, 'RESOURCE_COLLECTION_TRASHED')
    return row
  }

  refreshResourceCollectionStats (id, now = this.nowIso(), options = {}) {
    const collection = this.database.prepare('SELECT owner_id,view_mode FROM resource_collections WHERE id=?').get(id)
    if (!collection) throw createHttpError('资源集合不存在', 404, 'RESOURCE_NOT_FOUND')
    const rows = this.database.prepare('SELECT id,position,title,url,type,cover_url AS coverUrl FROM resource_collection_items WHERE collection_id=? ORDER BY position,id').all(id)
    const byteSize = this.collectionByteSize(rows, collection.view_mode)
    if (options.validate !== false) this.assertResourceCollectionCapacity(collection.owner_id, id, rows.length, byteSize)
    this.database.prepare('UPDATE resource_collections SET item_count=?, byte_size=?, updated_at=? WHERE id=?').run(rows.length, byteSize, now, id)
    return { itemCount: rows.length, byteSize }
  }

  assertItemsRevision (row, input = {}) {
    const candidate = input.itemsRevision ?? input.items_revision ?? input.revision
    const revision = normalizeResourceCollectionRevision(candidate, { optional: true })
    if (revision !== null && revision !== Number(row.items_revision)) {
      throw createHttpError('资源集合项已被其他客户端更新，请重新加载', 409, 'RESOURCE_COLLECTION_REVISION_CONFLICT')
    }
    return revision
  }

  getResourceCollection (actor, id) { return this.resourceCollectionView(this.requireOwnedResourceCollection(actor, id, 'read')) }

  requireAdminResourceCollection (actor, id, mode = 'read') {
    this.assertPermission(actor, mode === 'read' ? 'resource_collection.any.read' : 'resource_collection.any.manage')
    const row = this.database.prepare('SELECT * FROM resource_collections WHERE id = ?').get(String(id || ''))
    if (!row) throw createHttpError('资源集合不存在', 404, 'RESOURCE_NOT_FOUND')
    return row
  }

  resourceCollectionAdminView (row) {
    if (!row) return null
    const owner = this.database.prepare(`
      SELECT id, username_display, display_name, status
      FROM users WHERE id = ?
    `).get(row.owner_id)
    const view = this.resourceCollectionView(row)
    view.owner = owner
      ? {
          id: owner.id,
          username: owner.username_display || '',
          displayName: owner.display_name || '',
          status: owner.status || 'unknown',
        }
      : { id: row.owner_id, username: '', displayName: '', status: 'missing' }
    view.ownerId = row.owner_id
    view.bindingSummary = this.database.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'stale' THEN 1 ELSE 0 END) AS stale,
        SUM(CASE WHEN status = 'trashed' THEN 1 ELSE 0 END) AS trashed,
        SUM(CASE WHEN status = 'missing' THEN 1 ELSE 0 END) AS missing
      FROM resource_collection_bindings WHERE collection_id = ?
    `).get(row.id) || {}
    view.bindingSummary = Object.fromEntries(Object.entries(view.bindingSummary).map(([key, value]) => [key, Number(value || 0)]))
    return view
  }

  listAdminResourceCollections (actor, input = {}) {
    this.assertPermission(actor, 'resource_collection.any.read')
    const query = normalizeResourceCollectionListQuery(input)
    const where = []
    const params = []
    if (input.ownerId !== undefined && input.ownerId !== '') {
      const ownerId = normalizeText(input.ownerId, { minLength: 1, maxLength: 160, message: '用户 ID 格式不正确' })
      where.push('c.owner_id = ?')
      params.push(ownerId)
    }
    if (query.status !== 'all') { where.push('c.status = ?'); params.push(query.status) }
    if (query.visibility !== 'all') { where.push('c.visibility = ?'); params.push(query.visibility) }
    if (query.search) {
      where.push("(c.name LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\')")
      const search = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`
      params.push(search, search)
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = Number(this.database.prepare(`SELECT COUNT(*) AS count FROM resource_collections c ${clause}`).get(...params)?.count || 0)
    const sortColumn = `c.${RESOURCE_COLLECTION_SORT_FIELDS[query.sort]}`
    const order = query.order.toUpperCase()
    const rows = this.database.prepare(`
      SELECT c.*, u.username_display AS owner_username, u.display_name AS owner_display_name, u.status AS owner_status
      FROM resource_collections c
      LEFT JOIN users u ON u.id = c.owner_id
      ${clause}
      ORDER BY ${sortColumn} ${order}, c.id ASC
      LIMIT ? OFFSET ?
    `).all(...params, query.limit, (query.page - 1) * query.limit)
    return {
      items: rows.map(row => this.resourceCollectionAdminView(row)),
      page: query.page,
      limit: query.limit,
      pageCount: Math.max(1, Math.ceil(total / query.limit)),
      total,
    }
  }

  getAdminResourceCollection (actor, id) {
    return this.resourceCollectionAdminView(this.requireAdminResourceCollection(actor, id, 'read'))
  }

  listAdminResourceCollectionItems (actor, id, input = {}) {
    const row = this.requireAdminResourceCollection(actor, id, 'read')
    const { page, limit } = this.collectionPage(input, 40)
    const total = Number(this.database.prepare('SELECT COUNT(*) AS count FROM resource_collection_items WHERE collection_id=?').get(row.id)?.count || 0)
    const rows = this.database.prepare(`
      SELECT id,position,title,url,type,cover_url,created_at,updated_at
      FROM resource_collection_items WHERE collection_id=?
      ORDER BY position,id LIMIT ? OFFSET ?
    `).all(row.id, limit, (page - 1) * limit)
    const pageCount = Math.max(1, Math.ceil(total / limit))
    return {
      collection: this.resourceCollectionAdminView(row),
      collectionId: row.id,
      items: this.collectionItemsFromRows(rows),
      page,
      limit,
      total,
      pageCount,
      hasNext: page < pageCount,
      collectionRevision: Number(row.revision || 1),
      itemsRevision: Number(row.items_revision || 1),
      // Read payloads use the historical `revision` alias for the collection
      // metadata clock. Item concurrency uses the explicit itemsRevision.
      revision: Number(row.revision || 1),
      updatedAt: row.updated_at,
    }
  }

  trashAdminResourceCollection (actor, id, context = {}) {
    const row = this.requireAdminResourceCollection(actor, id, 'manage')
    if (row.status === 'trashed') return this.resourceCollectionAdminView(row)
    const now = this.nowIso()
    this.database.transaction(() => {
      const result = this.database.prepare(`
        UPDATE resource_collections
        SET status='trashed', visibility='private', deleted_at=?, revision=revision+1, updated_at=?
        WHERE id=? AND status='active'
      `).run(now, now, row.id)
      if (Number(result.changes) !== 1) throw createHttpError('资源集合已被其他客户端更新，请重新加载', 409, 'RESOURCE_COLLECTION_REVISION_CONFLICT')
      this.database.prepare("UPDATE resource_collection_bindings SET status='trashed',updated_at=? WHERE collection_id=? AND status='active'").run(now, row.id)
      this.insertAudit({
        actorUserId: this.actorUser(actor).id,
        action: 'admin.resource-collection.trash',
        targetType: 'resource-collection',
        targetId: row.id,
        metadata: { ownerId: row.owner_id, visibilityBefore: row.visibility },
        ipSummary: context.ip,
      })
    })
    return this.resourceCollectionAdminView(this.database.prepare('SELECT * FROM resource_collections WHERE id=?').get(row.id))
  }

  restoreAdminResourceCollection (actor, id, context = {}) {
    const row = this.requireAdminResourceCollection(actor, id, 'manage')
    if (row.status === 'active') return this.resourceCollectionAdminView(row)
    const now = this.nowIso()
    const trashTimestamp = String(row.deleted_at || '')
    this.database.transaction(() => {
      const result = this.database.prepare(`
        UPDATE resource_collections
        SET status='active', visibility='private', deleted_at=NULL, revision=revision+1, updated_at=?
        WHERE id=? AND status='trashed'
      `).run(now, row.id)
      if (Number(result.changes) !== 1) throw createHttpError('资源集合已被其他客户端更新，请重新加载', 409, 'RESOURCE_COLLECTION_REVISION_CONFLICT')
      // Only revive bindings that this collection-trash operation marked. A
      // stale/trashed binding from an earlier repair must remain untouched.
      this.database.prepare("UPDATE resource_collection_bindings SET status='active',updated_at=? WHERE collection_id=? AND status='trashed' AND updated_at=?").run(now, row.id, trashTimestamp)
      this.insertAudit({
        actorUserId: this.actorUser(actor).id,
        action: 'admin.resource-collection.restore',
        targetType: 'resource-collection',
        targetId: row.id,
        metadata: { ownerId: row.owner_id },
        ipSummary: context.ip,
      })
    })
    return this.resourceCollectionAdminView(this.database.prepare('SELECT * FROM resource_collections WHERE id=?').get(row.id))
  }

  permanentlyDeleteAdminResourceCollection (actor, id, context = {}) {
    const row = this.requireAdminResourceCollection(actor, id, 'manage')
    if (row.status !== 'trashed') throw createHttpError('资源集合必须先移入回收站', 409, 'RESOURCE_COLLECTION_NOT_TRASHED')
    this.database.transaction(() => {
      // Keep the source-payload check and DELETE under the same SQLite write
      // lock. Otherwise a concurrent KML/share update can add a reference
      // after the check and before the destructive delete.
      const current = this.database.prepare('SELECT * FROM resource_collections WHERE id=?').get(row.id)
      if (!current) throw createHttpError('资源集合不存在', 404, 'RESOURCE_NOT_FOUND')
      if (current.status !== 'trashed') throw createHttpError('资源集合必须先移入回收站', 409, 'RESOURCE_COLLECTION_NOT_TRASHED')
      if (this.resourceCollectionHasLiveReference(current.id)) throw createHttpError('资源集合仍被 KML 或分享引用，请先解除绑定', 409, 'RESOURCE_COLLECTION_DELETE_REFERENCED')
      const result = this.database.prepare("DELETE FROM resource_collections WHERE id=? AND status='trashed'").run(current.id)
      if (Number(result.changes) !== 1) throw createHttpError('资源集合不存在', 404, 'RESOURCE_NOT_FOUND')
      this.insertAudit({
        actorUserId: this.actorUser(actor).id,
        action: 'admin.resource-collection.permanent-delete',
        targetType: 'resource-collection',
        targetId: current.id,
        metadata: { ownerId: current.owner_id, itemCount: current.item_count },
        ipSummary: context.ip,
      })
    })
    return { id: row.id, deleted: true, status: 'deleted' }
  }

  // Backward-compatible aliases for callers that use the "ForAdmin" naming.
  listResourceCollectionsForAdmin (actor, input = {}) { return this.listAdminResourceCollections(actor, input) }
  getResourceCollectionForAdmin (actor, id) { return this.getAdminResourceCollection(actor, id) }
  listResourceCollectionItemsForAdmin (actor, id, input = {}) { return this.listAdminResourceCollectionItems(actor, id, input) }
  trashResourceCollectionForAdmin (actor, id, context = {}) { return this.trashAdminResourceCollection(actor, id, context) }
  restoreResourceCollectionForAdmin (actor, id, context = {}) { return this.restoreAdminResourceCollection(actor, id, context) }
  permanentlyDeleteResourceCollectionForAdmin (actor, id, context = {}) { return this.permanentlyDeleteAdminResourceCollection(actor, id, context) }

  updateResourceCollection (actor, id, input = {}, context = {}) {
    const row = this.requireOwnedResourceCollection(actor, id, 'write', { activeOnly: true })
    requireObject(input)
    const revision = normalizeResourceCollectionRevision(input.revision)
    if (revision !== Number(row.revision)) throw createHttpError('资源集合已被其他客户端更新，请重新加载', 409, 'RESOURCE_COLLECTION_REVISION_CONFLICT')
    const name = normalizeText(input.name, { fallback: row.name, minLength: 1, maxLength: 200 })
    const description = sanitizeRichText(input.description ?? row.description, 5000)
    let visibility = row.visibility
    if (input.visibility !== undefined || input.isPublic !== undefined) {
      visibility = input.visibility === 'public' || input.isPublic === true ? 'public' : input.visibility === 'private' || input.isPublic === false ? 'private' : null
      if (!visibility) throw createHttpError('资源集合公开状态不正确', 400, 'VALIDATION_FAILED')
    }
    const viewMode = input.viewMode === undefined ? row.view_mode : String(input.viewMode)
    if (!['grid', 'list'].includes(viewMode)) throw createHttpError('资源集合视图不正确', 400, 'VALIDATION_FAILED')
    const now = this.nowIso()
    this.database.transaction(() => {
      const result = this.database.prepare(`
        UPDATE resource_collections
        SET name=?,description=?,visibility=?,view_mode=?,revision=revision+1,updated_at=?
        WHERE id=? AND owner_id=? AND status='active' AND revision=?
      `).run(name, description, visibility, viewMode, now, row.id, row.owner_id, revision)
      if (Number(result.changes) !== 1) throw createHttpError('资源集合已被其他客户端更新，请重新加载', 409, 'RESOURCE_COLLECTION_REVISION_CONFLICT')
      this.insertAudit({ actorUserId: row.owner_id, action: visibility !== row.visibility ? 'resource-collection.visibility.update' : 'resource-collection.update', targetType: 'resource-collection', targetId: row.id, metadata: { visibilityBefore: row.visibility, visibilityAfter: visibility }, ipSummary: context.ip })
    })
    return this.getResourceCollection(actor, id)
  }

  listResourceCollectionItems (actor, id, input = {}) {
    const row = this.requireOwnedResourceCollection(actor, id, 'read')
    const { page, limit } = this.collectionPage(input, 40)
    const total = Number(this.database.prepare('SELECT COUNT(*) AS count FROM resource_collection_items WHERE collection_id=?').get(row.id)?.count || 0)
    const rows = this.database.prepare(`
      SELECT id,position,title,url,type,cover_url,created_at,updated_at
      FROM resource_collection_items WHERE collection_id=?
      ORDER BY position,id LIMIT ? OFFSET ?
    `).all(row.id, limit, (page - 1) * limit)
    const collectionRevision = Number(row.revision || 1)
    const itemsRevision = Number(row.items_revision || 1)
    return {
      collectionId: row.id,
      items: this.collectionItemsFromRows(rows),
      page,
      limit,
      total,
      pageCount: Math.max(1, Math.ceil(total / limit)),
      hasNext: page < Math.max(1, Math.ceil(total / limit)),
      collectionRevision,
      itemsRevision,
      revision: collectionRevision,
      updatedAt: row.updated_at,
    }
  }

  listPublicResourceCollectionItems (row, input = {}) {
    const { page, limit } = this.collectionPage(input, 40)
    const total = Number(this.database.prepare('SELECT COUNT(*) AS count FROM resource_collection_items WHERE collection_id=?').get(row.id)?.count || 0)
    const rows = this.database.prepare(`
      SELECT id,position,title,url,type,cover_url,created_at,updated_at
      FROM resource_collection_items WHERE collection_id=?
      ORDER BY position,id LIMIT ? OFFSET ?
    `).all(row.id, limit, (page - 1) * limit)
    const pageCount = Math.max(1, Math.ceil(total / limit))
    return {
      sourceType: 'personal',
      collection: this.resourceCollectionView(row, { public: true }),
      items: this.collectionItemsFromRows(rows),
      pagination: { page, limit, total, pageCount, hasNext: page < pageCount },
      page,
      limit,
      total,
      pageCount,
      hasNext: page < pageCount,
      collectionRevision: Number(row.revision || 1),
      itemsRevision: Number(row.items_revision || 1),
      revision: Number(row.revision || 1),
      updatedAt: row.updated_at,
    }
  }

  getResourceCollectionItem (actor, id, itemId) {
    this.requireOwnedResourceCollection(actor, id, 'read')
    const row = this.database.prepare('SELECT id,position,title,url,type,cover_url,created_at,updated_at FROM resource_collection_items WHERE collection_id=? AND id=?').get(id, itemId)
    if (!row) throw createHttpError('资源项不存在', 404, 'RESOURCE_NOT_FOUND')
    return this.collectionItemsFromRows([row])[0]
  }

  createResourceCollectionItem (actor, id, input = {}, context = {}) {
    const collection = this.requireOwnedResourceCollection(actor, id, 'write', { activeOnly: true })
    const item = this.normalizeResourceItem(input)
    const now = this.nowIso()
    const itemId = randomId('rci')
    let result
    this.database.transaction(() => {
      const current = this.database.prepare('SELECT * FROM resource_collections WHERE id=? AND owner_id=? AND status=\'active\'').get(id, collection.owner_id)
      if (!current) throw createHttpError('资源集合不存在或已移入回收站', 409, 'RESOURCE_COLLECTION_TRASHED')
      this.assertItemsRevision(current, input)
      if (this.database.prepare('SELECT 1 FROM resource_collection_items WHERE collection_id=? AND url=? LIMIT 1').get(id, item.url)) throw createHttpError('资源集合中已存在相同地址', 409, 'RESOURCE_COLLECTION_DUPLICATE_URL')
      const existing = this.database.prepare('SELECT title,url,type,cover_url AS coverUrl FROM resource_collection_items WHERE collection_id=? ORDER BY position,id').all(id)
      const nextItems = [...existing, item]
      const byteSize = this.collectionByteSize(nextItems, current.view_mode)
      this.assertResourceCollectionCapacity(current.owner_id, id, nextItems.length, byteSize)
      const position = existing.length
      this.database.prepare('INSERT INTO resource_collection_items(id,collection_id,position,title,url,type,cover_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(itemId, id, position, item.title, item.url, item.type, item.coverUrl, now, now)
      const updated = this.database.prepare('UPDATE resource_collections SET items_revision=items_revision+1,revision=revision+1,item_count=?,byte_size=?,updated_at=? WHERE id=? AND items_revision=?').run(nextItems.length, byteSize, now, id, current.items_revision)
      if (Number(updated.changes) !== 1) throw createHttpError('资源集合项已被其他客户端更新，请重新加载', 409, 'RESOURCE_COLLECTION_REVISION_CONFLICT')
      this.insertAudit({ actorUserId: current.owner_id, action: 'resource-collection.item.create', targetType: 'resource-collection', targetId: id, metadata: { itemId }, ipSummary: context.ip })
      result = { ...item, id: itemId, position, collectionRevision: Number(current.revision) + 1, itemsRevision: Number(current.items_revision) + 1, revision: Number(current.items_revision) + 1 }
    })
    return result
  }

  updateResourceCollectionItem (actor, id, itemId, input = {}, context = {}) {
    const collection = this.requireOwnedResourceCollection(actor, id, 'write', { activeOnly: true })
    let result
    this.database.transaction(() => {
      const current = this.database.prepare('SELECT * FROM resource_collections WHERE id=? AND owner_id=? AND status=\'active\'').get(id, collection.owner_id)
      if (!current) throw createHttpError('资源集合不存在或已移入回收站', 409, 'RESOURCE_COLLECTION_TRASHED')
      this.assertItemsRevision(current, input)
      const row = this.database.prepare('SELECT * FROM resource_collection_items WHERE collection_id=? AND id=?').get(id, itemId)
      if (!row) throw createHttpError('资源项不存在', 404, 'RESOURCE_NOT_FOUND')
      const item = this.normalizeResourceItem(input, row)
      if (this.database.prepare('SELECT 1 FROM resource_collection_items WHERE collection_id=? AND url=? AND id<>? LIMIT 1').get(id, item.url, itemId)) throw createHttpError('资源集合中已存在相同地址', 409, 'RESOURCE_COLLECTION_DUPLICATE_URL')
      const rows = this.database.prepare('SELECT id,title,url,type,cover_url AS coverUrl FROM resource_collection_items WHERE collection_id=? ORDER BY position,id').all(id)
      const nextItems = rows.map(candidate => candidate.id === itemId ? { ...candidate, ...item } : candidate)
      const byteSize = this.collectionByteSize(nextItems, current.view_mode)
      this.assertResourceCollectionCapacity(current.owner_id, id, nextItems.length, byteSize)
      const now = this.nowIso()
      const updated = this.database.prepare('UPDATE resource_collection_items SET title=?,url=?,type=?,cover_url=?,updated_at=? WHERE collection_id=? AND id=?').run(item.title, item.url, item.type, item.coverUrl, now, id, itemId)
      if (Number(updated.changes) !== 1) throw createHttpError('资源项不存在', 404, 'RESOURCE_NOT_FOUND')
      const bumped = this.database.prepare('UPDATE resource_collections SET items_revision=items_revision+1,revision=revision+1,byte_size=?,updated_at=? WHERE id=? AND items_revision=?').run(byteSize, now, id, current.items_revision)
      if (Number(bumped.changes) !== 1) throw createHttpError('资源集合项已被其他客户端更新，请重新加载', 409, 'RESOURCE_COLLECTION_REVISION_CONFLICT')
      this.insertAudit({ actorUserId: current.owner_id, action: 'resource-collection.item.update', targetType: 'resource-collection', targetId: id, metadata: { itemId }, ipSummary: context.ip })
      result = { ...item, id: itemId, position: Number(row.position), collectionRevision: Number(current.revision) + 1, itemsRevision: Number(current.items_revision) + 1, revision: Number(current.items_revision) + 1 }
    })
    return result
  }

  deleteResourceCollectionItem (actor, id, itemId, input = {}, context = {}) {
    const collection = this.requireOwnedResourceCollection(actor, id, 'write', { activeOnly: true })
    let result
    this.database.transaction(() => {
      const current = this.database.prepare('SELECT * FROM resource_collections WHERE id=? AND owner_id=? AND status=\'active\'').get(id, collection.owner_id)
      if (!current) throw createHttpError('资源集合不存在或已移入回收站', 409, 'RESOURCE_COLLECTION_TRASHED')
      this.assertItemsRevision(current, input)
      const deleted = this.database.prepare('DELETE FROM resource_collection_items WHERE collection_id=? AND id=?').run(id, itemId)
      if (!deleted.changes) throw createHttpError('资源项不存在', 404, 'RESOURCE_NOT_FOUND')
      const rows = this.database.prepare('SELECT id,title,url,type,cover_url AS coverUrl FROM resource_collection_items WHERE collection_id=? ORDER BY position,id').all(id)
      const byteSize = this.collectionByteSize(rows, current.view_mode)
      const now = this.nowIso()
      rows.forEach((row, position) => this.database.prepare('UPDATE resource_collection_items SET position=?,updated_at=? WHERE collection_id=? AND id=?').run(position, now, id, row.id))
      const bumped = this.database.prepare('UPDATE resource_collections SET item_count=?,byte_size=?,items_revision=items_revision+1,revision=revision+1,updated_at=? WHERE id=? AND items_revision=?').run(rows.length, byteSize, now, id, current.items_revision)
      if (Number(bumped.changes) !== 1) throw createHttpError('资源集合项已被其他客户端更新，请重新加载', 409, 'RESOURCE_COLLECTION_REVISION_CONFLICT')
      this.insertAudit({ actorUserId: current.owner_id, action: 'resource-collection.item.delete', targetType: 'resource-collection', targetId: id, metadata: { itemId }, ipSummary: context.ip })
      result = { deleted: true, collectionRevision: Number(current.revision) + 1, itemsRevision: Number(current.items_revision) + 1, revision: Number(current.items_revision) + 1 }
    })
    return result
  }

  reorderResourceCollectionItems (actor, id, input = {}, context = {}) {
    const collection = this.requireOwnedResourceCollection(actor, id, 'write', { activeOnly: true })
    let result
    this.database.transaction(() => {
      const current = this.database.prepare('SELECT * FROM resource_collections WHERE id=? AND owner_id=? AND status=\'active\'').get(id, collection.owner_id)
      if (!current) throw createHttpError('资源集合不存在或已移入回收站', 409, 'RESOURCE_COLLECTION_TRASHED')
      this.assertItemsRevision(current, input)
      const itemIds = input.itemIds ?? input.ids
      if (!Array.isArray(itemIds)) throw createHttpError('itemIds 必须是数组', 400, 'RESOURCE_COLLECTION_ORDER_INVALID')
      const rows = this.database.prepare('SELECT id FROM resource_collection_items WHERE collection_id=? ORDER BY position,id').all(id)
      const existing = new Set(rows.map(row => String(row.id)))
      const ids = itemIds.map(value => String(value))
      if (ids.length !== existing.size || new Set(ids).size !== ids.length || ids.some(value => !existing.has(value))) throw createHttpError('资源项顺序不完整', 400, 'RESOURCE_COLLECTION_ORDER_INVALID')
      const now = this.nowIso()
      ids.forEach((itemId, position) => this.database.prepare('UPDATE resource_collection_items SET position=?,updated_at=? WHERE collection_id=? AND id=?').run(position, now, id, itemId))
      const bumped = this.database.prepare('UPDATE resource_collections SET items_revision=items_revision+1,revision=revision+1,updated_at=? WHERE id=? AND items_revision=?').run(now, id, current.items_revision)
      if (Number(bumped.changes) !== 1) throw createHttpError('资源集合项已被其他客户端更新，请重新加载', 409, 'RESOURCE_COLLECTION_REVISION_CONFLICT')
      this.insertAudit({ actorUserId: current.owner_id, action: 'resource-collection.item.reorder', targetType: 'resource-collection', targetId: id, metadata: { itemCount: ids.length }, ipSummary: context.ip })
      result = this.listResourceCollectionItems(actor, id, { page: 1, limit: Math.min(100, Math.max(1, ids.length)) })
    })
    return result
  }

  trashResourceCollection (actor, id, context = {}) {
    const row = this.requireOwnedResourceCollection(actor, id, 'write')
    if (row.status === 'trashed') return this.resourceCollectionView(row)
    const now = this.nowIso()
    this.database.transaction(() => {
      const result = this.database.prepare("UPDATE resource_collections SET status='trashed',visibility='private',deleted_at=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND status='active'").run(now, now, row.id, row.owner_id)
      if (Number(result.changes) !== 1) return
      this.database.prepare("UPDATE resource_collection_bindings SET status='trashed',updated_at=? WHERE collection_id=? AND status='active'").run(now, row.id)
      this.insertAudit({ actorUserId: row.owner_id, action: 'resource-collection.trash', targetType: 'resource-collection', targetId: row.id, metadata: { visibilityBefore: row.visibility, visibilityAfter: 'private' }, ipSummary: context.ip })
    })
    return this.getResourceCollection(actor, id)
  }

  restoreResourceCollection (actor, id, context = {}) {
    const row = this.requireOwnedResourceCollection(actor, id, 'write')
    if (row.status === 'active') return this.resourceCollectionView(row)
    const now = this.nowIso()
    const trashTimestamp = String(row.deleted_at || '')
    this.database.transaction(() => {
      const result = this.database.prepare("UPDATE resource_collections SET status='active',visibility='private',deleted_at=NULL,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND status='trashed'").run(now, row.id, row.owner_id)
      if (Number(result.changes) !== 1) return
      // Do not resurrect bindings that were already trashed for an unrelated
      // reason before the collection entered the recycle bin.
      this.database.prepare("UPDATE resource_collection_bindings SET status='active',updated_at=? WHERE collection_id=? AND status='trashed' AND updated_at=?").run(now, row.id, trashTimestamp)
      this.insertAudit({ actorUserId: row.owner_id, action: 'resource-collection.restore', targetType: 'resource-collection', targetId: row.id, metadata: { visibilityAfter: 'private' }, ipSummary: context.ip })
    })
    return this.getResourceCollection(actor, id)
  }

  permanentlyDeleteResourceCollection (actor, id, context = {}) {
    const row = this.requireOwnedResourceCollection(actor, id, 'write')
    if (row.status !== 'trashed') throw createHttpError('资源集合必须先移入回收站', 409, 'RESOURCE_COLLECTION_NOT_TRASHED')
    this.database.transaction(() => {
      // See the admin path above: the reference scan must share the delete's
      // BEGIN IMMEDIATE lock so no writer can create a new live source between
      // the scan and the destructive DELETE.
      const current = this.database.prepare('SELECT * FROM resource_collections WHERE id=? AND owner_id=?').get(row.id, row.owner_id)
      if (!current) throw createHttpError('资源集合不存在', 404, 'RESOURCE_NOT_FOUND')
      if (current.status !== 'trashed') throw createHttpError('资源集合必须先移入回收站', 409, 'RESOURCE_COLLECTION_NOT_TRASHED')
      if (this.resourceCollectionHasLiveReference(current.id)) throw createHttpError('资源集合仍被 KML 或分享引用，请先解除绑定', 409, 'RESOURCE_COLLECTION_DELETE_REFERENCED')
      const result = this.database.prepare("DELETE FROM resource_collections WHERE id=? AND owner_id=? AND status='trashed'").run(current.id, current.owner_id)
      if (Number(result.changes) !== 1) throw createHttpError('资源集合不存在', 404, 'RESOURCE_NOT_FOUND')
      this.insertAudit({ actorUserId: current.owner_id, action: 'resource-collection.permanent-delete', targetType: 'resource-collection', targetId: current.id, metadata: { itemCount: current.item_count }, ipSummary: context.ip })
    })
    return { id: row.id, deleted: true, status: 'deleted' }
  }

  getPublicResourceCollection (id, input = {}, context = {}) {
    this.consumePublicCollectionRateLimit(String(id || ''), context)
    const row = this.database.prepare("SELECT * FROM resource_collections WHERE id=? AND status='active' AND visibility='public'").get(String(id))
    if (!row) throw createHttpError('资源集合不存在或未公开', 404, 'RESOURCE_NOT_FOUND')
    const result = this.resourceCollectionView(row, { public: true })
    if (String(input.include || '').toLowerCase() === 'firstpage') {
      const page = this.listPublicResourceCollectionItems(row, input)
      result.items = page.items
      result.pagination = page.pagination
      result.collectionRevision = page.collectionRevision
      result.itemsRevision = page.itemsRevision
    }
    return result
  }

  getPublicResourceCollectionItems (id, input = {}, context = {}) {
    this.consumePublicCollectionRateLimit(String(id || ''), context)
    const row = this.database.prepare("SELECT * FROM resource_collections WHERE id=? AND status='active' AND visibility='public'").get(String(id))
    if (!row) throw createHttpError('资源集合不存在或未公开', 404, 'RESOURCE_NOT_FOUND')
    return this.listPublicResourceCollectionItems(row, input)
  }

  batchResourceCollectionItems (actor, id, input = {}, context = {}) {
    const collection = this.requireOwnedResourceCollection(actor, id, 'write', { activeOnly: true })
    requireObject(input)
    const operations = Array.isArray(input.operations) ? input.operations : []
    const maxOperations = Math.min(this.resourceCollectionSettings().maxBatchItemsPerRequest, RESOURCE_COLLECTION_MAX_BATCH_OPERATIONS)
    if (!operations.length) throw createHttpError('批量操作不能为空', 400, 'VALIDATION_FAILED')
    if (operations.length > maxOperations) throw createHttpError(`单批最多处理 ${maxOperations} 项`, 413, 'RESOURCE_COLLECTION_PAYLOAD_TOO_LARGE')
    let result
    this.database.transaction(() => {
      const current = this.database.prepare('SELECT * FROM resource_collections WHERE id=? AND owner_id=? AND status=\'active\'').get(id, collection.owner_id)
      if (!current) throw createHttpError('资源集合不存在或已移入回收站', 409, 'RESOURCE_COLLECTION_TRASHED')
      this.assertItemsRevision(current, input)
      const rows = this.database.prepare('SELECT * FROM resource_collection_items WHERE collection_id=? ORDER BY position,id').all(id)
      const byId = new Map(rows.map(row => [String(row.id), {
        id: row.id,
        position: Number(row.position),
        title: row.title,
        url: row.url,
        type: row.type,
        coverUrl: row.cover_url || '',
        createdAt: row.created_at,
      }]))
      const results = []
      const seenUrls = new Set(Array.from(byId.values(), row => row.url))
      let nextPosition = byId.size
      for (const operation of operations) {
        const action = String(operation?.action || '')
        if (action === 'create') {
          const item = this.normalizeResourceItem(operation.item || operation)
          if (seenUrls.has(item.url)) throw createHttpError('资源集合中已存在相同地址', 409, 'RESOURCE_COLLECTION_DUPLICATE_URL')
          const itemId = randomId('rci')
          const value = { ...item, id: itemId, position: nextPosition++, createdAt: this.nowIso() }
          byId.set(itemId, value); seenUrls.add(item.url)
          results.push({ action, clientId: String(operation.clientId || ''), item: { ...value } })
        } else if (action === 'update') {
          const itemId = String(operation.itemId || '')
          const currentItem = byId.get(itemId)
          if (!currentItem) throw createHttpError('资源项不存在', 404, 'RESOURCE_NOT_FOUND')
          const item = this.normalizeResourceItem(operation.item || operation, currentItem)
          if (seenUrls.has(item.url) && item.url !== currentItem.url) throw createHttpError('资源集合中已存在相同地址', 409, 'RESOURCE_COLLECTION_DUPLICATE_URL')
          seenUrls.delete(currentItem.url); seenUrls.add(item.url)
          const value = { ...currentItem, ...item }
          byId.set(itemId, value)
          results.push({ action, itemId, item: { ...value } })
        } else if (action === 'delete') {
          const itemId = String(operation.itemId || '')
          const currentItem = byId.get(itemId)
          if (!currentItem) throw createHttpError('资源项不存在', 404, 'RESOURCE_NOT_FOUND')
          byId.delete(itemId); seenUrls.delete(currentItem.url)
          results.push({ action, itemId, deleted: true })
        } else if (action === 'reorder') {
          const ids = operation.itemIds || operation.ids
          if (!Array.isArray(ids)) throw createHttpError('itemIds 必须是数组', 400, 'RESOURCE_COLLECTION_ORDER_INVALID')
          const normalizedIds = ids.map(value => String(value))
          if (normalizedIds.length !== byId.size || new Set(normalizedIds).size !== normalizedIds.length || normalizedIds.some(value => !byId.has(value))) throw createHttpError('资源项顺序不完整', 400, 'RESOURCE_COLLECTION_ORDER_INVALID')
          normalizedIds.forEach((itemId, position) => { byId.get(itemId).position = position })
          results.push({ action, itemIds: normalizedIds })
        } else {
          throw createHttpError('批量操作类型不正确', 400, 'VALIDATION_FAILED')
        }
      }
      const ordered = Array.from(byId.values()).sort((left, right) => left.position - right.position || String(left.id).localeCompare(String(right.id)))
      ordered.forEach((item, position) => { item.position = position })
      const normalizedItems = ordered.map(item => ({ title: item.title, url: item.url, type: item.type, coverUrl: item.coverUrl }))
      const byteSize = this.collectionByteSize(normalizedItems, current.view_mode)
      this.assertResourceCollectionCapacity(current.owner_id, id, ordered.length, byteSize, { transportBytes: Buffer.byteLength(JSON.stringify(input), 'utf8') })
      const existingIds = new Set(rows.map(row => String(row.id)))
      const nextIds = new Set(ordered.map(item => String(item.id)))
      rows.filter(row => !nextIds.has(String(row.id))).forEach(row => this.database.prepare('DELETE FROM resource_collection_items WHERE collection_id=? AND id=?').run(id, row.id))
      const now = this.nowIso()
      for (const item of ordered) {
        if (existingIds.has(String(item.id))) {
          this.database.prepare('UPDATE resource_collection_items SET position=?,title=?,url=?,type=?,cover_url=?,updated_at=? WHERE collection_id=? AND id=?').run(item.position, item.title, item.url, item.type, item.coverUrl, now, id, item.id)
        } else {
          this.database.prepare('INSERT INTO resource_collection_items(id,collection_id,position,title,url,type,cover_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(item.id, id, item.position, item.title, item.url, item.type, item.coverUrl, item.createdAt || now, now)
        }
      }
      const bumped = this.database.prepare('UPDATE resource_collections SET item_count=?,byte_size=?,items_revision=items_revision+1,revision=revision+1,updated_at=? WHERE id=? AND items_revision=?').run(ordered.length, byteSize, now, id, current.items_revision)
      if (Number(bumped.changes) !== 1) throw createHttpError('资源集合项已被其他客户端更新，请重新加载', 409, 'RESOURCE_COLLECTION_REVISION_CONFLICT')
      this.insertAudit({ actorUserId: current.owner_id, action: 'resource-collection.item.batch', targetType: 'resource-collection', targetId: id, metadata: { operationCount: operations.length, itemCount: ordered.length }, ipSummary: context.ip })
      result = {
        results,
        collectionRevision: Number(current.revision) + 1,
        itemsRevision: Number(current.items_revision) + 1,
        revision: Number(current.items_revision) + 1,
        itemCount: ordered.length,
        byteSize,
        items: ordered.map(item => ({ id: item.id, position: item.position, title: item.title, url: item.url, type: item.type, coverUrl: item.coverUrl || '' })),
      }
    })
    return result
  }

  listResourceCollectionReferences (actor, id, input = {}) {
    const collection = this.requireOwnedResourceCollection(actor, id, 'read')
    const { page, limit } = this.collectionPage(input, 20)
    const ownRows = this.database.prepare(`
      SELECT b.kml_id AS kmlId, b.feature_id AS featureId, b.source_scope AS sourceScope,
             b.status, b.updated_at AS updatedAt, k.name AS kmlName, k.owner_id AS kmlOwnerId
      FROM resource_collection_bindings b
      JOIN kml_documents k ON k.id=b.kml_id
      WHERE b.collection_id=? AND b.status='active' AND b.source_scope='owner_kml' AND k.owner_id=?
      ORDER BY b.updated_at DESC, b.id DESC
    `).all(collection.id, collection.owner_id)
    const ownShareRows = this.database.prepare(`
      SELECT b.kml_id AS kmlId, b.feature_id AS featureId, b.source_scope AS sourceScope,
             b.status, b.updated_at AS updatedAt, s.public_id AS publicId, s.status AS shareStatus,
             s.owner_id AS shareOwnerId
      FROM resource_collection_bindings b
      JOIN kml_share_items si ON si.kml_id=b.kml_id AND b.feature_id LIKE si.id || '::%'
      JOIN kml_shares s ON s.id=si.share_id
      WHERE b.collection_id=? AND b.status='active' AND b.source_scope='published_share' AND s.owner_id=?
      ORDER BY b.updated_at DESC, b.id DESC
    `).all(collection.id, collection.owner_id)
    const foreignCount = Number(this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM resource_collection_bindings b
      LEFT JOIN kml_documents k ON k.id=b.kml_id AND b.source_scope='owner_kml'
      LEFT JOIN kml_share_items si ON b.source_scope='published_share' AND b.feature_id LIKE si.id || '::%'
      LEFT JOIN kml_shares s ON s.id=si.share_id
      WHERE b.collection_id=? AND b.status='active' AND ((b.source_scope='owner_kml' AND (k.owner_id IS NULL OR k.owner_id<>?)) OR (b.source_scope='published_share' AND (s.owner_id IS NULL OR s.owner_id<>?)))
    `).get(collection.id, collection.owner_id, collection.owner_id)?.count || 0)
    const items = [
      ...ownRows.map(row => ({ kmlId: row.kmlId, featureId: row.featureId, sourceScope: row.sourceScope, kmlName: row.kmlName, status: row.status, updatedAt: row.updatedAt })),
      ...ownShareRows.map(row => ({ sourceScope: row.sourceScope, publicId: row.publicId, shareStatus: row.shareStatus, shareItemId: String(row.featureId).split('::')[0], status: row.status, updatedAt: row.updatedAt })),
    ]
    if (foreignCount > 0) items.push({ sourceScope: 'other', referenceCount: foreignCount })
    const total = items.length
    return { collectionId: collection.id, items: items.slice((page - 1) * limit, page * limit), page, limit, total, pageCount: Math.max(1, Math.ceil(total / limit)), hasNext: page < Math.max(1, Math.ceil(total / limit)) }
  }

  listAdminResourceCollectionReferences (actor, id, input = {}) {
    const collection = this.requireAdminResourceCollection(actor, id, 'read')
    const { page, limit } = this.collectionPage(input, 20)
    const status = input.status === undefined || input.status === '' ? 'all' : String(input.status)
    const sourceScope = input.sourceScope === undefined || input.sourceScope === '' ? 'all' : String(input.sourceScope)
    if (!['all', 'active', 'stale', 'missing', 'trashed'].includes(status)) {
      throw createHttpError('引用状态不正确', 400, 'VALIDATION_FAILED')
    }
    if (!['all', 'owner_kml', 'published_share'].includes(sourceScope)) {
      throw createHttpError('引用来源不正确', 400, 'VALIDATION_FAILED')
    }
    const where = ['b.collection_id = ?']
    const params = [collection.id]
    if (status !== 'all') {
      where.push('b.status = ?')
      params.push(status)
    }
    if (sourceScope !== 'all') {
      where.push('b.source_scope = ?')
      params.push(sourceScope)
    }
    const clause = where.join(' AND ')
    const total = Number(this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM resource_collection_bindings b
      WHERE ${clause}
    `).get(...params)?.count || 0)
    const rows = this.database.prepare(`
      SELECT
        b.id AS binding_id,
        b.collection_id,
        b.kml_id,
        b.feature_id,
        b.source_scope,
        b.status,
        b.created_at,
        b.updated_at,
        k.name AS kml_name,
        k.owner_id AS kml_owner_id,
        k.status AS kml_status,
        si.id AS share_item_id,
        s.public_id AS share_public_id,
        s.owner_id AS share_owner_id,
        s.status AS share_status
      FROM resource_collection_bindings b
      LEFT JOIN kml_documents k
        ON b.source_scope = 'owner_kml' AND k.id = b.kml_id
      LEFT JOIN kml_share_items si
        ON b.source_scope = 'published_share' AND b.feature_id LIKE si.id || '::%'
      LEFT JOIN kml_shares s ON s.id = si.share_id
      WHERE ${clause}
      ORDER BY b.updated_at DESC, b.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit)
    const items = rows.map(row => {
      const rawFeatureId = String(row.feature_id || '')
      const separator = rawFeatureId.indexOf('::')
      const featureId = row.source_scope === 'published_share' && separator >= 0
        ? rawFeatureId.slice(separator + 2)
        : rawFeatureId
      return {
        bindingId: row.binding_id,
        collectionId: row.collection_id,
        sourceScope: row.source_scope,
        status: row.status,
        kmlId: row.kml_id || null,
        kmlName: row.kml_name || '',
        kmlOwnerId: row.kml_owner_id || null,
        kmlStatus: row.kml_status || 'missing',
        featureId,
        shareItemId: row.share_item_id || (separator >= 0 ? rawFeatureId.slice(0, separator) : null),
        sharePublicId: row.share_public_id || null,
        shareOwnerId: row.share_owner_id || null,
        shareStatus: row.share_status || 'missing',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }
    })
    return {
      collectionId: collection.id,
      items,
      page,
      limit,
      total,
      pageCount: Math.max(1, Math.ceil(total / limit)),
      hasNext: page < Math.max(1, Math.ceil(total / limit)),
    }
  }

  resourceCollectionBindingSource (binding) {
    if (!binding) return { matches: false, reason: 'missing' }
    if (binding.source_scope === 'owner_kml') {
      const kml = this.database.prepare('SELECT * FROM kml_documents WHERE id=?').get(binding.kml_id)
      if (!kml) return { matches: false, reason: 'missing' }
      const features = parseJson(kml.features_json, [])
      const feature = features.find(item => String(item?.id || '') === String(binding.feature_id || ''))
      const ref = tryNormalizeKmlResourceCollectionRef(feature?.resourceCollectionRef)
      return {
        matches: ref.value?.sourceType === 'personal' && ref.value.collectionId === binding.collection_id,
        reason: feature ? 'stale' : 'missing',
        kml,
        features,
        feature,
      }
    }
    if (binding.source_scope === 'published_share') {
      const rawFeatureId = String(binding.feature_id || '')
      const separator = rawFeatureId.indexOf('::')
      if (separator < 1) return { matches: false, reason: 'missing' }
      const shareItemId = rawFeatureId.slice(0, separator)
      const featureId = rawFeatureId.slice(separator + 2)
      const shareItem = this.database.prepare('SELECT * FROM kml_share_items WHERE id=?').get(shareItemId)
      if (!shareItem) return { matches: false, reason: 'missing' }
      const snapshot = parseJson(shareItem.published_snapshot_json, {})
      const features = Array.isArray(snapshot.features) ? snapshot.features : []
      const feature = features.find(item => String(item?.id || '') === featureId)
      const ref = tryNormalizeKmlResourceCollectionRef(feature?.resourceCollectionRef)
      return {
        matches: ref.value?.sourceType === 'personal' && ref.value.collectionId === binding.collection_id,
        reason: feature ? 'stale' : 'missing',
        shareItem,
        share: this.database.prepare('SELECT * FROM kml_shares WHERE id=?').get(shareItem.share_id),
        snapshot,
        features,
        feature,
        shareItemId,
        featureId,
      }
    }
    return { matches: false, reason: 'missing' }
  }

  repairAdminResourceCollectionReference (actor, collectionId, bindingId, context = {}) {
    this.requireAdminResourceCollection(actor, collectionId, 'manage')
    const binding = this.database.prepare('SELECT * FROM resource_collection_bindings WHERE id=? AND collection_id=?').get(String(bindingId || ''), String(collectionId || ''))
    if (!binding) throw createHttpError('资源集合引用不存在', 404, 'RESOURCE_NOT_FOUND')
    const source = this.resourceCollectionBindingSource(binding)
    if (source.matches) throw createHttpError('该引用仍存在于来源数据，不能仅修复索引', 409, 'RESOURCE_COLLECTION_REFERENCE_STILL_ACTIVE')
    const status = source.reason === 'missing' ? 'missing' : 'stale'
    const now = this.nowIso()
    this.database.prepare('UPDATE resource_collection_bindings SET status=?,updated_at=? WHERE id=?').run(status, now, binding.id)
    this.insertAudit({
      actorUserId: this.actorUser(actor).id,
      action: 'admin.resource-collection-reference.repair',
      targetType: 'resource-collection-binding',
      targetId: binding.id,
      metadata: { collectionId: binding.collection_id, sourceScope: binding.source_scope, status },
      ipSummary: context.ip,
    })
    return { bindingId: binding.id, collectionId: binding.collection_id, repaired: true, status }
  }

  detachAdminResourceCollectionReference (actor, collectionId, bindingId, input = {}, context = {}) {
    this.requireAdminResourceCollection(actor, collectionId, 'manage')
    const binding = this.database.prepare('SELECT * FROM resource_collection_bindings WHERE id=? AND collection_id=?').get(String(bindingId || ''), String(collectionId || ''))
    if (!binding) throw createHttpError('资源集合引用不存在', 404, 'RESOURCE_NOT_FOUND')
    const source = this.resourceCollectionBindingSource(binding)
    if (!source.matches) throw createHttpError('资源集合引用来源已发生变化，请先刷新引用列表并执行索引修复', 409, 'RESOURCE_COLLECTION_REFERENCE_STALE')
    const now = this.nowIso()
    let result
    this.database.transaction(() => {
      if (binding.source_scope === 'owner_kml') {
        const currentView = this.kmlViewFromRow(source.kml, { includeFeatures: true })
        const nextFeatures = source.features.map(feature => {
          if (String(feature?.id || '') !== String(binding.feature_id || '')) return feature
          const next = { ...feature }
          delete next.resourceCollectionRef
          delete next.resourceCollectionStatus
          return next
        })
        const normalized = normalizeKmlInput({
          name: currentView.name,
          description: currentView.description,
          coordCorrection: currentView.coordCorrection,
          theme: currentView.theme,
          color: currentView.color,
          lockDrag: currentView.lockDrag,
          enabled: currentView.enabled,
          isLiveTrack: currentView.isLiveTrack,
          features: nextFeatures,
        }, currentView)
        const updated = this.database.prepare(`
          UPDATE kml_documents SET
            name=?,description=?,coord_correction=?,theme=?,color=?,lock_drag=?,enabled=?,is_live_track=?,
            features_json=?,feature_count=?,bounds_json=?,byte_size=?,revision=revision+1,updated_at=?
          WHERE id=? AND revision=?
        `).run(
          normalized.name,
          normalized.description,
          normalized.coordCorrection,
          normalized.theme,
          normalized.color,
          normalized.lockDrag ? 1 : 0,
          normalized.enabled ? 1 : 0,
          normalized.isLiveTrack ? 1 : 0,
          JSON.stringify(normalized.features),
          normalized.featureCount,
          JSON.stringify(normalized.bounds),
          normalized.byteSize,
          now,
          source.kml.id,
          Number(source.kml.revision),
        )
        if (Number(updated.changes) !== 1) throw createHttpError('KML 已被其他客户端更新，请重新加载', 409, 'KML_REVISION_CONFLICT')
        this.syncResourceCollectionBindings(source.kml.id, normalized.features)
        result = { bindingId: binding.id, collectionId: binding.collection_id, sourceScope: binding.source_scope, detached: true, kmlId: source.kml.id, featureId: binding.feature_id, revision: Number(source.kml.revision) + 1 }
      } else {
        const nextFeatures = source.features.map(feature => {
          if (String(feature?.id || '') !== source.featureId) return feature
          const next = { ...feature }
          delete next.resourceCollectionRef
          delete next.resourceCollectionStatus
          return next
        })
        const nextPublishedRevision = Number(source.shareItem.published_revision || source.snapshot.revision || 0) + 1
        const nextSnapshot = {
          ...source.snapshot,
          features: sanitizePublishedKmlFeatures(nextFeatures),
          revision: nextPublishedRevision,
          updatedAt: now,
        }
        const updated = this.database.prepare(`
          UPDATE kml_share_items SET published_revision=?,published_snapshot_json=?,published_at=?
          WHERE id=? AND published_revision=? AND published_snapshot_json=?
        `).run(nextPublishedRevision, JSON.stringify(nextSnapshot), now, source.shareItem.id, Number(source.shareItem.published_revision || 0), source.shareItem.published_snapshot_json)
        if (Number(updated.changes) !== 1) throw createHttpError('分享内容已被其他客户端更新，请重新加载', 409, 'SHARE_REVISION_CONFLICT')
        this.markPublishedResourceCollectionBindingsStale(source.share.id)
        const shareItems = this.database.prepare('SELECT id,kml_id,published_revision,published_snapshot_json,published_at FROM kml_share_items WHERE share_id=?').all(source.share.id).map(item => ({
          id: item.id,
          kmlId: item.kml_id,
          revision: Number(item.published_revision || 0),
          publishedRevision: Number(item.published_revision || 0),
          publishedAt: item.published_at,
          publishedSnapshot: parseJson(item.published_snapshot_json, {}),
        }))
        this.syncPublishedResourceCollectionBindings(source.share.id, shareItems)
        this.database.prepare('UPDATE kml_shares SET content_revision=content_revision+1,revision=revision+1,updated_at=? WHERE id=?').run(now, source.share.id)
        result = { bindingId: binding.id, collectionId: binding.collection_id, sourceScope: binding.source_scope, detached: true, shareItemId: source.shareItemId, featureId: source.featureId }
      }
      this.insertAudit({
        actorUserId: this.actorUser(actor).id,
        action: 'admin.resource-collection-reference.detach',
        targetType: 'resource-collection-binding',
        targetId: binding.id,
        metadata: { collectionId: binding.collection_id, sourceScope: binding.source_scope, kmlId: binding.kml_id, featureId: binding.feature_id },
        ipSummary: context.ip,
      })
    })
    return result
  }

  exportResourceCollection (actor, id) {
    const row = this.requireOwnedResourceCollection(actor, id, 'read')
    const rows = this.database.prepare('SELECT id,position,title,url,type,cover_url,created_at,updated_at FROM resource_collection_items WHERE collection_id=? ORDER BY position,id').all(id)
    const payload = {
      version: 1,
      collection: this.resourceCollectionView(row, { public: true }),
      items: this.collectionItemsFromRows(rows),
    }
    const content = JSON.stringify(payload, null, 2)
    if (Buffer.byteLength(content, 'utf8') > RESOURCE_COLLECTION_EXPORT_MAX_BYTES) throw createHttpError('资源集合导出内容超过安全大小限制', 413, 'RESOURCE_COLLECTION_PAYLOAD_TOO_LARGE')
    const safeName = String(row.name || 'resource-collection').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100) || 'resource-collection'
    return { filename: `${safeName}.json`, contentType: 'application/json; charset=utf-8', content }
  }

  resourceCollectionAccessState (ref) {
    const result = tryNormalizeKmlResourceCollectionRef(ref)
    if (!result.value || result.value.sourceType !== 'personal') return result.value?.sourceType === 'external' ? 'public' : 'missing'
    const row = this.database.prepare('SELECT status, visibility FROM resource_collections WHERE id = ?').get(result.value.collectionId)
    if (!row) return 'missing'
    if (row.status === 'trashed') return 'trashed'
    return row.visibility === 'public' ? 'public' : 'private'
  }

  validateResourceCollectionReferences (ownerId, features, options = {}) {
    const allowUnresolved = options.allowUnresolved === true
    for (const feature of Array.isArray(features) ? features : []) {
      const ref = tryNormalizeKmlResourceCollectionRef(feature?.resourceCollectionRef)
      if (!ref.value || ref.value.sourceType !== 'personal') continue
      const row = this.database.prepare('SELECT owner_id, status, visibility FROM resource_collections WHERE id = ?').get(ref.value.collectionId)
      if (!row) {
        if (allowUnresolved) continue
        throw createHttpError('个人资源集合不存在', 404, 'RESOURCE_NOT_FOUND')
      }
      if (row.status !== 'active') {
        if (allowUnresolved) continue
        throw createHttpError('个人资源集合已移入回收站', 409, 'RESOURCE_COLLECTION_UNAVAILABLE')
      }
      if (row.owner_id !== ownerId && row.visibility !== 'public') {
        if (allowUnresolved) continue
        throw createHttpError('没有绑定该个人资源集合的权限', 403, 'PERMISSION_DENIED')
      }
    }
  }

  getKml (actor, kmlId) {
    const row = this.requireKmlAccess(actor, kmlId, 'read')
    return this.kmlViewFromRow(row, { includeFeatures: true })
  }

  updateKml (actor, kmlId, input = {}) {
    const row = this.requireKmlAccess(actor, kmlId, 'write')
    const revision = normalizeRevision(input.revision)
    if (revision !== Number(row.revision)) {
      throw createHttpError('KML 已被其他客户端更新，请重新加载', 409, 'KML_REVISION_CONFLICT')
    }
    const current = this.kmlViewFromRow(row, { includeFeatures: true })
    const requestedDirectoryId = input.directoryId === undefined
      ? row.directory_id || null
      : normalizeKmlDirectoryId(input.directoryId)
    if (requestedDirectoryId && !this.database.prepare(`
      SELECT 1 FROM kml_directories WHERE id = ? AND owner_id = ?
    `).get(requestedDirectoryId, row.owner_id)) {
      throw createHttpError('KML 目录不存在', 404, 'KML_DIRECTORY_NOT_FOUND')
    }
    const preparedRefUpdate = prepareKmlResourceCollectionRefUpdate(input, current.features)
    const normalized = normalizeKmlInput(preparedRefUpdate.input, current)
    if (preparedRefUpdate.changedFeatureIds.size > 0 || normalized.features.some(feature => feature?.resourceCollectionRef)) {
      const currentRefsById = new Map(
        (Array.isArray(current.features) ? current.features : [])
          .filter(feature => feature && typeof feature === 'object' && feature.resourceCollectionRef)
          .map(feature => [String(feature.id || ''), resourceCollectionRefFingerprint(feature.resourceCollectionRef)]),
      )
      const changedFeatures = normalized.features.filter(feature => {
        if (!feature?.resourceCollectionRef) return false
        const id = String(feature.id || '')
        return preparedRefUpdate.changedFeatureIds.has(id) || !currentRefsById.has(id)
      })
      this.validateResourceCollectionReferences(row.owner_id, changedFeatures)
    }
    const sourceDirectoryId = row.directory_id || null
    let repairedPosition = null
    let directoryMove = null
    if (row.status === 'active') {
      const sourceAllIds = this.kmlIdsInDirectory(row.owner_id, sourceDirectoryId)
      const canonicalPosition = sourceAllIds.indexOf(row.id)
      const storedPosition = Number(row.position)
      repairedPosition = canonicalPosition >= 0 && storedPosition !== canonicalPosition
        ? canonicalPosition
        : null
      const hasDirectoryInput = input.directoryId !== undefined
      const hasPositionInput = input.position !== undefined
      const sameDirectory = requestedDirectoryId === sourceDirectoryId
      const rawPosition = hasPositionInput ? Number(input.position) : null
      // Older clients echo the stored position on every content update. If
      // that value is already stale, treat it as an organization no-op and
      // repair the server-side dense order instead of rejecting the edit.
      const stalePositionEcho = sameDirectory && hasPositionInput &&
        Number.isSafeInteger(rawPosition) && rawPosition === storedPosition &&
        canonicalPosition >= 0 && rawPosition !== canonicalPosition
      const shouldMove = (hasDirectoryInput && !sameDirectory) ||
        (hasPositionInput && !stalePositionEcho && rawPosition !== canonicalPosition)
      if (shouldMove) {
        const sourceIds = sourceAllIds.filter(id => id !== row.id)
        const ids = sameDirectory
          ? sourceIds.slice()
          : this.kmlIdsInDirectory(row.owner_id, requestedDirectoryId).filter(id => id !== row.id)
        const position = hasPositionInput
          ? normalizeIntegerField(input.position, {
              minimum: 0,
              maximum: ids.length,
              code: 'KML_MOVE_INVALID',
              message: 'KML 文件位置不正确',
            })
          : ids.length
        ids.splice(position, 0, row.id)
        directoryMove = { sourceDirectoryId, sourceIds, ids, requestedDirectoryId }
      }
    }
    const makeDefault = input.isDefault === true
    if (makeDefault && row.status !== 'active') {
      throw createHttpError('回收站中的 KML 不能设为默认，请先恢复', 409, 'KML_NOT_ACTIVE')
    }
    if (input.isDefault === false && row.is_default) {
      throw createHttpError('请先将另一个 KML 设为默认', 409, 'DEFAULT_KML_PROTECTED')
    }
    this.assertKmlQuota(row.owner_id, normalized, row)
    const now = this.nowIso()
    this.database.transaction(() => {
      if (makeDefault && row.status === 'active') {
        this.database.prepare(`UPDATE kml_documents SET is_default = 0 WHERE owner_id = ?`).run(row.owner_id)
      }
      const positionClause = directoryMove || repairedPosition === null ? '' : ', position = ?'
      const updateParams = [
        normalized.name,
        normalized.description,
        makeDefault ? 1 : Number(row.is_default),
        normalized.coordCorrection,
        normalized.theme,
        normalized.color,
        normalized.lockDrag ? 1 : 0,
        normalized.enabled ? 1 : 0,
        normalized.isLiveTrack ? 1 : 0,
        JSON.stringify(normalized.features),
        normalized.featureCount,
        JSON.stringify(normalized.bounds),
        normalized.byteSize,
      ]
      updateParams.push(now)
      if (positionClause) updateParams.push(repairedPosition)
      updateParams.push(row.id, revision)
      const result = this.database.prepare(`
        UPDATE kml_documents SET
          name = ?, description = ?, is_default = ?, coord_correction = ?, theme = ?,
          color = ?, lock_drag = ?, enabled = ?, is_live_track = ?, features_json = ?,
          feature_count = ?, bounds_json = ?, byte_size = ?, revision = revision + 1, updated_at = ?${positionClause}
        WHERE id = ? AND revision = ?
      `).run(
        ...updateParams
      )
      if (Number(result.changes) !== 1) {
        throw createHttpError('KML 已被其他客户端更新，请重新加载', 409, 'KML_REVISION_CONFLICT')
      }
      if (directoryMove) {
        if (directoryMove.sourceDirectoryId !== directoryMove.requestedDirectoryId) {
          this.writeKmlDirectoryOrder(row.owner_id, directoryMove.sourceDirectoryId, directoryMove.sourceIds)
        }
        this.writeKmlDirectoryOrder(row.owner_id, directoryMove.requestedDirectoryId, directoryMove.ids, { excludeId: row.id })
      }
      this.syncResourceCollectionBindings(row.id, normalized.features)
    })
    return this.getKml(actor, row.id)
  }

  removeKmlFromShares (kmlId) {
    const shares = this.database.prepare(`
      SELECT DISTINCT share_id FROM kml_share_items WHERE kml_id = ?
    `).all(kmlId).map(row => row.share_id)
    // Keep the share item and its published snapshot. A source moving to the
    // recycle bin is a private-data lifecycle change, not an instruction to
    // revoke or rewrite an already published link.
    const now = this.nowIso()
    shares.forEach(shareId => {
      this.database.prepare(`
        UPDATE kml_shares
        SET updated_at = ?
        WHERE id = ?
      `).run(now, shareId)
      this.refreshShareAfterContentChange(shareId)
    })
    return shares.length
  }

  trashKml (actor, kmlId) {
    const row = this.requireKmlAccess(actor, kmlId, 'write')
    if (row.is_default) {
      throw createHttpError('默认 KML 不能移入回收站，请先设置其他默认 KML', 409, 'DEFAULT_KML_PROTECTED')
    }
    if (row.status === 'trashed') return this.kmlViewFromRow(row, { includeFeatures: true })
    const now = this.nowIso()
    const affectedShares = Number(this.database.prepare(`
      SELECT COUNT(DISTINCT share_id) AS count FROM kml_share_items WHERE kml_id = ?
    `).get(row.id)?.count || 0)
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE kml_documents
        SET status = 'trashed', is_default = 0, position = 0, revision = revision + 1,
            updated_at = ?, deleted_at = ?
        WHERE id = ?
      `).run(now, now, row.id)
      this.reindexKmlDirectoryOrder(row.owner_id, row.directory_id || null, {
        now,
        touchRevision: true,
      })
      this.insertAudit({
        actorUserId: this.actorUser(actor).id,
        action: 'kml.trash',
        targetType: 'kml',
        targetId: row.id,
        metadata: { affectedShares },
      })
    })
    this.removeKmlFromShares(row.id)
    return this.getKml(actor, row.id)
  }

  trashKmlBySyncClientId (actor, clientId) {
    this.assertPermission(actor, 'kml.own.write')
    const ownerId = this.actorUser(actor).id
    const normalizedClientId = normalizeSyncClientId(clientId)
    const key = this.database.prepare(`
      SELECT kml_id, deleted_at
      FROM kml_sync_create_keys
      WHERE owner_id = ? AND client_id = ?
    `).get(ownerId, normalizedClientId)
    if (!key) {
      this.database.prepare(`
        INSERT OR IGNORE INTO kml_sync_delete_tombstones(owner_id, client_id, deleted_at)
        VALUES (?, ?, ?)
      `).run(ownerId, normalizedClientId, this.nowIso())
      return null
    }
    if (key.deleted_at) return null

    const document = this.database.prepare(`
      SELECT id FROM kml_documents WHERE id = ? AND owner_id = ?
    `).get(key.kml_id, ownerId)
    if (!document) return null
    return this.trashKml(actor, document.id)
  }

  restoreKml (actor, kmlId) {
    const row = this.requireKmlAccess(actor, kmlId, 'write')
    if (row.status === 'active') return this.kmlViewFromRow(row, { includeFeatures: true })
    this.assertKmlQuota(row.owner_id, {
      featureCount: Number(row.feature_count || 0),
      byteSize: Number(row.byte_size || 0),
    })
    const now = this.nowIso()
    this.database.transaction(() => {
      const position = Number(this.database.prepare(`
        SELECT COUNT(*) AS count
        FROM kml_documents
        WHERE owner_id = ? AND directory_id IS ? AND status = 'active'
      `).get(row.owner_id, row.directory_id || null)?.count || 0)
      const result = this.database.prepare(`
        UPDATE kml_documents
        SET status = 'active', is_default = 0, position = ?, revision = revision + 1,
            updated_at = ?, deleted_at = NULL
        WHERE id = ? AND owner_id = ? AND status = 'trashed'
      `).run(position, now, row.id, row.owner_id)
      if (Number(result.changes) !== 1) {
        throw createHttpError('KML 状态已被其他客户端更新，请重新加载', 409, 'KML_REVISION_CONFLICT')
      }
      this.reindexKmlDirectoryOrder(row.owner_id, row.directory_id || null, {
        now,
        touchRevision: true,
      })
      this.insertAudit({
        actorUserId: this.actorUser(actor).id,
        action: 'kml.restore',
        targetType: 'kml',
        targetId: row.id,
        metadata: { previousRevision: Number(row.revision), featureCount: Number(row.feature_count) },
      })
    })
    return this.getKml(actor, row.id)
  }

  restoreKmlBySyncClientId (actor, clientId) {
    this.assertPermission(actor, 'kml.own.write')
    const ownerId = this.actorUser(actor).id
    const normalizedClientId = normalizeSyncClientId(clientId)
    const key = this.database.prepare(`
      SELECT kml_id, deleted_at
      FROM kml_sync_create_keys
      WHERE owner_id = ? AND client_id = ?
    `).get(ownerId, normalizedClientId)
    if (key) {
      if (key.deleted_at) return null
      const document = this.database.prepare(`
        SELECT id FROM kml_documents WHERE id = ? AND owner_id = ?
      `).get(key.kml_id, ownerId)
      return document ? this.restoreKml(actor, document.id) : null
    }

    this.database.prepare(`
      DELETE FROM kml_sync_delete_tombstones
      WHERE owner_id = ? AND client_id = ?
    `).run(ownerId, normalizedClientId)
    return null
  }

  permanentDeleteKml (actor, kmlId) {
    const row = this.requireKmlAccess(actor, kmlId, 'write')
    if (row.is_default) {
      throw createHttpError('默认 KML 不能永久删除', 409, 'DEFAULT_KML_PROTECTED')
    }
    if (row.status !== 'trashed') {
      throw createHttpError('请先将 KML 移入回收站', 409, 'KML_NOT_TRASHED')
    }
    const shareIds = this.database.prepare(`
      SELECT DISTINCT share_id FROM kml_share_items WHERE kml_id = ?
    `).all(row.id).map(item => item.share_id)
    if (shareIds.length > 0) {
      throw createHttpError(
        '该 KML 仍被分享引用，请先删除分享或将其替换为其他 KML 后再永久删除',
        409,
        'KML_REFERENCED_BY_SHARE'
      )
    }
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE kml_sync_create_keys SET deleted_at = ? WHERE kml_id = ?
      `).run(this.nowIso(), row.id)
      this.database.prepare('DELETE FROM kml_documents WHERE id = ?').run(row.id)
      this.insertAudit({
        actorUserId: this.actorUser(actor).id,
        action: 'kml.delete-permanent',
        targetType: 'kml',
        targetId: row.id,
        metadata: { featureCount: Number(row.feature_count), byteSize: Number(row.byte_size) },
      })
    })
    return { id: row.id, status: 'deleted' }
  }

  purgeExpiredKmlTrash (options = {}) {
    const limit = Number.isSafeInteger(Number(options.limit)) && Number(options.limit) > 0
      ? Math.min(Number(options.limit), 2000)
      : 500
    const scanBatchSize = Number.isSafeInteger(Number(options.scanBatchSize)) && Number(options.scanBatchSize) > 0
      ? Math.min(Number(options.scanBatchSize), 2000)
      : Math.min(500, Math.max(100, limit))
    const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : this.clock()
    const now = new Date(nowMs).toISOString()
    const scan = this.database.prepare(`
      SELECT k.id, k.owner_id, k.name, k.feature_count, k.byte_size,
             COALESCE(k.deleted_at, k.updated_at, k.created_at) AS trashed_at,
             EXISTS(SELECT 1 FROM kml_share_items i WHERE i.kml_id = k.id) AS has_share
      FROM kml_documents k
      WHERE k.status = 'trashed'
      ORDER BY trashed_at ASC, k.id ASC
      LIMIT ? OFFSET ?
    `)
    const eligible = []
    const retentionDaysByOwner = new Map()
    let scannedCount = 0
    let skippedByRetention = 0
    let skippedByShare = 0
    let offset = 0
    while (eligible.length < limit) {
      const rows = scan.all(scanBatchSize, offset)
      if (rows.length === 0) break
      for (const row of rows) {
        scannedCount += 1
        if (!retentionDaysByOwner.has(row.owner_id)) {
          retentionDaysByOwner.set(
            row.owner_id,
            Number(this.quotaForUser(row.owner_id).trashRetentionDays || 30),
          )
        }
        const retentionDays = retentionDaysByOwner.get(row.owner_id)
        const trashedAt = Date.parse(row.trashed_at || '')
        if (!Number.isFinite(trashedAt) || trashedAt > nowMs - retentionDays * 86_400_000) {
          skippedByRetention += 1
          continue
        }
        if (Number(row.has_share) === 1) {
          skippedByShare += 1
          continue
        }
        eligible.push(row)
        if (eligible.length >= limit) break
      }
      if (eligible.length >= limit || rows.length < scanBatchSize) break
      offset += rows.length
    }
    const summary = {
      scannedCount,
      eligibleCount: eligible.length,
      skippedByRetention,
      skippedByShare,
      deletedCount: 0,
      deletedFeatureCount: 0,
      deletedByteSize: 0,
      dryRun: options.dryRun === true,
    }
    if (options.dryRun === true || eligible.length === 0) return summary

    this.database.transaction(() => {
      const markSyncKey = this.database.prepare(`
        UPDATE kml_sync_create_keys SET deleted_at = ? WHERE kml_id = ?
      `)
      const remove = this.database.prepare(`
        DELETE FROM kml_documents
        WHERE id = ? AND status = 'trashed'
          AND NOT EXISTS (SELECT 1 FROM kml_share_items i WHERE i.kml_id = kml_documents.id)
      `)
      eligible.forEach(row => {
        const result = remove.run(row.id)
        if (Number(result.changes) !== 1) return
        markSyncKey.run(now, row.id)
        summary.deletedCount += 1
        summary.deletedFeatureCount += Number(row.feature_count || 0)
        summary.deletedByteSize += Number(row.byte_size || 0)
        this.insertAudit({
          actorUserId: null,
          action: 'kml.trash-expire',
          targetType: 'kml',
          targetId: row.id,
          metadata: {
            ownerId: row.owner_id,
            name: sanitizeSyncDetailText(row.name, 200),
            featureCount: Number(row.feature_count || 0),
            byteSize: Number(row.byte_size || 0),
            retentionCutoff: new Date(nowMs - retentionDaysByOwner.get(row.owner_id) * 86_400_000).toISOString(),
          },
        })
      })
    })
    return summary
  }

  cleanupExpiredKmlTrash (options = {}) {
    return this.purgeExpiredKmlTrash(options)
  }

  deleteKmlPermanently (actor, kmlId) {
    return this.permanentDeleteKml(actor, kmlId)
  }

  importKml (actor, input = {}, options = {}) {
    this.assertPermission(actor, 'kml.own.write')
    requireObject(input)
    const text = String(input.kmlText || '')
    const sourceByteSize = Buffer.byteLength(text, 'utf8')
    const quota = this.quotaForUser(this.actorUser(actor).id)
    if (sourceByteSize > quota.maxKmlFileBytes) {
      throw createHttpError('KML 文件超过单文件大小限制', 413, 'FILE_TOO_LARGE')
    }
    const parsed = parseKmlText(text)
    const created = this.createKml(actor, {
      name: input.name || parsed.name || String(input.fileName || '').replace(/\.kml$/i, ''),
      description: input.description !== undefined ? input.description : parsed.description,
      features: parsed.features,
      sourceType: 'imported',
      coordCorrection: input.coordCorrection,
      theme: input.theme,
      color: input.color,
    }, {
      sourceType: 'imported',
      sourceByteSize,
      ...(options.syncClientId ? { syncClientId: options.syncClientId } : {}),
    })
    return parsed.warnings?.length
      ? { ...created, warnings: parsed.warnings.slice(0, 10) }
      : created
  }

  exportKml (actor, kmlId) {
    const document = this.getKml(actor, kmlId)
    return {
      filename: `${document.name.replace(/[\\/:*?"<>|]/g, '_') || 'map'}.kml`,
      contentType: 'application/vnd.google-earth.kml+xml; charset=utf-8',
      content: generateKmlText(document.name, document.features, document.description),
    }
  }

  syncOperationFileName (ownerId, operation = {}) {
    const kmlId = String(operation.kmlId || operation.id || '').slice(0, 160)
    if (kmlId) {
      const row = this.database.prepare(`
        SELECT name FROM kml_documents WHERE id = ? AND owner_id = ?
      `).get(kmlId, ownerId)
      if (row?.name) return sanitizeSyncDetailText(row.name, 200)
    }
    const clientId = String(operation.clientId || '').slice(0, 160)
    if (clientId) {
      const row = this.database.prepare(`
        SELECT d.name
        FROM kml_sync_create_keys k
        LEFT JOIN kml_documents d ON d.id = k.kml_id AND d.owner_id = k.owner_id
        WHERE k.owner_id = ? AND k.client_id = ?
      `).get(ownerId, clientId)
      if (row?.name) return sanitizeSyncDetailText(row.name, 200)
    }
    const data = operation.data || operation.file || operation
    return sanitizeSyncDetailText(data?.name, 200)
  }

  attachSyncOperationError (ownerId, operation, operationIndex, error) {
    if (!error || typeof error !== 'object') return error
    const action = sanitizeSyncDetailText(operation?.action || operation?.operation, 40)
    const kmlId = String(operation?.kmlId || operation?.id || '').slice(0, 160)
    const clientId = String(operation?.clientId || '').slice(0, 160)
    const errorCode = sanitizeSyncDetailText(error.code || 'SYNC_FAILED', 80)
    if (!Object.prototype.hasOwnProperty.call(KML_SYNC_ERROR_SUGGESTIONS, errorCode)) return error
    const reason = sanitizeSyncDetailText(error.message || '同步操作失败', 500)
    const details = {
      operationIndex: Number(operationIndex),
      action,
      kmlId: kmlId || null,
      clientId: clientId || null,
      fileName: this.syncOperationFileName(ownerId, operation),
      errorCode,
      reason,
      suggestion: KML_SYNC_ERROR_SUGGESTIONS[errorCode],
    }
    error.details = details
    error.exposeDetails = true
    return error
  }

  syncKml (actor, input = {}) {
    this.assertPermission(actor, 'kml.own.write')
    requireObject(input)
    const operations = input.operations || input.changes
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > 100) {
      throw createHttpError('同步操作数量需为 1～100 条', 400, 'VALIDATION_FAILED')
    }
    // A client can temporarily submit an incomplete working set while a page
    // is loading or recovering from a conflict. Never allow that state to
    // turn into a deletion: every trash operation must carry an explicit
    // confirmation marker produced by a user deletion action.
    const trashCount = operations.reduce((count, rawOperation) => {
      if (!rawOperation || typeof rawOperation !== 'object') return count
      const action = String(rawOperation.action || rawOperation.operation || '')
      return count + (action === 'trash' ? 1 : 0)
    }, 0)
    const deletionIntent = String(input.deletionIntent || '')
    if (trashCount > 0 && !['user-confirmed', 'user-confirmed-batch'].includes(deletionIntent)) {
      throw createHttpError('移入回收站前需要用户确认', 409, 'KML_DELETE_CONFIRMATION_REQUIRED')
    }
    return this.database.transaction(() => {
      this.ensureDefaultKmlForOwner(this.actorUser(actor).id)
      const ownerId = this.actorUser(actor).id
      const results = operations.map((rawOperation, index) => {
        const operation = rawOperation && typeof rawOperation === 'object' ? rawOperation : {}
        try {
          const normalizedOperation = requireObject(rawOperation, `第 ${index + 1} 条同步操作格式不正确`)
          const action = String(normalizedOperation.action || normalizedOperation.operation || '')
          if (action === 'create') {
            const clientId = normalizeSyncClientId(normalizedOperation.clientId)
            const document = this.createKml(actor, normalizedOperation.data || normalizedOperation.file || {}, {
              skipEnsureDefault: true,
              syncClientId: clientId,
            })
            return { action, clientId, document }
          }
          const kmlId = String(normalizedOperation.kmlId || normalizedOperation.id || '')
          if (action === 'update') return { action, document: this.updateKml(actor, kmlId, normalizedOperation.data || normalizedOperation.file || normalizedOperation) }
          if (action === 'trash') {
            if (kmlId) return { action, document: this.trashKml(actor, kmlId) }
            const clientId = normalizeSyncClientId(normalizedOperation.clientId)
            const document = this.trashKmlBySyncClientId(actor, clientId)
            return {
              action,
              clientId,
              ...(document ? { document } : { result: { status: 'absent' } }),
            }
          }
          if (action === 'restore') {
            if (kmlId) return { action, document: this.restoreKml(actor, kmlId) }
            const clientId = normalizeSyncClientId(normalizedOperation.clientId)
            const document = this.restoreKmlBySyncClientId(actor, clientId)
            return {
              action,
              clientId,
              ...(document ? { document } : { result: { status: 'absent' } }),
            }
          }
          // Permanent deletion is intentionally not part of the incremental sync
          // protocol. It requires an explicit password re-authentication through
          // DELETE /kml/files/:id/permanent; accepting it here would let any
          // authenticated writer bypass that second factor.
          if (action === 'deletePermanent') {
            throw createHttpError(
              '永久删除必须通过密码二次验证接口执行',
              409,
              'REAUTH_REQUIRED'
            )
          }
          throw createHttpError('同步操作类型不正确', 400, 'VALIDATION_FAILED')
        } catch (error) {
          this.attachSyncOperationError(ownerId, operation, index, error)
          throw error
        }
      })
      return { results, syncedAt: this.nowIso() }
    })
  }

  syncKmlFiles (actor, input = {}) {
    return this.syncKml(actor, input)
  }

  uniqueMigratedName (ownerId, desiredName) {
    const baseName = String(desiredName).slice(0, 190)
    let candidate = baseName
    let sequence = 2
    while (this.database.prepare(`
      SELECT 1 FROM kml_documents WHERE owner_id = ? AND name = ?
    `).get(ownerId, candidate)) {
      candidate = `${baseName} (${sequence})`.slice(0, 200)
      sequence += 1
    }
    return candidate
  }

  migrateLocalKml (actor, input = {}) {
    this.assertPermission(actor, 'kml.own.write')
    requireObject(input)
    const ownerId = this.actorUser(actor).id
    const batchId = normalizeText(input.batchId, {
      minLength: 8,
      maxLength: 128,
      message: '迁移批次 ID 长度需为 8～128 个字符',
    })
    const repeated = this.database.prepare(`
      SELECT result_json FROM local_migration_batches WHERE user_id = ? AND batch_id = ?
    `).get(ownerId, batchId)
    if (repeated) return { ...parseJson(repeated.result_json, {}), idempotent: true }
    if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > 100) {
      throw createHttpError('迁移文件数量需为 1～100 个', 400, 'VALIDATION_FAILED')
    }
    const conflictStrategy = String(input.conflictStrategy || 'rename')
    if (!['rename', 'skip'].includes(conflictStrategy)) {
      throw createHttpError('重名处理策略只支持 rename 或 skip', 400, 'VALIDATION_FAILED')
    }
    return this.database.transaction(() => {
      this.ensureDefaultKmlForOwner(ownerId)
      const imported = []
      const skipped = []
      input.files.forEach((rawFile, index) => {
        const file = requireObject(rawFile, `第 ${index + 1} 个迁移文件格式不正确`)
        const localId = String(file.id || file.localId || `local-${index + 1}`)
        const wasLocalDefault = localId === 'default-kml' || file.isDefault === true
        let name = normalizeText(file.name, {
          fallback: wasLocalDefault ? '本地默认标注' : '迁移的 KML',
          minLength: 1,
          maxLength: 180,
        })
        if (wasLocalDefault) name = `${name}（本地默认）`.slice(0, 200)
        const nameExists = this.database.prepare(`
          SELECT 1 FROM kml_documents WHERE owner_id = ? AND name = ?
        `).get(ownerId, name)
        if (nameExists && conflictStrategy === 'skip') {
          skipped.push({ localId, reason: 'NAME_CONFLICT' })
          return
        }
        if (nameExists) name = this.uniqueMigratedName(ownerId, name)
        const document = this.createKmlForOwner(ownerId, {
          ...file,
          id: undefined,
          name,
          isDefault: false,
          sourceType: 'migrated',
        }, { sourceType: 'migrated' })
        imported.push({ localId, kmlId: document.id, name: document.name })
      })
      const result = {
        batchId,
        imported,
        skipped,
        importedCount: imported.length,
        skippedCount: skipped.length,
        createdAt: this.nowIso(),
        idempotent: false,
      }
      this.database.prepare(`
        INSERT INTO local_migration_batches(user_id, batch_id, result_json, created_at)
        VALUES (?, ?, ?, ?)
      `).run(ownerId, batchId, JSON.stringify(result), result.createdAt)
      this.insertAudit({
        actorUserId: ownerId,
        action: 'kml.local-migration',
        targetType: 'migration-batch',
        targetId: batchId,
        metadata: { importedCount: imported.length, skippedCount: skipped.length },
      })
      return result
    })
  }

  favoriteViewFromRow (row) {
    const sourceType = row.source_type
    const sourceRef = row.source_ref || ''
    let sourceAvailable = true
    if (sourceType === 'kml' && sourceRef) {
      sourceAvailable = Boolean(this.database.prepare(`
        SELECT 1 FROM kml_documents
        WHERE id = ? AND owner_id = ? AND status = 'active'
      `).get(sourceRef, row.owner_id))
    }
    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      note: row.note,
      longitude: Number(row.longitude),
      latitude: Number(row.latitude),
      sourceType,
      sourceRef,
      sourceAvailable,
      address: row.address,
      category: row.category,
      tags: parseJson(row.tags_json, []),
      color: row.color,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  requireFavorite (actor, favoriteId) {
    this.assertPermission(actor, 'favorite.own.manage')
    const ownerId = this.actorUser(actor).id
    const row = this.database.prepare(`
      SELECT * FROM favorite_places WHERE id = ? AND owner_id = ?
    `).get(String(favoriteId || ''), ownerId)
    if (!row) throw createHttpError('资源不存在', 404, 'RESOURCE_NOT_FOUND')
    return row
  }

  assertFavoriteSource (ownerId, favorite) {
    if (favorite.sourceType !== 'kml' || !favorite.sourceRef) return
    const exists = this.database.prepare(`
      SELECT 1 FROM kml_documents WHERE id = ? AND owner_id = ?
    `).get(favorite.sourceRef, ownerId)
    if (!exists) throw createHttpError('来源 KML 不存在', 404, 'RESOURCE_NOT_FOUND')
  }

  createFavorite (actor, input = {}) {
    this.assertPermission(actor, 'favorite.own.manage')
    const ownerId = this.actorUser(actor).id
    const favorite = normalizeFavoriteInput(input)
    this.assertFavoriteSource(ownerId, favorite)
    const now = this.nowIso()
    const id = randomId('fav')
    this.database.prepare(`
      INSERT INTO favorite_places(
        id, owner_id, name, note, longitude, latitude, source_type, source_ref,
        address, category, tags_json, color, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, ownerId, favorite.name, favorite.note, favorite.longitude, favorite.latitude,
      favorite.sourceType, favorite.sourceRef, favorite.address, favorite.category,
      JSON.stringify(favorite.tags), favorite.color, now, now
    )
    return this.getFavorite(actor, id)
  }

  getFavorite (actor, favoriteId) {
    return this.favoriteViewFromRow(this.requireFavorite(actor, favoriteId))
  }

  updateFavorite (actor, favoriteId, input = {}) {
    const row = this.requireFavorite(actor, favoriteId)
    const current = this.favoriteViewFromRow(row)
    const favorite = normalizeFavoriteInput(input, current)
    this.assertFavoriteSource(row.owner_id, favorite)
    const now = this.nowIso()
    this.database.prepare(`
      UPDATE favorite_places SET
        name = ?, note = ?, longitude = ?, latitude = ?, source_type = ?, source_ref = ?,
        address = ?, category = ?, tags_json = ?, color = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(
      favorite.name, favorite.note, favorite.longitude, favorite.latitude,
      favorite.sourceType, favorite.sourceRef, favorite.address, favorite.category,
      JSON.stringify(favorite.tags), favorite.color, now, row.id, row.owner_id
    )
    return this.getFavorite(actor, row.id)
  }

  deleteFavorite (actor, favoriteId) {
    const row = this.requireFavorite(actor, favoriteId)
    this.database.prepare('DELETE FROM favorite_places WHERE id = ? AND owner_id = ?').run(row.id, row.owner_id)
    return { id: row.id, status: 'deleted' }
  }

  listFavorites (actor, input = {}) {
    this.assertPermission(actor, 'favorite.own.manage')
    const ownerId = this.actorUser(actor).id
    const { page, limit } = normalizePage(input)
    const sourceType = input.sourceType ? String(input.sourceType) : ''
    if (sourceType && !FAVORITE_SOURCE_TYPES.has(sourceType)) {
      throw createHttpError('收藏来源类型不正确', 400, 'VALIDATION_FAILED')
    }
    const search = String(input.search || '').toLocaleLowerCase()
    const category = String(input.category || '').toLocaleLowerCase()
    const tag = String(input.tag || '').toLocaleLowerCase()
    if (input.sort !== undefined && !['name', 'createdAt', 'updatedAt'].includes(input.sort)) {
      throw createHttpError('收藏排序字段不正确', 400, 'VALIDATION_FAILED')
    }
    const sort = input.sort || 'updatedAt'
    const order = normalizeOrder(input.order) === 'asc' ? 1 : -1
    const rows = this.database.prepare(`
      SELECT * FROM favorite_places WHERE owner_id = ?
    `).all(ownerId).map(row => this.favoriteViewFromRow(row))
    const filtered = rows.filter(item => {
      if (sourceType && item.sourceType !== sourceType) return false
      if (category && item.category.toLocaleLowerCase() !== category) return false
      if (tag && !item.tags.some(itemTag => itemTag.toLocaleLowerCase() === tag)) return false
      if (!search) return true
      return [item.name, item.address, item.note, item.category, ...item.tags]
        .some(value => String(value).toLocaleLowerCase().includes(search))
    })
    const sortField = { name: 'name', createdAt: 'createdAt', updatedAt: 'updatedAt' }[sort]
    filtered.sort((left, right) => {
      const compared = String(left[sortField]).localeCompare(String(right[sortField]), 'zh-CN')
      return compared === 0 ? left.id.localeCompare(right.id) : compared * order
    })
    return {
      items: filtered.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total: filtered.length,
    }
  }

  requireOwnedShare (actor, shareId) {
    this.assertPermission(actor, 'share.own.manage')
    const ownerId = this.actorUser(actor).id
    const row = this.database.prepare(`
      SELECT * FROM kml_shares WHERE id = ? AND owner_id = ?
    `).get(String(shareId || ''), ownerId)
    if (!row) throw createHttpError('资源不存在', 404, 'RESOURCE_NOT_FOUND')
    return row
  }

  effectiveShareStatus (row) {
    if (!row) return 'missing'
    if (row.status !== 'active') return row.status
    const expiresAt = Date.parse(row.expires_at || '')
    if (Number.isFinite(expiresAt) && expiresAt <= this.clock()) return 'expired'
    return 'active'
  }

  shareItemsForOwner (shareId) {
    return this.database.prepare(`
      SELECT i.*, k.name AS kml_name, k.description AS kml_description,
             k.status AS kml_status, k.feature_count, k.bounds_json, k.byte_size, k.revision
      FROM kml_share_items i
      LEFT JOIN kml_documents k ON k.id = i.kml_id
      WHERE i.share_id = ?
      ORDER BY i.position, i.id
    `).all(shareId).map(row => {
      const publishedRevision = Number(row.published_revision || 0)
      const sourceRevision = Number(row.revision || 0)
      return {
        id: row.id,
        kmlId: row.kml_id,
        position: Number(row.position),
        visibleByDefault: Boolean(row.visible_by_default),
        displayName: row.display_name || '',
        directoryId: row.source_directory_id || row.directory_id || null,
        directoryName: row.directory_name || '',
        sourcePosition: Number(row.source_position || 0),
        name: row.kml_name,
        status: row.kml_status,
        featureCount: Number(row.feature_count),
        bounds: normalizeKmlBounds(parseJson(row.bounds_json, null), { featureCount: Number(row.feature_count || 0) }),
        byteSize: Number(row.byte_size),
        revision: sourceRevision,
        sourceRevision,
        publishedRevision,
        publishedAt: row.published_at || null,
        syncStatus: publishedRevision === sourceRevision ? 'synced' : 'pending',
      }
    })
  }

  shareViewFromRow (row, options = {}) {
    const result = {
      id: row.id,
      publicId: row.public_id,
      ownerId: row.owner_id,
      title: row.title,
      description: row.description,
      status: this.effectiveShareStatus(row),
      storedStatus: row.status,
      accessMode: row.access_mode,
      passwordProtected: Boolean(row.password_hash),
      allowDownload: Boolean(row.allow_download),
      expiresAt: row.expires_at || null,
      viewConfig: parseJson(row.view_config_json, {}),
      spatialAccess: this.shareSpatialView(row),
      passwordAccess: this.passwordAccessView(row),
      revision: Number(row.revision),
      contentRevision: Number(row.content_revision || 1),
      contentPublishedAt: row.content_published_at || null,
      blockedReason: row.status === 'blocked' ? row.blocked_reason : '',
      accessCount: Number(row.access_count),
      shareUrl: `/share/${row.public_id}`,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAccessedAt: row.last_accessed_at || null,
      analytics: this.shareAnalyticsView(row),
    }
    if (options.includeItems) result.items = this.shareItemsForOwner(row.id)
    result.itemCount = options.includeItems
      ? result.items.length
      : Number(this.database.prepare('SELECT COUNT(*) AS count FROM kml_share_items WHERE share_id = ?').get(row.id)?.count || 0)
    result.pendingSyncItemCount = options.includeItems
      ? result.items.filter(item => item.syncStatus === 'pending').length
      : Number(this.database.prepare(`
          SELECT COUNT(*) AS count
          FROM kml_share_items i
          JOIN kml_documents k ON k.id = i.kml_id
          WHERE i.share_id = ? AND i.published_revision != k.revision
        `).get(row.id)?.count || 0)
    result.syncStatus = result.pendingSyncItemCount > 0 ? 'pending' : 'synced'
    return result
  }

  shareModerationViewFromRow (actor, row, options = {}) {
    const canInspectContent = this.hasPermission(actor, 'kml.any.read') ||
      this.hasPermission(actor, 'kml.any.manage')
    const result = this.shareViewFromRow(row, {
      includeItems: canInspectContent && options.includeItems === true,
    })
    if (canInspectContent) return result

    delete result.publicId
    delete result.shareUrl
    delete result.description
    delete result.viewConfig
    delete result.items
    return result
  }

  normalizeShareItems (ownerId, value, options = {}) {
    if (!Array.isArray(value)) {
      throw createHttpError('分享文件列表必须是数组', 400, 'VALIDATION_FAILED')
    }
    const configuredMaximum = Number(this.getSettings().share.maxFilesPerShare)
    const maximum = Number.isSafeInteger(configuredMaximum) && configuredMaximum > 0
      ? configuredMaximum
      : 20
    const minimum = options.allowEmpty ? 0 : 1
    if (value.length < minimum) throw createHttpError(`分享包至少需包含 ${minimum} 个 KML`, 400, 'VALIDATION_FAILED')
    const seen = new Set()
    const expanded = value.flatMap((rawItem, sourceIndex) => {
      const item = requireObject(rawItem, `第 ${sourceIndex + 1} 个分享项格式不正确`)
      const kmlId = String(item.kmlId || '')
      const requestedDirectoryId = normalizeKmlDirectoryId(item.directoryId)
      if (Boolean(kmlId) === Boolean(requestedDirectoryId)) {
        throw createHttpError('分享项必须且只能指定一个 KML 文件或目录', 400, 'VALIDATION_FAILED')
      }
      const documents = requestedDirectoryId
        ? this.database.prepare(`
            SELECT k.*, d.name AS directory_name
            FROM kml_documents k
            JOIN kml_directories d ON d.id = k.directory_id AND d.owner_id = k.owner_id
            WHERE k.owner_id = ? AND k.directory_id = ? AND k.status = 'active'
            ORDER BY k.position, k.id
          `).all(ownerId, requestedDirectoryId)
        : [this.database.prepare(`
        SELECT id, name, description, coord_correction, theme, color,
               lock_drag, enabled, is_live_track, features_json,
               feature_count, bounds_json, byte_size, revision, updated_at,
               directory_id, position,
               (SELECT name FROM kml_directories WHERE id = kml_documents.directory_id) AS directory_name
        FROM kml_documents
        WHERE id = ? AND owner_id = ? AND status = 'active'
      `).get(kmlId, ownerId)].filter(Boolean)
      if (!documents.length) {
        throw createHttpError(requestedDirectoryId ? '分享目录不存在或没有可分享的 KML' : '分享文件不存在', 404, 'RESOURCE_NOT_FOUND')
      }
      const requestedPosition = Number(item.position)
      return documents.flatMap((document, directoryIndex) => {
        if (seen.has(document.id)) return []
        seen.add(document.id)
        return [{
          kmlId: document.id,
          sourceIndex,
          directoryIndex,
          requestedPosition: Number.isFinite(requestedPosition) ? requestedPosition : sourceIndex,
          visibleByDefault: normalizeBoolean(item.visibleByDefault, true),
          displayName: kmlId ? normalizeText(item.displayName, { maxLength: 200 }) : '',
          sourceDirectoryId: document.directory_id || null,
          directoryName: document.directory_name || '',
          sourcePosition: Number(document.position || 0),
          name: document.name,
          revision: Number(document.revision),
          features: parseJson(document.features_json, []),
          publishedSnapshot: this.publishedSnapshotFromDocument(document),
        }]
      })
    })
    if (expanded.length < minimum || expanded.length > maximum) {
      throw createHttpError(`分享包需包含 ${minimum}～${maximum} 个 KML`, 400, 'VALIDATION_FAILED')
    }
    return expanded.sort((left, right) => left.requestedPosition - right.requestedPosition || left.directoryIndex - right.directoryIndex || left.sourcePosition - right.sourcePosition || left.sourceIndex - right.sourceIndex || left.kmlId.localeCompare(right.kmlId))
      .map((item, position) => ({ ...item, position }))
  }

  publishedSnapshotFromDocument (row) {
    const features = sanitizePublishedKmlFeatures(parseJson(row.features_json, []))
    const storedBounds = normalizeKmlBounds(
      parseJson(row.bounds_json, null),
      { featureCount: Number(row.feature_count || features.length || 0) },
    )
    return preparePublishedInteractionSnapshot({
      name: row.name,
      description: row.description || '',
      coordCorrection: row.coord_correction,
      theme: row.theme,
      color: row.color,
      lockDrag: Boolean(row.lock_drag),
      enabled: Boolean(row.enabled),
      isLiveTrack: Boolean(row.is_live_track),
      features,
      featureCount: Number(row.feature_count || 0),
      bounds: storedBounds || computeKmlBounds(features),
      byteSize: Number(row.byte_size || 0),
      revision: Number(row.revision || 0),
      updatedAt: row.updated_at,
    }, { force: true, phase: 'publish' })
  }

  replaceShareItems (shareId, items, publishedAt = this.nowIso()) {
    const share = this.database.prepare('SELECT public_id FROM kml_shares WHERE id = ?').get(shareId)
    const publicDirectoryIds = new Map()
    const preparedItems = items.map(item => {
      const snapshot = item.publishedSnapshot?.resourceRefsVersion === undefined
        ? decoratePublishedSnapshot(item.publishedSnapshot)
        : item.publishedSnapshot
      return {
        ...item,
        id: item.id || randomId('shi'),
        directoryId: item.sourceDirectoryId
          ? (publicDirectoryIds.get(item.sourceDirectoryId) || (() => {
              const id = item.directoryId || randomId('shd')
              publicDirectoryIds.set(item.sourceDirectoryId, id)
              return id
            })())
          : null,
        publishedSnapshot: snapshot,
      }
    })
    preparedItems.forEach(item => {
      const issues = inspectPublishedResourceReferences(item.publishedSnapshot, {
        requireShareIds: true,
        sharePublicId: share?.public_id,
        shareItemId: item.id,
      })
      if (issues.length) {
        throw createHttpError(
          `公开快照资源引用校验失败：${issues[0].message}`,
          409,
          'PUBLISHED_RESOURCE_REFERENCE_INVALID'
        )
      }
    })
    this.markPublishedResourceCollectionBindingsStale(shareId)
    this.database.prepare('DELETE FROM kml_share_items WHERE share_id = ?').run(shareId)
    const insert = this.database.prepare(`
      INSERT INTO kml_share_items(
        id, share_id, kml_id, position, visible_by_default, display_name,
        published_revision, published_snapshot_json, published_at,
        directory_id, source_directory_id, directory_name, source_position
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    preparedItems.forEach(item => {
      insert.run(
        item.id, shareId, item.kmlId, item.position,
        item.visibleByDefault ? 1 : 0, item.displayName,
        item.publishedRevision ?? item.revision,
        JSON.stringify(item.publishedSnapshot),
        item.publishedAt || publishedAt,
        item.directoryId || null,
        item.sourceDirectoryId || null,
        item.directoryName || '',
        Number(item.sourcePosition || 0)
      )
    })
    this.syncPublishedResourceCollectionBindings(shareId, preparedItems)
  }

  createShare (actor, input = {}) {
    this.assertPermission(actor, 'share.own.manage')
    requireObject(input)
    const ownerId = this.actorUser(actor).id
    const items = this.normalizeShareItems(ownerId, input.items)
    const settings = this.getSettings()
    const title = normalizeText(input.title, {
      fallback: items.map(item => item.name).join('、').slice(0, 200),
      minLength: 1,
      maxLength: 200,
      message: '分享标题长度需为 1～200 个字符',
    })
    const description = normalizeText(input.description, { maxLength: 5000 })
    const status = normalizeEnum(input.status, SHARE_EDITABLE_STATUSES, 'active', '分享状态不正确')
    const allowDownload = normalizeBoolean(input.allowDownload, true)
    const expiresAt = normalizeExpiresAt(input.expiresAt)
    const viewConfig = normalizeViewConfig(input.viewConfig)
    const analyticsConfig = normalizeShareAnalyticsConfig(input.analytics, settings.analytics?.share)
    const passwordHash = normalizeSharePassword(input.password, null)
    assertPasswordlessSharingAllowed(passwordHash, settings)
    const passwordSecret = passwordHash
      ? encryptSecret(String(input.password), this.shareSecretEncryptionKey)
      : ''
    const spatialAccess = normalizeSpatialAccessSettings(input.spatialAccess, 'unrestricted')
    const spatialAccessMode = spatialAccess.mode
    const spatialState = this.resolveShareSpatialState(items, spatialAccessMode, settings, spatialAccess)
    let passwordAccessTtlMode = normalizePasswordAccessTtlMode(input.passwordAccess, 'finite')
    this.assertPasswordAccessMode(
      passwordAccessTtlMode,
      passwordHash,
      spatialAccessMode,
      spatialState,
      settings
    )
    if (!passwordHash) passwordAccessTtlMode = 'finite'
    const now = this.nowIso()
    const id = randomId('shr')
    const publicId = randomToken(24)
    const spatialScopeRevision = spatialAccessMode === 'kml_bounds' ? 1 : 0
    const accessPolicyRevision = Number(settings.share.spatialPolicyRevision || 1)
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO kml_shares(
          id, public_id, owner_id, title, description, status, access_mode,
          password_hash, password_secret, allow_download, expires_at, view_config_json, revision,
          spatial_access_mode, password_access_ttl_mode, spatial_scope_json,
          spatial_scope_revision, spatial_status, spatial_error_code,
          password_version, access_policy_revision, content_revision, content_published_at,
          analytics_config_json, analytics_disabled, analytics_disabled_reason,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'public_link', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?, 0, '', ?, ?)
      `).run(
        id, publicId, ownerId, title, description, status, passwordHash, passwordSecret,
        allowDownload ? 1 : 0, expiresAt, JSON.stringify(viewConfig),
        spatialAccessMode, passwordAccessTtlMode, JSON.stringify(spatialState.scope || {}),
        spatialScopeRevision, spatialState.status, spatialState.errorCode || '',
        accessPolicyRevision, now, JSON.stringify(analyticsConfig), now, now
      )
      this.replaceShareItems(id, items, now)
      this.insertAudit({
        actorUserId: ownerId,
        action: 'share.create',
        targetType: 'kml-share',
        targetId: id,
        metadata: {
          itemCount: items.length,
          passwordProtected: Boolean(passwordHash),
          expiresAt,
          spatialAccessMode,
          passwordAccessTtlMode: passwordHash ? passwordAccessTtlMode : 'not_applicable',
          areaKm2: spatialState.scope?.areaKm2 || null,
          diagonalKm: spatialState.scope?.diagonalKm || null,
        },
      })
      if (spatialAccessMode === 'kml_bounds') {
        this.insertAudit({
          actorUserId: ownerId,
          action: 'share.spatial.enable',
          targetType: 'kml-share',
          targetId: id,
          metadata: {
            spatialScopeRevision,
            areaKm2: spatialState.scope?.areaKm2 || null,
            diagonalKm: spatialState.scope?.diagonalKm || null,
          },
        })
      }
      if (passwordHash && passwordAccessTtlMode === 'unlimited') {
        this.insertAudit({
          actorUserId: ownerId,
          action: 'share.password-access.unlimited.enable',
          targetType: 'kml-share',
          targetId: id,
          metadata: { spatialScopeRevision, accessPolicyRevision },
        })
      }
    })
    return this.getShare(actor, id)
  }

  getShare (actor, shareId) {
    return this.shareViewFromRow(this.requireOwnedShare(actor, shareId), { includeItems: true })
  }

  listShares (actor, input = {}) {
    this.assertPermission(actor, 'share.own.manage')
    const ownerId = this.actorUser(actor).id
    const { page, limit } = normalizePage(input)
    const rows = this.database.prepare(`
      SELECT * FROM kml_shares WHERE owner_id = ? ORDER BY updated_at DESC, id ASC
    `).all(ownerId).map(row => this.shareViewFromRow(row))
    const status = String(input.status || '')
    if (status && !['draft', 'active', 'paused', 'revoked', 'blocked', 'expired'].includes(status)) {
      throw createHttpError('分享状态筛选值不正确', 400, 'VALIDATION_FAILED')
    }
    const search = String(input.search || '').toLocaleLowerCase()
    const filtered = rows.filter(row => {
      if (status && row.status !== status) return false
      if (search && !`${row.title}\n${row.description}`.toLocaleLowerCase().includes(search)) return false
      return true
    })
    return {
      items: filtered.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total: filtered.length,
    }
  }

  updateShare (actor, shareId, input = {}) {
    const row = this.requireOwnedShare(actor, shareId)
    requireObject(input)
    if (row.status === 'revoked') {
      throw createHttpError('已撤销的分享不能修改', 409, 'SHARE_REVOKED')
    }
    const requestedRevision = normalizeRevision(input.revision, { optional: true })
    if (requestedRevision !== null && requestedRevision !== Number(row.revision)) {
      throw createHttpError('分享配置已被其他客户端更新', 409, 'SHARE_REVISION_CONFLICT')
    }
    const current = this.shareViewFromRow(row, { includeItems: true })
    const settings = this.getSettings()
    let items = input.items === undefined
      ? current.items.map(item => ({
          kmlId: item.kmlId,
          ...(item.directoryId && !item.kmlId ? { directoryId: item.directoryId } : {}),
          position: item.position,
          visibleByDefault: item.visibleByDefault,
          displayName: item.displayName,
        }))
      : this.normalizeShareItems(row.owner_id, input.items, { allowEmpty: true })
    if (input.items !== undefined && items.length > 0) {
      const publishedRows = this.database.prepare(`
        SELECT id, kml_id, published_revision, published_snapshot_json, published_at,
               directory_id, source_directory_id, directory_name, source_position
        FROM kml_share_items WHERE share_id = ?
      `).all(row.id)
      const publishedByKmlId = new Map(publishedRows.map(item => [item.kml_id, item]))
      items = items.map(item => {
        const existing = publishedByKmlId.get(item.kmlId)
        if (!existing) return item
        return {
          ...item,
          id: existing.id,
          publishedRevision: Number(existing.published_revision || 0),
          publishedSnapshot: parseJson(existing.published_snapshot_json, item.publishedSnapshot),
          publishedAt: existing.published_at || null,
          // The public directory identifier is stable for the same source
          // directory, while an explicit save refreshes its current label and
          // order metadata for the new snapshot.
          directoryId: item.sourceDirectoryId &&
            item.sourceDirectoryId === (existing.source_directory_id || null)
            ? (existing.directory_id || item.directoryId || null)
            : (item.directoryId || null),
          sourceDirectoryId: item.sourceDirectoryId || existing.source_directory_id || null,
          directoryName: item.directoryName || existing.directory_name || '',
          sourcePosition: Number(item.sourcePosition ?? existing.source_position ?? 0),
        }
      })
    }
    const spatialItems = input.items === undefined
      ? this.shareItemsForSpatialScope(row.id)
      : items.map(item => ({
          kmlId: item.kmlId,
          revision: item.publishedRevision ?? item.revision,
          features: Array.isArray(item.publishedSnapshot?.features)
            ? item.publishedSnapshot.features
            : [],
        }))
    let status = row.status
    if (input.status !== undefined) {
      if (row.status === 'blocked') {
        throw createHttpError('分享已被管理员封禁', 409, 'SHARE_BLOCKED')
      }
      status = normalizeEnum(input.status, SHARE_EDITABLE_STATUSES, row.status, '分享状态不正确')
    }
    if (items.length === 0) {
      throw createHttpError('分享包至少需要一个 KML；如不再需要该链接请直接删除分享', 409, 'SHARE_EMPTY')
    }
    const now = this.nowIso()
    const title = normalizeText(input.title, { fallback: row.title, minLength: 1, maxLength: 200 })
    const description = normalizeText(input.description, { fallback: row.description, maxLength: 5000 })
    const allowDownload = normalizeBoolean(input.allowDownload, Boolean(row.allow_download))
    const expiresAt = normalizeExpiresAt(input.expiresAt, row.expires_at || null)
    const viewConfig = normalizeViewConfig(input.viewConfig, parseJson(row.view_config_json, {}))
    const analyticsConfig = normalizeShareAnalyticsConfig(
      input.analytics,
      settings.analytics?.share,
      parseJson(row.analytics_config_json, {})
    )
    const passwordHash = normalizeSharePassword(input.password, row.password_hash)
    assertPasswordlessSharingAllowed(passwordHash, settings)
    const passwordSecret = input.password === undefined
      ? String(row.password_secret || '')
      : passwordHash
        ? encryptSecret(String(input.password), this.shareSecretEncryptionKey)
        : ''
    const previousSpatialMode = row.spatial_access_mode || 'unrestricted'
    const previousScope = parseJson(row.spatial_scope_json, null)
    const spatialAccess = normalizeSpatialAccessSettings(
      input.spatialAccess,
      previousSpatialMode,
      this.cappedSpatialTileZoom(previousScope?.unrestrictedTileMaxZoom, settings)
    )
    const spatialAccessMode = spatialAccess.mode
    const spatialState = this.resolveShareSpatialState(spatialItems, spatialAccessMode, settings, spatialAccess)
    let passwordAccessTtlMode = normalizePasswordAccessTtlMode(
      input.passwordAccess,
      row.password_access_ttl_mode || 'finite'
    )
    if (spatialAccessMode === 'unrestricted' && passwordAccessTtlMode === 'unlimited' &&
        input.passwordAccess === undefined) {
      passwordAccessTtlMode = 'finite'
    }
    this.assertPasswordAccessMode(
      passwordAccessTtlMode,
      passwordHash,
      spatialAccessMode,
      spatialState,
      settings
    )
    if (!passwordHash) passwordAccessTtlMode = 'finite'
    const scopeChanged = previousSpatialMode !== spatialAccessMode ||
      (previousScope?.sourceRevisionHash || '') !== (spatialState.scope?.sourceRevisionHash || '') ||
      row.spatial_status !== spatialState.status ||
      Number(previousScope?.paddingMeters || 0) !== Number(spatialState.scope?.paddingMeters || 0) ||
      normalizeUnrestrictedTileMaxZoom(previousScope?.unrestrictedTileMaxZoom) !==
        normalizeUnrestrictedTileMaxZoom(spatialState.scope?.unrestrictedTileMaxZoom)
    const spatialScopeRevision = Number(row.spatial_scope_revision || 0) + (scopeChanged ? 1 : 0)
    const passwordChanged = input.password !== undefined
    const passwordVersion = Number(row.password_version || 1) + (passwordChanged ? 1 : 0)
    const accessPolicyRevision = Number(settings.share.spatialPolicyRevision || 1)
    const unlimitedDisabled = (row.password_access_ttl_mode || 'finite') === 'unlimited' &&
      passwordAccessTtlMode !== 'unlimited'
    const contentChanged = input.items !== undefined
    const contentRevision = Number(row.content_revision || 1) + (contentChanged ? 1 : 0)
    const contentPublishedAt = contentChanged ? now : row.content_published_at
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE kml_shares SET
          title = ?, description = ?, status = ?, password_hash = ?, password_secret = ?, allow_download = ?,
          expires_at = ?, view_config_json = ?, spatial_access_mode = ?,
          password_access_ttl_mode = ?, spatial_scope_json = ?, spatial_scope_revision = ?,
          spatial_status = ?, spatial_error_code = ?, password_version = ?,
          access_policy_revision = ?, content_revision = ?, content_published_at = ?,
          analytics_config_json = ?,
          revision = revision + 1, updated_at = ?
        WHERE id = ?
      `).run(
        title, description, status, passwordHash, passwordSecret, allowDownload ? 1 : 0,
        expiresAt, JSON.stringify(viewConfig), spatialAccessMode,
        passwordAccessTtlMode, JSON.stringify(spatialState.scope || {}), spatialScopeRevision,
        spatialState.status, spatialState.errorCode || '', passwordVersion,
        accessPolicyRevision, contentRevision, contentPublishedAt,
        JSON.stringify(analyticsConfig), now, row.id
      )
      if (contentChanged) this.replaceShareItems(row.id, items, now)
      if (passwordChanged) this.revokeShareSessions(row.id, 'share.password.update')
      else if (unlimitedDisabled) {
        this.revokeShareSessions(row.id, 'share.password-access.unlimited.disable', { unlimitedOnly: true })
      }
      this.insertAudit({
        actorUserId: row.owner_id,
        action: 'share.update',
        targetType: 'kml-share',
        targetId: row.id,
        metadata: {
          itemCount: items.length,
          status,
          passwordChanged,
          spatialAccessMode,
          passwordAccessTtlMode: passwordHash ? passwordAccessTtlMode : 'not_applicable',
          spatialScopeRevision,
          areaKm2: spatialState.scope?.areaKm2 || null,
          diagonalKm: spatialState.scope?.diagonalKm || null,
        },
      })
      if (previousSpatialMode !== spatialAccessMode) {
        this.insertAudit({
          actorUserId: row.owner_id,
          action: spatialAccessMode === 'kml_bounds' ? 'share.spatial.enable' : 'share.spatial.disable',
          targetType: 'kml-share',
          targetId: row.id,
          metadata: { spatialScopeRevision },
        })
      }
      if ((row.password_access_ttl_mode || 'finite') !== passwordAccessTtlMode) {
        this.insertAudit({
          actorUserId: row.owner_id,
          action: passwordAccessTtlMode === 'unlimited'
            ? 'share.password-access.unlimited.enable'
            : 'share.password-access.unlimited.disable',
          targetType: 'kml-share',
          targetId: row.id,
          metadata: { spatialScopeRevision, accessPolicyRevision },
        })
      }
    })
    return this.getShare(actor, row.id)
  }

  syncShareContent (actor, shareId, input = {}) {
    const row = this.requireOwnedShare(actor, shareId)
    requireObject(input)
    const requestedRevision = normalizeRevision(input.revision)
    if (requestedRevision !== Number(row.revision)) {
      throw createHttpError('分享配置已被其他客户端更新', 409, 'SHARE_REVISION_CONFLICT')
    }
    if (row.status === 'revoked') {
      throw createHttpError('已撤销的分享不能同步', 409, 'SHARE_REVOKED')
    }

    const sourceItems = this.database.prepare(`
      SELECT i.id, i.kml_id, i.position, i.visible_by_default, i.display_name,
             i.directory_id, i.source_directory_id, i.directory_name, i.source_position,
             k.name, k.description, k.coord_correction, k.theme, k.color,
             k.lock_drag, k.enabled, k.is_live_track, k.features_json,
             k.feature_count, k.bounds_json, k.byte_size, k.revision, k.updated_at,
             k.directory_id AS current_directory_id,
             k.position AS current_position,
             d.name AS current_directory_name
      FROM kml_share_items i
      JOIN kml_documents k ON k.id = i.kml_id
      LEFT JOIN kml_directories d ON d.id = k.directory_id AND d.owner_id = k.owner_id
      WHERE i.share_id = ? AND k.status = 'active'
      ORDER BY i.position, i.id
    `).all(row.id)
    if (sourceItems.length === 0) throw createHttpError('分享包没有可用 KML', 409, 'SHARE_EMPTY')

    const publicDirectoryIds = new Map(sourceItems.flatMap(item => (
      item.current_directory_id &&
      item.current_directory_id === item.source_directory_id &&
      item.directory_id
        ? [[item.current_directory_id, item.directory_id]]
        : []
    )))
    const items = sourceItems.map(item => {
      const sourceDirectoryId = item.current_directory_id || null
      const publicDirectoryId = sourceDirectoryId
        ? (publicDirectoryIds.get(sourceDirectoryId) || (() => {
            const id = randomId('shd')
            publicDirectoryIds.set(sourceDirectoryId, id)
            return id
          })())
        : null
      return {
      id: item.id,
      kmlId: item.kml_id,
      revision: Number(item.revision),
      features: parseJson(item.features_json, []),
      position: Number(item.position),
      visibleByDefault: Boolean(item.visible_by_default),
      displayName: item.display_name || '',
      directoryId: publicDirectoryId,
      sourceDirectoryId,
      directoryName: item.current_directory_name || '',
      sourcePosition: Number(item.current_position || 0),
      publishedSnapshot: this.publishedSnapshotFromDocument(item),
      }
    })
    const settings = this.getSettings()
    const spatialMode = row.spatial_access_mode || 'unrestricted'
    const previousScope = parseJson(row.spatial_scope_json, null)
    const spatialState = this.resolveShareSpatialState(items, spatialMode, settings, {
      unrestrictedTileMaxZoom: this.cappedSpatialTileZoom(previousScope?.unrestrictedTileMaxZoom, settings),
    })
    const passwordHash = row.password_hash
    assertPasswordlessSharingAllowed(passwordHash, settings)
    const ttlMode = row.password_access_ttl_mode || 'finite'
    this.assertPasswordAccessMode(ttlMode, passwordHash, spatialMode, spatialState, settings)
    const scopeChanged = spatialMode === 'kml_bounds' && (
      (previousScope?.sourceRevisionHash || '') !== (spatialState.scope?.sourceRevisionHash || '') ||
      row.spatial_status !== spatialState.status ||
      Number(previousScope?.paddingMeters || 0) !== Number(spatialState.scope?.paddingMeters || 0) ||
      normalizeUnrestrictedTileMaxZoom(previousScope?.unrestrictedTileMaxZoom) !==
        normalizeUnrestrictedTileMaxZoom(spatialState.scope?.unrestrictedTileMaxZoom)
    )
    const now = this.nowIso()
    const policyRevision = Number(settings.share.spatialPolicyRevision || 1)
    this.database.transaction(() => {
      const current = this.database.prepare('SELECT revision FROM kml_shares WHERE id = ?').get(row.id)
      if (!current || Number(current.revision) !== requestedRevision) {
        throw createHttpError('分享配置已被其他客户端更新', 409, 'SHARE_REVISION_CONFLICT')
      }
      const currentRevisions = this.database.prepare(`
        SELECT i.kml_id, k.revision
        FROM kml_share_items i JOIN kml_documents k ON k.id = i.kml_id
        WHERE i.share_id = ? AND k.status = 'active'
        ORDER BY i.position, i.id
      `).all(row.id).map(item => ({ id: item.kml_id, revision: Number(item.revision) }))
      const sourceRevisions = items.map(item => ({ id: item.kmlId, revision: item.revision }))
      if (!this.spatialSnapshotEqual(currentRevisions, sourceRevisions)) {
        throw createHttpError('KML 内容已发生变化，请重新加载后同步', 409, 'KML_REVISION_CONFLICT')
      }
      const updateSnapshot = this.database.prepare(`
        UPDATE kml_share_items SET
          published_revision = ?, published_snapshot_json = ?, published_at = ?,
          directory_id = ?, source_directory_id = ?, directory_name = ?, source_position = ?
        WHERE id = ? AND share_id = ?
      `)
      this.markPublishedResourceCollectionBindingsStale(row.id)
      items.forEach(item => {
        updateSnapshot.run(
          item.revision,
          JSON.stringify(item.publishedSnapshot),
          now,
          item.directoryId || null,
          item.sourceDirectoryId || null,
          item.directoryName || '',
          Number(item.sourcePosition || 0),
          item.id,
          row.id
        )
      })
      this.syncPublishedResourceCollectionBindings(row.id, items)
      this.database.prepare(`
        UPDATE kml_shares SET
          spatial_scope_json = ?, spatial_scope_revision = ?, spatial_status = ?,
          spatial_error_code = ?, access_policy_revision = ?, content_revision = content_revision + 1,
          content_published_at = ?, revision = revision + 1, updated_at = ?
        WHERE id = ? AND revision = ?
      `).run(
        JSON.stringify(spatialState.scope || {}),
        Number(row.spatial_scope_revision || 0) + (scopeChanged ? 1 : 0),
        spatialState.status,
        spatialState.errorCode || '',
        policyRevision,
        now,
        now,
        row.id,
        requestedRevision
      )
      this.insertAudit({
        actorUserId: row.owner_id,
        action: 'share.content.sync',
        targetType: 'kml-share',
        targetId: row.id,
        metadata: {
          itemCount: items.length,
          contentRevision: Number(row.content_revision || 1) + 1,
          spatialScopeRevision: Number(row.spatial_scope_revision || 0) + (scopeChanged ? 1 : 0),
        },
      })
    })
    return this.getShare(actor, row.id)
  }

  pauseShare (actor, shareId) {
    const row = this.requireOwnedShare(actor, shareId)
    return this.updateShare(actor, row.id, { revision: row.revision, status: 'paused' })
  }

  resumeShare (actor, shareId) {
    const row = this.requireOwnedShare(actor, shareId)
    const count = Number(this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM kml_share_items
      WHERE share_id = ? AND published_revision > 0
    `).get(row.id)?.count || 0)
    if (count === 0) throw createHttpError('分享包没有可恢复的已发布内容', 409, 'SHARE_EMPTY')
    return this.updateShare(actor, row.id, { revision: row.revision, status: 'active' })
  }

  rotateShareLink (actor, shareId) {
    const row = this.requireOwnedShare(actor, shareId)
    if (row.status === 'revoked') {
      throw createHttpError('已撤销的分享不能轮换链接', 409, 'SHARE_REVOKED')
    }
    assertPasswordlessSharingAllowed(row.password_hash, this.getSettings())
    const publicId = randomToken(24)
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE kml_shares SET public_id = ?, revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(publicId, now, row.id)
      this.revokeShareSessions(row.id, 'share.rotate-link')
      this.insertAudit({
        actorUserId: row.owner_id,
        action: 'share.rotate-link',
        targetType: 'kml-share',
        targetId: row.id,
      })
    })
    return this.getShare(actor, row.id)
  }

  revokeShare (actor, shareId) {
    const row = this.requireOwnedShare(actor, shareId)
    if (row.status === 'revoked') return this.shareViewFromRow(row, { includeItems: true })
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE kml_shares
        SET status = 'revoked', revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(now, row.id)
      this.revokeShareSessions(row.id, 'share.revoke')
      this.insertAudit({
        actorUserId: row.owner_id,
        action: 'share.revoke',
        targetType: 'kml-share',
        targetId: row.id,
      })
    })
    return this.getShare(actor, row.id)
  }

  clearShareRuntimeMetrics (shareId) {
    const prefix = `${String(shareId || '')}:`
    for (const key of this.shareRuntimeMetrics.keys()) {
      if (key.startsWith(prefix)) this.shareRuntimeMetrics.delete(key)
    }
  }

  deleteShareRecord (actor, row, action = 'share.delete') {
    const itemCount = Number(this.database.prepare(
      'SELECT COUNT(*) AS count FROM kml_share_items WHERE share_id = ?'
    ).get(row.id)?.count || 0)
    const sessionCount = Number(this.database.prepare(
      'SELECT COUNT(*) AS count FROM share_access_sessions WHERE share_id = ?'
    ).get(row.id)?.count || 0)
    const eventCount = Number(this.database.prepare(
      'SELECT COUNT(*) AS count FROM share_access_events WHERE share_id = ?'
    ).get(row.id)?.count || 0)
    const ownerId = row.owner_id
    this.database.transaction(() => {
      this.markPublishedResourceCollectionBindingsStale(row.id)
      this.insertAudit({
        actorUserId: this.actorUser(actor).id,
        action,
        targetType: 'kml-share',
        targetId: row.id,
        metadata: {
          ownerId,
          publicId: row.public_id,
          itemCount,
          sessionCount,
          eventCount,
        },
      })
      const result = this.database.prepare('DELETE FROM kml_shares WHERE id = ?').run(row.id)
      if (Number(result.changes || 0) !== 1) {
        throw createHttpError('分享不存在', 404, 'RESOURCE_NOT_FOUND')
      }
    })
    this.clearShareRuntimeMetrics(row.id)
    return {
      id: row.id,
      status: 'deleted',
      deletedItems: itemCount,
      deletedAccessSessions: sessionCount,
      deletedAccessEvents: eventCount,
      sourceKmlPreserved: true,
    }
  }

  deleteShare (actor, shareId) {
    const row = this.requireOwnedShare(actor, shareId)
    return this.deleteShareRecord(actor, row, 'share.delete')
  }

  listSharesForModeration (actor, input = {}) {
    this.assertPermission(actor, 'admin.share.moderate')
    const { page, limit } = normalizePage(input)
    const rows = this.database.prepare(`
      SELECT s.*, u.username_display, u.display_name
      FROM kml_shares s JOIN users u ON u.id = s.owner_id
      ORDER BY s.updated_at DESC, s.id ASC
    `).all().map(row => ({
      ...this.shareModerationViewFromRow(actor, row),
      owner: {
        id: row.owner_id,
        username: row.username_display,
        displayName: row.display_name,
      },
    }))
    const status = String(input.status || '')
    if (status && !['draft', 'active', 'paused', 'revoked', 'blocked', 'expired'].includes(status)) {
      throw createHttpError('分享状态筛选值不正确', 400, 'VALIDATION_FAILED')
    }
    const ownerId = String(input.ownerId || '')
    const search = String(input.search || '').toLocaleLowerCase()
    const filtered = rows.filter(row => {
      if (status && row.status !== status) return false
      if (ownerId && row.ownerId !== ownerId) return false
      if (search && !`${row.title}\n${row.owner.username}\n${row.owner.displayName}`.toLocaleLowerCase().includes(search)) return false
      return true
    })
    return {
      items: filtered.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total: filtered.length,
    }
  }

  listAllShares (actor, input = {}) {
    return this.listSharesForModeration(actor, input)
  }

  blockShare (actor, shareId, input = {}) {
    this.assertPermission(actor, 'admin.share.moderate')
    const row = this.database.prepare('SELECT * FROM kml_shares WHERE id = ?').get(String(shareId || ''))
    if (!row) throw createHttpError('分享不存在', 404, 'RESOURCE_NOT_FOUND')
    if (row.status === 'revoked') throw createHttpError('已撤销分享无需封禁', 409, 'SHARE_REVOKED')
    const reason = normalizeText(input.reason, {
      minLength: 1,
      maxLength: 500,
      message: '封禁原因长度需为 1～500 个字符',
    })
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE kml_shares
        SET status = 'blocked', blocked_reason = ?, revision = revision + 1, updated_at = ?
        WHERE id = ?
      `).run(reason, now, row.id)
      this.revokeShareSessions(row.id, 'admin.share.block')
      this.insertAudit({
        actorUserId: this.actorUser(actor).id,
        action: 'admin.share.block',
        targetType: 'kml-share',
        targetId: row.id,
        reason,
        metadata: { ownerId: row.owner_id },
      })
    })
    return this.shareModerationViewFromRow(
      actor,
      this.database.prepare('SELECT * FROM kml_shares WHERE id = ?').get(row.id),
      { includeItems: true }
    )
  }

  pauseShareForAdmin (actor, shareId, input = {}) {
    this.assertPermission(actor, 'admin.share.moderate')
    const row = this.database.prepare('SELECT * FROM kml_shares WHERE id = ?').get(String(shareId || ''))
    if (!row) throw createHttpError('分享不存在', 404, 'RESOURCE_NOT_FOUND')
    if (row.status === 'revoked') throw createHttpError('已撤销分享无法暂停', 409, 'SHARE_REVOKED')
    const reason = normalizeText(input.reason, { minLength: 1, maxLength: 500, message: '暂停原因长度需为 1～500 个字符' })
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare("UPDATE kml_shares SET status = 'paused', revision = revision + 1, updated_at = ? WHERE id = ?").run(now, row.id)
      this.revokeShareSessions(row.id, 'admin.share.pause')
      this.insertAudit({ actorUserId: this.actorUser(actor).id, action: 'admin.share.pause', targetType: 'kml-share', targetId: row.id, reason, metadata: { ownerId: row.owner_id } })
    })
    return this.shareModerationViewFromRow(actor, this.database.prepare('SELECT * FROM kml_shares WHERE id = ?').get(row.id), { includeItems: true })
  }

  deleteShareForAdmin (actor, shareId) {
    this.assertPermission(actor, 'admin.share.moderate')
    const row = this.database.prepare('SELECT * FROM kml_shares WHERE id = ?').get(String(shareId || ''))
    if (!row) throw createHttpError('分享不存在', 404, 'RESOURCE_NOT_FOUND')
    return this.deleteShareRecord(actor, row, 'admin.share.delete')
  }

  unblockShare (actor, shareId) {
    this.assertPermission(actor, 'admin.share.moderate')
    const row = this.database.prepare('SELECT * FROM kml_shares WHERE id = ?').get(String(shareId || ''))
    if (!row) throw createHttpError('分享不存在', 404, 'RESOURCE_NOT_FOUND')
    if (row.status !== 'blocked') throw createHttpError('分享当前未被封禁', 409, 'SHARE_NOT_BLOCKED')
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE kml_shares
        SET status = 'paused', blocked_reason = '', revision = revision + 1, updated_at = ?
        WHERE id = ?
      `).run(now, row.id)
      this.insertAudit({
        actorUserId: this.actorUser(actor).id,
        action: 'admin.share.unblock',
        targetType: 'kml-share',
        targetId: row.id,
        metadata: { ownerId: row.owner_id },
      })
    })
    return this.shareModerationViewFromRow(
      actor,
      this.database.prepare('SELECT * FROM kml_shares WHERE id = ?').get(row.id),
      { includeItems: true }
    )
  }

  publicShareRow (publicId) {
    return this.database.prepare(`
      SELECT s.*, u.display_name AS owner_display_name
      FROM kml_shares s JOIN users u ON u.id = s.owner_id
      WHERE s.public_id = ?
    `).get(String(publicId || ''))
  }

  assertPublicShareState (row) {
    const status = this.effectiveShareStatus(row)
    if (['missing', 'draft', 'revoked', 'blocked'].includes(status)) {
      throw createHttpError('分享不存在', 404, 'RESOURCE_NOT_FOUND')
    }
    if (status === 'paused') throw createHttpError('分享已暂停', 410, 'SHARE_PAUSED')
    if (status === 'expired') throw createHttpError('分享已过期', 410, 'SHARE_EXPIRED')
  }

  assertPublicSpatialState (row) {
    if (!row || (row.spatial_access_mode || 'unrestricted') !== 'kml_bounds') return row
    let current = row
    const settings = this.getSettings()
    const policyRevision = Number(settings.share.spatialPolicyRevision || 1)
    let scope = parseJson(current.spatial_scope_json, null)
    const sourceRevisions = this.shareItemRevisionSnapshot(current.id)
    const storedRevisions = Array.isArray(scope?.sourceRevisions) ? scope.sourceRevisions : []
    const policyStale = Number(current.access_policy_revision || 1) !== policyRevision ||
      Number(scope?.policyRevision || 0) !== policyRevision
    const stale = policyStale || !this.spatialSnapshotEqual(storedRevisions, sourceRevisions)
    this.recordShareRuntimeMetric(current.id, 'spatial_scope_cache', {
      decision: stale ? 'stale' : 'hit',
    })
    if (stale) {
      try {
        const result = this.revalidateSpatialShare(current.id, settings, { policyChanged: policyStale })
        if (result.recalculating) throw spatialError('SHARE_SPATIAL_RECALCULATING')
        current = this.publicShareRow(current.public_id)
        scope = parseJson(current?.spatial_scope_json, null)
      } catch (error) {
        if (error?.code === 'SHARE_SPATIAL_RECALCULATING') throw error
        throw spatialError('SHARE_SPATIAL_RECALCULATING')
      }
    }
    const spatialStatus = current?.spatial_status || 'error'
    if (spatialStatus !== 'ready' || !isCurrentSpatialScope(scope)) {
      throw spatialError(current?.spatial_error_code || 'SHARE_SPATIAL_RECALCULATING')
    }
    return current
  }

  assertSiteAccess (context = {}) {
    const policy = this.getSettings().share.publicAccessPolicy
    if (policy === 'inherit_site_access' && this.isSiteAccessEnabled() && !context.siteAccessGranted) {
      throw createHttpError('需要先通过站点访问验证', 401, 'SITE_ACCESS_REQUIRED')
    }
  }

  getShareAccessSession (shareId, accessToken) {
    if (!accessToken) return null
    const row = typeof shareId === 'object' ? shareId : this.database.prepare(
      'SELECT * FROM kml_shares WHERE id = ?'
    ).get(shareId)
    if (!row) return null
    const session = this.database.prepare(`
      SELECT * FROM share_access_sessions
      WHERE share_id = ? AND token_hash = ? AND revoked_at IS NULL
      LIMIT 1
    `).get(row.id, hashToken(accessToken))
    if (!session) return null
    if (Number(session.password_version || 1) !== Number(row.password_version || 1)) return null
    const ttlMode = session.ttl_mode || 'finite'
    if (ttlMode === 'unlimited') {
      if ((row.password_access_ttl_mode || 'finite') !== 'unlimited' || session.expires_at !== null) return null
      if ((row.spatial_access_mode || 'unrestricted') !== 'kml_bounds' || row.spatial_status !== 'ready') return null
      if (Number(session.policy_revision || 1) !== Number(row.access_policy_revision || 1)) return null
      if (this.getSettings().share.unlimitedAccessEnabled !== true) return null
    } else {
      const expiresAt = Date.parse(session.expires_at || '')
      if (!Number.isFinite(expiresAt) || expiresAt <= this.clock()) return null
    }
    const lastAccessedAt = Date.parse(session.last_accessed_at || '')
    if (!Number.isFinite(lastAccessedAt) || this.clock() - lastAccessedAt >= SHARE_SESSION_TOUCH_INTERVAL_MS) {
      this.database.prepare(`
        UPDATE share_access_sessions SET last_accessed_at = ? WHERE id = ?
      `).run(this.nowIso(), session.id)
    }
    return session
  }

  hasShareAccessSession (shareId, accessToken) {
    return Boolean(this.getShareAccessSession(shareId, accessToken))
  }

  assertPublicShareAccess (row, context = {}) {
    this.assertPublicShareState(row)
    this.assertSiteAccess(context)
    row = this.assertPublicSpatialState(row)
    if (row.password_hash) {
      const session = this.getShareAccessSession(row, context.accessToken)
      if (!session) throw createHttpError('分享需要密码验证', 401, 'SHARE_PASSWORD_REQUIRED')
      const createdAt = Date.parse(session.created_at || '')
      row.__shareAccessMethod = Number.isFinite(createdAt) && this.clock() - createdAt < 60 * 1000
        ? (session.access_method || 'password_form')
        : 'session'
    } else {
      row.__shareAccessMethod = 'open'
    }
    return row
  }

  assertPublicShareRequest (publicId, context = {}) {
    const row = this.publicShareRow(publicId)
    const current = this.assertPublicShareAccess(row, context)
    this.ensurePublicItemCount(current)
    return {
      id: current.id,
      publicId: current.public_id,
      spatialAccess: this.shareSpatialView(current),
      spatialScope: parseJson(current.spatial_scope_json, null),
    }
  }

  getPublicShareMetadata (publicId) {
    const row = this.publicShareRow(publicId)
    if (!row || this.effectiveShareStatus(row) !== 'active') return null
    const itemCount = Number(this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM kml_share_items
      WHERE share_id = ?
    `).get(row.id)?.count || 0)
    if (itemCount <= 0) return null
    return {
      publicId: row.public_id,
      title: row.title,
      description: row.description,
    }
  }

  assertPublicShareTileRequest (publicId, sourceId, context = {}) {
    const share = this.assertPublicShareRequest(publicId, context)
    // Explicit constructor overrides are reserved for deterministic service
    // tests. Runtime traffic is counted by the map-source service only after
    // catalog and spatial classification have accepted the tile.
    if (!this.useRuntimeTileRateLimit) this.consumeShareRateLimit('tile', share.id, context)
    return share
  }

  publicShareItems (shareId, options = {}) {
    return this.database.prepare(`
      SELECT i.id AS share_item_id, i.position, i.visible_by_default, i.display_name,
             i.directory_id, i.directory_name,
             i.published_revision, i.published_snapshot_json, i.published_at
      FROM kml_share_items i
      WHERE i.share_id = ?
      ORDER BY i.position, i.id
    `).all(shareId).map(row => {
      const parsedSnapshot = parseJson(row.published_snapshot_json, {})
      const snapshot = options.validateInteraction === true
        ? preparePublishedInteractionSnapshot(parsedSnapshot, {
            phase: 'read',
            requireShareIds: options.requireShareIds === true,
            sharePublicId: options.sharePublicId,
            shareItemId: row.share_item_id,
          })
        : parsedSnapshot
      return { ...row, snapshot }
    })
  }

  ensurePublicItemCount (row) {
    const count = Number(this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM kml_share_items i
      WHERE i.share_id = ?
    `).get(row.id)?.count || 0)
    if (count === 0) {
      throw createHttpError('分享没有已发布内容', 409, 'SHARE_EMPTY')
    }
    return count
  }

  ensurePublicItems (row) {
    const items = this.publicShareItems(row.id, {
      validateInteraction: true,
      requireShareIds: true,
      sharePublicId: row.public_id,
    })
    if (items.length === 0) {
      throw createHttpError('分享没有已发布内容', 409, 'SHARE_EMPTY')
    }
    return items
  }

  classifyDeviceType (userAgent) {
    const value = String(userAgent || '').toLowerCase()
    if (/mobile|android|iphone|ipad/.test(value)) return 'mobile'
    if (/tablet/.test(value)) return 'tablet'
    if (value) return 'desktop'
    return 'unknown'
  }

  referrerOrigin (value) {
    try {
      const parsed = new URL(String(value || ''))
      return parsed.origin.slice(0, 255)
    } catch {
      return ''
    }
  }

  recordShareAccessEvent (row, context = {}, accessMethod = 'open') {
    if (!row?.id) return
    const now = this.clock()
    const nowIso = new Date(now).toISOString()
    const visitorHash = hashToken(this.shareClientKey(row.id, context)).slice(0, 64)
    const ipHash = context.ip
      ? hashToken(`${this.sharePrivacySecret}|${String(context.ip).slice(0, 120)}`).slice(0, 64)
      : ''
    const method = ['open', 'password_form', 'password_link', 'session'].includes(accessMethod)
      ? accessMethod
      : 'open'
    const cutoff = new Date(now - SHARE_ACCESS_EVENT_DEDUP_MS).toISOString()
    const existing = this.database.prepare(`
      SELECT id FROM share_access_events
      WHERE share_id = ? AND visitor_hash = ? AND access_method = ? AND last_accessed_at >= ?
      ORDER BY last_accessed_at DESC LIMIT 1
    `).get(row.id, visitorHash, method, cutoff)
    if (existing) {
      this.database.prepare(`
        UPDATE share_access_events
        SET last_accessed_at = ?, access_count = access_count + 1,
            ip_hash = ?, device_type = ?, referrer_origin = ?
        WHERE id = ?
      `).run(
        nowIso, ipHash, this.classifyDeviceType(context.userAgent),
        this.referrerOrigin(context.referrer), existing.id
      )
    } else {
      this.database.prepare(`
        INSERT INTO share_access_events(
          id, share_id, visitor_hash, ip_hash, first_accessed_at, last_accessed_at,
          access_count, access_method, device_type, referrer_origin, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      `).run(
        randomId('sae'), row.id, visitorHash, ipHash, nowIso, nowIso,
        method, this.classifyDeviceType(context.userAgent), this.referrerOrigin(context.referrer), nowIso
      )
    }
    if (now - this.lastShareAccessCleanupAt >= 60 * 60 * 1000) {
      this.lastShareAccessCleanupAt = now
      const retention = new Date(now - SHARE_ACCESS_EVENT_RETENTION_MS).toISOString()
      this.database.prepare('DELETE FROM share_access_events WHERE last_accessed_at < ?').run(retention)
    }
  }

  listShareAccessEvents (actor, shareId, input = {}) {
    const row = this.requireOwnedShare(actor, shareId)
    const pageInfo = normalizePage(input)
    const total = Number(this.database.prepare(
      'SELECT COUNT(*) AS count FROM share_access_events WHERE share_id = ?'
    ).get(row.id)?.count || 0)
    const items = this.database.prepare(`
      SELECT first_accessed_at, last_accessed_at, access_count, access_method,
             device_type, referrer_origin
      FROM share_access_events
      WHERE share_id = ?
      ORDER BY last_accessed_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(row.id, pageInfo.limit, (pageInfo.page - 1) * pageInfo.limit)
      .map(item => ({
        firstAccessedAt: item.first_accessed_at,
        lastAccessedAt: item.last_accessed_at,
        accessCount: Number(item.access_count || 0),
        accessMethod: item.access_method,
        deviceType: item.device_type,
        referrerOrigin: item.referrer_origin || '',
      }))
    return { items, page: pageInfo.page, limit: pageInfo.limit, total }
  }

  async createPasswordShareUrl (actor, shareId) {
    const row = this.requireOwnedShare(actor, shareId)
    if (!row.password_hash) {
      throw createHttpError('该分享未设置密码', 409, 'SHARE_PASSWORD_NOT_SET')
    }
    const password = decryptSecret(row.password_secret, this.shareSecretEncryptionKey)
    if (!password || !(await verifyPassword(password, row.password_hash))) {
      throw createHttpError(
        '分享密码副本不可用，请重新设置密码或删除后重建分享',
        409,
        'SHARE_PASSWORD_SECRET_UNAVAILABLE'
      )
    }
    return {
      shareUrl: `/share/${row.public_id}?password=${encodeURIComponent(password)}`,
      password,
    }
  }

  setShareAnalyticsDisabled (actor, shareId, input = {}) {
    this.assertPermission(actor, 'admin.share.moderate')
    const row = this.database.prepare('SELECT * FROM kml_shares WHERE id = ?').get(String(shareId || ''))
    if (!row) throw createHttpError('分享不存在', 404, 'RESOURCE_NOT_FOUND')
    const disabled = normalizeBoolean(input.disabled, true)
    const reason = disabled ? normalizeText(input.reason, { maxLength: 500 }) : ''
    const now = this.nowIso()
    this.database.prepare(`
      UPDATE kml_shares
      SET analytics_disabled = ?, analytics_disabled_reason = ?, revision = revision + 1, updated_at = ?
      WHERE id = ?
    `).run(disabled ? 1 : 0, reason, now, row.id)
    this.insertAudit({
      actorUserId: this.actorUser(actor).id,
      action: disabled ? 'share.analytics.disable' : 'share.analytics.enable',
      targetType: 'kml-share',
      targetId: row.id,
      reason,
    })
    return this.shareModerationViewFromRow(
      actor,
      this.database.prepare('SELECT * FROM kml_shares WHERE id = ?').get(row.id)
    )
  }

  publicItemSummary (row) {
    const snapshot = row.snapshot || {}
    const snapshotFeatures = Array.isArray(snapshot.features) ? snapshot.features : []
    const storedBounds = normalizeKmlBounds(snapshot.bounds, { featureCount: Number(snapshot.featureCount || snapshotFeatures.length || 0) })
    const visibleByDefault = Boolean(row.visible_by_default)
    return {
      shareItemId: row.share_item_id,
      directoryId: row.directory_id || null,
      directoryName: row.directory_name || '',
      position: Number(row.position),
      visibleByDefault,
      name: row.display_name || snapshot.name || '',
      description: snapshot.description || '',
      coordCorrection: snapshot.coordCorrection,
      theme: snapshot.theme,
      color: snapshot.color,
      lockDrag: true,
      enabled: visibleByDefault,
      isLiveTrack: Boolean(snapshot.isLiveTrack),
      featureCount: Number(snapshot.featureCount || 0),
      bounds: storedBounds || computeKmlBounds(snapshotFeatures),
      revision: Number(row.published_revision || snapshot.revision || 0),
      updatedAt: snapshot.updatedAt || row.published_at,
    }
  }

  getPublicShareManifest (publicId, context = {}) {
    const row = this.publicShareRow(publicId)
    const current = this.assertPublicShareAccess(row, context)
    this.consumeShareRateLimit('manifest', current.id, context)
    const items = this.ensurePublicItems(current)
    const now = this.nowIso()
    this.database.prepare(`
      UPDATE kml_shares
      SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?
    `).run(now, current.id)
    this.recordShareAccessEvent(current, context, current.__shareAccessMethod || context.accessMethod || (context.accessToken ? 'session' : 'open'))
    const viewConfig = parseJson(current.view_config_json, {})
    const clusterPolicy = this.getSettings().share || {}
    viewConfig.kmlPointClustering = applyForcedKmlPointClusteringPolicy(
      viewConfig.kmlPointClustering,
      clusterPolicy
    )
    const result = {
      publicId: current.public_id,
      title: current.title,
      description: current.description,
      status: 'active',
      passwordProtected: Boolean(current.password_hash),
      allowDownload: Boolean(current.allow_download),
      expiresAt: current.expires_at || null,
      viewConfig,
      spatialAccess: this.shareSpatialView(current),
      passwordAccess: { ttlMode: current.password_hash ? (current.password_access_ttl_mode || 'finite') : 'not_applicable' },
      itemCount: items.length,
      items: items.map(item => this.publicItemSummary(item)),
      updatedAt: current.updated_at,
      analytics: resolveShareAnalyticsDescriptor(
        parseJson(current.analytics_config_json, {}),
        this.getSettings().analytics?.share,
        { disabled: Boolean(current.analytics_disabled) }
      ),
    }
    if (viewConfig.showOwnerDisplayName === true) result.ownerDisplayName = current.owner_display_name
    return result
  }

  getPublicShareFile (publicId, shareItemId, context = {}) {
    const row = this.publicShareRow(publicId)
    const current = this.assertPublicShareAccess(row, context)
    const item = this.publicShareItems(current.id, {
      validateInteraction: true,
      requireShareIds: true,
      sharePublicId: current.public_id,
    }).find(candidate => candidate.share_item_id === String(shareItemId || ''))
    if (!item) throw createHttpError('分享文件不存在', 404, 'RESOURCE_NOT_FOUND')
    return {
      ...this.publicItemSummary(item),
      features: sanitizePublishedKmlFeatures(item.snapshot?.features, {
        publicProjection: true,
        resourceCollectionAccessResolver: ref => this.resourceCollectionAccessState(ref),
      }),
    }
  }

  resolvePublicShareFeatureResourceCollection (publicId, shareItemId, featureId, context = {}) {
    const row = this.publicShareRow(publicId)
    const current = this.assertPublicShareAccess(row, context)
    const item = this.publicShareItems(current.id, {
      validateInteraction: true,
      requireShareIds: true,
      sharePublicId: current.public_id,
    }).find(candidate => candidate.share_item_id === String(shareItemId || ''))
    if (!item) throw createHttpError('分享文件不存在', 404, 'RESOURCE_NOT_FOUND')
    const feature = (item.snapshot?.features || []).find(candidate => String(candidate?.id || '') === String(featureId || ''))
    const refResult = tryNormalizeKmlResourceCollectionRef(feature?.resourceCollectionRef)
    if (!refResult.value) throw createHttpError('该点位没有可读取的资源集合', 404, 'RESOURCE_NOT_FOUND')
    return { ref: refResult.value, collection: null, share: current, item }
  }

  publicShareResourceCollectionRateLimitKey (publicId, context = {}) {
    return `share:${String(publicId)}:${hashToken([
      this.sharePrivacySecret,
      String(context.ip || '').slice(0, 120),
      String(context.userAgent || '').slice(0, 255),
      String(context.visitorId || '').slice(0, 160),
    ].join('|')).slice(0, 24)}`
  }

  getPublicShareFeatureResourceCollection (publicId, shareItemId, featureId, context = {}) {
    this.consumePublicCollectionRateLimit(this.publicShareResourceCollectionRateLimitKey(publicId, context), context)
    const { ref } = this.resolvePublicShareFeatureResourceCollection(publicId, shareItemId, featureId, context)
    if (ref.sourceType === 'external') {
      return {
        sourceType: 'external',
        accessState: 'external',
        dataUrl: ref.dataUrl,
        ref,
        collectionRevision: null,
        itemsRevision: null,
        updatedAt: null,
      }
    }
    const accessState = this.resourceCollectionAccessState(ref)
    if (accessState !== 'public') {
      return {
        sourceType: 'personal',
        accessState: accessState === 'trashed' ? 'missing' : accessState,
        collectionRevision: null,
        itemsRevision: null,
        updatedAt: null,
      }
    }
    const collection = this.database.prepare("SELECT * FROM resource_collections WHERE id=? AND status='active' AND visibility='public'").get(ref.collectionId)
    if (!collection) {
      return {
        sourceType: 'personal',
        accessState: 'missing',
        collectionRevision: null,
        itemsRevision: null,
        updatedAt: null,
      }
    }
    const summary = this.resourceCollectionView(collection, { public: true })
    return {
      sourceType: 'personal',
      accessState: 'public',
      ref,
      collection: summary,
      id: summary.id,
      name: summary.name,
      viewMode: summary.viewMode,
      itemCount: summary.itemCount,
      byteSize: summary.byteSize,
      collectionRevision: summary.collectionRevision,
      itemsRevision: summary.itemsRevision,
      revision: summary.collectionRevision,
      updatedAt: summary.updatedAt,
    }
  }

  getPublicShareFeatureResourceCollectionItems (publicId, shareItemId, featureId, input = {}, context = {}) {
    this.consumePublicCollectionRateLimit(this.publicShareResourceCollectionRateLimitKey(publicId, context), context)
    const { ref } = this.resolvePublicShareFeatureResourceCollection(publicId, shareItemId, featureId, context)
    if (ref.sourceType === 'external') {
      return {
        sourceType: 'external',
        accessState: 'external',
        dataUrl: ref.dataUrl,
        ref,
        items: [],
        pagination: { page: 1, limit: 0, total: null, pageCount: null, hasNext: false },
        collectionRevision: null,
        itemsRevision: null,
        updatedAt: null,
      }
    }
    const accessState = this.resourceCollectionAccessState(ref)
    if (accessState !== 'public') {
      return {
        sourceType: 'personal',
        accessState: accessState === 'trashed' ? 'missing' : accessState,
        items: [],
        pagination: { page: 1, limit: 0, total: null, pageCount: null, hasNext: false },
        collectionRevision: null,
        itemsRevision: null,
        updatedAt: null,
      }
    }
    const collection = this.database.prepare("SELECT * FROM resource_collections WHERE id=? AND status='active' AND visibility='public'").get(ref.collectionId)
    if (!collection) {
      return {
        sourceType: 'personal',
        accessState: 'missing',
        items: [],
        pagination: { page: 1, limit: 0, total: null, pageCount: null, hasNext: false },
        collectionRevision: null,
        itemsRevision: null,
        updatedAt: null,
      }
    }
    const page = this.listPublicResourceCollectionItems(collection, input)
    const summary = this.resourceCollectionView(collection, { public: true })
    return {
      sourceType: 'personal',
      accessState: 'public',
      ref,
      collection: summary,
      collectionId: collection.id,
      items: page.items,
      pagination: page.pagination,
      page: page.page,
      limit: page.limit,
      total: page.total,
      pageCount: page.pageCount,
      hasNext: page.hasNext,
      collectionRevision: summary.collectionRevision,
      itemsRevision: summary.itemsRevision,
      revision: summary.collectionRevision,
      updatedAt: summary.updatedAt,
    }
  }

  exportPublicShareFile (publicId, shareItemId, context = {}) {
    const row = this.publicShareRow(publicId)
    const current = this.assertPublicShareAccess(row, context)
    if (!current.allow_download) {
      throw createHttpError('该分享不允许下载', 403, 'SHARE_DOWNLOAD_DISABLED')
    }
    const document = this.getPublicShareFile(publicId, shareItemId, context)
    return {
      filename: `${document.name.replace(/[\\/:*?"<>|]/g, '_') || 'map'}.kml`,
      contentType: 'application/vnd.google-earth.kml+xml; charset=utf-8',
      content: generateKmlText(document.name, document.features, document.description, {
        publicProjection: true,
        resourceCollectionAccessResolver: ref => this.resourceCollectionAccessState(ref),
      }),
    }
  }

  async authorizePublicShare (publicId, input, context = {}) {
    const password = isPlainObject(input) ? input.password : input
    const accessMethod = isPlainObject(input) && input.accessMethod === 'password_link'
      ? 'password_link'
      : 'password_form'
    let row = this.publicShareRow(publicId)
    this.assertPublicShareState(row)
    this.assertSiteAccess(context)
    row = this.assertPublicSpatialState(row)
    if (!row.password_hash) {
      return { passwordRequired: false, ttlMode: 'not_applicable', accessToken: null, expiresAt: null }
    }
    const limiterKey = `${row.id}:${String(context.ip || '').slice(0, 80)}`
    this.sharePasswordLimiter.assertAllowed(limiterKey)
    if (!await verifyPassword(String(password || ''), row.password_hash)) {
      this.sharePasswordLimiter.recordFailure(limiterKey)
      throw createHttpError('分享密码不正确', 401, 'SHARE_PASSWORD_INVALID')
    }
    const current = this.assertPublicShareRowForAuthorization(publicId)
    this.assertSiteAccess(context)
    if (current.id !== row.id || current.password_hash !== row.password_hash ||
        Number(current.password_version || 1) !== Number(row.password_version || 1)) {
      throw createHttpError('分享授权状态已变化，请重新验证', 401, 'SHARE_PASSWORD_REQUIRED')
    }
    const settings = this.getSettings()
    const spatialState = current.spatial_access_mode === 'kml_bounds'
      ? { status: current.spatial_status, scope: parseJson(current.spatial_scope_json, null), eligibility: spatialPolicyEligibility(parseJson(current.spatial_scope_json, null), settings.share) }
      : { status: 'ready', scope: null, eligibility: { unlimitedAccessEligible: false } }
    const ttlMode = current.password_access_ttl_mode || 'finite'
    this.assertPasswordAccessMode(ttlMode, current.password_hash, current.spatial_access_mode || 'unrestricted', spatialState, settings)
    this.sharePasswordLimiter.clear(limiterKey)
    const token = randomToken()
    const now = this.nowIso()
    const configuredTtl = Number(this.getSettings().share.accessTtlMs)
    const ttl = Number.isSafeInteger(configuredTtl) && configuredTtl > 0
      ? Math.max(1000 * 60, configuredTtl)
      : DEFAULT_SETTINGS.share.accessTtlMs
    const expiresAt = ttlMode === 'unlimited' ? null : new Date(this.clock() + ttl).toISOString()
    this.database.prepare(`
      INSERT INTO share_access_sessions(
        id, share_id, token_hash, created_at, ttl_mode, expires_at,
        password_version, policy_revision, last_accessed_at, revoke_reason, access_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
    `).run(
      randomId('sas'), current.id, hashToken(token), now, ttlMode, expiresAt,
      Number(current.password_version || 1), Number(current.access_policy_revision || 1), now, accessMethod
    )
    return { passwordRequired: true, ttlMode, accessToken: token, expiresAt }
  }

  assertPublicShareRowForAuthorization (publicId) {
    let current = this.publicShareRow(publicId)
    this.assertPublicShareState(current)
    current = this.assertPublicSpatialState(current)
    return current
  }
}

export default UserContentService
