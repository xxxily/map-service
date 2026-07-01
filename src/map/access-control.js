import { getAccessStatus, verifyAccessPassword } from '../admin/api.js'
import { escapeHtml } from '../admin/utils.js'

export async function initAfterAccessCheck (options) {
  const {
    init,
    title = '私有地图服务',
    message = '管理员启用了访问控制，请输入密码解锁',
    submitText = '载入地图',
    loadingText = '正在验证...',
  } = options

  try {
    const status = await getAccessStatus()
    if (status.required) {
      showPasswordLockScreen({
        init,
        title,
        message,
        submitText,
        loadingText,
      })
    } else {
      await init()
    }
  } catch (err) {
    console.error('Failed to check map access status', err)
    showPasswordLockScreen({
      init,
      title,
      message: '访问状态检查失败，请稍后重试',
      submitText,
      loadingText,
      allowRetry: true,
    })
  }
}

function showPasswordLockScreen (options) {
  const {
    init,
    title,
    message,
    submitText,
    loadingText,
    allowRetry = false,
  } = options

  document.getElementById('map-lock-screen')?.remove()

  const lockScreen = document.createElement('div')
  lockScreen.id = 'map-lock-screen'
  lockScreen.className = 'lock-screen-backdrop'
  lockScreen.innerHTML = `
    <div class="lock-screen-card">
      <div class="lock-screen-icon">🔒</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <form id="lock-screen-form" autocomplete="off">
        <div class="lock-screen-field">
          <input type="password" name="password" placeholder="请输入访问密码" required autofocus>
        </div>
        <div id="lock-screen-error" class="lock-screen-error" style="${allowRetry ? '' : 'display: none;'}">${allowRetry ? escapeHtml(message) : ''}</div>
        <button type="submit">${escapeHtml(submitText)}</button>
        ${allowRetry ? '<button type="button" class="lock-screen-secondary" data-lock-retry>重试检查</button>' : ''}
      </form>
    </div>
  `

  document.body.appendChild(lockScreen)

  const form = document.getElementById('lock-screen-form')
  const errorNode = document.getElementById('lock-screen-error')
  const retryButton = lockScreen.querySelector('[data-lock-retry]')

  retryButton?.addEventListener('click', () => {
    lockScreen.remove()
    initAfterAccessCheck({
      init,
      title,
      submitText,
      loadingText,
    })
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    errorNode.style.display = 'none'
    const password = form.elements.password.value.trim()
    if (!password) return

    const submitButton = form.querySelector('button[type="submit"]')
    try {
      submitButton.disabled = true
      submitButton.textContent = loadingText

      await verifyAccessPassword(password)

      lockScreen.remove()
      await init()
    } catch (err) {
      submitButton.disabled = false
      submitButton.textContent = submitText
      errorNode.textContent = err.message || '访问密码错误'
      errorNode.style.display = 'block'
    }
  })
}
