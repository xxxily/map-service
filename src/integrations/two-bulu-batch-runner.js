import { filterAndSortTwoBuluItems } from './two-bulu-batch.js'

const BATCH_STOP_ERROR_CODES = new Set([
  'USER_CANCELLED',
  'HELPER_NOT_INSTALLED',
  'HELPER_UNAVAILABLE',
  'HELPER_TIMEOUT',
  'TWO_BULU_TIMEOUT',
  'TWO_BULU_LOGIN_REQUIRED',
  'TWO_BULU_UPSTREAM_BLOCKED',
  'AUTH_REQUIRED',
  'CSRF_INVALID',
  'PERMISSION_DENIED',
  'QUOTA_EXCEEDED',
  'KML_QUOTA_EXCEEDED',
  'KML_DIRECTORY_NOT_FOUND',
  'KML_DIRECTORY_LIMIT_EXCEEDED',
])

export function shouldStopTwoBuluBatch (error) {
  return BATCH_STOP_ERROR_CODES.has(String(error?.code || ''))
}

export async function runTwoBuluBatchImport (options = {}) {
  const items = filterAndSortTwoBuluItems(options.items, options.filters)
  const results = []
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    options.onProgress?.({ index, total: items.length, item })
    try {
      const result = await options.importItem(item, { index, total: items.length })
      results.push({ status: 'success', item, result })
    } catch (error) {
      const status = error?.code === 'USER_CANCELLED' ? 'cancelled' : 'failed'
      results.push({ status, item, error })
      const decision = await options.onError?.(error, { index, total: items.length, item })
      if (decision === 'stop' || (decision === undefined && shouldStopTwoBuluBatch(error))) {
        for (let rest = index + 1; rest < items.length; rest += 1) {
          results.push({ status: 'cancelled', item: items[rest] })
        }
        break
      }
    }
  }
  return { items, results }
}
