import {
  normalizeResourceRef,
  stableInteractionDigest,
} from '../shared/interaction-resource-ref.js'

export const COMMENT_PROVIDER_IDS = Object.freeze(['artalk', 'remark42'])

export class CommentProviderPocError extends Error {
  constructor (message, code = 'COMMENT_PROVIDER_POC_INVALID') {
    super(message)
    this.name = 'CommentProviderPocError'
    this.code = code
  }
}

function requiredText (value, field) {
  const normalized = String(value ?? '').normalize('NFKC').trim()
  if (!normalized) throw new CommentProviderPocError(`${field} 不能为空`, 'COMMENT_PROVIDER_POC_CONFIG_INVALID')
  return normalized
}

function safeOrigin (value) {
  let parsed
  try {
    parsed = new URL(requiredText(value, 'publicOrigin'))
  } catch {
    throw new CommentProviderPocError('publicOrigin 必须是合法 HTTPS 地址', 'COMMENT_PROVIDER_POC_CONFIG_INVALID')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new CommentProviderPocError('publicOrigin 必须是无凭据的 HTTPS 地址', 'COMMENT_PROVIDER_POC_CONFIG_INVALID')
  }
  return parsed.origin
}

/**
 * Build the internal thread key used by provider adapters. `canonicalShareId`
 * is the stable server-side share row ID resolved after public-share
 * authorization; it is never returned to the browser or sent to providers in
 * plaintext. Rotating the public link therefore keeps the same thread.
 */
export function buildCommentThreadKey (resourceRef, options = {}) {
  const normalized = normalizeResourceRef(resourceRef)
  if (!normalized.valid) {
    throw new CommentProviderPocError(normalized.issues[0]?.message || '资源引用不合法', 'COMMENT_RESOURCE_REF_INVALID')
  }
  if (normalized.resourceRef.scope !== 'feature') {
    throw new CommentProviderPocError('留言 POC 只允许 feature 范围', 'COMMENT_SCOPE_UNSUPPORTED')
  }
  const canonicalShareId = requiredText(options.canonicalShareId, 'canonicalShareId')
  const identity = JSON.stringify([
    normalized.resourceRef.siteId,
    canonicalShareId,
    normalized.resourceRef.shareItemId,
    normalized.resourceRef.featureId,
  ])
  return `msp_comment_v1_${stableInteractionDigest(identity)}`
}

export function createArtalkAdapterLocator (resourceRef, options = {}) {
  const threadKey = buildCommentThreadKey(resourceRef, options)
  return {
    provider: 'artalk',
    threadKey,
    pageKey: threadKey,
    siteName: requiredText(options.siteName || 'map-service', 'siteName'),
    pageTitle: String(options.pageTitle || '').trim(),
    authMode: 'interaction-adapter',
    moderationAuthority: 'internal',
  }
}

export function createRemark42AdapterLocator (resourceRef, options = {}) {
  const threadKey = buildCommentThreadKey(resourceRef, options)
  const origin = safeOrigin(options.publicOrigin)
  return {
    provider: 'remark42',
    threadKey,
    siteId: requiredText(options.siteId || 'map-service', 'siteId'),
    url: `${origin}/interaction/comments/${threadKey}`,
    title: String(options.pageTitle || '').trim(),
    authMode: 'interaction-adapter',
    moderationAuthority: 'internal',
  }
}

export function createCommentProviderLocator (providerId, resourceRef, options = {}) {
  if (providerId === 'artalk') return createArtalkAdapterLocator(resourceRef, options)
  if (providerId === 'remark42') return createRemark42AdapterLocator(resourceRef, options)
  throw new CommentProviderPocError('不支持的评论 provider', 'COMMENT_PROVIDER_UNSUPPORTED')
}

