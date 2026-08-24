import { apiRequest } from '../auth/api.js'
import { getAuthSnapshot, refreshAuthSession } from '../auth/session.js'
import { showAlert, showCheckboxConfirm, showChoiceDialog, showEditDialog } from './dialog.js'

const asText = value => String(value ?? '')
const escapeInteractionHtml = value => asText(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])

export function interactionResourceRef (item) {
  const nested = item?.resourceRef || item?.interactionResource || {}
  return {
    sharePublicId: asText(item?.sharePublicId || item?.publicId || nested.sharePublicId),
    shareItemId: asText(item?.shareItemId || item?.kmlId || nested.shareItemId),
    featureId: asText(item?.resourceFeatureId || item?.featureId || nested.featureId),
    mediaId: asText(item?.mediaId || nested.mediaId),
    scope: 'feature',
  }
}

let countController = null

export async function syncInteractionControls (root, item) {
  countController?.abort()
  countController = new AbortController()
  const resource = interactionResourceRef(item)
  const commentsEnabled = Boolean(resource.sharePublicId && resource.shareItemId && resource.featureId)
  // Media details are a local capability and must remain usable for personal
  // KML as well as published shares. Source/report actions inside the detail
  // dialog still remain share-gated below.
  const infoEnabled = Boolean(item?.url || item?.displayUrl || item?.canonicalUrl || item?.title || item?.featureName || item?.kmlName || resource.sharePublicId)
  root.querySelectorAll('[data-media-preview-action="comments"]').forEach(button => {
    button.disabled = !commentsEnabled
    button.setAttribute('aria-disabled', commentsEnabled ? 'false' : 'true')
  })
  root.querySelectorAll('[data-media-preview-action="info"]').forEach(button => {
    button.disabled = !infoEnabled
    button.setAttribute('aria-disabled', infoEnabled ? 'false' : 'true')
  })
  const badge = root.querySelector('[data-media-preview-comment-count]')
  if (badge) badge.hidden = true
  if (!commentsEnabled) return
  try {
    const result = await apiRequest(`/public/kml-shares/${encodeURIComponent(resource.sharePublicId)}/comments/count`, {
      query: { shareItemId: resource.shareItemId, featureId: resource.featureId },
      csrf: false,
      signal: countController.signal,
    })
    const count = Math.max(0, Number(result?.count) || 0)
    if (badge) {
      badge.textContent = count > 99 ? '99+' : String(count)
      badge.hidden = count === 0
    }
  } catch (error) {
    if (error?.name !== 'AbortError' && badge) badge.hidden = true
  }
}

let previousFocus = null
let panelKeyHandler = null

function messageNode (message, className = '') {
  const node = document.createElement('p')
  node.className = `map-interaction-message ${className}`.trim()
  node.textContent = message
  return node
}

async function resolveInteractionAuth () {
  const current = getAuthSnapshot()
  if (current.loaded || current.loading) return current
  try {
    return await refreshAuthSession()
  } catch {
    return getAuthSnapshot()
  }
}

function ensurePanel () {
  let root = document.getElementById('map-interaction-panel')
  if (root) return root
  root = document.createElement('div')
  root.id = 'map-interaction-panel'
  root.className = 'map-interaction-panel-root'
  root.hidden = true
  root.innerHTML = `
    <section class="map-interaction-panel" role="dialog" aria-modal="true" aria-labelledby="map-interaction-title">
      <header><div><span>点位互动</span><h2 id="map-interaction-title">点位留言</h2></div><button type="button" data-interaction-close aria-label="关闭留言">×</button></header>
      <div class="map-interaction-body" data-interaction-body></div>
    </section>`
  root.addEventListener('click', event => {
    if (event.target === root || event.target.closest('[data-interaction-close]')) closeInteractionPanel()
  })
  document.body.appendChild(root)
  return root
}

export function closeInteractionPanel () {
  const root = document.getElementById('map-interaction-panel')
  if (!root || root.hidden) return
  root.hidden = true
  document.body.classList.remove('map-interaction-open')
  if (panelKeyHandler) document.removeEventListener('keydown', panelKeyHandler)
  panelKeyHandler = null
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  previousFocus = null
}

