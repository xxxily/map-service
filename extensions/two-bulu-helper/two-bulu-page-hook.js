(() => {
  'use strict'

  if (globalThis.__mapServiceTwoBuluPageHookLoaded) return
  globalThis.__mapServiceTwoBuluPageHookLoaded = true

  const PAGE_HOSTS = new Set(['2bulu.com', 'www.2bulu.com', 'app.2bulu.com'])
  const DATA_PATHS = new Set([
    '/track/get_track_positions_list4.htm',
    '/track/get_track_positions_list_new.htm',
    '/track/get_track_positions_list.htm',
    '/track/get_track_marker_list_new.htm',
    '/track/get_track_marker_list_2.htm',
  ])
  const MAX_RECORDS = 64
  const records = Array.isArray(globalThis.__mapServiceTwoBuluCapturedResponses)
    ? globalThis.__mapServiceTwoBuluCapturedResponses
    : []
  globalThis.__mapServiceTwoBuluCapturedResponses = records

  function isDataUrl (value) {
    try {
      const parsed = new URL(String(value || ''), location.href)
      return parsed.protocol === 'https:' &&
        PAGE_HOSTS.has(parsed.hostname.toLowerCase().replace(/\.$/, '')) &&
        !parsed.username && !parsed.password && !parsed.port &&
        DATA_PATHS.has(parsed.pathname)
    } catch {
      return false
    }
  }

  function remember (value) {
    const url = String(value || '')
    if (!isDataUrl(url) || records.some(record => record?.url === url)) return
    records.push({ url, capturedAt: Date.now() })
    while (records.length > MAX_RECORDS) records.shift()
  }

  try {
    performance.getEntriesByType('resource').forEach(entry => remember(entry?.name))
    const observer = new PerformanceObserver((entries) => {
      entries.getEntries().forEach(entry => remember(entry?.name))
    })
    observer.observe({ type: 'resource', buffered: true })
  } catch {}
})()
