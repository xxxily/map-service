import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  KML_RESOURCE_COLLECTION_MAX_BYTES,
  KML_RESOURCE_COLLECTION_MAX_ITEMS,
  KmlResourceCollectionError,
  getKmlResourceCollectionPage,
  normalizeKmlResourceCollection,
  serializeKmlResourceCollection,
  tryNormalizeKmlResourceCollection,
  normalizeKmlResourceCollectionRef,
  sanitizeKmlResourceCollectionRef,
} from '../shared/kml-resource-collection.js'

test('resource collection references normalize personal and external sources safely', () => {
  assert.deepEqual(normalizeKmlResourceCollectionRef({ sourceType: 'personal', collectionId: 'rc_demo' }), { version: 1, sourceType: 'personal', resolution: 'live', collectionId: 'rc_demo' })
  assert.equal(normalizeKmlResourceCollectionRef({ sourceType: 'external', dataUrl: 'https://example.com/collection' }).dataUrl, 'https://example.com/collection')
  assert.throws(() => normalizeKmlResourceCollectionRef({ sourceType: 'external', dataUrl: 'https://127.0.0.1/data' }), /内网主机/)
  assert.deepEqual(sanitizeKmlResourceCollectionRef({ sourceType: 'personal', collectionId: 'rc_demo' }, { accessState: 'private' }).accessState, 'private')
})
import {
  createKmlResourceCollectionDisplayResolver,
  extractKmlResourceCollectionHttpsUrls,
  planKmlResourceCollectionBatchAdd,
  prepareKmlResourceCollectionEditorSave,
  resolveKmlResourceCollectionInput,
} from '../src/map/kml-resource-collection.js'
import {
  normalizeCollectionFetchError,
  validateCollectionPagePayload,
} from '../src/map/kml-content-panel.js'
import { normalizeResourceCollectionPage } from '../src/map/resource-collection-source.js'

test('remote collection pagination rejects inconsistent totals and preserves unknown totals', () => {
  assert.deepEqual(validateCollectionPagePayload({ items: [{ id: 'a' }], pagination: { page: 2, limit: 1, total: null, pageCount: null, hasNext: true } }, 2), {
    pagination: { page: 2, limit: 1, total: null, pageCount: null, hasNext: true },
    page: 2,
    limit: 1,
    total: null,
    pageCount: null,
    hasNext: true,
  })
  assert.throws(
    () => validateCollectionPagePayload({ items: [], pagination: { page: 1, limit: 40, total: null, pageCount: 2, hasNext: true } }, 1),
    error => error.code === 'INVALID_SCHEMA',
  )
  assert.throws(
    () => validateCollectionPagePayload({ items: [], pagination: { page: 1, limit: 40, total: 41, pageCount: 1, hasNext: false } }, 1),
    error => error.code === 'INVALID_SCHEMA',
  )
  assert.throws(
    () => validateCollectionPagePayload({ items: [{ title: 'missing id', url: 'https://example.com/a' }], pagination: { page: 1, limit: 40, total: null, pageCount: null, hasNext: false } }, 1),
    error => error.code === 'INVALID_SCHEMA',
  )
  assert.throws(
    () => validateCollectionPagePayload({ items: [{ id: 'same' }, { id: 'same' }], pagination: { page: 1, limit: 40, total: null, pageCount: null, hasNext: false } }, 1),
    error => error.code === 'INVALID_SCHEMA',
  )
  assert.throws(
    () => validateCollectionPagePayload({ items: [{ id: 'short-page' }], pagination: { page: 1, limit: 40, total: 80, pageCount: 2, hasNext: true } }, 1),
    error => error.code === 'INVALID_SCHEMA',
  )
})

test('personal collection picker page validation stays strict per response page', () => {
  const page = normalizeResourceCollectionPage({
    items: [{ id: 'rc-1', name: '第一页' }],
    page: 1,
    limit: 40,
    total: 1,
    pageCount: 1,
    hasNext: false,
  }, { page: 1, limit: 40 })
  assert.equal(page.hasNext, false)
  assert.throws(
    () => normalizeResourceCollectionPage({
      items: [{ id: 'rc-1', name: '重复' }, { id: 'rc-1', name: '重复' }],
      page: 1,
      limit: 40,
      total: 2,
      pageCount: 1,
      hasNext: false,
    }, { page: 1, limit: 40 }),
    error => error.code === 'RESOURCE_COLLECTION_SCHEMA_INVALID',
  )
})

test('remote collection redirect errors are policy blocks while generic TypeError stays network error', () => {
  const redirect = normalizeCollectionFetchError(new TypeError('Failed because of redirect mode'), { redirect: 'error' })
  assert.equal(redirect.code, 'BLOCKED_BY_POLICY')
  const network = normalizeCollectionFetchError(new TypeError('Failed to fetch'), { redirect: 'error' })
  assert.equal(network.code, 'NETWORK_ERROR')
})

