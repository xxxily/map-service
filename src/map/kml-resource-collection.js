import { classifyContentUrl } from '../../shared/kml-content.js'
import {
  KML_RESOURCE_COLLECTION_ITEM_TYPES,
  KML_RESOURCE_COLLECTION_MAX_ITEMS,
  KML_RESOURCE_COLLECTION_PAGE_SIZE,
  getKmlResourceCollectionPage,
  normalizeKmlResourceCollection,
  tryNormalizeKmlResourceCollection,
} from '../../shared/kml-resource-collection.js'
import { showAlert, showConfirm } from '../ui/dialog.js'
import { openMediaPreview } from '../ui/media-preview.js'

const PREVIEWABLE_TYPES = new Set(['image', 'video', 'audio', 'iframe'])
const TYPE_LABELS = Object.freeze({
  auto: '自动识别',
  image: '图片',
  video: '视频',
  audio: '音频',
  iframe: '页面',
  link: '链接',
})
let activeCollectionPanelClose = null

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function createDraftItem (values = {}) {
  const uuid = globalThis.crypto?.randomUUID?.()
  return {
    id: String(values.id || (uuid ? `res-${uuid}` : `res-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`)),
    title: String(values.title || ''),
    url: String(values.url || ''),
    type: KML_RESOURCE_COLLECTION_ITEM_TYPES.includes(values.type) ? values.type : 'auto',
  }
}

function cloneCollectionDraft (value) {
  const result = tryNormalizeKmlResourceCollection(value)
  if (!result.value) throw result.error
  const normalized = result.value
  return {
    version: 1,
    viewMode: normalized?.viewMode || 'grid',
    items: (normalized?.items || []).map(item => ({ ...item })),
  }
}

