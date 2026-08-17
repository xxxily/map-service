import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import UserDatabase, { USER_DATABASE_VERSION } from '../service/bin/user/database.js'

test('UserDatabase initializes the relational schema once', () => {
  const database = new UserDatabase({ filePath: ':memory:' })
  try {
    const version = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()
    assert.equal(version.version, USER_DATABASE_VERSION)

    const tables = database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN (
        'users', 'sessions', 'kml_documents', 'kml_sync_create_keys',
        'kml_sync_delete_tombstones', 'favorite_places', 'kml_shares'
      )
      ORDER BY name
    `).all().map(row => row.name)
    assert.deepEqual(tables, [
      'favorite_places',
      'kml_documents',
      'kml_shares',
      'kml_sync_create_keys',
      'kml_sync_delete_tombstones',
      'sessions',
      'users',
    ])
  } finally {
    database.close()
  }
})

test('UserDatabase transactions roll back atomically and support savepoints', () => {
  const database = new UserDatabase({ filePath: ':memory:' })
  try {
    assert.throws(() => {
      database.transaction(() => {
        database.prepare('INSERT INTO permissions(code, name) VALUES (?, ?)').run('test.outer', '外层')
        database.transaction(() => {
          database.prepare('INSERT INTO permissions(code, name) VALUES (?, ?)').run('test.inner', '内层')
          throw new Error('rollback')
        })
      })
    }, /rollback/)

    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM permissions').get().count, 0)

    database.transaction(() => {
      database.prepare('INSERT INTO permissions(code, name) VALUES (?, ?)').run('test.saved', '已保存')
    })
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM permissions').get().count, 1)
  } finally {
    database.close()
  }
})

test('UserDatabase migrates v1 KML documents to owner-scoped sync idempotency keys', () => {
  const rawDatabase = new DatabaseSync(':memory:')
  rawDatabase.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    INSERT INTO schema_migrations(version, applied_at) VALUES (1, '2026-08-05T00:00:00.000Z');
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE kml_documents (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ''
    );
  `)

  const database = new UserDatabase({ filePath: ':memory:', database: rawDatabase })
  try {
    const columns = database.prepare('PRAGMA table_info(kml_documents)').all().map(row => row.name)
    assert.equal(columns.includes('sync_client_id'), true)
    assert.equal(
      database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version,
      USER_DATABASE_VERSION
    )

    database.prepare(`
      INSERT INTO kml_documents(id, owner_id, sync_client_id) VALUES (?, ?, ?)
    `).run('kml_one', 'usr_one', 'local-stable')
    assert.throws(() => {
      database.prepare(`
        INSERT INTO kml_documents(id, owner_id, sync_client_id) VALUES (?, ?, ?)
      `).run('kml_duplicate', 'usr_one', 'local-stable')
    }, /UNIQUE constraint failed/)
    assert.doesNotThrow(() => {
      database.prepare(`
        INSERT INTO kml_documents(id, owner_id, sync_client_id) VALUES (?, ?, ?)
      `).run('kml_other_owner', 'usr_two', 'local-stable')
    })
  } finally {
    database.close()
  }
})

test('UserDatabase resumes a partially applied v2 migration without repeating the column change', () => {
  const rawDatabase = new DatabaseSync(':memory:')
  rawDatabase.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    INSERT INTO schema_migrations(version, applied_at) VALUES (1, '2026-08-05T00:00:00.000Z');
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE kml_documents (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      sync_client_id TEXT,
      created_at TEXT NOT NULL DEFAULT ''
    );
  `)

  const database = new UserDatabase({ filePath: ':memory:', database: rawDatabase })
  try {
    assert.equal(
      database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version,
      USER_DATABASE_VERSION
    )
    assert.ok(database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name = 'idx_kml_owner_sync_client'
    `).get())
  } finally {
    database.close()
  }
})

