import crypto from 'node:crypto'
import {
  createPinnedHttpAgents,
  createPinnedProxyRequestConfig,
  isLocalProxyEndpoint,
  resolvePublicHttpTarget,
  validatePublicHttpUrl,
} from '../security/networkTarget.js'

const STORE_SOURCES = 'tile-sources'
const STORE_LAYERS = 'map-layers'
const STORE_PROXY_OUTBOUNDS = 'proxy-outbounds'
const STORE_PROXY_POOLS = 'proxy-pools'
const STORE_EXTERNAL_PUBLISHES = 'external-publishes'
const STORE_EXTERNAL_LOGS = 'external-publish-logs'
const STORE_SOURCE_ACCESS_LOGS = 'source-access-logs'
const STORE_SOURCE_PRESETS = 'source-presets'
const STORE_KEY_POOLS = 'key-pools'

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/
const DEFAULT_TOKEN_BYTES = 24
const DEFAULT_EXTERNAL_LOG_LIMIT = 500
const DEFAULT_SOURCE_ACCESS_LOG_LIMIT = 500
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000
const VECTOR_RESOURCE_REF_TTL_MS = 1000 * 60 * 60
const VECTOR_RESOURCE_REF_MAX_COUNT = 5000
const TEMPLATE_PLACEHOLDERS = ['s', 'x', 'y', 'z', 'scale', 'yTms', 'key', 'token', 'tk', 'appid', 'format', 'time', 'style', 'layer', 'quadkey', 'fontstack', 'range']
const ALLOWED_TILE_SIZES = [256]
const ALLOWED_TILE_SCALES = ['1', '2', '3']
const SOURCE_KINDS = [
  'xyz',
  'tms',
  'xyz-raster',
  'tms-raster',
  'wmts-raster',
  'arcgis-raster',
  'quadkey-raster',
  'google-map-tiles-api',
  'mvt',
  'vector-tilejson',
  'vector-style',
  'pmtiles-vector',
  'pmtiles-raster',
  'time-raster',
  'sdk-raster',
]
const VECTOR_RESOURCE_TYPES = ['style', 'tilejson', 'mvt', 'glyph', 'sprite-json', 'sprite-png', 'sprite-json-2x', 'sprite-png-2x', 'pmtiles-range']
const KEY_POOL_STRATEGIES = ['round_robin', 'priority_failover', 'random', 'weighted_round_robin']
const SECRET_PLACEMENTS = ['query', 'header', 'bearer', 'session']

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
    .replaceAll('{key}', 'test-key')
    .replaceAll('{token}', 'test-token')
    .replaceAll('{tk}', 'test-tk')
    .replaceAll('{appid}', 'test-appid')
    .replaceAll('{format}', 'png')
    .replaceAll('{time}', '0')
    .replaceAll('{style}', 'default')
    .replaceAll('{layer}', 'default')
    .replaceAll('{quadkey}', '0')
    .replaceAll('{fontstack}', 'Noto Sans Regular')
    .replaceAll('{range}', '0-255')
}

function normalizePublicHttpUrl (value, name, defaultValue = '') {
  const normalized = normalizeString(value, defaultValue)
  try {
    validatePublicHttpUrl(normalized, { label: name })
  } catch (err) {
    throw createHttpError(err.message)
  }
  return normalized
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

  try {
    validatePublicHttpUrl(sampleTemplateUrl(normalized, subdomains), { label: 'URL 模板' })
  } catch (err) {
    throw createHttpError(err.message)
  }
  return normalized
}

