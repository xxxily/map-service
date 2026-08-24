import { showAlert, showConfirm, showEditDialog } from '../../ui/dialog.js'
import { escapeHtml, formatTime, renderPagination } from '../utils.js'
import { MEDIA_DETAILS_GENERAL_DESCRIPTION_MAX_LENGTH } from '../../../shared/interaction-policy.js'

function collection (value) { return value || { items: [], total: 0, page: 1, limit: 20 } }
function can (state, permission) {
  const permissions = state.session?.user?.permissions || []
  return permissions.includes('system.super_admin') || permissions.includes(permission)
}
function filterForm (kind, filters) {
  const report = kind === 'reports'
  const fields = report
    ? `<label><span>状态</span><select name="status"><option value="">全部</option>${['new', 'triaged', 'investigating', 'actioned', 'dismissed', 'duplicate', 'closed'].map(v => `<option value="${v}" ${filters.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label><span>类型</span><select name="reportType"><option value="">全部</option>${['unsafe_content', 'illegal_content', 'copyright_takedown', 'privacy', 'misleading', 'other'].map(v => `<option value="${v}" ${filters.reportType === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label><span>优先级</span><select name="priority"><option value="">全部</option>${['low', 'normal', 'high', 'urgent'].map(v => `<option value="${v}" ${filters.priority === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label><span>范围</span><select name="scope"><option value="">全部</option>${['share', 'feature', 'media'].map(v => `<option value="${v}" ${filters.scope === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label><span>canonical Share ID</span><input name="canonicalShareId" value="${escapeHtml(filters.canonicalShareId || '')}" placeholder="可选"></label>`
    : `<label><span>审核状态</span><select name="moderationStatus"><option value="">全部</option>${['pending', 'approved', 'rejected', 'quarantined', 'spam', 'orphaned'].map(v => `<option value="${v}" ${filters.moderationStatus === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label><span>内容状态</span><select name="contentStatus"><option value="">全部</option>${['active', 'hidden', 'deleted'].map(v => `<option value="${v}" ${filters.contentStatus === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label><span>canonical Share ID</span><input name="canonicalShareId" value="${escapeHtml(filters.canonicalShareId || '')}" placeholder="可选"></label><label><span>Share Item ID</span><input name="shareItemId" value="${escapeHtml(filters.shareItemId || '')}" placeholder="可选"></label><label><span>Feature ID</span><input name="featureId" value="${escapeHtml(filters.featureId || '')}" placeholder="可选"></label>`
  return `<form class="admin-filter-form admin-filter-form-compact" data-interaction-filter="${kind}">${fields}<button type="submit">筛选</button><button type="button" class="admin-button-secondary" data-admin-action="reset-interaction-filter" data-filter-kind="${kind}">重置</button></form>`
}

function checked (value) { return value ? 'checked' : '' }

export function renderInteractionPolicyPage (state) {
  const response = state.interactionPolicy || {}
  const policy = response.policy || response
  const comments = policy.comments || {}
  const anonymous = comments.anonymous || {}
  const reports = policy.reports || {}
  const mediaDetails = policy.mediaDetails || {}
  const reportAnonymous = reports.anonymous || {}
  const canManage = can(state, 'admin.comment.policy.manage')
  return `<section class="admin-panel"><div class="admin-panel-head"><div><h2>留言与举报设置</h2><p class="admin-panel-description">控制公开留言、匿名提交和举报入口。保存时会保留未在此页面展示的审核策略字段。</p></div><span class="admin-badge">${response.published ? '已发布' : '未发布'}</span></div>${canManage ? `<form class="admin-form" data-interaction-policy-form>
    <label class="admin-check"><input type="checkbox" name="commentsEnabled" ${checked(comments.enabled !== false)}><span>启用留言</span></label>
    <label class="admin-check"><input type="checkbox" name="anonymousCommentsEnabled" ${checked(anonymous.enabled)}><span>允许匿名留言</span></label>
    <label><span>匿名联系方式要求</span><select name="anonymousContactRequirement">${['email_or_phone', 'email', 'phone', 'email_and_phone'].map(value => `<option value="${value}" ${anonymous.contactRequirement === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
    <label class="admin-check"><input type="checkbox" name="anonymousRequireConsent" ${checked(anonymous.requireConsent !== false)}><span>匿名留言必须同意相关条款</span></label>
    <label><span>留言最大长度</span><input type="number" name="commentsMaxLength" min="1" max="10000" value="${Number(comments.maxLength || 2000)}" required></label>
    <label class="admin-check"><input type="checkbox" name="commentsModerationRequired" ${checked(comments.moderationRequired !== false)}><span>留言提交后需要审核</span></label>
    <label class="admin-check"><input type="checkbox" name="reportsEnabled" ${checked(reports.enabled !== false)}><span>启用举报</span></label>
    <label class="admin-check"><input type="checkbox" name="anonymousReportsEnabled" ${checked(reportAnonymous.enabled !== false)}><span>允许匿名举报</span></label>
    <label><span>媒体详情通用说明</span><textarea name="mediaDetailsGeneralDescription" rows="4" maxlength="${MEDIA_DETAILS_GENERAL_DESCRIPTION_MAX_LENGTH}" placeholder="向访客说明媒体资源来源及举报渠道">${escapeHtml(mediaDetails.generalDescription || '')}</textarea></label>
    <button type="submit">保存留言与举报设置</button>
  </form>` : '<p class="admin-empty">当前账号没有修改策略的权限。</p>'}</section>`
}

export async function handleInteractionPolicySubmit ({ api, event, renderDashboard, setNotice, state }) {
  const form = event.target.closest('[data-interaction-policy-form]')
  if (!form) return false
  event.preventDefault()
  const response = state.interactionPolicy || {}
  const current = response.policy || response
  const currentComments = current.comments || {}
  const currentAnonymous = currentComments.anonymous || {}
  const currentReports = current.reports || {}
  const currentReportAnonymous = currentReports.anonymous || {}
  const currentMediaDetails = current.mediaDetails || {}
  const maxLength = Number(form.elements.commentsMaxLength.value)
  const mediaDetailsGeneralDescription = String(form.elements.mediaDetailsGeneralDescription.value || '').trim()
  if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 10000) {
    setNotice('', '留言最大长度必须是 1 到 10000 的整数')
    renderDashboard()
    return true
  }
  if (mediaDetailsGeneralDescription.length > MEDIA_DETAILS_GENERAL_DESCRIPTION_MAX_LENGTH) {
    setNotice('', `媒体详情通用说明不能超过 ${MEDIA_DETAILS_GENERAL_DESCRIPTION_MAX_LENGTH} 个字符`)
    renderDashboard()
    return true
  }
  const payload = {
    ...current,
    comments: {
      ...currentComments,
      enabled: form.elements.commentsEnabled.checked,
      anonymous: {
        ...currentAnonymous,
        enabled: form.elements.anonymousCommentsEnabled.checked,
        contactRequirement: form.elements.anonymousContactRequirement.value,
        requireConsent: form.elements.anonymousRequireConsent.checked,
      },
      maxLength,
      moderationRequired: form.elements.commentsModerationRequired.checked,
    },
    reports: {
      ...currentReports,
      enabled: form.elements.reportsEnabled.checked,
      anonymous: {
        ...currentReportAnonymous,
        enabled: form.elements.anonymousReportsEnabled.checked,
      },
    },
    mediaDetails: {
      ...currentMediaDetails,
      generalDescription: mediaDetailsGeneralDescription,
    },
  }
  try {
    const result = await api.updateInteractionPolicy(payload)
    state.interactionPolicy = { ...response, policy: payload, version: result?.version || response.version, published: true }
    setNotice('留言与举报设置已保存')
  } catch (error) {
    setNotice('', error.message)
  }
  renderDashboard()
  return true
}

export function renderInteractionCommentsPage (state) {
  const data = collection(state.interactionComments); const filters = state.interactionCommentFilters || {}
  return `<section class="admin-panel"><div class="admin-panel-head"><div><h2>留言审核</h2><p class="admin-panel-description">只展示管理权限范围内的留言；公开列表只包含 active + approved。</p></div><span class="admin-badge">${Number(data.total || 0)} 条</span></div>${filterForm('comments', filters)}<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>留言</th><th>资源</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>${(data.items || []).map(item => `<tr><td><strong>${escapeHtml(item.displayName || '访客')}</strong><small class="admin-cell-secondary">${escapeHtml(item.body || '')}</small></td><td><small>${escapeHtml(item.shareItemId || '-')}</small><small class="admin-cell-secondary">${escapeHtml(item.featureId || '-')}</small></td><td><span class="admin-state-pill">${escapeHtml(item.moderationStatus || '-')}</span><small class="admin-cell-secondary">${escapeHtml(item.contentStatus || '-')}</small></td><td>${escapeHtml(formatTime(item.createdAt))}</td><td><div class="admin-row-actions"><button type="button" data-admin-action="view-interaction-comment" data-comment-id="${escapeHtml(item.id)}">详情</button>${can(state, 'admin.comment.moderate') && item.moderationStatus !== 'approved' ? `<button type="button" data-admin-action="review-interaction-comment" data-comment-id="${escapeHtml(item.id)}">通过</button><button type="button" data-admin-action="reprocess-interaction-comment" data-comment-id="${escapeHtml(item.id)}">重审</button>` : ''}${can(state, 'admin.comment.moderate') ? `<button type="button" class="admin-button-danger" data-admin-action="delete-interaction-comment" data-comment-id="${escapeHtml(item.id)}">删除</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="5" class="admin-empty">暂无留言</td></tr>'}</tbody></table></div>${renderPagination(data, 'interaction-comments')}</section>`
}

export function renderInteractionReportsPage (state) {
  const data = collection(state.interactionReports); const filters = state.interactionReportFilters || {}
  return `<section class="admin-panel"><div class="admin-panel-head"><div><h2>举报工单</h2><p class="admin-panel-description">举报正文不会进入公开留言、关键词或 AI 审核流。</p></div><span class="admin-badge">${Number(data.total || 0)} 条</span></div>${filterForm('reports', filters)}<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>类型</th><th>目标</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>${(data.items || []).map(item => `<tr><td>${escapeHtml(item.type || '-')}</td><td><small>${escapeHtml(item.resourceRef?.scope || '-')}</small><small class="admin-cell-secondary">${escapeHtml(item.sharePublicIdSnapshot || '-')}</small></td><td><span class="admin-state-pill">${escapeHtml(item.status || '-')}</span><small class="admin-cell-secondary">${escapeHtml(item.priority || '-')}</small></td><td>${escapeHtml(formatTime(item.createdAt))}</td><td><div class="admin-row-actions"><button type="button" data-admin-action="view-interaction-report" data-report-id="${escapeHtml(item.id)}">详情</button>${can(state, 'admin.report.manage') ? `<button type="button" data-admin-action="action-interaction-report" data-report-id="${escapeHtml(item.id)}">处理</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="5" class="admin-empty">暂无举报工单</td></tr>'}</tbody></table></div>${renderPagination(data, 'interaction-reports')}</section>`
}

function queryFor (state, kind, page = 1) { return { ...(kind === 'reports' ? state.interactionReportFilters : state.interactionCommentFilters), page, limit: 20 } }

export async function handleInteractionSubmit ({ api, event, renderDashboard, setNotice, state }) {
  const form = event.target.closest('[data-interaction-filter]'); if (!form) return false
  event.preventDefault(); const kind = form.dataset.interactionFilter; const values = Object.fromEntries(new FormData(form).entries())
  if (kind === 'reports') { state.interactionReportFilters = values; state.interactionReports = await api.listInteractionReports(queryFor(state, kind)) }
  else { state.interactionCommentFilters = values; state.interactionComments = await api.listInteractionComments(queryFor(state, kind)) }
  setNotice('筛选已更新'); renderDashboard(); return true
}

export async function handleInteractionClick ({ api, event, renderDashboard, setNotice, showConfirm: confirmAction, state }) {
  const target = event.target.closest('[data-admin-action]'); if (!target) return false
  const action = target.dataset.adminAction
  try {
    if (action === 'interaction-comments-page') state.interactionComments = await api.listInteractionComments(queryFor(state, 'comments', target.dataset.page))
    if (action === 'interaction-reports-page') state.interactionReports = await api.listInteractionReports(queryFor(state, 'reports', target.dataset.page))
    if (action === 'reset-interaction-filter') { if (target.dataset.filterKind === 'reports') { state.interactionReportFilters = { status: '', reportType: '', priority: '', scope: '', canonicalShareId: '' }; state.interactionReports = await api.listInteractionReports(queryFor(state, 'reports')) } else { state.interactionCommentFilters = { moderationStatus: '', contentStatus: '', canonicalShareId: '', shareItemId: '', featureId: '' }; state.interactionComments = await api.listInteractionComments(queryFor(state, 'comments')) } }
    if (action === 'view-interaction-comment') { const detail = await api.getInteractionComment(target.dataset.commentId); state.interactionCommentDetail = detail; await showAlert(`留言：${detail.body || '-'}\n\n资源：${detail.featureId || '-'}\n状态：${detail.moderationStatus || '-'} / ${detail.contentStatus || '-'}\n提交时间：${formatTime(detail.createdAt)}`, { title: '留言详情' }) }
    if (action === 'review-interaction-comment') { await api.reviewInteractionComment(target.dataset.commentId, { moderationStatus: 'approved' }); state.interactionComments = await api.listInteractionComments(queryFor(state, 'comments')); setNotice('留言已通过') }
    if (action === 'reprocess-interaction-comment') { await api.reprocessInteractionComment(target.dataset.commentId); state.interactionComments = await api.listInteractionComments(queryFor(state, 'comments')); setNotice('留言已重新审核') }
    if (action === 'delete-interaction-comment' && await confirmAction('删除后留言不再公开显示。', { title: '删除留言' })) { await api.deleteInteractionComment(target.dataset.commentId); state.interactionComments = await api.listInteractionComments(queryFor(state, 'comments')); setNotice('留言已删除') }
    if (action === 'view-interaction-report') { const detail = await api.getInteractionReport(target.dataset.reportId); state.interactionReportDetail = detail; await showAlert(`类型：${detail.type || '-'}\n状态：${detail.status || '-'}\n范围：${detail.resourceRef?.scope || '-'}\n\n说明：${detail.description || '-'}\n\n证据：${detail.evidenceText || '-'}\n联系方式：${detail.contact || '-'}`, { title: '举报详情' }) }
    if (action === 'action-interaction-report') { const result = await showEditDialog({ title: '处理举报工单', fields: [{ name: 'action', label: '动作', type: 'select', options: [{ value: 'no_action', label: '驳回' }, { value: 'request_more_info', label: '补充信息' }, { value: 'escalate_legal', label: '升级法务' }, { value: 'pause_share', label: '暂停分享' }, { value: 'block_share', label: '封禁分享' }] }, { name: 'reason', label: '处理原因', type: 'textarea', required: true }], confirmText: '提交处理' }); if (result && await confirmAction('该处理会写入审计记录，分享级动作可能影响公开访问。继续吗？', { title: '确认举报处理' })) { await api.actionInteractionReport(target.dataset.reportId, result); state.interactionReports = await api.listInteractionReports(queryFor(state, 'reports')); setNotice('举报工单已更新') } }
  } catch (error) { setNotice('', error.message) }
  renderDashboard(); return true
}
