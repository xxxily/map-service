import { apiRequest } from '../auth/api.js'

let activeShare = null

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function getSharePublicId (location = window.location) {
  const matched = /^\/share\/([^/]+)\/?$/.exec(location.pathname || '')
  const rawId = matched?.[1] || (
    (location.pathname === '/3d' || location.pathname === '/3d.html')
      ? new URLSearchParams(location.search || '').get('share')
      : ''
  )
  if (!rawId) return ''
  try {
    return decodeURIComponent(rawId)
  } catch {
    return ''
  }
}

export function isShareLocation (location = window.location) {
  return Boolean(getSharePublicId(location))
}

export function getActiveShare () {
  return activeShare
    ? { publicId: activeShare.publicId, manifest: { ...activeShare.manifest } }
    : null
}

function renderUnavailable (message) {
  document.body.classList.add('share-view', 'share-unavailable')
  document.getElementById('map-lock-screen')?.remove()
  const screen = document.createElement('div')
  screen.id = 'map-lock-screen'
  screen.className = 'lock-screen-backdrop'
  screen.innerHTML = `
    <section class="lock-screen-card" role="alert">
      <div class="lock-screen-icon">🗺️</div>
      <h2>分享暂不可用</h2>
      <p>${escapeHtml(message || '该分享不存在、已暂停或已过期。')}</p>
      <a class="lock-screen-link" href="/">返回地图首页</a>
    </section>
  `
  document.body.appendChild(screen)
}

function showPasswordScreen (options) {
  document.getElementById('map-lock-screen')?.remove()
  const screen = document.createElement('div')
  screen.id = 'map-lock-screen'
  screen.className = 'lock-screen-backdrop'
  screen.innerHTML = `
    <div class="lock-screen-card">
      <div class="lock-screen-icon">🔒</div>
      <h2>${escapeHtml(options.title)}</h2>
      <p>${escapeHtml(options.message)}</p>
      <form data-share-password-form autocomplete="off">
        <div class="lock-screen-field">
          <input type="password" name="password" minlength="4" maxlength="128" placeholder="请输入密码" required autofocus>
        </div>
        <div class="lock-screen-error" data-share-password-error hidden></div>
        <button type="submit">${escapeHtml(options.submitText || '验证并查看')}</button>
      </form>
    </div>
  `
  document.body.appendChild(screen)
  const form = screen.querySelector('[data-share-password-form]')
  const errorNode = screen.querySelector('[data-share-password-error]')
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const password = form.elements.password.value
    if (!password) return
    const button = form.querySelector('button[type="submit"]')
    button.disabled = true
    errorNode.hidden = true
    try {
      await options.verify(password)
      screen.remove()
      await options.retry()
    } catch (error) {
      button.disabled = false
      errorNode.textContent = error.message || '密码验证失败'
      errorNode.hidden = false
    }
  })
}

function shareUnavailableMessage (error) {
  const messages = {
    SHARE_PAUSED: '分享已由所有者暂停。',
    SHARE_EXPIRED: '分享已过期。',
    RESOURCE_NOT_FOUND: '分享不存在、已撤销或已被管理员封禁。',
  }
  return messages[error?.code] || error?.message || '分享数据加载失败，请稍后重试。'
}

export async function prepareShareView (init) {
  const publicId = getSharePublicId()
  if (!publicId) return false
  document.body.classList.add('share-view')

  const load = async () => {
    try {
      const manifest = await apiRequest(`/public/kml-shares/${encodeURIComponent(publicId)}`, {
        csrf: false,
      })
      if (manifest.viewConfig?.mapMode === '3d' && window.location.pathname.startsWith('/share/')) {
        window.location.replace(`/3d?share=${encodeURIComponent(publicId)}`)
        return
      }
      activeShare = { publicId, manifest }
      await init()
    } catch (error) {
      if (error.code === 'SITE_ACCESS_REQUIRED') {
        showPasswordScreen({
          title: '站点访问验证',
          message: '该分享继承了站点访问保护，请先输入站点访问密码。',
          verify: password => apiRequest('/access/verify', {
            method: 'POST',
            body: { password },
            csrf: false,
          }),
          retry: load,
        })
        return
      }
      if (error.code === 'SHARE_PASSWORD_REQUIRED') {
        showPasswordScreen({
          title: '分享密码验证',
          message: '该分享设置了独立访问密码。',
          verify: password => apiRequest(`/public/kml-shares/${encodeURIComponent(publicId)}/access`, {
            method: 'POST',
            body: { password },
            csrf: false,
          }),
          retry: load,
        })
        return
      }
      renderUnavailable(shareUnavailableMessage(error))
    }
  }

  await load()
  return true
}

export async function loadActiveShareFiles (options = {}) {
  if (!activeShare) return []
  const publicId = activeShare.publicId
  const items = activeShare.manifest.items || []
  const concurrency = Math.max(1, Math.min(6, Number(options.concurrency) || 4))
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker () {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      const summary = items[index]
      try {
        const detail = await apiRequest(
          `/public/kml-shares/${encodeURIComponent(publicId)}/files/${encodeURIComponent(summary.shareItemId)}`,
          { csrf: false }
        )
        results[index] = {
          ...summary,
          ...detail,
          id: summary.shareItemId,
          shareItemId: summary.shareItemId,
          isPublic: true,
          isShare: true,
          enabled: summary.visibleByDefault !== false,
          lockDrag: true,
          readOnly: true,
          allowDownload: Boolean(activeShare.manifest.allowDownload),
          features: Array.isArray(detail.features) ? detail.features : [],
        }
      } catch (error) {
        results[index] = {
          ...summary,
          id: summary.shareItemId,
          shareItemId: summary.shareItemId,
          isPublic: true,
          isShare: true,
          enabled: false,
          readOnly: true,
          allowDownload: false,
          features: [],
          loadError: error.message || '加载失败',
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results.filter(Boolean)
}
