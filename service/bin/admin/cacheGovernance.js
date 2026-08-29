import fs from 'fs-extra'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import CacheIndex from './cacheIndex.js'
import { createHttpError } from '../user/security.js'

const DAY_MS = 24 * 60 * 60 * 1000
const PREVIEW_TTL_MS = 15 * 60 * 1000
const ANALYSIS_TTL_MS = 24 * 60 * 60 * 1000
const DISK_SNAPSHOT_TTL_MS = 5 * 60 * 1000
const INDEX_FLUSH_DELAY_MS = 1000
const INDEX_FLUSH_BATCH_SIZE = 256
const RECONCILE_BATCH_SIZE = 512
const MIN_FORCE_RECONCILE_INTERVAL_MS = 5 * 60 * 1000
const DEFAULT_SENSITIVE_QUERY_KEYS = ['key', 'token', 'tk', 'appid', 'api_key', 'apikey', 'access_token', 'session']
const CACHE_META_SUFFIX = '.meta.json'
const CACHE_STATS_FILE = '.stats.json'
const MAX_BATCH_FILES = 10000
const MAX_BATCH_BYTES = 4 * 1024 * 1024 * 1024
const MAX_ANALYSIS_SAMPLE = 50000
const DEFAULT_POLICY = Object.freeze({
  softLimitBytes: null,
  hardLimitBytes: null,
  minFreeBytes: null,
  autoCleanupEnabled: false,
  autoCleanupIntervalMinutes: 360,
  expiredRetentionDays: 30,
  batchMaxFiles: 500,
  batchMaxBytes: 256 * 1024 * 1024,
  reconcileMinIntervalMinutes: 360,
})

function stableValue (value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key])
    return result
  }, {})
}

function hashValue (value) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

function md5 (value) {
  return createHash('md5').update(String(value)).digest('hex')
}

