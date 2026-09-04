import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  applyKmlMergeChoices,
  mergeKmlDocument,
  mergeKmlFileSets,
} from '../src/map/kml-conflict-merge.js'

function point (id, name, coordinates = [113, 23], extra = {}) {
  return {
    id,
    type: 'Point',
    name,
    description: '',
    coordinates,
    ...extra,
  }
}

function file (overrides = {}) {
  return {
    name: '路线',
    description: '',
    isDefault: false,
    coordCorrection: 'wgs84-to-gcj02',
    theme: 'default',
    color: '#0f766e',
    lockDrag: false,
    enabled: true,
    isLiveTrack: false,
    features: [point('p1', '起点')],
    ...overrides,
  }
}

function mergeFileSet (base, local, server) {
  return mergeKmlFileSets(
    [{ id: 'local-a', ...local }],
    [{ id: 'server-a', revision: 2, ...server }],
    [{ localId: 'local-a', serverId: 'server-a', revision: 1, base }],
  )
}

function resourceCollection (items, overrides = {}) {
  return {
    version: 1,
    viewMode: 'grid',
    items,
    ...overrides,
  }
}

function resourceItem (id, title, extra = {}) {
  return {
    id,
    title,
    url: `https://example.com/${id}`,
    type: 'image',
    ...extra,
  }
}

test('三方合并自动组合不同文件字段和不同要素修改', () => {
  const base = file()
  const local = file({ name: '本地名称' })
  const server = file({
    description: '服务器介绍',
    features: [point('p1', '起点'), point('p2', '服务器新增')],
  })

  const result = mergeKmlDocument(base, local, server, { path: 'file.local-a' })

  assert.equal(result.conflicts.length, 0)
  assert.equal(result.file.name, '本地名称')
  assert.equal(result.file.description, '服务器介绍')
  assert.deepEqual(result.file.features.map(item => item.id), ['p1', 'p2'])
})

test('自动合并统计只计算真实协调的修改而不计算未变化要素', () => {
  const unchangedFeatures = Array.from({ length: 100 }, (_, index) => point(`p${index}`, `点位 ${index}`))
  const base = file({ features: unchangedFeatures })
  const result = mergeKmlDocument(
    base,
    file({ name: '本地名称', features: structuredClone(unchangedFeatures) }),
    file({ description: '服务器介绍', features: structuredClone(unchangedFeatures) }),
    { path: 'file.local-a' },
  )

  assert.equal(result.autoMergedCount, 2)
  assert.deepEqual(result.autoMergedPaths.sort(), [
    'file.local-a.description',
    'file.local-a.name',
  ])
})

test('要素和资源项新增删除各按一项统计且单边重排单独计数', () => {
  const baseFeatures = [point('a', 'A'), point('b', 'B'), point('c', 'C')]
  const featureResult = mergeKmlDocument(
    file({ features: baseFeatures }),
    file({ features: [point('a', 'A'), point('c', 'C'), point('local', 'L')] }),
    file({ features: [...baseFeatures, point('server', 'S')] }),
    { path: 'file.local-a' },
  )
  assert.equal(featureResult.autoMergedCount, 3)
  assert.deepEqual(new Set(featureResult.autoMergedPaths), new Set([
    'file.local-a.features.b',
    'file.local-a.features.local',
    'file.local-a.features.server',
  ]))

  const collectionFor = ids => resourceCollection(ids.map(id => resourceItem(id, id.toUpperCase())))
  const collectionBase = file({
    features: [point('p1', '集合', [113, 23], { resourceCollection: collectionFor(['a', 'b']) })],
  })
  const resourceResult = mergeKmlDocument(
    collectionBase,
    file({ features: [point('p1', '集合', [113, 23], { resourceCollection: collectionFor(['a', 'local']) })] }),
    file({ features: [point('p1', '集合', [113, 23], { resourceCollection: collectionFor(['a', 'b', 'server']) })] }),
    { path: 'file.local-a' },
  )
  assert.equal(resourceResult.autoMergedCount, 3)

  const reordered = mergeKmlDocument(
    file({ features: baseFeatures }),
    file({ features: [point('b', 'B'), point('a', 'A'), point('c', 'C')] }),
    file({ features: baseFeatures }),
    { path: 'file.local-a' },
  )
  assert.equal(reordered.autoMergedCount, 1)
  assert.deepEqual(reordered.autoMergedPaths, ['file.local-a.features.order'])
})

