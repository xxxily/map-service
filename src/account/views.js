import {
  escapeHtml,
  formatBytes,
  formatDateTime,
  groupKmlDocumentsByDirectory,
  getAccountCapabilities,
  getAvailableAccountTabs,
  hasAdminAccess,
  kmlStatusLabel,
  registrationEnabled,
  shareAccessPolicyLabel,
  passwordAccessLabel,
  spatialAccessLabel,
  spatialStatusLabel,
  shareStatusLabel,
} from './model.js'
import { getFeatureDescriptionText } from '../../shared/kml-content.js'

const TAB_ITEMS = [
  ['profile', '个人资料'],
  ['kml', '我的 KML'],
  ['collections', '资源集合'],
  ['favorites', '位置收藏'],
  ['shares', '我的分享'],
  ['security', '登录与安全'],
]

function renderNotice (state) {
  if (!state.notice && !state.error) return ''
  return `
    <div class="account-notice ${state.error ? 'is-error' : 'is-success'}" role="status">
      <span>${escapeHtml(state.error || state.notice)}</span>
      <button type="button" data-account-action="dismiss-notice" aria-label="关闭提示">×</button>
    </div>
  `
}

function renderLoading () {
  return '<div class="account-loading" role="status"><span></span><p>正在读取数据…</p></div>'
}

export function renderAuthView (state) {
  const canRegister = registrationEnabled(state.auth.config)
  const isRegister = state.authMode === 'register' && canRegister
  const policy = state.auth.config?.passwordPolicy || {}
  const minimum = Number(policy.minLength || 12)
  return `
    <div class="account-auth-page">
      <header class="account-auth-header">
        <a href="/" class="account-brand" aria-label="返回地图">
          <span class="account-brand-mark">地图</span>
          <span><strong>个人空间</strong><small>私有 KML 与位置数据</small></span>
        </a>
        <a href="/" class="account-link-button">返回地图</a>
      </header>
      <main class="account-auth-main">
        <section class="account-auth-intro">
          <p class="account-eyebrow">MAP WORKSPACE</p>
          <h1>让地图数据真正属于你</h1>
          <p>登录后可以跨设备保存 KML、管理位置收藏，并将多个 KML 组合成一个可随时撤销的分享链接。</p>
          <ul>
            <li><strong>默认私有</strong><span>未主动分享的数据只对你可见</span></li>
            <li><strong>服务端同步</strong><span>换设备后仍可继续管理</span></li>
            <li><strong>链接可控</strong><span>支持暂停、过期、轮换和撤销</span></li>
          </ul>
        </section>
        <section class="account-auth-card" aria-labelledby="account-auth-title">
          <div class="account-auth-tabs">
            <button type="button" class="${!isRegister ? 'is-active' : ''}" data-account-action="show-login">登录</button>
            ${canRegister ? `<button type="button" class="${isRegister ? 'is-active' : ''}" data-account-action="show-register">注册</button>` : ''}
          </div>
          ${renderNotice(state)}
          ${state.auth.loading ? renderLoading() : (isRegister ? `
            <form data-account-form="register" class="account-form">
              <div class="account-form-heading">
                <h2 id="account-auth-title">创建账号</h2>
                <p>用户名创建后不可修改，展示名可随时更新。</p>
              </div>
              <label><span>用户名</span><input name="username" minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" autocomplete="username" required></label>
              <label><span>展示名</span><input name="displayName" minlength="1" maxlength="50" autocomplete="nickname" required></label>
              <label><span>邮箱 <small>可选</small></span><input name="email" type="email" autocomplete="email"></label>
              <label><span>密码</span><input name="password" type="password" minlength="${minimum}" maxlength="128" autocomplete="new-password" required><small>至少 ${minimum} 个字符，建议使用长密码短语。</small></label>
              <label><span>再次输入密码</span><input name="passwordConfirm" type="password" minlength="${minimum}" maxlength="128" autocomplete="new-password" required></label>
              <button class="account-primary-button" type="submit">提交注册</button>
            </form>
          ` : `
            <form data-account-form="login" class="account-form">
              <div class="account-form-heading">
                <h2 id="account-auth-title">欢迎回来</h2>
                <p>使用你的用户名和密码登录。</p>
              </div>
              <label><span>用户名</span><input name="username" autocomplete="username" required autofocus></label>
              <label><span>密码</span><input name="password" type="password" autocomplete="current-password" required></label>
              <label class="account-check-row"><input name="remember" type="checkbox"><span>在这台设备上保持登录</span></label>
              <button class="account-primary-button" type="submit">登录</button>
              ${canRegister ? '<p class="account-form-switch">还没有账号？<button type="button" data-account-action="show-register">立即注册</button></p>' : '<p class="account-registration-closed">当前未开放自助注册，如需账号请联系管理员。</p>'}
            </form>
          `)}
        </section>
      </main>
    </div>
  `
}

