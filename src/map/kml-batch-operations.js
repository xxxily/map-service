import { cloneKmlFeature } from './kml-feature-operations.js'

function normalizeId (value) {
  return String(value || '').trim()
}

function cloneFile (file) {
  return {
    ...file,
    features: Array.isArray(file?.features) ? file.features.map(cloneKmlFeature) : [],
  }
}

function fileIndexById (files, id) {
  const normalized = normalizeId(id)
  return files.findIndex(file => normalizeId(file?.id) === normalized)
}

function featureIndexById (file, id) {
  const normalized = normalizeId(id)
  return (file?.features || []).findIndex(feature => normalizeId(feature?.id) === normalized)
}

function createFeatureIdFactory (files, customFactory) {
  if (typeof customFactory === 'function') return customFactory
  const usedIds = new Set(files.flatMap(file => (file?.features || []).map(feature => normalizeId(feature?.id))))
  let sequence = 0
  return () => {
    let id = ''
    do {
      sequence += 1
      id = `feat-${Date.now()}-${sequence.toString(16)}-${Math.random().toString(16).slice(2, 8)}`
    } while (usedIds.has(id))
    usedIds.add(id)
    return id
  }
}

function sortSelection (files, selection) {
  const fileOrder = new Map(files.map((file, index) => [normalizeId(file?.id), index]))
  return selection
    .map((item, inputIndex) => ({
      kmlId: normalizeId(item?.kmlId),
      featureId: normalizeId(item?.featureId),
      inputIndex,
    }))
    .sort((left, right) => {
      const fileDelta = (fileOrder.get(left.kmlId) ?? Number.MAX_SAFE_INTEGER) - (fileOrder.get(right.kmlId) ?? Number.MAX_SAFE_INTEGER)
      if (fileDelta) return fileDelta
      const file = files[fileOrder.get(left.kmlId)]
      const featureDelta = featureIndexById(file, left.featureId) - featureIndexById(file, right.featureId)
      return featureDelta || left.inputIndex - right.inputIndex
    })
}

function validateSelection (files, selection) {
  if (!Array.isArray(selection) || selection.length === 0) throw new Error('至少选择一个 KML 要素')
  const seen = new Set()
  const records = []
  for (const item of sortSelection(files, selection)) {
    if (!item.kmlId || !item.featureId) throw new Error('KML 要素选择信息不完整')
    const key = getKmlBatchSelectionKey(item.kmlId, item.featureId)
    if (seen.has(key)) continue
    const fileIndex = fileIndexById(files, item.kmlId)
    if (fileIndex < 0) throw new Error('来源 KML 文件不存在')
    const featureIndex = featureIndexById(files[fileIndex], item.featureId)
    if (featureIndex < 0) throw new Error('来源 KML 要素不存在')
    seen.add(key)
    records.push({
      ...item,
      key,
      fileIndex,
      featureIndex,
      feature: files[fileIndex].features[featureIndex],
    })
  }
  if (!records.length) throw new Error('至少选择一个 KML 要素')
  return records
}

function ensureTarget (files, targetKmlId) {
  const targetId = normalizeId(targetKmlId)
  const targetIndex = fileIndexById(files, targetId)
  if (!targetId || targetIndex < 0) throw new Error('目标 KML 文件不存在')
  return { targetId, targetIndex }
}

function getChangedFeatureIds (records, mode, targetId, copiedIds) {
  if (mode === 'copy') return [...copiedIds]
  if (mode === 'delete') return records.map(record => record.featureId)
  return records.filter(record => record.kmlId !== targetId).map(record => record.featureId)
}

/**
 * Apply one atomic batch operation to KML files without mutating the input.
 * The caller is responsible for checking write permissions for each file.
 */
