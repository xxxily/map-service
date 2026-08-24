import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export const RETENTION_WINDOWS_DAYS = Object.freeze({
  publicComments: 730,
  privateComments: 90,
  anonymousContact: 90,
  aiRawResults: 30,
  reports: 730,
  reportEvents: 30,
  outbox: 90,
})

function retentionWindows (options = {}) {
  const configured = options.retention && typeof options.retention === 'object' ? options.retention : {}
  const result = { ...RETENTION_WINDOWS_DAYS }
  for (const key of Object.keys(result)) {
    const value = Number(configured[key])
    if (Number.isFinite(value) && value > 0) result[key] = Math.floor(value)
  }
  return result
}

const isoDaysAgo = (now, days) => new Date(new Date(now).getTime() - days * 86400000).toISOString()

export function sanitizeInteractionLog (value) {
  if (value == null) return value
  if (typeof value === 'string') {
    return value
      .replace(/(authorization|cookie|token|password|secret|api[_-]?key)\s*[:=]\s*[^,;\s]+/gi, '$1=[redacted]')
      .replace(/([?&](?:token|password|secret|api[_-]?key)=)[^&#\s]+/gi, '$1[redacted]')
      .slice(0, 1000)
  }
  if (Array.isArray(value)) return value.map(sanitizeInteractionLog)
  if (typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = /body|contact|email|phone|ip|user.?agent|cookie|token|secret|password/i.test(key)
        ? '[redacted]'
        : sanitizeInteractionLog(item)
    }
    return out
  }
  return value
}

function counts (database, sql, params = []) {
  return Number(database.prepare(sql).get(...params)?.count || 0)
}

export function previewRetention (database, options = {}) {
  const now = options.now || new Date().toISOString()
  const windows = retentionWindows(options)
  const comments = counts(database, 'SELECT COUNT(*) count FROM comments WHERE retention_expires_at IS NOT NULL AND retention_expires_at <= ? AND legal_hold = 0', [now])
  const reports = counts(database, 'SELECT COUNT(*) count FROM reports WHERE retention_expires_at IS NOT NULL AND retention_expires_at <= ? AND legal_hold = 0', [now])
  const decisions = counts(database, 'SELECT COUNT(*) count FROM comment_moderation_decisions WHERE raw_result_expires_at IS NOT NULL AND raw_result_expires_at <= ?', [now])
  const events = counts(database, 'SELECT COUNT(*) count FROM report_events WHERE created_at <= ?', [isoDaysAgo(now, windows.reportEvents)])
  const outbox = counts(database, "SELECT COUNT(*) count FROM comment_outbox WHERE status IN ('sent','failed') AND created_at <= ?", [isoDaysAgo(now, windows.outbox)])
  return { now, comments, reports, aiRawResults: decisions, reportEvents: events, outbox, total: comments + reports + decisions + events + outbox }
}

export function applyRetention (database, options = {}) {
  const now = options.now || new Date().toISOString()
  const windows = retentionWindows(options)
  if (options.dryRun !== false) return { dryRun: true, ...previewRetention(database, { now, retention: windows }) }
  const preview = previewRetention(database, { now, retention: windows })
  return database.transaction(() => {
    database.prepare('UPDATE comment_moderation_decisions SET raw_result_ciphertext = \'\', raw_result_expires_at = NULL WHERE raw_result_expires_at IS NOT NULL AND raw_result_expires_at <= ?').run(now)
    database.prepare(`
      UPDATE comments
      SET contact_ciphertext = '', contact_hash = '', contact_type = '', contact_expires_at = NULL, updated_at = ?
      WHERE contact_expires_at IS NOT NULL AND contact_expires_at <= ? AND legal_hold = 0
    `).run(now, now)
    database.prepare('DELETE FROM report_events WHERE created_at <= ?').run(isoDaysAgo(now, windows.reportEvents))
    database.prepare("DELETE FROM comment_outbox WHERE status IN ('sent','failed') AND created_at <= ?").run(isoDaysAgo(now, windows.outbox))
    database.prepare('DELETE FROM reports WHERE retention_expires_at IS NOT NULL AND retention_expires_at <= ? AND legal_hold = 0').run(now)
    // Replies reference parents with ON DELETE RESTRICT; remove expired rows deepest-first.
    database.prepare('DELETE FROM comments WHERE retention_expires_at IS NOT NULL AND retention_expires_at <= ? AND legal_hold = 0 AND thread_depth = 1').run(now)
    database.prepare('DELETE FROM comments WHERE retention_expires_at IS NOT NULL AND retention_expires_at <= ? AND legal_hold = 0 AND thread_depth = 0').run(now)
    return { dryRun: false, ...preview }
  })
}

export function aggregateInteractionMetrics (database, options = {}) {
  const since = options.since || new Date(Date.now() - 30 * 86400000).toISOString()
  const row = database.prepare(`SELECT
    COUNT(*) submissions,
    SUM(CASE WHEN moderation_status = 'approved' THEN 1 ELSE 0 END) approved,
    SUM(CASE WHEN moderation_status IN ('rejected','spam','quarantined') THEN 1 ELSE 0 END) rejected,
    SUM(CASE WHEN moderation_status = 'pending' THEN 1 ELSE 0 END) pending,
    AVG(CASE WHEN moderation_status = 'approved' AND approved_at IS NOT NULL THEN (julianday(approved_at)-julianday(created_at))*86400 END) approvalSlaSeconds
    FROM comments WHERE created_at >= ?`).get(since) || {}
  const report = database.prepare(`SELECT COUNT(*) reports, AVG(CASE WHEN closed_at IS NOT NULL THEN (julianday(closed_at)-julianday(created_at))*86400 END) reportSlaSeconds FROM reports WHERE created_at >= ?`).get(since) || {}
  const errors = database.prepare("SELECT COUNT(*) count FROM comment_outbox WHERE status = 'failed' AND created_at >= ?").get(since)
  return { since, submissions: Number(row.submissions || 0), approved: Number(row.approved || 0), rejected: Number(row.rejected || 0), pending: Number(row.pending || 0), approvalSlaSeconds: row.approvalSlaSeconds == null ? null : Number(row.approvalSlaSeconds), reports: Number(report.reports || 0), reportSlaSeconds: report.reportSlaSeconds == null ? null : Number(report.reportSlaSeconds), serviceErrors: Number(errors?.count || 0) }
}

async function sha256 (filePath) {
  const hash = crypto.createHash('sha256')
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

export async function createInteractionBackup ({ sourcePath, destinationDir, now = new Date().toISOString() }) {
  await fsp.mkdir(destinationDir, { recursive: true })
  const stamp = now.replace(/[:.]/g, '-')
  const target = path.join(destinationDir, `interaction-${stamp}.sqlite`)
  const temp = `${target}.tmp`
  await fsp.copyFile(sourcePath, temp)
  await fsp.rename(temp, target)
  const manifest = { version: 1, source: path.basename(sourcePath), file: path.basename(target), size: (await fsp.stat(target)).size, sha256: await sha256(target), createdAt: now }
  await fsp.writeFile(`${target}.manifest.json`, JSON.stringify(manifest, null, 2), 'utf8')
  return manifest
}

export async function restoreInteractionBackup ({ backupPath, manifestPath = `${backupPath}.manifest.json`, targetPath }) {
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'))
  const actual = await sha256(backupPath)
  if (actual !== manifest.sha256) throw new Error('备份校验失败')
  const temp = `${targetPath}.restore-${process.pid}`
  await fsp.copyFile(backupPath, temp)
  await fsp.rename(temp, targetPath)
  return { restored: true, sha256: actual, size: manifest.size }
}