function renderProfile (state) {
  const profile = state.profile || state.auth.user || {}
  const capabilities = getAccountCapabilities(state.auth.user)
  return `
    <section class="account-panel-section">
      <div class="account-section-heading">
        <div><p class="account-eyebrow">账号</p><h2>个人资料</h2><p>更新对外显示的名称和私有联系信息。</p></div>
      </div>
      <div class="account-grid account-profile-grid">
        <form class="account-card account-form" data-account-form="profile" data-avatar-original="${escapeHtml(profile.avatar || '')}">
          <label><span>用户名</span><input value="${escapeHtml(profile.username || '')}" disabled><small>用户名是稳定登录标识，创建后不可修改。</small></label>
          <label><span>展示名</span><input name="displayName" value="${escapeHtml(profile.displayName || '')}" maxlength="50" ${capabilities.canUpdateProfile ? 'required' : 'disabled'}></label>
          <label><span>邮箱 <small>私有</small></span><input name="email" type="email" value="${escapeHtml(profile.email || '')}" ${capabilities.canUpdateProfile ? '' : 'disabled'}></label>
          <label><span>性别</span><select name="gender" ${capabilities.canUpdateProfile ? '' : 'disabled'}><option value="">不设置</option><option value="male" ${profile.gender === 'male' ? 'selected' : ''}>男</option><option value="female" ${profile.gender === 'female' ? 'selected' : ''}>女</option><option value="other" ${profile.gender === 'other' ? 'selected' : ''}>其他</option></select></label>
          <label><span>头像</span><input name="avatarFile" type="file" accept="image/png,image/jpeg,image/webp" ${capabilities.canUpdateProfile ? '' : 'disabled'}><input name="avatar" type="hidden" value="${escapeHtml(profile.avatar || '')}"><button type="button" class="account-link-button account-avatar-clear" data-account-action="clear-avatar" ${profile.avatar ? '' : 'hidden'}>清除头像</button><small>支持 PNG、JPEG、WebP，选择后可预览。</small><small class="account-field-error" data-account-avatar-error role="alert"></small></label>
          ${capabilities.canUpdateProfile ? '<div class="account-form-actions"><button class="account-primary-button" type="submit">保存资料</button></div>' : '<p class="account-usage">当前角色只能查看个人资料。</p>'}
        </form>
        <aside class="account-card account-summary-card">
          ${profile.avatar ? `<img class="account-avatar account-avatar-image" src="${escapeHtml(profile.avatar)}" alt="${escapeHtml(profile.displayName || profile.username || '用户')}" loading="lazy">` : `<span class="account-avatar">${escapeHtml((profile.displayName || profile.username || '用').slice(0, 1).toUpperCase())}</span>`}
          <h3>${escapeHtml(profile.displayName || profile.username || '地图用户')}</h3>
          <p>@${escapeHtml(profile.username || '')}</p>
          <dl>
            <div><dt>账号状态</dt><dd>${profile.status === 'active' ? '正常' : escapeHtml(profile.status || '未知')}</dd></div>
            <div><dt>角色</dt><dd>${escapeHtml((profile.roles || []).join(' / ') || 'user')}</dd></div>
            <div><dt>创建时间</dt><dd>${formatDateTime(profile.createdAt)}</dd></div>
            <div><dt>最后登录</dt><dd>${formatDateTime(profile.lastLoginAt)}</dd></div>
          </dl>
        </aside>
      </div>
    </section>
  `
}

