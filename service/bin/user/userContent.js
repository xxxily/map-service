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
import {
  normalizeKmlResourceCollection,
  serializeKmlResourceCollection,
  tryNormalizeKmlResourceCollection,
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

const DEFAULT_SETTINGS = Object.freeze({
  quota: {
    maxKmlFiles: 100,
    maxKmlFileBytes: 10 * 1024 * 1024,
    maxFeaturesPerKml: 50000,
    maxFeaturesPerUser: 200000,
    trashRetentionDays: 30,
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
      if (feature.resourceCollection !== undefined && feature.resourceCollection !== null) {
        try {
          normalized.resourceCollection = normalizeKmlResourceCollection(feature.resourceCollection, {
            createId: () => randomId('res'),
          })
        } catch (error) {
          throw createHttpError(error.message || '资源集合格式不正确', 400, 'VALIDATION_FAILED')
        }
      }
    }
    return normalized
  })
}

function sanitizePublishedKmlFeatures (value) {
  return (Array.isArray(value) ? value : []).map(rawFeature => {
    if (!rawFeature || typeof rawFeature !== 'object' || Array.isArray(rawFeature)) return rawFeature
    const feature = { ...rawFeature }
    if (feature.type !== 'Point') {
      delete feature.resourceCollection
      return feature
    }
    if (feature.resourceCollection === undefined || feature.resourceCollection === null) return feature
    const result = tryNormalizeKmlResourceCollection(feature.resourceCollection)
    if (result.value) feature.resourceCollection = result.value
    else delete feature.resourceCollection
    return feature
  })
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
    const parsedResourceCollection = rawResourceCollection
      ? tryNormalizeKmlResourceCollection(rawResourceCollection, { createId: () => randomId('res') })
      : { value: null, error: null }
    if (parsedResourceCollection.error) {
      warnings.push(`第 ${features.length + 1} 个标注的资源集合已忽略：${parsedResourceCollection.error.message}`)
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
    if (markerIcon || resourceCollection) {
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

function normalizeKmlInput (input = {}, current = {}) {
  requireObject(input)
  const features = input.features === undefined
    ? clone(current.features || [])
    : normalizeKmlFeatures(input.features)
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
      maxEntries: Math.max(100, Number(options?.maxEntries) || 10000),
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
      maxEntries: Math.max(100, Number(options.maxEntries) || this.options.maxEntries),
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
      quota: { ...DEFAULT_SETTINGS.quota, ...(settings.quota || {}) },
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
      windowMs: Math.max(10 * 1000, Number(rateLimit.windowMs) || 60 * 1000),
      tileMaxRequests: Math.max(100, Number(rateLimit.tileMaxRequests) || 3000),
      manifestMaxRequests: Math.max(20, Number(rateLimit.manifestMaxRequests) || 300),
      maxEntries: Math.max(100, Number(rateLimit.maxEntries) || 10000),
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
    const shouldPause = ['empty', 'error', 'out_of_policy'].includes(state.status) && row.status === 'active'
    const nextStatus = shouldPause ? 'paused' : row.status
    const revisionChanged = scopeChanged || policyChanged || downgraded || nextStatus !== row.status
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
      const nextStatus = ['empty', 'error', 'out_of_policy'].includes(state.status) && row.status === 'active'
        ? 'paused'
        : row.status

      if (scopeChanged || policyChanged || downgraded || nextStatus !== row.status) stats.affectedShares += 1
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
    const activeCount = Number(this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM kml_share_items i
      JOIN kml_documents k ON k.id = i.kml_id
      WHERE i.share_id = ? AND k.status = 'active'
    `).get(shareId)?.count || 0)
    if (activeCount === 0 && row.status === 'active') {
      this.database.prepare(`
        UPDATE kml_shares
        SET status = 'paused', revision = revision + 1, updated_at = ?
        WHERE id = ?
      `).run(this.nowIso(), shareId)
    }
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
    const overrides = parseJson(row.quota_json, {})
    const quota = { ...this.getSettings().quota }
    Object.keys(quota).forEach(key => {
      const value = Number(overrides[key])
      if (Number.isSafeInteger(value) && value > 0) quota[key] = value
    })
    return quota
  }

  getKmlUsage (actor, ownerId = this.actorUser(actor).id) {
    const actorUser = this.actorUser(actor)
    if (actorUser.id !== ownerId && !this.hasPermission(actor, 'kml.any.read')) {
      throw createHttpError('资源不存在', 404, 'RESOURCE_NOT_FOUND')
    }
    const usage = this.database.prepare(`
      SELECT COUNT(*) AS file_count,
             COALESCE(SUM(feature_count), 0) AS feature_count,
             COALESCE(SUM(byte_size), 0) AS byte_size
      FROM kml_documents WHERE owner_id = ?
    `).get(ownerId)
    return {
      fileCount: Number(usage.file_count || 0),
      featureCount: Number(usage.feature_count || 0),
      byteSize: Number(usage.byte_size || 0),
      quota: this.quotaForUser(ownerId),
    }
  }

  assertKmlQuota (ownerId, document, existing = null, sourceByteSize = 0) {
    const quota = this.quotaForUser(ownerId)
    const usage = this.database.prepare(`
      SELECT COUNT(*) AS file_count, COALESCE(SUM(feature_count), 0) AS feature_count
      FROM kml_documents WHERE owner_id = ?
    `).get(ownerId)
    const nextFileCount = Number(usage.file_count || 0) + (existing ? 0 : 1)
    const nextFeatureCount = Number(usage.feature_count || 0) - Number(existing?.feature_count || 0) + document.featureCount
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

  kmlViewFromRow (row, options = {}) {
    if (!row) return null
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
      byteSize: Number(row.byte_size),
      revision: Number(row.revision),
      sourceType: row.source_type,
      shareReferenceCount: this.shareReferenceCount(row.id),
      outdatedShareReferenceCount: this.outdatedShareReferenceCount(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at || null,
    }
    if (row.sync_client_id) result.syncClientId = row.sync_client_id
    if (options.includeFeatures) result.features = parseJson(row.features_json, [])
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
    this.assertKmlQuota(ownerId, normalized, null, options.sourceByteSize)
    const sourceType = normalizeEnum(input.sourceType, KML_SOURCE_TYPES, options.sourceType || 'created', 'KML 来源类型不正确')
    const isDefault = Boolean(input.isDefault)
    const now = this.nowIso()
    const id = randomId('kml')
    this.database.transaction(() => {
      if (isDefault) {
        this.database.prepare(`UPDATE kml_documents SET is_default = 0 WHERE owner_id = ?`).run(ownerId)
      }
      this.database.prepare(`
        INSERT INTO kml_documents(
          id, owner_id, name, description, is_default, status,
          coord_correction, theme, color, lock_drag, enabled, is_live_track,
          features_json, feature_count, byte_size, revision, source_type,
          sync_client_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
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
        normalized.byteSize,
        sourceType,
        syncClientId,
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
      where.push('(name LIKE ? OR description LIKE ?)')
      const search = `%${String(input.search).slice(0, 200)}%`
      params.push(search, search)
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
    const normalized = normalizeKmlInput(input, current)
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
      const result = this.database.prepare(`
        UPDATE kml_documents SET
          name = ?, description = ?, is_default = ?, coord_correction = ?, theme = ?,
          color = ?, lock_drag = ?, enabled = ?, is_live_track = ?, features_json = ?,
          feature_count = ?, byte_size = ?, revision = revision + 1, updated_at = ?
        WHERE id = ? AND revision = ?
      `).run(
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
        normalized.byteSize,
        now,
        row.id,
        revision
      )
      if (Number(result.changes) !== 1) {
        throw createHttpError('KML 已被其他客户端更新，请重新加载', 409, 'KML_REVISION_CONFLICT')
      }
    })
    return this.getKml(actor, row.id)
  }

  removeKmlFromShares (kmlId) {
    const shares = this.database.prepare(`
      SELECT DISTINCT share_id FROM kml_share_items WHERE kml_id = ?
    `).all(kmlId).map(row => row.share_id)
    this.database.prepare('DELETE FROM kml_share_items WHERE kml_id = ?').run(kmlId)
    const now = this.nowIso()
    shares.forEach(shareId => {
      this.database.prepare(`
        UPDATE kml_shares
        SET content_revision = content_revision + 1, content_published_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(now, now, shareId)
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
        SET status = 'trashed', is_default = 0, revision = revision + 1,
            updated_at = ?, deleted_at = ?
        WHERE id = ?
      `).run(now, now, row.id)
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
    const now = this.nowIso()
    this.database.prepare(`
      UPDATE kml_documents
      SET status = 'active', is_default = 0, revision = revision + 1,
          updated_at = ?, deleted_at = NULL
      WHERE id = ?
    `).run(now, row.id)
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
    shareIds.forEach(shareId => this.refreshShareAfterContentChange(shareId))
    return { id: row.id, status: 'deleted' }
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

  syncKml (actor, input = {}) {
    this.assertPermission(actor, 'kml.own.write')
    requireObject(input)
    const operations = input.operations || input.changes
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > 100) {
      throw createHttpError('同步操作数量需为 1～100 条', 400, 'VALIDATION_FAILED')
    }
    return this.database.transaction(() => {
      this.ensureDefaultKmlForOwner(this.actorUser(actor).id)
      const results = operations.map((rawOperation, index) => {
        const operation = requireObject(rawOperation, `第 ${index + 1} 条同步操作格式不正确`)
        const action = String(operation.action || operation.operation || '')
        if (action === 'create') {
          const clientId = normalizeSyncClientId(operation.clientId)
          const document = this.createKml(actor, operation.data || operation.file || {}, {
            skipEnsureDefault: true,
            syncClientId: clientId,
          })
          return { action, clientId, document }
        }
        const kmlId = String(operation.kmlId || operation.id || '')
        if (action === 'update') return { action, document: this.updateKml(actor, kmlId, operation.data || operation.file || operation) }
        if (action === 'trash') {
          if (kmlId) return { action, document: this.trashKml(actor, kmlId) }
          const clientId = normalizeSyncClientId(operation.clientId)
          const document = this.trashKmlBySyncClientId(actor, clientId)
          return {
            action,
            clientId,
            ...(document ? { document } : { result: { status: 'absent' } }),
          }
        }
        if (action === 'restore') {
          if (kmlId) return { action, document: this.restoreKml(actor, kmlId) }
          const clientId = normalizeSyncClientId(operation.clientId)
          const document = this.restoreKmlBySyncClientId(actor, clientId)
          return {
            action,
            clientId,
            ...(document ? { document } : { result: { status: 'absent' } }),
          }
        }
        if (action === 'deletePermanent') return { action, result: this.permanentDeleteKml(actor, kmlId) }
        throw createHttpError('同步操作类型不正确', 400, 'VALIDATION_FAILED')
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
             k.status AS kml_status, k.feature_count, k.byte_size, k.revision
      FROM kml_share_items i
      JOIN kml_documents k ON k.id = i.kml_id
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
        name: row.kml_name,
        status: row.kml_status,
        featureCount: Number(row.feature_count),
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
      ? Math.min(20, configuredMaximum)
      : 20
    const minimum = options.allowEmpty ? 0 : 1
    if (value.length < minimum || value.length > maximum) {
      throw createHttpError(`分享包需包含 ${minimum}～${maximum} 个 KML`, 400, 'VALIDATION_FAILED')
    }
    const seen = new Set()
    return value.map((rawItem, index) => {
      const item = requireObject(rawItem, `第 ${index + 1} 个分享项格式不正确`)
      const kmlId = String(item.kmlId || '')
      if (!kmlId || seen.has(kmlId)) {
        throw createHttpError('分享文件不能缺失或重复', 400, 'VALIDATION_FAILED')
      }
      seen.add(kmlId)
      const document = this.database.prepare(`
        SELECT id, name, description, coord_correction, theme, color,
               lock_drag, enabled, is_live_track, features_json,
               feature_count, byte_size, revision, updated_at
        FROM kml_documents
        WHERE id = ? AND owner_id = ? AND status = 'active'
      `).get(kmlId, ownerId)
      if (!document) throw createHttpError('分享文件不存在', 404, 'RESOURCE_NOT_FOUND')
      const position = Number(item.position)
      return {
        kmlId,
        sourceIndex: index,
        requestedPosition: Number.isFinite(position) ? position : index,
        visibleByDefault: normalizeBoolean(item.visibleByDefault, true),
        displayName: normalizeText(item.displayName, { maxLength: 200 }),
        name: document.name,
        revision: Number(document.revision),
        features: parseJson(document.features_json, []),
        publishedSnapshot: this.publishedSnapshotFromDocument(document),
      }
    }).sort((left, right) => left.requestedPosition - right.requestedPosition || left.sourceIndex - right.sourceIndex)
      .map((item, position) => ({ ...item, position }))
  }

  publishedSnapshotFromDocument (row) {
    return {
      name: row.name,
      description: row.description || '',
      coordCorrection: row.coord_correction,
      theme: row.theme,
      color: row.color,
      lockDrag: Boolean(row.lock_drag),
      enabled: Boolean(row.enabled),
      isLiveTrack: Boolean(row.is_live_track),
      features: sanitizePublishedKmlFeatures(parseJson(row.features_json, [])),
      featureCount: Number(row.feature_count || 0),
      byteSize: Number(row.byte_size || 0),
      revision: Number(row.revision || 0),
      updatedAt: row.updated_at,
    }
  }

  replaceShareItems (shareId, items, publishedAt = this.nowIso()) {
    this.database.prepare('DELETE FROM kml_share_items WHERE share_id = ?').run(shareId)
    const insert = this.database.prepare(`
      INSERT INTO kml_share_items(
        id, share_id, kml_id, position, visible_by_default, display_name,
        published_revision, published_snapshot_json, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    items.forEach(item => {
      insert.run(
        item.id || randomId('shi'), shareId, item.kmlId, item.position,
        item.visibleByDefault ? 1 : 0, item.displayName,
        item.publishedRevision ?? item.revision,
        JSON.stringify(item.publishedSnapshot),
        item.publishedAt || publishedAt
      )
    })
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
          position: item.position,
          visibleByDefault: item.visibleByDefault,
          displayName: item.displayName,
        }))
      : this.normalizeShareItems(row.owner_id, input.items, { allowEmpty: true })
    if (input.items !== undefined && items.length > 0) {
      const publishedRows = this.database.prepare(`
        SELECT id, kml_id, published_revision, published_snapshot_json, published_at
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
    if (items.length === 0 && status === 'active') status = 'paused'
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
             k.name, k.description, k.coord_correction, k.theme, k.color,
             k.lock_drag, k.enabled, k.is_live_track, k.features_json,
             k.feature_count, k.byte_size, k.revision, k.updated_at
      FROM kml_share_items i
      JOIN kml_documents k ON k.id = i.kml_id
      WHERE i.share_id = ? AND k.status = 'active'
      ORDER BY i.position, i.id
    `).all(row.id)
    if (sourceItems.length === 0) throw createHttpError('分享包没有可用 KML', 409, 'SHARE_EMPTY')

    const items = sourceItems.map(item => ({
      id: item.id,
      kmlId: item.kml_id,
      revision: Number(item.revision),
      features: parseJson(item.features_json, []),
      position: Number(item.position),
      visibleByDefault: Boolean(item.visible_by_default),
      displayName: item.display_name || '',
      publishedSnapshot: this.publishedSnapshotFromDocument(item),
    }))
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
          published_revision = ?, published_snapshot_json = ?, published_at = ?
        WHERE id = ? AND share_id = ?
      `)
      items.forEach(item => {
        updateSnapshot.run(
          item.revision,
          JSON.stringify(item.publishedSnapshot),
          now,
          item.id,
          row.id
        )
      })
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
      FROM kml_share_items i JOIN kml_documents k ON k.id = i.kml_id
      WHERE i.share_id = ? AND k.status = 'active'
    `).get(row.id)?.count || 0)
    if (count === 0) throw createHttpError('分享包没有可用 KML', 409, 'SHARE_EMPTY')
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

  publicShareItems (shareId) {
    return this.database.prepare(`
      SELECT i.id AS share_item_id, i.position, i.visible_by_default, i.display_name,
             i.published_revision, i.published_snapshot_json, i.published_at
      FROM kml_share_items i
      WHERE i.share_id = ?
      ORDER BY i.position, i.id
    `).all(shareId).map(row => ({
      ...row,
      snapshot: parseJson(row.published_snapshot_json, {}),
    }))
  }

  ensurePublicItemCount (row) {
    const count = Number(this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM kml_share_items i
      WHERE i.share_id = ?
    `).get(row.id)?.count || 0)
    if (count === 0) {
      if (row.status === 'active') {
        this.database.prepare(`
          UPDATE kml_shares SET status = 'paused', revision = revision + 1, updated_at = ? WHERE id = ?
        `).run(this.nowIso(), row.id)
      }
      throw createHttpError('分享已暂停', 410, 'SHARE_PAUSED')
    }
    return count
  }

  ensurePublicItems (row) {
    const items = this.publicShareItems(row.id)
    if (items.length === 0) {
      if (row.status === 'active') {
        this.database.prepare(`
          UPDATE kml_shares SET status = 'paused', revision = revision + 1, updated_at = ? WHERE id = ?
        `).run(this.nowIso(), row.id)
      }
      throw createHttpError('分享已暂停', 410, 'SHARE_PAUSED')
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
    return {
      shareItemId: row.share_item_id,
      position: Number(row.position),
      visibleByDefault: Boolean(row.visible_by_default),
      name: row.display_name || snapshot.name || '',
      description: snapshot.description || '',
      coordCorrection: snapshot.coordCorrection,
      theme: snapshot.theme,
      color: snapshot.color,
      lockDrag: true,
      enabled: true,
      isLiveTrack: Boolean(snapshot.isLiveTrack),
      featureCount: Number(snapshot.featureCount || 0),
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
    const item = this.publicShareItems(current.id).find(candidate => candidate.share_item_id === String(shareItemId || ''))
    if (!item) throw createHttpError('分享文件不存在', 404, 'RESOURCE_NOT_FOUND')
    return {
      ...this.publicItemSummary(item),
      features: sanitizePublishedKmlFeatures(item.snapshot?.features),
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
      content: generateKmlText(document.name, document.features, document.description),
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
