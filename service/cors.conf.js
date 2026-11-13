import config from './config.js'

const DEFAULT_WHITELIST = config.staticService.corsWhitelist || []

/**
 * Parse a CORS whitelist rule into canonical hostname (plus optional exact scheme/port).
 */
export function parseCorsRule (rule) {
  const raw = String(rule || '').trim().toLowerCase()
  if (!raw) return null
  try {
    const hasScheme = raw.includes('://')
    const parsed = hasScheme ? new URL(raw) : new URL(`https://${raw}`)
    if (!['http:', 'https:'].includes(parsed.protocol)) return null
    const hostname = parsed.hostname.replace(/^\.+|\.+$/g, '')
    if (!hostname) return null
    return {
      exactOrigin: hasScheme,
      protocol: parsed.protocol,
      port: parsed.port || '',
      hostname,
    }
  } catch {
    return null
  }
}

/**
 * Strictly match a browser Origin header against domain/origin whitelist rules.
 */
export function isOriginAllowed (origin, whitelist = DEFAULT_WHITELIST) {
  if (!origin) return true
  let parsed
  try {
    parsed = new URL(String(origin).trim())
  } catch {
    return false
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false
  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/g, '')
  if (!hostname) return false

  return (Array.isArray(whitelist) ? whitelist : []).some((item) => {
    const rule = parseCorsRule(item)
    if (!rule) return false
    if (rule.exactOrigin) {
      return parsed.protocol === rule.protocol &&
        (parsed.port || '') === rule.port &&
        hostname === rule.hostname
    }
    return hostname === rule.hostname || hostname.endsWith(`.${rule.hostname}`)
  })
}

export function createCorsOptions (whitelist = DEFAULT_WHITELIST) {
  return {
    origin (origin, callback) {
      if (isOriginAllowed(origin, whitelist)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
  }
}

export default createCorsOptions()