export function extractKmlResourceCollectionHttpsUrls (value) {
  const matches = String(value || '').match(/https:\/\/[^\s<>"'`，。；！？、]+/gi) || []
  return [...new Set(matches.map(url => url.replace(/[),.;:!?]+$/g, '')))]
}

function getComparableHttpsUrl (value) {
  try {
    const parsed = new URL(String(value || '').trim())
    return parsed.protocol === 'https:' ? parsed.toString() : String(value || '').trim()
  } catch {
    return String(value || '').trim()
  }
}

export function planKmlResourceCollectionBatchAdd (items, input, maxItems = KML_RESOURCE_COLLECTION_MAX_ITEMS) {
  const source = Array.isArray(items) ? items : []
  const urls = extractKmlResourceCollectionHttpsUrls(input)
  const existing = new Set(source.map(item => getComparableHttpsUrl(item?.url)).filter(Boolean))
  const additions = []
  let duplicateCount = 0
  for (const url of urls) {
    const comparable = getComparableHttpsUrl(url)
    if (!comparable || existing.has(comparable)) {
      duplicateCount += 1
      continue
    }
    existing.add(comparable)
    additions.push(url)
  }
  const limit = Math.max(0, Number.parseInt(maxItems, 10) || KML_RESOURCE_COLLECTION_MAX_ITEMS)
  const available = Math.max(0, limit - source.length)
  const limited = additions.slice(0, available)
  return {
    urls,
    additions: limited,
    duplicateCount,
    omittedCount: Math.max(0, additions.length - limited.length),
  }
}

function isBlankEditorItem (item) {
  return !String(item?.title || '').trim() && !String(item?.url || '').trim() && (!item?.type || item.type === 'auto')
}

function getErrorPathLocation (path) {
  const match = String(path || '').match(/^items\[(\d+)\](?:\.([a-z]+))?$/i)
  return match
    ? { index: Number(match[1]), field: String(match[2] || '') }
    : { index: -1, field: '' }
}

export function prepareKmlResourceCollectionEditorSave (draft) {
  const sourceItems = Array.isArray(draft?.items) ? draft.items : []
  const items = []
  const sourceIndexByNormalizedIndex = []
  sourceItems.forEach((item, sourceIndex) => {
    if (isBlankEditorItem(item)) return
    sourceIndexByNormalizedIndex.push(sourceIndex)
    items.push(item)
  })
  const result = tryNormalizeKmlResourceCollection({
    version: draft?.version,
    viewMode: draft?.viewMode,
    items,
  })
  if (result.value) {
    return {
      value: result.value,
      error: null,
      itemIndex: -1,
      field: '',
      removedCount: sourceItems.length - items.length,
    }
  }
  const location = getErrorPathLocation(result.error?.path)
  return {
    value: null,
    error: result.error,
    itemIndex: sourceIndexByNormalizedIndex[location.index] ?? -1,
    field: location.field,
    removedCount: sourceItems.length - items.length,
  }
}

function formatEditorError (error, itemIndex, field) {
  const message = String(error?.message || '资源集合格式不正确')
  if (!Number.isInteger(itemIndex) || itemIndex < 0) return message
  const label = { title: '标题', url: '地址', type: '类型', id: '标识' }[field] || '内容'
  let detail = message
    .replace(/^items\[\d+\]\.(?:title|url|type|id)/i, '')
    .replace(/^第\s*\d+\s*个资源/, '')
    .trim()
  if (detail.startsWith(label)) detail = detail.slice(label.length).trim()
  return `第 ${itemIndex + 1} 项${label}${detail || '不符合要求'}`
}

function resolveCollectionDisplayItem (resource, index, contentOptions, classify) {
  const classified = classify(resource.url, {
    ...contentOptions,
    index,
    typeHint: resource.type === 'auto' ? '' : resource.type,
    title: resource.title,
  })
  if (classified.accepted) {
    return {
      ...classified.item,
      id: `resource-collection-${resource.id}`,
      collectionItemId: resource.id,
      resourceIndex: index,
      resourceType: resource.type,
      sourceType: 'resource-collection',
    }
  }
  return {
    id: `resource-collection-${resource.id}`,
    collectionItemId: resource.id,
    resourceIndex: index,
    resourceType: resource.type,
    type: 'link',
    title: resource.title || new URL(resource.url).hostname,
    url: resource.url,
    displayUrl: resource.url,
    unavailable: true,
  }
}

export function createKmlResourceCollectionDisplayResolver (resourceCollection, options = {}) {
  const normalized = options.normalized === true
    ? resourceCollection
    : normalizeKmlResourceCollection(resourceCollection)
  const classify = options.classify || classifyContentUrl
  const contentOptions = options.contentOptions || {}
  const cache = new Map()
  const get = index => {
    if (!Number.isInteger(index) || index < 0 || index >= normalized.items.length) return null
    if (!cache.has(index)) {
      cache.set(index, resolveCollectionDisplayItem(normalized.items[index], index, contentOptions, classify))
    }
    return cache.get(index)
  }
  const page = requestedPage => {
    const pageWindow = getKmlResourceCollectionPage(normalized.items, requestedPage)
    return {
      ...pageWindow,
      items: pageWindow.items.map((item, offset) => get(pageWindow.start + offset)),
    }
  }
  const all = () => normalized.items.map((item, index) => get(index))
  return {
    count: normalized.items.length,
    get,
    page,
    all,
  }
}

export function isKmlResourceCollectionFeature (feature) {
  return feature?.type === 'Point' && Array.isArray(feature?.resourceCollection?.items)
}

export function getKmlResourceCollectionItemCount (feature) {
  return isKmlResourceCollectionFeature(feature) ? feature.resourceCollection.items.length : 0
}

export function appendKmlResourceCollectionLinks (description, resourceCollection) {
  const normalized = tryNormalizeKmlResourceCollection(resourceCollection).value
  const urls = normalized?.items.map(item => item.url) || []
  if (!urls.length) return String(description || '')
  return [String(description || '').trim(), ...urls].filter(Boolean).join('\n')
}

function renderEditorItem (item, index, total, viewMode, validation) {
  const invalid = validation?.itemIndex === index
  const invalidField = invalid ? validation.field : ''
  return `
    <article class="kml-resource-editor-item is-${escapeHtml(viewMode)}${invalid ? ' is-invalid' : ''}" data-resource-index="${index}">
      <div class="kml-resource-editor-item-head">
        <span>资源 ${index + 1}</span>
        <div class="kml-resource-editor-item-actions">
          <button type="button" data-resource-action="up" title="上移" aria-label="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-resource-action="down" title="下移" aria-label="下移" ${index >= total - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" data-resource-action="delete" title="删除" aria-label="删除">×</button>
        </div>
      </div>
      <div class="kml-resource-editor-fields">
        <label><span>标题</span><input type="text" data-resource-field="title" value="${escapeHtml(item.title)}" maxlength="200" ${invalidField === 'title' ? 'aria-invalid="true"' : ''}></label>
        <label><span>地址</span><input type="url" data-resource-field="url" value="${escapeHtml(item.url)}" inputmode="url" placeholder="https://" ${invalidField === 'url' ? 'aria-invalid="true"' : ''}></label>
        <label><span>类型</span><select data-resource-field="type" ${invalidField === 'type' ? 'aria-invalid="true"' : ''}>
          ${KML_RESOURCE_COLLECTION_ITEM_TYPES.map(type => `<option value="${type}" ${item.type === type ? 'selected' : ''}>${TYPE_LABELS[type]}</option>`).join('')}
        </select></label>
      </div>
      ${invalid ? `<p class="kml-resource-editor-item-error" data-resource-item-error>${escapeHtml(validation.message)}</p>` : ''}
    </article>
  `
}

export async function showKmlResourceCollectionEditor (value, options = {}) {
  const root = document.createElement('div')
  root.className = 'kml-resource-editor-root'
  let draft
  try {
    draft = cloneCollectionDraft(value)
  } catch (error) {
    await showAlert(error?.message || '资源集合格式不正确')
    return null
  }
  let page = 1
  let batchInput = ''
  let feedback = { message: '', kind: 'error' }
  let validation = null
  let dirty = false
  let closePromptOpen = false

  const render = () => {
    const pageWindow = getKmlResourceCollectionPage(draft.items, page)
    page = pageWindow.page
    const { pageCount, start, items: visibleItems } = pageWindow
    root.innerHTML = `
      <div class="kml-resource-editor-backdrop" data-resource-action="cancel">
        <section class="kml-resource-editor" role="dialog" aria-modal="true" aria-labelledby="kml-resource-editor-title">
          <header>
            <div><span>特殊点位</span><h2 id="kml-resource-editor-title">${escapeHtml(options.title || '编辑资源集合')}</h2></div>
            <button type="button" data-resource-action="cancel" aria-label="关闭" title="关闭">×</button>
          </header>
          <div class="kml-resource-editor-body">
            <div class="kml-resource-editor-toolbar">
              <div class="kml-resource-view-mode" role="group" aria-label="默认展示方式">
                <button type="button" data-resource-view="grid" class="${draft.viewMode === 'grid' ? 'is-active' : ''}" aria-pressed="${draft.viewMode === 'grid'}">卡片</button>
                <button type="button" data-resource-view="list" class="${draft.viewMode === 'list' ? 'is-active' : ''}" aria-pressed="${draft.viewMode === 'list'}">列表</button>
              </div>
              <button type="button" data-resource-action="add">添加资源</button>
            </div>
            <div class="kml-resource-batch">
              <textarea rows="3" data-resource-batch placeholder="粘贴一个或多个 HTTPS 地址">${escapeHtml(batchInput)}</textarea>
              <button type="button" data-resource-action="batch-add">批量添加</button>
            </div>
            <div class="kml-resource-editor-status"><span>${draft.items.length} / ${KML_RESOURCE_COLLECTION_MAX_ITEMS}</span><span>第 ${page} / ${pageCount} 页</span></div>
            <div class="kml-resource-editor-list is-${escapeHtml(draft.viewMode)}">
              ${visibleItems.map((item, offset) => renderEditorItem(item, start + offset, draft.items.length, draft.viewMode, validation)).join('') || '<div class="kml-resource-editor-empty">暂无资源</div>'}
            </div>
            <div class="kml-resource-editor-pagination" ${pageCount <= 1 ? 'hidden' : ''}>
              <button type="button" data-resource-action="previous-page" ${page <= 1 ? 'disabled' : ''}>上一页</button>
              <button type="button" data-resource-action="next-page" ${page >= pageCount ? 'disabled' : ''}>下一页</button>
            </div>
            <div class="kml-resource-editor-error${feedback.kind === 'info' ? ' is-info' : ''}" role="${feedback.kind === 'info' ? 'status' : 'alert'}" data-resource-error>${escapeHtml(feedback.message)}</div>
          </div>
          <footer>
            <button type="button" data-resource-action="cancel">取消</button>
            <button type="button" class="primary" data-resource-action="save">保存</button>
          </footer>
        </section>
      </div>
    `
  }

  render()
  document.body.appendChild(root)
  root.querySelector('[data-resource-batch]')?.focus()

  return new Promise(resolve => {
    const close = result => {
      document.removeEventListener('keydown', onKeydown)
      root.remove()
      resolve(result)
    }
    const setFeedback = (message, kind = 'error') => {
      feedback = { message: String(message || ''), kind }
      const target = root.querySelector('[data-resource-error]')
      if (target) {
        target.textContent = feedback.message
        target.classList.toggle('is-info', kind === 'info')
        target.setAttribute('role', kind === 'info' ? 'status' : 'alert')
      }
    }
    const rerender = ({ focusIndex = null, focusField = 'url', focusSelector = '', scrollTo = false } = {}) => {
      const body = root.querySelector('.kml-resource-editor-body')
      const scrollTop = body?.scrollTop || 0
      render()
      const nextBody = root.querySelector('.kml-resource-editor-body')
      if (nextBody) nextBody.scrollTop = scrollTop
      const focusTarget = focusSelector
        ? root.querySelector(focusSelector)
        : focusIndex === null
          ? null
          : root.querySelector(`[data-resource-index="${focusIndex}"] [data-resource-field="${focusField}"]`)
      focusTarget?.focus()
      if (scrollTo && focusTarget?.scrollIntoView) focusTarget.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
    const requestClose = async () => {
      if (closePromptOpen) return
      if (!dirty) return close(null)
      closePromptOpen = true
      const confirmed = await showConfirm('当前修改尚未保存，确定关闭吗？', {
        title: '放弃修改',
        confirmText: '放弃修改',
      })
      closePromptOpen = false
      if (confirmed) close(null)
    }
    const onKeydown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void requestClose()
      }
    }
    document.addEventListener('keydown', onKeydown)
    root.addEventListener('input', event => {
      if (event.target.matches('[data-resource-batch]')) {
        batchInput = event.target.value
        dirty = true
        return
      }
      const field = event.target.dataset.resourceField
      const itemRoot = event.target.closest('[data-resource-index]')
      const item = draft.items[Number(itemRoot?.dataset.resourceIndex)]
      if (item && field) {
        item[field] = event.target.value
        dirty = true
        if (validation?.itemIndex === Number(itemRoot.dataset.resourceIndex) && (!validation.field || validation.field === field)) {
          validation = null
          setFeedback('')
          itemRoot.classList.remove('is-invalid')
          event.target.removeAttribute('aria-invalid')
          itemRoot.querySelector('[data-resource-item-error]')?.remove()
        }
      }
    })
    root.addEventListener('change', event => {
      const field = event.target.dataset.resourceField
      const itemRoot = event.target.closest('[data-resource-index]')
      const item = draft.items[Number(itemRoot?.dataset.resourceIndex)]
      if (item && field) {
        item[field] = event.target.value
        dirty = true
      }
    })
    root.addEventListener('click', event => {
      const viewButton = event.target.closest('[data-resource-view]')
      if (viewButton) {
        if (draft.viewMode === viewButton.dataset.resourceView) return
        draft.viewMode = viewButton.dataset.resourceView
        dirty = true
        rerender({ focusSelector: `[data-resource-view="${draft.viewMode}"]` })
        return
      }
      const actionButton = event.target.closest('[data-resource-action]')
      if (!actionButton) return
      if (actionButton.dataset.resourceAction === 'cancel') {
        if (actionButton.classList.contains('kml-resource-editor-backdrop') && event.target !== actionButton) return
        void requestClose()
        return
      }
      const action = actionButton.dataset.resourceAction
      const itemIndex = Number(actionButton.closest('[data-resource-index]')?.dataset.resourceIndex)
      if (action === 'add') {
        if (draft.items.length >= KML_RESOURCE_COLLECTION_MAX_ITEMS) return setFeedback(`最多添加 ${KML_RESOURCE_COLLECTION_MAX_ITEMS} 项资源`)
        draft.items.push(createDraftItem())
        dirty = true
        page = Math.ceil(draft.items.length / KML_RESOURCE_COLLECTION_PAGE_SIZE)
        setFeedback('')
        rerender({ focusIndex: draft.items.length - 1, focusField: 'url', scrollTo: true })
      } else if (action === 'batch-add') {
        const textarea = root.querySelector('[data-resource-batch]')
        batchInput = textarea?.value || batchInput
        const plan = planKmlResourceCollectionBatchAdd(draft.items, batchInput)
        if (!plan.urls.length) return setFeedback('没有识别到有效的 HTTPS 地址')
        if (!plan.additions.length) {
          return setFeedback('输入的地址已全部存在，未新增资源', 'info')
        }
        const firstAddedIndex = draft.items.length
        plan.additions.forEach(url => draft.items.push(createDraftItem({ url })))
        batchInput = ''
        dirty = true
        page = Math.floor(firstAddedIndex / KML_RESOURCE_COLLECTION_PAGE_SIZE) + 1
        const notes = []
        if (plan.duplicateCount) notes.push(`跳过 ${plan.duplicateCount} 个重复地址`)
        if (plan.omittedCount) notes.push(`另有 ${plan.omittedCount} 个地址超出上限`)
        setFeedback(notes.length ? `已添加 ${plan.additions.length} 项，${notes.join('，')}` : '', notes.length ? 'info' : 'error')
        rerender({ focusIndex: firstAddedIndex, focusField: 'url', scrollTo: true })
      } else if (action === 'delete' && Number.isInteger(itemIndex)) {
        draft.items.splice(itemIndex, 1)
        dirty = true
        validation = null
        setFeedback('')
        page = Math.min(page, Math.max(1, Math.ceil(draft.items.length / KML_RESOURCE_COLLECTION_PAGE_SIZE)))
        rerender()
      } else if (action === 'up' && itemIndex > 0) {
        ;[draft.items[itemIndex - 1], draft.items[itemIndex]] = [draft.items[itemIndex], draft.items[itemIndex - 1]]
        dirty = true
        page = Math.floor((itemIndex - 1) / KML_RESOURCE_COLLECTION_PAGE_SIZE) + 1
        rerender({ focusIndex: itemIndex - 1, focusField: 'url', scrollTo: true })
      } else if (action === 'down' && itemIndex >= 0 && itemIndex < draft.items.length - 1) {
        ;[draft.items[itemIndex + 1], draft.items[itemIndex]] = [draft.items[itemIndex], draft.items[itemIndex + 1]]
        dirty = true
        page = Math.floor((itemIndex + 1) / KML_RESOURCE_COLLECTION_PAGE_SIZE) + 1
        rerender({ focusIndex: itemIndex + 1, focusField: 'url', scrollTo: true })
      } else if (action === 'previous-page') {
        page = Math.max(1, page - 1)
        render()
      } else if (action === 'next-page') {
        page += 1
        render()
      } else if (action === 'save') {
        const result = prepareKmlResourceCollectionEditorSave(draft)
        if (result.value) {
          dirty = false
          close(result.value)
        } else {
          validation = result.itemIndex >= 0
            ? { itemIndex: result.itemIndex, field: result.field, message: formatEditorError(result.error, result.itemIndex, result.field) }
            : null
          if (result.itemIndex >= 0) page = Math.floor(result.itemIndex / KML_RESOURCE_COLLECTION_PAGE_SIZE) + 1
          const message = formatEditorError(result.error, result.itemIndex, result.field)
          setFeedback(message)
          rerender({
            focusIndex: result.itemIndex >= 0 ? result.itemIndex : null,
            focusField: result.field || 'url',
            scrollTo: result.itemIndex >= 0,
          })
        }
      }
    })
  })
}

