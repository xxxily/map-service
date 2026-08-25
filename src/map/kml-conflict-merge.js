/*
 * Three-way merge helpers for account KML documents.
 *
 * The module is deliberately independent from the map, network and dialog
 * layers.  It treats the caller's `local` value as the safe default whenever
 * a real conflict cannot be resolved automatically; callers can then present
 * the recorded conflict paths and apply an explicit user choice.
 */

const FILE_FIELDS = [
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

const FEATURE_FIELDS = [
  'type',
  'name',
  'description',
  'coordinates',
  'styleUrl',
  'markerIcon',
  'resourceCollection',
]

function cloneValue (value) {
  if (value === undefined || value === null || typeof value !== 'object') return value
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function isObject (value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function deepEqual (left, right) {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => deepEqual(value, right[index]))
  }
  if (isObject(left) || isObject(right)) {
    if (!isObject(left) || !isObject(right)) return false
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false
    return leftKeys.every(key => deepEqual(left[key], right[key]))
  }
  return false
}

function normalizeId (value) {
  return String(value || '').trim()
}

function pathId (value) {
  return encodeURIComponent(normalizeId(value)).replaceAll('.', '%2E')
}

function conflict (path, base, local, server, kind = 'field', meta = {}) {
  return {
    path,
    kind,
    base: cloneValue(base),
    local: cloneValue(local),
    server: cloneValue(server),
    defaultChoice: 'local',
    ...meta,
  }
}

function mergeScalar (base, local, server, path, conflicts, kind = 'field', meta = {}) {
  if (deepEqual(local, server)) return cloneValue(local)
  if (deepEqual(local, base)) return cloneValue(server)
  if (deepEqual(server, base)) return cloneValue(local)
  conflicts.push(conflict(path, base, local, server, kind, meta))
  return cloneValue(local)
}

function idsOf (items) {
  return (Array.isArray(items) ? items : []).map(item => normalizeId(item?.id))
}

function hasUniqueStableIds (items) {
  const ids = idsOf(items)
  return ids.every(Boolean) && new Set(ids).size === ids.length
}

function hasResourceItemArray (collection) {
  return collection == null || (isObject(collection) && Array.isArray(collection.items))
}

function mapById (items) {
  return new Map((Array.isArray(items) ? items : []).map(item => [normalizeId(item?.id), item]))
}

function appendMissingIds (preferredIds, allIds) {
  const result = [...preferredIds]
  const included = new Set(result)
  allIds.forEach(id => {
    if (!included.has(id)) {
      result.push(id)
      included.add(id)
    }
  })
  return result
}

function mergeOrder (baseItems, localItems, serverItems, path, conflicts, meta = {}) {
  const baseIds = idsOf(baseItems)
  const localIds = idsOf(localItems)
  const serverIds = idsOf(serverItems)
  if (!hasUniqueStableIds(baseItems) || !hasUniqueStableIds(localItems) || !hasUniqueStableIds(serverItems)) {
    conflicts.push(conflict(path, baseIds, localIds, serverIds, 'order', {
      reason: 'missing-stable-id',
      ...meta,
    }))
    return localIds
  }
  if (deepEqual(localIds, serverIds)) return localIds
  if (deepEqual(localIds, baseIds)) return serverIds
  if (deepEqual(serverIds, baseIds)) return localIds

  const localReordered = relativeExistingOrderChanged(baseItems, localItems)
  const serverReordered = relativeExistingOrderChanged(baseItems, serverItems)
  if (localReordered && !serverReordered) return appendMissingIds(localIds, serverIds)
  if (serverReordered && !localReordered) return appendMissingIds(serverIds, localIds)

  const allIds = [...new Set([...baseIds, ...localIds, ...serverIds])]
  const localSet = new Set(localIds)
  const serverSet = new Set(serverIds)
  const commonSet = new Set(allIds.filter(id => localSet.has(id) && serverSet.has(id)))
  const localCommon = localIds.filter(id => commonSet.has(id))
  const serverCommon = serverIds.filter(id => commonSet.has(id))
  if (!deepEqual(localCommon, serverCommon)) {
    conflicts.push(conflict(path, baseIds, localIds, serverIds, 'order', {
      reason: 'reordered-both-sides',
      ...meta,
    }))
    return appendMissingIds(localIds, allIds)
  }

  const graph = new Map(allIds.map(id => [id, new Set()]))
  const indegree = new Map(allIds.map(id => [id, 0]))
  const addEdges = ids => {
    for (let index = 1; index < ids.length; index += 1) {
      const from = ids[index - 1]
      const to = ids[index]
      if (graph.get(from).has(to)) continue
      graph.get(from).add(to)
      indegree.set(to, indegree.get(to) + 1)
    }
  }
  // Branch order is authoritative. Base order only breaks ties; making it a
  // hard constraint would reject a reorder that both branches agree on.
  addEdges(localIds)
  addEdges(serverIds)

  const localIndex = new Map(localIds.map((id, index) => [id, index]))
  const serverIndex = new Map(serverIds.map((id, index) => [id, index]))
  const baseIndex = new Map(baseIds.map((id, index) => [id, index]))
  const allIndex = new Map(allIds.map((id, index) => [id, index]))
  const rank = id => {
    const localRank = localIndex.get(id) ?? Number.MAX_SAFE_INTEGER
    const serverRank = serverIndex.get(id) ?? Number.MAX_SAFE_INTEGER
    const baseRank = baseIndex.get(id) ?? Number.MAX_SAFE_INTEGER
    return [localRank, serverRank, baseRank, allIndex.get(id)]
  }
  const compareRank = (left, right) => {
    const a = rank(left)
    const b = rank(right)
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) return a[index] - b[index]
    }
    return 0
  }
  const ready = []
  const pushReady = value => {
    ready.push(value)
    let index = ready.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (compareRank(ready[parent], ready[index]) <= 0) break
      ;[ready[parent], ready[index]] = [ready[index], ready[parent]]
      index = parent
    }
  }
  const takeReady = () => {
    const first = ready[0]
    const last = ready.pop()
    if (ready.length && last !== undefined) {
      ready[0] = last
      let index = 0
      while (true) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < ready.length && compareRank(ready[left], ready[smallest]) < 0) smallest = left
        if (right < ready.length && compareRank(ready[right], ready[smallest]) < 0) smallest = right
        if (smallest === index) break
        ;[ready[index], ready[smallest]] = [ready[smallest], ready[index]]
        index = smallest
      }
    }
    return first
  }
  allIds.forEach(id => {
    if (indegree.get(id) === 0) pushReady(id)
  })
  const result = []
  while (ready.length) {
    const current = takeReady()
    result.push(current)
    for (const next of graph.get(current)) {
      indegree.set(next, indegree.get(next) - 1)
      if (indegree.get(next) === 0) pushReady(next)
    }
  }
  if (result.length !== allIds.length) {
    conflicts.push(conflict(path, baseIds, localIds, serverIds, 'order', {
      reason: 'incompatible-order',
      ...meta,
    }))
    return appendMissingIds(localIds, allIds)
  }
  return result
}