function renderComments (root, resource, state) {
  const body = root.querySelector('[data-interaction-body]')
  body.replaceChildren()
  if (state.loading) return body.appendChild(messageNode('正在加载留言…'))
  if (state.error) {
    body.appendChild(messageNode(state.error, 'is-error'))
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.className = 'map-interaction-retry'
    retry.textContent = '重试'
    retry.addEventListener('click', () => loadComments(root, resource))
    body.appendChild(retry)
    return
  }
  if (!state.policy?.enabled) return body.appendChild(messageNode('该点位暂未开放留言。'))

  const list = document.createElement('div')
  list.className = 'map-interaction-comments'
  ;(state.items || []).forEach(item => {
    const article = document.createElement('article')
    article.className = 'map-interaction-comment'
    const header = document.createElement('header')
    const author = document.createElement('strong')
    author.textContent = item.displayName || '访客'
    const time = document.createElement('time')
    time.textContent = item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN') : ''
    const copy = document.createElement('p')
    copy.textContent = item.body || ''
    header.append(author, time)
    article.append(header, copy)
    list.appendChild(article)
  })
  if (!list.children.length) list.appendChild(messageNode('还没有公开留言，欢迎留下第一条。'))
  body.appendChild(list)

  if (state.nextCursor) {
    const more = document.createElement('button')
    more.type = 'button'
    more.className = 'map-interaction-retry'
    more.textContent = '加载更多'
    more.addEventListener('click', () => loadComments(root, resource, { cursor: state.nextCursor, append: true }))
    body.appendChild(more)
  }

  const auth = state.auth || getAuthSnapshot()
  const anonymous = state.policy.anonymous || {}
  const contactRequirement = String(anonymous.contactRequirement || 'email_or_phone')
  const requiresEmail = contactRequirement === 'email' || contactRequirement === 'email_and_phone'
  const requiresPhone = contactRequirement === 'phone' || contactRequirement === 'email_and_phone'
  const requiresEitherContact = contactRequirement === 'email_or_phone'
  if (!auth.authenticated && !anonymous.enabled) {
    body.appendChild(messageNode('请先登录后再留言。'))
    return
  }

  const anonymousFields = !auth.authenticated && anonymous.enabled
    ? `<div class="map-interaction-anonymous-fields">
        <label><span>显示名</span><input name="displayName" minlength="2" maxlength="64" required placeholder="公开显示的名称"></label>
        <label><span>邮箱${requiresEmail || requiresEitherContact ? '' : '（可选）'}</span><input type="email" name="email" ${requiresEmail ? 'required' : ''} autocomplete="email"></label>
        <label><span>手机号${requiresPhone ? '' : '（可选）'}</span><input type="tel" name="phone" ${requiresPhone ? 'required' : ''} autocomplete="tel"></label>
      ${anonymous.requireConsent !== false ? '<label class="map-interaction-consent"><input type="checkbox" name="consent" required checked><span>我同意按留言说明和隐私政策处理本次留言</span></label>' : ''}
      </div>`
    : ''
  const form = document.createElement('form')
  form.className = 'map-interaction-comment-form'
  form.innerHTML = `${anonymousFields}<label><span>留言</span><textarea name="body" maxlength="${Math.max(1, Number(state.policy.maxLength) || 2000)}" required placeholder="分享你的观察…"></textarea></label><p data-interaction-form-error role="alert" hidden></p><button type="submit">提交留言</button>`
  let clientRequestId = ''
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const button = form.querySelector('button')
    const errorNode = form.querySelector('[data-interaction-form-error]')
    button.disabled = true
    errorNode.hidden = true
    try {
      if (!auth.authenticated && anonymous.enabled && requiresEitherContact && !form.elements.email?.value.trim() && !form.elements.phone?.value.trim()) {
        throw new Error('匿名留言至少需要填写邮箱或手机号')
      }
      await apiRequest(`/public/kml-shares/${encodeURIComponent(resource.sharePublicId)}/comments`, {
        method: 'POST',
        body: {
          body: form.elements.body.value,
          displayName: form.elements.displayName?.value || '',
          email: form.elements.email?.value || '',
          phone: form.elements.phone?.value || '',
          consent: form.elements.consent ? Boolean(form.elements.consent.checked) : true,
          clientRequestId: clientRequestId || (clientRequestId = globalThis.crypto?.randomUUID?.() || `cmt_${Date.now()}_${Math.random().toString(16).slice(2)}`),
          resourceRef: resource,
        },
      })
      form.reset()
      clientRequestId = ''
      await loadComments(root, resource)
      showAlert('留言已提交，审核通过后会显示在列表中。', { title: '提交成功' })
    } catch (error) {
      errorNode.textContent = error.message || '提交失败，请稍后重试'
      errorNode.hidden = false
      button.disabled = false
    }
  })
  body.appendChild(form)
}

