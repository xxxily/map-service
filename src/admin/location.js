export function isAdminLocation (location) {
  return location.pathname === '/admin' ||
    location.pathname.startsWith('/admin/') ||
    new URLSearchParams(location.search).get('view') === 'admin'
}
