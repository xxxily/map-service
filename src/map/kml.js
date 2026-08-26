import L from 'leaflet'
import { showConfirm, showChoiceDialog, showEditDialog, showAlert } from '../ui/dialog.js'
import { renderCustomSelect, renderCustomColorPicker, initCustomControlsListeners } from '../ui/controls.js'
import { gcj02ToWgs84, normalizeLongitude, wgs84ToGcj02Deep } from './coord-transform.js'
import { generateKmlText, parseKmlDocument } from './kml-format.js'
import {
  bindKmlFeaturePopupMediaActions,
  hasKmlFeaturePreviewMedia,
  openKmlFeatureContentPanel,
  openKmlFeatureMediaPreview,
  renderKmlFeaturePopupContent,
} from './kml-content-panel.js'
import { invalidateKmlMediaGallery } from './kml-media-gallery.js'
import { renderKmlFileOverview } from './kml-file-overview.js'
import { getKmlFeatureDisplayName, getKmlFeatureNamePresentation } from './kml-feature-name.js'
import { getKmlMediaListIcon, getKmlMediaMarkerDescriptor } from './kml-media-marker.js'
import {
  applyKmlMarkerIconSelection,
  buildKmlMarkerIconField,
  getEditableKmlMarkerIcon,
  normalizeKmlFeatureMarkerIcon,
  recordKmlMarkerRecentIcon,
} from './kml-marker-picker.js'
import {
  buildTrackSegments,
  getTrackDisplayFeatures,
  LIVE_TRACK_RENDER_LINE_POINT_LIMIT,
  LIVE_TRACK_RENDER_POINT_LIMIT,
} from './location-track.js'
import { apiRequest } from '../auth/api.js'
import { accountApi, saveDownload } from '../account/api.js'
import { getAuthSnapshot, hasPermission } from '../auth/session.js'
import {
  clearTwoBuluImportRequest,
  showTwoBuluImportDialog,
  twoBuluImportResultMessage,
} from '../ui/two-bulu-import-dialog.js'
import {
  finalizeTwoBuluImport,
  getTwoBuluHelperState,
  probeTwoBuluHelper,
  requestTwoBuluKml,
  subscribeTwoBuluHelper,
  TWO_BULU_HELPER_PROTOCOL_VERSION,
} from '../integrations/two-bulu-helper-bridge.js'
import {
  bindKmlAccountSyncStatus,
  initializeKmlAccountMode,
  isAccountKmlMode,
  isAccountKmlWritable,
  isEmbeddedKmlAuthRequired,
  loadKmlAccountDocument,
  refreshKmlAccountDirectories,
  registerKmlAccountDocument,
  scheduleKmlAccountSync,
  suspendKmlAccountSync,
} from './kml-account-sync.js'
import {
  bindKmlAccountConflictRecovery,
  promptKmlAccountRecovery,
} from './kml-account-recovery-ui.js'
import { getActiveShare, loadActiveShareFiles, loadActiveShareFile } from './share-view.js'
import {
  enrichKmlDescriptionWithShareLinks,
  getEditableKmlDescription,
} from '../integrations/kml-share-links.js'
import { transferKmlFeature } from './kml-feature-operations.js'
import {
  applyKmlFeatureBatch,
  createKmlBatchSelectionModel,
  KML_FEATURE_BATCH_ACTIONS,
} from './kml-batch-operations.js'
import {
  createKmlDirectoryBatchSelectionModel,
  toggleKmlDirectoryBatchSelectionAll,
} from './kml-directory-batch.js'
import { loadKmlFilesWithConcurrency } from './kml-detail-loading.js'
import {
  expandKmlViewportBounds,
  KML_VIEWPORT_BUFFER_RATIO,
  getKmlFeatureFocusPlan,
  isKmlPointInsideBounds,
  shouldVirtualizeKmlPoints,
} from './kml-performance.js'
import {
  appendKmlResourceCollectionLinks,
  isKmlResourceCollectionFeature,
  showKmlResourceCollectionEditor,
} from './kml-resource-collection.js'
import { clusterKmlPoints } from './kml-point-clustering.js'

// 辅助函数：从 Leaflet map 获取视口参数
function getViewportOptions2d (map) {
  if (!map || typeof map.getBounds !== 'function') return {}
  const bounds = map.getBounds()
  if (!bounds || !bounds.isValid()) return {}
  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()
  const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 16
  return { viewportBounds: { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng }, zoom }
}

const KML_STORAGE_KEY = 'map_kml_list'
const KML_DIRECTORIES_STORAGE_KEY = 'map_kml_directories'
const KML_LAST_TARGET_KEY = 'map_kml_last_target_id'
const KML_COORD_CORRECTION = 'wgs84-to-gcj02'
const KML_POINT_LABEL_MAX_LENGTH = 18
const KML_POINT_LABEL_MIN_ZOOM = 14
const KML_POINT_LABEL_BATCH_SIZE = 40
const KML_POINT_LABEL_DELAY_MS = 240
const DEFAULT_KML_ID = 'default-kml'
const DEFAULT_KML_NAME = '默认标注'
const LONG_PRESS_DELAY_MS = 650
const LONG_PRESS_MOVE_TOLERANCE = 10
let kmlList = []
let kmlDirectories = []
let accountSessionExpiryBound = false
let kmlViewportRerenderTimer = null // KML 图层视口变化重渲染的 debounce timer
let kmlViewportRenderTask = null
let mediaFeatureActivationTimer = null
let kmlViewportRerenderBinding = null
let kmlMapInteractionBinding = null
let kmlPointLabelSyncTimer = null
let kmlPointLabelIdleTask = null
let kmlPointLabelIdleTaskKind = ''
let kmlPointLabelSyncRevision = 0
const kmlViewportCache = new WeakMap()
const leafletMediaIconCache = new Map()
const leafletSimpleIconCache = new Map()
const mapCoordinateCache = new WeakMap()

function getLeafletMediaIcon (descriptor) {
  const key = `${descriptor.type}:${descriptor.iconKey || ''}`
  let icon = leafletMediaIconCache.get(key)
  if (!icon) {
    icon = L.icon({
      className: 'kml-media-point-icon',
      iconUrl: descriptor.image,
      iconRetinaUrl: descriptor.image,
      iconSize: descriptor.iconSize,
      iconAnchor: descriptor.iconAnchor,
      popupAnchor: descriptor.popupAnchor,
      tooltipAnchor: descriptor.tooltipAnchor,
      alt: descriptor.label,
    })
    leafletMediaIconCache.set(key, icon)
  }
  return icon
}

function getLeafletSimpleIcon (color) {
  let icon = leafletSimpleIconCache.get(color)
  if (!icon) {
    icon = L.divIcon({
      className: 'kml-simple-point-icon',
      html: `<div class="kml-simple-dot" style="background-color: ${color}"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    })
    leafletSimpleIconCache.set(color, icon)
  }
  return icon
}

const leafletClusterIconCache = new Map()

function getLeafletClusterIcon (count) {
  const key = String(count)
  let icon = leafletClusterIconCache.get(key)
  if (!icon) {
    const label = Number(count).toLocaleString('zh-CN')
    const width = Math.max(30, 14 + label.length * 6)
    icon = L.divIcon({
      className: 'kml-point-cluster-icon',
      // Keep the exact count in the icon. The tooltip below provides the same
      // value for assistive technology and for icons that are visually small.
      html: `<span>${escapeHtml(label)}</span>`,
      iconSize: [width, 30],
      iconAnchor: [width / 2, 15],
    })
    leafletClusterIconCache.set(key, icon)
  }
  return icon
}

/**
 * 检查当前视口是否仍在上次渲染的缓冲范围内，如果是则跳过重渲染。
 * 缓冲范围 = 上次视口 × KML_VIEWPORT_BUFFER_RATIO。
 */
function isViewportWithinCache2d (kmlFile, bounds, zoom) {
  const cached = kmlViewportCache.get(kmlFile)
  if (!cached?.bounds || cached.zoom === null) return false
  // 缩放级别变化超过 1 级需要重新渲染（LOD 分级不同）
  if (Math.abs(zoom - cached.zoom) >= 1) return false
  const latRange = cached.bounds.north - cached.bounds.south
  const lngRange = cached.bounds.east - cached.bounds.west
  const latPad = latRange * (KML_VIEWPORT_BUFFER_RATIO - 1) / 2
  const lngPad = lngRange * (KML_VIEWPORT_BUFFER_RATIO - 1) / 2
  return bounds.south >= cached.bounds.south - latPad &&
         bounds.north <= cached.bounds.north + latPad &&
         bounds.west >= cached.bounds.west - lngPad &&
         bounds.east <= cached.bounds.east + lngPad
}

function rememberKmlViewport (kmlFile, viewportOptions) {
  if (!kmlFile || !viewportOptions?.viewportBounds) return
  kmlViewportCache.set(kmlFile, {
    bounds: viewportOptions.viewportBounds,
    zoom: viewportOptions.zoom,
  })
}

let publicKmlList = []
let sharePointClusteringConfig = { enabled: false }
let isEditingPublicKml = false
let editingPublicKmlId = null
let editingPublicKml = null
let isPublicKmlDirty = false

const PUBLIC_PREFS_KEY = 'map_shared_kml_prefs'
let publicKmlPrefs = {}

function loadPublicPrefs () {
  try {
    publicKmlPrefs = JSON.parse(localStorage.getItem(PUBLIC_PREFS_KEY) || '{}')
  } catch (err) {
    publicKmlPrefs = {}
  }
}

function savePublicPrefs () {
  localStorage.setItem(PUBLIC_PREFS_KEY, JSON.stringify(publicKmlPrefs))
}

function getKmlTheme (kmlFile) {
  if (kmlFile.isPublic) {
    return publicKmlPrefs[kmlFile.id + '_theme'] || kmlFile.theme || 'default'
  }
  return kmlFile.theme || 'default'
}

function getKmlColor (kmlFile) {
  if (kmlFile.isPublic) {
    return publicKmlPrefs[kmlFile.id + '_color'] || kmlFile.color || '#0f766e'
  }
  return kmlFile.color || '#0f766e'
}

function isAdminLoggedIn () {
  return hasPermission('admin.public_kml.manage', getAuthSnapshot())
}

function canWritePersonalKml () {
  return !isEmbeddedKmlAuthRequired() && (!isAccountKmlMode() || isAccountKmlWritable())
}

function canImportTwoBuluKml () {
  const auth = getAuthSnapshot()
  return Boolean(
    auth.authenticated &&
    isAccountKmlWritable() &&
    hasPermission('kml.own.write', auth) &&
    getTwoBuluHelperState().available
  )
}

function canManagePersonalShares () {
  return isAccountKmlMode() && hasPermission('share.own.manage', getAuthSnapshot())
}

function isKmlEditable (kmlFile) {
  if (!kmlFile) return false
  if (kmlFile.isPublic) {
    return isEditingPublicKml && editingPublicKmlId === kmlFile.id
  }
  return canWritePersonalKml()
}

function saveKmlChanges (kmlFile) {
  invalidateKmlMediaGallery(kmlFile)
  if (kmlFile.isPublic) {
    isPublicKmlDirty = true
  } else if (canWritePersonalKml()) {
    saveToStorage()
  }
}

async function loadPublicKmls (map) {
  loadPublicPrefs()
  try {
    const list = await window.fetch('/api/v1/kml/shared').then(res => res.json()).then(payload => payload.result || [])
    
    const oldPublicKmls = new Map(publicKmlList.map(k => [k.id, k]))
    
    publicKmlList = list.map(kml => {
      const oldKml = oldPublicKmls.get(kml.id)
      return {
        ...kml,
        isPublic: true,
        enabled: Boolean(publicKmlPrefs[kml.id]),
        features: oldKml ? oldKml.features : [],
      }
    })

    await Promise.all(publicKmlList.map(async kml => {
      if (kml.enabled && (!kml.features || kml.features.length === 0)) {
        try {
          const detail = await window.fetch(`/api/v1/kml/shared/${kml.id}`).then(res => res.json()).then(payload => payload.result)
          kml.features = detail.features || []
          renderKmlLayers(map, kml)
        } catch (err) {
          console.error(`Failed to load public KML detail for ${kml.id}`, err)
        }
      }
    }))
  } catch (err) {
    console.error('Failed to load public KML list', err)
  }
}

async function checkPublicKmlEditMode (map) {
  const params = new URLSearchParams(window.location.search)
  const editId = params.get('editPublicKml')
  if (!editId) return

  if (!isAdminLoggedIn()) {
    showAlert('您未登录管理员，无法编辑公共 KML 图层')
    return
  }

  try {
    const detail = await apiRequest(`/admin/kml/${encodeURIComponent(editId)}`)

    isEditingPublicKml = true
    editingPublicKmlId = editId
    editingPublicKml = {
      ...detail,
      isPublic: true,
      enabled: true
    }
    isPublicKmlDirty = false

    const existing = publicKmlList.find(k => k.id === editId)
    if (existing) {
      existing.enabled = true
      existing.features = editingPublicKml.features
    } else {
      publicKmlList.push(editingPublicKml)
    }

    renderKmlLayers(map, editingPublicKml)
    updateKmlPanelUI(map)
    showEditingBanner(map)
  } catch (err) {
    showAlert(`加载公共 KML 编辑数据失败: ${err.message}`)
  }
}

function showEditingBanner (map) {
  document.getElementById('public-kml-edit-banner')?.remove()

  const banner = document.createElement('div')
  banner.id = 'public-kml-edit-banner'
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; height: 50px;
    background: #0f766e; color: #fff; z-index: 9999;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    font-size: 14px; box-sizing: border-box;
  `
  banner.innerHTML = `
    <div style="font-weight: 500;">
      🎯 <span style="background: #14b8a6; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 6px;">编辑公共图层</span>正在编辑：<strong>${escapeHtml(editingPublicKml.name)}</strong>
    </div>
    <div style="display: flex; gap: 8px;">
      <button type="button" id="public-kml-save-btn" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: #3182ce; color: white; border: none; border-radius: 4px; cursor: pointer; min-height: 28px; line-height: 1.25;">保存草稿</button>
      <button type="button" id="public-kml-publish-btn" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: #48bb78; color: white; border: none; border-radius: 4px; cursor: pointer; min-height: 28px; line-height: 1.25;">保存并发布</button>
      <button type="button" id="public-kml-exit-btn" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: #e53e3e; color: white; border: none; border-radius: 4px; cursor: pointer; min-height: 28px; line-height: 1.25;">退出</button>
    </div>
  `
  document.body.appendChild(banner)

  document.getElementById('public-kml-save-btn').addEventListener('click', () => saveEditingPublicKml(map, 'draft'))
  document.getElementById('public-kml-publish-btn').addEventListener('click', () => saveEditingPublicKml(map, 'published'))
  document.getElementById('public-kml-exit-btn').addEventListener('click', () => exitEditingPublicKml(map))
}

async function saveEditingPublicKml (map, status) {
  try {
    await apiRequest(`/admin/kml/${encodeURIComponent(editingPublicKml.id)}`, {
      method: 'PUT',
      body: {
        features: editingPublicKml.features,
        status,
      },
    })

    isPublicKmlDirty = false
    editingPublicKml.status = status
    showAlert(status === 'published' ? '保存并发布成功！' : '保存草稿成功！')
  } catch (err) {
    showAlert(`保存失败: ${err.message}`)
  }
}

async function exitEditingPublicKml (map) {
  if (isPublicKmlDirty) {
    const confirmed = await showConfirm('有未保存的修改，确定退出编辑吗？')
    if (!confirmed) return
  }

  document.getElementById('public-kml-edit-banner')?.remove()

  isEditingPublicKml = false
  editingPublicKmlId = null
  editingPublicKml = null
  isPublicKmlDirty = false

  const url = new URL(window.location.href)
  url.searchParams.delete('editPublicKml')
  window.history.replaceState(null, '', url.pathname + url.search)
  
  await loadPublicKmls(map)
  renderAllKmls(map)
  updateKmlPanelUI(map)
}

const kmlLayerGroups = new Map()
const featureLayers = new Map()
let shareClusterLayerGroup = null
const expandedKmlIds = new Set()
const expandedKmlActionIds = new Set()
const kmlBatchSelection = createKmlBatchSelectionModel()
const kmlDirectoryBatchSelection = createKmlDirectoryBatchSelectionModel()
let kmlBatchActionBusy = false
let kmlBatchFileId = ''

function expandKmlFileExclusively (kmlId) {
  for (const kmlFile of [...kmlList, ...publicKmlList]) {
    expandedKmlIds.delete(kmlFile.id)
  }
  if (kmlId) expandedKmlIds.add(kmlId)
}

function isKmlBatchFeatureSelectable (kmlFile, feature) {
  return Boolean(kmlBatchSelection.isActive() && feature?.id && kmlFile && kmlFile.id === kmlBatchFileId && !kmlFile.isPublic && isKmlEditable(kmlFile))
}

function pruneKmlBatchSelection () {
  kmlBatchSelection.prune(({ kmlId, featureId }) => {
    const file = kmlList.find(item => item.id === kmlId)
    return Boolean(file && !file.isPublic && isKmlEditable(file) && file.features?.some(feature => feature.id === featureId))
  })
}

function exitKmlBatchMode () {
  kmlBatchSelection.deactivate()
  kmlBatchFileId = ''
  kmlBatchActionBusy = false
}

function getKmlBatchTargets () {
  return kmlList
    .filter(file => !file.isPublic && isKmlEditable(file))
    .map(file => ({
      value: file.id,
      label: `${file.name}${file.isDefault ? '（默认）' : ''}`,
    }))
}

function renderKmlBatchToolbar (kmlId = '') {
  if (!canWritePersonalKml() || kmlDirectoryBatchSelection.active) return ''
  const active = kmlBatchSelection.isActive()
  if (active && kmlBatchFileId !== kmlId) return ''
  const count = kmlBatchSelection.count
  if (!active) {
    return `<button type="button" class="kml-batch-toggle kml-file-btn" data-kml-action="toggle-batch" data-kml-id="${escapeHtml(kmlId)}" title="批量选择此 KML 的要素" aria-label="批量选择此 KML 的要素">☷</button>`
  }
  return `
    <div class="kml-batch-toolbar" role="toolbar" aria-label="批量管理 KML 要素">
      <button type="button" class="kml-batch-select-all kml-file-btn" data-kml-action="batch-select-all" title="选择当前显示的全部要素" aria-label="全选当前显示的 KML 要素">全选</button>
      <button type="button" class="kml-batch-invert kml-file-btn" data-kml-action="batch-invert" title="反选当前显示的要素" aria-label="反选当前显示的 KML 要素">反选</button>
      <button type="button" class="kml-batch-operate kml-file-btn" data-kml-action="batch-operate" ${count ? '' : 'disabled'} title="对已选要素执行操作" aria-label="对已选 ${count} 个要素执行操作">${count ? `操作 ${count}` : '操作'}</button>
      <button type="button" class="kml-batch-cancel kml-file-btn" data-kml-action="batch-cancel" title="退出批量选择" aria-label="退出批量选择">×</button>
    </div>
  `
}

function getVisibleKmlBatchSelection (panel) {
  return [...(panel || document).querySelectorAll('[data-kml-action="toggle-batch-feature"]')]
    .map(button => ({
      kmlId: button.getAttribute('data-kml-id'),
      featureId: button.getAttribute('data-feature-id'),
    }))
}

function isKmlDirectoryBatchDownloadEnabled () {
  return getAuthSnapshot().config?.kml?.batchDownloadEnabled === true
}

function exitKmlDirectoryBatchMode () {
  kmlDirectoryBatchSelection.deactivate()
}

function getDirectoryBatchFiles (directoryId = kmlDirectoryBatchSelection.directoryId) {
  const normalizedDirectoryId = String(directoryId || '')
  return kmlList.filter(file => file.status !== 'trashed' && directoryKey(file) === normalizedDirectoryId)
}

function renderKmlDirectoryBatchControls (directoryId, directoryFiles) {
  if (!isKmlDirectoryBatchDownloadEnabled() || directoryFiles.length === 0) return ''
  const safeDirectoryId = escapeHtml(directoryId)
  if (!kmlDirectoryBatchSelection.isActive(directoryId)) {
    return `<button type="button" class="kml-file-btn" data-kml-action="directory-batch-start" data-directory-id="${safeDirectoryId}" title="批量下载目录内 KML" aria-label="批量下载目录内 KML"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></button>`
  }
  const selectedFiles = directoryFiles.filter(file => kmlDirectoryBatchSelection.has(file.id))
  const selectedCount = selectedFiles.length
  const deletableCount = selectedFiles.filter(file => !file.isDefault).length
  const allSelected = selectedCount === directoryFiles.length
  return `
    <span class="kml-batch-toolbar kml-directory-batch-toolbar" role="toolbar" aria-label="批量管理目录 KML">
      <button type="button" class="kml-file-btn kml-batch-select-all" data-kml-action="directory-batch-select-all" data-directory-id="${safeDirectoryId}">${allSelected ? '全不选' : '全选'}</button>
      ${selectedCount ? `<button type="button" class="kml-file-btn kml-batch-operate" data-kml-action="directory-batch-download" data-directory-id="${safeDirectoryId}">下载 ${selectedCount}</button>` : ''}
      ${canWritePersonalKml() && deletableCount ? `<button type="button" class="kml-file-btn delete kml-batch-operate" data-kml-action="directory-batch-delete" data-directory-id="${safeDirectoryId}">删除 ${deletableCount}</button>` : ''}
      <button type="button" class="kml-file-btn kml-batch-cancel" data-kml-action="directory-batch-cancel" data-directory-id="${safeDirectoryId}" aria-label="退出目录批量选择">×</button>
    </span>
  `
}

async function downloadDirectoryBatchFiles () {
  const files = getDirectoryBatchFiles().filter(file => kmlDirectoryBatchSelection.has(file.id))
  if (!files.length) return
  const failures = []
  let downloaded = 0
  for (const file of files) {
    try {
      if (isAccountKmlMode()) {
        // Re-fetch through the account export endpoint so permissions, trash
        // status and the latest server revision are validated per file.
        const download = await accountApi.exportKml(file.id)
        saveDownload(download, `${file.name || 'map'}.kml`)
      } else {
        const loaded = file.isShare
          ? await loadSharedKmlFileForUse(file)
          : await loadAccountKmlFileForUse(file)
        if (!loaded) throw new Error(file.loadError || '文件内容加载失败')
        downloadKmlFile(file.name, generateKmlText(file.name, file.features || [], file.description))
      }
      downloaded += 1
    } catch (error) {
      failures.push(`${file.name}：${error?.message || '下载失败'}`)
    }
  }
  const message = failures.length
    ? `已开始下载 ${downloaded} 个文件，${failures.length} 个失败：${failures.join('；')}`
    : `已开始下载 ${downloaded} 个 KML 文件。`
  await showAlert(message, { title: failures.length ? '批量下载部分完成' : '批量下载' })
}

async function deleteDirectoryBatchFiles (map) {
  if (!canWritePersonalKml()) return
  const selectedIds = new Set(kmlDirectoryBatchSelection.getSelectedIds())
  const deletable = getDirectoryBatchFiles().filter(file => selectedIds.has(file.id) && !file.isDefault)
  if (!deletable.length) {
    await showAlert('默认 KML 文件不能删除。')
    return
  }
  if (!(await showConfirm(`确认删除已选的 ${deletable.length} 个 KML 文件及其中全部标注吗？`))) return
  const deletedIds = deletable.map(file => file.id)
  const deletedIdSet = new Set(deletedIds)
  pushKmlHistory()
  if (isAddingPoint && deletedIdSet.has(activeKmlIdForAdd)) togglePickupMode(map, null)
  deletable.forEach(file => {
    invalidateKmlMediaGallery(file)
    removeKmlLayers(map, file)
    expandedKmlIds.delete(file.id)
    expandedKmlActionIds.delete(file.id)
  })
  kmlList = kmlList.filter(file => !deletedIdSet.has(file.id))
  if (deletedIdSet.has(getRememberedTargetKmlId())) rememberTargetKmlId(DEFAULT_KML_ID)
  saveToStorage({ deletedIds, deletionIntent: 'user-confirmed-batch' })
  exitKmlDirectoryBatchMode()
  updateKmlPanelUI(map)
}

async function executeKmlBatchAction (map) {
  if (kmlBatchActionBusy || !kmlBatchSelection.isActive()) return
  pruneKmlBatchSelection()
  const selection = kmlBatchSelection.getSelection()
  if (!selection.length) {
    await showAlert('请先选择要操作的 KML 要素。')
    return
  }

  const action = await showChoiceDialog({
    title: '批量操作',
    message: `已选择 ${selection.length} 个 KML 要素。`,
    choices: KML_FEATURE_BATCH_ACTIONS,
  })
  if (!KML_FEATURE_BATCH_ACTIONS.some(item => item.value === action)) return

  let targetKmlId = ''
  if (action === 'move' || action === 'copy') {
    const targetOptions = getKmlBatchTargets()
    if (!targetOptions.length) {
      await showAlert('当前没有可写的目标 KML 文件。')
      return
    }
    const result = await showEditDialog({
      title: action === 'move' ? '选择移动目标' : '选择复制目标',
      fields: [{ name: 'kmlId', label: '目标 KML 文件', type: 'select', options: targetOptions }],
      values: { kmlId: targetOptions[0].value },
      confirmText: action === 'move' ? '移动' : '复制',
    })
    targetKmlId = String(result?.kmlId || '')
    if (!targetKmlId) return
    const targetFile = kmlList.find(file => file.id === targetKmlId)
    if (!(await loadAccountKmlFileForUse(targetFile))) {
      await showAlert(targetFile?.loadError || '目标 KML 内容加载失败。')
      return
    }
  } else if (!(await showConfirm(`确认删除已选的 ${selection.length} 个 KML 要素吗？`))) {
    return
  }

  kmlBatchActionBusy = true
  try {
    const result = applyKmlFeatureBatch(kmlList, {
      selection,
      mode: action,
      targetKmlId,
    })
    if (!result.changed) {
      await showAlert('所选要素已经位于目标文件，无需移动。')
      return
    }
    const previousKmlFiles = kmlList
    pushKmlHistory()
    kmlList = result.files
    if (targetKmlId) {
      expandedKmlIds.add(targetKmlId)
      rememberTargetKmlId(targetKmlId)
    }
    result.affectedKmlIds.forEach(id => {
      invalidateKmlMediaGallery(previousKmlFiles.find(file => file.id === id))
      invalidateKmlMediaGallery(kmlList.find(file => file.id === id))
    })
    saveToStorage()
    exitKmlBatchMode()
    renderAllKmls(map)
    updateKmlPanelUI(map)
    const summary = action === 'delete'
      ? `已删除 ${result.deletedCount} 个要素。`
      : action === 'copy'
        ? `已复制 ${result.copiedCount} 个要素。`
        : `已移动 ${result.movedCount} 个要素。`
    await showAlert(summary, { title: '批量操作完成' })
  } catch (error) {
    await showAlert(error?.message || '批量操作失败，数据未改变。')
  } finally {
    kmlBatchActionBusy = false
  }
}

let isAddingPoint = false
let activeKmlIdForAdd = null
let clickListener = null
let pickupToastElement = null

function loadFromStorage () {
  let shouldSave = false
  try {
    kmlList = JSON.parse(localStorage.getItem(KML_STORAGE_KEY) || '[]')
    if (!Array.isArray(kmlList)) {
      kmlList = []
      shouldSave = true
    }
  } catch (err) {
    console.error('Failed to load KML list from localStorage', err)
    kmlList = []
    shouldSave = true
  }

  kmlList = kmlList.map(normalizeKmlFile)
  try {
    const storedDirectories = JSON.parse(localStorage.getItem(KML_DIRECTORIES_STORAGE_KEY) || '[]')
    kmlDirectories = Array.isArray(storedDirectories) ? storedDirectories.map(normalizeKmlDirectory) : []
  } catch {
    kmlDirectories = []
  }
  shouldSave = ensureDefaultKmlFile() || shouldSave
  if (shouldSave) {
    try {
      saveToStorage()
    } catch (err) {
      // Storage 被禁用时仍保留内存 KML，不能阻断地图和持续定位初始化。
      console.error('KML 本地存储不可用，将临时使用内存模式', err)
    }
  }
}

function normalizeKmlDirectory (directory) {
  return {
    id: String(directory?.id || ''),
    name: String(directory?.name || '未命名目录').slice(0, 80),
    position: Number.isFinite(Number(directory?.position)) ? Number(directory.position) : 0,
    enabled: directory?.enabled !== false,
  }
}

async function loadKmlDirectories () {
  if (isAccountKmlMode()) {
    try {
      const result = await apiRequest('/kml/directories')
      kmlDirectories = [...(result?.items || []), result?.uncategorized].filter(Boolean).map(normalizeKmlDirectory)
    } catch (error) {
      console.warn('KML 目录加载失败，将按文件目录字段显示', error)
      kmlDirectories = []
    }
  }
  const known = new Set(kmlDirectories.map(item => item.id || ''))
  kmlList.forEach(file => {
    const id = String(file.directoryId || '')
    if (!known.has(id)) kmlDirectories.push(normalizeKmlDirectory({ id, name: file.directoryName || (id ? '未命名目录' : '未分类'), position: kmlDirectories.length }))
  })
  kmlDirectories.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'zh-CN'))
}

function saveKmlDirectories () {
  if (isAccountKmlMode()) return
  try { localStorage.setItem(KML_DIRECTORIES_STORAGE_KEY, JSON.stringify(kmlDirectories)) } catch {}
}

function commitAccountKmlOrganizationDocuments (documents = []) {
  if (!isAccountKmlMode()) return
  for (const document of documents || []) {
    const file = kmlList.find(candidate => (
      String(candidate.id) === String(document?.id || '') ||
      String(candidate.serverId || '') === String(document?.id || '')
    ))
    if (!file) continue
    registerKmlAccountDocument(document, { localId: file.id, localFile: file })
  }
}

function entityKmlDirectories () {
  return kmlDirectories.filter(directory => Boolean(directory.id))
}

function normalizeKmlDirectoryName (value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 80)
}

