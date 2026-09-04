import { escapeHtml } from '../utils.js'
import { withRecentReauth } from '../dialogs.js'

export const ADMIN_PERMISSION_CATALOG = Object.freeze([
  ['account.self.read', '查看个人账号'],
  ['account.self.update', '修改个人账号'],
  ['session.self.manage', '管理个人会话'],
  ['kml.own.read', '查看个人 KML'],
  ['kml.own.write', '管理个人 KML'],
  ['resource_collection.own.read', '查看个人资源集合'],
  ['resource_collection.own.write', '编辑个人资源集合'],
  ['resource_collection.own.manage', '管理个人资源集合'],
  ['resource_collection.any.read', '读取任意用户资源集合'],
  ['resource_collection.any.manage', '管理任意用户资源集合'],
  ['resource_collection.public.read', '读取公开资源集合'],
  ['share.own.manage', '管理个人分享'],
  ['favorite.own.manage', '管理个人收藏'],
  ['admin.overview.read', '查看后台概览'],
  ['admin.cache.manage', '管理缓存'],
  ['admin.precache.manage', '管理预缓存任务'],
  ['admin.layer.manage', '管理图源、图层和代理'],
  ['admin.public_kml.manage', '管理公共 KML 图层'],
  ['admin.share.moderate', '治理用户分享'],
  ['admin.audit.read', '查看审计日志'],
  ['admin.user.read', '查看用户列表'],
  ['admin.user.manage', '管理用户'],
  ['admin.role.manage', '管理角色和权限'],
  ['admin.registration.manage', '管理注册策略'],
  ['admin.security.manage', '管理安全策略'],
  ['admin.comment.read', '查看留言'],
  ['admin.comment.moderate', '审核和处理留言'],
  ['admin.comment.policy.manage', '管理留言策略'],
  ['admin.moderation.ai.manage', '管理 AI 审核配置'],
  ['admin.moderation.keyword.manage', '管理关键词审核规则'],
  ['admin.report.read', '查看内容举报'],
  ['admin.report.manage', '处理内容举报'],
  ['kml.any.read', '读取任意用户 KML'],
  ['kml.any.manage', '管理任意用户 KML'],
])

function permissionGroup (code) {
  if (code.startsWith('admin.')) return '后台管理'
  if (code.startsWith('kml.any.') || code.startsWith('resource_collection.any.') || code === 'resource_collection.public.read') return '跨用户数据'
  return '个人能力'
}

function renderPermissionChecks (selected = [], prefix = '') {
  const selectedSet = new Set(selected)
  const groups = new Map()
  ADMIN_PERMISSION_CATALOG.forEach(([code, name]) => {
    const group = permissionGroup(code)
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group).push([code, name])
  })
  return [...groups.entries()].map(([group, permissions]) => `
    <fieldset class="admin-permission-fieldset">
      <legend>${escapeHtml(group)}</legend>
      <div class="admin-checkbox-grid">
        ${permissions.map(([code, name]) => `
          <label class="admin-check admin-permission-check">
            <input type="checkbox" name="permissions" value="${escapeHtml(code)}" ${selectedSet.has(code) ? 'checked' : ''}>
            <span>${escapeHtml(name)} <small>${escapeHtml(code)}</small></span>
          </label>
        `).join('')}
      </div>
    </fieldset>
  `).join('')
}

function renderRoleSummary (role) {
  return `
    <article class="admin-role-card">
      <header>
        <div>
          <h3>${escapeHtml(role.name)}</h3>
          <code>${escapeHtml(role.code)}</code>
        </div>
        <span class="admin-state-pill">${role.builtIn ? '内置角色' : `${Number(role.userCount || 0)} 位用户`}</span>
      </header>
      <p>${escapeHtml(role.description || '暂无说明')}</p>
      <div class="admin-tag-list">
        ${(role.permissions || []).map(permission => `<code>${escapeHtml(permission)}</code>`).join('') || '<span>无权限</span>'}
      </div>
    </article>
  `
}

