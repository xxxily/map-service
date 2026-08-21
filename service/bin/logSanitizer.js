const SENSITIVE_QUERY_PARAM_NAMES = new Set([
  'password',
  'passwd',
  'pwd',
  'token',
  'access_token',
  'api_key',
  'apikey',
  'secret',
])

function redactSensitiveQueryParams (url) {
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY_PARAM_NAMES.has(key.toLowerCase())) {
      url.searchParams.set(key, '****')
    }
  }
}

export function sanitizeLogUrl (rawUrl) {
  const input = String(rawUrl || '')
  if (!input || input === '-') return input || '-'
  try {
    const url = new URL(input, 'http://map-service.local')
    redactSensitiveQueryParams(url)
    if (url.searchParams.has('coords')) url.searchParams.set('coords', '[redacted]')
    if (url.pathname === '/api/v1/kml/media' && url.searchParams.has('url')) {
      url.searchParams.set('url', '[redacted]')
    }
    return `${url.pathname}${url.search}`
  } catch (err) {
    return input
      .replace(/([?&](?:password|passwd|pwd|token|access_token|api_key|apikey|secret)=)[^&#\s"]*/gi, '$1****')
      .replace(/([?&]coords=)[^&#\s"]*/gi, '$1[redacted]')
  }
}
