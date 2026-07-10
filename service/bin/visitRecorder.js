/*!
 * @name         visitRecorder.js
 * @description  访问记录器
 * @version      0.0.1
 * @author       Blaze
 * @date         2020/2/28 14:18
 * @github       https://github.com/xxxily
 */
import morgan from 'morgan'
import path from 'path'
import { createStream } from 'rotating-file-stream'
import rootPath from './rootPath.js'
import { sanitizeLogUrl } from './logSanitizer.js'

const accessLogStream = createStream('access.log', {
  path: path.join(rootPath, './log/visitRecorder'),
  interval: '1d',
  size: '2M',
  maxSize: '100M',
})

const visitRecorder = {
  init (app) {
    /* 自定义morgan的token */
    morgan.token('localDate', function getDate (req) {
      const date = new Date()
      return date.toLocaleString()
    })
    morgan.token('safeUrl', req => sanitizeLogUrl(req.originalUrl || req.url))
    morgan.token('safeReferrer', req => sanitizeLogUrl(req.get?.('referer') || req.get?.('referrer') || '-'))

    /* 自定义format，其中包含自定义的token */
    morgan.format('combined', ':remote-addr - :remote-user [:localDate] ":method :safeUrl HTTP/:http-version" :status :res[content-length] ":safeReferrer" ":user-agent"')

    app.use(morgan('combined', {
      stream: accessLogStream,
      skip: function (req, res) {
        // 跳过400以下状态的请求
        // return res.statusCode < 400

        // 跳过favicon.ico资源的请求
        return req.url === '/favicon.ico'
      },
    }))
  },
}

export default visitRecorder