test('resource collection editor keeps full HTTPS URLs and skips duplicate batch entries', () => {
  assert.deepEqual(extractKmlResourceCollectionHttpsUrls([
    'https://www.720yun.com/t/demo?scene_id=4279442&view=night',
    'https://www.720yun.com/t/demo?scene_id=4279442&view=night',
    'https://example.com/a.jpg。',
  ].join('\n')), [
    'https://www.720yun.com/t/demo?scene_id=4279442&view=night',
    'https://example.com/a.jpg',
  ])

  const plan = planKmlResourceCollectionBatchAdd([
    { url: 'https://example.com/existing.jpg' },
  ], [
    'https://example.com/existing.jpg',
    'https://example.com/new.jpg',
    'https://example.com/new.jpg',
    'https://example.com/last.jpg',
  ].join('\n'), 3)
  assert.deepEqual(plan.additions, ['https://example.com/new.jpg', 'https://example.com/last.jpg'])
  assert.equal(plan.duplicateCount, 1)
  assert.equal(plan.omittedCount, 0)
})

test('resource collection input resolves provider links and infers copied share titles', async () => {
  const result = await resolveKmlResourceCollectionInput(
    '9.79 复制打开抖音，看看【奢望的作品】是牛马向往的地方 https://www.douyin.com/video/7645601561687440101',
  )

  assert.equal(result.warnings.length, 0)
  assert.equal(result.items.length, 1)
  assert.deepEqual(result.items[0], {
    id: result.items[0].id,
    title: '奢望的作品',
    url: 'https://open.douyin.com/player/video?vid=7645601561687440101',
    type: 'iframe',
  })
})

test('resource collection editor save removes untouched placeholders and maps validation to original item', () => {
  const emptyResult = prepareKmlResourceCollectionEditorSave({
    version: 1,
    viewMode: 'grid',
    items: [{ id: 'empty', title: '', url: '', type: 'auto' }],
  })
  assert.deepEqual(emptyResult.value.items, [])
  assert.equal(emptyResult.removedCount, 1)

  const invalidResult = prepareKmlResourceCollectionEditorSave({
    version: 1,
    viewMode: 'list',
    items: [
      { id: 'empty', title: '', url: '', type: 'auto' },
      { id: 'broken', title: '需要地址', url: '', type: 'iframe' },
    ],
  })
  assert.equal(invalidResult.value, null)
  assert.equal(invalidResult.itemIndex, 1)
  assert.equal(invalidResult.field, 'url')
  assert.equal(invalidResult.error.code, 'RESOURCE_COLLECTION_URL_REQUIRED')
})

test('resource collection normalizes stable items and preserves URL query parameters', () => {
  const normalized = normalizeKmlResourceCollection({
    version: 1,
    viewMode: 'list',
    items: [
      {
        title: '主视角',
        url: 'https://www.720yun.com/t/demo?scene_id=4279442#view',
        type: 'iframe',
      },
    ],
  }, {
    createId: index => `resource-${index}`,
  })

  assert.deepEqual(normalized, {
    version: 1,
    viewMode: 'list',
    items: [{
      id: 'resource-0',
      title: '主视角',
      url: 'https://www.720yun.com/t/demo?scene_id=4279442#view',
      type: 'iframe',
    }],
  })
  assert.deepEqual(JSON.parse(serializeKmlResourceCollection(normalized)), normalized)
})

test('resource collection accepts an optional safe cover URL and omits empty covers', () => {
  const normalized = normalizeKmlResourceCollection({
    items: [
      { id: 'cover', url: 'https://www.douyin.com/video/7645601561687440101', type: 'auto', coverUrl: 'https://cdn.example.com/cover.jpg' },
      { id: 'no-cover', url: 'https://www.720yun.com/vr/f4ejtOsf5y0', type: 'auto', coverUrl: '' },
    ],
  })

  assert.equal(normalized.items[0].coverUrl, 'https://cdn.example.com/cover.jpg')
  assert.equal(Object.hasOwn(normalized.items[1], 'coverUrl'), false)
  assert.equal(tryNormalizeKmlResourceCollection({
    items: [{ url: 'https://example.com/page', type: 'auto', coverUrl: 'http://example.com/cover.jpg' }],
  }).error.code, 'RESOURCE_COLLECTION_URL_PROTOCOL')
})

