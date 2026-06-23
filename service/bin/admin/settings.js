import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(crypto.scrypt)
const ACCESS_TOKEN_VERSION = 'v1'
const ACCESS_TOKEN_SCOPE = 'map-access'
const ACCESS_PASSWORD_MIN_LENGTH = 4
const ACCESS_TOKEN_TTL = 1000 * 60 * 60 * 24 * 30

function clone (value) {
  return JSON.parse(JSON.stringify(value))
}

function createHttpError (message, statusCode = 400) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function normalizeBoolean (value) {
  return value === true || value === 'true' || value === '1'
}

function normalizeProtocol (value) {
  const protocol = String(value || 'http').toLowerCase()
  if (!['http', 'https'].includes(protocol)) {
    throw createHttpError('代理协议仅支持 http 或 https')
  }
  return protocol
}

function normalizePort (value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw createHttpError('代理端口必须是 1 到 65535 的整数')
  }
  return port
}

function normalizeHost (value) {
  const host = String(value || '').trim()
  if (!host || host.length > 255 || /[\s/]/.test(host)) {
    throw createHttpError('代理主机地址不合法')
  }
  return host
}

function normalizeProviderPolicy (input = {}, current = {}) {
  const result = { ...(current || {}) }

  Object.entries(input || {}).forEach(([providerId, enabled]) => {
    if (/^[a-z0-9-]+$/i.test(providerId)) {
      result[providerId] = normalizeBoolean(enabled)
    }
  })

  return result
}

function base64urlEncode (value) {
  return Buffer.from(value).toString('base64url')
}

function base64urlDecode (value) {
  return Buffer.from(value, 'base64url').toString()
}

function timingSafeStringEqual (left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function signAccessToken (secret, payloadPart) {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadPart)
    .digest('base64url')
}

function validateAccessPassword (password) {
  const normalized = String(password || '')
  if (normalized.length < ACCESS_PASSWORD_MIN_LENGTH) {
    throw createHttpError(`访问密码长度至少为 ${ACCESS_PASSWORD_MIN_LENGTH} 位`)
  }
  return normalized
}

async function hashAccessPassword (password) {
  const normalized = validateAccessPassword(password)
  const salt = crypto.randomBytes(16).toString('base64url')
  const derived = await scryptAsync(normalized, salt, 64)
  return {
    algorithm: 'scrypt',
    salt,
    hash: Buffer.from(derived).toString('base64url'),
  }
}

async function verifyAccessPasswordHash (password, passwordHash) {
  if (!passwordHash?.salt || !passwordHash?.hash || passwordHash.algorithm !== 'scrypt') {
    return false
  }

  const derived = await scryptAsync(String(password || ''), passwordHash.salt, 64)
  return timingSafeStringEqual(Buffer.from(derived).toString('base64url'), passwordHash.hash)
}

function normalizeAccess (input = {}, current = {}) {
  const version = Number(input.version ?? current.version ?? 0)
  const updatedAt = Number(input.updatedAt ?? current.updatedAt ?? 0)
  const passwordHash = input.passwordHash && typeof input.passwordHash === 'object'
    ? {
        algorithm: String(input.passwordHash.algorithm || ''),
        salt: String(input.passwordHash.salt || ''),
        hash: String(input.passwordHash.hash || ''),
      }
    : current.passwordHash || null

  return {
    enabled: normalizeBoolean(input.enabled ?? current.enabled ?? false),
    passwordHash,
    version: Number.isInteger(version) && version > 0 ? version : 0,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
  }
}

function hasAccessPassword (access) {
  return Boolean(access.passwordHash?.hash)
}

function sanitizeAccess (access) {
  return {
    enabled: Boolean(access.enabled),
    hasPassword: hasAccessPassword(access),
  }
}

function normalizeProxy (input = {}, current = {}) {
  const next = {
    enabled: normalizeBoolean(input.enabled ?? current.enabled),
    protocol: normalizeProtocol(input.protocol ?? current.protocol),
    host: normalizeHost(input.host ?? current.host),
    port: normalizePort(input.port ?? current.port),
    username: String(input.username ?? current.username ?? '').trim(),
    password: Object.hasOwn(input, 'password')
      ? String(input.password || '')
      : String(current.password || ''),
    providerPolicy: normalizeProviderPolicy(input.providerPolicy, current.providerPolicy),
  }

  if (!next.username) {
    next.password = ''
  }

  return next
}

function sanitizeProxy (proxy) {
  return {
    enabled: Boolean(proxy.enabled),
    protocol: proxy.protocol,
    host: proxy.host,
    port: proxy.port,
    username: proxy.username || '',
    hasPassword: Boolean(proxy.password),
    providerPolicy: proxy.providerPolicy || {},
  }
}

