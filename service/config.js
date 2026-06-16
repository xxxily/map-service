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
