import crypto from 'node:crypto'

const STORE_SOURCES = 'tile-sources'
const STORE_LAYERS = 'map-layers'
const STORE_PROXY_OUTBOUNDS = 'proxy-outbounds'
const STORE_PROXY_POOLS = 'proxy-pools'
const STORE_EXTERNAL_PUBLISHES = 'external-publishes'
const STORE_EXTERNAL_LOGS = 'external-publish-logs'
const STORE_SOURCE_ACCESS_LOGS = 'source-access-logs'

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/
const DEFAULT_TOKEN_BYTES = 24
const DEFAULT_EXTERNAL_LOG_LIMIT = 500
const DEFAULT_SOURCE_ACCESS_LOG_LIMIT = 500
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000
const TEMPLATE_PLACEHOLDERS = ['s', 'x', 'y', 'z', 'scale', 'yTms']
const ALLOWED_TILE_SIZES = [256]
const ALLOWED_TILE_SCALES = ['1', '2', '3']

function clone (value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value))
}

function createHttpError (message, statusCode = 400) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function hasOwn (obj, key) {
  return Object.hasOwn(obj || {}, key)
}

function normalizeBoolean (value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return Boolean(defaultValue)
  return value === true || value === 'true' || value === '1' || value === 1
}

function normalizeString (value, defaultValue = '') {
  return String(value ?? defaultValue).trim()
}

function normalizeSlug (value, name = 'ID') {
  const slug = normalizeString(value).toLowerCase()
  if (!SLUG_PATTERN.test(slug)) {
    throw createHttpError(`${name} 必须是 3-64 位小写字母、数字或短横线，且不能以短横线开头或结尾`)
  }
  return slug
}

function normalizeInteger (value, name, options = {}) {
  const fallback = options.defaultValue
  if ((value === undefined || value === null || value === '') && fallback !== undefined) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw createHttpError(`${name} 必须是整数`)
  }
  if (options.min !== undefined && parsed < options.min) {
    throw createHttpError(`${name} 不能小于 ${options.min}`)
  }
  if (options.max !== undefined && parsed > options.max) {
    throw createHttpError(`${name} 不能大于 ${options.max}`)
  }
  return parsed
}

function normalizeTileSize (value) {
  const tileSize = normalizeInteger(value, '瓦片尺寸', { defaultValue: 256 })
  if (!ALLOWED_TILE_SIZES.includes(tileSize)) {
    throw createHttpError('瓦片网格尺寸当前固定为 256，请通过 scale 配置高清瓦片')
  }
  return tileSize
}

function normalizeScaleValue (value, name, defaultValue) {
  const scale = value === undefined || value === null || value === ''
    ? String(defaultValue)
    : normalizeString(value)
  if (!ALLOWED_TILE_SCALES.includes(scale)) {
    throw createHttpError(`${name} 只能是 ${ALLOWED_TILE_SCALES.join(', ')}`)
  }
  return scale
}

function normalizeNumber (value, name, options = {}) {
  const fallback = options.defaultValue
  if ((value === undefined || value === null || value === '') && fallback !== undefined) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw createHttpError(`${name} 必须是有效数字`)
  }
  if (options.min !== undefined && parsed < options.min) {
    throw createHttpError(`${name} 不能小于 ${options.min}`)
  }
  if (options.max !== undefined && parsed > options.max) {
    throw createHttpError(`${name} 不能大于 ${options.max}`)
  }
  return parsed
}

function normalizeStringList (value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => normalizeString(item)).filter(Boolean))]
}

function pickEnum (value, allowed, name, defaultValue) {
  const normalized = normalizeString(value || defaultValue).toLowerCase()
  if (!allowed.includes(normalized)) {
    throw createHttpError(`${name} 只能是 ${allowed.join(', ')}`)
  }
  return normalized
}

function sampleTemplateUrl (template, subdomains = []) {
  const subdomain = subdomains[0] || '1'
  return String(template)
    .replaceAll('{s}', subdomain)
    .replaceAll('{x}', '0')
    .replaceAll('{y}', '0')
    .replaceAll('{z}', '0')
    .replaceAll('{scale}', '1')
    .replaceAll('{yTms}', '0')
}

function isBlockedHostname (hostname) {
  const value = String(hostname || '').toLowerCase()
  if (!value || value === 'localhost' || value.endsWith('.localhost')) return true
  if (value === '::1' || value === '[::1]') return true
  if (/^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value)) return true
  if (/^169\.254\./.test(value)) return true
  const private172 = /^172\.(1[6-9]|2[0-9]|3[0-1])\./
  if (private172.test(value)) return true
  return false
}

function validateHttpTemplate (template, subdomains = []) {
  const normalized = normalizeString(template)
  if (!normalized) {
    throw createHttpError('URL 模板不能为空')
  }

  const placeholders = [...normalized.matchAll(/\{([^}]+)\}/g)].map(match => match[1])
  const invalidPlaceholders = placeholders.filter(name => !TEMPLATE_PLACEHOLDERS.includes(name))
  if (invalidPlaceholders.length) {
    throw createHttpError(`URL 模板包含不支持的占位符：${[...new Set(invalidPlaceholders)].join(', ')}`)
  }

  let parsed
  try {
    parsed = new URL(sampleTemplateUrl(normalized, subdomains))
  } catch (err) {
    throw createHttpError('URL 模板不是有效 URL')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createHttpError('URL 模板仅支持 http 或 https')
  }
  if (isBlockedHostname(parsed.hostname)) {
    throw createHttpError('URL 模板不能指向 localhost、内网或保留地址')
  }
  return normalized
}

function normalizeHost (value) {
  const host = normalizeString(value)
  if (!host || host.length > 255 || /[\s/]/.test(host)) {
    throw createHttpError('代理主机地址不合法')
  }
  return host
}