export function applyKmlFeatureBatch (files, options = {}) {
  if (!Array.isArray(files)) throw new TypeError('files 必须是数组')
  const mode = String(options.mode || '')
  if (!['move', 'copy', 'delete'].includes(mode)) throw new Error('批量操作无效')

  const records = validateSelection(files, options.selection)
  const affectedIndexes = new Set(records.map(record => record.fileIndex))
  let target = null
  if (mode === 'move' || mode === 'copy') {
    target = ensureTarget(files, options.targetKmlId)
    affectedIndexes.add(target.targetIndex)
  }

  const nextFiles = files.slice()
  const clonedFiles = new Map([...affectedIndexes].map(index => [index, cloneFile(files[index])]))
  clonedFiles.forEach((file, index) => { nextFiles[index] = file })

  if (mode === 'delete') {
    const selectedByFile = new Map()
    records.forEach(record => {
      if (!selectedByFile.has(record.fileIndex)) selectedByFile.set(record.fileIndex, new Set())
      selectedByFile.get(record.fileIndex).add(record.featureId)
    })
    selectedByFile.forEach((ids, fileIndex) => {
      nextFiles[fileIndex].features = nextFiles[fileIndex].features.filter(feature => !ids.has(normalizeId(feature?.id)))
    })
    return {
      files: nextFiles,
      changed: true,
      mode,
      affectedKmlIds: [...affectedIndexes].map(index => normalizeId(files[index]?.id)),
      selectedCount: records.length,
      copiedCount: 0,
      movedCount: 0,
      deletedCount: records.length,
      changedFeatureIds: getChangedFeatureIds(records, mode, '', []),
    }
  }

  const transferableRecords = mode === 'move'
    ? records.filter(record => record.kmlId !== target.targetId)
    : records
  if (mode === 'move' && transferableRecords.length === 0) {
    return {
      files,
      changed: false,
      mode,
      affectedKmlIds: [],
      selectedCount: records.length,
      copiedCount: 0,
      movedCount: 0,
      deletedCount: 0,
      changedFeatureIds: [],
    }
  }

  const selectedByFile = new Map()
  transferableRecords.forEach(record => {
    if (!selectedByFile.has(record.fileIndex)) selectedByFile.set(record.fileIndex, new Set())
    selectedByFile.get(record.fileIndex).add(record.featureId)
  })

  if (mode === 'move') {
    selectedByFile.forEach((ids, fileIndex) => {
      nextFiles[fileIndex].features = nextFiles[fileIndex].features.filter(feature => !ids.has(normalizeId(feature?.id)))
    })
    const targetIds = new Set(nextFiles[target.targetIndex].features.map(feature => normalizeId(feature?.id)))
    transferableRecords.forEach(record => {
      if (targetIds.has(record.featureId)) throw new Error(`目标 KML 已存在相同 ID 的要素：${record.featureId}`)
      targetIds.add(record.featureId)
      nextFiles[target.targetIndex].features.push(cloneKmlFeature(record.feature))
    })
    return {
      files: nextFiles,
      changed: true,
      mode,
      affectedKmlIds: [...affectedIndexes].map(index => normalizeId(files[index]?.id)),
      selectedCount: records.length,
      copiedCount: 0,
      movedCount: transferableRecords.length,
      deletedCount: 0,
      changedFeatureIds: getChangedFeatureIds(records, mode, target.targetId, []),
    }
  }

  const idFactory = createFeatureIdFactory(files, options.idFactory)
  const copiedIds = []
  const targetIds = new Set(nextFiles[target.targetIndex].features.map(feature => normalizeId(feature?.id)))
  records.forEach(record => {
    const copy = cloneKmlFeature(record.feature)
    let nextId = normalizeId(idFactory({ feature: cloneKmlFeature(record.feature), sourceKmlId: record.kmlId, targetKmlId: target.targetId, files: nextFiles }))
    if (!nextId || targetIds.has(nextId)) throw new Error('复制要素未生成唯一 ID')
    copy.id = nextId
    targetIds.add(nextId)
    copiedIds.push(nextId)
    nextFiles[target.targetIndex].features.push(copy)
  })

  return {
    files: nextFiles,
    changed: copiedIds.length > 0,
    mode,
    affectedKmlIds: [...affectedIndexes].map(index => normalizeId(files[index]?.id)),
    selectedCount: records.length,
    copiedCount: copiedIds.length,
    movedCount: 0,
    deletedCount: 0,
    changedFeatureIds: getChangedFeatureIds(records, mode, target.targetId, copiedIds),
    copiedIds,
  }
}

export function getKmlBatchSelectionKey (kmlId, featureId) {
  return JSON.stringify([normalizeId(kmlId), normalizeId(featureId)])
}

export function parseKmlBatchSelectionKey (key) {
  try {
    const [kmlId, featureId] = JSON.parse(String(key || ''))
    return { kmlId: normalizeId(kmlId), featureId: normalizeId(featureId) }
  } catch {
    return { kmlId: '', featureId: '' }
  }
}

export const KML_FEATURE_BATCH_ACTIONS = Object.freeze([
  Object.freeze({ value: 'move', text: '移动', requiresTarget: true, class: 'app-dialog-primary' }),
  Object.freeze({ value: 'copy', text: '复制', requiresTarget: true, class: 'app-dialog-secondary' }),
  Object.freeze({ value: 'delete', text: '删除', requiresTarget: false, class: 'app-dialog-danger' }),
])

export function createKmlBatchSelectionModel () {
  let active = false
  const selected = new Set()
  const normalizeItems = items => {
    if (!Array.isArray(items)) return []
    const keys = []
    const seen = new Set()
    items.forEach(item => {
      const kmlId = normalizeId(item?.kmlId)
      const featureId = normalizeId(item?.featureId)
      if (!kmlId || !featureId) return
      const key = getKmlBatchSelectionKey(kmlId, featureId)
      if (seen.has(key)) return
      seen.add(key)
      keys.push(key)
    })
    return keys
  }
  return {
    activate () {
      active = true
    },
    deactivate () {
      active = false
      selected.clear()
    },
    clear () {
      selected.clear()
    },
    select (items) {
      normalizeItems(items).forEach(key => selected.add(key))
      return selected.size
    },
    invert (items) {
      normalizeItems(items).forEach(key => {
        if (selected.has(key)) selected.delete(key)
        else selected.add(key)
      })
      return selected.size
    },
    isActive () {
      return active
    },
    get count () {
      return selected.size
    },
    has (kmlId, featureId) {
      return selected.has(getKmlBatchSelectionKey(kmlId, featureId))
    },
    toggle (kmlId, featureId) {
      const key = getKmlBatchSelectionKey(kmlId, featureId)
      if (selected.has(key)) selected.delete(key)
      else selected.add(key)
      return selected.has(key)
    },
    prune (predicate) {
      for (const key of selected) {
        const item = parseKmlBatchSelectionKey(key)
        if (!item.kmlId || !item.featureId || !predicate(item)) selected.delete(key)
      }
    },
    getSelection () {
      return [...selected].map(parseKmlBatchSelectionKey).filter(item => item.kmlId && item.featureId)
    },
  }
}