test('同一字段不同值产生冲突且默认保留本地值', () => {
  const result = mergeKmlDocument(
    file(),
    file({ name: '本地名称' }),
    file({ name: '服务器名称' }),
    { path: 'file.local-a' },
  )

  assert.equal(result.file.name, '本地名称')
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0].path, 'file.local-a.name')
  assert.equal(result.conflicts[0].target, 'file-field')
  assert.equal(result.conflicts[0].field, 'name')
})

test('同一要素的不同字段修改可自动合并，坐标双写保持原子冲突', () => {
  const base = file()
  const local = file({ features: [point('p1', '本地标题')] })
  const server = file({ features: [point('p1', '起点', [114, 24])] })
  const merged = mergeKmlDocument(base, local, server, { path: 'file.local-a' })
  assert.equal(merged.conflicts.length, 0)
  assert.equal(merged.file.features[0].name, '本地标题')
  assert.deepEqual(merged.file.features[0].coordinates, [114, 24])

  const conflictResult = mergeKmlDocument(
    base,
    file({ features: [point('p1', '起点', [115, 25])] }),
    file({ features: [point('p1', '起点', [116, 26])] }),
    { path: 'file.local-a' },
  )
  assert.equal(conflictResult.conflicts.length, 1)
  assert.equal(conflictResult.conflicts[0].field, 'coordinates')
})

test('要素显隐字段兼容旧数据并将缺省值视为可见', () => {
  const base = file()
  const local = file({ features: [point('p1', '起点', [113, 23], { visible: false })] })
  const server = file({ features: [point('p1', '起点', [113, 23], { visible: true })] })
  const merged = mergeKmlDocument(base, local, server, { path: 'file.local-a' })

  assert.equal(merged.conflicts.length, 0)
  assert.equal(merged.file.features[0].visible, false)
  assert.equal(merged.autoMergedPaths.includes('file.local-a.features.p1.visible'), true)

  const legacy = mergeKmlDocument(
    file(),
    file(),
    file({ features: [point('p1', '起点', [113, 23])] }),
    { path: 'file.local-a' },
  )
  assert.equal(legacy.conflicts.length, 0)
  assert.equal(Object.hasOwn(legacy.file.features[0], 'visible'), false)
})

test('删除未修改要素自动删除，删除与修改产生冲突', () => {
  const base = file()
  const deletion = mergeKmlDocument(base, file({ features: [] }), file(), { path: 'file.local-a' })
  assert.deepEqual(deletion.file.features, [])
  assert.equal(deletion.conflicts.length, 0)

  const deletionConflict = mergeKmlDocument(
    base,
    file({ features: [] }),
    file({ features: [point('p1', '服务器修改')] }),
    { path: 'file.local-a' },
  )
  assert.equal(deletionConflict.conflicts.length, 1)
  assert.equal(deletionConflict.conflicts[0].kind, 'delete-modify')
  assert.equal(deletionConflict.conflicts[0].featureId, 'p1')
})