function mergeResourceCollection (base, local, server, path, conflicts, meta = {}) {
  if (local == null && server == null) return null
  const collections = [base, local, server]
  const malformedShape = collections.some(collection => (
    collection != null && (!isObject(collection) || !Array.isArray(collection.items))
  ))
  const unstablePartialCollection = !collections.every(isObject) && collections.some(collection => (
    isObject(collection) && Array.isArray(collection.items) && !hasUniqueStableIds(collection.items)
  ))
  if (malformedShape || unstablePartialCollection) {
    conflicts.push(conflict(path, base, local, server, 'unsupported', {
      target: 'feature-field',
      field: 'resourceCollection',
      reason: 'missing-stable-id',
      blocking: true,
      ...meta,
    }))
    return cloneValue(local)
  }
  if (!isObject(local) || !isObject(server) || !isObject(base)) {
    return mergeScalar(base, local, server, path, conflicts, 'field', {
      target: 'feature-field',
      field: 'resourceCollection',
      ...meta,
    })
  }
  const result = {}
  const scalarFields = ['version', 'viewMode']
  scalarFields.forEach(field => {
    if (local[field] === undefined && server[field] === undefined && base[field] === undefined) return
    result[field] = mergeScalar(base[field], local[field], server[field], `${path}.${field}`, conflicts, 'field', {
      ...meta,
      target: 'resource-collection-field',
      field,
    })
  })
  const baseItems = Array.isArray(base.items) ? base.items : []
  const localItems = Array.isArray(local.items) ? local.items : []
  const serverItems = Array.isArray(server.items) ? server.items : []
  if (!hasResourceItemArray(base) || !hasResourceItemArray(local) || !hasResourceItemArray(server) ||
      !hasUniqueStableIds(baseItems) || !hasUniqueStableIds(localItems) || !hasUniqueStableIds(serverItems)) {
    conflicts.push(conflict(`${path}.items`, baseItems, localItems, serverItems, 'unsupported', {
      ...meta,
      target: 'resource-items',
      reason: 'missing-stable-id',
      blocking: true,
    }))
    return cloneValue(local)
  }
  const baseMap = mapById(baseItems)
  const localMap = mapById(localItems)
  const serverMap = mapById(serverItems)
  const mergedItems = new Map()
  const itemIds = [...new Set([...idsOf(baseItems), ...idsOf(localItems), ...idsOf(serverItems)])]
  for (const id of itemIds) {
    const itemBase = baseMap.get(id)
    const itemLocal = localMap.get(id)
    const itemServer = serverMap.get(id)
    const itemPath = `${path}.items.${pathId(id)}`
    if (!itemLocal && !itemServer) continue
    if (!itemLocal || !itemServer) {
      if (!itemBase) {
        mergedItems.set(id, cloneValue(itemLocal || itemServer))
      } else if (!itemLocal && deepEqual(itemServer, itemBase)) {
        // Local deletion wins when the server did not change the item.
      } else if (!itemServer && deepEqual(itemLocal, itemBase)) {
        // Server deletion wins when the local side did not change the item.
      } else {
        conflicts.push(conflict(itemPath, itemBase, itemLocal, itemServer, 'delete-modify', {
          ...meta,
          target: 'resource-item',
          resourceId: id,
        }))
        mergedItems.set(id, cloneValue(itemLocal || itemServer))
      }
      continue
    }
    mergedItems.set(id, {
      id,
      ...mergeObjectFields(itemBase || {}, itemLocal, itemServer, itemPath, conflicts, [
        'title', 'url', 'type',
      ], {
        ...meta,
        target: 'resource-item-field',
        resourceId: id,
      }),
    })
  }
  const orderedIds = mergeOrder(baseItems, localItems, serverItems, `${path}.items.order`, conflicts, {
    ...meta,
    target: 'resource-order',
  })
  result.items = orderedIds.filter(id => mergedItems.has(id)).map(id => mergedItems.get(id))
  return result
}

