export class TileApiLogger {
  constructor ({ store }) {
    this.store = store
    this.logs = null
  }

  async _load () {
    if (this.logs === null) {
      this.logs = await this.store.read('tile-api-logs', [])
    }
    return this.logs
  }

  async addLog (entry, maxLogCount) {
    const logs = await this._load()
    logs.unshift(entry)
    if (logs.length > maxLogCount) {
      logs.length = maxLogCount
    }
    this.store.write('tile-api-logs', logs).catch(err => {
      console.error('[tile-api-logger] failed to write logs', err)
    })
  }

  async list () {
    return await this._load()
  }

  async clear () {
    this.logs = []
    await this.store.write('tile-api-logs', [])
  }
}

export default TileApiLogger
