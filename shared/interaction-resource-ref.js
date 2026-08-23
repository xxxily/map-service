/**
 * Stable resource references shared by the interaction (comments/reports)
 * services. This module deliberately has no persistence or framework
 * dependencies: callers can use the same contract at API and snapshot edges.
 *
 * A published KML feature keeps its historical `id` for map compatibility,
 * while `resourceRefs.featureId` is the identifier used by the interaction
 * services. Media IDs are derived from the media type and a stable source key
 * (resource-collection item ID or normalized URL). This lets a URL change
 * create a new media resource and leaves the old one orphaned instead of
 * silently rebinding an existing comment/report.
 */

import { buildFeatureContentView, createInteractionMediaId } from './kml-content.js'
import {
  INTERACTION_FEATURE_ID_PATTERN,
  normalizeInteractionFeatureId,
} from './interaction-resource-id.js'

export const RESOURCE_REF_SITE_ID = 'map-service'
export const INTERACTION_RESOURCE_REF_VERSION = 1
export const RESOURCE_REF_SCOPES = Object.freeze(['share', 'feature', 'media'])

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'iframe'])
const FEATURE_RESOURCE_REF_FIELDS = new Set([
  'version', 'featureId', 'legacyFeatureId', 'media', 'complete',
])
const MEDIA_RESOURCE_REF_FIELDS = new Set([
  'mediaId', 'sourceId', 'sourceType', 'type',
])

const ID_PATTERNS = Object.freeze({
  // New deployments may use shr_public_*. Existing shares use an opaque
  // randomToken value, so both forms remain valid during the migration.
  sharePublicId: /^(?:shr_public_[A-Za-z0-9][A-Za-z0-9_-]{0,127}|[A-Za-z0-9_-]{8,128})$/,
  shareItemId: /^shi_[A-Za-z0-9_-]{1,127}$/,
  // Existing KML IDs may be user supplied and are not necessarily prefixed
  // or ASCII. Keep them as stable opaque values, while rejecting whitespace,
  // URL delimiters and markup characters.
  featureId: INTERACTION_FEATURE_ID_PATTERN,
  mediaId: /^media_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/,
})

const RESOURCE_FIELDS = Object.freeze([
  'siteId', 'sharePublicId', 'shareItemId', 'featureId', 'mediaId', 'scope',
])

const ID_MAX_LENGTHS = Object.freeze({
  sharePublicId: 139,
  shareItemId: 132,
  featureId: 160,
  mediaId: 134,
})

function issue (code, path, message, value) {
  const result = { code, path, message }
  if (value !== undefined) result.value = value
  return result
}

function cleanString (value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim() : ''
}

export function normalizePublishedFeatureId (value) {
  return normalizeInteractionFeatureId(value)
}

function mediaSourceKey (item, occurrence) {
  const sourceType = cleanString(item?.sourceType) || 'description'
  if (sourceType === 'resource-collection') {
    return `collection:${cleanString(item?.collectionItemId || item?.id) || occurrence}`
  }
  const type = cleanString(item?.type) || 'unknown'
  const source = cleanString(item?.canonicalUrl || item?.displayUrl || item?.url)
  return `url:${type}:${source}:${occurrence}`
}

