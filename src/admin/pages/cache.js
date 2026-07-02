import { escapeHtml, formatBytes } from '../utils.js'

export function renderCachePage (state) {
  const cache = state.cache || {}
  const status = state.cacheError || (state.cacheLoading ? '统计中' : '')
  const bySource = cache.bySource || {}
  const tileSources = state.tileSources || []

  return `
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>缓存治理</h2>
        <button type="button" class="btn-danger" data-admin-action="clear-cache">清空全部缓存</button>
      </div>
      
      <dl class="admin-metrics admin-metrics-five">
        <div class="metric-files"><dt>文件数</dt><dd>${escapeHtml(status || cache.files || 0)}</dd></div>
        <div class="metric-size"><dt>总大小</dt><dd>${formatBytes(cache.bytes || 0)}</dd></div>
        <div class="metric-fresh"><dt>新鲜数</dt><dd>${cache.fresh || 0}</dd></div>
        <div class="metric-stale"><dt>可回退</dt><dd>${cache.stale || 0}</dd></div>
        <div class="metric-expired"><dt>过期数</dt><dd>${cache.expired || 0}</dd></div>
      </dl>

      <div class="admin-table-wrapper" style="margin-top: 24px;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>图源名称</th>
              <th>图源 ID</th>
              <th>文件数</th>
              <th>体积大小</th>
              <th>状态分布 (新鲜/可回退/过期)</th>
              <th class="actions">操作</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(bySource).map(([sourceId, stats]) => {
              const matchedSource = tileSources.find(s => s.id === sourceId)
              const displayName = matchedSource ? matchedSource.name : '专用/未知图源'
              return `
                <tr>
                  <td><strong>${escapeHtml(displayName)}</strong></td>
                  <td><code class="code-slug">${escapeHtml(sourceId)}</code></td>
                  <td>${stats.files || 0}</td>
                  <td>${formatBytes(stats.size || 0)}</td>
                  <td>
                    <span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: none; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${stats.fresh || 0}</span>
                    <span class="status-badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: none; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${stats.stale || 0}</span>
                    <span class="status-badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: none; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${stats.expired || 0}</span>
                  </td>
                  <td class="actions">
                    <button type="button" class="btn-danger-sm" data-admin-action="clear-source-cache" data-source-id="${escapeHtml(sourceId)}">清理缓存</button>
                  </td>
                </tr>
              `
            }).join('') || `<tr><td colspan="6" class="empty-row">暂无分源缓存数据</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `
}

export async function handleCacheClick ({ api, event, renderDashboard, setNotice, showConfirm, state }) {
  const actionTarget = event.target.closest('[data-admin-action]')
  if (!actionTarget) return false

  const action = actionTarget.getAttribute('data-admin-action')

  if (action === 'clear-cache') {
    if (!await showConfirm('清空所有瓦片缓存？此操作不可逆！')) return true
    try {
      await api.clearCache()
      state.cache = await api.cache()
      setNotice('所有瓦片缓存已清空')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  if (action === 'clear-source-cache') {
    const sourceId = actionTarget.getAttribute('data-source-id')
    if (!sourceId) return false
    const matchedSource = (state.tileSources || []).find(s => s.id === sourceId)
    const displayName = matchedSource ? matchedSource.name : sourceId
    if (!await showConfirm(`确定要清空图源【${displayName}】的全部瓦片缓存吗？`)) return true
    try {
      await api.clearCache({ sourceId })
      state.cache = await api.cache()
      setNotice(`已清空图源【${displayName}】的专属瓦片缓存`)
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  return false
}
