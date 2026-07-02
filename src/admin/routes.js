import { renderOverviewPage } from './pages/overview.js'
import { handleCacheClick, renderCachePage } from './pages/cache.js'
import { initPrecacheMap, renderPrecachePage } from './pages/precache.js'
import { handleSettingsSubmit, renderSettingsPage } from './pages/settings.js'
import {
  handlePrecacheChange,
  handlePrecacheClick,
  handlePrecacheSubmit,
  schedulePrecacheEstimate,
} from './pages/precache.js'
import { renderKmlPage, handleKmlClick, handleKmlChange } from './pages/kml.js'
import {
  renderTileSourcesPage,
  handleTileSourcesClick,
  handleTileSourcesSubmit,
  handleTileSourcesChange,
  handleTileSourcesEnter
} from './pages/tileSources.js'
import {
  renderProxyPage,
  handleProxyClick,
  handleProxySubmit,
  handleProxyChange,
  handleProxyEnter
} from './pages/proxy.js'


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
    id: 'kml',
    label: 'KML管理',
    render: renderKmlPage,
    handleClick: handleKmlClick,
    handleChange: handleKmlChange,
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
    id: 'tile-sources',
    label: '图源管理',
    render: renderTileSourcesPage,
    afterEnter: handleTileSourcesEnter,
    afterLoad: handleTileSourcesEnter,
    handleClick: handleTileSourcesClick,
    handleSubmit: handleTileSourcesSubmit,
    handleChange: handleTileSourcesChange,
  },
  {
    id: 'proxy',
    label: '代理配置',
    render: renderProxyPage,
    afterEnter: handleProxyEnter,
    afterLoad: handleProxyEnter,
    handleClick: handleProxyClick,
    handleSubmit: handleProxySubmit,
    handleChange: handleProxyChange,
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
