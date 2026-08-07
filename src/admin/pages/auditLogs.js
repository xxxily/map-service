import { escapeHtml, formatTime, renderPagination } from '../utils.js'

function filtersForRequest (state, page) {
  return {
    ...state.auditFilters,
    page,
    limit: state.auditLogs?.limit || 20,
  }
}

async function reloadAuditLogs (state, api, page = state.auditLogs?.page || 1) {
  state.auditLogs = await api.listAuditLogs(filtersForRequest(state, page))
}

function metadataText (metadata) {
  try {
    const value = JSON.stringify(metadata || {}, null, 2)
    return value.length > 4000 ? `${value.slice(0, 4000)}\n…已截断` : value
  } catch (err) {
    return '{}'
  }
}

export function renderAuditLogsPage (state) {
  const collection = state.auditLogs || { items: [] }
  const filters = state.auditFilters || {}
  return `
    <div class="admin-user-system-stack">
      <section class="admin-panel">
        <div class="admin-panel-head">
          <div>
            <h2>审计日志</h2>
            <p class="admin-panel-description">记录登录、账号、角色、策略和分享治理等关键操作，不保存密码、Token 或 KML 全文。</p>
          </div>
          <span class="admin-badge">${Number(collection.total || 0)} 条记录</span>
        </div>
        <form class="admin-filter-form admin-filter-form-compact" data-admin-audit-filter>
          <label><span>操作代码</span><input name="action" value="${escapeHtml(filters.action || '')}" placeholder="例如 admin.user.update"></label>
          <label><span>目标类型</span><input name="targetType" value="${escapeHtml(filters.targetType || '')}" placeholder="例如 user"></label>
          <button type="submit">筛选</button>
        </form>
        <div class="admin-audit-list">
          ${(collection.items || []).map(log => `
            <article class="admin-audit-entry">
              <header>
                <div>
                  <strong>${escapeHtml(log.action)}</strong>
                  <span class="admin-state-pill ${log.result === 'success' ? 'is-active' : 'is-error'}">${escapeHtml(log.result || '-')}</span>
                </div>
                <time datetime="${escapeHtml(log.createdAt || '')}">${escapeHtml(formatTime(log.createdAt))}</time>
              </header>
              <dl>
                <div><dt>操作者</dt><dd>${log.actor ? `${escapeHtml(log.actor.displayName || log.actor.username)} (@${escapeHtml(log.actor.username)})` : '系统'}</dd></div>
                <div><dt>目标</dt><dd>${escapeHtml(log.targetType || '-')} / ${escapeHtml(log.targetId || '-')}</dd></div>
                <div><dt>来源摘要</dt><dd>${escapeHtml(log.ipSummary || '-')}</dd></div>
                ${log.reason ? `<div><dt>原因</dt><dd>${escapeHtml(log.reason)}</dd></div>` : ''}
              </dl>
              <details>
                <summary>查看变更摘要</summary>
                <pre>${escapeHtml(metadataText(log.metadata))}</pre>
              </details>
            </article>
          `).join('') || '<p class="admin-empty">没有符合条件的审计记录</p>'}
        </div>
        ${renderPagination(collection, 'audit')}
      </section>
    </div>
  `
}

export async function handleAuditLogsSubmit ({ api, event, renderDashboard, setNotice, state }) {
  const form = event.target.closest('[data-admin-audit-filter]')
  if (!form) return false
  event.preventDefault()
  const data = new FormData(form)
  state.auditFilters = {
    action: String(data.get('action') || '').trim(),
    targetType: String(data.get('targetType') || '').trim(),
  }
  try {
    setNotice('正在筛选审计日志...')
    await reloadAuditLogs(state, api, 1)
    setNotice('')
  } catch (err) {
    setNotice('', err.message)
  }
  renderDashboard()
  return true
}

export async function handleAuditLogsClick ({ api, event, renderDashboard, setNotice, state }) {
  const target = event.target.closest('[data-admin-action="audit-page"]')
  if (!target) return false
  const page = Number(target.dataset.page || 1)
  if (page < 1) return true
  try {
    setNotice('正在加载审计日志...')
    await reloadAuditLogs(state, api, page)
    setNotice('')
  } catch (err) {
    setNotice('', err.message)
  }
  renderDashboard()
  return true
}
