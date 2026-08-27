import {
  buildShareUpdateItems,
  buildShareViewConfig,
  escapeHtml,
  formatDateTime,
  groupKmlDocumentsByDirectory,
  normalizeSpatialAccess,
} from './model.js'

export const SHARE_PASSWORD_LENGTH_OPTIONS = Object.freeze([8, 12, 16, 20, 24, 32])
const SHARE_PASSWORD_UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const SHARE_PASSWORD_LOWERCASE = 'abcdefghijkmnopqrstuvwxyz'
const SHARE_PASSWORD_DIGITS = '23456789'
// Query delimiters are intentionally excluded.  The final link is still
// encoded with encodeURIComponent on the server.
const SHARE_PASSWORD_SPECIAL_CHARACTERS = '!$*+@'
const SHARE_PASSWORD_ALPHABET = `${SHARE_PASSWORD_UPPERCASE}${SHARE_PASSWORD_LOWERCASE}${SHARE_PASSWORD_DIGITS}${SHARE_PASSWORD_SPECIAL_CHARACTERS}`

export function getShareDirectorySelectionState (fileIds, selectedItems) {
  const ids = Array.from(fileIds || [], id => String(id || '')).filter(Boolean)
  const selected = new Set(Array.from(selectedItems || [], item => String(item?.kmlId || item || '')).filter(Boolean))
  const selectedCount = ids.reduce((count, id) => count + (selected.has(id) ? 1 : 0), 0)
  return {
    checked: ids.length > 0 && selectedCount === ids.length,
    indeterminate: selectedCount > 0 && selectedCount < ids.length,
  }
}

function secureRandomInt (maximum) {
  const limit = Math.floor(0x100000000 / maximum) * maximum
  const values = new Uint32Array(1)
  do {
    globalThis.crypto?.getRandomValues?.(values)
    if (!globalThis.crypto?.getRandomValues) throw new Error('当前浏览器不支持安全随机数')
  } while (values[0] >= limit)
  return values[0] % maximum
}

function shuffleSecure (values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = secureRandomInt(index + 1)
    const current = values[index]
    values[index] = values[target]
    values[target] = current
  }
  return values
}

export function generateStrongSharePassword (length = 12, options = {}) {
  const size = Math.max(4, Math.min(128, Number.parseInt(length, 10) || 12))
  const includeSpecialCharacters = options.includeSpecialCharacters !== false
  const groups = [
    SHARE_PASSWORD_UPPERCASE,
    SHARE_PASSWORD_LOWERCASE,
    SHARE_PASSWORD_DIGITS,
    ...(includeSpecialCharacters ? [SHARE_PASSWORD_SPECIAL_CHARACTERS] : []),
  ]
  const alphabet = includeSpecialCharacters
    ? SHARE_PASSWORD_ALPHABET
    : `${SHARE_PASSWORD_UPPERCASE}${SHARE_PASSWORD_LOWERCASE}${SHARE_PASSWORD_DIGITS}`
  const result = groups.map(group => group[secureRandomInt(group.length)])
  while (result.length < size) result.push(alphabet[secureRandomInt(alphabet.length)])
  return shuffleSecure(result).join('')
}

function scriptDescriptorToText (script) {
  if (!script?.src) return ''
  const attributes = [
    script.defer !== false ? 'defer' : '',
    script.async === true ? 'async' : '',
    `src="${String(script.src)}"`,
    ...Object.entries(script.attributes || {}).map(([name, value]) => `${name}="${String(value)}"`),
  ].filter(Boolean)
  return `<script ${attributes.join(' ')}></script>`
}

function ensureAccountDialogRoot () {
  let root = document.getElementById('app-dialog-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'app-dialog-root'
    document.body.appendChild(root)
  }
  return root
}