/** Build the stable feature/media IDs for a published snapshot. */
export function buildPublishedFeatureResourceRefs (feature, options = {}) {
  const legacyFeatureId = cleanString(feature?.id)
  const featureId = normalizePublishedFeatureId(legacyFeatureId)
  const contentView = options.contentView || buildFeatureContentView(feature, {
    ...(options.contentOptions || {}),
    includeResourceCollections: true,
    limit: Number.isInteger(options.mediaLimit) ? options.mediaLimit : 10000,
  })
  const occurrences = new Map()
  const media = []
  for (const group of contentView?.groups || []) {
    if (!MEDIA_TYPES.has(group?.type)) continue
    for (const item of group.items || []) {
      const sourceType = cleanString(item?.sourceType) || 'description'
      const sourceId = cleanString(item?.id)
      const baseKey = mediaSourceKey(item, 0)
      const occurrence = Number(occurrences.get(baseKey) || 0)
      occurrences.set(baseKey, occurrence + 1)
      media.push({
        // Preserve an existing ID for the first occurrence only. A duplicated
        // source must derive its own ID even when the content view attached
        // the same default mediaId to every copy.
        mediaId: occurrence === 0 && item?.mediaId
          ? item.mediaId
          : createInteractionMediaId(featureId, item, occurrence),
        sourceId,
        sourceType,
        type: cleanString(item?.type) || group.type,
      })
    }
  }
  return {
    version: INTERACTION_RESOURCE_REF_VERSION,
    featureId,
    ...(legacyFeatureId && legacyFeatureId !== featureId ? { legacyFeatureId } : {}),
    media,
    complete: contentView?.sourceSummary?.truncated !== true,
  }
}

export function decoratePublishedFeature (feature, options = {}) {
  if (!feature || typeof feature !== 'object' || Array.isArray(feature)) return feature
  if (!options.force && feature.resourceRefs && typeof feature.resourceRefs === 'object' && !Array.isArray(feature.resourceRefs)) {
    return { ...feature }
  }
  const refs = buildPublishedFeatureResourceRefs(feature, options)
  return {
    ...feature,
    resourceRefs: refs,
  }
}

export function decoratePublishedSnapshot (snapshot, options = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return snapshot
  return {
    ...snapshot,
    resourceRefsVersion: options.force || snapshot.resourceRefsVersion === undefined
      ? INTERACTION_RESOURCE_REF_VERSION
      : snapshot.resourceRefsVersion,
    features: Array.isArray(snapshot.features)
      ? snapshot.features.map(feature => decoratePublishedFeature(feature, options))
      : snapshot.features,
  }
}

export function buildPublishedResourceCatalog (snapshot, options = {}) {
  return {
    version: INTERACTION_RESOURCE_REF_VERSION,
    features: (Array.isArray(snapshot?.features) ? snapshot.features : []).map(feature =>
      buildPublishedFeatureResourceRefs(feature, options)
    ),
  }
}

function checkId (field, value, issues) {
  if (!value) {
    issues.push(issue('REQUIRED', field, `${field} 为必填项`))
    return ''
  }
  const maximum = ID_MAX_LENGTHS[field] || 136
  if (value.length > maximum) {
    issues.push(issue('ID_TOO_LONG', field, `${field} 长度不能超过 ${maximum} 个字符`))
  } else if (!ID_PATTERNS[field].test(value)) {
    issues.push(issue('ID_INVALID', field, `${field} 格式不合法`))
  }
  return value
}

