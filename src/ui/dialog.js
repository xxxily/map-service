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
  const checkbox = options.checkbox || null

  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-dialog-action="cancel">
      <section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <h2 id="app-dialog-title">${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        ${checkbox ? `
          <label class="app-dialog-check">
            <input type="checkbox" data-dialog-checkbox ${checkbox.checked ? 'checked' : ''}>
            <span>${escapeHtml(checkbox.label || '')}</span>
          </label>
        ` : ''}
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

    const resolveDialog = (confirmed) => {
      const checked = Boolean(root.querySelector('[data-dialog-checkbox]')?.checked)
      closeDialog(root, cleanup, resolve, checkbox ? { confirmed, checked } : confirmed)
    }

    const onClick = (event) => {
      const actionTarget = event.target.closest('[data-dialog-action]')
      if (!actionTarget) return
      if (dialog?.contains(event.target) && actionTarget.classList.contains('app-dialog-backdrop')) return
      resolveDialog(actionTarget.dataset.dialogAction === 'confirm')
    }

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        resolveDialog(false)
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

export function showCheckboxConfirm (message, options = {}) {
  return showDialog({
    title: options.title || '确认操作',
    message,
    confirmText: options.confirmText || '确认',
    cancelText: options.cancelText || '取消',
    showCancel: true,
    checkbox: {
      label: options.checkboxLabel || '',
      checked: Boolean(options.checked),
    },
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
            if (field.type === 'select') {
              return `
                <label style="display: block; margin-bottom: 12px;">
                  <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${escapeHtml(field.label)}</span>
                  <select name="${escapeHtml(field.name)}" style="width: 100%; height: 36px; padding: 0 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 13px; outline: none; background: #fff;">
                    ${(field.options || []).map(option => {
                      const optionValue = typeof option === 'object' ? option.value : option
                      const optionLabel = typeof option === 'object' ? option.label : option
                      const selected = String(values[field.name] ?? '') === String(optionValue) ? 'selected' : ''
                      return `<option value="${escapeHtml(optionValue)}" ${selected}>${escapeHtml(optionLabel)}</option>`
                    }).join('')}
                  </select>
                  ${field.hint ? `<small style="display: block; margin-top: 4px; color: #6b7280; line-height: 1.45;">${escapeHtml(field.hint)}</small>` : ''}
                </label>
              `
            }
            if (field.type === 'textarea') {
              return `
                <label style="display: block; margin-bottom: 12px;">
                  <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${escapeHtml(field.label)}</span>
                  <textarea name="${escapeHtml(field.name)}" rows="3" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-family: inherit; font-size: 13px; resize: vertical; outline: none;"></textarea>
                  ${field.hint ? `<small style="display: block; margin-top: 4px; color: #6b7280; line-height: 1.45;">${escapeHtml(field.hint)}</small>` : ''}
                </label>
                `
            }
            return `
              <label style="display: block; margin-bottom: 12px;">
                <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${escapeHtml(field.label)}</span>
                <input type="text" name="${escapeHtml(field.name)}" value="${val}" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 13px; outline: none;" required>
                ${field.hint ? `<small style="display: block; margin-top: 4px; color: #6b7280; line-height: 1.45;">${escapeHtml(field.hint)}</small>` : ''}
              </label>
            `
          }).join('')}
        </div>
        <div class="app-dialog-actions" style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 16px;">
          <div>
            ${options.showReset ? `<button type="button" class="app-dialog-secondary" data-dialog-action="reset" style="border-color: rgba(220, 38, 38, 0.25); color: #dc2626;">重置</button>` : ''}
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="app-dialog-secondary" data-dialog-action="cancel">${escapeHtml(cancelText)}</button>
            <button type="submit" class="app-dialog-primary">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </form>
    </div>
  `

  // 用 JS 填充 textarea，避免模板内多行文本破坏结构。
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
      
      const action = actionTarget.dataset.dialogAction
      if (action === 'cancel') {
        closeDialog(root, cleanup, resolve, null)
      } else if (action === 'reset') {
        event.preventDefault()
        event.stopPropagation()
        if (options.resetValues) {
          fields.forEach(field => {
            const el = form.querySelector(`[name="${field.name}"]`)
            if (el) {
              el.value = String(options.resetValues[field.name] ?? '')
            }
          })
        }
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

export function showChoiceDialog (options = {}) {
  const root = ensureDialogRoot()
  const title = options.title || '提示'
  const message = options.message || ''
  const choices = options.choices || [] // [{ text: '编辑', value: 'edit', class: 'primary' }]
  const cancelText = options.cancelText || '取消'
  const dismissible = options.dismissible !== false

  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-dialog-action="cancel">
      <section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <h2 id="app-dialog-title">${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="app-dialog-actions" style="flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 16px;">
          ${choices.map(choice => `
            <button type="button" class="${choice.class || 'app-dialog-secondary'}" data-choice-action="${escapeHtml(choice.value)}">${escapeHtml(choice.text)}</button>
          `).join('')}
          ${dismissible ? `<button type="button" class="app-dialog-secondary" data-dialog-action="cancel">${escapeHtml(cancelText)}</button>` : ''}
        </div>
      </section>
    </div>
  `

  const dialog = root.querySelector('.app-dialog')

  return new Promise((resolve) => {
    const cleanup = () => {
      root.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeydown)
    }

    const onClick = (event) => {
      const choiceBtn = event.target.closest('[data-choice-action]')
      if (choiceBtn) {
        closeDialog(root, cleanup, resolve, choiceBtn.dataset.choiceAction)
        return
      }

      const actionTarget = event.target.closest('[data-dialog-action]')
      if (actionTarget && actionTarget.dataset.dialogAction === 'cancel') {
        if (dialog?.contains(event.target) && actionTarget.classList.contains('app-dialog-backdrop')) return
        if (dismissible) closeDialog(root, cleanup, resolve, 'cancel')
      }
    }

    const onKeydown = (event) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault()
        closeDialog(root, cleanup, resolve, 'cancel')
      }
    }

    root.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeydown)
  })
}
