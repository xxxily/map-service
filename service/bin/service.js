/*!
 * @name         service.js
 * @description  服务层，只包含各种页面所需的操作函数，不参与网络请求的任何处理
 * @version      0.0.1
 * @author       Blaze
 * @date         2020/2/20 15:15
 * @github       https://github.com/xxxily
 */

import utils from './utils/index.js'
import fs from 'fs-extra'
import glob from 'glob'
import path from 'path'
import dayjs from 'dayjs'
import rootPath from './rootPath.js'
import baseConfig from '../config.js'
import JsonFile from './utils/jsonFile.js'
import FetchRelay from './middleware/fetchRelay/index.js'
import RandomFileSelector from './utils/randomFileSelector.js'
import RandomWallhavenSelector from './utils/randomWallhavenWallpapers.js'
import simpleGit from 'simple-git'

const fetchRelay = new FetchRelay()
const serviceConfig = baseConfig.staticService || {}
const logDir = serviceConfig.logDir || path.resolve(process.cwd(), './log')
const fileSelector = {}
const randomWallpapers = {}

const service = {
  /**
   * 获取静态资源目录下所有文件的文件列表
   * @returns {Promise<unknown>}
   */
  async getResourceFileList () {
    return new Promise((resolve, reject) => {
      fs.ensureDirSync(serviceConfig.staticDir)
      glob('**/**.**', {
        cwd: serviceConfig.staticDir,
      }, function (err, files) {
        if (err) {
          reject(err)
        } else {
          resolve(files)
        }
      })
    })
  },

  /**
   * 获取前端包文件列表
   * @returns {Promise<unknown>}
   */
  async getDistPackageFileList () {
    return new Promise((resolve, reject) => {
      fs.ensureDirSync(serviceConfig.staticDir)
      glob('**/dist_**.zip', {
        cwd: serviceConfig.staticDir,
      }, function (err, files) {
        if (err) {
          reject(err)
        } else {
          resolve(files)
        }
      })
    })
  },

  /**
   * 根据相关条件查询是否有对应的文件，查询到相应结果的前提是静态服务器下的日志文件有对应的信息
   * @param query.projName {String} -可选 查询有没有来源于指定项目命的文件
   * @param query.branch {String} -可选 查询有没有来源于指定分支的文件
   * @param query.startTime {String} -可选 限定文件的开始时间
   * @param query.endTime -可选 限定文件的结束时间
   * @returns {Promise<*>}
   */
  async searchDistPackageFileList (query) {
    if (!utils.isObj(query)) {
      return Promise.resolve([])
    }

    const staticLog = new JsonFile(baseConfig.staticService.staticLogFile)
    const resourceList = staticLog.readNodeSync('resourceList') || []
    let result = resourceList

    /* 校验是否输入了查询条件 */
    let hasQueryCondition = false
    const queryNames = Object.keys(query)
    for (let i = 0; i < queryNames.length; i++) {
      if (['projName', 'branch', 'startTime', 'endTime'].includes(queryNames[i])) {
        hasQueryCondition = true
        break
      }
    }

    /* 如果没有输入任何定义的查询条件，将返回空数组 */
    if (hasQueryCondition === false) {
      return Promise.resolve([])
    }

    if (query.projName) {
      result = result.filter(item => item.buildConfig && item.buildConfig.projName === query.projName)
    }

    if (query.branch) {
      result = result.filter(item => item.buildConfig && item.buildConfig.branch === query.branch)
    }

    if (query.startTime) {
      result = result.filter(item => item.time && item.time >= query.startTime)
    }

    if (query.endTime) {
      result = result.filter(item => item.time && item.time <= query.endTime)
    }

    /* 验证文件是否真的存在，而不只是在log文件里面有记录，如果没有对应的真实文件，则会对结果进行剔除 */
    if (result.length) {
      const fileList = await service.getDistPackageFileList()
      if (Array.isArray(fileList)) {
        result = result.filter(item => fileList.includes(item.fileName))
      }
    }

    return Promise.resolve(result)
  },

  /**
   * 移除过期的前端包文件，以回收磁盘空间
   * @param survivalTime {Number} -可选，定义
   * @returns {Promise<void>}
   */
  async removeTimeoutPackageFiles (survivalTime = 1000 * 60 * 60 * 24 * 3) {
    service.getDistPackageFileList().then(async data => {
      if (data.length) {
        /* 允许存活时间，三天 */
        const survivalTime = 1000 * 60 * 60 * 24 * 3
        const curTime = Date.now()
        const removeList = []
        for (let i = 0; i < data.length; i++) {
          const fileName = data[i]
          const filePath = path.join(serviceConfig.staticDir, fileName)
          const stat = await fs.stat(filePath)
          const isTimeout = curTime - stat.mtime.getTime() > survivalTime
          if (isTimeout) {
            console.log('文件已过期，将对文件进行删除以回收磁盘空间：' + fileName)
            await fs.remove(filePath)
            removeList.push(filePath)
          }
        }

        if (removeList.length) {
          console.log(`已删除${removeList.length} 个过期文件`)

          /* 更新静态资源的日志信息 */
          await service.updateStaticLog()
        } else {
          console.log('没检测到任何需要删除的过期文件')
        }
      } else {
        console.log('没检测到任何前端包文件')
      }
    })
  },

  /**
   * 更新静态资源目录下面的日志文件，文件不存在资源，其日志数据也对应进行删除
   * @returns {Promise<void>}
   */
  async updateStaticLog () {
    const resourceList = await service.getResourceFileList()
    const staticLog = new JsonFile(baseConfig.staticService.staticLogFile)
    const resourceListLog = staticLog.readNodeSync('resourceList') || []
    const result = []

    if (resourceList && resourceList.length) {
      const fileNameSet = {}
      resourceList.forEach(filePath => {
        fileNameSet[path.basename(filePath)] = true
      })

      resourceListLog.forEach(log => {
        if (log.fileName && fileNameSet[log.fileName]) {
          result.push(log)
        }
      })

      staticLog.writeToNodeSync('resourceList', result)
      staticLog.writeToNodeSync('logUpdateTime', Date.now())
    }

    return result
  },

  async gitPull (options) {
    if (this._gitPulling_) return false
    this._gitPulling_ = true

    const git = simpleGit(rootPath)

    return git.pull(options).then(() => {
      // console.log('代码拉取更新成功')
      this._gitPulling_ = false
    }).catch((err) => {
      this._gitPulling_ = false
      console.error(err)
    })
  },

  async webhooksHandler (hookData = {}) {
    if (!hookData || !hookData.project) return false

    /* 记录访问日志 */
    const curTimeStr = dayjs().format('YYYY-MM-DD_HH-mm-ss')
    const logPath = path.resolve(logDir, `./webhooks/${curTimeStr}_.log`)
    const webhooksLog = new JsonFile(logPath)
    webhooksLog.write(hookData)

    /* 自动拉取代码进行更新 */
    if (hookData.event_name === 'push') {
      await this.gitPull(['-f']).catch((err) => {
        console.error(err)
      })
    }
  },

  fetchRelay (url, useProxy, noCache) {
    return fetchRelay.fetch(url, useProxy, noCache)
  },

  /**
   * 获取随机文件
   * @param options
   * @returns {Promise<*>}
   */
  async getRandomFile (id, cache) {
    const defaultOptions = {
      /* 每日无数猫 */
      wushumao: {
        cacheDbId: 'wushumao',
        recursive: false,
        directoryPaths: [
          '/Volumes/web8T/tg-data/wushumao_2024.6.5/photos',
          '/Volumes/web8T/tg-data/wushumao_2024.6.5/video_files',
        ],
        // fileFormats: ['.jpg', '.png', '.gif', '.mp4'],
        fileFormats: ['.mp4'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        minFileSize: 50 * 1024, // 大于50KB的文件
        unique: true,
      },
      /* 沙雕图 */
      shadiao: {
        cacheDbId: 'shadiao',
        recursive: false,
        directoryPaths: [
          '/Volumes/web8T/tg-data/shadiao_2020.6-2022.2/photos',
          '/Volumes/web8T/tg-data/shadiao_2020.6-2022.2/video_files',
          '/Volumes/web8T/tg-data/shadiao_2022.2-2024.5/photos',
          '/Volumes/web8T/tg-data/shadiao_2022.2-2024.5/video_files',
        ],
        fileFormats: ['.jpg', '.png', '.gif', '.mp4'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        minFileSize: 50 * 1024, // 大于50KB的文件
        unique: true,
      },
      beauty: {
        cacheDbId: 'beauty',
        recursive: false,
        directoryPaths: [
          '/Volumes/web8T/downloader/myscript/download/default/美女',
        ],
        fileFormats: ['.jpeg', '.jpg', '.png', '.gif', '.mp4'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        minFileSize: 50 * 1024, // 大于50KB的文件
        unique: true,
      },
      dongwu: {
        cacheDbId: 'dongwu',
        recursive: false,
        directoryPaths: [
          '/Volumes/web8T/downloader/myscript/download/default/动物',
        ],
        fileFormats: ['.jpeg', '.jpg', '.png', '.gif', '.mp4'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        minFileSize: 50 * 1024, // 大于50KB的文件
        /* 最大不超过10M */
        maxFileSize: 10 * 1024 * 1024,
        unique: true,
      },
      jixie: {
        cacheDbId: 'jixie',
        recursive: false,
        directoryPaths: [
          '/Volumes/web8T/downloader/myscript/download/default/机械',
        ],
        fileFormats: ['.jpeg', '.jpg', '.png', '.gif', '.mp4'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        minFileSize: 50 * 1024, // 大于50KB的文件
        /* 最大不超过10M */
        maxFileSize: 10 * 1024 * 1024,
        unique: true,
      },
      dongman: {
        cacheDbId: 'dongman',
        recursive: false,
        directoryPaths: [
          '/Volumes/web8T/downloader/myscript/download/default/动漫',
        ],
        fileFormats: ['.jpeg', '.jpg', '.png', '.gif', '.mp4'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        minFileSize: 50 * 1024, // 大于50KB的文件
        /* 最大不超过10M */
        maxFileSize: 10 * 1024 * 1024,
        unique: true,
      },
      wenzi: {
        cacheDbId: 'wenzi',
        recursive: false,
        directoryPaths: [
          '/Volumes/web8T/downloader/myscript/download/default/文字',
        ],
        fileFormats: ['.jpeg', '.jpg', '.png', '.gif', '.mp4'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        minFileSize: 50 * 1024, // 大于50KB的文件
        /* 最大不超过10M */
        maxFileSize: 10 * 1024 * 1024,
        unique: true,
      },
      boy: {
        cacheDbId: 'boy',
        recursive: false,
        directoryPaths: [
          '/Volumes/web8T/downloader/myscript/download/default/男人',
        ],
        fileFormats: ['.jpeg', '.jpg', '.png', '.gif', '.GIF', '.mp4'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        minFileSize: 50 * 1024, // 大于50KB的文件
        unique: true,
      },
      suijitupian: {
        cacheDbId: 'suijitupian',
        recursive: true,
        directoryPaths: [
          '/Volumes/web8T/downloader/myscript/download/default/城市',
          '/Volumes/web8T/downloader/myscript/download/default/风景',
          '/Volumes/web8T/downloader/myscript/download/default/游戏',
          '/Volumes/web8T/downloader/myscript/download/default/设计',
          // '/Volumes/web8T/downloader/myscript/download/default/物语',
          '/Volumes/web8T/downloader/myscript/download/hot',
        ],
        fileFormats: ['.jpeg', '.jpg', '.png', '.gif', '.GIF', '.mp4'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        /* 大于50KB的文件 */
        minFileSize: 50 * 1024,
        /* 小于10M的 */
        maxFileSize: 10 * 1024 * 1024,
        unique: true,
      },
      gif: {
        cacheDbId: 'gif',
        recursive: false,
        directoryPaths: [
          '/Volumes/web8T/data/gif',
        ],
        fileFormats: ['.gif'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        minFileSize: 50 * 1024, // 大于50KB的文件
        unique: true,
      },
      biaoqingbao: {
        cacheDbId: 'biaoqingbao',
        recursive: true,
        directoryPaths: [
          '/Volumes/web8T/data/表情包',
        ],
        fileFormats: ['.gif', '.GIF', '.jpeg', '.jpg', '.png', '.webp'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        minFileSize: 50 * 1024, // 大于50KB的文件
        unique: false,
      },
      aipic: {
        cacheDbId: 'aipic',
        recursive: true,
        directoryPaths: [
          '/Volumes/web8T/data/ai_古风',
        ],
        fileFormats: ['.jepg', '.jpg', '.png', '.webp'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        minFileSize: 50 * 1024, // 大于50KB的文件
        unique: true,
      },

      xiaojiejie: {
        cacheDbId: 'xiaojiejie',
        recursive: true,
        directoryPaths: [
          // '/Volumes/web8T/data/小姐姐',
          '/Volumes/web8T/data/小姐姐/抖音小姐姐视频',
          '/Volumes/web8T/data/小姐姐/美女私房视频',
          '/Volumes/web8T/data/小姐姐/宅男福利',
          '/Volumes/web8T/data/小姐姐/抖音小姐姐视频超大合集(去水印)',
        ],
        fileFormats: ['.mp4'],
        excludeStrings: ['_thumb'],
        cacheExpiration: 1000 * 60 * 60 * 24 * 365,
        minFileSize: 100 * 1024, // 大于100KB的文件
        /* 小于200M: 200 * 1024 * 1024, */
        maxFileSize: 200 * 1024 * 1024,
        unique: true,
      },
    }

    if (id && defaultOptions[id]) {
      let randomFile = ''
      if (!fileSelector[id]) {
        fileSelector[id] = new RandomFileSelector(defaultOptions[id])
      }

      if (cache === false) {
        await fileSelector[id].clearCache()
      }

      randomFile = await fileSelector[id].getRandomFileWithJSONDB()

      console.log('[getRandomFileWithJSONDB]', randomFile, fileSelector[id].randomIndexes.length)

      return randomFile || ''
    } else {
      return {
        message: '未找到对应的配置项',
      }
    }
  },

  async getRandomWallpapers (id, cache) {
    const defaultOptions = {
      /* 最近一年的sketchy图片 */
      sketchy: {
        params: {
          categories: '001',
          purity: '010',
          sorting: 'toplist',
          topRange: '1y',
        },
        maxPages: 1000,
        unique: true,
      },
      /* sfw，人物图片 */
      sfw: {
        params: {
          categories: '001',
          purity: '100',
          sorting: 'toplist',
          topRange: '1y',
        },
        maxPages: 10000,
        unique: true,
      },
      /* sfw，常规或动画图片 */
      sfw02: {
        params: {
          categories: '110',
          purity: '100',
          sorting: 'toplist',
          topRange: '1y',
        },
        maxPages: 10000,
        unique: true,
      },
      /* 随机sfw，质量一般 */
      sfw03: {
        params: {
          categories: '001',
          purity: '100',
          sorting: 'random',
          seed: 'a1a1a1a1',
          // topRange: '1y',
        },
        maxPages: 10000,
        unique: true,
      },
      /* nsfw，图片 */
      nsfw: {
        params: {
          categories: '001',
          purity: '001',
          sorting: 'toplist',
          topRange: '1y',
        },
        maxPages: 10000,
        unique: true,
      },
    }

    id = id || 'sfw'

    if (id && defaultOptions[id]) {
      let randomFile = ''

      if (!randomWallpapers[id]) {
        randomWallpapers[id] = new RandomWallhavenSelector(defaultOptions[id])
      }

      if (cache === false) {
        await randomWallpapers[id].clearCache()
      }

      randomFile = await randomWallpapers[id].getRandomFileWithJSONDB()

      console.log('[getRandomWallpapersWithJSONDB]', randomFile, randomWallpapers[id].randomIndexes.length)

      return randomFile || ''
    } else {
      return {
        message: '未找到对应的配置项',
      }
    }
  },
}

export default service
