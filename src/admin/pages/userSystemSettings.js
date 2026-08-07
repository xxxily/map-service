import { escapeHtml, formatBytes, hasPermission } from '../utils.js'
import { withRecentReauth } from '../dialogs.js'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function numberValue (value, divisor = 1) {
  const result = Number(value || 0) / divisor
  return Number.isFinite(result) ? result : 0
}

function registrationRoles (state) {
  return (state.roles || []).filter(role => {
    const permissions = role.permissions || []
    return role.code === 'user' || !permissions.some(code => (
      code.startsWith('admin.') || code.startsWith('kml.any.') || code === 'system.super_admin'
    ))
  })
}

export function renderUserSystemSettingsPage (state) {
  const settings = state.userSystemSettings || {}
  const registration = settings.registration || {}
  const session = settings.session || {}
  const quota = settings.quota || {}
  const share = settings.share || {}
  const canManageRegistration = hasPermission(state, 'admin.registration.manage')
  const canManageSecurity = hasPermission(state, 'admin.security.manage')
  const roles = registrationRoles(state)
  const defaultRoles = new Set(registration.defaultRoleCodes || ['user'])

  return `
    <div class="admin-user-system-stack">
      <section class="admin-panel admin-security-callout">
        <div>
          <strong>高风险设置保护</strong>
          <p>注册、会话、配额和公开分享策略更新需要最近完成过密码验证；服务端会记录修改人与变更范围。</p>
        </div>
      </section>

      ${canManageRegistration ? `
        <section class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <h2>注册策略</h2>
              <p class="admin-panel-description">关闭注册只影响自主注册，管理员仍可在后台创建账号。</p>
            </div>
            <span class="admin-badge">${registration.mode === 'open' ? '已开放' : '已关闭'}</span>
          </div>
          <form class="admin-form" data-admin-registration-settings>
            <label>
              <span>自主注册</span>
              <select name="mode">
                <option value="closed" ${registration.mode !== 'open' ? 'selected' : ''}>关闭注册</option>
                <option value="open" ${registration.mode === 'open' ? 'selected' : ''}>开放注册</option>
              </select>
            </label>
            <fieldset class="admin-permission-fieldset">
              <legend>新注册用户默认角色</legend>
              <div class="admin-checkbox-grid">
                ${roles.map(role => `
                  <label class="admin-check">
                    <input type="checkbox" name="defaultRoleCodes" value="${escapeHtml(role.code)}" ${defaultRoles.has(role.code) ? 'checked' : ''} ${role.code === 'user' ? 'disabled' : ''}>
                    <span>${escapeHtml(role.name)} <small>${escapeHtml(role.code)}</small></span>
                  </label>
                `).join('') || '<p>仅可使用普通用户角色。</p>'}
              </div>
              <input type="hidden" name="defaultRoleCodes" value="user">
            </fieldset>
            <button type="submit">保存注册策略</button>
          </form>
        </section>
      ` : ''}

      ${canManageSecurity ? `
        <section class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <h2>会话与再验证</h2>
              <p class="admin-panel-description">缩短有效期可降低长期会话风险；角色变化会立即使旧会话失效。</p>
            </div>
          </div>
          <form class="admin-form" data-admin-user-security-settings>
            <div class="admin-field-grid admin-field-grid-three">
              <label><span>普通会话有效期（天）</span><input name="sessionTtlDays" type="number" min="1" max="30" step="1" value="${numberValue(session.ttlMs, DAY_MS)}" required></label>
              <label><span>记住登录有效期（天）</span><input name="rememberTtlDays" type="number" min="1" max="90" step="1" value="${numberValue(session.rememberTtlMs, DAY_MS)}" required></label>
              <label><span>高风险操作再验证窗口（分钟）</span><input name="reauthMinutes" type="number" min="1" max="60" step="1" value="${numberValue(session.reauthWindowMs, MINUTE_MS)}" required></label>
            </div>

            <fieldset class="admin-permission-fieldset">
              <legend>默认 KML 配额</legend>
              <div class="admin-field-grid admin-field-grid-three">
                <label><span>最多 KML 文件数</span><input name="maxKmlFiles" type="number" min="1" max="10000" value="${Number(quota.maxKmlFiles || 100)}" required></label>
                <label><span>单个 KML 上限（MB）</span><input name="maxKmlFileMb" type="number" min="1" max="100" value="${numberValue(quota.maxKmlFileBytes, 1024 * 1024)}" required></label>
                <label><span>单文件要素上限</span><input name="maxFeaturesPerKml" type="number" min="1" max="1000000" value="${Number(quota.maxFeaturesPerKml || 50000)}" required></label>
                <label><span>用户总要素上限</span><input name="maxFeaturesPerUser" type="number" min="1" max="5000000" value="${Number(quota.maxFeaturesPerUser || 200000)}" required></label>
                <label><span>回收站保留（天）</span><input name="trashRetentionDays" type="number" min="1" max="3650" value="${Number(quota.trashRetentionDays || 30)}" required></label>
              </div>
              <p class="admin-field-help">当前单文件限制：${escapeHtml(formatBytes(quota.maxKmlFileBytes || 0))}</p>
            </fieldset>

            <fieldset class="admin-permission-fieldset">
              <legend>公开分享策略</legend>
              <div class="admin-field-grid admin-field-grid-three">
                <label>
                  <span>公开链接与站点访问密码</span>
                  <select name="publicAccessPolicy">
                    <option value="inherit_site_access" ${share.publicAccessPolicy !== 'independent' ? 'selected' : ''}>继承站点访问密码</option>
                    <option value="independent" ${share.publicAccessPolicy === 'independent' ? 'selected' : ''}>分享链接独立访问</option>
                  </select>
                </label>
                <label><span>单个分享最多 KML 数</span><input name="maxFilesPerShare" type="number" min="1" max="20" value="${Number(share.maxFilesPerShare || 20)}" required></label>
                <label><span>分享密码授权有效期（小时）</span><input name="shareAccessHours" type="number" min="1" max="168" value="${numberValue(share.accessTtlMs, HOUR_MS)}" required></label>
              </div>
            </fieldset>
            <button type="submit">保存安全与配额策略</button>
          </form>
        </section>
      ` : ''}
    </div>
  `
}

