import path from 'path'
import rootPath from './bin/rootPath.js'

/* 基本配置项 */
const config = {
  /* 静态服务器配置 */
  staticService: {
    host: '::',
    port: 3088,
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
      browserMaxAge: 1000 * 60 * 60,
      browserStaleWhileRevalidate: 1000 * 60 * 60 * 24,
      allowedContentTypes: [
        'image/',
        'application/octet-stream',
      ],
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
