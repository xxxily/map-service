export function formatBytes (bytes = 0) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function formatDuration (seconds = 0) {
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export function formatTime (timestamp) {
  if (!timestamp) return '-'
  return new Date(timestamp).toLocaleString()
}

export function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function relayTileUrl (tileRelayEndpoint, targetUrl) {
  return `${tileRelayEndpoint}?url=${encodeURIComponent(targetUrl)
    .replace(/%7B/g, '{')
    .replace(/%7D/g, '}')}`
}
