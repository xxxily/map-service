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
import {
  handleUsersClick,
  handleUsersSubmit,
  renderUsersPage,
} from './pages/users.js'
import {
  handleRolesClick,
  handleRolesSubmit,
  renderRolesPage,
} from './pages/roles.js'
import {
  handleUserSystemSettingsSubmit,
  renderUserSystemSettingsPage,
} from './pages/userSystemSettings.js'
import {
  handleShareModerationClick,
  handleShareModerationSubmit,
  renderShareModerationPage,
} from './pages/shareModeration.js'
import {
  handleAuditLogsClick,
  handleAuditLogsSubmit,
  renderAuditLogsPage,
} from './pages/auditLogs.js'
import {
  canAccessAdminPage,
  filterAdminPages,
  hasAdminPermission,
} from './access.js'


export const ADMIN_PAGES = [
  {
    id: 'overview',
    label: '概览',
    permission: 'admin.overview.read',
    render: renderOverviewPage,
  },
  {
    id: 'cache',
    label: '缓存',
    permission: 'admin.cache.manage',
    render: renderCachePage,
    handleClick: handleCacheClick,
  },
  {
    id: 'kml',
    label: '公共 KML',
    permission: 'admin.public_kml.manage',
    render: renderKmlPage,
    handleClick: handleKmlClick,
    handleChange: handleKmlChange,
  },
  {
    id: 'precache',
    label: '预缓存',
    permission: 'admin.precache.manage',
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
    permission: 'admin.layer.manage',
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
    permission: 'admin.layer.manage',
    render: renderProxyPage,
    afterEnter: handleProxyEnter,
    afterLoad: handleProxyEnter,
    handleClick: handleProxyClick,
    handleSubmit: handleProxySubmit,
    handleChange: handleProxyChange,
  },
  {
    id: 'settings',
    label: '站点设置',
    permission: 'admin.security.manage',
    render: renderSettingsPage,
    handleSubmit: handleSettingsSubmit,
  },
  {
    id: 'users',
    label: '用户管理',
    permission: 'admin.user.read',
    render: renderUsersPage,
    handleClick: handleUsersClick,
    handleSubmit: handleUsersSubmit,
  },
  {
    id: 'roles',
    label: '角色权限',
    permission: 'admin.role.manage',
    render: renderRolesPage,
    handleClick: handleRolesClick,
    handleSubmit: handleRolesSubmit,
  },
  {
    id: 'user-system',
    label: '用户体系设置',
    permissions: ['admin.registration.manage', 'admin.security.manage'],
    render: renderUserSystemSettingsPage,
    handleSubmit: handleUserSystemSettingsSubmit,
  },
  {
    id: 'shares',
    label: '分享治理',
    permission: 'admin.share.moderate',
    render: renderShareModerationPage,
    handleClick: handleShareModerationClick,
    handleSubmit: handleShareModerationSubmit,
  },
  {
    id: 'audit',
    label: '审计日志',
    permission: 'admin.audit.read',
    render: renderAuditLogsPage,
    handleClick: handleAuditLogsClick,
    handleSubmit: handleAuditLogsSubmit,
  },
]

export function getVisibleAdminPages (session) {
  return filterAdminPages(ADMIN_PAGES, session)
}

export { canAccessAdminPage, hasAdminPermission }

export function buildAdminPageUrl (tabId) {
  const page = getAdminPage(tabId)
  return `/admin/${page.id}`
}

export function getAdminPage (tabId) {
  return ADMIN_PAGES.find(page => page.id === tabId) || ADMIN_PAGES[0]
}

export function getAuthorizedAdminPage (tabId, session) {
  const pages = getVisibleAdminPages(session)
  return pages.find(page => page.id === tabId) || pages[0] || null
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
