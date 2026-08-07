import { showAlert } from '../../ui/dialog.js'
import { withRecentReauth } from '../dialogs.js'
import { escapeHtml, formatTime, hasPermission, renderPagination } from '../utils.js'

const USER_STATUS_OPTIONS = [
  ['active', '正常'],
  ['disabled', '已停用'],
  ['locked', '已锁定'],
  ['deleted', '已删除'],
]

function statusLabel (status) {
  return USER_STATUS_OPTIONS.find(([value]) => value === status)?.[1] || status || '-'
}

function renderRoleChecks (roles, selected = ['user'], name = 'roles') {
  const selectedSet = new Set(selected)
  return roles.map(role => `
    <label class="admin-check admin-role-check">
      <input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(role.code)}" ${selectedSet.has(role.code) ? 'checked' : ''}>
      <span>${escapeHtml(role.name)} <small>${escapeHtml(role.code)}</small></span>
    </label>
  `).join('')
}

function quotaValue (quota, key, divisor = 1) {
  const value = quota?.[key]
  if (value === undefined || value === null || value === '') return ''
  return Number(value) / divisor
}

function userFilters (state, page) {
  return {
    ...state.adminUserFilters,
    page,
    limit: state.adminUsers?.limit || 20,
  }
}

async function reloadUsers (state, api, page = state.adminUsers?.page || 1) {
  state.adminUsers = await api.listUsers(userFilters(state, page))
}