test('资源集合按资源 ID 合并不同项并识别同字段冲突', () => {
  const collection = {
    version: 1,
    viewMode: 'grid',
    items: [
      { id: 'r1', title: '图片', url: 'https://example.com/1.jpg', type: 'image' },
      { id: 'r2', title: '页面', url: 'https://example.com/2', type: 'iframe' },
    ],
  }
  const base = file({ features: [point('p1', '集合', [113, 23], { resourceCollection: collection })] })
  const local = structuredClone(base)
  local.features[0].resourceCollection.items[0].title = '本地图片'
  const server = structuredClone(base)
  server.features[0].resourceCollection.items[1].url = 'https://example.com/2?view=server'
  const merged = mergeKmlDocument(base, local, server, { path: 'file.local-a' })
  assert.equal(merged.conflicts.length, 0)
  assert.equal(merged.file.features[0].resourceCollection.items[0].title, '本地图片')
  assert.equal(merged.file.features[0].resourceCollection.items[1].url, 'https://example.com/2?view=server')

  server.features[0].resourceCollection.items[0].title = '服务器图片'
  const conflicted = mergeKmlDocument(base, local, server, { path: 'file.local-a' })
  assert.equal(conflicted.conflicts.length, 1)
  assert.equal(conflicted.conflicts[0].resourceId, 'r1')
  assert.equal(conflicted.conflicts[0].field, 'title')
})

test('单边排序自动采用，双边相反排序产生顺序冲突', () => {
  const base = file({ features: [point('a', 'A'), point('b', 'B'), point('c', 'C')] })
  const local = file({ features: [point('b', 'B'), point('a', 'A'), point('c', 'C')] })
  const oneSide = mergeKmlDocument(base, local, base, { path: 'file.local-a' })
  assert.deepEqual(oneSide.file.features.map(item => item.id), ['b', 'a', 'c'])
  assert.equal(oneSide.conflicts.length, 0)

  const server = file({ features: [point('a', 'A'), point('c', 'C'), point('b', 'B')] })
  const both = mergeKmlDocument(base, local, server, { path: 'file.local-a' })
  assert.equal(both.conflicts.some(item => item.kind === 'order'), true)
})

test('一端重排而另一端只新增要素或资源时自动保留重排与新增项', () => {
  const base = file({ features: [point('a', 'A'), point('b', 'B'), point('c', 'C')] })
  const featureMerge = mergeKmlDocument(
    base,
    file({ features: [point('b', 'B'), point('a', 'A'), point('c', 'C')] }),
    file({ features: [point('a', 'A'), point('b', 'B'), point('c', 'C'), point('server', 'S')] }),
    { path: 'file.local-a' },
  )
  assert.equal(featureMerge.conflicts.some(item => item.kind === 'order'), false)
  assert.deepEqual(featureMerge.file.features.map(item => item.id), ['b', 'a', 'c', 'server'])

  const collectionFor = ids => resourceCollection(ids.map(id => resourceItem(id, id.toUpperCase())))
  const resourceBase = file({
    features: [point('p1', '集合', [113, 23], { resourceCollection: collectionFor(['a', 'b', 'c']) })],
  })
  const resourceLocal = structuredClone(resourceBase)
  resourceLocal.features[0].resourceCollection.items = collectionFor(['b', 'a', 'c']).items
  const resourceServer = structuredClone(resourceBase)
  resourceServer.features[0].resourceCollection.items.push(resourceItem('server', 'S'))
  const resourceMerge = mergeKmlDocument(resourceBase, resourceLocal, resourceServer, { path: 'file.local-a' })
  assert.equal(resourceMerge.conflicts.some(item => item.target === 'resource-order'), false)
  assert.deepEqual(
    resourceMerge.file.features[0].resourceCollection.items.map(item => item.id),
    ['b', 'a', 'c', 'server'],
  )
})

test('文件集合使用快照完整基线合并并保留服务器最新 revision', () => {
  const base = file()
  const local = { id: 'local-a', revision: 1, ...file({ name: '本地名称' }) }
  const server = { id: 'server-a', revision: 2, ...file({ description: '服务器介绍' }) }
  const result = mergeKmlFileSets([local], [server], [{
    localId: 'local-a',
    serverId: 'server-a',
    revision: 1,
    base,
  }])

  assert.equal(result.conflicts.length, 0)
  assert.equal(result.files[0].id, 'local-a')
  assert.equal(result.files[0].serverId, 'server-a')
  assert.equal(result.files[0].revision, 2)
  assert.equal(result.files[0].name, '本地名称')
  assert.equal(result.files[0].description, '服务器介绍')
})

