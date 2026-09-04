import { showAlert, showChoiceDialog, showEditDialog } from '../ui/dialog.js'
import { accountApi } from '../account/api.js'
import { normalizeKmlResourceCollectionRef } from '../../shared/kml-resource-collection.js'

function unwrapResourceCollectionApiResult (value) {
  if (Array.isArray(value)) return { items: value }
  if (value && typeof value === 'object') {
    if (value.result && typeof value.result === 'object') return unwrapResourceCollectionApiResult(value.result)
    if (value.data && typeof value.data === 'object') return unwrapResourceCollectionApiResult(value.data)
  }
  return value || {}
}

export function normalizeResourceCollectionPage (value, options = {}) {
  const requestedPage = Number(options.page ?? 1)
  const requestedLimit = Number(options.limit ?? 40)
  const fail = message => {
    throw Object.assign(new Error(message), { code: 'RESOURCE_COLLECTION_SCHEMA_INVALID' })
  }
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 ||
      !Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    fail('资源集合列表分页参数不正确，请稍后重试。')
  }
  const result = unwrapResourceCollectionApiResult(value)
  if (!result || typeof result !== 'object' || Array.isArray(result) || !Array.isArray(result.items)) {
    fail('资源集合列表响应不完整，请稍后重试。')
  }
  const readField = key => {
    const top = result[key]
    const nested = result.pagination?.[key]
    if (top !== undefined && nested !== undefined && String(top) !== String(nested)) {
      fail('资源集合列表分页信息不一致，请稍后重试。')
    }
    return top !== undefined ? top : nested
  }
  const page = Number(readField('page'))
  const limit = Number(readField('limit'))
  const total = Number(readField('total'))
  const pageCount = Number(readField('pageCount'))
  const hasNext = readField('hasNext')
  const expectedPageCount = Math.max(1, Math.ceil(total / limit))
  if (!Number.isSafeInteger(page) || page !== requestedPage || page < 1 ||
      !Number.isSafeInteger(limit) || limit !== requestedLimit || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(total) || total < 0 ||
      !Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount !== expectedPageCount || page > pageCount ||
      typeof hasNext !== 'boolean' || hasNext !== (page < pageCount)) {
    fail('资源集合列表分页信息不完整，请稍后重试。')
  }
  const expectedItems = Math.min(limit, Math.max(0, total - (page - 1) * limit))
  const seenIds = new Set()
  if (result.items.length !== expectedItems || result.items.some(item => {
    const id = String(item?.id || '').trim()
    if (!item || typeof item !== 'object' || Array.isArray(item) || !id || seenIds.has(id)) return true
    seenIds.add(id)
    return false
  })) {
    fail('资源集合列表条目数量或标识不完整，请稍后重试。')
  }
  return { ...result, items: result.items, page, limit, total, pageCount, hasNext }
}

async function loadResourceCollectionPage (page, search = '') {
  const result = normalizeResourceCollectionPage(await accountApi.listResourceCollections({
    page,
    limit: 40,
    status: 'active',
    search,
    sort: 'updatedAt',
    order: 'desc',
  }), { page, limit: 40 })
  return { items: result.items, page: result.page, pageCount: result.pageCount, hasNext: result.hasNext }
}

function sourceChoice (current) {
  return showChoiceDialog({
    title: '资源集合来源',
    message: '选择该点位要读取的资源来源。',
    dialogClassName: 'app-dialog-resource-source',
    choiceLayout: 'stacked',
    choices: [
      {
        text: '内嵌数据',
        value: 'inline',
        icon: '▦',
        selected: current.sourceType === 'inline',
        description: '资源随 KML 保存，适合少量且需要随文件导出的内容。',
        class: 'app-dialog-secondary',
      },
      ...(current.sourceType === 'personal' || current.sourceType === 'external'
        ? [{ text: '解除绑定', value: 'unbind', icon: '×', class: 'app-dialog-secondary' }]
        : []),
      { text: '打开个人空间管理', value: 'manage', icon: '⚙', class: 'app-dialog-secondary' },
      {
        text: '个人资源集合',
        value: 'personal',
        icon: '◎',
        selected: current.sourceType === 'personal',
        description: '从个人空间按 ID 读取，可在多个点位复用和独立维护。',
        class: 'app-dialog-secondary',
      },
      {
        text: '外部数据接口',
        value: 'external',
        icon: '↗',
        selected: current.sourceType === 'external',
        description: '按 HTTPS 地址读取，内容和权限由第三方系统维护。',
        class: 'app-dialog-secondary',
      },
    ],
  })
}

function collectionOptionLabel (item) {
  const name = String(item?.name || '未命名集合')
  const count = Number(item?.itemCount || item?.resourceCount || 0).toLocaleString()
  const isPublic = item?.isPublic === true || item?.public === true || item?.visibility === 'public'
  return `${name} · ${count} 项${isPublic ? ' · 公开' : ' · 私有'}`
}

