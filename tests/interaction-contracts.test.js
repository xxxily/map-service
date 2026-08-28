import test from 'node:test'
import assert from 'node:assert/strict'

import {
  INTERACTION_TEXT_LIMITS,
  normalizeInteractionText,
  normalizeContact,
  normalizeCommentInput,
  normalizeInteractionCursor,
  normalizeIdempotencyKey,
  normalizeReportInput,
  validateInteractionResourceScope,
  serializePublicComment,
} from '../shared/interaction-contracts.js'

test('interaction text normalizes Unicode and rejects controls, scripts and overflow', () => {
  assert.equal(normalizeInteractionText('  ＡＢＣ\r\n地图  '), 'ABC\n地图')
  assert.throws(() => normalizeInteractionText('a\u0000b'), /控制字符/)
  assert.throws(() => normalizeInteractionText('<script>alert(1)</script>'), /不支持 HTML|脚本/)
  assert.throws(() => normalizeInteractionText('<b>粗体</b>'), /不支持 HTML/)
  assert.throws(() => normalizeInteractionText('a'.repeat(INTERACTION_TEXT_LIMITS.body + 1)), /不能超过/)
  assert.throws(() => normalizeInteractionText(''), /不能为空/)
})

test('copyright reports require identity, contact and an explicit rights attestation', () => {
  const report = normalizeReportInput({
    type: 'copyright_takedown',
    resourceRef: {
      sharePublicId: 'shr_public_demo',
      shareItemId: 'shi_demo',
      featureId: 'feature_demo',
      mediaId: 'media_demo',
      scope: 'media',
    },
    description: '该图片疑似未经授权使用我的作品。',
    displayName: '权利人',
    email: 'rightsholder@example.com',
    rightsAttestation: true,
    consent: true,
    clientRequestId: 'req_report_demo',
  }, { consentPolicyVersion: 7 })
  assert.equal(report.rightsAttestation, true)
  assert.equal(report.email, 'rightsholder@example.com')
  assert.equal(report.consentPolicyVersion, 7)
  assert.throws(() => normalizeReportInput({
    type: 'copyright_takedown',
    resourceRef: report.resourceRef,
    description: '请求下架',
    displayName: '权利人',
    email: 'rightsholder@example.com',
    consent: true,
  }, { consentPolicyVersion: 7 }), /确认权利声明/)
  assert.throws(() => normalizeReportInput({
    type: 'copyright_takedown',
    resourceRef: {
      sharePublicId: 'shr_public_demo',
      shareItemId: 'shi_demo',
      featureId: 'feature_demo',
      mediaId: 'media_demo',
      scope: 'media',
    },
    description: '请求下架',
    displayName: '权利人',
    email: 'rightsholder@example.com',
    rightsAttestation: true,
    evidenceText: false,
    consent: true,
  }, { consentPolicyVersion: 7 }), /证据说明.*必须是字符串/)
  assert.throws(() => normalizeReportInput({
    type: 'copyright_takedown',
    resourceRef: report.resourceRef,
    description: '请求下架',
    displayName: '权利人',
    email: 'rightsholder@example.com',
    rightsAttestation: true,
    consent: true,
  }), error => error?.code === 'CONSENT_POLICY_VERSION_INVALID')
})

test('contact normalization requires configured contact fields and returns no plaintext hash', () => {
  assert.deepEqual(normalizeContact({ email: ' User@Example.COM ' }), {
    email: 'user@example.com',
    phone: '',
    type: 'email',
  })
  assert.deepEqual(normalizeContact({ phone: '+86 138-0013-8000' }), {
    email: '',
    phone: '+8613800138000',
    type: 'phone',
  })
  assert.deepEqual(normalizeContact({ email: 'a@example.com', phone: '+8613800138000' }), {
    email: 'a@example.com',
    phone: '+8613800138000',
    type: 'email_and_phone',
  })
  assert.throws(() => normalizeContact({}), /至少填写一个联系方式/)
  assert.throws(() => normalizeContact({ email: 'a@example.com' }, { requirement: 'email_and_phone' }), /同时填写/)
  assert.throws(() => normalizeContact({ email: 'not-an-email' }), /邮箱格式不正确/)
})

