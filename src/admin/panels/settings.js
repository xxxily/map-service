import { escapeHtml } from '../utils.js'

export function renderSettingsPanel (state) {
  const proxy = state.settings?.proxy || {}
  const providers = state.providers || []

  return `
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>代理设置</h2>
        <span class="admin-badge">${proxy.enabled ? 'ON' : 'OFF'}</span>
      </div>
      <form class="admin-form" data-proxy-form autocomplete="off">
        <label class="admin-check">
          <input type="checkbox" name="enabled" ${proxy.enabled ? 'checked' : ''}>
          <span>启用代理策略</span>
        </label>
        <div class="admin-field-row">
          <label>
            <span>协议</span>
            <select name="protocol">
              <option value="http" ${proxy.protocol === 'http' ? 'selected' : ''}>http</option>
              <option value="https" ${proxy.protocol === 'https' ? 'selected' : ''}>https</option>
            </select>
          </label>
          <label>
            <span>端口</span>
            <input name="port" type="number" min="1" max="65535" value="${escapeHtml(proxy.port || 10809)}" required>
          </label>
        </div>
        <label>
          <span>主机</span>
          <input name="host" value="${escapeHtml(proxy.host || '127.0.0.1')}" required>
        </label>
        <label>
          <span>用户名</span>
          <input name="proxyUsername" autocomplete="off" value="${escapeHtml(proxy.username || '')}">
        </label>
        <label>
          <span>密码</span>
          <input name="proxyPassword" type="password" autocomplete="new-password" placeholder="${proxy.hasPassword ? '已设置' : ''}">
        </label>
        <fieldset class="admin-provider-policy">
          <legend>按图层启用代理</legend>
          ${providers.map(provider => {
            const checked = Boolean(proxy.providerPolicy?.[provider.id])
            return `
              <label class="admin-check">
                <input type="checkbox" name="providerPolicy:${escapeHtml(provider.id)}" ${checked ? 'checked' : ''}>
                <span>${escapeHtml(provider.name)}</span>
              </label>
            `
          }).join('')}
        </fieldset>
        <button type="submit">保存代理</button>
      </form>
    </section>
  `
}
