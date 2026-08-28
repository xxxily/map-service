import { showAlert, showChoiceDialog, showConfirm, showEditDialog } from '../../ui/dialog.js'
import { escapeHtml, formatTime, renderPagination } from '../utils.js'
import { MEDIA_DETAILS_GENERAL_DESCRIPTION_MAX_LENGTH } from '../../../shared/interaction-policy.js'
import { isValidInteractionAvatar } from '../../../shared/interaction-contracts.js'
import { DEFAULT_AI_PROMPT } from '../../../shared/interaction-ai.js'

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

const AI_LEVELS = ['normal', 'risk', 'violation', 'illegal_or_ip', 'spam', 'unknown']
const AI_ACTIONS = ['approve', 'review', 'reject', 'quarantine', 'spam']

function hasPermission (state, permission) {
  return can(state, permission)
}

function jsonText (value) {
  try { return JSON.stringify(value ?? {}, null, 2) } catch { return '{}' }
}

function renderCommentDetailHtml (detail = {}) {
  const authorType = detail.authorType === 'registered' ? '注册用户' : (detail.authorType === 'anonymous' ? '匿名用户' : (detail.authorType || '未知'))
  const registered = detail.authorRegistered ? '是' : '否'
  const avatar = String(detail.avatar || '')
  const safeAvatar = isValidInteractionAvatar(avatar) ? avatar : ''
  const avatarHtml = safeAvatar
    ? `<img src="${escapeHtml(safeAvatar)}" alt="" class="admin-comment-detail-avatar">`
    : '<span class="admin-comment-detail-avatar admin-comment-detail-avatar-fallback" aria-hidden="true">◎</span>'
  const field = (label, value) => `<div class="admin-comment-detail-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value || '-'))}</dd></div>`
  return `<div class="admin-comment-detail" data-admin-comment-detail>
    <div class="admin-comment-detail-author">${avatarHtml}<div><strong>${escapeHtml(detail.displayName || '访客')}</strong><div class="admin-cell-secondary">${escapeHtml(authorType)} · 已注册：${registered}${detail.gender ? ` · ${escapeHtml(detail.gender)}` : ''}</div></div></div>
    <dl class="admin-comment-detail-grid">
      ${field('审核状态', detail.moderationStatus)}${field('内容状态', detail.contentStatus)}${field('风险等级', detail.moderationLevel)}${field('提交时间', formatTime(detail.createdAt))}
      ${field('分享 ID', detail.canonicalShareId || detail.sharePublicId)}${field('分享公开标识', detail.sharePublicId)}${field('KML', detail.kmlName ? `${detail.kmlName}${detail.shareItemId ? `（${detail.shareItemId}）` : ''}` : detail.shareItemId)}${field('点位/要素', detail.featureName ? `${detail.featureName}${detail.featureId ? `（${detail.featureId}）` : ''}` : detail.featureId)}
      ${field('父留言 ID', detail.parentId)}${field('联系方式', detail.hasContact ? (detail.contactType || '已提供') : '未提供')}${field('法律保留', detail.legalHold ? '是' : '否')}${field('更新时间', formatTime(detail.updatedAt))}
    </dl>
    <section class="admin-comment-detail-body"><h3>留言内容</h3><p>${escapeHtml(detail.body || '-')}</p></section>
  </div>`
}

