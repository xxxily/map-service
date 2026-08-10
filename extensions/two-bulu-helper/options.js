import {
  DEFAULT_ALLOWED_ORIGINS,
  normalizeAllowedOrigin,
  originMatchPattern,
} from './protocol.js'

const form = document.getElementById('origin-form')
const input = document.getElementById('origin')
const status = document.getElementById('status')
const list = document.getElementById('origins')
const version = document.getElementById('version')

function setStatus (message = '', type = '') {
  status.textContent = message
  status.className = `status${type ? ` ${type}` : ''}`
}

async function readOrigins () {
  const stored = await chrome.storage.local.get('allowedOrigins')
  return Array.isArray(stored.allowedOrigins) ? stored.allowedOrigins : [...DEFAULT_ALLOWED_ORIGINS]
}

async function writeOrigins (origins) {
  await chrome.storage.local.set({ allowedOrigins: [...new Set(origins)].sort() })
  await chrome.runtime.sendMessage({
    channel: 'map-service-two-bulu-helper',
    action: 'SYNC_ALLOWED_ORIGINS',
  })
}

function renderOrigins (origins) {
  if (!origins.length) {
    list.innerHTML = '<div class="empty">尚未授权任何 map-service 站点</div>'
    return
  }
  list.replaceChildren(...origins.map((origin) => {
    const row = document.createElement('div')
    row.className = 'origin-row'
    const value = document.createElement('code')
    value.textContent = origin
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'secondary'
    button.dataset.origin = origin
    button.textContent = '撤销'
    row.append(value, button)
    return row
  }))
}

async function refresh () {
  version.textContent = `扩展 v${chrome.runtime.getManifest().version} · 协议 v1`
  renderOrigins(await readOrigins())
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const button = form.querySelector('button[type="submit"]')
  button.disabled = true
  setStatus('')
  try {
    const origin = normalizeAllowedOrigin(input.value)
    const pattern = originMatchPattern(origin)
    const granted = await chrome.permissions.request({ origins: [pattern] })
    if (!granted) {
      setStatus('Chrome 未授予该站点权限，未保存授权。', 'error')
      return
    }
    const origins = await readOrigins()
    await writeOrigins([...origins, origin])
    input.value = ''
    setStatus('站点已授权。请刷新 map-service 页面，导入入口会在扩展探测成功后显示。', 'success')
    await refresh()
  } catch (error) {
    setStatus(error?.message || '授权失败，请检查站点地址。', 'error')
  } finally {
    button.disabled = false
  }
})

list.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-origin]')
  if (!button) return
  button.disabled = true
  setStatus('')
  try {
    const origin = button.dataset.origin
    const pattern = originMatchPattern(origin)
    const nextOrigins = (await readOrigins()).filter(item => item !== origin)
    await writeOrigins(nextOrigins)
    const patternStillUsed = nextOrigins.some(item => originMatchPattern(item) === pattern)
    if (!patternStillUsed) await chrome.permissions.remove({ origins: [pattern] })
    setStatus('站点授权已撤销；已打开页面刷新后入口会隐藏。', 'success')
    await refresh()
  } catch (error) {
    setStatus(error?.message || '撤销授权失败，请稍后重试。', 'error')
  } finally {
    button.disabled = false
  }
})

refresh().catch(error => setStatus(error?.message || '读取扩展设置失败。', 'error'))
