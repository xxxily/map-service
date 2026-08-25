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
import UserDatabase from './user/database.js'
import { UserSystemService } from './user/userSystem.js'
import { UserContentService } from './user/userContent.js'
import { TwoBuluImportService } from './user/twoBuluImport.js'
import TwoBuluImportCoordinator from './user/twoBuluImportCoordinator.js'
import KmlShareLinkResolverService from './user/shareLinkResolver.js'
import InteractionService from './interaction/interactionService.js'
import ArtalkMirror from './interaction/artalkMirror.js'
import { createHttpError, randomToken } from './user/security.js'
import { buildShareMapCatalog, isShareMapSourceAllowed } from './user/shareMapCatalog.js'
import { classifyTileAgainstScope } from './user/shareSpatialAccess.js'
import { shareSpatialTileMasker } from './user/shareSpatialTileMask.js'
import {
  assertKmlMediaPublicAddress,
  validateKmlMediaResponse,
  validateKmlMediaTarget,
} from './admin/kmlMedia.js'
import fs from 'fs-extra'
import path from 'path'
import { Readable } from 'node:stream'

const serviceConfig = baseConfig.staticService || {}
const fetchRelay = new FetchRelay(serviceConfig.fetchRelay)
const adminConfig = serviceConfig.admin || {}
const adminStore = new AdminStore({ dataDir: adminConfig.dataDir })
const adminAuth = createAdminAuth(adminConfig.auth, adminStore)
const adminSettings = new AdminSettings(adminStore, {
  ...(adminConfig.settings || {}),
  accessTokenSecret: adminConfig.auth?.tokenSecret,
})
const userSystemConfig = serviceConfig.userSystem || {}
const userDatabase = new UserDatabase({
  filePath: userSystemConfig.databasePath,
})
const userSystem = new UserSystemService({
  database: userDatabase,
  requireSecureBootstrap: userSystemConfig.requireSecureBootstrap,
  bootstrapAdmin: {
    username: adminConfig.auth?.username,
    password: adminConfig.auth?.password,
    configured: adminConfig.auth?.bootstrapConfigured,
  },
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
const sharedKmlManager = new SharedKmlManager({
  store: adminStore,
  contentOptions: baseConfig.staticService.kmlContent || {},
})
const userContent = new UserContentService({
  database: userDatabase,
  userSystem,
  shareSecretEncryptionKey: userSystemConfig.shareSecretEncryptionKey,
  // 公开分享路由会异步计算站点访问状态并通过 context.siteAccessGranted 传入。
  isSiteAccessEnabled: () => true,
})
userSystem.setSettingsChangeHandler((next, previous) => {
  return userContent.revalidateAllSpatialShares(next, previous)
})
userSystem.setSettingsPreviewHandler((next, previous) => {
  return userContent.previewSpatialPolicyImpact(next, previous)
})
const twoBuluImport = new TwoBuluImportService(userSystemConfig.twoBuluImport || {})
const twoBuluImportCoordinator = new TwoBuluImportCoordinator({
  userContent,
  provider: twoBuluImport,
})
const kmlShareLinkResolver = new KmlShareLinkResolverService(userSystemConfig.shareLinkResolver || {})
// 交互数据库和服务按首次调用惰性初始化，不影响只浏览地图的进程启动。
const interaction = new InteractionService({
  userContent,
  config: serviceConfig.interaction || {},
})
const artalkMirrorConfig = serviceConfig.interaction?.artalkMirror || {}
const artalkMirror = new ArtalkMirror(artalkMirrorConfig)

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

function sourceAccessLogLimit (source) {
  if (source?.accessLog?.enabled === false) return 0
  if (source?.accessLog && Object.hasOwn(source.accessLog, 'maxLogCount')) {
    return Number(source.accessLog.maxLogCount || 0)
  }
  return 500
}

function shouldLogSourceAccess (entry, source) {
  if (!source || sourceAccessLogLimit(source) <= 0) return false
  return Boolean(entry.proxyConfigured || entry.proxyOutboundId || entry.proxyPoolId || entry.errorMessage)
}

function buildSourceAccessLogEntry (result, options = {}) {
  const source = result.source || {}
  const tile = options.tile || {}
  return {
    timestamp: new Date().toISOString(),
    sourceId: source.id || options.sourceId || '',
    publishId: options.publishId || '',
    layerId: options.layerId || '',
    clientIp: options.clientIp || '',
    userAgent: options.userAgent || '',
    coordinates: `Z:${tile.z ?? ''} X:${tile.x ?? ''} Y:${tile.y ?? ''}`,
    reqUrl: options.reqUrl || '',
    statusCode: result.statusCode || 200,
    duration: Number(options.duration || 0),
    cacheStatus: result.cacheStatus || 'MISS',
    proxyMode: source.proxy?.mode || '',
    proxyPoolId: result.proxy?.poolId || '',
    proxyOutboundId: result.proxy?.outboundId || '',
    proxyConfigured: Boolean(result.proxyPolicy && result.proxyPolicy.mode !== 'never'),
    cacheEnabled: result.cacheStatus !== 'BYPASS',
    resourceType: options.resourceType || result.resourceType || 'raster',
    keyPoolId: result.key?.keyPoolId || '',
    keyId: result.key?.keyId || '',
    keyAlias: result.key?.alias || '',
    errorMessage: options.errorMessage || null,
  }
}

async function streamToBuffer (stream) {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function jsonRelayResult (payload, options = {}) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  return {
    stream: Readable.from([body]),
    statusCode: options.statusCode || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(options.headers || {}),
    },
    cacheStatus: options.cacheStatus || 'BYPASS',
    cachePath: null,
    meta: null,
  }
}

function upstreamBaseUrlFromRequest (request) {
  try {
    return new URL(request.url).toString()
  } catch (err) {
    return ''
  }
}

function writeSourceAccessLog (entry, source) {
  if (!shouldLogSourceAccess(entry, source)) return
  tileCatalogManager.addSourceAccessLog(entry, sourceAccessLogLimit(source)).catch((err) => {
    console.error('[source access log error]', err)
  })
}

const service = {
  getArtalkMirrorStatus () {
    if (artalkMirror.enabled) interaction.ensureReady()
    return artalkMirror.status(interaction)
  },

  checkArtalkMirrorHealth () {
    if (artalkMirror.enabled) interaction.ensureReady()
    return artalkMirror.health(interaction)
  },

  drainArtalkMirror (options = {}) {
    return artalkMirror.drainOnce(interaction, {
      limit: Number(options.limit || artalkMirrorConfig.batchSize || 20),
      ...options,
    })
  },

  async verifyArtalkMirror (actor, context = {}) {
    const result = await this.checkArtalkMirrorHealth()
    userContent.insertAudit({
      actorUserId: actor?.user?.id || actor?.id || null,
      action: 'interaction.artalk.verify',
      targetType: 'comment_provider',
      targetId: 'artalk',
      metadata: { ok: result.ok === true, enabled: result.enabled === true, configured: result.configured === true },
      ipSummary: context.ipSummary || '',
    })
    return result
  },

  async drainArtalkMirrorForAdmin (actor, options = {}, context = {}) {
    const result = await this.drainArtalkMirror({
      limit: Number(options.limit || artalkMirrorConfig.batchSize || 20),
      reconcileLimit: Number(options.reconcileLimit || 100),
      reconcile: true,
      force: options.force === true,
    })
    userContent.insertAudit({
      actorUserId: actor?.user?.id || actor?.id || null,
      action: 'interaction.artalk.drain',
      targetType: 'comment_provider',
      targetId: 'artalk',
      metadata: {
        claimed: Number(result.claimed || 0),
        sent: Number(result.sent || 0),
        failed: Number(result.failed || 0),
        reconciled: Number(result.reconciled || 0),
        reconcileFailed: Number(result.reconcileFailed || 0),
        force: options.force === true,
      },
      ipSummary: context.ipSummary || '',
    })
    return result
  },

  getUserSystemConfig () {
    return {
      sessionCookieName: userSystemConfig.sessionCookieName || 'map_user_session',
      csrfCookieName: userSystemConfig.csrfCookieName || 'map_csrf_token',
      shareCookiePrefix: userSystemConfig.shareCookiePrefix || 'map_share_access_',
    }
  },

  getAuthConfig () {
    return userSystem.getPublicConfig()
  },

  registerUser (input, context) {
    return userSystem.register(input, context)
  },

  loginUser (input, context, options) {
    return userSystem.login(input, context, options)
  },

  verifyUserSession (token) {
    return userSystem.verifySession(token)
  },

  getUserSessionView (session) {
    return userSystem.sessionView(session)
  },

  verifyUserCsrf (session, token) {
    return userSystem.verifyCsrf(session, token)
  },

  assertUserPermission (session, permission) {
    return userSystem.assertPermission(session, permission)
  },

  hasUserPermission (session, permission) {
    return userSystem.hasPermission(session, permission)
  },

  assertUserRecentReauth (session) {
    return userSystem.assertRecentReauth(session)
  },

  logoutUser (session, context) {
    return userSystem.logout(session, context)
  },

  listUserSessions (session) {
    return userSystem.listSessions(session)
  },

  revokeUserSession (session, sessionId) {
    return userSystem.revokeOwnSession(session, sessionId)
  },

  logoutAllUserSessions (session, options) {
    return userSystem.logoutAll(session, options)
  },

  reauthenticateUser (session, password, context) {
    return userSystem.reauthenticate(session, password, context)
  },

  changeUserPassword (session, input, context) {
    return userSystem.changePassword(session, input, context)
  },

  getCurrentUserProfile (session) {
    return userSystem.getMyProfile(session)
  },

  updateCurrentUserProfile (session, input, context) {
    return userSystem.updateMyProfile(session, input, context)
  },

  getUserSystemSettings () {
    return userSystem.getSettings()
  },

  updateUserSystemSettings (actor, input, context) {
    return userSystem.updateSettings(actor, input, context)
  },

  previewUserSystemSettings (actor, input, context) {
    return userSystem.updateSettings(actor, input, context, { preview: true })
  },

  createManagedUser (actor, input, context) {
    return userSystem.createUser(actor, input, context)
  },

  listManagedUsers (actor, input) {
    return userSystem.listUsers(actor, input)
  },

  getManagedUser (actor, userId) {
    return userSystem.getAdminUser(actor, userId)
  },

  updateManagedUser (actor, userId, input, context) {
    return userSystem.updateUser(actor, userId, input, context)
  },

  resetManagedUserPassword (actor, userId, input, context) {
    return userSystem.resetUserPassword(actor, userId, input, context)
  },

  revokeManagedUserSessions (actor, userId, context) {
    return userSystem.revokeUserSessions(actor, userId, context)
  },

  setManagedUserRoles (actor, userId, roleCodes, context) {
    return userSystem.setUserRoles(actor, userId, roleCodes, context)
  },

  listManagedRoles (actor) {
    return userSystem.listRoles(actor)
  },

  createManagedRole (actor, input, context) {
    return userSystem.createRole(actor, input, context)
  },

  updateManagedRole (actor, roleId, input, context) {
    return userSystem.updateRole(actor, roleId, input, context)
  },

  deleteManagedRole (actor, roleId, context) {
    return userSystem.deleteRole(actor, roleId, context)
  },

  listUserAuditLogs (actor, input) {
    return userSystem.listAuditLogs(actor, input)
  },

  ensureDefaultUserKml (actor) {
    return userContent.ensureDefaultKml(actor)
  },

  listUserKmlFiles (actor, input) {
    return userContent.listKmlFiles(actor, input)
  },

  listUserKmlDirectories (actor) {
    return userContent.listKmlDirectories(actor)
  },

  createUserKmlDirectory (actor, input, context) {
    return userContent.createKmlDirectory(actor, input, context)
  },

  updateUserKmlDirectory (actor, id, input, context) {
    return userContent.updateKmlDirectory(actor, id, input, context)
  },

  deleteUserKmlDirectory (actor, id, context) {
    return userContent.deleteKmlDirectory(actor, id, context)
  },

  reorderUserKmlDirectories (actor, input, context) {
    return userContent.reorderKmlDirectories(actor, input, context)
  },

  setUserKmlDirectoryVisibility (actor, id, enabled, context) {
    return userContent.setKmlDirectoryVisibility(actor, id, enabled, context)
  },

  reorderUserKmlFiles (actor, input, context) {
    return userContent.reorderKmlFiles(actor, input, context)
  },

  moveUserKmlFile (actor, id, input, context) {
    return userContent.moveKmlFile(actor, id, input, context)
  },

  createUserKml (actor, input, context) {
    return userContent.createKml(actor, input, context)
  },

  getUserKml (actor, id) {
    return userContent.getKml(actor, id)
  },

  updateUserKml (actor, id, input, context) {
    return userContent.updateKml(actor, id, input, context)
  },

  trashUserKml (actor, id, context) {
    return userContent.trashKml(actor, id, context)
  },

  restoreUserKml (actor, id, context) {
    return userContent.restoreKml(actor, id, context)
  },

  permanentlyDeleteUserKml (actor, id, context) {
    return userContent.deleteKmlPermanently(actor, id, context)
  },

  importUserKml (actor, input, context) {
    return userContent.importKml(actor, input, context)
  },

  async importTwoBuluUserKml (actor, input = {}, context = {}) {
    return twoBuluImportCoordinator.import(actor, input, context)
  },

  async importTwoBuluBrowserHelperKml (actor, input = {}, context = {}) {
    return twoBuluImportCoordinator.importFromBrowserHelper(actor, input, context)
  },

  async resolveKmlShareLinks (actor, input = {}, context = {}) {
    return kmlShareLinkResolver.resolve(actor, input, context)
  },

  exportUserKml (actor, id) {
    return userContent.exportKml(actor, id)
  },

  syncUserKmlFiles (actor, input, context) {
    return userContent.syncKmlFiles(actor, input, context)
  },

  migrateLocalUserKml (actor, input, context) {
    return userContent.migrateLocalKml(actor, input, context)
  },

  listUserFavorites (actor, input) {
    return userContent.listFavorites(actor, input)
  },

  createUserFavorite (actor, input, context) {
    return userContent.createFavorite(actor, input, context)
  },

  getUserFavorite (actor, id) {
    return userContent.getFavorite(actor, id)
  },

  updateUserFavorite (actor, id, input, context) {
    return userContent.updateFavorite(actor, id, input, context)
  },

  deleteUserFavorite (actor, id, context) {
    return userContent.deleteFavorite(actor, id, context)
  },

  listUserKmlShares (actor, input) {
    return userContent.listShares(actor, input)
  },

  createUserKmlShare (actor, input, context) {
    return userContent.createShare(actor, input, context)
  },

  getUserKmlShareSpatialPreview (actor, input) {
    return userContent.getSpatialPreview(actor, input)
  },

  getUserKmlShare (actor, id) {
    return userContent.getShare(actor, id)
  },

  updateUserKmlShare (actor, id, input, context) {
    return userContent.updateShare(actor, id, input, context)
  },

  deleteUserKmlShare (actor, id, context) {
    return userContent.deleteShare(actor, id, context)
  },

  listUserKmlShareAccessEvents (actor, id, input) {
    return userContent.listShareAccessEvents(actor, id, input)
  },

  createUserKmlSharePasswordUrl (actor, id) {
    return userContent.createPasswordShareUrl(actor, id)
  },

  createAnonymousShareVisitorId () {
    return randomToken(24)
  },

  syncUserKmlShareContent (actor, id, input, context) {
    return userContent.syncShareContent(actor, id, input, context)
  },

  pauseUserKmlShare (actor, id, context) {
    return userContent.pauseShare(actor, id, context)
  },

  resumeUserKmlShare (actor, id, context) {
    return userContent.resumeShare(actor, id, context)
  },

  revokeUserKmlShare (actor, id, context) {
    return userContent.revokeShare(actor, id, context)
  },

  rotateUserKmlShareLink (actor, id, context) {
    return userContent.rotateShareLink(actor, id, context)
  },

  authorizePublicKmlShare (publicId, input, context) {
    return userContent.authorizePublicShare(publicId, input, context)
  },

  getPublicKmlShareManifest (publicId, options) {
    return userContent.getPublicShareManifest(publicId, options)
  },

  getPublicKmlShareMetadata (publicId) {
    return userContent.getPublicShareMetadata(publicId)
  },

  assertPublicKmlShareRequest (publicId, options) {
    return userContent.assertPublicShareRequest(publicId, options)
  },

  async getPublicKmlShareMapCatalog (publicId, options) {
    const share = userContent.assertPublicShareRequest(publicId, options)
    const spatialAccess = share.spatialAccess || { mode: 'unrestricted', status: 'ready' }
    if (spatialAccess.mode === 'kml_bounds' && spatialAccess.status !== 'ready') {
      throw createHttpError('分享地图范围暂不可用', 410, spatialAccess.reasonCode || 'SHARE_SPATIAL_UNAVAILABLE')
    }
    return buildShareMapCatalog(await tileCatalogManager.getPublicCatalog(), publicId, {
      spatialAccess,
    })
  },

  async assertPublicKmlShareMapSource (publicId, sourceId, tile, options) {
    const share = userContent.assertPublicShareTileRequest(publicId, sourceId, options)
    const spatialAccess = share.spatialAccess || { mode: 'unrestricted', status: 'ready' }
    const source = await tileCatalogManager.getPublicTileSource(sourceId)
    if (!isShareMapSourceAllowed(source, spatialAccess)) {
      userContent.recordShareRuntimeMetric(share.id, 'tile_source_rejected')
      throw createHttpError('分享底图不存在', 404, 'RESOURCE_NOT_FOUND')
    }
    if (spatialAccess.mode !== 'kml_bounds') {
      userContent.consumeShareRateLimit('tile', share.id, options)
      userContent.recordShareRuntimeMetric(share.id, 'tile_decision', { sourceId, decision: 'allow' })
      return { decision: 'allow', tile }
    }
    const spatialScope = share.spatialScope || spatialAccess.internalScope
    if (spatialAccess.status !== 'ready' || !spatialScope) {
      throw createHttpError('分享地图范围暂不可用', 410, spatialAccess.reasonCode || 'SHARE_SPATIAL_UNAVAILABLE')
    }
    const classification = classifyTileAgainstScope(spatialScope, tile)
    if (classification.decision === 'invalid' || classification.decision === 'unavailable') {
      userContent.recordShareRuntimeMetric(share.id, 'tile_decision', { sourceId, decision: classification.decision })
      throw createHttpError('瓦片坐标无效', 400, 'INVALID_TILE_COORDINATES')
    }
    if (classification.decision === 'allow' || classification.decision === 'allow_unrestricted' || classification.decision === 'boundary') {
      userContent.consumeShareRateLimit('tile', share.id, options)
    }
    userContent.recordShareRuntimeMetric(share.id, 'tile_decision', { sourceId, decision: classification.decision })
    return { ...classification, spatialScope }
  },

  getPublicKmlShareFile (publicId, shareItemId, options) {
    return userContent.getPublicShareFile(publicId, shareItemId, options)
  },

  exportPublicKmlShareFile (publicId, shareItemId, options) {
    return userContent.exportPublicShareFile(publicId, shareItemId, options)
  },

  // ------------------------------ 交互域（留言/人工审核）
  getPublicInteractionCommentPolicy (publicId, context) {
    return interaction.getPublicCommentPolicy(publicId, context)
  },

  getPublicInteractionInfo (publicId, context) {
    return interaction.getPublicInfo(publicId, context)
  },

  listPublicInteractionComments (publicId, query, context) {
    return interaction.listPublicComments(publicId, query, context)
  },

  getPublicInteractionCommentCount (publicId, query, context) {
    return interaction.getPublicCommentCount(publicId, query, context)
  },

  submitPublicInteractionComment (publicId, input, context) {
    return interaction.submitComment(publicId, input, context)
  },

  submitPublicInteractionReport (publicId, input, context) {
    return interaction.submitReport(publicId, input, context)
  },

  listInteractionReportsForAdmin (filters, options) {
    return interaction.listReportsForAdmin(filters, options)
  },

  getInteractionReportForAdmin (id) {
    return interaction.getReportForAdmin(id)
  },

  actionInteractionReport (actor, id, input, context) {
    const action = String(input?.action || '')
    const beforeApply = action === 'block_share' || action === 'pause_share'
      ? ({ report }) => action === 'block_share'
          ? userContent.blockShare(actor, report.canonical_share_id, { reason: input.reason })
          : userContent.pauseShareForAdmin(actor, report.canonical_share_id, { reason: input.reason })
      : undefined
    return interaction.actionReport(actor, id, { ...input, ...(beforeApply ? { beforeApply } : {}) }, context)
  },

  listInteractionCommentsForAdmin (filters, options) {
    return interaction.listCommentsForAdmin(filters, options)
  },

  getInteractionCommentForAdmin (id) {
    return interaction.getCommentForAdmin(id)
  },

  moderateInteractionComment (actor, id, input, context) {
    return interaction.moderateComment(actor, id, input, context)
  },

  reprocessInteractionComment (actor, id, context) {
    return interaction.reprocessComment(actor, id, context)
  },

  replayInteractionAiReview (actor, id, context) {
    return interaction.replayAiReviewForAdmin(actor, id, context)
  },

  deleteInteractionCommentForAdmin (actor, id, context) {
    return interaction.deleteCommentForAdmin(actor, id, context)
  },

  getInteractionPolicyForAdmin () {
    return interaction.getInteractionPolicyForAdmin()
  },

  getInteractionAiPolicyForAdmin () {
    return interaction.getAiPolicyForAdmin()
  },

  publishInteractionPolicy (actor, input, context) {
    return interaction.publishInteractionPolicy(actor, input, context)
  },

  publishInteractionAiPolicy (actor, input, context) {
    return interaction.publishAiPolicy(actor, input, context)
  },

  listInteractionAiPromptVersionsForAdmin () {
    return interaction.listAiPromptVersionsForAdmin()
  },

  publishInteractionAiPromptVersion (actor, input, context) {
    return interaction.publishAiPromptVersion(actor, input, context)
  },

  getInteractionKeywordRulesForAdmin () {
    return interaction.getKeywordRulesForAdmin()
  },

  publishInteractionKeywordRules (actor, rules, options, context) {
    return interaction.publishKeywordRules(actor, rules, options, context)
  },

  previewInteractionKeywordRules (input) {
    return interaction.previewKeywordRules(input)
  },

  previewInteractionModerationImpact (input) {
    return interaction.previewModerationImpact(input)
  },

  replayInteractionModerationEvents (actor, input, context) {
    return interaction.replayFailedModerationEvents(actor, input, context)
  },

  listInteractionAiProvidersForAdmin () {
    return interaction.listAiProvidersForAdmin()
  },

  configureInteractionAiProvider (actor, input, context) {
    return interaction.configureAiProviderForAdmin(actor, input, context)
  },

  setDefaultInteractionAiProvider (actor, id, context) {
    return interaction.setDefaultAiProviderForAdmin(actor, id, context)
  },

  verifyInteractionAiProvider (actor, id, context) {
    return interaction.verifyAiProviderForAdmin(actor, id, context)
  },

  listAllUserKmlShares (actor, input) {
    return userContent.listAllShares(actor, input)
  },

  getUserKmlShareRuntimeMetrics (actor) {
    return userContent.getShareRuntimeMetrics(actor)
  },

  blockUserKmlShare (actor, id, input, context) {
    return userContent.blockShare(actor, id, input, context)
  },

  deleteUserKmlShareAsAdmin (actor, id, context) {
    return userContent.deleteShareForAdmin(actor, id, context)
  },

  unblockUserKmlShare (actor, id, context) {
    return userContent.unblockShare(actor, id, context)
  },

  setUserKmlShareAnalyticsDisabled (actor, id, input, context) {
    return userContent.setShareAnalyticsDisabled(actor, id, input, context)
  },

  async fetchRelay (url, options = {}) {
    return fetchRelay.fetch(url, {
      ...options,
      proxy: Object.hasOwn(options, 'proxy') ? options.proxy : null,
    })
  },

  async fetchKmlMedia (url) {
    const target = validateKmlMediaTarget(url)
    await assertKmlMediaPublicAddress(target)
    const relayResult = await service.fetchRelay(target, {
      cache: false,
      maxRedirects: 0,
    })
    try {
      return validateKmlMediaResponse(relayResult)
    } catch (err) {
      relayResult?.stream?.destroy()
      throw err
    }
  },

  async fetchTileSource (sourceId, tile, options = {}) {
    const startTime = Date.now()
    const request = await tileCatalogManager.createSourceTileRequest(sourceId, tile, options)
    const relayResult = await service.fetchRelay(request.url, {
      proxy: request.proxy,
      cache: request.cache,
      cacheMeta: request.cacheMeta,
      cacheTtlMs: request.cacheTtlMs,
      staleCacheTtlMs: request.staleCacheTtlMs,
      providerId: request.source.id,
      headers: {
        ...(options.headers || {}),
        ...(request.headers || {}),
      },
    })
    const result = {
      ...relayResult,
      source: request.source,
      proxy: request.proxy,
      proxyPolicy: request.proxyPolicy,
      key: request.key,
    }
    writeSourceAccessLog(buildSourceAccessLogEntry(result, {
      sourceId,
      tile,
      clientIp: options.clientIp,
      userAgent: options.userAgent,
      reqUrl: options.reqUrl,
      duration: Date.now() - startTime,
    }), request.source)
    return result
  },

  async fetchPublicKmlShareBoundaryTile (sourceId, tile, options = {}) {
    const result = await service.fetchTileSource(sourceId, tile, options)
    const body = await shareSpatialTileMasker.maskRelayResult(result, {
      scope: options.scope,
      sourceId,
      tile,
    })
    return { result, body }
  },

  async fetchVectorResource (sourceId, resourceType, params = {}, options = {}) {
    const startTime = Date.now()
    let request = null
    try {
      request = await tileCatalogManager.createVectorResourceRequest(sourceId, resourceType, params, options)
      const relayResult = await service.fetchRelay(request.url, {
        proxy: request.proxy,
        cache: request.cache,
        cacheMeta: request.cacheMeta,
        cacheTtlMs: request.cacheTtlMs,
        staleCacheTtlMs: request.staleCacheTtlMs,
        providerId: request.source.id,
        headers: {
          ...(options.headers || {}),
          ...(request.headers || {}),
        },
      })

      let result = {
        ...relayResult,
        source: request.source,
        proxy: request.proxy,
        proxyPolicy: request.proxyPolicy,
        key: request.key,
        resourceType,
      }

      if (resourceType === 'style' || resourceType === 'tilejson') {
        const buffer = await streamToBuffer(relayResult.stream)
        let parsed
        try {
          parsed = JSON.parse(buffer.toString('utf8'))
        } catch (err) {
          const parseError = new Error('上游矢量 JSON 解析失败')
          parseError.statusCode = 502
          throw parseError
        }
        const payload = resourceType === 'style'
          ? tileCatalogManager.rewriteVectorStyle(request.source, parsed, {
              ...(options.rewrite || {}),
              upstreamBaseUrl: upstreamBaseUrlFromRequest(request),
              selectedKey: request.internalKey || null,
            })
          : tileCatalogManager.rewriteTileJson(request.source, parsed, {
              ...(options.rewrite || {}),
              upstreamBaseUrl: upstreamBaseUrlFromRequest(request),
              selectedKey: request.internalKey || null,
            })
        result = {
          ...jsonRelayResult(payload, { cacheStatus: relayResult.cacheStatus }),
          source: request.source,
          proxy: request.proxy,
          proxyPolicy: request.proxyPolicy,
          key: request.key,
          resourceType,
        }
      }

      writeSourceAccessLog(buildSourceAccessLogEntry(result, {
        sourceId,
        publishId: options.publishId,
        layerId: options.layerId,
        tile: params,
        clientIp: options.clientIp,
        userAgent: options.userAgent,
        reqUrl: options.reqUrl,
        duration: Date.now() - startTime,
        resourceType,
      }), request.source)
      return result
    } catch (err) {
      if (request?.source) {
        writeSourceAccessLog(buildSourceAccessLogEntry({
          source: request.source,
          proxy: request.proxy,
          proxyPolicy: request.proxyPolicy,
          key: request.key,
          statusCode: err.statusCode || err.response?.status || 502,
          cacheStatus: 'ERROR',
          resourceType,
        }, {
          sourceId,
          publishId: options.publishId,
          layerId: options.layerId,
          tile: params,
          clientIp: options.clientIp,
          userAgent: options.userAgent,
          reqUrl: options.reqUrl,
          duration: Date.now() - startTime,
          resourceType,
          errorMessage: err.message || '矢量图源资源请求失败',
        }), request.source)
      }
      throw err
    }
  },

  async fetchExternalPublishTile (publishId, tile, options = {}) {
    const startTime = Date.now()
    const request = await tileCatalogManager.createExternalTileRequest(publishId, tile, options)
    const relayResult = await service.fetchRelay(request.url, {
      proxy: request.proxy,
      cache: request.cache,
      cacheMeta: request.cacheMeta,
      cacheTtlMs: request.cacheTtlMs,
      staleCacheTtlMs: request.staleCacheTtlMs,
      providerId: request.source.id,
      headers: {
        ...(options.headers || {}),
        ...(request.headers || {}),
      },
    })
    const result = {
      ...relayResult,
      source: request.source,
      publish: request.publish,
      proxy: request.proxy,
      proxyPolicy: request.proxyPolicy,
      key: request.key,
    }
    writeSourceAccessLog(buildSourceAccessLogEntry(result, {
      sourceId: request.source.id,
      publishId: request.publish.id,
      tile,
      clientIp: options.clientIp,
      userAgent: options.userAgent,
      reqUrl: options.reqUrl,
      duration: Date.now() - startTime,
    }), request.source)
    return result
  },

  async fetchExternalLayerSourceTile (publishId, sourceId, tile, options = {}) {
    const startTime = Date.now()
    const request = await tileCatalogManager.createExternalLayerSourceTileRequest(publishId, sourceId, tile, options)
    const relayResult = await service.fetchRelay(request.url, {
      proxy: request.proxy,
      cache: request.cache,
      cacheMeta: request.cacheMeta,
      cacheTtlMs: request.cacheTtlMs,
      staleCacheTtlMs: request.staleCacheTtlMs,
      providerId: request.source.id,
      headers: {
        ...(options.headers || {}),
        ...(request.headers || {}),
      },
    })
    const result = {
      ...relayResult,
      source: request.source,
      publish: request.publish,
      layer: request.layer,
      layerItem: request.layerItem,
      proxy: request.proxy,
      proxyPolicy: request.proxyPolicy,
      key: request.key,
    }
    writeSourceAccessLog(buildSourceAccessLogEntry(result, {
      sourceId,
      publishId: request.publish.id,
      layerId: request.layer.id,
      tile,
      clientIp: options.clientIp,
      userAgent: options.userAgent,
      reqUrl: options.reqUrl,
      duration: Date.now() - startTime,
    }), request.source)
    return result
  },

  async fetchExternalVectorResource (publishId, resourceType, params = {}, options = {}) {
    const request = await tileCatalogManager.createExternalVectorResourceRequest(publishId, resourceType, params, options)
    const rewrite = resourceType === 'style' || resourceType === 'tilejson'
      ? {
          basePath: `/api/v1/external/${request.publish.pathSlug}`,
          sourcePath: '',
        }
      : {}
    const result = await service.fetchVectorResource(request.source.id, resourceType, params, {
      ...options,
      proxyOverride: request.publish.overrides.proxy || null,
      cacheOverride: request.publish.overrides.cache || null,
      publishId: request.publish.id,
      rewrite,
    })
    result.publish = request.publish
    return result
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

  async getAdminSystemInfo (actor) {
    const packageInfo = await readPackageInfo()
    return {
      package: packageInfo,
      node: process.version,
      pid: process.pid,
      uptime: process.uptime(),
      env: process.env.NODE_ENV || 'development',
      serverTime: Date.now(),
      basePath: '/api/v1',
      admin: await adminAuth.getPublicInfo(),
      userSystem: userSystem.getHealthSummary(actor),
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

  getSharedKmlFeatureContent (id, featureId, isAdmin = false) {
    return sharedKmlManager.getFeatureContent(id, featureId, isAdmin)
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

  listSourcePresets () {
    return tileCatalogManager.listSourcePresets()
  },

  createSourceFromPreset (presetId, input = {}) {
    return tileCatalogManager.createSourceFromPreset(presetId, input)
  },

  listKeyPools () {
    return tileCatalogManager.listKeyPools()
  },

  getKeyPool (id) {
    return tileCatalogManager.getKeyPool(id)
  },

  createKeyPool (input) {
    return tileCatalogManager.createKeyPool(input)
  },

  updateKeyPool (id, input) {
    return tileCatalogManager.updateKeyPool(id, input)
  },

  deleteKeyPool (id) {
    return tileCatalogManager.deleteKeyPool(id)
  },

  testKeyPool (id) {
    return tileCatalogManager.testKeyPool(id)
  },

  testKeyPoolKey (poolId, keyId) {
    return tileCatalogManager.testKeyPoolKey(poolId, keyId)
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

  listSourceAccessLogs (sourceId = '') {
    return tileCatalogManager.listSourceAccessLogs(sourceId)
  },

  logSourceAccessRequest (entry, source = null, maxLogCount = 500) {
    if (source) {
      writeSourceAccessLog(entry, source)
      return Promise.resolve()
    }
    return tileCatalogManager.addSourceAccessLog(entry, maxLogCount)
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
