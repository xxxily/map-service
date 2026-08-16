import { showEditDialog } from '../../ui/dialog.js'
import { escapeHtml, formatTime, renderPagination } from '../utils.js'

const SHARE_STATUS_OPTIONS = [
  ['active', '有效'],
  ['paused', '已暂停'],
  ['blocked', '已封禁'],
  ['expired', '已过期'],
  ['revoked', '已撤销'],
  ['draft', '草稿'],
]

function statusLabel (status) {
  return SHARE_STATUS_OPTIONS.find(([value]) => value === status)?.[1] || status || '-'
}

function spatialModeLabel (share) {
  return share?.spatialAccess?.mode === 'kml_bounds' ? '限制在 KML 区域' : '不限制地图范围'
}

function spatialStatusLabel (share) {
  return {
    ready: '范围正常',
    empty: '范围为空',
    error: '范围异常',
    out_of_policy: '超出策略',
  }[share?.spatialAccess?.status] || '未启用'
}

function passwordAccessLabel (share) {
  if (!share?.passwordProtected) return '无密码'
  return share.passwordAccess?.ttlMode === 'unlimited' ? '不限授权' : '有限授权'
}

function spatialMetric (value, suffix) {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toFixed(1)} ${suffix}` : ''
}

function filtersForRequest (state, page) {
  return {
    ...state.shareFilters,
    page,
    limit: state.moderatedShares?.limit || 20,
  }
}

async function reloadShares (state, api, page = state.moderatedShares?.page || 1) {
  state.moderatedShares = await api.listUserShares(filtersForRequest(state, page))
}

export function renderShareModerationPage (state) {
  const collection = state.moderatedShares || { items: [] }
  const filters = state.shareFilters || {}
  return `
    <div class="admin-user-system-stack">
      <section class="admin-panel">
        <div class="admin-panel-head">
          <div>
            <h2>用户分享治理</h2>
            <p class="admin-panel-description">这里只展示治理所需元数据；查看实际 KML 内容仍需独立的数据读取权限。</p>
          </div>
          <span class="admin-badge">${Number(collection.total || 0)} 个分享</span>
        </div>
        <form class="admin-filter-form admin-filter-form-compact" data-admin-share-filter>
          <label><span>搜索</span><input name="search" value="${escapeHtml(filters.search || '')}" placeholder="分享标题或所有者"></label>
          <label>
            <span>状态</span>
            <select name="status">
              <option value="">全部状态</option>
              ${SHARE_STATUS_OPTIONS.map(([value, label]) => `<option value="${value}" ${filters.status === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </label>
          <button type="submit">筛选</button>
        </form>
        <div class="admin-table-wrap">
          <table class="admin-table admin-share-table">
            <thead><tr><th>分享</th><th>所有者</th><th>状态</th><th>空间与授权</th><th>访问与期限</th><th>操作</th></tr></thead>
            <tbody>
              ${(collection.items || []).map(share => `
                <tr>
                  <td>
                    <strong>${escapeHtml(share.title)}</strong>
                    <small class="admin-cell-secondary">${Number(share.itemCount || 0)} 个 KML · ${share.passwordProtected ? '有访问密码' : '无访问密码'}</small>
                    <small class="admin-cell-secondary">ID ${escapeHtml(share.id)}</small>
                  </td>
                  <td>
                    <strong>${escapeHtml(share.owner?.displayName || share.owner?.username || '-')}</strong>
                    <small class="admin-cell-secondary">@${escapeHtml(share.owner?.username || '-')}</small>
                  </td>
                  <td>
                    <span class="admin-state-pill is-${escapeHtml(share.status)}">${escapeHtml(statusLabel(share.status))}</span>
                    ${share.blockedReason ? `<small class="admin-warning-text">原因：${escapeHtml(share.blockedReason)}</small>` : ''}
                  </td>
                  <td>
                    <small class="admin-cell-secondary">地图：${escapeHtml(spatialModeLabel(share))}</small>
                    <small class="admin-cell-secondary">范围：${escapeHtml(spatialStatusLabel(share))}</small>
                    ${share.spatialAccess?.mode === 'kml_bounds'
                      ? `<small class="admin-cell-secondary">${escapeHtml([spatialMetric(share.spatialAccess.areaKm2, 'km²'), spatialMetric(share.spatialAccess.diagonalKm, 'km')].filter(Boolean).join(' · ') || '暂无范围摘要')}</small>`
                      : ''}
                    <small class="admin-cell-secondary">密码：${escapeHtml(passwordAccessLabel(share))}</small>
                  </td>
                  <td>
                    <small class="admin-cell-secondary">访问 ${Number(share.accessCount || 0)} 次</small>
                    <small class="admin-cell-secondary">最近：${escapeHtml(formatTime(share.lastAccessedAt))}</small>
                    <small class="admin-cell-secondary">到期：${escapeHtml(formatTime(share.expiresAt))}</small>
                  </td>
                  <td>
                    <div class="admin-row-actions">
                      ${share.status === 'blocked'
                        ? `<button type="button" data-admin-action="unblock-share" data-share-id="${escapeHtml(share.id)}">解除封禁</button>`
                        : share.status !== 'revoked'
                          ? `<button type="button" class="admin-button-danger" data-admin-action="block-share" data-share-id="${escapeHtml(share.id)}" data-share-title="${escapeHtml(share.title)}">封禁</button>`
                          : '<span>不可操作</span>'}
                    </div>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="6" class="admin-empty">没有符合条件的分享</td></tr>'}
            </tbody>
          </table>
        </div>
        ${renderPagination(collection, 'shares')}
      </section>
    </div>
  `
}

export async function handleShareModerationSubmit ({ api, event, renderDashboard, setNotice, state }) {
  const form = event.target.closest('[data-admin-share-filter]')
  if (!form) return false
  event.preventDefault()
  const data = new FormData(form)
  state.shareFilters = {
    search: String(data.get('search') || '').trim(),
    status: String(data.get('status') || ''),
  }
  try {
    setNotice('正在筛选分享...')
    await reloadShares(state, api, 1)
    setNotice('')
  } catch (err) {
    setNotice('', err.message)
  }
  renderDashboard()
  return true
}

export async function handleShareModerationClick ({ api, event, renderDashboard, setNotice, showConfirm, state }) {
  const target = event.target.closest('[data-admin-action]')
  if (!target) return false
  const action = target.dataset.adminAction

  if (action === 'shares-page') {
    const page = Number(target.dataset.page || 1)
    if (page < 1) return true
    try {
      setNotice('正在加载分享...')
      await reloadShares(state, api, page)
      setNotice('')
    } catch (err) {
      setNotice('', err.message)
    }
    renderDashboard()
    return true
  }

  if (action === 'block-share') {
    const result = await showEditDialog({
      title: `封禁分享：${target.dataset.shareTitle || ''}`,
      fields: [{ name: 'reason', label: '封禁原因', type: 'textarea' }],
      values: { reason: '' },
      confirmText: '确认封禁',
    })
    const reason = String(result?.reason || '').trim()
    if (!reason) return true
    try {
      setNotice('正在封禁分享...')
      await api.blockUserShare(target.dataset.shareId, reason)
      await reloadShares(state, api)
      setNotice('分享已封禁，公开访问立即失效')
    } catch (err) {
      setNotice('', err.message)
    }
    renderDashboard()
    return true
  }

  if (action === 'unblock-share') {
    if (!await showConfirm('解除封禁后，分享将进入暂停状态，由所有者决定是否恢复公开。', {
      title: '解除分享封禁',
      confirmText: '解除封禁',
    })) return true
    try {
      setNotice('正在解除封禁...')
      await api.unblockUserShare(target.dataset.shareId)
      await reloadShares(state, api)
      setNotice('已解除封禁，分享当前为暂停状态')
    } catch (err) {
      setNotice('', err.message)
    }
    renderDashboard()
    return true
  }

  return false
}
