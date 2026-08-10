import {
  DEFAULT_ALLOWED_ORIGINS,
  HELPER_CAPABILITY,
  PROTOCOL_VERSION,
  TWO_BULU_PAGE_HOSTS,
  helperError,
  isKmlText,
  normalizeAllowedOrigin,
  normalizeOfficialDownloadUrl,
  normalizeTwoBuluShareUrl,
  originMatchPattern,
} from './protocol.js'
import {
  IMPORT_SESSIONS_KEY,
  canAutoCloseImportHelperTab,
  canControlImportHelperTab,
  canFinalizeImportTabSession,
  canUserCloseImportHelperTab,
  createImportTabSession,
  isImportSessionId,
  normalizeImportTabSessions,
  sanitizeImportFeedbackText,
} from './import-tab-session.js'

const BRIDGE_REGISTRATION_PREFIX = 'map-service-origin-'
const HELPER_TAB_KEY = 'twoBuluHelperTabId'
const DEFAULT_ORIGINS_VERSION = 2
const MAX_KML_BYTES = 10 * 1024 * 1024
const PAGE_HOSTS = new Set(TWO_BULU_PAGE_HOSTS)
const TAB_LIFECYCLE_CAPABILITY = '2bulu-import-tab-lifecycle'

function uniqueStrings (values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))]
}

function createImportSessionId () {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `import-${randomPart}`
}

async function readImportSessions () {
  const stored = await chrome.storage.session.get(IMPORT_SESSIONS_KEY)
  const raw = stored[IMPORT_SESSIONS_KEY]
  const normalized = normalizeImportTabSessions(raw)
  if (Object.keys(normalized).length !== Object.keys(raw && typeof raw === 'object' ? raw : {}).length) {
    await chrome.storage.session.set({ [IMPORT_SESSIONS_KEY]: normalized })
  }
  return normalized
}

async function writeImportSession (session) {
  const sessions = await readImportSessions()
  sessions[session.sessionId] = session
  await chrome.storage.session.set({ [IMPORT_SESSIONS_KEY]: sessions })
  return session
}

async function updateImportSession (sessionId, changes = {}) {
  const sessions = await readImportSessions()
  const current = sessions[sessionId]
  if (!current) return null
  const next = { ...current, ...changes, sessionId: current.sessionId, updatedAt: Date.now() }
  sessions[sessionId] = next
  await chrome.storage.session.set({ [IMPORT_SESSIONS_KEY]: sessions })
  return next
}

async function removeImportSession (sessionId) {
  const sessions = await readImportSessions()
  if (!sessions[sessionId]) return false
  delete sessions[sessionId]
  await chrome.storage.session.set({ [IMPORT_SESSIONS_KEY]: sessions })
  return true
}

async function findImportSession (sessionId) {
  if (!isImportSessionId(sessionId)) return null
  const sessions = await readImportSessions()
  return sessions[sessionId] || null
}

async function getAllowedOrigins () {
  const stored = await chrome.storage.local.get('allowedOrigins')
  const source = Array.isArray(stored.allowedOrigins) ? stored.allowedOrigins : DEFAULT_ALLOWED_ORIGINS
  return uniqueStrings(source).flatMap((value) => {
    try {
      return [normalizeAllowedOrigin(value)]
    } catch {
      return []
    }
  })
}

function isStaticLocalOrigin (origin) {
  try {
    const parsed = new URL(origin)
    return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)
  } catch {
    return false
  }
}

