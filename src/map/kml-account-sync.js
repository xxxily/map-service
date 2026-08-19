import { apiRequest } from '../auth/api.js'
import { isEmbeddedDocument } from '../auth/embed-context.js'
import { hasPermission, refreshAuthSession } from '../auth/session.js'
import {
  applyKmlMergeChoices,
  mergeKmlFileSets,
} from './kml-conflict-merge.js'
import { getKmlAccountDraftStore } from './kml-account-draft-store.js'

let accountMode = false
let accountCanWrite = false
let accountCanManageShares = false
let accountUserId = ''
let snapshots = new Map()
let unconfirmedCreateIds = new Set()
let pendingCreateDeletes = new Set()
let pendingSyncOperations = []
let syncTimer = null
let syncInFlight = false
let syncPending = false
let syncBlockedByConflict = false
let latestFiles = []
let syncEpoch = 0
let draftGeneration = 0
let activeDraft = null
let pendingConflict = null
let lifecycleBound = false
let latestSyncState = { state: 'guest', detail: {} }
let embeddedAuthRequired = false
let latestDraftWrite = Promise.resolve(true)
let workingFilesReplacementHandler = null
const KML_RECOVERY_STRATEGIES = new Set([
  'discard',
  'restore',
  'save-as-all',
  'reload-conflicts',
  'save-as-conflicts',
])

function cloneValue (value) {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function conflictSessionFingerprint (merge) {
  return JSON.stringify((merge?.conflicts || []).map(item => ({
    path: item.path,
    kind: item.kind,
    base: item.base,
    local: item.local,
    server: item.server,
  })))
}

function normalizeConflictSession (value) {
  if (!value || typeof value !== 'object') return null
  return {
    version: 1,
    retryExhausted: Boolean(value.retryExhausted),
  }
}

export function getKmlSyncStatusView (state, detail = {}) {
  const message = String(detail.message || '')
  const views = {
    dirty: { visible: true, label: '待保存', tone: 'dirty', title: '修改已写入本机恢复草稿，将在稍后同步' },
    saving: { visible: true, label: '保存中…', tone: 'saving', title: '正在同步到账号' },
    saved: { visible: true, label: '已保存', tone: 'saved', title: '账号 KML 已同步' },
    loaded: { visible: true, label: '已保存', tone: 'saved', title: '已加载账号 KML' },
    'share-pending': {
      visible: true,
      label: '分享待同步',
      tone: 'share-pending',
      title: Number(detail.pendingShareReferenceCount || 0) > 0
        ? `有 ${Number(detail.pendingShareReferenceCount)} 个分享引用仍使用旧内容，点击前往同步`
        : '分享仍使用旧内容，点击前往同步',
    },
    'auth-required': {
      visible: true,
      label: '请先登录',
      tone: 'auth-required',
      title: '侧栏编辑需要在当前窗口先登录账号，点击此处打开登录页',
    },
    readonly: { visible: true, label: '只读', tone: 'readonly', title: '当前账号只能查看 KML' },
    conflict: {
      visible: true,
      label: '保存冲突',
      tone: 'conflict',
      title: message || '服务器内容已更新，点击处理本地恢复草稿',
    },
    error: {
      visible: true,
      label: detail.phase === 'load' ? '加载失败' : '保存失败',
      tone: 'error',
      title: message || (detail.phase === 'load' ? '账号 KML 加载失败' : '账号 KML 保存失败'),
    },
  }
  return views[state] || { visible: false, label: '', tone: 'guest', title: '' }
}

function renderSyncStatusElement (element, syncState = latestSyncState) {
  const view = getKmlSyncStatusView(syncState.state, syncState.detail)
  element.hidden = !view.visible
  element.textContent = view.label
  element.dataset.state = view.tone
  const actionable = syncState.state === 'conflict' || syncState.state === 'share-pending' || syncState.state === 'auth-required'
  element.dataset.actionable = actionable ? 'true' : 'false'
  element.title = view.title
  if ('disabled' in element) element.disabled = !actionable
}

function dispatchResolutionRequest (source = 'automatic') {
  if (typeof window === 'undefined' || !(window.dispatchEvent instanceof Function)) return
  window.dispatchEvent(new CustomEvent('map-kml-sync-resolution-request', {
    detail: { source },
  }))
}

export function bindKmlAccountSyncStatus (elementId = 'kml-sync-status') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
  const element = document.getElementById(elementId)
  if (!element || !(window.addEventListener instanceof Function)) return () => {}
  const onStateChange = event => {
    const detail = event?.detail || {}
    renderSyncStatusElement(element, {
      state: String(detail.state || 'guest'),
      detail,
    })
  }
  const onActivate = () => {
    if (latestSyncState.state === 'conflict') dispatchResolutionRequest('status')
    if (latestSyncState.state === 'share-pending') window.location.assign('/account/#shares')
    if (latestSyncState.state === 'auth-required') {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.assign(`/account?returnTo=${encodeURIComponent(returnTo)}`)
    }
  }
  window.addEventListener('map-kml-sync-state', onStateChange)
  element.addEventListener('click', onActivate)
  renderSyncStatusElement(element)
  return () => {
    window.removeEventListener('map-kml-sync-state', onStateChange)
    element.removeEventListener('click', onActivate)
  }
}

function dispatchSyncState (state, detail = {}) {
  latestSyncState = { state, detail: { ...detail } }
  if (typeof window === 'undefined' || !(window.dispatchEvent instanceof Function)) return
  window.dispatchEvent(new CustomEvent('map-kml-sync-state', {
    detail: { state, ...detail },
  }))
}

export function bindKmlAccountWorkingFilesReplacement (handler) {
  if (!(handler instanceof Function)) return () => {}
  workingFilesReplacementHandler = handler
  return () => {
    if (workingFilesReplacementHandler === handler) workingFilesReplacementHandler = null
  }
}

function replaceKmlAccountWorkingFiles (files, detail = {}) {
  const source = cloneValue(Array.isArray(files) ? files : [])
  if (!(workingFilesReplacementHandler instanceof Function)) return source
  const replaced = workingFilesReplacementHandler(source, detail)
  return Array.isArray(replaced) ? replaced : source
}

export function resolveKmlAccountMode (auth, options = {}) {
  if (auth?.authenticated) return 'account'
  return options.embedded ? 'embedded-auth-required' : 'guest'
}

export function getPendingShareReferenceCount (files) {
  return (Array.isArray(files) ? files : []).reduce((total, file) => (
    total + Math.max(0, Number(file?.outdatedShareReferenceCount || 0))
  ), 0)
}

function dispatchSettledSyncState (state, detail = {}) {
  const pendingShareReferenceCount = accountCanManageShares
    ? getPendingShareReferenceCount(latestFiles)
    : 0
  dispatchSyncState(pendingShareReferenceCount > 0 ? 'share-pending' : state, {
    ...detail,
    pendingShareReferenceCount,
  })
}