test('cursor and idempotency keys are bounded opaque values', () => {
  assert.equal(normalizeInteractionCursor(' cursor_abc-123 '), 'cursor_abc-123')
  assert.equal(normalizeIdempotencyKey(' req_mobile-1 '), 'req_mobile-1')
  assert.equal(normalizeInteractionCursor(''), '')
  assert.throws(() => normalizeInteractionCursor('not a cursor'), /游标格式不合法/)
  assert.throws(() => normalizeIdempotencyKey('a'.repeat(130)), /幂等键长度/)
})

test('resource scope validation delegates stable resource identity rules', () => {
  const valid = validateInteractionResourceScope({
    sharePublicId: 'shr_public_demo',
    shareItemId: 'shi_demo',
    featureId: 'feature_demo',
    scope: 'feature',
  }, ['feature'])
  assert.equal(valid.valid, true)
  assert.equal(valid.resourceRef.siteId, 'map-service')
  assert.equal(validateInteractionResourceScope({
    sharePublicId: 'shr_public_demo',
    shareItemId: 'shi_demo',
    featureId: 'feature_demo',
    mediaId: 'media_demo',
    scope: 'media',
  }, ['feature']).valid, false)
})

test('comment input enforces anonymous identity, consent and bounded parent IDs', () => {
  const input = normalizeCommentInput({
    resourceRef: {
      sharePublicId: 'shr_public_demo',
      shareItemId: 'shi_demo',
      featureId: 'feature_demo',
      scope: 'feature',
    },
    body: '  路线已更新  ',
    displayName: '访客用户',
    email: 'visitor@example.com',
    parentId: 'cmt_parent-1',
    consent: true,
    clientRequestId: 'req_comment_demo',
  }, { consentPolicyVersion: 9 })
  assert.equal(input.body, '路线已更新')
  assert.equal(input.parentId, 'cmt_parent-1')
  assert.equal(input.consentPolicyVersion, 9)
  assert.throws(() => normalizeCommentInput({
    resourceRef: input.resourceRef,
    body: '内容',
    email: 'visitor@example.com',
    consent: true,
  }), /显示名/)
  assert.throws(() => normalizeCommentInput({
    ...input,
    parentId: 'comment-not-opaque',
    consent: true,
  }, { consentPolicyVersion: 9 }), /父留言 ID/)
  assert.throws(() => normalizeCommentInput({
    resourceRef: input.resourceRef,
    body: '内容',
    displayName: '访客用户',
    email: 'visitor@example.com',
    consent: true,
  }), error => error?.code === 'CONSENT_POLICY_VERSION_INVALID')
})

test('public comment serializer removes PII and internal moderation fields', () => {
  assert.deepEqual(serializePublicComment({
    id: 'cmt_demo',
    display_name_snapshot: '访客',
    avatar_snapshot: 'data:image/png;base64,AAAA',
    gender_snapshot: 'female',
    body_normalized: '公开内容',
    body_rendered: '<script>不可信渲染结果</script>',
    created_at: '2026-08-23T00:00:00.000Z',
    content_status: 'active',
    moderation_status: 'approved',
    email: 'secret@example.com',
    contact_ciphertext: 'cipher',
    body_raw_encrypted: 'cipher',
    moderation_level: 'normal',
    author_user_id: 'usr_secret',
  }), {
    id: 'cmt_demo',
    displayName: '访客',
    avatar: 'data:image/png;base64,AAAA',
    gender: 'female',
    body: '公开内容',
    createdAt: '2026-08-23T00:00:00.000Z',
    replies: [],
  })
  assert.equal(serializePublicComment({
    id: 'cmt_unsafe_name',
    display_name_snapshot: '<img src=x onerror=alert(1)>',
    body_normalized: '公开内容',
    created_at: '2026-08-23T00:00:00.000Z',
    content_status: 'active',
    moderation_status: 'approved',
  }), null)
  assert.equal(serializePublicComment({
    id: 'cmt_unsafe_body',
    display_name_snapshot: '访客',
    body_normalized: '<script>alert(1)</script>',
    created_at: '2026-08-23T00:00:00.000Z',
    content_status: 'active',
    moderation_status: 'approved',
  }), null)
  const malformedProfile = serializePublicComment({
    id: 'cmt_bad_profile',
    display_name_snapshot: '访客',
    avatar_snapshot: 'javascript:alert(1)',
    gender_snapshot: 'not-a-gender',
    body_normalized: '公开内容',
    created_at: '2026-08-23T00:00:00.000Z',
    content_status: 'active',
    moderation_status: 'approved',
  })
  assert.equal(malformedProfile.avatar, '')
  assert.equal(malformedProfile.gender, '')
})
