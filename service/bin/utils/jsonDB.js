import fs from 'fs-extra'
import path from 'path'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { createHash } from 'crypto'

export function md5 (str) {
  return createHash('md5').update(str).digest('hex')
}

const dbInstances = {}

export default class JSONDB {
  constructor (opts = {}) {
    const defaultOpts = {
      autoSave: false,
      saveInterval: 1000 * 5,
      saveDebounce: 1000 * 2,
      dbDir: path.resolve(process.cwd(), '.db'),
      name: 'default',
      defaultData: {},
      timeout: 1000 * 10,
    }

    this.opts = { ...defaultOpts, ...opts, }
    const { name, dbDir, } = this.opts

    this.isReady = false
    this.dbFile = path.join(dbDir, `${name}.db.json`)
    this.id = md5(this.dbFile)
    this.__lastWriteTime__ = null
    this.__writeTimer__ = null

    if (dbInstances[this.id]) {
      return dbInstances[this.id]
    } else {
      this.init()
    }
  }

  async init () {
    const { dbDir, } = this.opts
    const { dbFile, id, } = this

    await fs.ensureDir(dbDir)
    this.low = new Low(new JSONFile(dbFile), this.opts.defaultData)

    await this.low.read()
    this.data = this.low.data
    this.isReady = true

    this.attachMethodsToInstance()
    dbInstances[id] = this

    this.autoSave()
    this.setupProcessExitSave()
  }

  attachMethodsToInstance () {
    this.read = async () => await this.low.read()
    this.write = async () => await this.low.write()
  }

  async ready () {
    if (this.isReady) return

    try {
      let count = 0
      while (!this.isReady && count < this.opts.timeout / 50) {
        await new Promise(resolve => setTimeout(resolve, 50))
        count++
      }
      if (!this.isReady) throw new Error('JSONDB init timeout.')
    } catch (error) {
      console.error(error.message)
    }
  }

  async save () {
    const { saveDebounce, } = this.opts
    await this.ready()

    if (this.__lastWriteTime__ && Date.now() - this.__lastWriteTime__ < saveDebounce) {
      clearTimeout(this.__writeTimer__)

      this.__writeTimer__ = setTimeout(async () => {
        await this.low.write()
        this.__lastWriteTime__ = Date.now()
      }, saveDebounce)
    } else {
      clearTimeout(this.__writeTimer__)
      await this.low.write()
      this.__lastWriteTime__ = Date.now()
    }
  }

  async autoSave () {
    const { autoSave, saveInterval, } = this.opts

    if (!autoSave) return

    await this.ready()

    clearInterval(this.__saveTimer__)

    this.__saveTimer__ = setInterval(() => {
      this.low.data.__lastWriteTime__ = Date.now()
      this.low.data.__writeCount__ = (this.low.data.__writeCount__ || 0) + 1

      this.low.write()
    }, saveInterval)
  }

  async stopAutoSave () {
    await this.ready()
    clearInterval(this.__saveTimer__)
  }

  setupProcessExitSave () {
    if (this.opts.autoSave) {
      process.on('exit', async () => {
        await this.low.write()
      })
    }
  }
}