function serializableKml (file) {
  return {
    name: String(file.name || '未命名 KML'),
    description: String(file.description || ''),
    isDefault: Boolean(file.isDefault),
    coordCorrection: file.coordCorrection || 'wgs84-to-gcj02',
    theme: file.theme || 'default',
    color: file.color || '#0f766e',
    lockDrag: Boolean(file.lockDrag),
    enabled: file.enabled !== false,
    isLiveTrack: Boolean(file.isLiveTrack),
    // A snapshot is a historical value. Clone the feature graph so map edits
    // cannot mutate the base through a shared reference.
    features: cloneValue(Array.isArray(file.features) ? file.features : []),
  }
}

export function kmlFingerprint (file) {
  return JSON.stringify(serializableKml(file))
}

function snapshotForDocument (document, localId = document.id) {
  const base = cloneValue(serializableKml(document))
  return {
    localId: String(localId || document.id || ''),
    serverId: String(document.id || document.serverId || ''),
    revision: Number(document.revision || 1),
    hash: JSON.stringify(base),
    base,
    status: document.status === 'trashed' ? 'trashed' : 'active',
  }
}

function snapshotMap (values = []) {
  if (values instanceof Map) return new Map(values)
  return new Map((values || []).flatMap(value => {
    const localId = String(value?.localId || '')
    return localId ? [[localId, { ...cloneValue(value), localId }]] : []
  }))
}

export function registerKmlAccountDocumentSnapshot (currentSnapshots, document, localId = document?.id) {
  const next = snapshotMap(currentSnapshots)
  const normalizedLocalId = String(localId || '')
  const serverId = String(document?.id || document?.serverId || '')
  if (!normalizedLocalId || !serverId || !document || typeof document !== 'object') return next
  next.set(normalizedLocalId, snapshotForDocument({ ...document, id: serverId }, normalizedLocalId))
  return next
}

function normalizePendingSyncOperations (values = []) {
  if (!Array.isArray(values)) return []
  return values.slice(0, 100).flatMap((value) => {
    const action = String(value?.action || '')
    if (!['create', 'update', 'trash', 'restore'].includes(action)) return []
    const kmlId = String(value?.kmlId || '')
    const clientId = String(value?.clientId || '')
    if (action === 'create') {
      return clientId && value?.data && typeof value.data === 'object'
        ? [{ action, clientId, data: cloneValue(value.data) }]
        : []
    }
    if (action === 'update') {
      return kmlId && value?.data && typeof value.data === 'object'
        ? [{ action, kmlId, data: cloneValue(value.data) }]
        : []
    }
    if (!kmlId && !clientId) return []
    return [{ action, ...(kmlId ? { kmlId } : { clientId }) }]
  })
}

function snapshotsWithCommittedCreates (serverFiles, draft) {
  const next = snapshotMap(draft?.snapshots)
  const draftIds = new Set([
    ...(draft?.files || []).map(file => String(file?.id || '')).filter(Boolean),
    ...(draft?.deletedClientIds || []).map(id => String(id || '')).filter(Boolean),
  ])
  const knownServerIds = new Set(Array.from(next.values(), snapshot => String(snapshot.serverId || '')))
  for (const document of serverFiles || []) {
    const localId = String(document?.syncClientId || '')
    const serverId = String(document?.id || '')
    if (!localId || !serverId || !draftIds.has(localId) || next.has(localId) || knownServerIds.has(serverId)) continue
    next.set(localId, snapshotForDocument(document, localId))
    knownServerIds.add(serverId)
  }
  return next
}

export function buildKmlSyncOperations (files, currentSnapshots = snapshots, deletedClientIds = []) {
  const operations = []
  const defaultRestores = []
  const activeIds = new Set()
  files.forEach(file => {
    const localId = String(file.id || '')
    if (!localId) return
    activeIds.add(localId)
    const snapshot = currentSnapshots.get(localId)
    const data = serializableKml(file)
    const hash = JSON.stringify(data)
    if (!snapshot) {
      operations.push({ action: 'create', clientId: localId, data })
    } else if (snapshot.status === 'trashed') {
      const restore = snapshot.serverId
        ? { action: 'restore', kmlId: snapshot.serverId }
        : { action: 'restore', clientId: localId }
      operations.push(restore)
      if (data.isDefault === true) defaultRestores.push(restore)
    } else if (snapshot.hash !== hash) {
      operations.push({
        action: 'update',
        kmlId: snapshot.serverId,
        data: { ...data, revision: snapshot.revision },
      })
    }
  })
  currentSnapshots.forEach(snapshot => {
    if (!activeIds.has(snapshot.localId) && snapshot.status !== 'trashed') {
      operations.push({ action: 'trash', kmlId: snapshot.serverId })
    }
  })
  for (const clientId of deletedClientIds || []) {
    const normalizedId = String(clientId || '')
    if (!normalizedId || activeIds.has(normalizedId) || currentSnapshots.has(normalizedId)) continue
    operations.push({ action: 'trash', clientId: normalizedId })
  }
  // Restoring a file always returns it as non-default. When that local file is
  // intended to become the new default, restore it in an isolated first phase;
  // the next sync pass can then promote it before demoting the previous default.
  if (defaultRestores.length) return defaultRestores
  const defaultPromotions = []
  const remainingOperations = []
  operations.forEach(operation => {
    const promotesDefault = ['create', 'update'].includes(operation.action) &&
      operation.data?.isDefault === true
    if (promotesDefault) defaultPromotions.push(operation)
    else remainingOperations.push(operation)
  })
  return [...defaultPromotions, ...remainingOperations]
}

export function reduceKmlSyncResult (currentSnapshots, result) {
  const nextSnapshots = snapshotMap(currentSnapshots)
  const resolvedLocalIds = new Set()
  const releasedClientIds = new Set()
  const findByServerId = serverId => [...nextSnapshots.values()]
    .find(candidate => candidate.serverId === String(serverId || ''))

  for (const entry of result?.results || []) {
    if (entry.action === 'create' && entry.document) {
      const localId = String(entry.clientId || '')
      if (localId) {
        nextSnapshots.set(localId, snapshotForDocument(entry.document, localId))
        resolvedLocalIds.add(localId)
      }
      continue
    }

    if (entry.action === 'update' && entry.document) {
      const previous = findByServerId(entry.document.id)
      const localId = String(previous?.localId || entry.document.syncClientId || entry.document.id || '')
      if (localId) nextSnapshots.set(localId, snapshotForDocument(entry.document, localId))
      continue
    }

    if (entry.action === 'trash') {
      const serverId = entry.document?.id || entry.result?.id
      const previous = findByServerId(serverId)
      const localId = String(entry.clientId || previous?.localId || '')
      if (entry.document && localId) {
        nextSnapshots.set(localId, snapshotForDocument(entry.document, localId))
      } else if (localId) {
        nextSnapshots.set(localId, {
          localId,
          serverId: '',
          revision: 0,
          hash: '',
          status: 'trashed',
        })
      }
      if (localId) resolvedLocalIds.add(localId)
      continue
    }

    if (entry.action === 'restore') {
      const clientId = String(entry.clientId || '')
      const previous = entry.document ? findByServerId(entry.document.id) : null
      const localId = String(clientId || previous?.localId || entry.document?.syncClientId || entry.document?.id || '')
      if (entry.document && localId) {
        nextSnapshots.set(localId, snapshotForDocument(entry.document, localId))
      } else if (clientId) {
        nextSnapshots.delete(localId)
        releasedClientIds.add(localId)
      }
    }
  }

  return {
    snapshots: nextSnapshots,
    resolvedLocalIds: [...resolvedLocalIds],
    releasedClientIds: [...releasedClientIds],
  }
}

