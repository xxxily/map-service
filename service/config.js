import path from 'path'
import rootPath from './bin/rootPath.js'

function parseTrustProxy (value) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.toLowerCase() === 'false') return false
  if (normalized.toLowerCase() === 'true') return true
  if (/^\d+$/.test(normalized)) return Number(normalized)
  return normalized.split(',').map(item => item.trim()).filter(Boolean)
}

/* 基本配置项 */
const config = {
  /* 静态服务器配置 */
  staticService: {
    host: '::',
    port: parseInt(process.env.MAP_SERVICE_PORT) || 3088,
    trustProxy: parseTrustProxy(process.env.MAP_SERVICE_TRUST_PROXY),
    // port: 80,
    appDir: path.resolve(import.meta.dirname, './app'),
    staticDir: path.resolve(rootPath, './dist'),
    logDir: path.resolve(rootPath, './log'),
    staticLogFile: path.resolve(rootPath, './log/staticLog/log.json'),
    staticPath: '/',
    debug: false,

    fetchRelay: {
      cacheDir: path.resolve(rootPath, './.cache/fetchRelay'),
      ttl: 1000 * 60 * 60 * 6,
      staleTtl: 1000 * 60 * 60 * 24 * 30,
      timeout: 1000 * 10,
      minCacheBytes: 128,
      statsRefreshMinIntervalMs: 6 * 60 * 60 * 1000,
      browserMaxAge: 1000 * 60 * 60,
      browserStaleWhileRevalidate: 1000 * 60 * 60 * 24,
      allowedContentTypes: [
        'image/',
        'application/octet-stream',
        'application/json',
        'application/vnd.mapbox-vector-tile',
        'application/x-protobuf',
        'application/gzip',
      ],
    },

    kmlContent: {
      iframeAllowlist: String(process.env.MAP_SERVICE_KML_IFRAME_ALLOWLIST || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean),
    },

    userSystem: {
      databasePath: process.env.MAP_SERVICE_USER_DATABASE || path.resolve(rootPath, './.db/map-service.sqlite'),
      shareSecretEncryptionKey: process.env.MAP_SERVICE_SHARE_SECRET_KEY ||
        process.env.MAP_SERVICE_ADMIN_TOKEN_SECRET || 'map-service-dev-share-secret',
      sessionCookieName: 'map_user_session',
      csrfCookieName: 'map_csrf_token',
      shareCookiePrefix: 'map_share_access_',
      requireSecureBootstrap: process.env.NODE_ENV === 'production' ||
        String(process.env.MAP_SERVICE_REQUIRE_SECURE_BOOTSTRAP || '').toLowerCase() === 'true',
    },

    // 留言与审核使用独立数据库，避免交互域迁移影响用户系统 schema。
    interaction: {
      databasePath: process.env.MAP_SERVICE_INTERACTION_DATABASE ||
        path.resolve(rootPath, './.db/interaction.sqlite'),
      secretEncryptionKey: process.env.MAP_SERVICE_INTERACTION_SECRET_KEY ||
        process.env.MAP_SERVICE_SHARE_SECRET_KEY ||
        process.env.MAP_SERVICE_ADMIN_TOKEN_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'map-service-dev-interaction-secret'),
      ai: {
        enabled: String(process.env.MAP_SERVICE_AI_ENABLED || '').toLowerCase() === 'true',
        providerId: process.env.MAP_SERVICE_AI_PROVIDER_ID || '',
        promptVersion: process.env.MAP_SERVICE_AI_PROMPT_VERSION || 'interaction-moderation-v1',
        policyVersion: process.env.MAP_SERVICE_AI_POLICY_VERSION || process.env.MAP_SERVICE_AI_PROMPT_VERSION || 'interaction-moderation-v1',
        timeoutMs: Number(process.env.MAP_SERVICE_AI_TIMEOUT_MS || 3000),
        maxAttempts: Number(process.env.MAP_SERVICE_AI_MAX_ATTEMPTS || 2),
        dailyBudget: Number(process.env.MAP_SERVICE_AI_DAILY_BUDGET || 0),
        maxConcurrency: Number(process.env.MAP_SERVICE_AI_MAX_CONCURRENCY || 2),
        providerVerificationTtlMs: Number(process.env.MAP_SERVICE_AI_PROVIDER_VERIFICATION_TTL_MS || 24 * 60 * 60 * 1000),
        allowHosts: String(process.env.MAP_SERVICE_AI_ALLOWED_HOSTS || '').split(',').map(item => item.trim()).filter(Boolean),
        providers: [],
      },
      artalkMirror: {
        enabled: String(process.env.MAP_SERVICE_ARTALK_MIRROR_ENABLED || '').toLowerCase() === 'true',
        endpoint: String(process.env.MAP_SERVICE_ARTALK_MIRROR_ENDPOINT || '').replace(/\/$/u, ''),
        siteName: process.env.MAP_SERVICE_ARTALK_MIRROR_SITE_NAME || 'map-service-internal',
        email: process.env.MAP_SERVICE_ARTALK_MIRROR_EMAIL || '',
        password: process.env.MAP_SERVICE_ARTALK_MIRROR_PASSWORD || '',
        token: process.env.MAP_SERVICE_ARTALK_MIRROR_TOKEN || '',
        batchSize: Number(process.env.MAP_SERVICE_ARTALK_MIRROR_BATCH_SIZE || 20),
        pollIntervalMs: Number(process.env.MAP_SERVICE_ARTALK_MIRROR_POLL_INTERVAL_MS || 5000),
        timeoutMs: Number(process.env.MAP_SERVICE_ARTALK_MIRROR_TIMEOUT_MS || 3000),
        secret: process.env.MAP_SERVICE_ARTALK_MIRROR_SECRET ||
          process.env.MAP_SERVICE_INTERACTION_SECRET_KEY || '',
      },
      commentRateLimit: {
        maxRequests: Number(process.env.MAP_SERVICE_COMMENT_RATE_MAX || 10),
        windowMs: Number(process.env.MAP_SERVICE_COMMENT_RATE_WINDOW_MS || 60 * 1000),
        maxEntries: 10000,
      },
      retention: {
        publicCommentsDays: Number(process.env.MAP_SERVICE_INTERACTION_PUBLIC_RETENTION_DAYS || 730),
        privateCommentsDays: Number(process.env.MAP_SERVICE_INTERACTION_PRIVATE_RETENTION_DAYS || 90),
        anonymousContactDays: Number(process.env.MAP_SERVICE_INTERACTION_CONTACT_RETENTION_DAYS || 90),
        aiRawResultsDays: Number(process.env.MAP_SERVICE_INTERACTION_AI_RETENTION_DAYS || 30),
        reportsDays: Number(process.env.MAP_SERVICE_INTERACTION_REPORT_RETENTION_DAYS || 730),
        reportEventsDays: Number(process.env.MAP_SERVICE_INTERACTION_REPORT_EVENTS_RETENTION_DAYS || 30),
        outboxDays: Number(process.env.MAP_SERVICE_INTERACTION_OUTBOX_RETENTION_DAYS || 90),
      },
    },

    admin: {
      dataDir: path.resolve(rootPath, './.db/admin'),
      auth: {
        username: process.env.MAP_SERVICE_ADMIN_USERNAME || 'admin',
        password: process.env.MAP_SERVICE_ADMIN_PASSWORD || 'admin',
        bootstrapConfigured: Boolean(
          process.env.MAP_SERVICE_ADMIN_USERNAME && process.env.MAP_SERVICE_ADMIN_PASSWORD
        ),
        tokenSecret: process.env.MAP_SERVICE_ADMIN_TOKEN_SECRET || 'map-service-dev-admin-secret',
        tokenTtl: 1000 * 60 * 60 * 8,
      },
      precache: {
        maxTiles: 5000,
        defaultConcurrency: 4,
        maxConcurrency: 64,
      },
    },

    /* 允许哪些域名调取本站的接口 */
    enableCors: false,
    corsWhitelist: [
      // 'google.cn',
      // 'google.com',
      // 'autonavi.com',
      'do1.com.cn',
      'qiweioa..cn',
    ],
  },
}

export default config
