import { apiRequest } from '../auth/api.js'
import { showAlert, showCheckboxConfirm, showEditDialog } from './dialog.js'

const asText = value => String(value ?? '')

export function interactionResourceRef (item) {
  return {
    sharePublicId: asText(item?.sharePublicId || item?.publicId),
    shareItemId: asText(item?.shareItemId || item?.kmlId),
    featureId: asText(item?.resourceFeatureId || item?.featureId),
    mediaId: asText(item?.mediaId),
    scope: 'feature',
  }
}

let countController = null

export async function syncInteractionControls (root, item) {
  countController?.abort()
  countController = new AbortController()
  const resource = interactionResourceRef(item)
  const enabled = Boolean(resource.sharePublicId && resource.shareItemId && resource.featureId)
  root.querySelectorAll('[data-media-preview-action="comments"], [data-media-preview-action="info"], [data-media-preview-action="report"]').forEach(button => {
    button.disabled = !enabled
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true')
  })
  const badge = root.querySelector('[data-media-preview-comment-count]')
  if (badge) badge.hidden = true
  if (!enabled) return
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

  const form = document.createElement('form')
  form.className = 'map-interaction-comment-form'
  form.innerHTML = `<label><span>留言</span><textarea name="body" maxlength="${Math.max(1, Number(state.policy.maxLength) || 2000)}" required placeholder="分享你的观察…"></textarea></label><p data-interaction-form-error role="alert" hidden></p><button type="submit">提交留言</button>`
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const button = form.querySelector('button')
    const errorNode = form.querySelector('[data-interaction-form-error]')
    button.disabled = true
    errorNode.hidden = true
    try {
      await apiRequest(`/public/kml-shares/${encodeURIComponent(resource.sharePublicId)}/comments`, {
        method: 'POST', body: { body: form.elements.body.value, resourceRef: resource },
      })
      form.reset()
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
      apiRequest(`/public/kml-shares/${encodeURIComponent(resource.sharePublicId)}/comments/policy`, { csrf: false }),
      apiRequest(`/public/kml-shares/${encodeURIComponent(resource.sharePublicId)}/comments`, { query, csrf: false }),
    ]
    const [policy, comments] = await Promise.all(requests)
    const items = options.append ? [...(current.items || []), ...(comments?.items || [])] : (comments?.items || [])
    root._interactionState = { policy, items, nextCursor: comments?.nextCursor || '' }
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
  if (!resource.sharePublicId) return showAlert('来源信息仅在公开分享页面提供。', { title: '来源信息' })
  try {
    const info = await apiRequest(`/public/kml-shares/${encodeURIComponent(resource.sharePublicId)}/info`, { csrf: false })
    return showAlert(`${info?.title || item?.kmlName || '公开分享'}\n${info?.description || '此内容来自已发布的公开 KML 快照。'}`, { title: '来源信息' })
  } catch (error) {
    return showAlert(error.message || '来源信息暂不可用', { title: '来源信息' })
  }
}

export async function openInteractionReport (item) {
  const resource = interactionResourceRef(item)
  if (!resource.sharePublicId) return showAlert('举报入口仅在公开分享页面提供。', { title: '举报内容' })
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
      body: { type: result.reportType, description: result.description, evidenceText: result.evidenceText, displayName: result.displayName, email: result.email, rightsAttestation: Boolean(rightsResult.checked), consent: true, resourceRef: { ...resource, scope: resource.mediaId ? 'media' : 'feature' } },
    })
    await showAlert('举报已提交，平台会在后台处理。', { title: '提交成功' })
  } catch (error) {
    await showAlert(error.message || '举报服务暂不可用，请稍后重试', { title: '提交失败' })
  }
}