test('旧快照缺少完整基线时安全降级为文件级冲突', () => {
  const result = mergeKmlFileSets(
    [{ id: 'local-a', ...file({ name: '本地名称' }) }],
    [{ id: 'server-a', revision: 2, ...file({ name: '服务器名称' }) }],
    [{ localId: 'local-a', serverId: 'server-a', revision: 1, hash: 'legacy' }],
  )

  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0].reason, 'missing-base')
  assert.equal(result.files[0].name, '本地名称')
})

test('冲突选择只替换目标字段并保留其他自动合并结果', () => {
  const mergeResult = mergeKmlFileSets(
    [{ id: 'local-a', ...file({ name: '本地名称' }) }],
    [{ id: 'server-a', revision: 2, ...file({ name: '服务器名称', description: '服务器介绍' }) }],
    [{ localId: 'local-a', serverId: 'server-a', revision: 1, base: file() }],
  )
  const resolved = applyKmlMergeChoices(mergeResult, {
    'file.local-a.name': 'server',
  })

  assert.equal(resolved[0].name, '服务器名称')
  assert.equal(resolved[0].description, '服务器介绍')
})

test('冲突选择可靠应用文件字段和要素字段', () => {
  const base = file()
  const mergeResult = mergeFileSet(
    base,
    file({ name: '本地文件', features: [point('p1', '本地要素')] }),
    file({ name: '服务器文件', features: [point('p1', '服务器要素')] }),
  )

  const serverResolved = applyKmlMergeChoices(mergeResult, {
    'file.local-a.name': 'server',
    'file.local-a.features.p1.name': 'server',
  })
  assert.equal(serverResolved[0].name, '服务器文件')
  assert.equal(serverResolved[0].features[0].name, '服务器要素')

  const localResolved = applyKmlMergeChoices(mergeResult, {})
  assert.equal(localResolved[0].name, '本地文件')
  assert.equal(localResolved[0].features[0].name, '本地要素')
})

test('冲突选择可靠应用要素删除与替换', () => {
  const base = file()
  const localDeleted = mergeFileSet(
    base,
    file({ features: [] }),
    file({ features: [point('p1', '服务器替换')] }),
  )
  assert.deepEqual(applyKmlMergeChoices(localDeleted, {})[0].features, [])
  assert.equal(applyKmlMergeChoices(localDeleted, {
    'file.local-a.features.p1': 'server',
  })[0].features[0].name, '服务器替换')

  const serverDeleted = mergeFileSet(
    base,
    file({ features: [point('p1', '本地替换')] }),
    file({ features: [] }),
  )
  assert.equal(applyKmlMergeChoices(serverDeleted, {})[0].features[0].name, '本地替换')
  assert.deepEqual(applyKmlMergeChoices(serverDeleted, {
    'file.local-a.features.p1': 'server',
  })[0].features, [])
})

test('要素顺序选择保留另一侧新增要素且按所选顺序排列共有要素', () => {
  const base = file({ features: [point('a', 'A'), point('b', 'B'), point('c', 'C')] })
  const mergeResult = mergeFileSet(
    base,
    file({ features: [point('b', 'B'), point('a', 'A'), point('c', 'C'), point('local', 'L')] }),
    file({ features: [point('a', 'A'), point('c', 'C'), point('server', 'S'), point('b', 'B')] }),
  )
  const orderPath = 'file.local-a.features.order'
  assert.equal(mergeResult.conflicts.some(item => item.path === orderPath), true)

  assert.deepEqual(
    applyKmlMergeChoices(mergeResult, {})[0].features.map(item => item.id),
    ['b', 'a', 'c', 'local', 'server'],
  )
  assert.deepEqual(
    applyKmlMergeChoices(mergeResult, { [orderPath]: 'server' })[0].features.map(item => item.id),
    ['a', 'c', 'server', 'b', 'local'],
  )
})