function integerField (form, name) {
  return Number.parseInt(String(form.get(name) || ''), 10)
}

export async function handleUserSystemSettingsSubmit ({ api, event, renderDashboard, setNotice, state }) {
  const registrationForm = event.target.closest('[data-admin-registration-settings]')
  if (registrationForm) {
    event.preventDefault()
    const data = new FormData(registrationForm)
    const defaultRoleCodes = [...new Set(data.getAll('defaultRoleCodes').map(String))]
    try {
      setNotice('正在保存注册策略...')
      state.userSystemSettings = await withRecentReauth(api, () => api.updateUserSystemSettings({
        registration: {
          mode: String(data.get('mode') || 'closed'),
          defaultRoleCodes,
        },
      }))
      setNotice('注册策略已更新')
    } catch (err) {
      setNotice('', err.code === 'ACTION_CANCELLED' ? '' : err.message)
    }
    renderDashboard()
    return true
  }

  const securityForm = event.target.closest('[data-admin-user-security-settings]')
  if (securityForm) {
    event.preventDefault()
    const data = new FormData(securityForm)
    const body = {
      session: {
        ttlMs: integerField(data, 'sessionTtlDays') * DAY_MS,
        rememberTtlMs: integerField(data, 'rememberTtlDays') * DAY_MS,
        reauthWindowMs: integerField(data, 'reauthMinutes') * MINUTE_MS,
      },
      quota: {
        maxKmlFiles: integerField(data, 'maxKmlFiles'),
        maxKmlFileBytes: integerField(data, 'maxKmlFileMb') * 1024 * 1024,
        maxFeaturesPerKml: integerField(data, 'maxFeaturesPerKml'),
        maxFeaturesPerUser: integerField(data, 'maxFeaturesPerUser'),
        trashRetentionDays: integerField(data, 'trashRetentionDays'),
      },
      share: {
        publicAccessPolicy: String(data.get('publicAccessPolicy') || 'inherit_site_access'),
        maxFilesPerShare: integerField(data, 'maxFilesPerShare'),
        accessTtlMs: integerField(data, 'shareAccessHours') * HOUR_MS,
      },
    }
    try {
      setNotice('正在保存用户体系策略...')
      state.userSystemSettings = await withRecentReauth(api, () => api.updateUserSystemSettings(body))
      setNotice('用户体系策略已更新')
    } catch (err) {
      setNotice('', err.code === 'ACTION_CANCELLED' ? '' : err.message)
    }
    renderDashboard()
    return true
  }

  return false
}
