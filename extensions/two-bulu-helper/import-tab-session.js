import { TWO_BULU_PAGE_HOSTS } from './protocol.js'

export const IMPORT_SESSIONS_KEY = 'twoBuluImportSessions'
export const IMPORT_SESSION_MAX_AGE_MS = 30 * 60 * 1000

const IMPORT_SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/
const PAGE_HOSTS = new Set(TWO_BULU_PAGE_HOSTS)
const SESSION_STATUSES = new Set(['collecting', 'awaiting-save', 'failed', 'completed'])

function validTabId (value) {
  return Number.isSafeInteger(value) && value >= 0
}

function optionalTabId (value) {
  const numeric = typeof value === 'number' ? value : Number.NaN
  return validTabId(numeric) ? numeric : null
}

function supportedPageUrl (value) {
  try {
    const parsed = new URL(String(value || ''))
    return parsed.protocol === 'https:' &&
      PAGE_HOSTS.has(parsed.hostname.toLowerCase().replace(/\.$/, '')) &&
      !parsed.username && !parsed.password && !parsed.port
  } catch {
    return false
  }
}

export function isImportSessionId (value) {
  return IMPORT_SESSION_ID_PATTERN.test(String(value || ''))
}

export function createImportTabSession (input = {}) {
  const sessionId = String(input.sessionId || '')
  const sourceTabId = Number(input.sourceTab?.id)
  const helperTabId = Number(input.helperTab?.id)
  const canonicalUrl = String(input.canonicalUrl || '')
  if (!isImportSessionId(sessionId) || !validTabId(sourceTabId) || !validTabId(helperTabId) || !supportedPageUrl(canonicalUrl)) {
    throw new Error('两步路导入标签页会话参数不正确')
  }
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now()
  return {
    sessionId,
    sourceTabId,
    sourceWindowId: optionalTabId(input.sourceTab?.windowId),
    helperTabId,
    helperWindowId: optionalTabId(input.helperTab?.windowId),
    canonicalUrl,
    managedHelperTab: input.managedHelperTab === true,
    helperTabCreatedForRequest: input.helperTabCreatedForRequest === true,
    status: 'collecting',
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeImportTabSession (value, now) {
  if (!value || typeof value !== 'object' || !isImportSessionId(value.sessionId)) return null
  const sourceTabId = Number(value.sourceTabId)
  const helperTabId = Number(value.helperTabId)
  const createdAt = Number(value.createdAt)
  const updatedAt = Number(value.updatedAt)
  if (!validTabId(sourceTabId) || !validTabId(helperTabId) || !supportedPageUrl(value.canonicalUrl)) return null
  if (!Number.isFinite(createdAt) || !Number.isFinite(updatedAt) || now - updatedAt > IMPORT_SESSION_MAX_AGE_MS) return null
  return {
    sessionId: String(value.sessionId),
    sourceTabId,
    sourceWindowId: optionalTabId(value.sourceWindowId),
    helperTabId,
    helperWindowId: optionalTabId(value.helperWindowId),
    canonicalUrl: String(value.canonicalUrl),
    managedHelperTab: value.managedHelperTab === true,
    helperTabCreatedForRequest: value.helperTabCreatedForRequest === true,
    status: SESSION_STATUSES.has(value.status) ? value.status : 'collecting',
    createdAt,
    updatedAt,
  }
}

export function normalizeImportTabSessions (value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const normalized = {}
  Object.values(value).forEach((candidate) => {
    const session = normalizeImportTabSession(candidate, now)
    if (session) normalized[session.sessionId] = session
  })
  return normalized
}

export function canFinalizeImportTabSession (session, senderTab) {
  return Boolean(session && validTabId(Number(senderTab?.id)) && Number(senderTab.id) === session.sourceTabId)
}

export function canControlImportHelperTab (session, senderTab) {
  return Boolean(session && validTabId(Number(senderTab?.id)) && Number(senderTab.id) === session.helperTabId)
}

export function canAutoCloseImportHelperTab (session, helperTab) {
  return Boolean(
    session?.managedHelperTab === true &&
    canControlImportHelperTab(session, helperTab) &&
    helperTab?.pinned !== true &&
    supportedPageUrl(helperTab?.url)
  )
}

export function canUserCloseImportHelperTab (session, helperTab) {
  return Boolean(
    session?.managedHelperTab === true &&
    canControlImportHelperTab(session, helperTab) &&
    supportedPageUrl(helperTab?.url)
  )
}

export function sanitizeImportFeedbackText (value, fallback, maxLength = 500) {
  const text = String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
  return (text || fallback).slice(0, maxLength)
}
