import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  analyzeKmlRecoveryDraft,
  buildKmlRecoveryDraft,
  buildKmlRecoveryResolution,
  buildKmlSyncOperations,
  getKmlSyncStatusView,
  getPendingShareReferenceCount,
  kmlFingerprint,
  mergeKmlRecoveryDraft,
  registerKmlAccountDocumentSnapshot,
  reduceKmlSyncResult,
  resolveKmlAccountMode,
} from '../src/map/kml-account-sync.js'
import { applyKmlMergeChoices } from '../src/map/kml-conflict-merge.js'
import {
  createBrowserKmlAccountDraftStore,
  createMemoryKmlAccountDraftStore,
  kmlAccountDraftStorageKey,
} from '../src/map/kml-account-draft-store.js'

function createReadonlyIndexedDb (record) {
  return {
    open () {
      const request = {}
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          transaction () {
            return {
              objectStore () {
                return {
                  get () {
                    const getRequest = {}
                    queueMicrotask(() => {
                      getRequest.result = structuredClone(record)
                      getRequest.onsuccess?.()
                    })
                    return getRequest
                  },
                }
              },
            }
          },
        }
        request.onsuccess?.()
      })
      return request
    },
  }
}

test('KML account sync builds create, update and trash operations from snapshots', () => {
  const snapshots = new Map([
    ['server-1', {
      localId: 'server-1',
      serverId: 'server-1',
      revision: 3,
      hash: kmlFingerprint({ id: 'server-1', name: '旧名称', features: [] }),
    }],
    ['server-2', {
      localId: 'server-2',
      serverId: 'server-2',
      revision: 1,
      hash: kmlFingerprint({ id: 'server-2', name: '待删除', features: [] }),
    }],
  ])
  const operations = buildKmlSyncOperations([
    { id: 'server-1', name: '新名称', features: [] },
    { id: 'local-new', name: '新文件', features: [] },
  ], snapshots)

  assert.deepEqual(operations.map(item => item.action).sort(), ['create', 'trash', 'update'])
  assert.equal(operations.find(item => item.action === 'update').data.revision, 3)
  assert.equal(operations.find(item => item.action === 'create').clientId, 'local-new')
  assert.equal(operations.find(item => item.action === 'trash').kmlId, 'server-2')
})

test('KML account sync promotes an existing new default before clearing the old default', () => {
  const snapshots = new Map([
    ['local-a', {
      localId: 'local-a',
      serverId: 'server-a',
      revision: 4,
      hash: kmlFingerprint({ name: 'A', isDefault: true, features: [] }),
    }],
    ['local-b', {
      localId: 'local-b',
      serverId: 'server-b',
      revision: 2,
      hash: kmlFingerprint({ name: 'B', isDefault: false, features: [] }),
    }],
  ])

  const operations = buildKmlSyncOperations([
    { id: 'local-a', name: 'A', isDefault: false, features: [] },
    { id: 'local-b', name: 'B', isDefault: true, features: [] },
  ], snapshots)

  assert.deepEqual(operations.map(operation => ({
    action: operation.action,
    target: operation.kmlId || operation.clientId,
    isDefault: operation.data?.isDefault,
  })), [
    { action: 'update', target: 'server-b', isDefault: true },
    { action: 'update', target: 'server-a', isDefault: false },
  ])
})

test('KML account sync creates a new default before clearing the previous default', () => {
  const snapshots = new Map([
    ['local-a', {
      localId: 'local-a',
      serverId: 'server-a',
      revision: 4,
      hash: kmlFingerprint({ name: 'A', isDefault: true, features: [] }),
    }],
  ])

  const operations = buildKmlSyncOperations([
    { id: 'local-a', name: 'A', isDefault: false, features: [] },
    { id: 'local-b', name: 'B', isDefault: true, features: [] },
  ], snapshots)

  assert.deepEqual(operations.map(operation => ({
    action: operation.action,
    target: operation.kmlId || operation.clientId,
    isDefault: operation.data?.isDefault,
  })), [
    { action: 'create', target: 'local-b', isDefault: true },
    { action: 'update', target: 'server-a', isDefault: false },
  ])
})

test('KML account sync restores a trashed future default before switching the account default', () => {
  let snapshots = new Map([
    ['local-a', {
      localId: 'local-a',
      serverId: 'server-a',
      revision: 4,
      hash: kmlFingerprint({ name: 'A', isDefault: true, features: [] }),
      status: 'active',
    }],
    ['local-b', {
      localId: 'local-b',
      serverId: 'server-b',
      revision: 2,
      hash: kmlFingerprint({ name: 'B', isDefault: false, features: [] }),
      status: 'trashed',
    }],
  ])
  const files = [
    { id: 'local-a', name: 'A', isDefault: false, features: [] },
    { id: 'local-b', name: 'B', isDefault: true, features: [] },
  ]

  assert.deepEqual(buildKmlSyncOperations(files, snapshots), [
    { action: 'restore', kmlId: 'server-b' },
  ])

  snapshots = reduceKmlSyncResult(snapshots, {
    results: [{
      action: 'restore',
      document: {
        id: 'server-b',
        syncClientId: 'local-b',
        revision: 3,
        status: 'active',
        name: 'B',
        isDefault: false,
        features: [],
      },
    }],
  }).snapshots

  assert.deepEqual(buildKmlSyncOperations(files, snapshots).map(operation => ({
    action: operation.action,
    target: operation.kmlId || operation.clientId,
    isDefault: operation.data?.isDefault,
  })), [
    { action: 'update', target: 'server-b', isDefault: true },
    { action: 'update', target: 'server-a', isDefault: false },
  ])
})

