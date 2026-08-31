import { apiRequest } from '../auth/api.js'
import { loadAnalyticsScript } from '../analytics.js'
import { applySharePageMetadata, getSharePageCanonicalUrl } from '../../shared/share-page-metadata.js'
import { computeKmlBounds, normalizeKmlBounds } from '../../shared/kml-spatial.js'

let activeShare = null
const activeShareFileLoads = new Map()
let shareFileApiRequest = apiRequest

export function setShareFileApiRequestForTests (request) {
  shareFileApiRequest = request instanceof Function ? request : apiRequest
}

export function setActiveShareForTests (share) {
  activeShareFileLoads.clear()
  activeShare = share
    ? { publicId: String(share.publicId || ''), manifest: { ...(share.manifest || {}) } }
    : null
}

function takeSharePasswordFromLocation (publicId) {
  if (typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  const password = url.searchParams.get('password') || ''
  if (!password) return ''
  url.searchParams.delete('password')
  window.history.replaceState(window.history.state, document.title, `${url.pathname}${url.search}${url.hash}`)
  return password
}

function markSharePageNoIndex () {
  let meta = document.querySelector('meta[name="robots"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'robots'
    document.head.appendChild(meta)
  }
  meta.content = 'noindex, nofollow'
  let referrer = document.querySelector('meta[name="referrer"]')
  if (!referrer) {
    referrer = document.createElement('meta')
    referrer.name = 'referrer'
    document.head.appendChild(referrer)
  }
  referrer.content = 'no-referrer'
}

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

export function getShareSpatialConfig (manifest) {
  const spatial = manifest?.spatialAccess
  if (!spatial || spatial.mode === 'unrestricted') {
    return { restricted: false, valid: true, mode: 'unrestricted' }
  }
  if (spatial.mode !== 'kml_bounds' || spatial.status !== 'ready') {
    return { restricted: true, valid: false, mode: spatial.mode || 'unknown', reasonCode: spatial.reasonCode || 'SHARE_SPATIAL_UNAVAILABLE' }
  }
  const cameraBounds = Array.isArray(spatial.cameraBounds) && spatial.cameraBounds.length === 4
    ? spatial.cameraBounds.map(Number)
    : null
  const minZoom = Number(spatial.minZoom)
  const unrestrictedTileMaxZoom = spatial.unrestrictedTileMaxZoom === null || spatial.unrestrictedTileMaxZoom === undefined || spatial.unrestrictedTileMaxZoom === ''
    ? null
    : Number(spatial.unrestrictedTileMaxZoom)
  const valid = Boolean(
    Number(spatial.version) === 2 &&
    spatial.geometryType === 'BoundingBox' &&
    cameraBounds && cameraBounds.every(Number.isFinite) &&
    cameraBounds[2] - cameraBounds[0] > 0 &&
    cameraBounds[2] - cameraBounds[0] <= 360 &&
    cameraBounds[1] >= -90 && cameraBounds[1] <= 90 &&
    cameraBounds[3] >= -90 && cameraBounds[3] <= 90 &&
    cameraBounds[1] < cameraBounds[3] &&
    Number.isFinite(minZoom) && minZoom >= 0 && minZoom <= 24 &&
    (unrestrictedTileMaxZoom === null || (Number.isSafeInteger(unrestrictedTileMaxZoom) && unrestrictedTileMaxZoom >= 0 && unrestrictedTileMaxZoom <= 24))
  )
  return {
    restricted: true,
    valid,
    mode: 'kml_bounds',
    version: valid ? 2 : null,
    geometryType: valid ? 'BoundingBox' : null,
    cameraBounds: valid ? cameraBounds : null,
    minZoom: valid ? minZoom : null,
    unrestrictedTileMaxZoom: valid ? unrestrictedTileMaxZoom : null,
    effectiveMinZoom: valid ? Math.min(minZoom, unrestrictedTileMaxZoom ?? minZoom) : null,
    maxCameraHeight: Number.isFinite(Number(spatial.maxCameraHeight)) ? Number(spatial.maxCameraHeight) : null,
    reasonCode: valid ? null : 'SHARE_SPATIAL_UNAVAILABLE',
  }
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
    SHARE_SPATIAL_UNAVAILABLE: '分享地图范围暂不可用，请稍后重试。',
  }
  return messages[error?.code] || error?.message || '分享数据加载失败，请稍后重试。'
}

