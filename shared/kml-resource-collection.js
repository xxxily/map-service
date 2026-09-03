export const KML_RESOURCE_COLLECTION_VERSION = 1
export const KML_RESOURCE_COLLECTION_MAX_ITEMS = 300
export const KML_RESOURCE_COLLECTION_MAX_BYTES = 512 * 1024
export const KML_RESOURCE_COLLECTION_MAX_TITLE_LENGTH = 200
export const KML_RESOURCE_COLLECTION_MAX_URL_LENGTH = 4096
export const KML_RESOURCE_COLLECTION_VIEW_MODES = Object.freeze(['grid', 'list'])
export const KML_RESOURCE_COLLECTION_ITEM_TYPES = Object.freeze(['auto', 'image', 'video', 'audio', 'iframe'])
export const KML_RESOURCE_COLLECTION_PAGE_SIZE = 40

// Resource collection URLs are persisted in personal KML and may be copied
// into public share snapshots. Keep ordinary view parameters (for example
// 720yun's scene_id), but never persist credentials or bearer-like values.
const SENSITIVE_URL_QUERY_KEYS = new Set([
  'access_token',
  'appid',
  'api_key',
  'apikey',
  'auth',
  'authorization',
  'client_secret',
  'credential',
  'key',
  'password',
  'passwd',
  'pwd',
  'secret',
  'session',
  'sign',
  'signature',
  'sig',
  'token',
  'tk',
  'jwt',
  'x-amz-credential',
  'x-amz-security-token',
  'x-amz-signature',
])

const VIEW_MODES = new Set(KML_RESOURCE_COLLECTION_VIEW_MODES)
const ITEM_TYPES = new Set(KML_RESOURCE_COLLECTION_ITEM_TYPES)

export function getKmlResourceCollectionPage (items, requestedPage, pageSize = KML_RESOURCE_COLLECTION_PAGE_SIZE) {
  const source = Array.isArray(items) ? items : []
  const size = Math.max(1, Number.parseInt(pageSize, 10) || KML_RESOURCE_COLLECTION_PAGE_SIZE)
  const pageCount = Math.max(1, Math.ceil(source.length / size))
  const page = Math.min(pageCount, Math.max(1, Number.parseInt(requestedPage, 10) || 1))
  const start = (page - 1) * size
  return {
    page,
    pageCount,
    start,
    items: source.slice(start, start + size),
  }
}

export class KmlResourceCollectionError extends Error {
  constructor (message, options = {}) {
    super(message)
    this.name = 'KmlResourceCollectionError'
    this.code = options.code || 'INVALID_RESOURCE_COLLECTION'
    this.path = options.path || ''
  }
}

function byteLength (value) {
  const text = String(value ?? '')
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(text, 'utf8')
  return new TextEncoder().encode(text).byteLength
}

function normalizeText (value, maxLength, path) {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
  if (normalized.length > maxLength) {
    throw new KmlResourceCollectionError(`${path}长度不能超过 ${maxLength} 个字符`, {
      code: 'RESOURCE_COLLECTION_TEXT_TOO_LONG',
      path,
    })
  }
  return normalized
}