test('冲突选择可靠应用资源集合字段和集合整体替换', () => {
  const baseCollection = resourceCollection([resourceItem('r1', '资源')])
  const base = file({ features: [point('p1', '集合', [113, 23], { resourceCollection: baseCollection })] })
  const local = structuredClone(base)
  local.features[0].resourceCollection.viewMode = 'list'
  const server = structuredClone(base)
  server.features[0].resourceCollection.viewMode = 'carousel'
  const fieldMerge = mergeFileSet(base, local, server)
  const fieldPath = 'file.local-a.features.p1.resourceCollection.viewMode'
  assert.equal(applyKmlMergeChoices(fieldMerge, {})[0].features[0].resourceCollection.viewMode, 'list')
  assert.equal(applyKmlMergeChoices(fieldMerge, { [fieldPath]: 'server' })[0].features[0].resourceCollection.viewMode, 'carousel')

  const localWithoutCollection = structuredClone(base)
  delete localWithoutCollection.features[0].resourceCollection
  const serverReplacement = structuredClone(base)
  serverReplacement.features[0].resourceCollection = resourceCollection([resourceItem('r2', '服务器集合')])
  const replacementMerge = mergeFileSet(base, localWithoutCollection, serverReplacement)
  const collectionPath = 'file.local-a.features.p1.resourceCollection'
  assert.equal(Object.hasOwn(applyKmlMergeChoices(replacementMerge, {})[0].features[0], 'resourceCollection'), false)
  assert.equal(
    applyKmlMergeChoices(replacementMerge, { [collectionPath]: 'server' })[0]
      .features[0].resourceCollection.items[0].id,
    'r2',
  )
})

test('冲突选择可靠应用资源项字段、删除与替换', () => {
  const baseCollection = resourceCollection([resourceItem('r1', '原始')])
  const base = file({ features: [point('p1', '集合', [113, 23], { resourceCollection: baseCollection })] })
  const local = structuredClone(base)
  local.features[0].resourceCollection.items[0].title = '本地标题'
  const server = structuredClone(base)
  server.features[0].resourceCollection.items[0].title = '服务器标题'
  const fieldMerge = mergeFileSet(base, local, server)
  const fieldPath = 'file.local-a.features.p1.resourceCollection.items.r1.title'
  assert.equal(applyKmlMergeChoices(fieldMerge, {})[0].features[0].resourceCollection.items[0].title, '本地标题')
  assert.equal(
    applyKmlMergeChoices(fieldMerge, { [fieldPath]: 'server' })[0]
      .features[0].resourceCollection.items[0].title,
    '服务器标题',
  )

  const localDeleted = structuredClone(base)
  localDeleted.features[0].resourceCollection.items = []
  const serverReplacement = structuredClone(base)
  serverReplacement.features[0].resourceCollection.items[0].title = '服务器替换'
  const replacementMerge = mergeFileSet(base, localDeleted, serverReplacement)
  const itemPath = 'file.local-a.features.p1.resourceCollection.items.r1'
  assert.deepEqual(applyKmlMergeChoices(replacementMerge, {})[0].features[0].resourceCollection.items, [])
  assert.equal(
    applyKmlMergeChoices(replacementMerge, { [itemPath]: 'server' })[0]
      .features[0].resourceCollection.items[0].title,
    '服务器替换',
  )
})

test('资源项顺序选择保留另一侧新增资源且按所选顺序排列共有资源', () => {
  const collectionFor = ids => resourceCollection(ids.map(id => resourceItem(id, id.toUpperCase())))
  const base = file({ features: [point('p1', '集合', [113, 23], { resourceCollection: collectionFor(['a', 'b', 'c']) })] })
  const local = file({ features: [point('p1', '集合', [113, 23], { resourceCollection: collectionFor(['b', 'a', 'c', 'local']) })] })
  const server = file({ features: [point('p1', '集合', [113, 23], { resourceCollection: collectionFor(['a', 'c', 'server', 'b']) })] })
  const mergeResult = mergeFileSet(base, local, server)
  const orderPath = 'file.local-a.features.p1.resourceCollection.items.order'
  assert.equal(mergeResult.conflicts.some(item => item.path === orderPath), true)

  assert.deepEqual(
    applyKmlMergeChoices(mergeResult, {})[0].features[0].resourceCollection.items.map(item => item.id),
    ['b', 'a', 'c', 'local', 'server'],
  )
  assert.deepEqual(
    applyKmlMergeChoices(mergeResult, { [orderPath]: 'server' })[0]
      .features[0].resourceCollection.items.map(item => item.id),
    ['a', 'c', 'server', 'b', 'local'],
  )
})