test('resource collection rejects duplicate IDs and unsafe protocols', () => {
  assert.throws(() => normalizeKmlResourceCollection({
    items: [
      { id: 'same', url: 'https://example.com/1.jpg', type: 'image' },
      { id: 'same', url: 'https://example.com/2.jpg', type: 'image' },
    ],
  }), error => error instanceof KmlResourceCollectionError && error.code === 'RESOURCE_COLLECTION_ITEM_ID_DUPLICATE')

  const result = tryNormalizeKmlResourceCollection({
    items: [{ url: 'http://127.0.0.1/private', type: 'iframe' }],
  })
  assert.equal(result.value, null)
  assert.equal(result.error.code, 'RESOURCE_COLLECTION_URL_PROTOCOL')
})

test('resource collection rejects URL credentials and sensitive query parameters while keeping view parameters', () => {
  for (const [url, code] of [
    ['https://user:password@example.com/photo.jpg', 'RESOURCE_COLLECTION_URL_CREDENTIALS'],
    ['https://cdn.example.com/photo.jpg?token=secret', 'RESOURCE_COLLECTION_URL_SENSITIVE_QUERY'],
    ['https://cdn.example.com/photo.jpg?password=secret', 'RESOURCE_COLLECTION_URL_SENSITIVE_QUERY'],
    ['https://cdn.example.com/photo.jpg?signature=secret', 'RESOURCE_COLLECTION_URL_SENSITIVE_QUERY'],
    ['https://cdn.example.com/photo.jpg?api_key=secret', 'RESOURCE_COLLECTION_URL_SENSITIVE_QUERY'],
  ]) {
    const result = tryNormalizeKmlResourceCollection({ items: [{ url, type: 'auto' }] })
    assert.equal(result.value, null, url)
    assert.equal(result.error.code, code, url)
  }

  const normalized = normalizeKmlResourceCollection({
    items: [{ url: 'https://www.720yun.com/t/demo?scene_id=4279442&view=night', type: 'iframe' }],
  }, { createId: () => 'scene' })
  assert.equal(normalized.items[0].url, 'https://www.720yun.com/t/demo?scene_id=4279442&view=night')
})

test('resource collection enforces item and serialized size limits', () => {
  assert.throws(() => normalizeKmlResourceCollection({
    items: Array.from({ length: KML_RESOURCE_COLLECTION_MAX_ITEMS + 1 }, (_, index) => ({
      url: `https://example.com/${index}.jpg`,
      type: 'image',
    })),
  }), /最多包含/)

  assert.throws(() => normalizeKmlResourceCollection({
    items: [{
      title: 'x'.repeat(201),
      url: 'https://example.com/image.jpg',
      type: 'image',
    }],
  }), /长度不能超过 200/)
})

test('resource collection rejects oversized JSON before parsing and oversized normalized output', () => {
  const oversizedJson = 'x'.repeat(KML_RESOURCE_COLLECTION_MAX_BYTES + 1)
  assert.throws(() => normalizeKmlResourceCollection(oversizedJson), error => {
    assert.equal(error.code, 'RESOURCE_COLLECTION_TOO_LARGE')
    return true
  })

  const oversizedCollection = {
    items: Array.from({ length: 300 }, (_, index) => ({
      id: `large-${index}`,
      url: `https://cdn.example.com/${'a'.repeat(3500)}-${index}.jpg`,
      type: 'image',
    })),
  }
  assert.throws(() => normalizeKmlResourceCollection(oversizedCollection), error => {
    assert.equal(error.code, 'RESOURCE_COLLECTION_TOO_LARGE')
    return true
  })
})

test('resource collection pages stay bounded and preserve absolute item order', () => {
  const items = Array.from({ length: 300 }, (_, index) => ({ id: `res-${index}` }))
  const page = getKmlResourceCollectionPage(items, 4)

  assert.equal(page.page, 4)
  assert.equal(page.pageCount, 8)
  assert.equal(page.start, 120)
  assert.equal(page.items.length, 40)
  assert.equal(page.items[0].id, 'res-120')
  assert.equal(page.items.at(-1).id, 'res-159')
  assert.equal(getKmlResourceCollectionPage(items, 99).page, 8)
})

test('resource collection display resolver classifies only requested pages until preview is opened', () => {
  const collection = {
    version: 1,
    viewMode: 'grid',
    items: Array.from({ length: 300 }, (_, index) => ({
      id: `res-${index}`,
      title: `资源 ${index}`,
      url: `https://cdn.example.com/${index}.jpg`,
      type: 'image',
    })),
  }
  let classifyCalls = 0
  const resolver = createKmlResourceCollectionDisplayResolver(collection, {
    normalized: true,
    classify: (url, options) => {
      classifyCalls += 1
      return {
        accepted: true,
        item: {
          id: `classified-${options.index}`,
          type: 'image',
          title: options.title,
          url,
          renderUrl: url,
          thumbnailUrl: url,
        },
      }
    },
  })

  const firstPage = resolver.page(1)
  assert.equal(firstPage.items.length, 40)
  assert.equal(firstPage.items[0].resourceIndex, 0)
  assert.equal(firstPage.items.at(-1).resourceIndex, 39)
  assert.equal(classifyCalls, 40)

  resolver.page(1)
  assert.equal(classifyCalls, 40)
  resolver.page(2)
  assert.equal(classifyCalls, 80)

  const previewItems = resolver.all()
  assert.equal(previewItems.length, 300)
  assert.equal(classifyCalls, 300)
})

