import { getAuthSnapshot, refreshAuthSession, subscribeAuth } from './session.js'

function isAdminUser (auth) {
  const permissions = auth?.user?.permissions || []
  return permissions.includes('system.super_admin') || permissions.some(permission => permission.startsWith('admin.'))
}

function updateIdentityEntry (button, adminItem, auth) {
  if (!button) return
  const name = auth.authenticated
    ? (auth.user?.displayName || auth.user?.username || '用户')
    : '登录 / 注册'
  button.dataset.authenticated = String(Boolean(auth.authenticated))
  button.setAttribute('aria-label', auth.authenticated ? `用户中心：${name}` : '登录或注册')
  button.setAttribute('title', auth.authenticated ? `用户中心 · ${name}` : '登录 / 注册')
  const label = button.querySelector('[data-account-entry-label]')
  if (label) label.textContent = auth.authenticated ? name : '登录'
  if (adminItem) adminItem.hidden = !isAdminUser(auth)
}

export function initIdentityEntry (options = {}) {
  const button = options.button || document.querySelector('[data-action="openAccount"]')
  const adminItem = options.adminItem || document.querySelector('[data-admin-identity-item]')
  const update = auth => updateIdentityEntry(button, adminItem, auth)
  update(getAuthSnapshot())
  const unsubscribe = subscribeAuth(update)
  refreshAuthSession().catch(() => update(getAuthSnapshot()))
  return unsubscribe
}
