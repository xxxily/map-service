import config from './config.js'
const whitelist = config.staticService.corsWhitelist || []

const corsOpts = {
  origin: function (origin, callback) {
    let isMatchWhitelist = false

    if (origin) {
      for (let i = 0; i < whitelist.length; i++) {
        const rule = whitelist[i]
        if (rule && origin.includes(rule)) {
          isMatchWhitelist = true
          break
        }
      }
    }

    if (!origin || isMatchWhitelist) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
}

export default corsOpts