function providerForm (provider = {}, canManage = false) {
  const isNew = !provider.id
  const buttonLabel = isNew ? '新增 provider' : '保存 provider'
  return `<form class="admin-form admin-ai-provider-form" data-interaction-ai-provider-form>
    <div class="admin-panel-head"><div><h3>${isNew ? '新增 AI provider' : escapeHtml(provider.name || provider.id)}</h3><p class="admin-panel-description">直接填写 API Key；服务端只保存加密密文，列表不会回显。</p></div>${provider.health ? `<span class="admin-state-pill">${escapeHtml(provider.health)}</span>` : ''}</div>
    <div class="admin-field-grid admin-field-grid-three">
      <label><span>ID</span><input name="id" value="${escapeHtml(provider.id || '')}" maxlength="100" ${isNew ? 'required' : 'readonly'}></label>
      <label><span>名称</span><input name="name" value="${escapeHtml(provider.name || '')}" maxlength="120" required></label>
      <label><span>协议适配器</span><select name="adapterId"><option value="openai-compatible" ${provider.adapterId === 'openai-compatible' || !provider.adapterId ? 'selected' : ''}>openai-compatible</option></select></label>
      <label><span>HTTPS endpoint</span><input name="endpoint" type="url" value="${escapeHtml(provider.endpoint || '')}" placeholder="https://ai.example.com/v1/chat/completions" required></label>
      <label><span>模型</span><input name="model" value="${escapeHtml(provider.model || '')}" maxlength="160" required></label>
      <label><span>API Key${isNew ? '' : '（留空保持不变）'}</span><input name="apiKey" type="password" value="" placeholder="输入 provider API Key" ${isNew ? 'required' : ''} autocomplete="new-password"></label>
      <label><span>超时（毫秒）</span><input name="timeoutMs" type="number" min="100" max="120000" value="${Number(provider.timeoutMs || 3000)}" required></label>
      <label><span>最大尝试次数</span><input name="maxAttempts" type="number" min="1" max="4" value="${Number(provider.maxAttempts || 2)}" required></label>
      <label><span>每日预算（0=不限）</span><input name="dailyBudget" type="number" min="0" value="${Number(provider.dailyBudget || 0)}" required></label>
      <label><span>并发数</span><input name="maxConcurrency" type="number" min="1" max="128" value="${Number(provider.maxConcurrency || 2)}" required></label>
    </div>
    <label class="admin-check"><input type="checkbox" name="enabled" ${checked(provider.requestedEnabled !== false)}><span>请求启用（修改后需重新健康验证）</span></label>
    <label class="admin-check"><input type="checkbox" name="isDefault" ${checked(provider.isDefault)}><span>保存后设为默认 provider</span></label>
    ${canManage ? `<div class="admin-form-actions"><button type="submit">${buttonLabel}</button>${!isNew ? `<button type="button" class="admin-button-secondary" data-admin-action="verify-interaction-ai-provider" data-provider-id="${escapeHtml(provider.id)}">健康验证</button><button type="button" class="admin-button-secondary" data-admin-action="default-interaction-ai-provider" data-provider-id="${escapeHtml(provider.id)}">设为默认</button>` : ''}</div>` : ''}
  </form>`
}

function renderKeywordRulesEditor (state, canManage) {
  const keywords = state.interactionKeywords || {}
  const rules = Array.isArray(keywords.rules) ? keywords.rules : []
  const preview = state.interactionKeywordPreview
  return `<section class="admin-panel"><div class="admin-panel-head"><div><h2>关键词规则</h2><p class="admin-panel-description">规则先于 AI 执行；举报正文不会进入此流程。通配符仅支持受控的 <code>*</code>。</p></div><span class="admin-badge">${keywords.published ? `v${Number(keywords.version || 0)}` : '未发布'}</span></div>${canManage ? `<form class="admin-form" data-interaction-keywords-form><label><span>规则 JSON</span><textarea name="rulesJson" rows="12" spellcheck="false">${escapeHtml(jsonText(rules))}</textarea></label><label><span>变更原因</span><input name="changeReason" maxlength="200" required placeholder="说明本次规则调整原因"></label><div class="admin-form-actions"><button type="submit">发布关键词版本</button><button type="button" class="admin-button-secondary" data-admin-action="replay-interaction-moderation-events">重新入队失败审核事件</button></div></form><form class="admin-form admin-form-compact" data-interaction-keyword-preview-form><label><span>规则试运行文本</span><textarea name="previewText" rows="3" maxlength="10000" placeholder="输入一段测试文本，不会写入留言或审计原文"></textarea></label><button type="submit" class="admin-button-secondary">试运行当前草稿规则</button></form>${preview ? `<div class="admin-preview-box"><strong>试运行结果：${escapeHtml(preview.level || 'unknown')} / ${escapeHtml(preview.action || 'review')}</strong><span>命中 ${Number(preview.matches?.length || 0)} 条规则；版本：${escapeHtml(String(preview.keywordPolicyVersion || '草稿'))}</span></div>` : ''}` : '<p class="admin-empty">当前账号没有修改关键词规则的权限。</p>'}</section>`
}

