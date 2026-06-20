import { escapeHtml, formatBytes } from '../utils.js'

export function renderCachePage (state) {
  const cache = state.cache || {}
  return `
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>缓存</h2>
        <button type="button" data-admin-action="clear-cache">清空</button>
      </div>
      <dl class="admin-metrics admin-metrics-five">
        <div><dt>文件</dt><dd>${cache.files || 0}</dd></div>
        <div><dt>体积</dt><dd>${formatBytes(cache.bytes || 0)}</dd></div>
        <div><dt>新鲜</dt><dd>${cache.fresh || 0}</dd></div>
        <div><dt>可回退</dt><dd>${cache.stale || 0}</dd></div>
        <div><dt>过期</dt><dd>${cache.expired || 0}</dd></div>
      </dl>
      <div class="admin-list">
        ${Object.entries(cache.providers || {}).slice(0, 12).map(([name, count]) => `
          <div><span>${escapeHtml(name)}</span><strong>${count}</strong></div>
        `).join('') || '<p>暂无缓存</p>'}
      </div>
    </section>
  `
}

export async function handleCacheClick ({ api, event, renderDashboard, setNotice, showConfirm, state }) {
  const actionTarget = event.target.closest('[data-admin-action]')
  if (actionTarget?.getAttribute('data-admin-action') !== 'clear-cache') return false

  if (!await showConfirm('清空所有瓦片缓存？')) return true
  try {
    await api.clearCache()
    state.cache = await api.cache()
    setNotice('缓存已清空')
    renderDashboard()
  } catch (err) {
    setNotice('', err.message)
    renderDashboard()
  }
  return true
}
