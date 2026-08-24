import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'

import InteractionDatabase, { INTERACTION_DATABASE_VERSION, SCHEMA_V1 } from '../service/bin/interaction/database.js'
import { encryptInteractionSecret } from '../service/bin/interaction/security.js'

const TEST_SECRET = 'interaction-database-test-key'
const TEST_NOW = '2026-08-23T00:00:00.000Z'

function ciphertext (value, purpose = 'test') {
  return encryptInteractionSecret(value, TEST_SECRET, purpose)
}

function insertPolicyVersion (database, version = 1, active = 1) {
  database.prepare(`
    INSERT INTO interaction_policy_versions(version, policy_json, active, created_at)
    VALUES (?, '{}', ?, ?)
  `).run(version, active, TEST_NOW)
}

function insertComment (database, overrides = {}) {
  const row = {
    id: 'cmt_default',
    siteId: 'map-service',
    canonicalShareId: 'share_one',
    sharePublicIdSnapshot: 'shr_public_demo',
    shareItemId: 'shi_demo',
    featureId: 'feature_demo',
    mediaId: '',
    scope: 'feature',
    parentId: null,
    threadDepth: 0,
    authorType: 'anonymous',
    authorUserId: '',
    authorKey: 'anon_default',
    displayName: '访客',
    bodyRawEncrypted: ciphertext('公开内容', 'comment-body'),
    bodyNormalized: '公开内容',
    bodyRendered: '公开内容',
    consentPolicyVersion: 1,
    contactCiphertext: '',
    contactHash: '',
    contactType: '',
    contentStatus: 'active',
    moderationStatus: 'approved',
    approvedAt: TEST_NOW,
    clientRequestId: '',
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
    ...overrides,
  }
  database.prepare(`
    INSERT INTO comments (
      id, site_id, canonical_share_id, share_public_id_snapshot, share_item_id,
      feature_id, media_id, scope, parent_id, thread_depth, author_type,
      author_user_id, author_key, display_name_snapshot, body_raw_encrypted,
      body_normalized, body_rendered, consent_policy_version, contact_ciphertext,
      contact_hash, contact_type, content_status, moderation_status, approved_at,
      client_request_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id, row.siteId, row.canonicalShareId, row.sharePublicIdSnapshot, row.shareItemId,
    row.featureId, row.mediaId, row.scope, row.parentId, row.threadDepth, row.authorType,
    row.authorUserId, row.authorKey, row.displayName, row.bodyRawEncrypted,
    row.bodyNormalized, row.bodyRendered, row.consentPolicyVersion, row.contactCiphertext,
    row.contactHash, row.contactType, row.contentStatus, row.moderationStatus,
    row.approvedAt, row.clientRequestId, row.createdAt, row.updatedAt
  )
  return row
}

function tableNames (database) {
  return database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (
      'comments', 'comment_moderation_decisions', 'comment_outbox',
      'interaction_policy_versions', 'moderation_keyword_versions', 'moderation_keyword_rules',
      'reports', 'report_events'
    ) ORDER BY name
  `).all().map(row => row.name)
}

test('interaction database creates schema v1 independently and is idempotent', () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  try {
    assert.equal(database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, INTERACTION_DATABASE_VERSION)
    assert.deepEqual(tableNames(database), [
      'comment_moderation_decisions',
      'comment_outbox',
      'comments',
      'interaction_policy_versions',
      'moderation_keyword_rules',
      'moderation_keyword_versions',
      'report_events',
      'reports',
    ])
    assert.equal(database.prepare('PRAGMA user_version').get().user_version, 0)
    const commentColumns = database.prepare('PRAGMA table_info(comments)').all().map(row => row.name)
    const decisionColumns = database.prepare('PRAGMA table_info(comment_moderation_decisions)').all().map(row => row.name)
    assert.equal(commentColumns.includes('consent_policy_version'), true)
    assert.equal(decisionColumns.includes('raw_result_ciphertext'), true)
    assert.equal(decisionColumns.includes('raw_result_encrypted'), false)
    assert.equal(
      database.prepare('PRAGMA table_info(comments)').all()
        .find(row => row.name === 'consent_policy_version')?.dflt_value,
      null
    )
    assert.equal(
      database.prepare('PRAGMA foreign_key_list(comments)').all()
        .some(row => row.from === 'consent_policy_version' && row.table === 'interaction_policy_versions'),
      true
    )
    database.migrate()
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 1)
  } finally {
    database.close()
  }
})

