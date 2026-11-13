const CACHE_VERSION = 'map-service-v1.5.76'
const APP_SHELL = [
  '/',
  '/offline.html',
  '/favicon.svg',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-icon.svg',
  '/manifest.webmanifest',
  '/location-keepalive.mp4',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key !== CACHE_VERSION)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

function shouldBypassCache (requestUrl) {
  return requestUrl.pathname.startsWith('/api/') ||
    requestUrl.pathname.startsWith('/log/') ||
    requestUrl.pathname.startsWith('/.cache/')
}

function navigateShellKey (requestUrl) {
  if (requestUrl.search) return ''
  if (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html') return '/'
  if (requestUrl.pathname === '/3d' || requestUrl.pathname === '/3d.html') return '/3d'
  return ''
}

function isCacheableResponse (response) {
  return Boolean(response && response.status === 200 && response.type === 'basic')
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin || shouldBypassCache(requestUrl)) {
    return
  }

  if (request.mode === 'navigate') {
    const shellKey = navigateShellKey(requestUrl)
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (shellKey && isCacheableResponse(response)) {
            const copy = response.clone()
            caches.open(CACHE_VERSION).then(cache => cache.put(shellKey, copy)).catch(() => {})
          }
          return response
        })
        .catch(() => {
          if (shellKey) {
            return caches.match(shellKey).then(response => response || caches.match('/offline.html'))
          }
          return caches.match('/offline.html')
        })
    )
    return
  }

  if (request.headers.has('range')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (isCacheableResponse(response)) {
          const copy = response.clone()
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy)).catch(() => {})
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})
