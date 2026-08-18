import { classifyContentUrl } from '../../shared/kml-content.js'
import {
  KML_RESOURCE_COLLECTION_ITEM_TYPES,
  KML_RESOURCE_COLLECTION_MAX_ITEMS,
  KML_RESOURCE_COLLECTION_PAGE_SIZE,
  getKmlResourceCollectionPage,
  normalizeKmlResourceCollection,
  tryNormalizeKmlResourceCollection,
} from '../../shared/kml-resource-collection.js'
import { showAlert } from '../ui/dialog.js'
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

function extractHttpsUrls (value) {
  const matches = String(value || '').match(/https:\/\/[^\s<>"'`，。；！？、]+/gi) || []
  return [...new Set(matches.map(url => url.replace(/[),.;:!?]+$/g, '')))]
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

function renderEditorItem (item, index, total) {
  return `
    <article class="kml-resource-editor-item" data-resource-index="${index}">
      <div class="kml-resource-editor-item-head">
        <span>${index + 1}</span>
        <div class="kml-resource-editor-item-actions">
          <button type="button" data-resource-action="up" title="上移" aria-label="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-resource-action="down" title="下移" aria-label="下移" ${index >= total - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" data-resource-action="delete" title="删除" aria-label="删除">×</button>
        </div>
      </div>
      <label><span>标题</span><input type="text" data-resource-field="title" value="${escapeHtml(item.title)}" maxlength="200"></label>
      <label><span>地址</span><input type="url" data-resource-field="url" value="${escapeHtml(item.url)}" inputmode="url" placeholder="https://"></label>
      <label><span>类型</span><select data-resource-field="type">
        ${KML_RESOURCE_COLLECTION_ITEM_TYPES.map(type => `<option value="${type}" ${item.type === type ? 'selected' : ''}>${TYPE_LABELS[type]}</option>`).join('')}
      </select></label>
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
                <button type="button" data-resource-view="grid" class="${draft.viewMode === 'grid' ? 'is-active' : ''}">卡片</button>
                <button type="button" data-resource-view="list" class="${draft.viewMode === 'list' ? 'is-active' : ''}">列表</button>
              </div>
              <button type="button" data-resource-action="add">添加资源</button>
            </div>
            <div class="kml-resource-batch">
              <textarea rows="3" data-resource-batch placeholder="粘贴一个或多个 HTTPS 地址"></textarea>
              <button type="button" data-resource-action="batch-add">批量添加</button>
            </div>
            <div class="kml-resource-editor-status"><span>${draft.items.length} / ${KML_RESOURCE_COLLECTION_MAX_ITEMS}</span><span>第 ${page} / ${pageCount} 页</span></div>
            <div class="kml-resource-editor-list">
              ${visibleItems.map((item, offset) => renderEditorItem(item, start + offset, draft.items.length)).join('') || '<div class="kml-resource-editor-empty">暂无资源</div>'}
            </div>
            <div class="kml-resource-editor-pagination" ${pageCount <= 1 ? 'hidden' : ''}>
              <button type="button" data-resource-action="previous-page" ${page <= 1 ? 'disabled' : ''}>上一页</button>
              <button type="button" data-resource-action="next-page" ${page >= pageCount ? 'disabled' : ''}>下一页</button>
            </div>
            <div class="kml-resource-editor-error" role="alert" data-resource-error></div>
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
    const setError = message => {
      const target = root.querySelector('[data-resource-error]')
      if (target) target.textContent = message || ''
    }
    const rerender = () => {
      render()
      root.querySelector(`[data-resource-index="${Math.min(draft.items.length - 1, (page - 1) * KML_RESOURCE_COLLECTION_PAGE_SIZE)}"] input`)?.focus()
    }
    const onKeydown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(null)
      }
    }
    document.addEventListener('keydown', onKeydown)
    root.addEventListener('input', event => {
      const field = event.target.dataset.resourceField
      const itemRoot = event.target.closest('[data-resource-index]')
      const item = draft.items[Number(itemRoot?.dataset.resourceIndex)]
      if (item && field) item[field] = event.target.value
    })
    root.addEventListener('change', event => {
      const field = event.target.dataset.resourceField
      const itemRoot = event.target.closest('[data-resource-index]')
      const item = draft.items[Number(itemRoot?.dataset.resourceIndex)]
      if (item && field) item[field] = event.target.value
    })
    root.addEventListener('click', event => {
      const viewButton = event.target.closest('[data-resource-view]')
      if (viewButton) {
        draft.viewMode = viewButton.dataset.resourceView
        render()
        return
      }
      const actionButton = event.target.closest('[data-resource-action]')
      if (!actionButton) return
      if (actionButton.dataset.resourceAction === 'cancel') {
        if (actionButton.classList.contains('kml-resource-editor-backdrop') && event.target !== actionButton) return
        close(null)
        return
      }
      const action = actionButton.dataset.resourceAction
      const itemIndex = Number(actionButton.closest('[data-resource-index]')?.dataset.resourceIndex)
      if (action === 'add') {
        if (draft.items.length >= KML_RESOURCE_COLLECTION_MAX_ITEMS) return setError(`最多添加 ${KML_RESOURCE_COLLECTION_MAX_ITEMS} 项资源`)
        draft.items.push(createDraftItem())
        page = Math.ceil(draft.items.length / KML_RESOURCE_COLLECTION_PAGE_SIZE)
        rerender()
      } else if (action === 'batch-add') {
        const textarea = root.querySelector('[data-resource-batch]')
        const urls = extractHttpsUrls(textarea?.value)
        if (!urls.length) return setError('没有识别到有效的 HTTPS 地址')
        const available = KML_RESOURCE_COLLECTION_MAX_ITEMS - draft.items.length
        urls.slice(0, available).forEach(url => draft.items.push(createDraftItem({ url })))
        page = Math.ceil(draft.items.length / KML_RESOURCE_COLLECTION_PAGE_SIZE)
        rerender()
      } else if (action === 'delete' && Number.isInteger(itemIndex)) {
        draft.items.splice(itemIndex, 1)
        rerender()
      } else if (action === 'up' && itemIndex > 0) {
        ;[draft.items[itemIndex - 1], draft.items[itemIndex]] = [draft.items[itemIndex], draft.items[itemIndex - 1]]
        page = Math.floor((itemIndex - 1) / KML_RESOURCE_COLLECTION_PAGE_SIZE) + 1
        rerender()
      } else if (action === 'down' && itemIndex >= 0 && itemIndex < draft.items.length - 1) {
        ;[draft.items[itemIndex + 1], draft.items[itemIndex]] = [draft.items[itemIndex], draft.items[itemIndex + 1]]
        page = Math.floor((itemIndex + 1) / KML_RESOURCE_COLLECTION_PAGE_SIZE) + 1
        rerender()
      } else if (action === 'previous-page') {
        page = Math.max(1, page - 1)
        render()
      } else if (action === 'next-page') {
        page += 1
        render()
      } else if (action === 'save') {
        try {
          close(normalizeKmlResourceCollection(draft))
        } catch (error) {
          setError(error.message || '资源集合格式不正确')
        }
      }
    })
  })
}

function renderCollectionItem (item, viewMode) {
  const typeLabel = TYPE_LABELS[item.type] || '资源'
  const image = item.type === 'image'
    ? `<img src="${escapeHtml(item.thumbnailUrl || item.renderUrl || item.url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="kml-resource-collection-type" aria-hidden="true">${item.type === 'video' ? '▶' : item.type === 'audio' ? '♪' : item.type === 'iframe' ? '▣' : '↗'}</span>`
  return `
    <button type="button" class="kml-resource-collection-item is-${escapeHtml(viewMode)}" data-collection-item="${item.resourceIndex}" ${item.unavailable ? 'data-unavailable="true"' : ''}>
      <span class="kml-resource-collection-media">${image}</span>
      <span class="kml-resource-collection-copy"><strong>${escapeHtml(item.title || `资源 ${item.resourceIndex + 1}`)}</strong><small>${escapeHtml(typeLabel)}</small></span>
    </button>
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
  let page = 1
  let viewMode = normalized.viewMode

  const render = () => {
    const pageWindow = displayResolver.page(page)
    page = pageWindow.page
    const { pageCount, items: visible } = pageWindow
    panel.innerHTML = `
      <header>
        <div><span>${escapeHtml(kmlFile?.name || 'KML')}</span><h2>${escapeHtml(feature.name || '资源集合')}</h2><p>${displayResolver.count} 项资源</p></div>
        <button type="button" data-collection-action="close" aria-label="关闭" title="关闭">×</button>
      </header>
      <div class="kml-resource-collection-toolbar">
        <div role="group" aria-label="展示方式">
          <button type="button" data-collection-view="grid" class="${viewMode === 'grid' ? 'is-active' : ''}">卡片</button>
          <button type="button" data-collection-view="list" class="${viewMode === 'list' ? 'is-active' : ''}">列表</button>
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
      await showAlert('该资源当前不能在页面内预览，请使用原地址查看。')
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