export function buildKmlRecoveryDraft (userId, files, currentSnapshots, options = {}) {
  const draft = {
    version: 2,
    userId: String(userId || ''),
    generation: Math.max(1, Number(options.generation || 1)),
    reason: String(options.reason || 'dirty'),
    updatedAt: options.updatedAt || new Date().toISOString(),
    files: cloneValue(Array.isArray(files) ? files : []),
    snapshots: Array.from(snapshotMap(currentSnapshots).values(), value => cloneValue(value)),
    deletedClientIds: [...new Set(Array.from(options.deletedClientIds || [], id => String(id || '')).filter(Boolean))],
    pendingOperations: normalizePendingSyncOperations(options.pendingOperations),
  }
  const conflictSession = normalizeConflictSession(options.conflictSession)
  if (conflictSession) draft.conflictSession = conflictSession
  return draft
}

function normalizeRecoveryDraft (value, userId) {
  if (!value || ![1, 2].includes(Number(value.version)) || String(value.userId || '') !== String(userId || '')) return null
  if (!Array.isArray(value.files) || !Array.isArray(value.snapshots)) return null
  const normalized = buildKmlRecoveryDraft(userId, value.files, value.snapshots, {
    generation: value.generation,
    reason: value.reason,
    updatedAt: value.updatedAt,
    deletedClientIds: value.deletedClientIds,
    pendingOperations: value.pendingOperations,
    conflictSession: value.conflictSession,
  })
  if (value.incompleteWrite) {
    normalized.incompleteWrite = true
    normalized.storageGeneration = Math.max(
      Number(value.storageGeneration || 0),
      Number(value.generation || 0)
    )
  }
  if (Number(value.version) === 1) normalized.legacyVersion = 1
  return normalized
}

function storedRecoveryGeneration (value) {
  return Math.max(
    Number(value?.generation || 0),
    Number(value?.storageGeneration || 0)
  )
}

function compareRecoveryRecords (left, right) {
  const generationDifference = Number(left?.generation || 0) - Number(right?.generation || 0)
  if (generationDifference) return generationDifference
  return (Date.parse(left?.updatedAt || '') || 0) - (Date.parse(right?.updatedAt || '') || 0)
}

function newestRecoveryDraft (values, userId) {
  return values
    .map(value => normalizeRecoveryDraft(value, userId))
    .filter(Boolean)
    .sort((left, right) => compareRecoveryRecords(right, left))[0] || null
}

export function analyzeKmlRecoveryDraft (serverFiles, draft) {
  const draftSnapshots = snapshotsWithCommittedCreates(serverFiles, draft)
  const operations = buildKmlSyncOperations(draft?.files || [], draftSnapshots, draft?.deletedClientIds)
  const pendingOperations = normalizePendingSyncOperations(draft?.pendingOperations)
  const serverById = new Map((serverFiles || []).map(file => [String(file.id || ''), file]))
  const snapshotByServerId = new Map(Array.from(draftSnapshots.values(), item => [item.serverId, item]))
  const pendingPresenceLocalIds = [...new Set(pendingOperations
    .filter(item => item.action === 'trash' || item.action === 'restore')
    .map(item => String(
      item.clientId ||
      snapshotByServerId.get(String(item.kmlId || ''))?.localId ||
      ''
    ))
    .filter(Boolean))]
  const pendingPresenceIds = new Set(pendingPresenceLocalIds)
  const updateByServerId = new Map(operations.filter(item => item.action === 'update').map(item => [item.kmlId, item]))
  const trashByServerId = new Map(operations.filter(item => item.action === 'trash').map(item => [item.kmlId, item]))
  const conflictedLocalIds = []

  draftSnapshots.forEach(item => {
    if (pendingPresenceIds.has(item.localId)) return
    if (!updateByServerId.has(item.serverId) && !trashByServerId.has(item.serverId)) return
    const current = serverById.get(item.serverId)
    if (!current || Number(current.revision || 0) !== Number(item.revision || 0)) {
      conflictedLocalIds.push(item.localId)
    }
  })

  return {
    hasChanges: operations.length > 0 || pendingOperations.length > 0,
    operations,
    pendingOperations,
    pendingPresenceLocalIds,
    conflictedLocalIds,
    createdLocalIds: operations.filter(item => item.action === 'create').map(item => item.clientId),
    updatedLocalIds: operations.filter(item => item.action === 'update')
      .map(item => snapshotByServerId.get(item.kmlId)?.localId)
      .filter(Boolean),
    restoredLocalIds: operations.filter(item => item.action === 'restore')
      .map(item => item.clientId || snapshotByServerId.get(item.kmlId)?.localId)
      .filter(Boolean),
    deletedLocalIds: operations.filter(item => item.action === 'trash')
      .map(item => item.clientId || snapshotByServerId.get(item.kmlId)?.localId)
      .filter(Boolean),
  }
}

function defaultRecoveryId (index) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `kml-recovery-${random}-${index}`
}

function recoveryCopy (file, index, suffix, idFactory) {
  const data = serializableKml(file)
  return {
    ...data,
    id: idFactory(index),
    name: `${data.name.slice(0, Math.max(1, 200 - suffix.length))}${suffix}`,
    isDefault: false,
  }
}

function mappedServerFiles (serverFiles, draftSnapshots) {
  const byServerId = new Map(Array.from(snapshotMap(draftSnapshots).values(), item => [item.serverId, item]))
  return (serverFiles || []).map(document => {
    const previous = byServerId.get(String(document.id || ''))
    return previous
      ? { ...cloneValue(document), id: previous.localId, serverId: document.id }
      : cloneValue(document)
  })
}