async function syncBridgeRegistrations () {
  const registrations = await chrome.scripting.getRegisteredContentScripts()
  const dynamicIds = registrations
    .map(item => item.id)
    .filter(id => id.startsWith(BRIDGE_REGISTRATION_PREFIX))
  if (dynamicIds.length) await chrome.scripting.unregisterContentScripts({ ids: dynamicIds })

  const allowedOrigins = await getAllowedOrigins()
  const patterns = uniqueStrings(allowedOrigins
    .filter(origin => !isStaticLocalOrigin(origin))
    .map(origin => originMatchPattern(origin)))
  let index = 0
  for (const pattern of patterns) {
    const granted = await chrome.permissions.contains({ origins: [pattern] })
    if (!granted) continue
    index += 1
    await chrome.scripting.registerContentScripts([{
      id: `${BRIDGE_REGISTRATION_PREFIX}${index}`,
      matches: [pattern],
      js: ['map-service-bridge.js'],
      runAt: 'document_start',
      persistAcrossSessions: true,
    }])
  }
}

async function initializeStorage () {
  const stored = await chrome.storage.local.get(['allowedOrigins', 'defaultOriginsVersion'])
  if (!Array.isArray(stored.allowedOrigins)) {
    await chrome.storage.local.set({
      allowedOrigins: [...DEFAULT_ALLOWED_ORIGINS],
      defaultOriginsVersion: DEFAULT_ORIGINS_VERSION,
    })
  } else if (Number(stored.defaultOriginsVersion || 0) < DEFAULT_ORIGINS_VERSION) {
    const merged = uniqueStrings([...DEFAULT_ALLOWED_ORIGINS, ...stored.allowedOrigins])
    await chrome.storage.local.set({
      allowedOrigins: merged,
      defaultOriginsVersion: DEFAULT_ORIGINS_VERSION,
    })
  }
  await syncBridgeRegistrations()
}

function senderOrigin (sender) {
  try {
    return new URL(sender?.tab?.url || sender?.url || '').origin
  } catch {
    return ''
  }
}

async function assertMapServiceSender (sender) {
  const origin = senderOrigin(sender)
  const allowedOrigins = await getAllowedOrigins()
  if (!origin || !allowedOrigins.includes(origin)) {
    const error = new Error('当前 map-service 站点尚未在扩展中授权')
    error.code = 'HELPER_ORIGIN_NOT_AUTHORIZED'
    throw error
  }
}

function assertTwoBuluSender (sender) {
  let parsed
  try {
    parsed = new URL(sender?.tab?.url || '')
  } catch {
    throw new Error('无法确认两步路页面来源')
  }
  if (parsed.protocol !== 'https:' || !PAGE_HOSTS.has(parsed.hostname.toLowerCase()) || parsed.port) {
    throw new Error('只允许两步路官方页面调用下载读取能力')
  }
}

function waitForTabReady (tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let timer
    const cleanup = () => {
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      chrome.tabs.onRemoved.removeListener(onRemoved)
    }
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete') return
      cleanup()
      resolve()
    }
    const onRemoved = removedTabId => {
      if (removedTabId !== tabId) return
      cleanup()
      const error = new Error('用户关闭了两步路页面')
      error.code = 'USER_CANCELLED'
      reject(error)
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs.onRemoved.addListener(onRemoved)
    timer = setTimeout(() => {
      cleanup()
      const error = new Error('等待两步路页面加载超时')
      error.code = 'TWO_BULU_TIMEOUT'
      reject(error)
    }, timeoutMs)
    chrome.tabs.get(tabId).then(tab => {
      if (tab?.status === 'complete') {
        cleanup()
        resolve()
      }
    }).catch(() => {})
  })
}

async function getReusableHelperTab () {
  const stored = await chrome.storage.session.get(HELPER_TAB_KEY)
  const tabId = Number(stored[HELPER_TAB_KEY])
  if (!Number.isSafeInteger(tabId)) return null
  try {
    const tab = await chrome.tabs.get(tabId)
    const parsed = new URL(tab.url || '')
    if (parsed.protocol === 'https:' && PAGE_HOSTS.has(parsed.hostname.toLowerCase())) return tab
  } catch {}
  await chrome.storage.session.remove(HELPER_TAB_KEY)
  return null
}

