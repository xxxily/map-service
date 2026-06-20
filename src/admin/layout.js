import { ADMIN_PAGES, buildAdminPageUrl } from './routes.js'
import { escapeHtml } from './utils.js'

export function renderNotice (state) {
  if (!state.message && !state.error && !state.loading) return ''
  const text = state.error || state.message || '正在加载'
  return `<div class="admin-notice ${state.error ? 'is-error' : ''}">${escapeHtml(text)}</div>`
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
        <button type="submit">登录</button>
        <a href="/">返回地图</a>
      </form>
    </section>
  `
}

export function renderShell (state, content) {
  state.root.innerHTML = `
    <section class="admin-shell">
      <header class="admin-topbar">
        <div>
          <p class="admin-kicker">map-service</p>
          <h1>管理后台</h1>
        </div>
        <nav class="admin-actions" aria-label="管理后台操作">
          <a class="admin-icon-link" href="/" aria-label="返回地图">⌖</a>
          <button type="button" data-admin-action="refresh" aria-label="刷新">↻</button>
          <button type="button" data-admin-action="logout" aria-label="退出">⎋</button>
        </nav>
      </header>
      ${renderNotice(state)}
      <div class="admin-layout">
        <nav class="admin-tabs" aria-label="后台导航">
          ${ADMIN_PAGES.map(tab => `
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