async function loadComments (root, resource, options = {}) {
  const current = root._interactionState || { items: [] }
  renderComments(root, resource, { ...current, loading: true })
  try {
    const query = { shareItemId: resource.shareItemId, featureId: resource.featureId, limit: 20, ...(options.cursor ? { cursor: options.cursor } : {}) }
    const requests = [
      current.auth ? Promise.resolve(current.auth) : resolveInteractionAuth(),
      apiRequest(`/public/kml-shares/${encodeURIComponent(resource.sharePublicId)}/comments/policy`, { csrf: false }),
      apiRequest(`/public/kml-shares/${encodeURIComponent(resource.sharePublicId)}/comments`, { query, csrf: false }),
    ]
    const [auth, policy, comments] = await Promise.all(requests)
    const items = options.append ? [...(current.items || []), ...(comments?.items || [])] : (comments?.items || [])
    root._interactionState = { auth, policy, items, nextCursor: comments?.nextCursor || '' }
    renderComments(root, resource, root._interactionState)
  } catch (error) {
    renderComments(root, resource, { ...current, error: error.message || '留言服务暂不可用' })
  }
}

export function openInteractionPanel (item, trigger) {
  const root = ensurePanel()
  const resource = interactionResourceRef(item)
  root._interactionState = { items: [] }
  previousFocus = trigger || document.activeElement
  root.querySelector('h2').textContent = asText(item?.featureName || item?.title || '点位留言')
  root.hidden = false
  document.body.classList.add('map-interaction-open')
  if (!resource.sharePublicId || !resource.shareItemId || !resource.featureId) {
    root.querySelector('[data-interaction-body]').replaceChildren(messageNode('当前地图不是公开分享，留言入口不可用。'))
  } else {
    loadComments(root, resource)
  }
  panelKeyHandler = event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeInteractionPanel()
      return
    }
    if (event.key === 'Tab') {
      const focusable = [...root.querySelectorAll('button:not([disabled]), textarea, input, select, a[href]')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }
  document.addEventListener('keydown', panelKeyHandler)
  requestAnimationFrame(() => root.querySelector('textarea, [data-interaction-close]')?.focus())
}