async function focusTab (tabId) {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true })
    if (Number.isSafeInteger(tab?.windowId) && chrome.windows?.update) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {})
    }
    return tab
  } catch {
    return null
  }
}

async function openHelperTab (url, sourceTab) {
  const existing = await getReusableHelperTab()
  const createOptions = { url, active: true }
  if (Number.isSafeInteger(sourceTab?.windowId)) createOptions.windowId = sourceTab.windowId
  if (Number.isSafeInteger(sourceTab?.id)) createOptions.openerTabId = sourceTab.id
  const created = !existing
  const tab = existing
    ? await chrome.tabs.update(existing.id, { url, active: true })
    : await chrome.tabs.create(createOptions)
  await chrome.storage.session.set({ [HELPER_TAB_KEY]: tab.id })
  if (existing) await focusTab(tab.id)
  await waitForTabReady(tab.id)
  return { tab: await chrome.tabs.get(tab.id), created, managed: true }
}

async function notifyImportTab (session, payload = {}) {
  if (!session?.helperTabId) return false
  try {
    await chrome.tabs.sendMessage(session.helperTabId, {
      channel: 'map-service-two-bulu-helper',
      action: 'SHOW_IMPORT_STATUS',
      sessionId: session.sessionId,
      status: ['working', 'success', 'failed', 'needs-user-action'].includes(payload.status) ? payload.status : 'failed',
      title: sanitizeImportFeedbackText(payload.title, '两步路导入助手', 80),
      message: sanitizeImportFeedbackText(payload.message, '导入状态已更新。'),
      canReturn: payload.canReturn !== false,
      canClose: session.managedHelperTab === true,
    })
    return true
  } catch {
    return false
  }
}

async function getSourceTab (session) {
  try {
    return await chrome.tabs.get(session.sourceTabId)
  } catch {
    return null
  }
}

async function activateSourceTab (session) {
  const sourceTab = await getSourceTab(session)
  if (!sourceTab) return false
  return Boolean(await focusTab(sourceTab.id))
}

async function clearManagedHelperTabKey (tabId) {
  const stored = await chrome.storage.session.get(HELPER_TAB_KEY)
  if (Number(stored[HELPER_TAB_KEY]) === Number(tabId)) {
    await chrome.storage.session.remove(HELPER_TAB_KEY)
  }
}

async function collectFromTab (tabId, payload) {
  let runtimeResult
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        files: ['two-bulu-data.js', 'two-bulu-page-export.js'],
      })
      const executed = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: async options => globalThis.MapServiceTwoBuluPageExport?.collect(options) || {
          status: 'unsupported',
          code: 'TWO_BULU_PAGE_DATA_NOT_RECOGNIZED',
          message: '页面导出脚本未返回可转换的轨迹数据。',
        },
        args: [{ partialPolicy: payload.partialPolicy === 'allow-track-only' ? 'allow-track-only' : 'reject' }],
      })
      runtimeResult = executed?.[0]?.result
      if (runtimeResult?.status === 'success') return runtimeResult
    } catch {}
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
  }

  let lastError
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const contentResult = await chrome.tabs.sendMessage(tabId, {
        channel: 'map-service-two-bulu-helper',
        action: 'COLLECT_TWO_BULU_KML',
        ...payload,
      })
      if (contentResult?.status === 'success') return contentResult
      if (contentResult?.status && !['TWO_BULU_KML_NOT_FOUND', 'TWO_BULU_PAGE_DATA_NOT_RECOGNIZED'].includes(contentResult.code)) return contentResult
      if (runtimeResult?.status) return runtimeResult
      return contentResult || null
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
  if (runtimeResult?.status) return runtimeResult
  throw lastError || new Error('无法连接两步路页面，请刷新后重试')
}