export class AdminSettings {
  constructor (store, defaults = {}) {
    this.store = store
    this.accessTokenSecret = String(defaults.accessTokenSecret || defaults.tokenSecret || 'map-service-dev-access-secret')
    this.accessTokenTtl = Number(defaults.accessTokenTtl || ACCESS_TOKEN_TTL)
    this.defaults = {
      proxy: normalizeProxy(defaults.proxy || {
        enabled: false,
        protocol: 'http',
        host: '127.0.0.1',
        port: 10809,
        username: '',
        password: '',
        providerPolicy: {
          'amap-satellite': false,
          'amap-road': false,
          'google-satellite': true,
          'google-street': true,
        },
      }),
      access: normalizeAccess(defaults.access || {
        enabled: false,
        passwordHash: null,
        version: 0,
        updatedAt: 0,
      }),
    }
    this.cache = null
  }

  async readRaw () {
    if (this.cache) {
      return clone(this.cache)
    }

    const saved = await this.store.read('settings', {})
    this.cache = {
      proxy: normalizeProxy(saved?.proxy || {}, this.defaults.proxy),
      access: normalizeAccess(saved?.access || {}, this.defaults.access),
    }
    return clone(this.cache)
  }

  async getSanitized () {
    const settings = await this.readRaw()
    return {
      proxy: sanitizeProxy(settings.proxy),
      access: sanitizeAccess(settings.access),
    }
  }

  async update (input = {}) {
    const current = await this.readRaw()
    let access = current.access
    if (Object.hasOwn(input, 'access')) {
      const accessInput = input.access || {}
      access = normalizeAccess(accessInput, current.access)
      if (Object.hasOwn(accessInput, 'clearPassword') && normalizeBoolean(accessInput.clearPassword)) {
        access = {
          ...access,
          passwordHash: null,
          version: Number(access.version || 0) + 1,
          updatedAt: Date.now(),
        }
      } else if (Object.hasOwn(accessInput, 'password')) {
        const password = String(accessInput.password || '')
        access = password
          ? {
            ...access,
            passwordHash: await hashAccessPassword(password),
            version: Number(access.version || 0) + 1,
            updatedAt: Date.now(),
          }
          : {
            ...access,
            passwordHash: null,
            version: Number(access.version || 0) + 1,
            updatedAt: Date.now(),
          }
      }
    }

    if (access.enabled && !hasAccessPassword(access)) {
      throw createHttpError('启用访问密码时，必须设置访问密码')
    }

    const next = {
      ...current,
      proxy: Object.hasOwn(input, 'proxy')
        ? normalizeProxy(input.proxy || {}, current.proxy)
        : current.proxy,
      access,
    }

    await this.store.write('settings', next)
    this.cache = clone(next)
    return this.getSanitized()
  }

  async getProxyForRequest (options = {}) {
    const settings = await this.readRaw()
    const proxy = settings.proxy
    const forceProxy = options === true || options.forceProxy === true
    const providerId = options.providerId || ''
    const providerEnabled = providerId
      ? Boolean((proxy.providerPolicy || {})[providerId])
      : false

    return {
      ...proxy,
      enabled: Boolean(forceProxy || (proxy.enabled && providerEnabled)),
    }
  }

  async verifyAccess (token) {
    const settings = await this.readRaw()
    const access = settings.access
    if (!access.enabled || !hasAccessPassword(access)) {
      return true
    }

    if (!token || typeof token !== 'string') {
      return false
    }

    const parts = token.split('.')
    if (parts.length !== 3 || parts[0] !== ACCESS_TOKEN_VERSION) {
      return false
    }

    const [, payloadPart, signature] = parts
    const expectedSignature = signAccessToken(this.accessTokenSecret, payloadPart)
    if (!timingSafeStringEqual(signature, expectedSignature)) {
      return false
    }

    try {
      const payload = JSON.parse(base64urlDecode(payloadPart))
      return payload.scope === ACCESS_TOKEN_SCOPE &&
        payload.exp > Date.now() &&
        payload.passwordVersion === access.version
    } catch (err) {
      return false
    }
  }

  async isAccessEnabled () {
    const settings = await this.readRaw()
    return Boolean(settings.access.enabled && hasAccessPassword(settings.access))
  }

  async checkPassword (password) {
    const settings = await this.readRaw()
    const access = settings.access
    if (access.passwordHash) {
      return verifyAccessPasswordHash(password, access.passwordHash)
    }
    return false
  }

  async createAccessToken () {
    const settings = await this.readRaw()
    const access = settings.access
    if (!access.enabled || !hasAccessPassword(access)) {
      throw createHttpError('访问控制未启用', 400)
    }

    const now = Date.now()
    const payloadPart = base64urlEncode(JSON.stringify({
      scope: ACCESS_TOKEN_SCOPE,
      iat: now,
      exp: now + this.accessTokenTtl,
      passwordVersion: access.version,
    }))
    const signature = signAccessToken(this.accessTokenSecret, payloadPart)
    return {
      token: `${ACCESS_TOKEN_VERSION}.${payloadPart}.${signature}`,
      expiresAt: now + this.accessTokenTtl,
      maxAge: this.accessTokenTtl,
    }
  }
}

export default AdminSettings
