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
import cronJob from './bin/cronJob/index.js'
import visitRecorder from './bin/visitRecorder.js'
import commonMethods from './bin/middleware/commonMethods/index.js'

const serviceConfig = baseConfig.staticService
const app = express()

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
    app.use(express.urlencoded({ extended: false, }))

    /* parse application/json */
    app.use(express.json())

    /* 初始化静态资源的目录地址 */
    fs.ensureDirSync(serviceConfig.staticDir)

    /* 注册访问记录服务 */
    visitRecorder.init(app)

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
      app.use('/', express.static(serviceConfig.appDir, appOptions))
    }

    app.use(serviceConfig.staticPath, express.static(serviceConfig.staticDir, options))

    /* 用于其他实例获取静态服务的配置信息 */
    simpleApi.routeController(app, simpleApi.configList, simpleApi.basePath)

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