function mergeObjectFields (base, local, server, path, conflicts, fields, meta = {}) {
  const result = {}
  const keys = fields.length
    ? fields
    : [...new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(server || {})])]
  for (const key of keys) {
    if (key === 'id') continue
    if (key === 'resourceCollection') {
      const value = mergeResourceCollection(base?.[key], local?.[key], server?.[key], `${path}.${key}`, conflicts, meta)
      if (value != null) result[key] = value
      continue
    }
    const value = mergeScalar(base?.[key], local?.[key], server?.[key], `${path}.${key}`, conflicts, 'field', {
      ...meta,
      field: key,
    })
    if (value !== undefined) result[key] = value
  }
  return result
}

function mergeFeature (base, local, server, path, conflicts) {
  if (!local && !server) return null
  if (!local || !server) {
    if (!base) return cloneValue(local || server)
    if (!local && deepEqual(server, base)) return null
    if (!server && deepEqual(local, base)) return null
    conflicts.push(conflict(path, base, local, server, 'delete-modify', {
      target: 'feature',
      featureId: normalizeId(local?.id || server?.id || base?.id),
    }))
    return cloneValue(local || server)
  }
  return {
    id: normalizeId(local.id || server.id || base?.id),
    ...mergeObjectFields(base || {}, local, server, path, conflicts, FEATURE_FIELDS, {
      target: 'feature-field',
      featureId: normalizeId(local.id || server.id || base?.id),
    }),
  }
}

function isAutomaticallyMergedScalar (base, local, server) {
  if (deepEqual(local, server)) return !deepEqual(local, base)
  if (deepEqual(local, base)) return !deepEqual(server, base)
  if (deepEqual(server, base)) return !deepEqual(local, base)
  return false
}

function hasConflictWithin (conflicts, path) {
  return conflicts.some(item => item.path === path || String(item.path || '').startsWith(`${path}.`))
}

function relativeExistingOrderChanged (baseItems, branchItems) {
  if (!hasUniqueStableIds(baseItems) || !hasUniqueStableIds(branchItems)) return false
  const baseIds = idsOf(baseItems)
  const branchIds = idsOf(branchItems)
  const baseSet = new Set(baseIds)
  const branchSet = new Set(branchIds)
  const baseCommon = baseIds.filter(id => branchSet.has(id))
  const branchCommon = branchIds.filter(id => baseSet.has(id))
  return !deepEqual(baseCommon, branchCommon)
}

function collectScalarAutoMerge (base, local, server, path, conflicts, paths) {
  if (hasConflictWithin(conflicts, path)) return
  if (isAutomaticallyMergedScalar(base, local, server)) paths.add(path)
}

