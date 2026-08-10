import { apiRequest } from '../auth/api.js'
import {
  getAuthSnapshot,
  hasPermission,
  refreshAuthSession,
  subscribeAuth,
} from '../auth/session.js'
import { showAlert, showConfirm } from '../ui/dialog.js'
import { gcj02ToWgs84, normalizeLongitude } from './coord-transform.js'

const FAVORITE_PERMISSION = 'favorite.own.manage'
const FAVORITE_SOURCE_TYPES = new Set(['search', 'map', 'location', 'kml', 'manual'])
const FAVORITE_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const DEFAULT_FAVORITE_COLOR = '#2563eb'

const SOURCE_LABELS = Object.freeze({
  search: '搜索结果',
  map: '地图中心',
  location: '定位结果',
  kml: 'KML 点位',
  manual: '手动位置',
})

let favoriteConfig = {
  readOnly: false,
  getCenterCandidate: null,
}
let activeCandidate = null
let authUnsubscribe = null
let favoriteSubmitting = false
let centerFavoriteButton = null

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeText (value, maxLength = 1000) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength)
}

function requireFiniteCoordinate (value, label, min, max) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new TypeError(`${label}不是有效坐标`)
  }
  return number
}

function normalizeCandidateLongitude (value) {
  return value >= -180 && value <= 180 ? value : normalizeLongitude(value)
}

export function parseFavoriteTags (value) {
  const source = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[,，\n]/)
  const tags = []
  const seen = new Set()
  for (const item of source) {
    const tag = normalizeText(item, 31)
    if (!tag) continue
    if (tag.length > 30) throw new TypeError('单个标签不能超过 30 个字符')
    const key = tag.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  if (tags.length > 20) throw new TypeError('标签数量不能超过 20 个')
  return tags
}

export function normalizeFavoriteCandidate (input = {}) {
  const sourceType = FAVORITE_SOURCE_TYPES.has(input.sourceType) ? input.sourceType : 'map'
  const coordType = input.coordType === 'wgs84' ? 'wgs84' : 'gcj02'
  const rawLongitude = normalizeCandidateLongitude(requireFiniteCoordinate(
    input.longitude ?? input.lng,
    '经度',
    -360,
    360,
  ))
  const rawLatitude = requireFiniteCoordinate(input.latitude ?? input.lat, '纬度', -90, 90)
  const [convertedLongitude, convertedLatitude] = coordType === 'gcj02'
    ? gcj02ToWgs84([rawLongitude, rawLatitude])
    : [rawLongitude, rawLatitude]
  const longitude = requireFiniteCoordinate(normalizeCandidateLongitude(convertedLongitude), '经度', -180, 180)
  const latitude = requireFiniteCoordinate(convertedLatitude, '纬度', -90, 90)

  return {
    name: normalizeText(input.name || SOURCE_LABELS[sourceType] || '收藏位置', 120) || '收藏位置',
    note: normalizeText(input.note, 2000),
    address: normalizeText(input.address, 500),
    category: normalizeText(input.category, 80),
    tags: parseFavoriteTags(input.tags),
    color: FAVORITE_COLOR_PATTERN.test(String(input.color || ''))
      ? String(input.color).toLowerCase()
      : DEFAULT_FAVORITE_COLOR,
    longitude,
    latitude,
    coordType: 'wgs84',
    sourceType,
    sourceRef: normalizeText(input.sourceRef, 200),
  }
}

export function createKmlFavoriteCandidate (kmlFile, feature) {
  if (kmlFile?.isShare || feature?.type !== 'Point' || !Array.isArray(feature.coordinates)) {
    return null
  }
  try {
    const kmlId = String(kmlFile?.id || '')
    const canReferenceOwnedKml = !kmlFile?.isPublic && /^kml_[A-Za-z0-9_-]+$/.test(kmlId)
    return normalizeFavoriteCandidate({
      name: feature.name || 'KML 点位',
      note: feature.description || '',
      longitude: feature.coordinates[0],
      latitude: feature.coordinates[1],
      coordType: kmlFile?.coordCorrection === 'none' ? 'gcj02' : 'wgs84',
      sourceType: 'kml',
      sourceRef: canReferenceOwnedKml ? kmlId : '',
      color: kmlFile?.color,
    })
  } catch (error) {
    return null
  }
}

