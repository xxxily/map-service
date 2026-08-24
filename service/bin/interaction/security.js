import crypto from 'node:crypto'

const FORMAT = 'aes-256-gcm'
const VERSION = '1'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u
const PHONE_PATTERN = /^\+?[0-9]{7,32}$/u

function requireSecret (secret) {
  if (typeof secret !== 'string' || !secret) {
    const error = new Error('交互加密密钥不能为空')
    error.code = 'INTERACTION_SECRET_REQUIRED'
    throw error
  }
}

function keyForSecret (secret, purpose) {
  return crypto.createHash('sha256')
    .update('map-service:interaction:')
    .update(String(purpose || 'secret'))
    .update(':')
    .update(String(secret || ''))
    .digest()
}

function aadForPurpose (purpose) {
  return Buffer.from(`map-service:interaction:${String(purpose || 'secret')}:v1`, 'utf8')
}

function invalidCiphertext () {
  const error = new Error('交互密文格式不合法')
  error.code = 'INTERACTION_CIPHERTEXT_INVALID'
  return error
}

function parseCiphertext (value) {
  if (typeof value !== 'string') return null
  const parts = value.split('$')
  if (parts.length !== 5 || parts[0] !== FORMAT || parts[1] !== VERSION) return null
  if (parts.slice(2).some(part => !/^[A-Za-z0-9_-]+$/u.test(part))) return null
  const iv = Buffer.from(parts[2], 'base64url')
  const tag = Buffer.from(parts[3], 'base64url')
  const ciphertext = Buffer.from(parts[4], 'base64url')
  if (iv.toString('base64url') !== parts[2] || tag.toString('base64url') !== parts[3] || ciphertext.toString('base64url') !== parts[4]) return null
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null
  return { iv, tag, ciphertext }
}

export function isInteractionCiphertext (value) {
  return Boolean(parseCiphertext(value))
}

export function encryptInteractionSecret (value, secret, purpose = 'restricted') {
  if (value == null || value === '') return ''
  if (typeof value !== 'string') {
    const error = new Error('交互敏感字段必须是字符串')
    error.code = 'INTERACTION_VALUE_INVALID'
    throw error
  }
  const plaintext = value
  if (!plaintext) return ''
  requireSecret(secret)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyForSecret(secret, purpose), iv)
  cipher.setAAD(aadForPurpose(purpose))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [FORMAT, VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('$')
}

export function decryptInteractionSecret (value, secret, purpose = 'restricted') {
  if (value == null || value === '') return ''
  requireSecret(secret)
  const parsed = parseCiphertext(value)
  if (!parsed) throw invalidCiphertext()
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyForSecret(secret, purpose), parsed.iv)
    decipher.setAAD(aadForPurpose(purpose))
    decipher.setAuthTag(parsed.tag)
    return Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]).toString('utf8')
  } catch {
    const error = new Error('交互密文校验失败')
    error.code = 'INTERACTION_DECRYPT_FAILED'
    throw error
  }
}

export function hashInteractionValue (value, secret, purpose = 'value') {
  if (typeof value !== 'string') {
    const error = new Error('交互哈希值必须是字符串')
    error.code = 'INTERACTION_VALUE_INVALID'
    throw error
  }
  requireSecret(secret)
  return crypto.createHmac('sha256', keyForSecret(secret, `${purpose}:hash`))
    .update(value, 'utf8')
    .digest('base64url')
}

function normalizeContactValue (type, value, allowEmpty = false) {
  if (value == null || value === '') {
    if (allowEmpty) return ''
    const error = new Error('联系方式不能为空')
    error.code = 'CONTACT_VALUE_REQUIRED'
    throw error
  }
  if (typeof value !== 'string') {
    const error = new Error('联系方式必须是字符串')
    error.code = 'CONTACT_VALUE_INVALID'
    throw error
  }
  const normalizedType = String(type || '').trim().toLowerCase()
  const normalized = value.normalize('NFKC').trim()
  if (normalizedType === 'email') {
    const email = normalized.toLowerCase()
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      const error = new Error('邮箱格式不正确')
      error.code = 'CONTACT_VALUE_INVALID'
      throw error
    }
    return email
  }
  if (normalizedType === 'phone') {
    const phone = normalized.replace(/[\s().-]/gu, '')
    if (!PHONE_PATTERN.test(phone)) {
      const error = new Error('手机号格式不正确')
      error.code = 'CONTACT_VALUE_INVALID'
      throw error
    }
    return phone
  }
  const error = new Error('联系方式类型不合法')
  error.code = 'CONTACT_TYPE_INVALID'
  throw error
}

export function hashInteractionContact (type, value, secret) {
  const normalizedType = String(type || '').trim().toLowerCase()
  const normalizedValue = normalizeContactValue(normalizedType, value)
  return hashInteractionValue(`${normalizedType}:${normalizedValue}`, secret, 'contact')
}

export function hashInteractionContacts (contact = {}, secret) {
  const source = contact && typeof contact === 'object' && !Array.isArray(contact) ? contact : {}
  const email = normalizeContactValue('email', source.email, true)
  const phone = normalizeContactValue('phone', source.phone, true)
  if (!email && !phone) return ''
  return hashInteractionValue(`email:${email}|phone:${phone}`, secret, 'contact-set')
}

export function redactInteractionSecret (value) {
  return value ? '[REDACTED]' : ''
}
