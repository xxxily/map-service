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
import SharedKmlManager from './admin/sharedKml.js'
import TileCatalogManager from './admin/tileCatalog.js'
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
const tileCatalogManager = new TileCatalogManager({
  store: adminStore,
})
const precacheManager = new PrecacheManager({
  store: adminStore,
  tileCatalogManager,
  maxTiles: adminConfig.precache?.maxTiles,
  defaultConcurrency: adminConfig.precache?.defaultConcurrency,
  maxConcurrency: adminConfig.precache?.maxConcurrency,
  fetchTile: async (url, options = {}) => {
    if (options.providerId && options.tile) {
      const source = tileCatalogManager.findSource(options.providerId)
      if (source) {
        return service.fetchTileSource(options.providerId, options.tile, {
          refresh: options.refresh,
        })
      }
    }
    return service.fetchRelay(url, options)
  },
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
    return fetchRelay.fetch(url, {
      ...options,
      proxy: Object.hasOwn(options, 'proxy') ? options.proxy : null,
    })
  },

  async fetchTileSource (sourceId, tile, options = {}) {
    const request = await tileCatalogManager.createSourceTileRequest(sourceId, tile, options)
    const relayResult = await service.fetchRelay(request.url, {
      proxy: request.proxy,
      cache: request.cache,
      cacheMeta: request.cacheMeta,
      cacheTtlMs: request.cacheTtlMs,
      staleCacheTtlMs: request.staleCacheTtlMs,
      providerId: request.source.id,
      headers: options.headers,
    })
    return {
      ...relayResult,
      source: request.source,
      proxy: request.proxy,
    }
  },

  async fetchExternalPublishTile (publishId, tile, options = {}) {
    const request = await tileCatalogManager.createExternalTileRequest(publishId, tile, options)
    const relayResult = await service.fetchRelay(request.url, {
      proxy: request.proxy,
      cache: request.cache,
      cacheMeta: request.cacheMeta,
      cacheTtlMs: request.cacheTtlMs,
      staleCacheTtlMs: request.staleCacheTtlMs,
      providerId: request.source.id,
      headers: options.headers,
    })
    return {
      ...relayResult,
      source: request.source,
      publish: request.publish,
      proxy: request.proxy,
    }
  },

  async fetchExternalLayerSourceTile (publishId, sourceId, tile, options = {}) {
    const request = await tileCatalogManager.createExternalLayerSourceTileRequest(publishId, sourceId, tile, options)
    const relayResult = await service.fetchRelay(request.url, {
      proxy: request.proxy,
      cache: request.cache,
      cacheMeta: request.cacheMeta,
      cacheTtlMs: request.cacheTtlMs,
      staleCacheTtlMs: request.staleCacheTtlMs,
      providerId: request.source.id,
      headers: options.headers,
    })
    return {
      ...relayResult,
      source: request.source,
      publish: request.publish,
      layer: request.layer,
      layerItem: request.layerItem,
      proxy: request.proxy,
    }
  },

  getFetchRelayCacheStats () {
    return fetchRelay.getStats()
  },

  clearFetchRelayCache (targetUrl, sourceId) {
    return fetchRelay.clear(targetUrl, sourceId)
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

  listTileSources () {
    return tileCatalogManager.listTileSources()
  },

  getTileSource (id) {
    return tileCatalogManager.getTileSource(id)
  },

  createTileSource (input) {
    return tileCatalogManager.createTileSource(input)
  },

  updateTileSource (id, input) {
    return tileCatalogManager.updateTileSource(id, input)
  },

  deleteTileSource (id) {
    return tileCatalogManager.deleteTileSource(id)
  },

  listMapLayers () {
    return tileCatalogManager.listMapLayers()
  },

  createMapLayer (input) {
    return tileCatalogManager.createMapLayer(input)
  },

  updateMapLayer (id, input) {
    return tileCatalogManager.updateMapLayer(id, input)
  },

  deleteMapLayer (id) {
    return tileCatalogManager.deleteMapLayer(id)
  },

  setDefaultMapLayer (id) {
    return tileCatalogManager.setDefaultMapLayer(id)
  },

  listProxyOutbounds () {
    return tileCatalogManager.listProxyOutbounds()
  },

  createProxyOutbound (input) {
    return tileCatalogManager.createProxyOutbound(input)
  },

  updateProxyOutbound (id, input) {
    return tileCatalogManager.updateProxyOutbound(id, input)
  },

  deleteProxyOutbound (id) {
    return tileCatalogManager.deleteProxyOutbound(id)
  },

  listProxyPools () {
    return tileCatalogManager.listProxyPools()
  },

  createProxyPool (input) {
    return tileCatalogManager.createProxyPool(input)
  },

  updateProxyPool (id, input) {
    return tileCatalogManager.updateProxyPool(id, input)
  },

  deleteProxyPool (id) {
    return tileCatalogManager.deleteProxyPool(id)
  },

  getPublicMapCatalog () {
    return tileCatalogManager.getPublicCatalog()
  },

  listExternalPublishes () {
    return tileCatalogManager.listExternalPublishes()
  },

  createExternalPublish (input) {
    return tileCatalogManager.createExternalPublish(input)
  },

  updateExternalPublish (id, input) {
    return tileCatalogManager.updateExternalPublish(id, input)
  },

  deleteExternalPublish (id) {
    return tileCatalogManager.deleteExternalPublish(id)
  },

  resetExternalPublishToken (id) {
    return tileCatalogManager.resetExternalPublishToken(id)
  },

  getExternalPublishTileJson (id, options = {}) {
    return tileCatalogManager.getExternalPublishTileJson(id, options)
  },

  listExternalPublishLogs (id = '') {
    return tileCatalogManager.listExternalLogs(id)
  },

  logExternalPublishRequest (entry, maxLogCount) {
    return tileCatalogManager.addExternalLog(entry, maxLogCount)
  },

  testTileSource (id) {
    return tileCatalogManager.testTileSource(id)
  },

  testProxyOutbound (id) {
    return tileCatalogManager.testProxyOutbound(id)
  },

  testProxyPool (id) {
    return tileCatalogManager.testProxyPool(id)
  },

  testExternalPublish (id) {
    return tileCatalogManager.testExternalPublish(id)
  },
}

export default service