export function buildKmlRecoveryResolution (serverFiles, draft, strategy, options = {}) {
  if (!KML_RECOVERY_STRATEGIES.has(strategy)) throw new Error('KML 恢复处理方式无效')
  const analysis = analyzeKmlRecoveryDraft(serverFiles, draft)
  const draftFiles = cloneValue(draft?.files || [])
  const draftById = new Map(draftFiles.map(file => [String(file.id || ''), file]))
  const draftSnapshots = snapshotsWithCommittedCreates(serverFiles, draft)
  const serverViews = mappedServerFiles(serverFiles, draftSnapshots)
  const serverByLocalId = new Map(serverViews.map(file => [String(file.id || ''), file]))
  const idFactory = options.idFactory || defaultRecoveryId
  const conflictIds = new Set(analysis.conflictedLocalIds)
  const createdIds = new Set(analysis.createdLocalIds)
  const updatedIds = new Set(analysis.updatedLocalIds)
  const restoredIds = new Set(analysis.restoredLocalIds)
  const deletedIds = new Set(analysis.deletedLocalIds)
  const pendingPresenceIds = new Set(analysis.pendingPresenceLocalIds)
  const recoverySnapshotByServerId = new Map(Array.from(draftSnapshots.values(), item => [item.serverId, item]))
  const normalizedPendingOperations = normalizePendingSyncOperations(analysis.pendingOperations)
  const pendingOperationLocalId = operation => String(
    operation.clientId || recoverySnapshotByServerId.get(String(operation.kmlId || ''))?.localId || ''
  )
  const replayPendingOperations = strategy === 'restore'
    ? normalizedPendingOperations
    : (['reload-conflicts', 'save-as-conflicts'].includes(strategy)
        ? normalizedPendingOperations.filter(operation => !conflictIds.has(pendingOperationLocalId(operation)))
        : [])
  const draftDeletedClientIds = [...new Set((draft?.deletedClientIds || [])
    .map(id => String(id || ''))
    .filter(Boolean))]
  const buildResolutionSnapshotMap = (options = {}) => {
    const next = snapshotsForServerFiles(serverFiles, draftSnapshots)
    const preservedIds = new Set()
    if (options.preserveConflicts) conflictIds.forEach(localId => preservedIds.add(localId))
    if (options.preserveRestores) restoredIds.forEach(localId => preservedIds.add(localId))
    if (options.preservePendingPresence) pendingPresenceIds.forEach(localId => preservedIds.add(localId))
    preservedIds.forEach(localId => {
      const snapshot = draftSnapshots.get(localId)
      if (snapshot) next.set(localId, snapshot)
    })
    return next
  }
  const snapshotList = values => Array.from(values.values(), snapshot => ({ ...snapshot }))

  if (strategy === 'discard') {
    return {
      files: serverViews,
      snapshots: snapshotList(buildResolutionSnapshotMap()),
      analysis,
      copiedCount: 0,
      shouldSync: false,
      blockedByConflict: false,
      deletedClientIds: [],
      pendingOperations: [],
    }
  }

  if (strategy === 'save-as-all') {
    const dirtyIds = [...new Set([...createdIds, ...updatedIds, ...restoredIds, ...pendingPresenceIds])]
    const copies = dirtyIds.flatMap((localId, index) => {
      const file = draftById.get(localId)
      return file ? [recoveryCopy(file, index, '（恢复副本）', idFactory)] : []
    })
    return {
      files: [...serverViews, ...copies],
      snapshots: snapshotList(buildResolutionSnapshotMap()),
      analysis,
      copiedCount: copies.length,
      shouldSync: copies.length > 0,
      blockedByConflict: false,
      deletedClientIds: [],
      pendingOperations: [],
    }
  }

  const result = []
  const handled = new Set()
  const copies = []
  draftSnapshots.forEach(snapshot => {
    const localId = snapshot.localId
    handled.add(localId)
    const local = draftById.get(localId)
    const server = serverByLocalId.get(localId)
    const conflicted = conflictIds.has(localId)
    if (pendingPresenceIds.has(localId)) {
      if (local) result.push(local)
      return
    }
    if (deletedIds.has(localId)) {
      if (conflicted && (strategy === 'reload-conflicts' || strategy === 'save-as-conflicts') && server) result.push(server)
      return
    }
    if (restoredIds.has(localId)) {
      if (local) result.push(local)
      return
    }
    if (updatedIds.has(localId)) {
      if (conflicted && (strategy === 'reload-conflicts' || strategy === 'save-as-conflicts')) {
        if (server) result.push(server)
        if (strategy === 'save-as-conflicts' && local) {
          copies.push(recoveryCopy(local, copies.length, '（冲突副本）', idFactory))
        }
      } else if (local) {
        result.push(local)
      }
      return
    }
    if (server) result.push(server)
  })
  createdIds.forEach(localId => {
    handled.add(localId)
    const local = draftById.get(localId)
    if (local) result.push(local)
  })
  serverViews.forEach(file => {
    if (!handled.has(String(file.id || ''))) result.push(file)
  })

  const files = [...result, ...copies]
  const preserveConflicts = strategy === 'restore' && analysis.conflictedLocalIds.length > 0
  const nextSnapshots = buildResolutionSnapshotMap({
    preserveConflicts,
    preserveRestores: true,
    preservePendingPresence: replayPendingOperations.length > 0,
  })
  const activeIds = new Set(files.map(file => String(file?.id || '')).filter(Boolean))
  const deletedClientIds = draftDeletedClientIds.filter(id => !activeIds.has(id))
  return {
    files,
    snapshots: snapshotList(nextSnapshots),
    analysis,
    copiedCount: copies.length,
    shouldSync: !analysis.conflictedLocalIds.length || strategy !== 'restore'
      ? replayPendingOperations.length > 0 || buildKmlSyncOperations(files, nextSnapshots, deletedClientIds).length > 0
      : false,
    blockedByConflict: strategy === 'restore' && analysis.conflictedLocalIds.length > 0,
    deletedClientIds,
    pendingOperations: replayPendingOperations,
  }
}

