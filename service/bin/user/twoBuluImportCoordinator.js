import { normalizeKmlCoordCorrection, parseKmlText } from './userContent.js'
import {
  normalizeTwoBuluPartialPolicy,
  normalizeTwoBuluRequestId,
  normalizeTwoBuluShareUrl,
} from './twoBuluImport.js'
import { createHttpError, hashToken } from './security.js'

const PROVIDER_VALIDATION_ERROR_CODES = new Set([
  'KML_PARSE_FAILED',
  'KML_UNSAFE_XML',
  'VALIDATION_FAILED',
])
const BROWSER_HELPER_PROTOCOL_VERSION = 1
const BROWSER_HELPER_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/
const BROWSER_HELPER_SOURCE_MODES = new Set(['official-kml', 'rendered-data'])
const BROWSER_HELPER_COMPLETENESS = new Set(['full', 'track-only'])
const MAX_BROWSER_HELPER_KML_BYTES = 10 * 1024 * 1024

function upstreamInvalidError () {
  return createHttpError(
    '两步路返回的轨迹内容无效，暂时无法导入',
    502,
    'TWO_BULU_UPSTREAM_INVALID'
  )
}

function trackEmptyError () {
  return createHttpError(
    '两步路公开分享中未找到有效轨迹数据',
    422,
    'TWO_BULU_TRACK_EMPTY'
  )
}

function parseProviderKml (value) {
  try {
    return parseKmlText(value)
  } catch {
    throw upstreamInvalidError()
  }
}

export function normalizeTwoBuluBrowserHelperInput (input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw createHttpError('浏览器助手导入请求格式不正确', 400, 'VALIDATION_FAILED')
  }
  const protocolVersion = Number(input.protocolVersion)
  if (!Number.isSafeInteger(protocolVersion) || protocolVersion !== BROWSER_HELPER_PROTOCOL_VERSION) {
    throw createHttpError('浏览器助手协议版本不兼容，请更新扩展后重试', 400, 'VALIDATION_FAILED')
  }
  const helperVersion = String(input.helperVersion || '').trim()
  if (!BROWSER_HELPER_VERSION_PATTERN.test(helperVersion)) {
    throw createHttpError('浏览器助手版本格式不正确', 400, 'VALIDATION_FAILED')
  }
  if (typeof input.kmlText !== 'string') {
    throw createHttpError('浏览器助手未提供标准 KML 内容', 400, 'KML_PARSE_FAILED')
  }
  const kmlText = input.kmlText.replace(/^\uFEFF/, '')
  const sourceByteSize = Buffer.byteLength(kmlText, 'utf8')
  if (sourceByteSize > MAX_BROWSER_HELPER_KML_BYTES) {
    throw createHttpError('KML 文件超过 10 MiB 浏览器助手导入限制', 413, 'FILE_TOO_LARGE')
  }
  if (!kmlText.trim()) {
    throw createHttpError('浏览器助手未提供标准 KML 内容', 400, 'KML_PARSE_FAILED')
  }
  const sourceMode = String(input.sourceMode || 'official-kml')
  if (!BROWSER_HELPER_SOURCE_MODES.has(sourceMode)) {
    throw createHttpError('浏览器助手数据来源类型不正确', 400, 'VALIDATION_FAILED')
  }
  const completeness = String(input.completeness || 'full')
  if (!BROWSER_HELPER_COMPLETENESS.has(completeness)) {
    throw createHttpError('浏览器助手数据完整性状态不正确', 400, 'VALIDATION_FAILED')
  }
  if (input.warnings !== undefined && !Array.isArray(input.warnings)) {
    throw createHttpError('浏览器助手警告信息格式不正确', 400, 'VALIDATION_FAILED')
  }
  const warnings = (input.warnings || []).slice(0, 10).map((value) => String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300))
    .filter(Boolean)
  return {
    protocolVersion,
    helperVersion,
    kmlText,
    sourceByteSize,
    name: typeof input.name === 'string' ? input.name.slice(0, 200) : '',
    sourceMode,
    completeness,
    warnings,
  }
}

export class TwoBuluImportCoordinator {
  constructor (options = {}) {
    if (!options.userContent) {
      throw new TypeError('TwoBuluImportCoordinator requires userContent')
    }
    this.userContent = options.userContent
    this.provider = options.provider
    this.clock = options.clock || Date.now
  }

  durationSince (startedAt) {
    return Math.max(0, this.clock() - startedAt)
  }

  insertAudit (entry) {
    this.userContent.insertAudit(entry)
  }

