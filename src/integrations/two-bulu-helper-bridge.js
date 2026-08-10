const PROTOCOL_VERSION = 1
const CAPABILITY = '2bulu-kml-import'
const TAB_LIFECYCLE_CAPABILITY = '2bulu-import-tab-lifecycle'
const REQUEST_EVENT = 'map-service:two-bulu-helper:request'
const RESPONSE_EVENT = 'map-service:two-bulu-helper:response'
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/
const MAX_KML_BYTES = 10 * 1024 * 1024
const DEFAULT_PROBE_TIMEOUT_MS = 1200
const DEFAULT_IMPORT_TIMEOUT_MS = 120000
const DEFAULT_COMPLETION_TIMEOUT_MS = 5000

let state = {
  status: 'not-probed',
  available: false,
  helperVersion: '',
  capabilities: [],
  error: '',
}
let probePromise = null
const listeners = new Set()

function emit () {
  const snapshot = getTwoBuluHelperState()
  listeners.forEach(listener => {
    try { listener(snapshot) } catch {}
  })
}

function setState (next) {
  state = { ...state, ...next }
  emit()
  return getTwoBuluHelperState()
}

function randomId (prefix = '2bulu-helper') {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}-${uuid}`
}

function isRequestId (value) {
  return REQUEST_ID_PATTERN.test(String(value || ''))
}

function parseEventDetail (event) {
  if (event?.target && typeof document !== 'undefined' && event.target !== document) return null
  if (typeof event?.detail !== 'string' || event.detail.length > MAX_KML_BYTES + 1024) return null
  try {
    const value = JSON.parse(event.detail)
    if (!value || value.protocolVersion !== PROTOCOL_VERSION || !isRequestId(value.requestId)) return null
    return value
  } catch {
    return null
  }
}

function dispatchRequest (payload, targetDocument) {
  if (!targetDocument?.dispatchEvent || typeof CustomEvent === 'undefined') return false
  targetDocument.dispatchEvent(new CustomEvent(REQUEST_EVENT, {
    detail: JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      timestamp: Date.now(),
      ...payload,
    }),
  }))
  return true
}

function waitForResponse (requestId, expectedType, timeoutMs, targetDocument, requestPayload = {}) {
  return new Promise((resolve, reject) => {
    if (!targetDocument?.addEventListener) {
      const error = new Error('当前页面不支持浏览器助手消息通道')
      error.code = 'HELPER_UNAVAILABLE'
      reject(error)
      return
    }
    let timer
    const cleanup = () => {
      clearTimeout(timer)
      targetDocument.removeEventListener(RESPONSE_EVENT, onResponse)
    }
    const onResponse = (event) => {
      const response = parseEventDetail(event)
      if (!response || response.requestId !== requestId || response.type !== expectedType) return
      cleanup()
      resolve(response)
    }
    targetDocument.addEventListener(RESPONSE_EVENT, onResponse)
    timer = setTimeout(() => {
      cleanup()
      const error = new Error(expectedType === 'PONG'
        ? '未检测到已授权的两步路浏览器助手'
        : expectedType === 'COMPLETE_RESULT'
          ? '等待浏览器助手处理临时标签页超时，KML 导入结果不受影响'
          : '等待浏览器助手读取两步路轨迹超时，请检查已打开的两步路页面后重试')
      error.code = expectedType === 'PONG'
        ? 'HELPER_NOT_INSTALLED'
        : expectedType === 'COMPLETE_RESULT'
          ? 'HELPER_COMPLETION_TIMEOUT'
          : 'HELPER_TIMEOUT'
      reject(error)
    }, Math.max(100, Number(timeoutMs) || DEFAULT_PROBE_TIMEOUT_MS))
    const requestType = requestPayload.type || (expectedType === 'PONG' ? 'PING' : 'IMPORT_2BULU_KML')
    if (!dispatchRequest({
      ...requestPayload,
      type: requestType,
      requestId,
    }, targetDocument)) {
      cleanup()
      const error = new Error('当前页面无法连接浏览器助手')
      error.code = 'HELPER_UNAVAILABLE'
      reject(error)
    }
  })
}

export function getTwoBuluHelperState () {
  return {
    ...state,
    capabilities: [...state.capabilities],
  }
}

export function subscribeTwoBuluHelper (listener) {
  if (!(listener instanceof Function)) return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function buildTwoBuluHelperPing (requestId = randomId('probe')) {
  if (!isRequestId(requestId)) throw new Error('浏览器助手请求 ID 格式不正确')
  return { protocolVersion: PROTOCOL_VERSION, type: 'PING', requestId }
}

export function parseTwoBuluHelperResponse (value, requestId, expectedType = 'PONG') {
  if (!value || value.protocolVersion !== PROTOCOL_VERSION || value.requestId !== requestId || value.type !== expectedType) return null
  return value
}

export async function probeTwoBuluHelper (options = {}) {
  if (probePromise && !options.force) return probePromise
  const targetDocument = options.document || (typeof document !== 'undefined' ? document : null)
  const requestId = randomId('probe')
  if (!targetDocument) {
    return setState({ status: 'not-installed', available: false, error: '当前环境没有页面消息通道' })
  }
  probePromise = (async () => {
    try {
      const response = await waitForResponse(requestId, 'PONG', options.timeoutMs || DEFAULT_PROBE_TIMEOUT_MS, targetDocument)
      const capabilities = Array.isArray(response.capabilities) ? response.capabilities.map(String) : []
      if (!capabilities.includes(CAPABILITY)) {
        return setState({ status: 'incompatible', available: false, helperVersion: String(response.helperVersion || ''), capabilities, error: '浏览器助手不支持两步路导入协议' })
      }
      return setState({ status: 'available', available: true, helperVersion: String(response.helperVersion || ''), capabilities, error: '' })
    } catch (error) {
      return setState({ status: 'not-installed', available: false, helperVersion: '', capabilities: [], error: error?.message || '未检测到浏览器助手' })
    } finally {
      probePromise = null
    }
  })()
  return probePromise
}

export async function requestTwoBuluKml (input = {}, options = {}) {
  const targetDocument = options.document || (typeof document !== 'undefined' ? document : null)
  const operationId = randomId('operation')
  const url = String(input.url || '').trim()
  if (!url || url.length > 2048) {
    const error = new Error('请输入有效的两步路公开分享链接')
    error.code = 'TWO_BULU_URL_INVALID'
    throw error
  }
  await probeTwoBuluHelper({ document: targetDocument, timeoutMs: options.probeTimeoutMs, force: true })
  if (!getTwoBuluHelperState().available) {
    const error = new Error('未检测到已授权的两步路浏览器助手，请先安装并授权扩展后刷新页面。')
    error.code = 'HELPER_NOT_INSTALLED'
    throw error
  }

  const response = await waitForResponse(
    operationId,
    'IMPORT_RESULT',
    options.timeoutMs || DEFAULT_IMPORT_TIMEOUT_MS,
    targetDocument,
    {
      url,
      partialPolicy: input.partialPolicy === 'allow-track-only' ? 'allow-track-only' : 'reject',
    },
  )
  if (response.status !== 'success') {
    const error = new Error(String(response.message || '浏览器助手无法读取两步路公开轨迹'))
    error.code = String(response.code || 'HELPER_FAILED')
    error.status = response.status
    throw error
  }
  const kmlText = String(response.kmlText || '')
  const byteSize = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(kmlText).byteLength
    : new Blob([kmlText]).size
  if (byteSize > MAX_KML_BYTES) {
    const error = new Error('浏览器助手返回的 KML 超过 10 MiB')
    error.code = 'FILE_TOO_LARGE'
    throw error
  }
  if (!/<(?:[\w.-]+:)?kml\b/i.test(kmlText) || !/<\/(?:[\w.-]+:)?kml\s*>/i.test(kmlText)) {
    const error = new Error('浏览器助手返回的内容不是标准 KML')
    error.code = 'TWO_BULU_KML_NOT_FOUND'
    throw error
  }
  return {
    kmlText,
    importSessionId: isRequestId(response.importSessionId) ? String(response.importSessionId) : '',
    tabLifecycle: String(response.tabLifecycle || ''),
    name: String(response.name || '').slice(0, 200),
    sourceUrl: String(response.sourceUrl || ''),
    helperVersion: String(response.helperVersion || getTwoBuluHelperState().helperVersion || ''),
    sourceMode: String(response.sourceMode || 'official-kml'),
    completeness: String(response.completeness || 'full'),
    warnings: Array.isArray(response.warnings) ? response.warnings.map(String).slice(0, 10) : [],
  }
}

export async function finalizeTwoBuluImport (importResult = {}, outcome = {}, options = {}) {
  const importSessionId = String(importResult.importSessionId || '')
  if (!isRequestId(importSessionId)) {
    return { supported: false, ok: false, code: 'TAB_LIFECYCLE_UNSUPPORTED' }
  }
  const targetDocument = options.document || (typeof document !== 'undefined' ? document : null)
  const requestId = randomId('completion')
  const status = outcome.status === 'success' ? 'success' : 'failed'
  const message = String(outcome.message || (status === 'success'
    ? 'KML 已成功导入 map-service。'
    : 'map-service 未能完成保存，请返回原页面查看原因后重试。'))
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000)
  try {
    const response = await waitForResponse(
      requestId,
      'COMPLETE_RESULT',
      options.timeoutMs || DEFAULT_COMPLETION_TIMEOUT_MS,
      targetDocument,
      {
        type: 'COMPLETE_2BULU_IMPORT',
        importSessionId,
        status,
        message,
      },
    )
    return {
      supported: true,
      ok: response.ok === true,
      code: String(response.code || ''),
      message: String(response.message || ''),
      sourceTabActivated: response.sourceTabActivated === true,
      helperTabClosed: response.helperTabClosed === true,
    }
  } catch (error) {
    return {
      supported: true,
      ok: false,
      code: String(error?.code || 'HELPER_COMPLETION_FAILED'),
      message: String(error?.message || '浏览器助手未能处理临时标签页'),
      sourceTabActivated: false,
      helperTabClosed: false,
    }
  }
}

export {
  CAPABILITY as TWO_BULU_HELPER_CAPABILITY,
  DEFAULT_COMPLETION_TIMEOUT_MS,
  DEFAULT_IMPORT_TIMEOUT_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
  MAX_KML_BYTES as TWO_BULU_HELPER_MAX_KML_BYTES,
  PROTOCOL_VERSION as TWO_BULU_HELPER_PROTOCOL_VERSION,
  TAB_LIFECYCLE_CAPABILITY as TWO_BULU_TAB_LIFECYCLE_CAPABILITY,
}