function renderKmlRow (state, item, options = {}) {
  const capabilities = getAccountCapabilities(state.auth.user)
  const selectable = capabilities.canWriteKml || capabilities.canManageShares
  const selected = state.kml.selected.has(item.id)
  const disabled = item.status !== 'active'
  const draggable = options.draggable && !item.isDefault && !disabled
  const lifecycleMeta = item.status === 'trashed'
    ? `<span>删除时间：${formatDateTime(item.deletedAt || item.updatedAt)}</span><span>原目录：${escapeHtml(item.directoryName || '未分类')}</span>`
    : `<span>${formatDateTime(item.updatedAt)}</span>`
  return `
    <article class="account-data-row ${selected ? 'is-selected' : ''} ${draggable ? 'is-draggable' : ''}"
      data-account-kml-file-drop="${escapeHtml(item.id)}"
      data-directory-id="${escapeHtml(item.directoryId || '')}"
      ${draggable ? `draggable="true" data-account-kml-file-draggable="true" data-id="${escapeHtml(item.id)}"` : ''}>
      <span class="account-row-drag" aria-hidden="true" title="${draggable ? '拖动排序或移动目录' : ''}">${draggable ? '⋮⋮' : ''}</span>
      ${selectable ? `<label class="account-row-check" title="选择 ${escapeHtml(item.name)}">
        <input type="checkbox" data-kml-select="${escapeHtml(item.id)}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      </label>` : '<span></span>'}
      <span class="account-file-mark" style="--file-color:${escapeHtml(item.color || '#0f766e')}">KML</span>
      <div class="account-row-main">
        <div class="account-row-title"><strong>${escapeHtml(item.name)}</strong>${item.isDefault ? '<span class="account-badge">默认</span>' : ''}<span class="account-badge is-muted">${kmlStatusLabel(item.status)}</span>${item.enabled === false ? '<span class="account-badge is-muted">已隐藏</span>' : ''}</div>
        <p>${escapeHtml(getFeatureDescriptionText(item.description) || '暂无描述')}</p>
        <div class="account-row-meta"><span>${Number(item.featureCount || 0).toLocaleString()} 个要素</span><span>${formatBytes(item.byteSize)}</span><span>${Number(item.shareReferenceCount || 0)} 个分享引用${Number(item.outdatedShareReferenceCount || 0) > 0 ? `（${Number(item.outdatedShareReferenceCount)} 待同步）` : ''}</span>${lifecycleMeta}</div>
      </div>
      <div class="account-row-actions">
        ${item.status === 'active' ? `
          ${capabilities.canWriteKml ? `<button type="button" data-account-action="move-kml" data-id="${escapeHtml(item.id)}">移动</button><button type="button" data-account-action="edit-kml" data-id="${escapeHtml(item.id)}">编辑信息</button>` : ''}
          <button type="button" data-account-action="export-kml" data-id="${escapeHtml(item.id)}">导出</button>
          ${capabilities.canWriteKml ? `<button type="button" class="is-danger" data-account-action="trash-kml" data-id="${escapeHtml(item.id)}" ${item.isDefault ? 'disabled title="请先设置其他默认 KML"' : ''}>移入回收站</button>` : ''}
        ` : `
          ${capabilities.canWriteKml ? `<button type="button" data-account-action="restore-kml" data-id="${escapeHtml(item.id)}">恢复</button>
          <button type="button" class="is-danger" data-account-action="delete-kml" data-id="${escapeHtml(item.id)}">永久删除</button>` : ''}
        `}
      </div>
    </article>
  `
}

function renderKmlRows (state) {
  const items = state.kml.items || []
  const capabilities = getAccountCapabilities(state.auth.user)
  if (!items.length) {
    return capabilities.canWriteKml
      ? '<div class="account-empty"><strong>暂无 KML</strong><p>可以新建空白文件、导入 .kml，或迁移浏览器中的本地数据。</p></div>'
      : '<div class="account-empty"><strong>暂无可查看的 KML</strong><p>当前角色只有查看权限，不能在此创建文件。</p></div>'
  }
  const manualOrder = capabilities.canWriteKml && state.kml.status === 'active' && !state.kml.search && state.kml.sort === 'position' && state.kml.order === 'asc'
  const groups = groupKmlDocumentsByDirectory(items, state.kml.directories)
  return `<div class="account-directory-list">${groups.map(group => {
    const activeItems = group.items.filter(item => item.status === 'active')
    const allSelected = activeItems.length > 0 && activeItems.every(item => state.kml.selected.has(item.id))
    const nextVisibility = group.visibilityState !== 'visible'
    const entityDirectory = Boolean(group.id)
    return `
      <section class="account-kml-directory ${manualOrder && entityDirectory ? 'is-draggable' : ''}"
        data-account-kml-directory-drop="${escapeHtml(group.id || '')}"
        ${manualOrder && entityDirectory ? `draggable="true" data-account-kml-directory-draggable="true" data-id="${escapeHtml(group.id)}"` : ''}>
        <header class="account-kml-directory-heading">
          <div class="account-kml-directory-title"><span class="account-directory-drag" aria-hidden="true">${manualOrder && entityDirectory ? '⋮⋮' : '▰'}</span><strong>${escapeHtml(group.name)}</strong><span class="account-kml-directory-count">${group.items.length}</span></div>
          <div>
            ${activeItems.length ? `<button type="button" data-account-action="select-directory-kml" data-id="${escapeHtml(group.id || '')}" data-selected="${allSelected}">${allSelected ? '取消全选' : '全选目录'}</button>` : ''}
            ${capabilities.canWriteKml && state.kml.status !== 'trashed' ? `<button type="button" data-account-action="toggle-directory-visibility" data-id="${escapeHtml(group.id || '')}" data-enabled="${nextVisibility}" title="${nextVisibility ? '显示' : '隐藏'}目录文件">${group.visibilityState === 'mixed' ? '部分显示' : nextVisibility ? '显示' : '隐藏'}</button>` : ''}
            ${capabilities.canWriteKml && entityDirectory ? `<button type="button" data-account-action="edit-kml-directory" data-id="${escapeHtml(group.id)}">重命名</button><button type="button" class="is-danger" data-account-action="delete-kml-directory" data-id="${escapeHtml(group.id)}">删除</button>` : ''}
          </div>
        </header>
        <div class="account-data-list">${group.items.length
          ? group.items.map(item => renderKmlRow(state, item, { draggable: manualOrder })).join('')
          : '<div class="account-directory-empty">拖动 KML 到这里</div>'}
        </div>
      </section>
    `
  }).join('')}</div>`
}

function renderKml (state) {
  const selectedCount = state.kml.selected.size
  const usage = state.kml.usage || {}
  const quota = usage.quota || {}
  const capabilities = getAccountCapabilities(state.auth.user)
  const selectable = capabilities.canWriteKml || capabilities.canManageShares
  const canImportTwoBulu = capabilities.canWriteKml && Boolean(state.twoBuluHelper?.available)
  return `
    <section class="account-panel-section">
      <div class="account-section-heading">
        <div><p class="account-eyebrow">个人数据</p><h2>我的 KML</h2><p>所有文件默认私有，只有加入分享包后才可通过链接读取。</p></div>
        ${capabilities.canWriteKml ? '' : '<span class="account-badge is-muted">只读 KML</span>'}
      </div>
      <div class="account-toolbar">
        <div class="account-toolbar-query">
          <form data-account-form="kml-filter" class="account-search-form">
            <input name="search" value="${escapeHtml(state.kml.search)}" placeholder="搜索名称或描述">
            <select name="status"><option value="active" ${state.kml.status === 'active' ? 'selected' : ''}>使用中</option><option value="trashed" ${state.kml.status === 'trashed' ? 'selected' : ''}>回收站</option><option value="all" ${state.kml.status === 'all' ? 'selected' : ''}>全部</option></select>
            <select name="sort" aria-label="排序字段"><option value="position" ${state.kml.sort === 'position' ? 'selected' : ''}>目录顺序</option><option value="updatedAt" ${state.kml.sort === 'updatedAt' ? 'selected' : ''}>更新时间</option><option value="createdAt" ${state.kml.sort === 'createdAt' ? 'selected' : ''}>创建时间</option><option value="name" ${state.kml.sort === 'name' ? 'selected' : ''}>名称</option><option value="featureCount" ${state.kml.sort === 'featureCount' ? 'selected' : ''}>要素数量</option></select>
            <select name="order" aria-label="排序方向"><option value="desc" ${state.kml.order === 'desc' ? 'selected' : ''}>降序</option><option value="asc" ${state.kml.order === 'asc' ? 'selected' : ''}>升序</option></select>
            <button type="submit">查询</button>
          </form>
        </div>
        <div class="account-toolbar-command-row">
          ${(state.kml.status === 'trashed' || capabilities.canWriteKml) ? `<div class="account-toolbar-file-actions">
            ${state.kml.status === 'trashed' ? '<button type="button" class="account-link-button" data-account-action="back-kml-active" title="返回使用中的 KML">返回</button>' : ''}
            ${capabilities.canWriteKml && state.kml.status !== 'trashed' ? `
              <button type="button" class="account-primary-button" data-account-action="create-kml">新建 KML</button>
              <button type="button" class="account-secondary-button" data-account-action="create-kml-directory">新建目录</button>
              <input type="file" id="account-kml-import" accept=".kml,application/vnd.google-earth.kml+xml" hidden>
              <details class="account-import-menu">
                <summary>导入</summary>
                <div class="account-import-menu-panel">
                  <button type="button" data-account-action="import-kml">导入 KML</button>
                  ${canImportTwoBulu ? '<button type="button" data-account-action="import-2bulu">从两步路导入</button><button type="button" data-account-action="import-2bulu-batch">从两步路批量导入</button>' : ''}
                  <button type="button" data-account-action="migrate-local">迁移本地数据</button>
                </div>
              </details>
              <button type="button" class="account-secondary-button" data-account-action="open-kml-trash">回收站${state.kml.trashCount ? ` (${state.kml.trashCount})` : ''}</button>
            ` : ''}
          </div>` : ''}
          ${selectable && state.kml.status !== 'trashed' ? `<div class="account-toolbar-selection">
            <span class="account-selection-status" aria-live="polite">已选 ${selectedCount} 个</span>
            <div class="account-selection-actions">
              <button type="button" data-account-action="select-all-kml">全选本页</button>
              ${capabilities.canWriteKml ? `<button type="button" data-account-action="move-selected-kml" ${selectedCount ? '' : 'disabled'}>批量移动</button>` : ''}
              ${capabilities.canWriteKml ? `<button type="button" class="is-danger" data-account-action="trash-selected-kml" ${selectedCount ? '' : 'disabled'}>批量移入回收站</button>` : ''}
              ${capabilities.canManageShares ? `<button type="button" class="account-primary-button" data-account-action="create-share" ${state.kml.items.some(item => item.status === 'active') ? '' : 'disabled'}>分享</button>` : ''}
            </div>
          </div>` : ''}
        </div>
      </div>
      ${quota.maxKmlFiles ? `<p class="account-usage">使用中已占用 ${Number(usage.fileCount || 0)} / ${Number(quota.maxKmlFiles)} 个文件，${Number(usage.featureCount || 0).toLocaleString()} 个要素</p>` : ''}
      ${Number(usage.trashCount || 0) > 0 ? `<p class="account-usage">回收站另有 ${Number(usage.trashCount)} 个文件，${Number(usage.trashFeatureCount || 0).toLocaleString()} 个要素，${formatBytes(usage.trashByteSize)}；不计入可用配额，清理前仍占存储。</p>` : ''}
      ${renderKmlRows(state)}
    </section>
  `
}

function renderFavorites (state) {
  const draft = state.favoriteDraft || {}
  return `
    <section class="account-panel-section">
      <div class="account-section-heading"><div><p class="account-eyebrow">个人数据</p><h2>位置收藏</h2><p>保存常用位置、备注和分类，收藏内容不会进入公开分享。</p></div></div>
      <div class="account-grid account-favorite-grid">
        <form class="account-card account-form account-sticky-form" data-account-form="favorite">
          <div class="account-form-heading"><h3>${draft.id ? '编辑收藏' : '新增收藏'}</h3><p>经纬度按 WGS84 坐标保存。</p></div>
          <input type="hidden" name="id" value="${escapeHtml(draft.id || '')}">
          <label><span>名称</span><input name="name" maxlength="100" value="${escapeHtml(draft.name || '')}" required></label>
          <div class="account-form-columns"><label><span>经度</span><input name="longitude" type="number" min="-180" max="180" step="any" value="${escapeHtml(draft.longitude ?? '')}" required></label><label><span>纬度</span><input name="latitude" type="number" min="-90" max="90" step="any" value="${escapeHtml(draft.latitude ?? '')}" required></label></div>
          <label><span>地址</span><input name="address" maxlength="500" value="${escapeHtml(draft.address || '')}"></label>
          <label><span>分类</span><input name="category" maxlength="80" value="${escapeHtml(draft.category || '')}" placeholder="例如：出行"></label>
          <label><span>标签</span><input name="tags" value="${escapeHtml((draft.tags || []).join(', '))}" placeholder="使用逗号分隔"></label>
          <label><span>备注</span><textarea name="note" rows="3" maxlength="2000">${escapeHtml(draft.note || '')}</textarea></label>
          <label><span>颜色</span><input name="color" type="color" value="${escapeHtml(draft.color || '#2563eb')}"></label>
          <div class="account-form-actions">${draft.id ? '<button type="button" class="account-secondary-button" data-account-action="cancel-favorite-edit">取消</button>' : ''}<button class="account-primary-button" type="submit">${draft.id ? '保存修改' : '添加收藏'}</button></div>
        </form>
        <div>
          <form class="account-search-form account-favorite-search" data-account-form="favorite-filter"><input name="search" value="${escapeHtml(state.favorites.search)}" placeholder="搜索收藏、分类或标签"><button type="submit">查询</button></form>
          ${state.favorites.items.length ? `<div class="account-card-list">${state.favorites.items.map(item => `
            <article class="account-card account-favorite-card">
              <div class="account-favorite-title"><span style="--favorite-color:${escapeHtml(item.color || '#2563eb')}"></span><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.category || '未分类')}</p></div></div>
              <p>${escapeHtml(item.address || item.note || '暂无补充信息')}</p>
              <div class="account-tag-list">${(item.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
              <small>${Number(item.longitude).toFixed(6)}, ${Number(item.latitude).toFixed(6)} · ${formatDateTime(item.updatedAt)}</small>
              <div class="account-card-actions"><a href="/?coords=${encodeURIComponent(`${item.latitude},${item.longitude},16,0`)}">地图定位</a><button type="button" data-account-action="edit-favorite" data-id="${escapeHtml(item.id)}">编辑</button><button type="button" class="is-danger" data-account-action="delete-favorite" data-id="${escapeHtml(item.id)}">删除</button></div>
            </article>
          `).join('')}</div>` : '<div class="account-empty"><strong>暂无收藏</strong><p>可以手动输入坐标创建第一个位置收藏。</p></div>'}
        </div>
      </div>
    </section>
  `
}

function renderCollections (state) {
  const caps = getAccountCapabilities(state.auth.user)
  const collections = state.collections || { items: [], search: '', status: 'active', selected: null, itemResult: null }
  const selected = collections.selected
  const canWrite = caps.canWriteCollections
  const totalPages = Math.max(1, Math.ceil(Number(collections.total || 0) / Math.max(1, Number(collections.limit || 20))))
  const itemPage = Math.max(1, Number(collections.itemPage || 1))
  const itemLimit = Math.max(1, Number(collections.itemLimit || 40))
  const itemTotal = Number(collections.itemResult?.total ?? collections.itemResult?.pagination?.total ?? collections.itemTotal ?? 0)
  const itemTotalPages = Math.max(1, Math.ceil(itemTotal / itemLimit))
  const collectionItems = collections.itemResult?.items || []
  const renderItem = (item, offset) => {
    const position = Number.isSafeInteger(Number(item.position)) ? Number(item.position) : ((itemPage - 1) * itemLimit + offset)
    const total = itemTotal || Number(selected?.itemCount || 0)
    const canMoveUp = position > 0
    const canMoveDown = total > 0 && position < total - 1
    return `<article class="account-card account-collection-item"><div class="account-card-heading"><div><span class="account-eyebrow">资源 ${position + 1}</span><h4>${escapeHtml(item.title || '未命名资源')}</h4></div><span class="account-badge is-muted">${escapeHtml(item.type || 'auto')}</span></div><p class="account-collection-item-url">${escapeHtml(item.url || '')}</p>${item.coverUrl ? `<small class="account-collection-item-cover">封面：${escapeHtml(item.coverUrl)}</small>` : ''}${canWrite ? `<div class="account-card-actions"><button type="button" data-account-action="move-collection-item" data-id="${escapeHtml(selected.id)}" data-item-id="${escapeHtml(item.id)}" data-direction="up" ${canMoveUp ? '' : 'disabled'} aria-label="上移资源" title="上移资源">↑</button><button type="button" data-account-action="move-collection-item" data-id="${escapeHtml(selected.id)}" data-item-id="${escapeHtml(item.id)}" data-direction="down" ${canMoveDown ? '' : 'disabled'} aria-label="下移资源" title="下移资源">↓</button><button type="button" data-account-action="edit-collection-item" data-id="${escapeHtml(selected.id)}" data-item-id="${escapeHtml(item.id)}">编辑</button><button type="button" class="is-danger" data-account-action="delete-collection-item" data-id="${escapeHtml(selected.id)}" data-item-id="${escapeHtml(item.id)}">删除</button></div>` : ''}</article>`
  }
  const renderCollection = item => `<article class="account-card"><div class="account-card-heading"><div><h3>${escapeHtml(item.name || '未命名集合')}</h3><p>${escapeHtml(item.description || '暂无描述')}</p></div><span class="account-badge ${item.isPublic || item.public ? '' : 'is-muted'}">${item.isPublic || item.public ? '公开' : '私有'}</span></div><div class="account-row-meta"><span>${Number(item.itemCount || item.resourceCount || 0).toLocaleString()} 项</span><span>${formatDateTime(item.updatedAt)}</span></div><div class="account-card-actions"><button type="button" data-account-action="open-collection" data-id="${escapeHtml(item.id)}">查看资源</button>${canWrite ? `<button type="button" data-account-action="edit-collection" data-id="${escapeHtml(item.id)}">编辑</button>${collections.status === 'trashed' ? `<button type="button" data-account-action="restore-collection" data-id="${escapeHtml(item.id)}">恢复</button><button type="button" class="is-danger" data-account-action="permanent-delete-collection" data-id="${escapeHtml(item.id)}">永久删除</button>` : `<button type="button" class="is-danger" data-account-action="trash-collection" data-id="${escapeHtml(item.id)}">移入回收站</button>`}</div>` : '</div>'}</article>`
  const selectedView = selected ? `<div class="account-card account-collection-editor"><div class="account-card-heading"><div><h3>${escapeHtml(selected.name || '资源集合')}</h3><p>${escapeHtml(selected.description || '暂无描述')} · ${selected.isPublic || selected.public ? '公开' : '私有'}</p></div><div class="account-card-actions">${canWrite ? `<button type="button" data-account-action="edit-collection" data-id="${escapeHtml(selected.id)}">编辑</button>` : ''}<button type="button" data-account-action="close-collection">返回列表</button></div></div>${canWrite ? `<div class="account-collection-batch"><textarea rows="3" data-collection-batch placeholder="粘贴一个或多个 HTTPS 地址"></textarea><div class="account-card-actions"><button type="button" class="account-secondary-button" data-account-action="batch-add-collection-items" data-id="${escapeHtml(selected.id)}">批量添加</button><button type="button" data-account-action="add-collection-item" data-id="${escapeHtml(selected.id)}">添加资源</button></div></div>` : ''}${collectionItems.length ? `<div class="account-card-list">${collectionItems.map(renderItem).join('')}</div><div class="account-card-actions"><button type="button" data-account-action="collection-item-page" data-id="${escapeHtml(selected.id)}" data-page="${Math.max(1, itemPage - 1)}" ${itemPage <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${itemPage} 页${itemTotal ? `，共 ${itemTotalPages} 页` : '，总数未知'}</span><button type="button" data-account-action="collection-item-page" data-id="${escapeHtml(selected.id)}" data-page="${itemPage + 1}" ${itemTotal && itemPage >= itemTotalPages ? 'disabled' : ''}>下一页</button></div>` : '<div class="account-empty is-compact"><p>暂无资源项。</p></div>'}</div>` : ''
  const listView = collections.items.length ? `<div class="account-card-list">${collections.items.map(renderCollection).join('')}</div><div class="account-card-actions"><button type="button" data-account-action="collection-page" data-page="${Math.max(1, collections.page - 1)}" ${collections.page <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${collections.page} 页，共 ${totalPages} 页</span><button type="button" data-account-action="collection-page" data-page="${collections.page + 1}" ${collections.page >= totalPages ? 'disabled' : ''}>下一页</button></div>` : '<div class="account-empty"><strong>暂无资源集合</strong><p>创建集合后即可在 KML 点位中按 ID 引用。</p></div>'
  return `<section class="account-panel-section"><div class="account-section-heading"><div><p class="account-eyebrow">个人数据</p><h2>资源集合</h2><p>独立维护可被多个 KML 点位引用的资源。默认私有，公开后可通过集合 ID 读取。</p></div>${canWrite ? '<button type="button" class="account-primary-button" data-account-action="create-collection">新建集合</button>' : ''}</div>
    <form data-account-form="collection-filter" class="account-search-form"><input name="search" value="${escapeHtml(collections.search || '')}" placeholder="搜索集合名称"><select name="status"><option value="active" ${collections.status !== 'trashed' ? 'selected' : ''}>使用中</option><option value="trashed" ${collections.status === 'trashed' ? 'selected' : ''}>回收站</option></select><select name="sort"><option value="updatedAt" ${collections.sort === 'updatedAt' ? 'selected' : ''}>最近更新</option><option value="name" ${collections.sort === 'name' ? 'selected' : ''}>名称</option><option value="itemCount" ${collections.sort === 'itemCount' ? 'selected' : ''}>资源数量</option></select><select name="order"><option value="desc" ${collections.order !== 'asc' ? 'selected' : ''}>降序</option><option value="asc" ${collections.order === 'asc' ? 'selected' : ''}>升序</option></select><button type="submit">查询</button></form>
    ${selectedView || listView}</section>`
}

function renderShares (state) {
  const capabilities = getAccountCapabilities(state.auth.user)
  const analyticsPolicy = state.auth.config?.analytics?.sharePolicy || {}
  return `
    <section class="account-panel-section">
      <div class="account-section-heading"><div><p class="account-eyebrow">链接分享</p><h2>我的分享</h2><p>分享包可包含后台允许数量的 KML，可随时暂停、同步、撤销或删除；删除分享不会删除原始 KML。</p></div>${capabilities.canReadKml ? '<button type="button" class="account-secondary-button" data-account-action="go-kml-share">从 KML 创建分享</button>' : ''}</div>
      <form data-account-form="share-filter" class="account-search-form"><input name="search" value="${escapeHtml(state.shares.search)}" placeholder="搜索分享标题"><select name="status"><option value="">全部状态</option>${['active', 'paused', 'expired', 'revoked', 'blocked'].map(status => `<option value="${status}" ${state.shares.status === status ? 'selected' : ''}>${shareStatusLabel(status)}</option>`).join('')}</select><button type="submit">查询</button></form>
      ${state.shares.items.length ? `<div class="account-share-grid">${state.shares.items.map(item => {
        const pendingSyncItemCount = Math.max(0, Number(item.pendingSyncItemCount || 0))
        const contentPending = item.syncStatus === 'pending' || pendingSyncItemCount > 0
        const canSyncContent = !['revoked', 'blocked'].includes(item.status)
        return `
        <article class="account-card account-share-card">
          <div class="account-share-heading"><div><span class="account-status is-${escapeHtml(item.status)}">${shareStatusLabel(item.status)}</span><h3>${escapeHtml(item.title)}</h3></div><strong>${Number(item.itemCount || 0)}<small> KML</small></strong></div>
          <p>${escapeHtml(item.description || '暂无描述')}</p>
          <dl><div><dt>内容状态</dt><dd>${contentPending ? `${pendingSyncItemCount || 1} 个 KML 待同步` : '内容已同步'}</dd></div><div><dt>访问次数</dt><dd>${Number(item.accessCount || 0).toLocaleString()} 次</dd></div><div><dt>访问策略</dt><dd>${escapeHtml(shareAccessPolicyLabel(item))}</dd></div><div><dt>地图范围</dt><dd>${escapeHtml(spatialAccessLabel(item))}</dd></div><div><dt>范围状态</dt><dd>${escapeHtml(spatialStatusLabel(item))}</dd></div><div><dt>密码授权</dt><dd>${escapeHtml(passwordAccessLabel(item))}</dd></div><div><dt>下载</dt><dd>${item.allowDownload ? '允许' : '禁止'}</dd></div><div><dt>密码</dt><dd>${item.passwordProtected ? '已设置' : '无'}</dd></div><div><dt>访问统计</dt><dd>${item.analytics?.disabledByAdmin ? '已被管理员禁用' : item.analytics?.mode === 'provider' ? `托管服务${item.analytics.effective ? ' · 已生效' : ''}` : item.analytics?.mode === 'custom' ? `自定义脚本${item.analytics.effective ? ' · 已生效' : ''}` : analyticsPolicy.enabled === true ? '未配置' : '后台未开放'}</dd></div><div><dt>过期时间</dt><dd>${item.expiresAt ? formatDateTime(item.expiresAt) : '永不'}</dd></div><div><dt>创建时间</dt><dd>${formatDateTime(item.createdAt)}</dd></div><div><dt>最近访问</dt><dd>${item.lastAccessedAt ? formatDateTime(item.lastAccessedAt) : '尚无访问'}</dd></div></dl>
          ${item.status === 'blocked' ? `<div class="account-share-blocked-reason"><strong>封禁原因</strong><span>${escapeHtml(item.blockedReason || '管理员未填写原因')}</span></div>` : ''}
          <code>${escapeHtml(item.shareUrl || `/share/${item.publicId}`)}</code>
          <small>更新于 ${formatDateTime(item.updatedAt)}</small>
          <div class="account-card-actions account-share-actions">
            <a href="${escapeHtml(item.shareUrl || `/share/${item.publicId}`)}" target="_blank" rel="noopener">查看</a>
            <button type="button" data-account-action="copy-share" data-id="${escapeHtml(item.id)}">复制链接</button>
            <button type="button" data-account-action="share-access-events" data-id="${escapeHtml(item.id)}">访问记录</button>
            ${!['revoked', 'blocked'].includes(item.status) ? `<button type="button" data-account-action="edit-share" data-id="${escapeHtml(item.id)}">编辑</button>` : ''}
            ${canSyncContent ? `<button type="button" data-account-action="sync-share" data-id="${escapeHtml(item.id)}" data-revision="${Number(item.revision || 0)}" ${contentPending ? '' : 'disabled'}>同步内容</button>` : ''}
            ${item.status === 'active' ? `<button type="button" data-account-action="toggle-share" data-id="${escapeHtml(item.id)}" data-status="paused" data-revision="${Number(item.revision || 0)}">暂停</button>` : ''}
            ${item.status === 'paused' ? `<button type="button" data-account-action="toggle-share" data-id="${escapeHtml(item.id)}" data-status="active" data-revision="${Number(item.revision || 0)}">恢复</button>` : ''}
            ${!['revoked', 'blocked'].includes(item.status) ? `<button type="button" data-account-action="rotate-share" data-id="${escapeHtml(item.id)}">轮换链接</button><button type="button" class="is-danger" data-account-action="revoke-share" data-id="${escapeHtml(item.id)}">撤销</button>` : ''}
            <button type="button" class="is-danger" data-account-action="delete-share" data-id="${escapeHtml(item.id)}">删除</button>
          </div>
        </article>
      `}).join('')}</div>` : '<div class="account-empty"><strong>暂无分享</strong><p>进入“我的 KML”多选文件，即可生成稳定的只读分享链接。</p></div>'}
    </section>
  `
}

function renderSecurity (state) {
  const mustChange = state.auth.user?.mustChangePassword
  const capabilities = getAccountCapabilities(state.auth.user)
  return `
    <section class="account-panel-section">
      <div class="account-section-heading"><div><p class="account-eyebrow">安全</p><h2>登录与安全</h2><p>修改密码、查看活跃设备，并可随时注销其他会话。</p></div></div>
      ${mustChange ? '<div class="account-security-warning"><strong>请先修改临时密码</strong><p>完成修改前，系统会限制其他业务操作。</p></div>' : ''}
      <div class="account-grid account-security-grid">
        <form class="account-card account-form" data-account-form="password">
          <div class="account-form-heading"><h3>修改密码</h3><p>修改后将自动注销其他设备的会话。</p></div>
          <label><span>当前密码</span><input name="currentPassword" type="password" autocomplete="current-password" required></label>
          <label><span>新密码</span><input name="newPassword" type="password" minlength="${Number(state.auth.config?.passwordPolicy?.minLength || 12)}" maxlength="128" autocomplete="new-password" required></label>
          <label><span>再次输入</span><input name="passwordConfirm" type="password" autocomplete="new-password" required></label>
          <div class="account-form-actions"><button class="account-primary-button" type="submit">更新密码</button></div>
        </form>
        ${capabilities.canManageSessions ? `<div class="account-card account-session-card">
          <div class="account-card-heading"><div><h3>活跃会话</h3><p>如发现陌生设备，请立即注销并修改密码。</p></div><button type="button" class="account-secondary-button" data-account-action="logout-other-sessions">注销其他会话</button></div>
          ${state.sessions.length ? `<div class="account-session-list">${state.sessions.map(session => `
            <article><div><strong>${escapeHtml(session.deviceLabel || '未知设备')} ${session.current ? '<span class="account-badge">当前</span>' : ''}</strong><p>最近活动 ${formatDateTime(session.lastActivityAt)} · 过期 ${formatDateTime(session.expiresAt)}</p><small>${escapeHtml(session.ipSummary || '未知网络')}</small></div>${session.current ? '' : `<button type="button" class="is-danger" data-account-action="revoke-session" data-id="${escapeHtml(session.id)}">注销</button>`}</article>
          `).join('')}</div>` : '<div class="account-empty is-compact"><p>暂无可显示的活跃会话。</p></div>'}
        </div>` : ''}
      </div>
    </section>
  `
}

function renderActivePanel (state) {
  if (state.loading) return renderLoading()
  if (state.activeTab === 'kml') return renderKml(state)
  if (state.activeTab === 'collections') return renderCollections(state)
  if (state.activeTab === 'favorites') return renderFavorites(state)
  if (state.activeTab === 'shares') return renderShares(state)
  if (state.activeTab === 'security') return renderSecurity(state)
  return renderProfile(state)
}

export function renderAccountShell (state) {
  const user = state.auth.user || {}
  const visibleTabs = new Set(getAvailableAccountTabs(user))
  return `
    <div class="account-app-shell">
      <header class="account-topbar">
        <a class="account-brand" href="/"><span class="account-brand-mark">地图</span><span><strong>个人空间</strong><small>数据与分享管理</small></span></a>
        <div class="account-topbar-actions">
          <a href="/">返回地图</a>
          ${hasAdminAccess(user) ? '<a href="/admin/overview">管理后台</a>' : ''}
          <button type="button" data-account-action="logout">退出登录</button>
        </div>
      </header>
      <div class="account-layout">
        <aside class="account-sidebar">
          <div class="account-user-summary">${user.avatar ? `<img class="account-avatar account-avatar-image" src="${escapeHtml(user.avatar)}" alt="${escapeHtml(user.displayName || user.username || '用户')}" loading="lazy">` : `<span class="account-avatar">${escapeHtml((user.displayName || user.username || '用').slice(0, 1).toUpperCase())}</span>`}<div><strong>${escapeHtml(user.displayName || user.username || '地图用户')}</strong><small>@${escapeHtml(user.username || '')}</small></div></div>
          <nav aria-label="用户中心导航">${TAB_ITEMS.filter(([id]) => visibleTabs.has(id)).map(([id, label]) => `<a href="#${id}" data-account-tab="${id}" class="${state.activeTab === id ? 'is-active' : ''}">${label}${id === 'security' && user.mustChangePassword ? '<span class="account-nav-dot" title="需要修改密码"></span>' : ''}</a>`).join('')}</nav>
          <p class="account-privacy-note"><strong>隐私默认值</strong><span>KML 和位置收藏默认仅你可见。</span></p>
        </aside>
        <main class="account-content">
          ${renderNotice(state)}
          ${renderActivePanel(state)}
        </main>
      </div>
    </div>
  `
}