function renderCollectionItem (item, viewMode) {
  const typeLabel = TYPE_LABELS[item.type] || '资源'
  const canPreview = PREVIEWABLE_TYPES.has(item.type) && !item.unavailable
  const image = item.type === 'image'
    ? `<img src="${escapeHtml(item.thumbnailUrl || item.renderUrl || item.url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="kml-resource-collection-type" aria-hidden="true">${item.type === 'video' ? '▶' : item.type === 'audio' ? '♪' : item.type === 'iframe' ? '▣' : '↗'}</span>`
  const tagName = canPreview ? 'button' : 'a'
  const interactiveAttributes = canPreview
    ? `type="button" data-collection-item="${item.resourceIndex}"`
    : `href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" data-collection-item="${item.resourceIndex}" aria-label="打开原地址"`
  return `
    <${tagName} class="kml-resource-collection-item is-${escapeHtml(viewMode)}${canPreview ? '' : ' is-unavailable'}" ${interactiveAttributes} ${canPreview ? '' : 'data-unavailable="true"'}>
      <span class="kml-resource-collection-media">${image}</span>
      <span class="kml-resource-collection-copy"><strong>${escapeHtml(item.title || `资源 ${item.resourceIndex + 1}`)}</strong><small>${escapeHtml(canPreview ? typeLabel : '打开原地址')}</small></span>
    </${tagName}>
  `
}

