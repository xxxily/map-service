export function sanitizeLogUrl (rawUrl) {
  const input = String(rawUrl || '')
  if (!input || input === '-') return input || '-'
  try {
    const url = new URL(input, 'http://map-service.local')
    if (url.searchParams.has('coords')) url.searchParams.set('coords', '[redacted]')
    return `${url.pathname}${url.search}`
  } catch (err) {
    return input.replace(/([?&]coords=)[^&#\s"]*/gi, '$1[redacted]')
  }
}
