import fs from 'fs-extra'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import rootPath from '../rootPath.js'

export const USER_DATABASE_VERSION = 6

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username_normalized TEXT NOT NULL UNIQUE,
  username_display TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'locked', 'deleted')),
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  locked_until TEXT,
  permissions_version INTEGER NOT NULL DEFAULT 1,
  quota_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL,
  permission_code TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_code),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL,
  permissions_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  reauthenticated_at TEXT,
  revoked_at TEXT,
  device_label TEXT NOT NULL DEFAULT '',
  ip_summary TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_system_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS kml_documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trashed')),
  coord_correction TEXT NOT NULL DEFAULT 'wgs84-to-gcj02',
  theme TEXT NOT NULL DEFAULT 'default',
  color TEXT NOT NULL DEFAULT '#0f766e',
  lock_drag INTEGER NOT NULL DEFAULT 0 CHECK (lock_drag IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  is_live_track INTEGER NOT NULL DEFAULT 0 CHECK (is_live_track IN (0, 1)),
  features_json TEXT NOT NULL DEFAULT '[]',
  feature_count INTEGER NOT NULL DEFAULT 0,
  byte_size INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  source_type TEXT NOT NULL DEFAULT 'created',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kml_default_owner
  ON kml_documents(owner_id)
  WHERE is_default = 1 AND status = 'active';

CREATE TABLE IF NOT EXISTS favorite_places (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  color TEXT NOT NULL DEFAULT '#2563eb',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kml_shares (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'revoked', 'blocked')),
  access_mode TEXT NOT NULL DEFAULT 'public_link' CHECK (access_mode IN ('public_link')),
  password_hash TEXT,
  allow_download INTEGER NOT NULL DEFAULT 1 CHECK (allow_download IN (0, 1)),
  expires_at TEXT,
  view_config_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  blocked_reason TEXT NOT NULL DEFAULT '',
  access_count INTEGER NOT NULL DEFAULT 0,
  content_revision INTEGER NOT NULL DEFAULT 1,
  content_published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kml_share_items (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  kml_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  visible_by_default INTEGER NOT NULL DEFAULT 1 CHECK (visible_by_default IN (0, 1)),
  display_name TEXT NOT NULL DEFAULT '',
  published_revision INTEGER NOT NULL DEFAULT 0,
  published_snapshot_json TEXT NOT NULL DEFAULT '{}',
  published_at TEXT,
  UNIQUE (share_id, kml_id),
  FOREIGN KEY (share_id) REFERENCES kml_shares(id) ON DELETE CASCADE,
  FOREIGN KEY (kml_id) REFERENCES kml_documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS share_access_sessions (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (share_id) REFERENCES kml_shares(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS local_migration_batches (
  user_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, batch_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT 'success',
  reason TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  ip_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_kml_owner_updated ON kml_documents(owner_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_owner_updated ON favorite_places(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shares_owner_updated ON kml_shares(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_items_order ON kml_share_items(share_id, position, id);
CREATE INDEX IF NOT EXISTS idx_share_access_expires ON share_access_sessions(share_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created ON audit_logs(actor_user_id, created_at DESC);
`

const SCHEMA_V2 = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_kml_owner_sync_client
  ON kml_documents(owner_id, sync_client_id)
  WHERE sync_client_id IS NOT NULL AND sync_client_id <> '';
`

const SCHEMA_V3 = `
CREATE TABLE IF NOT EXISTS kml_sync_create_keys (
  owner_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  kml_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  PRIMARY KEY (owner_id, client_id),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kml_sync_create_kml
  ON kml_sync_create_keys(kml_id);

INSERT OR IGNORE INTO kml_sync_create_keys(
  owner_id, client_id, kml_id, created_at, deleted_at
)
SELECT owner_id, sync_client_id, id, created_at, NULL
FROM kml_documents
WHERE sync_client_id IS NOT NULL AND sync_client_id <> '';
`

const SCHEMA_V4 = `
CREATE TABLE IF NOT EXISTS kml_sync_delete_tombstones (
  owner_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, client_id),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
`

const SCHEMA_V5_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_share_spatial_status
  ON kml_shares(spatial_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_access_token
  ON share_access_sessions(share_id, token_hash);
CREATE INDEX IF NOT EXISTS idx_share_access_expires
  ON share_access_sessions(share_id, expires_at);
`

export class UserDatabase {
  constructor (options = {}) {
    this.filePath = options.filePath || path.resolve(rootPath, '.db/map-service.sqlite')
    if (this.filePath !== ':memory:') {
      fs.ensureDirSync(path.dirname(this.filePath))
    }

    this.database = options.database || new DatabaseSync(this.filePath)
    this.transactionDepth = 0
    this.configure()
    this.migrate()
  }

  configure () {
    this.database.exec('PRAGMA foreign_keys = ON')
    this.database.exec('PRAGMA busy_timeout = 5000')
    if (this.filePath !== ':memory:') {
      try {
        this.database.exec('PRAGMA journal_mode = WAL')
      } catch (err) {
        // 多进程同时首次打开同一数据库时，另一个连接可能正在切换 WAL。
        // busy_timeout 对该 PRAGMA 并不总是生效；让当前连接继续使用已生效的模式即可。
        if (err?.errstr !== 'database is locked' && !String(err?.message || '').includes('database is locked')) {
          throw err
        }
      }
      this.database.exec('PRAGMA synchronous = NORMAL')
    }
  }

  migrate () {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `)
    const current = Number(this.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version || 0)

    if (current < 1) {
      this.transaction(() => {
        this.database.exec(SCHEMA_V1)
        this.database.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(1, new Date().toISOString())
      })
    }

    if (current < 2) {
      this.transaction(() => {
        const kmlColumns = this.database.prepare('PRAGMA table_info(kml_documents)').all()
          .map(column => column.name)
        if (!kmlColumns.includes('sync_client_id')) {
          this.database.exec('ALTER TABLE kml_documents ADD COLUMN sync_client_id TEXT')
        }
        this.database.exec(SCHEMA_V2)
        this.database.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(2, new Date().toISOString())
      })
    }

    if (current < 3) {
      this.transaction(() => {
        this.database.exec(SCHEMA_V3)
        this.database.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(3, new Date().toISOString())
      })
    }

    if (current < 4) {
      this.transaction(() => {
        this.database.exec(SCHEMA_V4)
        this.database.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(4, new Date().toISOString())
      })
    }

    if (current < 5) {
      this.transaction(() => {
        const tableExists = (tableName) => Boolean(this.database.prepare(`
          SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
        `).get(tableName))
        const columnsOf = (tableName) => tableExists(tableName)
          ? this.database.prepare(`PRAGMA table_info(${tableName})`).all().map(column => column.name)
          : []
        const addColumn = (tableName, columnName, definition) => {
          if (!columnsOf(tableName).includes(columnName)) {
            this.database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
          }
        }

        if (tableExists('kml_shares')) {
          addColumn('kml_shares', 'spatial_access_mode', "TEXT NOT NULL DEFAULT 'unrestricted'")
          addColumn('kml_shares', 'password_access_ttl_mode', "TEXT NOT NULL DEFAULT 'finite'")
          addColumn('kml_shares', 'spatial_scope_json', "TEXT NOT NULL DEFAULT '{}'")
          addColumn('kml_shares', 'spatial_scope_revision', 'INTEGER NOT NULL DEFAULT 0')
          addColumn('kml_shares', 'spatial_status', "TEXT NOT NULL DEFAULT 'ready'")
          addColumn('kml_shares', 'spatial_error_code', "TEXT NOT NULL DEFAULT ''")
          addColumn('kml_shares', 'password_version', 'INTEGER NOT NULL DEFAULT 1')
          addColumn('kml_shares', 'access_policy_revision', 'INTEGER NOT NULL DEFAULT 1')
        }

        if (tableExists('share_access_sessions') && tableExists('kml_shares')) {
          const sessionColumns = columnsOf('share_access_sessions')
          const needsRebuild = !['ttl_mode', 'password_version', 'policy_revision', 'last_accessed_at', 'revoke_reason']
            .every(column => sessionColumns.includes(column)) ||
            !this.database.prepare('PRAGMA table_info(share_access_sessions)').all()
              .some(column => column.name === 'expires_at' && Number(column.notnull) === 0)

          if (needsRebuild) {
            const ttlExpression = sessionColumns.includes('ttl_mode') ? "COALESCE(ttl_mode, 'finite')" : "'finite'"
            const passwordVersionExpression = sessionColumns.includes('password_version') ? 'COALESCE(password_version, 1)' : '1'
            const policyRevisionExpression = sessionColumns.includes('policy_revision') ? 'COALESCE(policy_revision, 1)' : '1'
            const lastAccessedExpression = sessionColumns.includes('last_accessed_at') ? 'last_accessed_at' : 'created_at'
            const revokeReasonExpression = sessionColumns.includes('revoke_reason') ? "COALESCE(revoke_reason, '')" : "''"
            this.database.exec(`
              CREATE TABLE share_access_sessions_v5 (
                id TEXT PRIMARY KEY,
                share_id TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                ttl_mode TEXT NOT NULL DEFAULT 'finite',
                expires_at TEXT,
                password_version INTEGER NOT NULL DEFAULT 1,
                policy_revision INTEGER NOT NULL DEFAULT 1,
                last_accessed_at TEXT NOT NULL,
                revoked_at TEXT,
                revoke_reason TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (share_id) REFERENCES kml_shares(id) ON DELETE CASCADE
              );
              INSERT INTO share_access_sessions_v5(
                id, share_id, token_hash, created_at, ttl_mode, expires_at,
                password_version, policy_revision, last_accessed_at, revoked_at, revoke_reason
              )
              SELECT id, share_id, token_hash, created_at, ${ttlExpression}, expires_at,
                ${passwordVersionExpression}, ${policyRevisionExpression}, ${lastAccessedExpression},
                revoked_at, ${revokeReasonExpression}
              FROM share_access_sessions;
              DROP TABLE share_access_sessions;
              ALTER TABLE share_access_sessions_v5 RENAME TO share_access_sessions;
            `)
          }
        }

        if (tableExists('kml_shares') && tableExists('share_access_sessions')) {
          this.database.exec(SCHEMA_V5_INDEXES)
        }
        this.database.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(5, new Date().toISOString())
      })
    }

    if (current < 6) {
      this.transaction(() => {
        const tableExists = (tableName) => Boolean(this.database.prepare(`
          SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
        `).get(tableName))
        const columnsOf = (tableName) => tableExists(tableName)
          ? this.database.prepare(`PRAGMA table_info(${tableName})`).all().map(column => column.name)
          : []
        const addColumn = (tableName, columnName, definition) => {
          if (!columnsOf(tableName).includes(columnName)) {
            this.database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
          }
        }
        const now = new Date().toISOString()

        if (tableExists('kml_shares')) {
          addColumn('kml_shares', 'content_revision', 'INTEGER NOT NULL DEFAULT 1')
          addColumn('kml_shares', 'content_published_at', 'TEXT')
          this.database.prepare(`
            UPDATE kml_shares
            SET content_published_at = COALESCE(content_published_at, updated_at, created_at, ?)
          `).run(now)
        }

        if (tableExists('kml_share_items')) {
          addColumn('kml_share_items', 'published_revision', 'INTEGER NOT NULL DEFAULT 0')
          addColumn('kml_share_items', 'published_snapshot_json', "TEXT NOT NULL DEFAULT '{}'")
          addColumn('kml_share_items', 'published_at', 'TEXT')

          if (tableExists('kml_documents')) {
            const rows = this.database.prepare(`
              SELECT i.id AS share_item_id, s.content_published_at,
                     k.name, k.description, k.coord_correction, k.theme, k.color,
                     k.lock_drag, k.enabled, k.is_live_track, k.features_json,
                     k.feature_count, k.byte_size, k.revision, k.updated_at
              FROM kml_share_items i
              JOIN kml_shares s ON s.id = i.share_id
              JOIN kml_documents k ON k.id = i.kml_id
            `).all()
            const update = this.database.prepare(`
              UPDATE kml_share_items SET
                published_revision = ?, published_snapshot_json = ?, published_at = ?
              WHERE id = ?
            `)
            rows.forEach(row => {
              let features = []
              try {
                const parsed = JSON.parse(row.features_json || '[]')
                if (Array.isArray(parsed)) features = parsed
              } catch {}
              const snapshot = {
                name: row.name,
                description: row.description,
                coordCorrection: row.coord_correction,
                theme: row.theme,
                color: row.color,
                lockDrag: Boolean(row.lock_drag),
                enabled: Boolean(row.enabled),
                isLiveTrack: Boolean(row.is_live_track),
                features,
                featureCount: Number(row.feature_count || 0),
                byteSize: Number(row.byte_size || 0),
                revision: Number(row.revision || 0),
                updatedAt: row.updated_at,
              }
              update.run(
                Number(row.revision || 0),
                JSON.stringify(snapshot),
                row.content_published_at || now,
                row.share_item_id
              )
            })
          }
        }

        this.database.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(6, now)
      })
    }

    const finalVersion = Number(this.database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.version || 0)
    if (finalVersion !== USER_DATABASE_VERSION) {
      throw new Error(`不支持的用户数据库版本：${finalVersion}`)
    }
  }

  prepare (sql) {
    return this.database.prepare(sql)
  }

  exec (sql) {
    return this.database.exec(sql)
  }

  transaction (callback) {
    const depth = this.transactionDepth
    const savepoint = `map_service_tx_${depth}`
    this.transactionDepth += 1

    try {
      if (depth === 0) {
        this.database.exec('BEGIN IMMEDIATE')
      } else {
        this.database.exec(`SAVEPOINT ${savepoint}`)
      }

      const result = callback()

      if (depth === 0) {
        this.database.exec('COMMIT')
      } else {
        this.database.exec(`RELEASE SAVEPOINT ${savepoint}`)
      }
      return result
    } catch (err) {
      try {
        if (depth === 0) {
          this.database.exec('ROLLBACK')
        } else {
          this.database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`)
          this.database.exec(`RELEASE SAVEPOINT ${savepoint}`)
        }
      } catch (rollbackError) {
        err.rollbackError = rollbackError
      }
      throw err
    } finally {
      this.transactionDepth -= 1
    }
  }

  close () {
    this.database.close()
  }
}

export default UserDatabase