  createDocument (actor, input, resolved, syncClientId, canonicalUrl) {
    const createOptions = {
      sourceType: 'imported',
      sourceByteSize: resolved.sourceByteSize,
      ...(syncClientId ? { syncClientId } : {}),
    }

    if (resolved.kmlText !== undefined && resolved.kmlText !== null) {
      const parsed = parseProviderKml(resolved.kmlText)
      if (!parsed.features.length) throw trackEmptyError()
      return this.userContent.createKml(actor, {
        name: resolved.name || parsed.name || '两步路公开轨迹',
        description: `<p>来源：<a href="${canonicalUrl}">两步路公开分享轨迹</a></p>`,
        features: parsed.features,
        sourceType: 'imported',
        coordCorrection: input.coordCorrection,
      }, createOptions)
    }

    if (!resolved.document || typeof resolved.document !== 'object' || !Array.isArray(resolved.document.features)) {
      throw upstreamInvalidError()
    }
    if (!resolved.document.features.length) throw trackEmptyError()

    try {
      return this.userContent.createKml(actor, {
        ...resolved.document,
        sourceType: 'imported',
        coordCorrection: input.coordCorrection,
      }, createOptions)
    } catch (error) {
      if (PROVIDER_VALIDATION_ERROR_CODES.has(error?.code)) throw upstreamInvalidError()
      throw error
    }
  }

  async import (actor, input = {}, context = {}) {
    if (!this.provider || typeof this.provider.resolvePublicTrack !== 'function') {
      throw new TypeError('TwoBuluImportCoordinator server provider is not configured')
    }
    this.userContent.assertPermission(actor, 'kml.own.write')
    const startedAt = this.clock()
    const actorUserId = actor?.user?.id || ''

    try {
      const normalizedSource = normalizeTwoBuluShareUrl(input.url)
      const partialPolicy = normalizeTwoBuluPartialPolicy(input.partialPolicy)
      const requestId = normalizeTwoBuluRequestId(input.requestId)
      const coordCorrection = normalizeKmlCoordCorrection(input.coordCorrection)
      const syncClientId = requestId
        ? `2bulu:${requestId}:${hashToken(normalizedSource.trackId).slice(0, 16)}`
        : ''

      if (syncClientId) {
        const existing = this.userContent.getKmlBySyncClientId(actor, syncClientId)
        if (existing) {
          this.insertAudit({
            actorUserId,
            action: 'kml.import-2bulu',
            targetType: 'kml',
            targetId: existing.id,
            metadata: {
              provider: '2bulu',
              host: 'www.2bulu.com',
              completeness: 'existing',
              featureCount: existing.featureCount,
              idempotent: true,
              durationMs: this.durationSince(startedAt),
            },
            ipSummary: context.ip,
          })
          return {
            ...existing,
            importSummary: {
              provider: '2bulu',
              sourceUrl: normalizedSource.canonicalUrl,
              completeness: 'existing',
              warnings: ['已恢复同一导入请求创建的 KML，未重复读取两步路或创建副本'],
              idempotent: true,
            },
          }
        }
      }

      const resolved = await this.provider.resolvePublicTrack({
        url: normalizedSource.canonicalUrl,
        partialPolicy,
      }, { userId: actorUserId })
      const document = this.createDocument(
        actor,
        { ...input, coordCorrection },
        resolved || {},
        syncClientId,
        normalizedSource.canonicalUrl
      )

      this.insertAudit({
        actorUserId,
        action: 'kml.import-2bulu',
        targetType: 'kml',
        targetId: document.id,
        metadata: {
          provider: '2bulu',
          host: 'www.2bulu.com',
          completeness: resolved.completeness,
          featureCount: document.featureCount,
          durationMs: this.durationSince(startedAt),
        },
        ipSummary: context.ip,
      })
      return {
        ...document,
        importSummary: {
          provider: '2bulu',
          sourceUrl: normalizedSource.canonicalUrl,
          completeness: resolved.completeness,
          warnings: Array.isArray(resolved.warnings) ? resolved.warnings : [],
          idempotent: false,
        },
      }
    } catch (error) {
      this.insertAudit({
        actorUserId,
        action: 'kml.import-2bulu',
        targetType: 'kml',
        targetId: '',
        result: 'failure',
        reason: String(error?.code || 'TWO_BULU_IMPORT_FAILED'),
        metadata: {
          provider: '2bulu',
          host: 'www.2bulu.com',
          durationMs: this.durationSince(startedAt),
        },
        ipSummary: context.ip,
      })
      throw error
    }
  }

