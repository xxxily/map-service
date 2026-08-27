/*!
 * @name         index.js
 * @description  index
 * @version      0.0.1
 * @author       Blaze
 * @date         2020/2/17 10:09
 * @github       https://github.com/xxxily
 */
import axios from 'axios'
import express from 'express'
import fs from 'fs-extra'
import urlJoin from 'url-join'
import path from 'path'
import cors from 'cors'
import corsOpts from './cors.conf.js'
import baseConfig from './config.js'
import simpleApi from './bin/simpleApi.js'
import service from './bin/service.js'
import cronJob from './bin/cronJob/index.js'
import visitRecorder from './bin/visitRecorder.js'
import commonMethods from './bin/middleware/commonMethods/index.js'
import { getSharePageCanonicalUrl, renderSharePageHtml } from '../shared/share-page-metadata.js'
import { handleJsonPayloadTooLarge, kmlJsonTransportMaxBytes } from './bin/user/limits.js'

const serviceConfig = baseConfig.staticService
const app = express()

function requestOrigin (req) {
  const protocol = req.protocol === 'https' ? 'https' : 'http'
  const host = String(req.get('host') || '').trim()
  try {
    return new URL(`${protocol}://${host}`).origin
  } catch {
    return 'https://map.anzz.site'
  }
}

async function sendSharePage (req, res, options = {}) {
  const publicId = options.publicId || req.params.publicId
  const fileName = options.fileName || 'index.html'
  const templatePath = path.join(serviceConfig.appDir, fileName)
  const html = await fs.readFile(templatePath, 'utf8')
  let metadata = null
  try {
    metadata = service.getPublicKmlShareMetadata(publicId)
  } catch (error) {
    serviceConfig.debug && console.error('分享页元信息读取失败，返回通用应用壳', error)
  }
  const rendered = metadata
    ? renderSharePageHtml(html, {
        ...metadata,
        canonicalUrl: getSharePageCanonicalUrl(metadata.publicId, { origin: requestOrigin(req) }),
      })
    : html
  res.type('html').send(rendered)
}

if (serviceConfig.trustProxy) {
  app.set('trust proxy', serviceConfig.trustProxy)
}

if (serviceConfig.enableCors) {
  app.use(cors(corsOpts))
}

const index = {
  async getServiceConfig () {
    const getConfigHandler = async (resolve, reject) => {
      const url = urlJoin(simpleApi.localService, simpleApi.basePath, '/health')
      axios({
        url,
        timeout: 200,
      })
        .then((res) => {
          resolve(res.data)
        })
        .catch((err) => {
          serviceConfig.debug && console.error('静态服务器未运行，无法获取服务器配置信息', err)
          resolve(null)
        })
    }

    return new Promise(getConfigHandler)
  },

  async isReady () {
    const serviceConf = await index.getServiceConfig()
    return Boolean(serviceConf)
  },

  async init () {
    const t = index
    const isReady = await t.isReady()

    // 实例已运行则返回true
    if (isReady) {
      console.log(`服务器实例已存在: ${simpleApi.localService}`)
      return true
    }

    /* 全局注入公共函数，方便在业务处使用 */
    app.use(commonMethods)

    /* parse application/x-www-form-urlencoded */
    app.use(express.urlencoded({ extended: false, limit: '1mb' }))

    /*
     * KML 编辑、迁移和同步可能携带完整要素数据，使用独立的部署级运输上限；
     * 其他 JSON API 保持较小边界，避免为了 KML 放大全站请求体攻击面。
     */
    app.use([
      '/api/v1/kml/files',
      '/api/v1/kml/sync',
      '/api/v1/kml/migrations/local',
      '/api/v1/kml/import/2bulu/browser-helper',
    ], express.json({ limit: kmlJsonTransportMaxBytes() }))

    /* parse ordinary application/json */
    app.use(express.json({ limit: '12mb' }))

    /* 初始化静态资源的目录地址 */
    fs.ensureDirSync(serviceConfig.staticDir)

    /* 注册访问记录服务 */
    visitRecorder.init(app)

    // 地图 URL 包含坐标状态；使用 strict-origin 仅发送 origin（协议+域名+端口），
    // 不发送完整路径，避免坐标参数通过 Referer 泄露，同时允许高德等第三方 API 完成域名校验。
    app.use((req, res, next) => {
      res.set('Referrer-Policy', 'strict-origin')
      next()
    })

    app.use('/api', (req, res, next) => {
      res.set('Cache-Control', 'no-store')
      res.set('X-Content-Type-Options', 'nosniff')
      next()
    })

    /* 注册静态资源目录服务 */
    const options = {
      dotfiles: 'ignore',
      etag: false,
      extensions: ['html', 'htm'],
      index: ['index.html'],
      maxAge: '1d',
      redirect: false,
      setHeaders: function (res, path, stat) {
        // res.header('Access-Control-Allow-Origin', '*')
        res.set('Access-Control-Allow-Origin', '*')
        res.set('x-timestamp', Date.now())
      },
    }
    const appOptions = {
      ...options,
      setHeaders: function (res, filePath, stat) {
        res.set('Access-Control-Allow-Origin', '*')
        res.set('x-timestamp', Date.now())

        if (['index.html', 'sw.js', 'manifest.webmanifest'].includes(path.basename(filePath))) {
          res.set('Cache-Control', 'no-cache')
        } else {
          res.set('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }

    /* 注册服务前端页面服务 */
    if (serviceConfig.appDir) {
      fs.ensureDirSync(serviceConfig.appDir)
      app.get('/share/:publicId', (req, res) => {
        res.set('Cache-Control', 'no-cache')
        res.set('X-Robots-Tag', 'noindex, nofollow')
        res.set('Referrer-Policy', 'no-referrer')
        return sendSharePage(req, res)
      })
      app.get('/3d', (req, res, next) => {
        const publicId = String(req.query.share || '').trim()
        if (!publicId) return next()
        res.set('Cache-Control', 'no-cache')
        res.set('X-Robots-Tag', 'noindex, nofollow')
        res.set('Referrer-Policy', 'no-referrer')
        return sendSharePage(req, res, { fileName: '3d.html', publicId })
      })
      app.use('/', express.static(serviceConfig.appDir, appOptions))
      app.get('/3d', (req, res) => {
        res.set('Cache-Control', 'no-cache')
        res.sendFile(path.join(serviceConfig.appDir, '3d.html'))
      })
      app.get(['/admin', '/admin/:tab'], (req, res) => {
        res.set('Cache-Control', 'no-cache')
        res.sendFile(path.join(serviceConfig.appDir, 'index.html'))
      })
      app.get(['/account', '/account/:tab'], (req, res) => {
        res.set('Cache-Control', 'no-cache')
        res.sendFile(path.join(serviceConfig.appDir, 'index.html'))
      })
    }

    app.use(serviceConfig.staticPath, express.static(serviceConfig.staticDir, options))

    /* 用于其他实例获取静态服务的配置信息 */
    simpleApi.routeController(app, simpleApi.configList, simpleApi.basePath)

    app.use(handleJsonPayloadTooLarge)

    app.listen(serviceConfig.port, serviceConfig.host || '0.0.0.0', () => {
      console.log(`服务器已启动: ${simpleApi.localService}`)
      console.log('可用接口地址：')
      console.log(simpleApi.getRegisteredApiLink().join('\n'))
      console.log('开启定时任务服务')
      cronJob.init().catch(err => {
        console.error('定时任务服务启动失败', err)
      })
    })
  },
}

index.init()