function collectResourceAutoMerges (base, local, server, path, conflicts, paths) {
  const collections = [base, local, server]
  const canMergeItems = collections.every(collection => (
    isObject(collection) && Array.isArray(collection.items) && hasUniqueStableIds(collection.items)
  ))
  if (!canMergeItems) {
    collectScalarAutoMerge(base, local, server, path, conflicts, paths)
    return
  }

  for (const field of ['version', 'viewMode']) {
    collectScalarAutoMerge(base[field], local[field], server[field], `${path}.${field}`, conflicts, paths)
  }

  const baseItems = base.items
  const localItems = local.items
  const serverItems = server.items
  const baseMap = mapById(baseItems)
  const localMap = mapById(localItems)
  const serverMap = mapById(serverItems)
  const itemIds = [...new Set([...idsOf(baseItems), ...idsOf(localItems), ...idsOf(serverItems)])]
  itemIds.forEach(id => {
    const itemBase = baseMap.get(id)
    const itemLocal = localMap.get(id)
    const itemServer = serverMap.get(id)
    const itemPath = `${path}.items.${pathId(id)}`
    if (!itemBase) {
      if ((itemLocal || itemServer) && !hasConflictWithin(conflicts, itemPath)) paths.add(itemPath)
      return
    }
    if (!itemLocal || !itemServer) {
      const safelyDeleted = (!itemLocal && !itemServer) ||
        (!itemLocal && deepEqual(itemServer, itemBase)) ||
        (!itemServer && deepEqual(itemLocal, itemBase))
      if (safelyDeleted && !hasConflictWithin(conflicts, itemPath)) paths.add(itemPath)
      return
    }
    for (const field of ['title', 'url', 'type']) {
      collectScalarAutoMerge(
        itemBase[field],
        itemLocal[field],
        itemServer[field],
        `${itemPath}.${field}`,
        conflicts,
        paths,
      )
    }
  })

  const orderPath = `${path}.items.order`
  if (!hasConflictWithin(conflicts, orderPath) && (
    relativeExistingOrderChanged(baseItems, localItems) ||
    relativeExistingOrderChanged(baseItems, serverItems)
  )) paths.add(orderPath)
}

function collectDocumentAutoMerges (base, local, server, path, conflicts) {
  const paths = new Set()
  FILE_FIELDS.forEach(field => {
    // The default file is an account-level invariant. Count it once through
    // account.defaultFile instead of once for every affected file boolean.
    if (field === 'isDefault') return
    collectScalarAutoMerge(base[field], local[field], server[field], `${path}.${field}`, conflicts, paths)
  })

  const baseFeatures = Array.isArray(base.features) ? base.features : []
  const localFeatures = Array.isArray(local.features) ? local.features : []
  const serverFeatures = Array.isArray(server.features) ? server.features : []
  if (!hasUniqueStableIds(baseFeatures) || !hasUniqueStableIds(localFeatures) || !hasUniqueStableIds(serverFeatures)) {
    return paths
  }
  const baseMap = mapById(baseFeatures)
  const localMap = mapById(localFeatures)
  const serverMap = mapById(serverFeatures)
  const featureIds = [...new Set([...idsOf(baseFeatures), ...idsOf(localFeatures), ...idsOf(serverFeatures)])]
  featureIds.forEach(id => {
    const featureBase = baseMap.get(id)
    const featureLocal = localMap.get(id)
    const featureServer = serverMap.get(id)
    const featurePath = `${path}.features.${pathId(id)}`
    if (!featureBase) {
      if ((featureLocal || featureServer) && !hasConflictWithin(conflicts, featurePath)) paths.add(featurePath)
      return
    }
    if (!featureLocal || !featureServer) {
      const safelyDeleted = (!featureLocal && !featureServer) ||
        (!featureLocal && deepEqual(featureServer, featureBase)) ||
        (!featureServer && deepEqual(featureLocal, featureBase))
      if (safelyDeleted && !hasConflictWithin(conflicts, featurePath)) paths.add(featurePath)
      return
    }
    FEATURE_FIELDS.forEach(field => {
      const fieldPath = `${featurePath}.${field}`
      if (field === 'resourceCollection') {
        collectResourceAutoMerges(
          featureBase[field],
          featureLocal[field],
          featureServer[field],
          fieldPath,
          conflicts,
          paths,
        )
        return
      }
      collectScalarAutoMerge(
        featureBase[field],
        featureLocal[field],
        featureServer[field],
        fieldPath,
        conflicts,
        paths,
      )
    })
  })

  const orderPath = `${path}.features.order`
  if (!hasConflictWithin(conflicts, orderPath) && (
    relativeExistingOrderChanged(baseFeatures, localFeatures) ||
    relativeExistingOrderChanged(baseFeatures, serverFeatures)
  )) paths.add(orderPath)
  return paths
}