export function renderRolesPage (state) {
  const roles = state.roles || []
  return `
    <div class="admin-user-system-stack">
      <section class="admin-panel">
        <div class="admin-panel-head">
          <div>
            <h2>角色与权限</h2>
            <p class="admin-panel-description">内置角色由系统维护；自定义角色不能获得超级管理员根权限。</p>
          </div>
          <span class="admin-badge">${roles.length} 个角色</span>
        </div>
        <div class="admin-role-grid">
          ${roles.filter(role => role.builtIn).map(renderRoleSummary).join('') || '<p class="admin-empty">暂无内置角色数据</p>'}
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <div>
            <h2>自定义角色</h2>
            <p class="admin-panel-description">修改权限后，使用该角色的账号会话将失效并需重新登录。</p>
          </div>
        </div>
        <div class="admin-custom-role-list">
          ${roles.filter(role => !role.builtIn).map(role => `
            <form class="admin-role-editor" data-admin-role-edit data-role-id="${escapeHtml(role.id)}">
              <div class="admin-field-grid admin-field-grid-three">
                <label><span>角色代码</span><input value="${escapeHtml(role.code)}" disabled></label>
                <label><span>角色名称</span><input name="name" value="${escapeHtml(role.name)}" maxlength="80" required></label>
                <label><span>说明</span><input name="description" value="${escapeHtml(role.description || '')}" maxlength="200"></label>
              </div>
              ${renderPermissionChecks(role.permissions, role.id)}
              <div class="admin-form-actions">
                <button type="submit">保存角色</button>
                <button type="button" class="admin-button-danger" data-admin-action="delete-role" data-role-id="${escapeHtml(role.id)}" data-role-name="${escapeHtml(role.name)}" ${Number(role.userCount || 0) > 0 ? 'disabled title="请先迁移使用该角色的用户"' : ''}>删除角色</button>
              </div>
            </form>
          `).join('') || '<p class="admin-empty">尚未创建自定义角色</p>'}
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <div>
            <h2>创建自定义角色</h2>
            <p class="admin-panel-description">角色代码创建后保持稳定，用于接口契约和审计记录。</p>
          </div>
        </div>
        <form class="admin-form admin-role-editor" data-admin-role-create autocomplete="off">
          <div class="admin-field-grid admin-field-grid-three">
            <label><span>角色代码</span><input name="code" pattern="[a-z][a-z0-9._-]{2,31}" minlength="3" maxlength="32" required placeholder="例如 data_reviewer"></label>
            <label><span>角色名称</span><input name="name" maxlength="80" required></label>
            <label><span>说明</span><input name="description" maxlength="200"></label>
          </div>
          ${renderPermissionChecks([])}
          <button type="submit">创建角色</button>
        </form>
      </section>
    </div>
  `
}

function roleBody (form, includeCode = false) {
  const data = new FormData(form)
  const body = {
    name: String(data.get('name') || '').trim(),
    description: String(data.get('description') || '').trim(),
    permissions: data.getAll('permissions').map(String),
  }
  if (includeCode) body.code = String(data.get('code') || '').trim().toLowerCase()
  return body
}

export async function handleRolesSubmit ({ api, event, renderDashboard, setNotice, state }) {
  const createForm = event.target.closest('[data-admin-role-create]')
  if (createForm) {
    event.preventDefault()
    try {
      setNotice('正在创建角色...')
      await withRecentReauth(api, () => api.createRole(roleBody(createForm, true)))
      state.roles = await api.listRoles()
      setNotice('角色已创建')
    } catch (err) {
      setNotice('', err.code === 'ACTION_CANCELLED' ? '' : err.message)
    }
    renderDashboard()
    return true
  }

  const editForm = event.target.closest('[data-admin-role-edit]')
  if (editForm) {
    event.preventDefault()
    try {
      setNotice('正在保存角色...')
      await withRecentReauth(api, () => api.updateRole(editForm.dataset.roleId, roleBody(editForm)))
      state.roles = await api.listRoles()
      setNotice('角色已更新，受影响用户需重新登录')
    } catch (err) {
      setNotice('', err.code === 'ACTION_CANCELLED' ? '' : err.message)
    }
    renderDashboard()
    return true
  }

  return false
}

export async function handleRolesClick ({ api, event, renderDashboard, setNotice, showConfirm, state }) {
  const target = event.target.closest('[data-admin-action="delete-role"]')
  if (!target) return false
  if (!await showConfirm(`确认删除自定义角色“${target.dataset.roleName || ''}”？`, {
    title: '删除角色',
    confirmText: '确认删除',
  })) return true
  try {
    setNotice('正在删除角色...')
    await withRecentReauth(api, () => api.deleteRole(target.dataset.roleId))
    state.roles = await api.listRoles()
    setNotice('角色已删除')
  } catch (err) {
    setNotice('', err.code === 'ACTION_CANCELLED' ? '' : err.message)
  }
  renderDashboard()
  return true
}
