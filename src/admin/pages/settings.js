import { escapeHtml } from '../utils.js'

const ACCESS_PASSWORD_MIN_LENGTH = 4

export function renderSettingsPage (state) {
  const access = state.settings?.access || {}

  return `
    <div class="admin-grid">
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
            <input name="accessPassword" type="password" autocomplete="new-password" placeholder="${access.hasPassword ? '已设置，输入新密码以修改' : `输入至少 ${ACCESS_PASSWORD_MIN_LENGTH} 位访问密码`}">
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
          <h2>修改当前账号密码</h2>
        </div>
        <form class="admin-form" data-admin-password-form autocomplete="off">
          <label>
            <span>当前密码</span>
            <input name="currentPassword" type="password" required autocomplete="current-password" placeholder="请输入当前密码">
          </label>
          <label>
            <span>新密码</span>
            <input name="newPassword" type="password" minlength="12" required autocomplete="new-password" placeholder="至少 12 位，包含多类字符">
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
  const accessForm = event.target.closest('[data-access-form]')
  const adminPasswordForm = event.target.closest('[data-admin-password-form]')

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

    if (newPassword.length < 12) {
      setNotice('', '新密码长度至少为 12 位')
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
      setNotice('当前账号密码修改成功')
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
