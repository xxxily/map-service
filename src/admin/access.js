function sessionPermissions (session) {
  const permissions = session?.user?.permissions || session?.permissions || []
  return Array.isArray(permissions) ? permissions : []
}

export function hasAdminPermission (session, permission) {
  if (!permission) return Boolean(session?.user || session?.username)
  const permissions = sessionPermissions(session)
  return permissions.includes('system.super_admin') || permissions.includes(permission)
}

export function canAccessAdminPage (page, session) {
  if (!page) return false
  if (page.permissions) {
    return page.permissions.some(permission => hasAdminPermission(session, permission))
  }
  return hasAdminPermission(session, page.permission)
}

export function filterAdminPages (pages, session) {
  return pages.filter(page => canAccessAdminPage(page, session))
}
