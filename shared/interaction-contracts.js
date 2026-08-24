/**
 * Pure input and serialization contracts for the interaction domain.
 * No database, framework, or secret state belongs in this module.
 */

import {
  isPublicComment,
  isValidAnonymousContactRequirement,
  isValidReportTargetScope,
  isValidReportType,
} from './interaction-policy.js'
import { normalizeResourceRef } from './interaction-resource-ref.js'

export const INTERACTION_TEXT_LIMITS = Object.freeze({
  body: 2000,
  displayName: 64,
  reportDescription: 4000,
  evidenceText: 8000,
  cursor: 256,
  idempotencyKey: 128,
})

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
const HTML_OR_SCRIPT = /<\/?(?:script|style|iframe|object|embed|form|svg)(?:\s|>|\/)/iu
const HTML_TAG = /<\/?[A-Za-z][^>\n]*>/u
const EVENT_ATTRIBUTE = /\bon[a-z][\w-]*\s*=/iu
const DANGEROUS_SCHEME = /(?:^|[\s"'(])(?:javascript|data|file):/iu
const OVERLONG_LINK = /https?:\/\/\S{2049,}/iu
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u
const PHONE_PATTERN = /^\+?[0-9]{7,32}$/u
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,256}$/u
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const COMMENT_ID_PATTERN = /^cmt_[A-Za-z0-9_-]{1,128}$/u
const COMMENT_AUTHOR_TYPES = new Set(['user', 'anonymous', 'admin'])

function invalid (message, code = 'VALIDATION_FAILED') {
  const error = new Error(message)
  error.code = code
  return error
}

function asString (value, field) {
  if (typeof value !== 'string') throw invalid(`${field} 必须是字符串`)
  return value
}

function assertSafeText (value, field) {
  if (CONTROL_CHARACTERS.test(value)) throw invalid(`${field} 包含不允许的控制字符`, 'UNSAFE_TEXT')
  if (HTML_OR_SCRIPT.test(value) || HTML_TAG.test(value) || EVENT_ATTRIBUTE.test(value)) {
    throw invalid(`${field} 不支持 HTML 或脚本内容`, 'UNSAFE_TEXT')
  }
  if (DANGEROUS_SCHEME.test(value)) throw invalid(`${field} 包含不安全链接协议`, 'UNSAFE_TEXT')
  if (OVERLONG_LINK.test(value)) throw invalid(`${field} 包含过长链接`, 'CONTENT_TOO_LARGE')
}

export function normalizeInteractionText (value, options = {}) {
  const field = options.field || '文本'
  const normalized = asString(value, field)
    .normalize('NFKC')
    .replace(/\r\n?/gu, '\n')
    .trim()
  if (!normalized && options.allowEmpty !== true) throw invalid(`${field} 不能为空`)
  assertSafeText(normalized, field)
  const maxLength = Number.isSafeInteger(options.maxLength)
    ? options.maxLength
    : INTERACTION_TEXT_LIMITS.body
  if (Array.from(normalized).length > maxLength) {
    throw invalid(`${field} 不能超过 ${maxLength} 个字符`, 'CONTENT_TOO_LARGE')
  }
  return normalized
}

export function normalizeDisplayName (value, options = {}) {
  const normalized = normalizeInteractionText(value, {
    field: options.field || '显示名',
    maxLength: INTERACTION_TEXT_LIMITS.displayName,
    allowEmpty: options.allowEmpty === true,
  }).replace(/\s+/gu, ' ')
  if (normalized && options.minLength && Array.from(normalized).length < options.minLength) {
    throw invalid(`${options.field || '显示名'} 至少需要 ${options.minLength} 个字符`)
  }
  return normalized
}

export function normalizeEmail (value, options = {}) {
  const email = asString(value, options.field || '邮箱').normalize('NFKC').trim().toLowerCase()
  if (!email && options.allowEmpty === true) return ''
  if (!EMAIL_PATTERN.test(email) || Array.from(email).length > 254) {
    throw invalid('邮箱格式不正确')
  }
  return email
}

export function normalizePhone (value, options = {}) {
  const raw = asString(value, options.field || '手机').normalize('NFKC').trim()
  if (!raw && options.allowEmpty === true) return ''
  const phone = raw.replace(/[\s().-]/gu, '')
  if (!PHONE_PATTERN.test(phone)) throw invalid('手机号格式不正确')
  return phone
}

export function normalizeContact (input = {}, options = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const email = normalizeEmail(source.email ?? '', { allowEmpty: true })
  const phone = normalizePhone(source.phone ?? '', { allowEmpty: true })
  const requirement = options.requirement || (options.allowEmpty === true ? 'optional' : 'email_or_phone')
  if (requirement !== 'optional' && !isValidAnonymousContactRequirement(requirement)) {
    throw invalid('联系方式要求配置不合法', 'CONTACT_REQUIREMENT_INVALID')
  }
  if (requirement === 'email' && !email) throw invalid('必须填写邮箱', 'EMAIL_REQUIRED')
  if (requirement === 'phone' && !phone) throw invalid('必须填写手机号', 'PHONE_REQUIRED')
  if (requirement === 'email_or_phone' && !email && !phone) {
    throw invalid('至少填写一个联系方式', 'CONTACT_REQUIRED')
  }
  if (requirement === 'email_and_phone' && (!email || !phone)) {
    throw invalid('必须同时填写邮箱和手机号', 'CONTACT_REQUIRED')
  }
  return {
    email,
    phone,
    type: email && phone ? 'email_and_phone' : email ? 'email' : phone ? 'phone' : '',
  }
}

export function normalizeInteractionCursor (value, options = {}) {
  if (value == null || value === '') return ''
  const cursor = asString(value, '游标').normalize('NFKC').trim()
  const maxLength = Number.isSafeInteger(options.maxLength) ? options.maxLength : INTERACTION_TEXT_LIMITS.cursor
  if (cursor.length > maxLength || !CURSOR_PATTERN.test(cursor)) throw invalid('游标格式不合法', 'CURSOR_INVALID')
  return cursor
}

export function normalizeIdempotencyKey (value, options = {}) {
  if (value == null || value === '') return ''
  const key = asString(value, '幂等键').normalize('NFKC').trim()
  const maxLength = Number.isSafeInteger(options.maxLength) ? options.maxLength : INTERACTION_TEXT_LIMITS.idempotencyKey
  if (key.length > maxLength) throw invalid(`幂等键长度不能超过 ${maxLength} 个字符`, 'IDEMPOTENCY_KEY_TOO_LONG')
  if (!IDEMPOTENCY_PATTERN.test(key)) throw invalid('幂等键格式不合法', 'IDEMPOTENCY_KEY_INVALID')
  return key
}

export function validateInteractionResourceScope (input, allowedScopes = ['feature', 'media', 'share']) {
  const normalized = normalizeResourceRef(input)
  const issues = [...normalized.issues]
  if (normalized.valid && !allowedScopes.includes(normalized.resourceRef.scope)) {
    issues.push({
      code: 'SCOPE_NOT_ALLOWED',
      path: 'scope',
      message: `当前操作不支持 ${normalized.resourceRef.scope} 范围`,
    })
  }
  return {
    valid: issues.length === 0,
    resourceRef: normalized.resourceRef,
    issues,
  }
}

export function normalizeCommentInput (input = {}, options = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const authorType = options.authorType || 'anonymous'
  if (!COMMENT_AUTHOR_TYPES.has(authorType)) throw invalid('留言作者类型不合法', 'AUTHOR_TYPE_INVALID')
  const body = normalizeInteractionText(source.body, { field: '留言内容', maxLength: options.maxLength || INTERACTION_TEXT_LIMITS.body })
  const displayName = source.displayName == null
    ? ''
    : normalizeDisplayName(source.displayName, { allowEmpty: true, minLength: 2 })
  if (authorType === 'anonymous' && !displayName) throw invalid('匿名留言必须填写显示名', 'DISPLAY_NAME_REQUIRED')
  const contact = normalizeContact(source, {
    requirement: authorType === 'anonymous'
      ? (options.contactRequirement || 'email_or_phone')
      : 'optional',
  })
  const clientRequestId = normalizeIdempotencyKey(source.clientRequestId)
  const resource = validateInteractionResourceScope(source.resourceRef, ['feature'])
  if (!resource.valid) throw invalid(resource.issues[0]?.message || '资源引用不合法', resource.issues[0]?.code)
  if (source.consent !== true) throw invalid('必须同意留言规则和隐私说明', 'CONSENT_REQUIRED')
  const consentPolicyVersion = normalizePolicyVersion(options.consentPolicyVersion)
  const parentId = source.parentId == null || source.parentId === ''
    ? ''
    : asString(source.parentId, '父留言 ID').normalize('NFKC').trim()
  if (parentId && !COMMENT_ID_PATTERN.test(parentId)) throw invalid('父留言 ID 格式不合法', 'PARENT_ID_INVALID')
  return { body, displayName, ...contact, clientRequestId, resourceRef: resource.resourceRef, parentId, consentPolicyVersion }
}

export function normalizeReportInput (input = {}, options = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const resource = validateInteractionResourceScope(source.resourceRef, ['share', 'feature', 'media'])
  if (!resource.valid) throw invalid(resource.issues[0]?.message || '资源引用不合法', resource.issues[0]?.code)
  const type = typeof source.type === 'string' ? source.type.normalize('NFKC').trim().toLowerCase() : ''
  if (!isValidReportType(type)) throw invalid('举报类型不合法', 'REPORT_TYPE_INVALID')
  const description = normalizeInteractionText(source.description, {
    field: '举报说明', maxLength: INTERACTION_TEXT_LIMITS.reportDescription,
  })
  const evidenceText = normalizeInteractionText(source.evidenceText ?? '', {
    field: '证据说明', maxLength: INTERACTION_TEXT_LIMITS.evidenceText, allowEmpty: true,
  })
  const displayName = source.displayName == null
    ? ''
    : normalizeDisplayName(source.displayName, { allowEmpty: true })
  const rightsAttestation = source.rightsAttestation === true
  const contact = normalizeContact(source, { allowEmpty: options.allowContactEmpty !== false })
  if (source.consent !== true) throw invalid('必须同意举报处理说明和隐私政策', 'CONSENT_REQUIRED')
  const consentPolicyVersion = normalizePolicyVersion(options.consentPolicyVersion)
  if (type === 'copyright_takedown') {
    if (!displayName) throw invalid('侵权下架举报必须填写权利人或代理人名称', 'DISPLAY_NAME_REQUIRED')
    if (!contact.type) throw invalid('侵权下架举报必须填写联系方式', 'CONTACT_REQUIRED')
    if (!rightsAttestation) throw invalid('侵权下架举报必须确认权利声明', 'RIGHTS_ATTESTATION_REQUIRED')
  }
  return {
    type,
    description,
    evidenceText,
    rightsAttestation,
    displayName,
    // `normalizeContact` also returns `type`; map contact fields explicitly so
    // it cannot overwrite the report's own `type` (for example, with `email`).
    email: contact.email,
    phone: contact.phone,
    contactType: contact.type,
    clientRequestId: normalizeIdempotencyKey(source.clientRequestId),
    resourceRef: resource.resourceRef,
    consentPolicyVersion,
  }
}

function normalizePolicyVersion (value) {
  if (value == null) throw invalid('服务端必须提供当前同意规则版本', 'CONSENT_POLICY_VERSION_INVALID')
  const version = value
  if (!Number.isSafeInteger(version) || version < 1) throw invalid('同意规则版本不合法', 'CONSENT_POLICY_VERSION_INVALID')
  return version
}

function publicCommentFields (row) {
  if (!row || !isPublicComment({ contentStatus: row.content_status, moderationStatus: row.moderation_status })) return null
  let displayName
  let body
  try {
    displayName = normalizeDisplayName(row.display_name_snapshot || '', { allowEmpty: true }) || '匿名用户'
    body = normalizeInteractionText(row.body_normalized || '', {
      field: '公开留言',
      maxLength: INTERACTION_TEXT_LIMITS.body,
    })
  } catch {
    return null
  }
  return {
    id: row.id,
    displayName,
    body,
    createdAt: row.created_at,
    replies: [],
  }
}

export function serializePublicComment (row, options = {}) {
  const result = publicCommentFields(row)
  if (!result) return null
  if (Array.isArray(options.replies)) {
    result.replies = options.replies.map(publicCommentFields).filter(Boolean)
  }
  return result
}

export function serializePublicComments (rows = [], options = {}) {
  return rows.map(row => serializePublicComment(row, options)).filter(Boolean)
}

export function isReportResourceScopeAllowed (scope) {
  return isValidReportTargetScope(scope)
}
