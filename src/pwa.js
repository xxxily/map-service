export function registerServiceWorker () {
  if (!('serviceWorker' in navigator)) {
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service Worker 注册失败', err)
    })
  })
}