test('服务端直接创建的 KML 可登记同步快照且不会再次生成 create', () => {
  const imported = {
    id: 'kml_two_bulu',
    name: '两步路轨迹',
    revision: 1,
    status: 'active',
    coordCorrection: 'wgs84-to-gcj02',
    theme: 'default',
    color: '#0f766e',
    lockDrag: false,
    enabled: true,
    features: [{
      id: 'track-1',
      type: 'LineString',
      name: '公开轨迹',
      description: '',
      coordinates: [[113.2, 23.1], [113.3, 23.2]],
    }],
  }
  const snapshots = registerKmlAccountDocumentSnapshot(new Map(), imported)

  assert.equal(snapshots.get(imported.id).serverId, imported.id)
  assert.equal(snapshots.get(imported.id).revision, 1)
  assert.deepEqual(buildKmlSyncOperations([imported], snapshots), [])
})

test('KML account sync preserves delete state so undo restores and redo trashes again', () => {
  const localFile = { id: 'local-stable', name: '可撤销文件', features: [] }
  let currentSnapshots = new Map([
    ['local-stable', {
      localId: 'local-stable',
      serverId: 'server-stable',
      revision: 1,
      hash: kmlFingerprint(localFile),
      status: 'active',
    }],
  ])

  assert.deepEqual(buildKmlSyncOperations([], currentSnapshots), [
    { action: 'trash', kmlId: 'server-stable' },
  ])

  currentSnapshots = reduceKmlSyncResult(currentSnapshots, {
    results: [{
      action: 'trash',
      document: {
        ...localFile,
        id: 'server-stable',
        syncClientId: 'local-stable',
        revision: 2,
        status: 'trashed',
      },
    }],
  }).snapshots
  assert.equal(currentSnapshots.get('local-stable').status, 'trashed')
  assert.deepEqual(buildKmlSyncOperations([], currentSnapshots), [])
  assert.deepEqual(buildKmlSyncOperations([localFile], currentSnapshots), [
    { action: 'restore', kmlId: 'server-stable' },
  ])

  currentSnapshots = reduceKmlSyncResult(currentSnapshots, {
    results: [{
      action: 'restore',
      document: {
        ...localFile,
        id: 'server-stable',
        syncClientId: 'local-stable',
        revision: 3,
        status: 'active',
      },
    }],
  }).snapshots
  assert.equal(currentSnapshots.get('local-stable').status, 'active')
  assert.deepEqual(buildKmlSyncOperations([], currentSnapshots), [
    { action: 'trash', kmlId: 'server-stable' },
  ])
})

test('KML recovery retains a pending restore instead of replaying create', () => {
  const draft = buildKmlRecoveryDraft('user-a', [
    { id: 'local-stable', name: '撤销删除后的文件', features: [] },
  ], new Map([
    ['local-stable', {
      localId: 'local-stable',
      serverId: 'server-stable',
      revision: 2,
      hash: kmlFingerprint({ name: '删除前内容', features: [] }),
      status: 'trashed',
    }],
  ]), { generation: 4 })

  const analysis = analyzeKmlRecoveryDraft([], draft)
  assert.deepEqual(analysis.operations, [{ action: 'restore', kmlId: 'server-stable' }])
  assert.deepEqual(analysis.restoredLocalIds, ['local-stable'])

  const resolution = buildKmlRecoveryResolution([], draft, 'restore')
  const resolutionSnapshots = new Map(resolution.snapshots.map(item => [item.localId, item]))
  assert.equal(resolution.files[0].id, 'local-stable')
  assert.equal(resolutionSnapshots.get('local-stable').status, 'trashed')
  assert.deepEqual(buildKmlSyncOperations(resolution.files, resolutionSnapshots), [
    { action: 'restore', kmlId: 'server-stable' },
  ])
})

test('KML account sync cancels a delete-before-create tombstone before recreating an undone local file', () => {
  let currentSnapshots = new Map()
  const localFile = { id: 'local-pending', name: '尚未确认创建', features: [] }

  assert.deepEqual(buildKmlSyncOperations([], currentSnapshots, ['local-pending']), [
    { action: 'trash', clientId: 'local-pending' },
  ])
  currentSnapshots = reduceKmlSyncResult(currentSnapshots, {
    results: [{
      action: 'trash',
      clientId: 'local-pending',
      result: { status: 'absent' },
    }],
  }).snapshots
  const trashedSnapshots = currentSnapshots
  assert.deepEqual(buildKmlSyncOperations([localFile], currentSnapshots), [
    { action: 'restore', clientId: 'local-pending' },
  ])
  const recoveryDraft = buildKmlRecoveryDraft('user-a', [localFile], currentSnapshots, { generation: 5 })
  const recovery = buildKmlRecoveryResolution([], recoveryDraft, 'restore')
  assert.deepEqual(recovery.analysis.restoredLocalIds, ['local-pending'])
  assert.equal(recovery.files[0].id, 'local-pending')
  assert.deepEqual(buildKmlSyncOperations(
    recovery.files,
    new Map(recovery.snapshots.map(item => [item.localId, item])),
  ), [{ action: 'restore', clientId: 'local-pending' }])

  currentSnapshots = reduceKmlSyncResult(currentSnapshots, {
    results: [{
      action: 'restore',
      clientId: 'local-pending',
      result: { status: 'absent' },
    }],
  }).snapshots
  assert.deepEqual(buildKmlSyncOperations([localFile], currentSnapshots), [{
    action: 'create',
    clientId: 'local-pending',
    data: {
      name: '尚未确认创建',
      description: '',
      isDefault: false,
      coordCorrection: 'wgs84-to-gcj02',
      theme: 'default',
      color: '#0f766e',
      lockDrag: false,
      enabled: true,
      isLiveTrack: false,
      features: [],
    },
  }])

  const redoAfterRestore = reduceKmlSyncResult(trashedSnapshots, {
    results: [{
      action: 'restore',
      clientId: 'local-pending',
      result: { status: 'absent' },
    }],
  })
  assert.deepEqual(redoAfterRestore.releasedClientIds, ['local-pending'])
  assert.deepEqual(buildKmlSyncOperations(
    [],
    redoAfterRestore.snapshots,
    redoAfterRestore.releasedClientIds,
  ), [{ action: 'trash', clientId: 'local-pending' }])
})