export function showAccountPasswordDialog (options = {}) {
  const root = ensureAccountDialogRoot()
  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-account-password-action="cancel">
      <form class="app-dialog account-password-dialog" role="dialog" aria-modal="true" aria-labelledby="account-password-dialog-title" data-account-password-form>
        <div class="account-password-dialog-heading">
          <div><h2 id="account-password-dialog-title">${escapeHtml(options.title || '验证密码')}</h2><p>${escapeHtml(options.message || '请输入当前密码继续。')}</p></div>
          <button type="button" class="account-password-dialog-close" data-account-password-action="cancel" aria-label="关闭" title="关闭">×</button>
        </div>
        <div class="account-password-dialog-body">
          <label class="account-dialog-field">
            <span>${escapeHtml(options.label || '密码')}</span>
            <input name="password" type="password" minlength="${Number(options.minLength || 1)}" maxlength="128" autocomplete="${escapeHtml(options.autocomplete || 'current-password')}" required>
          </label>
          ${options.generate ? `<div class="account-password-generation-options">
            <label class="account-dialog-field"><span>密码长度</span><select name="passwordLength">${SHARE_PASSWORD_LENGTH_OPTIONS.map(length => `<option value="${length}" ${Number(options.passwordLength || 12) === length ? 'selected' : ''}>${length} 位</option>`).join('')}</select></label>
            <label class="account-password-special-option"><input name="passwordIncludeSpecial" type="checkbox" ${options.includeSpecialCharacters !== false ? 'checked' : ''}><span>包含特殊字符</span></label>
          </div>
          <div class="account-password-tools"><button type="button" class="account-secondary-button" data-account-password-action="generate">生成密码</button><button type="button" class="account-secondary-button" data-account-password-action="copy" disabled>复制密码</button></div><small class="account-password-status" data-account-password-status aria-live="polite"></small>` : ''}
        </div>
        <div class="app-dialog-actions">
          <button type="button" class="app-dialog-secondary" data-account-password-action="cancel">取消</button>
          <button type="submit" class="app-dialog-primary">${escapeHtml(options.confirmText || '继续')}</button>
        </div>
      </form>
    </div>
  `
  const form = root.querySelector('[data-account-password-form]')
  const input = form.querySelector('input')
  const copyButton = form.querySelector('[data-account-password-action="copy"]')
  const statusNode = form.querySelector('[data-account-password-status]')
  const updateCopyState = () => {
    if (copyButton) copyButton.disabled = !input.value
  }
  input.addEventListener('input', updateCopyState)
  updateCopyState()
  input?.focus()

  return new Promise(resolve => {
    const cleanup = () => {
      root.removeEventListener('click', onClick)
      form.removeEventListener('submit', onSubmit)
      input.removeEventListener('input', updateCopyState)
      document.removeEventListener('keydown', onKeydown)
      root.innerHTML = ''
      root.hidden = true
    }
    const finish = value => {
      cleanup()
      resolve(value)
    }
    const onSubmit = event => {
      event.preventDefault()
      finish(form.elements.password.value)
    }
    const onClick = async event => {
      const target = event.target.closest('[data-account-password-action]')
      if (!target) return
      if (target.classList.contains('app-dialog-backdrop') && form.contains(event.target)) return
      if (target.dataset.accountPasswordAction === 'generate') {
        input.value = generateStrongSharePassword(
          form.elements.passwordLength?.value || options.passwordLength || 12,
          { includeSpecialCharacters: form.elements.passwordIncludeSpecial?.checked !== false },
        )
        input.type = 'text'
        updateCopyState()
        if (statusNode) statusNode.textContent = '已生成，可直接使用或修改。'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.focus()
        input.select()
        return
      }
      if (target.dataset.accountPasswordAction === 'copy') {
        if (!input.value) return
        try {
          await navigator.clipboard?.writeText(input.value)
          if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
          if (statusNode) statusNode.textContent = '密码已复制'
        } catch {
          input.focus()
          input.select()
          if (statusNode) statusNode.textContent = '已选中密码，请手动复制'
        }
        return
      }
      finish(null)
    }
    const onKeydown = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      finish(null)
    }
    root.addEventListener('click', onClick)
    form.addEventListener('submit', onSubmit)
    document.addEventListener('keydown', onKeydown)
  })
}

function analyticsModeValue (share) {
  const mode = share?.analytics?.mode
  return ['provider', 'custom'].includes(mode) ? mode : 'none'
}

function normalizedClusteringConfig (value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    enabled: source.enabled === true,
    minZoom: Number.isSafeInteger(Number(source.minZoom)) ? Number(source.minZoom) : 0,
    maxClusterZoom: Number.isSafeInteger(Number(source.maxClusterZoom)) ? Number(source.maxClusterZoom) : 13,
    gridSize: Number.isSafeInteger(Number(source.gridSize)) ? Number(source.gridSize) : 64,
    minClusterPoints: Number.isSafeInteger(Number(source.minClusterPoints)) ? Number(source.minClusterPoints) : 2,
    maxMembersPerCluster: Number.isSafeInteger(Number(source.maxMembersPerCluster)) ? Number(source.maxMembersPerCluster) : 5000,
  }
}

export function showAccountShareAccessEventsDialog (options = {}) {
  const root = ensureAccountDialogRoot()
  const share = options.share || {}
  const load = typeof options.onLoad === 'function' ? options.onLoad : async () => ({ items: [], page: 1, limit: 20, total: 0 })
  let page = 1
  let closed = false

  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-account-access-events-action="cancel">
      <section class="app-dialog account-access-events-dialog" role="dialog" aria-modal="true" aria-labelledby="account-access-events-title">
        <div class="account-share-dialog-heading"><div><h2 id="account-access-events-title">访问记录</h2><p>${escapeHtml(share.title || '分享')}</p></div><span data-account-access-events-count>读取中…</span></div>
        <div class="account-access-events-body" data-account-access-events-body><div class="account-loading"><span></span><p>正在读取访问记录…</p></div></div>
        <div class="account-access-events-footer"><button type="button" class="account-secondary-button" data-account-access-events-page="prev" disabled>上一页</button><span data-account-access-events-page-label>第 1 页</span><button type="button" class="account-secondary-button" data-account-access-events-page="next" disabled>下一页</button></div>
        <div class="app-dialog-actions"><button type="button" class="app-dialog-secondary" data-account-access-events-action="cancel">关闭</button></div>
      </section>
    </div>
  `
  const body = root.querySelector('[data-account-access-events-body]')
  const count = root.querySelector('[data-account-access-events-count]')
  const prev = root.querySelector('[data-account-access-events-page="prev"]')
  const next = root.querySelector('[data-account-access-events-page="next"]')
  const label = root.querySelector('[data-account-access-events-page-label]')
  const methodLabels = {
    open: '直接访问',
    password_form: '输入密码',
    password_link: '带密码链接',
    session: '已授权会话',
  }
  const deviceLabels = { mobile: '移动设备', tablet: '平板设备', desktop: '桌面设备', unknown: '未知设备' }
  const renderRows = result => {
    const items = Array.isArray(result?.items) ? result.items : []
    const total = Number(result?.total || 0)
    const limit = Math.max(1, Number(result?.limit || 20))
    const currentPage = Math.max(1, Number(result?.page || page))
    page = currentPage
    count.textContent = `${total.toLocaleString()} 条聚合记录`
    label.textContent = `第 ${currentPage} / ${Math.max(1, Math.ceil(total / limit))} 页`
    prev.disabled = currentPage <= 1
    next.disabled = currentPage * limit >= total
    body.innerHTML = items.length ? `<div class="account-access-events-list">${items.map(item => `
      <article><div><strong>${escapeHtml(methodLabels[item.accessMethod] || item.accessMethod || '访问')}</strong><p>${escapeHtml(deviceLabels[item.deviceType] || item.deviceType || '未知设备')} · ${escapeHtml(item.referrerOrigin || '直接进入')}</p><small>首次 ${escapeHtml(formatDateTime(item.firstAccessedAt))}</small></div><div><strong>${Number(item.accessCount || 0).toLocaleString()} 次</strong><small>最近 ${escapeHtml(formatDateTime(item.lastAccessedAt))}</small></div></article>
    `).join('')}</div>` : '<div class="account-empty is-compact"><p>最近暂无可展示的访问记录。</p></div>'
  }
  const loadPage = async () => {
    body.innerHTML = '<div class="account-loading"><span></span><p>正在读取访问记录…</p></div>'
    try {
      renderRows(await load({ page, limit: 20 }))
    } catch (error) {
      body.innerHTML = `<div class="account-empty is-compact"><p>${escapeHtml(error.message || '访问记录读取失败')}</p></div>`
      count.textContent = '读取失败'
    }
  }
  const cleanup = () => {
    root.removeEventListener('click', onClick)
    document.removeEventListener('keydown', onKeydown)
    root.innerHTML = ''
    root.hidden = true
    closed = true
  }
  const onClick = event => {
    const action = event.target.closest('[data-account-access-events-action]')
    if (action) {
      if (action.classList.contains('app-dialog-backdrop') && event.target.closest('.app-dialog')) return
      cleanup()
      return
    }
    const pager = event.target.closest('[data-account-access-events-page]')
    if (!pager || pager.disabled) return
    page += pager.dataset.accountAccessEventsPage === 'next' ? 1 : -1
    loadPage()
  }
  const onKeydown = event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      cleanup()
    }
  }
  root.addEventListener('click', onClick)
  document.addEventListener('keydown', onKeydown)
  loadPage()
  return () => { if (!closed) cleanup() }
}

