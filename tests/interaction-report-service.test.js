import assert from 'node:assert/strict'
import { test } from 'node:test'
import InteractionDatabase from '../service/bin/interaction/database.js'
import { InteractionPolicyStore } from '../service/bin/interaction/commentPolicy.js'
import ReportService from '../service/bin/interaction/reportService.js'
import { isInteractionCiphertext } from '../service/bin/interaction/security.js'

const SECRET = 'report-service-test-secret'
const NOW = '2026-08-23T08:00:00.000Z'
const RESOURCE = { canonicalShareId: 'share_1', sharePublicId: 'shr_public_abc', shareItemId: 'shi_1', featureId: 'feature_1', mediaId: 'media_1', scope: 'media', resourceRef: { siteId: 'map-service', sharePublicId: 'shr_public_abc', shareItemId: 'shi_1', featureId: 'feature_1', mediaId: 'media_1', scope: 'media' } }

function harness () {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  const policyStore = new InteractionPolicyStore({ database, now: () => NOW })
  policyStore.publish({ reports: { enabled: true, anonymous: { enabled: true } } }, { version: 1, now: NOW })
  return { database, service: new ReportService({ database, policyStore, secret: SECRET, now: () => NOW }) }
}

test('report retention is injected from service configuration', () => {
  const database = new InteractionDatabase({ filePath: ':memory:' })
  const policyStore = new InteractionPolicyStore({ database, now: () => NOW })
  policyStore.publish({ reports: { enabled: true, anonymous: { enabled: true } } }, { version: 1, now: NOW })
  const service = new ReportService({ database, policyStore, secret: SECRET, now: () => NOW, reportsDays: 1 })
  try {
    const report = service.submitReport({ resource: RESOURCE, clientKey: 'retention', body: { resourceRef: RESOURCE.resourceRef, type: 'privacy', description: '保留期测试', consent: true }, now: NOW }).report
    const expiresAt = Date.parse(report.retention_expires_at)
    assert.equal(expiresAt, Date.parse(NOW) + 86400000)
  } finally { database.close() }
})

test('report service encrypts evidence, merges duplicate submissions, and never uses moderation queues', () => {
  const { database, service } = harness()
  try {
    const body = { resourceRef: RESOURCE.resourceRef, type: 'illegal_content', description: '包含敏感词的违法内容证据', evidenceText: 'https://example.com/evidence 仅作为文本', displayName: '访客', email: 'visitor@example.com', consent: true, clientRequestId: 'report-request-1' }
    const first = service.submitReport({ resource: RESOURCE, body, clientKey: 'visitor-key', now: NOW })
    const replay = service.submitReport({ resource: RESOURCE, body, clientKey: 'visitor-key', now: NOW })
    assert.equal(first.replayed, false)
    assert.equal(replay.replayed, true)
    assert.equal(replay.report.id, first.report.id)
    const row = database.prepare('SELECT * FROM reports WHERE id = ?').get(first.report.id)
    assert.equal(isInteractionCiphertext(row.description_ciphertext), true)
    assert.equal(isInteractionCiphertext(row.evidence_text_ciphertext), true)
    assert.equal(row.description_ciphertext.includes('敏感词'), false)
    assert.equal(database.prepare('SELECT COUNT(*) count FROM comment_outbox').get().count, 0)
    assert.equal(database.prepare('SELECT COUNT(*) count FROM comment_moderation_decisions').get().count, 0)
    const merged = service.submitReport({ resource: RESOURCE, body: { ...body, clientRequestId: 'report-request-2' }, clientKey: 'visitor-key', now: NOW })
    assert.equal(merged.report.id, first.report.id)
    assert.equal(database.prepare("SELECT COUNT(*) count FROM report_events WHERE report_id = ? AND event_type = 'duplicate_received'").get(first.report.id).count, 1)
  } finally { database.close() }
})

test('copyright report requires rights/contact and admin projections redact reporter identity', () => {
  const { database, service } = harness()
  try {
    assert.throws(() => service.submitReport({ resource: RESOURCE, clientKey: 'v', body: { resourceRef: RESOURCE.resourceRef, type: 'copyright_takedown', description: '侵权', displayName: '权利人', consent: true } }), error => error.code === 'CONTACT_REQUIRED')
    const created = service.submitReport({ resource: RESOURCE, clientKey: 'v', body: { resourceRef: RESOURCE.resourceRef, type: 'copyright_takedown', description: '未经授权使用作品', displayName: '权利人', email: 'rights@example.com', rightsAttestation: true, consent: true } }).report
    const list = service.listForAdmin({}, {})
    assert.equal(list.items[0].contact, '')
    assert.equal(Object.hasOwn(list.items[0], 'description'), true)
    assert.equal(list.items[0].description, undefined)
    const detail = service.getForAdmin(created.id)
    assert.equal(detail.contact, 'r***@example.com')
    assert.equal(detail.description, '未经授权使用作品')
    assert.equal(JSON.stringify(detail).includes('rights@example.com'), false)
    assert.equal(Object.hasOwn(detail, 'reporterUserId'), false)
  } finally { database.close() }
})

test('report actions enforce transitions, duplicate linkage and audit events', () => {
  const { database, service } = harness()
  try {
    const make = request => service.submitReport({ resource: RESOURCE, clientKey: request, body: { resourceRef: RESOURCE.resourceRef, type: 'privacy', description: `隐私举报 ${request}`, email: `${request}@example.com`, consent: true, clientRequestId: request }, now: NOW }).report
    const original = make('req-original')
    const duplicate = make('req-duplicate')
    const actor = { user: { id: 'usr_admin' } }
    const result = service.action(actor, duplicate.id, { action: 'mark_duplicate', duplicateOf: original.id, reason: '目标和证据一致' })
    assert.equal(result.status, 'duplicate')
    const row = database.prepare('SELECT status, duplicate_of FROM reports WHERE id = ?').get(duplicate.id)
    assert.equal(row.status, 'duplicate')
    assert.equal(row.duplicate_of, original.id)
    assert.equal(database.prepare("SELECT COUNT(*) count FROM report_events WHERE report_id = ? AND action = 'mark_duplicate'").get(duplicate.id).count, 1)
    assert.throws(() => service.action(actor, original.id, { action: 'hide_media', reason: '尚未接入' }), error => error.code === 'VALIDATION_FAILED')

    const governance = make('req-governance')
    let applied = null
    const actioned = service.action(actor, governance.id, {
      action: 'pause_share',
      reason: '先暂停分享等待复核',
      beforeApply: input => { applied = input },
    })
    assert.equal(actioned.status, 'actioned')
    assert.equal(applied.action, 'pause_share')
    assert.equal(applied.report.id, governance.id)

    const followUp = make('req-follow-up')
    const investigating = service.action(actor, followUp.id, {
      action: 'request_more_info',
      reason: '需要举报人补充证据',
    })
    assert.equal(investigating.status, 'investigating')
  } finally { database.close() }
})
