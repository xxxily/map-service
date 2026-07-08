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

function normalizeAuth (input = {}, current = {}) {
  const defaultTtl = 1000 * 60 * 60 * 24 * 15 // 15 days
  const tokenTtl = Number(input.tokenTtl ?? current.tokenTtl ?? defaultTtl)
  return {
    tokenTtl: Number.isInteger(tokenTtl) && tokenTtl > 0 ? tokenTtl : defaultTtl,
  }
}

function sanitizeAuth (auth) {
  return {
    tokenTtl: auth.tokenTtl,
  }
}

export class AdminSettings {
  constructor (store, defaults = {}) {
    this.store = store
    this.accessTokenSecret = String(defaults.accessTokenSecret || defaults.tokenSecret || 'map-service-dev-access-secret')
    this.accessTokenTtl = Number(defaults.accessTokenTtl || ACCESS_TOKEN_TTL)
    this.defaults = {
      access: normalizeAccess(defaults.access || {
        enabled: false,
        passwordHash: null,
        version: 0,
        updatedAt: 0,
      }),
      auth: normalizeAuth(defaults.auth || {
        tokenTtl: 1000 * 60 * 60 * 24 * 15,
      }),
    }
    this.cache = null
  }

  async readRaw () {
    if (this.cache) {
      return clone(this.cache)
    }

    const saved = await this.store.read('settings', {})

    // Migrate plain-text password from old settings if exists
    if (saved?.access?.password && !saved.access.passwordHash) {
      try {
        const password = String(saved.access.password)
        saved.access.passwordHash = await hashAccessPassword(password)
        delete saved.access.password
        await this.store.write('settings', saved)
      } catch (err) {
        console.error('[settings migration] failed to migrate plain password', err)
      }
    }

    this.cache = {
      access: normalizeAccess(saved?.access || {}, this.defaults.access),
      auth: normalizeAuth(saved?.auth || {}, this.defaults.auth),
    }
    return clone(this.cache)
  }

  async getSanitized () {
    const settings = await this.readRaw()
    return {
      access: sanitizeAccess(settings.access),
      auth: sanitizeAuth(settings.auth),
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

    let auth = current.auth
    if (Object.hasOwn(input, 'auth')) {
      auth = normalizeAuth(input.auth, current.auth)
    }

    if (access.enabled && !hasAccessPassword(access)) {
      throw createHttpError('启用访问密码时，必须设置访问密码')
    }

    const next = {
      access,
      auth,
    }

    await this.store.write('settings', next)
    this.cache = clone(next)
    return this.getSanitized()
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