export function renderUsersPage (state) {
  const collection = state.adminUsers || { items: [] }
  const users = collection.items || []
  const roles = state.roles || []
  const canManage = hasPermission(state, 'admin.user.manage')
  const canManageRoles = hasPermission(state, 'admin.role.manage')
  const filters = state.adminUserFilters || {}

  return `
    <div class="admin-user-system-stack">
      <section class="admin-panel">
        <div class="admin-panel-head">
          <div>
            <h2>用户管理</h2>
            <p class="admin-panel-description">查看账号状态、资源用量和角色，管理操作由服务端再次校验权限。</p>
          </div>
          <span class="admin-badge">${Number(collection.total || 0)} 个账号</span>
        </div>
        <form class="admin-filter-form" data-admin-users-filter>
          <label>
            <span>搜索</span>
            <input name="search" value="${escapeHtml(filters.search || '')}" placeholder="用户名或显示名称">
          </label>
          <label>
            <span>状态</span>
            <select name="status">
              <option value="">全部状态</option>
              ${USER_STATUS_OPTIONS.map(([value, label]) => `<option value="${value}" ${filters.status === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>角色</span>
            <select name="role">
              <option value="">全部角色</option>
              ${roles.map(role => `<option value="${escapeHtml(role.code)}" ${filters.role === role.code ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('')}
            </select>
          </label>
          <button type="submit">筛选</button>
        </form>
        <div class="admin-table-wrap">
          <table class="admin-table admin-user-table">
            <thead>
              <tr><th>账号</th><th>角色与状态</th><th>资源用量</th><th>最近活动</th><th>操作</th></tr>
            </thead>
            <tbody>
              ${users.map(user => `
                <tr>
                  <td>
                    <strong>${escapeHtml(user.displayName || user.username)}</strong>
                    <small class="admin-cell-secondary">@${escapeHtml(user.username)}</small>
                    ${user.emailMasked ? `<small class="admin-cell-secondary">${escapeHtml(user.emailMasked)}</small>` : ''}
                  </td>
                  <td>
                    <span class="admin-state-pill is-${escapeHtml(user.status)}">${escapeHtml(statusLabel(user.status))}</span>
                    <div class="admin-tag-list">${(user.roles || []).map(role => `<code>${escapeHtml(role)}</code>`).join('')}</div>
                    ${user.mustChangePassword ? '<small class="admin-warning-text">等待首次改密</small>' : ''}
                  </td>
                  <td>
                    <small class="admin-cell-secondary">KML ${Number(user.usage?.kmlCount || 0)} · 收藏 ${Number(user.usage?.favoriteCount || 0)}</small>
                    <small class="admin-cell-secondary">有效分享 ${Number(user.usage?.activeShareCount || 0)}</small>
                  </td>
                  <td>
                    <small class="admin-cell-secondary">登录：${escapeHtml(formatTime(user.lastLoginAt))}</small>
                    <small class="admin-cell-secondary">创建：${escapeHtml(formatTime(user.createdAt))}</small>
                  </td>
                  <td>
                    <div class="admin-row-actions">
                      ${canManage ? `
                        <button type="button" data-admin-action="reset-user-password" data-user-id="${escapeHtml(user.id)}">重置密码</button>
                        <button type="button" data-admin-action="revoke-user-sessions" data-user-id="${escapeHtml(user.id)}">强制退出</button>
                      ` : '<span>只读</span>'}
                    </div>
                    ${canManage ? `
                      <details class="admin-inline-details">
                        <summary>编辑资料与配额</summary>
                        <form class="admin-user-edit-form" data-admin-user-edit data-user-id="${escapeHtml(user.id)}">
                          <label><span>显示名称</span><input name="displayName" value="${escapeHtml(user.displayName || user.username)}" maxlength="80" required></label>
                          <label>
                            <span>账号状态</span>
                            <select name="status">${USER_STATUS_OPTIONS.map(([value, label]) => `<option value="${value}" ${user.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
                          </label>
                          <label class="admin-check"><input name="replaceEmail" type="checkbox"><span>更新邮箱（留空将清除）</span></label>
                          <label><span>新邮箱</span><input name="email" type="email" placeholder="当前：${escapeHtml(user.emailMasked || '未设置')}"></label>
                          <fieldset>
                            <legend>个人配额覆盖（留空则继承系统默认）</legend>
                            <label><span>KML 文件数</span><input name="maxKmlFiles" type="number" min="1" max="10000" value="${quotaValue(user.quota, 'maxKmlFiles')}"></label>
                            <label><span>单文件上限（MB）</span><input name="maxKmlFileMb" type="number" min="1" max="100" value="${quotaValue(user.quota, 'maxKmlFileBytes', 1024 * 1024)}"></label>
                            <label><span>单文件要素数</span><input name="maxFeaturesPerKml" type="number" min="1" max="1000000" value="${quotaValue(user.quota, 'maxFeaturesPerKml')}"></label>
                            <label><span>总要素数</span><input name="maxFeaturesPerUser" type="number" min="1" max="5000000" value="${quotaValue(user.quota, 'maxFeaturesPerUser')}"></label>
                            <label><span>回收站天数</span><input name="trashRetentionDays" type="number" min="1" max="3650" value="${quotaValue(user.quota, 'trashRetentionDays')}"></label>
                          </fieldset>
                          <button type="submit">保存资料与配额</button>
                        </form>
                      </details>
                    ` : ''}
                    ${canManageRoles ? `
                      <details class="admin-inline-details">
                        <summary>调整角色</summary>
                        <form class="admin-role-assignment" data-admin-user-roles data-user-id="${escapeHtml(user.id)}">
                          ${renderRoleChecks(roles, user.roles || [])}
                          <button type="submit">保存角色</button>
                        </form>
                      </details>
                    ` : ''}
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="5" class="admin-empty">没有符合条件的用户</td></tr>'}
            </tbody>
          </table>
        </div>
        ${renderPagination(collection, 'users')}
      </section>

      ${canManage ? `
        <section class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <h2>后台添加用户</h2>
              <p class="admin-panel-description">未填写密码时由系统生成高强度临时密码；新用户首次登录必须修改密码。</p>
            </div>
          </div>
          <form class="admin-form admin-user-create-form" data-admin-user-create autocomplete="off">
            <div class="admin-field-grid admin-field-grid-three">
              <label><span>用户名</span><input name="username" autocomplete="off" minlength="3" maxlength="32" required></label>
              <label><span>显示名称</span><input name="displayName" maxlength="80" required></label>
              <label><span>邮箱（可选）</span><input name="email" type="email" autocomplete="off"></label>
            </div>
            <label><span>指定临时密码（可选）</span><input name="password" type="password" autocomplete="new-password" minlength="12" placeholder="留空则由系统生成"></label>
            ${canManageRoles ? `
              <fieldset class="admin-permission-fieldset">
                <legend>初始角色</legend>
                <div class="admin-checkbox-grid">${renderRoleChecks(roles, ['user'])}</div>
              </fieldset>
            ` : ''}
            <button type="submit">创建用户</button>
          </form>
        </section>
      ` : ''}
    </div>
  `
}

export async function handleUsersSubmit ({ api, event, renderDashboard, setNotice, state }) {
  const filterForm = event.target.closest('[data-admin-users-filter]')
  if (filterForm) {
    event.preventDefault()
    const form = new FormData(filterForm)
    state.adminUserFilters = {
      search: String(form.get('search') || '').trim(),
      status: String(form.get('status') || ''),
      role: String(form.get('role') || ''),
    }
    try {
      setNotice('正在筛选用户...')
      await reloadUsers(state, api, 1)
      setNotice('')
    } catch (err) {
      setNotice('', err.message)
    }
    renderDashboard()
    return true
  }

  const createForm = event.target.closest('[data-admin-user-create]')
  if (createForm) {
    event.preventDefault()
    const form = new FormData(createForm)
    const body = {
      username: String(form.get('username') || '').trim(),
      displayName: String(form.get('displayName') || '').trim(),
      email: String(form.get('email') || '').trim(),
      roles: form.getAll('roles').map(String),
    }
    const password = String(form.get('password') || '')
    if (password) body.password = password
    if (!body.roles.length) body.roles = ['user']
    try {
      setNotice('正在创建用户...')
      const result = await withRecentReauth(api, () => api.createUser(body))
      await reloadUsers(state, api, 1)
      createForm.reset()
      setNotice('用户创建成功')
      renderDashboard()
      await showAlert(`用户名：${result.user?.username || body.username}\n临时密码：${result.temporaryPassword}\n请通过安全渠道交付，关闭后将不再显示。`, {
        title: '临时密码（仅显示一次）',
        confirmText: '我已安全保存',
      })
    } catch (err) {
      setNotice('', err.code === 'ACTION_CANCELLED' ? '' : err.message)
      renderDashboard()
    }
    return true
  }

  const roleForm = event.target.closest('[data-admin-user-roles]')
  if (roleForm) {
    event.preventDefault()
    const roles = new FormData(roleForm).getAll('roles').map(String)
    if (!roles.length) {
      setNotice('', '用户至少需要一个角色')
      return true
    }
    try {
      setNotice('正在更新用户角色...')
      await withRecentReauth(api, () => api.updateUserRoles(roleForm.dataset.userId, roles))
      await reloadUsers(state, api)
      setNotice('角色已更新，用户原有会话已失效')
    } catch (err) {
      setNotice('', err.code === 'ACTION_CANCELLED' ? '' : err.message)
    }
    renderDashboard()
    return true
  }

  const editForm = event.target.closest('[data-admin-user-edit]')
  if (editForm) {
    event.preventDefault()
    const data = new FormData(editForm)
    const quota = {}
    let quotaInvalid = false
    const quotaFields = [
      ['maxKmlFiles', 1],
      ['maxKmlFileBytes', 1024 * 1024, 'maxKmlFileMb'],
      ['maxFeaturesPerKml', 1],
      ['maxFeaturesPerUser', 1],
      ['trashRetentionDays', 1],
    ]
    quotaFields.forEach(([key, multiplier, formName = key]) => {
      const raw = String(data.get(formName) || '').trim()
      if (!raw) return
      const value = Number(raw)
      if (!Number.isFinite(value) || value <= 0) {
        quotaInvalid = true
        return
      }
      quota[key] = Math.round(value * multiplier)
    })
    if (quotaInvalid) {
      setNotice('', '个人配额必须为大于 0 的数字，或留空继承系统默认')
      return true
    }
    const body = {
      displayName: String(data.get('displayName') || '').trim(),
      status: String(data.get('status') || ''),
      quota,
    }
    if (data.get('replaceEmail')) body.email = String(data.get('email') || '').trim()
    try {
      setNotice('正在更新用户资料与配额...')
      await withRecentReauth(api, () => api.updateUser(editForm.dataset.userId, body))
      await reloadUsers(state, api)
      setNotice('用户资料与配额已更新')
    } catch (err) {
      setNotice('', err.code === 'ACTION_CANCELLED' ? '' : err.message)
    }
    renderDashboard()
    return true
  }

  return false
}

export async function handleUsersClick ({ api, event, renderDashboard, setNotice, showConfirm, state }) {
  const target = event.target.closest('[data-admin-action]')
  if (!target) return false
  const action = target.dataset.adminAction
  const userId = target.dataset.userId

  if (action === 'users-page') {
    const page = Number(target.dataset.page || 1)
    if (page < 1) return true
    try {
      setNotice('正在加载用户...')
      await reloadUsers(state, api, page)
      setNotice('')
    } catch (err) {
      setNotice('', err.message)
    }
    renderDashboard()
    return true
  }

  const user = (state.adminUsers?.items || []).find(item => item.id === userId)
  if (!user) return false

  if (action === 'reset-user-password') {
    if (!await showConfirm(`确认重置用户“${user.username}”的密码？其全部会话将立即失效。`, {
      title: '重置用户密码',
      confirmText: '确认重置',
    })) return true
    try {
      setNotice('正在重置密码...')
      const result = await withRecentReauth(api, () => api.resetUserPassword(userId))
      await reloadUsers(state, api)
      setNotice('密码已重置')
      renderDashboard()
      await showAlert(`临时密码：${result.temporaryPassword}\n请通过安全渠道交付，关闭后将不再显示。`, {
        title: '临时密码（仅显示一次）',
        confirmText: '我已安全保存',
      })
    } catch (err) {
      setNotice('', err.code === 'ACTION_CANCELLED' ? '' : err.message)
      renderDashboard()
    }
    return true
  }

  if (action === 'revoke-user-sessions') {
    if (!await showConfirm(`确认强制退出用户“${user.username}”的所有登录会话？`, {
      title: '强制退出',
      confirmText: '确认退出全部会话',
    })) return true
    try {
      setNotice('正在注销用户会话...')
      const result = await api.revokeUserSessions(userId)
      setNotice(`已注销 ${Number(result.revokedCount || 0)} 个会话`)
    } catch (err) {
      setNotice('', err.message)
    }
    renderDashboard()
    return true
  }

  return false
}
