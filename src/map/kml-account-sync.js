import { apiRequest } from '../auth/api.js'
import { isEmbeddedDocument } from '../auth/embed-context.js'
import { hasPermission, refreshAuthSession } from '../auth/session.js'
import { showAlert } from '../ui/dialog.js'
import {
  applyKmlMergeChoices,
  mergeKmlDocument,
  mergeKmlFileSets,
} from './kml-conflict-merge.js'
import { getKmlAccountDraftStore } from './kml-account-draft-store.js'

let apiRequestForSync = apiRequest
let refreshAuthSessionForSync = refreshAuthSession

let accountMode = false
let accountCanWrite = false
let accountCanManageShares = false
let accountUserId = ''
let snapshots = new Map()
let unconfirmedCreateIds = new Set()
let pendingCreateDeletes = new Set()
// A file may only be moved to the recycle bin after an explicit user action.
// Keep this separate from create tombstones: the latter are idempotency
// bookkeeping for a local file that has not received a server id yet.
let pendingDeleteIntents = new Set()
let pendingDeletionIntent = ''
let pendingSyncOperations = []
let syncTimer = null
let syncInFlight = false
let syncPending = false
let syncBlockedByConflict = false
let latestFiles = []
let latestDirectories = { items: [], uncategorized: { id: null, name: '未分类', position: 0 } }
let syncEpoch = 0
let draftGeneration = 0
let activeDraft = null
let pendingConflict = null
let lifecycleBound = false
let latestSyncState = { state: 'guest', detail: {} }
let embeddedAuthRequired = false
let accountLoadReady = false
let latestDraftWrite = Promise.resolve(true)
let draftPersistenceQueue = Promise.resolve()
let workingFilesReplacementHandler = null
const accountDocumentLoads = new Map()
const KML_RECOVERY_STRATEGIES = new Set([
  'discard',
  'restore',
  'save-as-all',
  'reload-conflicts',
  'save-as-conflicts',
])
const KML_DELETION_INTENTS = new Set(['user-confirmed', 'user-confirmed-batch'])

function isValidKmlDeletionIntent (value) {
  return KML_DELETION_INTENTS.has(String(value || ''))
}

function normalizeDeletionIntent (value) {
  const intent = String(value || '')
  return isValidKmlDeletionIntent(intent) ? intent : ''
}

export function setKmlAccountApiForTests (request) {
  apiRequestForSync = request instanceof Function ? request : apiRequest
}

export function setKmlAccountAuthForTests (request) {
  refreshAuthSessionForSync = request instanceof Function ? request : refreshAuthSession
}