test('KML fingerprint ignores transport-only ids and revisions', () => {
  const left = kmlFingerprint({ id: 'one', revision: 1, name: '路线', features: [] })
  const right = kmlFingerprint({ id: 'two', revision: 99, name: '路线', features: [] })
  assert.equal(left, right)
})

test('KML account sync exposes visible save, failure and conflict states', () => {
  assert.deepEqual(getKmlSyncStatusView('saving'), {
    visible: true,
    label: '保存中…',
    tone: 'saving',
    title: '正在同步到账号',
  })
  assert.equal(getKmlSyncStatusView('saved').label, '已保存')
  assert.equal(getKmlSyncStatusView('error', { phase: 'load' }).label, '加载失败')
  assert.equal(getKmlSyncStatusView('error').label, '保存失败')
  assert.equal(getKmlSyncStatusView('conflict', { message: '版本冲突' }).title, '版本冲突')
  assert.equal(getKmlSyncStatusView('readonly').label, '只读')
  assert.equal(getKmlSyncStatusView('share-pending', { pendingShareReferenceCount: 2 }).label, '分享待同步')
  assert.match(getKmlSyncStatusView('share-pending', { pendingShareReferenceCount: 2 }).title, /2 个分享引用/)
  assert.equal(getKmlSyncStatusView('auth-required').label, '请先登录')
  assert.equal(getKmlSyncStatusView('guest').visible, false)
})

test('iframe 未登录时要求账号认证而不是回退访客 KML', () => {
  assert.equal(resolveKmlAccountMode({ authenticated: true }), 'account')
  assert.equal(resolveKmlAccountMode({ authenticated: false }, { embedded: false }), 'guest')
  assert.equal(resolveKmlAccountMode({ authenticated: false }, { embedded: true }), 'embedded-auth-required')
})

test('KML account sync totals only outdated share references', () => {
  assert.equal(getPendingShareReferenceCount([
    { outdatedShareReferenceCount: 2 },
    { outdatedShareReferenceCount: 1 },
    { outdatedShareReferenceCount: 0 },
  ]), 3)
  assert.equal(getPendingShareReferenceCount(null), 0)
})

test('KML recovery draft keeps create, update and delete intent with user isolation', async () => {
  const snapshots = new Map([
    ['local-a', {
      localId: 'local-a',
      serverId: 'server-a',
      revision: 1,
      hash: kmlFingerprint({ name: 'A', features: [] }),
    }],
    ['server-b', {
      localId: 'server-b',
      serverId: 'server-b',
      revision: 1,
      hash: kmlFingerprint({ name: 'B', features: [] }),
    }],
  ])
  const draft = buildKmlRecoveryDraft('user-a', [
    { id: 'local-a', name: 'A 已修改', features: [] },
    { id: 'local-new', name: '本地新建', features: [] },
  ], snapshots, { generation: 3, updatedAt: '2026-08-05T00:00:00.000Z' })
  const store = createMemoryKmlAccountDraftStore()
  await store.put(draft)

  assert.deepEqual((await store.get('user-a')).files.map(file => file.id), ['local-a', 'local-new'])
  assert.equal(await store.get('user-b'), null)
  const analysis = analyzeKmlRecoveryDraft([
    { id: 'server-a', revision: 1, name: 'A', features: [] },
    { id: 'server-b', revision: 1, name: 'B', features: [] },
  ], draft)
  assert.deepEqual(analysis.operations.map(item => item.action).sort(), ['create', 'trash', 'update'])
  assert.deepEqual(analysis.conflictedLocalIds, [])
})

test('KML v2 recovery draft keeps an immutable full base for three-way merge', () => {
  const document = {
    id: 'server-a',
    revision: 3,
    name: '基线文件',
    features: [{
      id: 'point-a',
      type: 'Point',
      name: '原点位',
      description: '',
      coordinates: [113, 23],
    }],
  }
  const snapshots = registerKmlAccountDocumentSnapshot(new Map(), document, 'local-a')
  const draft = buildKmlRecoveryDraft('user-a', [{ ...document, id: 'local-a' }], snapshots)

  document.features[0].name = '后续修改'
  document.features[0].coordinates[0] = 120
  assert.equal(draft.version, 2)
  assert.equal(draft.snapshots[0].base.features[0].name, '原点位')
  assert.deepEqual(draft.snapshots[0].base.features[0].coordinates, [113, 23])
})

