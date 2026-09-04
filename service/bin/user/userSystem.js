import {
  createHttpError,
  hashPassword,
  hashPasswordSync,
  hashToken,
  normalizeOptionalEmail,
  normalizeUsername,
  PASSWORD_POLICY,
  randomId,
  randomToken,
  timingSafeStringEqual,
  validateDisplayName,
  validatePassword,
  validateUsername,
  verifyPassword,
  validateAvatar,
  validateGender,
} from './security.js'
import {
  BUILTIN_ROLES,
  isKnownPermission,
  PERMISSIONS,
} from './permissions.js'
import {
  DEFAULT_ANALYTICS_SETTINGS,
  mergeAnalyticsSettings,
  normalizeAnalyticsSettings,
  publicAnalyticsConfig,
} from './analytics.js'
import {
  kmlImportTransportMaxBytes,
  normalizeStoredQuotaOverrides,
  normalizeStoredQuotaSettings,
} from './limits.js'

const DEFAULT_SETTINGS = Object.freeze({
  registration: {
    mode: 'closed',
    defaultRoleCodes: ['user'],
  },
  session: {
    ttlMs: 1000 * 60 * 60 * 24 * 7,
    rememberTtlMs: 1000 * 60 * 60 * 24 * 30,
    reauthWindowMs: 1000 * 60 * 10,
  },
  quota: {
    maxKmlFiles: 100,
    maxKmlFileBytes: 10 * 1024 * 1024,
    maxFeaturesPerKml: 50000,
    maxFeaturesPerUser: 200000,
    trashRetentionDays: 30,
  },
  resourceCollection: {
    maxCollectionsPerUser: 1000,
    maxItemsPerCollection: 10000,
    maxCollectionBytesPerUser: 100 * 1024 * 1024,
    maxBatchItemsPerRequest: 100,
    publicCollectionReadRateLimit: 300,
  },
  kml: {
    batchDownloadEnabled: false,
    pointClustering: {
      enabled: true,
      minZoom: 0,
      maxClusterZoom: 13,
      gridSize: 64,
      minClusterPoints: 10,
      maxMembersPerCluster: 5000,
    },
  },
  share: {
    publicAccessPolicy: 'inherit_site_access',
    maxFilesPerShare: 20,
    accessTtlMs: 1000 * 60 * 60 * 12,
    passwordlessSharingEnabled: false,
    kmlClusterForceEnabled: false,
    kmlClusterMaxZoom: 12,
    kmlClusterMinPoints: 250,
    spatialAccessEnabled: true,
    spatialPaddingMeters: 1000,
    spatialMaxAreaKm2: 10000,
    spatialMaxDiagonalKm: 300,
    spatialUnrestrictedTileMaxZoom: 14,
    unlimitedAccessEnabled: false,
    unlimitedAccessMaxAreaKm2: 2000,
    unlimitedAccessMaxDiagonalKm: 100,
    spatialPolicyRevision: 1,
    rateLimit: {
      enabled: true,
      windowMs: 60 * 1000,
      tileMaxRequests: 3000,
      manifestMaxRequests: 300,
      maxEntries: 10000,
    },
  },
  analytics: DEFAULT_ANALYTICS_SETTINGS,
})

const SPATIAL_SHARE_SETTING_KEYS = Object.freeze([
  'spatialAccessEnabled',
  'spatialPaddingMeters',
  'spatialMaxAreaKm2',
  'spatialMaxDiagonalKm',
  'spatialUnrestrictedTileMaxZoom',
  'unlimitedAccessEnabled',
  'unlimitedAccessMaxAreaKm2',
  'unlimitedAccessMaxDiagonalKm',
])

const LOGIN_LIMIT = Object.freeze({
  maxAttempts: 5,
  windowMs: 1000 * 60 * 10,
  blockMs: 1000 * 60 * 15,
})

const REGISTER_LIMIT = Object.freeze({
  maxAttempts: 10,
  windowMs: 1000 * 60 * 60,
  blockMs: 1000 * 60 * 60,
})

const PASSWORD_VERIFY_LIMIT = Object.freeze({
  maxAttempts: 5,
  windowMs: 1000 * 60 * 10,
  blockMs: 1000 * 60 * 15,
})

const PASSWORD_CHANGE_ALLOWED_PERMISSIONS = new Set([
  'account.self.read',
  'session.self.manage',
])

const SENSITIVE_AUDIT_KEY = /password|passwd|secret|token|cookie|csrf|authorization|credential|request.?headers?|session.*(?:hash|secret)/i
const QUOTA_FIELD_LABELS = Object.freeze({
  maxKmlFiles: 'KML 文件数',
  maxKmlFileBytes: '单个 KML 文件大小',
  maxFeaturesPerKml: '单文件要素数',
  maxFeaturesPerUser: '用户总要素数',
  trashRetentionDays: '回收站保留天数',
})

function parseJson (value, fallback) {
  try {
    const parsed = JSON.parse(String(value || ''))
    return parsed === undefined || parsed === null ? fallback : parsed
  } catch (err) {
    return fallback
  }
}

function clone (value) {
  return JSON.parse(JSON.stringify(value))
}

function clampInteger (value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function normalizePositiveIntegerSetting (value, fallback, label, minimum = 1) {
  if (value === undefined) return Number(fallback)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw createHttpError(`${label}需为不小于 ${minimum} 的整数`, 400, 'VALIDATION_FAILED')
  }
  return parsed
}

function normalizePositiveNumberSetting (value, fallback, label, minimum = 0) {
  if (value === undefined) return Number(fallback)
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= minimum) {
    throw createHttpError(`${label}需大于 ${minimum}`, 400, 'VALIDATION_FAILED')
  }
  return parsed
}

function normalizeNonNegativeNumberSetting (value, fallback, label) {
  if (value === undefined) return Number(fallback)
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createHttpError(`${label}需为不小于 0 的数字`, 400, 'VALIDATION_FAILED')
  }
  return parsed
}

function normalizeQuotaSettings (input, fallback = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createHttpError('用户配额格式不正确', 400, 'VALIDATION_FAILED')
  }
  const next = { ...fallback }
  Object.entries(QUOTA_FIELD_LABELS).forEach(([key, label]) => {
    if (!Object.hasOwn(input, key)) return
    next[key] = normalizePositiveIntegerSetting(input[key], fallback[key], label)
  })
  assertKmlTransportLimit(next)
  assertQuotaRelationships(next)
  return next
}

const RESOURCE_COLLECTION_SETTING_LABELS = Object.freeze({
  maxCollectionsPerUser: '每用户活动资源集合数',
  maxItemsPerCollection: '单个资源集合项数',
  maxCollectionBytesPerUser: '每用户资源集合字节数',
  maxBatchItemsPerRequest: '资源集合单批操作数',
  publicCollectionReadRateLimit: '公开资源集合读取限流值',
})

function normalizeResourceCollectionSettings (input, fallback = DEFAULT_SETTINGS.resourceCollection) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createHttpError('资源集合设置格式不正确', 400, 'VALIDATION_FAILED')
  }
  const next = { ...fallback }
  Object.entries(RESOURCE_COLLECTION_SETTING_LABELS).forEach(([key, label]) => {
    if (!Object.hasOwn(input, key)) return
    next[key] = normalizePositiveIntegerSetting(input[key], fallback[key], label)
  })
  if (next.maxBatchItemsPerRequest > next.maxItemsPerCollection) {
    throw createHttpError('资源集合单批操作数不能大于单个集合项数上限', 400, 'VALIDATION_FAILED')
  }
  return next
}

function assertKmlTransportLimit (quota) {
  const transportMaximum = kmlImportTransportMaxBytes()
  if (Number(quota.maxKmlFileBytes) > transportMaximum) {
    throw createHttpError(
      `单个 KML 文件大小不能超过服务运输层上限 ${transportMaximum} 字节`,
      400,
      'KML_IMPORT_TRANSPORT_LIMIT_EXCEEDED',
    )
  }
}

function assertQuotaRelationships (quota) {
  if (Number(quota.maxFeaturesPerUser) < Number(quota.maxFeaturesPerKml)) {
    throw createHttpError(
      '用户总要素数不能小于单文件要素数',
      400,
      'VALIDATION_FAILED',
    )
  }
}

function normalizeQuotaOverrides (input, fallback = DEFAULT_SETTINGS.quota) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createHttpError('用户配额格式不正确', 400, 'VALIDATION_FAILED')
  }
  const next = {}
  Object.entries(input).forEach(([key, value]) => {
    if (!Object.hasOwn(QUOTA_FIELD_LABELS, key)) {
      throw createHttpError(`不支持的用户配额字段：${key}`, 400, 'VALIDATION_FAILED')
    }
    next[key] = normalizePositiveIntegerSetting(value, DEFAULT_SETTINGS.quota[key], `个人${QUOTA_FIELD_LABELS[key]}`)
  })
  const effective = { ...fallback, ...next }
  assertKmlTransportLimit(effective)
  assertQuotaRelationships(effective)
  return next
}