function cloneValue (value) {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function hasLoadedKmlContent (document) {
  return Boolean(document && document.contentLoaded !== false && Array.isArray(document.features))
}

function kmlDocumentSummary (document, options = {}) {
  const source = cloneValue(document || {})
  const existing = options.existing && String(options.existing.id || '') === String(source.id || '')
    ? options.existing
    : null
  const sameRevision = existing && Number(existing.revision || 0) === Number(source.revision || 0)
  if (sameRevision && hasLoadedKmlContent(existing)) {
    return {
      ...source,
      features: cloneValue(existing.features),
      featureCount: Number(source.featureCount ?? existing.featureCount ?? existing.features.length),
      contentLoaded: true,
      loadError: '',
    }
  }
  return {
    ...source,
    features: Array.isArray(source.features) ? cloneValue(source.features) : [],
    featureCount: Number(source.featureCount ?? source.features?.length ?? 0),
    contentLoaded: Array.isArray(source.features),
    loadError: '',
  }
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

const KML_SYNC_ACTION_LABELS = Object.freeze({
  create: '新建文件',
  update: '保存文件',
  trash: '移入回收站',
  restore: '从回收站恢复',
})

function syncErrorDetailSource (detail = {}) {
  return detail.details && typeof detail.details === 'object' && !Array.isArray(detail.details)
    ? detail.details
    : {}
}

export function formatKmlSyncErrorDetails (detail = {}) {
  const source = syncErrorDetailSource(detail)
  const phase = detail.phase === 'load' ? '加载' : '保存'
  const action = String(source.action || '')
  const actionLabel = KML_SYNC_ACTION_LABELS[action] || action
  const fileName = String(source.fileName || '')
  const fileId = String(source.kmlId || source.clientId || '')
  const errorCode = String(source.errorCode || detail.code || '')
  const reason = String(source.reason || detail.message || `${phase} KML 失败`)
  const suggestion = String(source.suggestion || '请刷新 KML 列表后重试；若问题持续，请联系管理员并提供错误码。')
  const lines = []
  if (fileName) lines.push(`文件：${fileName}`)
  else if (fileId) lines.push(`文件标识：${fileId}`)
  if (actionLabel) lines.push(`操作：${actionLabel}`)
  if (Number.isInteger(Number(source.operationIndex)) && Number(source.operationIndex) >= 0) {
    lines.push(`同步批次：第 ${Number(source.operationIndex) + 1} 项`)
  }
  if (errorCode) lines.push(`错误码：${errorCode}`)
  lines.push(`原因：${reason}`)
  if (suggestion) lines.push(`处理建议：${suggestion}`)

  const subject = fileName || fileId
  return {
    title: `KML ${phase}失败详情`,
    message: lines.join('\n'),
    tooltip: [subject, reason].filter(Boolean).join('：'),
  }
}

function renderSyncStatusElement (element, syncState = latestSyncState) {
  const view = getKmlSyncStatusView(syncState.state, syncState.detail)
  element.hidden = !view.visible
  element.replaceChildren()
  const label = document.createElement('span')
  label.className = 'kml-sync-status-label'
  label.textContent = view.label
  element.appendChild(label)
  const isError = syncState.state === 'error'
  if (isError) {
    const icon = document.createElement('span')
    icon.className = 'kml-sync-status-detail-icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = 'i'
    element.appendChild(icon)
  }
  element.dataset.state = view.tone
  const actionable = isError || syncState.state === 'conflict' || syncState.state === 'share-pending' || syncState.state === 'auth-required'
  element.dataset.actionable = actionable ? 'true' : 'false'
  const errorDetails = isError ? formatKmlSyncErrorDetails(syncState.detail) : null
  element.title = errorDetails?.tooltip || view.title
  element.setAttribute('aria-label', isError ? `${view.label}，查看详情` : view.label)
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
    if (latestSyncState.state === 'error') {
      const details = formatKmlSyncErrorDetails(latestSyncState.detail)
      showAlert(details.message, { title: details.title })
    }
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
    directoryId: file.directoryId == null || file.directoryId === '' ? null : String(file.directoryId),
    position: Number.isSafeInteger(Number(file.position)) && Number(file.position) >= 0
      ? Number(file.position)
      : 0,
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
    contentLoaded: hasLoadedKmlContent(document),
  }
}

function localKeyForDocument (document) {
  // Server IDs are the canonical identity for an account document.  The
  // syncClientId is only an idempotency key for create; using it as the
  // working-set key after the create response causes a false create+trash
  // pair on the next load.
  return String(document?.id || document?.serverId || document?.syncClientId || '')
}

function normalizedIdSet (values) {
  return new Set(Array.from(values || [], value => String(value || '')).filter(Boolean))
}

function idsForFiles (files) {
  return new Set((Array.isArray(files) ? files : [])
    .map(file => String(file?.id || ''))
    .filter(Boolean))
}

function combinedDeleteIds () {
  return new Set([...pendingCreateDeletes, ...pendingDeleteIntents])
}

function findSnapshotById (snapshotValues, id) {
  const normalizedId = String(id || '')
  if (!normalizedId) return null
  return snapshotValues.get(normalizedId) || [...snapshotValues.values()]
    .find(snapshot => String(snapshot?.serverId || '') === normalizedId) || null
}

function committedCreateLocalId (document, draftIds) {
  const serverId = String(document?.id || '')
  if (serverId && draftIds.has(serverId)) return serverId
  const syncClientId = String(document?.syncClientId || '')
  if (syncClientId && draftIds.has(syncClientId)) return syncClientId
  return ''
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
  const incoming = snapshotForDocument({ ...document, id: serverId }, normalizedLocalId)
  const current = next.get(normalizedLocalId)
  // Dedicated organization APIs and the general sync endpoint can resolve in
  // either order. A late response must never move the local base backwards.
  if (current && Number(incoming.revision || 0) < Number(current.revision || 0)) return next
  next.set(normalizedLocalId, incoming)
  return next
}

function normalizePendingSyncOperations (values = [], options = {}) {
  if (!Array.isArray(values)) return []
  const allowTrash = options.allowTrash !== false
  return values.slice(0, 100).flatMap((value) => {
    const action = String(value?.action || '')
    if (!['create', 'update', 'trash', 'restore'].includes(action)) return []
    if (action === 'trash' && !allowTrash) return []
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

function recoveryDeletionState (draft = {}) {
  const deletionIntent = normalizeDeletionIntent(draft?.deletionIntent)
  const rawPendingOperations = normalizePendingSyncOperations(draft?.pendingOperations)
  const rawDeletedClientIds = [...new Set((draft?.deletedClientIds || [])
    .map(id => String(id || ''))
    .filter(Boolean))]
  const rawDeletedFileIds = [...new Set((draft?.deletedFileIds || [])
    .map(id => String(id || ''))
    .filter(Boolean))]
  const rawTrashOperations = rawPendingOperations.filter(operation => operation.action === 'trash')
  if (deletionIntent) {
    return {
      deletionIntent,
      deletedClientIds: rawDeletedClientIds,
      deletedFileIds: rawDeletedFileIds,
      pendingOperations: rawPendingOperations,
      ignoredDeletionCount: 0,
    }
  }
  return {
    deletionIntent: '',
    deletedClientIds: [],
    deletedFileIds: [],
    pendingOperations: rawPendingOperations.filter(operation => operation.action !== 'trash'),
    ignoredDeletionCount: Math.max(
      Number(draft?.ignoredDeletionCount || 0),
      rawDeletedClientIds.length + rawDeletedFileIds.length + rawTrashOperations.length,
    ),
  }
}

function snapshotsWithCommittedCreates (serverFiles, draft) {
  const next = snapshotMap(draft?.snapshots)
  const draftIds = new Set([
    ...(draft?.files || []).map(file => String(file?.id || '')).filter(Boolean),
    ...(draft?.deletedClientIds || []).map(id => String(id || '')).filter(Boolean),
    ...(draft?.deletedFileIds || []).map(id => String(id || '')).filter(Boolean),
  ])
  const knownServerIds = new Set(Array.from(next.values(), snapshot => String(snapshot.serverId || '')))
  for (const document of serverFiles || []) {
    // A create response may arrive without its HTTP response reaching the
    // browser. In that recovery-only case syncClientId is the sole bridge to
    // the local draft; ordinary server lists always use the server id.
    const serverId = String(document?.id || '')
    if (!serverId || knownServerIds.has(serverId)) continue
    const localId = committedCreateLocalId(document, draftIds)
    if (!localId || next.has(localId)) continue
    next.set(localId, snapshotForDocument(document, localId))
    knownServerIds.add(serverId)
  }
  return next
}

export function buildKmlSyncOperations (files, currentSnapshots = snapshots, deletedClientIds = [], deletedFileIds = []) {
  const operations = []
  const defaultRestores = []
  const activeIds = new Set()
  const snapshotValues = snapshotMap(currentSnapshots)
  const sourceFiles = Array.isArray(files) ? files : []
  sourceFiles.forEach(file => {
    const localId = String(file.id || '')
    if (!localId) return
    activeIds.add(localId)
    const snapshot = snapshotValues.get(localId)
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
    } else if (!snapshot.serverId) {
      operations.push({ action: 'create', clientId: localId, data })
    } else if (file.contentLoaded === false || snapshot.contentLoaded === false) {
      // A list summary intentionally carries no features. Never serialize its
      // placeholder empty array as an update, otherwise a metadata-only edit
      // could erase the authoritative server content.
      return
    } else if (snapshot.hash !== hash) {
      operations.push({
        action: 'update',
        kmlId: snapshot.serverId,
        data: { ...data, revision: snapshot.revision },
      })
    }
  })
  const explicitDeletes = new Set()
  for (const deletedId of deletedClientIds || []) {
    explicitDeletes.add(String(deletedId || ''))
  }
  for (const deletedId of deletedFileIds || []) {
    explicitDeletes.add(String(deletedId || ''))
  }
  const deleteTargets = new Set()
  for (const deletedId of explicitDeletes) {
    const normalizedId = String(deletedId || '')
    if (!normalizedId || activeIds.has(normalizedId)) continue
    const snapshot = findSnapshotById(snapshotValues, normalizedId)
    if (snapshot?.status === 'trashed') continue
    const operation = snapshot?.serverId
      ? { action: 'trash', kmlId: snapshot.serverId }
      : { action: 'trash', clientId: normalizedId }
    const target = operation.kmlId ? `kml:${operation.kmlId}` : `client:${operation.clientId}`
    if (deleteTargets.has(target)) continue
    deleteTargets.add(target)
    operations.push(operation)
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

function deleteIntentIdsForSnapshot (snapshotValues, id) {
  const snapshot = findSnapshotById(snapshotValues, id)
  if (!snapshot) return [String(id || '')].filter(Boolean)
  return [...new Set([snapshot.localId, snapshot.serverId].map(value => String(value || '')).filter(Boolean))]
}

function addExplicitDeleteIntents (ids = [], options = {}) {
  const snapshotValues = snapshotMap(snapshots)
  for (const rawId of ids || []) {
    const id = String(rawId || '')
    if (!id) continue
    const snapshot = findSnapshotById(snapshotValues, id)
    const intentIds = deleteIntentIdsForSnapshot(snapshotValues, id)
    if (snapshot?.serverId) {
      intentIds.forEach(intentId => pendingDeleteIntents.add(intentId))
      pendingCreateDeletes.delete(snapshot.localId)
    } else {
      pendingCreateDeletes.add(id)
    }
  }
  const deletionIntent = normalizeDeletionIntent(options.deletionIntent)
  if (deletionIntent) pendingDeletionIntent = deletionIntent
}

function replaceDeleteIntentState (options = {}) {
  const deletionIntent = normalizeDeletionIntent(options.deletionIntent)
  pendingCreateDeletes = deletionIntent ? normalizedIdSet(options.deletedClientIds) : new Set()
  pendingDeleteIntents = deletionIntent ? normalizedIdSet(options.deletedFileIds) : new Set()
  pendingDeletionIntent = deletionIntent
}

function updateDeleteIntentState (files, options = {}) {
  const deletionIntent = normalizeDeletionIntent(options.deletionIntent)
  if (options.replaceDeleteIntents) {
    replaceDeleteIntentState({ ...options, deletionIntent })
  }
  if (deletionIntent) {
    const intentOptions = { ...options, deletionIntent }
    addExplicitDeleteIntents(options.deletedIds, intentOptions)
    if (Array.isArray(options.deletedClientIds) && !options.replaceDeleteIntents) {
      addExplicitDeleteIntents(options.deletedClientIds, intentOptions)
    }
    if (Array.isArray(options.deletedFileIds) && !options.replaceDeleteIntents) {
      addExplicitDeleteIntents(options.deletedFileIds, intentOptions)
    }
  }
  for (const id of idsForFiles(files)) removeExplicitDeleteIntents([id])
}

function removeExplicitDeleteIntents (ids = []) {
  const snapshotValues = snapshotMap(snapshots)
  for (const rawId of ids || []) {
    const id = String(rawId || '')
    if (!id) continue
    deleteIntentIdsForSnapshot(snapshotValues, id).forEach(intentId => {
      pendingDeleteIntents.delete(intentId)
      pendingCreateDeletes.delete(intentId)
    })
  }
  if (pendingDeleteIntents.size === 0 && pendingCreateDeletes.size === 0) pendingDeletionIntent = ''
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
        const before = nextSnapshots.get(localId)
        const incoming = snapshotForDocument(entry.document, localId)
        if (!before || Number(incoming.revision || 0) >= Number(before.revision || 0)) {
          nextSnapshots.set(localId, incoming)
          resolvedLocalIds.add(localId)
        }
      }
      continue
    }

    if (entry.action === 'update' && entry.document) {
      const previous = findByServerId(entry.document.id)
      const localId = String(previous?.localId || entry.document.id || '')
      if (localId) {
        const incoming = snapshotForDocument(entry.document, localId)
        const current = nextSnapshots.get(localId)
        if (!current || Number(incoming.revision || 0) >= Number(current.revision || 0)) {
          nextSnapshots.set(localId, incoming)
          resolvedLocalIds.add(localId)
        }
      }
      continue
    }

    if (entry.action === 'trash') {
      const serverId = entry.document?.id || entry.result?.id
      const previous = findByServerId(serverId)
      const localId = String(entry.clientId || previous?.localId || '')
      if (entry.document && localId) {
        const incoming = snapshotForDocument(entry.document, localId)
        const current = nextSnapshots.get(localId)
        if (!current || Number(incoming.revision || 0) >= Number(current.revision || 0)) {
          nextSnapshots.set(localId, incoming)
        }
      } else if (localId) {
        const current = nextSnapshots.get(localId)
        if (current && Number(current.revision || 0) > 0) continue
        nextSnapshots.set(localId, {
          localId,
          serverId: '',
          revision: 0,
          hash: '',
          status: 'trashed',
        })
      }
      if (localId && (!entry.document || !nextSnapshots.get(localId) || nextSnapshots.get(localId).revision === Number(entry.document.revision))) {
        resolvedLocalIds.add(localId)
      }
      continue
    }

    if (entry.action === 'restore') {
      const clientId = String(entry.clientId || '')
      const previous = entry.document ? findByServerId(entry.document.id) : null
      const localId = String(clientId || previous?.localId || entry.document?.id || '')
      if (entry.document && localId) {
        const incoming = snapshotForDocument(entry.document, localId)
        const current = nextSnapshots.get(localId)
        if (!current || Number(incoming.revision || 0) >= Number(current.revision || 0)) {
          nextSnapshots.set(localId, incoming)
        }
      } else if (clientId) {
        const current = nextSnapshots.get(localId)
        if (current && Number(current.revision || 0) > 0) continue
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

function documentRevision (document) {
  return Number(document?.revision || 0)
}

function localIdForOperation (operation, files, currentSnapshots) {
  if (operation?.clientId) return String(operation.clientId)
  const serverId = String(operation?.kmlId || '')
  if (!serverId) return ''
  return String([...snapshotMap(currentSnapshots).values()]
    .find(snapshot => String(snapshot.serverId || '') === serverId)?.localId ||
    files.find(file => String(file?.serverId || file?.id || '') === serverId)?.id || '')
}

function uncertainPresenceOperations (operations = []) {
  const compensated = []
  const seen = new Set()
  const add = operation => {
    if (!operation || !operation.action) return
    const target = operation.kmlId
      ? `kml:${operation.kmlId}`
      : `client:${operation.clientId || ''}`
    const key = `${operation.action}:${target}`
    if (seen.has(key)) return
    seen.add(key)
    compensated.push(operation)
  }

  for (const operation of operations) {
    const action = String(operation?.action || '')
    if (action !== 'trash' && action !== 'restore') continue
    const localId = localIdForOperation(operation, latestFiles, snapshots) ||
      String(operation?.clientId || operation?.kmlId || '')
    if (!localId) continue
    const fileExists = latestFiles.some(file => String(file?.id || '') === localId)
    const snapshot = findSnapshotById(snapshots, localId)
    const serverId = String(operation?.kmlId || snapshot?.serverId || '')
    const clientId = String(operation?.clientId || (!serverId ? localId : '') || '')
    const target = serverId ? { kmlId: serverId } : (clientId ? { clientId } : null)
    if (!target) continue

    if (fileExists) {
      // The user's latest intent is presence. Compensate an uncertain trash
      // (and keep restore idempotent when the server never trashed it).
      add({ action: 'restore', ...target })
      continue
    }

    // A missing file means the latest intent is deletion only when a valid
    // explicit marker is still present. Never resurrect implicit/legacy trash
    // merely because a transport request failed.
    const intentIds = new Set([
      localId,
      serverId,
      clientId,
    ].filter(Boolean))
    const hasDeleteIntent = [...intentIds].some(id =>
      pendingDeleteIntents.has(id) || pendingCreateDeletes.has(id)
    )
    if (hasDeleteIntent && isValidKmlDeletionIntent(pendingDeletionIntent)) {
      add({ action: 'trash', ...target })
    }
  }
  return compensated
}

function transportFieldsFromDocument (file, document) {
  if (!file || !document) return
  if (document.id) file.serverId = document.id
  if (document.revision !== undefined) file.revision = document.revision
  if (document.updatedAt !== undefined) file.updatedAt = document.updatedAt
  if (document.shareReferenceCount !== undefined) file.shareReferenceCount = Number(document.shareReferenceCount || 0)
  if (document.outdatedShareReferenceCount !== undefined) file.outdatedShareReferenceCount = Number(document.outdatedShareReferenceCount || 0)
  if (document.bounds !== undefined) file.bounds = cloneValue(document.bounds)
}

const KML_MERGE_FIELDS = [
  'name',
  'description',
  'isDefault',
  'coordCorrection',
  'theme',
  'color',
  'lockDrag',
  'enabled',
  'isLiveTrack',
  'directoryId',
  'position',
]

function completeKmlOrganizationDocument (document, fallback = {}) {
  const source = document && typeof document === 'object' ? document : {}
  const fallbackData = serializableKml(fallback)
  const completed = {}
  KML_MERGE_FIELDS.forEach(field => {
    completed[field] = Object.hasOwn(source, field)
      ? cloneValue(source[field])
      : cloneValue(fallbackData[field])
  })
  completed.features = Array.isArray(source.features)
    ? cloneValue(source.features)
    : cloneValue(fallbackData.features)
  return completed
}

/**
 * Rebase only fields that were not edited while the request was in flight.
 * The API intentionally normalizes text, colors and feature graphs, so
 * absorbing its canonical values prevents the next save from re-submitting
 * the same logical change forever without erasing a newer local edit.
 */
export function rebaseKmlFileToServerDocument (file, submitted, document) {
  if (!file || !submitted || !document) return file
  const submittedData = serializableKml(submitted)
  const currentData = serializableKml(file)
  const canonicalData = serializableKml(document)
  const merged = mergeKmlDocument(submittedData, currentData, canonicalData, { path: 'file' }).file
  Object.assign(file, merged)
  transportFieldsFromDocument(file, document)
  return file
}

/**
 * Merge a response from a metadata/organization endpoint into the current
 * working file. Those endpoints return a fresh document revision while an
 * editor may still have unsaved content changes. The last acknowledged
 * snapshot is the merge base; local edits win on an unresolved conflict so a
 * directory move or visibility toggle cannot erase work in progress.
 */
export function mergeKmlAccountOrganizationDocument (localFile, snapshot, document) {
  if (!document || typeof document !== 'object') return localFile
  if (!localFile || typeof localFile !== 'object') return cloneValue(document)
  const local = cloneValue(localFile)
  const base = snapshot?.base && typeof snapshot.base === 'object'
    ? snapshot.base
    : serializableKml(local)
  const server = completeKmlOrganizationDocument(document, {
    ...base,
    ...local,
  })
  const merged = mergeKmlDocument(
    base,
    serializableKml(local),
    server,
    { path: 'file' },
  ).file
  // Server response metadata (id, revision, status, directoryName, counters)
  // is authoritative; merged serializable fields retain unsaved local edits.
  return { ...local, ...cloneValue(document), ...merged }
}

export function buildKmlRecoveryDraft (userId, files, currentSnapshots, options = {}) {
  const deletionIntent = normalizeDeletionIntent(options.deletionIntent)
  const draft = {
    version: 2,
    userId: String(userId || ''),
    generation: Math.max(1, Number(options.generation || 1)),
    reason: String(options.reason || 'dirty'),
    updatedAt: options.updatedAt || new Date().toISOString(),
    files: cloneValue(Array.isArray(files) ? files : []),
    snapshots: Array.from(snapshotMap(currentSnapshots).values(), value => cloneValue(value)),
    deletedClientIds: deletionIntent
      ? [...new Set(Array.from(options.deletedClientIds || [], id => String(id || '')).filter(Boolean))]
      : [],
    deletedFileIds: deletionIntent
      ? [...new Set(Array.from(options.deletedFileIds || [], id => String(id || '')).filter(Boolean))]
      : [],
    pendingOperations: normalizePendingSyncOperations(options.pendingOperations, { allowTrash: Boolean(deletionIntent) }),
  }
  if (deletionIntent) draft.deletionIntent = deletionIntent
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
    deletedFileIds: value.deletedFileIds,
    pendingOperations: value.pendingOperations,
    deletionIntent: value.deletionIntent,
    conflictSession: value.conflictSession,
  })
  if (value.incompleteWrite) {
    normalized.incompleteWrite = true
    normalized.storageGeneration = Math.max(
      Number(value.storageGeneration || 0),
      Number(value.generation || 0)
    )
  }
  const ignoredDeletionCount = recoveryDeletionState(value).ignoredDeletionCount
  if (ignoredDeletionCount > 0) normalized.ignoredDeletionCount = ignoredDeletionCount
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
  const deletionState = recoveryDeletionState(draft)
  const normalizedDraft = {
    ...(draft || {}),
    deletedClientIds: deletionState.deletedClientIds,
    deletedFileIds: deletionState.deletedFileIds,
    pendingOperations: deletionState.pendingOperations,
    deletionIntent: deletionState.deletionIntent,
  }
  const draftSnapshots = snapshotsWithCommittedCreates(serverFiles, normalizedDraft)
  const operations = buildKmlSyncOperations(
    normalizedDraft.files || [],
    draftSnapshots,
    deletionState.deletedClientIds,
    deletionState.deletedFileIds,
  )
  const pendingOperations = deletionState.pendingOperations
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
    ignoredDeletionCount: deletionState.ignoredDeletionCount,
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

function recoveryDraftForServer (serverFiles, draft) {
  const deletionState = recoveryDeletionState(draft)
  const normalized = {
    ...(draft || {}),
    deletedClientIds: deletionState.deletedClientIds,
    deletedFileIds: deletionState.deletedFileIds,
    pendingOperations: deletionState.pendingOperations,
    deletionIntent: deletionState.deletionIntent,
  }
  const draftSnapshots = snapshotsWithCommittedCreates(serverFiles, normalized)
  if (!deletionState.ignoredDeletionCount) {
    return { draft: normalized, snapshots: draftSnapshots }
  }
  const files = cloneValue(Array.isArray(normalized.files) ? normalized.files : [])
  const presentIds = new Set(files.map(file => String(file?.id || '')).filter(Boolean))
  for (const snapshot of draftSnapshots.values()) {
    const localId = String(snapshot?.localId || '')
    const serverId = String(snapshot?.serverId || '')
    if (!localId || presentIds.has(localId) || !serverId) continue
    const serverFile = (serverFiles || []).find(file => String(file?.id || '') === serverId)
    if (!serverFile || serverFile.status === 'trashed') continue
    files.push({ ...cloneValue(serverFile), id: localId, serverId })
    presentIds.add(localId)
  }
  return {
    draft: { ...normalized, files, ignoredDeletionCount: deletionState.ignoredDeletionCount },
    snapshots: draftSnapshots,
  }
}

export function buildKmlRecoveryResolution (serverFiles, draft, strategy, options = {}) {
  if (!KML_RECOVERY_STRATEGIES.has(strategy)) throw new Error('KML 恢复处理方式无效')
  const safeRecovery = recoveryDraftForServer(serverFiles, draft)
  const normalizedDraft = safeRecovery.draft
  const analysis = analyzeKmlRecoveryDraft(serverFiles, normalizedDraft)
  const draftFiles = cloneValue(normalizedDraft?.files || [])
  const draftById = new Map(draftFiles.map(file => [String(file.id || ''), file]))
  const draftSnapshots = safeRecovery.snapshots
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
  const draftDeletedClientIds = [...new Set((normalizedDraft.deletedClientIds || [])
    .map(id => String(id || ''))
    .filter(Boolean))]
  const draftDeletedFileIds = [...new Set((normalizedDraft.deletedFileIds || [])
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
      deletedFileIds: [],
      deletionIntent: '',
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
      deletedFileIds: [],
      deletionIntent: '',
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
  const deletedFileIds = draftDeletedFileIds.filter(id => !activeIds.has(id))
  return {
    files,
    snapshots: snapshotList(nextSnapshots),
    analysis,
    copiedCount: copies.length,
    shouldSync: !analysis.conflictedLocalIds.length || strategy !== 'restore'
      ? replayPendingOperations.length > 0 || buildKmlSyncOperations(files, nextSnapshots, deletedClientIds, deletedFileIds).length > 0
      : false,
    blockedByConflict: strategy === 'restore' && analysis.conflictedLocalIds.length > 0,
    deletedClientIds,
    deletedFileIds,
    deletionIntent: deletedClientIds.length || deletedFileIds.length
      ? normalizedDraft.deletionIntent
      : '',
    pendingOperations: replayPendingOperations,
  }
}

function validateAccountDocumentDetail (document, id) {
  if (!document || typeof document !== 'object' || String(document.id || '') !== String(id || '') || !Array.isArray(document.features)) {
    throw Object.assign(new Error('KML 文件详情不完整，已停止同步'), { code: 'KML_DETAILS_INCOMPLETE' })
  }
  return {
    ...cloneValue(document),
    features: cloneValue(document.features),
    featureCount: Number(document.featureCount ?? document.features.length),
    contentLoaded: true,
    loadError: '',
  }
}

async function requestAccountDocumentDetail (id) {
  const document = await apiRequestForSync(`/kml/files/${encodeURIComponent(id)}`)
  return validateAccountDocumentDetail(document, id)
}

async function loadDocuments (items, concurrency = 4) {
  if (!Array.isArray(items)) throw Object.assign(new Error('KML 文件清单格式不正确'), { code: 'KML_LIST_INVALID' })
  if (items.some(item => !item || typeof item !== 'object' || !String(item.id || ''))) {
    throw Object.assign(new Error('KML 文件清单包含无效文件'), { code: 'KML_LIST_INVALID' })
  }
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker () {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await requestAccountDocumentDetail(items[index].id)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

async function loadAllAccountDocuments (options = {}) {
  const status = ['active', 'trashed', 'all'].includes(String(options.status || 'active'))
    ? String(options.status || 'active')
    : 'active'
  const items = []
  let page = 1
  let usage = null
  let expectedTotal = null
  while (page <= 100) {
    const list = await apiRequestForSync('/kml/files', {
      query: { page, limit: 100, status },
    })
    if (!list || typeof list !== 'object' || !Array.isArray(list.items)) {
      throw Object.assign(new Error('KML 文件列表响应不完整，已停止同步'), { code: 'KML_LIST_INCOMPLETE' })
    }
    const total = Number(list.total)
    if (!Number.isSafeInteger(total) || total < 0) {
      throw Object.assign(new Error('KML 文件总数响应不正确，已停止同步'), { code: 'KML_LIST_INCOMPLETE' })
    }
    if (expectedTotal === null) expectedTotal = total
    if (total !== expectedTotal) {
      throw Object.assign(new Error('KML 文件列表在加载期间发生变化，已停止同步'), { code: 'KML_LIST_CHANGED' })
    }
    const pageItems = list.items
    if (pageItems.some(item => !item || typeof item !== 'object' || !String(item.id || ''))) {
      throw Object.assign(new Error('KML 文件列表包含无效文件，已停止同步'), { code: 'KML_LIST_INCOMPLETE' })
    }
    items.push(...pageItems)
    usage = list?.usage || usage
    if (items.length > total) {
      throw Object.assign(new Error('KML 文件列表数量超过服务端总数，已停止同步'), { code: 'KML_LIST_INCOMPLETE' })
    }
    if (items.length >= expectedTotal) break
    if (!pageItems.length || pageItems.length < 100) {
      throw Object.assign(new Error('KML 文件列表分页不完整，已停止同步'), { code: 'KML_LIST_INCOMPLETE' })
    }
    page += 1
  }
  if (expectedTotal === null || items.length !== expectedTotal) {
    throw Object.assign(new Error('KML 文件列表分页不完整，已停止同步'), { code: 'KML_LIST_INCOMPLETE' })
  }
  const existingById = new Map((options.existingFiles || [])
    .map(file => [String(file?.id || ''), file])
    .filter(([id]) => id))
  const summaries = items.map(item => kmlDocumentSummary(item, {
    existing: existingById.get(String(item.id || '')),
  }))
  const indexesToLoad = []
  const loadDetails = options.loadDetails !== false
  summaries.forEach((document, index) => {
    const shouldLoad = loadDetails && (options.loadHidden === true || document.isDefault === true || document.enabled !== false)
    if (!shouldLoad || document.contentLoaded === true) return
    if (Object.hasOwn(items[index], 'featureCount') && Number(document.featureCount || 0) === 0) {
      document.contentLoaded = true
      return
    }
    indexesToLoad.push(index)
  })
  if (indexesToLoad.length) {
    const details = await loadDocuments(indexesToLoad.map(index => summaries[index]))
    indexesToLoad.forEach((summaryIndex, detailIndex) => {
      summaries[summaryIndex] = details[detailIndex]
    })
  }
  return { files: summaries, usage }
}

async function loadKmlDirectories () {
  const result = await apiRequestForSync('/kml/directories')
  if (!result || typeof result !== 'object' || !Array.isArray(result.items)) {
    throw Object.assign(new Error('KML 目录列表响应不完整，已停止同步'), { code: 'KML_DIRECTORY_LIST_INCOMPLETE' })
  }
  return {
    items: result.items,
    uncategorized: result?.uncategorized || { id: null, name: '未分类', position: 0 },
  }
}

export async function loadKmlAccountDocumentsForTests (options = {}) {
  return loadAllAccountDocuments(options)
}

export async function loadKmlAccountDocument (fileOrId) {
  if (!accountMode || !accountLoadReady) {
    throw Object.assign(new Error('账号 KML 尚未完成加载'), { code: 'KML_ACCOUNT_NOT_READY' })
  }
  const requestedFile = fileOrId && typeof fileOrId === 'object' ? fileOrId : null
  const id = String(requestedFile?.id || fileOrId || '')
  if (!id) throw Object.assign(new Error('KML 文件标识无效'), { code: 'KML_ID_INVALID' })
  const current = latestFiles.find(file => String(file?.id || '') === id)
  const target = requestedFile || current
  if (!target) throw Object.assign(new Error('KML 文件不存在'), { code: 'RESOURCE_NOT_FOUND' })
  if (hasLoadedKmlContent(target)) return target

  const requestEpoch = syncEpoch
  const requestUserId = accountUserId
  let pending = accountDocumentLoads.get(id)
  if (!pending) {
    pending = (async () => {
      const detail = await requestAccountDocumentDetail(id)
      if (!accountMode || !accountLoadReady || requestEpoch !== syncEpoch || requestUserId !== accountUserId) {
        throw Object.assign(new Error('账号会话已变化，请重新加载 KML'), { code: 'KML_ACCOUNT_CHANGED' })
      }
      const working = latestFiles.find(file => String(file?.id || '') === id)
      if (!working) throw Object.assign(new Error('KML 文件不存在'), { code: 'RESOURCE_NOT_FOUND' })
      if (Number(detail.revision || 0) < Number(working.revision || 0)) {
        throw Object.assign(new Error('KML 文件详情已过期，请重试加载'), { code: 'KML_DETAILS_STALE' })
      }
      const loaded = {
        ...cloneValue(working),
        ...detail,
        features: cloneValue(detail.features),
        featureCount: Number(detail.featureCount ?? detail.features.length),
        contentLoaded: true,
        loadError: '',
      }
      Object.assign(working, cloneValue(loaded))
      snapshots = registerKmlAccountDocumentSnapshot(snapshots, loaded, id)
      return working
    })()
    accountDocumentLoads.set(id, pending)
    pending.finally(() => {
      if (accountDocumentLoads.get(id) === pending) accountDocumentLoads.delete(id)
    }).catch(() => {})
  }

  try {
    const loaded = await pending
    if (target !== loaded) Object.assign(target, cloneValue(loaded))
    return target
  } catch (error) {
    const message = error?.message || 'KML 文件详情加载失败'
    const internal = latestFiles.find(file => String(file?.id || '') === id)
    if (internal) internal.loadError = message
    target.loadError = message
    target.contentLoaded = false
    throw error
  }
}

function rebaseSnapshotsToServer (serverFiles, currentSnapshots = snapshots) {
  const rebased = snapshotsForServerFiles(serverFiles, currentSnapshots)
  snapshotMap(currentSnapshots).forEach(item => {
    if (!item.serverId) rebased.set(item.localId, cloneValue(item))
  })
  return rebased
}

export function mergeKmlRecoveryDraft (draft, serverFiles, options = {}) {
  const safeRecovery = recoveryDraftForServer(serverFiles, draft)
  const safeDraft = safeRecovery.draft
  const legacy = Number(safeDraft?.legacyVersion || safeDraft?.version || 0) < 2 ||
    (safeDraft?.snapshots || []).some(snapshot => snapshot?.serverId && snapshot?.base == null)
  if (legacy) {
    return {
      files: cloneValue(safeDraft?.files || []),
      conflicts: [],
      autoMergedCount: 0,
      conflictSummary: { total: 0, files: 0, fields: 0, features: 0, resources: 0, orders: 0 },
      serverFiles: cloneValue(serverFiles || []),
      usage: options.usage || null,
      draft: cloneValue(safeDraft),
      legacy: true,
      supported: false,
    }
  }
  const merge = mergeKmlFileSets(safeDraft?.files || [], serverFiles, safeDraft?.snapshots || [])
  return {
    ...merge,
    ...(safeDraft?.conflictSession?.retryExhausted ? { retryExhausted: true } : {}),
    serverFiles: cloneValue(serverFiles || []),
    usage: options.usage || null,
    draft: cloneValue(safeDraft),
  }
}

async function prepareKmlConflictMerge (draft, options = {}) {
  const loaded = options.loaded || await loadAllAccountDocuments({ status: 'all', loadHidden: true })
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
  replaceDeleteIntentState({
    deletedClientIds: (draft?.deletedClientIds || []).filter(id => (
      !latestFiles.some(file => String(file?.id || '') === String(id || ''))
    )),
    deletedFileIds: (draft?.deletedFileIds || []).filter(id => (
      !latestFiles.some(file => String(file?.id || '') === String(id || ''))
    )),
    deletionIntent: draft?.deletionIntent,
  })
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
    const localId = previous?.localId || localKeyForDocument(document)
    next.set(localId, snapshotForDocument(document, localId))
  })
  return next
}

function trackUnconfirmedCreates (files) {
  const activeIds = new Set((files || []).map(file => String(file?.id || '')).filter(Boolean))
  activeIds.forEach(localId => removeExplicitDeleteIntents([localId]))
  activeIds.forEach((localId) => {
    pendingCreateDeletes.delete(localId)
    if (snapshots.has(localId)) unconfirmedCreateIds.delete(localId)
    else unconfirmedCreateIds.add(localId)
  })
  for (const localId of unconfirmedCreateIds) {
    if (activeIds.has(localId)) continue
    unconfirmedCreateIds.delete(localId)
  }
}

function freshKmlClientId () {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `kml-${random}`
}

function rotateRejectedCreateIds (operations = [], rejectedClientId = '') {
  const createOperations = operations.filter(operation => operation?.action === 'create' && operation.clientId)
  const targetId = String(rejectedClientId || '')
  const targets = targetId
    ? createOperations.filter(operation => String(operation.clientId) === targetId)
    : (createOperations.length === 1 ? createOperations : [])
  if (targets.length !== 1) return false
  const replacements = new Map()
  targets.forEach(operation => {
    const oldId = String(operation.clientId)
    let nextId = freshKmlClientId()
    while (replacements.has(nextId) || latestFiles.some(file => String(file?.id || '') === nextId)) {
      nextId = freshKmlClientId()
    }
    replacements.set(oldId, nextId)
  })
  latestFiles.forEach(file => {
    const oldId = String(file?.id || '')
    const nextId = replacements.get(oldId)
    if (!nextId) return
    file.id = nextId
    // A rejected create has no authoritative server identity. Remove stale
    // transport fields so the next operation is a fresh create.
    delete file.serverId
    delete file.revision
    delete file.updatedAt
  })
  replacements.forEach((nextId, oldId) => {
    const snapshot = snapshots.get(oldId)
    if (snapshot) {
      snapshots.delete(oldId)
      snapshots.set(nextId, { ...cloneValue(snapshot), localId: nextId, serverId: '' })
    }
    if (pendingCreateDeletes.has(oldId)) {
      pendingCreateDeletes.delete(oldId)
      pendingCreateDeletes.add(nextId)
    }
    if (pendingDeleteIntents.has(oldId)) {
      pendingDeleteIntents.delete(oldId)
      pendingDeleteIntents.add(nextId)
    }
  })
  return true
}

function queueDraftPersistence (operation) {
  const task = draftPersistenceQueue.then(operation, operation)
  draftPersistenceQueue = task.catch(() => {})
  return task
}

function persistCurrentDraft (reason = 'dirty') {
  if (!accountMode || !accountCanWrite || !accountUserId) return null
  draftGeneration += 1
  const draft = buildKmlRecoveryDraft(accountUserId, latestFiles, snapshots, {
    generation: draftGeneration,
    reason,
    deletedClientIds: pendingCreateDeletes,
    deletedFileIds: pendingDeleteIntents,
    pendingOperations: pendingSyncOperations,
    deletionIntent: pendingDeletionIntent,
    conflictSession: pendingConflict?.merge,
  })
  activeDraft = draft
  if (syncBlockedByConflict) pendingConflict = { ...(pendingConflict || {}), draft: cloneValue(draft) }
  const persistence = queueDraftPersistence(() => getKmlAccountDraftStore().put(draft))
  latestDraftWrite = persistence.then(
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
  const persistence = queueDraftPersistence(() => getKmlAccountDraftStore().delete(accountUserId, {
    generation: draftGeneration,
  }))
  latestDraftWrite = persistence.then(() => true, () => false)
}

function bindDraftLifecycle () {
  if (lifecycleBound || typeof window === 'undefined') return
  lifecycleBound = true
  const preserve = reason => {
    if (!accountMode || !accountCanWrite) return
    const hasPending = syncBlockedByConflict || pendingSyncOperations.length > 0 ||
      buildKmlSyncOperations(latestFiles, snapshots, pendingCreateDeletes, pendingDeleteIntents).length > 0
    if (hasPending) persistCurrentDraft(reason)
  }
  window.addEventListener('pagehide', () => preserve('pagehide'))
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') preserve('pagehide')
    })
  }
}

export async function initializeKmlAccountMode (options = {}) {
  const initializationEpoch = ++syncEpoch
  const previousState = {
    accountMode,
    accountCanWrite,
    accountCanManageShares,
    accountUserId,
    snapshots,
    unconfirmedCreateIds,
    pendingCreateDeletes,
    pendingDeleteIntents,
    pendingDeletionIntent,
    pendingSyncOperations,
    latestFiles,
    latestDirectories,
    syncPending,
    syncBlockedByConflict,
    activeDraft,
    pendingConflict,
    embeddedAuthRequired,
    accountLoadReady,
  }
  accountMode = false
  accountCanWrite = false
  accountCanManageShares = false
  accountUserId = ''
  snapshots = new Map()
  unconfirmedCreateIds = new Set()
  pendingCreateDeletes = new Set()
  pendingDeleteIntents = new Set()
  pendingDeletionIntent = ''
  pendingSyncOperations = []
  latestFiles = []
  latestDirectories = { items: [], uncategorized: { id: null, name: '未分类', position: 0 } }
  syncInFlight = false
  syncPending = false
  syncBlockedByConflict = false
  activeDraft = null
  pendingConflict = null
  embeddedAuthRequired = false
  accountLoadReady = false
  accountDocumentLoads.clear()
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = null
  bindDraftLifecycle()

  let auth
  try {
    auth = await refreshAuthSessionForSync()
  } catch (error) {
    if (initializationEpoch !== syncEpoch) return { mode: 'guest', files: [] }
    if (previousState.accountMode) {
      accountMode = previousState.accountMode
      accountCanWrite = false
      accountCanManageShares = false
      accountUserId = previousState.accountUserId
      snapshots = previousState.snapshots
      unconfirmedCreateIds = previousState.unconfirmedCreateIds
      pendingCreateDeletes = previousState.pendingCreateDeletes
      pendingDeleteIntents = previousState.pendingDeleteIntents
      pendingDeletionIntent = previousState.pendingDeletionIntent
      pendingSyncOperations = previousState.pendingSyncOperations
      latestFiles = previousState.latestFiles
      latestDirectories = previousState.latestDirectories
      syncPending = false
      syncBlockedByConflict = previousState.syncBlockedByConflict
      activeDraft = previousState.activeDraft
      pendingConflict = previousState.pendingConflict
      embeddedAuthRequired = previousState.embeddedAuthRequired
      accountLoadReady = false
    } else {
      // Authentication state is unknown. Stay out of guest mode so a transient
      // session failure cannot load or overwrite browser-local KML.
      accountMode = true
      accountCanWrite = false
      accountCanManageShares = false
      accountUserId = ''
      accountLoadReady = false
    }
    dispatchSyncState('error', { phase: 'load', code: error.code, message: error.message })
    return {
      mode: 'account',
      files: latestFiles,
      directories: cloneValue(latestDirectories),
      canWrite: accountCanWrite && accountLoadReady,
      userId: accountUserId,
      error,
    }
  }
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
    let [loaded, directories] = await Promise.all([
      loadAllAccountDocuments({
        existingFiles: previousState.accountUserId === accountUserId ? previousState.latestFiles : [],
        loadDetails: options.loadDetails !== false,
      }),
      loadKmlDirectories(),
    ])
    if (!accountMode || initializationEpoch !== syncEpoch) return { mode: 'guest', files: [] }
    latestFiles = loaded.files
    latestDirectories = directories
    snapshots = snapshotsForServerFiles(loaded.files)
    accountLoadReady = true
    let recovery = null
    let recoveryError = null
    if (accountCanWrite && accountUserId) {
      try {
        const storedRecord = await getKmlAccountDraftStore().get(accountUserId, { includeDeleted: true })
        draftGeneration = Math.max(draftGeneration, storedRecoveryGeneration(storedRecord))
        const stored = normalizeRecoveryDraft(storedRecord, accountUserId)
        if (stored) {
          loaded = await loadAllAccountDocuments({ loadHidden: true })
          latestFiles = loaded.files
          snapshots = snapshotsForServerFiles(loaded.files)
        }
        const analysis = stored ? analyzeKmlRecoveryDraft(loaded.files, stored) : null
        if (stored && (analysis?.hasChanges || stored.incompleteWrite)) {
          activeDraft = stored
          draftGeneration = Math.max(draftGeneration, storedRecoveryGeneration(stored))
          recovery = { draft: stored, analysis }
          if ((analysis?.conflictedLocalIds?.length || stored.conflictSession?.retryExhausted) && !stored.legacyVersion) {
            const mergeLoaded = await loadAllAccountDocuments({ status: 'all', loadHidden: true })
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
      directories: cloneValue(latestDirectories),
      usage: loaded.usage || null,
      canWrite: accountCanWrite && accountLoadReady,
      userId: accountUserId,
      recovery,
      recoveryError,
    }
  } catch (error) {
    if (!accountMode || initializationEpoch !== syncEpoch) return { mode: 'guest', files: [] }
    const sameAccount = previousState.accountMode && previousState.accountUserId &&
      previousState.accountUserId === accountUserId
    if (sameAccount) {
      accountMode = previousState.accountMode
      accountCanWrite = previousState.accountCanWrite
      accountCanManageShares = previousState.accountCanManageShares
      snapshots = previousState.snapshots
      unconfirmedCreateIds = previousState.unconfirmedCreateIds
      pendingCreateDeletes = previousState.pendingCreateDeletes
      pendingDeleteIntents = previousState.pendingDeleteIntents
      pendingDeletionIntent = previousState.pendingDeletionIntent
      pendingSyncOperations = previousState.pendingSyncOperations
      latestFiles = previousState.latestFiles
      latestDirectories = previousState.latestDirectories
      syncPending = previousState.syncPending
      syncBlockedByConflict = previousState.syncBlockedByConflict
      activeDraft = previousState.activeDraft
      pendingConflict = previousState.pendingConflict
      embeddedAuthRequired = previousState.embeddedAuthRequired
      accountLoadReady = previousState.accountLoadReady
    } else {
      // Never expose or save the previous account's working set under a new
      // user. Wait for a complete reload before enabling account writes.
      latestFiles = []
      latestDirectories = { items: [], uncategorized: { id: null, name: '未分类', position: 0 } }
      snapshots = new Map()
      unconfirmedCreateIds = new Set()
      pendingCreateDeletes = new Set()
      pendingDeleteIntents = new Set()
      pendingDeletionIntent = ''
      pendingSyncOperations = []
      syncPending = false
      syncBlockedByConflict = false
      activeDraft = null
      pendingConflict = null
      accountLoadReady = false
    }
    dispatchSyncState('error', { phase: 'load', code: error.code, message: error.message })
    return {
      mode: 'account',
      files: latestFiles,
      directories: cloneValue(latestDirectories),
      canWrite: accountCanWrite && accountLoadReady,
      userId: accountUserId,
      error,
    }
  }
}

export function isAccountKmlMode () {
  return accountMode
}

export function isEmbeddedKmlAuthRequired () {
  return embeddedAuthRequired
}

export function isAccountKmlWritable () {
  return accountMode && accountCanWrite && accountLoadReady
}

export function getKmlAccountDirectories () {
  return cloneValue(latestDirectories)
}

export async function refreshKmlAccountDirectories () {
  if (!accountMode || !accountLoadReady) return getKmlAccountDirectories()
  const requestEpoch = syncEpoch
  const requestUserId = accountUserId
  const refreshed = await loadKmlDirectories()
  if (!accountMode || !accountLoadReady || requestEpoch !== syncEpoch || requestUserId !== accountUserId) {
    return getKmlAccountDirectories()
  }
  latestDirectories = refreshed
  return getKmlAccountDirectories()
}

export function registerKmlAccountDocument (document, options = {}) {
  if (!accountMode || !accountCanWrite || !accountLoadReady || !document || typeof document !== 'object') return false
  const localId = String(options.localId || document.id || '')
  const serverId = String(document.id || document.serverId || '')
  if (!localId || !serverId) return false
  const currentSnapshot = snapshots.get(localId)
  if (currentSnapshot && documentRevision(document) < documentRevision(currentSnapshot)) return false

  const currentFile = options.localFile || latestFiles.find(file => String(file?.id || '') === localId)
  const contentLoaded = Array.isArray(document.features) || hasLoadedKmlContent(currentFile) || currentSnapshot?.contentLoaded === true
  const serverDocument = completeKmlOrganizationDocument(document, currentSnapshot?.base || currentFile || {})
  const mergedDocument = currentFile
    ? mergeKmlAccountOrganizationDocument(currentFile, currentSnapshot, { ...document, ...serverDocument, id: serverId })
    : { ...cloneValue(document), ...serverDocument }
  mergedDocument.contentLoaded = contentLoaded
  mergedDocument.featureCount = Number(document.featureCount ?? currentFile?.featureCount ?? mergedDocument.features?.length ?? 0)
  if (!contentLoaded) mergedDocument.features = []

  snapshots = registerKmlAccountDocumentSnapshot(snapshots, {
    ...document,
    ...serverDocument,
    id: serverId,
    contentLoaded,
    ...(contentLoaded ? {} : { features: [] }),
  }, localId)
  unconfirmedCreateIds.delete(localId)
  pendingCreateDeletes.delete(localId)
  pendingSyncOperations = pendingSyncOperations.filter(operation => (
    operation.action !== 'create' || String(operation.clientId || '') !== localId
  ))

  const workingIndex = latestFiles.findIndex(file => String(file?.id || '') === localId)
  if (workingIndex >= 0) latestFiles.splice(workingIndex, 1, mergedDocument)
  else latestFiles = [...latestFiles, mergedDocument]
  if (options.localFile && options.localFile !== mergedDocument) {
    Object.assign(options.localFile, cloneValue(mergedDocument))
  }
  return true
}

function applySyncResult (result, files, operations = []) {
  const operationResults = result?.results || []
  const reduced = reduceKmlSyncResult(snapshots, result)
  const beforeSnapshots = snapshots
  snapshots = reduced.snapshots
  reduced.resolvedLocalIds.forEach((localId) => {
    unconfirmedCreateIds.delete(localId)
    if (files.some(candidate => String(candidate?.id || '') === localId)) {
      pendingCreateDeletes.delete(localId)
    }
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

  operationResults.forEach((entry, index) => {
    const operation = operations[index]
    const localId = localIdForOperation(operation, files, beforeSnapshots)
    if (entry.action === 'trash') {
      deleteIntentIdsForSnapshot(beforeSnapshots, localId || operation?.kmlId || operation?.clientId)
        .forEach(id => pendingDeleteIntents.delete(id))
      if (!entry.document && operation?.clientId) pendingCreateDeletes.delete(String(operation.clientId))
    }
    if (!entry.document) return
    const file = files.find(candidate => String(candidate?.id || '') === localId)
    if (!file) return
    const currentSnapshot = snapshots.get(localId)
    if (currentSnapshot && documentRevision(entry.document) < documentRevision(currentSnapshot)) return
    if (entry.action === 'create' || entry.action === 'update') {
      rebaseKmlFileToServerDocument(file, operation?.data || file, entry.document)
    } else {
      transportFieldsFromDocument(file, entry.document)
    }
  })
}

function syncResultIdentity (entry, operation) {
  if (!entry || typeof entry !== 'object' || entry.action !== operation?.action) return false
  const action = String(operation?.action || '')
  if (action === 'create') {
    return String(entry.clientId || '') === String(operation.clientId || '') &&
      entry.document && typeof entry.document === 'object' && String(entry.document.id || '') !== ''
  }
  if (action === 'update') {
    return String(entry.document?.id || '') === String(operation.kmlId || '') &&
      entry.document && typeof entry.document === 'object'
  }
  if (action === 'trash' || action === 'restore') {
    const expectedKmlId = String(operation.kmlId || '')
    const expectedClientId = String(operation.clientId || '')
    const entryKmlId = String(entry.document?.id || entry.result?.id || '')
    const entryClientId = String(entry.clientId || '')
    if (expectedKmlId) return entryKmlId === expectedKmlId
    return entryClientId === expectedClientId && (
      (entry.result && entry.result.status === 'absent') ||
      (entry.document && typeof entry.document === 'object' && String(entry.document.id || '') !== '')
    )
  }
  return false
}

export function validateKmlSyncResponse (result, operations) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.results) ||
      result.results.length !== operations.length ||
      result.results.some((entry, index) => !syncResultIdentity(entry, operations[index]))) {
    throw Object.assign(new Error('服务器同步响应不完整，待保存内容已保留，请稍后重试'), {
      code: 'KML_SYNC_RESPONSE_INCOMPLETE',
    })
  }
  return result
}

async function flushSync (options = {}) {
  if (!accountMode || !accountCanWrite || !accountLoadReady || syncBlockedByConflict) return
  if (syncInFlight) {
    syncPending = true
    return
  }
  const queuedOperations = normalizePendingSyncOperations(pendingSyncOperations)
  let operations = queuedOperations.length > 0
    ? queuedOperations
    : buildKmlSyncOperations(latestFiles, snapshots, pendingCreateDeletes, pendingDeleteIntents)
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
        dispatchSyncState('error', {
          phase: 'recovery',
          code: 'KML_RECOVERY_UNAVAILABLE',
          message: '本机恢复草稿保存失败，待提交的 KML 修改仍已保留，请修复本地存储后重试',
          pendingOperationCount: pendingSyncOperations.length,
        })
        return
      }
    }
    const trashCount = operations.filter(operation => operation.action === 'trash').length
    const result = validateKmlSyncResponse(await apiRequestForSync('/kml/sync', {
      method: 'POST',
      body: {
        operations,
        ...(trashCount > 0 && isValidKmlDeletionIntent(pendingDeletionIntent)
          ? { deletionIntent: pendingDeletionIntent }
          : {}),
      },
    }), operations)
    if (!accountMode || epoch !== syncEpoch) return
    pendingSyncOperations = []
    applySyncResult(result, latestFiles, operations)
    if (pendingDeleteIntents.size === 0 && pendingCreateDeletes.size === 0) {
      pendingDeletionIntent = ''
    }
    const remainingOperations = buildKmlSyncOperations(latestFiles, snapshots, pendingCreateDeletes, pendingDeleteIntents)
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
    // The working set may have changed while this request was in flight. The
    // serialized batch is only a recovery checkpoint for the request that
    // failed; rebuild it from the current files so a later retry cannot drop
    // edits made after the request started. Do not auto-retry ordinary
    // failures: the next explicit flush (or a new edit) is the retry boundary.
    const compensationOperations = uncertainPresenceOperations(operations)
    const latestOperations = buildKmlSyncOperations(
      latestFiles,
      snapshots,
      pendingCreateDeletes,
      pendingDeleteIntents,
    )
    // An uncertain presence transition must be settled before replaying any
    // content update.  In particular, a trash request may already have been
    // committed on the server even though its response was lost.  Sending an
    // old-revision update in the same transaction as restore would make the
    // update fail first (or roll the transaction back), leaving the document
    // in the recycle bin.  Keep only the compensating presence operations for
    // the next phase; once they succeed, the normal success path rebuilds the
    // latest content operations from the current working set and new snapshot.
    pendingSyncOperations = normalizePendingSyncOperations(
      compensationOperations.length > 0 ? compensationOperations : latestOperations,
    )
    if (error.code === 'KML_CREATE_REPLAY_DELETED' && !options.replayRecoveryAttempted) {
      const rotated = rotateRejectedCreateIds(operations, error.details?.clientId)
      if (rotated) {
        pendingSyncOperations = buildKmlSyncOperations(latestFiles, snapshots, pendingCreateDeletes, pendingDeleteIntents)
        persistCurrentDraft('replay-create-recovered')
        retryAfterAutoMerge = true
        syncPending = true
        dispatchSyncState('dirty', {
          message: '检测到已失效的旧保存标识，已保留内容并生成新的保存副本',
          operationCount: pendingSyncOperations.length,
        })
        return
      }
    }
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
      syncPending = false
      dispatchSyncState('error', {
        code: error.code,
        message: error.message,
        details: error.details,
      })
    }
  } finally {
    if (epoch !== syncEpoch) return
    syncInFlight = false
    if (syncPending && !syncBlockedByConflict) {
      syncPending = false
      if (syncTimer) clearTimeout(syncTimer)
      syncTimer = null
      await flushSync({
        ...options,
        ...(retryAfterAutoMerge ? { autoMergeAttempted: true, replayRecoveryAttempted: true } : {}),
      })
    }
  }
}

export function setKmlAccountWorkingFiles (files, options = {}) {
  const nextFiles = Array.isArray(files) ? files : []
  updateDeleteIntentState(nextFiles, options)
  latestFiles = nextFiles
  trackUnconfirmedCreates(latestFiles)
  if (options.persist !== false && accountCanWrite && accountLoadReady) persistCurrentDraft(options.reason || 'dirty')
}

export function scheduleKmlAccountSync (files, options = {}) {
  if (!accountMode || !accountCanWrite || !accountLoadReady) return false
  const nextFiles = Array.isArray(files) ? files : []
  updateDeleteIntentState(nextFiles, options)
  latestFiles = nextFiles
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
  const loaded = await loadAllAccountDocuments({ loadHidden: true })
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
    const merge = await prepareKmlConflictMerge(stored, {
      loaded: await loadAllAccountDocuments({ status: 'all', loadHidden: true }),
    })
    if (merge.conflicts.length) {
      snapshots = snapshotMap(stored.snapshots)
      latestFiles = cloneValue(stored.files || [])
      pendingCreateDeletes = new Set(stored.deletedClientIds || [])
      pendingDeleteIntents = new Set(stored.deletedFileIds || [])
      pendingDeletionIntent = stored.deletionIntent || ''
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
        deletedFileIds: [...pendingDeleteIntents],
        pendingOperations: cloneValue(pendingSyncOperations),
      }
    }
    snapshots = rebaseSnapshotsToServer(merge.serverFiles, stored.snapshots || [])
    latestFiles = merge.files
    replaceDeleteIntentState({
      deletedClientIds: (stored.deletedClientIds || []).filter(id => (
        !latestFiles.some(file => String(file?.id || '') === String(id || ''))
      )),
      deletedFileIds: (stored.deletedFileIds || []).filter(id => (
        !latestFiles.some(file => String(file?.id || '') === String(id || ''))
      )),
      deletionIntent: stored.deletionIntent,
    })
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
      deletedFileIds: [...pendingDeleteIntents],
      pendingOperations: [],
    }
  }
  const result = buildKmlRecoveryResolution(loaded.files, stored, normalizedStrategy)

  snapshots = snapshotMap(result.snapshots)
  latestFiles = result.files
  replaceDeleteIntentState({
    deletedClientIds: result.deletedClientIds || [],
    deletedFileIds: result.deletedFileIds || [],
    deletionIntent: stored.deletionIntent,
  })
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
  replaceDeleteIntentState({
    deletedClientIds: (stored.deletedClientIds || []).filter(id => (
      !latestFiles.some(file => String(file?.id || '') === String(id || ''))
    )),
    deletedFileIds: (stored.deletedFileIds || []).filter(id => (
      !latestFiles.some(file => String(file?.id || '') === String(id || ''))
    )),
    deletionIntent: stored.deletionIntent,
  })
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
      buildKmlSyncOperations(latestFiles, snapshots, pendingCreateDeletes, pendingDeleteIntents).length > 0
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
  pendingDeleteIntents = new Set()
  pendingDeletionIntent = ''
  pendingSyncOperations = []
  latestFiles = []
  latestDirectories = { items: [], uncategorized: { id: null, name: '未分类', position: 0 } }
  syncInFlight = false
  syncPending = false
  syncBlockedByConflict = false
  activeDraft = null
  pendingConflict = null
  accountLoadReady = false
  accountDocumentLoads.clear()
  embeddedAuthRequired = isEmbeddedDocument()
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = null
  dispatchSyncState(embeddedAuthRequired ? 'auth-required' : 'guest')
}

export function resetKmlAccountSync () {
  suspendKmlAccountSync({ preserveDraft: false })
}

export const resetKmlAccountSyncForTests = resetKmlAccountSync
