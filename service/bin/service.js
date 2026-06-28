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
import AdminSettings from './admin/settings.js'
import PrecacheManager from './admin/precache.js'
import getVisitStats from './admin/visitStats.js'
import { getTileProviderByUrl } from './admin/tileProviders.js'
import SharedKmlManager from './admin/sharedKml.js'
import fs from 'fs-extra'
import path from 'path'

const serviceConfig = baseConfig.staticService || {}
const fetchRelay = new FetchRelay(serviceConfig.fetchRelay)
const adminConfig = serviceConfig.admin || {}
const adminStore = new AdminStore({ dataDir: adminConfig.dataDir })
const adminAuth = createAdminAuth(adminConfig.auth, adminStore)
const adminSettings = new AdminSettings(adminStore, {
  ...(adminConfig.settings || {}),
  accessTokenSecret: adminConfig.auth?.tokenSecret,
})
const precacheManager = new PrecacheManager({
  store: adminStore,
  maxTiles: adminConfig.precache?.maxTiles,
  defaultConcurrency: adminConfig.precache?.defaultConcurrency,
  maxConcurrency: adminConfig.precache?.maxConcurrency,
  fetchTile: async (url, options = {}) => service.fetchRelay(url, options),
  clearTileCache: async (urls) => fetchRelay.clearMany(urls),
})
const sharedKmlManager = new SharedKmlManager({ store: adminStore })

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

  async loginAdmin (credentials) {
    return adminAuth.login(credentials)
  },

  async updateAdminPassword (currentPassword, newPassword) {
    return adminAuth.updatePassword(currentPassword, newPassword)
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

  estimatePrecacheTask (input) {
    return precacheManager.estimateTask(input)
  },

  createPrecacheTask (input) {
    return precacheManager.createTask(input)
  },

  pausePrecacheTask (taskId) {
    return precacheManager.pauseTask(taskId)
  },

  resumePrecacheTask (taskId) {
    return precacheManager.resumeTask(taskId)
  },

  deletePrecacheTask (taskId, options = {}) {
    return precacheManager.deleteTask(taskId, options)
  },

  getSharedKmlList (isAdmin = false) {
    return sharedKmlManager.list(isAdmin)
  },

  getSharedKml (id, isAdmin = false) {
    return sharedKmlManager.get(id, isAdmin)
  },

  createSharedKml (input) {
    return sharedKmlManager.create(input)
  },

  updateSharedKml (id, input) {
    return sharedKmlManager.update(id, input)
  },

  deleteSharedKml (id) {
    return sharedKmlManager.delete(id)
  },

  importSharedKml (fileBuffer, originalName, options = {}) {
    return sharedKmlManager.import(fileBuffer, originalName, options)
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

  createAccessToken () {
    return adminSettings.createAccessToken()
  },
}

export default service