test('KML v2 recovery performs three-way merge while legacy v1 draft safely declines it', () => {
  const base = {
    name: '路线',
    description: '',
    isDefault: true,
    coordCorrection: 'wgs84-to-gcj02',
    theme: 'default',
    color: '#0f766e',
    lockDrag: false,
    enabled: true,
    isLiveTrack: false,
    features: [{
      id: 'p1',
      type: 'Point',
      name: '起点',
      description: '',
      coordinates: [113, 23],
    }],
  }
  const draft = buildKmlRecoveryDraft('user-a', [{
    id: 'local-a',
    ...structuredClone(base),
    name: '本地名称',
  }], new Map([['local-a', {
    localId: 'local-a',
    serverId: 'server-a',
    revision: 1,
    hash: JSON.stringify(base),
    base: structuredClone(base),
    status: 'active',
  }]]))
  const serverFiles = [{
    id: 'server-a',
    revision: 2,
    ...structuredClone(base),
    description: '服务器介绍',
  }]
  const merged = mergeKmlRecoveryDraft(draft, serverFiles)

  assert.equal(merged.legacy, undefined)
  assert.equal(merged.conflicts.length, 0)
  assert.equal(merged.files[0].name, '本地名称')
  assert.equal(merged.files[0].description, '服务器介绍')
  assert.equal(merged.files[0].revision, 2)

  const legacy = structuredClone(draft)
  legacy.version = 1
  delete legacy.snapshots[0].base
  const legacyMerge = mergeKmlRecoveryDraft(legacy, serverFiles)
  assert.equal(legacyMerge.legacy, true)
  assert.equal(legacyMerge.supported, false)
  assert.equal(legacyMerge.files[0].name, '本地名称')
})

test('KML v2 无服务端 ID 的删除墓碑不会被误判为旧版草稿', () => {
  const draft = buildKmlRecoveryDraft('user-a', [], new Map([['local-deleted', {
    localId: 'local-deleted',
    serverId: '',
    revision: 0,
    hash: '',
    status: 'trashed',
  }]]), {
    deletedClientIds: ['local-deleted'],
  })
  const merged = mergeKmlRecoveryDraft(draft, [])

  assert.equal(merged.legacy, undefined)
  assert.equal(merged.supported, undefined)
})

test('自动重试耗尽状态随 v2 草稿持久化并在重新计算时保留', async () => {
  const base = {
    name: '路线',
    description: '',
    isDefault: true,
    coordCorrection: 'wgs84-to-gcj02',
    theme: 'default',
    color: '#0f766e',
    lockDrag: false,
    enabled: true,
    isLiveTrack: false,
    features: [],
  }
  const draft = buildKmlRecoveryDraft('user-a', [{ id: 'local-a', ...base, name: '本地名称' }], new Map([['local-a', {
    localId: 'local-a',
    serverId: 'server-a',
    revision: 1,
    hash: JSON.stringify(base),
    base,
    status: 'active',
  }]]), {
    conflictSession: { version: 1, retryExhausted: true },
  })
  const store = createMemoryKmlAccountDraftStore()
  await store.put(draft)
  const restored = await store.get('user-a')
  const merge = mergeKmlRecoveryDraft(restored, [{ id: 'server-a', revision: 2, ...base }])

  assert.equal(restored.conflictSession.retryExhausted, true)
  assert.deepEqual(Object.keys(restored.conflictSession).sort(), ['retryExhausted', 'version'])
  assert.equal(merge.retryExhausted, true)
  assert.equal(merge.conflicts.length, 0)
})

test('服务器回收站文件选择保留本地时先恢复再提交本地修改', () => {
  const base = {
    id: 'local-a',
    name: '原文件',
    description: '',
    isDefault: false,
    coordCorrection: 'wgs84-to-gcj02',
    theme: 'default',
    color: '#0f766e',
    lockDrag: false,
    enabled: true,
    isLiveTrack: false,
    features: [],
  }
  const draft = buildKmlRecoveryDraft('user-a', [{ ...base, name: '本地继续编辑' }], new Map([['local-a', {
    localId: 'local-a',
    serverId: 'server-a',
    revision: 1,
    hash: kmlFingerprint(base),
    base: structuredClone(base),
    status: 'active',
  }]]))
  const trashedServer = {
    ...base,
    id: 'server-a',
    syncClientId: 'local-a',
    revision: 2,
    status: 'trashed',
  }
  const merge = mergeKmlRecoveryDraft(draft, [trashedServer])
  const resolved = applyKmlMergeChoices(merge, {})
  const trashedSnapshots = registerKmlAccountDocumentSnapshot(new Map(), trashedServer, 'local-a')

  assert.deepEqual(buildKmlSyncOperations(resolved, trashedSnapshots), [
    { action: 'restore', kmlId: 'server-a' },
  ])
  const restoredSnapshots = reduceKmlSyncResult(trashedSnapshots, {
    results: [{
      action: 'restore',
      document: { ...trashedServer, status: 'active', revision: 3 },
    }],
  }).snapshots
  const update = buildKmlSyncOperations(resolved, restoredSnapshots)
  assert.equal(update[0].action, 'update')
  assert.equal(update[0].kmlId, 'server-a')
  assert.equal(update[0].data.name, '本地继续编辑')
})

