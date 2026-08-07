import { escapeHtml } from './utils.js'

function dialogRoot () {
  let root = document.getElementById('app-dialog-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'app-dialog-root'
    document.body.appendChild(root)
  }
  return root
}

export function showAdminPasswordDialog (options = {}) {
  const root = dialogRoot()
  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-admin-password-action="cancel">
      <form class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-password-dialog-title" data-admin-password-dialog>
        <h2 id="admin-password-dialog-title">${escapeHtml(options.title || '再次验证密码')}</h2>
        <p>${escapeHtml(options.message || '这是高风险管理操作，请输入当前账号密码继续。')}</p>
        <label class="admin-dialog-field">
          <span>当前密码</span>
          <input name="password" type="password" maxlength="128" autocomplete="current-password" required>
        </label>
        <div class="app-dialog-actions">
          <button type="button" class="app-dialog-secondary" data-admin-password-action="cancel">取消</button>
          <button type="submit" class="app-dialog-primary">${escapeHtml(options.confirmText || '验证并继续')}</button>
        </div>
      </form>
    </div>
  `

  const form = root.querySelector('[data-admin-password-dialog]')
  form.elements.password.focus()

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
      const target = event.target.closest('[data-admin-password-action]')
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

export async function withRecentReauth (api, operation) {
  try {
    return await operation()
  } catch (err) {
    if (err.code !== 'REAUTH_REQUIRED') throw err
  }

  const password = await showAdminPasswordDialog()
  if (password === null) {
    const err = new Error('已取消操作')
    err.code = 'ACTION_CANCELLED'
    throw err
  }
  await api.reauthenticate(password)
  return operation()
}
