function cloneCoordinateArray (value) {
  return Array.isArray(value) ? value.map(cloneCoordinateArray) : value
}

function cloneFeature (feature) {
  if (!feature || typeof feature !== 'object') return feature
  const cloned = { ...feature, coordinates: cloneCoordinateArray(feature.coordinates) }
  if (feature.resourceCollection && typeof feature.resourceCollection === 'object') {
    cloned.resourceCollection = {
      ...feature.resourceCollection,
      items: Array.isArray(feature.resourceCollection.items)
        ? feature.resourceCollection.items.map(item => ({ ...item }))
        : [],
    }
  }
  return cloned
}

function cloneFile (file) {
  return {
    ...file,
    features: Array.isArray(file?.features) ? file.features.map(cloneFeature) : [],
  }
}

function normalizedId (value) {
  return String(value || '').trim()
}

function createDefaultFeatureId (files) {
  const existing = new Set((files || []).flatMap(file => (file?.features || []).map(feature => normalizedId(feature?.id))))
  let candidate = ''
  do {
    candidate = `feat-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  } while (existing.has(candidate))
  return candidate
}

function findFileIndex (files, id) {
  const normalized = normalizedId(id)
  return (files || []).findIndex(file => normalizedId(file?.id) === normalized)
}

function findFeatureIndex (file, id) {
  const normalized = normalizedId(id)
  return (file?.features || []).findIndex(feature => normalizedId(feature?.id) === normalized)
}

function insertFeature (features, feature, beforeFeatureId = '') {
  const beforeIndex = beforeFeatureId
    ? features.findIndex(item => normalizedId(item?.id) === normalizedId(beforeFeatureId))
    : -1
  if (beforeIndex < 0) features.push(feature)
  else features.splice(beforeIndex, 0, feature)
}

/**
 * Reorder or transfer one KML feature without mutating the caller's files.
 * The returned files preserve unaffected file references and clone affected files.
 */
export function transferKmlFeature (files, options = {}) {
  if (!Array.isArray(files)) throw new TypeError('files 必须是数组')
  const sourceKmlId = normalizedId(options.sourceKmlId)
  const targetKmlId = normalizedId(options.targetKmlId || sourceKmlId)
  const featureId = normalizedId(options.featureId)
  const mode = String(options.mode || 'move')
  if (!sourceKmlId || !targetKmlId || !featureId) throw new Error('要素迁移参数不完整')
  if (!['move', 'copy'].includes(mode)) throw new Error('要素迁移方式无效')

  const sourceIndex = findFileIndex(files, sourceKmlId)
  const targetIndex = findFileIndex(files, targetKmlId)
  if (sourceIndex < 0 || targetIndex < 0) throw new Error('目标 KML 文件不存在')
  const sourceFile = files[sourceIndex]
  const sourceFeatureIndex = findFeatureIndex(sourceFile, featureId)
  if (sourceFeatureIndex < 0) throw new Error('目标 KML 要素不存在')

  const isSameFile = sourceIndex === targetIndex
  const beforeFeatureId = normalizedId(options.beforeFeatureId)
  const patch = options.featurePatch && typeof options.featurePatch === 'object' ? options.featurePatch : null
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : () => createDefaultFeatureId(files)
  const nextFiles = files.slice()
  const nextSource = cloneFile(sourceFile)
  const nextTarget = isSameFile ? nextSource : cloneFile(files[targetIndex])
  nextFiles[sourceIndex] = nextSource
  nextFiles[targetIndex] = nextTarget

  const originalFeature = nextSource.features[sourceFeatureIndex]
  const editedFeature = patch ? { ...originalFeature, ...patch } : originalFeature
  if (patch && Object.hasOwn(patch, 'resourceCollection') && patch.resourceCollection == null) {
    delete editedFeature.resourceCollection
  }

  if (!isSameFile && mode === 'move' && findFeatureIndex(nextTarget, featureId) >= 0) {
    throw new Error('目标 KML 已存在相同 ID 的要素，不能直接移动')
  }

  if (mode === 'move' && isSameFile) {
    const current = nextSource.features.splice(sourceFeatureIndex, 1)[0]
    const movedFeature = patch ? cloneFeature(editedFeature) : current
    if (beforeFeatureId === featureId) {
      nextSource.features.splice(sourceFeatureIndex, 0, movedFeature)
    } else if (!beforeFeatureId) {
      nextSource.features.push(movedFeature)
    } else {
      insertFeature(nextSource.features, movedFeature, beforeFeatureId)
    }
    const orderChanged = nextSource.features.some((feature, index) => normalizedId(feature?.id) !== normalizedId(sourceFile.features[index]?.id))
    const contentChanged = Boolean(patch) && JSON.stringify(originalFeature) !== JSON.stringify(movedFeature)
    return {
      files: nextFiles,
      sourceFile: nextSource,
      targetFile: nextTarget,
      feature: movedFeature,
      featureId: normalizedId(movedFeature.id),
      changed: orderChanged || contentChanged,
      mode,
    }
  }

  const featureToInsert = cloneFeature(editedFeature)
  if (mode === 'copy') {
    const nextId = normalizedId(idFactory({
      sourceKmlId,
      targetKmlId,
      feature: cloneFeature(editedFeature),
      files: nextFiles,
    }))
    if (!nextId) throw new Error('复制要素未生成有效 ID')
    if (nextTarget.features.some(feature => normalizedId(feature?.id) === nextId)) {
      throw new Error('复制要素 ID 已存在')
    }
    featureToInsert.id = nextId
  }

  if (mode === 'move') {
    nextSource.features.splice(sourceFeatureIndex, 1)
  }

  insertFeature(nextTarget.features, featureToInsert, beforeFeatureId)
  return {
    files: nextFiles,
    sourceFile: nextSource,
    targetFile: nextTarget,
    feature: featureToInsert,
    featureId: normalizedId(featureToInsert.id),
    changed: true,
    mode,
  }
}

export function reorderKmlFeature (files, options = {}) {
  const kmlId = options.kmlId || options.sourceKmlId || options.targetKmlId
  return transferKmlFeature(files, {
    ...options,
    mode: 'move',
    sourceKmlId: kmlId,
    targetKmlId: kmlId,
  })
}

export function cloneKmlFeature (feature) {
  return cloneFeature(feature)
}