function renderPromptVersionsEditor (state, canManage) {
  const data = state.interactionAiPrompts || {}
  const versions = Array.isArray(data.versions) ? data.versions : []
  const active = versions.find(item => item.active) || versions[0] || {}
  return `<section class="admin-panel"><div class="admin-panel-head"><div><h2>提示词</h2><p class="admin-panel-description">直接编辑审核规则；发布时服务端自动生成摘要和稳定版本号，并保留历史版本。</p></div><span class="admin-badge">当前：${escapeHtml(data.activeVersion || '未登记')}</span></div>${canManage ? `<form class="admin-form admin-form-compact" data-interaction-ai-prompt-form><label><span>提示词正文</span><textarea name="promptText" rows="14" maxlength="20000" required>${escapeHtml(active.promptText || DEFAULT_AI_PROMPT)}</textarea></label><button type="submit">发布并设为当前版本</button></form>` : ''}<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>版本</th><th>摘要</th><th>状态</th><th>时间</th></tr></thead><tbody>${versions.map(item => `<tr><td>${escapeHtml(item.version)}</td><td><code>${escapeHtml(item.promptHash || '-')}</code></td><td>${item.active ? '当前' : '历史'}</td><td>${escapeHtml(formatTime(item.createdAt))}</td></tr>`).join('') || '<tr><td colspan="4" class="admin-empty">暂无已登记版本（运行时使用内置版本）</td></tr>'}</tbody></table></div></section>`
}

function renderArtalkMirrorPanel (state, canManage) {
  const data = state.artalkStatus || {}
  const outbox = data.outbox || {}
  const projections = data.projections || {}
  return `<section class="admin-panel"><div class="admin-panel-head"><div><h2>Artalk 镜像</h2><p class="admin-panel-description">内部留言审核结果是唯一事实源；Artalk 只作为受控镜像，故障不会阻塞留言或举报。</p></div><span class="admin-badge">${data.enabled === true ? (data.configured ? '已启用' : '配置缺失') : '已关闭'}</span></div><div class="admin-stat-row"><div><strong>${Number(outbox.pending || 0)}</strong><span>待处理事件</span></div><div><strong>${Number(outbox.failed || 0)}</strong><span>失败事件</span></div><div><strong>${Number(projections.visible || 0)}</strong><span>可见镜像</span></div><div><strong>${Number(projections.failed || 0)}</strong><span>失败投影</span></div></div>${canManage ? `<div class="admin-form-actions"><button type="button" data-admin-action="verify-artalk">连接验证</button><button type="button" class="admin-button-secondary" data-admin-action="drain-artalk">排空并强制校准</button></div>` : ''}</section>`
}