test('UserDatabase v3 backfills durable sync create keys from v2 documents', () => {
  const rawDatabase = new DatabaseSync(':memory:')
  rawDatabase.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    INSERT INTO schema_migrations(version, applied_at) VALUES (2, '2026-08-05T00:00:00.000Z');
    CREATE TABLE users (id TEXT PRIMARY KEY);
    INSERT INTO users(id) VALUES ('usr_one');
    CREATE TABLE kml_documents (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      sync_client_id TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO kml_documents(id, owner_id, sync_client_id, created_at)
    VALUES ('kml_one', 'usr_one', 'local-stable', '2026-08-05T00:00:00.000Z');
  `)

  const database = new UserDatabase({ filePath: ':memory:', database: rawDatabase })
  try {
    assert.deepEqual({ ...database.prepare(`
      SELECT owner_id, client_id, kml_id, deleted_at
      FROM kml_sync_create_keys
    `).get() }, {
      owner_id: 'usr_one',
      client_id: 'local-stable',
      kml_id: 'kml_one',
      deleted_at: null,
    })
  } finally {
    database.close()
  }
})

test('UserDatabase v4 adds durable tombstones for delete-before-create ordering', () => {
  const rawDatabase = new DatabaseSync(':memory:')
  rawDatabase.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    INSERT INTO schema_migrations(version, applied_at) VALUES (3, '2026-08-05T00:00:00.000Z');
    CREATE TABLE users (id TEXT PRIMARY KEY);
    INSERT INTO users(id) VALUES ('usr_one');
  `)

  const database = new UserDatabase({ filePath: ':memory:', database: rawDatabase })
  try {
    database.prepare(`
      INSERT INTO kml_sync_delete_tombstones(owner_id, client_id, deleted_at)
      VALUES (?, ?, ?)
    `).run('usr_one', 'local-deleted', '2026-08-05T00:00:01.000Z')
    assert.deepEqual({ ...database.prepare(`
      SELECT owner_id, client_id, deleted_at
      FROM kml_sync_delete_tombstones
    `).get() }, {
      owner_id: 'usr_one',
      client_id: 'local-deleted',
      deleted_at: '2026-08-05T00:00:01.000Z',
    })
    assert.equal(
      database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version,
      USER_DATABASE_VERSION
    )
  } finally {
    database.close()
  }
})

