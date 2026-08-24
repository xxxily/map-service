import { normalizeReportInput } from '../../../shared/interaction-contracts.js'
import { canTransitionReportStatus } from '../../../shared/interaction-policy.js'
import { interactionHttpError, isUniqueConstraintError } from './commentPolicy.js'
import { encryptInteractionSecret, hashInteractionContacts, hashInteractionValue, decryptInteractionSecret } from './security.js'
import { randomUUID } from 'node:crypto'

const REPORT_ACTIONS = new Set(['no_action', 'mark_duplicate', 'hide_comment', 'hide_media', 'block_share', 'pause_share', 'request_more_info', 'escalate_legal'])

function actorId (actor) { return actor?.user?.id || actor?.id || '' }
function id () { return `rpt_${randomUUID().replaceAll('-', '')}` }
function eventId () { return `rpe_${randomUUID().replaceAll('-', '')}` }
function contactMask (value) {
  if (!value) return ''
  if (value.includes('@')) { const [name, domain] = value.split('@'); return `${name.slice(0, 1)}***@${domain}` }
  return `${value.slice(0, 3)}***${value.slice(-2)}`
}
function parseJson (value, fallback = {}) { try { return JSON.parse(value || '') } catch { return fallback } }

export class ReportService {
  constructor (options = {}) {
    if (!options.database || !options.policyStore || !options.secret) throw new Error('ReportService 配置不完整')
    this.database = options.database
    this.policyStore = options.policyStore
    this.secret = options.secret
    this.now = options.now || (() => new Date().toISOString())
    const reportsDays = Number(options.reportsDays)
    this.reportsDays = Number.isFinite(reportsDays) && reportsDays > 0 ? Math.floor(reportsDays) : 730
  }

  requirePolicy () {
    const active = this.policyStore.requireActivePolicy()
    if (active.policy?.reports?.enabled !== true) throw interactionHttpError('举报功能未开启', 'COMMENT_POLICY_BLOCKED')
    return active
  }