function normalizeBooleanSetting (value, fallback, label) {
  if (value === undefined) return Boolean(fallback)
  if (typeof value !== 'boolean') {
    throw createHttpError(`${label}格式不正确`, 400, 'VALIDATION_FAILED')
  }
  return value
}

function normalizeIntegerSetting (value, fallback, min, max, label) {
  if (value === undefined) return Number(fallback)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw createHttpError(`${label}需为 ${min}～${max} 的整数`, 400, 'VALIDATION_FAILED')
  }
  return parsed
}

function normalizeKmlPointClusteringSettings (input, fallback = DEFAULT_SETTINGS.kml.pointClustering) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createHttpError('KML 点位聚合设置格式不正确', 400, 'VALIDATION_FAILED')
  }
  const next = {
    ...DEFAULT_SETTINGS.kml.pointClustering,
    ...(fallback || {}),
  }
  next.enabled = normalizeBooleanSetting(input.enabled, next.enabled, 'KML 点位聚合开关')
  next.minZoom = normalizeIntegerSetting(input.minZoom, next.minZoom, 0, 24, 'KML 点位聚合起始缩放级别')
  next.maxClusterZoom = normalizeIntegerSetting(input.maxClusterZoom, next.maxClusterZoom, 0, 24, 'KML 点位聚合结束缩放级别')
  if (next.minZoom > next.maxClusterZoom) {
    throw createHttpError('KML 点位聚合起始缩放级别不能高于结束级别', 400, 'VALIDATION_FAILED')
  }
  next.gridSize = normalizeIntegerSetting(input.gridSize, next.gridSize, 24, 128, 'KML 点位聚合网格大小')
  next.minClusterPoints = normalizeIntegerSetting(input.minClusterPoints, next.minClusterPoints, 2, 1000, 'KML 点位聚合最少点位数')
  next.maxMembersPerCluster = normalizeIntegerSetting(input.maxMembersPerCluster, next.maxMembersPerCluster, 100, 20000, '单个 KML 点位聚合成员上限')
  return next
}

function normalizeStoredKmlPointClusteringSettings (input) {
  try {
    return normalizeKmlPointClusteringSettings(
      input && typeof input === 'object' && !Array.isArray(input) ? input : {},
      DEFAULT_SETTINGS.kml.pointClustering,
    )
  } catch (err) {
    return clone(DEFAULT_SETTINGS.kml.pointClustering)
  }
}

function normalizePage (input = {}) {
  return {
    page: clampInteger(input.page, 1, 1, 1000000),
    limit: clampInteger(input.limit, 20, 1, 100),
  }
}

function maskEmail (email) {
  const normalized = String(email || '')
  const at = normalized.indexOf('@')
  if (at <= 0) return normalized ? '***' : ''
  const local = normalized.slice(0, at)
  const domain = normalized.slice(at + 1)
  return `${local.slice(0, 1)}***@${domain}`
}

function summarizeIp (value) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (/^ip_[A-Za-z0-9_-]{16}$/.test(normalized)) return normalized
  return `ip_${hashToken(normalized).slice(0, 16)}`
}

function normalizeContext (context = {}) {
  return {
    ip: summarizeIp(context.ip),
    userAgent: String(context.userAgent || '').slice(0, 255),
    deviceLabel: String(context.deviceLabel || context.userAgent || '').slice(0, 100),
  }
}

function attemptKeys (scope, identity, ipSummary) {
  const account = String(identity || 'unknown')
  const ip = String(ipSummary || 'unknown')
  return [
    `${scope}|ip|${ip}`,
    `${scope}|account|${account}`,
    `${scope}|combo|${ip}|${account}`,
  ]
}

function sanitizeAuditValue (value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value ?? null
  if (typeof value === 'string') return value.slice(0, 1000)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return String(value)
  if (depth >= 5) return '[已省略]'

  if (Array.isArray(value)) {
    return value.slice(0, 100).map(item => sanitizeAuditValue(item, depth + 1, seen))
  }
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[循环引用]'
  seen.add(value)

  const sanitized = {}
  Object.entries(value).slice(0, 100).forEach(([key, item]) => {
    sanitized[key] = SENSITIVE_AUDIT_KEY.test(key)
      ? '[已脱敏]'
      : sanitizeAuditValue(item, depth + 1, seen)
  })
  return sanitized
}

function createTemporaryPassword (providedPassword, username) {
  if (providedPassword !== undefined) {
    return validatePassword(providedPassword, { username })
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = randomToken(18)
    try {
      return validatePassword(candidate, { username })
    } catch (err) {
      // Extremely unlikely username substring collision; generate another token.
    }
  }
  throw createHttpError('无法生成临时密码，请稍后重试', 500, 'INTERNAL_ERROR')
}

class AttemptLimiter {
  constructor (options, clock) {
    this.options = options
    this.clock = clock
    this.entries = new Map()
  }

  getState (key) {
    const now = this.clock()
    const current = this.entries.get(key)
    if (!current || (current.blockedUntil <= now && now - current.firstFailedAt > this.options.windowMs)) {
      return {
        count: 0,
        firstFailedAt: now,
        blockedUntil: 0,
      }
    }
    return current
  }

  assertAllowed (key) {
    const state = this.getState(key)
    if (state.blockedUntil > this.clock()) {
      throw createHttpError('尝试次数过多，请稍后再试', 429, 'RATE_LIMITED')
    }
  }

  recordFailure (key) {
    const state = this.getState(key)
    state.count += 1
    if (state.count >= this.options.maxAttempts) {
      state.blockedUntil = this.clock() + this.options.blockMs
    }
    this.entries.set(key, state)
    return state
  }

  recordMany (keys) {
    return keys.map(key => this.recordFailure(key)).reduce((latest, state) => (
      state.blockedUntil > latest.blockedUntil ? state : latest
    ), { count: 0, firstFailedAt: this.clock(), blockedUntil: 0 })
  }

  assertAllowedMany (keys) {
    keys.forEach(key => this.assertAllowed(key))
  }

  clear (key) {
    this.entries.delete(key)
  }

  clearMany (keys) {
    keys.forEach(key => this.clear(key))
  }
}

export class UserSystemService {
  constructor (options = {}) {
    if (!options.database) {
      throw new Error('UserSystemService requires database')
    }
    this.database = options.database
    this.clock = options.clock || (() => Date.now())
    this.loginLimiter = new AttemptLimiter(options.loginLimit || LOGIN_LIMIT, this.clock)
    this.registerLimiter = new AttemptLimiter(options.registerLimit || REGISTER_LIMIT, this.clock)
    this.passwordLimiter = new AttemptLimiter(options.passwordLimit || PASSWORD_VERIFY_LIMIT, this.clock)
    this.requireSecureBootstrap = options.requireSecureBootstrap === true
    this.settingsChangeHandler = options.settingsChangeHandler || null
    this.settingsPreviewHandler = options.settingsPreviewHandler || null
    this.seedSystem(options.bootstrapAdmin || {})
    this.dummyPasswordHash = hashPasswordSync('map-service timing password', { allowWeak: true })
  }

  nowIso () {
    return new Date(this.clock()).toISOString()
  }

  setSettingsChangeHandler (handler) {
    this.settingsChangeHandler = handler instanceof Function ? handler : null
  }

  setSettingsPreviewHandler (handler) {
    this.settingsPreviewHandler = handler instanceof Function ? handler : null
  }

  seedSystem (bootstrapAdmin = {}) {
    const now = this.nowIso()
    this.database.transaction(() => {
      const insertPermission = this.database.prepare(`
        INSERT INTO permissions(code, name, description)
        VALUES (?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET name = excluded.name, description = excluded.description
      `)
      PERMISSIONS.forEach(permission => {
        insertPermission.run(permission.code, permission.name, '')
      })

      const upsertRole = this.database.prepare(`
        INSERT INTO roles(id, code, name, description, is_builtin, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(code) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          is_builtin = 1,
          updated_at = excluded.updated_at
      `)
      const deleteRolePermissions = this.database.prepare('DELETE FROM role_permissions WHERE role_id = ?')
      const insertRolePermission = this.database.prepare(`
        INSERT OR IGNORE INTO role_permissions(role_id, permission_code) VALUES (?, ?)
      `)

      BUILTIN_ROLES.forEach(role => {
        upsertRole.run(role.id, role.code, role.name, role.description, now, now)
        deleteRolePermissions.run(role.id)
        role.permissions.forEach(code => insertRolePermission.run(role.id, code))
      })

      const settings = this.database.prepare('SELECT key FROM user_system_settings WHERE key = ?').get('user-system')
      if (!settings) {
        this.database.prepare(`
          INSERT INTO user_system_settings(key, value_json, updated_at) VALUES (?, ?, ?)
        `).run('user-system', JSON.stringify(DEFAULT_SETTINGS), now)
      }
    })

    const superAdminCount = Number(this.database.prepare(`
      SELECT COUNT(DISTINCT u.id) AS count
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE r.code = 'super_admin' AND u.status = 'active'
    `).get()?.count || 0)

    if (superAdminCount === 0) {
      this.createBootstrapSuperAdmin(bootstrapAdmin)
    }
  }

