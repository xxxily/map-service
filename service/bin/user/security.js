import crypto from 'node:crypto'
import { promisify } from 'node:util'
import {
  isValidInteractionAvatar,
} from '../../../shared/interaction-contracts.js'

const scryptAsync = promisify(crypto.scrypt)

export const PASSWORD_POLICY = Object.freeze({
  minLength: 12,
  maxLength: 128,
})

const SCRYPT_OPTIONS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
})

const PASSWORD_KEY_LENGTH = 64
const SECRET_AAD = Buffer.from('map-service:kml-share-password:v1', 'utf8')
const COMMON_PASSWORDS = new Set([
  'admin',
  'admin123',
  'password',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
])

export function createHttpError (message, statusCode = 400, code = 'VALIDATION_FAILED') {
  const err = new Error(message)
  err.statusCode = statusCode
  err.code = code
  return err
}

export const USER_GENDERS = Object.freeze(new Set(['', 'male', 'female', 'other', 'unknown']))

export function validateAvatar (value) {
  const avatar = String(value ?? '').trim()
  if (!avatar) return ''
  if (!isValidInteractionAvatar(avatar)) {
    throw createHttpError('头像必须是受控的图片 Data URL', 400, 'VALIDATION_FAILED')
  }
  return avatar
}

export function validateGender (value) {
  const gender = String(value ?? '').trim().toLowerCase()
  if (!USER_GENDERS.has(gender)) throw createHttpError('性别选项不合法', 400, 'VALIDATION_FAILED')
  return gender
}

export function randomToken (bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

export function randomId (prefix, bytes = 18) {
  return `${prefix}_${randomToken(bytes)}`
}

export function hashToken (value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('base64url')
}

function secretEncryptionKey (secret) {
  return crypto.createHash('sha256')
    .update('map-service:share-secret:')
    .update(String(secret || ''))
    .digest()
}

export function encryptSecret (value, secret) {
  const plaintext = String(value || '')
  if (!plaintext) return ''
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', secretEncryptionKey(secret), iv)
  cipher.setAAD(SECRET_AAD)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['aes-256-gcm', '1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('$')
}

export function decryptSecret (value, secret) {
  const parts = String(value || '').split('$')
  if (parts.length !== 5 || parts[0] !== 'aes-256-gcm' || parts[1] !== '1') return ''
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      secretEncryptionKey(secret),
      Buffer.from(parts[2], 'base64url')
    )
    decipher.setAAD(SECRET_AAD)
    decipher.setAuthTag(Buffer.from(parts[3], 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(parts[4], 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return ''
  }
}

export function timingSafeStringEqual (left, right) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function normalizeUsername (value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase()
}

export function validateUsername (value) {
  const display = String(value || '').normalize('NFKC').trim()
  const normalized = normalizeUsername(display)
  if (!/^[a-z0-9._-]{3,32}$/.test(normalized)) {
    throw createHttpError('用户名需为 3～32 位字母、数字、点、下划线或短横线', 400, 'VALIDATION_FAILED')
  }
  return {
    display,
    normalized,
  }
}

export function validateDisplayName (value, fallback = '') {
  const normalized = String(value ?? fallback).normalize('NFKC').trim()
  if (!normalized || normalized.length > 50) {
    throw createHttpError('展示名称长度需为 1～50 个字符', 400, 'VALIDATION_FAILED')
  }
  return normalized
}

export function normalizeOptionalEmail (value) {
  const normalized = String(value || '').normalize('NFKC').trim().toLowerCase()
  if (!normalized) return ''
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw createHttpError('邮箱格式不正确', 400, 'VALIDATION_FAILED')
  }
  return normalized
}

export function validatePassword (value, options = {}) {
  const password = String(value || '')
  const minLength = Number(options.minLength || PASSWORD_POLICY.minLength)
  const maxLength = Number(options.maxLength || PASSWORD_POLICY.maxLength)

  if (!options.allowWeak && password.length < minLength) {
    throw createHttpError(`密码长度至少为 ${minLength} 位`, 400, 'WEAK_PASSWORD')
  }
  if (!password || password.length > maxLength) {
    throw createHttpError(`密码长度不能超过 ${maxLength} 位`, 400, 'WEAK_PASSWORD')
  }

  const normalized = password.normalize('NFKC').toLowerCase()
  if (!options.allowWeak && (
    COMMON_PASSWORDS.has(normalized) ||
    (options.username && normalized.includes(normalizeUsername(options.username)))
  )) {
    throw createHttpError('密码过于常见或包含用户名，请使用更长的密码短语', 400, 'WEAK_PASSWORD')
  }
  return password
}

function serializePasswordHash (salt, hash) {
  return [
    'scrypt',
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    PASSWORD_KEY_LENGTH,
    salt,
    hash,
  ].join('$')
}

function parsePasswordHash (value) {
  const parts = String(value || '').split('$')
  if (parts.length !== 7 || parts[0] !== 'scrypt') return null
  const [, n, r, p, keyLength, salt, hash] = parts
  const parsed = {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    keyLength: Number(keyLength),
    salt,
    hash,
  }
  if (!parsed.salt || !parsed.hash || !Number.isSafeInteger(parsed.N) || !Number.isSafeInteger(parsed.keyLength)) {
    return null
  }
  return parsed
}

export async function hashPassword (value, options = {}) {
  const password = validatePassword(value, options)
  const salt = randomToken(16)
  const derived = await scryptAsync(password, salt, PASSWORD_KEY_LENGTH, SCRYPT_OPTIONS)
  return serializePasswordHash(salt, Buffer.from(derived).toString('base64url'))
}

export function hashPasswordSync (value, options = {}) {
  const password = validatePassword(value, options)
  const salt = randomToken(16)
  const derived = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH, SCRYPT_OPTIONS)
  return serializePasswordHash(salt, derived.toString('base64url'))
}

export async function verifyPassword (value, encodedHash) {
  const parsed = parsePasswordHash(encodedHash)
  if (!parsed) return false

  try {
    const derived = await scryptAsync(String(value || ''), parsed.salt, parsed.keyLength, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: SCRYPT_OPTIONS.maxmem,
    })
    return timingSafeStringEqual(Buffer.from(derived).toString('base64url'), parsed.hash)
  } catch (err) {
    return false
  }
}

export function nowIso (clock = Date) {
  return new clock().toISOString()
}
