/**
 * Comment moderation transition executor.
 *
 * `shared/interaction-policy.js` only exposes pure transition predicates, and
 * the schema only enforces row-level invariants (for example
 * `moderation_status <> 'approved' OR approved_at IS NOT NULL`). This module is
 * the only place allowed to move a comment between states, so that every
 * transition is atomic and always carries:
 *
 * - a legality check against the frozen transition table;
 * - the timestamps the CHECK constraints require;
 * - a `comment_moderation_decisions` row recording who decided what;
 * - an audit entry recording the actual `from -> to` pair, which the decision
 *   table has no columns for;
 * - idempotent replay when the same decision key arrives twice.
 */

import {
  MODERATION_ACTIONS,
  MODERATION_LEVELS,
  canTransitionCommentContent,
  canTransitionCommentModeration,
  isPublicComment,
} from '../../../shared/interaction-policy.js'
import { normalizeIdempotencyKey } from '../../../shared/interaction-contracts.js'
import {
  MODERATION_ACTION_STATUS,
  interactionHttpError,
  isUniqueConstraintError,
  mapInteractionDatabaseError,
  newModerationDecisionId,
  toInteractionHttpError,
} from './commentPolicy.js'

const MODERATION_STAGES = Object.freeze(['keyword', 'ai', 'human'])

/** Moderation statuses an operator may set through the admin review action. */
export const HUMAN_MODERATION_STATUSES = Object.freeze([
  'pending', 'approved', 'rejected', 'quarantined', 'spam',
])

const COMMENT_COLUMNS = `
  id, canonical_share_id, share_item_id, feature_id, scope, content_revision,
  parent_id, thread_depth, author_type, author_user_id, content_status,
  moderation_status, moderation_level, visible_at, created_at, updated_at,
  approved_at, deleted_at, orphaned_at, legal_hold
`

export class CommentModerationService {
  constructor (options = {}) {
    if (!options.database) throw new Error('CommentModerationService 需要 database')
    this.database = options.database
    this.now = typeof options.now === 'function' ? options.now : () => new Date().toISOString()
    // Injected so the interaction service can delegate to UserSystemService
    // without this module importing the whole user system.
    this.auditSink = typeof options.auditSink === 'function' ? options.auditSink : null
  }

  getComment (commentId) {
    return this.database.prepare(`SELECT ${COMMENT_COLUMNS} FROM comments WHERE id = ?`).get(commentId) || null
  }

  requireComment (commentId) {
    const row = this.getComment(commentId)
    if (!row) throw interactionHttpError('资源不存在', 'RESOURCE_NOT_FOUND')
    return row
  }

  writeAudit (entry) {
    if (!this.auditSink) return
    this.auditSink(entry)
  }

  /**
   * Apply a moderation status change.
   *
   * Returns `{ changed, replayed, fromStatus, toStatus, comment, decisionId }`.
   * A repeated call with the same `idempotencyKey` is a replay, not an error,
   * and a transition to the status the comment already has is a no-op that
   * writes neither a decision nor an audit row.
   */
  applyModerationDecision (input = {}) {
    const commentId = String(input.commentId || '')
    const toStatus = String(input.toStatus || '')
    if (!HUMAN_MODERATION_STATUSES.includes(toStatus) && toStatus !== 'orphaned') {
      throw interactionHttpError('审核目标状态不合法', 'VALIDATION_FAILED')
    }
    const stage = MODERATION_STAGES.includes(input.stage) ? input.stage : 'human'
    const level = MODERATION_LEVELS.includes(input.level) ? input.level : 'unknown'
    const suggestedAction = MODERATION_ACTIONS.includes(input.suggestedAction)
      ? input.suggestedAction
      : moderationActionForStatus(toStatus)
    let idempotencyKey
    try {
      idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey)
    } catch (error) {
      throw toInteractionHttpError(error)
    }
    const actorUserId = input.actorUserId ? String(input.actorUserId) : ''
    if (stage === 'human' && !actorUserId) {
      throw interactionHttpError('人工审核必须记录操作人', 'AUTH_REQUIRED')
    }
    const now = input.now || this.now()