export function mergeKmlDocument (base, local, server, options = {}) {
  const conflicts = []
  if (!base || !local || !server) {
    return {
      file: cloneValue(local || server || base || null),
      conflicts: [conflict(options.path || 'file', base, local, server, 'delete-modify')],
      autoMergedCount: 0,
      autoMergedPaths: [],
      supported: false,
    }
  }
  const file = mergeObjectFields(base, local, server, options.path || 'file', conflicts, FILE_FIELDS, {
    target: 'file-field',
  })
  const baseFeatures = Array.isArray(base.features) ? base.features : []
  const localFeatures = Array.isArray(local.features) ? local.features : []
  const serverFeatures = Array.isArray(server.features) ? server.features : []
  const baseMap = mapById(baseFeatures)
  const localMap = mapById(localFeatures)
  const serverMap = mapById(serverFeatures)
  const supported = hasUniqueStableIds(baseFeatures) && hasUniqueStableIds(localFeatures) && hasUniqueStableIds(serverFeatures)
  if (!supported) {
    conflicts.push(conflict(`${options.path || 'file'}.features`, baseFeatures, localFeatures, serverFeatures, 'unsupported', {
      target: 'features',
      blocking: true,
      reason: 'missing-stable-id',
    }))
    file.features = cloneValue(localFeatures)
    const autoMergedPaths = [...collectDocumentAutoMerges(
      base,
      local,
      server,
      options.path || 'file',
      conflicts,
    )]
    return { file, conflicts, autoMergedCount: autoMergedPaths.length, autoMergedPaths, supported: false }
  }
  const mergedFeatures = new Map()
  const featureIds = [...new Set([...idsOf(baseFeatures), ...idsOf(localFeatures), ...idsOf(serverFeatures)])]
  for (const id of featureIds) {
    const merged = mergeFeature(
      baseMap.get(id),
      localMap.get(id),
      serverMap.get(id),
      `${options.path || 'file'}.features.${pathId(id)}`,
      conflicts,
    )
    if (merged) mergedFeatures.set(id, merged)
  }
  const orderedIds = mergeOrder(baseFeatures, localFeatures, serverFeatures, `${options.path || 'file'}.features.order`, conflicts, {
    target: 'feature-order',
  })
  file.features = orderedIds.filter(id => mergedFeatures.has(id)).map(id => mergedFeatures.get(id))
  const autoMergedPaths = [...collectDocumentAutoMerges(
    base,
    local,
    server,
    options.path || 'file',
    conflicts,
  )]
  return {
    file,
    conflicts,
    autoMergedCount: autoMergedPaths.length,
    autoMergedPaths,
    supported: !conflicts.some(item => item.kind === 'unsupported'),
  }
}

function mergePayload (file) {
  if (!file || typeof file !== 'object') return file
  const payload = {}
  FILE_FIELDS.forEach(field => {
    if (Object.hasOwn(file, field)) payload[field] = cloneValue(file[field])
  })
  payload.features = cloneValue(Array.isArray(file.features) ? file.features : [])
  return payload
}

function snapshotEntries (snapshots) {
  if (snapshots instanceof Map) return [...snapshots.values()]
  return Array.isArray(snapshots) ? snapshots : []
}