function jsonFileBytes (value) {
  return Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`)
}

function publicUrlShape (value) {
  try {
    const parsed = new URL(value)
    const parameterNames = [...new Set([...parsed.searchParams.keys()])].sort()
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return `${parsed.toString()}${parameterNames.length ? `?${parameterNames.join('&')}` : ''}`
  } catch (err) {
    return ''
  }
}

function publicCacheEntry (entry = {}) {
  return { ...entry, url: publicUrlShape(entry.url) }
}

function publicAnalysis (analysis = {}) {
  return {
    ...analysis,
    collisions: (analysis.collisions || []).map(item => ({
      ...item,
      canonicalUrl: publicUrlShape(item.canonicalUrl),
    })),
  }
}

function normalizeStringArray (value, field, limit = 64) {
  const values = [...new Set((Array.isArray(value) ? value : [])
    .map(item => String(item || '').trim())
    .filter(Boolean))]
  if (values.length > limit) {
    throw createHttpError(`${field}最多允许 ${limit} 项`, 400, 'INVALID_CACHE_POLICY')
  }
  return values
}

function optionalSafeInteger (value, field) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw createHttpError(`${field}必须是非负安全整数`, 400, 'INVALID_CACHE_POLICY')
  }
  return parsed
}

function positiveSafeInteger (value, field, fallback, options = {}) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < (options.min || 1)) {
    throw createHttpError(`${field}必须是不小于 ${options.min || 1} 的安全整数`, 400, 'INVALID_CACHE_POLICY')
  }
  if (options.max && parsed > options.max) {
    throw createHttpError(`${field}不能超过系统保护上限 ${options.max}`, 400, 'INVALID_CACHE_POLICY')
  }
  return parsed
}

function normalizeHost (value, field) {
  const host = String(value || '').trim().toLowerCase()
  if (!host) return ''
  if (host.length > 253 || !/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) {
    throw createHttpError(`${field}格式不正确`, 400, 'INVALID_CACHE_KEY_POLICY')
  }
  return host
}

function normalizeParamNames (value, field) {
  const names = normalizeStringArray(value, field, 64)
  names.forEach((name) => {
    if (name.length > 128 || /[&=#?\s]/.test(name)) {
      throw createHttpError(`${field}包含无效参数名`, 400, 'INVALID_CACHE_KEY_POLICY')
    }
  })
  return names
}

export function normalizeCacheGovernancePolicy (input = {}, current = DEFAULT_POLICY) {
  const result = {
    softLimitBytes: optionalSafeInteger(input.softLimitBytes ?? current.softLimitBytes, '缓存软水位'),
    hardLimitBytes: optionalSafeInteger(input.hardLimitBytes ?? current.hardLimitBytes, '缓存硬水位'),
    minFreeBytes: optionalSafeInteger(input.minFreeBytes ?? current.minFreeBytes, '最低磁盘可用空间'),
    autoCleanupEnabled: input.autoCleanupEnabled === undefined
      ? Boolean(current.autoCleanupEnabled)
      : input.autoCleanupEnabled === true,
    autoCleanupIntervalMinutes: positiveSafeInteger(
      input.autoCleanupIntervalMinutes,
      '自动治理周期',
      current.autoCleanupIntervalMinutes || DEFAULT_POLICY.autoCleanupIntervalMinutes,
      { min: 5 }
    ),
    expiredRetentionDays: positiveSafeInteger(
      input.expiredRetentionDays,
      '过期保留天数',
      current.expiredRetentionDays || DEFAULT_POLICY.expiredRetentionDays,
      { min: 1 }
    ),
    batchMaxFiles: positiveSafeInteger(
      input.batchMaxFiles,
      '单批最大文件数',
      current.batchMaxFiles || DEFAULT_POLICY.batchMaxFiles,
      { min: 1, max: MAX_BATCH_FILES }
    ),
    batchMaxBytes: positiveSafeInteger(
      input.batchMaxBytes,
      '单批最大字节数',
      current.batchMaxBytes || DEFAULT_POLICY.batchMaxBytes,
      { min: 1024, max: MAX_BATCH_BYTES }
    ),
    reconcileMinIntervalMinutes: positiveSafeInteger(
      input.reconcileMinIntervalMinutes,
      '索引校准冷却时间',
      current.reconcileMinIntervalMinutes || DEFAULT_POLICY.reconcileMinIntervalMinutes,
      { min: 5 }
    ),
  }
  if (result.softLimitBytes !== null && result.hardLimitBytes !== null && result.softLimitBytes > result.hardLimitBytes) {
    throw createHttpError('缓存软水位不能高于硬水位', 400, 'INVALID_CACHE_POLICY')
  }
  return result
}

export function normalizeCacheKeyRule (input = {}, current = {}) {
  const mode = input.mode || current.mode || 'full_url'
  if (!['full_url', 'normalized_v2'].includes(mode)) {
    throw createHttpError('URL 缓存键模式不受支持', 400, 'INVALID_CACHE_KEY_POLICY')
  }
  const canonicalHost = normalizeHost(input.canonicalHost ?? current.canonicalHost, '规范主机')
  const equivalentHosts = normalizeStringArray(
    input.equivalentHosts ?? current.equivalentHosts,
    '等价主机'
  ).map(host => normalizeHost(host, '等价主机'))
  if (canonicalHost && !equivalentHosts.includes(canonicalHost)) equivalentHosts.unshift(canonicalHost)
  return {
    mode,
    canonicalHost,
    equivalentHosts: [...new Set(equivalentHosts)],
    sortQueryParams: input.sortQueryParams === undefined
      ? current.sortQueryParams !== false
      : input.sortQueryParams === true,
    ignoredQueryParams: normalizeParamNames(
      input.ignoredQueryParams ?? current.ignoredQueryParams,
      '忽略参数'
    ),
    sensitiveQueryParams: normalizeParamNames(
      input.sensitiveQueryParams ?? current.sensitiveQueryParams,
      '敏感参数'
    ),
  }
}

export function canonicalizeCacheUrl (inputUrl, rule = {}) {
  const parsed = new URL(inputUrl)
  const host = parsed.hostname.toLowerCase()
  if (rule.canonicalHost && (host === rule.canonicalHost || rule.equivalentHosts?.includes(host))) {
    parsed.hostname = rule.canonicalHost
  }
  const ignored = new Set(rule.ignoredQueryParams || [])
  ;[...parsed.searchParams.keys()].forEach((key) => {
    if (ignored.has(key)) parsed.searchParams.delete(key)
  })
  if (rule.sortQueryParams !== false) parsed.searchParams.sort()
  parsed.hash = ''
  return parsed.toString()
}

function normalizeCleanupFilter (input = {}) {
  const states = normalizeStringArray(input.states, '缓存状态', 3)
  states.forEach((state) => {
    if (!['fresh', 'stale', 'expired'].includes(state)) {
      throw createHttpError('缓存状态不受支持', 400, 'INVALID_CACHE_FILTER')
    }
  })
  return {
    sourceIds: normalizeStringArray(input.sourceIds, '图源', 1000),
    resourceTypes: normalizeStringArray(input.resourceTypes, '资源类型', 64),
    states: states.length ? states : ['expired'],
    orphanedOnly: input.orphanedOnly === true,
    expiredBeforeDays: optionalSafeInteger(input.expiredBeforeDays, '失效天数') || 0,
    maxFiles: optionalSafeInteger(input.maxFiles, '最大文件数'),
    maxBytes: optionalSafeInteger(input.maxBytes, '最大字节数'),
  }
}

function publicJob (job) {
  if (!job) return null
  const { cancelRequested, actorUserId, context, ...safe } = job
  return { ...safe, cancellable: ['queued', 'running'].includes(job.status) }
}

export class CacheGovernanceService {
  constructor (options = {}) {
    this.store = options.store
    this.fetchRelay = options.fetchRelay
    this.tileCatalogManager = options.tileCatalogManager
    this.userSystem = options.userSystem
    this.cacheDir = this.fetchRelay.config.cacheDir
    this.index = options.index || new CacheIndex({
      filePath: options.indexPath || path.join(this.store.dataDir, 'cache-index.sqlite'),
    })
    this.policy = { ...DEFAULT_POLICY }
    this.keyPolicies = {}
    this.analyses = []
    this.jobs = []
    this.previews = new Map()
    this.readyPromise = null
    this.reconcilePromise = null
    this.analysisRunning = false
    this.runningCleanupPromise = null
    this.autoTimer = null
    this.autoCleanupScheduled = false
    this.diskSnapshot = null
    this.diskSnapshotPromise = null
    this.diskRefreshTimer = null
    this.reservations = new Map()
    this.reservedBytes = 0
    this.pendingIndexUpserts = new Map()
    this.incrementalDirtyOwned = false
    this.indexMutationEpoch = 0
    this.indexFlushTimer = null
    this.indexFlushPromise = null
    this.usage = { bodyBytes: 0, sidecarBytes: 0, physicalBytes: 0, ready: false }
    this.fetchRelay.setCacheObserver?.({
      shouldPersist: payload => this.shouldPersist(payload),
      reservePersist: payload => this.reservePersist(payload),
      confirmPersist: payload => this.confirmPersist(payload),
      releasePersist: payload => this.releasePersist(payload),
      onUpsert: payload => this.onCacheUpsert(payload),
      onDelete: payload => this.onCacheDelete(payload),
      onClear: () => this.onCacheClear(),
      findLegacyEntry: payload => this.findLegacyEntry(payload),
    })
  }

  async ready () {
    if (this.readyPromise) return this.readyPromise
    this.readyPromise = (async () => {
      const [policy, keyPolicies, analyses, jobs] = await Promise.all([
        this.store.read('cache-governance-policy', DEFAULT_POLICY),
        this.store.read('cache-key-policies', {}),
        this.store.read('cache-key-analyses', []),
        this.store.read('cache-governance-jobs', []),
      ])
      this.policy = normalizeCacheGovernancePolicy(policy || {}, DEFAULT_POLICY)
      this.keyPolicies = keyPolicies && typeof keyPolicies === 'object' ? keyPolicies : {}
      this.analyses = Array.isArray(analyses) ? analyses.slice(0, 50) : []
      this.jobs = Array.isArray(jobs) ? jobs.slice(0, 100).map(job => (
        ['queued', 'running'].includes(job.status)
          ? { ...job, status: 'interrupted', finishedAt: Date.now(), error: '服务重启，任务已中断' }
          : job
      )) : []
      const indexStatus = this.index.getStatus()
      this.usage = {
        bodyBytes: indexStatus.bodyBytes,
        sidecarBytes: indexStatus.sidecarBytes,
        physicalBytes: indexStatus.estimatedPhysicalBytes,
        ready: indexStatus.exact,
      }
      await this.persistJobs()
      if (this.policy.minFreeBytes !== null) await this.refreshDiskSnapshot()
      this.scheduleAutoTimer()
      this.scheduleDiskRefresh()
      return this
    })()
    return this.readyPromise
  }

  audit (actor, action, targetType, targetId, metadata = {}, context = {}, result = 'success') {
    this.userSystem?.insertAudit?.({
      actorUserId: actor?.user?.id || null,
      action,
      targetType,
      targetId,
      result,
      metadata,
      ipSummary: context?.ip,
    })
  }

  async persistJobs () {
    await this.store.write('cache-governance-jobs', this.jobs.slice(0, 100).map(publicJob))
  }

  async getOverview () {
    await this.ready()
    await Promise.all([
      this.flushPendingIndexWrites(),
      this.refreshDiskSnapshot(),
    ])
    const indexStatus = this.index.getStatus()
    const overview = indexStatus.exact
      ? this.index.getOverview()
      : { ...(await this.fetchRelay.getStats()), index: indexStatus }
    return {
      ...overview,
      entries: (overview.entries || []).map(publicCacheEntry),
      cacheDir: this.cacheDir,
      index: this.index.getStatus(),
      activeJob: publicJob(this.jobs.find(job => ['queued', 'running'].includes(job.status))),
      disk: this.diskSnapshot,
    }
  }

  async getPolicy () {
    await this.ready()
    await this.refreshDiskSnapshot()
    return {
      ...this.policy,
      technicalLimits: {
        batchMaxFiles: MAX_BATCH_FILES,
        batchMaxBytes: MAX_BATCH_BYTES,
        analysisSampleLimit: MAX_ANALYSIS_SAMPLE,
      },
      suggestions: {
        softLimitBytes: 10 * 1024 * 1024 * 1024,
        hardLimitBytes: 12 * 1024 * 1024 * 1024,
        minFreeBytes: 2 * 1024 * 1024 * 1024,
      },
      disk: this.diskSnapshot,
    }
  }

  async updatePolicy (actor, input, context = {}) {
    await this.ready()
    const previous = this.policy
    this.policy = normalizeCacheGovernancePolicy(input || {}, previous)
    await this.store.write('cache-governance-policy', this.policy)
    this.scheduleAutoTimer()
    this.scheduleDiskRefresh()
    this.audit(actor, 'admin.cache.policy.update', 'cache-policy', 'global', {
      previous,
      next: this.policy,
    }, context)
    return this.getPolicy()
  }

  async refreshDiskSnapshot (force = false) {
    if (!force && this.diskSnapshot && Date.now() - this.diskSnapshot.checkedAt < DISK_SNAPSHOT_TTL_MS) {
      return this.diskSnapshot
    }
    if (this.diskSnapshotPromise) return this.diskSnapshotPromise
    this.diskSnapshotPromise = (async () => {
      try {
        const stats = await fs.statfs(this.cacheDir)
        const blockSize = Number(stats.bsize || 0)
        this.diskSnapshot = {
          totalBytes: Number(stats.blocks || 0) * blockSize,
          freeBytes: Number(stats.bavail || stats.bfree || 0) * blockSize,
          checkedAt: Date.now(),
        }
      } catch (err) {
        this.diskSnapshot = { totalBytes: null, freeBytes: null, checkedAt: Date.now(), error: err.message }
      }
      return this.diskSnapshot
    })().finally(() => { this.diskSnapshotPromise = null })
    return this.diskSnapshotPromise
  }

  adjustDiskSnapshot (physicalDelta) {
    if (!Number.isFinite(this.diskSnapshot?.freeBytes)) return
    this.diskSnapshot = {
      ...this.diskSnapshot,
      freeBytes: Math.max(0, this.diskSnapshot.freeBytes - Number(physicalDelta || 0)),
    }
  }

  scheduleDiskRefresh () {
    if (this.diskRefreshTimer) clearTimeout(this.diskRefreshTimer)
    this.diskRefreshTimer = null
    if (this.policy.minFreeBytes === null) return
    this.diskRefreshTimer = setTimeout(() => {
      this.diskRefreshTimer = null
      this.refreshDiskSnapshot(true)
        .then(() => this.scheduleAutoCleanupSoon())
        .catch(err => console.warn('[cache governance] disk snapshot refresh failed:', err.message))
        .finally(() => this.scheduleDiskRefresh())
    }, DISK_SNAPSHOT_TTL_MS)
    this.diskRefreshTimer.unref?.()
  }

  scheduleAutoTimer () {
    if (this.autoTimer) clearTimeout(this.autoTimer)
    this.autoTimer = null
    if (!this.policy.autoCleanupEnabled) return
    const delay = this.policy.autoCleanupIntervalMinutes * 60 * 1000
    this.autoTimer = setTimeout(() => {
      this.autoTimer = null
      this.runAutoCleanup().catch(err => console.warn('[cache governance] auto cleanup failed:', err.message))
        .finally(() => this.scheduleAutoTimer())
    }, delay)
    this.autoTimer.unref?.()
  }

  capacityAllows (additionalBytes = 0) {
    const hardLimit = this.policy.hardLimitBytes
    if (hardLimit === 0) return false
    const delta = Math.max(0, Number(additionalBytes) || 0)
    if (hardLimit !== null && !this.usage.ready) return false
    const hardLimitReached = hardLimit !== null &&
      this.usage.physicalBytes + this.reservedBytes + delta > hardLimit
    const freeLimitReached = this.policy.minFreeBytes !== null && (
      !Number.isFinite(this.diskSnapshot?.freeBytes) ||
      this.diskSnapshot.freeBytes - this.reservedBytes - delta < this.policy.minFreeBytes
    )
    return !hardLimitReached && !freeLimitReached
  }

  shouldPersist ({ estimatedSize = 0, estimatedMetaSize = 0, previousSize = 0, previousMetaSize = 0 } = {}) {
    if (this.policy.hardLimitBytes === null && this.policy.minFreeBytes === null) return true
    const bodyBytes = Number(estimatedSize || 0)
    if (bodyBytes <= 0) return false
    const previousPhysical = Math.max(0, Number(previousSize) || 0) + Math.max(0, Number(previousMetaSize) || 0)
    const nextPhysical = bodyBytes + Math.max(0, Number(estimatedMetaSize) || 0)
    const allowed = this.capacityAllows(Math.max(0, nextPhysical - previousPhysical))
    if (!allowed) this.scheduleAutoCleanupSoon()
    return allowed
  }

  async reservePersist (input = {}) {
    await this.ready()
    if (this.policy.hardLimitBytes === null && this.policy.minFreeBytes === null) {
      return { allowed: true, id: null }
    }
    if (this.policy.minFreeBytes !== null) await this.refreshDiskSnapshot()
    const bodyBytes = Number(input.estimatedSize || 0)
    if (!Number.isFinite(bodyBytes) || bodyBytes <= 0) {
      this.scheduleAutoCleanupSoon()
      return { allowed: false, reason: 'unknown-size' }
    }
    const indexedSizes = input.relativePath && input.previousSize === undefined
      ? this.index.entrySizes(input.relativePath)
      : null
    const previousBodyBytes = Math.max(0, Number(input.previousSize ?? indexedSizes?.bodyBytes) || 0)
    const previousSidecarBytes = Math.max(0, Number(input.previousMetaSize ?? indexedSizes?.sidecarBytes) || 0)
    const nextPhysicalBytes = bodyBytes + Math.max(0, Number(input.estimatedMetaSize) || 0)
    const reservedBytes = Math.max(0, nextPhysicalBytes - previousBodyBytes - previousSidecarBytes)
    if (!this.capacityAllows(reservedBytes)) {
      this.scheduleAutoCleanupSoon()
      return { allowed: false, reason: 'capacity-limit' }
    }
    const reservation = {
      allowed: true,
      id: `cache-reservation-${randomUUID()}`,
      relativePath: String(input.relativePath || ''),
      previousBodyBytes,
      previousSidecarBytes,
      reservedBytes,
      createdAt: Date.now(),
    }
    this.reservations.set(reservation.id, reservation)
    this.reservedBytes += reservedBytes
    return reservation
  }

  confirmPersist ({
    reservation,
    bodyBytes = 0,
    sidecarBytes = 0,
    previousBodyBytes,
    previousSidecarBytes,
  } = {}) {
    if (!reservation?.id) return true
    const current = this.reservations.get(reservation.id)
    if (!current) return false
    current.previousBodyBytes = Math.max(0, Number(previousBodyBytes ?? current.previousBodyBytes) || 0)
    current.previousSidecarBytes = Math.max(0, Number(previousSidecarBytes ?? current.previousSidecarBytes) || 0)
    const actualPhysical = Math.max(0, Number(bodyBytes) || 0) + Math.max(0, Number(sidecarBytes) || 0)
    const actualReserved = Math.max(0, actualPhysical - current.previousBodyBytes - current.previousSidecarBytes)
    const additionalBytes = actualReserved - current.reservedBytes
    if (additionalBytes > 0 && !this.capacityAllows(additionalBytes)) {
      this.scheduleAutoCleanupSoon()
      return false
    }
    this.reservedBytes = Math.max(0, this.reservedBytes + additionalBytes)
    current.reservedBytes = actualReserved
    return true
  }

  releasePersist ({ reservation } = {}) {
    if (!reservation?.id) return
    const current = this.reservations.get(reservation.id)
    if (!current) return
    this.reservations.delete(reservation.id)
    this.reservedBytes = Math.max(0, this.reservedBytes - current.reservedBytes)
  }

  queueIndexUpsert (entry) {
    if (!this.pendingIndexUpserts.size) {
      this.incrementalDirtyOwned = this.index.markIncrementalDirty()
    }
    this.pendingIndexUpserts.set(entry.relativePath, entry)
    if (this.pendingIndexUpserts.size >= INDEX_FLUSH_BATCH_SIZE) {
      if (this.indexFlushTimer) clearTimeout(this.indexFlushTimer)
      this.indexFlushTimer = setTimeout(() => {
        this.indexFlushTimer = null
        this.flushPendingIndexWrites().catch(err => console.warn('[cache governance] index batch flush failed:', err.message))
      }, 0)
      this.indexFlushTimer.unref?.()
      return
    }
    if (this.indexFlushTimer) return
    this.indexFlushTimer = setTimeout(() => {
      this.indexFlushTimer = null
      this.flushPendingIndexWrites().catch(err => console.warn('[cache governance] index batch flush failed:', err.message))
    }, INDEX_FLUSH_DELAY_MS)
    this.indexFlushTimer.unref?.()
  }

  async flushPendingIndexWrites () {
    if (this.index.closed) return 0
    if (!this.pendingIndexUpserts.size) {
      if (this.incrementalDirtyOwned) this.index.completeIncrementalFlush()
      this.incrementalDirtyOwned = false
      return 0
    }
    if (this.indexFlushPromise) return this.indexFlushPromise
    if (this.indexFlushTimer) clearTimeout(this.indexFlushTimer)
    this.indexFlushTimer = null
    const entries = [...this.pendingIndexUpserts.values()]
    this.pendingIndexUpserts.clear()
    const mutationEpoch = this.indexMutationEpoch
    this.indexFlushPromise = Promise.resolve().then(() => {
      if (mutationEpoch !== this.indexMutationEpoch) return 0
      const count = this.index.upsertMany(entries)
      if (this.incrementalDirtyOwned) this.index.completeIncrementalFlush()
      this.incrementalDirtyOwned = false
      return count
    })
      .catch((err) => {
        if (!this.index.closed && mutationEpoch === this.indexMutationEpoch) {
          entries.forEach(entry => {
            if (!this.pendingIndexUpserts.has(entry.relativePath)) {
              this.pendingIndexUpserts.set(entry.relativePath, entry)
            }
          })
          if (this.incrementalDirtyOwned) this.index.failIncrementalFlush(err.message)
        }
        throw err
      })
      .finally(() => {
        this.indexFlushPromise = null
        if (this.pendingIndexUpserts.size && !this.index.closed) this.queueIndexUpsert([...this.pendingIndexUpserts.values()][0])
      })
    return this.indexFlushPromise
  }

  onCacheUpsert ({ paths, meta, metaSize, previousSize, previousMetaSize }) {
    const relativePath = path.relative(this.cacheDir, paths.cachePath)
    const pendingPrevious = this.pendingIndexUpserts.get(relativePath)
    const indexedPrevious = previousSize === undefined && !pendingPrevious
      ? this.index.entrySizes(relativePath)
      : null
    const previousBodyBytes = Math.max(0, Number(previousSize ?? pendingPrevious?.size ?? indexedPrevious?.bodyBytes) || 0)
    const previousSidecarBytes = Math.max(0, Number(previousMetaSize ?? pendingPrevious?.metaSize ?? indexedPrevious?.sidecarBytes) || 0)
    const policy = this.keyPolicies[meta.sourceId]
    const canonicalKey = meta.keyVersion === 'v2'
      ? meta.key
      : policy?.mode === 'normalized_v2'
          ? this.canonicalKeyForMeta(meta, policy)
          : null
    const entry = {
      relativePath,
      metaRelativePath: path.relative(this.cacheDir, paths.metaPath),
      provider: relativePath.split(path.sep)[0] || 'unknown',
      key: meta.key,
      url: meta.url,
      sourceId: meta.sourceId,
      layerId: meta.layerId,
      publishId: meta.publishId,
      resourceType: meta.resourceType,
      range: meta.range,
      keyVersion: meta.keyVersion,
      policyRevision: meta.policyRevision,
      size: meta.size,
      metaSize,
      updatedAt: meta.updatedAt,
      expiresAt: meta.expiresAt,
      staleExpiresAt: meta.staleExpiresAt,
      etag: meta.headers?.etag,
      contentType: meta.headers?.['content-type'],
      canonicalKey,
      canonicalPolicyRevision: canonicalKey ? Number(policy?.revision || meta.policyRevision || 1) : null,
    }
    this.queueIndexUpsert(entry)
    const nextBodyBytes = Math.max(0, Number(meta.size) || 0)
    const nextSidecarBytes = Math.max(0, Number(metaSize) || 0)
    const physicalDelta = nextBodyBytes + nextSidecarBytes - previousBodyBytes - previousSidecarBytes
    this.usage.bodyBytes = Math.max(0, this.usage.bodyBytes + nextBodyBytes - previousBodyBytes)
    this.usage.sidecarBytes = Math.max(0, this.usage.sidecarBytes + nextSidecarBytes - previousSidecarBytes)
    this.usage.physicalBytes = Math.max(0, this.usage.physicalBytes + physicalDelta)
    this.adjustDiskSnapshot(physicalDelta)
    if (this.policy.softLimitBytes !== null && this.usage.ready && this.usage.physicalBytes > this.policy.softLimitBytes) {
      this.scheduleAutoCleanupSoon()
    }
  }

  onCacheDelete ({ paths }) {
    const relativePath = path.relative(this.cacheDir, paths.cachePath)
    const pending = this.pendingIndexUpserts.get(relativePath)
    const previous = pending || this.index.entrySizes(relativePath)
    this.pendingIndexUpserts.delete(relativePath)
    this.index.remove(relativePath)
    if (!this.pendingIndexUpserts.size && this.incrementalDirtyOwned) {
      this.index.completeIncrementalFlush()
      this.incrementalDirtyOwned = false
    }
    const bodyBytes = Math.max(0, Number(pending?.size ?? previous.bodyBytes) || 0)
    const sidecarBytes = Math.max(0, Number(pending?.metaSize ?? previous.sidecarBytes) || 0)
    this.usage.bodyBytes = Math.max(0, this.usage.bodyBytes - bodyBytes)
    this.usage.sidecarBytes = Math.max(0, this.usage.sidecarBytes - sidecarBytes)
    this.usage.physicalBytes = Math.max(0, this.usage.physicalBytes - bodyBytes - sidecarBytes)
    this.adjustDiskSnapshot(-(bodyBytes + sidecarBytes))
  }

  onCacheClear () {
    this.indexMutationEpoch += 1
    if (this.indexFlushTimer) clearTimeout(this.indexFlushTimer)
    this.indexFlushTimer = null
    this.pendingIndexUpserts.clear()
    this.incrementalDirtyOwned = false
    this.reservations.clear()
    this.reservedBytes = 0
    this.index.clear()
    this.usage = { bodyBytes: 0, sidecarBytes: 0, physicalBytes: 0, ready: true }
    if (this.diskSnapshot) this.diskSnapshot = { ...this.diskSnapshot, checkedAt: 0 }
  }

  canonicalKeyForMeta (meta, policy) {
    try {
      const canonicalUrl = canonicalizeCacheUrl(meta.url, policy)
      return md5(`v2|source:${meta.sourceId}|resource:${meta.resourceType || 'raster'}|url:${canonicalUrl}|range:${meta.range || ''}`)
    } catch (err) {
      return null
    }
  }

  findLegacyEntry ({ options = {}, paths = {} } = {}) {
    const sourceId = options.cacheMeta?.sourceId || options.providerId || ''
    if (!sourceId || !options.cacheKey) return null
    const relativePath = path.relative(this.cacheDir, paths.cachePath)
    const alias = this.index.findCanonicalAlias(sourceId, md5(options.cacheKey), relativePath)
    if (!alias) return null
    return {
      cachePath: this.safeCachePath(alias.relativePath),
      metaPath: this.safeCachePath(alias.metaRelativePath),
    }
  }

  scheduleAutoCleanupSoon () {
    if (!this.policy.autoCleanupEnabled || this.autoCleanupScheduled) return
    this.autoCleanupScheduled = true
    const timer = setTimeout(() => {
      this.autoCleanupScheduled = false
      this.runAutoCleanup().catch(err => console.warn('[cache governance] scheduled cleanup failed:', err.message))
    }, 1000)
    timer.unref?.()
  }

  async runAutoCleanup () {
    await this.ready()
    if (!this.policy.autoCleanupEnabled || this.runningCleanupPromise) return null
    await this.flushPendingIndexWrites()
    const status = this.index.getStatus()
    if (!status.exact) return null
    if (this.policy.minFreeBytes !== null) await this.refreshDiskSnapshot()
    const pressureBytes = Math.max(
      0,
      this.policy.softLimitBytes === null ? 0 : status.estimatedPhysicalBytes - this.policy.softLimitBytes,
      this.policy.hardLimitBytes === null ? 0 : status.estimatedPhysicalBytes - this.policy.hardLimitBytes,
      this.policy.minFreeBytes === null || !Number.isFinite(this.diskSnapshot?.freeBytes)
        ? 0
        : this.policy.minFreeBytes - this.diskSnapshot.freeBytes
    )
    const filters = [
      {
        states: ['expired'],
        expiredBeforeDays: this.policy.expiredRetentionDays,
        maxBytes: pressureBytes || null,
      },
      ...(pressureBytes > 0 ? [
        { states: ['expired'], maxBytes: pressureBytes },
        { states: ['fresh', 'stale', 'expired'], orphanedOnly: true, maxBytes: pressureBytes },
        { states: ['stale'], maxBytes: pressureBytes },
      ] : []),
    ]
    for (const filter of filters) {
      const preview = await this.previewCleanup(filter)
      if (preview.files) {
        return this.createCleanupJob(null, { previewId: preview.previewId }, {}, { automatic: true })
      }
    }
    return null
  }

  async getRuntimeCacheOptions (sourceId, url, resourceType, headers = {}, cacheMeta = {}) {
    await this.ready()
    const policy = normalizeCacheKeyRule(this.keyPolicies[sourceId] || {})
    const sensitiveQueryParams = [...new Set([
      ...DEFAULT_SENSITIVE_QUERY_KEYS,
      ...policy.sensitiveQueryParams,
      ...(Array.isArray(cacheMeta.secretQueryParams) ? cacheMeta.secretQueryParams : []),
    ])]
    if (policy.mode !== 'normalized_v2') return { sensitiveQueryParams }
    const canonicalUrl = canonicalizeCacheUrl(url, policy)
    const range = headers.Range || headers.range || ''
    const cacheKey = `v2|source:${sourceId}|resource:${resourceType || 'raster'}|url:${canonicalUrl}|range:${range}`
    return {
      cacheKey,
      cacheNamespace: `v2-${String(sourceId).replace(/[^a-z0-9-]/gi, '-').slice(0, 80)}`,
      cacheKeyVersion: 'v2',
      cachePolicyRevision: Number(this.keyPolicies[sourceId]?.revision || 1),
      legacyCacheKeyFallback: true,
      sensitiveQueryParams,
    }
  }

  async reconcileIndex (actor, options = {}, context = {}) {
    await this.ready()
    if (this.reconcilePromise) return this.reconcilePromise.task
    await this.flushPendingIndexWrites()
    const status = this.index.getStatus()
    const minimumInterval = this.policy.reconcileMinIntervalMinutes * 60 * 1000
    if (options.force && status.lastStartedAt && Date.now() - status.lastStartedAt < MIN_FORCE_RECONCILE_INTERVAL_MS) {
      throw createHttpError('索引校准操作过于频繁，请稍后再试', 409, 'CACHE_INDEX_COOLDOWN')
    }
    if (!options.force && status.lastReconciledAt && Date.now() - status.lastReconciledAt < minimumInterval) {
      throw createHttpError('索引刚完成校准，请等待冷却时间后再试', 409, 'CACHE_INDEX_COOLDOWN')
    }
    if (this.runningCleanupPromise || this.jobs.some(job => ['queued', 'running'].includes(job.status))) {
      throw createHttpError('缓存清理任务运行中，暂不能校准索引', 409, 'CACHE_TASK_BUSY')
    }

    const task = {
      id: `cache-index-${randomUUID()}`,
      type: 'index-reconcile',
      status: 'running',
      scannedEntries: 0,
      indexedEntries: 0,
      invalidMetadataEntries: 0,
      startedAt: Date.now(),
    }
    const generation = randomUUID()
    this.index.beginReconcile(generation, task.startedAt)
    this.audit(actor, 'admin.cache.index.reconcile', 'cache-index', task.id, {}, context)
    const promise = this.performReconcile(task, generation)
      .finally(() => { this.reconcilePromise = null })
    this.reconcilePromise = { task, promise }
    return task
  }

  async performReconcile (task, generation) {
    let scanned = 0
    let indexed = 0
    let invalidMetadataEntries = 0
    let batch = []
    try {
      const flushBatch = async () => {
        if (!batch.length) return
        indexed += this.index.upsertMany(batch, { generation })
        batch = []
        task.scannedEntries = scanned
        task.indexedEntries = indexed
        task.invalidMetadataEntries = invalidMetadataEntries
        this.index.updateReconcileProgress(scanned, indexed)
        await new Promise(resolve => setImmediate(resolve))
      }
      const walk = async (dir) => {
        let directory
        try {
          directory = await fs.opendir(dir)
        } catch (err) {
          if (err.code === 'ENOENT') return
          throw err
        }
        for await (const item of directory) {
          const itemPath = path.join(dir, item.name)
          if (item.isDirectory()) {
            await walk(itemPath)
            continue
          }
          if (!item.isFile() || item.name === CACHE_STATS_FILE || item.name.endsWith(CACHE_META_SUFFIX) || item.name.includes('.tmp-')) continue
          scanned += 1
          const metaPath = `${itemPath}${CACHE_META_SUFFIX}`
          let meta = null
          let metaSize = 0
          try {
            meta = await fs.readJson(metaPath)
            metaSize = jsonFileBytes(meta)
          } catch (err) {
            invalidMetadataEntries += 1
            if (err.code !== 'ENOENT') {
              try {
                metaSize = Number((await fs.stat(metaPath)).size || 0)
              } catch (statError) {
                if (statError.code !== 'ENOENT') throw statError
              }
            }
          }
          let stat = null
          let size = Number(meta?.size)
          let updatedAt = Number(meta?.updatedAt)
          if (!meta || !Number.isFinite(size) || size < 0 || !Number.isFinite(updatedAt) || updatedAt < 0) {
            try {
              stat = await fs.stat(itemPath)
              size = stat.size
              updatedAt = stat.mtimeMs
            } catch (err) {
              if (err.code === 'ENOENT') continue
              throw err
            }
          }
          const relativePath = path.relative(this.cacheDir, itemPath)
          batch.push({
            relativePath,
            metaRelativePath: path.relative(this.cacheDir, metaPath),
            provider: relativePath.split(path.sep)[0] || 'unknown',
            key: meta?.key,
            url: meta?.url,
            sourceId: meta?.sourceId,
            layerId: meta?.layerId,
            publishId: meta?.publishId,
            resourceType: meta?.resourceType,
            range: meta?.range,
            keyVersion: meta?.keyVersion,
            policyRevision: meta?.policyRevision,
            size,
            metaSize,
            updatedAt,
            expiresAt: meta?.expiresAt,
            staleExpiresAt: meta?.staleExpiresAt,
            etag: meta?.headers?.etag,
            contentType: meta?.headers?.['content-type'],
          })
          task.scannedEntries = scanned
          task.invalidMetadataEntries = invalidMetadataEntries
          if (batch.length >= RECONCILE_BATCH_SIZE) await flushBatch()
        }
      }
      await fs.ensureDir(this.cacheDir)
      await walk(this.cacheDir)
      await flushBatch()
      await this.flushPendingIndexWrites()
      this.index.completeReconcile(generation)
      for (const [sourceId, policy] of Object.entries(this.keyPolicies)) {
        if (policy.mode === 'normalized_v2') await this.rebuildSourceAliases(sourceId, policy)
        else this.index.clearCanonicalAliases(sourceId)
      }
      const indexStatus = this.index.getStatus()
      this.usage = {
        bodyBytes: indexStatus.bodyBytes,
        sidecarBytes: indexStatus.sidecarBytes,
        physicalBytes: indexStatus.estimatedPhysicalBytes,
        ready: true,
      }
      task.status = 'completed'
      task.finishedAt = Date.now()
      task.scannedEntries = scanned
      task.indexedEntries = indexed
      task.invalidMetadataEntries = invalidMetadataEntries
      return task
    } catch (err) {
      this.index.failReconcile(err.message)
      task.status = 'failed'
      task.error = err.message
      task.finishedAt = Date.now()
      throw err
    }
  }

  cleanupExpiredPreviews () {
    const cutoff = Date.now() - PREVIEW_TTL_MS
    for (const [id, preview] of this.previews.entries()) {
      if (preview.createdAt < cutoff) this.previews.delete(id)
    }
  }

  async previewCleanup (input = {}) {
    await this.ready()
    await this.flushPendingIndexWrites()
    this.cleanupExpiredPreviews()
    const filter = normalizeCleanupFilter(input)
    const selectionCutoff = Date.now()
    const index = this.index.getStatus()
    const result = index.ready
      ? this.index.previewSelection({ ...filter, now: selectionCutoff }, selectionCutoff)
      : { files: 0, bytes: 0, fresh: 0, stale: 0, expired: 0, samples: [] }
    const preview = {
      previewId: `cache-preview-${randomUUID()}`,
      createdAt: Date.now(),
      expiresAt: Date.now() + PREVIEW_TTL_MS,
      selectionCutoff,
      filter,
      filterHash: hashValue(filter),
      ...result,
      samples: (result.samples || []).map(publicCacheEntry),
      index,
      exact: index.exact,
    }
    this.previews.set(preview.previewId, preview)
    return preview
  }

  async createCleanupJob (actor, input = {}, context = {}, options = {}) {
    await this.ready()
    await this.flushPendingIndexWrites()
    this.cleanupExpiredPreviews()
    if (this.reconcilePromise) {
      throw createHttpError('缓存索引校准中，暂不能创建清理任务', 409, 'CACHE_TASK_BUSY')
    }
    if (this.runningCleanupPromise || this.jobs.some(job => ['queued', 'running'].includes(job.status))) {
      throw createHttpError('已有缓存清理任务正在运行', 409, 'CACHE_TASK_BUSY')
    }
    const preview = this.previews.get(String(input.previewId || ''))
    if (!preview) throw createHttpError('清理预演不存在或已过期', 409, 'PREVIEW_EXPIRED')
    const index = this.index.getStatus()
    if (!index.exact || !preview.exact) {
      throw createHttpError('缓存索引尚未完成，不能执行删除', 409, 'INDEX_NOT_READY')
    }
    if (preview.filterHash !== hashValue(preview.filter)) {
      throw createHttpError('清理预演条件已变化，请重新预演', 409, 'PREVIEW_MISMATCH')
    }
    const job = {
      id: `cache-cleanup-${randomUUID()}`,
      type: 'cleanup',
      automatic: options.automatic === true,
      status: 'queued',
      previewId: preview.previewId,
      filter: preview.filter,
      filterHash: preview.filterHash,
      selectionCutoff: preview.selectionCutoff,
      plannedFiles: preview.files,
      plannedBytes: preview.bytes,
      deletedFiles: 0,
      deletedBytes: 0,
      skippedFiles: 0,
      batches: 0,
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      actorUserId: actor?.user?.id || null,
      context: { ip: context?.ip || '' },
      cancelRequested: false,
    }
    this.jobs.unshift(job)
    this.jobs = this.jobs.slice(0, 100)
    await this.persistJobs()
    this.audit(actor, 'admin.cache.cleanup.create', 'cache-cleanup-job', job.id, {
      automatic: job.automatic,
      plannedFiles: job.plannedFiles,
      plannedBytes: job.plannedBytes,
      filter: job.filter,
    }, context)
    const timer = setImmediate(() => {
      this.runCleanupJob(job).catch(err => console.warn('[cache governance] cleanup job failed:', err.message))
    })
    timer.unref?.()
    return publicJob(job)
  }

  async runCleanupJob (job) {
    if (this.runningCleanupPromise) return this.runningCleanupPromise
    const promise = (async () => {
      job.status = 'running'
      job.startedAt = Date.now()
      await this.persistJobs()
      let lastPersistedAt = Date.now()
      try {
        while (!job.cancelRequested) {
          const remainingFiles = job.filter.maxFiles === null
            ? Number.MAX_SAFE_INTEGER
            : Math.max(0, job.filter.maxFiles - job.deletedFiles)
          const remainingBytes = job.filter.maxBytes === null
            ? Number.MAX_SAFE_INTEGER
            : Math.max(0, job.filter.maxBytes - job.deletedBytes)
          if (!remainingFiles || !remainingBytes) break
          const batchFilter = {
            ...job.filter,
            now: job.selectionCutoff,
            maxFiles: Math.min(remainingFiles, this.policy.batchMaxFiles),
            maxBytes: Math.min(remainingBytes, this.policy.batchMaxBytes),
          }
          const rows = this.index.selectBatch(batchFilter, job.selectionCutoff)
          if (!rows.length) break

          const removedRows = []
          for (let offset = 0; offset < rows.length; offset += 8) {
            const chunk = rows.slice(offset, offset + 8)
            const removed = await Promise.all(chunk.map(row => this.removeIndexedEntry(row)))
            removedRows.push(...removed.filter(Boolean))
          }
          await this.flushPendingIndexWrites()
          const deletedBodyBytes = removedRows.reduce((sum, row) => sum + row.bodyBytes, 0)
          const deletedSidecarBytes = removedRows.reduce((sum, row) => sum + row.sidecarBytes, 0)
          const deletedBytes = deletedBodyBytes + deletedSidecarBytes
          job.deletedFiles += removedRows.length
          job.deletedBytes += deletedBytes
          job.skippedFiles += rows.length - removedRows.length
          job.batches += 1
          await this.fetchRelay.invalidateStatsSnapshot()
          if (Date.now() - lastPersistedAt >= 2000) {
            await this.persistJobs()
            lastPersistedAt = Date.now()
          }
          await new Promise(resolve => setImmediate(resolve))
        }
        job.status = job.cancelRequested ? 'cancelled' : 'completed'
        job.finishedAt = Date.now()
        await this.persistJobs()
        this.audit(
          job.actorUserId ? { user: { id: job.actorUserId } } : null,
          `admin.cache.cleanup.${job.status}`,
          'cache-cleanup-job',
          job.id,
          { deletedFiles: job.deletedFiles, deletedBytes: job.deletedBytes, batches: job.batches },
          job.context
        )
        return publicJob(job)
      } catch (err) {
        job.status = 'failed'
        job.error = String(err.message || '缓存清理失败').slice(0, 500)
        job.finishedAt = Date.now()
        await this.persistJobs()
        this.audit(
          job.actorUserId ? { user: { id: job.actorUserId } } : null,
          'admin.cache.cleanup.failed',
          'cache-cleanup-job',
          job.id,
          { deletedFiles: job.deletedFiles, deletedBytes: job.deletedBytes, error: job.error },
          job.context,
          'failed'
        )
        throw err
      }
    })().finally(() => {
      this.runningCleanupPromise = null
      if (job.automatic) this.scheduleAutoCleanupSoon()
    })
    this.runningCleanupPromise = promise
    return promise
  }

  safeCachePath (relativePath) {
    const root = path.resolve(this.cacheDir)
    const relative = String(relativePath || '').trim()
    if (!relative || relative === '.' || path.isAbsolute(relative)) {
      throw createHttpError('缓存索引路径无效', 500, 'INVALID_CACHE_INDEX_PATH')
    }
    const resolved = path.resolve(root, relative)
    if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
      throw createHttpError('缓存索引路径无效', 500, 'INVALID_CACHE_INDEX_PATH')
    }
    return resolved
  }

  async removeIndexedEntry (row) {
    const cachePath = this.safeCachePath(row.relativePath)
    const metaPath = this.safeCachePath(row.metaRelativePath)
    if (metaPath !== `${cachePath}${CACHE_META_SUFFIX}`) {
      throw createHttpError('缓存元数据索引路径无效', 500, 'INVALID_CACHE_INDEX_PATH')
    }
    return this.fetchRelay.withCachePathLock(cachePath, async () => {
      let stat
      try {
        stat = await fs.stat(cachePath)
      } catch (err) {
        if (err.code === 'ENOENT') {
          this.index.removeIfMatch(row.relativePath, row.updatedAt, row.size)
          return null
        }
        throw err
      }
      let meta = null
      try {
        meta = await fs.readJson(metaPath)
      } catch (err) {
        if (err.code !== 'ENOENT' && err.name !== 'SyntaxError') throw err
      }
      const matchesVersion = stat.size === row.size && (
        meta
          ? Number(meta.updatedAt) === row.updatedAt && Number(meta.size) === row.size
          : Math.abs(Number(stat.mtimeMs) - row.updatedAt) < 2
      )
      if (!matchesVersion) return null
      let sidecarBytes = 0
      try {
        sidecarBytes = Number((await fs.stat(metaPath)).size || 0)
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
      await Promise.all([fs.remove(cachePath), fs.remove(metaPath)])
      if (!this.index.removeIfMatch(row.relativePath, row.updatedAt, row.size)) return null
      const bodyBytes = Number(stat.size || row.size || 0)
      const releasedSidecarBytes = sidecarBytes || Number(row.metaSize || 0)
      this.usage.bodyBytes = Math.max(0, this.usage.bodyBytes - bodyBytes)
      this.usage.sidecarBytes = Math.max(0, this.usage.sidecarBytes - releasedSidecarBytes)
      this.usage.physicalBytes = Math.max(0, this.usage.physicalBytes - bodyBytes - releasedSidecarBytes)
      this.adjustDiskSnapshot(-(bodyBytes + releasedSidecarBytes))
      return {
        bodyBytes,
        sidecarBytes: releasedSidecarBytes,
      }
    })
  }

  async listCleanupJobs (input = {}) {
    await this.ready()
    const page = positiveSafeInteger(input.page, '页码', 1)
    const limit = positiveSafeInteger(input.limit, '每页数量', 20, { max: 100 })
    const start = (page - 1) * limit
    return {
      items: this.jobs.slice(start, start + limit).map(publicJob),
      page,
      limit,
      total: this.jobs.length,
    }
  }

  async cancelCleanupJob (actor, jobId, context = {}) {
    await this.ready()
    const job = this.jobs.find(item => item.id === jobId)
    if (!job) throw createHttpError('缓存治理任务不存在', 404, 'RESOURCE_NOT_FOUND')
    if (!['queued', 'running'].includes(job.status)) {
      throw createHttpError('当前任务状态不能取消', 409, 'CACHE_TASK_NOT_CANCELLABLE')
    }
    job.cancelRequested = true
    if (job.status === 'queued') {
      job.status = 'cancelled'
      job.finishedAt = Date.now()
    }
    await this.persistJobs()
    this.audit(actor, 'admin.cache.cleanup.cancel', 'cache-cleanup-job', job.id, {}, context)
    return publicJob(job)
  }

  analyzeRows (sourceId, rule, rows, total, analyzable = total) {
    const groups = new Map()
    const hosts = {}
    const params = {}
    const redactedBlockers = new Set()
    let malformedCount = Math.max(0, total - analyzable)
    rows.forEach((row) => {
      try {
        const parsed = new URL(row.url)
        hosts[parsed.hostname] = (hosts[parsed.hostname] || 0) + 1
        parsed.searchParams.forEach((value, key) => {
          params[key] = (params[key] || 0) + 1
          if (value === '****' && !rule.ignoredQueryParams.includes(key)) redactedBlockers.add(key)
        })
        const canonical = canonicalizeCacheUrl(row.url, rule)
        const group = groups.get(canonical) || []
        group.push(row)
        groups.set(canonical, group)
      } catch (err) {
        malformedCount += 1
      }
    })

    let duplicateFiles = 0
    let duplicateBytes = 0
    let conflictCount = 0
    const collisions = []
    groups.forEach((group, canonicalUrl) => {
      if (group.length < 2) return
      const signatures = new Set(group.map(item => `${item.size}|${item.etag || ''}|${item.contentType || ''}`))
      if (signatures.size > 1) {
        conflictCount += 1
        if (collisions.length < 50) {
          collisions.push({
            canonicalUrl: publicUrlShape(canonicalUrl),
            files: group.length,
            sizes: [...new Set(group.map(item => item.size))].slice(0, 10),
            etags: [...new Set(group.map(item => item.etag).filter(Boolean))].slice(0, 10),
            contentTypes: [...new Set(group.map(item => item.contentType).filter(Boolean))].slice(0, 10),
          })
        }
        return
      }
      duplicateFiles += group.length - 1
      duplicateBytes += group.slice(1).reduce((sum, item) => sum + item.size, 0)
    })

    return {
      sourceId,
      totalEntries: total,
      sampledEntries: rows.length,
      complete: rows.length >= analyzable && analyzable === total && malformedCount === 0,
      malformedCount,
      originalKeys: rows.length,
      normalizedKeys: groups.size,
      duplicateFiles,
      duplicateBytes,
      conflictCount,
      collisions,
      hostDistribution: Object.entries(hosts).sort((a, b) => b[1] - a[1]).map(([host, count]) => ({ host, count })),
      parameterDistribution: Object.entries(params).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
      redactedParameterBlockers: [...redactedBlockers],
      safeToEnable: conflictCount === 0 && redactedBlockers.size === 0 && malformedCount === 0,
      warnings: [
        ...(rows.length < analyzable ? ['本次为抽样分析，未覆盖该图源全部可分析缓存项'] : []),
        ...(malformedCount ? [`有 ${malformedCount} 条缓存缺少可解析 URL，修复或淘汰前不能启用归一缓存键`] : []),
        ...(redactedBlockers.size ? ['部分历史 URL 已脱敏；未忽略这些参数前无法判断其真实差异'] : []),
        '本次分析不读取正文哈希，冲突判断基于文件大小、ETag 和 Content-Type',
      ],
    }
  }

  async analyzeKeyPolicy (actor, input = {}, context = {}) {
    await this.ready()
    if (this.analysisRunning) throw createHttpError('已有 URL 缓存键分析正在运行', 409, 'CACHE_TASK_BUSY')
    this.analysisRunning = true
    try {
      await this.flushPendingIndexWrites()
      const index = this.index.getStatus()
      if (!index.exact) throw createHttpError('请先完成缓存索引校准', 409, 'INDEX_NOT_READY')
      const sourceId = String(input.sourceId || '').trim()
      if (!sourceId) throw createHttpError('请选择图源', 400, 'INVALID_CACHE_KEY_POLICY')
      const sources = await this.tileCatalogManager.listTileSources()
      if (!sources.some(source => source.id === sourceId)) {
        throw createHttpError('图源不存在', 404, 'RESOURCE_NOT_FOUND')
      }
      const rule = normalizeCacheKeyRule({ ...(input.rule || {}), mode: 'normalized_v2' })
      const sampleLimit = positiveSafeInteger(input.sampleLimit, '分析样本数', 5000, { max: MAX_ANALYSIS_SAMPLE })
      const { total, analyzable, rows } = this.index.listSourceUrls(sourceId, sampleLimit)
      const result = this.analyzeRows(sourceId, rule, rows, total, analyzable)
      const analysis = {
        analysisId: `cache-analysis-${randomUUID()}`,
        sourceId,
        rule,
        ruleHash: hashValue(rule),
        createdAt: Date.now(),
        expiresAt: Date.now() + ANALYSIS_TTL_MS,
        ...result,
      }
      this.analyses.unshift(analysis)
      this.analyses = this.analyses.slice(0, 50)
      await this.store.write('cache-key-analyses', this.analyses)
      this.audit(actor, 'admin.cache.key-analysis', 'tile-source', sourceId, {
        analysisId: analysis.analysisId,
        sampledEntries: analysis.sampledEntries,
        duplicateFiles: analysis.duplicateFiles,
        conflictCount: analysis.conflictCount,
        safeToEnable: analysis.safeToEnable,
      }, context)
      return publicAnalysis(analysis)
    } finally {
      this.analysisRunning = false
    }
  }

  async listKeyPolicies () {
    await this.ready()
    const sources = await this.tileCatalogManager.listTileSources()
    return {
      items: sources.map(source => {
        const policy = normalizeCacheKeyRule(this.keyPolicies[source.id] || {})
        const analysis = this.analyses.find(item => item.sourceId === source.id)
        return {
          sourceId: source.id,
          sourceName: source.name,
          ...policy,
          revision: Number(this.keyPolicies[source.id]?.revision || 0),
          updatedAt: this.keyPolicies[source.id]?.updatedAt || null,
          latestAnalysis: analysis ? {
            analysisId: analysis.analysisId,
            createdAt: analysis.createdAt,
            expiresAt: analysis.expiresAt,
            sampledEntries: analysis.sampledEntries,
            totalEntries: analysis.totalEntries,
            duplicateFiles: analysis.duplicateFiles,
            duplicateBytes: analysis.duplicateBytes,
            conflictCount: analysis.conflictCount,
            malformedCount: analysis.malformedCount,
            safeToEnable: analysis.safeToEnable,
          } : null,
        }
      }),
      analyses: this.analyses.slice(0, 20).map(publicAnalysis),
    }
  }

  async updateKeyPolicy (actor, sourceId, input = {}, context = {}) {
    await this.ready()
    if (this.reconcilePromise) {
      throw createHttpError('缓存索引校准中，暂不能调整 URL 缓存键规则', 409, 'CACHE_TASK_BUSY')
    }
    const sources = await this.tileCatalogManager.listTileSources()
    if (!sources.some(source => source.id === sourceId)) {
      throw createHttpError('图源不存在', 404, 'RESOURCE_NOT_FOUND')
    }
    const current = this.keyPolicies[sourceId] || {}
    const rule = normalizeCacheKeyRule(input, current)
    if (rule.mode === 'normalized_v2') {
      const analysis = this.analyses.find(item => item.analysisId === input.analysisId && item.sourceId === sourceId)
      if (!analysis || analysis.expiresAt < Date.now()) {
        throw createHttpError('请先使用当前规则重新执行 URL 分析', 409, 'CACHE_ANALYSIS_REQUIRED')
      }
      if (analysis.ruleHash !== hashValue(rule)) {
        throw createHttpError('URL 规则已变化，请重新分析', 409, 'CACHE_ANALYSIS_MISMATCH')
      }
      if (!analysis.safeToEnable) {
        throw createHttpError('分析发现冲突或无法判断的脱敏参数，不能启用该规则', 409, 'CACHE_KEY_POLICY_CONFLICT')
      }
    }
    const next = {
      ...rule,
      revision: Number(current.revision || 0) + 1,
      analysisId: rule.mode === 'normalized_v2' ? input.analysisId : null,
      updatedAt: Date.now(),
    }
    this.keyPolicies = { ...this.keyPolicies, [sourceId]: next }
    await this.store.write('cache-key-policies', this.keyPolicies)
    if (next.mode === 'normalized_v2') await this.rebuildSourceAliases(sourceId, next)
    else this.index.clearCanonicalAliases(sourceId)
    this.audit(actor, 'admin.cache.key-policy.update', 'tile-source', sourceId, {
      previousMode: current.mode || 'full_url',
      nextMode: next.mode,
      revision: next.revision,
      analysisId: next.analysisId,
      ignoredQueryParams: next.ignoredQueryParams,
      equivalentHosts: next.equivalentHosts,
    }, context)
    return (await this.listKeyPolicies()).items.find(item => item.sourceId === sourceId)
  }

  async rebuildSourceAliases (sourceId, policy) {
    await this.flushPendingIndexWrites()
    this.index.clearCanonicalAliases(sourceId)
    let processed = 0
    let cursor = ''
    while (true) {
      const rows = this.index.listSourceEntriesPage(sourceId, cursor, RECONCILE_BATCH_SIZE)
      if (!rows.length) break
      const aliases = []
      for (const row of rows) {
        try {
          const canonicalUrl = canonicalizeCacheUrl(row.url, policy)
          const key = md5(`v2|source:${sourceId}|resource:${row.resourceType || 'raster'}|url:${canonicalUrl}|range:${row.range || ''}`)
          aliases.push({
            relativePath: row.relativePath,
            canonicalKey: key,
            revision: Number(policy.revision || 1),
          })
        } catch (err) {
          // Invalid legacy display URLs remain readable through the exact v1 fallback.
        }
      }
      this.index.setCanonicalAliases(aliases)
      processed += rows.length
      cursor = rows[rows.length - 1].relativePath
      await new Promise(resolve => setImmediate(resolve))
    }
    return processed
  }
}

export default CacheGovernanceService