function resolveHttpTemplate (template, baseUrl = '') {
  const normalized = normalizeString(template)
  if (!normalized) return ''
  if (/^mapbox:\/\//i.test(normalized) || /^pmtiles:\/\//i.test(normalized)) return normalized
  if (/^https?:\/\//i.test(normalized)) return normalized
  if (!baseUrl) return normalized

  const placeholderPrefix = '__MAP_SERVICE_PLACEHOLDER_'
  const protectedTemplate = normalized.replace(/\{([^}]+)\}/g, (_, name) => `${placeholderPrefix}${name}__`)
  const resolved = new URL(protectedTemplate, baseUrl).toString()
  return resolved.replace(new RegExp(`${placeholderPrefix}([^_]+)__`, 'g'), (_, name) => `{${name}}`)
}

function validateResolvedResourceTemplate (template, subdomains = []) {
  const normalized = normalizeString(template)
  if (!normalized) {
    throw createHttpError('矢量资源 URL 不能为空')
  }
  if (/^(mapbox|pmtiles):\/\//i.test(normalized)) {
    throw createHttpError('当前适配器暂不支持直接代理非 HTTP 矢量资源 URL')
  }
  return validateHttpTemplate(normalized, subdomains)
}

function appendUrlPathSuffix (url, suffix) {
  const normalized = String(url || '')
  if (!normalized || normalized.endsWith(suffix)) return normalized
  const hashIndex = normalized.indexOf('#')
  const queryIndex = normalized.indexOf('?')
  const splitIndex = [queryIndex, hashIndex].filter(index => index >= 0).sort((a, b) => a - b)[0]
  const pathPart = splitIndex >= 0 ? normalized.slice(0, splitIndex) : normalized
  const tail = splitIndex >= 0 ? normalized.slice(splitIndex) : ''
  if (pathPart.endsWith('.json') || pathPart.endsWith('.png')) return normalized
  return `${pathPart}${suffix}${tail}`
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

function maskSecret (value) {
  return previewToken(value)
}

function generateToken () {
  return crypto.randomBytes(DEFAULT_TOKEN_BYTES).toString('base64url')
}

function normalizeHttpUrl (value, name) {
  const url = normalizeString(value)
  if (!url) return ''
  let parsed
  try {
    parsed = new URL(url)
  } catch (err) {
    throw createHttpError(`${name} 不是有效 URL`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw createHttpError(`${name} 仅支持 http 或 https`)
  }
  return parsed.toString()
}

const DEFAULT_KEY_POOL_VENDOR_META = {
  tianditu: {
    name: '天地图默认密钥池',
    secretType: 'tk',
    placement: 'query',
    paramName: 'tk',
    credentialUrl: 'https://cloudcenter.tianditu.gov.cn/center/development/myApp',
  },
  tencent: {
    name: '腾讯位置服务默认密钥池',
    secretType: 'api_key',
    placement: 'query',
    paramName: 'key',
    credentialUrl: 'https://lbs.qq.com/console/setting.html',
  },
  baidu: {
    name: '百度地图默认密钥池',
    secretType: 'ak',
    placement: 'query',
    paramName: 'ak',
    credentialUrl: 'https://lbsyun.baidu.com/apiconsole/key',
  },
  amap: {
    name: '高德开放平台默认密钥池',
    secretType: 'api_key',
    placement: 'query',
    paramName: 'key',
    credentialUrl: 'https://lbs.amap.com/api/webservice/create-project-and-key',
  },
  google: {
    name: 'Google Maps Platform 默认密钥池',
    secretType: 'api_key',
    placement: 'query',
    paramName: 'key',
    credentialUrl: 'https://console.cloud.google.com/google/maps-apis/credentials',
  },
  maptiler: {
    name: 'MapTiler 默认密钥池',
    secretType: 'api_key',
    placement: 'query',
    paramName: 'key',
    credentialUrl: 'https://cloud.maptiler.com/account/keys/',
  },
  mapbox: {
    name: 'Mapbox 默认令牌池',
    secretType: 'token',
    placement: 'query',
    paramName: 'access_token',
    credentialUrl: 'https://console.mapbox.com/account/access-tokens/',
  },
  stadia: {
    name: 'Stadia Maps 默认密钥池',
    secretType: 'api_key',
    placement: 'query',
    paramName: 'api_key',
    credentialUrl: 'https://client.stadiamaps.com/dashboard/',
  },
  here: {
    name: 'HERE 默认密钥池',
    secretType: 'api_key',
    placement: 'query',
    paramName: 'apiKey',
    credentialUrl: 'https://platform.here.com/access/apps',
  },
  microsoft: {
    name: 'Azure Maps 默认密钥池',
    secretType: 'api_key',
    placement: 'query',
    paramName: 'subscription-key',
    credentialUrl: 'https://portal.azure.com/',
  },
  thunderforest: {
    name: 'Thunderforest 默认密钥池',
    secretType: 'api_key',
    placement: 'query',
    paramName: 'apikey',
    credentialUrl: 'https://manage.thunderforest.com/dashboard',
  },
  openweathermap: {
    name: 'OpenWeatherMap 默认密钥池',
    secretType: 'appid',
    placement: 'query',
    paramName: 'appid',
    credentialUrl: 'https://home.openweathermap.org/api_keys',
  },
}

function defaultKeyPools () {
  const byVendor = new Map()
  defaultSourcePresets()
    .filter(preset => preset.requiresKey)
    .forEach((preset) => {
      const vendor = normalizeString(preset.vendor, 'custom')
      const current = byVendor.get(vendor) || {
        vendor,
        presetIds: [],
        secretTypes: new Set(),
        placement: preset.defaultKeyPlacement?.placement || 'query',
        paramName: preset.defaultKeyPlacement?.paramName || 'key',
      }
      current.presetIds.push(preset.presetId)
      const secretTypes = preset.requiredSecretTypes || []
      secretTypes.forEach(type => current.secretTypes.add(type))
      if (preset.defaultKeyPlacement?.paramName && current.paramName === 'key') {
        current.paramName = preset.defaultKeyPlacement.paramName
      }
      byVendor.set(vendor, current)
    })

  return [...byVendor.values()].map((group) => {
    const meta = DEFAULT_KEY_POOL_VENDOR_META[group.vendor] || {}
    const secretType = meta.secretType || [...group.secretTypes][0] || 'api_key'
    return {
      id: `default-${group.vendor}-key-pool`,
      name: meta.name || `${group.vendor} 默认密钥池`,
      vendor: group.vendor,
      enabled: true,
      scope: 'global',
      strategy: 'round_robin',
      cooldownMs: 300000,
      maxRetriesPerRequest: 2,
      defaultSecretType: secretType,
      defaultPlacement: meta.placement || group.placement || 'query',
      defaultParamName: meta.paramName || group.paramName || 'key',
      credentialUrl: meta.credentialUrl || '',
      allowedPresetIds: group.presetIds,
      allowedSourceIds: [],
      keys: [],
      description: '系统预置密钥池。基于对应图源预设创建图源时会自动关联，请在这里添加并启用厂商 Key。',
    }
  })
}

function defaultSourcePresets () {
  const preset = (input) => ({
    defaultDisabled: true,
    requiresKey: false,
    requiredSecretTypes: [],
    defaultKeyPlacement: { placement: 'query', paramName: 'key' },
    subdomains: [],
    minZoom: 0,
    maxZoom: 18,
    bounds: null,
    coordinateSystem: 'EPSG:3857',
    schema: '',
    attribution: '',
    termsUrl: '',
    officialStatus: 'official',
    licenseType: 'unknown',
    cacheAllowedByLicense: true,
    publicUseAllowed: false,
    chinaPublicUseRisk: '',
    status: 'ready',
    entry: {},
    ...input,
  })

  return [
    preset({ presetId: 'preset:amap-standard-raster', name: '高德标准图栅格版', vendor: 'amap', category: 'street', kind: 'xyz-raster', adapter: 'template', officialStatus: 'unofficial', chinaPublicUseRisk: '直接瓦片 URL 属于非官方接入，公开商用需单独评估。', entry: { template: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=7&x={x}&y={y}&z={z}&scl={scale}' }, subdomains: ['1', '2', '3', '4'] }),
    preset({ presetId: 'preset:amap-satellite-raster', name: '高德卫星', vendor: 'amap', category: 'satellite', kind: 'xyz-raster', adapter: 'template', officialStatus: 'unofficial', entry: { template: 'https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=6&x={x}&y={y}&z={z}&scl={scale}' }, subdomains: ['1', '2', '3', '4'] }),
    preset({ presetId: 'preset:amap-road-raster', name: '高德道路注记', vendor: 'amap', category: 'label', kind: 'xyz-raster', adapter: 'template', officialStatus: 'unofficial', entry: { template: 'https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}&scl=1' }, subdomains: ['1', '2', '3', '4'] }),
    preset({ presetId: 'preset:amap-traffic-raster', name: '高德实时路况', vendor: 'amap', category: 'overlay', kind: 'xyz-raster', adapter: 'requires_adapter', status: 'requires_adapter' }),
    preset({ presetId: 'preset:tianditu-vec-wmts', name: '天地图矢量底图栅格版', vendor: 'tianditu', category: 'street', kind: 'wmts-raster', adapter: 'wmts-kvp', requiresKey: true, requiredSecretTypes: ['tk'], defaultKeyPlacement: { placement: 'query', paramName: 'tk' }, entry: { template: 'https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={key}' }, subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'] }),
    preset({ presetId: 'preset:tianditu-cva-wmts', name: '天地图矢量注记', vendor: 'tianditu', category: 'label', kind: 'wmts-raster', adapter: 'wmts-kvp', requiresKey: true, requiredSecretTypes: ['tk'], defaultKeyPlacement: { placement: 'query', paramName: 'tk' }, entry: { template: 'https://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={key}' }, subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'] }),
    preset({ presetId: 'preset:tianditu-img-wmts', name: '天地图影像', vendor: 'tianditu', category: 'satellite', kind: 'wmts-raster', adapter: 'wmts-kvp', requiresKey: true, requiredSecretTypes: ['tk'], defaultKeyPlacement: { placement: 'query', paramName: 'tk' }, entry: { template: 'https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={key}' }, subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'] }),
    preset({ presetId: 'preset:tianditu-cia-wmts', name: '天地图影像注记', vendor: 'tianditu', category: 'label', kind: 'wmts-raster', adapter: 'wmts-kvp', requiresKey: true, requiredSecretTypes: ['tk'], defaultKeyPlacement: { placement: 'query', paramName: 'tk' }, entry: { template: 'https://t{s}.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={key}' }, subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'] }),
    preset({ presetId: 'preset:tianditu-ter-wmts', name: '天地图地形', vendor: 'tianditu', category: 'terrain', kind: 'wmts-raster', adapter: 'wmts-kvp', requiresKey: true, requiredSecretTypes: ['tk'], defaultKeyPlacement: { placement: 'query', paramName: 'tk' }, entry: { template: 'https://t{s}.tianditu.gov.cn/ter_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ter&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={key}' }, subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'] }),
    preset({ presetId: 'preset:tianditu-cta-wmts', name: '天地图地形注记', vendor: 'tianditu', category: 'label', kind: 'wmts-raster', adapter: 'wmts-kvp', requiresKey: true, requiredSecretTypes: ['tk'], defaultKeyPlacement: { placement: 'query', paramName: 'tk' }, entry: { template: 'https://t{s}.tianditu.gov.cn/cta_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cta&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={key}' }, subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'] }),
    preset({ presetId: 'preset:tencent-wmts', name: '腾讯位置服务 WMTS', vendor: 'tencent', category: 'street', kind: 'wmts-raster', adapter: 'wmts-kvp', requiresKey: true, requiredSecretTypes: ['api_key'], status: 'requires_adapter' }),
    preset({ presetId: 'preset:baidu-map-sdk', name: '百度地图官方 SDK', vendor: 'baidu', category: 'street', kind: 'sdk-raster', adapter: 'baidu-sdk', requiresKey: true, requiredSecretTypes: ['ak'], status: 'research_only' }),
    preset({ presetId: 'preset:google-vt-road', name: 'Google 传统道路图', vendor: 'google', category: 'street', kind: 'xyz-raster', adapter: 'template', officialStatus: 'unofficial', entry: { template: 'https://www.google.com/maps/vt?lyrs=m@189&gl=cn&x={x}&y={y}&z={z}&scale={scale}' }, maxZoom: 22 }),
    preset({ presetId: 'preset:google-vt-satellite', name: 'Google 传统卫星', vendor: 'google', category: 'satellite', kind: 'xyz-raster', adapter: 'template', officialStatus: 'unofficial', entry: { template: 'https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}&scale={scale}' }, maxZoom: 22 }),
    preset({ presetId: 'preset:google-vt-hybrid', name: 'Google 传统卫星混合', vendor: 'google', category: 'satellite', kind: 'xyz-raster', adapter: 'template', officialStatus: 'unofficial', entry: { template: 'https://www.google.com/maps/vt?lyrs=y&gl=cn&x={x}&y={y}&z={z}&scale={scale}' }, maxZoom: 22 }),
    preset({ presetId: 'preset:google-vt-labels', name: 'Google 传统道路注记', vendor: 'google', category: 'label', kind: 'xyz-raster', adapter: 'template', officialStatus: 'unofficial', entry: { template: 'https://www.google.com/maps/vt?lyrs=h&gl=cn&x={x}&y={y}&z={z}&scale={scale}' }, maxZoom: 22 }),
    preset({ presetId: 'preset:google-vt-terrain', name: 'Google 传统地形', vendor: 'google', category: 'terrain', kind: 'xyz-raster', adapter: 'template', officialStatus: 'unofficial', entry: { template: 'https://www.google.com/maps/vt?lyrs=p&gl=cn&x={x}&y={y}&z={z}&scale={scale}' }, maxZoom: 22 }),
    preset({ presetId: 'preset:google-official-roadmap', name: 'Google 官方 Roadmap Tiles', vendor: 'google', category: 'street', kind: 'google-map-tiles-api', adapter: 'google-session', requiresKey: true, requiredSecretTypes: ['api_key'], status: 'requires_adapter', maxZoom: 22 }),
    preset({ presetId: 'preset:google-official-satellite', name: 'Google 官方 Satellite Tiles', vendor: 'google', category: 'satellite', kind: 'google-map-tiles-api', adapter: 'google-session', requiresKey: true, requiredSecretTypes: ['api_key'], status: 'requires_adapter', maxZoom: 22 }),
    preset({ presetId: 'preset:google-official-terrain', name: 'Google 官方 Terrain Tiles', vendor: 'google', category: 'terrain', kind: 'google-map-tiles-api', adapter: 'google-session', requiresKey: true, requiredSecretTypes: ['api_key'], status: 'requires_adapter', maxZoom: 22 }),
    preset({ presetId: 'preset:arcgis-world-imagery', name: 'ArcGIS World Imagery', vendor: 'arcgis', category: 'satellite', kind: 'arcgis-raster', adapter: 'arcgis-tile', entry: { template: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' }, maxZoom: 19 }),
    preset({ presetId: 'preset:arcgis-world-street', name: 'ArcGIS World Street Map', vendor: 'arcgis', category: 'street', kind: 'arcgis-raster', adapter: 'arcgis-tile', entry: { template: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}' }, maxZoom: 19 }),
    preset({ presetId: 'preset:arcgis-world-topo', name: 'ArcGIS World Topographic', vendor: 'arcgis', category: 'terrain', kind: 'arcgis-raster', adapter: 'arcgis-tile', entry: { template: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}' }, maxZoom: 19 }),
    preset({ presetId: 'preset:carto-positron', name: 'CARTO Positron', vendor: 'carto', category: 'street', kind: 'xyz-raster', adapter: 'template', entry: { template: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png' }, subdomains: ['a', 'b', 'c', 'd'] }),
    preset({ presetId: 'preset:carto-dark-matter', name: 'CARTO Dark Matter', vendor: 'carto', category: 'street', kind: 'xyz-raster', adapter: 'template', entry: { template: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png' }, subdomains: ['a', 'b', 'c', 'd'] }),
    preset({ presetId: 'preset:carto-voyager', name: 'CARTO Voyager', vendor: 'carto', category: 'street', kind: 'xyz-raster', adapter: 'template', entry: { template: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png' }, subdomains: ['a', 'b', 'c', 'd'] }),
    preset({ presetId: 'preset:osm-standard-dev', name: 'OSM 官方瓦片测试源', vendor: 'osm', category: 'street', kind: 'xyz-raster', adapter: 'template', entry: { template: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' }, publicUseAllowed: false }),
    preset({ presetId: 'preset:opentopomap', name: 'OpenTopoMap', vendor: 'opentopomap', category: 'terrain', kind: 'xyz-raster', adapter: 'template', entry: { template: 'https://tile.opentopomap.org/{z}/{x}/{y}.png' } }),
    preset({ presetId: 'preset:maptiler-satellite-raster', name: 'MapTiler Satellite Raster', vendor: 'maptiler', category: 'satellite', kind: 'xyz-raster', adapter: 'template', requiresKey: true, requiredSecretTypes: ['api_key'], entry: { template: 'https://api.maptiler.com/tiles/satellite-v4/{z}/{x}/{y}.jpg?key={key}' } }),
    preset({ presetId: 'preset:mapbox-satellite-raster', name: 'Mapbox Satellite Raster', vendor: 'mapbox', category: 'satellite', kind: 'xyz-raster', adapter: 'template', requiresKey: true, requiredSecretTypes: ['token'], defaultKeyPlacement: { placement: 'query', paramName: 'access_token' }, entry: { template: 'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/{z}/{x}/{y}?access_token={key}' } }),
    preset({ presetId: 'preset:stadia-alidade-raster', name: 'Stadia Alidade Smooth', vendor: 'stadia', category: 'street', kind: 'xyz-raster', adapter: 'template', requiresKey: true, requiredSecretTypes: ['api_key'], entry: { template: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png?api_key={key}' } }),
    preset({ presetId: 'preset:here-raster', name: 'HERE Raster Tile', vendor: 'here', category: 'street', kind: 'xyz-raster', adapter: 'template', requiresKey: true, requiredSecretTypes: ['api_key'], status: 'requires_adapter' }),
    preset({ presetId: 'preset:bing-azure-raster', name: 'Bing/Azure Maps Raster', vendor: 'microsoft', category: 'street', kind: 'quadkey-raster', adapter: 'bing-quadkey', requiresKey: true, requiredSecretTypes: ['api_key'], status: 'requires_adapter' }),
    preset({ presetId: 'preset:thunderforest-outdoors', name: 'Thunderforest Outdoors', vendor: 'thunderforest', category: 'terrain', kind: 'xyz-raster', adapter: 'template', requiresKey: true, requiredSecretTypes: ['api_key'], entry: { template: 'https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey={key}' } }),
    preset({ presetId: 'preset:maptiler-streets-vector', name: 'MapTiler Streets Vector', vendor: 'maptiler', category: 'vector', kind: 'vector-style', adapter: 'maplibre-style', requiresKey: true, requiredSecretTypes: ['api_key'], entry: { styleJsonUrl: 'https://api.maptiler.com/maps/streets-v2/style.json?key={key}' }, schema: 'openmaptiles', maxZoom: 22 }),
    preset({ presetId: 'preset:maptiler-basic-vector', name: 'MapTiler Basic Vector', vendor: 'maptiler', category: 'vector', kind: 'vector-style', adapter: 'maplibre-style', requiresKey: true, requiredSecretTypes: ['api_key'], entry: { styleJsonUrl: 'https://api.maptiler.com/maps/basic-v2/style.json?key={key}' }, schema: 'openmaptiles', maxZoom: 22 }),
    preset({ presetId: 'preset:maptiler-outdoor-vector', name: 'MapTiler Outdoor Vector', vendor: 'maptiler', category: 'vector', kind: 'vector-style', adapter: 'maplibre-style', requiresKey: true, requiredSecretTypes: ['api_key'], entry: { styleJsonUrl: 'https://api.maptiler.com/maps/outdoor-v2/style.json?key={key}' }, schema: 'openmaptiles', maxZoom: 22 }),
    preset({ presetId: 'preset:mapbox-streets-vector', name: 'Mapbox Streets Vector', vendor: 'mapbox', category: 'vector', kind: 'vector-style', adapter: 'mapbox-style', requiresKey: true, requiredSecretTypes: ['token'], status: 'requires_adapter', schema: 'mapbox-streets-v8' }),
    preset({ presetId: 'preset:mapbox-outdoors-vector', name: 'Mapbox Outdoors Vector', vendor: 'mapbox', category: 'vector', kind: 'vector-style', adapter: 'mapbox-style', requiresKey: true, requiredSecretTypes: ['token'], status: 'requires_adapter', schema: 'mapbox-streets-v8' }),
    preset({ presetId: 'preset:stadia-osm-bright-vector', name: 'Stadia OSM Bright Vector', vendor: 'stadia', category: 'vector', kind: 'vector-style', adapter: 'maplibre-style', requiresKey: true, requiredSecretTypes: ['api_key'], entry: { styleJsonUrl: 'https://tiles.stadiamaps.com/styles/osm_bright.json?api_key={key}' }, schema: 'openmaptiles' }),
    preset({ presetId: 'preset:stadia-outdoors-vector', name: 'Stadia Outdoors Vector', vendor: 'stadia', category: 'vector', kind: 'vector-style', adapter: 'maplibre-style', requiresKey: true, requiredSecretTypes: ['api_key'], entry: { styleJsonUrl: 'https://tiles.stadiamaps.com/styles/outdoors.json?api_key={key}' }, schema: 'openmaptiles' }),
    preset({ presetId: 'preset:here-vector', name: 'HERE Vector Tile API', vendor: 'here', category: 'vector', kind: 'mvt', adapter: 'here-vector', requiresKey: true, requiredSecretTypes: ['api_key'], status: 'requires_adapter', schema: 'here' }),
    preset({ presetId: 'preset:esri-vector-basemap', name: 'Esri VectorTileServer', vendor: 'arcgis', category: 'vector', kind: 'vector-style', adapter: 'esri-vector', status: 'requires_adapter', schema: 'esri' }),
    preset({ presetId: 'preset:openmaptiles-selfhost', name: 'OpenMapTiles 自托管', vendor: 'openmaptiles', category: 'vector', kind: 'vector-style', adapter: 'maplibre-style', schema: 'openmaptiles' }),
    preset({ presetId: 'preset:protomaps-pmtiles', name: 'Protomaps PMTiles', vendor: 'protomaps', category: 'vector', kind: 'pmtiles-vector', adapter: 'pmtiles', schema: 'custom' }),
    preset({ presetId: 'preset:osm-shortbread-vector', name: 'OSMF Shortbread Vector', vendor: 'osm', category: 'vector', kind: 'mvt', adapter: 'maplibre-style', schema: 'shortbread', status: 'requires_adapter' }),
    preset({ presetId: 'preset:openweathermap-clouds', name: 'OpenWeatherMap 云图', vendor: 'openweathermap', category: 'weather', kind: 'xyz-raster', adapter: 'template', requiresKey: true, requiredSecretTypes: ['appid'], defaultKeyPlacement: { placement: 'query', paramName: 'appid' }, entry: { template: 'https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid={key}' } }),
    preset({ presetId: 'preset:openweathermap-precipitation', name: 'OpenWeatherMap 降水', vendor: 'openweathermap', category: 'weather', kind: 'xyz-raster', adapter: 'template', requiresKey: true, requiredSecretTypes: ['appid'], defaultKeyPlacement: { placement: 'query', paramName: 'appid' }, entry: { template: 'https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid={key}' } }),
    preset({ presetId: 'preset:rainviewer-radar', name: 'RainViewer 雷达', vendor: 'rainviewer', category: 'weather', kind: 'time-raster', adapter: 'rainviewer-time', status: 'requires_adapter' }),
    preset({ presetId: 'preset:nasa-gibs-wmts', name: 'NASA GIBS', vendor: 'nasa', category: 'overlay', kind: 'wmts-raster', adapter: 'wmts-kvp', status: 'requires_adapter' }),
    preset({ presetId: 'preset:openseamap', name: 'OpenSeaMap', vendor: 'openseamap', category: 'overlay', kind: 'xyz-raster', adapter: 'template', entry: { template: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png' } }),
    preset({ presetId: 'preset:openrailwaymap', name: 'OpenRailwayMap', vendor: 'openrailwaymap', category: 'overlay', kind: 'xyz-raster', adapter: 'template', entry: { template: 'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png' }, subdomains: ['a', 'b', 'c'] }),
  ]
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
    testUrl: normalizePublicHttpUrl(input.testUrl ?? current?.testUrl, '代理测试 URL', 'https://www.google.com/generate_204'),
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

function normalizeEntryConfig (input = {}, current = null) {
  const entry = input ?? {}
  const existing = current ?? {}
  return {
    template: normalizeString(entry.template ?? existing.template),
    styleJsonUrl: normalizeString(entry.styleJsonUrl ?? existing.styleJsonUrl),
    tileJsonUrl: normalizeString(entry.tileJsonUrl ?? existing.tileJsonUrl),
    pmtilesUrl: normalizeString(entry.pmtilesUrl ?? existing.pmtilesUrl),
    glyphsUrl: normalizeString(entry.glyphsUrl ?? existing.glyphsUrl),
    spritesUrl: normalizeString(entry.spritesUrl ?? existing.spritesUrl),
  }
}

function normalizeSecretPolicy (input = {}, current = null) {
  const secrets = input ?? {}
  const existing = current ?? {}
  const placement = pickEnum(secrets.placement ?? existing.placement, SECRET_PLACEMENTS, '密钥注入位置', 'query')
  return {
    required: normalizeBoolean(secrets.required ?? existing.required, false),
    keyPoolId: normalizeString(secrets.keyPoolId ?? existing.keyPoolId),
    placement,
    paramName: normalizeString(secrets.paramName ?? existing.paramName, placement === 'header' ? 'x-api-key' : 'key'),
  }
}

function normalizeRenderingConfig (input = {}, current = null) {
  const rendering = input ?? {}
  const existing = current ?? {}
  const clients = normalizeStringList(rendering.clients ?? existing.clients).filter(item => ['2d', '3d'].includes(item))
  return {
    engine: pickEnum(rendering.engine ?? existing.engine, ['leaflet', 'maplibre', 'cesium'], '渲染引擎', 'leaflet'),
    clients: clients.length ? clients : ['2d', '3d'],
    fallbackRasterSourceId: normalizeString(rendering.fallbackRasterSourceId ?? existing.fallbackRasterSourceId),
  }
}

function normalizeLicensePolicy (input = {}, current = null) {
  const license = input ?? {}
  const existing = current ?? {}
  return {
    attribution: normalizeString(license.attribution ?? existing.attribution),
    termsUrl: normalizeString(license.termsUrl ?? existing.termsUrl),
    officialStatus: pickEnum(license.officialStatus ?? existing.officialStatus, ['official', 'unofficial', 'community', 'internal'], '官方状态', 'official'),
    licenseType: pickEnum(license.licenseType ?? existing.licenseType, ['free', 'api-key', 'commercial', 'unknown'], '授权类型', 'unknown'),
    cacheAllowedByLicense: normalizeBoolean(license.cacheAllowedByLicense ?? existing.cacheAllowedByLicense, true),
    publicUseAllowed: normalizeBoolean(license.publicUseAllowed ?? existing.publicUseAllowed, false),
    chinaPublicUseReviewed: normalizeBoolean(license.chinaPublicUseReviewed ?? existing.chinaPublicUseReviewed, false),
    chinaPublicUseRisk: normalizeString(license.chinaPublicUseRisk ?? existing.chinaPublicUseRisk),
  }
}

function normalizeKeyPoolKey (input = {}, current = null) {
  const secretValue = hasOwn(input, 'secret') ? String(input.secret || '') : ''
  const persistedSecretValue = secretValue ? '' : normalizeString(input.secretValue ?? current?.secretValue)
  const placement = pickEnum(input.placement ?? current?.placement, SECRET_PLACEMENTS, '密钥注入位置', 'query')
  const secretHash = secretValue
    ? hashToken(secretValue)
    : normalizeString(input.secretHash ?? current?.secretHash) || (persistedSecretValue ? hashToken(persistedSecretValue) : '')
  if (!secretHash) {
    throw createHttpError('密钥不能为空')
  }
  return {
    id: normalizeSlug(input.id ?? current?.id, '密钥 ID'),
    alias: normalizeString(input.alias ?? current?.alias, '未命名密钥'),
    enabled: normalizeBoolean(input.enabled ?? current?.enabled, true),
    secretType: normalizeString(input.secretType ?? current?.secretType, 'api_key'),
    secretValue: secretValue || persistedSecretValue,
    secretHash,
    maskedPreview: secretValue ? maskSecret(secretValue) : normalizeString(input.maskedPreview ?? current?.maskedPreview, '****'),
    placement,
    paramName: normalizeString(input.paramName ?? current?.paramName, placement === 'header' ? 'x-api-key' : 'key'),
    priority: normalizeInteger(input.priority ?? current?.priority, '密钥优先级', { min: 0, max: 10000, defaultValue: 100 }),
    weight: normalizeInteger(input.weight ?? current?.weight, '密钥权重', { min: 1, max: 1000, defaultValue: 1 }),
    qpsLimit: input.qpsLimit === undefined ? current?.qpsLimit : normalizeInteger(input.qpsLimit, '密钥 QPS 限制', { min: 0, max: 100000, defaultValue: 0 }),
    dailyLimit: input.dailyLimit === undefined ? current?.dailyLimit : normalizeInteger(input.dailyLimit, '密钥每日限制', { min: 0, max: 100000000, defaultValue: 0 }),
    monthlyLimit: input.monthlyLimit === undefined ? current?.monthlyLimit : normalizeInteger(input.monthlyLimit, '密钥每月限制', { min: 0, max: 1000000000, defaultValue: 0 }),
    usedCount: normalizeInteger(input.usedCount ?? current?.usedCount, '密钥使用次数', { min: 0, defaultValue: 0 }),
    errorCount: normalizeInteger(input.errorCount ?? current?.errorCount, '密钥错误次数', { min: 0, defaultValue: 0 }),
    lastUsedAt: normalizeString(input.lastUsedAt ?? current?.lastUsedAt),
    lastSuccessAt: normalizeString(input.lastSuccessAt ?? current?.lastSuccessAt),
    lastFailureAt: normalizeString(input.lastFailureAt ?? current?.lastFailureAt),
    cooldownUntil: normalizeInteger(input.cooldownUntil ?? current?.cooldownUntil, '密钥冷却时间', { min: 0, defaultValue: 0 }),
  }
}

function sanitizeKeyPoolKey (key) {
  const result = clone(key)
  delete result.secretValue
  delete result.secretHash
  result.hasSecret = Boolean(key.secretHash)
  return result
}

function normalizeKeyPool (input = {}, current = null) {
  const rawKeys = Array.isArray(input.keys ?? current?.keys) ? (input.keys ?? current?.keys) : []
  const keys = rawKeys.map((key) => {
    const currentKey = current?.keys?.find(item => item.id === key.id) || null
    return normalizeKeyPoolKey(key, currentKey)
  })
  const keyIds = new Set()
  keys.forEach((key) => {
    if (keyIds.has(key.id)) throw createHttpError(`密钥 ID 重复：${key.id}`)
    keyIds.add(key.id)
  })
  return {
    id: normalizeSlug(input.id ?? current?.id, '密钥池 ID'),
    name: normalizeString(input.name ?? current?.name, '未命名密钥池'),
    vendor: normalizeString(input.vendor ?? current?.vendor, 'custom'),
    enabled: normalizeBoolean(input.enabled ?? current?.enabled, true),
    scope: pickEnum(input.scope ?? current?.scope, ['global', 'source', 'publish'], '密钥池作用域', 'global'),
    strategy: pickEnum(input.strategy ?? current?.strategy, KEY_POOL_STRATEGIES, '密钥池策略', 'round_robin'),
    cooldownMs: normalizeInteger(input.cooldownMs ?? current?.cooldownMs, '密钥失败冷却时间', { min: 0, max: 3600000, defaultValue: 300000 }),
    maxRetriesPerRequest: normalizeInteger(input.maxRetriesPerRequest ?? current?.maxRetriesPerRequest, '单请求最大换 Key 次数', { min: 1, max: 10, defaultValue: 2 }),
    defaultSecretType: normalizeString(input.defaultSecretType ?? current?.defaultSecretType, 'api_key'),
    defaultPlacement: pickEnum(input.defaultPlacement ?? current?.defaultPlacement, SECRET_PLACEMENTS, '默认密钥注入位置', 'query'),
    defaultParamName: normalizeString(input.defaultParamName ?? current?.defaultParamName, 'key'),
    credentialUrl: normalizeHttpUrl(input.credentialUrl ?? current?.credentialUrl, '密钥申请入口'),
    allowedPresetIds: normalizeStringList(input.allowedPresetIds ?? current?.allowedPresetIds),
    allowedSourceIds: normalizeStringList(input.allowedSourceIds ?? current?.allowedSourceIds),
    keys,
    description: normalizeString(input.description ?? current?.description),
  }
}

function sanitizeKeyPool (pool) {
  return {
    ...clone(pool),
    keys: (pool.keys || []).map(sanitizeKeyPoolKey),
  }
}

function normalizeSourcePreset (input = {}, current = null) {
  const placementInput = input.defaultKeyPlacement ?? current?.defaultKeyPlacement ?? {}
  return {
    presetId: normalizeString(input.presetId ?? current?.presetId),
    name: normalizeString(input.name ?? current?.name, '未命名预置图源'),
    vendor: normalizeString(input.vendor ?? current?.vendor, 'custom'),
    category: normalizeString(input.category ?? current?.category, 'custom'),
    kind: pickEnum(input.kind ?? current?.kind, SOURCE_KINDS, '图源类型', 'xyz-raster'),
    adapter: normalizeString(input.adapter ?? current?.adapter, 'template'),
    defaultDisabled: normalizeBoolean(input.defaultDisabled ?? current?.defaultDisabled, true),
    requiresKey: normalizeBoolean(input.requiresKey ?? current?.requiresKey, false),
    requiredSecretTypes: normalizeStringList(input.requiredSecretTypes ?? current?.requiredSecretTypes),
    defaultKeyPlacement: {
      placement: pickEnum(placementInput.placement, SECRET_PLACEMENTS, '默认密钥注入位置', 'query'),
      paramName: normalizeString(placementInput.paramName, 'key'),
    },
    entry: normalizeEntryConfig(input.entry ?? current?.entry, current?.entry),
    template: normalizeString(input.template ?? current?.template),
    styleJsonUrl: normalizeString(input.styleJsonUrl ?? current?.styleJsonUrl),
    tileJsonUrl: normalizeString(input.tileJsonUrl ?? current?.tileJsonUrl),
    pmtilesUrl: normalizeString(input.pmtilesUrl ?? current?.pmtilesUrl),
    subdomains: normalizeStringList(input.subdomains ?? current?.subdomains),
    minZoom: normalizeInteger(input.minZoom ?? current?.minZoom, '最小缩放', { min: 0, max: 30, defaultValue: 0 }),
    maxZoom: normalizeInteger(input.maxZoom ?? current?.maxZoom, '最大缩放', { min: 0, max: 30, defaultValue: 18 }),
    bounds: input.bounds ?? current?.bounds ?? null,
    coordinateSystem: normalizeString(input.coordinateSystem ?? current?.coordinateSystem, 'EPSG:3857'),
    schema: normalizeString(input.schema ?? current?.schema),
    attribution: normalizeString(input.attribution ?? current?.attribution),
    termsUrl: normalizeString(input.termsUrl ?? current?.termsUrl),
    officialStatus: pickEnum(input.officialStatus ?? current?.officialStatus, ['official', 'unofficial', 'community', 'internal'], '官方状态', 'official'),
    licenseType: pickEnum(input.licenseType ?? current?.licenseType, ['free', 'api-key', 'commercial', 'unknown'], '授权类型', 'unknown'),
    cacheAllowedByLicense: normalizeBoolean(input.cacheAllowedByLicense ?? current?.cacheAllowedByLicense, true),
    publicUseAllowed: normalizeBoolean(input.publicUseAllowed ?? current?.publicUseAllowed, false),
    chinaPublicUseRisk: normalizeString(input.chinaPublicUseRisk ?? current?.chinaPublicUseRisk),
    status: pickEnum(input.status ?? current?.status, ['ready', 'requires_adapter', 'research_only'], '预置图源状态', 'ready'),
    description: normalizeString(input.description ?? current?.description),
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
  const entryInput = input.entry ?? current?.entry ?? {}
  const secretsInput = input.secrets ?? current?.secrets ?? {}
  const licenseInput = input.license ?? current?.license ?? {}

  const minZoom = normalizeInteger(input.minZoom ?? current?.minZoom, '最小缩放', { min: 0, max: 30, defaultValue: 0 })
  const maxZoom = normalizeInteger(input.maxZoom ?? current?.maxZoom, '最大缩放', { min: 0, max: 30, defaultValue: 18 })
  if (minZoom > maxZoom) {
    throw createHttpError('最小缩放不能大于最大缩放')
  }

  const kind = pickEnum(input.kind ?? current?.kind, SOURCE_KINDS, '图源类型', 'xyz-raster')
  const adapter = normalizeString(input.adapter ?? current?.adapter, ['xyz', 'tms'].includes(kind) ? 'template' : kind)
  const enabled = normalizeBoolean(input.enabled ?? current?.enabled, false)
  const entry = normalizeEntryConfig(entryInput, current?.entry)
  const legacyTemplate = normalizeString(input.template ?? current?.template)
  if (!entry.template && legacyTemplate) entry.template = legacyTemplate
  if (!entry.styleJsonUrl && input.styleJsonUrl) entry.styleJsonUrl = normalizeString(input.styleJsonUrl)
  if (!entry.tileJsonUrl && input.tileJsonUrl) entry.tileJsonUrl = normalizeString(input.tileJsonUrl)
  if (!entry.pmtilesUrl && input.pmtilesUrl) entry.pmtilesUrl = normalizeString(input.pmtilesUrl)

  const rasterKinds = ['xyz', 'tms', 'xyz-raster', 'tms-raster', 'wmts-raster', 'arcgis-raster', 'quadkey-raster', 'time-raster']
  if (!enabled) {
    ;['template', 'styleJsonUrl', 'tileJsonUrl', 'pmtilesUrl', 'glyphsUrl', 'spritesUrl'].forEach((field) => {
      if (entry[field]) entry[field] = validateHttpTemplate(entry[field], subdomains)
    })
  } else if (rasterKinds.includes(kind)) {
    entry.template = validateHttpTemplate(entry.template, subdomains)
  } else if (kind === 'mvt') {
    entry.template = validateHttpTemplate(entry.template, subdomains)
  } else if (kind === 'vector-style') {
    entry.styleJsonUrl = validateHttpTemplate(entry.styleJsonUrl, subdomains)
  } else if (kind === 'vector-tilejson') {
    entry.tileJsonUrl = validateHttpTemplate(entry.tileJsonUrl, subdomains)
  } else if (kind === 'pmtiles-vector' || kind === 'pmtiles-raster') {
    entry.pmtilesUrl = validateHttpTemplate(entry.pmtilesUrl, subdomains)
  } else if (kind === 'google-map-tiles-api') {
    if (!entry.template && !entry.tileJsonUrl && !entry.styleJsonUrl) {
      entry.template = 'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session={token}&key={key}'
    }
    entry.template = validateHttpTemplate(entry.template, subdomains)
  }

  const secrets = normalizeSecretPolicy(secretsInput, current?.secrets)
  const rendering = normalizeRenderingConfig(input.rendering ?? current?.rendering, current?.rendering)
  const license = normalizeLicensePolicy(licenseInput, current?.license)

  return {
    id: normalizeSlug(input.id ?? current?.id, '图源 ID'),
    presetId: normalizeString(input.presetId ?? current?.presetId),
    name: normalizeString(input.name ?? current?.name, '未命名图源'),
    enabled,
    vendor: normalizeString(input.vendor ?? current?.vendor, 'custom'),
    category: normalizeString(input.category ?? current?.category, 'custom'),
    kind,
    adapter,
    schema: normalizeString(input.schema ?? current?.schema),
    entry,
    template: entry.template,
    styleJsonUrl: entry.styleJsonUrl,
    tileJsonUrl: entry.tileJsonUrl,
    pmtilesUrl: entry.pmtilesUrl,
    subdomains,
    minZoom,
    maxZoom,
    maxNativeZoom: normalizeInteger(input.maxNativeZoom ?? current?.maxNativeZoom, '最大原生缩放', { min: minZoom, max: 30, defaultValue: maxZoom }),
    tileSize: normalizeTileSize(input.tileSize ?? current?.tileSize),
    retina: normalizeRetinaPolicy(input.retina, current?.retina),
    secrets,
    rendering,
    cache: normalizeCachePolicy(input.cache ?? current?.cache, current?.cache),
    accessLog: normalizeAccessLogPolicy(input.accessLog ?? current?.accessLog, current?.accessLog),
    proxy: normalizeProxyPolicy(input.proxy ?? current?.proxy, current?.proxy),
    permissions: {
      frontendVisible: normalizeBoolean(permissions.frontendVisible, false),
      precacheAllowed: normalizeBoolean(permissions.precacheAllowed, false),
      externalApiAllowed: normalizeBoolean(permissions.externalApiAllowed, false),
      userReferenceAllowed: normalizeBoolean(permissions.userReferenceAllowed, false),
    },
    visibility: {
      scope: pickEnum(visibility.scope, ['system', 'external_only'], '图源可见范围', 'system'),
    },
    attribution: normalizeString(input.attribution ?? current?.attribution ?? license.attribution),
    bounds: input.bounds ?? current?.bounds ?? null,
    coordinateSystem: normalizeString(input.coordinateSystem ?? current?.coordinateSystem, 'EPSG:3857'),
    license,
    tags: normalizeStringList(input.tags ?? current?.tags),
    description: normalizeString(input.description ?? current?.description),
  }
}

function sanitizeSource (source, options = {}) {
  const result = clone(source)
  if (result.secrets) {
    result.secrets = {
      required: Boolean(result.secrets.required),
      keyPoolId: result.secrets.keyPoolId ? result.secrets.keyPoolId : '',
      placement: result.secrets.placement,
      paramName: result.secrets.paramName,
      hasKeyPool: Boolean(result.secrets.keyPoolId),
    }
  }
  if (options.public) {
    delete result.template
    delete result.entry
    delete result.secrets
    delete result.proxy
    delete result.cache
    delete result.permissions
    delete result.visibility
    delete result.license
    delete result.accessLog
    if (source.kind === 'vector-style') {
      result.styleUrl = `/api/v1/vector/styles/${source.id}/style.json`
    } else if (source.kind === 'vector-tilejson') {
      result.tileJsonUrl = `/api/v1/vector/sources/${source.id}/tilejson.json`
    } else if (source.kind === 'mvt') {
      result.tileUrl = `/api/v1/vector/tiles/${source.id}/{z}/{x}/{y}.pbf`
    } else if (source.kind === 'pmtiles-vector' || source.kind === 'pmtiles-raster') {
      result.pmtilesUrl = `/api/v1/vector/pmtiles/${source.id}.pmtiles`
    } else {
      result.tileUrl = `/api/v1/tiles/${source.id}/{z}/{x}/{y}`
    }
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
  constructor ({ store, defaults = {}, httpClient = null, targetResolver = resolvePublicHttpTarget }) {
    this.store = store
    this.defaults = defaults
    this.httpClient = httpClient
    this.targetResolver = targetResolver
    this.loaded = false
    this.loadingPromise = null
    this.sources = []
    this.sourceIndex = new Map()
    this.layers = []
    this.proxyOutbounds = []
    this.proxyPools = []
    this.externalPublishes = []
    this.externalLogs = []
    this.sourceAccessLogs = []
    this.sourcePresets = []
    this.keyPools = []
    this.vectorResourceRefs = new Map()
    this.roundRobinState = new Map()
    this.keyRoundRobinState = new Map()
    this.proxyCooldowns = new Map()
    this.rateLimits = new Map()
  }

  async requestHttp (config) {
    if (this.httpClient) return this.httpClient(config)
    const { default: axios } = await import('axios')
    return axios(config)
  }

  async ensureLoaded () {
    if (this.loaded) return
    if (this.loadingPromise) return this.loadingPromise

    const loadingPromise = (async () => {
      const stores = await Promise.all([
        this.loadOrInit(STORE_PROXY_OUTBOUNDS, defaultProxyOutbounds()),
        this.loadOrInit(STORE_PROXY_POOLS, defaultProxyPools()),
        this.loadOrInit(STORE_SOURCES, defaultSources()),
        this.loadOrInit(STORE_LAYERS, defaultLayers()),
        this.loadOrInit(STORE_EXTERNAL_PUBLISHES, defaultExternalPublishes()),
        this.loadOrMergeSourcePresets(),
        this.loadOrMergeKeyPools(),
        this.store.read(STORE_EXTERNAL_LOGS, []),
        this.store.read(STORE_SOURCE_ACCESS_LOGS, []),
      ])

      this.proxyOutbounds = stores[0].map(item => normalizeProxyOutbound(item))
      this.proxyPools = stores[1].map(item => normalizeProxyPool(item))
      this.sources = stores[2].map(item => normalizeSource(item))
      this.rebuildSourceIndex()
      this.layers = stores[3].map(item => normalizeLayer(item))
      this.externalPublishes = stores[4].map(item => normalizeExternalPublish(item))
      this.sourcePresets = stores[5].map(item => normalizeSourcePreset(item))
      this.keyPools = stores[6].map(item => normalizeKeyPool(item))
      this.externalLogs = Array.isArray(stores[7]) ? stores[7] : []
      this.sourceAccessLogs = Array.isArray(stores[8]) ? stores[8] : []
      this.validateAll()
      this.loaded = true
    })()

    this.loadingPromise = loadingPromise
    try {
      await loadingPromise
    } finally {
      if (this.loadingPromise === loadingPromise) {
        this.loadingPromise = null
      }
    }
  }

  async loadOrInit (name, fallback) {
    const saved = await this.store.read(name, null)
    if (Array.isArray(saved) && saved.length) {
      return saved
    }
    await this.store.write(name, fallback)
    return clone(fallback)
  }

  rebuildSourceIndex () {
    this.sourceIndex = new Map(this.sources.map(source => [source.id, source]))
  }

  async loadOrMergeSourcePresets () {
    const defaults = defaultSourcePresets()
    const saved = await this.store.read(STORE_SOURCE_PRESETS, null)
    if (!Array.isArray(saved) || !saved.length) {
      await this.store.write(STORE_SOURCE_PRESETS, defaults)
      return clone(defaults)
    }

    const merged = new Map()
    saved.forEach((item) => {
      if (item?.presetId) merged.set(item.presetId, item)
    })
    defaults.forEach((item) => {
      if (item?.presetId) merged.set(item.presetId, item)
    })
    const result = [...merged.values()]
    if (JSON.stringify(result) !== JSON.stringify(saved)) {
      await this.store.write(STORE_SOURCE_PRESETS, result)
    }
    return clone(result)
  }

  async loadOrMergeKeyPools () {
    const defaults = defaultKeyPools()
    const saved = await this.store.read(STORE_KEY_POOLS, null)
    if (!Array.isArray(saved) || !saved.length) {
      await this.store.write(STORE_KEY_POOLS, defaults)
      return clone(defaults)
    }

    const merged = new Map()
    const defaultById = new Map(defaults.map(item => [item.id, item]))
    saved.forEach((item) => {
      if (!item?.id) return
      const defaultPool = defaultById.get(item.id)
      if (!defaultPool) {
        merged.set(item.id, item)
        return
      }
      merged.set(item.id, {
        ...defaultPool,
        ...item,
        defaultSecretType: item.defaultSecretType || defaultPool.defaultSecretType,
        defaultPlacement: item.defaultPlacement || defaultPool.defaultPlacement,
        defaultParamName: item.defaultParamName || defaultPool.defaultParamName,
        credentialUrl: item.credentialUrl || defaultPool.credentialUrl,
        allowedPresetIds: normalizeStringList([
          ...(defaultPool.allowedPresetIds || []),
          ...(Array.isArray(item.allowedPresetIds) ? item.allowedPresetIds : []),
        ]),
        allowedSourceIds: Array.isArray(item.allowedSourceIds) ? item.allowedSourceIds : [],
        keys: Array.isArray(item.keys) ? item.keys : [],
      })
    })
    defaults.forEach((item) => {
      if (!merged.has(item.id)) merged.set(item.id, item)
    })
    const result = [...merged.values()]
    if (JSON.stringify(result) !== JSON.stringify(saved)) {
      await this.store.write(STORE_KEY_POOLS, result)
    }
    return clone(result)
  }

  validateAll () {
    this.sources.forEach(source => this.validateSourceRefs(source))
    this.layers.forEach(layer => this.validateLayerRefs(layer))
    this.proxyPools.forEach(pool => this.validateProxyPoolRefs(pool))
    this.keyPools.forEach(pool => this.validateKeyPoolRefs(pool))
    this.externalPublishes.forEach(publish => this.validateExternalPublishRefs(publish))
    if (!this.layers.some(layer => layer.default && layer.enabled)) {
      const first = this.layers.find(layer => layer.enabled)
      if (first) first.default = true
    }
  }

  async writeStore (name, value) {
    await this.store.write(name, value)
  }

  cleanupVectorResourceRefs () {
    const now = Date.now()
    for (const [ref, entry] of this.vectorResourceRefs.entries()) {
      if (!entry || entry.expiresAt <= now) this.vectorResourceRefs.delete(ref)
    }

    if (this.vectorResourceRefs.size <= VECTOR_RESOURCE_REF_MAX_COUNT) return

    const overflow = this.vectorResourceRefs.size - VECTOR_RESOURCE_REF_MAX_COUNT
    const removable = [...this.vectorResourceRefs.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
      .slice(0, overflow)
    removable.forEach(([ref]) => this.vectorResourceRefs.delete(ref))
  }

  sanitizeResourceTemplateSecret (template, selectedKey = null) {
    const secretValue = selectedKey?.secretValue
    if (!secretValue) return String(template || '')
    const escaped = encodeURIComponent(secretValue)
    return String(template || '')
      .replaceAll(escaped, '{key}')
      .replaceAll(secretValue, '{key}')
  }

  registerVectorResourceRef (source, resourceType, template, options = {}) {
    const resolved = resolveHttpTemplate(template, options.upstreamBaseUrl || '')
    const secretSafeTemplate = this.sanitizeResourceTemplateSecret(resolved, options.selectedKey)
    const validated = validateResolvedResourceTemplate(secretSafeTemplate, source.subdomains || [])
    const ref = crypto
      .createHash('sha256')
      .update(`${source.id}|${resourceType}|${validated}`)
      .digest('base64url')
      .slice(0, 32)

    const now = Date.now()
    this.vectorResourceRefs.set(ref, {
      ref,
      sourceId: source.id,
      resourceType,
      template: validated,
      createdAt: now,
      expiresAt: now + VECTOR_RESOURCE_REF_TTL_MS,
      sourceName: normalizeString(options.sourceName),
    })
    this.cleanupVectorResourceRefs()
    return ref
  }

  getVectorResourceRef (sourceId, resourceType, ref) {
    const normalizedRef = normalizeString(ref)
    if (!normalizedRef) return null
    this.cleanupVectorResourceRefs()
    const entry = this.vectorResourceRefs.get(normalizedRef)
    if (!entry || entry.sourceId !== sourceId || entry.resourceType !== resourceType) {
      throw createHttpError('矢量资源引用已过期，请重新加载 Style JSON 或 TileJSON', 410)
    }
    return entry
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

  findSourcePreset (presetId) {
    return this.sourcePresets.find(item => item.presetId === presetId || item.presetId === `preset:${presetId}`) || null
  }

  findKeyPool (id) {
    return this.keyPools.find(item => item.id === id) || null
  }

  findDefaultKeyPoolForPreset (preset) {
    if (!preset?.requiresKey) return null
    const exact = this.keyPools.find(pool => (pool.allowedPresetIds || []).includes(preset.presetId))
    if (exact) return exact
    return this.keyPools.find(pool => pool.id === `default-${preset.vendor}-key-pool`) ||
      this.keyPools.find(pool => pool.vendor === preset.vendor && pool.scope === 'global') ||
      null
  }

  keyPoolHasUsableKey (pool) {
    return Boolean(pool?.enabled && (pool.keys || []).some(key => key.enabled && key.secretHash))
  }

  validateSourceRefs (source) {
    if (source.presetId && !this.findSourcePreset(source.presetId)) {
      throw createHttpError('图源关联的预置模板不存在')
    }
    if (source.enabled && source.secrets?.required && !source.secrets.keyPoolId) {
      throw createHttpError('该图源需要配置密钥池')
    }
    if (source.secrets?.keyPoolId && !this.findKeyPool(source.secrets.keyPoolId)) {
      throw createHttpError('图源关联的密钥池不存在')
    }
    if (source.enabled && source.secrets?.required && source.secrets.keyPoolId) {
      const pool = this.findKeyPool(source.secrets.keyPoolId)
      if (!this.keyPoolHasUsableKey(pool)) {
        throw createHttpError('该图源关联的密钥池没有可用 Key')
      }
    }
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

  validateKeyPoolRefs (pool) {
    pool.allowedSourceIds.forEach((sourceId) => {
      if (!this.findSource(sourceId)) throw createHttpError(`密钥池允许的图源不存在：${sourceId}`)
    })
    pool.allowedPresetIds.forEach((presetId) => {
      if (!this.findSourcePreset(presetId)) throw createHttpError(`密钥池允许的预置模板不存在：${presetId}`)
    })
  }

  async listTileSources () {
    await this.ensureLoaded()
    return this.sources.map(source => sanitizeSource(source))
  }

  async listSourcePresets () {
    await this.ensureLoaded()
    return this.sourcePresets.map(preset => clone(preset))
  }

  async createSourceFromPreset (presetId, input = {}) {
    await this.ensureLoaded()
    const preset = this.findSourcePreset(presetId)
    if (!preset) throw createHttpError('预置图源不存在', 404)
    if (preset.status !== 'ready' && normalizeBoolean(input.enabled, false)) {
      throw createHttpError('该预置图源需要适配器实现后才能启用')
    }
    const placement = preset.defaultKeyPlacement || { placement: 'query', paramName: 'key' }
    const defaultKeyPool = this.findDefaultKeyPoolForPreset(preset)
    const keyPoolId = input.keyPoolId || input.secrets?.keyPoolId || defaultKeyPool?.id || ''
    const sourceInput = {
      id: input.id || preset.presetId.replace(/^preset:/, ''),
      presetId: preset.presetId,
      name: input.name || preset.name,
      enabled: normalizeBoolean(input.enabled, false),
      vendor: preset.vendor,
      category: preset.category,
      kind: preset.kind,
      adapter: preset.adapter,
      schema: preset.schema,
      entry: {
        template: preset.entry?.template || preset.template || '',
        styleJsonUrl: preset.entry?.styleJsonUrl || preset.styleJsonUrl || '',
        tileJsonUrl: preset.entry?.tileJsonUrl || preset.tileJsonUrl || '',
        pmtilesUrl: preset.entry?.pmtilesUrl || preset.pmtilesUrl || '',
      },
      subdomains: preset.subdomains,
      minZoom: preset.minZoom,
      maxZoom: preset.maxZoom,
      maxNativeZoom: preset.maxZoom,
      secrets: {
        required: preset.requiresKey,
        keyPoolId,
        placement: input.secrets?.placement || placement.placement,
        paramName: input.secrets?.paramName || placement.paramName,
      },
      rendering: input.rendering || {
        engine: ['vector-style', 'vector-tilejson', 'mvt', 'pmtiles-vector'].includes(preset.kind) ? 'maplibre' : 'leaflet',
        clients: ['vector-style', 'vector-tilejson', 'mvt', 'pmtiles-vector'].includes(preset.kind) ? ['2d'] : ['2d', '3d'],
        fallbackRasterSourceId: '',
      },
      cache: input.cache || { enabled: Boolean(preset.cacheAllowedByLicense) },
      proxy: input.proxy || { mode: 'never' },
      permissions: input.permissions || {
        frontendVisible: false,
        precacheAllowed: false,
        externalApiAllowed: false,
        userReferenceAllowed: false,
      },
      visibility: input.visibility || { scope: 'system' },
      attribution: preset.attribution,
      bounds: preset.bounds,
      coordinateSystem: preset.coordinateSystem,
      license: {
        attribution: preset.attribution,
        termsUrl: preset.termsUrl,
        officialStatus: preset.officialStatus,
        licenseType: preset.licenseType,
        cacheAllowedByLicense: preset.cacheAllowedByLicense,
        publicUseAllowed: preset.publicUseAllowed,
        chinaPublicUseRisk: preset.chinaPublicUseRisk,
      },
      tags: input.tags || [],
      description: input.description || preset.description,
    }
    return this.createTileSource(sourceInput)
  }

  async listKeyPools () {
    await this.ensureLoaded()
    return this.keyPools.map(sanitizeKeyPool)
  }

  async getKeyPool (id) {
    await this.ensureLoaded()
    const pool = this.findKeyPool(id)
    if (!pool) throw createHttpError('密钥池不存在', 404)
    return sanitizeKeyPool(pool)
  }

  async createKeyPool (input) {
    await this.ensureLoaded()
    const pool = normalizeKeyPool(input)
    if (this.findKeyPool(pool.id)) throw createHttpError('密钥池 ID 已存在')
    this.validateKeyPoolRefs(pool)
    this.keyPools.push(pool)
    await this.writeStore(STORE_KEY_POOLS, this.keyPools)
    return sanitizeKeyPool(pool)
  }

  async updateKeyPool (id, input) {
    await this.ensureLoaded()
    const index = this.keyPools.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('密钥池不存在', 404)
    const pool = normalizeKeyPool({ ...input, id }, this.keyPools[index])
    this.validateKeyPoolRefs(pool)
    this.keyPools[index] = pool
    await this.writeStore(STORE_KEY_POOLS, this.keyPools)
    return sanitizeKeyPool(pool)
  }

  async deleteKeyPool (id) {
    await this.ensureLoaded()
    const sourceRefs = this.sources.filter(source => source.secrets?.keyPoolId === id).map(source => source.id)
    if (sourceRefs.length) throw createHttpError(`密钥池仍被图源引用，不能删除：${sourceRefs.join(', ')}`)
    const index = this.keyPools.findIndex(item => item.id === id)
    if (index < 0) throw createHttpError('密钥池不存在', 404)
    const [removed] = this.keyPools.splice(index, 1)
    await this.writeStore(STORE_KEY_POOLS, this.keyPools)
    return sanitizeKeyPool(removed)
  }

  async testKeyPool (id) {
    await this.ensureLoaded()
    const pool = this.findKeyPool(id)
    if (!pool) throw createHttpError('密钥池不存在', 404)
    const enabledKeys = pool.keys.filter(key => key.enabled && key.secretHash)
    return {
      id: pool.id,
      name: pool.name,
      enabled: pool.enabled,
      strategy: pool.strategy,
      success: pool.enabled && enabledKeys.length > 0,
      enabledKeyCount: enabledKeys.length,
      totalKeyCount: pool.keys.length,
      errorMessage: pool.enabled && enabledKeys.length ? null : '密钥池未启用或没有可用 Key',
    }
  }

  async testKeyPoolKey (poolId, keyId) {
    await this.ensureLoaded()
    const pool = this.findKeyPool(poolId)
    if (!pool) throw createHttpError('密钥池不存在', 404)
    const key = pool.keys.find(item => item.id === keyId)
    if (!key) throw createHttpError('密钥不存在', 404)
    return {
      poolId: pool.id,
      keyId: key.id,
      alias: key.alias,
      enabled: key.enabled,
      hasSecret: Boolean(key.secretHash),
      success: key.enabled && Boolean(key.secretHash),
      errorMessage: key.enabled && key.secretHash ? null : '密钥未启用或未配置',
    }
  }

  async getTileSource (id) {
    await this.ensureLoaded()
    const source = this.findSource(id)
    if (!source) throw createHttpError('图源不存在', 404)
    return sanitizeSource(source)
  }

  async getPublicTileSource (id) {
    await this.ensureLoaded()
    const source = this.sourceIndex.get(String(id || ''))
    if (!source || !source.enabled || source.visibility.scope !== 'system' || !source.permissions.frontendVisible) {
      return null
    }
    return sanitizeSource(source, { public: true })
  }

  async createTileSource (input) {
    await this.ensureLoaded()
    const source = normalizeSource(input)
    if (this.findSource(source.id)) throw createHttpError('图源 ID 已存在')
    this.validateSourceRefs(source)
    this.sources.push(source)
    this.rebuildSourceIndex()
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
    this.rebuildSourceIndex()
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
    this.rebuildSourceIndex()
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
    const template = options.template || source.template
    return this.applySecretToUrl(template, options.secret)
      .replaceAll('{s}', subdomain)
      .replaceAll('{x}', String(x))
      .replaceAll('{y}', String(source.kind === 'tms' || source.kind === 'tms-raster' ? yTms : y))
      .replaceAll('{z}', String(z))
      .replaceAll('{scale}', scale)
      .replaceAll('{yTms}', yTms)
      .replaceAll('{quadkey}', tileToQuadKey(x, y, z))
  }

  applySecretToUrl (url, selectedKey = null) {
    const keyValue = selectedKey?.secretValue || ''
    let result = String(url || '')
      .replaceAll('{key}', encodeURIComponent(keyValue))
      .replaceAll('{token}', encodeURIComponent(keyValue))
      .replaceAll('{tk}', encodeURIComponent(keyValue))
      .replaceAll('{appid}', encodeURIComponent(keyValue))
    if (selectedKey && selectedKey.placement === 'query' && keyValue && result && !result.includes(encodeURIComponent(keyValue))) {
      const parsed = new URL(result)
      parsed.searchParams.set(selectedKey.paramName || 'key', keyValue)
      result = parsed.toString()
    }
    return result
  }

  applyTemplateVars (url, vars = {}) {
    let result = String(url || '')
    Object.entries(vars).forEach(([key, value]) => {
      result = result.replaceAll(`{${key}}`, encodeURIComponent(String(value ?? '')))
    })
    return result
  }

  isKeyCoolingDown (key) {
    return Number(key?.cooldownUntil || 0) > Date.now()
  }

  selectKeyFromPool (pool) {
    const keys = pool.keys
      .filter(key => key.enabled && key.secretValue && !this.isKeyCoolingDown(key))
      .sort((a, b) => a.priority - b.priority)
    if (!pool.enabled || !keys.length) return null
    if (pool.strategy === 'random') {
      return keys[Math.floor(Math.random() * keys.length)]
    }
    if (pool.strategy === 'round_robin' || pool.strategy === 'weighted_round_robin') {
      const weighted = pool.strategy === 'weighted_round_robin'
        ? keys.flatMap(key => Array.from({ length: Math.max(1, Number(key.weight || 1)) }, () => key))
        : keys
      const current = Number(this.keyRoundRobinState.get(pool.id) || 0)
      const selected = weighted[current % weighted.length]
      this.keyRoundRobinState.set(pool.id, current + 1)
      return selected
    }
    return keys[0]
  }

  async resolveKeyForSource (source, overrideKeyPoolId = '') {
    await this.ensureLoaded()
    const keyPoolId = normalizeString(overrideKeyPoolId || source.secrets?.keyPoolId)
    if (!keyPoolId) {
      if (source.secrets?.required) throw createHttpError('图源需要配置密钥池', 400)
      return null
    }
    const pool = this.findKeyPool(keyPoolId)
    if (!pool?.enabled) throw createHttpError('密钥池不可用', 502)
    const selected = this.selectKeyFromPool(pool)
    if (!selected) throw createHttpError('密钥池没有可用 Key', 502)
    selected.usedCount = Number(selected.usedCount || 0) + 1
    selected.lastUsedAt = new Date().toISOString()
    await this.writeStore(STORE_KEY_POOLS, this.keyPools)
    return {
      poolId: pool.id,
      keyId: selected.id,
      alias: selected.alias,
      placement: selected.placement || source.secrets?.placement || 'query',
      paramName: selected.paramName || source.secrets?.paramName || 'key',
      secretValue: selected.secretValue,
    }
  }

  buildSecretHeaders (selectedKey = null, source = null) {
    if (!selectedKey) return {}
    const placement = selectedKey.placement || source?.secrets?.placement || 'query'
    const paramName = selectedKey.paramName || source?.secrets?.paramName || 'key'
    if (placement === 'header') return { [paramName]: selectedKey.secretValue }
    if (placement === 'bearer') return { Authorization: `Bearer ${selectedKey.secretValue}` }
    return {}
  }

  buildVectorResourceUrl (source, resourceType, params = {}, selectedKey = null) {
    if (resourceType === 'style') return this.applySecretToUrl(source.entry.styleJsonUrl || source.styleJsonUrl, selectedKey)
    if (resourceType === 'tilejson') {
      const refEntry = this.getVectorResourceRef(source.id, 'tilejson', params.ref)
      const url = refEntry?.template || source.entry.tileJsonUrl || source.tileJsonUrl
      if (!url) throw createHttpError('TileJSON URL 未配置')
      return this.applySecretToUrl(url, selectedKey)
    }
    if (resourceType === 'pmtiles-range') return this.applySecretToUrl(source.entry.pmtilesUrl || source.pmtilesUrl, selectedKey)
    if (resourceType === 'mvt') {
      const refEntry = this.getVectorResourceRef(source.id, 'mvt', params.ref)
      const template = refEntry?.template || source.entry.template || source.template
      if (!template) throw createHttpError('矢量瓦片模板未配置')
      return this.buildTileUrl(source, params, { secret: selectedKey, scale: params.scale, template })
    }
    if (resourceType === 'glyph') {
      const refEntry = this.getVectorResourceRef(source.id, 'glyph', params.ref)
      const url = refEntry?.template || source.entry.glyphsUrl || source.entry.glyphs || ''
      if (!url) throw createHttpError('glyphs URL 未配置')
      return this.applyTemplateVars(this.applySecretToUrl(url, selectedKey), {
        fontstack: params.fontstack,
        range: params.range,
      })
    }
    if (resourceType === 'sprite-json' || resourceType === 'sprite-png' || resourceType === 'sprite-json-2x' || resourceType === 'sprite-png-2x') {
      const refEntry = this.getVectorResourceRef(source.id, 'sprite', params.ref)
      const base = refEntry?.template || source.entry.spritesUrl || source.entry.sprite || ''
      if (!base) throw createHttpError('sprite URL 未配置')
      const retinaSuffix = resourceType.endsWith('-2x') ? '@2x' : ''
      const ext = resourceType.includes('json') ? '.json' : '.png'
      const expectedSuffix = `${retinaSuffix}${ext}`
      return this.applySecretToUrl(appendUrlPathSuffix(base, expectedSuffix), selectedKey)
    }
    throw createHttpError('不支持的矢量资源类型')
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
    const selectedKey = await this.resolveKeyForSource(source, options.keyPoolOverride || '')
    const url = this.buildTileUrl(source, tile, { ...options, secret: selectedKey })
    const proxyPolicy = options.proxyOverride || source.proxy || { mode: 'never' }
    const proxy = await this.resolveProxyForSource(source, options.proxyOverride || null)
    return {
      source,
      url,
      proxy,
      proxyPolicy,
      key: selectedKey
        ? { keyPoolId: selectedKey.poolId, keyId: selectedKey.keyId, alias: selectedKey.alias }
        : null,
      internalKey: selectedKey,
      headers: this.buildSecretHeaders(selectedKey, source),
      cache: options.cacheOverride?.enabled ?? source.cache.enabled,
      cacheTtlMs: options.cacheOverride?.ttlMs ?? source.cache.ttlMs,
      staleCacheTtlMs: options.cacheOverride?.staleTtlMs ?? source.cache.staleTtlMs,
      cacheMeta: {
        sourceId: source.id,
        layerId: options.layerId || null,
        publishId: options.publishId || null,
        resourceType: 'raster',
        keyPoolId: selectedKey?.poolId || null,
        keyId: selectedKey?.keyId || null,
      },
    }
  }

  assertVectorResourceAllowed (source, resourceType) {
    if (!VECTOR_RESOURCE_TYPES.includes(resourceType)) throw createHttpError('不支持的矢量资源类型')
    const allowedKinds = ['vector-style', 'vector-tilejson', 'mvt', 'pmtiles-vector', 'pmtiles-raster']
    if (!allowedKinds.includes(source.kind)) {
      throw createHttpError('该图源不是矢量或 PMTiles 图源', 400)
    }
    if (resourceType === 'style' && source.kind !== 'vector-style') throw createHttpError('该图源没有 Style JSON 入口', 400)
    if (resourceType === 'tilejson' && !['vector-style', 'vector-tilejson'].includes(source.kind)) throw createHttpError('该图源没有 TileJSON 入口', 400)
    if (resourceType === 'mvt' && !['mvt', 'vector-style', 'vector-tilejson'].includes(source.kind)) throw createHttpError('该图源没有 MVT 瓦片入口', 400)
    if (resourceType === 'pmtiles-range' && !['pmtiles-vector', 'pmtiles-raster'].includes(source.kind)) throw createHttpError('该图源不是 PMTiles 图源', 400)
  }

  async createVectorResourceRequest (sourceId, resourceType, params = {}, options = {}) {
    await this.ensureLoaded()
    const source = this.findSource(sourceId)
    if (!source) throw createHttpError('图源不存在', 404)
    if (!source.enabled) throw createHttpError('图源已禁用', 403)
    this.assertVectorResourceAllowed(source, resourceType)
    const selectedKey = await this.resolveKeyForSource(source, options.keyPoolOverride || '')
    const url = this.buildVectorResourceUrl(source, resourceType, params, selectedKey)
    const proxyPolicy = options.proxyOverride || source.proxy || { mode: 'never' }
    const proxy = await this.resolveProxyForSource(source, options.proxyOverride || null)
    return {
      source,
      url,
      proxy,
      proxyPolicy,
      key: selectedKey
        ? { keyPoolId: selectedKey.poolId, keyId: selectedKey.keyId, alias: selectedKey.alias }
        : null,
      internalKey: selectedKey,
      headers: this.buildSecretHeaders(selectedKey, source),
      cache: options.cacheOverride?.enabled ?? (source.cache.enabled && source.license.cacheAllowedByLicense !== false),
      cacheTtlMs: options.cacheOverride?.ttlMs ?? source.cache.ttlMs,
      staleCacheTtlMs: options.cacheOverride?.staleTtlMs ?? source.cache.staleTtlMs,
      cacheMeta: {
        sourceId: source.id,
        layerId: options.layerId || null,
        publishId: options.publishId || null,
        resourceType,
        keyPoolId: selectedKey?.poolId || null,
        keyId: selectedKey?.keyId || null,
      },
    }
  }

  rewriteVectorStyle (source, style, options = {}) {
    const result = clone(style || {})
    const basePath = options.basePath || `/api/v1/vector`
    const sourcePath = options.sourcePath === undefined ? source.id : options.sourcePath
    const tileBase = sourcePath ? `${basePath}/tiles/${sourcePath}` : `${basePath}/tiles`
    const tileJsonBase = sourcePath ? `${basePath}/sources/${sourcePath}` : `${basePath}/sources`
    const glyphBase = sourcePath ? `${basePath}/glyphs/${sourcePath}` : `${basePath}/glyphs`
    const spriteBase = sourcePath ? `${basePath}/sprites/${sourcePath}` : `${basePath}/sprites`
    result.sources = result.sources && typeof result.sources === 'object' ? result.sources : {}
    Object.entries(result.sources).forEach(([name, value]) => {
      const sourceDef = value && typeof value === 'object' ? value : {}
      if (Array.isArray(sourceDef.tiles) && sourceDef.tiles.length) {
        delete sourceDef.url
        sourceDef.tiles = sourceDef.tiles
          .filter(Boolean)
          .map((tileUrl) => {
            const ref = this.registerVectorResourceRef(source, 'mvt', tileUrl, {
              upstreamBaseUrl: options.upstreamBaseUrl,
              selectedKey: options.selectedKey,
              sourceName: name,
            })
            return `${tileBase}/${ref}/{z}/{x}/{y}.pbf`
          })
      } else if (sourceDef.url) {
        const ref = this.registerVectorResourceRef(source, 'tilejson', sourceDef.url, {
          upstreamBaseUrl: options.upstreamBaseUrl,
          selectedKey: options.selectedKey,
          sourceName: name,
        })
        delete sourceDef.tiles
        sourceDef.url = `${tileJsonBase}/${ref}/tilejson.json`
      } else if (sourceDef.type === 'vector' && (source.entry.template || source.template)) {
        delete sourceDef.url
        sourceDef.tiles = [`${tileBase}/{z}/{x}/{y}.pbf`]
      }
      result.sources[name] = sourceDef
    })
    if (result.glyphs || source.entry.glyphsUrl) {
      const glyphTemplate = result.glyphs || source.entry.glyphsUrl
      const ref = this.registerVectorResourceRef(source, 'glyph', glyphTemplate, {
        upstreamBaseUrl: options.upstreamBaseUrl,
        selectedKey: options.selectedKey,
      })
      result.glyphs = `${glyphBase}/${ref}/{fontstack}/{range}.pbf`
    }
    if (result.sprite || source.entry.spritesUrl) {
      const spriteTemplate = result.sprite || source.entry.spritesUrl
      const ref = this.registerVectorResourceRef(source, 'sprite', spriteTemplate, {
        upstreamBaseUrl: options.upstreamBaseUrl,
        selectedKey: options.selectedKey,
      })
      result.sprite = `${spriteBase}/${ref}/sprite`
    }
    result.metadata = {
      ...(result.metadata && typeof result.metadata === 'object' ? result.metadata : {}),
      'map-service:sourceId': source.id,
      'map-service:rewritten': true,
    }
    return result
  }

  rewriteTileJson (source, tileJson, options = {}) {
    const result = clone(tileJson || {})
    const basePath = options.basePath || `/api/v1/vector`
    const sourcePath = options.sourcePath === undefined ? source.id : options.sourcePath
    const tileBase = sourcePath ? `${basePath}/tiles/${sourcePath}` : `${basePath}/tiles`
    result.tilejson = result.tilejson || '3.0.0'
    result.id = result.id || source.id
    result.name = result.name || source.name
    result.minzoom = result.minzoom ?? source.minZoom
    result.maxzoom = result.maxzoom ?? source.maxZoom
    result.attribution = result.attribution || source.attribution || source.license?.attribution || ''
    const upstreamTiles = Array.isArray(result.tiles) && result.tiles.length
      ? result.tiles
      : [source.entry.template || source.template].filter(Boolean)
    result.tiles = upstreamTiles.map((tileUrl) => {
      const ref = this.registerVectorResourceRef(source, 'mvt', tileUrl, {
        upstreamBaseUrl: options.upstreamBaseUrl,
        selectedKey: options.selectedKey,
      })
      return `${tileBase}/${ref}/{z}/{x}/{y}.pbf`
    })
    return result
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

  async createExternalVectorResourceRequest (publishId, resourceType, params = {}, options = {}) {
    await this.ensureLoaded()
    const publish = this.assertExternalPublishAccess(publishId, options)
    if (publish.targetType === 'layer') {
      throw createHttpError('组合图层发布项暂不支持直接发布矢量资源', 400)
    }
    const source = this.findSource(publish.targetId)
    if (!source) throw createHttpError('对外发布项引用的图源不存在', 404)
    if (!source.enabled) throw createHttpError('对外发布项引用的图源已禁用', 403)
    if (publish.targetType === 'source' && !source.permissions.externalApiAllowed) {
      throw createHttpError('图源未允许对外发布', 403)
    }
    return {
      source,
      publish,
      proxyOverride: publish.overrides.proxy || null,
      cacheOverride: publish.overrides.cache || null,
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
    const targetResolution = await this.targetResolver(testUrl, {
      label: '代理测试 URL',
      delegateDnsToProxy: isLocalProxyEndpoint(proxyConfig),
    })
    const axiosConfig = {
      ...createPinnedProxyRequestConfig(targetResolution, proxyConfig),
      method: 'GET',
      timeout,
      maxRedirects: 0,
      validateStatus: () => true,
    }

    try {
      const response = await this.requestHttp(axiosConfig)
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
      const proxyConfig = request.proxy && request.proxy.enabled
        ? {
            protocol: request.proxy.protocol || 'http',
            host: request.proxy.host,
            port: Number(request.proxy.port),
          }
        : null
      if (proxyConfig && request.proxy.username) {
        proxyConfig.auth = {
          username: request.proxy.username,
          password: request.proxy.password || '',
        }
      }
      const targetResolution = await this.targetResolver(request.url, {
        label: '图源 URL',
        delegateDnsToProxy: isLocalProxyEndpoint(proxyConfig),
      })
      const axiosConfig = {
        url: request.url,
        method: 'GET',
        timeout: 10000,
        responseType: 'arraybuffer',
        maxRedirects: 0,
        validateStatus: () => true,
      }
      if (proxyConfig) {
        Object.assign(axiosConfig, createPinnedProxyRequestConfig(targetResolution, proxyConfig))
      } else {
        Object.assign(axiosConfig, createPinnedHttpAgents(targetResolution.addresses))
      }
      const response = await this.requestHttp(axiosConfig)
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

function tileToQuadKey (x, y, z) {
  let quadKey = ''
  for (let i = z; i > 0; i--) {
    let digit = 0
    const mask = 1 << (i - 1)
    if ((x & mask) !== 0) digit += 1
    if ((y & mask) !== 0) digit += 2
    quadKey += String(digit)
  }
  return quadKey || '0'
}

export default TileCatalogManager