export async function choosePointResourceCollection (current = {}) {
  const source = await sourceChoice(current)
  if (!source || source === 'cancel') return null
  if (source === 'inline') return { sourceType: 'inline' }
  if (source === 'unbind') return { sourceType: 'unbind' }
  if (source === 'manage') {
    if (typeof window !== 'undefined') window.location.href = '/account#collections'
    return null
  }

  if (source === 'personal') {
    let search = ''
    try {
      const searchResult = await showEditDialog({ title: '查找个人资源集合', fields: [{ name: 'search', label: '搜索名称或描述', required: false }], values: { search: current.search || '' }, confirmText: '搜索' })
      if (!searchResult) return null
      search = String(searchResult.search || '').trim()
    } catch (error) {
      await showAlert(error?.message || '资源集合列表加载失败')
      return null
    }
    let page = 1
    const seenCollectionIds = new Set()
    while (true) {
      let result
      try { result = await loadResourceCollectionPage(page, search) } catch (error) { await showAlert(error?.message || '资源集合列表加载失败'); return null }
      const collections = result.items
      if (collections.some(item => {
        const id = String(item?.id || '').trim()
        if (seenCollectionIds.has(id)) return true
        seenCollectionIds.add(id)
        return false
      })) {
        await showAlert('资源集合列表包含重复标识，请刷新后重试。')
        return null
      }
      if (!collections.length && page === 1) { await showAlert('当前没有可绑定的个人资源集合，请先在个人空间创建集合。'); return null }
      const currentId = String(current.collectionId || '')
      const action = await showChoiceDialog({ title: `绑定个人资源集合（第 ${page} 页）`, message: search ? `搜索：${search}` : '选择要绑定的集合。', choices: [
        ...collections.map(item => ({ text: collectionOptionLabel(item), value: String(item.id), selected: String(item.id) === currentId })),
        ...(page > 1 ? [{ text: '上一页', value: '__prev' }] : []),
        ...(result.hasNext ? [{ text: '下一页', value: '__next' }] : []),
        { text: '重新搜索', value: '__search' },
        { text: '打开个人空间管理', value: 'manage' },
        ...(currentId ? [{ text: '解除绑定', value: 'unbind' }] : []),
      ] })
      if (action === '__next') { page += 1; continue }
      if (action === '__prev') { page = Math.max(1, page - 1); continue }
      if (action === '__search') {
        const next = await showEditDialog({ title: '查找个人资源集合', fields: [{ name: 'search', label: '搜索名称或描述', required: false }], values: { search }, confirmText: '搜索' })
        if (!next) return null
        search = String(next.search || '').trim()
        page = 1
        continue
      }
      if (action === 'manage') { if (typeof window !== 'undefined') window.location.href = '/account#collections'; return null }
      if (action === 'unbind') return { sourceType: 'unbind' }
      const selectedItem = collections.find(item => String(item?.id || '') === String(action || ''))
      if (!selectedItem) return null
      try {
        return normalizeKmlResourceCollectionRef({
          version: 1,
          sourceType: 'personal',
          resolution: 'live',
          collectionId: selectedItem.id,
          displayName: currentId === String(selectedItem.id) ? current.displayName : (selectedItem.name || ''),
          viewMode: currentId === String(selectedItem.id) ? current.viewMode : (selectedItem.viewMode || ''),
        })
      } catch (error) {
        await showAlert(error?.message || '资源集合引用格式不正确')
        return null
      }
    }
  }

  const selected = await showEditDialog({
    title: '绑定外部数据接口',
    fields: [
      {
        name: 'dataUrl',
        label: '接口地址',
        inputType: 'url',
        placeholder: 'https://',
        required: true,
        hint: '仅支持 HTTPS；接口需返回约定的 JSON 数据，map-service 不代管第三方权限。',
        maxlength: 4096,
      },
      { name: 'displayName', label: '显示名称', required: false, maxlength: 200 },
      {
        name: 'viewMode',
        label: '展示模式',
        type: 'select',
        options: [{ value: '', label: '跟随接口' }, { value: 'grid', label: '卡片' }, { value: 'list', label: '列表' }],
      },
    ],
    values: {
      dataUrl: current.dataUrl || '',
      displayName: current.displayName || '',
      viewMode: current.viewMode || '',
    },
    confirmText: '绑定',
  })
  if (!selected) return null
  try {
    return normalizeKmlResourceCollectionRef({
      version: 1,
      sourceType: 'external',
      resolution: 'live',
      dataUrl: selected.dataUrl,
      displayName: selected.displayName,
      viewMode: selected.viewMode,
    })
  } catch (error) {
    await showAlert(error?.message || '外部接口地址不符合安全要求')
    return null
  }
}