export async function openInteractionInfo (item) {
  const resource = interactionResourceRef(item)
  if (!resource.sharePublicId) {
    const localMedia = item?.displayUrl || item?.canonicalUrl || item?.url
    const title = item?.featureName || item?.title || '本地媒体'
    const description = item?.description || item?.mediaDescription || '此媒体来自本地地图内容。'
    const localDetails = `<section class="media-detail-section media-detail-summary"><span class="media-detail-kicker">本地媒体</span><h3>${escapeInteractionHtml(title)}</h3><p>${escapeInteractionHtml(description)}</p></section><dl class="media-detail-facts">${item?.kmlName ? `<div><dt>图层</dt><dd>${escapeInteractionHtml(item.kmlName)}</dd></div>` : ''}${localMedia ? `<div><dt>地址</dt><dd class="media-detail-url">${escapeInteractionHtml(localMedia)}</dd></div>` : ''}</dl>`
    return showChoiceDialog({ title: '媒体详情', trustedMessageHtml: localDetails, dialogClassName: 'app-dialog-media-details', cancelText: '关闭', choices: [] })
  }
  try {
    const info = await apiRequest(`/public/kml-shares/${encodeURIComponent(resource.sharePublicId)}/info`, { csrf: false })
    const mediaUrl = item?.displayUrl || item?.canonicalUrl || item?.url || ''
    const sourceTitle = info?.source?.title || info?.title || item?.kmlName || '公开分享'
    const sourceDescription = info?.source?.description || info?.description || ''
    const generalDescription = info?.generalDescription || info?.source?.generalDescription || ''
    const itemDescription = item?.description || item?.mediaDescription || ''
    const mediaType = ({ image: '图片', video: '视频', audio: '音频', iframe: '页面' })[item?.type] || '媒体'
    const details = [
      `<section class="media-detail-section media-detail-summary"><span class="media-detail-kicker">公开分享</span><h3>${escapeInteractionHtml(sourceTitle)}</h3><p>${escapeInteractionHtml(generalDescription || '此内容来自已发布的公开分享。')}</p></section>`,
      sourceDescription ? `<section class="media-detail-section"><h4>来源说明</h4><p>${escapeInteractionHtml(sourceDescription)}</p></section>` : '',
      itemDescription ? `<section class="media-detail-section"><h4>媒体说明</h4><p>${escapeInteractionHtml(itemDescription)}</p></section>` : '',
      `<dl class="media-detail-facts"><div><dt>类型</dt><dd>${mediaType}</dd></div>${mediaUrl ? `<div><dt>地址</dt><dd class="media-detail-url">${escapeInteractionHtml(mediaUrl)}</dd></div>` : ''}${item?.kmlName ? `<div><dt>图层</dt><dd>${escapeInteractionHtml(item.kmlName)}</dd></div>` : ''}</dl>`,
    ].filter(Boolean).join('')
    const reportAvailable = info?.reports?.enabled === true
    const choice = await showChoiceDialog({
      title: '媒体详情',
      trustedMessageHtml: details,
      dialogClassName: 'app-dialog-media-details',
      choices: reportAvailable ? [{ text: '举报此内容', value: 'report', class: 'app-dialog-secondary' }] : [],
      cancelText: '关闭',
    })
    if (choice === 'report') return openInteractionReport(item)
    return choice
  } catch (error) {
    return showAlert(error.message || '来源信息暂不可用', { title: '来源信息' })
  }
}

export async function openInteractionReport (item) {
  const resource = interactionResourceRef(item)
  if (!resource.sharePublicId) return showAlert('举报入口仅在公开分享页面提供。', { title: '举报内容' })
  const clientRequestId = globalThis.crypto?.randomUUID?.() || `rpt_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const result = await showEditDialog({
    title: '举报内容',
    fields: [
      { name: 'reportType', label: '举报类型', type: 'select', options: [{ value: 'unsafe_content', label: '不良内容' }, { value: 'copyright_takedown', label: '侵权/下架' }, { value: 'privacy', label: '隐私问题' }, { value: 'other', label: '其他' }] },
      { name: 'description', label: '说明', type: 'textarea', hint: '请提供事实描述或证据文本；服务端不会抓取外部链接。' },
      { name: 'evidenceText', label: '证据说明（可选）', type: 'textarea' },
      { name: 'displayName', label: '姓名或机构（侵权举报必填）' },
      { name: 'email', label: '邮箱（侵权举报必填）' },
    ],
    values: { reportType: 'unsafe_content' },
    confirmText: '提交举报',
  })
  if (!result) return
  try {
    const consentResult = await showCheckboxConfirm('我同意平台按举报说明和隐私政策处理本次举报。', { title: '提交确认', checkboxLabel: '同意处理说明和隐私政策', confirmText: '继续提交' })
    if (!consentResult?.confirmed || !consentResult.checked) return
    const rightsResult = result.reportType === 'copyright_takedown'
      ? await showCheckboxConfirm('我确认自己是相关权利人或其授权代理人，并同意平台按举报说明处理。', { title: '权利声明', checkboxLabel: '确认权利声明', confirmText: '继续提交' })
      : { confirmed: true, checked: false }
    if (!rightsResult?.confirmed || (result.reportType === 'copyright_takedown' && !rightsResult.checked)) return
    await apiRequest(`/public/kml-shares/${encodeURIComponent(resource.sharePublicId)}/reports`, {
      method: 'POST',
      body: { type: result.reportType, description: result.description, evidenceText: result.evidenceText, displayName: result.displayName, email: result.email, rightsAttestation: Boolean(rightsResult.checked), consent: true, clientRequestId, resourceRef: { ...resource, scope: resource.mediaId ? 'media' : 'feature' } },
    })
    await showAlert('举报已提交，平台会在后台处理。', { title: '提交成功' })
  } catch (error) {
    await showAlert(error.message || '举报服务暂不可用，请稍后重试', { title: '提交失败' })
  }
}
