import {
  createHttpError,
  hashPasswordSync,
  hashToken,
  randomId,
  randomToken,
  verifyPassword,
} from './security.js'

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
  },
})

const KML_SOURCE_TYPES = new Set(['created', 'imported', 'migrated', 'copied'])
const KML_COORD_CORRECTIONS = new Set(['none', 'wgs84-to-gcj02'])
const KML_THEMES = new Set(['default', 'simple'])
const FEATURE_TYPES = new Set(['Point', 'LineString', 'Polygon'])
const FAVORITE_SOURCE_TYPES = new Set(['search', 'map', 'location', 'kml', 'manual'])
const SHARE_EDITABLE_STATUSES = new Set(['draft', 'active', 'paused'])
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

const SHARE_PASSWORD_LIMIT = Object.freeze({
  maxAttempts: 5,
  windowMs: 1000 * 60 * 10,
  blockMs: 1000 * 60 * 15,
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
    return normalized
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
  const documentName = readXmlElement(documentSource.replace(/<(?:[\w.-]+:)?Placemark\b[\s\S]*$/i, ''), 'name')
  const features = []
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
    features.push({
      id: randomId('feat'),
      type,
      name: readXmlElement(source, 'name'),
      description: readXmlElement(source, 'description'),
      coordinates,
      ...(readXmlElement(source, 'styleUrl') ? { styleUrl: readXmlElement(source, 'styleUrl') } : {}),
    })
  }
  return {
    name: normalizeText(documentName || '导入的 KML', { minLength: 1, maxLength: 200 }),
    features: normalizeKmlFeatures(features),
  }
}

