/**
 * Interaction Adapter: the single boundary between the KML sharing domain and
 * the interaction (comments/moderation) domain.
 *
 * The interaction services must never reach into share tables directly. They
 * need three things from the sharing domain, and this adapter is the only
 * place that provides them:
 *
 * 1. Authorization. Every public interaction request is gated by exactly the
 *    same chain a share read goes through (`assertPublicShareRequest`): share
 *    state, site access, spatial state and the password session. Reusing that
 *    chain is deliberate — a comment must never be reachable on a share that
 *    has been revoked, paused, expired or is still password locked.
 *
 * 2. Thread identity. The external `publicId` is a rotatable alias
 *    (`rotateShareLink` mints a new `public_id` for the same row), so it can
 *    never be the thread key. The adapter returns the immutable
 *    `kml_shares.id` as `canonicalShareId` and keeps the alias only as an
 *    audit snapshot. Rotating a link therefore keeps one thread instead of
 *    silently forking a new one.
 *
 * 3. Resource verification. A client-supplied `resourceRef` is only trusted
 *    after it has been resolved against the *published* snapshot, so a comment
 *    can never bind to an unpublished, renamed or foreign feature.
 *
 * Anti-enumeration: an unknown share item or feature is reported as
 * `RESOURCE_NOT_FOUND` with the same wording the sharing domain uses for a
 * missing share, so a probe cannot tell "share exists but feature does not"
 * apart from "share does not exist".
 */

import { resolvePublishedResourceRef } from '../../../shared/interaction-resource-ref.js'
import { interactionHttpError } from './commentPolicy.js'

/** Scopes the comment domain accepts. Reports also allow share/media. */
const COMMENT_SCOPES = Object.freeze(['feature'])
const REPORT_SCOPES = Object.freeze(['share', 'feature', 'media'])

function notFound () {
  // Same message the sharing domain uses for a missing share: the caller must
  // not be able to distinguish "wrong feature" from "wrong share".
  return interactionHttpError('资源不存在或不可评论', 'RESOURCE_NOT_FOUND')
}

// Labels are copied only from the server-owned published snapshot. Keep them
// bounded and text-only because they are later shown in an admin projection.
function snapshotLabel (value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/gu, '')
    .trim()
    .slice(0, 200)
}

export class InteractionAdapter {
  constructor (options = {}) {
    if (!options.userContent) throw new Error('InteractionAdapter 需要 userContent')
    this.userContent = options.userContent
  }

  /**
   * Authorize a public share request and return the canonical thread identity.
   * Delegates the whole gating chain to the sharing domain so the two never
   * drift apart.
   */
  resolveShareThread (publicId, context = {}) {
    const share = this.userContent.assertPublicShareRequest(publicId, context)
    return {
      canonicalShareId: share.id,
      sharePublicId: share.publicId,
    }
  }

  /**
   * Load the published snapshot for one share item.
   *
   * `validateInteraction` runs the fail-closed resourceRefs inspection: a
   * snapshot whose stable IDs are missing or inconsistent raises rather than
   * exposing references the interaction domain would then persist.
   */
  publishedShareItem (canonicalShareId, sharePublicId, shareItemId) {
    const wanted = String(shareItemId || '')
    if (!wanted) throw notFound()
    const items = this.userContent.publicShareItems(canonicalShareId, {
      validateInteraction: true,
      requireShareIds: true,
      sharePublicId,
    })
    const item = items.find(candidate => candidate.share_item_id === wanted)
    if (!item) throw notFound()
    return item
  }

