function finiteNumber (value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function normalizeRoutePoint (point) {
  if (Array.isArray(point)) {
    const lat = finiteNumber(point[0])
    const lng = finiteNumber(point[1])
    return lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180
      ? null
      : { lat, lng }
  }
  const rawLat = typeof point?.getLat === 'function' ? point.getLat() : point?.lat
  const rawLng = typeof point?.getLng === 'function' ? point.getLng() : point?.lng
  const lat = finiteNumber(rawLat)
  const lng = finiteNumber(rawLng)
  return lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180
    ? null
    : { lat, lng }
}

export function normalizeRoutePath (points = []) {
  if (!Array.isArray(points)) return []
  const result = []
  for (const point of points) {
    const normalized = normalizeRoutePoint(point)
    if (!normalized) continue
    const previous = result[result.length - 1]
    if (previous && previous.lat === normalized.lat && previous.lng === normalized.lng) continue
    result.push(normalized)
  }
  return result
}

export function getRoutePath (route) {
  const directPath = normalizeRoutePath(route?.path)
  if (directPath.length >= 2) return directPath
  const stepPath = Array.isArray(route?.steps)
    ? route.steps.flatMap(step => Array.isArray(step?.path) ? step.path : [])
    : []
  return normalizeRoutePath(stepPath)
}

export function getRouteMetrics (route = {}) {
  const seconds = finiteNumber(route.time)
  const meters = finiteNumber(route.distance)
  return {
    seconds: seconds === null ? 0 : Math.max(0, seconds),
    meters: meters === null ? 0 : Math.max(0, meters),
  }
}

export function getBestRouteLocationName (result, fallback = '') {
  const regeocode = result?.regeocode
  if (!regeocode) return String(fallback || '').trim()
  const component = regeocode.addressComponent || {}
  const nearestPoi = Array.isArray(regeocode.pois)
    ? regeocode.pois.find(item => String(item?.name || '').trim())?.name
    : ''
  const nearestAoi = Array.isArray(regeocode.aois)
    ? regeocode.aois.find(item => String(item?.name || '').trim())?.name
    : ''
  return String(
    nearestPoi ||
    nearestAoi ||
    component.building ||
    regeocode.formattedAddress ||
    [component.province, component.city, component.district, component.township, component.street, component.streetNumber]
      .filter(Boolean)
      .join('') ||
    fallback,
  ).trim() || String(fallback || '').trim()
}

export function formatRouteDuration (seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0))
  const totalMinutes = Math.max(1, Math.round(value / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`
  return `${totalMinutes} 分钟`
}

export function formatRouteDistance (meters) {
  const value = Math.max(0, Number(meters) || 0)
  if (value >= 1000) return `${(value / 1000).toFixed(1)} 公里`
  return `${Math.round(value)} 米`
}

export function buildRouteDefaultName (startName, endName) {
  const start = String(startName || '').trim() || '起点'
  const end = String(endName || '').trim() || '终点'
  return `${start}-${end}`.slice(0, 120)
}

export function buildRouteDescription (route, startName, endName, routeIndex = null) {
  const metrics = getRouteMetrics(route)
  const lines = [
    `起点：${String(startName || '起点').trim()}`,
    `终点：${String(endName || '终点').trim()}`,
    `距离：${formatRouteDistance(metrics.meters)}`,
    `预计用时：${formatRouteDuration(metrics.seconds)}`,
  ]
  if (Number.isInteger(routeIndex)) lines.push(`路线方案：方案 ${routeIndex + 1}`)
  return lines.join('\n')
}

export function swapRouteEndpoints (start, end) {
  return { start: end || null, end: start || null }
}