test('UserDatabase v5 adds spatial share fields and nullable unlimited sessions', () => {
  const rawDatabase = new DatabaseSync(':memory:')
  rawDatabase.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    INSERT INTO schema_migrations(version, applied_at) VALUES (4, '2026-08-15T00:00:00.000Z');
    CREATE TABLE users (id TEXT PRIMARY KEY);
    INSERT INTO users(id) VALUES ('usr_one');
    CREATE TABLE kml_shares (
      id TEXT PRIMARY KEY,
      public_id TEXT NOT NULL UNIQUE,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      access_mode TEXT NOT NULL DEFAULT 'public_link',
      password_hash TEXT,
      allow_download INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      view_config_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      blocked_reason TEXT NOT NULL DEFAULT '',
      access_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_accessed_at TEXT,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO kml_shares(
      id, public_id, owner_id, title, created_at, updated_at
    ) VALUES (
      'shr_one', 'public-one', 'usr_one', '旧分享',
      '2026-08-15T00:00:00.000Z', '2026-08-15T00:00:00.000Z'
    );
    CREATE TABLE share_access_sessions (
      id TEXT PRIMARY KEY,
      share_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (share_id) REFERENCES kml_shares(id) ON DELETE CASCADE
    );
    INSERT INTO share_access_sessions(
      id, share_id, token_hash, created_at, expires_at
    ) VALUES (
      'sas_one', 'shr_one', 'hash-one',
      '2026-08-15T00:00:00.000Z', '2026-08-15T01:00:00.000Z'
    );
  `)

  const database = new UserDatabase({ filePath: ':memory:', database: rawDatabase })
  try {
    const share = database.prepare(`
      SELECT spatial_access_mode, password_access_ttl_mode, spatial_scope_revision,
             spatial_status, password_version, access_policy_revision
      FROM kml_shares WHERE id = 'shr_one'
    `).get()
    assert.deepEqual({ ...share }, {
      spatial_access_mode: 'unrestricted',
      password_access_ttl_mode: 'finite',
      spatial_scope_revision: 0,
      spatial_status: 'ready',
      password_version: 1,
      access_policy_revision: 1,
    })

    const session = database.prepare(`
      SELECT ttl_mode, password_version, policy_revision, last_accessed_at, revoke_reason
      FROM share_access_sessions WHERE id = 'sas_one'
    `).get()
    assert.deepEqual({ ...session }, {
      ttl_mode: 'finite',
      password_version: 1,
      policy_revision: 1,
      last_accessed_at: '2026-08-15T00:00:00.000Z',
      revoke_reason: '',
    })
    const expiresColumn = database.prepare('PRAGMA table_info(share_access_sessions)').all()
      .find(column => column.name === 'expires_at')
    assert.equal(expiresColumn.notnull, 0)
    assert.doesNotThrow(() => {
      database.prepare(`
        INSERT INTO share_access_sessions(
          id, share_id, token_hash, created_at, ttl_mode, expires_at,
          password_version, policy_revision, last_accessed_at
        ) VALUES (?, ?, ?, ?, 'unlimited', NULL, 1, 1, ?)
      `).run(
        'sas_unlimited', 'shr_one', 'hash-unlimited',
        '2026-08-15T00:00:00.000Z', '2026-08-15T00:00:00.000Z'
      )
    })
  } finally {
    database.close()
  }
})

test('UserDatabase v6 backfills published KML snapshots for existing shares', () => {
  const rawDatabase = new DatabaseSync(':memory:')
  rawDatabase.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations(version, applied_at) VALUES (5, '2026-08-16T00:00:00.000Z');
    CREATE TABLE users (id TEXT PRIMARY KEY);
    INSERT INTO users(id) VALUES ('usr_one');
    CREATE TABLE kml_documents (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', coord_correction TEXT NOT NULL DEFAULT 'none',
      theme TEXT NOT NULL DEFAULT 'default', color TEXT NOT NULL DEFAULT '#0f766e',
      lock_drag INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
      is_live_track INTEGER NOT NULL DEFAULT 0, features_json TEXT NOT NULL DEFAULT '[]',
      feature_count INTEGER NOT NULL DEFAULT 0, byte_size INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO kml_documents(
      id, owner_id, name, description, features_json, feature_count, byte_size, revision, updated_at
    ) VALUES (
      'kml_one', 'usr_one', '旧路线', '迁移说明',
      '[{"id":"point-one","type":"Point","coordinates":[113.2,23.1]}]', 1, 88, 7,
      '2026-08-16T00:01:00.000Z'
    );
    CREATE TABLE kml_shares (
      id TEXT PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL,
      title TEXT NOT NULL, updated_at TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );
    INSERT INTO kml_shares(id, public_id, owner_id, title, updated_at, created_at)
    VALUES ('shr_one', 'public-one', 'usr_one', '旧分享',
      '2026-08-16T00:02:00.000Z', '2026-08-16T00:00:00.000Z');
    CREATE TABLE kml_share_items (
      id TEXT PRIMARY KEY, share_id TEXT NOT NULL, kml_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0, visible_by_default INTEGER NOT NULL DEFAULT 1,
      display_name TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (share_id) REFERENCES kml_shares(id) ON DELETE CASCADE,
      FOREIGN KEY (kml_id) REFERENCES kml_documents(id) ON DELETE CASCADE
    );
    INSERT INTO kml_share_items(id, share_id, kml_id)
    VALUES ('shi_one', 'shr_one', 'kml_one');
  `)

  const database = new UserDatabase({ filePath: ':memory:', database: rawDatabase })
  try {
    const share = database.prepare(`
      SELECT content_revision, content_published_at FROM kml_shares WHERE id = 'shr_one'
    `).get()
    assert.deepEqual({ ...share }, {
      content_revision: 1,
      content_published_at: '2026-08-16T00:02:00.000Z',
    })
    const item = database.prepare(`
      SELECT published_revision, published_snapshot_json, published_at
      FROM kml_share_items WHERE id = 'shi_one'
    `).get()
    assert.equal(item.published_revision, 7)
    assert.equal(item.published_at, '2026-08-16T00:02:00.000Z')
    const snapshot = JSON.parse(item.published_snapshot_json)
    assert.equal(snapshot.name, '旧路线')
    assert.equal(snapshot.description, '迁移说明')
    assert.equal(snapshot.features[0].id, 'point-one')
    assert.equal(snapshot.revision, 7)
  } finally {
    database.close()
  }
})
