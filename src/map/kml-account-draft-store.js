const DB_NAME = 'map-service-kml-recovery'
const DB_VERSION = 1
const STORE_NAME = 'kml-account-drafts'
const LOCAL_PREFIX = 'map_kml_account_recovery_v1:'
const DEFAULT_LOCAL_FULL_RECORD_MAX_CHARS = 750000

function storageKey (userId) {
  return `${LOCAL_PREFIX}${encodeURIComponent(String(userId || ''))}`
}

function isRecord (value) {
  return Boolean(value && typeof value === 'object' && String(value.userId || ''))
}

function isMetadataOnly (value) {
  return Boolean(isRecord(value) && value.metadataOnly === true && !value.deleted)
}

function localMetadata (record) {
  return {
    userId: String(record.userId),
    generation: Math.max(0, Number(record.generation || 0)),
    updatedAt: record.updatedAt || new Date().toISOString(),
    metadataOnly: true,
    fileCount: Array.isArray(record.files) ? record.files.length : 0,
  }
}

function recordVersion (value) {
  return [Number(value?.generation || 0), Date.parse(value?.updatedAt || '') || 0]
}

function isNewer (left, right) {
  const a = recordVersion(left)
  const b = recordVersion(right)
  return a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1])
}

function isStrictlyNewer (left, right) {
  return isNewer(left, right) && !isNewer(right, left)
}

export function selectKmlAccountRecoveryRecord (indexedValue, localValue) {
  const indexed = isRecord(indexedValue) ? indexedValue : null
  const local = isRecord(localValue) ? localValue : null
  const storageGeneration = Math.max(
    Number(indexed?.generation || 0),
    Number(local?.generation || 0)
  )

  if (local?.deleted && (!indexed || isNewer(local, indexed))) {
    return { record: local, storageGeneration, incompleteWrite: false }
  }
  if (local && !isMetadataOnly(local) && (!indexed || isStrictlyNewer(local, indexed))) {
    return { record: local, storageGeneration, incompleteWrite: false }
  }
  if (indexed) {
    return {
      record: indexed,
      storageGeneration,
      incompleteWrite: Boolean(isMetadataOnly(local) && isStrictlyNewer(local, indexed)),
    }
  }
  return {
    record: null,
    storageGeneration,
    incompleteWrite: isMetadataOnly(local),
  }
}

function readLocal (storage, userId) {
  if (!storage?.getItem) return null
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(userId)) || 'null')
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeLocal (storage, record) {
  if (!storage?.setItem) throw new Error('本地恢复存储不可用')
  storage.setItem(storageKey(record.userId), JSON.stringify(record))
}

function writeLocalNewest (storage, record) {
  if (!storage?.setItem) throw new Error('本地恢复存储不可用')
  const current = readLocal(storage, record.userId)
  if (!current || isNewer(record, current)) writeLocal(storage, record)
}

function localRecordForStorage (record, maxChars) {
  const serialized = JSON.stringify(record)
  return serialized.length <= maxChars ? record : localMetadata(record)
}

function openDatabase (indexedDBLike) {
  return new Promise((resolve, reject) => {
    const request = indexedDBLike.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'userId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('恢复草稿数据库打开失败'))
  })
}

function indexedRecord (database, mode, action) {
  return new Promise((resolve, reject) => {
    let transaction
    try {
      transaction = database.transaction(STORE_NAME, mode)
      const request = action(transaction.objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('恢复草稿数据库请求失败'))
      transaction.onerror = () => reject(transaction.error || new Error('恢复草稿数据库事务失败'))
    } catch (error) {
      reject(error)
    }
  })
}

function indexedPutNewest (database, record) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(record.userId)
      request.onsuccess = () => {
        const current = request.result
        if (!isRecord(current) || isNewer(record, current)) store.put(record)
      }
      request.onerror = () => reject(request.error || new Error('恢复草稿数据库读取失败'))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error('恢复草稿数据库事务失败'))
      transaction.onabort = () => reject(transaction.error || new Error('恢复草稿数据库事务已中止'))
    } catch (error) {
      reject(error)
    }
  })
}

