import { showAlert, showEditDialog } from './dialog.js'
import { normalizeTwoBuluBatchFilters } from '../integrations/two-bulu-batch.js'

const DEFAULT_COORD_CORRECTION = 'wgs84-to-gcj02'
const DEFAULT_PARTIAL_POLICY = 'reject'
const RETRY_STORAGE_KEY = 'map_2bulu_import_retry_requests'
const MAX_RETRY_INTENTS = 10
let memoryRetryEntries = {}

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function previewNumber (value, suffix = '') {
  if (value === null || value === undefined || String(value).trim() === '') return '未知'
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toLocaleString('zh-CN')}${suffix}` : '未知'
}

export function twoBuluBatchPreviewMessageHtml (preview = {}, selected = []) {
  const items = Array.isArray(selected) ? selected : []
  const userName = String(preview.userName || '两步路用户')
  const detectedCount = Number(preview.detectedCount || preview.items?.length || 0)
  const rows = items.map((item, index) => {
    const name = String(item?.name || `公开轨迹 ${index + 1}`).slice(0, 200)
    const publishedDate = item?.publishedAt ? new Date(item.publishedAt) : null
    const published = publishedDate && Number.isFinite(publishedDate.getTime())
      ? publishedDate.toISOString().slice(0, 10)
      : '发布时间未知'
    const stats = [
      `点位 ${previewNumber(item?.pointCount)}`,
      `里程 ${previewNumber(item?.distanceKm, ' km')}`,
      `点赞 ${previewNumber(item?.likeCount)}`,
      `收藏 ${previewNumber(item?.favoriteCount)}`,
      published,
    ].join(' · ')
    return `<li><strong>${escapeHtml(name)}</strong><span>${escapeHtml(stats)}</span></li>`
  }).join('')
  const warnings = Array.isArray(preview.warnings) ? preview.warnings.filter(Boolean).map(escapeHtml).join('；') : ''
  return `<div class="two-bulu-batch-preview-message"><p><strong>${escapeHtml(userName)}</strong>：识别 ${detectedCount} 条，筛选后将导入 ${items.length} 条。成功文件将放入同名目录。</p>${warnings ? `<p class="two-bulu-batch-preview-warning">${warnings}</p>` : ''}<ol>${rows}</ol></div>`
}

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

export async function showTwoBuluBatchImportDialog (options = {}) {
  const values = await showEditDialog({
    title: options.title || '从两步路用户轨迹列表批量导入',
    fields: [
      { name: 'url', label: '用户公开轨迹列表链接' },
      { name: 'pointCountMin', label: '点位数量最小值', required: false },
      { name: 'pointCountMax', label: '点位数量最大值', required: false },
      { name: 'dateFrom', label: '发布时间起始日期（YYYY-MM-DD）', required: false },
      { name: 'dateTo', label: '发布时间结束日期（YYYY-MM-DD）', required: false },
      { name: 'distanceKmMin', label: '轨迹里程最小值（km）', required: false },
      { name: 'distanceKmMax', label: '轨迹里程最大值（km）', required: false },
      { name: 'likeCountMin', label: '点赞数量最小值', required: false },
      { name: 'likeCountMax', label: '点赞数量最大值', required: false },
      { name: 'favoriteCountMin', label: '收藏数量最小值', required: false },
      { name: 'favoriteCountMax', label: '收藏数量最大值', required: false },
      {
        name: 'sort',
        label: '排序字段',
        type: 'select',
        options: [
          { label: '列表顺序', value: 'position' },
          { label: '发布时间', value: 'publishedAt' },
          { label: '轨迹里程', value: 'distanceKm' },
          { label: '点赞数量', value: 'likeCount' },
          { label: '收藏数量', value: 'favoriteCount' },
          { label: '点位数量', value: 'pointCount' },
        ],
      },
      {
        name: 'order',
        label: '排序方向',
        type: 'select',
        options: [{ label: '升序', value: 'asc' }, { label: '降序', value: 'desc' }],
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
      sort: options.sort || 'position',
      order: options.order || 'asc',
      partialPolicy: options.partialPolicy || DEFAULT_PARTIAL_POLICY,
    },
    confirmText: options.confirmText || '读取列表',
  })
  if (!values) return null
  try {
    normalizeTwoBuluBatchFilters(values)
  } catch (error) {
    await showAlert(error?.message || '批量筛选条件不正确。', { title: '筛选条件有误' })
    return null
  }
  return {
    ...values,
    url: String(values.url || '').trim(),
    coordCorrection: options.coordCorrection || DEFAULT_COORD_CORRECTION,
    partialPolicy: values.partialPolicy || DEFAULT_PARTIAL_POLICY,
  }
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