test('服务器永久删除文件选择保留本地时使用新 clientId 创建副本', () => {
  const base = {
    name: '原文件',
    description: '',
    isDefault: false,
    coordCorrection: 'wgs84-to-gcj02',
    theme: 'default',
    color: '#0f766e',
    lockDrag: false,
    enabled: true,
    isLiveTrack: false,
    features: [],
  }
  const draft = buildKmlRecoveryDraft('user-a', [{ id: 'local-a', ...base, name: '本地继续编辑' }], new Map([['local-a', {
    localId: 'local-a',
    serverId: 'server-a',
    revision: 1,
    hash: JSON.stringify(base),
    base,
    status: 'active',
  }]]))
  const merge = mergeKmlRecoveryDraft(draft, [])
  const resolved = applyKmlMergeChoices(merge, {}, { createId: () => 'local-recovered' })
  const operations = buildKmlSyncOperations(resolved, new Map())

  assert.equal(operations.length, 1)
  assert.equal(operations[0].action, 'create')
  assert.equal(operations[0].clientId, 'local-recovered')
})

test('KML recovery tombstones prevent stale drafts from resurfacing', async () => {
  const values = new Map()
  const localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
  const store = createBrowserKmlAccountDraftStore({
    indexedDB: {},
    localStorage,
    localFullRecordMaxChars: 1,
  })
  const draft = generation => buildKmlRecoveryDraft('user-a', [
    { id: 'local-a', name: `草稿 ${generation}`, features: [] },
  ], new Map(), {
    generation,
    updatedAt: `2026-08-05T00:00:0${generation}.000Z`,
  })

  await assert.rejects(store.put(draft(3)), /IndexedDB 不可用/)
  const storedDraftMetadata = JSON.parse(values.values().next().value)
  assert.equal(storedDraftMetadata.metadataOnly, true)
  assert.equal(Object.hasOwn(storedDraftMetadata, 'files'), false)
  await store.delete('user-a', { generation: 4, updatedAt: '2026-08-05T00:00:04.000Z' })
  await assert.rejects(store.put(draft(3)), /IndexedDB 不可用/)
  assert.equal(await store.get('user-a'), null)
  assert.equal((await store.get('user-a', { includeDeleted: true })).generation, 4)

  await assert.rejects(store.put(draft(5)), /IndexedDB 不可用/)
  const latestMetadata = JSON.parse(values.values().next().value)
  assert.equal(latestMetadata.generation, 5)
  assert.equal(latestMetadata.metadataOnly, true)
  await assert.rejects(store.get('user-a'), /无法读取完整 KML 恢复草稿/)
})

test('小型 KML 草稿在 IndexedDB 不可用时仍从同步 localStorage 副本恢复', async () => {
  const values = new Map()
  const localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
  const store = createBrowserKmlAccountDraftStore({ indexedDB: {}, localStorage })
  const draft = buildKmlRecoveryDraft('user-sidepanel', [
    { id: 'local-a', name: '侧栏关闭前草稿', features: [] },
  ], new Map(), {
    generation: 7,
    updatedAt: '2026-08-17T10:00:00.000Z',
  })

  assert.deepEqual(await store.put(draft), { persistent: 'localstorage' })
  const stored = JSON.parse(values.get(kmlAccountDraftStorageKey('user-sidepanel')))
  assert.equal(stored.metadataOnly, undefined)
  assert.equal(stored.files[0].name, '侧栏关闭前草稿')
  assert.equal((await store.get('user-sidepanel')).generation, 7)
})

test('KML recovery keeps compatibility with legacy full localStorage drafts', async () => {
  const values = new Map()
  const localStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  }
  const legacyDraft = buildKmlRecoveryDraft('user-a', [
    { id: 'local-a', name: '旧版完整草稿', features: [] },
  ], new Map(), {
    generation: 2,
    updatedAt: '2026-08-05T00:00:02.000Z',
  })
  localStorage.setItem(kmlAccountDraftStorageKey('user-a'), JSON.stringify(legacyDraft))

  const store = createBrowserKmlAccountDraftStore({ indexedDB: {}, localStorage })
  assert.equal((await store.get('user-a')).files[0].name, '旧版完整草稿')
})

test('newer local metadata falls back to the latest complete IndexedDB draft', async () => {
  const completeDraft = buildKmlRecoveryDraft('user-a', [
    { id: 'local-a', name: '最近完整草稿', features: [] },
  ], new Map(), {
    generation: 4,
    updatedAt: '2026-08-05T00:00:04.000Z',
  })
  const localStorage = {
    getItem: key => key === kmlAccountDraftStorageKey('user-a')
      ? JSON.stringify({
          userId: 'user-a',
          generation: 5,
          updatedAt: '2026-08-05T00:00:05.000Z',
          metadataOnly: true,
          fileCount: 1,
        })
      : null,
    setItem () {},
  }
  const store = createBrowserKmlAccountDraftStore({
    indexedDB: createReadonlyIndexedDb(completeDraft),
    localStorage,
  })

  const recovered = await store.get('user-a', { includeDeleted: true })
  assert.equal(recovered.files[0].name, '最近完整草稿')
  assert.equal(recovered.generation, 4)
  assert.equal(recovered.storageGeneration, 5)
  assert.equal(recovered.incompleteWrite, true)
})