export function buildFavoritePayload (candidate, values = {}) {
  const normalizedCandidate = normalizeFavoriteCandidate(candidate)
  const name = normalizeText(values.name, 121)
  const note = normalizeText(values.note, 2001)
  const category = normalizeText(values.category, 81)
  const tags = parseFavoriteTags(values.tags)
  const color = String(values.color || normalizedCandidate.color || DEFAULT_FAVORITE_COLOR).trim().toLowerCase()

  if (!name) throw new TypeError('请填写收藏名称')
  if (name.length > 120) throw new TypeError('收藏名称不能超过 120 个字符')
  if (note.length > 2000) throw new TypeError('备注不能超过 2000 个字符')
  if (category.length > 80) throw new TypeError('分类不能超过 80 个字符')
  if (!FAVORITE_COLOR_PATTERN.test(color)) throw new TypeError('请选择有效的收藏颜色')

  return {
    name,
    note,
    longitude: normalizedCandidate.longitude,
    latitude: normalizedCandidate.latitude,
    sourceType: normalizedCandidate.sourceType,
    sourceRef: normalizedCandidate.sourceRef,
    address: normalizedCandidate.address,
    category,
    tags,
    color,
  }
}

function normalizeReturnPath (locationLike = {}) {
  const pathname = String(locationLike.pathname || '/')
  const safePathname = /^\/(?!\/)/.test(pathname) && !pathname.includes('\\') ? pathname : '/'
  const search = String(locationLike.search || '').startsWith('?') ? String(locationLike.search) : ''
  const hash = String(locationLike.hash || '').startsWith('#') ? String(locationLike.hash) : ''
  return `${safePathname}${search}${hash}`
}

export function buildFavoriteAccountUrl (locationLike = {}) {
  return `/account?returnTo=${encodeURIComponent(normalizeReturnPath(locationLike))}`
}

export function isFavoriteSessionUsable (auth, expectedSessionId = '', now = Date.now()) {
  if (!auth?.authenticated || !hasPermission(FAVORITE_PERMISSION, auth)) return false
  const sessionId = String(auth.session?.id || '')
  if (expectedSessionId && sessionId !== String(expectedSessionId)) return false
  const expiresAt = Date.parse(String(auth.session?.expiresAt || ''))
  return !Number.isFinite(expiresAt) || expiresAt > now
}

function shouldOfferFavoriteAction () {
  if (favoriteConfig.readOnly) return false
  const auth = getAuthSnapshot()
  if (!auth.loaded || !auth.authenticated) return true
  return hasPermission(FAVORITE_PERMISSION, auth)
}

function renderFavoriteAvailability () {
  const offered = shouldOfferFavoriteAction()
  if (centerFavoriteButton) {
    const item = centerFavoriteButton.closest('li')
    if (item) item.hidden = !offered
  }
  if (typeof document !== 'undefined') {
    document.querySelectorAll('[data-favorite-action]').forEach(button => {
      button.hidden = !offered
    })
  }
  renderCandidateBar()
}

function ensureCandidateBar () {
  if (typeof document === 'undefined') return null
  let bar = document.getElementById('favorite-candidate-bar')
  if (bar) return bar
  bar = document.createElement('section')
  bar.id = 'favorite-candidate-bar'
  bar.className = 'favorite-candidate-bar'
  bar.hidden = true
  bar.setAttribute('aria-live', 'polite')
  bar.innerHTML = `
    <div class="favorite-candidate-copy">
      <span data-favorite-candidate-source></span>
      <strong data-favorite-candidate-name></strong>
      <small data-favorite-candidate-coordinates></small>
    </div>
    <button type="button" class="favorite-candidate-save" data-favorite-candidate-save>
      <svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.35-9.33-8.28C.9 9.73 2.04 6 5.4 5.1A5.35 5.35 0 0 1 12 8a5.35 5.35 0 0 1 6.6-2.9c3.36.9 4.5 4.63 2.73 7.62C19 16.65 12 21 12 21Z"/></svg>
      <span>保存收藏</span>
    </button>
    <button type="button" class="favorite-candidate-close" data-favorite-candidate-close aria-label="关闭收藏快捷条">×</button>
  `
  bar.querySelector('[data-favorite-candidate-save]')?.addEventListener('click', () => {
    if (activeCandidate) openFavoriteDialog(activeCandidate)
  })
  bar.querySelector('[data-favorite-candidate-close]')?.addEventListener('click', () => {
    activeCandidate = null
    renderCandidateBar()
  })
  document.body.appendChild(bar)
  return bar
}

function renderCandidateBar () {
  const bar = ensureCandidateBar()
  if (!bar) return
  if (!activeCandidate || !shouldOfferFavoriteAction()) {
    bar.hidden = true
    return
  }
  bar.hidden = false
  bar.querySelector('[data-favorite-candidate-source]').textContent = SOURCE_LABELS[activeCandidate.sourceType] || '候选位置'
  bar.querySelector('[data-favorite-candidate-name]').textContent = activeCandidate.name
  bar.querySelector('[data-favorite-candidate-coordinates]').textContent = `WGS84 · ${activeCandidate.latitude.toFixed(6)}, ${activeCandidate.longitude.toFixed(6)}`
  const saveButton = bar.querySelector('[data-favorite-candidate-save]')
  if (saveButton) saveButton.disabled = favoriteSubmitting
}