test('interaction database migration rolls back schema and version on failure', () => {
  const rawDatabase = new DatabaseSync(':memory:')
  let tablesDuringHook = []
  assert.throws(() => new InteractionDatabase({
    filePath: ':memory:',
    database: rawDatabase,
    migrationHook: (_version, database) => {
      tablesDuringHook = tableNames(database)
      throw new Error('migration failure')
    },
  }), /migration failure/)
  assert.equal(tablesDuringHook.includes('comments'), true)
  assert.deepEqual(tableNames(rawDatabase), [])
  assert.equal(rawDatabase.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get().count, 0)

  const database = new InteractionDatabase({ filePath: ':memory:', database: rawDatabase })
  try {
    assert.equal(database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 1)
  } finally {
    database.close()
  }
})

test('an existing v1 database receives the additive AI schema on reopen', () => {
  const rawDatabase = new DatabaseSync(':memory:')
  rawDatabase.exec(SCHEMA_V1)
  rawDatabase.exec('DROP TABLE ai_prompt_versions; DROP TABLE ai_provider_configs;')
  rawDatabase.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
  rawDatabase.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (1, ?)').run(TEST_NOW)
  rawDatabase.exec('DROP TABLE comment_moderation_decisions')
  rawDatabase.exec(`
    CREATE TABLE comment_moderation_decisions (
      id TEXT PRIMARY KEY,
      comment_id TEXT NOT NULL,
      content_revision INTEGER NOT NULL,
      stage TEXT NOT NULL,
      level TEXT NOT NULL,
      suggested_action TEXT NOT NULL,
      scores_json TEXT NOT NULL DEFAULT '{}',
      reason_codes_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      idempotency_key TEXT NOT NULL DEFAULT ''
    )
  `)
  const database = new InteractionDatabase({ filePath: ':memory:', database: rawDatabase })
  try {
    assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_provider_configs'").get().name, 'ai_provider_configs')
    assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_prompt_versions'").get().name, 'ai_prompt_versions')
    const columns = database.prepare('PRAGMA table_info(comment_moderation_decisions)').all().map(row => row.name)
    assert.equal(columns.includes('raw_result_ciphertext'), true)
    assert.equal(columns.includes('raw_result_expires_at'), true)
    assert.equal(database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version, 1)
  } finally {
    database.close()
  }
})