export function createMemoryKmlAccountDraftStore () {
  const records = new Map()
  return {
    async get (userId, options = {}) {
      const record = records.get(String(userId || ''))
      if (!record || (record.deleted && options.includeDeleted !== true)) return null
      return structuredClone(record)
    },
    async put (record) {
      if (!isRecord(record)) throw new TypeError('恢复草稿记录无效')
      const current = records.get(String(record.userId))
      if (!current || isNewer(record, current)) {
        records.set(String(record.userId), structuredClone(record))
      }
      return { persistent: 'memory' }
    },
    async delete (userId, options = {}) {
      const normalizedId = String(userId || '')
      const tombstone = {
        userId: normalizedId,
        deleted: true,
        generation: Math.max(0, Number(options.generation || 0)),
        updatedAt: options.updatedAt || new Date().toISOString(),
      }
      const current = records.get(normalizedId)
      if (!current || isNewer(tombstone, current)) records.set(normalizedId, tombstone)
      return { persistent: 'memory' }
    },
  }
}

export function createBrowserKmlAccountDraftStore (options = {}) {
  const indexedDBLike = options.indexedDB || globalThis.indexedDB
  const localStorageLike = options.localStorage || globalThis.localStorage
  const localFullRecordMaxChars = Math.max(
    0,
    Number(options.localFullRecordMaxChars ?? DEFAULT_LOCAL_FULL_RECORD_MAX_CHARS),
  )
  let databasePromise = null

  const getDatabase = () => {
    if (!indexedDBLike?.open) return Promise.reject(new Error('IndexedDB 不可用'))
    if (!databasePromise) databasePromise = openDatabase(indexedDBLike)
    return databasePromise
  }

  return {
    async get (userId, options = {}) {
      const normalizedId = String(userId || '')
      const local = readLocal(localStorageLike, normalizedId)
      let indexed
      try {
        const database = await getDatabase()
        indexed = await indexedRecord(database, 'readonly', store => store.get(normalizedId))
      } catch (error) {
        if (local) {
          if (local.deleted && options.includeDeleted !== true) return null
          if (isMetadataOnly(local)) {
            throw new Error('IndexedDB 不可用，无法读取完整 KML 恢复草稿', { cause: error })
          }
          return structuredClone(local)
        }
        throw error
      }
      const selected = selectKmlAccountRecoveryRecord(indexed, local)
      if (!selected.record) {
        if (!selected.incompleteWrite) return null
        throw new Error('最新 KML 恢复草稿尚未完整写入 IndexedDB')
      }
      if (selected.record.deleted && options.includeDeleted !== true) return null
      const result = structuredClone(selected.record)
      if (selected.incompleteWrite) {
        result.incompleteWrite = true
        result.storageGeneration = selected.storageGeneration
      }
      return result
    },

    async put (record) {
      if (!isRecord(record)) throw new TypeError('恢复草稿记录无效')
      const normalized = structuredClone(record)
      let metadataStored = false
      let fullRecordStored = false
      try {
        const localRecord = localRecordForStorage(normalized, localFullRecordMaxChars)
        writeLocalNewest(localStorageLike, localRecord)
        metadataStored = true
        fullRecordStored = !isMetadataOnly(localRecord)
      } catch {
        // IndexedDB may still have enough space when localStorage is full.
      }
      try {
        const database = await getDatabase()
        await indexedPutNewest(database, normalized)
        return { persistent: metadataStored ? (fullRecordStored ? 'indexeddb+local' : 'indexeddb+metadata') : 'indexeddb' }
      } catch (error) {
        if (fullRecordStored) return { persistent: 'localstorage' }
        throw new Error('IndexedDB 不可用，完整 KML 恢复草稿未持久化', { cause: error })
      }
    },

    async delete (userId, options = {}) {
      const normalizedId = String(userId || '')
      const tombstone = {
        userId: normalizedId,
        deleted: true,
        generation: Math.max(0, Number(options.generation || 0)),
        updatedAt: options.updatedAt || new Date().toISOString(),
      }
      let localStored = false
      try {
        writeLocalNewest(localStorageLike, tombstone)
        localStored = true
      } catch {
        // Continue with IndexedDB; a browser may have disabled localStorage.
      }
      try {
        const database = await getDatabase()
        await indexedPutNewest(database, tombstone)
      } catch (error) {
        if (!localStored) throw error
      }
      return { persistent: 'deleted' }
    },
  }
}

let defaultStore = null
let testStore = null

export function getKmlAccountDraftStore () {
  if (testStore) return testStore
  if (!defaultStore) defaultStore = createBrowserKmlAccountDraftStore()
  return defaultStore
}

export function setKmlAccountDraftStoreForTests (store) {
  testStore = store || null
}

export { storageKey as kmlAccountDraftStorageKey }
