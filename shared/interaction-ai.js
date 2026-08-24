/**
 * Closed contract shared by the AI adapter and moderation audit layer.
 * No provider or network code belongs in this module.
 */
export const AI_PROMPT_VERSION = 'interaction-moderation-v1'
export const AI_SCORE_KEYS = Object.freeze(['spam', 'toxicity', 'violence', 'sexual', 'illegalOrIp', 'privacy'])
export const AI_REASON_CODES = Object.freeze([
  'SPAM', 'TOXICITY', 'VIOLENCE', 'SEXUAL_CONTENT', 'ILLEGAL_OR_IP', 'PRIVACY',
  'COPYRIGHT', 'SCAM', 'PROMPT_INJECTION', 'LOW_CONFIDENCE', 'AI_UNAVAILABLE',
  'AI_TIMEOUT', 'AI_NOT_CONFIGURED', 'AI_SCHEMA_INVALID',
])

const LEVELS = new Set(['normal', 'risk', 'violation', 'illegal_or_ip', 'spam', 'unknown'])
const ACTIONS = new Set(['approve', 'review', 'reject', 'quarantine', 'spam'])
const SCORE_KEY_SET = new Set(AI_SCORE_KEYS)
const REASON_CODE_SET = new Set(AI_REASON_CODES)
const PII_KEY = /(email|phone|contact|address|ip|user.?id|internal.?id|session|cookie|ua|user.?agent|token|password|secret|authorization|raw.?text|credential)/iu
const MAX_POLICY_VERSION = 64

export function redactPii (value) {
  if (Array.isArray(value)) return value.map(redactPii)
  if (!value || typeof value !== 'object') return value
  const result = {}
  for (const [key, item] of Object.entries(value)) result[key] = PII_KEY.test(key) ? '[REDACTED]' : redactPii(item)
  return result
}

const EMAIL_TEXT_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu
const PHONE_TEXT_PATTERN = /(?<![A-Za-z0-9])(?:\+?\d[\d\s().-]{6,}\d)(?![A-Za-z0-9])/gu
const IPV4_TEXT_PATTERN = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/gu
const IPV6_TEXT_PATTERN = /(?<![A-F0-9:])(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{0,4}(?![A-F0-9:])/giu
const INTERNAL_ID_PATTERN = /\b(?:usr|user|ses|session|cmt|rpt|shi|shr)_[A-Z0-9_-]{4,}\b/giu
const SECRET_ASSIGNMENT_PATTERN = /((?:bearer|token|session(?:\s+id)?|user(?:\s+id)?|internal(?:\s+id)?|authorization|cookie|ua|user-agent|password|secret)\s*[:=]\s*)([^\s,;]+)/giu

/** Redact sensitive values embedded in the actual comment body. */
export function redactPiiText (value) {
  let text = String(value ?? '')
  text = text.replace(SECRET_ASSIGNMENT_PATTERN, '$1[REDACTED]')
  text = text.replace(EMAIL_TEXT_PATTERN, '[REDACTED_EMAIL]')
  text = text.replace(IPV4_TEXT_PATTERN, '[REDACTED_IP]')
  text = text.replace(IPV6_TEXT_PATTERN, '[REDACTED_IP]')
  text = text.replace(INTERNAL_ID_PATTERN, '[REDACTED_ID]')
  text = text.replace(PHONE_TEXT_PATTERN, match => match.length >= 7 ? '[REDACTED_PHONE]' : match)
  return text
}

/** Only this allowlisted shape may cross a provider boundary. */
export function buildAiPayload (input = {}) {
  const context = input.context && typeof input.context === 'object' && !Array.isArray(input.context) ? input.context : {}
  const safeContext = {}
  for (const key of ['language', 'resourceType', 'hasMedia', 'featureCategory']) {
    const value = context[key]
    if (typeof value === 'string' && value.length <= 80) safeContext[key] = value
    else if (typeof value === 'boolean') safeContext[key] = value
  }
  return {
    body: redactPiiText(String(input.body || '')).slice(0, 20_000),
    context: safeContext,
    promptVersion: String(input.promptVersion || AI_PROMPT_VERSION).slice(0, MAX_POLICY_VERSION),
  }
}

function assertObject (value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是 JSON 对象`)
}

function validateScores (scores) {
  assertObject(scores, 'AI 响应 scores')
  const keys = Object.keys(scores)
  if (keys.length !== AI_SCORE_KEYS.length || keys.some(key => !SCORE_KEY_SET.has(key))) throw new Error('AI 响应 scores 分类不完整或包含未知字段')
  for (const key of AI_SCORE_KEYS) {
    const value = scores[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('AI 响应 scores 必须是 0 到 1 之间的有限数字')
  }
}

export function validateAiDecision (input) {
  assertObject(input, 'AI 响应')
  const expected = new Set(['level', 'scores', 'confidence', 'reasonCodes', 'suggestedAction', 'policyVersion'])
  const unknown = Object.keys(input).filter(key => !expected.has(key))
  if (unknown.length) throw new Error(`AI 响应包含未知字段：${unknown.join(',')}`)
  if (!LEVELS.has(input.level) || !ACTIONS.has(input.suggestedAction)) throw new Error('AI 响应枚举值不合法')
  validateScores(input.scores)
  if (typeof input.confidence !== 'number' || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) throw new Error('AI 响应 confidence 不符合契约')
  if (typeof input.policyVersion !== 'string' || !input.policyVersion.trim() || input.policyVersion.length > MAX_POLICY_VERSION) throw new Error('AI 响应 policyVersion 不符合契约')
  if (!Array.isArray(input.reasonCodes) || input.reasonCodes.length > 8 || input.reasonCodes.some(code => typeof code !== 'string' || !REASON_CODE_SET.has(code))) throw new Error('AI 响应 reasonCodes 不符合受控枚举契约')
  if (input.level === 'illegal_or_ip' && !['review', 'quarantine'].includes(input.suggestedAction)) throw new Error('illegal_or_ip 只能进入人工复核或隔离')
  if (input.level === 'unknown' && input.suggestedAction !== 'review') throw new Error('unknown 只能进入人工复核')
  return {
    level: input.level,
    scores: Object.fromEntries(AI_SCORE_KEYS.map(key => [key, input.scores[key]])),
    confidence: input.confidence,
    reasonCodes: [...input.reasonCodes],
    suggestedAction: input.confidence < 0.85 && input.suggestedAction === 'approve' ? 'review' : input.suggestedAction,
    policyVersion: input.policyVersion,
  }
}

export function emptyAiScores () {
  return Object.fromEntries(AI_SCORE_KEYS.map(key => [key, 0]))
}

export function failClosedDecision (reason = 'AI_UNAVAILABLE', policyVersion = AI_PROMPT_VERSION) {
  return {
    level: 'unknown',
    scores: emptyAiScores(),
    confidence: 0,
    reasonCodes: [REASON_CODE_SET.has(reason) ? reason : 'AI_UNAVAILABLE'],
    suggestedAction: 'review',
    policyVersion: String(policyVersion || AI_PROMPT_VERSION).slice(0, MAX_POLICY_VERSION),
  }
}
