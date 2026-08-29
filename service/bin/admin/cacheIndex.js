import fs from 'fs-extra'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const CACHE_STATE_SQL = `CASE
  WHEN expires_at > ? THEN 'fresh'
  WHEN stale_expires_at > ? THEN 'stale'
  ELSE 'expired'
END`

function numberOrNull (value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mapGroupRows (rows = []) {
  const result = {}
  rows.forEach((row) => {
    if (!row.group_id) return
    result[row.group_id] = {
      files: Number(row.files || 0),
      bytes: Number(row.bytes || 0),
      size: Number(row.bytes || 0),
      fresh: Number(row.fresh || 0),
      stale: Number(row.stale || 0),
      expired: Number(row.expired || 0),
    }
  })
  return result
}

export class CacheIndex {
  constructor (options = {}) {
    this.filePath = options.filePath || ':memory:'
    if (!options.database && this.filePath !== ':memory:') {
      fs.ensureDirSync(path.dirname(this.filePath))
    }
    this.database = options.database || new DatabaseSync(this.filePath)
    this.initialize()
  }

  initialize () {
    this.database.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS cache_entries (
        relative_path TEXT PRIMARY KEY,
        meta_relative_path TEXT NOT NULL,
        provider TEXT,
        cache_key TEXT,
        display_url TEXT,
        source_id TEXT,
        layer_id TEXT,
        publish_id TEXT,
        resource_type TEXT,
        range_value TEXT,
        key_version TEXT,
        policy_revision INTEGER,
        size INTEGER NOT NULL,
        meta_size INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        stale_expires_at INTEGER,
        etag TEXT,
        content_type TEXT,
        canonical_key TEXT,
        canonical_policy_revision INTEGER,
        generation TEXT,
        indexed_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cache_entries_source_updated
        ON cache_entries(source_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_cache_entries_expiry
        ON cache_entries(expires_at, stale_expires_at);
      CREATE INDEX IF NOT EXISTS idx_cache_entries_resource
        ON cache_entries(resource_type, updated_at);
      CREATE TABLE IF NOT EXISTS cache_index_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL DEFAULT 'empty',
        generation TEXT,
        scanned_entries INTEGER NOT NULL DEFAULT 0,
        indexed_entries INTEGER NOT NULL DEFAULT 0,
        last_started_at INTEGER,
        last_completed_at INTEGER,
        error TEXT
      );
      INSERT OR IGNORE INTO cache_index_state(id, status) VALUES (1, 'empty');
    `)
    this.ensureColumn('cache_entries', 'canonical_key', 'TEXT')
    this.ensureColumn('cache_entries', 'canonical_policy_revision', 'INTEGER')
    this.database.exec('CREATE INDEX IF NOT EXISTS idx_cache_entries_canonical ON cache_entries(source_id, canonical_key)')
    this.upsertStatement = this.database.prepare(`
      INSERT INTO cache_entries(
        relative_path, meta_relative_path, provider, cache_key, display_url,
        source_id, layer_id, publish_id, resource_type, range_value,
        key_version, policy_revision, size, meta_size, updated_at, expires_at,
        stale_expires_at, etag, content_type, canonical_key,
        canonical_policy_revision, generation, indexed_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(relative_path) DO UPDATE SET
        meta_relative_path = excluded.meta_relative_path,
        provider = excluded.provider,
        cache_key = excluded.cache_key,
        display_url = excluded.display_url,
        source_id = excluded.source_id,
        layer_id = excluded.layer_id,
        publish_id = excluded.publish_id,
        resource_type = excluded.resource_type,
        range_value = excluded.range_value,
        key_version = excluded.key_version,
        policy_revision = excluded.policy_revision,
        size = excluded.size,
        meta_size = excluded.meta_size,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at,
        stale_expires_at = excluded.stale_expires_at,
        etag = excluded.etag,
        content_type = excluded.content_type,
        canonical_key = COALESCE(excluded.canonical_key, cache_entries.canonical_key),
        canonical_policy_revision = COALESCE(excluded.canonical_policy_revision, cache_entries.canonical_policy_revision),
        generation = excluded.generation,
        indexed_at = excluded.indexed_at
    `)
  }

  ensureColumn (table, column, definition) {
    const columns = this.database.prepare(`PRAGMA table_info(${table})`).all()
    if (!columns.some(item => item.name === column)) {
      this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  }

  close () {
    this.closed = true
    this.database.close()
  }

  currentGeneration () {
    const row = this.database.prepare('SELECT status, generation FROM cache_index_state WHERE id = 1').get()
    return row?.status === 'running' ? row.generation : null
  }

  upsert (entry = {}, options = {}) {
    const relativePath = String(entry.relativePath || '')
    const metaRelativePath = String(entry.metaRelativePath || '')
    if (!relativePath || !metaRelativePath) return
    const generation = Object.hasOwn(options, 'generation') ? options.generation : this.currentGeneration()
    this.upsertStatement.run(
      relativePath,
      metaRelativePath,
      entry.provider || null,
      entry.key || null,
      entry.url || null,
      entry.sourceId || null,
      entry.layerId || null,
      entry.publishId || null,
      entry.resourceType || null,
      entry.range || null,
      entry.keyVersion || null,
      numberOrNull(entry.policyRevision),
      Math.max(0, Number(entry.size) || 0),
      Math.max(0, Number(entry.metaSize) || 0),
      Math.max(0, Number(entry.updatedAt) || Date.now()),
      numberOrNull(entry.expiresAt),
      numberOrNull(entry.staleExpiresAt),
      entry.etag || null,
      entry.contentType || null,
      entry.canonicalKey || null,
      numberOrNull(entry.canonicalPolicyRevision),
      generation,
      Date.now()
    )
  }

  upsertMany (entries = [], options = {}) {
    const values = entries.filter(entry => entry?.relativePath && entry?.metaRelativePath)
    if (!values.length) return 0
    const generation = Object.hasOwn(options, 'generation') ? options.generation : this.currentGeneration()
    this.database.exec('BEGIN')
    try {
      values.forEach(entry => this.upsert(entry, { generation }))
      this.database.exec('COMMIT')
      return values.length
    } catch (err) {
      this.database.exec('ROLLBACK')
      throw err
    }
  }

  remove (relativePath) {
    this.database.prepare('DELETE FROM cache_entries WHERE relative_path = ?').run(String(relativePath || ''))
  }

  removeMany (relativePaths = []) {
    const values = [...new Set(relativePaths.filter(Boolean).map(String))]
    if (!values.length) return
    const remove = this.database.prepare('DELETE FROM cache_entries WHERE relative_path = ?')
    this.database.exec('BEGIN')
    try {
      values.forEach(value => remove.run(value))
      this.database.exec('COMMIT')
    } catch (err) {
      this.database.exec('ROLLBACK')
      throw err
    }
  }

  clear () {
    this.database.prepare('DELETE FROM cache_entries').run()
    this.database.prepare(`
      UPDATE cache_index_state
      SET status = 'ready', generation = NULL, scanned_entries = 0,
          indexed_entries = 0, last_completed_at = ?, error = NULL
      WHERE id = 1
    `).run(Date.now())
  }

  markIncrementalDirty () {
    return Number(this.database.prepare(`
      UPDATE cache_index_state
      SET status = 'dirty'
      WHERE id = 1 AND status = 'ready'
    `).run()?.changes || 0) > 0
  }

  completeIncrementalFlush () {
    this.database.prepare(`
      UPDATE cache_index_state
      SET status = 'ready', error = NULL
      WHERE id = 1 AND status = 'dirty'
    `).run()
  }

  failIncrementalFlush (error) {
    this.database.prepare(`
      UPDATE cache_index_state
      SET status = 'dirty', error = ?
      WHERE id = 1 AND status IN ('ready', 'dirty')
    `).run(String(error || '增量索引写入失败').slice(0, 500))
  }

  entrySizes (relativePath) {
    const row = this.database.prepare(`
      SELECT size, meta_size AS metaSize, updated_at AS updatedAt
      FROM cache_entries
      WHERE relative_path = ?
    `).get(relativePath) || {}
    const bodyBytes = Number(row.size || 0)
    const sidecarBytes = Number(row.metaSize || 0)
    return {
      bodyBytes,
      sidecarBytes,
      physicalBytes: bodyBytes + sidecarBytes,
      updatedAt: numberOrNull(row.updatedAt),
    }
  }

  entrySize (relativePath) {
    return this.entrySizes(relativePath).bodyBytes
  }

  clearCanonicalAliases (sourceId) {
    this.database.prepare(`
      UPDATE cache_entries
      SET canonical_key = NULL, canonical_policy_revision = NULL
      WHERE source_id = ?
    `).run(sourceId)
  }

  setCanonicalAlias (relativePath, canonicalKey, revision) {
    this.database.prepare(`
      UPDATE cache_entries
      SET canonical_key = ?, canonical_policy_revision = ?
      WHERE relative_path = ?
    `).run(canonicalKey, revision, relativePath)
  }

  setCanonicalAliases (entries = []) {
    const values = entries.filter(entry => entry?.relativePath && entry?.canonicalKey)
    if (!values.length) return 0
    const update = this.database.prepare(`
      UPDATE cache_entries
      SET canonical_key = ?, canonical_policy_revision = ?
      WHERE relative_path = ?
    `)
    this.database.exec('BEGIN')
    try {
      values.forEach(entry => update.run(
        entry.canonicalKey,
        numberOrNull(entry.revision),
        entry.relativePath
      ))
      this.database.exec('COMMIT')
      return values.length
    } catch (err) {
      this.database.exec('ROLLBACK')
      throw err
    }
  }

  listSourceEntriesPage (sourceId, afterRelativePath = '', limit = 512) {
    return this.database.prepare(`
      SELECT relative_path AS relativePath, display_url AS url,
             resource_type AS resourceType, range_value AS range
      FROM cache_entries
      WHERE source_id = ? AND display_url IS NOT NULL AND display_url <> ''
        AND relative_path > ?
      ORDER BY relative_path
      LIMIT ?
    `).all(sourceId, afterRelativePath, limit)
  }

  findCanonicalAlias (sourceId, canonicalKey, excludedRelativePath = '') {
    return this.database.prepare(`
      SELECT relative_path AS relativePath, meta_relative_path AS metaRelativePath
      FROM cache_entries
      WHERE source_id = ? AND canonical_key = ? AND relative_path <> ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(sourceId, canonicalKey, excludedRelativePath) || null
  }

  beginReconcile (generation, startedAt = Date.now()) {
    this.database.prepare(`
      UPDATE cache_index_state
      SET status = 'running', generation = ?, scanned_entries = 0,
          indexed_entries = 0, last_started_at = ?, error = NULL
      WHERE id = 1
    `).run(generation, startedAt)
  }

  updateReconcileProgress (scannedEntries, indexedEntries) {
    this.database.prepare(`
      UPDATE cache_index_state
      SET scanned_entries = ?, indexed_entries = ?
      WHERE id = 1
    `).run(scannedEntries, indexedEntries)
  }

  completeReconcile (generation, completedAt = Date.now()) {
    this.database.exec('BEGIN')
    try {
      this.database.prepare('DELETE FROM cache_entries WHERE generation IS NOT ?').run(generation)
      const entries = Number(this.database.prepare('SELECT COUNT(*) AS count FROM cache_entries').get()?.count || 0)
      this.database.prepare(`
        UPDATE cache_index_state
        SET status = 'ready', generation = NULL, scanned_entries = ?,
            indexed_entries = ?, last_completed_at = ?, error = NULL
        WHERE id = 1
      `).run(entries, entries, completedAt)
      this.database.exec('COMMIT')
    } catch (err) {
      this.database.exec('ROLLBACK')
      throw err
    }
  }

  failReconcile (error) {
    this.database.prepare(`
      UPDATE cache_index_state
      SET status = CASE WHEN last_completed_at IS NULL THEN 'failed' ELSE 'stale' END,
          generation = NULL, error = ?
      WHERE id = 1
    `).run(String(error || '索引校准失败').slice(0, 500))
  }

  getStatus () {
    const state = this.database.prepare('SELECT * FROM cache_index_state WHERE id = 1').get() || {}
    const totals = this.database.prepare(`
      SELECT COUNT(*) AS entries,
             COALESCE(SUM(size), 0) AS body_bytes,
             COALESCE(SUM(meta_size), 0) AS sidecar_bytes
      FROM cache_entries
    `).get() || {}
    const ready = state.status === 'ready'
    return {
      status: state.status || 'empty',
      ready,
      exact: state.status === 'ready',
      refreshing: state.status === 'running',
      entries: Number(totals.entries || 0),
      bodyBytes: Number(totals.body_bytes || 0),
      sidecarBytes: Number(totals.sidecar_bytes || 0),
      estimatedPhysicalBytes: Number(totals.body_bytes || 0) + Number(totals.sidecar_bytes || 0),
      scannedEntries: Number(state.scanned_entries || 0),
      indexedEntries: Number(state.indexed_entries || 0),
      coverage: state.status === 'ready' ? 1 : 0,
      lastStartedAt: numberOrNull(state.last_started_at),
      lastReconciledAt: numberOrNull(state.last_completed_at),
      error: state.error || '',
    }
  }

  getOverview (now = Date.now()) {
    const summary = this.database.prepare(`
      SELECT COUNT(*) AS files,
             COALESCE(SUM(size), 0) AS bytes,
             COALESCE(SUM(meta_size), 0) AS sidecar_bytes,
             SUM(CASE WHEN ${CACHE_STATE_SQL} = 'fresh' THEN 1 ELSE 0 END) AS fresh,
             SUM(CASE WHEN ${CACHE_STATE_SQL} = 'stale' THEN 1 ELSE 0 END) AS stale,
             SUM(CASE WHEN ${CACHE_STATE_SQL} = 'expired' THEN 1 ELSE 0 END) AS expired
      FROM cache_entries
    `).get(now, now, now, now, now, now) || {}

    const groupQuery = (column) => this.database.prepare(`
      SELECT ${column} AS group_id,
             COUNT(*) AS files,
             COALESCE(SUM(size), 0) AS bytes,
             SUM(CASE WHEN ${CACHE_STATE_SQL} = 'fresh' THEN 1 ELSE 0 END) AS fresh,
             SUM(CASE WHEN ${CACHE_STATE_SQL} = 'stale' THEN 1 ELSE 0 END) AS stale,
             SUM(CASE WHEN ${CACHE_STATE_SQL} = 'expired' THEN 1 ELSE 0 END) AS expired
      FROM cache_entries
      WHERE ${column} IS NOT NULL AND ${column} <> ''
      GROUP BY ${column}
      ORDER BY bytes DESC
    `).all(now, now, now, now, now, now)

    const entries = this.database.prepare(`
      SELECT cache_key AS key, display_url AS url, source_id AS sourceId,
             layer_id AS layerId, publish_id AS publishId,
             resource_type AS resourceType, range_value AS range,
             size, updated_at AS updatedAt, expires_at AS expiresAt,
             ${CACHE_STATE_SQL} AS state
      FROM cache_entries
      ORDER BY updated_at DESC
      LIMIT 100
    `).all(now, now).map(row => ({ ...row, size: Number(row.size || 0), updatedAt: Number(row.updatedAt || 0) }))

    const index = this.getStatus()
    return {
      cacheDir: null,
      files: Number(summary.files || 0),
      bytes: Number(summary.bytes || 0),
      sidecarBytes: Number(summary.sidecar_bytes || 0),
      physicalBytes: Number(summary.bytes || 0) + Number(summary.sidecar_bytes || 0),
      fresh: Number(summary.fresh || 0),
      stale: Number(summary.stale || 0),
      expired: Number(summary.expired || 0),
      providers: mapGroupRows(groupQuery('provider')),
      bySource: mapGroupRows(groupQuery('source_id')),
      byLayer: mapGroupRows(groupQuery('layer_id')),
      byPublish: mapGroupRows(groupQuery('publish_id')),
      byResourceType: mapGroupRows(groupQuery('resource_type')),
      entries,
      generatedAt: index.lastReconciledAt || Date.now(),
      refreshing: index.refreshing,
      index,
    }
  }

  selectionSql (filter = {}, selectionCutoff = Date.now()) {
    const now = Number(filter.now || Date.now())
    const where = ['updated_at <= ?']
    const params = [selectionCutoff]

    if (filter.sourceIds?.length) {
      where.push(`source_id IN (${filter.sourceIds.map(() => '?').join(', ')})`)
      params.push(...filter.sourceIds)
    }
    if (filter.resourceTypes?.length) {
      where.push(`resource_type IN (${filter.resourceTypes.map(() => '?').join(', ')})`)
      params.push(...filter.resourceTypes)
    }
    if (filter.orphanedOnly) {
      where.push("(source_id IS NULL OR source_id = '')")
    }
    if (filter.expiredBeforeDays > 0) {
      where.push('stale_expires_at <= ?')
      params.push(now - filter.expiredBeforeDays * 24 * 60 * 60 * 1000)
    }

    const stateExpression = CACHE_STATE_SQL
    const stateParams = [now, now]
    let stateFilter = ''
    if (filter.states?.length) {
      stateFilter = `WHERE cache_state IN (${filter.states.map(() => '?').join(', ')})`
    }

    const maxFiles = Number.isSafeInteger(filter.maxFiles) ? filter.maxFiles : Number.MAX_SAFE_INTEGER
    const maxBytes = Number.isSafeInteger(filter.maxBytes) ? filter.maxBytes : Number.MAX_SAFE_INTEGER
    const sql = `
      WITH filtered AS (
        SELECT *, ${stateExpression} AS cache_state
        FROM cache_entries
        WHERE ${where.join(' AND ')}
      ), state_filtered AS (
        SELECT * FROM filtered ${stateFilter}
      ), ranked AS (
        SELECT *,
               ROW_NUMBER() OVER (ORDER BY updated_at ASC, relative_path ASC) AS row_num,
               SUM(size + meta_size) OVER (ORDER BY updated_at ASC, relative_path ASC) AS cumulative_bytes
        FROM state_filtered
      ), selected AS (
        SELECT * FROM ranked
        WHERE row_num <= ? AND cumulative_bytes <= ?
      )
    `
    return {
      sql,
      params: [...stateParams, ...params, ...(filter.states || []), maxFiles, maxBytes],
    }
  }

  previewSelection (filter = {}, selectionCutoff = Date.now()) {
    const selection = this.selectionSql(filter, selectionCutoff)
    const totals = this.database.prepare(`${selection.sql}
      SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes,
             COALESCE(SUM(meta_size), 0) AS sidecar_bytes,
             COALESCE(SUM(size + meta_size), 0) AS physical_bytes,
             SUM(CASE WHEN cache_state = 'fresh' THEN 1 ELSE 0 END) AS fresh,
             SUM(CASE WHEN cache_state = 'stale' THEN 1 ELSE 0 END) AS stale,
             SUM(CASE WHEN cache_state = 'expired' THEN 1 ELSE 0 END) AS expired
      FROM selected
    `).get(...selection.params) || {}
    const samples = this.database.prepare(`${selection.sql}
      SELECT relative_path AS relativePath, cache_key AS key, display_url AS url,
             source_id AS sourceId, resource_type AS resourceType,
             cache_state AS state, size, updated_at AS updatedAt
      FROM selected
      ORDER BY updated_at ASC
      LIMIT 100
    `).all(...selection.params).map(row => ({
      ...row,
      size: Number(row.size || 0),
      updatedAt: Number(row.updatedAt || 0),
    }))
    return {
      files: Number(totals.files || 0),
      bytes: Number(totals.physical_bytes || 0),
      bodyBytes: Number(totals.bytes || 0),
      sidecarBytes: Number(totals.sidecar_bytes || 0),
      fresh: Number(totals.fresh || 0),
      stale: Number(totals.stale || 0),
      expired: Number(totals.expired || 0),
      samples,
    }
  }

  selectBatch (filter = {}, selectionCutoff = Date.now()) {
    const selection = this.selectionSql(filter, selectionCutoff)
    return this.database.prepare(`${selection.sql}
      SELECT relative_path AS relativePath, meta_relative_path AS metaRelativePath,
             size, meta_size AS metaSize, size + meta_size AS physicalSize,
             updated_at AS updatedAt, source_id AS sourceId
      FROM selected
      ORDER BY updated_at ASC, relative_path ASC
    `).all(...selection.params).map(row => ({
      ...row,
      size: Number(row.size || 0),
      metaSize: Number(row.metaSize || 0),
      physicalSize: Number(row.physicalSize || 0),
      updatedAt: Number(row.updatedAt || 0),
    }))
  }

  removeIfMatch (relativePath, updatedAt, size) {
    return Number(this.database.prepare(`
      DELETE FROM cache_entries
      WHERE relative_path = ? AND updated_at = ? AND size = ?
    `).run(relativePath, updatedAt, size)?.changes || 0) > 0
  }

  listSourceUrls (sourceId, limit) {
    const total = Number(this.database.prepare('SELECT COUNT(*) AS count FROM cache_entries WHERE source_id = ?').get(sourceId)?.count || 0)
    const analyzable = Number(this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM cache_entries
      WHERE source_id = ? AND display_url IS NOT NULL AND display_url <> ''
    `).get(sourceId)?.count || 0)
    const rows = this.database.prepare(`
      SELECT relative_path AS relativePath, cache_key AS key, display_url AS url,
             size, etag, content_type AS contentType, updated_at AS updatedAt
      FROM cache_entries
      WHERE source_id = ? AND display_url IS NOT NULL AND display_url <> ''
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(sourceId, limit).map(row => ({
      ...row,
      size: Number(row.size || 0),
      updatedAt: Number(row.updatedAt || 0),
    }))
    return { total, analyzable, rows }
  }
}

export default CacheIndex