export function setFavoriteCandidate (candidate) {
  if (favoriteConfig.readOnly) return null
  try {
    activeCandidate = normalizeFavoriteCandidate(candidate)
  } catch (error) {
    console.warn('忽略无效的收藏候选位置', error)
    return null
  }
  renderCandidateBar()
  return { ...activeCandidate }
}

function ensureDialogRoot () {
  let root = document.getElementById('app-dialog-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'app-dialog-root'
    document.body.appendChild(root)
  }
  return root
}

function showFavoriteEditor (candidate) {
  const root = ensureDialogRoot()
  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-favorite-dialog-cancel>
      <form class="app-dialog favorite-dialog" role="dialog" aria-modal="true" aria-labelledby="favorite-dialog-title" data-favorite-dialog-form autocomplete="off">
        <h2 id="favorite-dialog-title">保存位置收藏</h2>
        <p class="favorite-dialog-position"><strong>${escapeHtml(SOURCE_LABELS[candidate.sourceType] || '候选位置')}</strong><span>${escapeHtml(candidate.latitude.toFixed(6))}, ${escapeHtml(candidate.longitude.toFixed(6))} · WGS84</span></p>
        <div class="favorite-dialog-fields">
          <label><span>名称</span><input name="name" maxlength="120" value="${escapeHtml(candidate.name)}" required></label>
          <label><span>备注</span><textarea name="note" maxlength="2000" rows="3"></textarea></label>
          <label><span>分类</span><input name="category" maxlength="80" value="${escapeHtml(candidate.category)}" placeholder="例如：出行"></label>
          <label><span>标签</span><input name="tags" value="${escapeHtml(candidate.tags.join(', '))}" placeholder="使用逗号分隔，最多 20 个"></label>
          <label class="favorite-dialog-color"><span>颜色</span><input name="color" type="color" value="${escapeHtml(candidate.color)}"><code data-favorite-color-value>${escapeHtml(candidate.color)}</code></label>
        </div>
        <p class="favorite-dialog-error" data-favorite-dialog-error role="alert" hidden></p>
        <div class="app-dialog-actions">
          <button type="button" class="app-dialog-secondary" data-favorite-dialog-cancel>取消</button>
          <button type="submit" class="app-dialog-primary">保存收藏</button>
        </div>
      </form>
    </div>
  `
  const form = root.querySelector('[data-favorite-dialog-form]')
  const note = form.elements.note
  note.value = candidate.note
  const colorInput = form.elements.color
  const colorValue = form.querySelector('[data-favorite-color-value]')
  colorInput.addEventListener('input', () => {
    colorValue.textContent = colorInput.value
  })
  form.elements.name.focus()

  return new Promise(resolve => {
    let settled = false
    const cleanup = () => {
      root.removeEventListener('click', onClick)
      form.removeEventListener('submit', onSubmit)
      document.removeEventListener('keydown', onKeydown)
      window.removeEventListener('map-auth-session-expired', onSessionExpired)
    }
    const close = value => {
      if (settled) return
      settled = true
      cleanup()
      root.innerHTML = ''
      root.hidden = true
      resolve(value)
    }
    const onClick = event => {
      const cancel = event.target.closest('[data-favorite-dialog-cancel]')
      if (!cancel) return
      if (cancel.classList.contains('app-dialog-backdrop') && event.target !== cancel) return
      close(null)
    }
    const onSubmit = event => {
      event.preventDefault()
      const errorNode = form.querySelector('[data-favorite-dialog-error]')
      try {
        const payload = buildFavoritePayload(candidate, {
          name: form.elements.name.value,
          note: form.elements.note.value,
          category: form.elements.category.value,
          tags: form.elements.tags.value,
          color: form.elements.color.value,
        })
        close({ payload })
      } catch (error) {
        errorNode.textContent = error.message || '收藏信息不正确'
        errorNode.hidden = false
      }
    }
    const onKeydown = event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close(null)
    }
    const onSessionExpired = () => close({ sessionExpired: true })

    root.addEventListener('click', onClick)
    form.addEventListener('submit', onSubmit)
    document.addEventListener('keydown', onKeydown)
    window.addEventListener('map-auth-session-expired', onSessionExpired, { once: true })
  })
}

async function getAuthorizedSession () {
  let auth = getAuthSnapshot()
  const expiresAt = Date.parse(String(auth.session?.expiresAt || ''))
  if (!auth.loaded || (auth.authenticated && Number.isFinite(expiresAt) && expiresAt <= Date.now())) {
    try {
      auth = await refreshAuthSession()
    } catch (error) {
      await showAlert('暂时无法确认登录状态，请稍后重试。')
      return null
    }
  }
  if (!auth.authenticated) {
    const confirmed = await showConfirm('保存位置收藏需要先登录。是否前往用户中心登录？', {
      title: '登录后保存收藏',
      confirmText: '前往登录',
    })
    if (confirmed) {
      window.location.assign(buildFavoriteAccountUrl(window.location))
    }
    return null
  }
  if (!hasPermission(FAVORITE_PERMISSION, auth)) {
    await showAlert('当前账号没有管理个人收藏的权限。')
    return null
  }
  return auth
}

async function offerExpiredSessionLogin () {
  const confirmed = await showConfirm('登录已失效，本次收藏未提交。是否重新登录？', {
    title: '登录已失效',
    confirmText: '重新登录',
  })
  if (confirmed) window.location.assign(buildFavoriteAccountUrl(window.location))
}

export async function openFavoriteDialog (candidate = activeCandidate) {
  if (favoriteConfig.readOnly || favoriteSubmitting) return null
  let normalizedCandidate
  try {
    normalizedCandidate = normalizeFavoriteCandidate(candidate)
  } catch (error) {
    await showAlert('当前位置坐标无效，无法保存收藏。')
    return null
  }

  const auth = await getAuthorizedSession()
  if (!auth) return null
  const expectedSessionId = String(auth.session?.id || '')
  const editorResult = await showFavoriteEditor(normalizedCandidate)
  if (!editorResult) return null
  if (editorResult.sessionExpired) {
    await offerExpiredSessionLogin()
    return null
  }
  if (!isFavoriteSessionUsable(getAuthSnapshot(), expectedSessionId)) {
    await offerExpiredSessionLogin()
    return null
  }

  favoriteSubmitting = true
  renderCandidateBar()
  try {
    const result = await apiRequest('/favorites', {
      method: 'POST',
      body: editorResult.payload,
    })
    if (activeCandidate && activeCandidate.sourceType === normalizedCandidate.sourceType &&
        activeCandidate.longitude === normalizedCandidate.longitude &&
        activeCandidate.latitude === normalizedCandidate.latitude) {
      activeCandidate = null
    }
    await showAlert(`已保存收藏“${result?.name || editorResult.payload.name}”。`)
    return result
  } catch (error) {
    if (error?.status === 401 || error?.code === 'AUTH_REQUIRED') {
      await offerExpiredSessionLogin()
    } else {
      await showAlert(`收藏保存失败：${error?.message || '请稍后重试'}`)
    }
    return null
  } finally {
    favoriteSubmitting = false
    renderCandidateBar()
  }
}

export function renderFavoriteActionButton (kmlFile, feature) {
  const candidate = createKmlFavoriteCandidate(kmlFile, feature)
  if (!candidate || favoriteConfig.readOnly || !shouldOfferFavoriteAction()) return ''
  return `
    <button type="button" class="favorite-inline-button" data-favorite-action aria-label="保存为位置收藏" title="保存为位置收藏">
      <svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.35-9.33-8.28C.9 9.73 2.04 6 5.4 5.1A5.35 5.35 0 0 1 12 8a5.35 5.35 0 0 1 6.6-2.9c3.36.9 4.5 4.63 2.73 7.62C19 16.65 12 21 12 21Z"/></svg>
    </button>
  `
}

export function bindFavoriteActionButtons (container, kmlFile, feature) {
  const candidate = createKmlFavoriteCandidate(kmlFile, feature)
  if (!candidate || favoriteConfig.readOnly || !container) return
  container.querySelectorAll('[data-favorite-action]').forEach(button => {
    if (button.dataset.favoriteBound === 'true') return
    button.dataset.favoriteBound = 'true'
    button.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      openFavoriteDialog(candidate)
    })
  })
}

export function initFavoriteActions (options = {}) {
  favoriteConfig = {
    ...favoriteConfig,
    readOnly: Boolean(options.readOnly),
    getCenterCandidate: options.getCenterCandidate instanceof Function ? options.getCenterCandidate : null,
  }
  const button = options.button || document.querySelector('[data-action="saveFavorite"]')
  centerFavoriteButton = button || null
  if (button) {
    const item = button.closest('li')
    if (item) item.hidden = !shouldOfferFavoriteAction()
    if (!favoriteConfig.readOnly && button.dataset.favoriteCenterBound !== 'true') {
      button.dataset.favoriteCenterBound = 'true'
      button.addEventListener('click', () => {
        const centerCandidate = favoriteConfig.getCenterCandidate?.()
        openFavoriteDialog(centerCandidate)
      })
    }
  }
  if (!authUnsubscribe) authUnsubscribe = subscribeAuth(renderFavoriteAvailability)
  renderFavoriteAvailability()
}

export { FAVORITE_PERMISSION }
