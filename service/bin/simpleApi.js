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
          useProxy: utils.strToBoolean(req.query.useProxy),
          refresh: utils.strToBoolean(req.query.refresh),
          noCache: utils.strToBoolean(req.query.noCache),
          cache: req.query.cache === undefined ? true : utils.strToBoolean(req.query.cache),
        })

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
        if (targetUrl && !whitelist.isAllowed(targetUrl)) {
          jsonError(res, '请求的 URL 不在白名单内，不允许清理', 403)
          return
        }
        res.jsonSuc(await service.clearFetchRelayCache(targetUrl))
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
      path: '/external/tile',
      method: 'get',
      describe: '对外开放的地图瓦片反代接口',
      tags: ['tiles'],
      handler: async (req, res) => {
        const startTime = Date.now()
        const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || ''
        const userAgent = req.headers['user-agent'] || ''
        const { x, y, z, token, scale } = req.query

        const reqUrl = req.originalUrl || req.url || ''
        const logEntry = {
          timestamp: new Date().toISOString(),
          clientIp,
          coordinates: `Z:${z || ''} X:${x || ''} Y:${y || ''}`,
          reqUrl,
          upstreamUrl: '',
          userAgent,
          statusCode: 200,
          duration: 0,
          errorMessage: null,
          cacheStatus: 'MISS',
        }

        const logAndRespond = async (status, errMessage = null) => {
          logEntry.statusCode = status
          logEntry.duration = Date.now() - startTime
          logEntry.errorMessage = errMessage
          service.logTileApiRequest(logEntry).catch(e => console.error('[tileApi log error]', e))
          jsonError(res, errMessage || '处理失败', status)
        }

        const settings = await service.getRawSettings()
        const tileApi = settings.tileApi || {}

        if (!tileApi.enabled) {
          return logAndRespond(403, '对外图层接口未开放')
        }

        if (x === undefined || y === undefined || z === undefined) {
          return logAndRespond(400, '缺少坐标参数 x, y, z')
        }

        if (tileApi.tokenEnabled) {
          if (!token || token !== tileApi.token) {
            return logAndRespond(401, '拒绝访问：Token 校验失败')
          }
        }

        let upstreamTarget = tileApi.upstreamUrl || ''
        const scaleVal = scale || '2'
        upstreamTarget = upstreamTarget
          .replace('{x}', x)
          .replace('{y}', y)
          .replace('{z}', z)
          .replace('{scale}', scaleVal)

        try {
          const urlObj = new URL(upstreamTarget)
          Object.entries(req.query).forEach(([key, val]) => {
            if (key === 'token') return
            if (key === 'x' || key === 'y' || key === 'z') return
            if (val !== undefined) {
              urlObj.searchParams.set(key, String(val))
            }
          })
          upstreamTarget = urlObj.toString()
        } catch (e) {
          // If URL parsing fails, fall back to replaced string
        }

        logEntry.upstreamUrl = upstreamTarget

        try {
          const fetchOptions = {
            useProxy: tileApi.useProxy,
            cache: tileApi.cacheEnabled !== false,
            headers: {
              'User-Agent': userAgent || 'Mozilla/5.0'
            }
          }
          const result = await service.fetchRelay(upstreamTarget, fetchOptions)
          logEntry.cacheStatus = result.cacheStatus || 'MISS'
          if (result.statusCode === 200) {
            logEntry.statusCode = 200
            logEntry.duration = Date.now() - startTime
            service.logTileApiRequest(logEntry).catch(e => console.error('[tileApi log error]', e))
            await sendRelayResponse(res, result)
          } else {
            return logAndRespond(result.statusCode, `上游服务器返回错误: ${result.statusCode}`)
          }
        } catch (err) {
          logEntry.cacheStatus = 'MISS'
          return logAndRespond(502, `反向上游请求失败: ${err.message}`)
        }
      }
    },
    {
      path: '/admin/tile-api/logs',
      method: 'get',
      describe: '获取对外开放图层接口的访问日志',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        res.jsonSuc(await service.listTileApiLogs())
      }
    },
    {
      path: '/admin/tile-api/logs',
      method: 'delete',
      describe: '清空对外开放图层接口的访问日志',
      tags: ['admin'],
      handler: async (req, res) => {
        requireAdmin(req)
        await service.clearTileApiLogs()
        res.jsonSuc()
      }
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
