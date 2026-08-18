const DEFAULT_SEARCH_CITY = '全国'
const SEARCH_BIAS_REFRESH_DELTA = 0.01
const SEARCH_BIAS_DEBOUNCE_MS = 180

export function normalizeSearchBiasCenter (center) {
  const lng = Number(center?.lng ?? center?.longitude)
  const lat = Number(center?.lat ?? center?.latitude)
  if (!Number.isFinite(lng) || !Number.isFinite(lat) ||
      lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return null
  }
  return { lng, lat }
}

export function resolveSearchBiasCity (result) {
  const component = result?.regeocode?.addressComponent || result?.addressComponent || {}
  const city = Array.isArray(component.city)
    ? component.city.find(Boolean)
    : component.city
  const candidates = [city, component.province, component.citycode, component.adcode]
  return String(candidates.find(value => String(value || '').trim()) || '').trim()
}

export function createAmapSearchBias (options = {}) {
  const AMap = options.AMap
  const getCenter = options.getCenter
  const targets = (options.targets || []).filter(Boolean)
  const inputCleanups = []
  let destroyed = false
  let geocoder = null
  let requestRevision = 0
  let scheduleTimer = null
  let lastCenter = null
  let lastCity = ''

  const applyCity = city => {
    const nextCity = city || DEFAULT_SEARCH_CITY
    targets.forEach(target => target?.setCity?.(nextCity))
  }

  const refresh = () => {
    const center = normalizeSearchBiasCenter(getCenter?.())
    if (!center || destroyed) return Promise.resolve(lastCity || DEFAULT_SEARCH_CITY)

    const centerUnchanged = lastCenter &&
      Math.abs(center.lng - lastCenter.lng) < SEARCH_BIAS_REFRESH_DELTA &&
      Math.abs(center.lat - lastCenter.lat) < SEARCH_BIAS_REFRESH_DELTA
    if (centerUnchanged && lastCity) return Promise.resolve(lastCity)
    lastCenter = center
    const revision = ++requestRevision

    return new Promise(resolve => {
      const complete = city => {
        if (destroyed || revision !== requestRevision) {
          resolve(lastCity || DEFAULT_SEARCH_CITY)
          return
        }
        if (city) {
          lastCity = city
          applyCity(city)
        } else if (!lastCity) {
          applyCity(DEFAULT_SEARCH_CITY)
        }
        resolve(lastCity || DEFAULT_SEARCH_CITY)
      }

      const requestAddress = () => {
        try {
          geocoder ||= new AMap.Geocoder({ extensions: 'base' })
          geocoder.getAddress([center.lng, center.lat], (status, result) => {
            complete(status === 'complete' ? resolveSearchBiasCity(result) : '')
          })
        } catch {
          complete('')
        }
      }

      if (AMap?.Geocoder) {
        requestAddress()
      } else if (typeof AMap?.plugin === 'function') {
        AMap.plugin('AMap.Geocoder', requestAddress)
      } else {
        complete('')
      }
    })
  }

  const schedule = () => {
    if (destroyed) return
    if (scheduleTimer !== null) globalThis.clearTimeout(scheduleTimer)
    scheduleTimer = globalThis.setTimeout(() => {
      scheduleTimer = null
      refresh()
    }, SEARCH_BIAS_DEBOUNCE_MS)
  }

  const bindInput = input => {
    if (!input?.addEventListener) return
    const handleFocus = () => refresh()
    input.addEventListener('focus', handleFocus)
    inputCleanups.push(() => input.removeEventListener('focus', handleFocus))
  }

  const destroy = () => {
    destroyed = true
    requestRevision += 1
    if (scheduleTimer !== null) globalThis.clearTimeout(scheduleTimer)
    scheduleTimer = null
    inputCleanups.splice(0).forEach(cleanup => cleanup())
  }

  applyCity(DEFAULT_SEARCH_CITY)

  return {
    bindInput,
    destroy,
    refresh,
    schedule,
  }
}

export { DEFAULT_SEARCH_CITY }
