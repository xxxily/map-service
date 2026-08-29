import { isAdminTab } from './routes.js'

export const adminState = {
  root: null,
  activeTab: 'overview',
  loading: false,
  message: '',
  error: '',
  session: null,
  system: null,
  cache: null,
  cacheLoading: false,
  cacheError: '',
  cacheTab: 'overview',
  cachePolicy: null,
  cacheKeyPolicies: { items: [], analyses: [] },
  cacheCleanupJobs: { items: [], page: 1, limit: 20, total: 0 },
  cacheCleanupPreview: null,
  cacheKeyAnalysis: null,
  cacheKeySourceId: '',
  cacheCleanupSourceId: '',
  visits: null,
  visitsLoading: false,
  visitsError: '',
  settings: null,
  userSystemSettings: null,
  userSystemSettingsTab: 'access',
  tasks: [],
  kmls: [],
  adminUsers: {
    items: [],
    page: 1,
    limit: 20,
    total: 0,
  },
  adminUserFilters: {
    search: '',
    status: '',
    role: '',
  },
  adminUsersTab: 'list',
  roles: [],
  moderatedShares: {
    items: [],
    page: 1,
    limit: 20,
    total: 0,
  },
  shareFilters: {
    search: '',
    status: '',
  },
  shareRuntimeMetrics: null,
  auditLogs: {
    items: [],
    page: 1,
    limit: 20,
    total: 0,
  },
  auditFilters: {
    action: '',
    targetType: '',
  },
  interactionComments: { items: [], page: 1, limit: 20, total: 0 },
  interactionReports: { items: [], page: 1, limit: 20, total: 0 },
  interactionCommentFilters: { moderationStatus: '', contentStatus: '', canonicalShareId: '', shareItemId: '', featureId: '' },
  interactionReportFilters: { status: '', reportType: '', priority: '', scope: '', canonicalShareId: '' },
  interactionPolicy: null,
  interactionAiSettings: null,
  interactionAiTab: 'runtime',
  interactionAiImpact: null,
  interactionAiPrompts: null,
  interactionKeywords: null,
  interactionKeywordPreview: null,
  interactionAiProviders: null,
  artalkStatus: null,
  interactionCommentDetail: null,
  interactionReportDetail: null,
  precacheForm: {
    providerId: '',
    bounds: {
      west: 113.24,
      south: 23.11,
      east: 113.29,
      north: 23.15,
    },
    minZoom: 12,
    maxZoom: 12,
    concurrency: 4,
    requestIntervalMs: 0,
    refresh: false,
  },
  precacheEstimate: null,
  precacheEstimateStatus: '',
  precacheEstimateError: '',
  expandedTaskIds: new Set(),
  amapLoader: null,
  AMap: null,
  map: null,
  rectangle: null,
  precacheMapHeight: 260,
}

let noticeListener = null

export function registerNoticeListener (listener) {
  noticeListener = listener
}

export function setNotice (message = '', error = '') {
  adminState.message = message
  adminState.error = error
  if (noticeListener) {
    noticeListener(message, error)
  }
}

export function setActiveTab (tabId) {
  if (isAdminTab(tabId)) {
    adminState.activeTab = tabId
  }
}