test('任一侧资源项缺少或重复稳定 ID 时产生阻断型不支持冲突', () => {
  const validCollection = resourceCollection([resourceItem('r1', '资源')])
  const invalidCases = [
    { side: 'base', items: [{ ...resourceItem('r1', '一') }, { ...resourceItem('r1', '二') }] },
    { side: 'local', items: [resourceItem('', '无 ID')] },
    { side: 'server', items: [resourceItem('   ', '空白 ID')] },
  ]

  invalidCases.forEach(({ side, items }) => {
    const documents = Object.fromEntries(['base', 'local', 'server'].map(key => [key, file({
      features: [point('p1', '集合', [113, 23], { resourceCollection: structuredClone(validCollection) })],
    })]))
    documents[side].features[0].resourceCollection.items = items
    const result = mergeKmlDocument(documents.base, documents.local, documents.server, { path: 'file.local-a' })
    const unsupported = result.conflicts.find(item => item.target === 'resource-items')

    assert.equal(result.supported, false, side)
    assert.equal(unsupported?.kind, 'unsupported', side)
    assert.equal(unsupported?.reason, 'missing-stable-id', side)
    assert.equal(unsupported?.blocking, true, side)
    assert.deepEqual(result.file.features[0].resourceCollection.items, documents.local.features[0].resourceCollection.items, side)
  })
})

test('缺少稳定要素或资源 ID 时可显式采用完整服务器数组', () => {
  const invalidFeatureBase = file({ features: [{ ...point('', '旧点位') }] })
  const invalidFeatureLocal = file({ features: [{ ...point('', '本地点位') }] })
  const invalidFeatureServer = file({ features: [{ ...point('', '服务器点位') }] })
  const featureMerge = mergeFileSet(invalidFeatureBase, invalidFeatureLocal, invalidFeatureServer)
  const featurePath = 'file.local-a.features'

  assert.equal(featureMerge.conflicts[0].target, 'features')
  assert.equal(applyKmlMergeChoices(featureMerge, { [featurePath]: 'server' })[0].features[0].name, '服务器点位')

  const base = file({
    features: [point('p1', '集合', [113, 23], {
      resourceCollection: resourceCollection([resourceItem('', '旧资源')]),
    })],
  })
  const local = structuredClone(base)
  local.features[0].resourceCollection.items[0].title = '本地资源'
  const server = structuredClone(base)
  server.features[0].resourceCollection.items[0].title = '服务器资源'
  const resourceMerge = mergeFileSet(base, local, server)
  const resourcePath = 'file.local-a.features.p1.resourceCollection.items'

  assert.equal(resourceMerge.conflicts.find(item => item.target === 'resource-items')?.blocking, true)
  assert.equal(
    applyKmlMergeChoices(resourceMerge, { [resourcePath]: 'server' })[0]
      .features[0].resourceCollection.items[0].title,
    '服务器资源',
  )
})

test('冲突路径编码带点号的稳定 ID 且选择仍精确落到目标对象', () => {
  const base = file({ features: [point('point.with.dot', '原名称')] })
  const local = file({ features: [point('point.with.dot', '本地名称')] })
  const server = file({ features: [point('point.with.dot', '服务器名称')] })
  const mergeResult = mergeKmlFileSets(
    [{ id: 'local.with.dot', ...local }],
    [{ id: 'server-a', revision: 2, ...server }],
    [{ localId: 'local.with.dot', serverId: 'server-a', revision: 1, base }],
  )
  const conflictPath = 'file.local%2Ewith%2Edot.features.point%2Ewith%2Edot.name'

  assert.equal(mergeResult.conflicts[0].path, conflictPath)
  assert.equal(applyKmlMergeChoices(mergeResult, { [conflictPath]: 'server' })[0].features[0].name, '服务器名称')
})