  createBootstrapSuperAdmin (bootstrapAdmin = {}) {
    let identity
    if (this.requireSecureBootstrap) {
      if (bootstrapAdmin.configured !== true) {
        throw new Error('生产环境首次初始化必须显式配置超级管理员账号和强密码')
      }
      identity = validateUsername(bootstrapAdmin.username)
      validatePassword(bootstrapAdmin.password, { username: identity.normalized })
    } else {
      try {
        identity = validateUsername(bootstrapAdmin.username || 'admin')
      } catch (err) {
        identity = validateUsername('admin')
      }
    }
    const password = String(bootstrapAdmin.password || 'admin')
    let mustChangePassword = false
    try {
      validatePassword(password, { username: identity.normalized })
    } catch (err) {
      mustChangePassword = true
    }
    const passwordHash = hashPasswordSync(password, { allowWeak: true })
    const now = this.nowIso()
    const userId = randomId('usr')

    this.database.transaction(() => {
      const existing = this.database.prepare(`
        SELECT id FROM users WHERE username_normalized = ?
      `).get(identity.normalized)
      const targetId = existing?.id || userId
      if (!existing) {
        this.database.prepare(`
          INSERT INTO users(
            id, username_normalized, username_display, display_name, password_hash,
            status, must_change_password, quota_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'active', ?, '{}', ?, ?)
        `).run(
          targetId,
          identity.normalized,
          identity.display,
          identity.display,
          passwordHash,
          mustChangePassword ? 1 : 0,
          now,
          now
        )
      } else {
        this.database.prepare(`
          UPDATE users SET
            username_display = ?, password_hash = ?, status = 'active',
            must_change_password = ?, locked_until = NULL, deleted_at = NULL,
            permissions_version = permissions_version + 1, updated_at = ?
          WHERE id = ?
        `).run(
          identity.display,
          passwordHash,
          mustChangePassword ? 1 : 0,
          now,
          targetId
        )
        this.database.prepare(`
          UPDATE sessions SET revoked_at = ?
          WHERE user_id = ? AND revoked_at IS NULL
        `).run(now, targetId)
      }
      this.database.prepare(`
        INSERT OR IGNORE INTO user_roles(user_id, role_id, created_at) VALUES (?, 'role_super_admin', ?)
      `).run(targetId, now)
      this.insertAudit({
        actorUserId: null,
        action: 'user.bootstrap-super-admin',
        targetType: 'user',
        targetId,
        metadata: {
          username: identity.normalized,
          mustChangePassword,
          reusedExistingUser: Boolean(existing),
        },
      })
    })
  }

  getSettings () {
    const row = this.database.prepare('SELECT value_json FROM user_system_settings WHERE key = ?').get('user-system')
    const saved = parseJson(row?.value_json, {})
    return {
      resourceCollectionRefVersion: 1,
      registration: {
        ...DEFAULT_SETTINGS.registration,
        ...(saved.registration || {}),
      },
      session: {
        ...DEFAULT_SETTINGS.session,
        ...(saved.session || {}),
      },
      quota: normalizeStoredQuotaSettings(saved.quota, DEFAULT_SETTINGS.quota),
      resourceCollection: normalizeResourceCollectionSettings(
        saved.resourceCollection || saved.resourceCollections?.settings || {},
        DEFAULT_SETTINGS.resourceCollection,
      ),
      kml: {
        ...DEFAULT_SETTINGS.kml,
        ...(saved.kml || {}),
        pointClustering: normalizeStoredKmlPointClusteringSettings(saved.kml?.pointClustering),
      },
      resourceCollections: {
        refVersion: 1,
        pageSize: 40,
      },
      share: {
        ...DEFAULT_SETTINGS.share,
        ...(saved.share || {}),
        rateLimit: {
          ...DEFAULT_SETTINGS.share.rateLimit,
          ...(saved.share?.rateLimit || {}),
        },
      },
      analytics: mergeAnalyticsSettings(saved.analytics),
    }
  }

  getPublicConfig () {
    const settings = this.getSettings()
    return {
      resourceCollectionRefVersion: Number(settings.resourceCollectionRefVersion || 1),
      registration: {
        mode: settings.registration.mode,
        enabled: settings.registration.mode === 'open',
      },
      passwordPolicy: PASSWORD_POLICY,
      kml: {
        batchDownloadEnabled: settings.kml.batchDownloadEnabled === true,
        pointClustering: {
          enabled: settings.kml.pointClustering.enabled === true,
          minZoom: Number(settings.kml.pointClustering.minZoom),
          maxClusterZoom: Number(settings.kml.pointClustering.maxClusterZoom),
          gridSize: Number(settings.kml.pointClustering.gridSize),
          minClusterPoints: Number(settings.kml.pointClustering.minClusterPoints),
          maxMembersPerCluster: Number(settings.kml.pointClustering.maxMembersPerCluster),
        },
        importTransportMaxBytes: kmlImportTransportMaxBytes(),
      },
      share: {
        maxFilesPerShare: Number(settings.share.maxFilesPerShare),
        passwordlessSharingEnabled: settings.share.passwordlessSharingEnabled === true,
        spatialUnrestrictedTileMaxZoom: Number(settings.share.spatialUnrestrictedTileMaxZoom),
      },
      resourceCollection: {
        maxBatchItemsPerRequest: Number(settings.resourceCollection.maxBatchItemsPerRequest),
      },
      analytics: publicAnalyticsConfig(settings.analytics),
    }
  }

  getHealthSummary (actor) {
    this.assertPermission(actor, 'admin.overview.read')
    const now = this.nowIso()
    const scalar = (sql, field = 'count', ...params) => Number(
      this.database.prepare(sql).get(...params)?.[field] || 0
    )
    const pageCount = scalar('PRAGMA page_count', 'page_count')
    const pageSize = scalar('PRAGMA page_size', 'page_size')

    return {
      database: {
        status: 'ok',
        schemaVersion: scalar('SELECT MAX(version) AS version FROM schema_migrations', 'version'),
        allocatedBytes: pageCount * pageSize,
      },
      counts: {
        users: scalar("SELECT COUNT(*) AS count FROM users WHERE status <> 'deleted'"),
        activeSessions: scalar(`
          SELECT COUNT(*) AS count
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'
        `, 'count', now),
        kmlFiles: scalar("SELECT COUNT(*) AS count FROM kml_documents WHERE status = 'active'"),
        favorites: scalar('SELECT COUNT(*) AS count FROM favorite_places'),
        shares: scalar('SELECT COUNT(*) AS count FROM kml_shares'),
        activeShares: scalar(`
          SELECT COUNT(*) AS count FROM kml_shares
          WHERE status = 'active' AND (expires_at IS NULL OR expires_at > ?)
        `, 'count', now),
      },
      storage: {
        kmlBytes: scalar('SELECT COALESCE(SUM(byte_size), 0) AS bytes FROM kml_documents', 'bytes'),
      },
    }
  }

