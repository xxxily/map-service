import { buildAdminPageUrl, getVisibleAdminPages } from './routes.js'
import { escapeHtml } from './utils.js'

export function renderNotice (state) {
  if (!state.message && !state.error && !state.loading) return ''
  const text = state.error || state.message || '正在加载'
  const isError = Boolean(state.error)
  const isLoading = !state.error && (state.message === '正在加载' || state.message === '正在登录' || state.loading)
  const role = isError ? 'alert' : 'status'
  const live = isError ? 'assertive' : 'polite'
  return `
    <div class="admin-notice ${isError ? 'is-error' : ''}" role="${role}" aria-live="${live}">
      <span>${escapeHtml(text)}</span>
      ${!isLoading ? '<button type="button" class="admin-notice-close" data-admin-action="close-notice" aria-label="关闭提示">×</button>' : ''}
    </div>
  `
}

export function renderLogin (state) {
  state.root.innerHTML = `
    <section class="admin-login">
      <form class="admin-login-panel" data-admin-login>
        <p class="admin-kicker">map-service</p>
        <h1>管理后台</h1>
        ${renderNotice(state)}
        <label>
          <span>用户名</span>
          <input name="username" autocomplete="username" required>
        </label>
        <label>
          <span>密码</span>
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <label class="admin-check">
          <input name="remember" type="checkbox">
          <span>在此设备保持登录</span>
        </label>
        <button type="submit">登录</button>
        <a href="/">返回地图</a>
      </form>
    </section>
  `
}

export function renderRequiredPasswordChange (state) {
  const username = state.session?.user?.username || ''
  state.root.innerHTML = `
    <section class="admin-login">
      <form class="admin-login-panel" data-admin-required-password autocomplete="off">
        <p class="admin-kicker">map-service</p>
        <h1>设置新密码</h1>
        <p class="admin-login-help">账号 ${escapeHtml(username)} 使用的是临时密码。完成修改后才能进入管理后台。</p>
        ${renderNotice(state)}
        <label>
          <span>当前临时密码</span>
          <input name="currentPassword" type="password" autocomplete="current-password" required>
        </label>
        <label>
          <span>新密码</span>
          <input name="newPassword" type="password" autocomplete="new-password" minlength="12" required>
        </label>
        <label>
          <span>确认新密码</span>
          <input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required>
        </label>
        <button type="submit">修改密码并继续</button>
        <button type="button" class="admin-button-secondary" data-admin-action="logout">退出登录</button>
      </form>
    </section>
  `
}

export function renderShell (state, content) {
  const pages = getVisibleAdminPages(state.session)
  const currentUser = state.session?.user || {}
  state.root.innerHTML = `
    <section class="admin-shell">
      <header class="admin-topbar">
        <div>
          <p class="admin-kicker">map-service</p>
          <h1>管理后台</h1>
        </div>
        <nav class="admin-actions" aria-label="管理后台操作">
          <span class="admin-current-user" title="当前登录用户">${escapeHtml(currentUser.displayName || currentUser.username || '')}</span>
          <a class="admin-icon-link" href="/account#kml" aria-label="个人空间">个人空间</a>
          <a class="admin-icon-link" href="/" aria-label="返回地图">⌖</a>
          <button type="button" data-admin-action="refresh" aria-label="刷新">↻</button>
          <button type="button" data-admin-action="logout" aria-label="退出">⎋</button>
        </nav>
      </header>
      ${renderNotice(state)}
      <div class="admin-layout">
        <nav class="admin-tabs" aria-label="后台导航">
          ${pages.map(tab => `
            <a href="${buildAdminPageUrl(tab.id)}" data-admin-tab="${tab.id}" class="${state.activeTab === tab.id ? 'is-active' : ''}">
              ${escapeHtml(tab.label)}
            </a>
          `).join('')}
        </nav>
        <div class="admin-content">
          ${content}
        </div>
      </div>
    </section>
  `
}
