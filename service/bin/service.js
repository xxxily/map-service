/*!
 * @name         service.js
 * @description  Service layer for map-service API handlers.
 * @version      0.0.1
 * @author       Blaze
 * @date         2020/2/20 15:15
 * @github       https://github.com/xxxily
 */

import baseConfig from '../config.js'
import FetchRelay from './middleware/fetchRelay/index.js'

const serviceConfig = baseConfig.staticService || {}
const fetchRelay = new FetchRelay(serviceConfig.fetchRelay)

const service = {
  fetchRelay (url, options) {
    return fetchRelay.fetch(url, options)
  },

  getFetchRelayCacheStats () {
    return fetchRelay.getStats()
  },

  clearFetchRelayCache (targetUrl) {
    return fetchRelay.clear(targetUrl)
  },
}

export default service
