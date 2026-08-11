/*!
 * @name         simpleApi.js
 * @description  API route registry
 * @version      0.0.1
 * @author       Blaze
 * @date         2020/2/20 14:58
 * @github       https://github.com/xxxily
 */
import urlJoin from 'url-join'
import multer from 'multer'
import utils from './utils/index.js'
import baseConfig from '../config.js'
import service from './service.js'
import whitelist from './whitelist.js'

const serviceConfig = baseConfig.staticService
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } })
const routeSet = {}
const CACHE_CONTROL_SECONDS = Math.floor((serviceConfig.fetchRelay?.browserMaxAge || 0) / 1000)
const STALE_SECONDS = Math.floor((serviceConfig.fetchRelay?.browserStaleWhileRevalidate || 0) / 1000)
const ACCESS_COOKIE_NAME = 'map_access_token'
const USER_COOKIE_NAMES = service.getUserSystemConfig()
const USER_SESSION_COOKIE_NAME = USER_COOKIE_NAMES.sessionCookieName
const USER_CSRF_COOKIE_NAME = USER_COOKIE_NAMES.csrfCookieName
const SHARE_COOKIE_PREFIX = USER_COOKIE_NAMES.shareCookiePrefix
const ACCESS_VERIFY_LIMIT = {
  maxAttempts: 5,
  windowMs: 1000 * 60 * 10,
  blockMs: 1000 * 60 * 15,
}
const accessVerifyAttempts = new Map()

async function requireAccess (req) {
  const accessEnabled = await service.isAccessEnabled()
  if (accessEnabled) {
    const token = accessTokenFromRequest(req)
    const verified = await service.verifyAccess(token)
    if (!verified) {
      const err = new Error('拒绝访问：未提供有效的地图访问授权')
      err.statusCode = 401
      throw err
    }
  }
}