test('interaction schema protects status values, idempotency and sensitive-field boundaries', () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  try {
    assert.throws(() => insertComment(database, {
      id: 'cmt_policy_missing',
      authorKey: 'anon_policy_missing',
    }), /FOREIGN KEY constraint failed/)
    insertPolicyVersion(database)
    insertComment(database, {
      id: 'cmt_one',
      authorKey: 'anon_one',
      clientRequestId: 'req_one',
      moderationStatus: 'pending',
      approvedAt: null,
    })
    assert.throws(() => insertComment(database, {
      id: 'cmt_two',
      authorKey: 'anon_one',
      clientRequestId: 'req_one',
      bodyRawEncrypted: ciphertext('重复', 'comment-body'),
      bodyNormalized: '重复',
      bodyRendered: '重复',
      moderationStatus: 'pending',
      approvedAt: null,
      createdAt: '2026-08-23T00:00:01.000Z',
      updatedAt: '2026-08-23T00:00:01.000Z',
    }), /UNIQUE constraint failed/)
    assert.throws(() => insertComment(database, {
      id: 'cmt_plaintext',
      authorKey: 'anon_plaintext',
      bodyRawEncrypted: '公开内容',
    }), /CHECK constraint failed/)
    for (const [suffix, invalidCiphertext] of [
      ['empty_parts', 'aes-256-gcm$1$$$$'],
      ['spaces', 'aes-256-gcm$1$                $                      $AA'],
      ['short_iv', 'aes-256-gcm$1$AAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA$AA'],
      ['short_tag', 'aes-256-gcm$1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAA$AA'],
      ['bad_character', 'aes-256-gcm$1$AAAAAAAAAAAAAAA*$AAAAAAAAAAAAAAAAAAAAAA$AA'],
      ['bad_payload_length', 'aes-256-gcm$1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA$A'],
      ['nul_suffix', 'aes-256-gcm$1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA$AA\u0000!'],
    ]) {
      assert.throws(() => insertComment(database, {
        id: `cmt_${suffix}`,
        authorKey: `anon_${suffix}`,
        bodyRawEncrypted: invalidCiphertext,
      }), /CHECK constraint failed/)
    }
    assert.throws(() => insertComment(database, {
      id: 'cmt_unknown_policy',
      authorKey: 'anon_unknown_policy',
      consentPolicyVersion: 99,
    }), /FOREIGN KEY constraint failed/)
    assert.throws(() => insertComment(database, {
      id: 'cmt_invalid_contact',
      authorKey: 'anon_invalid_contact',
      contactCiphertext: 'aes-256-gcm$1$$$$',
      contactHash: 'contact-hash',
      contactType: 'email',
    }), /CHECK constraint failed/)
    assert.throws(() => database.prepare(`
      UPDATE comments SET moderation_status = 'published' WHERE id = 'cmt_one'
    `).run(), /CHECK constraint failed/)
    assert.throws(() => database.prepare(`
      UPDATE comments SET content_status = 'deleted' WHERE id = 'cmt_one'
    `).run(), /CHECK constraint failed/)
    assert.throws(() => database.prepare(`
      UPDATE comments SET moderation_status = 'orphaned' WHERE id = 'cmt_one'
    `).run(), /CHECK constraint failed/)
    assert.throws(() => database.prepare(`
      INSERT INTO comment_outbox (
        id, event_type, aggregate_type, aggregate_id, comment_id, dedupe_key,
        payload_json, status, available_at, created_at, updated_at
      ) VALUES ('evt_missing', 'comment.created', 'comment', 'cmt_missing', 'cmt_missing',
        'dedupe_missing', '{}', 'pending', ?, ?, ?)
    `).run(TEST_NOW, TEST_NOW, TEST_NOW), /FOREIGN KEY constraint failed/)
    assert.throws(() => database.prepare(`
      INSERT INTO comment_outbox (
        id, event_type, aggregate_type, aggregate_id, comment_id, dedupe_key,
        payload_json, status, available_at, created_at, updated_at
      ) VALUES ('evt_mismatch', 'comment.created', 'comment', 'cmt_other', 'cmt_one',
        'dedupe_mismatch', '{}', 'pending', ?, ?, ?)
    `).run(TEST_NOW, TEST_NOW, TEST_NOW), /CHECK constraint failed/)
    assert.throws(() => database.prepare(`
      INSERT INTO comment_moderation_decisions (
        id, comment_id, content_revision, stage, level, suggested_action,
        raw_result_ciphertext, raw_result_expires_at, created_at
      ) VALUES ('cmd_invalid_ciphertext', 'cmt_one', 1, 'ai', 'unknown', 'review', ?, ?, ?)
    `).run('aes-256-gcm$1$$$$', TEST_NOW, TEST_NOW), /CHECK constraint failed/)

    database.prepare(`
      INSERT INTO moderation_keyword_versions(version, source_policy_version, rules_hash, active, created_at)
      VALUES (1, 1, 'sha256:rules', 1, '2026-08-23T00:00:00.000Z')
    `).run()
    database.prepare(`
      INSERT INTO moderation_keyword_rules(
        id, policy_version, normalized_term, match_type, level, action, created_at, updated_at
      ) VALUES ('kwr_one', 1, '测试词', 'phrase', 'risk', 'flag', ?, ?)
    `).run('2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z')
    assert.throws(() => database.prepare(`
      INSERT INTO interaction_policy_versions(version, policy_json, active, created_at)
      VALUES (2, '{}', 1, '2026-08-23T00:00:01.000Z')
    `).run(), /UNIQUE constraint failed/)

    const reportSql = `
      INSERT INTO reports(
        id, site_id, report_type, canonical_share_id, share_public_id_snapshot,
        share_item_id, feature_id, media_id, scope, reporter_type, reporter_key,
        display_name_snapshot, contact_ciphertext, contact_hash,
        description_ciphertext, evidence_text_ciphertext, rights_attestation,
        consent_policy_version, created_at, updated_at
      ) VALUES (?, 'map-service', 'copyright_takedown', 'share_one', 'shr_public_demo',
        'shi_demo', 'feature_demo', 'media_demo', 'media', 'anonymous', 'anon_reporter',
        ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const contactCiphertext = ciphertext('rightsholder@example.com', 'report-contact')
    const descriptionCiphertext = ciphertext('请求下架', 'report-description')
    assert.throws(() => database.prepare(reportSql).run(
      'rpt_invalid', '权利人', contactCiphertext, 'contact-hash', descriptionCiphertext, '', 0,
      1, TEST_NOW, TEST_NOW
    ), /CHECK constraint failed/)
    assert.doesNotThrow(() => database.prepare(reportSql).run(
      'rpt_valid', '权利人', contactCiphertext, 'contact-hash', descriptionCiphertext, '', 1,
      1, TEST_NOW, TEST_NOW
    ))
    assert.throws(() => database.prepare(reportSql).run(
      'rpt_unknown_policy', '权利人', contactCiphertext, 'contact-hash', descriptionCiphertext, '', 1,
      99, TEST_NOW, TEST_NOW
    ), /FOREIGN KEY constraint failed/)
    assert.throws(() => database.prepare(reportSql).run(
      'rpt_invalid_ciphertext', '权利人', contactCiphertext, 'contact-hash', 'aes-256-gcm$1$$$$', '', 1,
      1, TEST_NOW, TEST_NOW
    ), /CHECK constraint failed/)
    assert.throws(() => database.prepare(reportSql).run(
      'rpt_invalid_evidence', '权利人', contactCiphertext, 'contact-hash', descriptionCiphertext,
      'aes-256-gcm$1$$$$', 1, 1, TEST_NOW, TEST_NOW
    ), /CHECK constraint failed/)
    assert.throws(() => database.prepare(reportSql).run(
      'rpt_invalid_contact', '权利人', 'aes-256-gcm$1$$$$', 'contact-hash', descriptionCiphertext,
      '', 1, 1, TEST_NOW, TEST_NOW
    ), /CHECK constraint failed/)
  } finally {
    database.close()
  }
})

test('interaction schema enforces first-level approved reply parents on the same resource', () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  try {
    insertPolicyVersion(database)
    insertComment(database, { id: 'cmt_parent', authorKey: 'anon_parent' })
    insertComment(database, {
      id: 'cmt_child',
      sharePublicIdSnapshot: 'shr_rotated_alias',
      parentId: 'cmt_parent',
      threadDepth: 1,
      authorKey: 'anon_child',
    })
    insertComment(database, {
      id: 'cmt_pending_parent',
      authorKey: 'anon_pending_parent',
      moderationStatus: 'pending',
      approvedAt: null,
    })

    assert.throws(() => insertComment(database, {
      id: 'cmt_cross_resource',
      canonicalShareId: 'share_other',
      parentId: 'cmt_parent',
      threadDepth: 1,
      authorKey: 'anon_cross_resource',
    }), /COMMENT_PARENT_INVALID/)
    assert.throws(() => insertComment(database, {
      id: 'cmt_unapproved_parent',
      parentId: 'cmt_pending_parent',
      threadDepth: 1,
      authorKey: 'anon_unapproved_parent',
    }), /COMMENT_PARENT_INVALID/)
    assert.throws(() => insertComment(database, {
      id: 'cmt_grandchild',
      parentId: 'cmt_child',
      threadDepth: 1,
      authorKey: 'anon_grandchild',
    }), /COMMENT_PARENT_INVALID/)
    assert.throws(
      () => database.prepare("DELETE FROM comments WHERE id = 'cmt_parent'").run(),
      /FOREIGN KEY constraint failed/
    )
    for (const sql of [
      "UPDATE comments SET canonical_share_id = 'share_other' WHERE id = 'cmt_parent'",
      "UPDATE comments SET share_item_id = 'shi_other' WHERE id = 'cmt_parent'",
      "UPDATE comments SET feature_id = 'feature_other' WHERE id = 'cmt_parent'",
      "UPDATE comments SET thread_depth = 1, parent_id = 'cmt_pending_parent' WHERE id = 'cmt_parent'",
    ]) {
      assert.throws(() => database.prepare(sql).run(), /COMMENT_PARENT_HAS_REPLIES/)
    }

    database.prepare(`
      UPDATE comments
      SET content_status = 'hidden', updated_at = ?
      WHERE id = 'cmt_parent'
    `).run('2026-08-23T00:00:02.000Z')
    assert.deepEqual({ ...database.prepare(`
      SELECT content_status, moderation_status FROM comments WHERE id = 'cmt_child'
    `).get() }, { content_status: 'hidden', moderation_status: 'approved' })
    assert.throws(() => database.prepare(`
      UPDATE comments SET content_status = 'active' WHERE id = 'cmt_child'
    `).run(), /COMMENT_PARENT_INVALID/)

    database.prepare(`
      UPDATE comments
      SET content_status = 'active', updated_at = ?
      WHERE id = 'cmt_parent'
    `).run('2026-08-23T00:00:03.000Z')
    assert.equal(
      database.prepare("SELECT content_status FROM comments WHERE id = 'cmt_child'").get().content_status,
      'hidden'
    )
    database.prepare(`
      UPDATE comments SET content_status = 'active', updated_at = ? WHERE id = 'cmt_child'
    `).run('2026-08-23T00:00:03.000Z')
    database.prepare(`
      UPDATE comments
      SET moderation_status = 'rejected', updated_at = ?
      WHERE id = 'cmt_parent'
    `).run('2026-08-23T00:00:04.000Z')
    assert.deepEqual({ ...database.prepare(`
      SELECT content_status, moderation_status FROM comments WHERE id = 'cmt_child'
    `).get() }, { content_status: 'hidden', moderation_status: 'approved' })

    database.prepare(`
      UPDATE comments
      SET moderation_status = 'orphaned', orphaned_at = ?, updated_at = ?
      WHERE id = 'cmt_parent'
    `).run('2026-08-23T00:00:05.000Z', '2026-08-23T00:00:05.000Z')
    assert.deepEqual({ ...database.prepare(`
      SELECT content_status, moderation_status, orphaned_at FROM comments WHERE id = 'cmt_child'
    `).get() }, {
      content_status: 'hidden',
      moderation_status: 'orphaned',
      orphaned_at: '2026-08-23T00:00:05.000Z',
    })
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM comments WHERE parent_id = 'cmt_parent'").get().count, 1)
  } finally {
    database.close()
  }
})
