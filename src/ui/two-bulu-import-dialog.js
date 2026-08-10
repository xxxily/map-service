import { showEditDialog } from './dialog.js'

const DEFAULT_COORD_CORRECTION = 'wgs84-to-gcj02'
const DEFAULT_PARTIAL_POLICY = 'reject'
const RETRY_STORAGE_KEY = 'map_2bulu_import_retry_requests'
const MAX_RETRY_INTENTS = 10
let memoryRetryEntries = {}

export function createTwoBuluImportRequestId () {
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `2bulu-${randomPart}`
}

function importIntentKey (input) {
  return JSON.stringify([
    String(input?.url || '').trim(),
    input?.coordCorrection || DEFAULT_COORD_CORRECTION,
    input?.partialPolicy || DEFAULT_PARTIAL_POLICY,
  ])
}

function resolveRetryStorage (storage) {
  if (storage !== undefined) return storage
  try {
    return globalThis.sessionStorage || null
  } catch {
    return null
  }
}

function readRetryEntries (storage) {
  if (!storage) return { ...memoryRetryEntries }
  try {
    const raw = storage.getItem(RETRY_STORAGE_KEY)
    if (!raw) return { ...memoryRetryEntries }
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return { ...memoryRetryEntries }
  }
}

function writeRetryEntries (storage, entries) {
  memoryRetryEntries = { ...entries }
  if (!storage) return
  try {
    storage.setItem(RETRY_STORAGE_KEY, JSON.stringify(entries))
  } catch {}
}

export function prepareTwoBuluImportRequest (input, options = {}) {
  const normalized = {
    url: String(input?.url || '').trim(),
    coordCorrection: input?.coordCorrection || DEFAULT_COORD_CORRECTION,
    partialPolicy: input?.partialPolicy || DEFAULT_PARTIAL_POLICY,
  }
  const storage = resolveRetryStorage(options.storage)
  const entries = readRetryEntries(storage)
  const key = importIntentKey(normalized)
  const existingRequestId = String(entries[key]?.requestId || '')
  const requestId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(existingRequestId)
    ? existingRequestId
    : createTwoBuluImportRequestId()
  entries[key] = { requestId, updatedAt: Date.now() }
  const retained = Object.fromEntries(Object.entries(entries)
    .sort(([, left], [, right]) => Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0))
    .slice(0, MAX_RETRY_INTENTS))
  writeRetryEntries(storage, retained)
  return { ...normalized, requestId }
}

export function clearTwoBuluImportRequest (input, options = {}) {
  const storage = resolveRetryStorage(options.storage)
  const entries = readRetryEntries(storage)
  const key = importIntentKey(input)
  if (!entries[key]) return false
  if (input?.requestId && entries[key].requestId !== input.requestId) return false
  delete entries[key]
  writeRetryEntries(storage, entries)
  return true
}

export async function showTwoBuluImportDialog (options = {}) {
  const values = await showEditDialog({
    title: options.title || '从两步路公开链接导入',
    fields: [
      { name: 'url', label: '两步路公开分享链接' },
      {
        name: 'coordCorrection',
        label: '坐标纠偏',
        type: 'select',
        options: [
          { label: 'WGS84 转 GCJ-02（高德底图推荐）', value: DEFAULT_COORD_CORRECTION },
          { label: '不纠偏', value: 'none' },
        ],
      },
      {
        name: 'partialPolicy',
        label: '数据不完整时',
        type: 'select',
        options: [
          { label: '必须包含可确认的完整公开数据', value: DEFAULT_PARTIAL_POLICY },
          { label: '允许仅导入公开轨迹线', value: 'allow-track-only' },
        ],
      },
    ],
    values: {
      url: '',
      coordCorrection: options.coordCorrection || DEFAULT_COORD_CORRECTION,
      partialPolicy: options.partialPolicy || DEFAULT_PARTIAL_POLICY,
    },
    confirmText: options.confirmText || '读取并导入',
  })

  if (!values) return null
  return prepareTwoBuluImportRequest({
    url: String(values.url || '').trim(),
    coordCorrection: values.coordCorrection || DEFAULT_COORD_CORRECTION,
    partialPolicy: values.partialPolicy || DEFAULT_PARTIAL_POLICY,
  })
}

export function twoBuluImportResultMessage (result) {
  const warnings = Array.isArray(result?.importSummary?.warnings)
    ? result.importSummary.warnings.filter(Boolean)
    : []
  const name = String(result?.name || '两步路轨迹')
  return warnings.length
    ? `${name} 已导入；${warnings.join('；')}`
    : `${name} 已导入`
}
