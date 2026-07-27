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

function bearerTokenFromRequest (req) {
  const authorization = req.get('authorization') || ''
  const matched = /^Bearer\s+(.+)$/i.exec(authorization)
  return matched ? matched[1] : ''
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

function requireAdmin (req) {
  const session = service.verifyAdminToken(bearerTokenFromRequest(req))
  if (!session) {
    const err = new Error('未登录或登录已过期')
    err.statusCode = 401
    throw err
  }
  return session
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
    secure: Boolean(req.secure || req.get('x-forwarded-proto') === 'https'),
  }
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

const simpleApi = {
  routeSet,
  basePath: '/api/v1',
  localService: 'http://127.0.0.1:' + serviceConfig.port,
  configList: [
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
      handler: async (req, res) => res.jsonSuc(await service.loginAdmin(req.body || {})),
    },
    {
      path: '/admin/auth/logout',
      method: 'post',
      describe: '管理后台退出登录',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc({ status: 'ok' })
      },
    },
    {
      path: '/admin/auth/password',
      method: 'post',
      describe: '修改管理后台密码',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        const { currentPassword, newPassword } = req.body || {}
        if (!currentPassword || !newPassword) {
          jsonError(res, '当前密码和新密码不能为空', 400)
          return
        }
        res.jsonSuc(await service.updateAdminPassword(currentPassword, newPassword))
      },
    },
    {
      path: '/admin/session',
      method: 'get',
      describe: '获取当前管理后台会话',
      tags: ['admin'],
      handler: async (req, res) => res.jsonSuc(requireAdmin(req)),
    },
    {
      path: '/admin/system',
      method: 'get',
      describe: '获取管理后台系统概览',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.getAdminSystemInfo())
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
        const startTime = Date.now()
        await requireAccess(req)
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
          jsonError(res, err.message || '图源瓦片请求失败', status)
        }
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