async function loadDocuments (items, concurrency = 4) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker () {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await apiRequest(`/kml/files/${encodeURIComponent(items[index].id)}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results.filter(Boolean)
}

async function loadAllAccountDocuments (options = {}) {
  const status = ['active', 'trashed', 'all'].includes(String(options.status || 'active'))
    ? String(options.status || 'active')
    : 'active'
  const items = []
  let page = 1
  let usage = null
  while (page <= 100) {
    const list = await apiRequest('/kml/files', {
      query: { page, limit: 100, status },
    })
    const pageItems = Array.isArray(list?.items) ? list.items : []
    items.push(...pageItems)
    usage = list?.usage || usage
    const total = Number(list?.total || items.length)
    if (!pageItems.length || items.length >= total || pageItems.length < 100) break
    page += 1
  }
  return { files: await loadDocuments(items), usage }
}

function rebaseSnapshotsToServer (serverFiles, currentSnapshots = snapshots) {
  const rebased = snapshotsForServerFiles(serverFiles, currentSnapshots)
  snapshotMap(currentSnapshots).forEach(item => {
    if (!item.serverId) rebased.set(item.localId, cloneValue(item))
  })
  return rebased
}

export function mergeKmlRecoveryDraft (draft, serverFiles, options = {}) {
  const legacy = Number(draft?.legacyVersion || draft?.version || 0) < 2 ||
    (draft?.snapshots || []).some(snapshot => snapshot?.serverId && snapshot?.base == null)
  if (legacy) {
    return {
      files: cloneValue(draft?.files || []),
      conflicts: [],
      autoMergedCount: 0,
      conflictSummary: { total: 0, files: 0, fields: 0, features: 0, resources: 0, orders: 0 },
      serverFiles: cloneValue(serverFiles || []),
      usage: options.usage || null,
      draft: cloneValue(draft),
      legacy: true,
      supported: false,
    }
  }
  const merge = mergeKmlFileSets(draft?.files || [], serverFiles, draft?.snapshots || [])
  return {
    ...merge,
    ...(draft?.conflictSession?.retryExhausted ? { retryExhausted: true } : {}),
    serverFiles: cloneValue(serverFiles || []),
    usage: options.usage || null,
    draft: cloneValue(draft),
  }
}

async function prepareKmlConflictMerge (draft, options = {}) {
  const loaded = options.loaded || await loadAllAccountDocuments({ status: 'all' })
  return mergeKmlRecoveryDraft(draft, loaded.files, { usage: loaded.usage })
}

async function attemptAutomaticConflictMerge (draft) {
  const prepared = await prepareKmlConflictMerge(draft)
  if (prepared.legacy || prepared.conflicts.length) return { merged: false, prepared }
  snapshots = rebaseSnapshotsToServer(prepared.serverFiles, draft?.snapshots || [])
  latestFiles = replaceKmlAccountWorkingFiles(prepared.files, {
    reason: 'auto-merge',
    autoMergedCount: Number(prepared.autoMergedCount || 0),
  })
  pendingCreateDeletes = new Set((draft?.deletedClientIds || []).filter(id => (
    !latestFiles.some(file => String(file?.id || '') === String(id || ''))
  )))
  pendingSyncOperations = []
  unconfirmedCreateIds = new Set()
  trackUnconfirmedCreates(latestFiles)
  syncBlockedByConflict = false
  pendingConflict = null
  activeDraft = persistCurrentDraft('auto-merged') || draft
  return { merged: true, prepared }
}

function snapshotsForServerFiles (serverFiles, draftSnapshots = []) {
  const next = new Map()
  const previousByServerId = new Map(Array.from(snapshotMap(draftSnapshots).values(), item => [item.serverId, item]))
  serverFiles.forEach(document => {
    const previous = previousByServerId.get(String(document.id || ''))
    const localId = previous?.localId || document.syncClientId || document.id
    next.set(localId, snapshotForDocument(document, localId))
  })
  return next
}

function trackUnconfirmedCreates (files) {
  const activeIds = new Set((files || []).map(file => String(file?.id || '')).filter(Boolean))
  activeIds.forEach((localId) => {
    pendingCreateDeletes.delete(localId)
    if (snapshots.has(localId)) unconfirmedCreateIds.delete(localId)
    else unconfirmedCreateIds.add(localId)
  })
  for (const localId of unconfirmedCreateIds) {
    if (activeIds.has(localId)) continue
    unconfirmedCreateIds.delete(localId)
    pendingCreateDeletes.add(localId)
  }
}

function persistCurrentDraft (reason = 'dirty') {
  if (!accountMode || !accountCanWrite || !accountUserId) return null
  draftGeneration += 1
  const draft = buildKmlRecoveryDraft(accountUserId, latestFiles, snapshots, {
    generation: draftGeneration,
    reason,
    deletedClientIds: pendingCreateDeletes,
    pendingOperations: pendingSyncOperations,
    conflictSession: pendingConflict?.merge,
  })
  activeDraft = draft
  if (syncBlockedByConflict) pendingConflict = { ...(pendingConflict || {}), draft: cloneValue(draft) }
  const persistence = getKmlAccountDraftStore().put(draft)
  latestDraftWrite = Promise.resolve(persistence).then(
    () => true,
    (error) => {
      dispatchSyncState('error', {
        phase: 'recovery',
        code: 'KML_RECOVERY_UNAVAILABLE',
        message: `本机恢复草稿保存失败：${error.message}`,
      })
      return false
    }
  )
  return draft
}

function clearRecoveryDraft () {
  if (!accountUserId) return
  draftGeneration += 1
  activeDraft = null
  pendingConflict = null
  Promise.resolve(getKmlAccountDraftStore().delete(accountUserId, {
    generation: draftGeneration,
  })).catch(() => {})
}

function bindDraftLifecycle () {
  if (lifecycleBound || typeof window === 'undefined') return
  lifecycleBound = true
  const preserve = reason => {
    if (!accountMode || !accountCanWrite) return
    const hasPending = syncBlockedByConflict || pendingSyncOperations.length > 0 ||
      buildKmlSyncOperations(latestFiles, snapshots, pendingCreateDeletes).length > 0
    if (hasPending) persistCurrentDraft(reason)
  }
  window.addEventListener('pagehide', () => preserve('pagehide'))
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') preserve('pagehide')
    })
  }
}

export async function initializeKmlAccountMode () {
  const initializationEpoch = ++syncEpoch
  accountMode = false
  accountCanWrite = false
  accountCanManageShares = false
  accountUserId = ''
  snapshots = new Map()
  unconfirmedCreateIds = new Set()
  pendingCreateDeletes = new Set()
  pendingSyncOperations = []
  latestFiles = []
  syncInFlight = false
  syncPending = false
  syncBlockedByConflict = false
  activeDraft = null
  pendingConflict = null
  embeddedAuthRequired = false
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = null
  bindDraftLifecycle()

  const auth = await refreshAuthSession()
  if (initializationEpoch !== syncEpoch) return { mode: 'guest', files: [] }
  const resolvedMode = resolveKmlAccountMode(auth, { embedded: isEmbeddedDocument() })
  embeddedAuthRequired = resolvedMode === 'embedded-auth-required'
  accountMode = Boolean(resolvedMode === 'account' && hasPermission('kml.own.read', auth))
  accountCanWrite = Boolean(accountMode && hasPermission('kml.own.write', auth))
  accountCanManageShares = Boolean(accountMode && hasPermission('share.own.manage', auth))
  accountUserId = accountMode ? String(auth.user?.id || '') : ''
  if (!accountMode) {
    dispatchSyncState(embeddedAuthRequired ? 'auth-required' : 'guest')
    return {
      mode: embeddedAuthRequired ? 'embedded-auth-required' : 'guest',
      files: [],
      embeddedAuthRequired,
    }
  }

  try {
    const loaded = await loadAllAccountDocuments()
    if (!accountMode || initializationEpoch !== syncEpoch) return { mode: 'guest', files: [] }
    latestFiles = loaded.files
    snapshots = snapshotsForServerFiles(loaded.files)
    let recovery = null
    let recoveryError = null
    if (accountCanWrite && accountUserId) {
      try {
        const storedRecord = await getKmlAccountDraftStore().get(accountUserId, { includeDeleted: true })
        draftGeneration = Math.max(draftGeneration, storedRecoveryGeneration(storedRecord))
        const stored = normalizeRecoveryDraft(storedRecord, accountUserId)
        const analysis = stored ? analyzeKmlRecoveryDraft(loaded.files, stored) : null
        if (stored && (analysis?.hasChanges || stored.incompleteWrite)) {
          activeDraft = stored
          draftGeneration = Math.max(draftGeneration, storedRecoveryGeneration(stored))
          recovery = { draft: stored, analysis }
          if ((analysis?.conflictedLocalIds?.length || stored.conflictSession?.retryExhausted) && !stored.legacyVersion) {
            const mergeLoaded = await loadAllAccountDocuments({ status: 'all' })
            const merge = await prepareKmlConflictMerge(stored, { loaded: mergeLoaded })
            recovery.merge = merge
            pendingConflict = { draft: cloneValue(stored), merge: cloneValue(merge) }
            syncBlockedByConflict = true
          }
        } else if (stored) {
          clearRecoveryDraft()
        }
      } catch (error) {
        recoveryError = error
      }
    }
    if (recoveryError) {
      dispatchSyncState('error', {
        phase: 'recovery',
        code: 'KML_RECOVERY_UNAVAILABLE',
        message: `无法读取本机恢复草稿：${recoveryError.message}`,
      })
    } else {
      if (syncBlockedByConflict) {
        const merge = recovery?.merge
        dispatchSyncState('conflict', {
          code: 'KML_REVISION_CONFLICT',
          message: merge?.legacy
            ? '恢复草稿基于旧版本，请选择加载服务器版本或另存为新 KML'
            : (merge?.retryExhausted && !merge?.conflicts?.length
                ? '自动合并后的保存仍遇到服务器更新，请确认处理'
                : `已自动合并可兼容修改，仍有 ${Number(merge?.conflicts?.length || 0)} 项需要确认`),
          recoveryAvailable: true,
          conflictCount: Number(merge?.conflicts?.length || 0),
          autoMergedCount: Number(merge?.autoMergedCount || 0),
        })
      } else if (accountCanWrite) {
        dispatchSettledSyncState('loaded', { count: loaded.files.length })
      } else {
        dispatchSyncState('readonly', { count: loaded.files.length, readOnly: true })
      }
    }
    return {
      mode: 'account',
      files: loaded.files,
      usage: loaded.usage || null,
      canWrite: accountCanWrite,
      userId: accountUserId,
      recovery,
      recoveryError,
    }
  } catch (error) {
    if (!accountMode || initializationEpoch !== syncEpoch) return { mode: 'guest', files: [] }
    dispatchSyncState('error', { phase: 'load', code: error.code, message: error.message })
    return { mode: 'account', files: [], canWrite: accountCanWrite, userId: accountUserId, error }
  }
}

export function isAccountKmlMode () {
  return accountMode
}

export function isEmbeddedKmlAuthRequired () {
  return embeddedAuthRequired
}

export function isAccountKmlWritable () {
  return accountMode && accountCanWrite
}

export function registerKmlAccountDocument (document, options = {}) {
  if (!accountMode || !accountCanWrite || !document || typeof document !== 'object') return false
  const localId = String(options.localId || document.id || '')
  const serverId = String(document.id || document.serverId || '')
  if (!localId || !serverId) return false

  snapshots = registerKmlAccountDocumentSnapshot(snapshots, { ...document, id: serverId }, localId)
  unconfirmedCreateIds.delete(localId)
  pendingCreateDeletes.delete(localId)
  pendingSyncOperations = pendingSyncOperations.filter(operation => (
    operation.action !== 'create' || String(operation.clientId || '') !== localId
  ))

  const workingIndex = latestFiles.findIndex(file => String(file?.id || '') === localId)
  if (workingIndex >= 0) latestFiles.splice(workingIndex, 1, document)
  else latestFiles = [...latestFiles, document]
  return true
}

function applySyncResult (result, files) {
  const operationResults = result?.results || []
  const reduced = reduceKmlSyncResult(snapshots, result)
  snapshots = reduced.snapshots
  reduced.resolvedLocalIds.forEach((localId) => {
    unconfirmedCreateIds.delete(localId)
    pendingCreateDeletes.delete(localId)
  })
  reduced.releasedClientIds.forEach((localId) => {
    const fileExists = files.some(candidate => String(candidate?.id || '') === localId)
    if (fileExists) {
      pendingCreateDeletes.delete(localId)
      unconfirmedCreateIds.add(localId)
    } else {
      unconfirmedCreateIds.delete(localId)
      pendingCreateDeletes.add(localId)
    }
  })

  operationResults.forEach(entry => {
    if (entry.action === 'create' && entry.document) {
      const localId = String(entry.clientId || '')
      const file = files.find(candidate => candidate.id === localId)
      if (file) {
        file.serverId = entry.document.id
        file.revision = entry.document.revision
        file.updatedAt = entry.document.updatedAt
        file.shareReferenceCount = Number(entry.document.shareReferenceCount || 0)
        file.outdatedShareReferenceCount = Number(entry.document.outdatedShareReferenceCount || 0)
      }
      return
    }
    if ((entry.action === 'update' || entry.action === 'restore') && entry.document) {
      const snapshotEntry = [...snapshots.values()].find(candidate => candidate.serverId === entry.document.id)
      const localId = snapshotEntry?.localId || entry.document.id
      const file = files.find(candidate => candidate.id === localId)
      if (file) {
        file.revision = entry.document.revision
        file.updatedAt = entry.document.updatedAt
        file.shareReferenceCount = Number(entry.document.shareReferenceCount || 0)
        file.outdatedShareReferenceCount = Number(entry.document.outdatedShareReferenceCount || 0)
      }
    }
  })
}

async function flushSync (options = {}) {
  if (!accountMode || !accountCanWrite || syncBlockedByConflict) return
  if (syncInFlight) {
    syncPending = true
    return
  }
  const queuedOperations = normalizePendingSyncOperations(pendingSyncOperations)
  let operations = queuedOperations.length > 0
    ? queuedOperations
    : buildKmlSyncOperations(latestFiles, snapshots, pendingCreateDeletes)
  if (!operations.length) {
    clearRecoveryDraft()
    dispatchSettledSyncState('saved')
    return
  }

  const epoch = syncEpoch
  let retryAfterAutoMerge = false
  syncInFlight = true
  dispatchSyncState('saving', { operationCount: operations.length })
  try {
    if (queuedOperations.length === 0) {
      pendingSyncOperations = normalizePendingSyncOperations(operations)
      operations = normalizePendingSyncOperations(pendingSyncOperations)
      persistCurrentDraft('in-flight')
      const draftWrite = latestDraftWrite
      const draftPersisted = await draftWrite
      if (!accountMode || epoch !== syncEpoch) return
      if (!draftPersisted) {
        pendingSyncOperations = []
        return
      }
    }
    const result = await apiRequest('/kml/sync', {
      method: 'POST',
      body: { operations },
    })
    if (!accountMode || epoch !== syncEpoch) return
    pendingSyncOperations = []
    applySyncResult(result, latestFiles)
    const remainingOperations = buildKmlSyncOperations(latestFiles, snapshots, pendingCreateDeletes)
    if (remainingOperations.length === 0) {
      clearRecoveryDraft()
      dispatchSettledSyncState('saved', { syncedAt: result.syncedAt })
    } else {
      persistCurrentDraft('dirty')
      dispatchSyncState('dirty', { operationCount: remainingOperations.length })
      syncPending = true
    }
  } catch (error) {
    if (!accountMode || epoch !== syncEpoch) return
    if (Number(error?.status || 0) > 0) pendingSyncOperations = []
    if (error.code === 'KML_REVISION_CONFLICT') {
      const draft = persistCurrentDraft('conflict') || activeDraft
      if (!options.autoMergeAttempted && draft) {
        try {
          const automatic = await attemptAutomaticConflictMerge(draft)
          if (!accountMode || epoch !== syncEpoch) return
          if (automatic.merged) {
            retryAfterAutoMerge = true
            syncPending = true
            dispatchSyncState('dirty', {
              message: '已合并其他设备的修改，正在重新保存',
              autoMergedCount: automatic.prepared.autoMergedCount,
            })
            return
          }
          pendingConflict = {
            draft: cloneValue(draft),
            merge: cloneValue(automatic.prepared),
          }
        } catch (mergeError) {
          pendingConflict = {
            draft: cloneValue(draft),
            mergeError: mergeError.message,
          }
        }
      } else if (draft) {
        try {
          const prepared = await prepareKmlConflictMerge(draft)
          pendingConflict = {
            draft: cloneValue(draft),
            merge: cloneValue({ ...prepared, retryExhausted: true }),
          }
        } catch (mergeError) {
          pendingConflict = {
            draft: cloneValue(draft),
            mergeError: mergeError.message,
          }
        }
      } else {
        pendingConflict = null
      }
      syncBlockedByConflict = true
      persistCurrentDraft('conflict')
      dispatchSyncState('conflict', {
        code: error.code,
        message: pendingConflict?.merge?.conflicts?.length
          ? `已自动合并可兼容修改，仍有 ${pendingConflict.merge.conflicts.length} 项需要确认`
          : error.message,
        recoveryAvailable: Boolean(draft),
        conflictCount: Number(pendingConflict?.merge?.conflicts?.length || 0),
        autoMergedCount: Number(pendingConflict?.merge?.autoMergedCount || 0),
      })
      dispatchResolutionRequest('automatic')
    } else {
      persistCurrentDraft('error')
      dispatchSyncState('error', {
        code: error.code,
        message: error.message,
      })
    }
  } finally {
    if (epoch !== syncEpoch) return
    syncInFlight = false
    if (syncPending && !syncBlockedByConflict) {
      syncPending = false
      if (syncTimer) clearTimeout(syncTimer)
      syncTimer = null
      await flushSync(retryAfterAutoMerge ? { autoMergeAttempted: true } : {})
    }
  }
}

export function setKmlAccountWorkingFiles (files, options = {}) {
  latestFiles = Array.isArray(files) ? files : []
  trackUnconfirmedCreates(latestFiles)
  if (options.persist !== false && accountCanWrite) persistCurrentDraft(options.reason || 'dirty')
}

export function scheduleKmlAccountSync (files, options = {}) {
  if (!accountMode || !accountCanWrite) return false
  latestFiles = files
  trackUnconfirmedCreates(latestFiles)
  persistCurrentDraft(syncBlockedByConflict ? 'conflict' : 'dirty')
  if (syncBlockedByConflict) {
    dispatchSyncState('conflict', {
      code: 'KML_REVISION_CONFLICT',
      message: '服务器内容已更新，请先处理保存冲突',
      recoveryAvailable: true,
    })
    return true
  }
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    syncTimer = null
    flushSync()
  }, options.delayMs === 0 ? 0 : (Number(options.delayMs) || 600))
  if (syncInFlight) syncPending = true
  dispatchSyncState('dirty')
  return true
}

export async function flushKmlAccountSync () {
  if (syncTimer) {
    clearTimeout(syncTimer)
    syncTimer = null
  }
  if (syncBlockedByConflict) {
    dispatchResolutionRequest('flush')
    return
  }
  await flushSync()
}

export async function resolveKmlAccountRecovery (strategy, recovery = null) {
  if (!accountMode || !accountCanWrite || !accountUserId) {
    throw new Error('当前账号不能恢复 KML 草稿')
  }
  const normalizedStrategy = String(strategy || '')
  if (!KML_RECOVERY_STRATEGIES.has(normalizedStrategy)) throw new Error('KML 恢复处理方式无效')

  const resolutionEpoch = syncEpoch
  const resolutionUserId = accountUserId
  const store = getKmlAccountDraftStore()
  const persistedRecord = await store.get(accountUserId, { includeDeleted: true })
  draftGeneration = Math.max(draftGeneration, storedRecoveryGeneration(persistedRecord))
  const stored = newestRecoveryDraft([
    recovery?.draft,
    pendingConflict?.draft,
    activeDraft,
    persistedRecord,
  ], accountUserId)
  if (!stored) throw new Error('没有可恢复的 KML 草稿')
  if (persistedRecord?.deleted && compareRecoveryRecords(persistedRecord, stored) >= 0) {
    throw new Error('KML 恢复草稿已被丢弃')
  }
  const loaded = await loadAllAccountDocuments()
  if (!accountMode || !accountCanWrite || resolutionEpoch !== syncEpoch || resolutionUserId !== accountUserId) {
    throw new Error('账号会话已变化，请重新加载 KML')
  }
  const latestPersistedRecord = await store.get(accountUserId, { includeDeleted: true })
  draftGeneration = Math.max(draftGeneration, storedRecoveryGeneration(latestPersistedRecord))
  const newestCurrentDraft = newestRecoveryDraft([activeDraft, latestPersistedRecord], accountUserId)
  if ((latestPersistedRecord?.deleted && compareRecoveryRecords(latestPersistedRecord, stored) >= 0) ||
      (newestCurrentDraft && compareRecoveryRecords(newestCurrentDraft, stored) > 0)) {
    throw new Error('KML 草稿在处理期间又有更新，请重新选择处理方式')
  }
  if (normalizedStrategy === 'restore' && !stored.legacyVersion && recovery?.merge && !recovery.merge.legacy) {
    const merge = await prepareKmlConflictMerge(stored, { loaded: await loadAllAccountDocuments({ status: 'all' }) })
    if (merge.conflicts.length) {
      snapshots = snapshotMap(stored.snapshots)
      latestFiles = cloneValue(stored.files || [])
      pendingCreateDeletes = new Set(stored.deletedClientIds || [])
      pendingSyncOperations = normalizePendingSyncOperations(stored.pendingOperations)
      unconfirmedCreateIds = new Set()
      trackUnconfirmedCreates(latestFiles)
      syncBlockedByConflict = true
      pendingConflict = { draft: cloneValue(stored), merge: cloneValue(merge) }
      persistCurrentDraft('conflict')
      dispatchSyncState('conflict', {
        code: 'KML_REVISION_CONFLICT',
        message: `已自动合并可兼容修改，仍有 ${merge.conflicts.length} 项需要确认`,
        recoveryAvailable: true,
        conflictCount: merge.conflicts.length,
        autoMergedCount: Number(merge.autoMergedCount || 0),
      })
      return {
        files: latestFiles,
        snapshots: Array.from(snapshots.values(), value => cloneValue(value)),
        analysis: recovery.analysis || analyzeKmlRecoveryDraft(loaded.files, stored),
        merge,
        copiedCount: 0,
        shouldSync: false,
        blockedByConflict: true,
        deletedClientIds: [...pendingCreateDeletes],
        pendingOperations: cloneValue(pendingSyncOperations),
      }
    }
    snapshots = rebaseSnapshotsToServer(merge.serverFiles, stored.snapshots || [])
    latestFiles = merge.files
    pendingCreateDeletes = new Set((stored.deletedClientIds || []).filter(id => (
      !latestFiles.some(file => String(file?.id || '') === String(id || ''))
    )))
    pendingSyncOperations = []
    unconfirmedCreateIds = new Set()
    trackUnconfirmedCreates(latestFiles)
    syncBlockedByConflict = false
    pendingConflict = null
    persistCurrentDraft('auto-merged')
    dispatchSyncState('dirty', { autoMergedCount: Number(merge.autoMergedCount || 0) })
    return {
      files: latestFiles,
      snapshots: Array.from(snapshots.values(), value => cloneValue(value)),
      analysis: recovery.analysis || analyzeKmlRecoveryDraft(loaded.files, stored),
      merge,
      copiedCount: 0,
      shouldSync: true,
      blockedByConflict: false,
      deletedClientIds: [...pendingCreateDeletes],
      pendingOperations: [],
    }
  }
  const result = buildKmlRecoveryResolution(loaded.files, stored, normalizedStrategy)

  snapshots = snapshotMap(result.snapshots)
  latestFiles = result.files
  pendingCreateDeletes = new Set(result.deletedClientIds || [])
  pendingSyncOperations = normalizePendingSyncOperations(result.pendingOperations)
  unconfirmedCreateIds = new Set()
  trackUnconfirmedCreates(latestFiles)
  syncBlockedByConflict = result.blockedByConflict
  pendingConflict = result.blockedByConflict ? { draft: cloneValue(stored), analysis: result.analysis } : null
  activeDraft = stored

  if (normalizedStrategy === 'discard') {
    clearRecoveryDraft()
    dispatchSettledSyncState('loaded', { count: result.files.length })
  } else if (result.blockedByConflict) {
    persistCurrentDraft('conflict')
    dispatchSyncState('conflict', {
      code: 'KML_REVISION_CONFLICT',
      message: '恢复草稿基于旧版本，请选择加载服务器版本或另存为新 KML',
      recoveryAvailable: true,
    })
  } else if (result.shouldSync) {
    persistCurrentDraft('recovery')
    dispatchSyncState('dirty')
  } else {
    clearRecoveryDraft()
    dispatchSettledSyncState('loaded', { count: result.files.length })
  }

  return result
}

export async function resolveKmlAccountConflict (strategy) {
  if (!['reload', 'save-as'].includes(strategy)) {
    throw new Error('KML 冲突处理方式无效')
  }
  const mapped = strategy === 'reload' ? 'reload-conflicts' : 'save-as-conflicts'
  return resolveKmlAccountRecovery(mapped)
}

export function getKmlAccountConflictSession () {
  if (!pendingConflict) return null
  return cloneValue(pendingConflict)
}

export async function resolveKmlAccountConflictChoices (choices = {}) {
  if (!accountMode || !accountCanWrite || !accountUserId) {
    throw new Error('当前账号不能处理 KML 冲突')
  }
  const stored = pendingConflict?.draft || activeDraft
  if (!stored) throw new Error('没有可处理的 KML 冲突草稿')
  const latest = await prepareKmlConflictMerge(stored)
  if (latest.legacy) throw new Error('旧版草稿缺少合并基线，请加载服务器版本或将本地版本另存为新 KML')
  const displayedMerge = pendingConflict?.merge
  if (displayedMerge && conflictSessionFingerprint(displayedMerge) !== conflictSessionFingerprint(latest)) {
    pendingConflict = { draft: cloneValue(stored), merge: cloneValue(latest) }
    syncBlockedByConflict = true
    persistCurrentDraft('conflict-rebased')
    dispatchSyncState('conflict', {
      code: 'KML_REVISION_CONFLICT',
      message: '服务器内容在处理期间发生变化，已重新计算冲突，请重新选择',
      recoveryAvailable: true,
      conflictCount: latest.conflicts.length,
      autoMergedCount: Number(latest.autoMergedCount || 0),
    })
    throw new Error('服务器内容在处理期间发生变化，已重新计算冲突，请重新选择')
  }
  if (!latest.conflicts.length) {
    const automatic = await attemptAutomaticConflictMerge(stored)
    if (!automatic.merged) throw new Error('服务器内容刚刚发生变化，请重新打开冲突处理')
    syncBlockedByConflict = false
    pendingConflict = null
    persistCurrentDraft('auto-merged')
    dispatchSyncState('dirty', { autoMergedCount: automatic.prepared.autoMergedCount })
    await flushSync({ autoMergeAttempted: true })
    return { ...automatic.prepared, resolved: true, conflicts: [] }
  }
  const missingChoice = latest.conflicts.find(item => !['local', 'server'].includes(String(choices[item.path] || '')))
  if (missingChoice) throw new Error(`请先处理冲突：${missingChoice.path}`)
  const resolvedFiles = applyKmlMergeChoices(latest, choices)
  snapshots = rebaseSnapshotsToServer(latest.serverFiles, stored.snapshots || [])
  latestFiles = resolvedFiles
  pendingCreateDeletes = new Set((stored.deletedClientIds || []).filter(id => (
    !latestFiles.some(file => String(file?.id || '') === String(id || ''))
  )))
  pendingSyncOperations = []
  unconfirmedCreateIds = new Set()
  trackUnconfirmedCreates(latestFiles)
  syncBlockedByConflict = false
  pendingConflict = null
  persistCurrentDraft('manual-merge')
  dispatchSyncState('dirty', {
    conflictCount: latest.conflicts.length,
    resolvedConflictCount: latest.conflicts.length,
  })
  await flushSync({ autoMergeAttempted: true })
  return { ...latest, files: latestFiles, resolved: true }
}

export function suspendKmlAccountSync (options = {}) {
  if (options.preserveDraft !== false && accountMode && accountCanWrite) {
    const hasPending = syncBlockedByConflict || pendingSyncOperations.length > 0 ||
      buildKmlSyncOperations(latestFiles, snapshots, pendingCreateDeletes).length > 0
    if (hasPending) persistCurrentDraft(options.reason || 'session-expired')
  }
  syncEpoch += 1
  accountMode = false
  accountCanWrite = false
  accountCanManageShares = false
  accountUserId = ''
  snapshots = new Map()
  unconfirmedCreateIds = new Set()
  pendingCreateDeletes = new Set()
  pendingSyncOperations = []
  latestFiles = []
  syncInFlight = false
  syncPending = false
  syncBlockedByConflict = false
  activeDraft = null
  pendingConflict = null
  embeddedAuthRequired = isEmbeddedDocument()
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = null
  dispatchSyncState(embeddedAuthRequired ? 'auth-required' : 'guest')
}

export function resetKmlAccountSync () {
  suspendKmlAccountSync({ preserveDraft: false })
}

export const resetKmlAccountSyncForTests = resetKmlAccountSync