test('响应丢失的创建按 syncClientId 关联为同一文件而不是重复新建', () => {
  const result = mergeKmlFileSets(
    [{ id: 'local-created', ...file({ name: '响应丢失后继续编辑' }) }],
    [{
      id: 'server-created',
      syncClientId: 'local-created',
      revision: 1,
      ...file({ name: '首次提交内容' }),
    }],
    [],
  )

  assert.equal(result.files.length, 1)
  assert.equal(result.files[0].id, 'local-created')
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0].reason, 'missing-base')
  assert.equal(result.autoMergedCount, 1)
  assert.equal(
    applyKmlMergeChoices(result, { [result.conflicts[0].path]: 'server' })[0].name,
    '首次提交内容',
  )
})

test('多个设备选择不同默认 KML 时生成账号级冲突且最终只保留一个默认文件', () => {
  const baseFiles = [
    { id: 'a', ...file({ name: 'A', isDefault: true }) },
    { id: 'b', ...file({ name: 'B', isDefault: false }) },
    { id: 'c', ...file({ name: 'C', isDefault: false }) },
  ]
  const localFiles = baseFiles.map(item => ({
    ...structuredClone(item),
    isDefault: item.id === 'b',
  }))
  const serverFiles = baseFiles.map(item => ({
    ...structuredClone(item),
    id: `server-${item.id}`,
    revision: 2,
    isDefault: item.id === 'c',
  }))
  const snapshots = baseFiles.map(item => ({
    localId: item.id,
    serverId: `server-${item.id}`,
    revision: 1,
    base: file({ name: item.name, isDefault: item.id === 'a' }),
  }))
  const result = mergeKmlFileSets(localFiles, serverFiles, snapshots)
  const defaultConflict = result.conflicts.find(item => item.target === 'default-file')

  assert.equal(defaultConflict?.path, 'account.defaultFile')
  assert.deepEqual(result.files.filter(item => item.isDefault).map(item => item.id), ['b'])
  assert.deepEqual(
    applyKmlMergeChoices(result, { 'account.defaultFile': 'server' })
      .filter(item => item.isDefault)
      .map(item => item.id),
    ['c'],
  )
  assert.equal(result.autoMergedCount, 0)
})

test('单边切换默认 KML 只统计一次且异常多默认状态会收敛为唯一默认文件', () => {
  const baseFiles = [
    { id: 'a', ...file({ name: 'A', isDefault: true }) },
    { id: 'b', ...file({ name: 'B', isDefault: false }) },
  ]
  const snapshots = baseFiles.map(item => ({
    localId: item.id,
    serverId: `server-${item.id}`,
    revision: 1,
    base: file({ name: item.name, isDefault: item.id === 'a' }),
  }))
  const localSwitched = baseFiles.map(item => ({
    ...structuredClone(item),
    isDefault: item.id === 'b',
  }))
  const serverUnchanged = baseFiles.map(item => ({
    ...structuredClone(item),
    id: `server-${item.id}`,
    revision: 2,
  }))
  const switched = mergeKmlFileSets(localSwitched, serverUnchanged, snapshots)
  assert.equal(switched.autoMergedCount, 1)
  assert.deepEqual(switched.files.filter(item => item.isDefault).map(item => item.id), ['b'])

  const invalidLocal = baseFiles.map(item => ({ ...structuredClone(item), isDefault: true }))
  const normalized = mergeKmlFileSets(invalidLocal, serverUnchanged, snapshots)
  assert.deepEqual(normalized.files.filter(item => item.isDefault).map(item => item.id), ['a'])
})