export function openKmlResourceCollectionPanel (kmlFile, feature, options = {}) {
  if (!isKmlResourceCollectionFeature(feature)) return false
  activeCollectionPanelClose?.()
  const normalizedResult = tryNormalizeKmlResourceCollection(feature.resourceCollection)
  if (!normalizedResult.value) {
    void showAlert(normalizedResult.error?.message || '资源集合格式不正确')
    return false
  }
  const normalized = normalizedResult.value
  const displayResolver = createKmlResourceCollectionDisplayResolver(normalized, {
    normalized: true,
    contentOptions: options.contentOptions,
  })
  let previewState = null
  const getPreviewState = () => {
    // Build the gallery index only once; page rendering already classifies visible items lazily.
    if (previewState) return previewState
    const items = displayResolver.all()
      .filter(item => PREVIEWABLE_TYPES.has(item.type) && !item.unavailable)
      .map(item => ({
        ...item,
        featureId: String(feature.id || ''),
        featureName: String(feature.name || ''),
        kmlId: String(kmlFile?.id || ''),
        kmlName: String(kmlFile?.name || ''),
      }))
    previewState = {
      items,
      indexByCollectionId: new Map(items.map((item, index) => [item.collectionItemId, index])),
    }
    return previewState
  }
  const panel = document.createElement('section')
  panel.id = 'kml-resource-collection-panel'
  panel.className = 'kml-resource-collection-panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'false')
  panel.setAttribute('aria-labelledby', 'kml-resource-collection-title')
  let page = 1
  let viewMode = normalized.viewMode

  const render = () => {
    const pageWindow = displayResolver.page(page)
    page = pageWindow.page
    const { pageCount, items: visible } = pageWindow
    panel.innerHTML = `
      <header>
        <div><span>${escapeHtml(kmlFile?.name || 'KML')}</span><h2 id="kml-resource-collection-title">${escapeHtml(feature.name || '资源集合')}</h2><p>${displayResolver.count} 项资源</p></div>
        <button type="button" data-collection-action="close" aria-label="关闭" title="关闭">×</button>
      </header>
      <div class="kml-resource-collection-toolbar">
        <div role="group" aria-label="展示方式">
          <button type="button" data-collection-view="grid" class="${viewMode === 'grid' ? 'is-active' : ''}" aria-pressed="${viewMode === 'grid'}">卡片</button>
          <button type="button" data-collection-view="list" class="${viewMode === 'list' ? 'is-active' : ''}" aria-pressed="${viewMode === 'list'}">列表</button>
        </div>
        <span>${page} / ${pageCount}</span>
      </div>
      <div class="kml-resource-collection-items is-${escapeHtml(viewMode)}">
        ${visible.map(item => renderCollectionItem(item, viewMode)).join('') || '<div class="kml-resource-collection-empty">暂无资源</div>'}
      </div>
      <footer ${pageCount <= 1 ? 'hidden' : ''}>
        <button type="button" data-collection-action="previous" ${page <= 1 ? 'disabled' : ''}>上一页</button>
        <button type="button" data-collection-action="next" ${page >= pageCount ? 'disabled' : ''}>下一页</button>
      </footer>
    `
  }
  const close = () => {
    if (activeCollectionPanelClose === close) activeCollectionPanelClose = null
    document.removeEventListener('keydown', onKeydown)
    panel.querySelectorAll('img, video, audio, iframe').forEach(media => media.removeAttribute('src'))
    panel.remove()
    options.trigger?.focus?.({ preventScroll: true })
  }
  const onKeydown = event => {
    if (event.key === 'Escape') {
      if (event.defaultPrevented || document.querySelector('.media-preview-root:not([hidden])')) return
      event.preventDefault()
      close()
    }
  }
  panel.addEventListener('click', async event => {
    const viewButton = event.target.closest('[data-collection-view]')
    if (viewButton) {
      viewMode = viewButton.dataset.collectionView
      render()
      return
    }
    const action = event.target.closest('[data-collection-action]')?.dataset.collectionAction
    if (action === 'close') return close()
    if (action === 'previous') {
      page = Math.max(1, page - 1)
      render()
      return
    }
    if (action === 'next') {
      page += 1
      render()
      return
    }
    const itemButton = event.target.closest('[data-collection-item]')
    if (!itemButton) return
    const item = displayResolver.get(Number(itemButton.dataset.collectionItem))
    if (!item) return
    if (!PREVIEWABLE_TYPES.has(item.type) || item.unavailable) {
      return
    }
    const { items: previewItems, indexByCollectionId } = getPreviewState()
    const previewIndex = indexByCollectionId.get(item.collectionItemId)
    if (!Number.isInteger(previewIndex)) {
      await showAlert('该资源当前不能在页面内预览，请使用原地址查看。')
      return
    }
    openMediaPreview({
      items: previewItems,
      index: previewIndex,
      trigger: itemButton,
      collectionTitle: String(feature.name || '资源集合'),
    })
  })
  panel.addEventListener('error', event => {
    const image = event.target
    if (!image?.matches?.('.kml-resource-collection-media img')) return
    image.closest('.kml-resource-collection-media')?.classList.add('is-load-error')
    image.removeAttribute('src')
  }, true)
  render()
  document.body.appendChild(panel)
  document.addEventListener('keydown', onKeydown)
  activeCollectionPanelClose = close
  panel.querySelector('[data-collection-item], [data-collection-action="close"]')?.focus()
  return true
}
