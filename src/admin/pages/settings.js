import { escapeHtml } from '../utils.js'

const ACCESS_PASSWORD_MIN_LENGTH = 10

function collectProxyForm (form, state) {
  const providerPolicy = {}
  ;[...form.elements].forEach((element) => {
    if (element.name?.startsWith('providerPolicy:')) {
      providerPolicy[element.name.replace('providerPolicy:', '')] = element.checked
    }
  })

  const proxy = {
    enabled: form.elements.enabled.checked,
    protocol: form.elements.protocol.value,
    host: form.elements.host.value,
    port: Number(form.elements.port.value),
    username: form.elements.proxyUsername.value,
    providerPolicy,
  }
  const password = form.elements.proxyPassword.value
  if (password || !state.settings?.proxy?.hasPassword) {
    proxy.password = password
  }

  return {
    proxy,
  }
}

export function renderSettingsPage (state) {
  const proxy = state.settings?.proxy || {}
  const access = state.settings?.access || {}
  const providers = state.providers || []

  return `
    <div class="admin-grid">
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

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>访问控制</h2>
          <span class="admin-badge">${access.enabled ? 'ON' : 'OFF'}</span>
        </div>
        <form class="admin-form" data-access-form autocomplete="off">
          <label class="admin-check">
            <input type="checkbox" name="accessEnabled" ${access.enabled ? 'checked' : ''}>
            <span>启用访问密码</span>
          </label>
          <label>
            <span>设置访问密码</span>
            <input name="accessPassword" type="password" autocomplete="new-password" placeholder="${access.hasPassword ? '已设置，输入新密码以修改' : '输入至少 10 位访问密码'}">
          </label>
          ${access.hasPassword ? `
            <label class="admin-check">
              <input type="checkbox" name="clearAccessPassword">
              <span>清除已保存的访问密码</span>
            </label>
          ` : ''}
          <button type="submit">保存访问控制</button>
        </form>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>修改管理密码</h2>
        </div>
        <form class="admin-form" data-admin-password-form autocomplete="off">
          <label>
            <span>当前密码</span>
            <input name="currentPassword" type="password" required autocomplete="current-password" placeholder="请输入当前密码">
          </label>
          <label>
            <span>新密码</span>
            <input name="newPassword" type="password" required autocomplete="new-password" placeholder="请输入新密码（至少4位）">
          </label>
          <label>
            <span>确认新密码</span>
            <input name="confirmPassword" type="password" required autocomplete="new-password" placeholder="请再次输入新密码">
          </label>
          <button type="submit">修改密码</button>
        </form>
      </section>
    </div>
  `
}

export async function handleSettingsSubmit ({ api, event, renderDashboard, setNotice, state }) {
  const proxyForm = event.target.closest('[data-proxy-form]')
  const accessForm = event.target.closest('[data-access-form]')
  const adminPasswordForm = event.target.closest('[data-admin-password-form]')

  if (proxyForm) {
    event.preventDefault()
    try {
      state.settings = await api.updateSettings(collectProxyForm(proxyForm, state))
      setNotice('代理设置已保存')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  if (accessForm) {
    event.preventDefault()
    try {
      const accessEnabled = accessForm.elements.accessEnabled.checked
      const accessPassword = accessForm.elements.accessPassword.value.trim()
      const clearPassword = accessForm.elements.clearAccessPassword?.checked || false

      const payload = {
        access: {
          enabled: accessEnabled,
        },
      }

      if (accessPassword) {
        if (accessPassword.length < ACCESS_PASSWORD_MIN_LENGTH) {
          setNotice('', `访问密码长度至少为 ${ACCESS_PASSWORD_MIN_LENGTH} 位`)
          renderDashboard()
          return true
        }
        payload.access.password = accessPassword
      } else if (clearPassword) {
        payload.access.clearPassword = true
      } else if (accessEnabled && !state.settings?.access?.hasPassword) {
        setNotice('', '启用访问密码时，必须设置访问密码')
        renderDashboard()
        return true
      }

      if (accessEnabled && clearPassword && !accessPassword) {
        setNotice('', '启用访问密码时不能同时清除密码')
        renderDashboard()
        return true
      }

      state.settings = await api.updateSettings(payload)
      setNotice('访问控制已保存')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  if (adminPasswordForm) {
    event.preventDefault()
    const currentPassword = adminPasswordForm.elements.currentPassword.value
    const newPassword = adminPasswordForm.elements.newPassword.value
    const confirmPassword = adminPasswordForm.elements.confirmPassword.value

    if (newPassword.length < 4) {
      setNotice('', '新密码长度至少为 4 位')
      renderDashboard()
      return true
    }

    if (newPassword !== confirmPassword) {
      setNotice('', '两次输入的新密码不一致')
      renderDashboard()
      return true
    }

    try {
      await api.updatePassword({
        currentPassword,
        newPassword,
      })
      setNotice('管理密码修改成功！')
      adminPasswordForm.reset()
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  return false
}
