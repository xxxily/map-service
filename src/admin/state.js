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
  visits: null,
  visitsLoading: false,
  visitsError: '',
  settings: null,
  providers: [],
  tasks: [],
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