test('默认文件选择与文件删除选择矛盾时拒绝静默改选其他文件', () => {
  const mergeResult = {
    files: [
      { id: 'a', ...file({ name: 'A', isDefault: false }) },
      { id: 'b', ...file({ name: 'B', isDefault: true }) },
      { id: 'c', ...file({ name: 'C', isDefault: false }) },
    ],
    conflicts: [
      {
        path: 'file.b',
        target: 'file',
        fileId: 'b',
        local: { id: 'b', ...file({ name: 'B', isDefault: true }) },
        server: null,
      },
      {
        path: 'account.defaultFile',
        target: 'default-file',
        local: 'b',
        server: 'c',
      },
    ],
  }

  assert.throws(() => applyKmlMergeChoices(mergeResult, {
    'file.b': 'server',
    'account.defaultFile': 'local',
  }), /默认 KML 已在其他冲突项中删除/)
})

test('服务器已永久删除文件时保留本地会转换为新文件而不是重试旧 ID', () => {
  const base = file({ name: '原文件' })
  const result = mergeKmlFileSets(
    [{ id: 'local-a', ...file({ name: '本地继续编辑' }) }],
    [],
    [{ localId: 'local-a', serverId: 'server-a', revision: 1, base }],
  )
  const resolved = applyKmlMergeChoices(result, {}, {
    createId: () => 'local-recovered',
  })

  assert.equal(result.conflicts[0].serverStatus, 'missing')
  assert.equal(resolved[0].id, 'local-recovered')
  assert.equal(Object.hasOwn(resolved[0], 'serverId'), false)
  assert.equal(Object.hasOwn(resolved[0], 'revision'), false)
})

test('永久删除的默认文件保留本地时，新副本继续承担默认文件状态', () => {
  const base = file({ name: '默认原文件', isDefault: true })
  const result = mergeKmlFileSets(
    [{ id: 'local-a', ...file({ name: '本地默认继续编辑', isDefault: true }) }],
    [],
    [{ localId: 'local-a', serverId: 'server-a', revision: 1, base }],
  )
  const resolved = applyKmlMergeChoices(result, {
    'file.local-a': 'local',
    'account.defaultFile': 'local',
  }, { createId: () => 'local-default-copy' })

  assert.equal(resolved[0].id, 'local-default-copy')
  assert.equal(resolved[0].isDefault, true)
})

test('永久删除副本与账号默认冲突同时处理时默认选择映射到新副本', () => {
  const baseFiles = [
    { id: 'a', ...file({ name: 'A', isDefault: false }) },
    { id: 'b', ...file({ name: 'B', isDefault: false }) },
    { id: 'c', ...file({ name: 'C', isDefault: true }) },
  ]
  const localFiles = baseFiles.map(item => ({
    ...structuredClone(item),
    name: item.id === 'a' ? 'A 本地编辑' : item.name,
    isDefault: item.id === 'a',
  }))
  const serverFiles = baseFiles
    .filter(item => item.id !== 'a')
    .map(item => ({
      ...structuredClone(item),
      id: `server-${item.id}`,
      revision: 2,
      isDefault: item.id === 'b',
    }))
  const snapshots = baseFiles.map(item => ({
    localId: item.id,
    serverId: `server-${item.id}`,
    revision: 1,
    base: file({ name: item.name, isDefault: item.id === 'c' }),
  }))
  const result = mergeKmlFileSets(localFiles, serverFiles, snapshots)
  const resolved = applyKmlMergeChoices(result, {
    'file.a': 'local',
    'account.defaultFile': 'local',
  }, { createId: () => 'a-copy' })

  assert.equal(result.conflicts.find(item => item.path === 'file.a')?.serverStatus, 'missing')
  assert.deepEqual(resolved.filter(item => item.isDefault).map(item => item.id), ['a-copy'])
  assert.equal(resolved.find(item => item.id === 'a-copy')?.name, 'A 本地编辑')

  const reversed = applyKmlMergeChoices({
    ...result,
    conflicts: [...result.conflicts].reverse(),
  }, {
    'file.a': 'local',
    'account.defaultFile': 'local',
  }, { createId: () => 'a-copy' })
  assert.deepEqual(reversed.filter(item => item.isDefault).map(item => item.id), ['a-copy'])
})