/** Normalize a resourceRef without throwing. Unknown fields are rejected by default. */
export function normalizeResourceRef (input, options = {}) {
  const issues = []
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    issues.push(issue('OBJECT_INVALID', '', 'resourceRef 必须是对象'))
  }

  const unknownPolicy = options.unknown || 'reject'
  for (const key of Object.keys(source)) {
    if (!RESOURCE_FIELDS.includes(key)) {
      if (unknownPolicy === 'reject') issues.push(issue('UNKNOWN_FIELD', key, `不支持的资源引用字段：${key}`))
    }
  }

  const normalized = {
    siteId: cleanString(source.siteId) || RESOURCE_REF_SITE_ID,
    sharePublicId: cleanString(source.sharePublicId),
    shareItemId: cleanString(source.shareItemId),
    featureId: cleanString(source.featureId),
    mediaId: cleanString(source.mediaId),
    scope: cleanString(source.scope).toLowerCase(),
  }
  if (normalized.siteId !== RESOURCE_REF_SITE_ID) {
    issues.push(issue('SITE_ID_INVALID', 'siteId', `siteId 必须为 ${RESOURCE_REF_SITE_ID}`))
  }
  if (!RESOURCE_REF_SCOPES.includes(normalized.scope)) {
    issues.push(issue('SCOPE_INVALID', 'scope', 'scope 必须为 share、feature 或 media'))
  }

  checkId('sharePublicId', normalized.sharePublicId, issues)
  if (normalized.scope !== 'share') checkId('shareItemId', normalized.shareItemId, issues)
  if (normalized.scope === 'feature' || normalized.scope === 'media') checkId('featureId', normalized.featureId, issues)
  if (normalized.scope === 'media') checkId('mediaId', normalized.mediaId, issues)

  if (normalized.scope === 'share' && (normalized.shareItemId || normalized.featureId || normalized.mediaId)) {
    issues.push(issue('FIELD_NOT_ALLOWED', 'shareItemId/featureId/mediaId', 'share 范围不能携带 shareItemId、featureId 或 mediaId'))
  }
  if (normalized.scope !== 'media' && normalized.mediaId) {
    issues.push(issue('FIELD_NOT_ALLOWED', 'mediaId', '只有 media 范围允许携带 mediaId'))
  }
  if (normalized.scope === 'feature' && !normalized.featureId) {
    // checkId above emits REQUIRED; this branch documents the scope invariant.
  }
  return { resourceRef: normalized, issues, valid: issues.length === 0 }
}

export function validateResourceRef (input, options = {}) {
  return normalizeResourceRef(input, options).issues
}

export function isValidResourceRef (input, options = {}) {
  return validateResourceRef(input, options).length === 0
}

function snapshotMediaEntries (feature, options = {}) {
  if (Array.isArray(feature?.resourceRefs?.media)) return feature.resourceRefs.media
  for (const key of ['media', 'mediaItems', 'resources']) {
    if (Array.isArray(feature?.[key])) return feature[key]
  }
  if (Array.isArray(feature?.content?.media)) return feature.content.media
  return options.derive === false ? [] : buildPublishedFeatureResourceRefs(feature, options).media
}

/**
 * Check a published snapshot before exposing references to interaction
 * services. The result is an auditable list; it never silently repairs IDs.
 */