export function generateKmlText (name, features) {
  const normalizedFeatures = normalizeKmlFeatures(features)
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    '  <Document>',
    `    <name>${escapeXml(name)}</name>`,
  ]
  normalizedFeatures.forEach(feature => {
    parts.push('    <Placemark>')
    parts.push(`      <name>${escapeXml(feature.name)}</name>`)
    parts.push(`      <description>${escapeXml(feature.description)}</description>`)
    if (feature.styleUrl) parts.push(`      <styleUrl>${escapeXml(feature.styleUrl)}</styleUrl>`)
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
    coordCorrection: normalizeEnum(
      input.coordCorrection,
      KML_COORD_CORRECTIONS,
      current.coordCorrection || 'wgs84-to-gcj02',
      '坐标纠偏模式不正确'
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

export class UserContentService {
  constructor (options = {}) {
    if (!options.database) throw new Error('UserContentService requires database')
    this.database = options.database
    this.userSystem = options.userSystem || null
    this.settingsProvider = options.settingsProvider || (() => this.userSystem?.getSettings?.() || DEFAULT_SETTINGS)
    this.clock = options.clock || (() => Date.now())
    this.isSiteAccessEnabled = options.isSiteAccessEnabled || (() => false)
    this.sharePasswordLimiter = new AttemptLimiter(options.sharePasswordLimit || SHARE_PASSWORD_LIMIT, this.clock)
  }

  nowIso () {
    return new Date(this.clock()).toISOString()
  }

  getSettings () {
    const settings = this.settingsProvider() || {}
    return {
      quota: { ...DEFAULT_SETTINGS.quota, ...(settings.quota || {}) },
      share: { ...DEFAULT_SETTINGS.share, ...(settings.share || {}) },
    }
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
      const remaining = Number(this.database.prepare(`
        SELECT COUNT(*) AS count
        FROM kml_share_items i
        JOIN kml_documents k ON k.id = i.kml_id
        WHERE i.share_id = ? AND k.status = 'active'
      `).get(shareId)?.count || 0)
      this.database.prepare(`
        UPDATE kml_shares
        SET status = CASE
              WHEN ? = 0 AND status = 'active' THEN 'paused'
              ELSE status
            END,
            revision = revision + 1, updated_at = ?
        WHERE id = ?
      `).run(remaining, now, shareId)
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
    this.database.transaction(() => {
      const affectedShares = this.removeKmlFromShares(row.id)
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
    this.database.transaction(() => {
      this.removeKmlFromShares(row.id)
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

  deleteKmlPermanently (actor, kmlId) {
    return this.permanentDeleteKml(actor, kmlId)
  }

  importKml (actor, input = {}) {
    this.assertPermission(actor, 'kml.own.write')
    requireObject(input)
    const text = String(input.kmlText || '')
    const sourceByteSize = Buffer.byteLength(text, 'utf8')
    const quota = this.quotaForUser(this.actorUser(actor).id)
    if (sourceByteSize > quota.maxKmlFileBytes) {
      throw createHttpError('KML 文件超过单文件大小限制', 413, 'FILE_TOO_LARGE')
    }
    const parsed = parseKmlText(text)
    return this.createKml(actor, {
      name: input.name || parsed.name || String(input.fileName || '').replace(/\.kml$/i, ''),
      description: input.description || '',
      features: parsed.features,
      sourceType: 'imported',
      coordCorrection: input.coordCorrection,
      theme: input.theme,
      color: input.color,
    }, { sourceType: 'imported', sourceByteSize })
  }

  exportKml (actor, kmlId) {
    const document = this.getKml(actor, kmlId)
    return {
      filename: `${document.name.replace(/[\\/:*?"<>|]/g, '_') || 'map'}.kml`,
      contentType: 'application/vnd.google-earth.kml+xml; charset=utf-8',
      content: generateKmlText(document.name, document.features),
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
    `).all(shareId).map(row => ({
      id: row.id,
      kmlId: row.kml_id,
      position: Number(row.position),
      visibleByDefault: Boolean(row.visible_by_default),
      displayName: row.display_name || '',
      name: row.kml_name,
      status: row.kml_status,
      featureCount: Number(row.feature_count),
      byteSize: Number(row.byte_size),
      revision: Number(row.revision),
    }))
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
      revision: Number(row.revision),
      blockedReason: row.status === 'blocked' ? row.blocked_reason : '',
      accessCount: Number(row.access_count),
      shareUrl: `/share/${row.public_id}`,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastAccessedAt: row.last_accessed_at || null,
    }
    if (options.includeItems) result.items = this.shareItemsForOwner(row.id)
    result.itemCount = options.includeItems
      ? result.items.length
      : Number(this.database.prepare('SELECT COUNT(*) AS count FROM kml_share_items WHERE share_id = ?').get(row.id)?.count || 0)
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
        SELECT id, name FROM kml_documents
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
      }
    }).sort((left, right) => left.requestedPosition - right.requestedPosition || left.sourceIndex - right.sourceIndex)
      .map((item, position) => ({ ...item, position }))
  }

  replaceShareItems (shareId, items) {
    this.database.prepare('DELETE FROM kml_share_items WHERE share_id = ?').run(shareId)
    const insert = this.database.prepare(`
      INSERT INTO kml_share_items(
        id, share_id, kml_id, position, visible_by_default, display_name
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)
    items.forEach(item => {
      insert.run(
        randomId('shi'), shareId, item.kmlId, item.position,
        item.visibleByDefault ? 1 : 0, item.displayName
      )
    })
  }

  createShare (actor, input = {}) {
    this.assertPermission(actor, 'share.own.manage')
    requireObject(input)
    const ownerId = this.actorUser(actor).id
    const items = this.normalizeShareItems(ownerId, input.items)
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
    const passwordHash = normalizeSharePassword(input.password, null)
    const now = this.nowIso()
    const id = randomId('shr')
    const publicId = randomToken(24)
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO kml_shares(
          id, public_id, owner_id, title, description, status, access_mode,
          password_hash, allow_download, expires_at, view_config_json, revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'public_link', ?, ?, ?, ?, 1, ?, ?)
      `).run(
        id, publicId, ownerId, title, description, status, passwordHash,
        allowDownload ? 1 : 0, expiresAt, JSON.stringify(viewConfig), now, now
      )
      this.replaceShareItems(id, items)
      this.insertAudit({
        actorUserId: ownerId,
        action: 'share.create',
        targetType: 'kml-share',
        targetId: id,
        metadata: { itemCount: items.length, passwordProtected: Boolean(passwordHash), expiresAt },
      })
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
    const items = input.items === undefined
      ? current.items.map(item => ({
          kmlId: item.kmlId,
          position: item.position,
          visibleByDefault: item.visibleByDefault,
          displayName: item.displayName,
        }))
      : this.normalizeShareItems(row.owner_id, input.items, { allowEmpty: true })
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
    const passwordHash = normalizeSharePassword(input.password, row.password_hash)
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE kml_shares SET
          title = ?, description = ?, status = ?, password_hash = ?, allow_download = ?,
          expires_at = ?, view_config_json = ?, revision = revision + 1, updated_at = ?
        WHERE id = ?
      `).run(
        title, description, status, passwordHash, allowDownload ? 1 : 0,
        expiresAt, JSON.stringify(viewConfig), now, row.id
      )
      this.replaceShareItems(row.id, items)
      if (input.password !== undefined) {
        this.database.prepare('DELETE FROM share_access_sessions WHERE share_id = ?').run(row.id)
      }
      this.insertAudit({
        actorUserId: row.owner_id,
        action: 'share.update',
        targetType: 'kml-share',
        targetId: row.id,
        metadata: { itemCount: items.length, status, passwordChanged: input.password !== undefined },
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
    const publicId = randomToken(24)
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE kml_shares SET public_id = ?, revision = revision + 1, updated_at = ? WHERE id = ?
      `).run(publicId, now, row.id)
      this.database.prepare('DELETE FROM share_access_sessions WHERE share_id = ?').run(row.id)
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
      this.database.prepare('DELETE FROM share_access_sessions WHERE share_id = ?').run(row.id)
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
      this.database.prepare('DELETE FROM share_access_sessions WHERE share_id = ?').run(row.id)
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

  assertSiteAccess (context = {}) {
    const policy = this.getSettings().share.publicAccessPolicy
    if (policy === 'inherit_site_access' && this.isSiteAccessEnabled() && !context.siteAccessGranted) {
      throw createHttpError('需要先通过站点访问验证', 401, 'SITE_ACCESS_REQUIRED')
    }
  }

  hasShareAccessSession (shareId, accessToken) {
    if (!accessToken) return false
    return Boolean(this.database.prepare(`
      SELECT 1 FROM share_access_sessions
      WHERE share_id = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > ?
    `).get(shareId, hashToken(accessToken), this.nowIso()))
  }

  assertPublicShareAccess (row, context = {}) {
    this.assertPublicShareState(row)
    this.assertSiteAccess(context)
    if (row.password_hash && !this.hasShareAccessSession(row.id, context.accessToken)) {
      throw createHttpError('分享需要密码验证', 401, 'SHARE_PASSWORD_REQUIRED')
    }
  }

  assertPublicShareRequest (publicId, context = {}) {
    const row = this.publicShareRow(publicId)
    this.assertPublicShareAccess(row, context)
    this.ensurePublicItems(row)
    return {
      id: row.id,
      publicId: row.public_id,
    }
  }

  publicShareItems (shareId) {
    return this.database.prepare(`
      SELECT i.id AS share_item_id, i.position, i.visible_by_default, i.display_name,
             k.name, k.description, k.coord_correction, k.theme, k.color,
             k.lock_drag, k.enabled, k.is_live_track, k.features_json,
             k.feature_count, k.byte_size, k.revision, k.updated_at
      FROM kml_share_items i
      JOIN kml_documents k ON k.id = i.kml_id
      WHERE i.share_id = ? AND k.status = 'active'
      ORDER BY i.position, i.id
    `).all(shareId)
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

  publicItemSummary (row) {
    return {
      shareItemId: row.share_item_id,
      position: Number(row.position),
      visibleByDefault: Boolean(row.visible_by_default),
      name: row.display_name || row.name,
      description: row.description,
      coordCorrection: row.coord_correction,
      theme: row.theme,
      color: row.color,
      lockDrag: true,
      enabled: true,
      isLiveTrack: Boolean(row.is_live_track),
      featureCount: Number(row.feature_count),
      revision: Number(row.revision),
      updatedAt: row.updated_at,
    }
  }

  getPublicShareManifest (publicId, context = {}) {
    const row = this.publicShareRow(publicId)
    this.assertPublicShareAccess(row, context)
    const items = this.ensurePublicItems(row)
    const now = this.nowIso()
    this.database.prepare(`
      UPDATE kml_shares
      SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?
    `).run(now, row.id)
    const viewConfig = parseJson(row.view_config_json, {})
    const result = {
      publicId: row.public_id,
      title: row.title,
      description: row.description,
      status: 'active',
      passwordProtected: Boolean(row.password_hash),
      allowDownload: Boolean(row.allow_download),
      expiresAt: row.expires_at || null,
      viewConfig,
      itemCount: items.length,
      items: items.map(item => this.publicItemSummary(item)),
      updatedAt: row.updated_at,
    }
    if (viewConfig.showOwnerDisplayName === true) result.ownerDisplayName = row.owner_display_name
    return result
  }

  getPublicShareFile (publicId, shareItemId, context = {}) {
    const row = this.publicShareRow(publicId)
    this.assertPublicShareAccess(row, context)
    const item = this.publicShareItems(row.id).find(candidate => candidate.share_item_id === String(shareItemId || ''))
    if (!item) throw createHttpError('分享文件不存在', 404, 'RESOURCE_NOT_FOUND')
    return {
      ...this.publicItemSummary(item),
      features: parseJson(item.features_json, []),
    }
  }

  exportPublicShareFile (publicId, shareItemId, context = {}) {
    const row = this.publicShareRow(publicId)
    this.assertPublicShareAccess(row, context)
    if (!row.allow_download) {
      throw createHttpError('该分享不允许下载', 403, 'SHARE_DOWNLOAD_DISABLED')
    }
    const document = this.getPublicShareFile(publicId, shareItemId, context)
    return {
      filename: `${document.name.replace(/[\\/:*?"<>|]/g, '_') || 'map'}.kml`,
      contentType: 'application/vnd.google-earth.kml+xml; charset=utf-8',
      content: generateKmlText(document.name, document.features),
    }
  }

  async authorizePublicShare (publicId, input, context = {}) {
    const password = isPlainObject(input) ? input.password : input
    const row = this.publicShareRow(publicId)
    this.assertPublicShareState(row)
    this.assertSiteAccess(context)
    if (!row.password_hash) return { passwordRequired: false, accessToken: null, expiresAt: null }
    const limiterKey = `${row.id}:${String(context.ip || '').slice(0, 80)}`
    this.sharePasswordLimiter.assertAllowed(limiterKey)
    if (!await verifyPassword(String(password || ''), row.password_hash)) {
      this.sharePasswordLimiter.recordFailure(limiterKey)
      throw createHttpError('分享密码不正确', 401, 'SHARE_PASSWORD_INVALID')
    }
    const current = this.publicShareRow(publicId)
    this.assertPublicShareState(current)
    this.assertSiteAccess(context)
    if (current.id !== row.id || current.password_hash !== row.password_hash) {
      throw createHttpError('分享授权状态已变化，请重新验证', 401, 'SHARE_PASSWORD_REQUIRED')
    }
    this.sharePasswordLimiter.clear(limiterKey)
    const token = randomToken()
    const now = this.nowIso()
    const configuredTtl = Number(this.getSettings().share.accessTtlMs)
    const ttl = Number.isSafeInteger(configuredTtl) && configuredTtl > 0
      ? Math.max(1000 * 60, configuredTtl)
      : DEFAULT_SETTINGS.share.accessTtlMs
    const expiresAt = new Date(this.clock() + ttl).toISOString()
    this.database.prepare(`
      INSERT INTO share_access_sessions(id, share_id, token_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomId('sas'), current.id, hashToken(token), now, expiresAt)
    return { passwordRequired: true, accessToken: token, expiresAt }
  }
}

export default UserContentService