  /**
   * Resolve and verify a client `resourceRef` for a comment.
   *
   * Returns the normalized reference plus the canonical thread identity. The
   * returned `resourceRef.sharePublicId` is replaced with the *current* alias
   * so a request that arrived on a stale alias is still recorded against the
   * live one.
   */
  resolveCommentResource (publicId, input = {}, context = {}) {
    const thread = this.resolveShareThread(publicId, context)
    const requested = input && typeof input === 'object' && !Array.isArray(input) ? input : {}

    // The alias in the body is advisory only; authorization already happened
    // against the path parameter, so a mismatch must not widen access.
    if (requested.sharePublicId && requested.sharePublicId !== thread.sharePublicId) {
      throw notFound()
    }

    const item = this.publishedShareItem(thread.canonicalShareId, thread.sharePublicId, requested.shareItemId)
    const resolved = resolvePublishedResourceRef(item.snapshot, {
      ...requested,
      sharePublicId: thread.sharePublicId,
    }, { requireShareIds: true, sharePublicId: thread.sharePublicId, shareItemId: item.share_item_id })

    if (!resolved.valid) {
      const code = resolved.issues?.[0]?.code || ''
      // Identity failures are indistinguishable from a missing resource;
      // malformed input is a client error and may be reported as such.
      if (code === 'FEATURE_NOT_FOUND' || code === 'MEDIA_NOT_FOUND') throw notFound()
      throw interactionHttpError(resolved.issues?.[0]?.message || '资源引用不合法', code || 'VALIDATION_FAILED')
    }
    if (!COMMENT_SCOPES.includes(resolved.resourceRef.scope)) {
      throw interactionHttpError('留言只支持 feature 范围', 'SCOPE_INVALID')
    }

    return {
      ...thread,
      resourceRef: resolved.resourceRef,
      shareItemId: resolved.resourceRef.shareItemId,
      featureId: resolved.resourceRef.featureId,
      mediaId: resolved.resourceRef.mediaId || '',
      scope: resolved.resourceRef.scope,
      feature: resolved.feature || null,
      // These labels are derived from the verified published snapshot, never
      // from the request body. They make the moderation detail actionable
      // while the raw snapshot remains redacted from API responses.
      kmlName: snapshotLabel(item.display_name || item.snapshot?.name),
      featureName: snapshotLabel(resolved.feature?.name),
      resourceSnapshot: {
        ...resolved.resourceRef,
        kmlName: snapshotLabel(item.display_name || item.snapshot?.name),
        featureName: snapshotLabel(resolved.feature?.name),
      },
    }
  }

  /**
   * Verify a resource for a read-only public listing. Same gating as a write,
   * but callers only need the identity tuple used by the query.
   */
  resolveCommentQueryResource (publicId, input = {}, context = {}) {
    const resolved = this.resolveCommentResource(publicId, input, context)
    return {
      canonicalShareId: resolved.canonicalShareId,
      sharePublicId: resolved.sharePublicId,
      shareItemId: resolved.shareItemId,
      featureId: resolved.featureId,
      scope: resolved.scope,
    }
  }

  resolveReportResource (publicId, input = {}, context = {}) {
    const thread = this.resolveShareThread(publicId, context)
    const requested = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
    if (requested.sharePublicId && requested.sharePublicId !== thread.sharePublicId) throw notFound()
    const scope = String(requested.scope || '')
    if (!REPORT_SCOPES.includes(scope)) throw interactionHttpError('举报范围不合法', 'VALIDATION_FAILED')
    if (scope === 'share') {
      return { ...thread, resourceRef: { siteId: 'map-service', sharePublicId: thread.sharePublicId, scope: 'share' }, scope, shareItemId: '', featureId: '', mediaId: '' }
    }
    const item = this.publishedShareItem(thread.canonicalShareId, thread.sharePublicId, requested.shareItemId)
    const resolved = resolvePublishedResourceRef(item.snapshot, { ...requested, sharePublicId: thread.sharePublicId }, {
      requireShareIds: true, sharePublicId: thread.sharePublicId, shareItemId: item.share_item_id,
    })
    if (!resolved.valid) {
      const code = resolved.issues?.[0]?.code || ''
      if (code === 'FEATURE_NOT_FOUND' || code === 'MEDIA_NOT_FOUND') throw notFound()
      throw interactionHttpError(resolved.issues?.[0]?.message || '资源引用不合法', code || 'VALIDATION_FAILED')
    }
    if (!REPORT_SCOPES.includes(resolved.resourceRef.scope)) throw interactionHttpError('举报范围不合法', 'VALIDATION_FAILED')
    return {
      ...thread,
      resourceRef: resolved.resourceRef,
      scope: resolved.resourceRef.scope,
      shareItemId: resolved.resourceRef.shareItemId,
      featureId: resolved.resourceRef.featureId,
      mediaId: resolved.resourceRef.mediaId || '',
      feature: resolved.feature || null,
      kmlName: snapshotLabel(item.display_name || item.snapshot?.name),
      featureName: snapshotLabel(resolved.feature?.name),
      resourceSnapshot: {
        ...resolved.resourceRef,
        kmlName: snapshotLabel(item.display_name || item.snapshot?.name),
        featureName: snapshotLabel(resolved.feature?.name),
      },
    }
  }

  /** Stable per-visitor bucket key (never a raw IP). */
  clientKey (canonicalShareId, context = {}) {
    if (typeof this.userContent.shareClientKey === 'function') {
      return this.userContent.shareClientKey(canonicalShareId, context)
    }
    return `${canonicalShareId}:${context.visitorId || ''}`
  }

  /** Append an audit entry through the existing user-system audit log. */
  insertAudit (entry) {
    if (typeof this.userContent.insertAudit !== 'function') return null
    return this.userContent.insertAudit(entry)
  }
}

export default InteractionAdapter
