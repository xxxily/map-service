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
import AdminStore from './admin/store.js'
import createAdminAuth from './admin/auth.js'
import AdminSettings, { getAccessHash } from './admin/settings.js'
import PrecacheManager from './admin/precache.js'
import getVisitStats from './admin/visitStats.js'
import { getTileProviderByUrl } from './admin/tileProviders.js'
import fs from 'fs-extra'
import path from 'path'

const serviceConfig = baseConfig.staticService || {}
const fetchRelay = new FetchRelay(serviceConfig.fetchRelay)
const adminConfig = serviceConfig.admin || {}
const adminStore = new AdminStore({ dataDir: adminConfig.dataDir })
const adminAuth = createAdminAuth(adminConfig.auth)
const adminSettings = new AdminSettings(adminStore, adminConfig.settings)
const precacheManager = new PrecacheManager({
  store: adminStore,
  maxTiles: adminConfig.precache?.maxTiles,
  defaultConcurrency: adminConfig.precache?.defaultConcurrency,
  maxConcurrency: adminConfig.precache?.maxConcurrency,
  fetchTile: async (url, options = {}) => service.fetchRelay(url, options),
})

const packageJsonPath = path.resolve(import.meta.dirname, '../../package.json')

async function readPackageInfo () {
  try {
    const packageInfo = await fs.readJson(packageJsonPath)
    return {
      name: packageInfo.name,
      version: packageInfo.version,
      description: packageInfo.description,
      private: Boolean(packageInfo.private),
    }
  } catch (err) {
    return {
      name: 'map-service',
      version: 'unknown',
      description: '',
      private: true,
    }
  }
}

const service = {
  async fetchRelay (url, options = {}) {
    const providerId = options.providerId || getTileProviderByUrl(url)?.id || ''
    const proxy = await adminSettings.getProxyForRequest({
      forceProxy: options.useProxy,
      providerId,
    })
    return fetchRelay.fetch(url, {
      ...options,
      proxy,
    })
  },

  getFetchRelayCacheStats () {
    return fetchRelay.getStats()
  },

  clearFetchRelayCache (targetUrl) {
    return fetchRelay.clear(targetUrl)
  },

  loginAdmin (credentials) {
    return adminAuth.login(credentials)
  },

  verifyAdminToken (token) {
    return adminAuth.verifyToken(token)
  },

  async getAdminSystemInfo () {
    const packageInfo = await readPackageInfo()
    return {
      package: packageInfo,
      node: process.version,
      pid: process.pid,
      uptime: process.uptime(),
      env: process.env.NODE_ENV || 'development',
      serverTime: Date.now(),
      basePath: '/api/v1',
      admin: adminAuth.getPublicInfo(),
    }
  },

  getAdminSettings () {
    return adminSettings.getSanitized()
  },

  updateAdminSettings (input) {
    return adminSettings.update(input)
  },

  getVisitStats () {
    return getVisitStats({
      logDir: path.join(serviceConfig.logDir || path.resolve(process.cwd(), './log'), 'visitRecorder'),
    })
  },

  getPrecacheProviders () {
    return precacheManager.getProviders()
  },

  listPrecacheTasks () {
    return precacheManager.listTasks()
  },

  createPrecacheTask (input) {
    return precacheManager.createTask(input)
  },

  isAccessEnabled () {
    return adminSettings.isAccessEnabled()
  },

  verifyAccess (token) {
    return adminSettings.verifyAccess(token)
  },

  checkAccessPassword (password) {
    return adminSettings.checkPassword(password)
  },

  async getAccessSignature () {
    const settings = await adminSettings.readRaw()
    return getAccessHash(settings.access.password)
  },
}

export default service
