/**
 * Shared, side-effect-free contract for comments, moderation and reports.
 * Keep this module free of service/database dependencies so API and workers
 * can use the same values when the components are split into processes.
 */

function deepFreeze (value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

export const COMMENT_CONTENT_STATUSES = Object.freeze([
  'active',
  'hidden',
  'deleted',
])

export const COMMENT_MODERATION_STATUSES = Object.freeze([
  'pending',
  'approved',
  'rejected',
  'quarantined',
  'spam',
  'orphaned',
])

export const COMMENT_CONTENT_TRANSITIONS = deepFreeze({
  active: ['hidden', 'deleted'],
  hidden: ['active', 'deleted'],
  deleted: [],
})

export const COMMENT_MODERATION_TRANSITIONS = deepFreeze({
  pending: ['approved', 'rejected', 'quarantined', 'spam', 'orphaned'],
  approved: ['rejected', 'quarantined', 'spam', 'orphaned'],
  rejected: ['pending', 'approved', 'quarantined', 'orphaned'],
  quarantined: ['pending', 'approved', 'rejected', 'spam', 'orphaned'],
  spam: ['pending', 'rejected', 'orphaned'],
  orphaned: ['pending'],
})

export const MODERATION_LEVELS = Object.freeze([
  'normal',
  'risk',
  'violation',
  'illegal_or_ip',
  'spam',
  'unknown',
])

export const MODERATION_ACTIONS = Object.freeze([
  'approve',
  'review',
  'reject',
  'quarantine',
  'spam',
])

// This is deliberately fail-closed: only an explicitly approved normal result
// is automatically visible. Unknown/error results must always be reviewed.
export const DEFAULT_MODERATION_ACTIONS = deepFreeze({
  normal: 'approve',
  risk: 'review',
  violation: 'reject',
  illegal_or_ip: 'quarantine',
  spam: 'spam',
  unknown: 'review',
})

export const REPORT_TYPES = Object.freeze([
  'unsafe_content',
  'illegal_content',
  'copyright_takedown',
  'privacy',
  'misleading',
  'other',
])

export const REPORT_TARGET_SCOPES = Object.freeze(['share', 'feature', 'media'])

export const REPORT_STATUSES = Object.freeze([
  'new',
  'triaged',
  'investigating',
  'actioned',
  'dismissed',
  'duplicate',
  'closed',
])

export const REPORT_STATUS_TRANSITIONS = deepFreeze({
  new: ['triaged', 'investigating', 'actioned', 'duplicate', 'dismissed', 'closed'],
  triaged: ['investigating', 'actioned', 'dismissed', 'duplicate', 'closed'],
  investigating: ['actioned', 'dismissed', 'duplicate', 'closed'],
  actioned: ['investigating', 'closed'],
  dismissed: ['investigating', 'closed'],
  duplicate: ['investigating', 'closed'],
  closed: ['investigating'],
})

export const REPORT_ACTIONS = Object.freeze([
  'no_action',
  'mark_duplicate',
  'hide_comment',
  'hide_media',
  'block_share',
  'pause_share',
  'request_more_info',
  'escalate_legal',
])

export const ANONYMOUS_CONTACT_REQUIREMENTS = Object.freeze([
  'email',
  'phone',
  'email_or_phone',
  'email_and_phone',
])

export const DEFAULT_INTERACTION_RETENTION = deepFreeze({
  approvedCommentDays: 730,
  nonPublicCommentDays: 90,
  anonymousContactDays: 90,
  aiRawResultDays: 30,
  reportDays: 730,
})

export const DEFAULT_INTERACTION_POLICY = deepFreeze({
  comments: {
    enabled: true,
    anonymous: {
      enabled: false,
      contactRequirement: 'email_or_phone',
      requireConsent: true,
    },
    maxLength: 2000,
    moderationRequired: true,
    publicReplyEnabled: false,
    retention: DEFAULT_INTERACTION_RETENTION,
  },
  moderation: {
    levels: MODERATION_LEVELS,
    actions: DEFAULT_MODERATION_ACTIONS,
    autoApproveLevels: ['normal'],
    ai: { enabled: false },
    keywords: { enabled: true },
  },
  reports: {
    enabled: true,
    types: REPORT_TYPES,
    targetScopes: REPORT_TARGET_SCOPES,
  },
})

export function createDefaultInteractionPolicy () {
  return DEFAULT_INTERACTION_POLICY
}

export function isModerationActionAllowed (level, action) {
  return MODERATION_LEVELS.includes(level) && MODERATION_ACTIONS.includes(action)
}

export function resolveModerationAction (level, actions = DEFAULT_MODERATION_ACTIONS) {
  if (!MODERATION_LEVELS.includes(level)) return 'review'
  const action = actions?.[level]
  return isModerationActionAllowed(level, action) ? action : 'review'
}

export function isPublicComment ({ contentStatus, moderationStatus } = {}) {
  return contentStatus === 'active' && moderationStatus === 'approved'
}

export function isValidReportType (type) {
  return REPORT_TYPES.includes(type)
}

export function isValidReportTargetScope (scope) {
  return REPORT_TARGET_SCOPES.includes(scope)
}

export function isValidReportStatus (status) {
  return REPORT_STATUSES.includes(status)
}

export function isValidReportAction (action) {
  return REPORT_ACTIONS.includes(action)
}

export function isValidAnonymousContactRequirement (requirement) {
  return ANONYMOUS_CONTACT_REQUIREMENTS.includes(requirement)
}

function canTransition (transitions, from, to) {
  if (from === to) return true
  return Array.isArray(transitions[from]) && transitions[from].includes(to)
}

export function canTransitionCommentContent (from, to) {
  return canTransition(COMMENT_CONTENT_TRANSITIONS, from, to)
}

export function canTransitionCommentModeration (from, to) {
  return canTransition(COMMENT_MODERATION_TRANSITIONS, from, to)
}

export function canTransitionReportStatus (from, to) {
  return canTransition(REPORT_STATUS_TRANSITIONS, from, to)
}