function importFailureFeedback (result) {
  const needsUserAction = result?.status === 'needs-user-action'
  return {
    status: needsUserAction ? 'needs-user-action' : 'failed',
    title: needsUserAction ? '需要你在两步路完成操作' : '两步路轨迹读取失败',
    message: result?.message || '两步路页面没有返回可转换的轨迹数据，请返回 map-service 后重试。',
  }
}

async function failImportSession (session, result) {
  const normalized = {
    status: result?.status || 'failed',
    code: result?.code || 'TWO_BULU_PAGE_DATA_NOT_RECOGNIZED',
    message: result?.message || '两步路页面没有返回可转换的轨迹数据。',
    importSessionId: session.sessionId,
  }
  const updated = await updateImportSession(session.sessionId, { status: 'failed' }) || session
  await notifyImportTab(updated, importFailureFeedback(normalized))
  return normalized
}

async function importTwoBuluKml (message, sender) {
  await assertMapServiceSender(sender)
  const normalized = normalizeTwoBuluShareUrl(message.url)
  const helper = await openHelperTab(normalized.canonicalUrl, sender.tab)
  const session = createImportTabSession({
    sessionId: createImportSessionId(),
    sourceTab: sender.tab,
    helperTab: helper.tab,
    canonicalUrl: normalized.canonicalUrl,
    managedHelperTab: helper.managed,
    helperTabCreatedForRequest: helper.created,
  })
  await writeImportSession(session)
  await notifyImportTab(session, {
    status: 'working',
    title: '正在读取两步路轨迹',
    message: '请保持此页面打开。轨迹读取完成后，map-service 会继续保存并自动返回原页面。',
  })

  let result
  try {
    result = await collectFromTab(helper.tab.id, {
      requestId: String(message.requestId || ''),
      sourceUrl: normalized.canonicalUrl,
      trackId: normalized.trackId,
      partialPolicy: message.partialPolicy === 'allow-track-only' ? 'allow-track-only' : 'reject',
    })
  } catch (error) {
    await failImportSession(session, {
      status: error?.code === 'USER_CANCELLED' ? 'cancelled' : 'failed',
      code: error?.code || 'TWO_BULU_FETCH_FAILED',
      message: error?.message || '读取两步路轨迹失败，请稍后重试。',
    })
    throw error
  }
  if (!result || typeof result !== 'object') {
    return failImportSession(session, helperError('两步路页面没有返回可用轨迹数据，请等待页面完整显示后重试。', 'TWO_BULU_PAGE_DATA_NOT_RECOGNIZED', 'unsupported'))
  }
  if (result.status !== 'success') {
    return failImportSession(session, {
      status: result.status || 'failed',
      code: result.code || 'TWO_BULU_PAGE_DATA_NOT_RECOGNIZED',
      message: result.message || '两步路页面没有返回可转换的轨迹数据。',
    })
  }
  if (!isKmlText(result.kmlText)) {
    return failImportSession(session, helperError('页面轨迹数据未能组装成标准 KML，请等待页面完整显示后重试。', 'TWO_BULU_DATA_CONVERT_FAILED', 'failed'))
  }
  const byteSize = new TextEncoder().encode(result.kmlText).byteLength
  if (byteSize > MAX_KML_BYTES) {
    return failImportSession(session, helperError('两步路 KML 超过 10 MiB，无法通过浏览器助手导入。', 'FILE_TOO_LARGE'))
  }
  if (!await getSourceTab(session)) {
    return failImportSession(session, helperError('原 map-service 页面已关闭，无法继续保存；请重新打开网站后发起导入。', 'SOURCE_TAB_CLOSED', 'cancelled'))
  }
  const awaitingSave = await updateImportSession(session.sessionId, { status: 'awaiting-save' }) || session
  await notifyImportTab(awaitingSave, {
    status: 'working',
    title: '轨迹读取完成',
    message: '正在等待 map-service 完成保存。保存成功后将自动关闭此页并返回原页面。',
  })
  return {
    status: 'success',
    importSessionId: session.sessionId,
    tabLifecycle: helper.created ? 'created' : 'managed-reused',
    sourceUrl: normalized.canonicalUrl,
    name: String(result.name || '').slice(0, 200),
    kmlText: result.kmlText,
    sourceMode: result.sourceMode === 'rendered-data' ? 'rendered-data' : 'official-kml',
    completeness: result.completeness === 'track-only' ? 'track-only' : 'full',
    warnings: Array.isArray(result.warnings) ? result.warnings.map(value => String(value).slice(0, 300)).slice(0, 10) : [],
  }
}