function jsonError (res, error, statusCode = 500) {
  let message = error instanceof Error ? error.message : String(error || '处理失败')
  if (Number(statusCode) === 500) {
    message = '服务器处理请求失败'
  }
  if (
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ECONNRESET')
  ) {
    message = '获取图层资源失败，连接上游服务超时或被拒绝'
  }
  res.status(statusCode)
  res.jsonErr({
    code: error?.code || (statusCode === 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'),
    message,
  })
}

function cacheControlHeader () {
  const parts = [
    'public',
    `max-age=${CACHE_CONTROL_SECONDS}`,
  ]

  if (STALE_SECONDS) {
    parts.push(`stale-while-revalidate=${STALE_SECONDS}`)
  }

  return parts.join(', ')
}

function getCookie (req, name) {
  const cookies = req.get('cookie') || ''
  const matched = cookies.match(new RegExp(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`))
  if (!matched) return ''
  try {
    return decodeURIComponent(matched[2])
  } catch (err) {
    return ''
  }
}

function requestContext (req) {
  return {
    // req.ip 会按 Express 的 trust proxy 配置解析；不要直接信任客户端可伪造的转发头。
    ip: req.ip || req.socket?.remoteAddress || '',
    userAgent: req.get('user-agent') || '',
    deviceLabel: req.get('x-device-label') || req.get('user-agent') || '',
  }
}

function assertSameOriginCredentialRequest (req) {
  const fetchSite = String(req.get('sec-fetch-site') || '').trim().toLowerCase()
  const origin = String(req.get('origin') || '').trim()
  const referer = String(req.get('referer') || '').trim()

  // Fetch Metadata 是浏览器控制的来源信号；旧客户端缺失该头时再回退到 Origin/Referer。
  if (fetchSite === 'same-origin') return

  let sourceOrigin = ''

  try {
    sourceOrigin = origin
      ? new URL(origin).origin
      : (referer ? new URL(referer).origin : '')
  } catch {
    sourceOrigin = '__invalid__'
  }

  let expectedOrigin = ''
  try {
    expectedOrigin = new URL(`${req.protocol}://${req.get('host')}`).origin
  } catch {
    expectedOrigin = '__invalid__'
  }
  if (fetchSite === 'cross-site' || fetchSite === 'same-site' || (sourceOrigin && sourceOrigin !== expectedOrigin)) {
    const err = new Error('登录请求来源校验失败')
    err.statusCode = 403
    err.code = 'CSRF_INVALID'
    throw err
  }
}

function secureCookieOptions (req, options = {}) {
  return {
    path: options.path || '/',
    httpOnly: options.httpOnly !== false,
    sameSite: 'lax',
    secure: Boolean(req.secure),
    ...(options.maxAge ? { maxAge: options.maxAge } : {}),
  }
}

function setUserSessionCookies (req, res, login) {
  res.cookie(USER_SESSION_COOKIE_NAME, login.sessionToken, secureCookieOptions(req, { maxAge: login.maxAge }))
  res.cookie(USER_CSRF_COOKIE_NAME, login.csrfToken, secureCookieOptions(req, {
    httpOnly: false,
    maxAge: login.maxAge,
  }))
}

function clearUserSessionCookies (req, res) {
  res.clearCookie(USER_SESSION_COOKIE_NAME, secureCookieOptions(req))
  res.clearCookie(USER_CSRF_COOKIE_NAME, secureCookieOptions(req, { httpOnly: false }))
}

function publicLoginResult (login) {
  return {
    user: login.user,
    expiresAt: login.expiresAt,
  }
}

function sessionFromRequest (req) {
  if (req.userSession !== undefined) return req.userSession
  req.userSession = service.verifyUserSession(getCookie(req, USER_SESSION_COOKIE_NAME))
  return req.userSession
}

function requireUser (req, permission = '', options = {}) {
  const session = sessionFromRequest(req)
  if (!session) {
    const err = new Error('请先登录')
    err.statusCode = 401
    err.code = 'AUTH_REQUIRED'
    throw err
  }
  if (options.csrf !== false && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    service.verifyUserCsrf(session, req.get('x-csrf-token') || '')
  }
  if (permission) service.assertUserPermission(session, permission)
  return session
}

function requireAnyUserPermission (req, permissions) {
  const session = requireUser(req)
  const matchedPermission = permissions.find(permission => service.hasUserPermission(session, permission))
  if (!matchedPermission) {
    const err = new Error('没有执行此操作的权限')
    err.statusCode = 403
    err.code = 'PERMISSION_DENIED'
    throw err
  }
  service.assertUserPermission(session, matchedPermission)
  return session
}

function noStore (res) {
  res.set('Cache-Control', 'no-store')
}

function inferAdminPermission (req) {
  const pathName = req.path || req.originalUrl || ''
  if (pathName.includes('/admin/cache')) return 'admin.cache.manage'
  if (pathName.includes('/admin/precache')) return 'admin.precache.manage'
  if (pathName.includes('/admin/kml/shares')) return 'admin.share.moderate'
  if (pathName.includes('/admin/kml')) return 'admin.public_kml.manage'
  if (pathName.includes('/admin/settings')) return 'admin.security.manage'
  if (/\/(?:tile-sources|source-presets|key-pools|map-layers|proxy-|external-|source-access-logs)/.test(pathName)) {
    return 'admin.layer.manage'
  }
  return 'admin.overview.read'
}

function requireAdmin (req, permission = '') {
  const userSession = sessionFromRequest(req)
  if (userSession) {
    if (permission === false) {
      const session = requireUser(req)
      const granted = session.user?.permissions || []
      if (!granted.includes('system.super_admin') && !granted.some(code => code.startsWith('admin.'))) {
        const err = new Error('该账号没有管理后台权限')
        err.statusCode = 403
        err.code = 'PERMISSION_DENIED'
        throw err
      }
      return session
    }
    return requireUser(req, permission || inferAdminPermission(req))
  }

  const err = new Error('未登录或登录已过期')
  err.statusCode = 401
  err.code = 'AUTH_REQUIRED'
  throw err
}

function accessTokenFromRequest (req) {
  return getCookie(req, ACCESS_COOKIE_NAME)
}

function accessVerifyKey (req) {
  return [
    req.ip || req.socket?.remoteAddress || 'unknown',
    req.get('user-agent') || '',
  ].join('|')
}

function getAccessVerifyState (req) {
  const key = accessVerifyKey(req)
  const now = Date.now()
  const state = accessVerifyAttempts.get(key)
  if (!state || now - state.firstFailedAt > ACCESS_VERIFY_LIMIT.windowMs) {
    return {
      key,
      state: {
        count: 0,
        firstFailedAt: now,
        blockedUntil: 0,
      },
    }
  }
  return { key, state }
}

function assertAccessVerifyAllowed (req) {
  const { state } = getAccessVerifyState(req)
  if (state.blockedUntil > Date.now()) {
    const err = new Error('访问密码错误次数过多，请稍后再试')
    err.statusCode = 429
    throw err
  }
}

function recordAccessVerifyFailure (req) {
  const { key, state } = getAccessVerifyState(req)
  state.count += 1
  if (state.count >= ACCESS_VERIFY_LIMIT.maxAttempts) {
    state.blockedUntil = Date.now() + ACCESS_VERIFY_LIMIT.blockMs
  }
  accessVerifyAttempts.set(key, state)
}

function clearAccessVerifyFailures (req) {
  accessVerifyAttempts.delete(accessVerifyKey(req))
}

function accessCookieOptions (req, maxAge) {
  return {
    path: '/',
    httpOnly: true,
    maxAge,
    sameSite: 'lax',
    secure: Boolean(req.secure),
  }
}

function shareCookieName (publicId) {
  return `${SHARE_COOKIE_PREFIX}${String(publicId || '').slice(0, 64)}`
}

async function publicShareContext (req) {
  const accessEnabled = await service.isAccessEnabled()
  const siteAccessGranted = !accessEnabled || await service.verifyAccess(accessTokenFromRequest(req))
  return {
    ...requestContext(req),
    siteAccessGranted,
    accessToken: getCookie(req, shareCookieName(req.params.publicId)),
  }
}

function sendKmlDownload (res, exported) {
  res.status(200)
  res.set({
    'Cache-Control': 'no-store',
    'Content-Type': exported.contentType,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(exported.filename)}`,
  })
  res.send(exported.content)
}

function maskSensitiveQueryParams (value) {
  const raw = String(value || '')
  if (!raw) return raw

  try {
    const parsed = new URL(raw, 'http://localhost')
    let changed = false
    ;['token', 'access_token'].forEach((key) => {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, '****')
        changed = true
      }
    })
    if (!changed) return raw
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch (err) {
    return raw.replace(/([?&](?:token|access_token)=)[^&]*/gi, '$1****')
  }
}

function externalPublishLogLimit (publish) {
  if (publish?.log?.enabled === false) return 0
  if (publish?.log && Object.hasOwn(publish.log, 'maxLogCount')) {
    return Number(publish.log.maxLogCount || 0)
  }
  return 500
}

function writeExternalPublishLog (entry, publish) {
  const limit = externalPublishLogLimit(publish)
  if (limit <= 0) return
  service.logExternalPublishRequest(entry, limit).catch(err => {
    console.error('[external publish log error]', err)
  })
}

function sourceAccessLogLimit (source) {
  if (source?.accessLog?.enabled === false) return 0
  if (source?.accessLog && Object.hasOwn(source.accessLog, 'maxLogCount')) {
    return Number(source.accessLog.maxLogCount || 0)
  }
  return 500
}

function writeSourceAccessErrorLog (entry, source) {
  const limit = sourceAccessLogLimit(source)
  if (limit <= 0) return
  service.logSourceAccessRequest(entry, null, limit).catch(err => {
    console.error('[source access log error]', err)
  })
}

function buildOpenApiSpec () {
  const paths = {}

  Object.values(routeSet).forEach((conf) => {
    const method = conf.method === 'all' ? 'get' : conf.method
    paths[conf.urlPath] = {
      ...(paths[conf.urlPath] || {}),
      [method]: {
        summary: conf.describe,
        tags: conf.tags || ['default'],
        responses: {
          200: {
            description: 'Successful response',
          },
        },
      },
    }
  })

  return {
    openapi: '3.1.0',
    info: {
      title: 'map-service API',
      version: '1.0.0',
    },
    paths,
  }
}

async function sendRelayResponse (res, relayResult) {
  res.status(relayResult.statusCode || 200)
  res.set({
    ...relayResult.headers,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': cacheControlHeader(),
    'X-Cache': relayResult.cacheStatus || 'UNKNOWN',
  })

  relayResult.stream.on('error', (err) => {
    console.error('[tile relay stream error]', err)
    if (!res.headersSent) {
      jsonError(res, '瓦片数据流读取失败', 502)
    } else {
      res.destroy(err)
    }
  })

  relayResult.stream.pipe(res)
}

async function sendControlledTileSource (req, res) {
  const startTime = Date.now()
  const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
  const userAgent = req.headers['user-agent'] || ''
  const sourceId = req.params.sourceId
  try {
    const result = await service.fetchTileSource(sourceId, {
      z: req.params.z,
      x: req.params.x,
      y: req.params.y,
    }, {
      scale: req.query.scale,
      clientIp,
      userAgent,
      reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
      headers: {
        'User-Agent': userAgent || 'Mozilla/5.0',
      },
    })
    await sendRelayResponse(res, result)
  } catch (err) {
    const status = err.statusCode || err.response?.status || 502
    const source = await service.getTileSource(sourceId).catch(() => null)
    if (source) {
      writeSourceAccessErrorLog({
        timestamp: new Date().toISOString(),
        sourceId: source.id || sourceId,
        publishId: '',
        layerId: '',
        clientIp,
        userAgent,
        coordinates: `Z:${req.params.z || ''} X:${req.params.x || ''} Y:${req.params.y || ''}`,
        reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        statusCode: status,
        duration: Date.now() - startTime,
        cacheStatus: 'ERROR',
        proxyMode: source.proxy?.mode || '',
        proxyPoolId: source.proxy?.poolId || '',
        proxyOutboundId: source.proxy?.outboundId || '',
        proxyConfigured: Boolean(source.proxy?.mode && source.proxy.mode !== 'never'),
        cacheEnabled: source.cache?.enabled !== false,
        errorMessage: err.message || '图源瓦片请求失败',
      }, source)
    }
    throw err
  }
}

const userApiRoutes = [
  {
    path: '/auth/config',
    method: 'get',
    describe: '获取用户系统公开配置',
    tags: ['auth'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.getAuthConfig())
    },
  },
  {
    path: '/auth/register',
    method: 'post',
    describe: '用户自助注册',
    tags: ['auth'],
    handler: async (req, res) => {
      noStore(res)
      assertSameOriginCredentialRequest(req)
      const result = await service.registerUser(req.body || {}, requestContext(req))
      res.status(202).jsonSuc(result)
    },
  },
  {
    path: '/auth/login',
    method: 'post',
    describe: '用户登录',
    tags: ['auth'],
    handler: async (req, res) => {
      noStore(res)
      assertSameOriginCredentialRequest(req)
      const login = await service.loginUser(req.body || {}, requestContext(req))
      setUserSessionCookies(req, res, login)
      res.jsonSuc(publicLoginResult(login))
    },
  },
  {
    path: '/auth/logout',
    method: 'post',
    describe: '退出当前用户会话',
    tags: ['auth'],
    handler: async (req, res) => {
      noStore(res)
      const session = requireUser(req)
      const result = service.logoutUser(session, requestContext(req))
      clearUserSessionCookies(req, res)
      res.jsonSuc(result)
    },
  },
  {
    path: '/auth/session',
    method: 'get',
    describe: '获取当前用户会话摘要',
    tags: ['auth'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.getUserSessionView(sessionFromRequest(req)))
    },
  },
  {
    path: '/auth/reauth',
    method: 'post',
    describe: '重新验证当前用户密码',
    tags: ['auth'],
    handler: async (req, res) => {
      noStore(res)
      const session = requireUser(req)
      res.jsonSuc(await service.reauthenticateUser(session, req.body?.password, requestContext(req)))
    },
  },
  {
    path: '/auth/password',
    method: 'post',
    describe: '修改当前用户密码',
    tags: ['auth'],
    handler: async (req, res) => {
      noStore(res)
      const session = requireUser(req)
      res.jsonSuc(await service.changeUserPassword(session, req.body || {}, requestContext(req)))
    },
  },
  {
    path: '/auth/sessions',
    method: 'get',
    describe: '列出当前用户活跃会话',
    tags: ['auth'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.listUserSessions(requireUser(req, 'session.self.manage')))
    },
  },
  {
    path: '/auth/sessions/:id',
    method: 'delete',
    describe: '注销指定个人会话',
    tags: ['auth'],
    handler: async (req, res) => {
      noStore(res)
      const result = service.revokeUserSession(requireUser(req, 'session.self.manage'), req.params.id)
      if (result.currentRevoked) clearUserSessionCookies(req, res)
      res.jsonSuc(result)
    },
  },
  {
    path: '/auth/logout-all',
    method: 'post',
    describe: '注销当前用户的全部会话',
    tags: ['auth'],
    handler: async (req, res) => {
      noStore(res)
      const keepCurrent = req.body?.keepCurrent !== false
      const result = service.logoutAllUserSessions(requireUser(req, 'session.self.manage'), { keepCurrent })
      if (!keepCurrent) clearUserSessionCookies(req, res)
      res.jsonSuc(result)
    },
  },
  {
    path: '/users/me',
    method: 'get',
    describe: '获取当前用户资料',
    tags: ['users'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.getCurrentUserProfile(requireUser(req, 'account.self.read')))
    },
  },
  {
    path: '/users/me',
    method: 'put',
    describe: '修改当前用户资料',
    tags: ['users'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.updateCurrentUserProfile(
        requireUser(req, 'account.self.update'),
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/files',
    method: 'get',
    describe: '列出个人 KML',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.listUserKmlFiles(requireUser(req, 'kml.own.read'), req.query || {}))
    },
  },
  {
    path: '/kml/files',
    method: 'post',
    describe: '新建个人 KML',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      res.status(201).jsonSuc(service.createUserKml(
        requireUser(req, 'kml.own.write'),
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/files/:id',
    method: 'get',
    describe: '获取个人 KML 详情',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.getUserKml(requireAnyUserPermission(req, [
        'kml.own.read',
        'kml.own.write',
        'kml.any.read',
        'kml.any.manage',
      ]), req.params.id))
    },
  },
  {
    path: '/kml/files/:id',
    method: 'put',
    describe: '更新个人 KML',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.updateUserKml(
        requireAnyUserPermission(req, ['kml.own.write', 'kml.any.manage']),
        req.params.id,
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/files/:id',
    method: 'delete',
    describe: '将个人 KML 移入回收站',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.trashUserKml(
        requireAnyUserPermission(req, ['kml.own.write', 'kml.any.manage']),
        req.params.id,
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/files/:id/restore',
    method: 'post',
    describe: '恢复个人 KML',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.restoreUserKml(
        requireAnyUserPermission(req, ['kml.own.write', 'kml.any.manage']),
        req.params.id,
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/files/:id/permanent',
    method: 'delete',
    describe: '永久删除个人 KML',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.permanentlyDeleteUserKml(
        requireAnyUserPermission(req, ['kml.own.write', 'kml.any.manage']),
        req.params.id,
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/import',
    method: 'post',
    describe: '导入个人 KML 文件',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      const session = requireUser(req, 'kml.own.write')
      await new Promise((resolve, reject) => {
        upload.single('file')(req, res, err => err ? reject(err) : resolve())
      })
      if (!req.file) {
        const err = new Error('未上传 KML 文件')
        err.statusCode = 400
        err.code = 'VALIDATION_FAILED'
        throw err
      }
      res.status(201).jsonSuc(service.importUserKml(session, {
        ...req.body,
        fileName: req.file.originalname,
        kmlText: req.file.buffer.toString('utf8'),
      }, requestContext(req)))
    },
  },
  {
    path: '/kml/import/2bulu',
    method: 'post',
    describe: '从两步路公开分享链接导入个人 KML',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      const session = requireUser(req, 'kml.own.write')
      res.status(201).jsonSuc(await service.importTwoBuluUserKml(
        session,
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/import/2bulu/browser-helper',
    method: 'post',
    describe: '保存授权浏览器助手取得的两步路 KML',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      const session = requireUser(req, 'kml.own.write')
      res.status(201).jsonSuc(await service.importTwoBuluBrowserHelperKml(
        session,
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/share-links/resolve',
    method: 'post',
    describe: '解析受支持的 KML 点位第三方分享链接',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      const session = requireAnyUserPermission(req, [
        'kml.own.write',
        'kml.any.manage',
        'admin.public_kml.manage',
      ])
      res.jsonSuc(await service.resolveKmlShareLinks(
        session,
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/files/:id/export',
    method: 'get',
    describe: '导出个人 KML 文件',
    tags: ['kml'],
    handler: async (req, res) => {
      sendKmlDownload(res, service.exportUserKml(requireAnyUserPermission(req, [
        'kml.own.read',
        'kml.own.write',
        'kml.any.read',
        'kml.any.manage',
      ]), req.params.id))
    },
  },
  {
    path: '/kml/sync',
    method: 'post',
    describe: '增量同步个人 KML',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.syncUserKmlFiles(
        requireUser(req, 'kml.own.write'),
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/migrations/local',
    method: 'post',
    describe: '迁移浏览器本地 KML',
    tags: ['kml'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.migrateLocalUserKml(
        requireUser(req, 'kml.own.write'),
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/favorites',
    method: 'get',
    describe: '列出个人位置收藏',
    tags: ['favorites'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.listUserFavorites(requireUser(req, 'favorite.own.manage'), req.query || {}))
    },
  },
  {
    path: '/favorites',
    method: 'post',
    describe: '新建位置收藏',
    tags: ['favorites'],
    handler: async (req, res) => {
      noStore(res)
      res.status(201).jsonSuc(service.createUserFavorite(
        requireUser(req, 'favorite.own.manage'),
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/favorites/:id',
    method: 'get',
    describe: '获取位置收藏',
    tags: ['favorites'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.getUserFavorite(requireUser(req, 'favorite.own.manage'), req.params.id))
    },
  },
  {
    path: '/favorites/:id',
    method: 'put',
    describe: '更新位置收藏',
    tags: ['favorites'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.updateUserFavorite(
        requireUser(req, 'favorite.own.manage'),
        req.params.id,
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/favorites/:id',
    method: 'delete',
    describe: '删除位置收藏',
    tags: ['favorites'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.deleteUserFavorite(
        requireUser(req, 'favorite.own.manage'),
        req.params.id,
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/shares',
    method: 'get',
    describe: '列出个人 KML 分享包',
    tags: ['shares'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.listUserKmlShares(requireUser(req, 'share.own.manage'), req.query || {}))
    },
  },
  {
    path: '/kml/shares',
    method: 'post',
    describe: '创建多 KML 分享包',
    tags: ['shares'],
    handler: async (req, res) => {
      noStore(res)
      res.status(201).jsonSuc(service.createUserKmlShare(
        requireUser(req, 'share.own.manage'),
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/shares/:id',
    method: 'get',
    describe: '获取个人分享包详情',
    tags: ['shares'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.getUserKmlShare(requireUser(req, 'share.own.manage'), req.params.id))
    },
  },
  {
    path: '/kml/shares/:id',
    method: 'put',
    describe: '更新个人分享包',
    tags: ['shares'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.updateUserKmlShare(
        requireUser(req, 'share.own.manage'),
        req.params.id,
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/shares/:id/pause',
    method: 'post',
    describe: '暂停个人分享包',
    tags: ['shares'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.pauseUserKmlShare(
        requireUser(req, 'share.own.manage'),
        req.params.id,
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/shares/:id/resume',
    method: 'post',
    describe: '恢复个人分享包',
    tags: ['shares'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.resumeUserKmlShare(
        requireUser(req, 'share.own.manage'),
        req.params.id,
        requestContext(req)
      ))
    },
  },
  {
    path: '/kml/shares/:id/rotate-link',
    method: 'post',
    describe: '轮换个人分享链接',
    tags: ['shares'],
    handler: async (req, res) => {
      noStore(res)
      const session = requireUser(req, 'share.own.manage')
      service.assertUserRecentReauth(session)
      res.jsonSuc(service.rotateUserKmlShareLink(session, req.params.id, requestContext(req)))
    },
  },
  {
    path: '/kml/shares/:id/revoke',
    method: 'post',
    describe: '撤销个人分享包',
    tags: ['shares'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.revokeUserKmlShare(
        requireUser(req, 'share.own.manage'),
        req.params.id,
        requestContext(req)
      ))
    },
  },
  {
    path: '/public/kml-shares/:publicId',
    method: 'get',
    describe: '获取公开多 KML 分享清单',
    tags: ['shares'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.getPublicKmlShareManifest(req.params.publicId, await publicShareContext(req)))
    },
  },
  {
    path: '/public/kml-shares/:publicId/map/catalog',
    method: 'get',
    describe: '获取公开分享可用的受控底图目录',
    tags: ['shares'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(await service.getPublicKmlShareMapCatalog(
        req.params.publicId,
        await publicShareContext(req)
      ))
    },
  },
  {
    path: '/public/kml-shares/:publicId/tiles/:sourceId/:z/:x/:y',
    method: 'get',
    describe: '按公开分享授权读取受控底图瓦片',
    tags: ['shares', 'tiles'],
    handler: async (req, res) => {
      await service.assertPublicKmlShareMapSource(
        req.params.publicId,
        req.params.sourceId,
        await publicShareContext(req)
      )
      await sendControlledTileSource(req, res)
    },
  },
  {
    path: '/public/kml-shares/:publicId/access',
    method: 'post',
    describe: '验证公开分享密码',
    tags: ['shares'],
    handler: async (req, res) => {
      noStore(res)
      const result = await service.authorizePublicKmlShare(
        req.params.publicId,
        req.body || {},
        await publicShareContext(req)
      )
      if (result.accessToken) {
        const maxAge = Math.max(0, Date.parse(result.expiresAt) - Date.now())
        res.cookie(shareCookieName(req.params.publicId), result.accessToken, secureCookieOptions(req, {
          maxAge,
          path: `/api/v1/public/kml-shares/${encodeURIComponent(req.params.publicId)}`,
        }))
      }
      res.jsonSuc({
        passwordRequired: result.passwordRequired,
        expiresAt: result.expiresAt,
      })
    },
  },
  {
    path: '/public/kml-shares/:publicId/files/:shareItemId',
    method: 'get',
    describe: '获取公开分享内的 KML',
    tags: ['shares'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.getPublicKmlShareFile(
        req.params.publicId,
        req.params.shareItemId,
        await publicShareContext(req)
      ))
    },
  },
  {
    path: '/public/kml-shares/:publicId/files/:shareItemId/export',
    method: 'get',
    describe: '导出公开分享内的 KML',
    tags: ['shares'],
    handler: async (req, res) => {
      sendKmlDownload(res, service.exportPublicKmlShareFile(
        req.params.publicId,
        req.params.shareItemId,
        await publicShareContext(req)
      ))
    },
  },
  {
    path: '/admin/auth/session',
    method: 'get',
    describe: '获取统一管理后台会话',
    tags: ['admin'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.getUserSessionView(requireAdmin(req, false)))
    },
  },
  {
    path: '/admin/users',
    method: 'get',
    describe: '管理后台用户列表',
    tags: ['admin-users'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.listManagedUsers(requireAdmin(req, 'admin.user.read'), req.query || {}))
    },
  },
  {
    path: '/admin/users',
    method: 'post',
    describe: '管理后台创建用户',
    tags: ['admin-users'],
    handler: async (req, res) => {
      noStore(res)
      res.status(201).jsonSuc(service.createManagedUser(
        requireAdmin(req, 'admin.user.manage'),
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/admin/users/:id',
    method: 'get',
    describe: '管理后台用户详情',
    tags: ['admin-users'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.getManagedUser(requireAdmin(req, 'admin.user.read'), req.params.id))
    },
  },
  {
    path: '/admin/users/:id',
    method: 'put',
    describe: '管理后台更新用户',
    tags: ['admin-users'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.updateManagedUser(
        requireAdmin(req, 'admin.user.manage'),
        req.params.id,
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/admin/users/:id/roles',
    method: 'put',
    describe: '管理后台替换用户角色',
    tags: ['admin-users'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.setManagedUserRoles(
        requireAdmin(req, 'admin.role.manage'),
        req.params.id,
        req.body?.roleCodes || req.body?.roles || [],
        requestContext(req)
      ))
    },
  },
  {
    path: '/admin/users/:id/reset-password',
    method: 'post',
    describe: '管理后台重置用户密码',
    tags: ['admin-users'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(await service.resetManagedUserPassword(
        requireAdmin(req, 'admin.user.manage'),
        req.params.id,
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/admin/users/:id/revoke-sessions',
    method: 'post',
    describe: '管理后台强制用户退出',
    tags: ['admin-users'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.revokeManagedUserSessions(
        requireAdmin(req, 'admin.user.manage'),
        req.params.id,
        requestContext(req)
      ))
    },
  },
  {
    path: '/admin/roles',
    method: 'get',
    describe: '管理后台角色列表',
    tags: ['admin-roles'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.listManagedRoles(requireAdmin(req, 'admin.role.manage')))
    },
  },
  {
    path: '/admin/roles',
    method: 'post',
    describe: '管理后台创建角色',
    tags: ['admin-roles'],
    handler: async (req, res) => {
      noStore(res)
      res.status(201).jsonSuc(service.createManagedRole(
        requireAdmin(req, 'admin.role.manage'),
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/admin/roles/:id',
    method: 'put',
    describe: '管理后台更新角色',
    tags: ['admin-roles'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.updateManagedRole(
        requireAdmin(req, 'admin.role.manage'),
        req.params.id,
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/admin/roles/:id',
    method: 'delete',
    describe: '管理后台删除角色',
    tags: ['admin-roles'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.deleteManagedRole(
        requireAdmin(req, 'admin.role.manage'),
        req.params.id,
        requestContext(req)
      ))
    },
  },
  {
    path: '/admin/user-system/settings',
    method: 'get',
    describe: '获取用户系统设置',
    tags: ['admin-users'],
    handler: async (req, res) => {
      noStore(res)
      requireAnyUserPermission(req, ['admin.registration.manage', 'admin.security.manage'])
      res.jsonSuc(service.getUserSystemSettings())
    },
  },
  {
    path: '/admin/user-system/settings',
    method: 'put',
    describe: '更新用户系统设置',
    tags: ['admin-users'],
    handler: async (req, res) => {
      noStore(res)
      const session = requireAnyUserPermission(req, ['admin.registration.manage', 'admin.security.manage'])
      res.jsonSuc(service.updateUserSystemSettings(session, req.body || {}, requestContext(req)))
    },
  },
  {
    path: '/admin/kml/shares',
    method: 'get',
    describe: '管理后台分享治理列表',
    tags: ['admin-shares'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.listAllUserKmlShares(requireAdmin(req, 'admin.share.moderate'), req.query || {}))
    },
  },
  {
    path: '/admin/kml/shares/:id/block',
    method: 'post',
    describe: '封禁用户 KML 分享',
    tags: ['admin-shares'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.blockUserKmlShare(
        requireAdmin(req, 'admin.share.moderate'),
        req.params.id,
        req.body || {},
        requestContext(req)
      ))
    },
  },
  {
    path: '/admin/kml/shares/:id/unblock',
    method: 'post',
    describe: '解除用户 KML 分享封禁',
    tags: ['admin-shares'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.unblockUserKmlShare(
        requireAdmin(req, 'admin.share.moderate'),
        req.params.id,
        requestContext(req)
      ))
    },
  },
  {
    path: '/admin/audit-logs',
    method: 'get',
    describe: '查询用户系统审计日志',
    tags: ['admin-audit'],
    handler: async (req, res) => {
      noStore(res)
      res.jsonSuc(service.listUserAuditLogs(requireAdmin(req, 'admin.audit.read'), req.query || {}))
    },
  },
]

const simpleApi = {
  routeSet,
  basePath: '/api/v1',
  localService: 'http://127.0.0.1:' + serviceConfig.port,
  configList: [
    ...userApiRoutes,
    {
      path: '/health',
      method: 'get',
      describe: '健康检查',
      tags: ['system'],
      handler: async (req, res) => res.jsonSuc({ status: 'ok', timestamp: Date.now(), }),
    },
    {
      path: '/routes',
      method: 'get',
      describe: '获取当前 API 路由目录',
      tags: ['system'],
      handler: async (req, res) => {
        res.jsonSuc(Object.values(routeSet).map((conf) => ({
          method: conf.method.toUpperCase(),
          path: conf.urlPath,
          describe: conf.describe,
          tags: conf.tags || [],
        })))
      },
    },
    {
      path: '/openapi.json',
      method: 'get',
      describe: '获取 OpenAPI 说明',
      tags: ['system'],
      handler: async (req, res) => res.jsonSuc(buildOpenApiSpec()),
    },
    {
      path: '/tiles/relay',
      method: 'get',
      describe: '带服务端缓存的地图瓦片代理',
      tags: ['tiles'],
      handler: async (req, res) => {
        // 访问控制拦截
        const accessEnabled = await service.isAccessEnabled()
        if (accessEnabled) {
          const token = accessTokenFromRequest(req)
          const verified = await service.verifyAccess(token)
          if (!verified) {
            jsonError(res, '拒绝访问：未提供有效的地图访问授权', 401)
            return
          }
        }

        if (!req.query.url) {
          jsonError(res, '缺少 url 参数', 400)
          return
        }

        let targetUrl = ''
        try {
          targetUrl = decodeURIComponent(req.query.url)
        } catch (err) {
          jsonError(res, 'url 参数不是有效的 URL 编码', 400)
          return
        }

        if (!whitelist.isAllowed(targetUrl)) {
          console.error('请求的 URL 不在白名单内，不允许请求：', targetUrl)
          jsonError(res, '请求的 URL 不在白名单内，不允许请求', 403)
          return
        }

        const result = await service.fetchRelay(targetUrl, {
          refresh: utils.strToBoolean(req.query.refresh),
          noCache: utils.strToBoolean(req.query.noCache),
          cache: req.query.cache === undefined ? true : utils.strToBoolean(req.query.cache),
        })

        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/kml/media',
      method: 'get',
      describe: '获取白名单内的 KML 兼容图片',
      tags: ['kml'],
      handler: async (req, res) => {
        await requireAccess(req)
        const result = await service.fetchKmlMedia(req.query.url)
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/admin/auth/login',
      method: 'post',
      describe: '管理后台登录',
      tags: ['admin'],
      handler: async (req, res) => {
        noStore(res)
        assertSameOriginCredentialRequest(req)
        const login = await service.loginUser(req.body || {}, requestContext(req))
        const canEnterAdmin = login.user.permissions.includes('system.super_admin') ||
          login.user.permissions.some(permission => permission.startsWith('admin.'))
        if (!canEnterAdmin) {
          service.logoutUser(service.verifyUserSession(login.sessionToken), requestContext(req))
          const err = new Error('该账号没有管理后台权限')
          err.statusCode = 403
          err.code = 'PERMISSION_DENIED'
          throw err
        }
        setUserSessionCookies(req, res, login)
        res.jsonSuc(publicLoginResult(login))
      },
    },
    {
      path: '/admin/auth/logout',
      method: 'post',
      describe: '管理后台退出登录',
      tags: ['admin'],
      handler: async (req, res) => {
        noStore(res)
        const session = requireUser(req)
        if (session?.user) service.logoutUser(session, requestContext(req))
        clearUserSessionCookies(req, res)
        res.jsonSuc({ status: 'ok' })
      },
    },
    {
      path: '/admin/auth/password',
      method: 'post',
      describe: '修改管理后台密码',
      tags: ['admin'],
      handler: async (req, res) => {
        noStore(res)
        const session = requireUser(req)
        res.jsonSuc(await service.changeUserPassword(session, req.body || {}, requestContext(req)))
      },
    },
    {
      path: '/admin/session',
      method: 'get',
      describe: '获取当前管理后台会话',
      tags: ['admin'],
      handler: async (req, res) => {
        noStore(res)
        res.jsonSuc(service.getUserSessionView(requireAdmin(req, false)))
      },
    },
    {
      path: '/admin/system',
      method: 'get',
      describe: '获取管理后台系统概览',
      tags: ['admin'],
      handler: async (req, res) => {
        const actor = requireAdmin(req, 'admin.overview.read')
        res.jsonSuc(await service.getAdminSystemInfo(actor))
      },
    },
    {
      path: '/admin/cache',
      method: 'get',
      describe: '获取管理后台缓存状态',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.getFetchRelayCacheStats())
      },
    },
    {
      path: '/admin/cache',
      method: 'delete',
      describe: '清理管理后台瓦片缓存',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        const targetUrl = req.query.url ? decodeURIComponent(req.query.url) : ''
        const sourceId = req.query.sourceId || ''
        if (targetUrl && !whitelist.isAllowed(targetUrl)) {
          jsonError(res, '请求的 URL 不在白名单内，不允许清理', 403)
          return
        }
        res.jsonSuc(await service.clearFetchRelayCache(targetUrl, sourceId))
      },
    },
    {
      path: '/admin/visits',
      method: 'get',
      describe: '获取管理后台访问统计',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.getVisitStats())
      },
    },
    {
      path: '/admin/settings',
      method: 'get',
      describe: '获取管理后台运行时设置',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.getAdminSettings())
      },
    },
    {
      path: '/admin/settings',
      method: 'put',
      describe: '更新管理后台运行时设置',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.updateAdminSettings(req.body || {}))
      },
    },
    {
      path: '/admin/precache/providers',
      method: 'get',
      describe: '获取可预缓存瓦片提供方',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(service.getPrecacheProviders())
      },
    },
    {
      path: '/admin/precache/catalog',
      method: 'get',
      describe: '获取可预缓存的图源和图层',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(service.getPrecacheProviders())
      },
    },
    {
      path: '/admin/precache/tasks',
      method: 'get',
      describe: '获取预缓存任务列表',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listPrecacheTasks())
      },
    },
    {
      path: '/admin/precache/estimate',
      method: 'post',
      describe: '估算预缓存任务',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.estimatePrecacheTask(req.body || {}))
      },
    },
    {
      path: '/admin/precache/tasks',
      method: 'post',
      describe: '创建预缓存任务',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.createPrecacheTask(req.body || {}))
      },
    },
    {
      path: '/admin/precache/tasks/:id/pause',
      method: 'post',
      describe: '暂停预缓存任务',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.pausePrecacheTask(req.params.id))
      },
    },
    {
      path: '/admin/precache/tasks/:id/resume',
      method: 'post',
      describe: '继续预缓存任务',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.resumePrecacheTask(req.params.id))
      },
    },
    {
      path: '/admin/precache/tasks/:id',
      method: 'delete',
      describe: '删除预缓存任务',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.deletePrecacheTask(req.params.id, {
          deleteCache: utils.strToBoolean(req.query.deleteCache),
        }))
      },
    },
    {
      path: '/health',
      basePath: '/',
      method: 'get',
      describe: '根路径健康检查',
      tags: ['system'],
      handler: async (req, res) => res.jsonSuc({ status: 'ok', timestamp: Date.now(), }),
    },
    {
      path: '/access/status',
      method: 'get',
      describe: '获取访问密码验证状态',
      tags: ['access'],
      handler: async (req, res) => {
        const enabled = await service.isAccessEnabled()
        if (!enabled) {
          res.jsonSuc({ required: false })
          return
        }
        const token = accessTokenFromRequest(req)
        const verified = await service.verifyAccess(token)
        res.jsonSuc({ required: !verified })
      },
    },
    {
      path: '/access/verify',
      method: 'post',
      describe: '验证访问密码',
      tags: ['access'],
      handler: async (req, res) => {
        assertAccessVerifyAllowed(req)
        const { password } = req.body || {}
        if (!password) {
          jsonError(res, '请输入访问密码', 400)
          return
        }
        const isMatch = await service.checkAccessPassword(password)
        if (!isMatch) {
          recordAccessVerifyFailure(req)
          jsonError(res, '访问密码错误', 403)
          return
        }
        clearAccessVerifyFailures(req)
        const session = await service.createAccessToken()
        res.cookie(ACCESS_COOKIE_NAME, session.token, accessCookieOptions(req, session.maxAge))
        res.jsonSuc({ expiresAt: session.expiresAt })
      },
    },
    {
      path: '/kml/shared',
      method: 'get',
      describe: '获取已发布的公共 KML 列表',
      tags: ['kml'],
      handler: async (req, res) => {
        await requireAccess(req)
        res.jsonSuc(await service.getSharedKmlList(false))
      },
    },
    {
      path: '/kml/shared/:id',
      method: 'get',
      describe: '获取已发布的公共 KML 详情',
      tags: ['kml'],
      handler: async (req, res) => {
        await requireAccess(req)
        res.jsonSuc(await service.getSharedKml(req.params.id, false))
      },
    },
    {
      path: '/kml/shared/:id/features/:featureId/content',
      method: 'get',
      describe: '获取公共 KML 点位富媒体内容',
      tags: ['kml'],
      handler: async (req, res) => {
        await requireAccess(req)
        res.jsonSuc(await service.getSharedKmlFeatureContent(req.params.id, req.params.featureId, false))
      },
    },
    {
      path: '/admin/kml',
      method: 'get',
      describe: '管理员获取所有公共 KML 列表',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.getSharedKmlList(true))
      },
    },
    {
      path: '/admin/kml/:id',
      method: 'get',
      describe: '管理员获取指定公共 KML 详情',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.getSharedKml(req.params.id, true))
      },
    },
    {
      path: '/admin/kml',
      method: 'post',
      describe: '管理员创建公共 KML',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.createSharedKml(req.body || {}))
      },
    },
    {
      path: '/admin/kml/:id',
      method: 'put',
      describe: '管理员更新公共 KML',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.updateSharedKml(req.params.id, req.body || {}))
      },
    },
    {
      path: '/admin/kml/:id',
      method: 'delete',
      describe: '管理员删除公共 KML',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.deleteSharedKml(req.params.id))
      },
    },
    {
      path: '/admin/kml/import',
      method: 'post',
      describe: '管理员导入 KML 文件并创建公共 KML',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        await new Promise((resolve, reject) => {
          upload.single('file')(req, res, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })
        if (!req.file) {
          const err = new Error('未上传 KML 文件')
          err.statusCode = 400
          throw err
        }
        const options = {
          name: req.body.name,
          status: req.body.status,
          coordCorrection: req.body.coordCorrection,
        }
        res.jsonSuc(await service.importSharedKml(req.file.buffer, req.file.originalname, options))
      },
    },
    {
      path: '/map/catalog',
      method: 'get',
      describe: '获取前台地图图源和图层目录',
      tags: ['map'],
      handler: async (req, res) => {
        await requireAccess(req)
        res.jsonSuc(await service.getPublicMapCatalog())
      },
    },
    {
      path: '/tiles/:sourceId/:z/:x/:y',
      method: 'get',
      describe: '按图源获取地图瓦片',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        await sendControlledTileSource(req, res)
      },
    },
    {
      path: '/vector/styles/:sourceId/style.json',
      method: 'get',
      describe: '获取矢量图源 Style JSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchVectorResource(req.params.sourceId, 'style', {}, {
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/sources/:sourceId/:ref/tilejson.json',
      method: 'get',
      describe: '获取矢量图源派生 TileJSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchVectorResource(req.params.sourceId, 'tilejson', {
          ref: req.params.ref,
        }, {
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/sources/:sourceId/tilejson.json',
      method: 'get',
      describe: '获取矢量图源 TileJSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchVectorResource(req.params.sourceId, 'tilejson', {}, {
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/tiles/:sourceId/:ref/:z/:x/:y.pbf',
      method: 'get',
      describe: '获取矢量派生 MVT 瓦片',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchVectorResource(req.params.sourceId, 'mvt', {
          ref: req.params.ref,
          z: req.params.z,
          x: req.params.x,
          y: req.params.y,
          scale: req.query.scale,
        }, {
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/tiles/:sourceId/:z/:x/:y.pbf',
      method: 'get',
      describe: '获取矢量 MVT 瓦片',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchVectorResource(req.params.sourceId, 'mvt', {
          z: req.params.z,
          x: req.params.x,
          y: req.params.y,
          scale: req.query.scale,
        }, {
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/glyphs/:sourceId/:ref/:fontstack/:range.pbf',
      method: 'get',
      describe: '获取矢量派生字体 glyph',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchVectorResource(req.params.sourceId, 'glyph', {
          ref: req.params.ref,
          fontstack: req.params.fontstack,
          range: req.params.range,
        }, {
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/glyphs/:sourceId/:fontstack/:range.pbf',
      method: 'get',
      describe: '获取矢量字体 glyph',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchVectorResource(req.params.sourceId, 'glyph', {
          fontstack: req.params.fontstack,
          range: req.params.range,
        }, {
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/sprites/:sourceId/:ref/sprite@2x.json',
      method: 'get',
      describe: '获取矢量派生高清 sprite JSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const result = await service.fetchVectorResource(req.params.sourceId, 'sprite-json-2x', {
          ref: req.params.ref,
        }, {
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/sprites/:sourceId/:ref/sprite@2x.png',
      method: 'get',
      describe: '获取矢量派生高清 sprite 图片',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const result = await service.fetchVectorResource(req.params.sourceId, 'sprite-png-2x', {
          ref: req.params.ref,
        }, {
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/sprites/:sourceId/:ref/sprite.json',
      method: 'get',
      describe: '获取矢量派生 sprite JSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const result = await service.fetchVectorResource(req.params.sourceId, 'sprite-json', {
          ref: req.params.ref,
        }, {
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/sprites/:sourceId/:ref/sprite.png',
      method: 'get',
      describe: '获取矢量派生 sprite 图片',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const result = await service.fetchVectorResource(req.params.sourceId, 'sprite-png', {
          ref: req.params.ref,
        }, {
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/sprites/:sourceId/sprite.json',
      method: 'get',
      describe: '获取矢量 sprite JSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const result = await service.fetchVectorResource(req.params.sourceId, 'sprite-json', {}, {
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/sprites/:sourceId/sprite.png',
      method: 'get',
      describe: '获取矢量 sprite 图片',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const result = await service.fetchVectorResource(req.params.sourceId, 'sprite-png', {}, {
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/vector/pmtiles/:sourceId.pmtiles',
      method: 'get',
      describe: '获取 PMTiles 资源',
      tags: ['tiles'],
      handler: async (req, res) => {
        await requireAccess(req)
        const result = await service.fetchVectorResource(req.params.sourceId, 'pmtiles-range', {}, {
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            Range: req.headers.range,
            'If-Range': req.headers['if-range'],
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/admin/tile-sources',
      method: 'get',
      describe: '获取图源列表',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listTileSources())
      },
    },
    {
      path: '/admin/source-presets',
      method: 'get',
      describe: '获取预置图源模板列表',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listSourcePresets())
      },
    },
    {
      path: '/admin/source-presets/:presetId/create-source',
      method: 'post',
      describe: '基于预置模板创建图源',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.createSourceFromPreset(req.params.presetId, req.body || {}))
      },
    },
    {
      path: '/admin/key-pools',
      method: 'get',
      describe: '获取密钥池列表',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listKeyPools())
      },
    },
    {
      path: '/admin/key-pools',
      method: 'post',
      describe: '创建密钥池',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.createKeyPool(req.body || {}))
      },
    },
    {
      path: '/admin/key-pools/:id',
      method: 'get',
      describe: '获取密钥池详情',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.getKeyPool(req.params.id))
      },
    },
    {
      path: '/admin/key-pools/:id',
      method: 'put',
      describe: '更新密钥池',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.updateKeyPool(req.params.id, req.body || {}))
      },
    },
    {
      path: '/admin/key-pools/:id',
      method: 'delete',
      describe: '删除密钥池',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.deleteKeyPool(req.params.id))
      },
    },
    {
      path: '/admin/key-pools/:id/test',
      method: 'post',
      describe: '测试密钥池可用性',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.testKeyPool(req.params.id))
      },
    },
    {
      path: '/admin/key-pools/:id/keys/:keyId/test',
      method: 'post',
      describe: '测试密钥池单个 Key 可用性',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.testKeyPoolKey(req.params.id, req.params.keyId))
      },
    },
    {
      path: '/admin/tile-sources',
      method: 'post',
      describe: '创建图源',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.createTileSource(req.body || {}))
      },
    },
    {
      path: '/admin/tile-sources/:id',
      method: 'get',
      describe: '获取图源详情',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.getTileSource(req.params.id))
      },
    },
    {
      path: '/admin/tile-sources/:id',
      method: 'put',
      describe: '更新图源',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.updateTileSource(req.params.id, req.body || {}))
      },
    },
    {
      path: '/admin/tile-sources/:id',
      method: 'delete',
      describe: '删除图源',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.deleteTileSource(req.params.id))
      },
    },
    {
      path: '/admin/tile-sources/:id/test',
      method: 'post',
      describe: '测试图源连通性',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.testTileSource(req.params.id))
      },
    },
    {
      path: '/admin/map-layers',
      method: 'get',
      describe: '获取地图图层列表',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listMapLayers())
      },
    },
    {
      path: '/admin/map-layers',
      method: 'post',
      describe: '创建地图图层',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.createMapLayer(req.body || {}))
      },
    },
    {
      path: '/admin/map-layers/:id',
      method: 'put',
      describe: '更新地图图层',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.updateMapLayer(req.params.id, req.body || {}))
      },
    },
    {
      path: '/admin/map-layers/:id',
      method: 'delete',
      describe: '删除地图图层',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.deleteMapLayer(req.params.id))
      },
    },
    {
      path: '/admin/map-layers-default',
      method: 'put',
      describe: '设置默认地图图层',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.setDefaultMapLayer(req.body?.id || req.body?.layerId))
      },
    },
    {
      path: '/admin/proxy-outbounds',
      method: 'get',
      describe: '获取代理出口列表',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listProxyOutbounds())
      },
    },
    {
      path: '/admin/proxy-outbounds',
      method: 'post',
      describe: '创建代理出口',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.createProxyOutbound(req.body || {}))
      },
    },
    {
      path: '/admin/proxy-outbounds/:id',
      method: 'put',
      describe: '更新代理出口',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.updateProxyOutbound(req.params.id, req.body || {}))
      },
    },
    {
      path: '/admin/proxy-outbounds/:id',
      method: 'delete',
      describe: '删除代理出口',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.deleteProxyOutbound(req.params.id))
      },
    },
    {
      path: '/admin/proxy-outbounds/:id/test',
      method: 'post',
      describe: '测试代理出口',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.testProxyOutbound(req.params.id))
      },
    },
    {
      path: '/admin/proxy-pools',
      method: 'get',
      describe: '获取代理池列表',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listProxyPools())
      },
    },
    {
      path: '/admin/proxy-pools',
      method: 'post',
      describe: '创建代理池',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.createProxyPool(req.body || {}))
      },
    },
    {
      path: '/admin/proxy-pools/:id',
      method: 'put',
      describe: '更新代理池',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.updateProxyPool(req.params.id, req.body || {}))
      },
    },
    {
      path: '/admin/proxy-pools/:id',
      method: 'delete',
      describe: '删除代理池',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.deleteProxyPool(req.params.id))
      },
    },
    {
      path: '/admin/proxy-pools/:id/test',
      method: 'post',
      describe: '测试代理池出口',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.testProxyPool(req.params.id))
      },
    },
    {
      path: '/admin/external-publishes',
      method: 'get',
      describe: '获取对外发布项列表',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listExternalPublishes())
      },
    },
    {
      path: '/admin/external-publishes',
      method: 'post',
      describe: '创建对外发布项',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.createExternalPublish(req.body || {}))
      },
    },
    {
      path: '/admin/external-publishes/:id',
      method: 'put',
      describe: '更新对外发布项',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.updateExternalPublish(req.params.id, req.body || {}))
      },
    },
    {
      path: '/admin/external-publishes/:id',
      method: 'delete',
      describe: '删除对外发布项',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.deleteExternalPublish(req.params.id))
      },
    },
    {
      path: '/admin/external-publishes/:id/token',
      method: 'post',
      describe: '重置对外发布项 Token',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.resetExternalPublishToken(req.params.id))
      },
    },
    {
      path: '/admin/external-publishes/:id/test',
      method: 'post',
      describe: '测试对外发布项瓦片请求',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.testExternalPublish(req.params.id))
      },
    },
    {
      path: '/admin/external-publish-logs',
      method: 'get',
      describe: '获取全部对外发布项日志',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listExternalPublishLogs())
      },
    },
    {
      path: '/admin/external-publishes/:id/logs',
      method: 'get',
      describe: '获取对外发布项日志',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listExternalPublishLogs(req.params.id))
      },
    },
    {
      path: '/admin/source-access-logs',
      method: 'get',
      describe: '获取全部图源访问日志',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listSourceAccessLogs())
      },
    },
    {
      path: '/admin/tile-sources/:id/access-logs',
      method: 'get',
      describe: '获取图源访问日志',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listSourceAccessLogs(req.params.id))
      },
    },
    {
      path: '/external/:publishId/tilejson',
      method: 'get',
      describe: '获取对外发布项 TileJSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        res.jsonSuc(await service.getExternalPublishTileJson(req.params.publishId, {
          token: req.query.token,
          clientIp,
        }))
      },
    },
    {
      path: '/external/:publishId/style.json',
      method: 'get',
      describe: '获取对外发布矢量 Style JSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'style', {}, {
          token: req.query.token,
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/sources/:ref/tilejson.json',
      method: 'get',
      describe: '获取对外发布派生 TileJSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'tilejson', {
          ref: req.params.ref,
        }, {
          token: req.query.token,
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/tilejson.json',
      method: 'get',
      describe: '获取对外发布矢量 TileJSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'tilejson', {}, {
          token: req.query.token,
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/tiles/:ref/:z/:x/:y.pbf',
      method: 'get',
      describe: '获取对外发布派生 MVT 瓦片',
      tags: ['tiles'],
      handler: async (req, res) => {
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'mvt', {
          ref: req.params.ref,
          z: req.params.z,
          x: req.params.x,
          y: req.params.y,
        }, {
          token: req.query.token,
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/tiles/:z/:x/:y.pbf',
      method: 'get',
      describe: '获取对外发布 MVT 瓦片',
      tags: ['tiles'],
      handler: async (req, res) => {
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'mvt', {
          z: req.params.z,
          x: req.params.x,
          y: req.params.y,
        }, {
          token: req.query.token,
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/glyphs/:ref/:fontstack/:range.pbf',
      method: 'get',
      describe: '获取对外发布派生 glyph',
      tags: ['tiles'],
      handler: async (req, res) => {
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'glyph', {
          ref: req.params.ref,
          fontstack: req.params.fontstack,
          range: req.params.range,
        }, {
          token: req.query.token,
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/glyphs/:fontstack/:range.pbf',
      method: 'get',
      describe: '获取对外发布 glyph',
      tags: ['tiles'],
      handler: async (req, res) => {
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'glyph', {
          fontstack: req.params.fontstack,
          range: req.params.range,
        }, {
          token: req.query.token,
          clientIp,
          userAgent,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0',
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/sprites/:ref/sprite@2x.json',
      method: 'get',
      describe: '获取对外发布派生高清 sprite JSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'sprite-json-2x', {
          ref: req.params.ref,
        }, {
          token: req.query.token,
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/sprites/:ref/sprite@2x.png',
      method: 'get',
      describe: '获取对外发布派生高清 sprite 图片',
      tags: ['tiles'],
      handler: async (req, res) => {
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'sprite-png-2x', {
          ref: req.params.ref,
        }, {
          token: req.query.token,
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/sprites/:ref/sprite.json',
      method: 'get',
      describe: '获取对外发布派生 sprite JSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'sprite-json', {
          ref: req.params.ref,
        }, {
          token: req.query.token,
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/sprites/:ref/sprite.png',
      method: 'get',
      describe: '获取对外发布派生 sprite 图片',
      tags: ['tiles'],
      handler: async (req, res) => {
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'sprite-png', {
          ref: req.params.ref,
        }, {
          token: req.query.token,
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/sprites/sprite.json',
      method: 'get',
      describe: '获取对外发布 sprite JSON',
      tags: ['tiles'],
      handler: async (req, res) => {
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'sprite-json', {}, {
          token: req.query.token,
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/sprites/sprite.png',
      method: 'get',
      describe: '获取对外发布 sprite 图片',
      tags: ['tiles'],
      handler: async (req, res) => {
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'sprite-png', {}, {
          token: req.query.token,
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId.pmtiles',
      method: 'get',
      describe: '获取对外发布 PMTiles',
      tags: ['tiles'],
      handler: async (req, res) => {
        const result = await service.fetchExternalVectorResource(req.params.publishId, 'pmtiles-range', {}, {
          token: req.query.token,
          clientIp: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '',
          userAgent: req.headers['user-agent'] || '',
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          headers: {
            Range: req.headers.range,
            'If-Range': req.headers['if-range'],
          },
        })
        await sendRelayResponse(res, result)
      },
    },
    {
      path: '/external/:publishId/sources/:sourceId/:z/:x/:y',
      method: 'get',
      describe: '按对外发布图层中的图源获取瓦片',
      tags: ['tiles'],
      handler: async (req, res) => {
        const startTime = Date.now()
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const publishId = req.params.publishId
        const sourceId = req.params.sourceId
        const logEntry = {
          timestamp: new Date().toISOString(),
          publishId,
          sourceId,
          layerId: '',
          clientIp,
          userAgent,
          coordinates: `Z:${req.params.z || ''} X:${req.params.x || ''} Y:${req.params.y || ''}`,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          statusCode: 200,
          duration: 0,
          cacheStatus: 'MISS',
          proxyPoolId: '',
          proxyOutboundId: '',
          errorMessage: null,
        }

        try {
          const result = await service.fetchExternalLayerSourceTile(publishId, sourceId, {
            z: req.params.z,
            x: req.params.x,
            y: req.params.y,
          }, {
            token: req.query.token,
            scale: req.query.scale,
            clientIp,
            userAgent,
            reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
            headers: {
              'User-Agent': userAgent || 'Mozilla/5.0',
            },
          })
          logEntry.publishId = result.publish?.id || publishId
          logEntry.sourceId = result.source?.id || sourceId
          logEntry.layerId = result.layer?.id || ''
          logEntry.statusCode = result.statusCode || 200
          logEntry.duration = Date.now() - startTime
          logEntry.cacheStatus = result.cacheStatus || 'MISS'
          logEntry.proxyPoolId = result.proxy?.poolId || ''
          logEntry.proxyOutboundId = result.proxy?.outboundId || ''
          writeExternalPublishLog(logEntry, result.publish)
          await sendRelayResponse(res, result)
        } catch (err) {
          const status = err.statusCode || 502
          logEntry.statusCode = status
          logEntry.duration = Date.now() - startTime
          logEntry.errorMessage = err.message
          service.logExternalPublishRequest(logEntry, 500).catch(e => console.error('[external publish log error]', e))
          jsonError(res, err.message || '对外发布图源瓦片请求失败', status)
        }
      },
    },
    {
      path: '/external/:publishId/:z/:x/:y',
      method: 'get',
      describe: '按对外发布项获取瓦片',
      tags: ['tiles'],
      handler: async (req, res) => {
        const startTime = Date.now()
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const publishId = req.params.publishId
        const logEntry = {
          timestamp: new Date().toISOString(),
          publishId,
          sourceId: '',
          layerId: '',
          clientIp,
          userAgent,
          coordinates: `Z:${req.params.z || ''} X:${req.params.x || ''} Y:${req.params.y || ''}`,
          reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
          statusCode: 200,
          duration: 0,
          cacheStatus: 'MISS',
          proxyPoolId: '',
          proxyOutboundId: '',
          errorMessage: null,
        }

        try {
          const result = await service.fetchExternalPublishTile(publishId, {
            z: req.params.z,
            x: req.params.x,
            y: req.params.y,
          }, {
            token: req.query.token,
            scale: req.query.scale,
            clientIp,
            userAgent,
            reqUrl: maskSensitiveQueryParams(req.originalUrl || req.url || ''),
            headers: {
              'User-Agent': userAgent || 'Mozilla/5.0',
            },
          })
          logEntry.publishId = result.publish?.id || publishId
          logEntry.sourceId = result.source?.id || ''
          logEntry.statusCode = result.statusCode || 200
          logEntry.duration = Date.now() - startTime
          logEntry.cacheStatus = result.cacheStatus || 'MISS'
          logEntry.proxyPoolId = result.proxy?.poolId || ''
          logEntry.proxyOutboundId = result.proxy?.outboundId || ''
          writeExternalPublishLog(logEntry, result.publish)
          await sendRelayResponse(res, result)
        } catch (err) {
          const status = err.statusCode || 502
          logEntry.statusCode = status
          logEntry.duration = Date.now() - startTime
          logEntry.errorMessage = err.message
          service.logExternalPublishRequest(logEntry, 500).catch(e => console.error('[external publish log error]', e))
          jsonError(res, err.message || '对外发布瓦片请求失败', status)
        }
      },
    },
  ],
  /**
   * 路由控制器，通过提供路由配置项，生成可对外提供服务的api接口
   * @param app {Object} -必选 app对象
   * @param apiConfig {Object|Array} -必选 路由配置信息
   * @param basePath {Object|Array} -可选 指定初始化时候的基础路径，默认路径为'/'
   */
  routeController (app, apiConfig, basePath) {
    apiConfig = Array.isArray(apiConfig) ? apiConfig : [apiConfig]
    basePath = basePath || '/'

    apiConfig.forEach((conf) => {
      if (utils.isObj(conf) && conf.path && conf.method && typeof conf.handler === 'function') {
        conf.basePath = conf.basePath || basePath
        const urlPath = urlJoin(conf.basePath, conf.path)

        /* 阻止已注册过的路由重复注册 */
        const method = String(conf.method).toLowerCase()
        const routeKey = `${method.toUpperCase()} ${urlPath}`

        /* 阻止已注册过的路由重复注册 */
        if (routeSet[routeKey]) {
          console.error(routeKey + '路由已被注册控制器初始化，不能重复注册')
          return false
        }

        if (app[method]) {
          /* 补充配置信息 */
          conf.method = method
          conf.urlPath = urlPath

          /* 注册路由控制函数 */
          app[method](urlPath, (req, res, next) => {
            Promise.resolve(conf.handler(req, res, next, conf)).catch((err) => {
              serviceConfig.debug && console.error(`[${method.toUpperCase()} ${urlPath}]`, err)
              if (res.headersSent) {
                next(err)
              } else {
                jsonError(res, err, err.statusCode || err.response?.status || 500)
              }
            })
          })

          /* 记录已注册过的路由 */
          routeSet[routeKey] = conf

          serviceConfig.debug && console.log(`[${urlPath}] route registration succeeded`)
        }
      } else {
        console.error('配置必要字段不正确，该项将不被初始化：', conf)
      }
    })
  },
  /**
   * 获取所有已注册了的路由路径信息
   * @param serviceUrl {string} -可选 指定服务器路径地址，例如'https://myhost.com'， 如果不指定则输出的是本地服务器下的路径地址信息
   */
  getRegisteredApiLink (serviceUrl) {
    serviceUrl = serviceUrl || simpleApi.localService
    const result = []
    Object.values(routeSet).forEach((conf) => {
      result.push(`${conf.method.toUpperCase()} ${urlJoin(serviceUrl, conf.urlPath)}`)
    })
    return result
  },
}

export default simpleApi