export function showAccountShareDialog (options = {}) {
  const root = ensureAccountDialogRoot()
  const share = options.share || {}
  const documents = Array.isArray(options.documents) ? options.documents : []
  const documentMap = new Map()
  documents.forEach(document => {
    if (document?.status === 'active' && document.id) documentMap.set(String(document.id), document)
  })
  Array.from(share.items || []).forEach(item => {
    const id = String(item?.kmlId || '')
    if (!id || documentMap.has(id) || item.status !== 'active') return
    documentMap.set(id, { id, name: item.name || item.displayName || '未命名 KML', status: 'active' })
  })
  const catalog = Array.from(documentMap.values())
  const fallbackDirectories = new Map()
  catalog.forEach(document => {
    const id = document?.directoryId == null ? '' : String(document.directoryId)
    if (!id || fallbackDirectories.has(id)) return
    fallbackDirectories.set(id, {
      id,
      name: document.directoryName || '未命名目录',
      position: fallbackDirectories.size,
    })
  })
  const directoryCatalog = options.directoryCatalog && typeof options.directoryCatalog === 'object'
    ? options.directoryCatalog
    : { items: Array.from(fallbackDirectories.values()), uncategorized: { id: null, name: '未分类' } }
  const catalogGroups = groupKmlDocumentsByDirectory(catalog, {
    ...directoryCatalog,
    uncategorized: directoryCatalog.uncategorized || { id: null, name: '未分类' },
  })
  const defaultVisibilityForKml = kmlId => documentMap.get(String(kmlId))?.enabled !== false
  let selectedItems = (share.items || [])
    .filter(item => documentMap.has(String(item?.kmlId || '')))
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
    .map(item => ({
      kmlId: String(item.kmlId),
      visibleByDefault: item.visibleByDefault !== false,
      displayName: String(item.displayName || ''),
    }))
  const viewConfig = share.viewConfig || {}
  const clustering = normalizedClusteringConfig(viewConfig.kmlPointClustering)
  const spatialAccess = normalizeSpatialAccess(share)
  const analyticsPolicy = options.analyticsPolicy || {}
  const analytics = share.analytics || {}
  const selectedAnalyticsMode = analyticsModeValue(share)
  const configuredSpatialTileZoomMax = Number(options.spatialUnrestrictedTileMaxZoom)
  const spatialTileZoomMax = Number.isSafeInteger(configuredSpatialTileZoomMax) && configuredSpatialTileZoomMax >= 0 && configuredSpatialTileZoomMax <= 24
    ? configuredSpatialTileZoomMax
    : 14
  const configuredMaxFilesPerShare = Number(options.maxFilesPerShare)
  const maxFilesPerShare = Number.isSafeInteger(configuredMaxFilesPerShare) && configuredMaxFilesPerShare > 0
    ? configuredMaxFilesPerShare
    : 20
  const analyticsModeOptions = analyticsPolicy.enabled === true
    ? `<option value="none" ${selectedAnalyticsMode === 'none' ? 'selected' : ''}>不启用</option><option value="provider" ${selectedAnalyticsMode === 'provider' ? 'selected' : ''}>托管服务</option>${analyticsPolicy.customScriptEnabled === true ? `<option value="custom" ${selectedAnalyticsMode === 'custom' ? 'selected' : ''}>自定义脚本</option>` : ''}`
    : selectedAnalyticsMode === 'none'
      ? '<option value="none" selected>不启用</option>'
      : '<option value="keep" selected>后台未开放，保持现状</option>'
  const passwordTtlMode = share.passwordAccess?.ttlMode || share.passwordAccessTtlMode || 'finite'
  const mode = options.mode === 'create' ? 'create' : 'edit'
  const passwordlessSharingEnabled = options.passwordlessSharingEnabled === true
  const hasStoredPassword = share.passwordProtected === true
  const passwordActionOptions = mode === 'create'
    ? passwordlessSharingEnabled
      ? '<option value="keep">不设置</option><option value="change">设置新密码</option>'
      : '<option value="change" selected>设置新密码</option>'
    : hasStoredPassword
      ? `<option value="keep">保持不变</option><option value="change">设置新密码</option>${passwordlessSharingEnabled ? '<option value="remove">移除密码</option>' : ''}`
      : passwordlessSharingEnabled
        ? '<option value="keep">保持不设置</option><option value="change">设置新密码</option>'
        : '<option value="change" selected>设置新密码</option>'
  const center = Array.isArray(viewConfig.center) ? viewConfig.center : []

  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-account-share-action="cancel">
      <form class="app-dialog account-share-dialog" role="dialog" aria-modal="true" aria-labelledby="account-share-dialog-title" data-account-share-form autocomplete="off">
        <div class="account-share-dialog-heading">
          <div>
            <h2 id="account-share-dialog-title">${mode === 'create' ? '创建分享' : '编辑分享'}</h2>
            <p>${mode === 'create' ? '选择内容和访问范围，生成只读分享链接。' : '调整内容和地图视图后，原分享链接保持不变。'}</p>
          </div>
          <span data-account-share-count>${selectedItems.length} / ${maxFilesPerShare} 个 KML</span>
        </div>
        <div class="account-share-dialog-body">
          <section class="account-share-dialog-section">
            <h3>基本设置</h3>
            <label class="account-dialog-field"><span>分享标题</span><input name="title" value="${escapeHtml(share.title || '')}" maxlength="200" required></label>
            <label class="account-dialog-field"><span>分享说明</span><textarea name="description" rows="3" maxlength="5000">${escapeHtml(share.description || '')}</textarea></label>
            <div class="account-share-dialog-columns">
              <label class="account-dialog-field"><span>状态</span><select name="status"><option value="active" ${mode === 'create' || share.storedStatus === 'active' ? 'selected' : ''}>分享中</option><option value="paused" ${mode !== 'create' && share.storedStatus !== 'active' ? 'selected' : ''}>暂停</option></select></label>
              <label class="account-dialog-field"><span>允许下载</span><select name="allowDownload"><option value="true" ${share.allowDownload ? 'selected' : ''}>允许</option><option value="false" ${share.allowDownload ? '' : 'selected'}>禁止</option></select></label>
              <label class="account-dialog-field"><span>有效期</span><select name="expiresMode">${mode === 'edit' ? '<option value="keep">保持当前设置</option>' : ''}<option value="none">永不过期</option><option value="7d">从现在起 7 天</option><option value="30d">从现在起 30 天</option><option value="90d">从现在起 90 天</option></select></label>
              <label class="account-dialog-field"><span>分享密码</span><select name="passwordAction">${passwordActionOptions}</select></label>
            </div>
          </section>
          <section class="account-share-dialog-section">
            <h3>分享地图点位聚合</h3>
            <label class="account-dialog-field"><span>低缩放级别聚合</span><select name="kmlClusteringEnabled"><option value="false" ${clustering.enabled ? '' : 'selected'}>关闭（保持全部点位）</option><option value="true" ${clustering.enabled ? 'selected' : ''}>开启</option></select></label>
            <div class="account-share-dialog-columns" data-account-clustering-fields>
              <label class="account-dialog-field"><span>起始缩放级别</span><input name="kmlClusteringMinZoom" type="number" min="0" max="24" step="1" value="${escapeHtml(clustering.minZoom)}"></label>
              <label class="account-dialog-field"><span>结束缩放级别</span><input name="kmlClusteringMaxZoom" type="number" min="0" max="24" step="1" value="${escapeHtml(clustering.maxClusterZoom)}"></label>
              <label class="account-dialog-field"><span>网格大小（像素）</span><input name="kmlClusteringGridSize" type="number" min="24" max="128" step="1" value="${escapeHtml(clustering.gridSize)}"></label>
              <label class="account-dialog-field"><span>单网格最少聚合点数</span><input name="kmlClusteringMinPoints" type="number" min="2" max="1000" step="1" value="${escapeHtml(clustering.minClusterPoints)}"></label>
              <label class="account-dialog-field"><span>单簇明细上限</span><input name="kmlClusteringMaxMembers" type="number" min="100" max="20000" step="1" value="${escapeHtml(clustering.maxMembersPerCluster)}"></label>
            </div>
          </section>
          <section class="account-share-dialog-section">
            <h3>访问统计</h3>
            <div class="account-share-dialog-columns">
              <label class="account-dialog-field"><span>分享统计</span><select name="analyticsMode">${analyticsModeOptions}</select></label>
              <label class="account-dialog-field" data-account-analytics-provider-field><span>网站 ID</span><input name="analyticsWebsiteId" maxlength="160" value="${escapeHtml(analytics.websiteId || '')}" placeholder="填写统计服务分配的网站 ID"></label>
            </div>
            <label class="account-dialog-field" data-account-analytics-custom-field><span>统计脚本</span><textarea name="analyticsCustomScript" rows="3" maxlength="4096" spellcheck="false" placeholder="<script defer src=&quot;https://example.com/script.js&quot;></script>">${escapeHtml(scriptDescriptorToText(analytics.script))}</textarea></label>
          </section>
          <section class="account-share-dialog-section">
            <div class="account-share-dialog-section-heading"><div><h3>包含的 KML</h3><p>勾选文件，并在右侧调整顺序和默认显隐。</p></div></div>
            <div class="account-share-kml-editor">
              <div class="account-share-kml-catalog" aria-label="可选 KML">
                ${catalog.length ? catalogGroups.map(group => {
                  const ids = group.items.map(document => String(document.id))
                  const selectionState = getShareDirectorySelectionState(ids, selectedItems)
                  return `<div class="account-share-catalog-group" data-account-share-directory="${escapeHtml(group.id || '')}">
                    <label class="account-share-directory-toggle"><input type="checkbox" data-account-share-directory-toggle="${escapeHtml(group.id || '')}" ${selectionState.checked ? 'checked' : ''}><strong>${escapeHtml(group.name)}</strong><small>${group.items.length}</small></label>
                    <div class="account-share-directory-files">${group.items.map(document => {
                      const id = String(document.id)
                      const fileChecked = selectedItems.some(item => item.kmlId === id)
                      return `<label><input type="checkbox" data-account-share-kml-toggle="${escapeHtml(id)}" ${fileChecked ? 'checked' : ''}><span>${escapeHtml(document.name || '未命名 KML')}</span></label>`
                    }).join('')}</div>
                  </div>`
                }).join('') : '<p>暂无可加入分享的活跃 KML。</p>'}
              </div>
              <div class="account-share-kml-order" data-account-share-order aria-live="polite"></div>
            </div>
          </section>
          <section class="account-share-dialog-section">
            <h3>访问范围</h3>
            <div class="account-share-dialog-columns">
              <label class="account-dialog-field"><span>地图范围</span><select name="spatialAccessMode"><option value="unrestricted" ${spatialAccess.mode !== 'kml_bounds' ? 'selected' : ''}>不限制</option><option value="kml_bounds" ${spatialAccess.mode === 'kml_bounds' ? 'selected' : ''}>限制在 KML 区域</option></select></label>
              <label class="account-dialog-field" data-account-spatial-tile-zoom-field><span>范围外底图放宽到缩放级别</span><input name="unrestrictedTileMaxZoom" type="number" min="0" max="${spatialTileZoomMax}" step="1" value="${escapeHtml(spatialAccess.unrestrictedTileMaxZoom ?? '')}" placeholder="不放宽"></label>
              <label class="account-dialog-field" data-account-password-access-field><span>密码授权</span><select name="passwordAccessTtlMode"><option value="finite" ${passwordTtlMode !== 'unlimited' ? 'selected' : ''}>按后台有效期</option><option value="unlimited" ${passwordTtlMode === 'unlimited' ? 'selected' : ''}>不限固定期限</option></select></label>
            </div>
            <p data-account-spatial-summary>${spatialAccess.mode === 'kml_bounds'
              ? `${spatialAccess.status === 'ready' ? '范围正常' : '范围待确认'}${spatialAccess.areaKm2 !== null ? ` · 面积 ${spatialAccess.areaKm2.toFixed(1)} km²` : ''}${spatialAccess.diagonalKm !== null ? ` · 对角线 ${spatialAccess.diagonalKm.toFixed(1)} km` : ''}${spatialAccess.paddingMeters !== null ? ` · 余量 ${Math.round(spatialAccess.paddingMeters)} m` : ''}`
              : '地图范围不限制'}</p>
            <button type="button" class="account-secondary-button" data-account-spatial-preview>重新计算范围</button>
          </section>
          <section class="account-share-dialog-section">
            <h3>默认地图视图</h3>
            <div class="account-share-view-grid">
              <label class="account-dialog-field"><span>地图模式</span><select name="mapMode"><option value="2d" ${viewConfig.mapMode !== '3d' ? 'selected' : ''}>2D</option><option value="3d" ${viewConfig.mapMode === '3d' ? 'selected' : ''}>3D</option></select></label>
              <label class="account-dialog-field"><span>中心纬度</span><input name="centerLatitude" type="number" min="-90" max="90" step="any" value="${escapeHtml(center[0] ?? '')}" placeholder="-90 ～ 90"></label>
              <label class="account-dialog-field"><span>中心经度</span><input name="centerLongitude" type="number" min="-180" max="180" step="any" value="${escapeHtml(center[1] ?? '')}" placeholder="-180 ～ 180"></label>
              <label class="account-dialog-field"><span>缩放</span><input name="zoom" type="number" min="0" max="24" step="any" value="${escapeHtml(viewConfig.zoom ?? '')}" placeholder="0 ～ 24"></label>
              <label class="account-dialog-field"><span>旋转</span><input name="bearing" type="number" min="-360" max="360" step="any" value="${escapeHtml(viewConfig.bearing ?? 0)}"></label>
              <label class="account-dialog-field"><span>俯仰</span><input name="pitch" type="number" min="0" max="85" step="any" value="${escapeHtml(viewConfig.pitch ?? 0)}"></label>
            </div>
          </section>
        </div>
        <p class="account-share-dialog-error" data-account-share-error role="alert" hidden></p>
        <div class="app-dialog-actions">
          <button type="button" class="app-dialog-secondary" data-account-share-action="cancel">取消</button>
          <button type="submit" class="app-dialog-primary">${mode === 'create' ? '生成链接' : '保存分享'}</button>
        </div>
      </form>
    </div>
  `

  const form = root.querySelector('[data-account-share-form]')
  const dialog = root.querySelector('.account-share-dialog')
  const orderRoot = root.querySelector('[data-account-share-order]')
  const countRoot = root.querySelector('[data-account-share-count]')
  const errorRoot = root.querySelector('[data-account-share-error]')
  const spatialSummaryRoot = root.querySelector('[data-account-spatial-summary]')
  const spatialPreviewButton = root.querySelector('[data-account-spatial-preview]')
  const spatialTileZoomField = root.querySelector('[data-account-spatial-tile-zoom-field]')
  const passwordAccessField = root.querySelector('[data-account-password-access-field]')
  const analyticsModeField = form.elements.analyticsMode
  const analyticsProviderField = root.querySelector('[data-account-analytics-provider-field]')
  const analyticsCustomField = root.querySelector('[data-account-analytics-custom-field]')
  const clusteringFields = root.querySelector('[data-account-clustering-fields]')
  let previewKey = spatialAccess.mode === 'kml_bounds'
    ? `${selectedItems.map(item => item.kmlId).join(',')}|${spatialAccess.unrestrictedTileMaxZoom ?? ''}`
    : ''
  let latestPreview = spatialAccess.mode === 'kml_bounds' && spatialAccess.status === 'ready' ? spatialAccess : null
  let previewSequence = 0
  let previewTimer = null

  const renderPreview = preview => {
    latestPreview = preview || null
    if (!preview) {
      spatialSummaryRoot.textContent = '范围待确认'
      return
    }
    const status = preview.status === 'ready' ? '范围正常' : '范围不可用'
    spatialSummaryRoot.textContent = `${status}${preview.areaKm2 != null ? ` · 面积 ${Number(preview.areaKm2).toFixed(1)} km²` : ''}${preview.diagonalKm != null ? ` · 对角线 ${Number(preview.diagonalKm).toFixed(1)} km` : ''}${preview.paddingMeters != null ? ` · 余量 ${Math.round(Number(preview.paddingMeters))} m` : ''}${preview.unlimitedAccessEligible === true ? ' · 可用不限授权' : ''}`
  }
  const willHavePassword = () => form.elements.passwordAction.value === 'change' ||
    (mode === 'edit' && hasStoredPassword && form.elements.passwordAction.value !== 'remove')
  const updatePasswordAccessVisibility = () => {
    const hasPassword = willHavePassword()
    passwordAccessField.hidden = !hasPassword
    if (!hasPassword) form.elements.passwordAccessTtlMode.value = 'finite'
  }
  const updateSpatialTileZoomVisibility = () => {
    if (spatialTileZoomField) spatialTileZoomField.hidden = form.elements.spatialAccessMode.value !== 'kml_bounds'
  }
  const updateAnalyticsVisibility = () => {
    const mode = analyticsModeField?.value || 'none'
    if (analyticsProviderField) analyticsProviderField.hidden = mode !== 'provider'
    if (analyticsCustomField) analyticsCustomField.hidden = mode !== 'custom'
  }
  const updateClusteringVisibility = () => {
    if (clusteringFields) clusteringFields.hidden = form.elements.kmlClusteringEnabled?.value !== 'true'
  }
  const requestSpatialPreview = async () => {
    if (form.elements.spatialAccessMode.value !== 'kml_bounds') {
      spatialPreviewButton.hidden = true
      previewKey = ''
      latestPreview = null
      spatialSummaryRoot.textContent = '地图范围不限制'
      return
    }
    spatialPreviewButton.hidden = false
    if (typeof options.onSpatialPreview !== 'function' || !selectedItems.length) {
      latestPreview = null
      spatialSummaryRoot.textContent = '请选择 KML 后计算范围'
      return
    }
    const key = `${selectedItems.map(item => item.kmlId).join(',')}|${form.elements.unrestrictedTileMaxZoom?.value.trim() || ''}`
    previewKey = key
    const sequence = ++previewSequence
    spatialPreviewButton.disabled = true
    spatialSummaryRoot.textContent = '正在计算范围…'
    try {
      const rawZoom = form.elements.unrestrictedTileMaxZoom?.value.trim() || ''
      const unrestrictedTileMaxZoom = rawZoom === '' ? null : Number(rawZoom)
      const preview = await options.onSpatialPreview(
        selectedItems.map(item => ({ kmlId: item.kmlId })),
        { unrestrictedTileMaxZoom }
      )
      if (sequence !== previewSequence || key !== previewKey) return
      if (preview?.spatialAccessEligible === false || preview?.status !== 'ready') {
        renderPreview({ ...preview, status: preview?.status || 'error' })
        latestPreview = null
        return
      }
      renderPreview(preview)
    } catch (error) {
      if (sequence !== previewSequence) return
      latestPreview = null
      spatialSummaryRoot.textContent = error.message || '范围计算失败'
    } finally {
      if (sequence === previewSequence) spatialPreviewButton.disabled = false
    }
  }
  const scheduleSpatialPreview = () => {
    clearTimeout(previewTimer)
    previewTimer = setTimeout(() => { requestSpatialPreview() }, 120)
  }
  updatePasswordAccessVisibility()
  updateSpatialTileZoomVisibility()
  updateAnalyticsVisibility()
  updateClusteringVisibility()
  spatialPreviewButton.hidden = spatialAccess.mode !== 'kml_bounds'

  const showError = message => {
    errorRoot.textContent = String(message || '')
    errorRoot.hidden = !message
  }
  const showSelectionLimitError = () => {
    if (selectedItems.length <= maxFilesPerShare) return false
    showError(`当前已选 ${selectedItems.length} 个 KML，最多允许 ${maxFilesPerShare} 个，请先减少选择`)
    return true
  }
  const renderSelectedItems = () => {
    countRoot.textContent = `${selectedItems.length} / ${maxFilesPerShare} 个 KML`
    orderRoot.innerHTML = selectedItems.length ? selectedItems.map((item, index) => {
      const document = documentMap.get(item.kmlId) || {}
      return `
        <article class="account-share-kml-item">
          <span class="account-share-kml-position">${index + 1}</span>
          <strong>${escapeHtml(document.name || item.displayName || '未命名 KML')}</strong>
          <label><input type="checkbox" data-account-share-visible="${escapeHtml(item.kmlId)}" ${item.visibleByDefault ? 'checked' : ''}><span>默认显示</span></label>
          <div>
            <button type="button" data-account-share-move="up" data-id="${escapeHtml(item.kmlId)}" aria-label="上移" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" data-account-share-move="down" data-id="${escapeHtml(item.kmlId)}" aria-label="下移" title="下移" ${index === selectedItems.length - 1 ? 'disabled' : ''}>↓</button>
          </div>
        </article>
      `
    }).join('') : '<p>请从左侧至少选择一个活跃 KML。</p>'
    root.querySelectorAll('[data-account-share-kml-toggle]').forEach(input => {
      input.checked = selectedItems.some(item => item.kmlId === input.dataset.accountShareKmlToggle)
    })
    root.querySelectorAll('[data-account-share-directory-toggle]').forEach(input => {
      const directoryId = input.dataset.accountShareDirectoryToggle || ''
      const group = catalogGroups.find(item => String(item.id || '') === directoryId)
      const selectionState = getShareDirectorySelectionState(
        (group?.items || []).map(item => item.id),
        selectedItems,
      )
      input.checked = selectionState.checked
      input.indeterminate = selectionState.indeterminate
    })
  }
  renderSelectedItems()
  showSelectionLimitError()
  form.querySelector('input[name="title"]')?.focus()

  return new Promise(resolve => {
    const cleanup = () => {
      root.removeEventListener('click', onClick)
      root.removeEventListener('change', onChange)
      form.removeEventListener('submit', onSubmit)
      document.removeEventListener('keydown', onKeydown)
      clearTimeout(previewTimer)
    }
    const finish = value => {
      cleanup()
      root.innerHTML = ''
      root.hidden = true
      resolve(value)
    }
    const onClick = event => {
      const previewTarget = event.target.closest('[data-account-spatial-preview]')
      if (previewTarget) {
        requestSpatialPreview()
        return
      }
      const moveTarget = event.target.closest('[data-account-share-move]')
      if (moveTarget) {
        const index = selectedItems.findIndex(item => item.kmlId === moveTarget.dataset.id)
        const offset = moveTarget.dataset.accountShareMove === 'up' ? -1 : 1
        const nextIndex = index + offset
        if (index >= 0 && nextIndex >= 0 && nextIndex < selectedItems.length) {
          const [item] = selectedItems.splice(index, 1)
          selectedItems.splice(nextIndex, 0, item)
          showError('')
          renderSelectedItems()
        }
        return
      }
      const actionTarget = event.target.closest('[data-account-share-action]')
      if (!actionTarget) return
      if (actionTarget.classList.contains('app-dialog-backdrop') && dialog.contains(event.target)) return
      finish(null)
    }
    const onChange = event => {
      const catalogToggle = event.target.closest('[data-account-share-kml-toggle]')
      if (catalogToggle) {
        const kmlId = catalogToggle.dataset.accountShareKmlToggle
        if (catalogToggle.checked) {
          if (selectedItems.length >= maxFilesPerShare) {
            catalogToggle.checked = false
            showError(`一个分享最多包含 ${maxFilesPerShare} 个 KML`)
            return
          }
          if (!selectedItems.some(item => item.kmlId === kmlId)) {
            selectedItems.push({ kmlId, visibleByDefault: defaultVisibilityForKml(kmlId), displayName: '' })
          }
        } else {
          selectedItems = selectedItems.filter(item => item.kmlId !== kmlId)
        }
        showError('')
        renderSelectedItems()
        scheduleSpatialPreview()
        return
      }
      const directoryToggle = event.target.closest('[data-account-share-directory-toggle]')
      if (directoryToggle) {
        const directoryId = directoryToggle.dataset.accountShareDirectoryToggle || ''
        const group = catalogGroups.find(item => String(item.id || '') === directoryId)
        const ids = (group?.items || []).map(item => String(item.id))
        const nextChecked = directoryToggle.checked
        if (nextChecked && selectedItems.length + ids.filter(id => !selectedItems.some(item => item.kmlId === id)).length > maxFilesPerShare) {
          directoryToggle.checked = false
          showError(`一个分享最多包含 ${maxFilesPerShare} 个 KML`)
          return
        }
        if (nextChecked) {
          ids.forEach(kmlId => {
            if (!selectedItems.some(item => item.kmlId === kmlId)) {
              selectedItems.push({ kmlId, visibleByDefault: defaultVisibilityForKml(kmlId), displayName: '' })
            }
          })
        } else {
          selectedItems = selectedItems.filter(item => !ids.includes(item.kmlId))
        }
        showError('')
        renderSelectedItems()
        scheduleSpatialPreview()
        return
      }
      const visibleToggle = event.target.closest('[data-account-share-visible]')
      if (visibleToggle) {
        const item = selectedItems.find(entry => entry.kmlId === visibleToggle.dataset.accountShareVisible)
        if (item) item.visibleByDefault = visibleToggle.checked
        return
      }
      if (event.target.name === 'spatialAccessMode') {
        const restricted = event.target.value === 'kml_bounds'
        if (restricted) form.elements.mapMode.value = '2d'
        else form.elements.passwordAccessTtlMode.value = 'finite'
        spatialPreviewButton.hidden = !restricted
        latestPreview = null
        spatialSummaryRoot.textContent = restricted ? '保存前将重新计算范围' : '地图范围不限制'
        scheduleSpatialPreview()
        updateSpatialTileZoomVisibility()
      }
      if (event.target.name === 'unrestrictedTileMaxZoom') scheduleSpatialPreview()
      if (event.target.name === 'passwordAction') {
        updatePasswordAccessVisibility()
      }
      if (event.target.name === 'analyticsMode') updateAnalyticsVisibility()
      if (event.target.name === 'kmlClusteringEnabled') updateClusteringVisibility()
      if (event.target.name === 'passwordAccessTtlMode' && event.target.value === 'unlimited' && form.elements.spatialAccessMode.value !== 'kml_bounds') {
        form.elements.spatialAccessMode.value = 'kml_bounds'
        form.elements.mapMode.value = '2d'
        updateSpatialTileZoomVisibility()
        scheduleSpatialPreview()
      }
    }
    const onSubmit = event => {
      event.preventDefault()
      if (!selectedItems.length) {
        showError('分享至少需要包含一个活跃 KML')
        return
      }
      if (showSelectionLimitError()) return
      const latitude = form.elements.centerLatitude.value.trim()
      const longitude = form.elements.centerLongitude.value.trim()
      if (Boolean(latitude) !== Boolean(longitude)) {
        showError('地图中心需同时填写纬度和经度')
        return
      }
      const spatialAccessMode = form.elements.spatialAccessMode.value === 'kml_bounds' ? 'kml_bounds' : 'unrestricted'
      const passwordAccessTtlMode = form.elements.passwordAccessTtlMode.value === 'unlimited' ? 'unlimited' : 'finite'
      if (passwordAccessTtlMode === 'unlimited' && spatialAccessMode !== 'kml_bounds') {
        showError('不限授权需要先限制地图范围')
        return
      }
      if (passwordAccessTtlMode === 'unlimited' && !willHavePassword()) {
        showError('不限授权需要设置分享密码')
        return
      }
      if (spatialAccessMode === 'kml_bounds') {
        const key = `${selectedItems.map(item => item.kmlId).join(',')}|${form.elements.unrestrictedTileMaxZoom?.value.trim() || ''}`
        if (!latestPreview || previewKey !== key || latestPreview.status !== 'ready') {
          showError('请先完成范围计算')
          scheduleSpatialPreview()
          return
        }
        if (passwordAccessTtlMode === 'unlimited' && latestPreview.unlimitedAccessEligible !== true) {
          showError('当前范围不能使用不限授权')
          return
        }
      }
      let unrestrictedTileMaxZoom = null
      if (spatialAccessMode === 'kml_bounds') {
        const rawZoom = form.elements.unrestrictedTileMaxZoom.value.trim()
        if (rawZoom !== '') {
          const zoom = Number(rawZoom)
          if (!Number.isSafeInteger(zoom) || zoom < 0 || zoom > 24) {
            showError('范围外底图放宽级别需为 0～24 的整数')
            form.elements.unrestrictedTileMaxZoom.focus()
            return
          }
          if (zoom > spatialTileZoomMax) {
            showError(`范围外底图放宽级别不能高于管理员设置的最大级别（${spatialTileZoomMax}）`)
            form.elements.unrestrictedTileMaxZoom.focus()
            return
          }
          unrestrictedTileMaxZoom = zoom
        }
      }
      if (form.elements.analyticsMode.value === 'provider' && !form.elements.analyticsWebsiteId.value.trim()) {
        showError('请填写统计网站 ID')
        form.elements.analyticsWebsiteId.focus()
        return
      }
      if (form.elements.analyticsMode.value === 'custom' && !form.elements.analyticsCustomScript.value.trim()) {
        showError('请填写统计脚本')
        form.elements.analyticsCustomScript.focus()
        return
      }
      const viewInput = { mapMode: spatialAccessMode === 'kml_bounds' ? '2d' : form.elements.mapMode.value }
      if (latitude && longitude) viewInput.center = [Number(latitude), Number(longitude)]
      const numericFieldNames = ['zoom', 'bearing', 'pitch']
      numericFieldNames.forEach(name => {
        const value = form.elements[name].value.trim()
        if (value !== '') viewInput[name] = Number(value)
      })
      viewInput.kmlPointClustering = form.elements.kmlClusteringEnabled.value === 'true'
        ? {
            enabled: true,
            minZoom: Number(form.elements.kmlClusteringMinZoom.value),
            maxClusterZoom: Number(form.elements.kmlClusteringMaxZoom.value),
            gridSize: Number(form.elements.kmlClusteringGridSize.value),
            minClusterPoints: Number(form.elements.kmlClusteringMinPoints.value),
            maxMembersPerCluster: Number(form.elements.kmlClusteringMaxMembers.value),
          }
        : { enabled: false }
      try {
        finish({
          title: form.elements.title.value.trim(),
          description: form.elements.description.value,
          status: form.elements.status.value,
          allowDownload: form.elements.allowDownload.value === 'true',
          expiresMode: form.elements.expiresMode.value,
          passwordAction: form.elements.passwordAction.value,
          analytics: form.elements.analyticsMode.value === 'keep'
            ? undefined
            : form.elements.analyticsMode.value === 'provider'
            ? { mode: 'provider', websiteId: form.elements.analyticsWebsiteId.value.trim() }
            : form.elements.analyticsMode.value === 'custom'
              ? { mode: 'custom', script: form.elements.analyticsCustomScript.value.trim() }
              : { mode: 'none' },
          spatialAccess: { mode: spatialAccessMode, ...(spatialAccessMode === 'kml_bounds' ? { unrestrictedTileMaxZoom } : {}) },
          passwordAccess: { ttlMode: passwordAccessTtlMode },
          items: buildShareUpdateItems(selectedItems),
          viewConfig: buildShareViewConfig(viewInput, viewConfig),
        })
      } catch (error) {
        showError(error.message || '地图视图配置不正确')
      }
    }
    const onKeydown = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      finish(null)
    }
    root.addEventListener('click', onClick)
    root.addEventListener('change', onChange)
    form.addEventListener('submit', onSubmit)
    document.addEventListener('keydown', onKeydown)
    if (spatialAccess.mode === 'kml_bounds') scheduleSpatialPreview()
  })
}