function defaultCreateId () {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ? `res-${uuid}` : `res-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function normalizeItemUrl (value, path) {
  const raw = normalizeText(value, KML_RESOURCE_COLLECTION_MAX_URL_LENGTH, path)
  if (!raw) {
    throw new KmlResourceCollectionError(`${path}不能为空`, {
      code: 'RESOURCE_COLLECTION_URL_REQUIRED',
      path,
    })
  }
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new KmlResourceCollectionError(`${path}不是有效地址`, {
      code: 'RESOURCE_COLLECTION_URL_INVALID',
      path,
    })
  }
  if (parsed.protocol !== 'https:') {
    throw new KmlResourceCollectionError(`${path}仅支持 HTTPS 地址`, {
      code: 'RESOURCE_COLLECTION_URL_PROTOCOL',
      path,
    })
  }
  if (parsed.username || parsed.password) {
    throw new KmlResourceCollectionError(`${path}不能包含账号或密码`, {
      code: 'RESOURCE_COLLECTION_URL_CREDENTIALS',
      path,
    })
  }
  for (const key of parsed.searchParams.keys()) {
    if (!SENSITIVE_URL_QUERY_KEYS.has(String(key).trim().toLowerCase())) continue
    throw new KmlResourceCollectionError(`${path}不能包含敏感查询参数`, {
      code: 'RESOURCE_COLLECTION_URL_SENSITIVE_QUERY',
      path,
    })
  }
  return parsed.toString()
}

function normalizeOptionalItemUrl (value, path) {
  const raw = normalizeText(value, KML_RESOURCE_COLLECTION_MAX_URL_LENGTH, path)
  return raw ? normalizeItemUrl(raw, path) : ''
}

function parseInput (value) {
  if (typeof value !== 'string') return value
  if (byteLength(value) > KML_RESOURCE_COLLECTION_MAX_BYTES) {
    throw new KmlResourceCollectionError('资源集合大小不能超过 512 KiB', {
      code: 'RESOURCE_COLLECTION_TOO_LARGE',
    })
  }
  try {
    return JSON.parse(value)
  } catch {
    throw new KmlResourceCollectionError('资源集合数据不是有效 JSON', {
      code: 'RESOURCE_COLLECTION_JSON_INVALID',
    })
  }
}

export function normalizeKmlResourceCollection (value, options = {}) {
  const input = parseInput(value)
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new KmlResourceCollectionError('资源集合格式不正确')
  }
  const version = Number(input.version ?? KML_RESOURCE_COLLECTION_VERSION)
  if (version !== KML_RESOURCE_COLLECTION_VERSION) {
    throw new KmlResourceCollectionError(`暂不支持资源集合版本 ${version}`, {
      code: 'RESOURCE_COLLECTION_VERSION_UNSUPPORTED',
      path: 'version',
    })
  }
  const viewMode = String(input.viewMode || 'grid').trim().toLowerCase()
  if (!VIEW_MODES.has(viewMode)) {
    throw new KmlResourceCollectionError('资源集合视图只支持 grid 或 list', {
      code: 'RESOURCE_COLLECTION_VIEW_MODE_INVALID',
      path: 'viewMode',
    })
  }
  if (!Array.isArray(input.items)) {
    throw new KmlResourceCollectionError('资源集合 items 必须是数组', {
      code: 'RESOURCE_COLLECTION_ITEMS_INVALID',
      path: 'items',
    })
  }
  if (input.items.length > KML_RESOURCE_COLLECTION_MAX_ITEMS) {
    throw new KmlResourceCollectionError(`单个资源集合最多包含 ${KML_RESOURCE_COLLECTION_MAX_ITEMS} 项`, {
      code: 'RESOURCE_COLLECTION_ITEMS_EXCEEDED',
      path: 'items',
    })
  }

  const createId = typeof options.createId === 'function' ? options.createId : defaultCreateId
  const ids = new Set()
  const items = input.items.map((rawItem, index) => {
    const path = `items[${index}]`
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      throw new KmlResourceCollectionError(`第 ${index + 1} 个资源格式不正确`, {
        code: 'RESOURCE_COLLECTION_ITEM_INVALID',
        path,
      })
    }
    const type = String(rawItem.type || 'auto').trim().toLowerCase()
    if (!ITEM_TYPES.has(type)) {
      throw new KmlResourceCollectionError(`第 ${index + 1} 个资源类型不受支持`, {
        code: 'RESOURCE_COLLECTION_ITEM_TYPE_INVALID',
        path: `${path}.type`,
      })
    }
    let id = normalizeText(rawItem.id, 160, `${path}.id`) || String(createId(index) || '')
    if (!id || ids.has(id)) {
      if (ids.has(id)) {
        throw new KmlResourceCollectionError('资源集合项 ID 不能重复', {
          code: 'RESOURCE_COLLECTION_ITEM_ID_DUPLICATE',
          path: `${path}.id`,
        })
      }
      id = defaultCreateId()
    }
    ids.add(id)
    const coverUrl = normalizeOptionalItemUrl(rawItem.coverUrl, `${path}.coverUrl`)
    return {
      id,
      title: normalizeText(rawItem.title, KML_RESOURCE_COLLECTION_MAX_TITLE_LENGTH, `${path}.title`),
      url: normalizeItemUrl(rawItem.url, `${path}.url`),
      type,
      ...(coverUrl ? { coverUrl } : {}),
    }
  })

  const normalized = {
    version: KML_RESOURCE_COLLECTION_VERSION,
    viewMode,
    items,
  }
  if (byteLength(JSON.stringify(normalized)) > KML_RESOURCE_COLLECTION_MAX_BYTES) {
    throw new KmlResourceCollectionError('资源集合大小不能超过 512 KiB', {
      code: 'RESOURCE_COLLECTION_TOO_LARGE',
    })
  }
  return normalized
}

export function tryNormalizeKmlResourceCollection (value, options = {}) {
  try {
    return { value: normalizeKmlResourceCollection(value, options), error: null }
  } catch (error) {
    return {
      value: null,
      error: error instanceof KmlResourceCollectionError
        ? error
        : new KmlResourceCollectionError(error?.message || '资源集合格式不正确'),
    }
  }
}

export function serializeKmlResourceCollection (value, options = {}) {
  return JSON.stringify(normalizeKmlResourceCollection(value, options))
}

export function isKmlResourceCollection (value) {
  return Boolean(tryNormalizeKmlResourceCollection(value).value)
}