async function finalizeTwoBuluImport (message, sender) {
  await assertMapServiceSender(sender)
  const session = await findImportSession(String(message.importSessionId || ''))
  if (!session) return { ok: false, code: 'IMPORT_SESSION_NOT_FOUND', message: '两步路导入标签页会话已失效' }
  if (!canFinalizeImportTabSession(session, sender.tab)) {
    return { ok: false, code: 'IMPORT_SESSION_MISMATCH', message: '当前页面不能结束这次两步路导入' }
  }

  const succeeded = message.status === 'success'
  if (succeeded && !['awaiting-save', 'completed'].includes(session.status)) {
    return { ok: false, code: 'IMPORT_SESSION_NOT_READY', message: '两步路轨迹尚未完成读取，不能结束导入' }
  }
  const sourceTab = await getSourceTab(session)
  const updated = await updateImportSession(session.sessionId, { status: succeeded ? 'completed' : 'failed' }) || session
  const feedbackMessage = sanitizeImportFeedbackText(
    message.message,
    succeeded ? 'KML 已成功导入 map-service。' : 'map-service 未能完成保存，请返回原页面查看原因后重试。'
  )

  await notifyImportTab(updated, {
    status: succeeded ? 'success' : 'failed',
    title: succeeded ? 'KML 导入成功' : 'KML 保存失败',
    message: sourceTab ? feedbackMessage : `${feedbackMessage} 原 map-service 页面已关闭，无法自动返回。`,
    canReturn: Boolean(sourceTab),
  })

  if (!succeeded) return { ok: true, sourceTabActivated: false, helperTabClosed: false }

  const sourceTabActivated = await activateSourceTab(updated)
  let helperTab = null
  try {
    helperTab = await chrome.tabs.get(updated.helperTabId)
  } catch {}
  if (!sourceTabActivated || !canAutoCloseImportHelperTab(updated, helperTab)) {
    return { ok: true, sourceTabActivated, helperTabClosed: false }
  }

  try {
    await clearManagedHelperTabKey(updated.helperTabId)
    await removeImportSession(updated.sessionId)
    await chrome.tabs.remove(updated.helperTabId)
    return { ok: true, sourceTabActivated, helperTabClosed: true }
  } catch {
    return { ok: true, sourceTabActivated, helperTabClosed: false }
  }
}

async function handleImportTabAction (message, sender) {
  assertTwoBuluSender(sender)
  const session = await findImportSession(String(message.importSessionId || ''))
  if (!session || !canControlImportHelperTab(session, sender.tab)) {
    return { ok: false, code: 'IMPORT_SESSION_MISMATCH', message: '当前页面不属于这次导入' }
  }
  if (message.intent === 'return') {
    const sourceTabActivated = await activateSourceTab(session)
    return {
      ok: sourceTabActivated,
      sourceTabActivated,
      code: sourceTabActivated ? '' : 'SOURCE_TAB_NOT_FOUND',
      message: sourceTabActivated ? '' : '原 map-service 页面已关闭，请手动重新打开。',
    }
  }
  if (message.intent !== 'close' || !canUserCloseImportHelperTab(session, sender.tab)) {
    return { ok: false, code: 'IMPORT_TAB_ACTION_INVALID', message: '无法执行该标签页操作' }
  }
  await activateSourceTab(session)
  await clearManagedHelperTabKey(session.helperTabId)
  await removeImportSession(session.sessionId)
  await chrome.tabs.remove(session.helperTabId)
  return { ok: true, helperTabClosed: true }
}