test('resource collection display resolver routes ordinary links through the browser preview', () => {
  const resolver = createKmlResourceCollectionDisplayResolver({
    version: 1,
    viewMode: 'grid',
    items: [{ id: 'res-link', title: '说明页', url: 'https://docs.example.com/readme', type: 'auto' }],
  }, {
    normalized: true,
    classify: () => ({
      accepted: true,
      item: {
        id: 'classified-link',
        type: 'link',
        title: '说明页',
        url: 'https://docs.example.com/readme',
        displayUrl: 'https://docs.example.com/readme',
      },
    }),
  })

  const item = resolver.page(1).items[0]
  assert.equal(item.type, 'iframe')
  assert.equal(item.renderUrl, item.url)
  assert.match(item.embedPolicy.sandbox, /allow-scripts/)
})

test('resource collection display resolver keeps an explicit cover for cards and thumbnails', () => {
  const resolver = createKmlResourceCollectionDisplayResolver({
    version: 1,
    viewMode: 'grid',
    items: [{ id: 'res-cover', title: '抖音视频', url: 'https://open.douyin.com/player/video?vid=7645601561687440101', type: 'iframe', coverUrl: 'https://cdn.example.com/cover.jpg' }],
  }, { normalized: true })

  const item = resolver.page(1).items[0]
  assert.equal(item.coverUrl, 'https://cdn.example.com/cover.jpg')
  assert.equal(item.thumbnailUrl, 'https://cdn.example.com/cover.jpg')
  assert.equal(item.provider, 'douyin')
})

test('resource collection display resolver exposes provider identity for unresolved short links', () => {
  const resolver = createKmlResourceCollectionDisplayResolver({
    version: 1,
    viewMode: 'list',
    items: [{ id: 'res-short', title: '', url: 'https://v.douyin.com/kUTlrij29B0/', type: 'auto' }],
  }, { normalized: true })

  const item = resolver.page(1).items[0]
  assert.equal(item.type, 'iframe')
  assert.equal(item.provider, 'douyin')
  assert.equal(item.title, '抖音视频')
})

test('resource collection Escape handling keeps the collection open while media preview is visible', () => {
  const source = readFileSync(new URL('../src/map/kml-resource-collection.js', import.meta.url), 'utf8')
  const panelSource = source.slice(source.indexOf('export function openKmlResourceCollectionPanel'))
  const keydownSource = panelSource.match(/const onKeydown = event => \{[\s\S]*?\n  \}/)?.[0] || ''

  assert.match(keydownSource, /event\.defaultPrevented \|\| document\.querySelector\('\.media-preview-root:not\(\[hidden\]\)'\)/)
  assert.ok(
    keydownSource.indexOf('media-preview-root:not([hidden])') < keydownSource.indexOf('close()'),
  )
})

test('resource collection media preview forwards map activation changes', () => {
  const source = readFileSync(new URL('../src/map/kml-resource-collection.js', import.meta.url), 'utf8')
  assert.match(source, /collectionTitle: String\(feature\.name \|\| '资源集合'\),\n\s+onActiveItemChange: options\.onActiveItemChange/)
})

test('resource collection editor renders a mode-aware field layout and preserves batch input on rerender', () => {
  const source = readFileSync(new URL('../src/map/kml-resource-collection.js', import.meta.url), 'utf8')
  assert.match(source, /class="kml-resource-editor-list is-\$\{escapeHtml\(draft\.viewMode\)\}"/)
  assert.match(source, /class="kml-resource-editor-fields"/)
  assert.match(source, /data-resource-batch[^>]*>\$\{escapeHtml\(batchInput\)\}<\/textarea>/)
  assert.match(source, /aria-pressed="\$\{draft\.viewMode === 'grid'\}"/)
  assert.match(source, /prepareKmlResourceCollectionEditorSave\(draft\)/)
  assert.match(source, /data-resource-action="delete"/)
  assert.doesNotMatch(source, /target="_blank" rel="noopener noreferrer" data-collection-item/)
  assert.match(source, /resolveKmlResourceCollectionInput/)
})