test('KML recovery merges a committed create response loss by syncClientId', () => {
  const draft = buildKmlRecoveryDraft('user-a', [
    { id: 'local-stable', name: '响应丢失后继续编辑', features: [] },
  ], new Map(), {
    generation: 3,
    updatedAt: '2026-08-05T00:00:03.000Z',
  })
  const serverFiles = [
    {
      id: 'server-created',
      syncClientId: 'local-stable',
      revision: 1,
      name: '首次提交内容',
      features: [],
    },
    { id: 'server-other', revision: 1, name: '其他服务器文件', features: [] },
  ]

  const analysis = analyzeKmlRecoveryDraft(serverFiles, draft)
  assert.deepEqual(analysis.operations.map(item => item.action), ['update'])
  assert.equal(analysis.operations[0].kmlId, 'server-created')

  const restored = buildKmlRecoveryResolution(serverFiles, draft, 'restore')
  assert.deepEqual(restored.files.map(file => file.id).sort(), ['local-stable', 'server-other'])
  assert.equal(restored.files.filter(file => file.id === 'local-stable').length, 1)
  const operations = buildKmlSyncOperations(
    restored.files,
    new Map(restored.snapshots.map(item => [item.localId, item]))
  )
  assert.deepEqual(operations.map(item => [item.action, item.kmlId]), [['update', 'server-created']])

  const unchangedDraft = buildKmlRecoveryDraft('user-a', [
    { id: 'local-stable', name: '首次提交内容', features: [] },
  ], new Map(), { generation: 2 })
  assert.deepEqual(analyzeKmlRecoveryDraft(serverFiles, unchangedDraft).operations, [])
})

test('KML recovery preserves deletion after a committed create response is lost', () => {
  const draft = buildKmlRecoveryDraft('user-a', [], new Map(), {
    generation: 4,
    deletedClientIds: ['local-stable'],
  })
  const serverFiles = [{
    id: 'server-created',
    syncClientId: 'local-stable',
    revision: 1,
    name: '已提交但响应丢失',
    features: [],
  }]

  const analysis = analyzeKmlRecoveryDraft(serverFiles, draft)
  assert.deepEqual(analysis.operations, [{ action: 'trash', kmlId: 'server-created' }])
  assert.deepEqual(analysis.deletedLocalIds, ['local-stable'])

  const restored = buildKmlRecoveryResolution(serverFiles, draft, 'restore')
  assert.deepEqual(restored.files, [])
  assert.equal(restored.shouldSync, true)
  assert.deepEqual(restored.deletedClientIds, ['local-stable'])
  assert.deepEqual(buildKmlSyncOperations(
    restored.files,
    new Map(restored.snapshots.map(item => [item.localId, item])),
    restored.deletedClientIds,
  ), [{ action: 'trash', kmlId: 'server-created' }])

  const notCommitted = analyzeKmlRecoveryDraft([], draft)
  assert.deepEqual(notCommitted.operations, [{ action: 'trash', clientId: 'local-stable' }])
})

