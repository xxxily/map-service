import fs from 'fs-extra'
import path from 'path'
import rootPath from '../../rootPath.js'
import utils from '../../utils/index.js'
import axios from 'axios'

class FetchRelay {
  constructor (conf) {
    const defConf = {
      cacheDir: path.join(rootPath, '.cache/fetchRelay/'),
      timeout: 1000 * 10,
    }
    this.config = utils.merge(defConf, conf || {})
  }

  /**
   * 将数据流存储到文件当中
   * @param stream
   * @param savePath
   * @returns {Promise<unknown>}
   */
  async saveStream (stream, savePath) {
    if (!stream || !stream.pipe) {
      return Promise.reject(new Error('参数不正确，无法进行数据保存'))
    }

    savePath = savePath || path.join(this.config.cacheDir, utils.getDayTag('-') + '_TempFile0000')

    await fs.ensureDir(path.dirname(savePath))

    const writer = fs.createWriteStream(savePath)
    stream.pipe(writer)

    return new Promise((resolve, reject) => {
      writer.on('finish', (data) => resolve(data || true))
      writer.on('error', reject)
    })
  }

  async fetch (url, useProxy, noCache) {
    if (!url) {
      return false
    }

    const urlInfo = new URL(url)

    if (!urlInfo.hostname) {
      return false
    }

    const conf = this.config
    const hostPath = urlInfo.port ? urlInfo.hostname + '-' + urlInfo.port : urlInfo.hostname
    const searchPath = urlInfo.search ? '/' + utils.md5(urlInfo.search) : ''
    const resFilePath = path.join(conf.cacheDir, hostPath + '/' + urlInfo.pathname + searchPath)

    /* 默认使用缓存，如果文件存在，且文件大小大于或等于1kb，则以数据流的形式读取并返回对应文件的数据流 */
    if (!noCache && await fs.pathExists(resFilePath)) {
      if ((await fs.stat(resFilePath)).size < 1024) {
        console.log(`${url} 缓存文件过小，可能存在异常，需重新请求：${resFilePath}`)

        /* 删除可能存在异常的缓存文件 */
        await fs.remove(resFilePath)
      } else {
        console.log(`${url} 使用本地缓存文件：${resFilePath}`)

        const dataStream = fs.createReadStream(resFilePath)
        /* 让文件流开始'流'动起来 */
        dataStream.resume()

        // read.setEncoding('utf-8')
        // dataStream.on('data', data => {
        //   console.log('正在读')
        // })
        // dataStream.on('end', () => {
        //   console.log('文件读取结束')
        // })

        return dataStream
      }
    }

    /* 发起请求 */
    const axiosConf = {
      url: url,
      timeout: conf.timeout,
      responseType: 'stream',
    }

    if (useProxy) {
      axiosConf.proxy = {
        host: '127.0.0.1',
        port: 10809,
      }
    }

    const result = await axios(axiosConf).catch(err => {
      const res = err.response || {}
      console.error(`${err.config.url} ${res.status} ${res.statusText}`)
    })

    /* 视情况而缓存数据 */
    if (result && result.data) {
      const saveSuc = await this.saveStream(result.data, resFilePath).catch(err => {
        console.error('saveStream error', err)
      })

      if (saveSuc) {
        console.log(`[fetchRelay saveStream suc] ${url} ${resFilePath}`)

        const dataStream = fs.createReadStream(resFilePath)
        dataStream.resume()
        return dataStream
      } else {
        return false
      }
    } else {
      return false
    }
  }
}

// async function test () {
//   // const testUrl = 'http://www.google.com/maps/vt?lyrs=s@189&gl=cn&x=53387&y=28438&z=16'
//   const testUrl = 'http://webservice.fed.qiweioa.cn/journal/pageUpdateStatus'
//   const relay = new FetchRelay()
//
//   const streamResult = await relay.fetch(testUrl)
//   // streamResult.on('data', (data) => {
//   //   console.log('streamResult data', data.toString())
//   // })
//
//   streamResult.on('end', () => {
//     console.log('streamResult end')
//   })
// }
// test()

export default FetchRelay
