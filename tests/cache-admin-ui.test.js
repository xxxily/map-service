import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderCachePage } from '../src/admin/pages/cache.js'

function baseState (overrides = {}) {
  return {
    cacheTab: 'overview',
    cacheLoading: false,
    cacheError: '',
    cache: {
      files: 12,
      bytes: 1024,
      sidecarBytes: 256,
      physicalBytes: 1280,
      fresh: 4,
      stale: 3,
      expired: 5,
      bySource: {
        'source-a': { files: 12, bytes: 1024, fresh: 4, stale: 3, expired: 5 },
      },
      index: { status: 'ready', ready: true, exact: true, entries: 12, coverage: 1, lastReconciledAt: Date.now() },
      activeJob: null,
    },
    cachePolicy: {
      softLimitBytes: null,
      hardLimitBytes: null,
      minFreeBytes: null,
      autoCleanupEnabled: false,
      autoCleanupIntervalMinutes: 360,
      expiredRetentionDays: 30,
      batchMaxFiles: 500,
      batchMaxBytes: 256 * 1024 * 1024,
      reconcileMinIntervalMinutes: 360,
      technicalLimits: { batchMaxFiles: 10000, batchMaxBytes: 4 * 1024 * 1024 * 1024, analysisSampleLimit: 50000 },
      suggestions: { softLimitBytes: 10 * 1024 * 1024 * 1024, hardLimitBytes: 12 * 1024 * 1024 * 1024, minFreeBytes: 2 * 1024 * 1024 * 1024 },
    },
    cacheKeyPolicies: {
      items: [{ sourceId: 'source-a', sourceName: 'Source A', mode: 'full_url', equivalentHosts: [], ignoredQueryParams: [], sensitiveQueryParams: [], sortQueryParams: true }],
      analyses: [],
    },
    cacheCleanupJobs: { items: [], page: 1, limit: 20, total: 0 },
    cacheCleanupPreview: null,
    cacheKeyAnalysis: null,
    cacheKeySourceId: 'source-a',
    cacheCleanupSourceId: '',
    tileSources: [],
    ...overrides,
  }
}

test('cache governance page uses four focused tabs and removes direct clear-all as the primary action', () => {
  const html = renderCachePage(baseState())
  assert.match(html, /概览/)
  assert.match(html, /清理策略/)
  assert.match(html, /URL 分析/)
  assert.match(html, /执行记录/)
  assert.match(html, /admin-settings-tabs admin-cache-tabs/)
  assert.match(html, /data-admin-action="cache-reconcile"/)
  assert.match(html, /估算物理占用/)
  assert.doesNotMatch(html, /清空全部缓存/)
})

test('capacity inputs show suggestions without a product maximum', () => {
  const html = renderCachePage(baseState({ cacheTab: 'cleanup' }))
  assert.match(html, /name="softLimitGiB"[^>]*placeholder="建议 10"/)
  assert.match(html, /name="hardLimitGiB"[^>]*placeholder="建议 12"/)
  assert.doesNotMatch(html, /name="softLimitGiB"[^>]*max=/)
  assert.doesNotMatch(html, /name="hardLimitGiB"[^>]*max=/)
  assert.match(html, /水位按正文与 Sidecar 的估算物理占用计算/)
  assert.match(html, /data-cache-cleanup-form/)
})

test('URL analysis is source-scoped and keeps full URL as an explicit option', () => {
  const html = renderCachePage(baseState({ cacheTab: 'url' }))
  assert.match(html, /data-cache-key-source/)
  assert.match(html, /Source A/)
  assert.match(html, /等价主机/)
  assert.match(html, /忽略参数/)
  assert.match(html, /保持完整 URL/)
  assert.match(html, /data-admin-action="cache-edit-key-policy"/)
})

test('cleanup history exposes cancellation only for cancellable jobs', () => {
  const html = renderCachePage(baseState({
    cacheTab: 'history',
    cacheCleanupJobs: {
      items: [
        { id: 'job-running', status: 'running', cancellable: true, filter: { sourceIds: ['source-a'], states: ['expired'] }, plannedFiles: 10, deletedFiles: 2, deletedBytes: 200, batches: 1, createdAt: Date.now() },
        { id: 'job-complete', status: 'completed', cancellable: false, filter: { sourceIds: [], states: ['expired'] }, plannedFiles: 4, deletedFiles: 4, deletedBytes: 400, batches: 1, createdAt: Date.now(), finishedAt: Date.now() },
      ],
      page: 1,
      limit: 20,
      total: 2,
    },
  }))
  assert.match(html, /data-job-id="job-running"/)
  assert.doesNotMatch(html, /data-job-id="job-complete"/)
})
