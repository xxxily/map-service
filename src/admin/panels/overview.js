import { escapeHtml, formatDuration, formatTime } from '../utils.js'

export function renderOverviewPanel (state) {
  const system = state.system
  const visits = state.visits || {}
  const version = system?.package?.version || '-'

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
          <span class="admin-badge">${visits.total || 0}</span>
        </div>
        <div class="admin-stat-row">
          ${Object.entries(visits.statusGroups || {}).map(([group, count]) => `
            <div><span>${escapeHtml(group)}</span><strong>${count}</strong></div>
          `).join('') || '<div><span>请求</span><strong>0</strong></div>'}
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>方法</th><th>路径</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              ${(visits.recentRequests || []).slice(0, 8).map(record => `
                <tr>
                  <td>${escapeHtml(record.method)}</td>
                  <td>${escapeHtml(record.path)}</td>
                  <td>${escapeHtml(record.status)}</td>
                  <td>${escapeHtml(record.timestamp)}</td>
                </tr>
              `).join('') || '<tr><td colspan="4">暂无访问记录</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `
}
