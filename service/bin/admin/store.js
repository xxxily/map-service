import fs from 'fs-extra'
import path from 'path'
import rootPath from '../rootPath.js'

function clone (value) {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

export class AdminStore {
  constructor (options = {}) {
    this.dataDir = options.dataDir || path.join(rootPath, '.db/admin')
  }

  resolveFile (name) {
    if (!/^[a-z0-9-]+$/i.test(name)) {
      throw new Error(`invalid admin store name: ${name}`)
    }

    return path.join(this.dataDir, `${name}.json`)
  }

  async read (name, fallback) {
    const filePath = this.resolveFile(name)
    await fs.ensureDir(path.dirname(filePath))

    if (!await fs.pathExists(filePath)) {
      return clone(fallback)
    }

    try {
      return await fs.readJson(filePath)
    } catch (err) {
      console.warn(`[admin store] failed to read ${filePath}`, err.message)
      return clone(fallback)
    }
  }

  async write (name, value) {
    const filePath = this.resolveFile(name)
    await fs.ensureDir(path.dirname(filePath))

    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
    await fs.writeJson(tempPath, value, { spaces: 2 })
    await fs.move(tempPath, filePath, { overwrite: true })
    return value
  }
}

export default AdminStore