test('KML recovery preserves the latest undo or redo intent around an unknown trash or restore response', () => {
  const localFile = { id: 'local-a', name: '在途操作文件', features: [] }
  const activeSnapshot = new Map([['local-a', {
    localId: 'local-a',
    serverId: 'server-a',
    revision: 1,
    hash: kmlFingerprint(localFile),
    status: 'active',
  }]])
  const undoDraft = buildKmlRecoveryDraft('user-a', [localFile], activeSnapshot, {
    generation: 6,
    pendingOperations: [{ action: 'trash', kmlId: 'server-a' }],
  })
  const undoResolution = buildKmlRecoveryResolution([], undoDraft, 'restore')
  assert.deepEqual(undoResolution.files.map(file => file.id), ['local-a'])
  assert.deepEqual(undoResolution.pendingOperations, [{ action: 'trash', kmlId: 'server-a' }])
  const undoSnapshots = new Map(undoResolution.snapshots.map(item => [item.localId, item]))
  const trashDocument = {
    ...localFile,
    id: 'server-a',
    syncClientId: 'local-a',
    revision: 2,
    status: 'trashed',
  }
  const trashed = reduceKmlSyncResult(undoSnapshots, {
    results: [{ action: 'trash', document: trashDocument }],
  }).snapshots
  assert.deepEqual(buildKmlSyncOperations(undoResolution.files, trashed), [
    { action: 'restore', kmlId: 'server-a' },
  ])

  const deleteDraft = buildKmlRecoveryDraft('user-a', [], activeSnapshot, {
    generation: 7,
    pendingOperations: [{ action: 'trash', kmlId: 'server-a' }],
  })
  const deleteResolution = buildKmlRecoveryResolution([], deleteDraft, 'restore')
  const deleteSnapshots = new Map(deleteResolution.snapshots.map(item => [item.localId, item]))
  assert.deepEqual(deleteResolution.files, [])
  assert.equal(deleteSnapshots.get('local-a').status, 'active')
  const deleted = reduceKmlSyncResult(deleteSnapshots, {
    results: [{ action: 'trash', document: trashDocument }],
  }).snapshots
  assert.deepEqual(buildKmlSyncOperations(deleteResolution.files, deleted), [])

  const trashedSnapshot = new Map([['local-a', {
    localId: 'local-a',
    serverId: 'server-a',
    revision: 2,
    hash: kmlFingerprint(localFile),
    status: 'trashed',
  }]])
  const redoDraft = buildKmlRecoveryDraft('user-a', [], trashedSnapshot, {
    generation: 8,
    pendingOperations: [{ action: 'restore', kmlId: 'server-a' }],
  })
  const activeServerFile = {
    ...localFile,
    id: 'server-a',
    syncClientId: 'local-a',
    revision: 3,
    status: 'active',
  }
  const redoResolution = buildKmlRecoveryResolution([activeServerFile], redoDraft, 'restore')
  assert.deepEqual(redoResolution.files, [])
  assert.deepEqual(redoResolution.pendingOperations, [{ action: 'restore', kmlId: 'server-a' }])
  const redoSnapshots = new Map(redoResolution.snapshots.map(item => [item.localId, item]))
  const restored = reduceKmlSyncResult(redoSnapshots, {
    results: [{ action: 'restore', document: activeServerFile }],
  }).snapshots
  assert.deepEqual(buildKmlSyncOperations(redoResolution.files, restored), [
    { action: 'trash', kmlId: 'server-a' },
  ])

  const keepRestoreDraft = buildKmlRecoveryDraft('user-a', [localFile], trashedSnapshot, {
    generation: 9,
    pendingOperations: [{ action: 'restore', kmlId: 'server-a' }],
  })
  const keepRestoreResolution = buildKmlRecoveryResolution([activeServerFile], keepRestoreDraft, 'restore')
  const keepRestoreSnapshots = new Map(keepRestoreResolution.snapshots.map(item => [item.localId, item]))
  assert.deepEqual(keepRestoreResolution.files.map(file => file.id), ['local-a'])
  assert.equal(keepRestoreSnapshots.get('local-a').status, 'trashed')
  const keepRestored = reduceKmlSyncResult(keepRestoreSnapshots, {
    results: [{ action: 'restore', document: activeServerFile }],
  }).snapshots
  assert.deepEqual(buildKmlSyncOperations(keepRestoreResolution.files, keepRestored), [])

  const editedA = { ...localFile, name: '在途删除后已撤销并编辑' }
  const oldB = { id: 'local-b', name: 'B 旧版本', features: [] }
  const editedB = { ...oldB, name: 'B 本地修改' }
  const conflictDraft = buildKmlRecoveryDraft('user-a', [editedA, editedB], new Map([
    ...activeSnapshot,
    ['local-b', {
      localId: 'local-b',
      serverId: 'server-b',
      revision: 1,
      hash: kmlFingerprint(oldB),
      status: 'active',
    }],
  ]), {
    generation: 10,
    pendingOperations: [
      { action: 'trash', kmlId: 'server-a' },
      {
        action: 'update',
        kmlId: 'server-b',
        data: { revision: 1, name: editedB.name, features: [] },
      },
    ],
  })
  const conflictServerFiles = [{
    ...oldB,
    id: 'server-b',
    revision: 2,
    status: 'active',
  }]
  const conflictAnalysis = analyzeKmlRecoveryDraft(conflictServerFiles, conflictDraft)
  assert.deepEqual(conflictAnalysis.pendingPresenceLocalIds, ['local-a'])
  assert.deepEqual(conflictAnalysis.conflictedLocalIds, ['local-b'])
  const conflictResolution = buildKmlRecoveryResolution(conflictServerFiles, conflictDraft, 'reload-conflicts')
  assert.equal(conflictResolution.files.find(file => file.id === 'local-a').name, editedA.name)
  assert.equal(conflictResolution.files.find(file => file.id === 'local-b').name, oldB.name)
  assert.deepEqual(conflictResolution.pendingOperations, [{ action: 'trash', kmlId: 'server-a' }])
})

test('KML recovery resolves revision conflicts by reload or conflict-copy without losing other dirty work', () => {
  const draft = buildKmlRecoveryDraft('user-a', [
    { id: 'local-a', name: 'A 本地修改', isDefault: true, features: [] },
    { id: 'local-new', name: '本地新建', features: [] },
  ], new Map([
    ['local-a', {
      localId: 'local-a',
      serverId: 'server-a',
      revision: 1,
      hash: kmlFingerprint({ name: 'A 旧版本', isDefault: true, features: [] }),
    }],
    ['server-b', {
      localId: 'server-b',
      serverId: 'server-b',
      revision: 1,
      hash: kmlFingerprint({ name: 'B', features: [] }),
    }],
  ]))
  const serverFiles = [
    { id: 'server-a', revision: 2, name: 'A 服务器版本', isDefault: true, features: [] },
    { id: 'server-b', revision: 1, name: 'B', features: [] },
    { id: 'server-c', revision: 1, name: '其他客户端新建', features: [] },
  ]

  const restore = buildKmlRecoveryResolution(serverFiles, draft, 'restore')
  assert.equal(restore.blockedByConflict, true)
  assert.equal(restore.files.find(file => file.id === 'local-a').name, 'A 本地修改')
  assert.deepEqual(
    buildKmlSyncOperations(restore.files, new Map(restore.snapshots.map(item => [item.localId, item])))
      .map(item => item.action)
      .sort(),
    ['create', 'trash', 'update'],
  )

  const reload = buildKmlRecoveryResolution(serverFiles, draft, 'reload-conflicts')
  assert.equal(reload.blockedByConflict, false)
  assert.equal(reload.files.find(file => file.id === 'local-a').name, 'A 服务器版本')
  assert.equal(reload.files.some(file => file.id === 'server-b'), false)
  assert.equal(reload.files.some(file => file.id === 'server-c'), true)
  assert.equal(reload.files.some(file => file.id === 'local-new'), true)

  const copied = buildKmlRecoveryResolution(serverFiles, draft, 'save-as-conflicts', {
    idFactory: index => `copy-${index}`,
  })
  assert.equal(copied.copiedCount, 1)
  assert.equal(copied.files.find(file => file.id === 'local-a').name, 'A 服务器版本')
  assert.equal(copied.files.find(file => file.id === 'copy-0').isDefault, false)
  assert.match(copied.files.find(file => file.id === 'copy-0').name, /冲突副本/)
  assert.throws(() => buildKmlRecoveryResolution(serverFiles, draft, 'overwrite-server'), /处理方式无效/)
})

