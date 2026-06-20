import { renderOverviewPage } from './pages/overview.js'
import { handleCacheClick, renderCachePage } from './pages/cache.js'
import { initPrecacheMap, renderPrecachePage } from './pages/precache.js'
import { renderLayersPage } from './pages/layers.js'
import { handleSettingsSubmit, renderSettingsPage } from './pages/settings.js'
import {
  handlePrecacheChange,
  handlePrecacheClick,
  handlePrecacheSubmit,
  schedulePrecacheEstimate,
} from './pages/precache.js'

export const ADMIN_PAGES = [
  {
    id: 'overview',
    label: '概览',
    render: renderOverviewPage,
  },
  {
    id: 'cache',
    label: '缓存',
    render: renderCachePage,
    handleClick: handleCacheClick,
  },
  {
    id: 'precache',
    label: '预缓存',
    render: renderPrecachePage,
    afterRender: initPrecacheMap,
    afterEnter: schedulePrecacheEstimate,
    afterLoad: schedulePrecacheEstimate,
    handleSubmit: handlePrecacheSubmit,
    handleClick: handlePrecacheClick,
    handleChange: handlePrecacheChange,
  },
  {
    id: 'layers',
    label: '图层',
    render: renderLayersPage,
  },
  {
    id: 'settings',
    label: '设置',
    render: renderSettingsPage,
    handleSubmit: handleSettingsSubmit,
  },
]

export function buildAdminPageUrl (tabId) {
  const page = getAdminPage(tabId)
  return `/admin/${page.id}`
}

export function getAdminPage (tabId) {
  return ADMIN_PAGES.find(page => page.id === tabId) || ADMIN_PAGES[0]
}

export function isAdminTab (tabId) {
  return ADMIN_PAGES.some(page => page.id === tabId)
}

export function isAdminLocation (location) {
  return location.pathname === '/admin' ||
    location.pathname.startsWith('/admin/') ||
    new URLSearchParams(location.search).get('view') === 'admin'
}

export function getAdminTabFromLocation (location) {
  const [, section, tabId] = location.pathname.split('/')
  if (section === 'admin') {
    return isAdminTab(tabId) ? tabId : 'overview'
  }

  const legacyTabId = new URLSearchParams(location.search).get('tab')
  return isAdminTab(legacyTabId) ? legacyTabId : 'overview'
}