function nextLocalKmlDirectoryId () {
  return `kml-dir-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
}

function reindexKmlDirectories () {
  const entities = entityKmlDirectories()
  entities.forEach((directory, index) => { directory.position = index })
  const uncategorized = kmlDirectories.find(directory => !directory.id) || normalizeKmlDirectory({ id: '', name: '未分类' })
  uncategorized.position = entities.length
  kmlDirectories = [...entities, uncategorized]
}

async function createKmlDirectoryFromPanel (map) {
  const values = await showEditDialog({
    title: '新建 KML 目录',
    fields: [{ name: 'name', label: '目录名称' }],
    values: { name: '' },
    confirmText: '创建',
  })
  const name = normalizeKmlDirectoryName(values?.name)
  if (!name) return
  if (entityKmlDirectories().some(directory => directory.name.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))) {
    await showAlert('KML 目录名称已存在')
    return
  }
  try {
    const created = isAccountKmlMode()
      ? await apiRequest('/kml/directories', { method: 'POST', body: { name } })
      : { id: nextLocalKmlDirectoryId(), name, position: entityKmlDirectories().length, enabled: true }
    if (isAccountKmlMode()) {
      const refreshed = await refreshKmlAccountDirectories()
      kmlDirectories = [...(refreshed.items || []), refreshed.uncategorized]
        .filter(Boolean)
        .map(normalizeKmlDirectory)
    } else {
      kmlDirectories = [...entityKmlDirectories(), normalizeKmlDirectory(created), ...kmlDirectories.filter(directory => !directory.id)]
      reindexKmlDirectories()
      saveKmlDirectories()
    }
    updateKmlPanelUI(map)
  } catch (error) {
    await showAlert(error?.message || 'KML 目录创建失败')
  }
}

async function renameKmlDirectoryFromPanel (map, directoryId) {
  const directory = kmlDirectories.find(item => item.id === String(directoryId || ''))
  if (!directory?.id) return
  const values = await showEditDialog({
    title: '重命名 KML 目录',
    fields: [{ name: 'name', label: '目录名称' }],
    values: { name: directory.name },
    confirmText: '保存',
  })
  const name = normalizeKmlDirectoryName(values?.name)
  if (!name || name === directory.name) return
  if (entityKmlDirectories().some(item => item.id !== directory.id && item.name.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))) {
    await showAlert('KML 目录名称已存在')
    return
  }
  try {
    const updated = isAccountKmlMode()
      ? await apiRequest(`/kml/directories/${encodeURIComponent(directory.id)}`, { method: 'PUT', body: { name } })
      : { ...directory, name }
    directory.name = String(updated?.name || name)
    kmlList.filter(file => directoryKey(file) === directory.id).forEach(file => { file.directoryName = directory.name })
    if (isAccountKmlMode()) {
      const refreshed = await refreshKmlAccountDirectories()
      kmlDirectories = [...(refreshed.items || []), refreshed.uncategorized]
        .filter(Boolean)
        .map(normalizeKmlDirectory)
    } else {
      saveKmlDirectories()
    }
    updateKmlPanelUI(map)
  } catch (error) {
    await showAlert(error?.message || 'KML 目录重命名失败')
  }
}

async function deleteKmlDirectoryFromPanel (map, directoryId) {
  const directory = kmlDirectories.find(item => item.id === String(directoryId || ''))
  if (!directory?.id) return
  const confirmed = await showConfirm(`删除“${directory.name}”后，目录内文件会转入未分类。`, {
    title: '删除 KML 目录',
    confirmText: '删除目录',
  })
  if (!confirmed) return
  try {
    const deleted = isAccountKmlMode()
      ? await apiRequest(`/kml/directories/${encodeURIComponent(directory.id)}`, { method: 'DELETE' })
      : null
    const uncategorized = kmlList
      .filter(file => !directoryKey(file) && file.status !== 'trashed')
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
    const moved = kmlList
      .filter(file => directoryKey(file) === directory.id)
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
    moved.forEach((file, index) => {
      file.directoryId = null
      file.directoryName = ''
      file.position = uncategorized.length + index
    })
    kmlDirectories = kmlDirectories.filter(item => item.id !== directory.id)
    reindexKmlDirectories()
    if (isAccountKmlMode()) {
      commitAccountKmlOrganizationDocuments(deleted?.documents)
      const refreshed = await refreshKmlAccountDirectories()
      kmlDirectories = [...(refreshed.items || []), refreshed.uncategorized]
        .filter(Boolean)
        .map(normalizeKmlDirectory)
    } else {
      saveKmlDirectories()
      saveToStorage()
    }
    updateKmlPanelUI(map)
  } catch (error) {
    await showAlert(error?.message || 'KML 目录删除失败')
  }
}

function directoryKey (file) { return String(file?.directoryId || '') }
function directoryForFile (file) {
  const id = directoryKey(file)
  return kmlDirectories.find(item => (item.id || '') === id) || normalizeKmlDirectory({ id, name: file?.directoryName || (id ? '未分类目录' : '未分类') })
}

async function moveKmlFileFromPanel (map, kmlId) {
  const source = kmlList.find(file => file.id === String(kmlId || ''))
  if (!source || !canWritePersonalKml()) return
  if (!(await loadAccountKmlFileForUse(source))) {
    await showAlert(source.loadError || 'KML 文件详情加载失败')
    return
  }
  const values = await showEditDialog({
    title: '移动 KML 文件',
    fields: [{
      name: 'directoryId',
      label: '目标目录',
      type: 'select',
      options: kmlDirectories.map(directory => ({
        value: directory.id || '',
        label: directory.name,
      })),
    }],
    values: { directoryId: directoryKey(source) },
    confirmText: '移动',
  })
  if (!values) return
  const directoryId = String(values.directoryId || '') || null
  if (directoryKey(source) === String(directoryId || '')) return
  try {
    const moved = isAccountKmlMode()
      ? await apiRequest(`/kml/files/${encodeURIComponent(source.id)}/move`, {
          method: 'POST',
          body: { directoryId },
        })
      : null
    const sourceDirectoryId = directoryKey(source)
    const sourceIndex = kmlList.indexOf(source)
    if (sourceIndex >= 0) kmlList.splice(sourceIndex, 1)
    const sourceSiblings = kmlList
      .filter(file => file.status !== 'trashed' && directoryKey(file) === sourceDirectoryId)
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
    sourceSiblings.forEach((file, index) => { file.position = index })
    const targetSiblings = kmlList
      .filter(file => file.status !== 'trashed' && directoryKey(file) === String(directoryId || ''))
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
    source.directoryId = directoryId
    source.directoryName = directoryForFile({ directoryId })?.name || ''
    source.position = targetSiblings.length
    kmlList.push(source)
    if (isAccountKmlMode()) commitAccountKmlOrganizationDocuments(moved?.affectedDocuments || [moved])
    else saveToStorage()
    updateKmlPanelUI(map)
  } catch (error) {
    await showAlert(error?.message || '移动 KML 文件失败')
  }
}

async function loadInitialKmlFiles () {
  const account = await initializeKmlAccountMode()
  if (account.mode === 'account') {
    if (account.error) {
      kmlList = (account.files || []).map(normalizeKmlFile)
      showAlert(`账号 KML 加载失败，当前不会读取或上传浏览器本地 KML。请稍后刷新重试：${account.error.message}`)
      return
    }
    kmlList = (account.files || []).map(normalizeKmlFile)
    if (account.recovery) {
      await promptKmlAccountRecovery(account.recovery, files => {
        kmlList = files.map(normalizeKmlFile)
        return kmlList
      })
    }
    if (account.canWrite && ensureDefaultKmlFile()) saveToStorage()
    kmlDirectories = [...(account.directories?.items || []), account.directories?.uncategorized]
      .filter(Boolean)
      .map(normalizeKmlDirectory)
    return
  }
  if (account.mode === 'embedded-auth-required') {
    kmlList = []
    return
  }
  loadFromStorage()
  await loadKmlDirectories()
}

function saveToStorage (options = {}) {
  if (isAccountKmlMode()) {
    if (isAccountKmlWritable()) scheduleKmlAccountSync(kmlList, options)
    return
  }
  localStorage.setItem(KML_STORAGE_KEY, JSON.stringify(kmlList))
}

function getRemovedKmlFileIds (previousFiles, nextFiles) {
  const nextIds = new Set(nextFiles.map(file => String(file?.id || '')).filter(Boolean))
  return [...new Set(previousFiles
    .map(file => String(file?.id || ''))
    .filter(id => id && !nextIds.has(id)))]
}

function saveKmlHistoryState (previousFiles) {
  const deletedIds = getRemovedKmlFileIds(previousFiles, kmlList)
  saveToStorage(deletedIds.length > 0
    ? { deletedIds, deletionIntent: 'user-confirmed' }
    : {})
}

function normalizeKmlFile (kmlFile) {
  const isDefault = kmlFile.id === DEFAULT_KML_ID || kmlFile.isDefault === true
  const preserveServerDefaultId = isDefault && isAccountKmlMode() && kmlFile.id
  return {
    ...kmlFile,
    id: preserveServerDefaultId
      ? String(kmlFile.id)
      : (isDefault ? DEFAULT_KML_ID : String(kmlFile.id || `kml-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`)),
    name: String(kmlFile.name || (isDefault ? DEFAULT_KML_NAME : '未命名 KML')),
    description: String(kmlFile.description || '').slice(0, 10000),
    isDefault,
    theme: kmlFile.theme || 'default',
    color: kmlFile.color || '#0f766e',
    coordCorrection: kmlFile.coordCorrection || KML_COORD_CORRECTION,
    lockDrag: kmlFile.lockDrag === true,
    enabled: kmlFile.enabled !== false,
    directoryId: kmlFile.directoryId ? String(kmlFile.directoryId) : null,
    directoryName: String(kmlFile.directoryName || ''),
    position: Number.isFinite(Number(kmlFile.position)) ? Number(kmlFile.position) : 0,
    features: Array.isArray(kmlFile.features) ? kmlFile.features.map(normalizeKmlFeatureMarkerIcon) : [],
    featureCount: Number(kmlFile.featureCount ?? kmlFile.features?.length ?? 0),
    contentLoaded: kmlFile.contentLoaded !== false,
  }
}

function createKmlFile (options = {}) {
  const isDefault = Boolean(options.isDefault)
  return normalizeKmlFile({
    id: isDefault && !isAccountKmlMode()
      ? DEFAULT_KML_ID
      : `kml-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: options.name || (isDefault ? DEFAULT_KML_NAME : '新建 KML 文件'),
    description: options.description || '',
    isDefault,
    theme: options.theme || 'default',
    color: options.color || '#0f766e',
    coordCorrection: options.coordCorrection || KML_COORD_CORRECTION,
    enabled: true,
    features: options.features || [],
  })
}

function ensureDefaultKmlFile () {
  const defaultIndex = kmlList.findIndex(kmlFile => kmlFile.id === DEFAULT_KML_ID || kmlFile.isDefault === true)
  if (defaultIndex === -1) {
    kmlList.unshift(createKmlFile({ isDefault: true }))
    return true
  }

  const previousDefault = kmlList[defaultIndex]
  const defaultFile = normalizeKmlFile({
    ...previousDefault,
    id: isAccountKmlMode() ? previousDefault.id : DEFAULT_KML_ID,
    isDefault: true,
    name: previousDefault.name || DEFAULT_KML_NAME,
    enabled: true,
  })

  let changed = defaultIndex !== 0 ||
    previousDefault.id !== defaultFile.id ||
    previousDefault.name !== defaultFile.name ||
    previousDefault.isDefault !== defaultFile.isDefault ||
    previousDefault.coordCorrection !== defaultFile.coordCorrection ||
    previousDefault.enabled !== defaultFile.enabled

  kmlList.splice(defaultIndex, 1)
  kmlList.unshift(defaultFile)
  return changed
}