async function fetchOfficialKml (message, sender) {
  assertTwoBuluSender(sender)
  const url = normalizeOfficialDownloadUrl(message.url, sender.tab.url)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    })
    normalizeOfficialDownloadUrl(response.url || url, url)
    const declaredSize = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredSize) && declaredSize > MAX_KML_BYTES) {
      return { ok: false, code: 'FILE_TOO_LARGE', message: '两步路 KML 超过 10 MiB' }
    }
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_KML_BYTES) {
      return { ok: false, code: 'FILE_TOO_LARGE', message: '两步路 KML 超过 10 MiB' }
    }
    const text = new TextDecoder().decode(buffer)
    return {
      ok: response.ok,
      statusCode: response.status,
      text,
    }
  } catch (error) {
    return {
      ok: false,
      code: error?.name === 'AbortError' ? 'TWO_BULU_TIMEOUT' : 'TWO_BULU_FETCH_FAILED',
      message: error?.name === 'AbortError' ? '读取两步路 KML 超时' : '读取两步路 KML 失败',
    }
  } finally {
    clearTimeout(timer)
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.channel !== 'map-service-two-bulu-helper') return false
  let operation
  if (message.action === 'IMPORT_2BULU_KML') operation = importTwoBuluKml(message, sender)
  else if (message.action === 'FINALIZE_2BULU_IMPORT') operation = finalizeTwoBuluImport(message, sender)
  else if (message.action === 'IMPORT_TAB_ACTION') operation = handleImportTabAction(message, sender)
  else if (message.action === 'FETCH_OFFICIAL_KML') operation = fetchOfficialKml(message, sender)
  else if (message.action === 'SYNC_ALLOWED_ORIGINS') operation = syncBridgeRegistrations().then(() => ({ ok: true }))
  else return false

  Promise.resolve(operation).then(sendResponse).catch((error) => {
    sendResponse(helperError(
      error?.message || '浏览器助手执行失败',
      error?.code || 'HELPER_FAILED',
      error?.code === 'USER_CANCELLED' ? 'cancelled' : 'failed'
    ))
  })
  return true
})

chrome.tabs.onRemoved.addListener((tabId) => {
  Promise.resolve().then(async () => {
    await clearManagedHelperTabKey(tabId)
    const sessions = await readImportSessions()
    const retained = {}
    const sourceClosed = []
    Object.values(sessions).forEach((session) => {
      if (session.helperTabId === tabId) return
      if (session.sourceTabId === tabId) {
        const updated = { ...session, status: 'failed', updatedAt: Date.now() }
        retained[updated.sessionId] = updated
        sourceClosed.push(updated)
        return
      }
      retained[session.sessionId] = session
    })
    if (sourceClosed.length || Object.keys(retained).length !== Object.keys(sessions).length) {
      await chrome.storage.session.set({ [IMPORT_SESSIONS_KEY]: retained })
    }
    await Promise.all(sourceClosed.map(session => notifyImportTab(session, {
      status: 'failed',
      title: '原 map-service 页面已关闭',
      message: '无法继续自动保存或返回。你可以关闭此页，然后重新打开 map-service 发起导入。',
      canReturn: false,
    })))
  }).catch(() => {})
})

chrome.runtime.onInstalled.addListener(() => {
  initializeStorage().catch(() => {})
})

chrome.runtime.onStartup.addListener(() => {
  initializeStorage().catch(() => {})
})

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage().catch(() => {})
})

initializeStorage().catch(() => {})

export {
  HELPER_CAPABILITY,
  PROTOCOL_VERSION,
  TAB_LIFECYCLE_CAPABILITY,
  finalizeTwoBuluImport,
  handleImportTabAction,
}
