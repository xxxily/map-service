import {
  buildShareUpdateItems,
  buildShareViewConfig,
  escapeHtml,
} from './model.js'

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
      <form class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="account-password-dialog-title" data-account-password-form>
        <h2 id="account-password-dialog-title">${escapeHtml(options.title || '验证密码')}</h2>
        <p>${escapeHtml(options.message || '请输入当前密码继续。')}</p>
        <label class="account-dialog-field">
          <span>${escapeHtml(options.label || '密码')}</span>
          <input name="password" type="password" minlength="${Number(options.minLength || 1)}" maxlength="128" autocomplete="${escapeHtml(options.autocomplete || 'current-password')}" required>
        </label>
        <div class="app-dialog-actions">
          <button type="button" class="app-dialog-secondary" data-account-password-action="cancel">取消</button>
          <button type="submit" class="app-dialog-primary">${escapeHtml(options.confirmText || '继续')}</button>
        </div>
      </form>
    </div>
  `
  const form = root.querySelector('[data-account-password-form]')
  const input = form.querySelector('input')
  input?.focus()

  return new Promise(resolve => {
    const cleanup = () => {
      root.removeEventListener('click', onClick)
      form.removeEventListener('submit', onSubmit)
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
    const onClick = event => {
      const target = event.target.closest('[data-account-password-action]')
      if (!target) return
      if (target.classList.contains('app-dialog-backdrop') && form.contains(event.target)) return
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
  let selectedItems = (share.items || [])
    .filter(item => documentMap.has(String(item?.kmlId || '')))
    .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
    .map(item => ({
      kmlId: String(item.kmlId),
      visibleByDefault: item.visibleByDefault !== false,
      displayName: String(item.displayName || ''),
    }))
  const viewConfig = share.viewConfig || {}
  const center = Array.isArray(viewConfig.center) ? viewConfig.center : []

  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-account-share-action="cancel">
      <form class="app-dialog account-share-dialog" role="dialog" aria-modal="true" aria-labelledby="account-share-dialog-title" data-account-share-form autocomplete="off">
        <div class="account-share-dialog-heading">
          <div>
            <h2 id="account-share-dialog-title">编辑分享</h2>
            <p>调整内容和地图视图后，原分享链接保持不变。</p>
          </div>
          <span data-account-share-count>${selectedItems.length} / 20 个 KML</span>
        </div>
        <div class="account-share-dialog-body">
          <section class="account-share-dialog-section">
            <h3>基本设置</h3>
            <label class="account-dialog-field"><span>分享标题</span><input name="title" value="${escapeHtml(share.title || '')}" maxlength="200" required></label>
            <label class="account-dialog-field"><span>分享说明</span><textarea name="description" rows="3" maxlength="5000">${escapeHtml(share.description || '')}</textarea></label>
            <div class="account-share-dialog-columns">
              <label class="account-dialog-field"><span>状态</span><select name="status"><option value="active" ${share.storedStatus === 'active' ? 'selected' : ''}>分享中</option><option value="paused" ${share.storedStatus !== 'active' ? 'selected' : ''}>暂停</option></select></label>
              <label class="account-dialog-field"><span>允许下载</span><select name="allowDownload"><option value="true" ${share.allowDownload ? 'selected' : ''}>允许</option><option value="false" ${share.allowDownload ? '' : 'selected'}>禁止</option></select></label>
              <label class="account-dialog-field"><span>有效期</span><select name="expiresMode"><option value="keep">保持当前设置</option><option value="none">永不过期</option><option value="7d">从现在起 7 天</option><option value="30d">从现在起 30 天</option><option value="90d">从现在起 90 天</option></select></label>
              <label class="account-dialog-field"><span>分享密码</span><select name="passwordAction"><option value="keep">保持不变</option><option value="change">设置新密码</option><option value="remove">移除密码</option></select></label>
            </div>
          </section>
          <section class="account-share-dialog-section">
            <div class="account-share-dialog-section-heading"><div><h3>包含的 KML</h3><p>勾选文件，并在右侧调整顺序和默认显隐。</p></div></div>
            <div class="account-share-kml-editor">
              <div class="account-share-kml-catalog" aria-label="可选 KML">
                ${catalog.length ? catalog.map(document => {
                  const id = String(document.id)
                  const checked = selectedItems.some(item => item.kmlId === id)
                  return `<label><input type="checkbox" data-account-share-kml-toggle="${escapeHtml(id)}" ${checked ? 'checked' : ''}><span>${escapeHtml(document.name || '未命名 KML')}</span></label>`
                }).join('') : '<p>暂无可加入分享的活跃 KML。</p>'}
              </div>
              <div class="account-share-kml-order" data-account-share-order aria-live="polite"></div>
            </div>
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
          <button type="submit" class="app-dialog-primary">保存分享</button>
        </div>
      </form>
    </div>
  `

  const form = root.querySelector('[data-account-share-form]')
  const dialog = root.querySelector('.account-share-dialog')
  const orderRoot = root.querySelector('[data-account-share-order]')
  const countRoot = root.querySelector('[data-account-share-count]')
  const errorRoot = root.querySelector('[data-account-share-error]')

  const showError = message => {
    errorRoot.textContent = String(message || '')
    errorRoot.hidden = !message
  }
  const renderSelectedItems = () => {
    countRoot.textContent = `${selectedItems.length} / 20 个 KML`
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
  }
  renderSelectedItems()
  form.querySelector('input[name="title"]')?.focus()

  return new Promise(resolve => {
    const cleanup = () => {
      root.removeEventListener('click', onClick)
      root.removeEventListener('change', onChange)
      form.removeEventListener('submit', onSubmit)
      document.removeEventListener('keydown', onKeydown)
    }
    const finish = value => {
      cleanup()
      root.innerHTML = ''
      root.hidden = true
      resolve(value)
    }
    const onClick = event => {
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
          if (selectedItems.length >= 20) {
            catalogToggle.checked = false
            showError('一个分享最多包含 20 个 KML')
            return
          }
          if (!selectedItems.some(item => item.kmlId === kmlId)) {
            selectedItems.push({ kmlId, visibleByDefault: true, displayName: '' })
          }
        } else {
          selectedItems = selectedItems.filter(item => item.kmlId !== kmlId)
        }
        showError('')
        renderSelectedItems()
        return
      }
      const visibleToggle = event.target.closest('[data-account-share-visible]')
      if (!visibleToggle) return
      const item = selectedItems.find(entry => entry.kmlId === visibleToggle.dataset.accountShareVisible)
      if (item) item.visibleByDefault = visibleToggle.checked
    }
    const onSubmit = event => {
      event.preventDefault()
      if (!selectedItems.length) {
        showError('分享至少需要包含一个活跃 KML')
        return
      }
      const latitude = form.elements.centerLatitude.value.trim()
      const longitude = form.elements.centerLongitude.value.trim()
      if (Boolean(latitude) !== Boolean(longitude)) {
        showError('地图中心需同时填写纬度和经度')
        return
      }
      const viewInput = { mapMode: form.elements.mapMode.value }
      if (latitude && longitude) viewInput.center = [Number(latitude), Number(longitude)]
      const numericFieldNames = ['zoom', 'bearing', 'pitch']
      numericFieldNames.forEach(name => {
        const value = form.elements[name].value.trim()
        if (value !== '') viewInput[name] = Number(value)
      })
      try {
        finish({
          title: form.elements.title.value.trim(),
          description: form.elements.description.value,
          status: form.elements.status.value,
          allowDownload: form.elements.allowDownload.value === 'true',
          expiresMode: form.elements.expiresMode.value,
          passwordAction: form.elements.passwordAction.value,
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
  })
}