  submitReport (input = {}) {
    const { policy, version } = this.requirePolicy()
    const normalized = normalizeReportInput(input.body, { consentPolicyVersion: version, allowContactEmpty: true })
    const session = input.session
    const reporterType = session?.user?.id ? 'user' : 'anonymous'
    const reporterUserId = reporterType === 'user' ? String(session.user.id) : ''
    const contactHash = hashInteractionContacts(normalized, this.secret)
    const reporterKey = reporterType === 'user'
      ? hashInteractionValue(`user:${reporterUserId}`, this.secret, 'reporter')
      : hashInteractionValue(`anon:${contactHash || input.clientKey || ''}`, this.secret, 'reporter')
    if (reporterType === 'anonymous' && policy.reports?.anonymous?.enabled === false) throw interactionHttpError('匿名举报未开启，请先登录', 'AUTH_REQUIRED')
    if (reporterType === 'anonymous' && !contactHash && !input.clientKey) throw interactionHttpError('匿名举报缺少可用的提交标识', 'VALIDATION_FAILED')
    const ref = input.resource
    const bucket = String((input.now || this.now()).slice(0, 10))
    const dedupeKey = hashInteractionValue(`${ref.canonicalShareId}|${ref.scope}|${ref.shareItemId}|${ref.featureId}|${ref.mediaId}|${normalized.type}|${contactHash}|${bucket}`, this.secret, 'report-dedupe')
    const now = input.now || this.now()
    const existingByIdempotency = normalized.clientRequestId
      ? this.database.prepare('SELECT * FROM reports WHERE canonical_share_id = ? AND reporter_type = ? AND reporter_key = ? AND client_request_id = ?').get(ref.canonicalShareId, reporterType, reporterKey, normalized.clientRequestId)
      : null
    const existing = existingByIdempotency || this.database.prepare('SELECT * FROM reports WHERE dedupe_key = ?').get(dedupeKey)
    if (existing) {
      if (!existingByIdempotency) this.addEvent(existing.id, { eventType: 'duplicate_received', fromStatus: existing.status, toStatus: existing.status, actorUserId: reporterUserId, metadata: { reporterType, contactProvided: Boolean(contactHash) }, createdAt: now })
      return { report: existing, replayed: true }
    }
    const resourceSnapshot = JSON.stringify({ featureId: ref.featureId || '', mediaId: ref.mediaId || '', scope: ref.scope, title: input.resource.feature?.name || '' })
    const contact = [normalized.email, normalized.phone].filter(Boolean).join('|')
    const row = {
      id: id(), siteId: 'map-service', type: normalized.type, canonicalShareId: ref.canonicalShareId,
      sharePublicId: ref.sharePublicId, shareItemId: ref.shareItemId || '', featureId: ref.featureId || '', mediaId: ref.mediaId || '', scope: ref.scope,
      resourceSnapshot, reporterType, reporterUserId, reporterKey, displayName: normalized.displayName,
      contactCiphertext: encryptInteractionSecret(contact, this.secret, 'report-contact'), contactHash,
      descriptionCiphertext: encryptInteractionSecret(normalized.description, this.secret, 'report-description'),
      evidenceCiphertext: encryptInteractionSecret(normalized.evidenceText, this.secret, 'report-evidence'), rightsAttestation: normalized.rightsAttestation ? 1 : 0,
      consentPolicyVersion: version, clientRequestId: normalized.clientRequestId, dedupeKey, now,
    }
    try {
      this.database.transaction(() => {
        this.database.prepare(`INSERT INTO reports (id, site_id, report_type, canonical_share_id, share_public_id_snapshot, share_item_id, feature_id, media_id, scope, resource_snapshot_json, reporter_type, reporter_user_id, reporter_key, display_name_snapshot, contact_ciphertext, contact_hash, description_ciphertext, evidence_text_ciphertext, rights_attestation, consent_policy_version, status, priority, client_request_id, dedupe_key, retention_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'normal', ?, ?, ?, ?, ?)`)
          .run(row.id, row.siteId, row.type, row.canonicalShareId, row.sharePublicId, row.shareItemId, row.featureId, row.mediaId, row.scope, row.resourceSnapshot, row.reporterType, row.reporterUserId, row.reporterKey, row.displayName, row.contactCiphertext, row.contactHash, row.descriptionCiphertext, row.evidenceCiphertext, row.rightsAttestation, row.consentPolicyVersion, row.clientRequestId, row.dedupeKey, new Date(Date.parse(now) + this.reportsDays * 86400000).toISOString(), now, now)
        this.addEvent(row.id, { eventType: 'created', toStatus: 'new', actorUserId: reporterUserId, createdAt: now })
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const replay = this.database.prepare('SELECT * FROM reports WHERE dedupe_key = ? OR (canonical_share_id = ? AND reporter_type = ? AND reporter_key = ? AND client_request_id = ?)').get(dedupeKey, ref.canonicalShareId, reporterType, reporterKey, normalized.clientRequestId)
        if (replay) return { report: replay, replayed: true }
      }
      throw error
    }
    return { report: this.database.prepare('SELECT * FROM reports WHERE id = ?').get(row.id), replayed: false }
  }

  addEvent (reportId, input = {}) {
    this.database.prepare('INSERT INTO report_events (id, report_id, event_type, from_status, to_status, action, actor_user_id, reason, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(input.id || eventId(), reportId, input.eventType || 'updated', input.fromStatus || '', input.toStatus || '', input.action || '', input.actorUserId || '', input.reason || '', JSON.stringify(input.metadata || {}), input.createdAt || this.now())
  }

  project (row, options = {}) {
    if (!row) return null
    const contact = options.decrypt ? decryptInteractionSecret(row.contact_ciphertext, this.secret, 'report-contact') : ''
    return { id: row.id, type: row.report_type, canonicalShareId: row.canonical_share_id, sharePublicIdSnapshot: row.share_public_id_snapshot, resourceRef: { shareItemId: row.share_item_id, featureId: row.feature_id, mediaId: row.media_id, scope: row.scope }, reporterType: row.reporter_type, displayName: row.display_name_snapshot, contact: contactMask(contact), description: options.decrypt ? decryptInteractionSecret(row.description_ciphertext, this.secret, 'report-description') : undefined, evidenceText: options.decrypt ? decryptInteractionSecret(row.evidence_text_ciphertext, this.secret, 'report-evidence') : undefined, rightsAttestation: row.rights_attestation === 1, status: row.status, priority: row.priority, assignedTo: row.assigned_to || '', duplicateOf: row.duplicate_of || '', createdAt: row.created_at, updatedAt: row.updated_at, closedAt: row.closed_at || '', actionSummary: parseJson(row.action_summary_json) }
  }

  listForAdmin (filters = {}, options = {}) {
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20)); const page = Math.max(1, Number(options.page) || 1); const where = ['1=1']; const params = []
    for (const key of ['status', 'priority', 'canonicalShareId', 'scope', 'reportType']) { if (filters[key]) { where.push(`${key === 'reportType' ? 'report_type' : key === 'canonicalShareId' ? 'canonical_share_id' : key} = ?`); params.push(filters[key]) } }
    const clause = where.join(' AND '); const total = Number(this.database.prepare(`SELECT COUNT(*) count FROM reports WHERE ${clause}`).get(...params)?.count || 0)
    const rows = this.database.prepare(`SELECT * FROM reports WHERE ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit)
    return { total, page, limit, items: rows.map(row => this.project(row)) }
  }

  getForAdmin (id) {
    const row = this.database.prepare('SELECT * FROM reports WHERE id = ?').get(String(id || '')); if (!row) throw interactionHttpError('举报不存在', 'RESOURCE_NOT_FOUND')
    return { ...this.project(row, { decrypt: true }), events: this.database.prepare('SELECT event_type eventType, from_status fromStatus, to_status toStatus, action, actor_user_id actorUserId, reason, metadata_json metadata, created_at createdAt FROM report_events WHERE report_id = ? ORDER BY created_at ASC').all(row.id).map(event => ({ ...event, metadata: parseJson(event.metadata) })) }
  }

  action (actor, id, input = {}) {
    const row = this.database.prepare('SELECT * FROM reports WHERE id = ?').get(String(id || '')); if (!row) throw interactionHttpError('举报不存在', 'RESOURCE_NOT_FOUND')
    const action = String(input.action || ''); if (!REPORT_ACTIONS.has(action)) throw interactionHttpError('举报动作不合法', 'VALIDATION_FAILED')
    if (['hide_media', 'hide_comment'].includes(action)) throw interactionHttpError('目标动作尚未接入受控治理能力', 'VALIDATION_FAILED')
    const reason = String(input.reason || '').trim(); if (!reason) throw interactionHttpError('处理原因不能为空', 'VALIDATION_FAILED')
    let next = row.status
    if (action === 'mark_duplicate') { next = 'duplicate'; if (!input.duplicateOf) throw interactionHttpError('标记重复必须提供关联工单', 'VALIDATION_FAILED') }
    else if (action === 'no_action') next = 'dismissed'
    else if (action === 'escalate_legal' || action === 'request_more_info') next = 'investigating'
    else if (['block_share', 'pause_share'].includes(action)) next = 'actioned'
    if (!canTransitionReportStatus(row.status, next)) throw interactionHttpError('举报状态流转不合法', 'MODERATION_TRANSITION_INVALID')
    const now = this.now(); const summary = { action, reason, actorUserId: actorId(actor), affectedPublicContent: ['block_share', 'pause_share'].includes(action) }
    if (typeof input.beforeApply === 'function') input.beforeApply({ report: row, action, reason })
    this.database.transaction(() => { this.database.prepare('UPDATE reports SET status = ?, duplicate_of = COALESCE(?, duplicate_of), action_summary_json = ?, updated_at = ?, closed_at = ? WHERE id = ?').run(next, input.duplicateOf || null, JSON.stringify(summary), now, ['dismissed', 'duplicate', 'closed'].includes(next) ? now : null, row.id); this.addEvent(row.id, { eventType: 'action', fromStatus: row.status, toStatus: next, action, actorUserId: actorId(actor), reason, metadata: summary, createdAt: now }) })
    return { applied: true, status: next, action, reportId: row.id }
  }
}

export default ReportService
