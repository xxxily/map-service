import { ensureAuthConfig } from './auth/session.js'

function isSafeDescriptor (descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || typeof descriptor.src !== 'string') return false
  try {
    const url = new URL(descriptor.src)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

export function loadAnalyticsScript (descriptor, options = {}) {
  if (!isSafeDescriptor(descriptor) || typeof document === 'undefined') return null
  const key = `map-analytics:${descriptor.src}:${JSON.stringify(descriptor.attributes || {})}`
  if ([...document.querySelectorAll('script[data-map-analytics-key]')]
    .some(item => item.dataset.mapAnalyticsKey === key)) return null
  const script = document.createElement('script')
  script.src = descriptor.src
  script.defer = descriptor.defer !== false
  script.async = descriptor.async === true
  script.dataset.mapAnalyticsKey = key
  Object.entries(descriptor.attributes || {}).forEach(([name, value]) => {
    if (/^data-[a-z0-9][a-z0-9_.:-]{0,63}$/i.test(name) || ['crossorigin', 'integrity', 'referrerpolicy', 'type'].includes(name)) {
      script.setAttribute(name, String(value ?? ''))
    }
  })
  ;(options.parent || document.head || document.documentElement).appendChild(script)
  return script
}

export async function loadGlobalAnalytics () {
  try {
    const config = await ensureAuthConfig()
    return loadAnalyticsScript(config?.analytics?.global)
  } catch {
    return null
  }
}