export async function prepareShareView (init) {
  const publicId = getSharePublicId()
  if (!publicId) return false
  const passwordFromLink = takeSharePasswordFromLocation(publicId)
  markSharePageNoIndex()
  document.body.classList.add('share-view')

  const load = async () => {
    try {
      const manifest = await apiRequest(`/public/kml-shares/${encodeURIComponent(publicId)}`, {
        csrf: false,
      })
      const spatial = getShareSpatialConfig(manifest)
      if (!spatial.valid) {
        const error = new Error('分享地图范围暂不可用')
        error.code = spatial.reasonCode || 'SHARE_SPATIAL_UNAVAILABLE'
        throw error
      }
      if (spatial.restricted && (window.location.pathname === '/3d' || window.location.pathname === '/3d.html')) {
        const url = new URL(window.location.href)
        url.pathname = `/share/${encodeURIComponent(publicId)}`
        url.searchParams.delete('share')
        window.location.replace(`${url.pathname}${url.search}${url.hash}`)
        return
      }
      if (!spatial.restricted && manifest.viewConfig?.mapMode === '3d' && window.location.pathname.startsWith('/share/')) {
        const url = new URL(window.location.href)
        url.pathname = '/3d'
        url.searchParams.set('share', publicId)
        window.location.replace(`${url.pathname}${url.search}${url.hash}`)
        return
      }
      activeShareFileLoads.clear()
      activeShare = { publicId, manifest }
      applySharePageMetadata({
        title: manifest.title,
        description: manifest.description,
        canonicalUrl: getSharePageCanonicalUrl(publicId, window.location),
      })
      loadAnalyticsScript(manifest.analytics)
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
        if (passwordFromLink) {
          try {
            await apiRequest(`/public/kml-shares/${encodeURIComponent(publicId)}/access`, {
              method: 'POST',
              body: { password: passwordFromLink, accessMethod: 'password_link' },
              csrf: false,
            })
            await load()
            return
          } catch {
            // Fall through to the normal password form without exposing the
            // failed value in the URL or the UI.
          }
        }
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
  const loadHidden = options.loadHidden === true
  const loadDetails = options.loadDetails !== false
  const concurrency = Math.max(1, Math.min(6, Number(options.concurrency) || 4))
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker () {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      const summary = items[index]
      if (!loadDetails || (!loadHidden && summary.visibleByDefault === false)) {
        results[index] = {
          ...summary,
          id: summary.shareItemId,
          sharePublicId: publicId,
          shareItemId: summary.shareItemId,
          isPublic: true,
          isShare: true,
          // Deferring detail loading must not change the manifest's runtime
          // visibility. Visible-by-default files enter the viewport scheduler;
          // hidden files remain available in the panel without a request.
          enabled: summary.visibleByDefault !== false,
          readOnly: true,
          allowDownload: Boolean(activeShare.manifest.allowDownload),
          features: [],
          contentLoaded: false,
          loadError: '',
        }
        continue
      }
      results[index] = await loadActiveShareFile(summary)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results.filter(Boolean)
}

export async function loadActiveShareFile (fileOrSummary) {
  if (!activeShare || !fileOrSummary) return null
  const publicId = activeShare.publicId
  const summary = fileOrSummary
  if (summary.contentLoaded === true) return summary

  const shareItemId = String(summary.shareItemId || summary.id || '')
  if (!shareItemId) {
    summary.enabled = false
    summary.loadError = '分享文件标识无效'
    summary.contentLoaded = false
    return summary
  }

  const loadKey = `${publicId}:${shareItemId}`
  const pending = activeShareFileLoads.get(loadKey)
  if (pending) {
    const loaded = await pending
    if (loaded !== summary) Object.assign(summary, loaded)
    return summary
  }

  const runtimeEnabled = typeof summary.enabled === 'boolean'
    ? summary.enabled
    : summary.visibleByDefault !== false
  const load = (async () => {
    try {
      const detail = await shareFileApiRequest(
        `/public/kml-shares/${encodeURIComponent(publicId)}/files/${encodeURIComponent(shareItemId)}`,
        { csrf: false }
      )
      const features = Array.isArray(detail.features) ? detail.features : []
      const bounds = normalizeKmlBounds(detail.bounds, { featureCount: features.length }) || computeKmlBounds(features)
      Object.assign(summary, {
        ...detail,
        id: shareItemId,
        sharePublicId: publicId,
        shareItemId,
        isPublic: true,
        isShare: true,
        enabled: runtimeEnabled,
        lockDrag: true,
        readOnly: true,
        allowDownload: Boolean(activeShare.manifest.allowDownload),
        features,
        bounds,
        contentLoaded: true,
        loadError: null,
      })
    } catch (error) {
      summary.enabled = false
      summary.loadError = error.message || '加载失败'
      summary.contentLoaded = false
    }
    return summary
  })()

  activeShareFileLoads.set(loadKey, load)
  try {
    return await load
  } finally {
    if (activeShareFileLoads.get(loadKey) === load) activeShareFileLoads.delete(loadKey)
  }
}
