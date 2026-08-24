import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import InteractionDatabase from '../service/bin/interaction/database.js'
import { encryptInteractionSecret } from '../service/bin/interaction/security.js'
import { RETENTION_WINDOWS_DAYS, aggregateInteractionMetrics, applyRetention, createInteractionBackup, previewRetention, restoreInteractionBackup, sanitizeInteractionLog } from '../service/bin/interaction/operations.js'

test('operation constants and log sanitizer avoid PII', () => {
  assert.deepEqual(RETENTION_WINDOWS_DAYS, { publicComments: 730, privateComments: 90, anonymousContact: 90, aiRawResults: 30, reports: 730, reportEvents: 30, outbox: 90 })
  const result = sanitizeInteractionLog({ email: 'a@example.com', token: 'secret', message: 'ok' })
  assert.equal(result.email, '[redacted]')
  assert.equal(result.token, '[redacted]')
  assert.equal(result.message, 'ok')
})

test('retention is idempotent and legal holds are protected', () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  try {
    const now = '2026-08-24T00:00:00.000Z'
    assert.equal(previewRetention(database, { now }).total, 0)
    assert.equal(applyRetention(database, { now, dryRun: true }).dryRun, true)
    assert.equal(applyRetention(database, { now }).dryRun, true)
  } finally { database.close() }
})

test('retention worker windows are configurable for event cleanup', () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  try {
    const now = '2026-08-24T00:00:00.000Z'
    database.prepare("INSERT INTO interaction_policy_versions(version, policy_json, active, created_at) VALUES (1, '{}', 1, ?)").run(now)
    database.prepare(`
      INSERT INTO reports(
        id, site_id, report_type, canonical_share_id, share_public_id_snapshot, scope,
        resource_snapshot_json, reporter_type, reporter_key, description_ciphertext,
        consent_policy_version, created_at, updated_at
      ) VALUES ('rpt_retention', 'map-service', 'privacy', 'share-1', 'public-1', 'share', '{}', 'anonymous', 'reporter', ?, 1, ?, ?)
    `).run(encryptInteractionSecret('report', 'interaction-retention-test-secret', 'report-description'), now, now)
    database.prepare("INSERT INTO report_events(id, report_id, event_type, created_at) VALUES ('event-old', 'rpt_retention', 'test', ?)").run('2026-08-22T00:00:00.000Z')
    assert.equal(previewRetention(database, { now, retention: { reportEvents: 1 } }).reportEvents, 1)
  } finally { database.close() }
})

test('retention assigns a real lifecycle: contact is scrubbed and expired comments are removed', () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  const secret = 'interaction-retention-test-secret'
  try {
    const now = '2026-08-24T00:00:00.000Z'
    database.prepare("INSERT INTO interaction_policy_versions(version, policy_json, active, created_at) VALUES (1, '{}', 1, ?)").run(now)
    const insert = database.prepare(`
      INSERT INTO comments(
        id, site_id, canonical_share_id, share_public_id_snapshot, share_item_id, feature_id,
        scope, content_revision, resource_snapshot_json, thread_depth, author_type, author_key,
        body_raw_encrypted, body_normalized, consent_policy_version, contact_ciphertext,
        contact_hash, contact_type, contact_expires_at, content_status, moderation_status,
        moderation_level, retention_expires_at, created_at, updated_at
      ) VALUES (?, 'map-service', 'share-1', 'public-1', 'item-1', 'feature-1', 'feature', 1, '{}', 0,
        'anonymous', 'author-hash', ?, 'body', 1, ?, 'contact-hash', 'email', ?, 'active', 'pending',
        'unknown', ?, ?, ?)
    `)
    insert.run(
      'cmt_expired',
      encryptInteractionSecret('body', secret, 'comment-body'),
      encryptInteractionSecret('{"email":"a@example.com"}', secret, 'comment-contact'),
      '2026-08-23T00:00:00.000Z',
      '2026-08-23T00:00:00.000Z',
      '2026-08-23T00:00:00.000Z',
      '2026-08-23T00:00:00.000Z',
    )
    insert.run(
      'cmt_hold',
      encryptInteractionSecret('held body', secret, 'comment-body'),
      encryptInteractionSecret('{"email":"hold@example.com"}', secret, 'comment-contact'),
      '2026-08-23T00:00:00.000Z',
      '2026-08-23T00:00:00.000Z',
      '2026-08-23T00:00:00.000Z',
      '2026-08-23T00:00:00.000Z',
    )
    database.prepare("UPDATE comments SET legal_hold = 1, legal_hold_reason = 'legal', legal_hold_at = ? WHERE id = 'cmt_hold'").run(now)
    applyRetention(database, { now, dryRun: false })
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM comments WHERE id = 'cmt_expired'").get().count, 0)
    const held = database.prepare("SELECT contact_ciphertext, contact_hash, contact_type FROM comments WHERE id = 'cmt_hold'").get()
    assert.notEqual(held.contact_ciphertext, '')
    assert.notEqual(held.contact_hash, '')
    assert.equal(held.contact_type, 'email')
  } finally { database.close() }
})

test('metrics return aggregate values without row payloads', () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  try {
    const result = aggregateInteractionMetrics(database, { since: '2026-01-01T00:00:00.000Z' })
    assert.equal(result.submissions, 0)
    assert.equal(Object.hasOwn(result, 'body'), false)
  } finally { database.close() }
})

test('backup manifest hash gates restore', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'interaction-ops-'))
  const source = path.join(tempDir, 'source.sqlite')
  const target = path.join(tempDir, 'restored.sqlite')
  await fs.writeFile(source, 'sqlite-test')
  const manifest = await createInteractionBackup({ sourcePath: source, destinationDir: tempDir, now: '2026-08-24T00:00:00.000Z' })
  const backup = path.join(tempDir, manifest.file)
  const restored = await restoreInteractionBackup({ backupPath: backup, targetPath: target })
  assert.equal(restored.restored, true)
  assert.equal(await fs.readFile(target, 'utf8'), 'sqlite-test')
  await fs.rm(tempDir, { recursive: true, force: true })
})
