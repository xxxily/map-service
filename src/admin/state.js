export const ADMIN_TABS = [
  { id: 'overview', label: '概览' },
  { id: 'cache', label: '缓存' },
  { id: 'precache', label: '预缓存' },
  { id: 'layers', label: '图层' },
  { id: 'settings', label: '设置' },
]

export const adminState = {
  root: null,
  activeTab: 'overview',
  loading: false,
  message: '',
  error: '',
  session: null,
  system: null,
  cache: null,
  visits: null,
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
    refresh: false,
  },
  precacheEstimate: null,
  precacheEstimateStatus: '',
  precacheEstimateError: '',
  amapLoader: null,
  AMap: null,
  map: null,
  rectangle: null,
}

export function setNotice (message = '', error = '') {
  adminState.message = message
  adminState.error = error
}

export function setActiveTab (tabId) {
  if (ADMIN_TABS.some(tab => tab.id === tabId)) {
    adminState.activeTab = tabId
  }
}
