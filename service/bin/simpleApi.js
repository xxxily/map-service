/*!
 * @name         simpleApi.js
 * @description  API route registry
 * @version      0.0.1
 * @author       Blaze
 * @date         2020/2/20 14:58
 * @github       https://github.com/xxxily
 */
import urlJoin from 'url-join'
import utils from './utils/index.js'
import baseConfig from '../config.js'
import service from './service.js'
import whitelist from './whitelist.js'

const serviceConfig = baseConfig.staticService
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

function jsonError (res, error, statusCode = 500) {
  res.status(statusCode)
  res.jsonErr({
    message: error instanceof Error ? error.message : error,
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