  updateSettings (actor, input = {}, context = {}, options = {}) {
    const current = this.getSettings()
    const next = clone(current)

    if (input.registration !== undefined) {
      this.assertPermission(actor, 'admin.registration.manage')
      if (!input.registration || typeof input.registration !== 'object' || Array.isArray(input.registration)) {
        throw createHttpError('注册设置格式不正确', 400, 'VALIDATION_FAILED')
      }
      if (Object.hasOwn(input.registration, 'mode')) {
        const mode = String(input.registration.mode || '')
        if (!['open', 'closed'].includes(mode)) {
          throw createHttpError('注册模式只支持 open 或 closed', 400, 'VALIDATION_FAILED')
        }
        next.registration.mode = mode
      }
      if (Object.hasOwn(input.registration, 'defaultRoleCodes')) {
        const roles = this.resolveRegistrationRoles(input.registration.defaultRoleCodes)
        next.registration.defaultRoleCodes = roles.map(role => role.code)
      }
    }

    if (input.session !== undefined) {
      this.assertPermission(actor, 'admin.security.manage')
      next.session.ttlMs = normalizePositiveIntegerSetting(input.session.ttlMs, current.session.ttlMs, '普通会话有效期', 1000 * 60)
      next.session.rememberTtlMs = normalizePositiveIntegerSetting(input.session.rememberTtlMs, current.session.rememberTtlMs, '记住登录有效期', next.session.ttlMs)
      next.session.reauthWindowMs = normalizePositiveIntegerSetting(input.session.reauthWindowMs, current.session.reauthWindowMs, '高风险操作再验证窗口', 1000 * 60)
      if (next.session.rememberTtlMs < next.session.ttlMs) {
        throw createHttpError('记住登录有效期不能短于普通会话有效期', 400, 'VALIDATION_FAILED')
      }
    }

    if (input.quota !== undefined) {
      this.assertPermission(actor, 'admin.security.manage')
      next.quota = normalizeQuotaSettings(input.quota, current.quota)
    }

    if (input.resourceCollection !== undefined) {
      this.assertPermission(actor, 'admin.security.manage')
      next.resourceCollection = normalizeResourceCollectionSettings(
        input.resourceCollection,
        current.resourceCollection,
      )
    }

    if (input.kml !== undefined) {
      this.assertPermission(actor, 'admin.security.manage')
      if (!input.kml || typeof input.kml !== 'object' || Array.isArray(input.kml)) {
        throw createHttpError('KML 设置格式不正确', 400, 'VALIDATION_FAILED')
      }
      next.kml.batchDownloadEnabled = normalizeBooleanSetting(
        input.kml.batchDownloadEnabled,
        current.kml.batchDownloadEnabled,
        'KML 目录批量下载开关'
      )
      if (Object.hasOwn(input.kml, 'pointClustering')) {
        next.kml.pointClustering = normalizeKmlPointClusteringSettings(
          input.kml.pointClustering,
          current.kml.pointClustering,
        )
      }
    }

    if (input.share !== undefined) {
      this.assertPermission(actor, 'admin.security.manage')
      if (!input.share || typeof input.share !== 'object' || Array.isArray(input.share)) {
        throw createHttpError('公开分享设置格式不正确', 400, 'VALIDATION_FAILED')
      }
      const policy = String(input.share.publicAccessPolicy || current.share.publicAccessPolicy)
      if (!['independent', 'inherit_site_access'].includes(policy)) {
        throw createHttpError('公开分享访问策略不正确', 400, 'VALIDATION_FAILED')
      }
      next.share.publicAccessPolicy = policy
      next.share.maxFilesPerShare = normalizePositiveIntegerSetting(input.share.maxFilesPerShare, current.share.maxFilesPerShare, '单个分享 KML 数')
      next.share.accessTtlMs = normalizePositiveIntegerSetting(input.share.accessTtlMs, current.share.accessTtlMs, '分享密码授权有效期', 1000 * 60)
      next.share.passwordlessSharingEnabled = normalizeBooleanSetting(
        input.share.passwordlessSharingEnabled,
        current.share.passwordlessSharingEnabled,
        '允许无密码分享开关'
      )
      next.share.kmlClusterForceEnabled = normalizeBooleanSetting(input.share.kmlClusterForceEnabled, current.share.kmlClusterForceEnabled, '大规模点位强制聚合开关')
      next.share.kmlClusterMaxZoom = normalizeIntegerSetting(input.share.kmlClusterMaxZoom, current.share.kmlClusterMaxZoom, 0, 24, 'KML 聚合最大缩放级别')
      next.share.kmlClusterMinPoints = normalizePositiveIntegerSetting(input.share.kmlClusterMinPoints, current.share.kmlClusterMinPoints, 'KML 聚合最少点位数', 2)

      if (input.share.rateLimit !== undefined) {
        if (!input.share.rateLimit || typeof input.share.rateLimit !== 'object' || Array.isArray(input.share.rateLimit)) {
          throw createHttpError('分享访问限流设置格式不正确', 400, 'VALIDATION_FAILED')
        }
        next.share.rateLimit = {
          ...current.share.rateLimit,
          enabled: normalizeBooleanSetting(input.share.rateLimit.enabled, current.share.rateLimit.enabled, '分享访问限流开关'),
          windowMs: normalizePositiveIntegerSetting(input.share.rateLimit.windowMs, current.share.rateLimit.windowMs, '分享限流统计窗口', 1000),
          tileMaxRequests: normalizePositiveIntegerSetting(input.share.rateLimit.tileMaxRequests, current.share.rateLimit.tileMaxRequests, '每窗口瓦片请求数'),
          manifestMaxRequests: normalizePositiveIntegerSetting(input.share.rateLimit.manifestMaxRequests, current.share.rateLimit.manifestMaxRequests, '每窗口清单请求数'),
          maxEntries: normalizePositiveIntegerSetting(input.share.rateLimit.maxEntries, current.share.rateLimit.maxEntries, '内存访客条目数'),
        }
      }

      const spatialSettingRequested = SPATIAL_SHARE_SETTING_KEYS.some(key => Object.hasOwn(input.share, key))
      if (spatialSettingRequested) this.assertSuperAdmin(actor)
      next.share.spatialAccessEnabled = normalizeBooleanSetting(
        input.share.spatialAccessEnabled,
        current.share.spatialAccessEnabled,
        '空间受限分享开关'
      )
      next.share.spatialPaddingMeters = normalizeNonNegativeNumberSetting(
        input.share.spatialPaddingMeters,
        current.share.spatialPaddingMeters,
        '空间边界余量'
      )
      next.share.spatialMaxAreaKm2 = normalizePositiveNumberSetting(
        input.share.spatialMaxAreaKm2,
        current.share.spatialMaxAreaKm2,
        '空间限制最大面积'
      )
      next.share.spatialMaxDiagonalKm = normalizePositiveNumberSetting(
        input.share.spatialMaxDiagonalKm,
        current.share.spatialMaxDiagonalKm,
        '空间限制最大对角线'
      )
      next.share.spatialUnrestrictedTileMaxZoom = normalizeIntegerSetting(
        input.share.spatialUnrestrictedTileMaxZoom,
        current.share.spatialUnrestrictedTileMaxZoom,
        0,
        24,
        '范围外底图放宽最大级别'
      )
      next.share.unlimitedAccessEnabled = normalizeBooleanSetting(
        input.share.unlimitedAccessEnabled,
        current.share.unlimitedAccessEnabled,
        '不限授权开关'
      )
      next.share.unlimitedAccessMaxAreaKm2 = normalizePositiveNumberSetting(
        input.share.unlimitedAccessMaxAreaKm2,
        current.share.unlimitedAccessMaxAreaKm2,
        '不限授权最大面积'
      )
      next.share.unlimitedAccessMaxDiagonalKm = normalizePositiveNumberSetting(
        input.share.unlimitedAccessMaxDiagonalKm,
        current.share.unlimitedAccessMaxDiagonalKm,
        '不限授权最大对角线'
      )
      if (next.share.unlimitedAccessMaxAreaKm2 > next.share.spatialMaxAreaKm2 ||
          next.share.unlimitedAccessMaxDiagonalKm > next.share.spatialMaxDiagonalKm) {
        throw createHttpError('不限授权阈值不能大于空间限制总体阈值', 400, 'VALIDATION_FAILED')
      }
      const spatialPolicyChanged = SPATIAL_SHARE_SETTING_KEYS.some(
        key => next.share[key] !== current.share[key]
      )
      next.share.spatialPolicyRevision = spatialPolicyChanged
        ? Number(current.share.spatialPolicyRevision || 1) + 1
        : Number(current.share.spatialPolicyRevision || 1)
    }

    if (input.analytics !== undefined) {
      this.assertPermission(actor, 'admin.security.manage')
      const allowCustomScriptChange = this.isSuperAdmin(actor)
      next.analytics = normalizeAnalyticsSettings(input.analytics, current.analytics, { allowCustomScriptChange })
    }

    if (['registration', 'session', 'quota', 'resourceCollection', 'kml', 'share', 'analytics'].some(section => Object.hasOwn(input, section))) {
      this.assertRecentReauth(actor)
    }

    if (options.preview === true) {
      const sharePolicyImpact = next.share.spatialPolicyRevision !== current.share.spatialPolicyRevision && this.settingsPreviewHandler
        ? this.settingsPreviewHandler(next.share, current.share) || null
        : null
      return sharePolicyImpact ? { ...next, sharePolicyImpact, preview: true } : { ...next, preview: true }
    }

    const now = this.nowIso()
    let sharePolicyImpact = null
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO user_system_settings(key, value_json, updated_at, updated_by)
        VALUES ('user-system', ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
      `).run(JSON.stringify(next), now, actor.user.id)
      if (next.share.spatialPolicyRevision !== current.share.spatialPolicyRevision && this.settingsChangeHandler) {
        sharePolicyImpact = this.settingsChangeHandler(next.share, current.share) || null
        this.insertAudit({
          actorUserId: actor.user.id,
          action: 'admin.share-spatial-policy.update',
          targetType: 'settings',
          targetId: 'user-system',
          metadata: {
            spatialPolicyRevision: next.share.spatialPolicyRevision,
            affectedShares: Number(sharePolicyImpact?.affectedShares || 0),
            downgradedShares: Number(sharePolicyImpact?.downgradedShares || 0),
            revokedUnlimitedSessions: Number(sharePolicyImpact?.revokedUnlimitedSessions || 0),
          },
          ipSummary: normalizeContext(context).ip,
        })
      }
      this.insertAudit({
        actorUserId: actor.user.id,
        action: 'settings.user-system.update',
        targetType: 'settings',
        targetId: 'user-system',
        metadata: { sections: Object.keys(input) },
        ipSummary: normalizeContext(context).ip,
      })
    })
    return sharePolicyImpact ? { ...next, sharePolicyImpact } : next
  }

  roleCodesForUser (userId) {
    return this.database.prepare(`
      SELECT r.code
      FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ?
      ORDER BY r.code
    `).all(userId).map(row => row.code)
  }

  permissionsForUser (userId) {
    return this.database.prepare(`
      SELECT DISTINCT rp.permission_code AS code
      FROM role_permissions rp
      JOIN user_roles ur ON ur.role_id = rp.role_id
      WHERE ur.user_id = ?
      ORDER BY rp.permission_code
    `).all(userId).map(row => row.code)
  }

  permissionsForRole (roleId) {
    return this.database.prepare(`
      SELECT permission_code AS code
      FROM role_permissions
      WHERE role_id = ?
      ORDER BY permission_code
    `).all(roleId).map(row => row.code)
  }

  userViewFromRow (row, options = {}) {
    if (!row) return null
    const roles = this.roleCodesForUser(row.id)
    const permissions = this.permissionsForUser(row.id)
    const result = {
      id: row.id,
      username: row.username_display,
      displayName: row.display_name,
      avatarPresent: Boolean(row.avatar),
      gender: row.gender || '',
      status: row.status,
      mustChangePassword: Boolean(row.must_change_password),
      roles,
      permissions,
      quota: normalizeStoredQuotaOverrides(
        parseJson(row.quota_json, {}),
        options.quotaSettings || this.getSettings().quota,
      ),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at || null,
    }
    if (options.includePrivate) {
      result.avatar = row.avatar || ''
      result.email = row.email || ''
    } else if (row.email) {
      result.emailMasked = maskEmail(row.email)
    }
    return result
  }

  getUserById (id, options = {}) {
    const row = this.database.prepare('SELECT * FROM users WHERE id = ?').get(id)
    return this.userViewFromRow(row, options)
  }

  getUserRowByUsername (username) {
    return this.database.prepare('SELECT * FROM users WHERE username_normalized = ?').get(normalizeUsername(username))
  }

  hasPermission (session, permission) {
    if (!permission) return Boolean(session?.user)
    const permissions = session?.user?.permissions || []
    if (permissions.includes(permission) || permissions.includes('system.super_admin')) return true
    if (permission === 'account.self.read' && permissions.includes('account.self.update')) return true
    if (permission === 'kml.own.read' && permissions.includes('kml.own.write')) return true
    if (permission === 'kml.any.read' && permissions.includes('kml.any.manage')) return true
    if (permission === 'resource_collection.own.read' && (
      permissions.includes('resource_collection.own.write') ||
      permissions.includes('resource_collection.own.manage')
    )) return true
    if (permission === 'resource_collection.own.write' && permissions.includes('resource_collection.own.manage')) return true
    if (permission === 'resource_collection.any.read' && permissions.includes('resource_collection.any.manage')) return true
    return false
  }

  assertPermission (session, permission) {
    if (session?.user?.mustChangePassword && !PASSWORD_CHANGE_ALLOWED_PERMISSIONS.has(permission)) {
      throw createHttpError('请先修改临时密码', 403, 'PASSWORD_CHANGE_REQUIRED')
    }
    if (!this.hasPermission(session, permission)) {
      throw createHttpError('没有执行此操作的权限', 403, 'PERMISSION_DENIED')
    }
    return session
  }

  isSuperAdmin (session) {
    return this.hasPermission(session, 'system.super_admin')
  }

  assertSuperAdmin (session) {
    if (!this.isSuperAdmin(session)) {
      throw createHttpError('只有超级管理员可以执行此操作', 403, 'PERMISSION_DENIED')
    }
    return session
  }

  assertRecentReauth (session) {
    const windowMs = this.getSettings().session.reauthWindowMs
    const reauthenticatedAt = Date.parse(session?.reauthenticatedAt || '')
    if (!Number.isFinite(reauthenticatedAt) || this.clock() - reauthenticatedAt > windowMs) {
      throw createHttpError('请重新验证密码后再执行此操作', 403, 'REAUTH_REQUIRED')
    }
  }

  createSession (userId, options = {}) {
    const userRow = this.database.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    if (!userRow || userRow.status !== 'active') {
      throw createHttpError('账号不可用', 403, 'ACCOUNT_DISABLED')
    }
    const settings = this.getSettings()
    const ttl = options.remember ? settings.session.rememberTtlMs : settings.session.ttlMs
    const nowMs = this.clock()
    const now = new Date(nowMs).toISOString()
    const expiresAt = new Date(nowMs + ttl).toISOString()
    const token = randomToken()
    const csrfToken = randomToken(24)
    const context = normalizeContext(options.context)
    const sessionId = randomId('ses')

    this.database.prepare(`
      INSERT INTO sessions(
        id, user_id, token_hash, csrf_hash, permissions_version,
        created_at, expires_at, last_activity_at, reauthenticated_at,
        device_label, ip_summary, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      userId,
      hashToken(token),
      hashToken(csrfToken),
      userRow.permissions_version,
      now,
      expiresAt,
      now,
      options.reauthenticated ? now : null,
      context.deviceLabel,
      context.ip,
      context.userAgent
    )

    const user = this.userViewFromRow(userRow, { includePrivate: true })
    return {
      sessionToken: token,
      csrfToken,
      maxAge: ttl,
      expiresAt,
      sessionId,
      user,
    }
  }

  verifySession (token) {
    if (!token) return null
    const row = this.database.prepare(`
      SELECT
        s.id AS session_id,
        s.user_id,
        s.csrf_hash,
        s.permissions_version AS session_permissions_version,
        s.created_at AS session_created_at,
        s.expires_at,
        s.last_activity_at,
        s.reauthenticated_at,
        s.revoked_at,
        s.device_label,
        s.ip_summary,
        s.user_agent,
        u.*
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `).get(hashToken(token))
    if (!row || row.revoked_at || row.status !== 'active') return null
    if (Date.parse(row.expires_at) <= this.clock()) return null
    if (Number(row.session_permissions_version) !== Number(row.permissions_version)) return null

    const lastActivity = Date.parse(row.last_activity_at)
    if (!Number.isFinite(lastActivity) || this.clock() - lastActivity >= 1000 * 60 * 5) {
      this.database.prepare('UPDATE sessions SET last_activity_at = ? WHERE id = ?')
        .run(this.nowIso(), row.session_id)
    }

    return {
      id: row.session_id,
      userId: row.user_id,
      csrfHash: row.csrf_hash,
      createdAt: row.session_created_at,
      expiresAt: row.expires_at,
      lastActivityAt: row.last_activity_at,
      reauthenticatedAt: row.reauthenticated_at,
      deviceLabel: row.device_label,
      ipSummary: row.ip_summary,
      userAgent: row.user_agent,
      user: this.userViewFromRow(row, { includePrivate: true }),
    }
  }

  verifyCsrf (session, token) {
    if (!session || !token || !timingSafeStringEqual(hashToken(token), session.csrfHash)) {
      throw createHttpError('请求安全校验失败，请刷新页面后重试', 403, 'CSRF_INVALID')
    }
    return true
  }

  sessionView (session) {
    if (!session) return { authenticated: false, user: null }
    return {
      authenticated: true,
      user: session.user,
      session: {
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastActivityAt: session.lastActivityAt,
        reauthenticatedAt: session.reauthenticatedAt,
        deviceLabel: session.deviceLabel,
      },
    }
  }

  async register (input = {}, context = {}) {
    const settings = this.getSettings()
    if (settings.registration.mode !== 'open') {
      throw createHttpError('当前未开放注册', 403, 'REGISTRATION_CLOSED')
    }
    const normalizedContext = normalizeContext(context)
    const ipKey = `register|ip|${normalizedContext.ip || 'unknown'}`
    this.registerLimiter.assertAllowed(ipKey)

    let identity
    try {
      identity = validateUsername(input.username)
    } catch (err) {
      this.registerLimiter.recordFailure(ipKey)
      throw err
    }

    const limitKeys = attemptKeys('register', identity.normalized, normalizedContext.ip)
    this.registerLimiter.assertAllowedMany(limitKeys)
    this.registerLimiter.recordMany(limitKeys)

    const displayName = validateDisplayName(input.displayName, identity.display)
    const email = normalizeOptionalEmail(input.email)
    const passwordHash = await hashPassword(input.password, { username: identity.normalized })
    const roles = this.resolveRegistrationRoles(settings.registration.defaultRoleCodes)
    const userId = randomId('usr')
    const now = this.nowIso()

    this.database.transaction(() => {
      const inserted = this.database.prepare(`
        INSERT OR IGNORE INTO users(
          id, username_normalized, username_display, display_name, email,
          password_hash, status, quota_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', '{}', ?, ?)
      `).run(userId, identity.normalized, identity.display, displayName, email, passwordHash, now, now)
      if (!inserted.changes) return

      const assignRole = this.database.prepare(`
        INSERT INTO user_roles(user_id, role_id, created_at) VALUES (?, ?, ?)
      `)
      roles.forEach(role => assignRole.run(userId, role.id, now))
      this.insertAudit({
        actorUserId: userId,
        action: 'user.register',
        targetType: 'user',
        targetId: userId,
        metadata: { roles: roles.map(role => role.code) },
        ipSummary: normalizedContext.ip,
      })
    })

    return { status: 'accepted' }
  }

  async login (input = {}, context = {}, options = {}) {
    const username = normalizeUsername(input.username)
    const normalizedContext = normalizeContext(context)
    const limitKeys = attemptKeys('login', username, normalizedContext.ip)
    this.loginLimiter.assertAllowedMany(limitKeys)

    let row = this.getUserRowByUsername(username)
    const passwordMatches = row
      ? await verifyPassword(input.password, row.password_hash)
      : await verifyPassword(input.password, this.dummyPasswordHash)

    if (!row || !passwordMatches) {
      this.loginLimiter.recordMany(limitKeys)
      const accountState = this.loginLimiter.getState(limitKeys[1])
      const isLastActiveSuperAdmin = row?.status === 'active' &&
        this.permissionsForUser(row.id).includes('system.super_admin') &&
        this.activeSuperAdminCount() <= 1
      if (row && accountState.blockedUntil > this.clock() && !isLastActiveSuperAdmin) {
        this.database.prepare(`
          UPDATE users SET status = 'locked', locked_until = ?, updated_at = ? WHERE id = ?
        `).run(new Date(accountState.blockedUntil).toISOString(), this.nowIso(), row.id)
      }
      throw createHttpError('用户名或密码不正确', 401, 'INVALID_CREDENTIALS')
    }

    if (row.status === 'locked' && row.locked_until && Date.parse(row.locked_until) <= this.clock()) {
      this.database.prepare(`
        UPDATE users SET status = 'active', locked_until = NULL, updated_at = ? WHERE id = ?
      `).run(this.nowIso(), row.id)
      row = this.database.prepare('SELECT * FROM users WHERE id = ?').get(row.id)
    }
    if (row.status === 'locked') {
      throw createHttpError('账号暂时锁定，请稍后再试', 429, 'RATE_LIMITED')
    }
    if (row.status !== 'active') {
      throw createHttpError('账号已停用', 403, 'ACCOUNT_DISABLED')
    }

    const permissions = this.permissionsForUser(row.id)
    if (options.requiredPermission && !permissions.includes(options.requiredPermission) && !permissions.includes('system.super_admin')) {
      throw createHttpError('该账号没有管理后台权限', 403, 'PERMISSION_DENIED')
    }

    // A successful login proves only this account and IP/account combination. The
    // shared IP bucket must retain failures against other accounts so password
    // spraying cannot reset its counter through an attacker-controlled account.
    this.loginLimiter.clearMany([limitKeys[1], limitKeys[2]])
    const now = this.nowIso()
    this.database.prepare(`
      UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, row.id)
    const result = this.createSession(row.id, {
      remember: Boolean(input.remember),
      context: normalizedContext,
      reauthenticated: true,
    })
    this.insertAudit({
      actorUserId: row.id,
      action: 'user.login',
      targetType: 'session',
      targetId: result.sessionId,
      ipSummary: normalizedContext.ip,
    })
    return result
  }

  logout (session, context = {}) {
    if (!session) return { status: 'ok' }
    const now = this.nowIso()
    this.database.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(now, session.id)
    this.insertAudit({
      actorUserId: session.user.id,
      action: 'user.logout',
      targetType: 'session',
      targetId: session.id,
      ipSummary: normalizeContext(context).ip,
    })
    return { status: 'ok' }
  }

  listSessions (session) {
    this.assertPermission(session, 'session.self.manage')
    return this.database.prepare(`
      SELECT id, created_at, expires_at, last_activity_at, reauthenticated_at,
             revoked_at, device_label, ip_summary
      FROM sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY last_activity_at DESC
    `).all(session.user.id, this.nowIso()).map(row => ({
      id: row.id,
      current: row.id === session.id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastActivityAt: row.last_activity_at,
      reauthenticatedAt: row.reauthenticated_at,
      deviceLabel: row.device_label,
      ipSummary: row.ip_summary,
    }))
  }

  revokeOwnSession (session, sessionId) {
    this.assertPermission(session, 'session.self.manage')
    const target = this.database.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, session.user.id)
    if (!target) throw createHttpError('会话不存在', 404, 'RESOURCE_NOT_FOUND')
    this.database.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(this.nowIso(), sessionId)
    return { status: 'ok', currentRevoked: sessionId === session.id }
  }

  logoutAll (session, options = {}) {
    this.assertPermission(session, 'session.self.manage')
    const now = this.nowIso()
    if (options.keepCurrent) {
      this.database.prepare(`
        UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL
      `).run(now, session.user.id, session.id)
    } else {
      this.database.prepare(`
        UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL
      `).run(now, session.user.id)
    }
    return { status: 'ok' }
  }

  async reauthenticate (session, password, context = {}) {
    const normalizedContext = normalizeContext(context)
    const limitKeys = attemptKeys('password', session.user.id, normalizedContext.ip)
    this.passwordLimiter.assertAllowedMany(limitKeys)
    const row = this.database.prepare('SELECT password_hash FROM users WHERE id = ?').get(session.user.id)
    if (!row || !await verifyPassword(password, row.password_hash)) {
      this.passwordLimiter.recordMany(limitKeys)
      throw createHttpError('当前密码不正确', 401, 'INVALID_CREDENTIALS')
    }
    this.passwordLimiter.clearMany([limitKeys[1], limitKeys[2]])
    const now = this.nowIso()
    this.database.prepare('UPDATE sessions SET reauthenticated_at = ? WHERE id = ?').run(now, session.id)
    return { reauthenticatedAt: now }
  }

  async changePassword (session, input = {}, context = {}) {
    const normalizedContext = normalizeContext(context)
    const limitKeys = attemptKeys('password', session.user.id, normalizedContext.ip)
    this.passwordLimiter.assertAllowedMany(limitKeys)
    const row = this.database.prepare('SELECT * FROM users WHERE id = ?').get(session.user.id)
    if (!row || !await verifyPassword(input.currentPassword, row.password_hash)) {
      this.passwordLimiter.recordMany(limitKeys)
      throw createHttpError('当前密码不正确', 400, 'INVALID_CREDENTIALS')
    }
    this.passwordLimiter.clearMany([limitKeys[1], limitKeys[2]])
    const passwordHash = await hashPassword(input.newPassword, { username: row.username_normalized })
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?
      `).run(passwordHash, now, row.id)
      this.database.prepare(`
        UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL
      `).run(now, row.id, session.id)
      this.database.prepare('UPDATE sessions SET reauthenticated_at = ? WHERE id = ?').run(now, session.id)
      this.insertAudit({
        actorUserId: row.id,
        action: 'user.password.change',
        targetType: 'user',
        targetId: row.id,
        ipSummary: normalizedContext.ip,
      })
    })
    return { status: 'ok', mustChangePassword: false }
  }

  getMyProfile (session) {
    this.assertPermission(session, 'account.self.read')
    return this.getUserById(session.user.id, { includePrivate: true })
  }

  updateMyProfile (session, input = {}, context = {}) {
    this.assertPermission(session, 'account.self.update')
    const row = this.database.prepare('SELECT * FROM users WHERE id = ?').get(session.user.id)
    const displayName = input.displayName === undefined
      ? row.display_name
      : validateDisplayName(input.displayName)
    const email = input.email === undefined ? row.email : normalizeOptionalEmail(input.email)
    const avatar = input.avatar === undefined ? (row.avatar || '') : validateAvatar(input.avatar)
    const gender = input.gender === undefined ? (row.gender || '') : validateGender(input.gender)
    const now = this.nowIso()
    this.database.prepare(`
      UPDATE users SET display_name = ?, email = ?, avatar = ?, gender = ?, updated_at = ? WHERE id = ?
    `).run(displayName, email, avatar, gender, now, row.id)
    if (session.user) Object.assign(session.user, { displayName, avatar, gender })
    this.insertAudit({
      actorUserId: row.id,
      action: 'user.profile.update',
      targetType: 'user',
      targetId: row.id,
      ipSummary: normalizeContext(context).ip,
    })
    return this.getUserById(row.id, { includePrivate: true })
  }

  createUser (actor, input = {}, context = {}) {
    this.assertPermission(actor, 'admin.user.manage')
    const identity = validateUsername(input.username)
    if (this.getUserRowByUsername(identity.normalized)) {
      throw createHttpError('用户名已存在', 409, 'USERNAME_CONFLICT')
    }
    const displayName = validateDisplayName(input.displayName, identity.display)
    const email = normalizeOptionalEmail(input.email)
    const temporaryPassword = createTemporaryPassword(input.password, identity.normalized)
    const roleCodes = Array.isArray(input.roles) && input.roles.length ? input.roles : ['user']
    const roles = this.resolveRoles(roleCodes)
    if (roles.some(role => role.code !== 'user') && !this.isSuperAdmin(actor)) {
      throw createHttpError('只有超级管理员可以创建管理角色用户', 403, 'PERMISSION_DENIED')
    }
    if (roles.some(role => role.code !== 'user')) {
      this.assertRecentReauth(actor)
    }
    const passwordHash = hashPasswordSync(temporaryPassword, { username: identity.normalized })
    const now = this.nowIso()
    const userId = randomId('usr')
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO users(
          id, username_normalized, username_display, display_name, email,
          password_hash, status, must_change_password, quota_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)
      `).run(userId, identity.normalized, identity.display, displayName, email, passwordHash, JSON.stringify(normalizeQuotaOverrides(input.quota || {}, this.getSettings().quota)), now, now)
      const assign = this.database.prepare('INSERT INTO user_roles(user_id, role_id, created_at) VALUES (?, ?, ?)')
      roles.forEach(role => assign.run(userId, role.id, now))
      this.insertAudit({
        actorUserId: actor.user.id,
        action: 'admin.user.create',
        targetType: 'user',
        targetId: userId,
        metadata: { roles: roles.map(role => role.code) },
        ipSummary: normalizeContext(context).ip,
      })
    })
    return {
      user: this.getUserById(userId, { includePrivate: false }),
      temporaryPassword,
    }
  }

  listUsers (actor, input = {}) {
    this.assertPermission(actor, 'admin.user.read')
    const { page, limit } = normalizePage(input)
    const where = []
    const params = []
    if (input.status) {
      where.push('u.status = ?')
      params.push(String(input.status))
    }
    if (input.search) {
      where.push('(u.username_normalized LIKE ? OR u.display_name LIKE ?)')
      const search = `%${String(input.search).trim().toLowerCase()}%`
      params.push(search, search)
    }
    if (input.role) {
      where.push(`EXISTS (
        SELECT 1 FROM user_roles ur2 JOIN roles r2 ON r2.id = ur2.role_id
        WHERE ur2.user_id = u.id AND r2.code = ?
      )`)
      params.push(String(input.role))
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = Number(this.database.prepare(`SELECT COUNT(*) AS count FROM users u ${clause}`).get(...params)?.count || 0)
    const rows = this.database.prepare(`
      SELECT u.*,
        (SELECT COUNT(*) FROM kml_documents k WHERE k.owner_id = u.id AND k.status = 'active') AS kml_count,
        (SELECT COUNT(*) FROM favorite_places f WHERE f.owner_id = u.id) AS favorite_count,
        (SELECT COUNT(*) FROM kml_shares s WHERE s.owner_id = u.id AND s.status = 'active') AS share_count
      FROM users u
      ${clause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit)
    const quotaSettings = this.getSettings().quota
    return {
      items: rows.map(row => ({
        ...this.userViewFromRow(row, { includePrivate: false, quotaSettings }),
        usage: {
          kmlCount: Number(row.kml_count || 0),
          favoriteCount: Number(row.favorite_count || 0),
          activeShareCount: Number(row.share_count || 0),
        },
      })),
      page,
      limit,
      total,
    }
  }

  getAdminUser (actor, userId) {
    this.assertPermission(actor, 'admin.user.read')
    const user = this.getUserById(userId, { includePrivate: false })
    if (!user) throw createHttpError('用户不存在', 404, 'RESOURCE_NOT_FOUND')
    return user
  }

  activeSuperAdminCount () {
    return Number(this.database.prepare(`
      SELECT COUNT(DISTINCT u.id) AS count
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE r.code = 'super_admin' AND u.status = 'active'
    `).get()?.count || 0)
  }

  assertCanModifyUser (actor, targetUserId) {
    const targetPermissions = this.permissionsForUser(targetUserId)
    const targetHasAdministrativeAuthority = targetPermissions.some(code => (
      code.startsWith('admin.') ||
      code.startsWith('kml.any.') ||
      code === 'system.super_admin'
    ))
    if (targetHasAdministrativeAuthority && !this.isSuperAdmin(actor)) {
      throw createHttpError('不能操作权限高于自己的账号', 403, 'PERMISSION_DENIED')
    }
  }

  updateUser (actor, userId, input = {}, context = {}) {
    this.assertPermission(actor, 'admin.user.manage')
    const row = this.database.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    if (!row) throw createHttpError('用户不存在', 404, 'RESOURCE_NOT_FOUND')
    this.assertCanModifyUser(actor, userId)

    const displayName = input.displayName === undefined ? row.display_name : validateDisplayName(input.displayName)
    const email = input.email === undefined ? row.email : normalizeOptionalEmail(input.email)
    const status = input.status === undefined ? row.status : String(input.status)
    if (!['active', 'disabled', 'locked', 'deleted'].includes(status)) {
      throw createHttpError('账号状态不正确', 400, 'VALIDATION_FAILED')
    }
    const targetIsSuperAdmin = this.permissionsForUser(userId).includes('system.super_admin')
    if (targetIsSuperAdmin && status !== row.status) {
      this.assertRecentReauth(actor)
    }
    if (targetIsSuperAdmin && row.status === 'active' && status !== 'active' && this.activeSuperAdminCount() <= 1) {
      throw createHttpError('系统必须保留至少一个有效超级管理员', 409, 'LAST_SUPER_ADMIN')
    }
    const quotaSettings = this.getSettings().quota
    const quota = input.quota === undefined
      ? normalizeStoredQuotaOverrides(parseJson(row.quota_json, {}), quotaSettings)
      : normalizeQuotaOverrides(input.quota, quotaSettings)
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE users SET display_name = ?, email = ?, status = ?, quota_json = ?,
          updated_at = ?, deleted_at = ? WHERE id = ?
      `).run(displayName, email, status, JSON.stringify(quota), now, status === 'deleted' ? now : null, userId)
      if (status !== row.status) {
        this.database.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, userId)
      }
      this.insertAudit({
        actorUserId: actor.user.id,
        action: 'admin.user.update',
        targetType: 'user',
        targetId: userId,
        metadata: { status, changedFields: Object.keys(input) },
        ipSummary: normalizeContext(context).ip,
      })
    })
    return this.getUserById(userId, { includePrivate: false })
  }

  async resetUserPassword (actor, userId, input = {}, context = {}) {
    this.assertPermission(actor, 'admin.user.manage')
    this.assertCanModifyUser(actor, userId)
    const row = this.database.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    if (!row) throw createHttpError('用户不存在', 404, 'RESOURCE_NOT_FOUND')
    this.assertRecentReauth(actor)
    const temporaryPassword = createTemporaryPassword(input.password, row.username_normalized)
    const passwordHash = await hashPassword(temporaryPassword, { username: row.username_normalized })
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare(`
        UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?
      `).run(passwordHash, now, userId)
      this.database.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, userId)
      this.insertAudit({
        actorUserId: actor.user.id,
        action: 'admin.user.password-reset',
        targetType: 'user',
        targetId: userId,
        ipSummary: normalizeContext(context).ip,
      })
    })
    return { temporaryPassword, mustChangePassword: true }
  }

  revokeUserSessions (actor, userId, context = {}) {
    this.assertPermission(actor, 'admin.user.manage')
    this.assertCanModifyUser(actor, userId)
    const row = this.database.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!row) throw createHttpError('用户不存在', 404, 'RESOURCE_NOT_FOUND')
    const result = this.database.prepare(`
      UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL
    `).run(this.nowIso(), userId)
    this.insertAudit({
      actorUserId: actor.user.id,
      action: 'admin.user.sessions-revoke',
      targetType: 'user',
      targetId: userId,
      metadata: { revokedCount: Number(result.changes || 0) },
      ipSummary: normalizeContext(context).ip,
    })
    return { revokedCount: Number(result.changes || 0) }
  }

  resolveRoles (codes) {
    if (!Array.isArray(codes)) {
      throw createHttpError('角色列表格式不正确', 400, 'VALIDATION_FAILED')
    }
    const normalizedCodes = [...new Set(codes.map(code => String(code || '').trim()).filter(Boolean))]
    if (!normalizedCodes.length) throw createHttpError('用户至少需要一个角色', 400, 'VALIDATION_FAILED')
    const placeholders = normalizedCodes.map(() => '?').join(', ')
    const roles = this.database.prepare(`SELECT * FROM roles WHERE code IN (${placeholders})`).all(...normalizedCodes)
    if (roles.length !== normalizedCodes.length) {
      throw createHttpError('包含不存在的角色', 400, 'VALIDATION_FAILED')
    }
    return roles
  }

  resolveRegistrationRoles (codes) {
    const roles = this.resolveRoles(codes)
    if (!roles.some(role => role.code === 'user')) {
      throw createHttpError('注册默认角色必须包含普通用户角色', 400, 'VALIDATION_FAILED')
    }
    const hasAdministrativeRole = roles.some(role => this.permissionsForRole(role.id).some(code => (
      code.startsWith('admin.') ||
      code.startsWith('kml.any.') ||
      code === 'system.super_admin'
    )))
    if (hasAdministrativeRole) {
      throw createHttpError('注册默认角色不能包含管理权限', 400, 'VALIDATION_FAILED')
    }
    return roles
  }

  setUserRoles (actor, userId, roleCodes, context = {}) {
    this.assertPermission(actor, 'admin.role.manage')
    this.assertSuperAdmin(actor)
    this.assertRecentReauth(actor)
    const target = this.database.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    if (!target) throw createHttpError('用户不存在', 404, 'RESOURCE_NOT_FOUND')
    const roles = this.resolveRoles(roleCodes)
    const currentRoles = this.roleCodesForUser(userId)
    const removesSuperAdmin = currentRoles.includes('super_admin') && !roles.some(role => role.code === 'super_admin')
    if (removesSuperAdmin && target.status === 'active' && this.activeSuperAdminCount() <= 1) {
      throw createHttpError('系统必须保留至少一个有效超级管理员', 409, 'LAST_SUPER_ADMIN')
    }
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId)
      const insert = this.database.prepare('INSERT INTO user_roles(user_id, role_id, created_at) VALUES (?, ?, ?)')
      roles.forEach(role => insert.run(userId, role.id, now))
      this.database.prepare(`
        UPDATE users SET permissions_version = permissions_version + 1, updated_at = ? WHERE id = ?
      `).run(now, userId)
      this.database.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, userId)
      this.insertAudit({
        actorUserId: actor.user.id,
        action: 'admin.user.roles-update',
        targetType: 'user',
        targetId: userId,
        metadata: { before: currentRoles, after: roles.map(role => role.code) },
        ipSummary: normalizeContext(context).ip,
      })
    })
    return this.getUserById(userId, { includePrivate: false })
  }

  listRoles (actor) {
    this.assertPermission(actor, 'admin.role.manage')
    return this.database.prepare(`
      SELECT r.*, (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count
      FROM roles r ORDER BY r.is_builtin DESC, r.code
    `).all().map(row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      builtIn: Boolean(row.is_builtin),
      userCount: Number(row.user_count || 0),
      permissions: this.database.prepare(`
        SELECT permission_code AS code FROM role_permissions WHERE role_id = ? ORDER BY permission_code
      `).all(row.id).map(item => item.code),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  validateRoleInput (input, current = {}) {
    const code = current.code || String(input.code || '').trim().toLowerCase()
    if (!/^[a-z][a-z0-9._-]{2,31}$/.test(code)) {
      throw createHttpError('角色代码需为 3～32 位小写字母、数字、点、下划线或短横线', 400, 'VALIDATION_FAILED')
    }
    if (BUILTIN_ROLES.some(role => role.code === code) && !current.code) {
      throw createHttpError('不能使用内置角色代码', 409, 'ROLE_CONFLICT')
    }
    const name = validateDisplayName(input.name ?? current.name)
    const description = String(input.description ?? current.description ?? '').trim().slice(0, 200)
    const permissions = [...new Set(input.permissions ?? current.permissions ?? [])].map(String)
    if (permissions.some(code => !isKnownPermission(code))) {
      throw createHttpError('角色包含未知权限码', 400, 'VALIDATION_FAILED')
    }
    if (permissions.includes('system.super_admin')) {
      throw createHttpError('自定义角色不能包含超级管理员根权限', 400, 'VALIDATION_FAILED')
    }
    return { code, name, description, permissions }
  }

  createRole (actor, input = {}, context = {}) {
    this.assertPermission(actor, 'admin.role.manage')
    this.assertSuperAdmin(actor)
    this.assertRecentReauth(actor)
    const normalized = this.validateRoleInput(input)
    if (this.database.prepare('SELECT id FROM roles WHERE code = ?').get(normalized.code)) {
      throw createHttpError('角色代码已存在', 409, 'ROLE_CONFLICT')
    }
    const roleId = randomId('role')
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare(`
        INSERT INTO roles(id, code, name, description, is_builtin, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
      `).run(roleId, normalized.code, normalized.name, normalized.description, actor.user.id, now, now)
      const insert = this.database.prepare('INSERT INTO role_permissions(role_id, permission_code) VALUES (?, ?)')
      normalized.permissions.forEach(code => insert.run(roleId, code))
      this.insertAudit({
        actorUserId: actor.user.id,
        action: 'admin.role.create',
        targetType: 'role',
        targetId: roleId,
        metadata: { code: normalized.code, permissions: normalized.permissions },
        ipSummary: normalizeContext(context).ip,
      })
    })
    return this.listRoles(actor).find(role => role.id === roleId)
  }

  updateRole (actor, roleId, input = {}, context = {}) {
    this.assertPermission(actor, 'admin.role.manage')
    this.assertSuperAdmin(actor)
    this.assertRecentReauth(actor)
    const row = this.database.prepare('SELECT * FROM roles WHERE id = ?').get(roleId)
    if (!row) throw createHttpError('角色不存在', 404, 'RESOURCE_NOT_FOUND')
    if (row.is_builtin) throw createHttpError('内置角色不能修改', 409, 'ROLE_BUILTIN')
    const currentPermissions = this.database.prepare(`
      SELECT permission_code AS code FROM role_permissions WHERE role_id = ? ORDER BY permission_code
    `).all(roleId).map(item => item.code)
    const normalized = this.validateRoleInput(input, {
      code: row.code,
      name: row.name,
      description: row.description,
      permissions: currentPermissions,
    })
    const now = this.nowIso()
    this.database.transaction(() => {
      this.database.prepare('UPDATE roles SET name = ?, description = ?, updated_at = ? WHERE id = ?')
        .run(normalized.name, normalized.description, now, roleId)
      this.database.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId)
      const insert = this.database.prepare('INSERT INTO role_permissions(role_id, permission_code) VALUES (?, ?)')
      normalized.permissions.forEach(code => insert.run(roleId, code))
      const affectedUsers = this.database.prepare('SELECT user_id FROM user_roles WHERE role_id = ?').all(roleId)
      const bump = this.database.prepare(`
        UPDATE users SET permissions_version = permissions_version + 1, updated_at = ? WHERE id = ?
      `)
      const revoke = this.database.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      affectedUsers.forEach(item => {
        bump.run(now, item.user_id)
        revoke.run(now, item.user_id)
      })
      this.insertAudit({
        actorUserId: actor.user.id,
        action: 'admin.role.update',
        targetType: 'role',
        targetId: roleId,
        metadata: { permissions: normalized.permissions, affectedUsers: affectedUsers.length },
        ipSummary: normalizeContext(context).ip,
      })
    })
    return this.listRoles(actor).find(role => role.id === roleId)
  }

  deleteRole (actor, roleId, context = {}) {
    this.assertPermission(actor, 'admin.role.manage')
    this.assertSuperAdmin(actor)
    this.assertRecentReauth(actor)
    const row = this.database.prepare('SELECT * FROM roles WHERE id = ?').get(roleId)
    if (!row) throw createHttpError('角色不存在', 404, 'RESOURCE_NOT_FOUND')
    if (row.is_builtin) throw createHttpError('内置角色不能删除', 409, 'ROLE_BUILTIN')
    const count = Number(this.database.prepare('SELECT COUNT(*) AS count FROM user_roles WHERE role_id = ?').get(roleId)?.count || 0)
    if (count > 0) throw createHttpError('角色仍被用户使用，请先迁移用户角色', 409, 'ROLE_IN_USE')
    this.database.prepare('DELETE FROM roles WHERE id = ?').run(roleId)
    this.insertAudit({
      actorUserId: actor.user.id,
      action: 'admin.role.delete',
      targetType: 'role',
      targetId: roleId,
      ipSummary: normalizeContext(context).ip,
    })
    return { status: 'ok' }
  }

  insertAudit (entry = {}) {
    const metadata = entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}
    this.database.prepare(`
      INSERT INTO audit_logs(
        id, actor_user_id, action, target_type, target_id, result,
        reason, metadata_json, ip_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomId('aud'),
      entry.actorUserId || null,
      String(entry.action || 'unknown').slice(0, 120),
      String(entry.targetType || 'unknown').slice(0, 80),
      String(entry.targetId || '').slice(0, 160),
      String(entry.result || 'success').slice(0, 20),
      String(entry.reason || '').slice(0, 500),
      JSON.stringify(sanitizeAuditValue(metadata)),
      summarizeIp(entry.ipSummary),
      this.nowIso()
    )
  }

  listAuditLogs (actor, input = {}) {
    this.assertPermission(actor, 'admin.audit.read')
    const { page, limit } = normalizePage(input)
    const where = []
    const params = []
    if (input.action) {
      where.push('a.action = ?')
      params.push(String(input.action))
    }
    if (input.actorUserId) {
      where.push('a.actor_user_id = ?')
      params.push(String(input.actorUserId))
    }
    if (input.targetType) {
      where.push('a.target_type = ?')
      params.push(String(input.targetType))
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = Number(this.database.prepare(`SELECT COUNT(*) AS count FROM audit_logs a ${clause}`).get(...params)?.count || 0)
    const rows = this.database.prepare(`
      SELECT a.*, u.username_display AS actor_username, u.display_name AS actor_display_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ${clause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, (page - 1) * limit)
    return {
      items: rows.map(row => ({
        id: row.id,
        actor: row.actor_user_id ? {
          id: row.actor_user_id,
          username: row.actor_username,
          displayName: row.actor_display_name,
        } : null,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        result: row.result,
        reason: row.reason,
        metadata: parseJson(row.metadata_json, {}),
        ipSummary: row.ip_summary,
        createdAt: row.created_at,
      })),
      page,
      limit,
      total,
    }
  }
}

export default UserSystemService
