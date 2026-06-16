/*!
 * @name         simpleApi.js
 * @description  网络请求处理层
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

const simpleApi = {
  routeSet,
  basePath: '/api.v1',
  localService: 'http://127.0.0.1:' + serviceConfig.port,
  configList: [
    {
      path: '/random-file-selector',
      method: 'get',
      describe: '获取随机文件',
      handler: async (req, res, next, conf) => {
        const query = req.query || {}
        const id = query.id || 'wushumao'
        const cache = query.cache !== 'false'

        const randomFile = await service.getRandomFile(id, cache)
        if (randomFile) {
          // console.log('randomFile', randomFile)
          res.jsonSuc(randomFile)
          return true
        }

        res.jsonErr('获取文件失败')
      },
    },
    {
      path: '/random-wallhaven-wallpapers',
      method: 'get',
      describe: '获取随机的wallhaven下的wallpapers文件',
      handler: async (req, res, next, conf) => {
        const query = req.query || {}
        const id = query.id || 'sfw'
        const cache = query.cache !== 'false'

        const randomFile = await service.getRandomWallpapers(id, cache)
        if (randomFile) {
          // console.log('randomFile', randomFile)
          res.jsonSuc(randomFile)
          return true
        }

        res.jsonErr('获取文件失败')
      },
    },
    {
      path: '/service-config',
      method: 'get',
      describe: '获取服务器的配置信息',
      handler: (req, res, next, conf) => res.jsonSuc(serviceConfig),
    },
    {
      path: '/resource-list',
      method: 'get',
      describe: '获取服务器上的静态资源列表',
      handler: (req, res) => {
        service.getResourceFileList()
          .then((list) => {
            res.jsonSuc({
              length: list.length,
              list,
            })
          })
          .catch((err) => {
            serviceConfig.debug && console.error(err)
            res.jsonErr('获取列表信息时出错')
          })
      },
    },
    {
      path: '/has-resource-file',
      method: 'get',
      describe: '判断是否包含某个资源文件',
      handler: (req, res) => {
        service.getResourceFileList()
          .then((list) => {
            const queryFilename = req.query.filename
            if (queryFilename && list.includes(queryFilename)) {
              res.jsonSuc(true)
            } else {
              res.jsonSuc(false)
            }
          })
          .catch((err) => {
            serviceConfig.debug && console.error(err)
            res.jsonErr('获取资源文件接口出错')
          })
      },
    },
    {
      path: '/search-package-file',
      method: 'get',
      describe: '根据搜索条件搜索对应的前端打包结果文件列表',
      handler: (req, res) => {
        service.searchDistPackageFileList(req.query)
          .then((list) => {
            if (list.length && req.query.redirect) {
              /* 重定向到数据的最后一个对象指向的静态资源文件地址上 */
              const redirectTo = urlJoin(serviceConfig.staticPath, list.pop().fileName)
              res.redirect(redirectTo)
            } else {
              res.jsonSuc(list)
            }
          })
          .catch((err) => {
            res.jsonErr(err)
          })
      },
    },
    {
      path: '/get-latest-package-file',
      method: 'get',
      describe: '获取最近一个打包结果',
      handler: (req, res) => {
        service.searchDistPackageFileList(req.query)
          .then((list) => {
            if (req.query.shellMode && !req.query.redirect) {
              /**
               * shellMode是针对shell请求做的优化
               * 主要为了减少shell的复杂字符提取逻辑
               */
              if (list.length) {
                res.send(list.pop().fileName)
              } else {
                res.send('')
              }
            } else {
              if (list.length && req.query.redirect) {
                /* 重定向到数据的最后一个对象指向的静态资源文件地址上 */
                const redirectTo = urlJoin(serviceConfig.staticPath, list.pop().fileName)
                res.redirect(redirectTo)
              } else {
                res.jsonSuc(list.pop() || {})
              }
            }
          })
          .catch((err) => {
            if (req.query.shellMode) {
              res.send('-1')
            } else {
              res.jsonErr(err)
            }
          })
      },
    },
    {
      path: '/do1-gitlab-webhook',
      method: 'all',
      describe: '道一gitlab里面的webhook接口',
      handler: async (req, res) => {
        const reqInfo = {
          baseUrl: req.baseUrl,
          body: req.body || 'noBody',
          cookies: JSON.stringify(req.cookies),
          hostname: req.hostname,
          ip: req.ip,
          method: req.method,
          params: req.params,
          query: req.query,
        }

        await service.webhooksHandler(reqInfo.body)

        if (req.query && req.query.debug) {
          if (req.query.string) {
            console.log('[webhook debug info]\n', JSON.stringify(reqInfo, null, 2))
          } else {
            console.log('[webhook debug info]\n', reqInfo)
          }
          res.jsonSuc(reqInfo)
        } else {
          res.jsonSuc(true)
        }
      },
    },
    {
      path: '/fetchRelay',
      method: 'all',
      describe: '具有缓存能力的代发请求接口',
      handler: async (req, res) => {
        if (req.query.url) {
          const url = decodeURIComponent(req.query.url)

          if (!whitelist.isInDomainlist(url)) {
            console.error('请求的域名不在白名单内，不允许请求：', url)

            res.jsonErr({
              msg: '请求的域名不在白名单内，不允许请求',
            })
            return false
          }

          const result = await service.fetchRelay(url, utils.strToBoolean(req.query.useProxy), utils.strToBoolean(req.query.noCache))
          if (result && result.on && result.pipe) {
            res.set({
              'access-control-allow-origin': '*',
              /* 强制缓存三十天 */
              Expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toUTCString(),
              /* 协商缓存一年 */
              // 'Cache-Control': 'public, max-age=31557600',
            })

            result.on('data', chunk => {
              res.write(chunk)
            })

            result.on('end', () => {
              res.status(200)
              res.end()
            })

            return true
          }
        }

        res.jsonErr({
          msg: '接口异常，或参数不正确，请稍后再试',
        })
      },
    },
    {
      path: '/check',
      basePath: '/',
      method: 'all',
      describe: '校验接口',
      handler: async (req, res) => {
        res.jsonSuc({
          msg: 'ok',
        })
      },
    },
    {
      path: '/login',
      basePath: '/',
      method: 'all',
      describe: '登录接口',
      handler: async (req, res) => {
        res.jsonSuc({
          msg: '登录接口异常，请稍后再试',
        })
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
        if (routeSet[urlPath]) {
          console.error(routeSet[urlPath] + '路由已被注册控制器初始化，不能重复注册')
          return false
        }

        if (app[conf.method]) {
          /* 补充配置信息 */
          conf.urlPath = urlPath

          /* 注册路由控制函数 */
          app[conf.method](urlPath, (req, res, next) => conf.handler(req, res, next, conf))

          /* 记录已注册过的路由 */
          routeSet[urlPath] = conf

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
    Object.keys(routeSet).forEach((urlPath) => {
      result.push(urlJoin(serviceUrl, urlPath))
    })
    return result
  },
}

export default simpleApi
