const CACHE_VERSION = 'map-service-v1.2.2'
const APP_SHELL = [
  '/',
  '/offline.html',
  '/favicon.svg',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-icon.svg',
  '/manifest.webmanifest',
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

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin || shouldBypassCache(requestUrl)) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_VERSION).then(cache => cache.put('/', copy))
          return response
        })
        .catch(() => caches.match('/').then(response => response || caches.match('/offline.html')))
    )
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_VERSION).then(cache => cache.put(request, copy))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})