  async importFromBrowserHelper (actor, input = {}, context = {}) {
    this.userContent.assertPermission(actor, 'kml.own.write')
    const startedAt = this.clock()
    const actorUserId = actor?.user?.id || ''
    let normalizedHelper = null

    try {
      const normalizedSource = normalizeTwoBuluShareUrl(input.url)
      const partialPolicy = normalizeTwoBuluPartialPolicy(input.partialPolicy)
      const requestId = normalizeTwoBuluRequestId(input.requestId)
      const coordCorrection = normalizeKmlCoordCorrection(input.coordCorrection)
      normalizedHelper = normalizeTwoBuluBrowserHelperInput(input)
      if (normalizedHelper.completeness === 'track-only' && partialPolicy !== 'allow-track-only') {
        throw createHttpError(
          '浏览器助手当前只能还原轨迹线，未能确认标注点和媒体；请选择“允许仅导入公开轨迹线”后重试',
          422,
          'TWO_BULU_PARTIAL_REJECTED'
        )
      }
      const syncClientId = requestId
        ? `2bulu-helper:${requestId}:${hashToken(normalizedSource.trackId).slice(0, 16)}`
        : ''

      if (syncClientId) {
        const existing = this.userContent.getKmlBySyncClientId(actor, syncClientId)
        if (existing) {
          this.insertAudit({
            actorUserId,
            action: 'kml.import-2bulu-browser-helper',
            targetType: 'kml',
            targetId: existing.id,
            metadata: {
              provider: '2bulu',
              host: 'www.2bulu.com',
              protocolVersion: normalizedHelper.protocolVersion,
              helperVersion: normalizedHelper.helperVersion,
              sourceMode: normalizedHelper.sourceMode,
              completeness: 'existing',
              featureCount: existing.featureCount,
              idempotent: true,
              durationMs: this.durationSince(startedAt),
            },
            ipSummary: context.ip,
          })
          return {
            ...existing,
            importSummary: {
              provider: '2bulu',
              sourceUrl: normalizedSource.canonicalUrl,
              completeness: 'existing',
              warnings: ['已恢复同一浏览器助手导入请求创建的 KML，未重复创建副本'],
              idempotent: true,
              helperVersion: normalizedHelper.helperVersion,
              sourceMode: normalizedHelper.sourceMode,
            },
          }
        }
      }

      const parsed = parseKmlText(normalizedHelper.kmlText)
      if (!parsed.features.length) throw trackEmptyError()
      const document = this.userContent.createKml(actor, {
        name: normalizedHelper.name || parsed.name || '两步路公开轨迹',
        description: `<p>来源：<a href="${normalizedSource.canonicalUrl}">两步路公开分享轨迹</a></p>`,
        features: parsed.features,
        sourceType: 'imported',
        coordCorrection,
      }, {
        sourceType: 'imported',
        sourceByteSize: normalizedHelper.sourceByteSize,
        ...(syncClientId ? { syncClientId } : {}),
      })

      this.insertAudit({
        actorUserId,
        action: 'kml.import-2bulu-browser-helper',
        targetType: 'kml',
        targetId: document.id,
        metadata: {
          provider: '2bulu',
          host: 'www.2bulu.com',
          protocolVersion: normalizedHelper.protocolVersion,
          helperVersion: normalizedHelper.helperVersion,
          sourceMode: normalizedHelper.sourceMode,
          completeness: normalizedHelper.completeness,
          featureCount: document.featureCount,
          sourceByteSize: normalizedHelper.sourceByteSize,
          durationMs: this.durationSince(startedAt),
        },
        ipSummary: context.ip,
      })
      return {
        ...document,
        importSummary: {
          provider: '2bulu',
          sourceUrl: normalizedSource.canonicalUrl,
          completeness: normalizedHelper.completeness,
          warnings: normalizedHelper.warnings,
          idempotent: false,
          helperVersion: normalizedHelper.helperVersion,
          sourceMode: normalizedHelper.sourceMode,
        },
      }
    } catch (error) {
      this.insertAudit({
        actorUserId,
        action: 'kml.import-2bulu-browser-helper',
        targetType: 'kml',
        targetId: '',
        result: 'failure',
        reason: String(error?.code || 'TWO_BULU_BROWSER_HELPER_IMPORT_FAILED'),
        metadata: {
          provider: '2bulu',
          host: 'www.2bulu.com',
          protocolVersion: normalizedHelper?.protocolVersion || Number(input?.protocolVersion || 0),
          helperVersion: normalizedHelper?.helperVersion || '',
          sourceMode: normalizedHelper?.sourceMode || '',
          completeness: normalizedHelper?.completeness || '',
          durationMs: this.durationSince(startedAt),
        },
        ipSummary: context.ip,
      })
      throw error
    }
  }
}

export default TwoBuluImportCoordinator