export function inspectPublishedResourceReferences (snapshot, options = {}) {
  const issues = []
  const isSnapshotObject = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
  if (!isSnapshotObject) {
    issues.push(issue('SNAPSHOT_INVALID', '', '公开快照必须是对象'))
  }
  const hasSnapshotVersion = snapshot?.resourceRefsVersion !== undefined
  if (snapshot?.resourceRefsVersion !== undefined &&
      Number(snapshot.resourceRefsVersion) !== INTERACTION_RESOURCE_REF_VERSION) {
    issues.push(issue('RESOURCE_REFS_VERSION_INVALID', 'resourceRefsVersion', '公开快照资源引用版本不受支持'))
  }
  const features = Array.isArray(snapshot?.features) ? snapshot.features : []
  if (!Array.isArray(snapshot?.features)) {
    issues.push(issue('FEATURES_INVALID', 'features', 'published snapshot 的 features 必须是数组'))
  }
  const hasFeatureResourceRefs = features.some(feature => feature?.resourceRefs !== undefined)
  const hasResourceRefMetadata = hasSnapshotVersion || hasFeatureResourceRefs
  if (hasResourceRefMetadata && !hasSnapshotVersion) {
    issues.push(issue('RESOURCE_REFS_VERSION_MISSING', 'resourceRefsVersion', '公开快照缺少资源引用版本'))
  }
  const featureIds = new Set()
  const mediaIds = new Set()
  const sharePublicId = cleanString(options.sharePublicId || snapshot?.sharePublicId)
  const shareItemId = cleanString(options.shareItemId || snapshot?.shareItemId)
  features.forEach((feature, index) => {
    const path = `features[${index}]`
    const hasFeatureRefs = feature?.resourceRefs !== undefined
    if (hasResourceRefMetadata && !hasFeatureRefs) {
      issues.push(issue('RESOURCE_REFS_MISSING', `${path}.resourceRefs`, 'Feature 缺少资源引用元数据'))
    }
    if (feature?.resourceRefs !== undefined &&
        (!feature.resourceRefs || typeof feature.resourceRefs !== 'object' || Array.isArray(feature.resourceRefs))) {
      issues.push(issue('RESOURCE_REFS_INVALID', `${path}.resourceRefs`, 'Feature 的资源引用元数据格式不正确'))
    }
    if (feature?.resourceRefs && typeof feature.resourceRefs === 'object' && !Array.isArray(feature.resourceRefs)) {
      for (const key of Object.keys(feature.resourceRefs)) {
        if (!FEATURE_RESOURCE_REF_FIELDS.has(key)) {
          issues.push(issue('RESOURCE_REFS_UNKNOWN_FIELD', `${path}.resourceRefs.${key}`, `不支持的 Feature 资源引用字段：${key}`))
        }
      }
      if (feature.resourceRefs.version === undefined) {
        issues.push(issue('RESOURCE_REFS_VERSION_MISSING', `${path}.resourceRefs.version`, 'Feature 缺少资源引用版本'))
      }
      if (!cleanString(feature.resourceRefs.featureId)) {
        issues.push(issue('FEATURE_ID_MISSING', `${path}.resourceRefs.featureId`, 'Feature 资源引用缺少稳定 ID'))
      }
      if (!Array.isArray(feature.resourceRefs.media)) {
        issues.push(issue('MEDIA_REFS_INVALID', `${path}.resourceRefs.media`, 'Feature 的媒体资源引用必须是数组'))
      }
      if (feature.resourceRefs.complete !== true) {
        issues.push(issue('MEDIA_REFS_INCOMPLETE', `${path}.resourceRefs.complete`, 'Feature 的媒体资源引用不完整'))
      }
    }
    const sourceFeatureId = cleanString(feature?.featureId || feature?.id)
    const generatedRefs = buildPublishedFeatureResourceRefs(feature, options)
    const featureId = cleanString(feature?.resourceRefs?.featureId || generatedRefs.featureId)
    if (!sourceFeatureId) issues.push(issue('FEATURE_ID_MISSING', `${path}.id`, 'Feature 缺少稳定 ID'))
    else {
      if (!ID_PATTERNS.featureId.test(featureId)) issues.push(issue('FEATURE_ID_INVALID', `${path}.id`, 'Feature ID 格式不合法', featureId))
      if (featureIds.has(featureId)) issues.push(issue('FEATURE_ID_DUPLICATE', `${path}.id`, 'Feature ID 重复', featureId))
      featureIds.add(featureId)
    }
    if (feature?.resourceRefs?.featureId && featureId !== generatedRefs.featureId) {
      issues.push(issue('FEATURE_ID_MISMATCH', `${path}.resourceRefs.featureId`, 'Feature 资源引用与已发布内容不一致'))
    }
    if (feature?.resourceRefs?.version !== undefined &&
        Number(feature.resourceRefs.version) !== INTERACTION_RESOURCE_REF_VERSION) {
      issues.push(issue('RESOURCE_REFS_VERSION_INVALID', `${path}.resourceRefs.version`, 'Feature 资源引用版本不受支持'))
    }
    if (Array.isArray(feature?.resourceRefs?.media)) {
      const actual = feature.resourceRefs.media
      if (generatedRefs.media.length !== actual.length || generatedRefs.media.some((expected, mediaIndex) => {
        const candidate = actual[mediaIndex]
        return !candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
          cleanString(candidate.mediaId) !== expected.mediaId ||
          cleanString(candidate.sourceId) !== expected.sourceId ||
          cleanString(candidate.sourceType) !== expected.sourceType ||
          cleanString(candidate.type) !== expected.type
      })) {
        issues.push(issue('MEDIA_REFS_MISMATCH', `${path}.resourceRefs.media`, '媒体资源引用与已发布内容不一致'))
      }
      actual.forEach((candidate, mediaIndex) => {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
          issues.push(issue('MEDIA_REF_INVALID', `${path}.resourceRefs.media[${mediaIndex}]`, '媒体资源引用格式不正确'))
          return
        }
        for (const key of Object.keys(candidate)) {
          if (!MEDIA_RESOURCE_REF_FIELDS.has(key)) {
            issues.push(issue('MEDIA_REF_UNKNOWN_FIELD', `${path}.resourceRefs.media[${mediaIndex}].${key}`, `不支持的媒体资源引用字段：${key}`))
          }
        }
      })
    }
    const localMediaIds = new Set()
    snapshotMediaEntries(feature, options).forEach((media, mediaIndex) => {
      const mediaPath = `${path}.media[${mediaIndex}]`
      const mediaId = cleanString(media?.mediaId || media?.id)
      if (!mediaId) issues.push(issue('MEDIA_ID_MISSING', `${mediaPath}.id`, '媒体项缺少稳定 ID'))
      else {
        if (!ID_PATTERNS.mediaId.test(mediaId)) issues.push(issue('MEDIA_ID_INVALID', `${mediaPath}.id`, '媒体 ID 格式不合法', mediaId))
        if (localMediaIds.has(mediaId) || mediaIds.has(mediaId)) issues.push(issue('MEDIA_ID_DUPLICATE', `${mediaPath}.id`, '媒体 ID 重复', mediaId))
        localMediaIds.add(mediaId)
        mediaIds.add(mediaId)
      }
    })
  })
  if (options.requireShareIds) {
    if (!ID_PATTERNS.sharePublicId.test(sharePublicId)) issues.push(issue('SHARE_PUBLIC_ID_INVALID', 'sharePublicId', '分享公开 ID 缺失或格式不合法'))
    if (!ID_PATTERNS.shareItemId.test(shareItemId)) issues.push(issue('SHARE_ITEM_ID_INVALID', 'shareItemId', '分享项 ID 缺失或格式不合法'))
  }
  return issues
}