export function renderInteractionAiPage (state) {
  const policyResponse = state.interactionPolicy || {}
  const aiResponse = state.interactionAiSettings || {}
  const policy = policyResponse.policy || policyResponse
  const moderation = policy.moderation || {}
  const ai = aiResponse.ai || moderation.ai || {}
  const actions = aiResponse.actions || moderation.actions || {}
  const autoApproveLevels = aiResponse.autoApproveLevels || moderation.autoApproveLevels || []
  const providersResponse = state.interactionAiProviders || {}
  const providers = Array.isArray(providersResponse.providers) ? providersResponse.providers : []
  const canAi = hasPermission(state, 'admin.moderation.ai.manage')
  const canKeywords = hasPermission(state, 'admin.moderation.keyword.manage')
  const canArtalk = hasPermission(state, 'admin.comment.policy.manage')
  const tabs = [
    { id: 'runtime', label: '运行配置', visible: canAi },
    { id: 'providers', label: 'Provider', visible: canAi },
    { id: 'prompt', label: '提示词', visible: canAi },
    { id: 'keywords', label: '关键词规则', visible: canKeywords },
    { id: 'mirror', label: '外部镜像', visible: canArtalk || Boolean(state.artalkStatus) },
  ].filter(tab => tab.visible)
  const activeTab = tabs.some(tab => tab.id === state.interactionAiTab)
    ? state.interactionAiTab
    : (tabs[0]?.id || 'runtime')
  state.interactionAiTab = activeTab
  const tabButton = tab => `<button id="admin-interaction-ai-tab-${tab.id}" type="button" class="admin-settings-tab ${activeTab === tab.id ? 'is-active' : ''}" role="tab" aria-selected="${activeTab === tab.id}" aria-controls="admin-interaction-ai-panel-${tab.id}" tabindex="${activeTab === tab.id ? '0' : '-1'}" data-admin-interaction-tab="${tab.id}">${escapeHtml(tab.label)}</button>`
  const tabPanel = (id, content) => `<div id="admin-interaction-ai-panel-${id}" class="admin-settings-tabpanel" role="tabpanel" aria-labelledby="admin-interaction-ai-tab-${id}" ${activeTab === id ? '' : 'hidden'}>${content}</div>`
  const runtimePanel = `<section class="admin-panel"><div class="admin-panel-head"><div><h2>AI 审核运行配置</h2><p class="admin-panel-description">AI 只提供建议，人工审核仍是最终权威；unknown、超时和错误始终进入人工复核。</p></div><span class="admin-badge">${ai.enabled === true ? '已开启' : '已关闭'}</span></div>${canAi ? `<form class="admin-form" data-interaction-ai-settings-form>
      <label class="admin-check"><input type="checkbox" name="aiEnabled" ${checked(ai.enabled === true)}><span>启用异步 AI 审核</span></label>
      <div class="admin-field-grid admin-field-grid-three">
        <label><span>运行 provider</span><select name="providerId"><option value="">使用默认 provider</option>${providers.map(provider => `<option value="${escapeHtml(provider.id)}" ${String(ai.providerId || '') === String(provider.id) ? 'selected' : ''}>${escapeHtml(provider.name || provider.id)}</option>`).join('')}</select></label>
        <label><span>提示词版本</span><input name="promptVersion" value="${escapeHtml(ai.promptVersion || 'interaction-moderation-v1')}" readonly aria-readonly="true"></label>
        <label><span>策略版本标识</span><input name="policyVersion" value="${escapeHtml(ai.policyVersion || ai.promptVersion || 'interaction-moderation-v1')}" maxlength="64" required></label>
        <label><span>超时（毫秒）</span><input name="timeoutMs" type="number" min="100" max="120000" value="${Number(ai.timeoutMs || 3000)}" required></label>
        <label><span>最大尝试次数</span><input name="maxAttempts" type="number" min="1" max="4" value="${Number(ai.maxAttempts || 2)}" required></label>
        <label><span>每日总预算（0=不限）</span><input name="dailyBudget" type="number" min="0" value="${Number(ai.dailyBudget || 0)}" required></label>
        <label><span>最大并发数</span><input name="maxConcurrency" type="number" min="1" max="128" value="${Number(ai.maxConcurrency || 2)}" required></label>
      </div>
      <fieldset><legend>等级到动作</legend><div class="admin-checkbox-grid">${AI_LEVELS.map(level => `<label><span>${level}</span><select name="action_${level}">${AI_ACTIONS.map(action => `<option value="${action}" ${String(actions[level] || (level === 'normal' ? 'approve' : 'review')) === action ? 'selected' : ''}>${action}</option>`).join('')}</select></label>`).join('')}</div></fieldset>
      <fieldset><legend>允许自动放行的等级</legend><div class="admin-checkbox-grid">${AI_LEVELS.filter(level => level !== 'unknown').map(level => `<label class="admin-check"><input type="checkbox" name="autoApproveLevels" value="${level}" ${checked(Array.isArray(autoApproveLevels) && autoApproveLevels.includes(level))}><span>${level}</span></label>`).join('')}</div><p class="admin-panel-description">unknown、illegal_or_ip 不允许自动放行。</p></fieldset>
      <div class="admin-form-actions"><button type="submit">保存 AI 审核设置</button><button type="button" class="admin-button-secondary" data-admin-action="preview-interaction-ai-impact">查看影响预览</button><button type="button" class="admin-button-secondary" data-admin-action="replay-interaction-moderation-events">重新入队失败审核事件</button></div>
    </form>` : '<p class="admin-empty">当前账号没有修改 AI 配置的权限。</p>'}</section>`
  const providersPanel = `<section class="admin-panel"><div class="admin-panel-head"><div><h2>AI provider</h2><p class="admin-panel-description">endpoint 必须是 HTTPS 且命中服务端 allowlist；健康验证只发送探针，不发送真实留言。</p></div><span class="admin-badge">默认：${escapeHtml(providersResponse.defaultProviderId || '未设置')}</span></div>${canAi ? `${providers.map(provider => providerForm(provider, true)).join('')}${providerForm({}, true)}` : '<p class="admin-empty">当前账号没有管理 provider 的权限。</p>'}</section>`
  const impactPanel = state.interactionAiImpact ? `<section class="admin-panel admin-preview-box"><h2>最近影响预览</h2><p>扫描 ${Number(state.interactionAiImpact.scannedComments || 0)} 条留言，待审 ${Number(state.interactionAiImpact.pendingReview || 0)} 条，预计动作变化 ${Number(state.interactionAiImpact.automaticActionChanges || 0)} 条，涉及分享 ${Number(state.interactionAiImpact.affectedShares || 0)} 个。</p><p>失败事件 ${Number(state.interactionAiImpact.outbox?.failed || 0)} 条；历史重扫需显式创建任务，系统不会自动重写历史状态。</p></section>` : ''
  return `<div class="admin-user-system-stack"><div class="admin-settings-tabs" role="tablist" aria-label="AI 审核设置分类">${tabs.map(tabButton).join('')}</div>${tabPanel('runtime', `${runtimePanel}${impactPanel}`)}${tabPanel('providers', providersPanel)}${tabPanel('prompt', renderPromptVersionsEditor(state, canAi))}${tabPanel('keywords', renderKeywordRulesEditor(state, canKeywords))}${tabPanel('mirror', canArtalk || state.artalkStatus ? renderArtalkMirrorPanel(state, canArtalk) : '')}</div>`
}

