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
      sessionCookieName: 'map_user_session',
      csrfCookieName: 'map_csrf_token',
      shareCookiePrefix: 'map_share_access_',
      requireSecureBootstrap: process.env.NODE_ENV === 'production' ||
        String(process.env.MAP_SERVICE_REQUIRE_SECURE_BOOTSTRAP || '').toLowerCase() === 'true',
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
