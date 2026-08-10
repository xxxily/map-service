(() => {
  'use strict'

  if (window.top !== window || globalThis.__mapServiceTwoBuluBridgeLoaded) return
  globalThis.__mapServiceTwoBuluBridgeLoaded = true

  const REQUEST_EVENT = 'map-service:two-bulu-helper:request'
  const RESPONSE_EVENT = 'map-service:two-bulu-helper:response'
  const PROTOCOL_VERSION = 1
  const CAPABILITY = '2bulu-kml-import'
  const TAB_LIFECYCLE_CAPABILITY = '2bulu-import-tab-lifecycle'
  const DEFAULT_ALLOWED_ORIGINS = [
    'http://127.0.0.1:3088',
    'http://localhost:3088',
    'http://127.0.0.1:5174',
    'http://localhost:5174',
  ]
  const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/
  let allowed = false

  function respond (payload) {
    document.dispatchEvent(new CustomEvent(RESPONSE_EVENT, {
      detail: JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        timestamp: Date.now(),
        ...payload,
      }),
    }))
  }

  function parseRequest (event) {
    if (!allowed || typeof event.detail !== 'string' || event.detail.length > 8192) return null
    try {
      const request = JSON.parse(event.detail)
      if (request?.protocolVersion !== PROTOCOL_VERSION || !REQUEST_ID_PATTERN.test(String(request?.requestId || ''))) return null
      if (Math.abs(Date.now() - Number(request.timestamp || 0)) > 5 * 60 * 1000) return null
      return request
    } catch {
      return null
    }
  }

  async function onRequest (event) {
    const request = parseRequest(event)
    if (!request) return

    if (request.type === 'PING') {
      respond({
        type: 'PONG',
        requestId: request.requestId,
        helperVersion: chrome.runtime.getManifest().version,
        capabilities: [CAPABILITY, TAB_LIFECYCLE_CAPABILITY],
      })
      return
    }

    if (request.type === 'COMPLETE_2BULU_IMPORT') {
      if (
        !REQUEST_ID_PATTERN.test(String(request.importSessionId || '')) ||
        !['success', 'failed'].includes(request.status) ||
        typeof request.message !== 'string' ||
        request.message.length > 1000
      ) return
      try {
        const result = await chrome.runtime.sendMessage({
          channel: 'map-service-two-bulu-helper',
          action: 'FINALIZE_2BULU_IMPORT',
          importSessionId: request.importSessionId,
          status: request.status,
          message: request.message,
        })
        respond({
          type: 'COMPLETE_RESULT',
          requestId: request.requestId,
          helperVersion: chrome.runtime.getManifest().version,
          ...(result || { ok: false, code: 'HELPER_UNAVAILABLE', message: '浏览器助手没有返回标签页处理结果。' }),
        })
      } catch (error) {
        respond({
          type: 'COMPLETE_RESULT',
          requestId: request.requestId,
          helperVersion: chrome.runtime.getManifest().version,
          ok: false,
          code: 'HELPER_UNAVAILABLE',
          message: error?.message || '浏览器助手暂时无法处理标签页。',
        })
      }
      return
    }

    if (request.type !== 'IMPORT_2BULU_KML' || typeof request.url !== 'string' || request.url.length > 2048) return
    try {
      const result = await chrome.runtime.sendMessage({
        channel: 'map-service-two-bulu-helper',
        action: 'IMPORT_2BULU_KML',
        requestId: request.requestId,
        url: request.url,
        partialPolicy: request.partialPolicy === 'allow-track-only' ? 'allow-track-only' : 'reject',
      })
      respond({
        type: 'IMPORT_RESULT',
        requestId: request.requestId,
        helperVersion: chrome.runtime.getManifest().version,
        ...(result || {
          status: 'failed',
          code: 'HELPER_UNAVAILABLE',
          message: '浏览器助手没有返回结果，请刷新页面后重试。',
        }),
      })
    } catch (error) {
      respond({
        type: 'IMPORT_RESULT',
        requestId: request.requestId,
        helperVersion: chrome.runtime.getManifest().version,
        status: 'failed',
        code: 'HELPER_UNAVAILABLE',
        message: error?.message || '浏览器助手暂时不可用，请刷新页面后重试。',
      })
    }
  }

  async function refreshAuthorization () {
    try {
      const stored = await chrome.storage.local.get('allowedOrigins')
      const origins = Array.isArray(stored.allowedOrigins) ? stored.allowedOrigins : DEFAULT_ALLOWED_ORIGINS
      allowed = origins.includes(location.origin)
    } catch {
      allowed = false
    }
  }

  document.addEventListener(REQUEST_EVENT, onRequest)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.allowedOrigins) refreshAuthorization()
  })
  refreshAuthorization()
})()
