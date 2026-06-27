import { escapeHtml, formatDuration, formatTime } from '../utils.js'

export function renderOverviewPage (state) {
  const system = state.system
  const visits = state.visits || {}
  const version = system?.package?.version || '-'
  const visitStatus = state.visitsError || (state.visitsLoading ? '统计中' : '')

  return `
    <div class="admin-grid">
      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>系统</h2>
          <span class="admin-badge">${escapeHtml(version)}</span>
        </div>
        <dl class="admin-metrics">
          <div><dt>应用</dt><dd>${escapeHtml(system?.package?.name || '-')}</dd></div>
          <div><dt>Node</dt><dd>${escapeHtml(system?.node || '-')}</dd></div>
          <div><dt>进程</dt><dd>${escapeHtml(system?.pid || '-')}</dd></div>
          <div><dt>运行</dt><dd>${formatDuration(system?.uptime || 0)}</dd></div>
          <div><dt>环境</dt><dd>${escapeHtml(system?.env || '-')}</dd></div>
          <div><dt>时间</dt><dd>${formatTime(system?.serverTime)}</dd></div>
        </dl>
      </section>
      <section class="admin-panel admin-panel-wide">
        <div class="admin-panel-head">
          <h2>访问</h2>
          <span class="admin-badge">${escapeHtml(visitStatus || visits.total || 0)}</span>
        </div>
        <div class="admin-stat-row">
          ${Object.entries(visits.statusGroups || {}).map(([group, count]) => {
            let statusClass = ''
            if (group.startsWith('2')) statusClass = 'status-2xx'
            else if (group.startsWith('3')) statusClass = 'status-3xx'
            else if (group.startsWith('4') || group.startsWith('5')) statusClass = 'status-err'
            return `<div class="${statusClass}"><span>${escapeHtml(group)}</span><strong>${count}</strong></div>`
          }).join('') || `<div><span>请求</span><strong>${escapeHtml(visitStatus || 0)}</strong></div>`}
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>方法</th><th>路径</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              ${(visits.recentRequests || []).slice(0, 8).map(record => {
                let statusBadge = ''
                if (String(record.status).startsWith('2')) statusBadge = 'badge-2xx'
                else if (String(record.status).startsWith('3')) statusBadge = 'badge-3xx'
                else if (String(record.status).startsWith('4') || String(record.status).startsWith('5')) statusBadge = 'badge-err'
                return `
                  <tr>
                    <td><code class="admin-method-code">${escapeHtml(record.method)}</code></td>
                    <td class="admin-path-td">${escapeHtml(record.path)}</td>
                    <td><span class="admin-status-badge ${statusBadge}">${escapeHtml(record.status)}</span></td>
                    <td class="admin-time-td">${escapeHtml(record.timestamp)}</td>
                  </tr>
                `
              }).join('') || '<tr><td colspan="4">暂无访问记录</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `
}