export function mergeKmlFileSets (localFiles, serverFiles, snapshots) {
  const local = Array.isArray(localFiles) ? localFiles : []
  const server = Array.isArray(serverFiles) ? serverFiles : []
  const snapshotList = snapshotEntries(snapshots)
  const snapshotByLocalId = new Map(snapshotList.map(item => [normalizeId(item?.localId), item]))
  const snapshotByServerId = new Map(snapshotList.map(item => [normalizeId(item?.serverId), item]))
  const localById = new Map(local.map(file => [normalizeId(file?.id), file]))
  const serverFileById = new Map(server.map(file => [normalizeId(file?.id), file]))
  const serverIdBySyncClientId = new Map(server.flatMap(file => {
    const clientId = normalizeId(file?.syncClientId)
    const serverId = normalizeId(file?.id)
    return clientId && serverId ? [[clientId, serverId]] : []
  }))
  const serverById = new Map(server
    .filter(file => file?.status !== 'trashed')
    .map(file => [normalizeId(file?.id), file]))
  const localIdForServer = serverId => (
    snapshotByServerId.get(serverId)?.localId ||
    normalizeId(serverFileById.get(serverId)?.syncClientId) ||
    serverId
  )
  const allLocalIds = [...new Set([
    ...local.map(file => normalizeId(file?.id)),
    ...server.map(file => localIdForServer(normalizeId(file?.id))),
    ...snapshotList.map(item => normalizeId(item?.localId)),
  ].filter(Boolean))]
  const mergedByLocalId = new Map()
  const conflicts = []
  const autoMergedPaths = new Set()

  for (const localId of allLocalIds) {
    const snapshot = snapshotByLocalId.get(localId)
    const serverId = normalizeId(
      snapshot?.serverId ||
      localById.get(localId)?.serverId ||
      serverIdBySyncClientId.get(localId) ||
      localId
    )
    const localFile = localById.get(localId)
    const serverFile = serverById.get(serverId)
    const base = snapshot?.base
    const path = `file.${pathId(localId)}`
    const syncMatchedServerId = serverIdBySyncClientId.get(localId)
    if (syncMatchedServerId && (!snapshot?.serverId || snapshot.serverId !== syncMatchedServerId)) {
      autoMergedPaths.add(`${path}.syncClientId`)
    }

    if (localFile && serverFile) {
      if (!base) {
        if (deepEqual(mergePayload(localFile), mergePayload(serverFile))) {
          mergedByLocalId.set(localId, cloneValue(localFile))
        } else {
          conflicts.push(conflict(path, null, localFile, serverFile, 'unsupported', {
            target: 'file',
            localId,
            fileId: localId,
            reason: 'missing-base',
          }))
          mergedByLocalId.set(localId, cloneValue(localFile))
        }
        continue
      }
      const result = mergeKmlDocument(base, mergePayload(localFile), mergePayload(serverFile), { path })
      const merged = {
        ...cloneValue(localFile),
        ...result.file,
        id: localFile.id,
        serverId: serverFile.id,
        revision: serverFile.revision,
      }
      result.conflicts.forEach(item => conflicts.push({ ...item, localId, fileId: localId }))
      result.autoMergedPaths.forEach(item => autoMergedPaths.add(item))
      mergedByLocalId.set(localId, merged)
      continue
    }

    if (localFile && !serverFile) {
      if (!snapshot) {
        mergedByLocalId.set(localId, cloneValue(localFile))
        autoMergedPaths.add(path)
      } else if (base && deepEqual(mergePayload(localFile), mergePayload(base))) {
        // The server deleted an unchanged local file; preserve that deletion.
        autoMergedPaths.add(path)
      } else {
        conflicts.push(conflict(path, base || null, localFile, null, 'delete-modify', {
          target: 'file',
          localId,
          fileId: localId,
          reason: 'server-deleted',
          serverStatus: serverFileById.get(serverId)?.status || 'missing',
          serverId,
        }))
        mergedByLocalId.set(localId, cloneValue(localFile))
      }
      continue
    }

    if (!localFile && serverFile) {
      if (!snapshot) {
        mergedByLocalId.set(localId, {
          ...cloneValue(serverFile),
          id: localId,
          serverId: serverFile.id,
        })
        autoMergedPaths.add(path)
      } else if (base && deepEqual(mergePayload(serverFile), mergePayload(base))) {
        // Local deletion wins when the server did not change the file.
        autoMergedPaths.add(path)
      } else {
        conflicts.push(conflict(path, base, null, serverFile, 'delete-modify', {
          target: 'file',
          localId,
          fileId: localId,
          reason: 'local-deleted',
        }))
        // Keep the local deletion as the safe default by omitting the file.
      }
    }
  }

  const files = []
  const emitted = new Set()
  for (const file of local) {
    const localId = normalizeId(file?.id)
    if (!localId || emitted.has(localId)) continue
    if (mergedByLocalId.has(localId)) {
      files.push(mergedByLocalId.get(localId))
      emitted.add(localId)
    }
  }
  for (const file of server.filter(candidate => candidate?.status !== 'trashed')) {
    const localId = localIdForServer(normalizeId(file?.id))
    if (!localId || emitted.has(localId)) continue
    if (mergedByLocalId.has(localId)) {
      files.push(mergedByLocalId.get(localId))
      emitted.add(localId)
    }
  }
  for (const [localId, file] of mergedByLocalId) {
    if (!emitted.has(localId)) files.push(file)
  }
  const defaultId = values => {
    const defaults = values.filter(file => file?.status !== 'trashed' && file?.isDefault)
    return defaults.length === 1 ? normalizeId(defaults[0]?.id) : ''
  }
  const baseDefaults = snapshotList.filter(item => item?.base?.isDefault)
  const baseDefaultId = baseDefaults.length === 1 ? normalizeId(baseDefaults[0]?.localId) : ''
  const localDefaultId = defaultId(local)
  const serverDefaultId = localIdForServer(defaultId(server))
  const rawMergedDefaultId = mergeScalar(
    baseDefaultId,
    localDefaultId,
    serverDefaultId,
    'account.defaultFile',
    conflicts,
    'field',
    {
      target: 'default-file',
      field: 'isDefault',
      localId: localDefaultId || serverDefaultId || baseDefaultId,
      fileId: localDefaultId || serverDefaultId || baseDefaultId,
    },
  )
  const activeFileIds = new Set(files
    .filter(file => file?.status !== 'trashed')
    .map(file => normalizeId(file?.id))
    .filter(Boolean))
  const mergedDefaultId = [
    rawMergedDefaultId,
    serverDefaultId,
    localDefaultId,
    baseDefaultId,
    defaultId(files),
    files.find(file => file?.status !== 'trashed')?.id,
  ].map(normalizeId).find(id => id && activeFileIds.has(id)) || ''
  files.forEach(file => {
    file.isDefault = Boolean(mergedDefaultId && normalizeId(file?.id) === mergedDefaultId)
  })
  if (!conflicts.some(item => item.path === 'account.defaultFile') &&
      rawMergedDefaultId === mergedDefaultId &&
      isAutomaticallyMergedScalar(baseDefaultId, localDefaultId, serverDefaultId)) {
    autoMergedPaths.add('account.defaultFile')
  }
  return {
    files,
    conflicts,
    autoMergedCount: autoMergedPaths.size,
    autoMergedPaths: [...autoMergedPaths],
    conflictSummary: summarizeKmlMergeConflicts(conflicts),
  }
}

