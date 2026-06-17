import crypto from 'node:crypto'

const TOKEN_VERSION = 'v1'

function base64urlEncode (value) {
  return Buffer.from(value).toString('base64url')
}

function base64urlDecode (value) {
  return Buffer.from(value, 'base64url').toString()
}

function createHttpError (message, statusCode = 500) {
  const err = new Error(message)
  err.statusCode = statusCode
  return err
}

function timingSafeStringEqual (left, right) {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function sign (secret, payloadPart) {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadPart)
    .digest('base64url')
}

export function createAdminAuth (conf = {}) {
  const username = String(conf.username || 'admin')
  const password = String(conf.password || 'admin')
  const tokenSecret = String(conf.tokenSecret || 'map-service-dev-admin-secret')
  const tokenTtl = Number(conf.tokenTtl || 1000 * 60 * 60 * 8)

  function createToken (subject = username) {
    const now = Date.now()
    const payload = {
      sub: subject,
      scope: 'admin',
      iat: now,
      exp: now + tokenTtl,
    }
    const payloadPart = base64urlEncode(JSON.stringify(payload))
    const signature = sign(tokenSecret, payloadPart)
    return `${TOKEN_VERSION}.${payloadPart}.${signature}`
  }

  function verifyToken (token) {
    if (!token || typeof token !== 'string') {
      return null
    }

    const parts = token.split('.')
    if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
      return null
    }

    const [, payloadPart, signature] = parts
    const expectedSignature = sign(tokenSecret, payloadPart)
    if (!timingSafeStringEqual(signature, expectedSignature)) {
      return null
    }

    try {
      const payload = JSON.parse(base64urlDecode(payloadPart))
      if (payload.scope !== 'admin' || payload.exp <= Date.now()) {
        return null
      }

      return {
        username: payload.sub,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
      }
    } catch (err) {
      return null
    }
  }

  function login (input = {}) {
    const inputUsername = String(input.username || '')
    const inputPassword = String(input.password || '')
    const matched = timingSafeStringEqual(inputUsername, username) &&
      timingSafeStringEqual(inputPassword, password)

    if (!matched) {
      throw createHttpError('用户名或密码不正确', 401)
    }

    const token = createToken(username)
    const session = verifyToken(token)
    return {
      token,
      tokenType: 'Bearer',
      expiresAt: session.expiresAt,
      user: {
        username,
      },
    }
  }

  return {
    login,
    createToken,
    verifyToken,
    getPublicInfo () {
      return {
        username,
        tokenTtl,
      }
    },
  }
}

export default createAdminAuth