export async function handleInteractionAiSubmit ({ api, event, renderDashboard, setNotice, state }) {
  const settingsForm = event.target.closest('[data-interaction-ai-settings-form]')
  if (settingsForm) {
    event.preventDefault()
    const currentResponse = state.interactionAiSettings || {}
    const currentAi = currentResponse.ai || {}
    const values = Object.fromEntries(new FormData(settingsForm).entries())
    const maxAttempts = Number(values.maxAttempts)
    const timeoutMs = Number(values.timeoutMs)
    const dailyBudget = Number(values.dailyBudget)
    const maxConcurrency = Number(values.maxConcurrency)
    if (![maxAttempts, timeoutMs, dailyBudget, maxConcurrency].every(Number.isFinite) || maxAttempts < 1 || maxAttempts > 4 || timeoutMs < 100 || timeoutMs > 120000 || dailyBudget < 0 || maxConcurrency < 1 || maxConcurrency > 128) {
      setNotice('', 'AI 运行参数不合法')
      renderDashboard()
      return true
    }
    const actions = {}
    AI_LEVELS.forEach(level => { actions[level] = settingsForm.elements[`action_${level}`].value })
    actions.unknown = 'review'
    actions.illegal_or_ip = ['review', 'quarantine'].includes(actions.illegal_or_ip) ? actions.illegal_or_ip : 'quarantine'
    const autoApproveLevels = [...settingsForm.querySelectorAll('input[name="autoApproveLevels"]:checked')].map(input => input.value).filter(level => level !== 'unknown' && level !== 'illegal_or_ip')
    const payload = { ai: { ...currentAi, enabled: settingsForm.elements.aiEnabled.checked, providerId: String(values.providerId || '').trim(), promptVersion: String(values.promptVersion || '').trim(), policyVersion: String(values.policyVersion || '').trim(), timeoutMs, maxAttempts, dailyBudget, maxConcurrency }, actions, autoApproveLevels }
    try {
      if (typeof api.previewInteractionAiImpact === 'function') {
        const impact = await api.previewInteractionAiImpact(payload)
        state.interactionAiImpact = impact
        const proceed = await showConfirm(`本次设置将扫描 ${Number(impact.scannedComments || 0)} 条留言，预计影响 ${Number(impact.automaticActionChanges || 0)} 条、${Number(impact.affectedShares || 0)} 个分享。继续发布吗？`, { title: '确认 AI 策略影响' })
        if (!proceed) {
          setNotice('已取消发布，影响预览已保留')
          renderDashboard()
          return true
        }
      }
      const result = await api.updateInteractionAiSettings(payload)
      state.interactionAiSettings = { ...currentResponse, ...result, ai: payload.ai, actions, autoApproveLevels, version: result?.version || currentResponse.version, published: true }
      setNotice('AI 审核设置已保存')
    } catch (error) { setNotice('', error.message) }
    renderDashboard()
    return true
  }
  const providerFormNode = event.target.closest('[data-interaction-ai-provider-form]')
  if (providerFormNode) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(providerFormNode).entries())
    const body = { ...values, enabled: providerFormNode.elements.enabled.checked, isDefault: providerFormNode.elements.isDefault.checked, timeoutMs: Number(values.timeoutMs), maxAttempts: Number(values.maxAttempts), dailyBudget: Number(values.dailyBudget), maxConcurrency: Number(values.maxConcurrency) }
    if (!body.apiKey) delete body.apiKey
    try {
      state.interactionAiProviders = await (values.id && providerFormNode.elements.id.readOnly ? api.updateInteractionAiProvider(body) : api.createInteractionAiProvider(body))
      setNotice('AI provider 配置已保存；如配置有变化请重新健康验证')
    } catch (error) { setNotice('', error.message) }
    renderDashboard()
    return true
  }
  const keywordsForm = event.target.closest('[data-interaction-keywords-form]')
  if (keywordsForm) {
    event.preventDefault()
    try {
      const rules = JSON.parse(keywordsForm.elements.rulesJson.value || '[]')
      if (!Array.isArray(rules)) throw new Error('规则 JSON 必须是数组')
      if (typeof api.previewInteractionAiImpact === 'function') {
        const impact = await api.previewInteractionAiImpact({ rules })
        state.interactionAiImpact = impact
        const proceed = await showConfirm(`规则草案命中 ${Number(impact.draftMatchedComments || 0)} 条历史留言，预计动作变化 ${Number(impact.automaticActionChanges || 0)} 条、涉及 ${Number(impact.affectedShares || 0)} 个分享。历史留言不会自动重扫，继续发布吗？`, { title: '确认关键词规则影响' })
        if (!proceed) {
          setNotice('已取消发布，影响预览已保留')
          renderDashboard()
          return true
        }
      }
      state.interactionKeywords = await api.updateInteractionKeywords({ rules, changeReason: keywordsForm.elements.changeReason.value })
      setNotice('关键词规则已发布')
    } catch (error) { setNotice('', error.message) }
    renderDashboard()
    return true
  }
  const keywordPreviewForm = event.target.closest('[data-interaction-keyword-preview-form]')
  if (keywordPreviewForm) {
    event.preventDefault()
    try {
      const currentRules = Array.isArray(state.interactionKeywords?.rules) ? state.interactionKeywords.rules : []
      state.interactionKeywordPreview = await api.previewInteractionKeywords({
        text: keywordPreviewForm.elements.previewText.value,
        rules: currentRules,
      })
      setNotice('规则试运行完成，不会写入留言或审计原文')
    } catch (error) { setNotice('', error.message) }
    renderDashboard()
    return true
  }
  const promptForm = event.target.closest('[data-interaction-ai-prompt-form]')
  if (promptForm) {
    event.preventDefault()
    try {
      state.interactionAiPrompts = await api.createInteractionAiPrompt({
        promptText: promptForm.elements.promptText.value,
      })
      setNotice('提示词版本已发布')
    } catch (error) { setNotice('', error.message) }
    renderDashboard()
    return true
  }
  return false
}