function hashToken (token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function previewToken (token) {
  const value = String(token || '')
  if (value.length <= 8) return value ? '****' : ''
  return `${value.slice(0, 4)}****${value.slice(-4)}`
}

function generateToken () {
  return crypto.randomBytes(DEFAULT_TOKEN_BYTES).toString('base64url')
}

function timingSafeEqualString (left, right) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function defaultProxyOutbounds () {
  return [
    {
      id: 'default-proxy-outbound',
      name: '默认代理出口',
      enabled: false,
      protocol: 'http',
      host: '127.0.0.1',
      port: 10809,
      username: '',
      password: '',
      testUrl: 'https://www.google.com/generate_204',
      timeoutMs: 8000,
      tags: ['default'],
      description: '默认代理出口占位配置，请在代理管理中按需启用和调整。',
    },
  ]
}

function defaultProxyPools () {
  return [
    {
      id: 'default-proxy-pool',
      name: '默认代理池',
      enabled: true,
      strategy: 'priority',
      members: [
        {
          outboundId: 'default-proxy-outbound',
          priority: 100,
          weight: 1,
        },
      ],
      failover: {
        enabled: true,
        cooldownMs: 60 * 1000,
        maxAttemptsPerRequest: 2,
      },
      description: '默认代理池，供需要代理的图源复用。',
    },
  ]
}

function defaultSources () {
  return [
    {
      id: 'amap-satellite',
      name: '高德卫星',
      enabled: true,
      vendor: 'amap',
      category: 'satellite',
      kind: 'xyz',
      template: 'https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=6&x={x}&y={y}&z={z}&scl={scale}',
      subdomains: ['1', '2', '3', '4'],
      minZoom: 3,
      maxZoom: 18,
      maxNativeZoom: 18,
      tileSize: 256,
      retina: { mode: 'query', param: 'scale', normalValue: '1', retinaValue: '2' },
      cache: { enabled: true },
      accessLog: { enabled: true, maxLogCount: DEFAULT_SOURCE_ACCESS_LOG_LIMIT },
      proxy: { mode: 'never', poolId: '', outboundId: '', fallbackToDirect: false },
      permissions: { frontendVisible: true, precacheAllowed: true, externalApiAllowed: true, userReferenceAllowed: true },
      visibility: { scope: 'system' },
      attribution: '高德地图 AutoNavi.com',
      description: '高德卫星瓦片图源。',
    },
    {
      id: 'amap-road',
      name: '高德街道',
      enabled: true,
      vendor: 'amap',
      category: 'road',
      kind: 'xyz',
      template: 'https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}&scl=1',
      subdomains: ['1', '2', '3', '4'],
      minZoom: 3,
      maxZoom: 18,
      maxNativeZoom: 18,
      tileSize: 256,
      retina: { mode: 'none', param: '', normalValue: '1', retinaValue: '1' },
      cache: { enabled: true },
      accessLog: { enabled: true, maxLogCount: DEFAULT_SOURCE_ACCESS_LOG_LIMIT },
      proxy: { mode: 'never', poolId: '', outboundId: '', fallbackToDirect: false },
      permissions: { frontendVisible: true, precacheAllowed: true, externalApiAllowed: true, userReferenceAllowed: true },
      visibility: { scope: 'system' },
      attribution: '高德地图 AutoNavi.com',
      description: '高德街道瓦片图源。',
    },
    {
      id: 'google-satellite',
      name: 'Google 卫星',
      enabled: true,
      vendor: 'google',
      category: 'satellite',
      kind: 'xyz',
      template: 'https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}&scale={scale}',
      subdomains: [],
      minZoom: 3,
      maxZoom: 22,
      maxNativeZoom: 22,
      tileSize: 256,
      retina: { mode: 'query', param: 'scale', normalValue: '1', retinaValue: '2' },
      cache: { enabled: true },
      accessLog: { enabled: true, maxLogCount: DEFAULT_SOURCE_ACCESS_LOG_LIMIT },
      proxy: { mode: 'pool', poolId: 'default-proxy-pool', outboundId: '', fallbackToDirect: false },
      permissions: { frontendVisible: true, precacheAllowed: true, externalApiAllowed: true, userReferenceAllowed: true },
      visibility: { scope: 'system' },
      attribution: 'Google',
      description: 'Google 卫星瓦片图源。',
    },
    {
      id: 'google-satellite-hd',
      name: 'Google 卫星 HD',
      enabled: true,
      vendor: 'google',
      category: 'satellite',
      kind: 'xyz',
      template: 'https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}&scale=3',
      subdomains: [],
      minZoom: 3,
      maxZoom: 22,
      maxNativeZoom: 22,
      tileSize: 256,
      retina: { mode: 'fixed', param: 'scale', normalValue: '3', retinaValue: '3' },
      cache: { enabled: true },
      accessLog: { enabled: true, maxLogCount: DEFAULT_SOURCE_ACCESS_LOG_LIMIT },
      proxy: { mode: 'pool', poolId: 'default-proxy-pool', outboundId: '', fallbackToDirect: false },
      permissions: { frontendVisible: true, precacheAllowed: true, externalApiAllowed: true, userReferenceAllowed: true },
      visibility: { scope: 'system' },
      attribution: 'Google',
      description: 'Google 卫星高清瓦片图源。',
    },
    {
      id: 'google-road',
      name: 'Google 街道',
      enabled: true,
      vendor: 'google',
      category: 'road',
      kind: 'xyz',
      template: 'https://www.google.com/maps/vt?lyrs=m@189&gl=cn&x={x}&y={y}&z={z}&scale={scale}',
      subdomains: [],
      minZoom: 3,
      maxZoom: 22,
      maxNativeZoom: 22,
      tileSize: 256,
      retina: { mode: 'query', param: 'scale', normalValue: '1', retinaValue: '2' },
      cache: { enabled: true },
      accessLog: { enabled: true, maxLogCount: DEFAULT_SOURCE_ACCESS_LOG_LIMIT },
      proxy: { mode: 'pool', poolId: 'default-proxy-pool', outboundId: '', fallbackToDirect: false },
      permissions: { frontendVisible: true, precacheAllowed: true, externalApiAllowed: true, userReferenceAllowed: true },
      visibility: { scope: 'system' },
      attribution: 'Google',
      description: 'Google 街道瓦片图源。',
    },
  ]
}

function defaultLayers () {
  return [
    {
      id: 'amap-hybrid',
      name: '高德/卫星',
      enabled: true,
      frontendVisible: true,
      default: true,
      type: 'base',
      clients: ['2d', '3d'],
      items: [
        { sourceId: 'amap-satellite', opacity: 1, zIndex: 0 },
        { sourceId: 'amap-road', opacity: 0.5, zIndex: 1 },
      ],
      minZoom: 3,
      maxZoom: 18,
      sortOrder: 10,
      description: '高德卫星叠加高德道路。',
    },
    {
      id: 'amap-road',
      name: '高德/街道',
      enabled: true,
      frontendVisible: true,
      default: false,
      type: 'base',
      clients: ['2d', '3d'],
      items: [{ sourceId: 'amap-road', opacity: 1, zIndex: 0 }],
      minZoom: 3,
      maxZoom: 18,
      sortOrder: 20,
      description: '高德街道。',
    },
    {
      id: 'google-amap-hybrid',
      name: '谷歌高德/卫星',
      enabled: true,
      frontendVisible: true,
      default: false,
      type: 'base',
      clients: ['2d', '3d'],
      items: [
        { sourceId: 'google-satellite', opacity: 1, zIndex: 0 },
        { sourceId: 'amap-road', opacity: 0.7, zIndex: 1 },
      ],
      minZoom: 3,
      maxZoom: 22,
      sortOrder: 30,
      description: 'Google 卫星叠加高德道路。',
    },
    {
      id: 'google-amap-hybrid-hd',
      name: '谷歌高德/卫星（HD）',
      enabled: true,
      frontendVisible: true,
      default: false,
      type: 'base',
      clients: ['2d', '3d'],
      items: [
        { sourceId: 'google-satellite-hd', opacity: 1, zIndex: 0 },
        { sourceId: 'amap-road', opacity: 0.7, zIndex: 1 },
      ],
      minZoom: 3,
      maxZoom: 22,
      sortOrder: 40,
      description: 'Google 卫星 HD 叠加高德道路。',
    },
    {
      id: 'google-sat',
      name: '谷歌/卫星',
      enabled: true,
      frontendVisible: true,
      default: false,
      type: 'base',
      clients: ['2d', '3d'],
      items: [{ sourceId: 'google-satellite', opacity: 1, zIndex: 0 }],
      minZoom: 3,
      maxZoom: 22,
      sortOrder: 50,
      description: 'Google 卫星。',
    },
    {
      id: 'google-road',
      name: '谷歌/街道',
      enabled: true,
      frontendVisible: true,
      default: false,
      type: 'base',
      clients: ['2d', '3d'],
      items: [{ sourceId: 'google-road', opacity: 1, zIndex: 0 }],
      minZoom: 3,
      maxZoom: 22,
      sortOrder: 60,
      description: 'Google 街道。',
    },
  ]
}

function defaultExternalPublishes () {
  return [
    {
      id: 'default-google-satellite-api',
      name: '默认 Google 卫星对外服务',
      enabled: false,
      targetType: 'source',
      targetId: 'google-satellite',
      pathSlug: 'default-google-satellite-api',
      auth: { mode: 'token', tokenHash: '', tokenPreview: '' },
      rateLimit: { enabled: true, maxRequestsPerMinute: 600 },
      log: { enabled: true, maxLogCount: DEFAULT_EXTERNAL_LOG_LIMIT },
      overrides: { proxy: null, cache: null },
      description: '用于替代旧版单一 tileApi.upstreamUrl 的默认发布项。',
    },
  ]
}

function normalizeProxyOutbound (input = {}, current = null) {
  const result = {
    id: normalizeSlug(input.id ?? current?.id, '代理出口 ID'),
    name: normalizeString(input.name ?? current?.name, '未命名代理出口'),
    enabled: normalizeBoolean(input.enabled ?? current?.enabled, true),
    protocol: pickEnum(input.protocol ?? current?.protocol, ['http', 'https'], '代理协议', 'http'),
    host: normalizeHost(input.host ?? current?.host),
    port: normalizeInteger(input.port ?? current?.port, '代理端口', { min: 1, max: 65535 }),
    username: normalizeString(input.username ?? current?.username),
    password: hasOwn(input, 'password') ? String(input.password || '') : String(current?.password || ''),
    testUrl: normalizeString(input.testUrl ?? current?.testUrl, 'https://www.google.com/generate_204'),
    timeoutMs: normalizeInteger(input.timeoutMs ?? current?.timeoutMs, '代理超时', { min: 1000, max: 60000, defaultValue: 8000 }),
    tags: normalizeStringList(input.tags ?? current?.tags),
    description: normalizeString(input.description ?? current?.description),
  }
  if (!result.username) result.password = ''
  return result
}

function sanitizeProxyOutbound (outbound) {
  const result = clone(outbound)
  delete result.password
  result.hasPassword = Boolean(outbound.password)
  return result
}

function normalizeProxyPool (input = {}, current = null) {
  const members = Array.isArray(input.members ?? current?.members)
    ? (input.members ?? current?.members).map(member => ({
        outboundId: normalizeSlug(member.outboundId, '代理出口 ID'),
        priority: normalizeInteger(member.priority ?? 0, '代理出口优先级', { min: 0, max: 10000 }),
        weight: normalizeInteger(member.weight ?? 1, '代理出口权重', { min: 1, max: 1000 }),
      }))
    : []

  const failover = input.failover ?? current?.failover ?? {}
  return {
    id: normalizeSlug(input.id ?? current?.id, '代理池 ID'),
    name: normalizeString(input.name ?? current?.name, '未命名代理池'),
    enabled: normalizeBoolean(input.enabled ?? current?.enabled, true),
    strategy: pickEnum(input.strategy ?? current?.strategy, ['priority', 'round_robin', 'failover'], '代理池策略', 'priority'),
    members,
    failover: {
      enabled: normalizeBoolean(failover.enabled, true),
      cooldownMs: normalizeInteger(failover.cooldownMs, '代理失败冷却时间', { min: 0, max: 3600000, defaultValue: 60000 }),
      maxAttemptsPerRequest: normalizeInteger(failover.maxAttemptsPerRequest, '单请求最大代理尝试次数', { min: 1, max: 10, defaultValue: 2 }),
    },
    description: normalizeString(input.description ?? current?.description),
  }
}

function normalizeCachePolicy (input = {}, current = null) {
  const cache = input ?? {}
  return {
    enabled: normalizeBoolean(cache.enabled ?? current?.enabled, true),
    ttlMs: cache.ttlMs === undefined
      ? current?.ttlMs
      : normalizeInteger(cache.ttlMs, '缓存 TTL', { min: 0, max: 1000 * 60 * 60 * 24 * 365 }),
    staleTtlMs: cache.staleTtlMs === undefined
      ? current?.staleTtlMs
      : normalizeInteger(cache.staleTtlMs, '缓存 stale TTL', { min: 0, max: 1000 * 60 * 60 * 24 * 365 }),
  }
}

function normalizeAccessLogPolicy (input = {}, current = null) {
  const accessLog = input ?? {}
  return {
    enabled: normalizeBoolean(accessLog.enabled ?? current?.enabled, true),
    maxLogCount: normalizeInteger(accessLog.maxLogCount ?? current?.maxLogCount, '图源访问日志保留行数', {
      min: 0,
      max: 10000,
      defaultValue: DEFAULT_SOURCE_ACCESS_LOG_LIMIT,
    }),
  }
}

function normalizeProxyPolicy (input = {}, current = null, defaultMode = 'never') {
  const proxy = input ?? {}
  const rawMode = normalizeString(proxy.mode ?? current?.mode ?? defaultMode).toLowerCase()
  const mode = ['inherit', 'manual'].includes(rawMode) ? defaultMode : rawMode
  const poolId = normalizeString(proxy.poolId ?? current?.poolId)
  const outboundId = normalizeString(proxy.outboundId ?? current?.outboundId)
  return {
    mode: pickEnum(mode, ['never', 'fixed', 'pool'], '代理模式', defaultMode),
    poolId: mode === 'pool' ? poolId : '',
    outboundId: mode === 'fixed' ? outboundId : '',
    fallbackToDirect: normalizeBoolean(proxy.fallbackToDirect ?? current?.fallbackToDirect, false),
  }
}

function normalizeRetinaPolicy (input = null, current = null) {
  const retina = input ?? {}
  const existing = current ?? {}
  const mode = pickEnum(retina.mode ?? existing.mode, ['none', 'query', 'fixed'], 'retina 模式', 'none')
  return {
    mode,
    param: mode === 'none' ? '' : normalizeString(retina.param ?? existing.param, 'scale'),
    normalValue: normalizeScaleValue(retina.normalValue ?? existing.normalValue, '普通瓦片 scale', '1'),
    retinaValue: normalizeScaleValue(retina.retinaValue ?? existing.retinaValue, '高清瓦片 scale', mode === 'none' ? '1' : '2'),
  }
}

function normalizeSource (input = {}, current = null) {
  const subdomains = normalizeStringList(input.subdomains ?? current?.subdomains)
  const permissions = input.permissions ?? current?.permissions ?? {}
  const visibility = input.visibility ?? current?.visibility ?? {}

  const minZoom = normalizeInteger(input.minZoom ?? current?.minZoom, '最小缩放', { min: 0, max: 30, defaultValue: 0 })
  const maxZoom = normalizeInteger(input.maxZoom ?? current?.maxZoom, '最大缩放', { min: 0, max: 30, defaultValue: 18 })
  if (minZoom > maxZoom) {
    throw createHttpError('最小缩放不能大于最大缩放')
  }

  return {
    id: normalizeSlug(input.id ?? current?.id, '图源 ID'),
    name: normalizeString(input.name ?? current?.name, '未命名图源'),
    enabled: normalizeBoolean(input.enabled ?? current?.enabled, true),
    vendor: normalizeString(input.vendor ?? current?.vendor, 'custom'),
    category: normalizeString(input.category ?? current?.category, 'custom'),
    kind: pickEnum(input.kind ?? current?.kind, ['xyz', 'tms'], '图源类型', 'xyz'),
    template: validateHttpTemplate(input.template ?? current?.template, subdomains),
    subdomains,
    minZoom,
    maxZoom,
    maxNativeZoom: normalizeInteger(input.maxNativeZoom ?? current?.maxNativeZoom, '最大原生缩放', { min: minZoom, max: 30, defaultValue: maxZoom }),
    tileSize: normalizeTileSize(input.tileSize ?? current?.tileSize),
    retina: normalizeRetinaPolicy(input.retina, current?.retina),
    cache: normalizeCachePolicy(input.cache ?? current?.cache, current?.cache),
    accessLog: normalizeAccessLogPolicy(input.accessLog ?? current?.accessLog, current?.accessLog),
    proxy: normalizeProxyPolicy(input.proxy ?? current?.proxy, current?.proxy),
    permissions: {
      frontendVisible: normalizeBoolean(permissions.frontendVisible, true),
      precacheAllowed: normalizeBoolean(permissions.precacheAllowed, true),
      externalApiAllowed: normalizeBoolean(permissions.externalApiAllowed, true),
      userReferenceAllowed: normalizeBoolean(permissions.userReferenceAllowed, true),
    },
    visibility: {
      scope: pickEnum(visibility.scope, ['system', 'external_only'], '图源可见范围', 'system'),
    },
    attribution: normalizeString(input.attribution ?? current?.attribution),
    bounds: input.bounds ?? current?.bounds ?? null,
    tags: normalizeStringList(input.tags ?? current?.tags),
    description: normalizeString(input.description ?? current?.description),
  }
}

function sanitizeSource (source, options = {}) {
  const result = clone(source)
  if (options.public) {
    delete result.template
    delete result.proxy
    delete result.cache
    delete result.permissions
    delete result.visibility
    result.tileUrl = `/api/v1/tiles/${source.id}/{z}/{x}/{y}`
  }
  return result
}

function normalizeLayer (input = {}, current = null) {
  const items = Array.isArray(input.items ?? current?.items)
    ? (input.items ?? current?.items).map((item, index) => ({
        sourceId: normalizeSlug(item.sourceId, '图源 ID'),
        opacity: normalizeNumber(item.opacity ?? 1, '图源透明度', { min: 0, max: 1, defaultValue: 1 }),
        zIndex: normalizeInteger(item.zIndex ?? index, '图源叠加顺序', { min: -1000, max: 1000, defaultValue: index }),
      }))
    : []
  if (!items.length) {
    throw createHttpError('图层至少需要包含一个图源')
  }

  return {
    id: normalizeSlug(input.id ?? current?.id, '图层 ID'),
    name: normalizeString(input.name ?? current?.name, '未命名图层'),
    enabled: normalizeBoolean(input.enabled ?? current?.enabled, true),
    frontendVisible: normalizeBoolean(input.frontendVisible ?? current?.frontendVisible, true),
    default: normalizeBoolean(input.default ?? current?.default, false),
    type: pickEnum(input.type ?? current?.type, ['base', 'overlay'], '图层类型', 'base'),
    clients: normalizeStringList(input.clients ?? current?.clients).filter(item => ['2d', '3d'].includes(item)),
    items,
    minZoom: normalizeInteger(input.minZoom ?? current?.minZoom, '图层最小缩放', { min: 0, max: 30, defaultValue: 0 }),
    maxZoom: normalizeInteger(input.maxZoom ?? current?.maxZoom, '图层最大缩放', { min: 0, max: 30, defaultValue: 18 }),
    sortOrder: normalizeInteger(input.sortOrder ?? current?.sortOrder, '图层排序', { min: -100000, max: 100000, defaultValue: 0 }),
    description: normalizeString(input.description ?? current?.description),
  }
}

function normalizeExternalPublish (input = {}, current = null, tokenValue = null) {
  const authInput = input.auth ?? current?.auth ?? {}
  const authMode = pickEnum(authInput.mode, ['none', 'token'], '对外发布鉴权模式', 'token')
  const tokenHash = tokenValue
    ? hashToken(tokenValue)
    : (authMode === 'token' ? normalizeString(authInput.tokenHash ?? current?.auth?.tokenHash) : '')
  const tokenPreview = tokenValue
    ? previewToken(tokenValue)
    : (authMode === 'token' ? normalizeString(authInput.tokenPreview ?? current?.auth?.tokenPreview) : '')
  const rateLimit = input.rateLimit ?? current?.rateLimit ?? {}
  const log = input.log ?? current?.log ?? {}
  const overrideInput = input.overrides && typeof input.overrides === 'object' ? input.overrides : null
  const currentOverrides = current?.overrides || {}
  const proxyOverride = overrideInput && hasOwn(overrideInput, 'proxy')
    ? overrideInput.proxy
    : currentOverrides.proxy
  const cacheOverride = overrideInput && hasOwn(overrideInput, 'cache')
    ? overrideInput.cache
    : currentOverrides.cache

  return {
    id: normalizeSlug(input.id ?? current?.id, '对外发布项 ID'),
    name: normalizeString(input.name ?? current?.name, '未命名发布项'),
    enabled: normalizeBoolean(input.enabled ?? current?.enabled, false),
    targetType: pickEnum(input.targetType ?? current?.targetType, ['source', 'layer', 'dedicated_source'], '发布目标类型', 'source'),
    targetId: normalizeSlug(input.targetId ?? current?.targetId, '发布目标 ID'),
    pathSlug: normalizeSlug(input.pathSlug ?? current?.pathSlug ?? input.id ?? current?.id, '发布路径'),
    auth: {
      mode: authMode,
      tokenHash,
      tokenPreview,
    },
    rateLimit: {
      enabled: normalizeBoolean(rateLimit.enabled, true),
      maxRequestsPerMinute: normalizeInteger(rateLimit.maxRequestsPerMinute, '每分钟请求上限', { min: 1, max: 100000, defaultValue: 600 }),
    },
    log: {
      enabled: normalizeBoolean(log.enabled, true),
      maxLogCount: normalizeInteger(log.maxLogCount, '日志上限', { min: 0, max: 10000, defaultValue: DEFAULT_EXTERNAL_LOG_LIMIT }),
    },
    overrides: {
      proxy: proxyOverride
        ? normalizeProxyPolicy(proxyOverride, currentOverrides.proxy, 'never')
        : null,
      cache: cacheOverride
        ? normalizeCachePolicy(cacheOverride, currentOverrides.cache)
        : null,
    },
    description: normalizeString(input.description ?? current?.description),
  }
}

export class TileCatalogManager {
  constructor ({ store, defaults = {} }) {
    this.store = store
    this.defaults = defaults
    this.loaded = false
    this.sources = []
    this.layers = []
    this.proxyOutbounds = []
    this.proxyPools = []
    this.externalPublishes = []
    this.externalLogs = []
    this.sourceAccessLogs = []
    this.roundRobinState = new Map()
    this.proxyCooldowns = new Map()
    this.rateLimits = new Map()
  }

  async ensureLoaded () {
    if (this.loaded) return

    const stores = await Promise.all([
      this.loadOrInit(STORE_PROXY_OUTBOUNDS, defaultProxyOutbounds()),
      this.loadOrInit(STORE_PROXY_POOLS, defaultProxyPools()),
      this.loadOrInit(STORE_SOURCES, defaultSources()),
      this.loadOrInit(STORE_LAYERS, defaultLayers()),
      this.loadOrInit(STORE_EXTERNAL_PUBLISHES, defaultExternalPublishes()),
      this.store.read(STORE_EXTERNAL_LOGS, []),
      this.store.read(STORE_SOURCE_ACCESS_LOGS, []),
    ])

    this.proxyOutbounds = stores[0].map(item => normalizeProxyOutbound(item))
    this.proxyPools = stores[1].map(item => normalizeProxyPool(item))
    this.sources = stores[2].map(item => normalizeSource(item))
    this.layers = stores[3].map(item => normalizeLayer(item))
    this.externalPublishes = stores[4].map(item => normalizeExternalPublish(item))
    this.externalLogs = Array.isArray(stores[5]) ? stores[5] : []
    this.sourceAccessLogs = Array.isArray(stores[6]) ? stores[6] : []
    this.validateAll()
    this.loaded = true
  }

  async loadOrInit (name, fallback) {
    const saved = await this.store.read(name, null)
    if (Array.isArray(saved) && saved.length) {
      return saved
    }
    await this.store.write(name, fallback)
    return clone(fallback)
  }

  validateAll () {
    this.sources.forEach(source => this.validateSourceRefs(source))
    this.layers.forEach(layer => this.validateLayerRefs(layer))
    this.proxyPools.forEach(pool => this.validateProxyPoolRefs(pool))
    this.externalPublishes.forEach(publish => this.validateExternalPublishRefs(publish))
    if (!this.layers.some(layer => layer.default && layer.enabled)) {
      const first = this.layers.find(layer => layer.enabled)
      if (first) first.default = true
    }
  }

  async writeStore (name, value) {
    await this.store.write(name, value)
  }

  findSource (id) {
    return this.sources.find(item => item.id === id) || null
  }

  findLayer (id) {
    return this.layers.find(item => item.id === id) || null
  }

  findProxyOutbound (id) {
    return this.proxyOutbounds.find(item => item.id === id) || null
  }

  findProxyPool (id) {
    return this.proxyPools.find(item => item.id === id) || null
  }

  findExternalPublish (idOrSlug) {
    return this.externalPublishes.find(item => item.id === idOrSlug || item.pathSlug === idOrSlug) || null
  }

  validateSourceRefs (source) {
    if (source.proxy.mode === 'fixed' && (!source.proxy.outboundId || !this.findProxyOutbound(source.proxy.outboundId))) {
      throw createHttpError('图源关联的代理出口不存在')
    }
    if (source.proxy.mode === 'pool' && (!source.proxy.poolId || !this.findProxyPool(source.proxy.poolId))) {
      throw createHttpError('图源关联的代理池不存在')
    }
  }

  validateLayerRefs (layer) {
    layer.items.forEach((item) => {
      const source = this.findSource(item.sourceId)
      if (!source) throw createHttpError(`图层引用的图源不存在：${item.sourceId}`)
    })
  }

  validateProxyPoolRefs (pool) {
    pool.members.forEach((member) => {
      if (!this.findProxyOutbound(member.outboundId)) {
        throw createHttpError(`代理池引用的代理出口不存在：${member.outboundId}`)
      }
    })
  }

  validateExternalPublishRefs (publish) {
    if (publish.targetType === 'layer') {
      const layer = this.findLayer(publish.targetId)
      if (!layer) throw createHttpError('对外发布项引用的图层不存在')
      if (!layer.enabled) throw createHttpError('不能发布已禁用图层')
      layer.items.forEach((item) => {
        const source = this.findSource(item.sourceId)
        if (!source) throw createHttpError(`对外发布图层引用的图源不存在：${item.sourceId}`)
        if (!source.permissions.externalApiAllowed) {
          throw createHttpError(`图源未允许对外发布：${item.sourceId}`)
        }
      })
      return
    }

    const source = this.findSource(publish.targetId)
    if (!source) throw createHttpError('对外发布项引用的图源不存在')
    if (publish.targetType === 'source' && !source.permissions.externalApiAllowed) {
      throw createHttpError('图源未允许对外发布')
    }
    if (publish.targetType === 'dedicated_source' && source.visibility.scope !== 'external_only') {
      throw createHttpError('专用发布项必须引用 external_only 图源')
    }
  }

  async listTileSources () {
    await this.ensureLoaded()
    return this.sources.map(source => sanitizeSource(source))
  }

  async getTileSource (id) {
    await this.ensureLoaded()
    const source = this.findSource(id)
    if (!source) throw createHttpError('图源不存在', 404)
    return sanitizeSource(source)
  }

  async createTileSource (input) {
    await this.ensureLoaded()
    const source = normalizeSource(input)
    if (this.findSource(source.id)) throw createHttpError('图源 ID 已存在')
    this.validateSourceRefs(source)
    this.sources.push(source)
    await this.writeStore(STORE_SOURCES, this.sources)
    return sanitizeSource(source)
  }

  async updateTileSource (id, input) {
    await this.ensureLoaded()
    const index = this.sources.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('图源不存在', 404)
    const source = normalizeSource({ ...input, id }, this.sources[index])
    this.validateSourceRefs(source)
    this.sources[index] = source
    await this.writeStore(STORE_SOURCES, this.sources)
    return sanitizeSource(source)
  }

  async deleteTileSource (id) {
    await this.ensureLoaded()
    const index = this.sources.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('图源不存在', 404)
    const layerRefs = this.layers.filter(layer => layer.items.some(item => item.sourceId === id)).map(layer => layer.id)
    const publishRefs = this.externalPublishes.filter(publish => publish.targetId === id).map(publish => publish.id)
    if (layerRefs.length || publishRefs.length) {
      throw createHttpError(`图源仍被引用，不能删除：${[...layerRefs, ...publishRefs].join(', ')}`)
    }
    const [removed] = this.sources.splice(index, 1)
    await this.writeStore(STORE_SOURCES, this.sources)
    return sanitizeSource(removed)
  }

  async listMapLayers () {
    await this.ensureLoaded()
    return this.layers.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(layer => clone(layer))
  }

  async createMapLayer (input) {
    await this.ensureLoaded()
    const layer = normalizeLayer(input)
    if (this.findLayer(layer.id)) throw createHttpError('图层 ID 已存在')
    this.validateLayerRefs(layer)
    if (layer.default) this.layers.forEach(item => { item.default = false })
    this.layers.push(layer)
    await this.writeStore(STORE_LAYERS, this.layers)
    return clone(layer)
  }

  async updateMapLayer (id, input) {
    await this.ensureLoaded()
    const index = this.layers.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('图层不存在', 404)
    const layer = normalizeLayer({ ...input, id }, this.layers[index])
    this.validateLayerRefs(layer)
    if (layer.default) this.layers.forEach(item => { item.default = false })
    this.layers[index] = layer
    await this.writeStore(STORE_LAYERS, this.layers)
    return clone(layer)
  }

  async deleteMapLayer (id) {
    await this.ensureLoaded()
    const index = this.layers.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('图层不存在', 404)
    const publishRefs = this.externalPublishes.filter(publish => publish.targetType === 'layer' && publish.targetId === id).map(publish => publish.id)
    if (publishRefs.length) throw createHttpError(`图层仍被发布项引用，不能删除：${publishRefs.join(', ')}`)
    const [removed] = this.layers.splice(index, 1)
    if (removed.default) {
      const first = this.layers.find(layer => layer.enabled)
      if (first) first.default = true
    }
    await this.writeStore(STORE_LAYERS, this.layers)
    return clone(removed)
  }

  async setDefaultMapLayer (id) {
    await this.ensureLoaded()
    const layer = this.findLayer(id)
    if (!layer) throw createHttpError('图层不存在', 404)
    if (!layer.enabled) throw createHttpError('不能将已禁用图层设为默认')
    this.layers.forEach(item => { item.default = item.id === id })
    await this.writeStore(STORE_LAYERS, this.layers)
    return clone(layer)
  }

  async listProxyOutbounds () {
    await this.ensureLoaded()
    return this.proxyOutbounds.map(sanitizeProxyOutbound)
  }

  async createProxyOutbound (input) {
    await this.ensureLoaded()
    const outbound = normalizeProxyOutbound(input)
    if (this.findProxyOutbound(outbound.id)) throw createHttpError('代理出口 ID 已存在')
    this.proxyOutbounds.push(outbound)
    await this.writeStore(STORE_PROXY_OUTBOUNDS, this.proxyOutbounds)
    return sanitizeProxyOutbound(outbound)
  }

  async updateProxyOutbound (id, input) {
    await this.ensureLoaded()
    const index = this.proxyOutbounds.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('代理出口不存在', 404)
    const outbound = normalizeProxyOutbound({ ...input, id }, this.proxyOutbounds[index])
    this.proxyOutbounds[index] = outbound
    await this.writeStore(STORE_PROXY_OUTBOUNDS, this.proxyOutbounds)
    return sanitizeProxyOutbound(outbound)
  }

  async deleteProxyOutbound (id) {
    await this.ensureLoaded()
    const poolRefs = this.proxyPools.filter(pool => pool.members.some(member => member.outboundId === id)).map(pool => pool.id)
    const sourceRefs = this.sources.filter(source => source.proxy.mode === 'fixed' && source.proxy.outboundId === id).map(source => source.id)
    if (poolRefs.length || sourceRefs.length) {
      throw createHttpError(`代理出口仍被引用，不能删除：${[...poolRefs, ...sourceRefs].join(', ')}`)
    }
    const index = this.proxyOutbounds.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('代理出口不存在', 404)
    const [removed] = this.proxyOutbounds.splice(index, 1)
    await this.writeStore(STORE_PROXY_OUTBOUNDS, this.proxyOutbounds)
    return sanitizeProxyOutbound(removed)
  }

  async listProxyPools () {
    await this.ensureLoaded()
    return this.proxyPools.map(pool => clone(pool))
  }

  async createProxyPool (input) {
    await this.ensureLoaded()
    const pool = normalizeProxyPool(input)
    if (this.findProxyPool(pool.id)) throw createHttpError('代理池 ID 已存在')
    this.validateProxyPoolRefs(pool)
    this.proxyPools.push(pool)
    await this.writeStore(STORE_PROXY_POOLS, this.proxyPools)
    return clone(pool)
  }

  async updateProxyPool (id, input) {
    await this.ensureLoaded()
    const index = this.proxyPools.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('代理池不存在', 404)
    const pool = normalizeProxyPool({ ...input, id }, this.proxyPools[index])
    this.validateProxyPoolRefs(pool)
    this.proxyPools[index] = pool
    await this.writeStore(STORE_PROXY_POOLS, this.proxyPools)
    return clone(pool)
  }

  async deleteProxyPool (id) {
    await this.ensureLoaded()
    const sourceRefs = this.sources.filter(source => source.proxy.mode === 'pool' && source.proxy.poolId === id).map(source => source.id)
    if (sourceRefs.length) {
      throw createHttpError(`代理池仍被图源引用，不能删除：${sourceRefs.join(', ')}`)
    }
    const index = this.proxyPools.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('代理池不存在', 404)
    const [removed] = this.proxyPools.splice(index, 1)
    await this.writeStore(STORE_PROXY_POOLS, this.proxyPools)
    return clone(removed)
  }

  async getPublicCatalog () {
    await this.ensureLoaded()
    const publicSources = this.sources
      .filter(source => source.enabled && source.visibility.scope === 'system' && source.permissions.frontendVisible)
      .map(source => sanitizeSource(source, { public: true }))
    const sourceIds = new Set(publicSources.map(source => source.id))
    const publicLayers = this.layers
      .filter(layer => layer.enabled && layer.frontendVisible && layer.items.every(item => sourceIds.has(item.sourceId)))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(layer => clone(layer))
    return {
      sources: publicSources,
      layers: publicLayers,
      defaultLayerId: publicLayers.find(layer => layer.default)?.id || publicLayers[0]?.id || '',
    }
  }

  buildTileUrl (source, tile, options = {}) {
    const z = normalizeInteger(tile.z, 'z', { min: source.minZoom, max: source.maxZoom })
    const maxCoord = 2 ** z - 1
    const x = normalizeInteger(tile.x, 'x', { min: 0, max: maxCoord })
    const y = normalizeInteger(tile.y, 'y', { min: 0, max: maxCoord })
    const subdomains = source.subdomains || []
    const subdomain = subdomains.length ? subdomains[(x + y + z) % subdomains.length] : ''
    const scale = normalizeString(options.scale, source.retina?.normalValue || '1')
    const yTms = String(maxCoord - y)
    return source.template
      .replaceAll('{s}', subdomain)
      .replaceAll('{x}', String(x))
      .replaceAll('{y}', String(source.kind === 'tms' ? yTms : y))
      .replaceAll('{z}', String(z))
      .replaceAll('{scale}', scale)
      .replaceAll('{yTms}', yTms)
  }

  isOutboundCoolingDown (outboundId) {
    return Number(this.proxyCooldowns.get(outboundId) || 0) > Date.now()
  }

  markOutboundFailure (outboundId, cooldownMs = 60000) {
    if (!outboundId || cooldownMs <= 0) return
    this.proxyCooldowns.set(outboundId, Date.now() + cooldownMs)
  }

  selectPoolOutbound (pool) {
    const members = pool.members
      .map(member => ({ member, outbound: this.findProxyOutbound(member.outboundId) }))
      .filter(item => item.outbound?.enabled && !this.isOutboundCoolingDown(item.outbound.id))
      .sort((a, b) => b.member.priority - a.member.priority)

    if (!members.length) return null

    if (pool.strategy === 'round_robin') {
      const current = Number(this.roundRobinState.get(pool.id) || 0)
      const selected = members[current % members.length]
      this.roundRobinState.set(pool.id, current + 1)
      return selected.outbound
    }

    return members[0].outbound
  }

  async resolveProxyForSource (source, override = null) {
    await this.ensureLoaded()
    const proxyPolicy = override || source.proxy || { mode: 'never' }
    const mode = proxyPolicy.mode

    if (mode === 'never') {
      return { enabled: false }
    }

    let outbound = null
    let pool = null
    if (mode === 'fixed') {
      outbound = this.findProxyOutbound(proxyPolicy.outboundId)
      if (!outbound?.enabled) {
        if (proxyPolicy.fallbackToDirect) return { enabled: false }
        throw createHttpError('代理出口不可用', 502)
      }
    } else if (mode === 'pool') {
      pool = this.findProxyPool(proxyPolicy.poolId)
      if (!pool?.enabled) {
        if (proxyPolicy.fallbackToDirect) return { enabled: false }
        throw createHttpError('代理池不可用', 502)
      }
      outbound = this.selectPoolOutbound(pool)
      if (!outbound) {
        if (proxyPolicy.fallbackToDirect) return { enabled: false }
        throw createHttpError('代理池没有可用出口', 502)
      }
    } else {
      return { enabled: false }
    }

    return {
      enabled: true,
      protocol: outbound.protocol,
      host: outbound.host,
      port: outbound.port,
      username: outbound.username,
      password: outbound.password,
      outboundId: outbound.id,
      poolId: pool?.id || '',
    }
  }

  async createSourceTileRequest (sourceId, tile, options = {}) {
    await this.ensureLoaded()
    const source = this.findSource(sourceId)
    if (!source) throw createHttpError('图源不存在', 404)
    if (!source.enabled) throw createHttpError('图源已禁用', 403)
    const url = this.buildTileUrl(source, tile, options)
    const proxyPolicy = options.proxyOverride || source.proxy || { mode: 'never' }
    const proxy = await this.resolveProxyForSource(source, options.proxyOverride || null)
    return {
      source,
      url,
      proxy,
      proxyPolicy,
      cache: options.cacheOverride?.enabled ?? source.cache.enabled,
      cacheTtlMs: options.cacheOverride?.ttlMs ?? source.cache.ttlMs,
      staleCacheTtlMs: options.cacheOverride?.staleTtlMs ?? source.cache.staleTtlMs,
      cacheMeta: {
        sourceId: source.id,
        layerId: options.layerId || null,
        publishId: options.publishId || null,
      },
    }
  }

  verifyPublishToken (publish, token) {
    if (publish.auth.mode === 'none') return true
    if (!publish.auth.tokenHash || !token) return false
    return timingSafeEqualString(hashToken(token), publish.auth.tokenHash)
  }

  assertRateLimit (publish, clientIp = '') {
    if (!publish.rateLimit.enabled) return
    const key = `${publish.id}|${clientIp || 'unknown'}`
    const now = Date.now()
    const state = this.rateLimits.get(key)
    if (!state || now - state.windowStart >= DEFAULT_RATE_LIMIT_WINDOW_MS) {
      this.rateLimits.set(key, { windowStart: now, count: 1 })
      return
    }
    state.count += 1
    if (state.count > publish.rateLimit.maxRequestsPerMinute) {
      throw createHttpError('对外发布接口请求过于频繁', 429)
    }
  }

  assertExternalPublishAccess (publishId, options = {}) {
    const publish = this.findExternalPublish(publishId)
    if (!publish) throw createHttpError('对外发布项不存在', 404)
    if (!publish.enabled) throw createHttpError('对外发布项未启用', 403)
    if (!this.verifyPublishToken(publish, options.token)) {
      throw createHttpError('拒绝访问：Token 校验失败', 401)
    }
    this.assertRateLimit(publish, options.clientIp)
    return publish
  }

  async listExternalPublishes () {
    await this.ensureLoaded()
    return this.externalPublishes.map(publish => this.sanitizeExternalPublish(publish))
  }

  sanitizeExternalPublish (publish) {
    return {
      ...clone(publish),
      auth: {
        mode: publish.auth.mode,
        tokenPreview: publish.auth.tokenPreview,
        hasToken: Boolean(publish.auth.tokenHash),
      },
    }
  }

  async createExternalPublish (input) {
    await this.ensureLoaded()
    const shouldGenerateToken = (input.auth?.mode || 'token') === 'token' && !input.auth?.token
    const token = input.auth?.token || (shouldGenerateToken ? generateToken() : null)
    const publish = normalizeExternalPublish(input, null, token)
    if (this.findExternalPublish(publish.id) || this.findExternalPublish(publish.pathSlug)) {
      throw createHttpError('对外发布项 ID 或路径已存在')
    }
    this.validateExternalPublishRefs(publish)
    this.externalPublishes.push(publish)
    await this.writeStore(STORE_EXTERNAL_PUBLISHES, this.externalPublishes)
    return {
      publish: this.sanitizeExternalPublish(publish),
      token: token || undefined,
    }
  }

  async updateExternalPublish (id, input) {
    await this.ensureLoaded()
    const index = this.externalPublishes.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('对外发布项不存在', 404)
    const token = input.auth?.token || null
    const publish = normalizeExternalPublish({ ...input, id }, this.externalPublishes[index], token)
    const duplicate = this.externalPublishes.find(item => item.id !== id && (item.id === publish.id || item.pathSlug === publish.pathSlug))
    if (duplicate) throw createHttpError('对外发布项路径已存在')
    this.validateExternalPublishRefs(publish)
    this.externalPublishes[index] = publish
    await this.writeStore(STORE_EXTERNAL_PUBLISHES, this.externalPublishes)
    return {
      publish: this.sanitizeExternalPublish(publish),
      token: token || undefined,
    }
  }

  async deleteExternalPublish (id) {
    await this.ensureLoaded()
    const index = this.externalPublishes.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('对外发布项不存在', 404)
    const [removed] = this.externalPublishes.splice(index, 1)
    await this.writeStore(STORE_EXTERNAL_PUBLISHES, this.externalPublishes)
    return this.sanitizeExternalPublish(removed)
  }

  async resetExternalPublishToken (id) {
    await this.ensureLoaded()
    const index = this.externalPublishes.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('对外发布项不存在', 404)
    const token = generateToken()
    this.externalPublishes[index] = normalizeExternalPublish({
      ...this.externalPublishes[index],
      auth: {
        ...this.externalPublishes[index].auth,
        mode: 'token',
      },
    }, this.externalPublishes[index], token)
    await this.writeStore(STORE_EXTERNAL_PUBLISHES, this.externalPublishes)
    return {
      publish: this.sanitizeExternalPublish(this.externalPublishes[index]),
      token,
    }
  }

  async createExternalTileRequest (publishId, tile, options = {}) {
    await this.ensureLoaded()
    const publish = this.assertExternalPublishAccess(publishId, options)

    if (publish.targetType === 'layer') {
      throw createHttpError('组合图层发布项请使用 sources 瓦片接口', 400)
    }

    const source = this.findSource(publish.targetId)
    if (!source) throw createHttpError('对外发布项引用的图源不存在', 404)
    if (!source.enabled) throw createHttpError('对外发布项引用的图源已禁用', 403)
    if (publish.targetType === 'source' && !source.permissions.externalApiAllowed) {
      throw createHttpError('图源未允许对外发布', 403)
    }

    const proxyOverride = publish.overrides.proxy || null
    const cacheOverride = publish.overrides.cache || null
    const request = await this.createSourceTileRequest(source.id, tile, {
      ...options,
      proxyOverride,
      cacheOverride,
      publishId: publish.id,
    })

    return {
      ...request,
      publish,
    }
  }

  async createExternalLayerSourceTileRequest (publishId, sourceId, tile, options = {}) {
    await this.ensureLoaded()
    const publish = this.assertExternalPublishAccess(publishId, options)
    if (publish.targetType !== 'layer') {
      throw createHttpError('非组合图层发布项请使用发布项瓦片接口', 400)
    }

    const layer = this.findLayer(publish.targetId)
    if (!layer) throw createHttpError('对外发布项引用的图层不存在', 404)
    if (!layer.enabled) throw createHttpError('对外发布项引用的图层已禁用', 403)
    const layerItem = layer.items.find(item => item.sourceId === sourceId)
    if (!layerItem) throw createHttpError('图层发布项不包含该图源', 404)
    const source = this.findSource(sourceId)
    if (!source) throw createHttpError('图层发布项引用的图源不存在', 404)
    if (!source.enabled) throw createHttpError('图层发布项引用的图源已禁用', 403)
    if (!source.permissions.externalApiAllowed) throw createHttpError('图源未允许对外发布', 403)
    const request = await this.createSourceTileRequest(source.id, tile, {
      ...options,
      proxyOverride: publish.overrides.proxy || null,
      cacheOverride: publish.overrides.cache || null,
      publishId: publish.id,
      layerId: layer.id,
    })
    return {
      ...request,
      publish,
      layer,
      layerItem,
    }
  }

  async getExternalPublishTileJson (publishId, options = {}) {
    await this.ensureLoaded()
    const publish = this.assertExternalPublishAccess(publishId, options)
    const tokenRequired = publish.auth.mode === 'token'
    if (publish.targetType === 'layer') {
      const layer = this.findLayer(publish.targetId)
      if (!layer) throw createHttpError('对外发布项引用的图层不存在', 404)
      if (!layer.enabled) throw createHttpError('对外发布项引用的图层已禁用', 403)
      const sources = layer.items.map((item) => {
        const source = this.findSource(item.sourceId)
        if (!source) throw createHttpError(`对外发布图层引用的图源不存在：${item.sourceId}`, 404)
        if (!source.enabled) throw createHttpError(`对外发布图层引用的图源已禁用：${item.sourceId}`, 403)
        if (!source.permissions.externalApiAllowed) throw createHttpError(`图源未允许对外发布：${item.sourceId}`, 403)
        return {
          ...sanitizeSource(source, { public: true }),
          tileUrl: `/api/v1/external/${publish.pathSlug}/sources/${item.sourceId}/{z}/{x}/{y}`,
          opacity: item.opacity,
          zIndex: item.zIndex,
        }
      })
      return {
        tilejson: '3.0.0',
        id: publish.id,
        name: publish.name,
        type: 'layer',
        minzoom: layer.minZoom,
        maxzoom: layer.maxZoom,
        tokenRequired,
        auth: { mode: publish.auth.mode },
        layer: {
          ...clone(layer),
          items: layer.items.map(item => ({
            ...item,
            tileUrl: `/api/v1/external/${publish.pathSlug}/sources/${item.sourceId}/{z}/{x}/{y}`,
          })),
        },
        sources,
      }
    }
    const source = this.findSource(publish.targetId)
    if (!source) throw createHttpError('对外发布项引用的图源不存在', 404)
    if (!source.enabled) throw createHttpError('对外发布项引用的图源已禁用', 403)
    if (publish.targetType === 'source' && !source.permissions.externalApiAllowed) {
      throw createHttpError('图源未允许对外发布', 403)
    }
    return {
      tilejson: '3.0.0',
      id: publish.id,
      name: publish.name,
      minzoom: source.minZoom,
      maxzoom: source.maxZoom,
      attribution: source.attribution,
      tokenRequired,
      auth: { mode: publish.auth.mode },
      tiles: [`/api/v1/external/${publish.pathSlug}/{z}/{x}/{y}`],
    }
  }

  async addExternalLog (entry, maxLogCount = DEFAULT_EXTERNAL_LOG_LIMIT) {
    await this.ensureLoaded()
    if (maxLogCount <= 0) return
    this.externalLogs.unshift(entry)
    if (this.externalLogs.length > maxLogCount) {
      this.externalLogs.length = maxLogCount
    }
    await this.writeStore(STORE_EXTERNAL_LOGS, this.externalLogs)
  }

  async listExternalLogs (publishId = '') {
    await this.ensureLoaded()
    const publish = publishId ? this.findExternalPublish(publishId) : null
    const normalizedPublishId = publish?.id || publishId
    return this.externalLogs.filter(log => !normalizedPublishId || log.publishId === normalizedPublishId)
  }

  async addSourceAccessLog (entry, maxLogCount = DEFAULT_SOURCE_ACCESS_LOG_LIMIT) {
    await this.ensureLoaded()
    if (maxLogCount <= 0) return
    const sourceId = normalizeString(entry.sourceId)
    if (!sourceId) return
    this.sourceAccessLogs.unshift({
      ...entry,
      sourceId,
    })

    let countForSource = 0
    this.sourceAccessLogs = this.sourceAccessLogs.filter((log) => {
      if (log.sourceId !== sourceId) return true
      countForSource += 1
      return countForSource <= maxLogCount
    })

    await this.writeStore(STORE_SOURCE_ACCESS_LOGS, this.sourceAccessLogs)
  }

  async listSourceAccessLogs (sourceId = '') {
    await this.ensureLoaded()
    const normalizedSourceId = normalizeString(sourceId)
    return this.sourceAccessLogs.filter(log => !normalizedSourceId || log.sourceId === normalizedSourceId)
  }

  async testProxyOutbound (id) {
    await this.ensureLoaded()
    const outbound = this.findProxyOutbound(id)
    if (!outbound) throw createHttpError('代理出口不存在', 404)

    const testUrl = outbound.testUrl || 'https://www.google.com/generate_204'
    const timeout = outbound.timeoutMs || 8000
    const startTime = Date.now()

    const axiosConfig = {
      url: testUrl,
      method: 'GET',
      timeout,
      validateStatus: () => true,
    }

    const proxyConfig = {
      protocol: outbound.protocol || 'http',
      host: outbound.host,
      port: Number(outbound.port),
    }
    if (outbound.username) {
      proxyConfig.auth = {
        username: outbound.username,
        password: outbound.password || '',
      }
    }
    axiosConfig.proxy = proxyConfig

    try {
      const { default: axios } = await import('axios')
      const response = await axios(axiosConfig)
      const duration = Date.now() - startTime
      return {
        success: response.status >= 200 && response.status < 400,
        statusCode: response.status,
        duration,
        errorMessage: response.status >= 400 ? `HTTP 状态码 ${response.status}` : null,
      }
    } catch (err) {
      return {
        success: false,
        statusCode: err.response?.status || null,
        duration: Date.now() - startTime,
        errorMessage: err.message || '网络连接超时或解析失败',
      }
    }
  }

  async testProxyPool (id) {
    await this.ensureLoaded()
    const pool = this.findProxyPool(id)
    if (!pool) throw createHttpError('代理池不存在', 404)

    const results = []
    for (const member of pool.members) {
      const outbound = this.findProxyOutbound(member.outboundId)
      if (!outbound) {
        results.push({
          outboundId: member.outboundId,
          success: false,
          errorMessage: '代理出口未找到',
        })
        continue
      }
      const res = await this.testProxyOutbound(outbound.id).catch(err => ({
        success: false,
        errorMessage: err.message,
      }))
      results.push({
        outboundId: outbound.id,
        outboundName: outbound.name,
        ...res,
      })
    }
    return {
      id: pool.id,
      name: pool.name,
      success: results.some(r => r.success),
      members: results,
    }
  }

  async testTileSource (id) {
    await this.ensureLoaded()
    const source = this.findSource(id)
    if (!source) throw createHttpError('图源不存在', 404)

    const zoom = Math.floor((source.minZoom + source.maxZoom) / 2)
    const x = lonToTileX(103.823557, zoom)
    const y = latToTileY(36.058039, zoom)

    const startTime = Date.now()
    try {
      const request = await this.createSourceTileRequest(source.id, { z: zoom, x, y })
      const { default: axios } = await import('axios')
      const axiosConfig = {
        url: request.url,
        method: 'GET',
        timeout: 10000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
      }
      if (request.proxy && request.proxy.enabled) {
        axiosConfig.proxy = {
          protocol: request.proxy.protocol || 'http',
          host: request.proxy.host,
          port: Number(request.proxy.port),
        }
        if (request.proxy.username) {
          axiosConfig.proxy.auth = {
            username: request.proxy.username,
            password: request.proxy.password || '',
          }
        }
      }
      const response = await axios(axiosConfig)
      const duration = Date.now() - startTime
      const success = response.status >= 200 && response.status < 300
      return {
        success,
        statusCode: response.status,
        duration,
        proxyUsed: request.proxy && request.proxy.enabled ? request.proxy.outboundId : null,
        errorMessage: success ? null : `HTTP 状态码 ${response.status}`,
      }
    } catch (err) {
      return {
        success: false,
        statusCode: err.response?.status || null,
        duration: Date.now() - startTime,
        errorMessage: err.message || '回源请求失败',
      }
    }
  }

  async testExternalPublish (id) {
    await this.ensureLoaded()
    const publish = this.findExternalPublish(id)
    if (!publish) throw createHttpError('对外发布项不存在', 404)

    if (publish.targetType === 'source' || publish.targetType === 'dedicated_source') {
      return this.testTileSource(publish.targetId)
    } else if (publish.targetType === 'layer') {
      const layer = this.findLayer(publish.targetId)
      if (!layer) throw createHttpError('关联图层不存在', 404)
      if (layer.items.length === 0) throw createHttpError('关联图层不包含图源')
      return this.testTileSource(layer.items[0].sourceId)
    }
    throw createHttpError('不支持的发布项目标类型')
  }
}

function lonToTileX (lon, zoom) {
  const scale = 2 ** zoom
  return Math.max(0, Math.min(scale - 1, Math.floor(((lon + 180) / 360) * scale)))
}

function latToTileY (lat, zoom) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const rad = clampedLat * Math.PI / 180
  const scale = 2 ** zoom
  const y = Math.floor((1 - Math.log(Math.tan(rad) + (1 / Math.cos(rad))) / Math.PI) / 2 * scale)
  return Math.max(0, Math.min(scale - 1, y))
}

export default TileCatalogManager