function downloadKmlFile (fileName, kmlText) {
  const blob = new Blob([kmlText], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.kml') ? fileName : `${fileName}.kml`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function shouldCorrectCoords (kmlFile) {
  return kmlFile?.coordCorrection !== 'none'
}

function isKmlEnabled (kmlFile) {
  return Boolean(kmlFile) && kmlFile.enabled !== false
}

function getMapCoordinates (kmlFile, feature) {
  const coordinates = feature?.coordinates
  if (!shouldCorrectCoords(kmlFile) || !feature || typeof feature !== 'object') return coordinates
  const cached = mapCoordinateCache.get(feature)
  if (cached?.source === coordinates) return cached.value
  const value = wgs84ToGcj02Deep(coordinates)
  mapCoordinateCache.set(feature, { source: coordinates, value })
  return value
}

function getMapPoint (kmlFile, feature) {
  const coordinates = getMapCoordinates(kmlFile, feature)
  return [coordinates[1], coordinates[0]]
}

function getMapLatLngs (kmlFile, feature) {
  return getMapCoordinates(kmlFile, feature).map(c => [c[1], c[0]])
}

function mapLatLngToStoredCoordinate (kmlFile, latlng) {
  const coord = [latlng.lng, latlng.lat]
  return shouldCorrectCoords(kmlFile) ? gcj02ToWgs84(coord) : coord
}

function getRememberedTargetKmlId () {
  try {
    return localStorage.getItem(KML_LAST_TARGET_KEY) || ''
  } catch (err) {
    console.error('Failed to read last KML target from localStorage', err)
    return ''
  }
}

function rememberTargetKmlId (kmlId) {
  try {
    localStorage.setItem(KML_LAST_TARGET_KEY, kmlId)
  } catch (err) {
    console.error('Failed to save last KML target to localStorage', err)
  }
}

function getEnabledKmlFiles () {
  if (canWritePersonalKml()) ensureDefaultKmlFile()
  return kmlList.filter(isKmlEnabled)
}

function getFeatureById (kmlId, featureId) {
  const kmlFile = kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
  const feature = kmlFile?.features?.find(f => f.id === featureId) || null
  return { kmlFile, feature }
}

function getFeatureLayerKey (kmlId, featureId) {
  return JSON.stringify([String(kmlId || ''), String(featureId || '')])
}

function resolveTargetKmlId (preferredKmlId = '') {
  if (isEditingPublicKml && editingPublicKmlId) {
    return editingPublicKmlId
  }
  const enabledFiles = getEnabledKmlFiles()
  const candidates = [
    preferredKmlId,
    getRememberedTargetKmlId(),
    DEFAULT_KML_ID,
    enabledFiles[0]?.id,
  ].filter(Boolean)
  return candidates.find(kmlId => enabledFiles.some(kmlFile => kmlFile.id === kmlId)) || DEFAULT_KML_ID
}

function buildKmlTargetOptions () {
  const options = getEnabledKmlFiles().map(kmlFile => ({
    value: kmlFile.id,
    label: `${kmlFile.name}${kmlFile.isDefault ? '（默认）' : ''}`,
  }))
  if (isEditingPublicKml && editingPublicKml) {
    options.push({
      value: editingPublicKml.id,
      label: `${editingPublicKml.name} (公共 - 编辑中)`,
    })
  }
  return options
}

function buildKmlOrganizationTargetOptions (currentKmlFile) {
  if (currentKmlFile?.isPublic) {
    return [{ value: currentKmlFile.id, label: `${currentKmlFile.name}（公共）` }]
  }
  return kmlList
    .filter(file => !file.isPublic && isKmlEditable(file))
    .map(file => ({
      value: file.id,
      label: `${file.name}${file.isDefault ? '（默认）' : ''}`,
    }))
}

function createPointFeature (kmlFile, latlng, result) {
  const feature = {
    id: `feat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: 'Point',
    name: result.name.trim(),
    description: result.description.trim(),
    coordinates: mapLatLngToStoredCoordinate(kmlFile, latlng),
  }
  if (result.resourceCollection) feature.resourceCollection = result.resourceCollection
  return applyKmlMarkerIconSelection(feature, result.markerIcon)
}

function getFeatureLabel (feature) {
  const name = getKmlFeatureDisplayName(feature).replace(/\s+/g, ' ').trim()
  if (!name) return ''
  if (name.length <= KML_POINT_LABEL_MAX_LENGTH) return name
  return `${name.slice(0, KML_POINT_LABEL_MAX_LENGTH)}...`
}

function bindKmlPointLabel (layer) {
  const label = String(layer?._mapServiceKmlLabel || '')
  if (!label || layer.getTooltip?.()) return
  layer.bindTooltip(escapeHtml(label), {
    permanent: true,
    direction: 'top',
    offset: [-16, -18],
    opacity: 1,
    className: 'kml-point-label',
  })
}

function scheduleKmlPointLabelIdleTask (callback) {
  if (typeof window.requestIdleCallback === 'function') {
    kmlPointLabelIdleTaskKind = 'idle'
    kmlPointLabelIdleTask = window.requestIdleCallback(deadline => {
      kmlPointLabelIdleTask = null
      kmlPointLabelIdleTaskKind = ''
      callback(deadline)
    }, { timeout: 700 })
    return
  }
  kmlPointLabelIdleTaskKind = 'timeout'
  kmlPointLabelIdleTask = window.setTimeout(() => {
    kmlPointLabelIdleTask = null
    kmlPointLabelIdleTaskKind = ''
    callback(null)
  }, 0)
}

function syncKmlPointLabels (map) {
  const revision = ++kmlPointLabelSyncRevision
  const zoom = Number(map?.getZoom?.())
  const bounds = zoom >= KML_POINT_LABEL_MIN_ZOOM ? map.getBounds?.() : null
  const paddedBounds = bounds?.isValid?.() ? bounds.pad(0.18) : null
  const layers = Array.from(featureLayers.values())
  const visibleLabelKeys = new Set()
  let nextIndex = 0

  const processBatch = deadline => {
    if (revision !== kmlPointLabelSyncRevision) return
    let processed = 0
    while (nextIndex < layers.length && processed < KML_POINT_LABEL_BATCH_SIZE) {
      if (processed > 0 && deadline && !deadline.didTimeout && deadline.timeRemaining() <= 1) break
      const layer = layers[nextIndex]
      nextIndex += 1
      processed += 1
      if (!layer?._mapServiceKmlLabel) continue
      const point = layer.getLatLng?.()
      const labelKey = point
        ? `${Number(point.lat).toFixed(6)}:${Number(point.lng).toFixed(6)}:${layer._mapServiceKmlLabel}`
        : ''
      const shouldDisplay = Boolean(
        paddedBounds &&
        point &&
        paddedBounds.contains(point) &&
        labelKey &&
        !visibleLabelKeys.has(labelKey)
      )
      if (shouldDisplay) {
        visibleLabelKeys.add(labelKey)
        bindKmlPointLabel(layer)
      } else if (layer.getTooltip?.()) {
        layer.unbindTooltip()
      }
    }
    if (nextIndex < layers.length) scheduleKmlPointLabelIdleTask(processBatch)
  }

  scheduleKmlPointLabelIdleTask(processBatch)
}

function clearKmlPointLabels () {
  featureLayers.forEach(layer => {
    if (layer?.getTooltip?.()) layer.unbindTooltip()
  })
}

function cancelKmlPointLabelSync () {
  kmlPointLabelSyncRevision += 1
  if (kmlPointLabelSyncTimer !== null) window.clearTimeout(kmlPointLabelSyncTimer)
  kmlPointLabelSyncTimer = null
  if (kmlPointLabelIdleTask !== null) {
    if (kmlPointLabelIdleTaskKind === 'idle' && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(kmlPointLabelIdleTask)
    } else {
      window.clearTimeout(kmlPointLabelIdleTask)
    }
  }
  kmlPointLabelIdleTask = null
  kmlPointLabelIdleTaskKind = ''
}

function cancelKmlScheduledTasks () {
  if (kmlViewportRerenderTimer) window.clearTimeout(kmlViewportRerenderTimer)
  if (kmlViewportRenderTask) window.clearTimeout(kmlViewportRenderTask)
  if (mediaFeatureActivationTimer) window.clearTimeout(mediaFeatureActivationTimer)
  kmlViewportRerenderTimer = null
  kmlViewportRenderTask = null
  mediaFeatureActivationTimer = null
  cancelKmlPointLabelSync()
}

function bindMediaPointInteraction (layer, kmlFile, feature) {
  if (!hasKmlFeaturePreviewMedia(feature)) return

  const defaultPopupHandler = layer._openPopup
  if (defaultPopupHandler instanceof Function) layer.off('click', defaultPopupHandler)

  let pressState = null
  let suppressClickUntil = 0
  let lastLongPressAt = 0

  const clearPress = () => {
    if (pressState?.timer) window.clearTimeout(pressState.timer)
    pressState = null
  }

  const isPrimaryPointer = event =>
    event?.isPrimary !== false &&
    (event?.button === undefined || event.button === 0)

  const bindMarkerElement = () => {
    const element = layer.getElement?.()
    if (!element || element.dataset.kmlMobileMediaBound === 'true') return
    element.dataset.kmlMobileMediaBound = 'true'

    const onPointerDown = event => {
      if (!isPrimaryPointer(event)) return
      clearPress()
      const startX = Number(event.clientX)
      const startY = Number(event.clientY)
      pressState = {
        pointerId: event.pointerId,
        startX,
        startY,
        longPressTriggered: false,
        timer: window.setTimeout(() => {
          if (!pressState || pressState.pointerId !== event.pointerId) return
          pressState.longPressTriggered = true
          pressState.timer = null
          lastLongPressAt = Date.now()
          layer.openPopup()
        }, LONG_PRESS_DELAY_MS),
      }
    }

    const onPointerMove = event => {
      if (!pressState || pressState.pointerId !== event.pointerId) return
      if (Math.hypot(Number(event.clientX) - pressState.startX, Number(event.clientY) - pressState.startY) > LONG_PRESS_MOVE_TOLERANCE) {
        clearPress()
      }
    }

    const onPointerEnd = event => {
      if (pressState?.pointerId !== event.pointerId) return
      if (pressState.longPressTriggered) suppressClickUntil = Date.now() + 700
      clearPress()
    }

    const onContextMenu = event => {
      if (pressState || Date.now() - lastLongPressAt < 1200) event.preventDefault()
    }

    element.addEventListener('pointerdown', onPointerDown, { passive: true })
    element.addEventListener('pointermove', onPointerMove, { passive: true })
    element.addEventListener('pointerup', onPointerEnd, { passive: true })
    element.addEventListener('pointercancel', onPointerEnd, { passive: true })
    element.addEventListener('contextmenu', onContextMenu)
  }

  layer.on('add', bindMarkerElement)
  bindMarkerElement()
  layer.on('remove', clearPress)
  layer.on('dragstart', clearPress)
  layer.on('click', event => {
    if (Date.now() < suppressClickUntil) {
      suppressClickUntil = 0
      return
    }
    event.originalEvent?.preventDefault?.()
    event.originalEvent?.stopPropagation?.()
    layer.closePopup()
    openKmlFeatureMediaPreview(kmlFile, feature, {
      trigger: layer.getElement?.(),
      linkMapFeatures: false,
    })
  })
}

function renderFeature (map, kmlFile, feature) {
  const kmlId = kmlFile.id
  let layer
  let mediaMarker = null
  const editable = isKmlEditable(kmlFile)
  const theme = getKmlTheme(kmlFile)
  const dragAllowed = editable && !kmlFile.lockDrag
  
  if (feature.type === 'Point') {
    const latlng = getMapPoint(kmlFile, feature)
    mediaMarker = getKmlMediaMarkerDescriptor(feature)
    
    if (mediaMarker) {
      layer = L.marker(latlng, {
        draggable: dragAllowed,
        icon: getLeafletMediaIcon(mediaMarker),
        title: mediaMarker.label,
      })
    } else if (theme === 'simple') {
      const colorVal = getKmlColor(kmlFile)
      layer = L.marker(latlng, {
        draggable: dragAllowed,
        icon: getLeafletSimpleIcon(colorVal)
      })
    } else {
      layer = L.marker(latlng, {
        draggable: dragAllowed
      })
    }

    if (dragAllowed) {
      // 监听拖动开始：保存撤销快照，并在拖动时关闭 popup 气泡
      layer.on('dragstart', () => {
        pushKmlHistory()
        layer.closePopup()
      })
      
      layer.on('dragend', () => {
        const newLatLng = layer.getLatLng()
        feature.coordinates = mapLatLngToStoredCoordinate(kmlFile, newLatLng)
        saveKmlChanges(kmlFile)
        updateKmlPanelUI(map)
      })
    }

    if (theme !== 'simple') {
      const label = getFeatureLabel(feature)
      if (label) {
        layer._mapServiceKmlLabel = label
        // Labels are attached after the map settles; creating them during a
        // bulk marker render makes zoom and pan compete with layout work.
      }
    }
  } else if (feature.type === 'LineString') {
    const latlngs = getMapLatLngs(kmlFile, feature)
    layer = L.polyline(latlngs, {
      color: getKmlColor(kmlFile),
      weight: 4
    })
  } else if (feature.type === 'Polygon') {
    const latlngs = getMapLatLngs(kmlFile, feature)
    const colorVal = getKmlColor(kmlFile)
    layer = L.polygon(latlngs, {
      color: colorVal,
      fillColor: colorVal,
      fillOpacity: 0.15
    })
  }
  
  if (layer) {
    layer._mapServiceKmlFeatureId = String(feature.id || '')
    layer._mapServiceKmlFileId = String(kmlId || '')
    layer.bindPopup(() => renderKmlFeaturePopupContent(kmlFile, feature, editable), {
      closeButton: false,
      className: 'kml-rich-popup',
      maxWidth: 360,
      minWidth: 270,
    })
    if (feature.type === 'Point' && mediaMarker) {
      bindMediaPointInteraction(layer, kmlFile, feature)
    }
    featureLayers.set(getFeatureLayerKey(kmlId, feature.id), layer)
  }
  
  return layer
}

function removeKmlLayers (map, kmlFile) {
  const kmlId = typeof kmlFile === 'string' ? kmlFile : kmlFile.id
  const group = kmlLayerGroups.get(kmlId)
  if (group) {
    group.eachLayer(layer => {
      const featureId = String(layer?._mapServiceKmlFeatureId || '')
      if (featureId) featureLayers.delete(getFeatureLayerKey(kmlId, featureId))
    })
    map.removeLayer(group)
    kmlLayerGroups.delete(kmlId)
  }
  if (kmlFile && typeof kmlFile === 'object') kmlViewportCache.delete(kmlFile)
}

function removeShareClusterLayers (map) {
  if (shareClusterLayerGroup) {
    shareClusterLayerGroup.eachLayer?.(layer => {
      const featureId = String(layer?._mapServiceKmlFeatureId || '')
      const kmlId = String(layer?._mapServiceKmlFileId || '')
      if (featureId && kmlId) featureLayers.delete(getFeatureLayerKey(kmlId, featureId))
    })
    map.removeLayer(shareClusterLayerGroup)
    shareClusterLayerGroup = null
  }
}

function getSharePointClusterFeature (cluster) {
  const members = Array.isArray(cluster?.members) ? cluster.members : []
  return members.length === 1 ? members[0] : null
}

function renderShareClusterLayers (map) {
  if (!getActiveShare() || !sharePointClusteringConfig?.enabled) return false
  removeShareClusterLayers(map)
  publicKmlList.forEach(kmlFile => removeKmlLayers(map, kmlFile))
  const group = L.featureGroup()
  const records = []
  const viewportOptions = getViewportOptions2d(map)
  const bufferedBounds = viewportOptions.viewportBounds
    ? expandKmlViewportBounds(viewportOptions.viewportBounds)
    : null

  publicKmlList.filter(isKmlEnabled).forEach(kmlFile => {
    const { features } = getRenderableKmlFeatures(map, kmlFile)
    features.forEach(feature => {
      if (feature.type === 'Point') {
        const point = getMapPoint(kmlFile, feature)
        if (bufferedBounds && !isKmlPointInsideBounds(getMapCoordinates(kmlFile, feature), bufferedBounds)) return
        records.push({
          id: `${kmlFile.id}:${feature.id}`,
          latLng: { lat: point[0], lng: point[1] },
          kmlFile,
          feature,
        })
      } else {
        const layer = renderFeature(map, kmlFile, feature)
        if (layer) group.addLayer(layer)
      }
    })
  })

  const projected = clusterKmlPoints(
    records,
    viewportOptions.zoom ?? map.getZoom?.() ?? 0,
    sharePointClusteringConfig,
    (latLng, zoom) => map.project([latLng.lat, latLng.lng], zoom),
  )
  const recordById = new Map(records.map(record => [record.id, record]))
  projected.forEach(item => {
    if (item.type === 'point') {
      const record = recordById.get(item.id)
      const layer = record && renderFeature(map, record.kmlFile, record.feature)
      if (layer) group.addLayer(layer)
      return
    }
    const marker = L.marker([item.center.lat, item.center.lng], {
      icon: getLeafletClusterIcon(item.count),
      keyboard: true,
      title: `${item.count} 个点位，点击放大`,
      zIndexOffset: 1000,
    })
    marker._mapServiceKmlCluster = true
    marker.on('click', event => {
      event.originalEvent?.stopPropagation?.()
      const nextZoom = Math.min(
        Number(map.getMaxZoom?.() ?? 24),
        Number(map.getZoom?.() ?? 0) + 1,
      )
      map.setView([item.center.lat, item.center.lng], nextZoom, { animate: true })
    })
    marker.bindTooltip(`${item.count} 个点位`, { direction: 'top', offset: [0, -16] })
    group.addLayer(marker)
  })
  group.addTo(map)
  shareClusterLayerGroup = group
  return true
}

function escapeHtml (str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getRenderableKmlFeatures (map, kmlFile, options = {}) {
  const viewportOptions = getViewportOptions2d(map)
  const features = getTrackDisplayFeatures(kmlFile, viewportOptions)
  if (kmlFile.isLiveTrack || !shouldVirtualizeKmlPoints(features.length) || !viewportOptions.viewportBounds) {
    return { features, viewportOptions }
  }

  const includedIds = options.includeFeatureIds instanceof Set
    ? options.includeFeatureIds
    : new Set(options.includeFeatureIds || [])
  const bufferedBounds = expandKmlViewportBounds(viewportOptions.viewportBounds)
  const visible = features.filter(feature => {
    if (feature?.type !== 'Point' || includedIds.has(String(feature.id || ''))) return true
    return isKmlPointInsideBounds(getMapCoordinates(kmlFile, feature), bufferedBounds)
  })
  return { features: visible, viewportOptions }
}

function syncKmlLayers (map, kmlFile, displayFeatures) {
  let group = kmlLayerGroups.get(kmlFile.id)
  if (!group) {
    group = L.featureGroup().addTo(map)
    kmlLayerGroups.set(kmlFile.id, group)
  }

  const desiredIds = new Set(displayFeatures.map(feature => String(feature.id || '')))
  group.eachLayer(layer => {
    const featureId = String(layer._mapServiceKmlFeatureId || '')
    if (!featureId || desiredIds.has(featureId)) return
    group.removeLayer(layer)
    featureLayers.delete(getFeatureLayerKey(kmlFile.id, featureId))
  })

  displayFeatures.forEach(feature => {
    const key = getFeatureLayerKey(kmlFile.id, feature.id)
    if (featureLayers.has(key)) return
    const layer = renderFeature(map, kmlFile, feature)
    if (layer) group.addLayer(layer)
  })
}

function renderKmlLayers (map, kmlFile, options = {}) {
  if (options.incremental && isKmlEnabled(kmlFile)) {
    const { features, viewportOptions } = getRenderableKmlFeatures(map, kmlFile, options)
    syncKmlLayers(map, kmlFile, features)
    rememberKmlViewport(kmlFile, viewportOptions)
    scheduleKmlPointLabelSync(map)
    return
  }

  removeKmlLayers(map, kmlFile)

  if (!isKmlEnabled(kmlFile)) return
  
  const group = L.featureGroup()
  const { features: displayFeatures, viewportOptions } = getRenderableKmlFeatures(map, kmlFile, options)

  displayFeatures.forEach(feat => {
    const layer = renderFeature(map, kmlFile, feat)
    if (layer) {
      group.addLayer(layer)
    }
  })
  
  group.addTo(map)
  kmlLayerGroups.set(kmlFile.id, group)

  rememberKmlViewport(kmlFile, viewportOptions)
  scheduleKmlPointLabelSync(map)
}

function renderAllKmls (map) {
  kmlLayerGroups.forEach(group => map.removeLayer(group))
  kmlLayerGroups.clear()
  featureLayers.clear()
  removeShareClusterLayers(map)

  if (getActiveShare() && sharePointClusteringConfig?.enabled) {
    renderShareClusterLayers(map)
    return
  }
  
  kmlList.forEach(kmlFile => {
    renderKmlLayers(map, kmlFile)
  })

  publicKmlList.forEach(kmlFile => {
    renderKmlLayers(map, kmlFile)
  })
}

function bindAccountSessionExpiry (map) {
  if (accountSessionExpiryBound || typeof window === 'undefined') return
  accountSessionExpiryBound = true
  window.addEventListener('map-auth-session-expired', () => {
    if (!isAccountKmlMode()) return
    exitKmlBatchMode()
    exitKmlDirectoryBatchMode()
    suspendKmlAccountSync({ preserveDraft: true, reason: 'session-expired' })
    if (!isEmbeddedKmlAuthRequired()) loadFromStorage()
    else kmlList = []
    renderAllKmls(map)
    updateKmlPanelUI(map)
    showAlert(isEmbeddedKmlAuthRequired()
      ? '登录已失效，未同步的账号 KML 已保存在该用户专属恢复草稿中。请重新登录同一账号后恢复。'
      : '登录已失效，未同步的账号 KML 已保存在该用户专属恢复草稿中。当前页面已切换回访客本地 KML，请重新登录同一账号后恢复。')
  })
}

async function loadSharedKmlFileForUse (kmlFile, options = {}) {
  if (!kmlFile?.isShare || kmlFile.contentLoaded !== false) return Boolean(kmlFile && !kmlFile.loadError)
  const loaded = await loadActiveShareFile(kmlFile)
  const succeeded = Boolean(loaded?.contentLoaded && !loaded.loadError)
  if (!succeeded) kmlFile.enabled = false
  else if (options.enableOnSuccess === true) kmlFile.enabled = true
  return succeeded
}

async function loadAccountKmlFileForUse (kmlFile) {
  if (!kmlFile || !isAccountKmlMode() || kmlFile.contentLoaded !== false) {
    return Boolean(kmlFile && !kmlFile.loadError)
  }
  try {
    await loadKmlAccountDocument(kmlFile)
    return kmlFile.contentLoaded === true && !kmlFile.loadError
  } catch (error) {
    kmlFile.loadError = error?.message || 'KML 文件详情加载失败'
    return false
  }
}

function updateKmlPanelUI (map) {
  const twoBuluImportButton = document.getElementById('kml-import-2bulu')
  if (twoBuluImportButton) twoBuluImportButton.hidden = !canImportTwoBuluKml()
  const panel = document.getElementById('kml-panel')
  const personalKmlWritable = canWritePersonalKml()
  const dropzone = document.getElementById('kml-import-dropzone')
  const createButton = panel?.querySelector('[data-kml-action="create-file"]')
  const correctionOption = panel?.querySelector('.kml-import-option')
  if (dropzone) dropzone.hidden = !personalKmlWritable
  if (createButton) createButton.hidden = !personalKmlWritable
  if (correctionOption) correctionOption.hidden = !personalKmlWritable
  if (personalKmlWritable) ensureDefaultKmlFile()
  if (!personalKmlWritable && kmlBatchSelection.isActive()) exitKmlBatchMode()
  if (!isKmlDirectoryBatchDownloadEnabled() && kmlDirectoryBatchSelection.active) exitKmlDirectoryBatchMode()
  if (kmlBatchSelection.isActive()) pruneKmlBatchSelection()
  if (kmlDirectoryBatchSelection.active) {
    const remainingIds = getDirectoryBatchFiles().map(file => file.id)
    kmlDirectoryBatchSelection.prune(remainingIds)
    if (!remainingIds.length) exitKmlDirectoryBatchMode()
  }
  const container = document.getElementById('kml-files-list')
  if (!container) return

  let html = ''

  if (isEmbeddedKmlAuthRequired()) {
    html += '<div class="kml-empty kml-embedded-auth-required">请先登录，再编辑账号 KML</div>'
  }

  // 1. 个人图层分区
  const personalExpanded = !expandedKmlIds.has('personal-section')
  html += `
    <div class="kml-section-header kml-personal-section-header" data-kml-action="toggle-section" data-section-id="personal-section">
      <span class="kml-section-label">个人图层 (${kmlList.length})</span>
      <div class="kml-section-actions">
        ${personalKmlWritable ? '<button type="button" class="kml-file-btn kml-section-icon-button" data-kml-action="create-directory" title="新建 KML 目录" aria-label="新建 KML 目录"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M12 12v6M9 15h6"/></svg></button>' : ''}
        <span class="kml-section-chevron" aria-hidden="true">${personalExpanded ? '▲' : '▼'}</span>
      </div>
    </div>
    <div id="kml-personal-list" class="kml-section-list" ${personalExpanded ? '' : 'hidden'}>
      ${personalExpanded
        ? kmlDirectories.map(directory => {
          const directoryId = directory.id || ''
          const directoryFiles = kmlList.filter(file => directoryKey(file) === directoryId).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'zh-CN'))
          const directoryVisible = directoryFiles.length === 0 || directoryFiles.every(isKmlEnabled)
          const directoryExpanded = !expandedKmlIds.has(`directory:${directoryId}`)
          const directoryBatchActive = kmlDirectoryBatchSelection.isActive(directoryId)
          return `<section class="kml-directory-group" data-kml-directory-id="${escapeHtml(directoryId)}" ${directoryId ? `data-kml-directory-order-drop="${escapeHtml(directoryId)}"` : ''}>
            <header class="kml-directory-head" data-kml-action="toggle-directory" data-directory-id="${escapeHtml(directoryId)}" ${canWritePersonalKml() && directoryId && !directoryBatchActive ? 'draggable="true" data-kml-directory-draggable="true"' : ''}>
              <span class="kml-directory-name"><span class="kml-directory-label" title="${escapeHtml(directory.name)}">${escapeHtml(directory.name)}</span><span class="kml-file-count">${directoryFiles.length}</span></span>
              <span class="kml-directory-actions">
                ${directoryBatchActive
                  ? renderKmlDirectoryBatchControls(directoryId, directoryFiles)
                  : `${canWritePersonalKml() ? `<button type="button" class="kml-file-btn kml-directory-visibility ${directoryVisible ? 'is-visible' : 'is-hidden'}" data-kml-action="toggle-directory-visible" data-directory-id="${escapeHtml(directoryId)}" aria-label="${directoryVisible ? '隐藏' : '显示'}目录" title="${directoryVisible ? '隐藏' : '显示'}目录"><span class="kml-eye-icon" aria-hidden="true"></span></button>` : ''}${renderKmlDirectoryBatchControls(directoryId, directoryFiles)}${canWritePersonalKml() && directoryId ? `<button type="button" class="kml-file-btn" data-kml-action="rename-directory" data-directory-id="${escapeHtml(directoryId)}" title="重命名目录" aria-label="重命名目录">✎</button><button type="button" class="kml-file-btn delete" data-kml-action="delete-directory" data-directory-id="${escapeHtml(directoryId)}" title="删除目录" aria-label="删除目录">×</button>` : ''}`}
                <span class="kml-directory-chevron" aria-hidden="true">${directoryExpanded ? '▲' : '▼'}</span>
              </span>
            </header>
            <div class="kml-directory-files" ${directoryExpanded ? '' : 'hidden'} data-kml-directory-id="${escapeHtml(directoryId)}">
              ${directoryExpanded ? directoryFiles.map(kmlFile => {
        const safeKmlId = escapeHtml(kmlFile.id)
        const enabled = isKmlEnabled(kmlFile)
        const expanded = expandedKmlIds.has(kmlFile.id)
        // Collapsed cards intentionally do not build feature rows or media
        // icons. This keeps the hidden management panel cheap with several
        // large KML files; expanding a card rebuilds only that card.
        const displayFeatures = expanded
          ? getTrackDisplayFeatures(kmlFile, getViewportOptions2d(map))
          : []
        const writable = canWritePersonalKml()
        const actionsExpanded = expandedKmlActionIds.has(kmlFile.id)
        const directoryBatchSelectable = kmlDirectoryBatchSelection.isActive(directoryKey(kmlFile))
        const directoryBatchSelected = directoryBatchSelectable && kmlDirectoryBatchSelection.has(kmlFile.id)
        const featureOrderingAvailable = writable && !directoryBatchSelectable && !kmlBatchSelection.isActive() && (
          !kmlFile.isLiveTrack || (expanded && displayFeatures.length === kmlFile.features.length)
        )
        const visibilityDisabled = !writable || kmlFile.isDefault
        const visibilityTitle = kmlFile.isDefault
          ? '默认 KML 始终显示'
          : (!writable ? '当前 KML 为只读，不能修改显隐状态' : (enabled ? '隐藏此 KML 文件' : '显示此 KML 文件'))
        const visibilityButton = `
          <button type="button" class="kml-file-btn kml-visibility-btn ${enabled ? 'is-visible' : 'is-hidden'}" data-kml-action="toggle-visible" data-kml-id="${safeKmlId}" aria-label="${visibilityTitle}" aria-pressed="${enabled}" title="${visibilityTitle}" ${visibilityDisabled ? 'disabled' : ''}>
            <span class="kml-eye-icon" aria-hidden="true"></span>
          </button>
        `
        const shareButton = canManagePersonalShares()
          ? `
            <button type="button" class="kml-file-btn" data-kml-action="manage-share" data-kml-id="${safeKmlId}" title="在用户中心分享此 KML" aria-label="分享此 KML">↗</button>
          `
          : (isAdminLoggedIn() ? `
            <button type="button" class="kml-file-btn" data-kml-action="share-file" data-kml-id="${safeKmlId}" title="共享为公共 KML" aria-label="共享为公共 KML">
              <svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; stroke-linecap: round; stroke-linejoin: round;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
            </button>
          ` : '')
        const deleteButton = !writable || kmlFile.isDefault
          ? ''
          : `<button type="button" class="kml-file-btn delete" data-kml-action="delete-file" data-kml-id="${safeKmlId}" title="删除此 KML 文件" aria-label="删除此 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button>`
        return `
          <div class="kml-file-card ${enabled ? '' : 'is-disabled'}${directoryBatchSelected ? ' is-batch-selected' : ''}" data-kml-card-id="${safeKmlId}" ${featureOrderingAvailable ? `data-kml-drop-target="file" data-kml-id="${safeKmlId}"` : ''}>
            <div class="kml-file-head ${expanded ? 'is-expanded' : ''}" data-kml-action="toggle-collapse" data-kml-id="${safeKmlId}" aria-expanded="${expanded}" title="点击展开 KML 详情、操作和要素" ${writable && !kmlFile.isDefault && !directoryBatchSelectable ? 'draggable="true" data-kml-file-draggable="true"' : ''}>
              <div class="kml-file-title">
                ${directoryBatchSelectable ? `<button type="button" class="kml-feature-batch-check kml-directory-file-check" data-kml-action="directory-batch-toggle-file" data-kml-id="${safeKmlId}" aria-pressed="${directoryBatchSelected}" aria-label="${directoryBatchSelected ? '取消选择' : '选择'}${escapeHtml(kmlFile.name)}"><span aria-hidden="true">${directoryBatchSelected ? '✓' : ''}</span></button>` : ''}
                <span class="kml-file-name" title="${escapeHtml(kmlFile.name)}">${escapeHtml(kmlFile.name)}</span>
                <span class="kml-file-count">${kmlFile.contentLoaded === false ? Number(kmlFile.featureCount || 0) : kmlFile.features.length}</span>
                ${kmlFile.isDefault ? '<span class="kml-file-state is-default">默认</span>' : ''}
                ${writable ? '' : '<span class="kml-file-state">只读</span>'}
                ${enabled ? '' : '<span class="kml-file-state">已隐藏</span>'}
              </div>
              <div class="kml-file-actions">
                ${visibilityButton}
                <button type="button" class="kml-file-btn kml-file-more-toggle" data-kml-action="toggle-file-actions" data-kml-id="${safeKmlId}" aria-expanded="${actionsExpanded}" aria-controls="file-actions-${safeKmlId}" aria-label="${actionsExpanded ? '收起' : '展开'} KML 文件操作" title="${actionsExpanded ? '收起更多操作' : '更多操作'}"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></button>
              </div>
            </div>
            <div class="kml-file-more-actions" id="file-actions-${safeKmlId}" ${actionsExpanded ? '' : 'hidden'}>
              ${renderKmlBatchToolbar(safeKmlId)}
              ${writable ? `<button type="button" class="kml-file-btn" data-kml-action="rename-file" data-kml-id="${safeKmlId}" aria-label="重命名 KML 文件" title="重命名 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg></button>` : ''}
              ${writable ? `<button type="button" class="kml-file-btn" data-kml-action="move-file" data-kml-id="${safeKmlId}" aria-label="移动 KML 文件" title="移动到其他目录">⇄</button>` : ''}
              ${shareButton}
              <button type="button" class="kml-file-btn" data-kml-action="export" data-kml-id="${safeKmlId}" title="导出 KML 文件" aria-label="导出 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></button>
              ${deleteButton}
            </div>
            <div class="kml-file-detail${expanded ? ' is-expanded' : ''}" id="features-${safeKmlId}" ${expanded ? '' : 'hidden'}>
              ${expanded ? renderKmlFileOverview(kmlFile) : ''}
              <div class="kml-file-toolbox" aria-label="${escapeHtml(kmlFile.name)} 相关操作">
                <div class="kml-file-settings">
                  <label class="kml-correction-switch" title="开启后按高德底图纠偏显示；导出仍保留 KML 标准经纬度">
                    <input type="checkbox" data-kml-correction data-kml-id="${safeKmlId}" ${writable ? '' : 'disabled'} ${shouldCorrectCoords(kmlFile) ? 'checked' : ''}>
                    <span>坐标纠偏</span>
                  </label>
                  <label class="kml-correction-switch" title="开启后将锁定该图层下所有标注点位，防止误触拖拽移动">
                    <input type="checkbox" data-kml-lock-drag data-kml-id="${safeKmlId}" ${writable ? '' : 'disabled'} ${kmlFile.lockDrag ? 'checked' : ''}>
                    <span>锁定移动</span>
                  </label>
                  <div class="kml-file-style-settings">
                    <span class="kml-setting-label">样式：</span>
                    ${renderCustomSelect({
                      className: 'kml-theme-select',
                      value: getKmlTheme(kmlFile),
                      options: [
                        { value: 'default', label: '常规' },
                        { value: 'simple', label: '简约' }
                      ],
                      attrs: `data-kml-id="${safeKmlId}" ${writable ? '' : 'disabled'}`
                    })}
                    <span class="kml-setting-label kml-color-label">颜色：</span>
                    ${renderCustomColorPicker({
                      className: 'kml-color-input',
                      value: getKmlColor(kmlFile),
                      attrs: `data-kml-id="${safeKmlId}" ${writable ? '' : 'disabled'}`
                    })}
                  </div>
                </div>
                <div class="kml-file-tool-actions">
                  ${writable ? `<button type="button" class="kml-file-btn" data-kml-action="add-point" data-kml-id="${safeKmlId}" title="在此文件下新增标注点" aria-label="新增标注点"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg></button>` : ''}
                </div>
              </div>
              <div class="kml-features-list" ${featureOrderingAvailable ? `data-kml-drop-target="list" data-kml-id="${safeKmlId}"` : ''}>
                ${displayFeatures.length < kmlFile.features.length ? `<div class="kml-feature-limit-note">已按当前视口和缩放级别过滤显示，共 ${kmlFile.features.length} 个记录点中展示 ${displayFeatures.length} 个；导出仍包含全部记录。</div>` : ''}
                ${displayFeatures.map(feat => {
                  const safeFeatureId = escapeHtml(feat.id)
                  let iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
                  if (feat.type === 'LineString') {
                    iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>'
                  }
                  if (feat.type === 'Polygon') {
                    iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12 2 22 9 18 22 6 22 2 9"/></svg>'
                  }
                  iconSvg = getKmlMediaListIcon(feat) || iconSvg
                  const { displayName, accessibleName } = getKmlFeatureNamePresentation(feat)
                  const batchSelectable = isKmlBatchFeatureSelectable(kmlFile, feat)
                  const selected = batchSelectable && kmlBatchSelection.has(kmlFile.id, feat.id)
                  return `
                    <div class="kml-feature-item${featureOrderingAvailable ? ' is-draggable' : ''}${batchSelectable ? ' is-batch-selectable' : ''}${selected ? ' is-batch-selected' : ''}" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}" ${featureOrderingAvailable ? 'draggable="true" data-kml-draggable="true" data-kml-drop-target="feature"' : ''}>
                      ${batchSelectable
                        ? `<button type="button" class="kml-feature-batch-check" data-kml-action="toggle-batch-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}" aria-pressed="${selected}" aria-label="${selected ? '取消选择' : '选择'}${escapeHtml(accessibleName)}"><span aria-hidden="true">${selected ? '✓' : ''}</span></button>`
                        : (featureOrderingAvailable ? '<span class="kml-feature-drag-handle" aria-hidden="true" title="拖动排序或移至其他 KML">⋮⋮</span>' : '')}
                      <div class="kml-feature-info" data-kml-action="focus-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}" aria-label="定位到${escapeHtml(accessibleName)}">
                        <span class="kml-feature-icon">${iconSvg}</span>
                        ${displayName ? `<span class="kml-feature-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>` : ''}
                      </div>
                      ${writable && !batchSelectable ? `<button type="button" class="kml-feature-del" data-kml-action="delete-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}" title="删除标注"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg></button>` : ''}
                    </div>
                  `
                }).join('')}
              </div>
            </div>
          </div>
        `
        }).join('') || '<div class="kml-empty kml-directory-empty">目录暂无 KML 文件</div>' : ''}
            </div>
          </section>`
        }).join('') : ''}
    </div>
  `

  // 2. 公共图层分区
  const publicCount = publicKmlList.length
  const publicExpanded = !expandedKmlIds.has('public-section')
  html += `
    <div class="kml-section-header" data-kml-action="toggle-section" data-section-id="public-section">
      <span class="kml-section-label">公共图层 (${publicCount})</span>
      <div class="kml-section-actions">
        <button type="button" class="kml-file-btn kml-section-icon-button" data-kml-action="refresh-public" title="刷新公共图层" aria-label="刷新公共图层" onclick="event.stopPropagation()">
          <svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        </button>
        <span class="kml-section-chevron" aria-hidden="true">${publicExpanded ? '▲' : '▼'}</span>
      </div>
    </div>
    <div id="kml-public-list" class="kml-section-list" ${publicExpanded ? '' : 'hidden'}>
      ${publicExpanded
        ? (publicKmlList.map(kmlFile => {
        const safeKmlId = escapeHtml(kmlFile.id)
        const enabled = isKmlEnabled(kmlFile)
        const expanded = expandedKmlIds.has(kmlFile.id)
        const actionsExpanded = expandedKmlActionIds.has(kmlFile.id)
        const visibilityTitle = enabled ? '隐藏此公共图层' : '显示此公共图层'
        const isEditingThis = isEditingPublicKml && editingPublicKmlId === kmlFile.id
        return `
          <div class="kml-file-card ${enabled ? '' : 'is-disabled'}" data-kml-card-id="${safeKmlId}">
            <div class="kml-file-head ${expanded ? 'is-expanded' : ''}" data-kml-action="toggle-collapse" data-kml-id="${safeKmlId}">
              <div class="kml-file-title">
                <span class="kml-file-name" title="${escapeHtml(kmlFile.name)}">${escapeHtml(kmlFile.name)}</span>
                <span class="kml-file-count">${kmlFile.features ? kmlFile.features.length : (kmlFile.featureCount || 0)}</span>
                <span class="kml-file-state is-public">公共</span>
                ${isEditingThis ? '<span class="kml-file-state is-editing">编辑中</span>' : ''}
                ${enabled ? '' : '<span class="kml-file-state">已隐藏</span>'}
              </div>
              <div class="kml-file-actions">
                <button type="button" class="kml-file-btn kml-visibility-btn ${enabled ? 'is-visible' : 'is-hidden'}" data-kml-action="toggle-visible" data-kml-id="${safeKmlId}" aria-label="${visibilityTitle}" aria-pressed="${enabled}" title="${visibilityTitle}">
                  <span class="kml-eye-icon" aria-hidden="true"></span>
                </button>
                <button type="button" class="kml-file-btn kml-file-more-toggle" data-kml-action="toggle-file-actions" data-kml-id="${safeKmlId}" aria-expanded="${actionsExpanded}" aria-controls="file-actions-${safeKmlId}" aria-label="${actionsExpanded ? '收起' : '展开'} KML 文件操作" title="${actionsExpanded ? '收起更多操作' : '更多操作'}"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></button>
              </div>
            </div>
            <div class="kml-file-more-actions" id="file-actions-${safeKmlId}" ${actionsExpanded ? '' : 'hidden'}>
              <button type="button" class="kml-file-btn" data-kml-action="export" data-kml-id="${safeKmlId}" title="导出 KML 文件" aria-label="导出 KML 文件"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></button>
            </div>
            <div class="kml-file-detail${expanded ? ' is-expanded' : ''}" id="features-${safeKmlId}" ${expanded ? '' : 'hidden'}>
              ${expanded ? renderKmlFileOverview(kmlFile) : ''}
              <div class="kml-file-toolbox">
                <div class="kml-file-settings">
                  <label class="kml-correction-switch" title="公共图层不可在此修改纠偏配置">
                    <input type="checkbox" disabled checked ${kmlFile.coordCorrection !== 'none' ? 'checked' : ''}>
                    <span>坐标纠偏</span>
                  </label>
                  <label class="kml-correction-switch" title="公共图层禁止点位移动">
                    <input type="checkbox" disabled checked>
                    <span>锁定移动</span>
                  </label>
                  <div class="kml-file-style-settings">
                    <span class="kml-setting-label">样式：</span>
                    ${renderCustomSelect({
                      className: 'kml-theme-select',
                      value: getKmlTheme(kmlFile),
                      options: [
                        { value: 'default', label: '常规' },
                        { value: 'simple', label: '简约' }
                      ],
                      attrs: `data-kml-id="${safeKmlId}"`
                    })}
                    <span class="kml-setting-label kml-color-label">颜色：</span>
                    ${renderCustomColorPicker({
                      className: 'kml-color-input',
                      value: getKmlColor(kmlFile),
                      attrs: `data-kml-id="${safeKmlId}"`
                    })}
                  </div>
                </div>
                <div class="kml-file-tool-actions">
                  ${isEditingThis ? `<button type="button" class="kml-file-btn" data-kml-action="add-point" data-kml-id="${safeKmlId}" title="新增标注点" aria-label="新增标注点"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg></button>` : ''}
                </div>
              </div>
              <div class="kml-features-list">
                ${expanded ? (kmlFile.features || []).map(feat => {
                  const safeFeatureId = escapeHtml(feat.id)
                  let iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
                  if (feat.type === 'LineString') {
                    iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>'
                  }
                  if (feat.type === 'Polygon') {
                    iconSvg = '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12 2 22 9 18 22 6 22 2 9"/></svg>'
                  }
                  iconSvg = getKmlMediaListIcon(feat) || iconSvg
                  const { displayName, accessibleName } = getKmlFeatureNamePresentation(feat)
                  return `
                    <div class="kml-feature-item" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}">
                      <div class="kml-feature-info" data-kml-action="focus-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}" aria-label="定位到${escapeHtml(accessibleName)}">
                        <span class="kml-feature-icon">${iconSvg}</span>
                        ${displayName ? `<span class="kml-feature-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>` : ''}
                      </div>
                      ${isEditingThis ? `
                        <button type="button" class="kml-feature-del" data-kml-action="delete-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}" title="删除标注"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg></button>
                      ` : ''}
                    </div>
                  `
                }).join('') : ''}
              </div>
            </div>
          </div>
        `
        }).join('') || '<div class="kml-empty">无已发布公共图层</div>')
        : ''}
    </div>
  `
  container.innerHTML = html
}

function focusFeature (map, kmlId, featureId) {
  const kmlFile = kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
  if (!kmlFile) return
  if (!isKmlEnabled(kmlFile)) {
    showAlert('该 KML 文件已隐藏，请先启用后查看。')
    return
  }

  const feature = kmlFile.features.find(f => f.id === featureId)
  if (!feature) return
  let layer = featureLayers.get(getFeatureLayerKey(kmlId, featureId))
  map.stop?.()

  if (feature.type === 'Point') {
    const point = getMapPoint(kmlFile, feature)
    const targetInView = Boolean(map.getBounds?.().contains?.(point))
    const plan = getKmlFeatureFocusPlan({
      type: feature.type,
      currentZoom: map.getZoom?.(),
      targetInView,
    })
    if (plan.method === 'set-view') map.setView(point, plan.zoom, { animate: false })
    else map.panInside?.(point, { padding: [40, 40], animate: false })
  } else {
    if (!layer) {
      renderKmlLayers(map, kmlFile, {
        incremental: true,
        includeFeatureIds: [String(featureId)],
      })
      layer = featureLayers.get(getFeatureLayerKey(kmlId, featureId))
    }
    if (!layer) return
    const bounds = layer.getBounds()
    const targetInView = Boolean(map.getBounds?.().contains?.(bounds))
    const plan = getKmlFeatureFocusPlan({ type: feature.type, targetInView })
    if (plan.method === 'fit-bounds') {
      map.fitBounds(bounds, { maxZoom: plan.maxZoom, animate: false, padding: [36, 36] })
    }
  }
  if (!layer) {
    renderKmlLayers(map, kmlFile, {
      incremental: true,
      includeFeatureIds: [String(featureId)],
    })
    layer = featureLayers.get(getFeatureLayerKey(kmlId, featureId))
  }
  if (!layer) return
  layer.openPopup()
}

function activateFeatureForMedia (map, item, options = {}) {
  const kmlId = String(item?.kmlId || '')
  const featureId = String(item?.featureId || '')
  if (!kmlId || !featureId) return
  const { kmlFile, feature } = getFeatureById(kmlId, featureId)
  let layer = featureLayers.get(getFeatureLayerKey(kmlId, featureId))
  if (!kmlFile || !feature || !isKmlEnabled(kmlFile)) return
  window.clearTimeout(mediaFeatureActivationTimer)
  map.stop?.()
  if (feature.type === 'Point') {
    const point = getMapPoint(kmlFile, feature)
    if (options.closePreview) map.setView(point, map.getZoom(), { animate: false })
    else map.panTo(point, { animate: true, duration: 0.28 })
  } else if (typeof layer?.getBounds === 'function') {
    map.fitBounds(layer.getBounds(), { maxZoom: 15, animate: !options.closePreview, duration: 0.28 })
  }
  if (!layer) {
    renderKmlLayers(map, kmlFile, {
      incremental: true,
      includeFeatureIds: [featureId],
    })
    layer = featureLayers.get(getFeatureLayerKey(kmlId, featureId))
  }
  if (!layer) return
  const delay = options.closePreview ? 0 : 300
  mediaFeatureActivationTimer = window.setTimeout(() => layer.openPopup(), delay)
}

async function handleEditFeature (map, kmlId, featureId) {
  const kmlFile = kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
  if (!kmlFile) return
  // Account KML summaries intentionally omit feature content until it is used.
  // Load the source before looking up the feature so an unloaded summary is
  // never mistaken for an empty file.
  if (kmlFile.contentLoaded === false && !(await loadAccountKmlFileForUse(kmlFile))) {
    await showAlert(kmlFile.loadError || '加载 KML 详情失败，未修改数据。')
    return
  }
  if (!isKmlEditable(kmlFile)) {
    await showAlert('当前账号只有 KML 查看权限，不能修改标注。')
    return
  }
  const feature = kmlFile.features.find(f => f.id === featureId)
  if (!feature) return
  const targetOptions = buildKmlOrganizationTargetOptions(kmlFile)
  const fields = [
    {
      name: 'name',
      label: '名称',
      type: 'text',
      required: false,
    },
    ...(feature.type === 'Point' ? [
      {
        name: 'pointKind',
        label: '点位类型',
        type: 'select',
        options: [
          { value: 'point', label: '普通点位' },
          { value: 'collection', label: '资源集合' },
        ],
      },
      buildKmlMarkerIconField(getEditableKmlMarkerIcon(feature)),
    ] : []),
    {
      name: 'description',
      label: '描述',
      type: 'textarea',
      hint: '可粘贴受支持的公开分享链接。',
    },
  ]
  if (!kmlFile.isPublic && targetOptions.length > 1) {
    fields.unshift({
      name: 'kmlId',
      label: '所属 KML',
      type: 'select',
      options: targetOptions,
    })
  }

  const result = await showEditDialog({
    title: '修改标注属性',
    fields,
    values: {
      kmlId,
      name: feature.name,
      pointKind: isKmlResourceCollectionFeature(feature) ? 'collection' : 'point',
      markerIcon: getEditableKmlMarkerIcon(feature),
      description: getEditableKmlDescription(feature.description),
    }
  })
  
  if (!result) return
  let resourceCollection = feature.resourceCollection || null
  let descriptionInput = result.description
  if (feature.type === 'Point' && result.pointKind === 'collection') {
    resourceCollection = await showKmlResourceCollectionEditor(resourceCollection || { version: 1, viewMode: 'grid', items: [] }, {
      title: result.name?.trim() || '编辑资源集合',
    })
    if (!resourceCollection) return
  } else if (feature.type === 'Point' && resourceCollection) {
    const conversion = await showChoiceDialog({
      title: '转换为普通点位',
      message: '该点位已有资源集合，请选择如何处理集合中的地址。',
      choices: [
        { text: '保留为描述链接', value: 'keep', class: 'app-dialog-primary' },
        { text: '移除集合', value: 'remove' },
      ],
    })
    if (!['keep', 'remove'].includes(conversion)) return
    if (conversion === 'keep') descriptionInput = appendKmlResourceCollectionLinks(descriptionInput, resourceCollection)
    resourceCollection = null
  }
  const enriched = await enrichKmlDescriptionWithShareLinks(descriptionInput, {
    previousDescription: feature.description,
  })
  const editedFeature = {
    ...feature,
    name: result.name.trim(),
    description: enriched.description.trim(),
  }
  if (resourceCollection) editedFeature.resourceCollection = resourceCollection
  else if (feature.type === 'Point') editedFeature.resourceCollection = null
  if (feature.type === 'Point') applyKmlMarkerIconSelection(editedFeature, result.markerIcon)
  else delete editedFeature.markerIcon

  const targetKmlId = String(result.kmlId || kmlId)
  if (targetKmlId !== kmlId) {
    const targetKmlFile = kmlList.find(file => file.id === targetKmlId)
    if (!targetKmlFile || !isKmlEditable(targetKmlFile)) {
      await showAlert('目标 KML 当前为只读，不能保存标注。')
      return
    }
    if (targetKmlFile.contentLoaded === false && !(await loadAccountKmlFileForUse(targetKmlFile))) {
      await showAlert(targetKmlFile.loadError || '加载目标 KML 详情失败，未修改数据。')
      return
    }
    const choice = await showChoiceDialog({
      title: '保存到其他 KML',
      message: `将此标注移动或复制到“${targetKmlFile.name}”？`,
      choices: [
        { text: '移动', value: 'move', class: 'app-dialog-primary' },
        { text: '复制', value: 'copy' },
      ],
    })
    if (!['move', 'copy'].includes(choice)) return

    const featurePatch = {
      name: editedFeature.name,
      description: editedFeature.description,
    }
    if (feature.type === 'Point') {
      featurePatch.markerIcon = editedFeature.markerIcon
      featurePatch.resourceCollection = editedFeature.resourceCollection
    }

    try {
      const transferred = transferKmlFeature(kmlList, {
        sourceKmlId: kmlId,
        targetKmlId,
        featureId,
        mode: choice,
        featurePatch,
      })
      if (!transferred.changed) return
      pushKmlHistory()
      kmlList = transferred.files
      expandedKmlIds.add(targetKmlId)
      rememberTargetKmlId(targetKmlId)
      saveToStorage()
      if (feature.type === 'Point') recordKmlMarkerRecentIcon(result.markerIcon)
      const nextSource = kmlList.find(file => file.id === kmlId)
      const nextTarget = kmlList.find(file => file.id === targetKmlId)
      if (nextSource) renderKmlLayers(map, nextSource)
      if (nextTarget) renderKmlLayers(map, nextTarget)
      updateKmlPanelUI(map)
    } catch (error) {
      await showAlert(error.message || '标注移动或复制失败。')
      return
    }
    if (enriched.warnings.length) {
      await showAlert(enriched.warnings.join('；'), { title: '标注已保存' })
    }
    return
  }

  pushKmlHistory()
  feature.name = editedFeature.name
  feature.description = editedFeature.description
  if (feature.type === 'Point') applyKmlMarkerIconSelection(feature, result.markerIcon)
  else delete feature.markerIcon
  if (feature.type === 'Point') {
    if (editedFeature.resourceCollection) feature.resourceCollection = editedFeature.resourceCollection
    else delete feature.resourceCollection
  }
  saveKmlChanges(kmlFile)
  if (feature.type === 'Point') recordKmlMarkerRecentIcon(result.markerIcon)

  renderKmlLayers(map, kmlFile)
  const layer = featureLayers.get(getFeatureLayerKey(kmlId, featureId))
  if (layer) setTimeout(() => layer.openPopup(), 100)

  updateKmlPanelUI(map)
  if (enriched.warnings.length) {
    await showAlert(enriched.warnings.join('；'), { title: '标注已保存' })
  }
}

async function handleDeleteFeature (map, kmlId, featureId) {
  const kmlFile = kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
  if (!kmlFile) return
  if (!isKmlEditable(kmlFile)) {
    await showAlert('当前账号只有 KML 查看权限，不能删除标注。')
    return
  }
  const confirmed = await showConfirm('确认删除此地图标注？')
  if (!confirmed) return
  
  const index = kmlFile.features.findIndex(f => f.id === featureId)
  if (index === -1) return
  
  kmlFile.features.splice(index, 1)
  saveKmlChanges(kmlFile)
  
  const layer = featureLayers.get(getFeatureLayerKey(kmlId, featureId))
  if (layer) {
    const group = kmlLayerGroups.get(kmlId)
    if (group) {
      group.removeLayer(layer)
    }
    featureLayers.delete(getFeatureLayerKey(kmlId, featureId))
  }
  
  updateKmlPanelUI(map)
}

async function handleCreateKmlFile (map) {
  if (!canWritePersonalKml()) {
    await showAlert('当前账号只有 KML 查看权限，不能新建文件。')
    return
  }
  const result = await showEditDialog({
    title: '新建 KML 文件',
    fields: [
      { name: 'name', label: '文件名称', type: 'text' },
    ],
    values: {
      name: `新建 KML ${kmlList.length + 1}`,
    },
  })

  const name = result?.name?.trim()
  if (!name) return

  const kmlFile = createKmlFile({ name })
  kmlList.splice(1, 0, kmlFile)
  expandKmlFileExclusively(kmlFile.id)
  rememberTargetKmlId(kmlFile.id)
  saveToStorage()
  renderKmlLayers(map, kmlFile)
  updateKmlPanelUI(map)
}

async function handleRenameKmlFile (map, kmlId) {
  if (!canWritePersonalKml()) {
    await showAlert('当前账号只有 KML 查看权限，不能重命名文件。')
    return
  }
  const kmlFile = kmlList.find(k => k.id === kmlId)
  if (!kmlFile) return
  if (!(await loadAccountKmlFileForUse(kmlFile))) {
    await showAlert(kmlFile.loadError || 'KML 文件详情加载失败')
    return
  }

  const result = await showEditDialog({
    title: '重命名 KML 文件',
    fields: [
      { name: 'name', label: '文件名称', type: 'text' },
    ],
    values: {
      name: kmlFile.name,
    },
  })

  const name = result?.name?.trim()
  if (!name || name === kmlFile.name) return

  kmlFile.name = name
  saveToStorage()
  updateKmlPanelUI(map)
}

async function createPointAtLatLng (map, latlng, options = {}) {
  if (!canWritePersonalKml() && !isEditingPublicKml) {
    await showAlert('当前账号只有 KML 查看权限，不能新增标注。')
    return
  }
  if (canWritePersonalKml()) ensureDefaultKmlFile()
  const targetOptions = buildKmlTargetOptions()
  const allowFileSelection = options.allowFileSelection !== false && targetOptions.length > 1
  const targetKmlId = resolveTargetKmlId(options.targetKmlId)
  const fields = [
    {
      name: 'name',
      label: '标注名称',
      type: 'text',
      required: false,
    },
    {
      name: 'pointKind',
      label: '点位类型',
      type: 'select',
      options: [
        { value: 'point', label: '普通点位' },
        { value: 'collection', label: '资源集合' },
      ],
    },
    buildKmlMarkerIconField('auto'),
    {
      name: 'description',
      label: '描述信息',
      type: 'textarea',
      hint: '可粘贴受支持的公开分享链接。',
    },
  ]

  if (allowFileSelection) {
    fields.unshift({
      name: 'kmlId',
      label: '保存到 KML 文件',
      type: 'select',
      options: targetOptions,
    })
  }

  // 在弹出对话框前绘制临时的标记点，提供直观的定位位置感知
  const tempMarker = L.marker(latlng).addTo(map)

  const result = await showEditDialog({
    title: '新增地图标注',
    fields,
    values: {
      kmlId: targetKmlId,
      name: '',
      pointKind: 'point',
      markerIcon: 'auto',
      description: '',
    },
  })

  // 对话框关闭后立即清除临时标记点
  tempMarker.remove()

  if (!result) return

  const selectedKmlId = allowFileSelection ? result.kmlId : targetKmlId
  const kmlFile = kmlList.find(k => k.id === selectedKmlId) || publicKmlList.find(k => k.id === selectedKmlId)
  if (!kmlFile || !isKmlEditable(kmlFile)) {
    await showAlert('目标 KML 当前为只读，不能新增标注。')
    return
  }
  if (!isKmlEnabled(kmlFile)) {
    showAlert('该 KML 文件已隐藏，请先启用后再新增标注。')
    return
  }

  let resourceCollection = null
  if (result.pointKind === 'collection') {
    resourceCollection = await showKmlResourceCollectionEditor({ version: 1, viewMode: 'grid', items: [] }, {
      title: result.name?.trim() || '新建资源集合',
    })
    if (!resourceCollection) return
  }
  const enriched = await enrichKmlDescriptionWithShareLinks(result.description)
  const newFeat = createPointFeature(kmlFile, latlng, {
    ...result,
    description: enriched.description,
    resourceCollection,
  })
  kmlFile.features.push(newFeat)
  expandedKmlIds.add(kmlFile.id)
  rememberTargetKmlId(kmlFile.id)
  saveKmlChanges(kmlFile)
  recordKmlMarkerRecentIcon(result.markerIcon)

  const group = kmlLayerGroups.get(kmlFile.id)
  const layer = renderFeature(map, kmlFile, newFeat)
  if (layer && group) {
    group.addLayer(layer)
  } else if (layer && !group) {
    renderKmlLayers(map, kmlFile)
  }

  updateKmlPanelUI(map)
  if (enriched.warnings.length) {
    await showAlert(enriched.warnings.join('；'), { title: '点位已保存' })
  }
}

function togglePickupMode (map, kmlId) {
  if (!isAddingPoint && kmlId && !canWritePersonalKml() && !isEditingPublicKml) {
    showAlert('当前账号只有 KML 查看权限，不能新增标注。')
    return
  }
  if (isAddingPoint) {
    isAddingPoint = false
    activeKmlIdForAdd = null
    map.getContainer().style.cursor = ''
    if (clickListener) {
      map.off('click', clickListener)
      clickListener = null
    }
    if (pickupToastElement) {
      pickupToastElement.remove()
      pickupToastElement = null
    }
  } else {
    isAddingPoint = true
    activeKmlIdForAdd = kmlId
    map.getContainer().style.cursor = 'crosshair'
    
    pickupToastElement = document.createElement('div')
    pickupToastElement.className = 'kml-pickup-toast'
    pickupToastElement.innerHTML = '🎯 请点击地图位置以添加点位标注'
    document.body.appendChild(pickupToastElement)
    
    clickListener = async (e) => {
      const latlng = e.latlng
      togglePickupMode(map, null)
      await createPointAtLatLng(map, latlng, {
        targetKmlId: kmlId,
        allowFileSelection: false,
      })
    }
    
    map.on('click', clickListener)
  }
}

function initLongPressPointCreation (map) {
  const container = map.getContainer()
  let pressState = null
  let lastLongPressAt = 0
  const activePointerIds = new Set()

  const clearPress = () => {
    if (pressState?.timer) {
      window.clearTimeout(pressState.timer)
    }
    pressState = null
  }

  const isInteractiveTarget = (target) => target.closest?.('.leaflet-control, .leaflet-marker-icon, .leaflet-popup, button, a, input, textarea, select')

  const onPointerDown = (event) => {
    activePointerIds.add(event.pointerId)
    if (activePointerIds.size > 1 || event.isPrimary === false) {
      clearPress()
      return
    }
    if (isAddingPoint || event.button > 0 || isInteractiveTarget(event.target)) return

    try {
      container.setPointerCapture?.(event.pointerId)
    } catch (err) {
      // 部分浏览器不允许对当前事件捕获指针，忽略即可。
    }

    const startX = event.clientX
    const startY = event.clientY
    const latlng = map.mouseEventToLatLng(event)
    pressState = {
      pointerId: event.pointerId,
      startX,
      startY,
      timer: window.setTimeout(async () => {
        if (!pressState || activePointerIds.size !== 1) return
        lastLongPressAt = Date.now()
        const targetLatLng = latlng
        clearPress()
        await createPointAtLatLng(map, targetLatLng, {
          allowFileSelection: true,
        })
      }, LONG_PRESS_DELAY_MS),
    }
  }

  const onPointerMove = (event) => {
    if (!pressState || event.pointerId !== pressState.pointerId) return
    const deltaX = event.clientX - pressState.startX
    const deltaY = event.clientY - pressState.startY
    if (Math.hypot(deltaX, deltaY) > LONG_PRESS_MOVE_TOLERANCE) {
      clearPress()
    }
  }

  const onPointerUp = (event) => {
    activePointerIds.delete(event.pointerId)
    if (pressState && event.pointerId === pressState.pointerId) {
      clearPress()
    }
  }

  const onTouchChange = (event) => {
    if (event.touches?.length > 1) {
      clearPress()
    }
  }

  const onContextMenu = (event) => {
    if (Date.now() - lastLongPressAt < 1200) {
      event.preventDefault()
    }
  }

  container.addEventListener('pointerdown', onPointerDown, { passive: true })
  container.addEventListener('pointermove', onPointerMove, { passive: true })
  container.addEventListener('pointerup', onPointerUp, { passive: true })
  container.addEventListener('pointercancel', onPointerUp, { passive: true })
  container.addEventListener('touchstart', onTouchChange, { passive: true })
  container.addEventListener('touchmove', onTouchChange, { passive: true })
  container.addEventListener('contextmenu', onContextMenu)

  map.on('unload', () => {
    clearPress()
    activePointerIds.clear()
    container.removeEventListener('pointerdown', onPointerDown)
    container.removeEventListener('pointermove', onPointerMove)
    container.removeEventListener('pointerup', onPointerUp)
    container.removeEventListener('pointercancel', onPointerUp)
    container.removeEventListener('touchstart', onTouchChange)
    container.removeEventListener('touchmove', onTouchChange)
    container.removeEventListener('contextmenu', onContextMenu)
  })
}

/**
 * 视口变化时按需重渲染 KML 图层（debounce 150ms + setTimeout）。
 * 独立于定位生命周期，确保查看已保存轨迹时也能动态渲染。
 * 普通大型 KML 也使用缓冲视口增量挂载点位；小文件仍保持静态图层。
 * 优化：若当前视口仍在上次渲染的缓冲范围内则跳过，避免不必要的重渲染。
 * 使用 setTimeout(0) 替代 requestAnimationFrame，让浏览器先完成绘制再执行渲染。
 */
function scheduleKmlViewportRerender (map) {
  if (kmlViewportRerenderTimer) clearTimeout(kmlViewportRerenderTimer)
  if (kmlViewportRenderTask) clearTimeout(kmlViewportRenderTask)
  kmlViewportRerenderTimer = setTimeout(() => {
    kmlViewportRerenderTimer = null
    if (getActiveShare() && sharePointClusteringConfig?.enabled) {
      kmlViewportRenderTask = setTimeout(() => {
        kmlViewportRenderTask = null
        renderAllKmls(map)
      }, 0)
      return
    }
    const managedKmlFiles = [...kmlList, ...publicKmlList].filter(kmlFile =>
      kmlFile.enabled && (kmlFile.isLiveTrack || shouldVirtualizeKmlPoints(kmlFile.features?.length)))
    if (!managedKmlFiles.length) return

    const viewportOptions = getViewportOptions2d(map)
    scheduleKmlPointLabelSync(map)
    if (viewportOptions.viewportBounds && managedKmlFiles.every(kmlFile => (
      isViewportWithinCache2d(kmlFile, viewportOptions.viewportBounds, viewportOptions.zoom)
    ))) {
      return
    }

    kmlViewportRenderTask = setTimeout(() => {
      kmlViewportRenderTask = null
      managedKmlFiles.forEach(kmlFile => {
        if (!viewportOptions.viewportBounds || !isViewportWithinCache2d(kmlFile, viewportOptions.viewportBounds, viewportOptions.zoom)) {
          renderKmlLayers(map, kmlFile, { incremental: true })
        }
      })
    }, 0)
  }, 150)
}

function bindKmlViewportRerender (map) {
  if (kmlViewportRerenderBinding?.map === map) return
  kmlViewportRerenderBinding?.unbind?.()
  const rerender = () => scheduleKmlViewportRerender(map)
  const unbind = () => {
    map.off('moveend zoomend', rerender)
    map.off('unload', unbind)
    cancelKmlScheduledTasks()
    if (kmlViewportRerenderBinding?.map === map) kmlViewportRerenderBinding = null
  }
  map.on('moveend zoomend', rerender)
  map.on('unload', unbind)
  kmlViewportRerenderBinding = { map, unbind }
}

function scheduleKmlPointLabelSync (map) {
  cancelKmlPointLabelSync()
  kmlPointLabelSyncTimer = window.setTimeout(() => {
    kmlPointLabelSyncTimer = null
    syncKmlPointLabels(map)
  }, KML_POINT_LABEL_DELAY_MS)
}

function bindKmlMapInteractionState (map) {
  if (kmlMapInteractionBinding?.map === map) return
  kmlMapInteractionBinding?.unbind?.()
  const container = map.getContainer?.()
  const begin = () => {
    container?.classList.add('kml-map-interacting')
    cancelKmlPointLabelSync()
    clearKmlPointLabels()
  }
  const end = () => {
    container?.classList.remove('kml-map-interacting')
    scheduleKmlPointLabelSync(map)
  }
  const unbind = () => {
    map.off('movestart zoomstart', begin)
    map.off('moveend zoomend', end)
    map.off('unload', unbind)
    container?.classList.remove('kml-map-interacting')
    if (kmlMapInteractionBinding?.map === map) kmlMapInteractionBinding = null
  }
  map.on('movestart zoomstart', begin)
  map.on('moveend zoomend', end)
  map.on('unload', unbind)
  kmlMapInteractionBinding = { map, unbind }
}

function getKmlFeatureListIcon (feature) {
  const geometryIcon = feature.type === 'LineString'
    ? '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/></svg>'
    : feature.type === 'Polygon'
      ? '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><polygon points="12 2 22 9 18 22 6 22 2 9"/></svg>'
      : '<svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
  return getKmlMediaListIcon(feature) || geometryIcon
}

function extendKmlBounds (bounds, coordinates) {
  if (!Array.isArray(coordinates)) return
  if (
    coordinates.length >= 2 &&
    Number.isFinite(Number(coordinates[0])) &&
    Number.isFinite(Number(coordinates[1]))
  ) {
    bounds.extend([Number(coordinates[1]), Number(coordinates[0])])
    return
  }
  coordinates.forEach(item => extendKmlBounds(bounds, item))
}

function getKmlFilesBounds (files) {
  const bounds = L.latLngBounds([])
  files.forEach(kmlFile => {
    const features = kmlFile.features || []
    features.forEach(feature => {
      try {
        extendKmlBounds(bounds, getMapCoordinates(kmlFile, feature))
      } catch (error) {
        console.warn(`Failed to calculate KML bounds for ${kmlFile.id}`, error)
      }
    })
  })
  return bounds
}

function fitKmlFilesBounds (map, files, options = {}) {
  const bounds = getKmlFilesBounds(files)
  if (!bounds.isValid()) return false
  map.fitBounds(bounds, {
    padding: options.padding || [48, 48],
    maxZoom: Number.isFinite(options.maxZoom) ? options.maxZoom : 16,
    animate: options.animate !== false,
    duration: Number.isFinite(options.duration) ? options.duration : 0.6,
  })
  return true
}

async function handleTwoBuluImport (map, button, correctionInput) {
  if (!canImportTwoBuluKml()) {
    await showAlert('请先登录具备个人 KML 写权限的账号后再从两步路导入。')
    return
  }

  const input = await showTwoBuluImportDialog({
    coordCorrection: correctionInput?.checked === false ? 'none' : KML_COORD_CORRECTION,
  })
  if (!input) return

  const originalText = button?.textContent || '从两步路公开链接导入'
  if (button) {
    button.disabled = true
    button.textContent = '正在读取并导入…'
  }

  let helperResult = null
  let savedResult = null
  try {
    helperResult = await requestTwoBuluKml(input)
    const result = await apiRequest('/kml/import/2bulu/browser-helper', {
      method: 'POST',
      body: {
        ...input,
        protocolVersion: TWO_BULU_HELPER_PROTOCOL_VERSION,
        helperVersion: helperResult.helperVersion,
        name: helperResult.name,
        kmlText: helperResult.kmlText,
        sourceMode: helperResult.sourceMode,
        completeness: helperResult.completeness,
        warnings: helperResult.warnings,
      },
    })
    if (!result?.id || !Array.isArray(result.features)) {
      throw new Error('两步路导入响应缺少有效 KML 数据，请刷新后重试。')
    }
    savedResult = result

    const importedKml = normalizeKmlFile(result)
    if (!registerKmlAccountDocument(importedKml)) {
      clearTwoBuluImportRequest(input)
      await finalizeTwoBuluImport(helperResult, {
        status: 'success',
        message: '轨迹已保存到账号；当前地图登录状态已变化，请刷新页面后查看。',
      })
      await showAlert('轨迹已保存到账号，但当前页面登录状态已变化。请重新登录或刷新页面后查看。')
      return
    }

    const existingIndex = kmlList.findIndex(item => item.id === importedKml.id)
    if (existingIndex >= 0) kmlList.splice(existingIndex, 1, importedKml)
    else kmlList.splice(1, 0, importedKml)
    expandKmlFileExclusively(importedKml.id)
    rememberTargetKmlId(importedKml.id)
    saveToStorage()

    renderKmlLayers(map, importedKml)
    updateKmlPanelUI(map)
    fitKmlFilesBounds(map, [importedKml])
    clearTwoBuluImportRequest(input)
    await finalizeTwoBuluImport(helperResult, {
      status: 'success',
      message: twoBuluImportResultMessage(result),
    })
    await showAlert(twoBuluImportResultMessage(result), { title: '导入完成' })
  } catch (error) {
    if (helperResult) {
      await finalizeTwoBuluImport(helperResult, {
        status: savedResult ? 'success' : 'failed',
        message: savedResult
          ? `轨迹已保存到账号，但当前地图加载失败：${error?.message || '请刷新页面后查看。'}`
          : `map-service 保存失败：${error?.message || '请返回地图页面查看原因后重试。'}`,
      })
      if (savedResult) clearTwoBuluImportRequest(input)
    }
    await showAlert(error?.message || '读取两步路公开轨迹失败，请稍后重试或改用本地 KML 导入。')
  } finally {
    if (button) {
      button.disabled = false
      button.textContent = originalText
    }
  }
}

function bindKmlPopupActions (map) {
  map.on('popupopen', (event) => {
    const popup = event.popup
    const container = popup.getElement()
    if (!container) return

    preventAllKmlPropagation(container)
    const detailBtn = container.querySelector('.kml-detail-btn')
    const popupFeatureId = detailBtn?.getAttribute('data-feature-id')
    const popupKmlId = detailBtn?.getAttribute('data-kml-id')
    if (popupKmlId && popupFeatureId) {
      const { kmlFile, feature } = getFeatureById(popupKmlId, popupFeatureId)
      if (kmlFile && feature) bindKmlFeaturePopupMediaActions(container, kmlFile, feature)
    }

    const editBtn = container.querySelector('.kml-edit-btn')
    const deleteBtn = container.querySelector('.kml-delete-btn')
    if (detailBtn && detailBtn.dataset.kmlDetailBound !== 'true') {
      detailBtn.dataset.kmlDetailBound = 'true'
      const kmlId = detailBtn.getAttribute('data-kml-id')
      const featureId = detailBtn.getAttribute('data-feature-id')
      detailBtn.addEventListener('click', (clickEvent) => {
        clickEvent.stopPropagation()
        clickEvent.preventDefault()
        const { kmlFile, feature } = getFeatureById(kmlId, featureId)
        if (kmlFile && feature) openKmlFeatureContentPanel(kmlFile, feature)
      })
    }

    if (editBtn && editBtn.dataset.kmlEditBound !== 'true') {
      editBtn.dataset.kmlEditBound = 'true'
      const kmlId = editBtn.getAttribute('data-kml-id')
      const featureId = editBtn.getAttribute('data-feature-id')
      editBtn.addEventListener('click', (clickEvent) => {
        clickEvent.stopPropagation()
        clickEvent.preventDefault()
        handleEditFeature(map, kmlId, featureId)
      })
    }

    if (deleteBtn && deleteBtn.dataset.kmlDeleteBound !== 'true') {
      deleteBtn.dataset.kmlDeleteBound = 'true'
      const kmlId = deleteBtn.getAttribute('data-kml-id')
      const featureId = deleteBtn.getAttribute('data-feature-id')
      deleteBtn.addEventListener('click', (clickEvent) => {
        clickEvent.stopPropagation()
        clickEvent.preventDefault()
        map.closePopup(popup)
        handleDeleteFeature(map, kmlId, featureId)
      })
    }
  })
}

function renderShareKmlPanel (map) {
  const container = document.getElementById('kml-files-list')
  const share = getActiveShare()
  if (!container || !share) return
  const groupsById = new Map()
  const manifestItems = Array.isArray(share.manifest.items) ? share.manifest.items : []
  manifestItems.forEach((item, index) => {
    const id = item?.directoryId == null ? '' : String(item.directoryId)
    if (!groupsById.has(id)) {
      groupsById.set(id, {
        id: id || null,
        name: String(item?.directoryName || (id ? '未命名目录' : '未分类')),
        position: Number.isFinite(Number(item?.directoryPosition)) ? Number(item.directoryPosition) : index,
        files: [],
      })
    }
    const file = publicKmlList.find(candidate => candidate.id === item?.shareItemId)
    if (file) groupsById.get(id).files.push(file)
  })
  // Keep compatibility with older manifests and failed detail requests: a
  // file not present in the manifest grouping remains reachable in 未分类.
  const uncategorized = groupsById.get('') || {
    id: null,
    name: '未分类',
    position: Number.MAX_SAFE_INTEGER,
    files: [],
  }
  publicKmlList.forEach(file => {
    if (![...groupsById.values()].some(group => group.files.includes(file))) uncategorized.files.push(file)
  })
  groupsById.set('', uncategorized)
  const groups = [...groupsById.values()]
    .filter(group => group.files.length)
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, 'zh-CN'))
  const renderFile = kmlFile => {
    const safeKmlId = escapeHtml(kmlFile.id)
    const enabled = isKmlEnabled(kmlFile)
    const expanded = expandedKmlIds.has(kmlFile.id)
    const actionsExpanded = expandedKmlActionIds.has(kmlFile.id)
    const features = kmlFile.features || []
    const visibilityTitle = enabled ? '隐藏此 KML 文件' : '显示此 KML 文件'
    return `
      <article class="kml-file-card ${enabled ? '' : 'is-disabled'}" data-kml-card-id="${safeKmlId}">
        <div class="kml-file-head ${expanded ? 'is-expanded' : ''}" data-share-kml-action="toggle-collapse" data-kml-id="${safeKmlId}" aria-expanded="${expanded}" title="展开或收起 KML 详情和要素">
          <div class="kml-file-title">
            <span class="kml-file-name" title="${escapeHtml(kmlFile.name)}">${escapeHtml(kmlFile.name)}</span>
            <span class="kml-file-count">${kmlFile.contentLoaded === false ? (kmlFile.featureCount || 0) : features.length}</span>
            ${kmlFile.loadError ? '<span class="kml-file-state">加载失败</span>' : '<span class="kml-file-state">只读</span>'}
            ${enabled ? '' : '<span class="kml-file-state">已隐藏</span>'}
          </div>
          <div class="kml-file-actions">
            <button type="button" class="kml-file-btn kml-visibility-btn ${enabled ? 'is-visible' : 'is-hidden'}" data-share-kml-action="toggle-visible" data-kml-id="${safeKmlId}" aria-label="${visibilityTitle}" aria-pressed="${enabled}" title="${visibilityTitle}"><span class="kml-eye-icon" aria-hidden="true"></span></button>
            <button type="button" class="kml-file-btn kml-file-more-toggle" data-share-kml-action="toggle-file-actions" data-kml-id="${safeKmlId}" aria-expanded="${actionsExpanded}" aria-controls="file-actions-${safeKmlId}" aria-label="${actionsExpanded ? '收起' : '展开'} KML 文件操作" title="${actionsExpanded ? '收起更多操作' : '更多操作'}"><svg class="svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></button>
          </div>
        </div>
        <div class="kml-file-more-actions" id="file-actions-${safeKmlId}" ${actionsExpanded ? '' : 'hidden'}>
          ${features.length ? `<button type="button" class="kml-file-btn" data-share-kml-action="focus-layer" data-kml-id="${safeKmlId}" title="定位到此 KML 的完整范围" aria-label="定位到此 KML 的完整范围">⌖</button>` : ''}
          ${kmlFile.allowDownload ? `<button type="button" class="kml-file-btn" data-share-kml-action="export" data-kml-id="${safeKmlId}" title="下载 KML" aria-label="下载 KML">⇩</button>` : ''}
        </div>
        <div class="kml-file-detail${expanded ? ' is-expanded' : ''}" id="features-${safeKmlId}" ${expanded ? '' : 'hidden'}>
          ${expanded && kmlFile.contentLoaded !== false ? renderKmlFileOverview(kmlFile) : ''}
          ${kmlFile.loadError ? `<p class="kml-share-item-error">${escapeHtml(kmlFile.loadError)}</p>` : ''}
          <div class="kml-features-list">
            ${expanded && kmlFile.contentLoaded !== false ? features.map(feature => {
              const safeFeatureId = escapeHtml(feature.id)
              const { displayName, accessibleName } = getKmlFeatureNamePresentation(feature)
              return `
                <div class="kml-feature-item" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}">
                  <div class="kml-feature-info" data-share-kml-action="focus-feature" data-kml-id="${safeKmlId}" data-feature-id="${safeFeatureId}" aria-label="定位到${escapeHtml(accessibleName)}">
                    <span class="kml-feature-icon">${getKmlFeatureListIcon(feature)}</span>
                    ${displayName ? `<span class="kml-feature-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>` : ''}
                  </div>
                </div>
              `
            }).join('') || (kmlFile.loadError ? '' : (kmlFile.contentLoaded === false ? '<div class="kml-empty">展开后加载内容…</div>' : '<div class="kml-empty">此 KML 没有可显示的点、线或面</div>')) : ''}
          </div>
        </div>
      </article>
    `
  }
  container.innerHTML = `
    <section class="kml-share-summary">
      <strong>${escapeHtml(share.manifest.title || 'KML 分享')}</strong>
      ${share.manifest.description ? `<p>${escapeHtml(share.manifest.description)}</p>` : ''}
      <span>${publicKmlList.length} 个只读 KML</span>
    </section>
    ${groups.map(group => {
      const enabledCount = group.files.filter(isKmlEnabled).length
      const groupEnabled = enabledCount === group.files.length
      const groupId = escapeHtml(group.id || '')
      const action = groupEnabled ? '隐藏' : '显示'
      return `<section class="kml-directory-group kml-share-directory-group" data-share-directory-id="${groupId}">
        <header class="kml-directory-head">
          <span class="kml-directory-name"><span class="kml-directory-label" title="${escapeHtml(group.name)}">${escapeHtml(group.name)}</span><span class="kml-file-count">${group.files.length}</span></span>
          <button type="button" class="kml-file-btn kml-directory-visibility ${groupEnabled ? 'is-visible' : 'is-hidden'}" data-share-kml-action="toggle-directory-visible" data-directory-id="${groupId}" aria-label="${action}${escapeHtml(group.name)}" title="${action}${escapeHtml(group.name)}"><span class="kml-eye-icon" aria-hidden="true"></span></button>
        </header>
        <div class="kml-directory-files">${group.files.map(renderFile).join('')}</div>
      </section>`
    }).join('')}
  `
}

async function initShareKmlSupport (map, options = {}) {
  window.getActiveKmlMarkers = getActiveKmlMarkers
  window.activateKmlFeatureForMedia = (item, options) => activateFeatureForMedia(map, item, options)
  kmlList = []
  sharePointClusteringConfig = getActiveShare()?.manifest?.viewConfig?.kmlPointClustering || { enabled: false }
  publicKmlList = await loadActiveShareFiles()
  expandedKmlIds.clear()
  expandedKmlActionIds.clear()
  const firstExpandable = publicKmlList.find(kmlFile => !kmlFile.loadError && (kmlFile.features || []).length)
  if (firstExpandable) expandedKmlIds.add(firstExpandable.id)
  if (options.fitShareView !== false) {
    fitKmlFilesBounds(
      map,
      publicKmlList.filter(kmlFile => isKmlEnabled(kmlFile) && !kmlFile.loadError),
      { animate: false }
    )
  }
  renderAllKmls(map)
  renderShareKmlPanel(map)
  const panel = document.getElementById('kml-panel')
  const dropzone = document.getElementById('kml-import-dropzone')
  const createButton = panel?.querySelector('[data-kml-action="create-file"]')
  const twoBuluImportButton = panel?.querySelector('[data-kml-action="import-2bulu"]')
  const correctionOption = panel?.querySelector('.kml-import-option')
  if (dropzone) dropzone.hidden = true
  if (createButton) createButton.hidden = true
  if (twoBuluImportButton) twoBuluImportButton.hidden = true
  if (correctionOption) correctionOption.hidden = true
  if (!panel) return

  L.DomEvent.disableScrollPropagation(panel)
  L.DomEvent.disableClickPropagation(panel)
  window.toggleKmlPanel = () => {
    panel.hidden = !panel.hidden
    if (!panel.hidden) renderShareKmlPanel(map)
  }
  panel.querySelector('.kml-close-btn')?.addEventListener('click', () => {
    panel.hidden = true
  })
  panel.addEventListener('click', async event => {
    const target = event.target.closest('[data-share-kml-action]')
    if (!target) return
    const action = target.dataset.shareKmlAction
    if (action === 'toggle-file-actions') {
      const kmlId = String(target.dataset.kmlId || '')
      if (expandedKmlActionIds.has(kmlId)) expandedKmlActionIds.delete(kmlId)
      else expandedKmlActionIds.add(kmlId)
      renderShareKmlPanel(map)
      return
    }
    if (action === 'toggle-directory-visible') {
      const directoryId = String(target.dataset.directoryId || '')
      const files = publicKmlList.filter(file => String(file.directoryId || '') === directoryId)
      if (!files.length) return
      const enabled = !files.every(isKmlEnabled)
      if (enabled) {
        const visibilityBeforeLoad = files.map(file => file.enabled)
        const loaded = await loadKmlFilesWithConcurrency(files, file => loadSharedKmlFileForUse(file))
        if (!loaded.every(Boolean)) {
          files.forEach((file, index) => { file.enabled = visibilityBeforeLoad[index] })
          await showAlert('目录中部分分享 KML 详情加载失败，未修改显隐状态。')
          renderShareKmlPanel(map)
          return
        }
        files.forEach(file => { file.enabled = true })
      } else {
        files.forEach(file => { file.enabled = false })
      }
      if (sharePointClusteringConfig?.enabled) renderAllKmls(map)
      else files.forEach(file => renderKmlLayers(map, file))
      renderShareKmlPanel(map)
      return
    }
    const kmlFile = publicKmlList.find(item => item.id === target.dataset.kmlId)
    if (!kmlFile) return
    if (action === 'toggle-collapse') {
      const willExpand = !expandedKmlIds.has(kmlFile.id)
      if (willExpand && kmlFile.contentLoaded === false) await loadSharedKmlFileForUse(kmlFile)
      if (willExpand) expandedKmlIds.add(kmlFile.id)
      else expandedKmlIds.delete(kmlFile.id)
      if (willExpand && kmlFile.contentLoaded) renderKmlLayers(map, kmlFile)
      renderShareKmlPanel(map)
    } else if (action === 'toggle-visible') {
      const nextEnabled = !kmlFile.enabled
      if (nextEnabled && !(await loadSharedKmlFileForUse(kmlFile, { enableOnSuccess: true }))) {
        await showAlert(kmlFile.loadError || '加载分享 KML 详情失败')
        renderShareKmlPanel(map)
        return
      }
      if (!nextEnabled) kmlFile.enabled = false
      if (sharePointClusteringConfig?.enabled) renderAllKmls(map)
      else renderKmlLayers(map, kmlFile)
      renderShareKmlPanel(map)
    } else if (action === 'focus-layer') {
      if (!isKmlEnabled(kmlFile)) {
        showAlert('该 KML 文件已隐藏，请先启用后查看。')
        return
      }
      fitKmlFilesBounds(map, [kmlFile])
    } else if (action === 'focus-feature' && target.dataset.featureId) {
      if (kmlFile.contentLoaded === false && !(await loadSharedKmlFileForUse(kmlFile))) {
        await showAlert(kmlFile.loadError || '加载分享 KML 详情失败')
        renderShareKmlPanel(map)
        return
      }
      focusFeature(map, kmlFile.id, target.dataset.featureId)
    } else if (action === 'export' && kmlFile.allowDownload) {
      if (kmlFile.contentLoaded === false && !(await loadSharedKmlFileForUse(kmlFile))) {
        await showAlert(kmlFile.loadError || '获取分享 KML 数据失败')
        renderShareKmlPanel(map)
        return
      }
      downloadKmlFile(kmlFile.name, generateKmlText(kmlFile.name, kmlFile.features, kmlFile.description))
    }
  })
}

function bindKmlFeatureOrganizationEvents (panel, map) {
  if (!panel || panel.dataset.kmlFeatureOrganizationBound === 'true') return
  panel.dataset.kmlFeatureOrganizationBound = 'true'
  let dragState = null
  let activeDropTarget = null

  const clearDropState = () => {
    activeDropTarget?.classList.remove('is-kml-drop-target')
    panel.querySelectorAll('.is-kml-drop-target').forEach(element => element.classList.remove('is-kml-drop-target'))
    panel.querySelectorAll('.is-kml-dragging').forEach(element => element.classList.remove('is-kml-dragging'))
    activeDropTarget = null
  }

  const resolveDropTarget = event => {
    const element = event.target.closest?.('[data-kml-drop-target]')
    if (!element || !panel.contains(element)) return null
    const targetKmlId = String(element.dataset.kmlId || '')
    const targetKml = kmlList.find(file => file.id === targetKmlId)
    if (!targetKml || !isKmlEditable(targetKml)) return null
    return {
      element,
      targetKml,
      targetKmlId,
      beforeFeatureId: element.dataset.kmlDropTarget === 'feature'
        ? String(element.dataset.featureId || '')
        : '',
    }
  }

  panel.addEventListener('dragstart', event => {
    const item = event.target.closest?.('[data-kml-draggable="true"]')
    if (!item || !canWritePersonalKml()) return
    const sourceKmlId = String(item.dataset.kmlId || '')
    const featureId = String(item.dataset.featureId || '')
    const sourceKml = kmlList.find(file => file.id === sourceKmlId)
    if (!sourceKmlId || !featureId || !sourceKml || !isKmlEditable(sourceKml)) {
      event.preventDefault()
      return
    }
    dragState = { sourceKmlId, featureId }
    item.classList.add('is-kml-dragging')
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copyMove'
      event.dataTransfer.setData('application/x-map-service-kml-feature', JSON.stringify(dragState))
      event.dataTransfer.setData('text/plain', featureId)
    }
  })

  panel.addEventListener('dragover', event => {
    if (!dragState) return
    const target = resolveDropTarget(event)
    if (!target) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    if (activeDropTarget !== target.element) {
      activeDropTarget?.classList.remove('is-kml-drop-target')
      activeDropTarget = target.element
      activeDropTarget.classList.add('is-kml-drop-target')
    }
  })

  panel.addEventListener('dragleave', event => {
    if (!activeDropTarget || activeDropTarget.contains(event.relatedTarget)) return
    activeDropTarget.classList.remove('is-kml-drop-target')
    activeDropTarget = null
  })

  panel.addEventListener('drop', async event => {
    if (!dragState) return
    const target = resolveDropTarget(event)
    event.preventDefault()
    event.stopPropagation()
    const currentDrag = dragState
    dragState = null
    clearDropState()
    if (!target) return

    let mode = 'move'
    if (target.targetKmlId !== currentDrag.sourceKmlId) {
      const sourceKml = kmlList.find(file => file.id === currentDrag.sourceKmlId)
      if (!sourceKml) return
      mode = await showChoiceDialog({
        title: '整理 KML 要素',
        message: `将此标注移动或复制到“${target.targetKml.name}”？`,
        choices: [
          { text: '移动', value: 'move', class: 'app-dialog-primary' },
          { text: '复制', value: 'copy' },
        ],
      })
      if (!['move', 'copy'].includes(mode)) return
    }

    const sourceKml = kmlList.find(file => file.id === currentDrag.sourceKmlId)
    const targetKml = kmlList.find(file => file.id === target.targetKmlId)
    // Dragging can originate from a collapsed/hidden summary. Resolve both
    // files before transferKmlFeature so a failed detail request cannot cause
    // source removal or an empty target overwrite.
    const filesToLoad = [sourceKml, targetKml]
      .filter((file, index, files) => file && files.findIndex(item => item?.id === file.id) === index)
    for (const file of filesToLoad) {
      if (file.contentLoaded === false && !(await loadAccountKmlFileForUse(file))) {
        await showAlert(file.loadError || '加载 KML 详情失败，未修改数据。')
        return
      }
    }

    try {
      const transferred = transferKmlFeature(kmlList, {
        sourceKmlId: currentDrag.sourceKmlId,
        targetKmlId: target.targetKmlId,
        featureId: currentDrag.featureId,
        beforeFeatureId: target.beforeFeatureId,
        mode,
      })
      if (!transferred.changed) return
      pushKmlHistory()
      kmlList = transferred.files
      expandedKmlIds.add(target.targetKmlId)
      rememberTargetKmlId(target.targetKmlId)
      saveToStorage()
      const sourceKml = kmlList.find(file => file.id === currentDrag.sourceKmlId)
      const targetKml = kmlList.find(file => file.id === target.targetKmlId)
      if (sourceKml) renderKmlLayers(map, sourceKml)
      if (targetKml && targetKml !== sourceKml) renderKmlLayers(map, targetKml)
      updateKmlPanelUI(map)
    } catch (error) {
      await showAlert(error.message || 'KML 要素整理失败。')
    }
  })

  panel.addEventListener('dragend', () => {
    dragState = null
    clearDropState()
  })
}

function bindKmlFileOrganizationEvents (panel, map) {
  if (!panel || panel.dataset.kmlFileOrganizationBound === 'true') return
  panel.dataset.kmlFileOrganizationBound = 'true'
  let dragState = null
  panel.addEventListener('dragstart', event => {
    if (event.target.closest?.('button, input, select, textarea')) return
    const item = event.target.closest?.('[data-kml-file-draggable="true"]')
    if (!item || !canWritePersonalKml()) return
    const file = kmlList.find(candidate => candidate.id === item.dataset.kmlId)
    if (!file || file.isDefault) return event.preventDefault()
    dragState = { kmlId: file.id }
    item.classList.add('is-kml-file-dragging')
    event.dataTransfer?.setData('application/x-map-service-kml-file', JSON.stringify(dragState))
    event.dataTransfer?.setData('text/plain', file.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  })
  panel.addEventListener('dragover', event => {
    if (!dragState) return
    const target = event.target.closest?.('[data-kml-card-id], .kml-directory-group')
    if (!target || !panel.contains(target)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    target.classList.add('is-kml-file-drop-target')
  })
  panel.addEventListener('drop', async event => {
    if (!dragState) return
    const sourceId = dragState.kmlId
    dragState = null
    panel.querySelectorAll('.is-kml-file-drop-target, .is-kml-file-dragging').forEach(el => el.classList.remove('is-kml-file-drop-target', 'is-kml-file-dragging'))
    const target = event.target.closest?.('[data-kml-card-id], .kml-directory-group')
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    const source = kmlList.find(file => file.id === sourceId)
    if (!source) return
    const targetCard = target.closest?.('[data-kml-card-id]')
    const targetFile = targetCard ? kmlList.find(file => file.id === targetCard.dataset.kmlCardId) : null
    if (targetFile && targetFile.id === source.id) return
    const directoryId = targetFile ? directoryKey(targetFile) : String(target.dataset.kmlDirectoryId || '') || null
    const beforeId = targetFile && targetFile.id !== source.id ? targetFile.id : null
    try {
      const moved = isAccountKmlMode()
        ? await apiRequest(`/kml/files/${encodeURIComponent(source.id)}/move`, { method: 'POST', body: { directoryId, beforeId } })
        : null
      const sourceIndex = kmlList.indexOf(source)
      const sourceDirectoryId = directoryKey(source)
      kmlList.splice(sourceIndex, 1)
      source.directoryId = directoryId
      source.directoryName = directoryForFile({ directoryId })?.name || ''
      const sourceSiblings = kmlList
        .filter(file => file.status !== 'trashed' && directoryKey(file) === sourceDirectoryId)
        .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
      sourceSiblings.forEach((file, index) => { file.position = index })
      const siblings = kmlList
        .filter(file => file.status !== 'trashed' && directoryKey(file) === String(directoryId || ''))
        .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
      const insertAt = beforeId ? kmlList.indexOf(targetFile) : (siblings.length ? kmlList.indexOf(siblings[siblings.length - 1]) + 1 : kmlList.length)
      kmlList.splice(Math.max(0, insertAt), 0, source)
      const targetOrderIndex = beforeId ? siblings.findIndex(file => file.id === beforeId) : siblings.length
      siblings.splice(targetOrderIndex < 0 ? siblings.length : targetOrderIndex, 0, source)
      siblings.forEach((file, index) => { file.position = index })
      if (isAccountKmlMode()) commitAccountKmlOrganizationDocuments(moved?.affectedDocuments || [moved])
      // Directory moves are persisted by the dedicated account endpoint. Do
      // not enqueue the whole KML document sync for this metadata-only change.
      if (!isAccountKmlMode()) saveToStorage()
      updateKmlPanelUI(map)
    } catch (error) {
      await showAlert(error?.message || '移动 KML 文件失败')
    }
  })
  panel.addEventListener('dragend', () => {
    dragState = null
    panel.querySelectorAll('.is-kml-file-drop-target, .is-kml-file-dragging').forEach(el => el.classList.remove('is-kml-file-drop-target', 'is-kml-file-dragging'))
  })
}

function bindKmlDirectoryOrganizationEvents (panel, map) {
  if (!panel || panel.dataset.kmlDirectoryOrganizationBound === 'true') return
  panel.dataset.kmlDirectoryOrganizationBound = 'true'
  let draggedDirectoryId = ''

  const clearState = () => {
    draggedDirectoryId = ''
    panel.querySelectorAll('.is-kml-directory-dragging, .is-kml-directory-drop-target').forEach(element => {
      element.classList.remove('is-kml-directory-dragging', 'is-kml-directory-drop-target')
    })
  }

  panel.addEventListener('dragstart', event => {
    const target = event.target.closest?.('[data-kml-directory-draggable="true"]')
    if (!target || !canWritePersonalKml()) return
    const directoryId = String(target.dataset.directoryId || '')
    if (!directoryId) {
      event.preventDefault()
      return
    }
    draggedDirectoryId = directoryId
    target.classList.add('is-kml-directory-dragging')
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('application/x-map-service-kml-directory', JSON.stringify({ directoryId }))
      event.dataTransfer.setData('text/plain', directoryId)
    }
  })

  panel.addEventListener('dragover', event => {
    if (!draggedDirectoryId) return
    const target = event.target.closest?.('[data-kml-directory-order-drop]')
    if (!target || !panel.contains(target) || target.dataset.kmlDirectoryOrderDrop === draggedDirectoryId) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    panel.querySelectorAll('.is-kml-directory-drop-target').forEach(element => {
      if (element !== target) element.classList.remove('is-kml-directory-drop-target')
    })
    target.classList.add('is-kml-directory-drop-target')
  })

  panel.addEventListener('drop', async event => {
    if (!draggedDirectoryId) return
    const sourceId = draggedDirectoryId
    const target = event.target.closest?.('[data-kml-directory-order-drop]')
    event.preventDefault()
    event.stopPropagation()
    clearState()
    const targetId = String(target?.dataset.kmlDirectoryOrderDrop || '')
    if (!targetId || targetId === sourceId) return
    const ids = entityKmlDirectories().map(directory => directory.id)
    const sourceIndex = ids.indexOf(sourceId)
    const targetIndex = ids.indexOf(targetId)
    if (sourceIndex < 0 || targetIndex < 0) return
    ids.splice(sourceIndex, 1)
    ids.splice(ids.indexOf(targetId), 0, sourceId)
    try {
      if (isAccountKmlMode()) {
        await apiRequest('/kml/directories/reorder', { method: 'POST', body: { ids } })
      }
      if (isAccountKmlMode()) {
        const refreshed = await refreshKmlAccountDirectories()
        kmlDirectories = [...(refreshed.items || []), refreshed.uncategorized]
          .filter(Boolean)
          .map(normalizeKmlDirectory)
      } else {
        const byId = new Map(entityKmlDirectories().map(directory => [directory.id, directory]))
        const uncategorized = kmlDirectories.find(directory => !directory.id)
        kmlDirectories = ids.map((id, index) => ({ ...byId.get(id), position: index }))
        if (uncategorized) kmlDirectories.push({ ...uncategorized, position: ids.length })
        saveKmlDirectories()
      }
      updateKmlPanelUI(map)
    } catch (error) {
      await showAlert(error?.message || 'KML 目录排序失败')
    }
  })

  panel.addEventListener('dragend', clearState)
}

export async function initKmlSupport (map, options = {}) {
  bindKmlPopupActions(map)
  bindKmlMapInteractionState(map)
  bindKmlViewportRerender(map)
  if (getActiveShare()) {
    await initShareKmlSupport(map, options)
    return
  }
  window.getActiveKmlMarkers = getActiveKmlMarkers
  window.activateKmlFeatureForMedia = (item, options) => activateFeatureForMedia(map, item, options)
  bindKmlAccountSyncStatus()
  bindKmlAccountConflictRecovery((files) => {
    kmlList = files.map(normalizeKmlFile)
    renderAllKmls(map)
    updateKmlPanelUI(map)
    return kmlList
  })
  bindAccountSessionExpiry(map)
  await loadInitialKmlFiles()
  initCustomControlsListeners()

  loadPublicKmls(map).then(() => {
    renderAllKmls(map)
    updateKmlPanelUI(map)
    checkPublicKmlEditMode(map)
  })

  initLongPressPointCreation(map)
  
  const panel = document.getElementById('kml-panel')
  const fileInput = document.getElementById('kml-file-input')
  const correctionInput = document.getElementById('kml-coordinate-correction')
  const dropzone = document.getElementById('kml-import-dropzone')
  const createButton = panel?.querySelector('[data-kml-action="create-file"]')
  const twoBuluImportButton = panel?.querySelector('[data-kml-action="import-2bulu"]')
  const correctionOption = panel?.querySelector('.kml-import-option')

  if (twoBuluImportButton) {
    twoBuluImportButton.hidden = !canImportTwoBuluKml()
    subscribeTwoBuluHelper(() => {
      twoBuluImportButton.hidden = !canImportTwoBuluKml()
    })
    probeTwoBuluHelper().catch(() => {})
  }

  if (!canWritePersonalKml()) {
    if (dropzone) dropzone.hidden = true
    if (createButton) createButton.hidden = true
    if (correctionOption) correctionOption.hidden = true
  }
  
  if (panel) {
    L.DomEvent.disableScrollPropagation(panel)
    L.DomEvent.disableClickPropagation(panel)
    bindKmlFeatureOrganizationEvents(panel, map)
    bindKmlFileOrganizationEvents(panel, map)
    bindKmlDirectoryOrganizationEvents(panel, map)
  }

  const kmlActions = {
    toggleKmlPanel: () => {
      panel.hidden = !panel.hidden
      if (!panel.hidden) {
        updateKmlPanelUI(map)
      } else {
        exitKmlBatchMode()
        exitKmlDirectoryBatchMode()
      }
    },
    closeKmlPanel: () => {
      panel.hidden = true
      exitKmlBatchMode()
      exitKmlDirectoryBatchMode()
      if (isAddingPoint) {
        togglePickupMode(map, null)
      }
    }
  }
  
  window.toggleKmlPanel = kmlActions.toggleKmlPanel
  
  panel.querySelector('.kml-close-btn').addEventListener('click', kmlActions.closeKmlPanel)
  
  dropzone.addEventListener('click', () => {
    if (!canWritePersonalKml()) return
    fileInput.click()
  })
  
  fileInput.addEventListener('change', (e) => {
    if (!canWritePersonalKml()) {
      e.target.value = ''
      showAlert('当前账号只有 KML 查看权限，不能导入文件。')
      return
    }
    const file = e.target.files[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target.result
        const parsed = parseKmlDocument(text)
        const features = parsed.features
        
        if (features.length === 0) {
          showAlert('KML 文件中未找到有效的点、线、面要素')
          return
        }
        
        const newKml = createKmlFile({
          name: file.name,
          description: parsed.description,
          coordCorrection: correctionInput?.checked === false ? 'none' : KML_COORD_CORRECTION,
          features
        })
        
        kmlList.splice(1, 0, newKml)
        expandKmlFileExclusively(newKml.id)
        rememberTargetKmlId(newKml.id)
        saveToStorage()
        
        renderKmlLayers(map, newKml)
        updateKmlPanelUI(map)
        focusFeature(map, newKml.id, features[0].id)
      } catch (err) {
        showAlert(err.message || '导入 KML 文件时出错，请确认格式是否正确。')
      } finally {
        fileInput.value = ''
      }
    }
    reader.readAsText(file)
  })
  
  panel.addEventListener('click', async (event) => {
    const target = event.target
    if (target.closest('.kml-correction-switch')) {
      event.stopPropagation()
      return
    }

    const actionTarget = target.closest('[data-kml-action]')
    if (!actionTarget) return
    
    const action = actionTarget.getAttribute('data-kml-action')
    const kmlId = actionTarget.getAttribute('data-kml-id')
    const featureId = actionTarget.getAttribute('data-feature-id')

    if (action === 'toggle-batch') {
      event.stopPropagation()
      if (!canWritePersonalKml()) return
      const kmlFile = kmlList.find(file => file.id === kmlId)
      if (!kmlFile) return
      if (!(await loadAccountKmlFileForUse(kmlFile))) {
        await showAlert(kmlFile.loadError || 'KML 文件详情加载失败')
        return
      }
      exitKmlDirectoryBatchMode()
      exitKmlBatchMode()
      kmlBatchFileId = kmlId || ''
      kmlBatchSelection.activate()
      expandedKmlIds.add(kmlFile.id)
      expandedKmlActionIds.add(kmlFile.id)
      updateKmlPanelUI(map)
      return
    }

    if (action === 'batch-cancel') {
      event.stopPropagation()
      exitKmlBatchMode()
      updateKmlPanelUI(map)
      return
    }

    if (action === 'batch-select-all' || action === 'batch-invert') {
      event.stopPropagation()
      if (!kmlBatchSelection.isActive()) return
      const visibleSelection = getVisibleKmlBatchSelection(panel).filter(item => item.kmlId === kmlBatchFileId)
      if (action === 'batch-select-all') {
        kmlBatchSelection.clear()
        kmlBatchSelection.select(visibleSelection)
      }
      else kmlBatchSelection.invert(visibleSelection)
      updateKmlPanelUI(map)
      return
    }

    if (action === 'batch-operate') {
      event.stopPropagation()
      await executeKmlBatchAction(map)
      return
    }

    if (action === 'toggle-batch-feature') {
      event.stopPropagation()
      if (!kmlBatchSelection.isActive() || kmlId !== kmlBatchFileId || !featureId) return
      kmlBatchSelection.toggle(kmlId, featureId)
      updateKmlPanelUI(map)
      return
    }

    if (action === 'directory-batch-start') {
      event.stopPropagation()
      if (!isKmlDirectoryBatchDownloadEnabled()) return
      const directoryId = actionTarget.getAttribute('data-directory-id') || ''
      exitKmlBatchMode()
      kmlDirectoryBatchSelection.activate(directoryId)
      expandedKmlIds.delete(`directory:${directoryId}`)
      updateKmlPanelUI(map)
      return
    }

    if (action === 'directory-batch-cancel') {
      event.stopPropagation()
      exitKmlDirectoryBatchMode()
      updateKmlPanelUI(map)
      return
    }

    if (action === 'directory-batch-toggle-file') {
      event.stopPropagation()
      if (!kmlDirectoryBatchSelection.active || !kmlId) return
      const file = kmlList.find(item => item.id === kmlId)
      if (!file || directoryKey(file) !== kmlDirectoryBatchSelection.directoryId) return
      if (!kmlDirectoryBatchSelection.has(kmlId) && !(await loadAccountKmlFileForUse(file))) {
        await showAlert(file.loadError || 'KML 文件详情加载失败')
        return
      }
      kmlDirectoryBatchSelection.toggle(kmlId)
      updateKmlPanelUI(map)
      return
    }

    if (action === 'directory-batch-select-all') {
      event.stopPropagation()
      const directoryId = actionTarget.getAttribute('data-directory-id') || ''
      if (!kmlDirectoryBatchSelection.isActive(directoryId)) return
      const result = await toggleKmlDirectoryBatchSelectionAll({
        selection: kmlDirectoryBatchSelection,
        directoryId,
        files: getDirectoryBatchFiles(directoryId),
        loadFiles: files => loadKmlFilesWithConcurrency(files, loadAccountKmlFileForUse),
      })
      if (!result.changed && result.reason === 'load-failed') {
        await showAlert(result.failedFile?.loadError || result.error?.message || '目录内 KML 文件详情加载失败')
        return
      }
      updateKmlPanelUI(map)
      return
    }

    if (action === 'directory-batch-download') {
      event.stopPropagation()
      await downloadDirectoryBatchFiles()
      return
    }

    if (action === 'directory-batch-delete') {
      event.stopPropagation()
      await deleteDirectoryBatchFiles(map)
      return
    }

    if (action === 'import-2bulu') {
      event.stopPropagation()
      await handleTwoBuluImport(map, actionTarget, correctionInput)
      return
    }

    if (action === 'create-file') {
      event.stopPropagation()
      await handleCreateKmlFile(map)
      return
    }

    if (action === 'create-directory') {
      event.stopPropagation()
      await createKmlDirectoryFromPanel(map)
      return
    }

    if (action === 'rename-directory') {
      event.stopPropagation()
      await renameKmlDirectoryFromPanel(map, actionTarget.getAttribute('data-directory-id'))
      return
    }

    if (action === 'delete-directory') {
      event.stopPropagation()
      await deleteKmlDirectoryFromPanel(map, actionTarget.getAttribute('data-directory-id'))
      return
    }

    if (action === 'toggle-file-actions') {
      event.stopPropagation()
      if (expandedKmlActionIds.has(kmlId)) expandedKmlActionIds.delete(kmlId)
      else expandedKmlActionIds.add(kmlId)
      updateKmlPanelUI(map)
      return
    }

    if (action === 'rename-file') {
      event.stopPropagation()
      await handleRenameKmlFile(map, kmlId)
      return
    }

    if (action === 'move-file') {
      event.stopPropagation()
      await moveKmlFileFromPanel(map, kmlId)
      return
    }

    if (action === 'toggle-section') {
      const sectionId = actionTarget.getAttribute('data-section-id')
      if (expandedKmlIds.has(sectionId)) {
        expandedKmlIds.delete(sectionId)
      } else {
        expandedKmlIds.add(sectionId)
      }
      updateKmlPanelUI(map)
      return
    }

    if (action === 'toggle-directory') {
      const directoryId = actionTarget.getAttribute('data-directory-id') || ''
      const key = `directory:${directoryId}`
      if (expandedKmlIds.has(key)) expandedKmlIds.delete(key)
      else expandedKmlIds.add(key)
      updateKmlPanelUI(map)
      return
    }

    if (action === 'toggle-directory-visible') {
      event.stopPropagation()
      const directoryId = actionTarget.getAttribute('data-directory-id') || ''
      const files = kmlList.filter(file => directoryKey(file) === directoryId)
      const enabled = !files.length || !files.every(isKmlEnabled)
      if (enabled) {
        const loaded = await loadKmlFilesWithConcurrency(files, loadAccountKmlFileForUse)
        const failed = files.find((file, index) => !loaded[index])
        if (failed) {
          await showAlert(failed.loadError || '目录内 KML 文件详情加载失败')
          return
        }
      }
      let updated = null
      if (isAccountKmlMode()) {
        try {
          updated = await apiRequest(`/kml/directories/${encodeURIComponent(directoryId || 'uncategorized')}/visibility`, { method: 'POST', body: { enabled } })
        } catch (error) {
          await showAlert(error?.message || '目录显隐更新失败')
          return
        }
      }
      files.forEach(file => { file.enabled = enabled })
      if (isAccountKmlMode()) commitAccountKmlOrganizationDocuments(updated?.documents)
      if (!isAccountKmlMode()) saveToStorage()
      files.forEach(file => renderKmlLayers(map, file))
      updateKmlPanelUI(map)
      return
    }

    if (action === 'refresh-public') {
      event.stopPropagation()
      loadPublicKmls(map).then(() => {
        renderAllKmls(map)
        updateKmlPanelUI(map)
        showAlert('公共图层已刷新')
      })
      return
    }

    if (action === 'manage-share') {
      event.stopPropagation()
      if (!canManagePersonalShares()) {
        await showAlert('当前账号没有管理个人分享的权限。')
        return
      }
      window.location.href = `/account/kml?shareKmlId=${encodeURIComponent(kmlId)}`
      return
    }

    if (action === 'share-file') {
      event.stopPropagation()
      if (!isAdminLoggedIn()) {
        await showAlert('当前账号没有管理公共 KML 的权限。')
        return
      }
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return
      if (!(await loadAccountKmlFileForUse(kmlFile))) {
        await showAlert(kmlFile.loadError || 'KML 文件详情加载失败')
        return
      }

      const confirmed = await showConfirm(`确认将个人图层“${escapeHtml(kmlFile.name)}”共享为公共 KML 图层吗？`)
      if (!confirmed) return

      try {
        await apiRequest('/admin/kml', {
          method: 'POST',
          body: {
            name: kmlFile.name,
            features: kmlFile.features,
            coordCorrection: kmlFile.coordCorrection,
            status: 'published'
          },
        })
        showAlert('共享成功！所有用户刷新页面后可见。')
        await loadPublicKmls(map)
        updateKmlPanelUI(map)
      } catch (err) {
        showAlert(`共享失败: ${err.message}`)
      }
      return
    }

    if (action === 'toggle-collapse') {
      const willExpand = !expandedKmlIds.has(kmlId)
      if (willExpand) expandedKmlIds.add(kmlId)
      else expandedKmlIds.delete(kmlId)

      const personalFile = kmlList.find(k => k.id === kmlId)
      if (willExpand && personalFile?.contentLoaded === false && !(await loadAccountKmlFileForUse(personalFile))) {
        expandedKmlIds.delete(kmlId)
        await showAlert(personalFile.loadError || 'KML 文件详情加载失败')
      }
      const kmlFile = publicKmlList.find(k => k.id === kmlId)
      if (willExpand && kmlFile?.enabled && (!kmlFile.features || kmlFile.features.length === 0)) {
        try {
          const detail = await window.fetch(`/api/v1/kml/shared/${kmlFile.id}`).then(res => res.json()).then(payload => payload.result)
          kmlFile.features = detail.features || []
          renderKmlLayers(map, kmlFile)
        } catch (err) {
          expandedKmlIds.delete(kmlId)
          showAlert('加载公共图层详情失败')
        }
      }
      updateKmlPanelUI(map)
      return
    }

    if (action === 'toggle-visible') {
      event.stopPropagation()
      let kmlFile = publicKmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        kmlFile.enabled = !kmlFile.enabled
        publicKmlPrefs[kmlFile.id] = kmlFile.enabled
        savePublicPrefs()

        if (kmlFile.enabled && (!kmlFile.features || kmlFile.features.length === 0)) {
          try {
            const detail = await window.fetch(`/api/v1/kml/shared/${kmlFile.id}`).then(res => res.json()).then(payload => payload.result)
            kmlFile.features = detail.features || []
          } catch (err) {
            showAlert('加载公共图层详情失败')
          }
        }

        renderKmlLayers(map, kmlFile)
        updateKmlPanelUI(map)
        return
      }

      kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return
      if (kmlFile.isDefault) return
      if (!canWritePersonalKml()) {
        await showAlert('当前账号只有 KML 查看权限，不能修改显隐状态。')
        return
      }

      const nextEnabled = !isKmlEnabled(kmlFile)
      if (nextEnabled && !(await loadAccountKmlFileForUse(kmlFile))) {
        await showAlert(kmlFile.loadError || 'KML 文件详情加载失败')
        updateKmlPanelUI(map)
        return
      }
      kmlFile.enabled = nextEnabled
      saveToStorage()

      if (isAddingPoint && activeKmlIdForAdd === kmlId && !isKmlEnabled(kmlFile)) {
        togglePickupMode(map, null)
      }

      renderKmlLayers(map, kmlFile)
      updateKmlPanelUI(map)
      return
    }
    
    if (action === 'focus-feature') {
      focusFeature(map, kmlId, featureId)
      return
    }
    
    if (action === 'delete-feature') {
      event.stopPropagation()
      await handleDeleteFeature(map, kmlId, featureId)
      return
    }
    
    if (action === 'delete-file') {
      event.stopPropagation()
      if (!canWritePersonalKml()) {
        await showAlert('当前账号只有 KML 查看权限，不能删除文件。')
        return
      }
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile?.isDefault) {
        showAlert('默认 KML 文件会一直保留，不能删除。')
        return
      }

      const confirmed = await showConfirm('确认删除此 KML 文件及其中所有的标注？')
      if (!confirmed) return
      
      const index = kmlList.findIndex(k => k.id === kmlId)
      if (index !== -1) {
        pushKmlHistory()
        if (isAddingPoint && activeKmlIdForAdd === kmlId) {
          togglePickupMode(map, null)
        }

        kmlList[index].features.forEach(feat => {
          featureLayers.delete(getFeatureLayerKey(kmlId, feat.id))
        })
        kmlList.splice(index, 1)
        expandedKmlIds.delete(kmlId)
        if (getRememberedTargetKmlId() === kmlId) {
          rememberTargetKmlId(DEFAULT_KML_ID)
        }
        saveToStorage({ deletedIds: [kmlId], deletionIntent: 'user-confirmed' })
        
        if (kmlLayerGroups.has(kmlId)) {
          map.removeLayer(kmlLayerGroups.get(kmlId))
          kmlLayerGroups.delete(kmlId)
        }
        
        updateKmlPanelUI(map)
      }
      return
    }
    
    if (action === 'export') {
      event.stopPropagation()
      let kmlFile = publicKmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        if (!kmlFile.features || kmlFile.features.length === 0) {
          try {
            const detail = await window.fetch(`/api/v1/kml/shared/${kmlFile.id}`).then(res => res.json()).then(payload => payload.result)
            kmlFile.features = detail.features || []
          } catch (err) {
            showAlert('获取数据失败')
            return
          }
        }
        const kmlText = generateKmlText(kmlFile.name, kmlFile.features, kmlFile.description)
        downloadKmlFile(kmlFile.name, kmlText)
        return
      }

      kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        if (!(await loadAccountKmlFileForUse(kmlFile))) {
          await showAlert(kmlFile.loadError || 'KML 文件详情加载失败')
          return
        }
        const kmlText = generateKmlText(kmlFile.name, kmlFile.features, kmlFile.description)
        downloadKmlFile(kmlFile.name, kmlText)
      }
      return
    }
    
    if (action === 'add-point') {
      event.stopPropagation()
      const kmlFile = kmlList.find(k => k.id === kmlId) || publicKmlList.find(k => k.id === kmlId)
      if (!isKmlEditable(kmlFile)) {
        await showAlert('目标 KML 当前为只读，不能新增标注。')
        return
      }
      if (!isKmlEnabled(kmlFile)) {
        showAlert('该 KML 文件已隐藏，请先启用后再新增标注。')
        return
      }
      if (!(await loadAccountKmlFileForUse(kmlFile))) {
        await showAlert(kmlFile.loadError || 'KML 文件详情加载失败')
        return
      }
      togglePickupMode(map, kmlId)
      return
    }
  })

  panel.addEventListener('change', async (event) => {
    const target = event.target
    if (target.matches('[data-kml-correction]')) {
      const kmlId = target.getAttribute('data-kml-id')
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return
      if (!canWritePersonalKml()) {
        updateKmlPanelUI(map)
        return
      }

      if (!(await loadAccountKmlFileForUse(kmlFile))) {
        await showAlert(kmlFile.loadError || 'KML 文件详情加载失败，未修改纠偏设置。')
        updateKmlPanelUI(map)
        return
      }

      kmlFile.coordCorrection = target.checked ? KML_COORD_CORRECTION : 'none'
      saveToStorage()
      if (isKmlEnabled(kmlFile)) {
        renderKmlLayers(map, kmlFile)
      }
      updateKmlPanelUI(map)
      return
    }

    if (target.matches('[data-kml-lock-drag]')) {
      const kmlId = target.getAttribute('data-kml-id')
      const kmlFile = kmlList.find(k => k.id === kmlId)
      if (!kmlFile) return
      if (!canWritePersonalKml()) {
        updateKmlPanelUI(map)
        return
      }

      if (!(await loadAccountKmlFileForUse(kmlFile))) {
        await showAlert(kmlFile.loadError || 'KML 文件详情加载失败，未修改拖拽锁定。')
        updateKmlPanelUI(map)
        return
      }

      kmlFile.lockDrag = target.checked
      saveToStorage()
      if (isKmlEnabled(kmlFile)) {
        renderKmlLayers(map, kmlFile)
      }
      updateKmlPanelUI(map)
      return
    }

    if (target.matches('.kml-theme-select')) {
      const kmlId = target.getAttribute('data-kml-id')
      let kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        if (!canWritePersonalKml()) {
          updateKmlPanelUI(map)
          return
        }
        if (!(await loadAccountKmlFileForUse(kmlFile))) {
          await showAlert(kmlFile.loadError || 'KML 文件详情加载失败，未修改主题。')
          updateKmlPanelUI(map)
          return
        }
        kmlFile.theme = target.value
        saveToStorage()
      } else {
        kmlFile = publicKmlList.find(k => k.id === kmlId)
        if (kmlFile) {
          kmlFile.theme = target.value
          publicKmlPrefs[kmlFile.id + '_theme'] = target.value
          savePublicPrefs()
        }
      }
      if (kmlFile && isKmlEnabled(kmlFile)) {
        renderKmlLayers(map, kmlFile)
      }
      updateKmlPanelUI(map)
      return
    }

    if (target.matches('.kml-color-input')) {
      const kmlId = target.getAttribute('data-kml-id')
      let kmlFile = kmlList.find(k => k.id === kmlId)
      if (kmlFile) {
        if (!canWritePersonalKml()) {
          updateKmlPanelUI(map)
          return
        }
        if (!(await loadAccountKmlFileForUse(kmlFile))) {
          await showAlert(kmlFile.loadError || 'KML 文件详情加载失败，未修改颜色。')
          updateKmlPanelUI(map)
          return
        }
        kmlFile.color = target.value
        saveToStorage()
      } else {
        kmlFile = publicKmlList.find(k => k.id === kmlId)
        if (kmlFile) {
          kmlFile.color = target.value
          publicKmlPrefs[kmlFile.id + '_color'] = target.value
          savePublicPrefs()
        }
      }
      if (kmlFile && isKmlEnabled(kmlFile)) {
        renderKmlLayers(map, kmlFile)
      }
      updateKmlPanelUI(map)
      return
    }
  })
  
  // 监听键盘事件，在非辅助线模式下支持 KML 位置与数据的撤销与重做
  document.addEventListener('keydown', (event) => {
    // 规避冲突：若当前已激活辅助线模式，键盘快捷键优先给辅助线模块使用
    if (typeof window.getIsGuidelineModeActive === 'function' && window.getIsGuidelineModeActive()) return

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const modifier = isMac ? event.metaKey : event.ctrlKey

    if (modifier) {
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redoKml(map)
        } else {
          undoKml(map)
        }
      } else if (key === 'y') {
        event.preventDefault()
        redoKml(map)
      }
    }
  })
}