export async function handleInteractionAiClick ({ api, event, renderDashboard, setNotice, state }) {
  const tabTarget = event.target.closest('[data-admin-interaction-tab]')
  if (tabTarget) {
    state.interactionAiTab = String(tabTarget.dataset.adminInteractionTab || 'runtime')
    renderDashboard()
    return true
  }
  const target = event.target.closest('[data-admin-action]')
  if (!target) return false
  const action = target.dataset.adminAction
  try {
    if (action === 'verify-interaction-ai-provider') {
      state.interactionAiProviders = await api.verifyInteractionAiProvider(target.dataset.providerId)
      setNotice('AI provider 健康验证通过')
    }
    if (action === 'default-interaction-ai-provider') {
      state.interactionAiProviders = await api.setDefaultInteractionAiProvider(target.dataset.providerId)
      setNotice('默认 AI provider 已更新')
    }
    if (action === 'preview-interaction-ai-impact') {
      const currentResponse = state.interactionAiSettings || {}
      const currentAi = currentResponse.ai || {}
      state.interactionAiImpact = await api.previewInteractionAiImpact({ ai: currentAi })
      setNotice('AI 策略影响预览已生成')
    }
    if (action === 'replay-interaction-moderation-events') {
      const result = await api.replayInteractionModerationEvents({ limit: 20 })
      setNotice(`已重新入队 ${Number(result.replayed || 0)} 条失败审核事件`)
    }
    if (action === 'verify-artalk') {
      state.artalkStatus = await api.verifyArtalk()
      setNotice(state.artalkStatus.ok === true ? 'Artalk 连接验证通过' : (state.artalkStatus.error || 'Artalk 连接验证失败'))
    }
    if (action === 'drain-artalk') {
      const result = await api.drainArtalk({ limit: 20, reconcileLimit: 100, force: true })
      state.artalkStatus = await api.artalkStatus()
      setNotice(`Artalk 已处理 ${Number(result.sent || 0)} 条事件并校准 ${Number(result.reconciled || 0)} 条留言`)
    }
  } catch (error) { setNotice('', error.message) }
  renderDashboard()
  return true
}

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
  return `<section class="admin-panel"><div class="admin-panel-head"><div><h2>留言审核</h2><p class="admin-panel-description">只展示管理权限范围内的留言；公开列表只包含 active + approved。</p></div><span class="admin-badge">${Number(data.total || 0)} 条</span></div>${filterForm('comments', filters)}<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>留言</th><th>资源</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>${(data.items || []).map(item => `<tr><td><strong>${escapeHtml(item.displayName || '访客')}</strong><small class="admin-cell-secondary">${escapeHtml(item.body || '')}</small></td><td><small>${escapeHtml(item.shareItemId || '-')}</small><small class="admin-cell-secondary">${escapeHtml(item.featureId || '-')}</small></td><td><span class="admin-state-pill">${escapeHtml(item.moderationStatus || '-')}</span><small class="admin-cell-secondary">${escapeHtml(item.contentStatus || '-')}</small></td><td>${escapeHtml(formatTime(item.createdAt))}</td><td><div class="admin-row-actions"><button type="button" data-admin-action="view-interaction-comment" data-comment-id="${escapeHtml(item.id)}">详情</button>${can(state, 'admin.comment.moderate') && item.moderationStatus !== 'approved' ? `<button type="button" data-admin-action="review-interaction-comment" data-comment-id="${escapeHtml(item.id)}">通过</button><button type="button" data-admin-action="reprocess-interaction-comment" data-comment-id="${escapeHtml(item.id)}">重审</button>` : ''}${can(state, 'admin.moderation.ai.manage') ? `<button type="button" class="admin-button-secondary" data-admin-action="replay-interaction-ai" data-comment-id="${escapeHtml(item.id)}">AI 重放</button>` : ''}${can(state, 'admin.comment.moderate') ? `<button type="button" class="admin-button-danger" data-admin-action="delete-interaction-comment" data-comment-id="${escapeHtml(item.id)}">删除</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="5" class="admin-empty">暂无留言</td></tr>'}</tbody></table></div>${renderPagination(data, 'interaction-comments')}</section>`
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
    if (action === 'view-interaction-comment') {
      const detail = await api.getInteractionComment(target.dataset.commentId)
      state.interactionCommentDetail = detail
      await showChoiceDialog({
        title: '留言详情',
        trustedMessageHtml: renderCommentDetailHtml(detail),
        choices: [{ text: '关闭', value: 'close', class: 'app-dialog-primary' }],
        dismissible: true,
      })
    }
    if (action === 'review-interaction-comment') { await api.reviewInteractionComment(target.dataset.commentId, { moderationStatus: 'approved' }); state.interactionComments = await api.listInteractionComments(queryFor(state, 'comments')); setNotice('留言已通过') }
    if (action === 'reprocess-interaction-comment') { await api.reprocessInteractionComment(target.dataset.commentId); state.interactionComments = await api.listInteractionComments(queryFor(state, 'comments')); setNotice('留言已重新审核') }
    if (action === 'replay-interaction-ai') { await api.replayInteractionAiReview(target.dataset.commentId); state.interactionComments = await api.listInteractionComments(queryFor(state, 'comments')); setNotice('AI 审核已重放并追加决策记录') }
    if (action === 'delete-interaction-comment' && await confirmAction('删除后留言不再公开显示。', { title: '删除留言' })) { await api.deleteInteractionComment(target.dataset.commentId); state.interactionComments = await api.listInteractionComments(queryFor(state, 'comments')); setNotice('留言已删除') }
    if (action === 'view-interaction-report') { const detail = await api.getInteractionReport(target.dataset.reportId); state.interactionReportDetail = detail; await showAlert(`类型：${detail.type || '-'}\n状态：${detail.status || '-'}\n范围：${detail.resourceRef?.scope || '-'}\n\n说明：${detail.description || '-'}\n\n证据：${detail.evidenceText || '-'}\n联系方式：${detail.contact || '-'}`, { title: '举报详情' }) }
    if (action === 'action-interaction-report') { const result = await showEditDialog({ title: '处理举报工单', fields: [{ name: 'action', label: '动作', type: 'select', options: [{ value: 'no_action', label: '驳回' }, { value: 'request_more_info', label: '补充信息' }, { value: 'escalate_legal', label: '升级法务' }, { value: 'pause_share', label: '暂停分享' }, { value: 'block_share', label: '封禁分享' }] }, { name: 'reason', label: '处理原因', type: 'textarea', required: true }], confirmText: '提交处理' }); if (result && await confirmAction('该处理会写入审计记录，分享级动作可能影响公开访问。继续吗？', { title: '确认举报处理' })) { await api.actionInteractionReport(target.dataset.reportId, result); state.interactionReports = await api.listInteractionReports(queryFor(state, 'reports')); setNotice('举报工单已更新') } }
  } catch (error) { setNotice('', error.message) }
  renderDashboard(); return true
}
