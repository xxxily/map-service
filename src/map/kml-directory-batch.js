function normalizeIds (values) {
  return [...new Set(Array.from(values || [], value => String(value || '')).filter(Boolean))]
}

export function createKmlDirectoryBatchSelectionModel () {
  let active = false
  let directoryId = ''
  let generation = 0
  const selectedIds = new Set()

  const advanceGeneration = () => {
    generation += 1
    return generation
  }

  return {
    get active () {
      return active
    },

    get directoryId () {
      return directoryId
    },

    get count () {
      return selectedIds.size
    },

    get generation () {
      return generation
    },

    activate (nextDirectoryId) {
      active = true
      directoryId = String(nextDirectoryId || '')
      selectedIds.clear()
      advanceGeneration()
    },

    deactivate () {
      active = false
      directoryId = ''
      selectedIds.clear()
      advanceGeneration()
    },

    isActive (candidateDirectoryId) {
      return active && (candidateDirectoryId === undefined || directoryId === String(candidateDirectoryId || ''))
    },

    isCurrent (candidateDirectoryId, candidateGeneration) {
      return active &&
        directoryId === String(candidateDirectoryId || '') &&
        generation === Number(candidateGeneration)
    },

    has (fileId) {
      return selectedIds.has(String(fileId || ''))
    },

    toggle (fileId) {
      const id = String(fileId || '')
      if (!active || !id) return false
      if (selectedIds.has(id)) selectedIds.delete(id)
      else selectedIds.add(id)
      advanceGeneration()
      return selectedIds.has(id)
    },

    selectAll (fileIds) {
      selectedIds.clear()
      normalizeIds(fileIds).forEach(id => selectedIds.add(id))
      advanceGeneration()
      return selectedIds.size
    },

    clear () {
      selectedIds.clear()
      advanceGeneration()
    },

    prune (fileIds) {
      const allowed = new Set(normalizeIds(fileIds))
      const previousSize = selectedIds.size
      for (const id of selectedIds) {
        if (!allowed.has(id)) selectedIds.delete(id)
      }
      if (selectedIds.size !== previousSize) advanceGeneration()
      return selectedIds.size
    },

    getSelectedIds () {
      return [...selectedIds]
    },
  }
}

export async function toggleKmlDirectoryBatchSelectionAll (options = {}) {
  const selection = options.selection
  const directoryId = String(options.directoryId || '')
  const files = Array.isArray(options.files) ? options.files.filter(Boolean) : []
  if (!selection?.isActive(directoryId)) return { changed: false, reason: 'inactive' }
  if (!files.length) return { changed: false, reason: 'empty' }

  const fileIds = normalizeIds(files.map(file => file.id))
  const allSelected = fileIds.length > 0 && fileIds.every(id => selection.has(id))
  if (allSelected) {
    selection.clear()
    return { changed: true, selected: false, fileIds }
  }

  if (!(options.loadFiles instanceof Function)) {
    return { changed: false, reason: 'loader-missing' }
  }

  const generation = selection.generation
  let results
  try {
    results = await options.loadFiles(files)
  } catch (error) {
    if (!selection.isCurrent(directoryId, generation)) {
      return { changed: false, reason: 'stale' }
    }
    return { changed: false, reason: 'load-failed', error }
  }
  if (!selection.isCurrent(directoryId, generation)) {
    return { changed: false, reason: 'stale' }
  }
  const failedIndex = Array.isArray(results) && results.length === files.length
    ? results.findIndex(result => !result)
    : 0
  if (failedIndex >= 0) {
    return {
      changed: false,
      reason: 'load-failed',
      failedFile: files[failedIndex] || null,
    }
  }

  selection.selectAll(fileIds)
  return { changed: true, selected: true, fileIds }
}