test('账号同步源码使用代次隔离会话失效后的在途响应', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(
    new URL('../src/map/kml-account-sync.js', import.meta.url),
    'utf8'
  ))
  assert.match(source, /let syncEpoch = 0/)
  assert.match(source, /if \(!accountMode \|\| epoch !== syncEpoch\) return/)
  assert.match(source, /export function suspendKmlAccountSync \(options = \{\}\) \{[\s\S]*syncEpoch \+= 1/)
  assert.match(source, /window\.addEventListener\('pagehide'/)
  assert.match(source, /syncBlockedByConflict = true/)
  assert.match(source, /if \(syncBlockedByConflict\) \{[\s\S]*dispatchSyncState\('conflict'/)
  assert.match(source, /latestFiles = replaceKmlAccountWorkingFiles\(prepared\.files/)
  assert.match(source, /pendingSyncOperations = normalizePendingSyncOperations\(operations\)/)
  assert.match(source, /persistCurrentDraft\('in-flight'\)/)
  assert.match(source, /const draftWrite = latestDraftWrite\s+const draftPersisted = await draftWrite/)
  assert.match(source, /if \(!draftPersisted\) \{\s+pendingSyncOperations = \[\]\s+return\s+\}/)
  assert.match(source, /Number\(error\?\.status \|\| 0\) > 0[\s\S]*pendingSyncOperations = \[\]/)
})

test('2D and 3D KML panels bind session expiry before account recovery and expose sync status', async () => {
  const fs = await import('node:fs/promises')
  const [indexHtml, map3dHtml, mapSource, map3dSource, recoverySource, styles] = await Promise.all([
    fs.readFile(new URL('../index.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../3d.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/map/kml.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/map3d/kml.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/map/kml-account-recovery-ui.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  ])
  assert.match(indexHtml, /<button[^>]*id="kml-sync-status"[^>]*aria-live="polite"/)
  assert.match(map3dHtml, /<button[^>]*id="kml-sync-status"[^>]*aria-live="polite"/)
  assert.match(mapSource, /bindKmlAccountSyncStatus\(\)/)
  assert.match(map3dSource, /bindKmlAccountSyncStatus\(\)/)
  assert.match(mapSource, /isAccountKmlWritable\(\)/)
  assert.match(map3dSource, /isAccountKmlWritable\(\)/)
  assert.match(mapSource, /isEmbeddedKmlAuthRequired\(\)/)
  assert.match(map3dSource, /isEmbeddedKmlAuthRequired\(\)/)
  assert.match(mapSource, /account\.mode === 'embedded-auth-required'/)
  assert.match(map3dSource, /account\.mode === 'embedded-auth-required'/)
  const mapInitialLoad = mapSource.slice(
    mapSource.indexOf('async function loadInitialKmlFiles'),
    mapSource.indexOf('function saveToStorage'),
  )
  const map3dInitialLoad = map3dSource.slice(
    map3dSource.indexOf('async function loadInitialKmlFiles'),
    map3dSource.indexOf('function saveToStorage'),
  )
  assert.ok(mapInitialLoad.indexOf('promptKmlAccountRecovery') < mapInitialLoad.indexOf('ensureDefaultKmlFile'))
  assert.ok(map3dInitialLoad.indexOf('promptKmlAccountRecovery') < map3dInitialLoad.indexOf('ensureDefaultKmlFile'))
  assert.doesNotMatch(mapSource, /previousDefault\.features !== defaultFile\.features/)
  assert.match(mapSource, /bindKmlAccountConflictRecovery/)
  assert.match(map3dSource, /bindKmlAccountConflictRecovery/)
  const mapDeleteHandler = mapSource.slice(
    mapSource.indexOf("if (action === 'delete-file')"),
    mapSource.indexOf("if (action === 'export')"),
  )
  assert.ok(mapDeleteHandler.indexOf('pushKmlHistory()') < mapDeleteHandler.indexOf('kmlList.splice(index, 1)'))
  const mapInit = mapSource.slice(mapSource.indexOf('export async function initKmlSupport'))
  const map3dInit = map3dSource.slice(map3dSource.indexOf('export async function initKmlSupport3d'))
  assert.ok(mapInit.indexOf('bindAccountSessionExpiry(map)') < mapInit.indexOf('await loadInitialKmlFiles()'))
  assert.ok(map3dInit.indexOf('bindAccountSessionExpiry3d()') < map3dInit.indexOf('await loadInitialKmlFiles()'))
  assert.match(recoverySource, /catch \(error\) \{\s+if \(!isAccountKmlMode\(\)\) return null/)
  assert.match(recoverySource, /bindKmlAccountWorkingFilesReplacement\(replaceFiles\)/)
  assert.match(styles, /\.kml-sync-status\[data-state="conflict"\]/)
  assert.match(styles, /\.kml-sync-status\[data-state="share-pending"\]/)
  assert.match(styles, /\.kml-sync-status\[data-state="auth-required"\]/)
})