export const checkPublishedResourceReferences = inspectPublishedResourceReferences

export const RESOURCE_REF_ID_PATTERNS = ID_PATTERNS
export {
  createStableInteractionId,
  normalizeInteractionFeatureId,
  stableInteractionDigest,
} from './interaction-resource-id.js'

/**
 * Resolve a normalized resource reference against one published snapshot.
 * Callers should still perform share authorization before invoking this
 * helper; this function only checks identity and scope within the snapshot.
 */
export function resolvePublishedResourceRef (snapshot, input, options = {}) {
  const normalized = normalizeResourceRef(input, options)
  if (!normalized.valid) return { valid: false, issues: normalized.issues, resourceRef: normalized.resourceRef }
  const ref = normalized.resourceRef
  const features = Array.isArray(snapshot?.features) ? snapshot.features : []
  const feature = features.find(candidate => {
    const id = cleanString(candidate?.resourceRefs?.featureId || buildPublishedFeatureResourceRefs(candidate, options).featureId)
    return id === ref.featureId
  })
  if (ref.scope === 'share') return { valid: true, resourceRef: ref, feature: null, media: null }
  if (!feature) return { valid: false, resourceRef: ref, issues: [issue('FEATURE_NOT_FOUND', 'featureId', 'Feature 不属于当前已发布快照')] }
  if (ref.scope === 'feature') return { valid: true, resourceRef: ref, feature, media: null }
  const media = snapshotMediaEntries(feature, options).find(candidate => cleanString(candidate?.mediaId || candidate?.id) === ref.mediaId)
  if (!media) return { valid: false, resourceRef: ref, feature, issues: [issue('MEDIA_NOT_FOUND', 'mediaId', '媒体不属于当前已发布快照')] }
  return { valid: true, resourceRef: ref, feature, media }
}