    try {
      return this.database.transaction(() => {
        const current = this.requireComment(commentId)
        const fromStatus = current.moderation_status

        const replay = idempotencyKey
          ? this.findDecisionByKey(commentId, current.content_revision, stage, idempotencyKey)
          : null
        if (replay) {
          return {
            changed: false,
            replayed: true,
            fromStatus,
            toStatus: fromStatus,
            comment: current,
            decisionId: replay.id,
          }
        }

        if (!canTransitionCommentModeration(fromStatus, toStatus)) {
          throw interactionHttpError(
            `留言审核状态不能从 ${fromStatus} 变更为 ${toStatus}`,
            'MODERATION_TRANSITION_INVALID'
          )
        }
        if (current.legal_hold === 1 && toStatus !== 'approved' && input.allowLegalHoldChange !== true) {
          throw interactionHttpError('留言处于法律保留状态，需专门流程处理', 'COMMENT_POLICY_BLOCKED')
        }

        if (fromStatus === toStatus) {
          return {
            changed: false,
            replayed: false,
            fromStatus,
            toStatus,
            comment: current,
            decisionId: '',
          }
        }

        // Timestamps the CHECK constraints demand. `approved_at` is preserved
        // once set so the public ordering index keeps a stable sort key.
        const approvedAt = toStatus === 'approved' ? (current.approved_at || now) : current.approved_at
        const orphanedAt = toStatus === 'orphaned' ? (current.orphaned_at || now) : current.orphaned_at
        const visibleAt = isPublicComment({ contentStatus: current.content_status, moderationStatus: toStatus })
          ? (current.visible_at || now)
          : null

        this.database.prepare(`
          UPDATE comments
          SET moderation_status = ?, moderation_level = ?, approved_at = ?,
              orphaned_at = ?, visible_at = ?, updated_at = ?
          WHERE id = ?
        `).run(toStatus, level, approvedAt, orphanedAt, visibleAt, now, commentId)

        const decisionId = this.insertDecision({
          commentId,
          contentRevision: current.content_revision,
          stage,
          level,
          suggestedAction,
          reasonCodes: input.reasonCodes,
          actorUserId,
          idempotencyKey,
          now,
        })

        this.writeAudit({
          actorUserId: actorUserId || null,
          action: 'interaction.comment.moderate',
          targetType: 'interaction_comment',
          targetId: commentId,
          result: 'success',
          reason: input.reason || '',
          metadata: {
            fromStatus,
            toStatus,
            stage,
            level,
            suggestedAction,
            contentRevision: current.content_revision,
            decisionId,
          },
          ipSummary: input.ipSummary || '',
        })

        return {
          changed: true,
          replayed: false,
          fromStatus,
          toStatus,
          comment: this.getComment(commentId),
          decisionId,
        }
      })
    } catch (error) {
      throw mapInteractionDatabaseError(error)
    }
  }

  /**
   * Apply a content status change (hide / restore / soft delete). Kept separate
   * from moderation because the two axes are independent in the schema.
   */
  applyContentStatus (input = {}) {
    const commentId = String(input.commentId || '')
    const toStatus = String(input.toStatus || '')
    const actorUserId = input.actorUserId ? String(input.actorUserId) : ''
    const now = input.now || this.now()

    try {
      return this.database.transaction(() => {
        const current = this.requireComment(commentId)
        const fromStatus = current.content_status
        if (!canTransitionCommentContent(fromStatus, toStatus)) {
          throw interactionHttpError(
            `留言内容状态不能从 ${fromStatus} 变更为 ${toStatus}`,
            'CONTENT_STATUS_TRANSITION_INVALID'
          )
        }
        if (current.legal_hold === 1 && toStatus === 'deleted') {
          throw interactionHttpError('留言处于法律保留状态，不能删除', 'COMMENT_POLICY_BLOCKED')
        }
        if (fromStatus === toStatus) {
          return { changed: false, fromStatus, toStatus, comment: current }
        }

        const deletedAt = toStatus === 'deleted' ? (current.deleted_at || now) : current.deleted_at
        const visibleAt = isPublicComment({ contentStatus: toStatus, moderationStatus: current.moderation_status })
          ? (current.visible_at || now)
          : null

        this.database.prepare(`
          UPDATE comments
          SET content_status = ?, deleted_at = ?, visible_at = ?, updated_at = ?
          WHERE id = ?
        `).run(toStatus, deletedAt, visibleAt, now, commentId)

        this.writeAudit({
          actorUserId: actorUserId || null,
          action: 'interaction.comment.content_status',
          targetType: 'interaction_comment',
          targetId: commentId,
          result: 'success',
          reason: input.reason || '',
          metadata: { fromStatus, toStatus, contentRevision: current.content_revision },
          ipSummary: input.ipSummary || '',
        })

        return { changed: true, fromStatus, toStatus, comment: this.getComment(commentId) }
      })
    } catch (error) {
      throw mapInteractionDatabaseError(error)
    }
  }

  findDecisionByKey (commentId, contentRevision, stage, idempotencyKey) {
    if (!idempotencyKey) return null
    return this.database.prepare(`
      SELECT id, comment_id, stage, level, suggested_action, created_at
      FROM comment_moderation_decisions
      WHERE comment_id = ? AND content_revision = ? AND stage = ? AND idempotency_key = ?
    `).get(commentId, contentRevision, stage, idempotencyKey) || null
  }

  insertDecision (input = {}) {
    const id = newModerationDecisionId()
    const reasonCodes = Array.isArray(input.reasonCodes) ? input.reasonCodes.map(code => String(code)) : []
    try {
      this.database.prepare(`
        INSERT INTO comment_moderation_decisions(
          id, comment_id, content_revision, stage, level, reason_codes_json,
          suggested_action, actor_user_id, created_at, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.commentId, input.contentRevision, input.stage, input.level,
        JSON.stringify(reasonCodes), input.suggestedAction, input.actorUserId || '',
        input.now, input.idempotencyKey || ''
      )
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw interactionHttpError('该审核请求已处理', 'DUPLICATE_REQUEST')
      }
      throw error
    }
    return id
  }

  /** Full moderation chain for the admin detail view, newest first. */
  listDecisions (commentId) {
    return this.database.prepare(`
      SELECT id, comment_id, content_revision, stage, level, reason_codes_json,
             suggested_action, actor_user_id, created_at
      FROM comment_moderation_decisions
      WHERE comment_id = ?
      ORDER BY created_at DESC, id DESC
    `).all(commentId)
  }
}

function moderationActionForStatus (status) {
  const entry = Object.entries(MODERATION_ACTION_STATUS).find(([, value]) => value === status)
  return entry ? entry[0] : 'review'
}

export default CommentModerationService
export { moderationActionForStatus }
