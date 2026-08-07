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