// 导出所有当前在地图上渲染的 KML 标记点图层，供碰撞检测与反点击穿透使用
export function getActiveKmlMarkers () {
  const markers = []
  featureLayers.forEach(layer => {
    if (layer instanceof L.Marker) {
      markers.push(layer)
    }
  })
  return markers
}

// KML 历史堆栈及撤销/反撤销状态实现
const kmlUndoStack = []
const kmlRedoStack = []

export function pushKmlHistory () {
  if (!canWritePersonalKml() && !isEditingPublicKml) return
  kmlUndoStack.push(JSON.parse(JSON.stringify(kmlList)))
  if (kmlUndoStack.length > 50) {
    kmlUndoStack.shift()
  }
  kmlRedoStack.length = 0
}

export function undoKml (map) {
  if (!canWritePersonalKml()) return
  if (kmlUndoStack.length === 0) return
  const previousFiles = kmlList
  kmlRedoStack.push(JSON.parse(JSON.stringify(kmlList)))
  kmlList = kmlUndoStack.pop()
  saveKmlHistoryState(previousFiles)
  renderAllKmls(map)
  updateKmlPanelUI(map)
}

export function redoKml (map) {
  if (!canWritePersonalKml()) return
  if (kmlRedoStack.length === 0) return
  const previousFiles = kmlList
  kmlUndoStack.push(JSON.parse(JSON.stringify(kmlList)))
  kmlList = kmlRedoStack.pop()
  saveKmlHistoryState(previousFiles)
  renderAllKmls(map)
  updateKmlPanelUI(map)
}

