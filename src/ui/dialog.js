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