export function applyKmlMergeChoices (mergeResult, choices = {}, options = {}) {
  const files = cloneValue(mergeResult?.files || [])
  const conflicts = Array.isArray(mergeResult?.conflicts) ? mergeResult.conflicts : []
  const replacementIds = new Map()
  let preferredDefaultId = normalizeId(files.filter(file => file?.isDefault).length === 1
    ? files.find(file => file?.isDefault)?.id
    : '')
  let accountDefaultSelection = null
  const getChoice = conflictItem => choices[conflictItem.path] === 'server' ? 'server' : 'local'
  const fileIdFromConflict = item => normalizeId(item.fileId || item.localId || String(item.path || '').split('.')[1])
  const findFile = item => {
    const fileId = fileIdFromConflict(item)
    return {
      fileId,
      index: files.findIndex(file => normalizeId(file?.id) === fileId),
    }
  }
  const findFeature = (file, featureId) => {
    const list = Array.isArray(file?.features) ? file.features : []
    const index = list.findIndex(feature => normalizeId(feature?.id) === normalizeId(featureId))
    return { list, index, feature: index >= 0 ? list[index] : null }
  }
  const applyOrder = (list, ids) => {
    if (!Array.isArray(list) || !Array.isArray(ids)) return
    const byId = new Map(list.map(entry => [normalizeId(entry?.id), entry]))
    const chosen = []
    const included = new Set()
    ids.forEach(id => {
      const normalizedId = normalizeId(id)
      if (!normalizedId || included.has(normalizedId) || !byId.has(normalizedId)) return
      chosen.push(byId.get(normalizedId))
      included.add(normalizedId)
    })
    list.forEach(entry => {
      const id = normalizeId(entry?.id)
      if (!included.has(id)) chosen.push(entry)
    })
    list.splice(0, list.length, ...chosen)
  }
  conflicts.forEach(item => {
    const value = getChoice(item) === 'server' ? item.server : item.local
    if (item.target === 'default-file') {
      const selectedId = normalizeId(value)
      accountDefaultSelection = selectedId
      if (selectedId && files.some(file => normalizeId(file?.id) === selectedId)) preferredDefaultId = selectedId
      return
    }
    const { fileId, index: targetIndex } = findFile(item)
    const target = targetIndex >= 0 ? files[targetIndex] : null
    if (item.target === 'file') {
      if (value == null) {
        if (targetIndex >= 0) files.splice(targetIndex, 1)
      } else {
        const mustCreateCopy = getChoice(item) === 'local' &&
          item.reason === 'server-deleted' && item.serverStatus === 'missing'
        const generatedId = options.createId instanceof Function
          ? options.createId(item)
          : `kml-merge-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
        const replacement = { ...cloneValue(value), id: mustCreateCopy ? generatedId : fileId }
        if (mustCreateCopy) {
          delete replacement.serverId
          delete replacement.revision
          delete replacement.syncClientId
          delete replacement.status
          delete replacement.createdAt
          delete replacement.updatedAt
          delete replacement.shareReferenceCount
          delete replacement.outdatedShareReferenceCount
          replacementIds.set(fileId, normalizeId(generatedId))
          if (preferredDefaultId === fileId) preferredDefaultId = generatedId
          if (accountDefaultSelection === fileId) accountDefaultSelection = generatedId
        }
        if (!mustCreateCopy && replacement.serverId === undefined && value.id && value.id !== fileId) {
          replacement.serverId = value.id
        }
        if (targetIndex >= 0) files.splice(targetIndex, 1, replacement)
        else files.push(replacement)
      }
      return
    }
    if (!target) return
    if (item.target === 'features') {
      target.features = cloneValue(Array.isArray(value) ? value : [])
      return
    }
    if (item.target === 'file-field') {
      if (value === undefined) delete target[item.field]
      else target[item.field] = cloneValue(value)
      if (item.field === 'isDefault' && accountDefaultSelection === null) {
        preferredDefaultId = value === true ? fileId : ''
      }
      return
    }
    if (item.target === 'feature-order') {
      applyOrder(target.features, value)
      return
    }
    const featureId = item.featureId
    if (item.target === 'feature') {
      const feature = findFeature(target, featureId)
      if (value == null) {
        if (feature.index >= 0) feature.list.splice(feature.index, 1)
      } else if (feature.index >= 0) {
        feature.list[feature.index] = cloneValue(value)
      } else {
        feature.list.push(cloneValue(value))
      }
      return
    }
    const feature = findFeature(target, featureId)
    if (feature.index < 0) return
    if (item.target === 'feature-field') {
      if (value === undefined) delete feature.feature[item.field]
      else feature.feature[item.field] = cloneValue(value)
      return
    }
    const collection = feature.feature.resourceCollection
    if (item.target === 'resource-collection-field') {
      if (!isObject(collection)) return
      if (value === undefined) delete collection[item.field]
      else collection[item.field] = cloneValue(value)
      return
    }
    if (item.target === 'resource-items') {
      if (!isObject(collection)) return
      collection.items = cloneValue(Array.isArray(value) ? value : [])
      return
    }
    if (!isObject(collection) || !Array.isArray(collection.items)) return
    if (item.target === 'resource-order') {
      applyOrder(collection.items, value)
      return
    }
    const itemIndex = collection.items.findIndex(entry => normalizeId(entry?.id) === normalizeId(item.resourceId))
    if (item.target === 'resource-item') {
      if (value == null) {
        if (itemIndex >= 0) collection.items.splice(itemIndex, 1)
      } else if (itemIndex >= 0) {
        collection.items[itemIndex] = cloneValue(value)
      } else {
        collection.items.push(cloneValue(value))
      }
      return
    }
    if (item.target === 'resource-item-field' && itemIndex >= 0) {
      if (value === undefined) delete collection.items[itemIndex][item.field]
      else collection.items[itemIndex][item.field] = cloneValue(value)
    }
  })
  const activeFiles = files.filter(file => file?.status !== 'trashed')
  const rawSelectedDefaultId = accountDefaultSelection === null
    ? preferredDefaultId
    : accountDefaultSelection
  const selectedDefaultId = replacementIds.get(normalizeId(rawSelectedDefaultId)) ||
    normalizeId(rawSelectedDefaultId)
  if (accountDefaultSelection !== null && selectedDefaultId &&
      !activeFiles.some(file => normalizeId(file?.id) === selectedDefaultId)) {
    throw new Error('所选默认 KML 已在其他冲突项中删除，请重新处理冲突')
  }
  const validDefaultId = activeFiles.some(file => normalizeId(file?.id) === selectedDefaultId)
    ? selectedDefaultId
    : normalizeId(activeFiles.find(file => file?.isDefault)?.id || activeFiles[0]?.id)
  files.forEach(file => {
    file.isDefault = Boolean(validDefaultId && normalizeId(file?.id) === validDefaultId)
  })
  return files
}

export function summarizeKmlMergeConflicts (conflicts = []) {
  const list = Array.isArray(conflicts) ? conflicts : []
  return {
    total: list.length,
    files: new Set(list.map(item => String(item.fileId || item.localId || '')).filter(Boolean)).size,
    fields: list.filter(item => item.kind === 'field').length,
    features: list.filter(item => item.path.includes('.features.')).length,
    resources: list.filter(item => item.path.includes('resourceCollection')).length,
    orders: list.filter(item => item.kind === 'order').length,
  }
}
