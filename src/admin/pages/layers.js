import { escapeHtml } from '../utils.js'

export function renderLayersPage (state) {
  const providers = state.providers || []

  return `
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>图层配置</h2>
        <span class="admin-badge">${providers.length}</span>
      </div>
      <div class="admin-layer-grid">
        ${providers.map(provider => `
          <article class="admin-layer-card">
            <header>
              <h3>${escapeHtml(provider.name)}</h3>
              <span class="admin-status">${escapeHtml(provider.id)}</span>
            </header>
            <dl>
              <div><dt>厂商</dt><dd>${escapeHtml(provider.vendor)}</dd></div>
              <div><dt>类型</dt><dd>${escapeHtml(provider.category)}</dd></div>
              <div><dt>缩放</dt><dd>${provider.minZoom}-${provider.maxZoom}</dd></div>
              <div><dt>默认代理</dt><dd>${provider.proxyDefault ? '是' : '否'}</dd></div>
              <div><dt>子域</dt><dd>${escapeHtml((provider.subdomains || []).join(', ') || '-')}</dd></div>
            </dl>
            <p>${escapeHtml(provider.description || '')}</p>
            <code>${escapeHtml(provider.template)}</code>
          </article>
        `).join('') || '<p>暂无图层配置</p>'}
      </div>
    </section>
  `
}
