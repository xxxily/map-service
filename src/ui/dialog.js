function ensureDialogRoot () {
  let root = document.getElementById('app-dialog-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'app-dialog-root'
    document.body.appendChild(root)
  }
  return root
}

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function closeDialog (root, cleanup, resolve, value) {
  cleanup()
  root.innerHTML = ''
  root.hidden = true
  resolve(value)
}

export function showDialog (options = {}) {
  const root = ensureDialogRoot()
  const title = options.title || '提示'
  const message = options.message || ''
  const confirmText = options.confirmText || '确定'
  const cancelText = options.cancelText || '取消'
  const showCancel = Boolean(options.showCancel)

  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-dialog-action="cancel">
      <section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <h2 id="app-dialog-title">${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="app-dialog-actions">
          ${showCancel ? `<button type="button" class="app-dialog-secondary" data-dialog-action="cancel">${escapeHtml(cancelText)}</button>` : ''}
          <button type="button" class="app-dialog-primary" data-dialog-action="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </section>
    </div>
  `

  const dialog = root.querySelector('.app-dialog')
  const primary = root.querySelector('.app-dialog-primary')
  primary?.focus()

  return new Promise((resolve) => {
    const cleanup = () => {
      root.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeydown)
    }

    const onClick = (event) => {
      const actionTarget = event.target.closest('[data-dialog-action]')
      if (!actionTarget) return
      if (dialog?.contains(event.target) && actionTarget.classList.contains('app-dialog-backdrop')) return
      closeDialog(root, cleanup, resolve, actionTarget.dataset.dialogAction === 'confirm')
    }

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDialog(root, cleanup, resolve, false)
      }
    }

    root.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeydown)
  })
}

export function showAlert (message, options = {}) {
  return showDialog({
    title: options.title || '提示',
    message,
    confirmText: options.confirmText || '知道了',
  })
}

export function showConfirm (message, options = {}) {
  return showDialog({
    title: options.title || '确认操作',
    message,
    confirmText: options.confirmText || '确认',
    cancelText: options.cancelText || '取消',
    showCancel: true,
  })
}

export function showEditDialog (options = {}) {
  const root = ensureDialogRoot()
  const title = options.title || '编辑属性'
  const fields = options.fields || []
  const values = options.values || {}
  const confirmText = options.confirmText || '保存'
  const cancelText = options.cancelText || '取消'

  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-dialog-action="cancel">
      <form class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" data-dialog-form autocomplete="off">
        <h2 id="app-dialog-title">${escapeHtml(title)}</h2>
        <div class="app-dialog-body" style="margin: 16px 0; text-align: left;">
          ${fields.map(field => {
            const val = escapeHtml(values[field.name] || '')
            if (field.type === 'textarea') {
              return `
                <label style="display: block; margin-bottom: 12px;">
                  <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${escapeHtml(field.label)}</span>
                  <textarea name="${escapeHtml(field.name)}" rows="3" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-family: inherit; font-size: 13px; resize: vertical; outline: none;"></textarea>
                `
            }
            return `
              <label style="display: block; margin-bottom: 12px;">
                <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${escapeHtml(field.label)}</span>
                <input type="text" name="${escapeHtml(field.name)}" value="${val}" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 13px; outline: none;" required>
              </label>
            `
          }).join('')}
        </div>
        <div class="app-dialog-actions">
          <button type="button" class="app-dialog-secondary" data-dialog-action="cancel">${escapeHtml(cancelText)}</button>
          <button type="submit" class="app-dialog-primary">${escapeHtml(confirmText)}</button>
        </div>
      </form>
    </div>
  `

  // 这里的 textarea 没有在 HTML 里直接塞入文本值（可能为了避免 XSS 或多行文本格式破裂，但这里可以用 JS 来安全赋值）：
  const form = root.querySelector('[data-dialog-form]')
  fields.forEach(field => {
    if (field.type === 'textarea') {
      const textarea = form.querySelector(`textarea[name="${field.name}"]`)
      if (textarea) {
        textarea.value = values[field.name] || ''
      }
    }
  })

  const primary = root.querySelector('.app-dialog-primary')
  primary?.focus()

  return new Promise((resolve) => {
    const cleanup = () => {
      root.removeEventListener('click', onClick)
      form?.removeEventListener('submit', onSubmit)
      document.removeEventListener('keydown', onKeydown)
    }

    const onSubmit = (event) => {
      event.preventDefault()
      const formData = new FormData(form)
      const result = {}
      for (const [key, val] of formData.entries()) {
        result[key] = val
      }
      closeDialog(root, cleanup, resolve, result)
    }

    const onClick = (event) => {
      const actionTarget = event.target.closest('[data-dialog-action]')
      if (!actionTarget) return
      if (form?.contains(event.target) && actionTarget.classList.contains('app-dialog-backdrop')) return
      if (actionTarget.dataset.dialogAction === 'cancel') {
        closeDialog(root, cleanup, resolve, null)
      }
    }

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDialog(root, cleanup, resolve, null)
      }
    }

    root.addEventListener('click', onClick)
    form?.addEventListener('submit', onSubmit)
    document.addEventListener('keydown', onKeydown)
  })
}