// 阻止 KML 气泡 DOM 上的所有交互事件向地图冒泡，防止点击穿透
function preventAllKmlPropagation (el) {
  if (!el) return
  const events = [
    'click', 'dblclick',
    'mousedown', 'mouseup',
    'touchstart', 'touchend', 'touchmove',
    'pointerdown', 'pointerup', 'pointermove',
    'contextmenu'
  ]
  events.forEach(evt => {
    el.addEventListener(evt, (e) => {
      e.stopPropagation()
    })
  })
}

export function createTrackKml2d (name) {
  if (!canWritePersonalKml()) return null
  let kmlFile = null
  try {
    kmlFile = {
      id: `kml-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: name || '未命名轨迹',
      enabled: true,
      isDefault: false,
      theme: 'simple',
      coordCorrection: KML_COORD_CORRECTION,
      lockDrag: true, // 默认开启锁定点位移动限制，防止意外拖动
      isLiveTrack: true,
      renderPointLimit: LIVE_TRACK_RENDER_POINT_LIMIT,
      renderLinePointLimit: LIVE_TRACK_RENDER_LINE_POINT_LIMIT,
      features: []
    }
    kmlList.splice(1, 0, kmlFile)
    saveToStorage()
    return kmlFile.id
  } catch (err) {
    if (kmlFile) {
      const index = kmlList.indexOf(kmlFile)
      if (index >= 0) kmlList.splice(index, 1)
    }
    console.error('createTrackKml2d failed:', err)
    return null
  }
}

export function hasTrackKml2d (kmlId) {
  return Boolean(kmlId && kmlList.some(kmlFile => kmlFile.id === kmlId))
}

export function updateTrackKml2d (map, kmlId, historyPoints, lastPosition, onlyLine = false, completedSegments = []) {
  if (!canWritePersonalKml()) return false
  try {
    const kmlFile = kmlList.find(k => k.id === kmlId)
    if (!kmlFile) return false

    const segments = buildTrackSegments(historyPoints, lastPosition, completedSegments)
    const allPts = segments.flat()
    const coordinatesForPoint = (pt) => {
      let lat = null
      let lng = null
      if (pt && pt.latlng) {
        if (Array.isArray(pt.latlng)) {
          lat = pt.latlng[0]
          lng = pt.latlng[1]
        } else if (typeof pt.latlng.lat === 'number' && typeof pt.latlng.lng === 'number') {
          lat = pt.latlng.lat
          lng = pt.latlng.lng
        }
      }
      if (typeof lat === 'number' && typeof lng === 'number') {
        const gcj02 = [normalizeLongitude(lng), lat]
        return gcj02ToWgs84(gcj02)
      }
      return null
    }

    const features = []
    segments.forEach((segment, segmentIndex) => {
      const lineCoordinates = segment.map(coordinatesForPoint).filter(Boolean)
      if (lineCoordinates.length <= 1) return
      let startTimeStr = '未知'
      let endTimeStr = '未知'
      let durationStr = '未知'
      if (segment.length > 0) {
        const firstPt = segment[0]
        const lastPt = segment[segment.length - 1]
        
        const formatDateTime = (ts) => {
          const d = new Date(ts)
          const year = d.getFullYear()
          const month = String(d.getMonth() + 1).padStart(2, '0')
          const date = String(d.getDate()).padStart(2, '0')
          const hours = String(d.getHours()).padStart(2, '0')
          const minutes = String(d.getMinutes()).padStart(2, '0')
          const seconds = String(d.getSeconds()).padStart(2, '0')
          return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`
        }
        
        startTimeStr = formatDateTime(firstPt.timestamp)
        endTimeStr = formatDateTime(lastPt.timestamp)
        
        const totalMs = lastPt.timestamp - firstPt.timestamp
        if (totalMs >= 0) {
          const totalSecs = Math.floor(totalMs / 1000)
          const hrs = Math.floor(totalSecs / 3600)
          const mins = Math.floor((totalSecs % 3600) / 60)
          const secs = totalSecs % 60
          
          let dur = ''
          if (hrs > 0) dur += `${hrs}小时`
          if (mins > 0 || hrs > 0) dur += `${mins}分`
          dur += `${secs}秒`
          durationStr = dur
        }
      }

      features.push({
        id: `track-line-${kmlId}-${segmentIndex}`,
        type: 'LineString',
        name: segments.length > 1 ? `移动轨迹 #${segmentIndex + 1}` : '移动轨迹',
        description: `开始时间：${startTimeStr}\n结束时间：${endTimeStr}\n持续时长：${durationStr}\n本段记录点数：${segment.length} 个`,
        coordinates: lineCoordinates
      })
    })

    if (!onlyLine) {
      allPts.forEach((pt, index) => {
        let lat = null
        let lng = null
        if (pt && pt.latlng) {
          if (Array.isArray(pt.latlng)) {
            lat = pt.latlng[0]
            lng = pt.latlng[1]
          } else if (typeof pt.latlng.lat === 'number' && typeof pt.latlng.lng === 'number') {
            lat = pt.latlng.lat
            lng = pt.latlng.lng
          }
        }
        if (typeof lat !== 'number' || typeof lng !== 'number') {
          return
        }
        const gcj02 = [normalizeLongitude(lng), lat]
        const wgs84 = gcj02ToWgs84(gcj02)
        const timeStr = new Date(pt.timestamp).toLocaleTimeString()
        
        let stayInfo = ''
        if (pt.staySeconds && pt.staySeconds > 0) {
          const mins = Math.floor(pt.staySeconds / 60)
          const secs = Math.floor(pt.staySeconds % 60)
          stayInfo = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`
        } else {
          stayInfo = '0秒'
        }

        const description = `定位时间：${timeStr}\n定位精度：${pt.accuracy ? Math.round(pt.accuracy) + ' 米' : '未知'}\n停留时长：${stayInfo}`

        features.push({
          id: `track-point-${kmlId}-${index}`,
          type: 'Point',
          name: `点 #${index + 1} (${new Date(pt.timestamp).toLocaleTimeString()})`,
          description,
          coordinates: wgs84
        })
      })
    }

    // 必须在覆盖 features 前按旧 ID 清理索引；否则每轮生成的新轨迹会把旧
    // featureLayers 引用永久遗留在 Map 中，长途运行时形成持续内存泄漏。
    const oldFeatures = kmlFile.features
    kmlFile.features = features
    try {
      saveToStorage()
    } catch (err) {
      kmlFile.features = oldFeatures
      throw err
    }

    try {
      removeKmlLayers(map, { ...kmlFile, features: oldFeatures })
      renderKmlLayers(map, kmlFile)
      updateKmlPanelUI(map)
    } catch (renderError) {
      console.error('updateTrackKml2d render failed:', renderError)
    }
    return true
  } catch (err) {
    console.error('updateTrackKml2d failed:', err)
    return false
  }
}
