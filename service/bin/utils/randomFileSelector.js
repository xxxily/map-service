import fs from 'fs-extra'
import path from 'path'
import JSONDB from './jsonDB.js'

/**
 * 生成指定范围内的随机不重复的数字
 * @param {Number} range - 必选，生成的随机数的取值范围，0-range
 * @param {*} count - 可选，生成的随机数字的个数，默认为 range
 * @returns
 */
export function getUniqueRandomNumbers (range = 100, count = range) {
  const set = new Set()
  count = count > range ? range : count

  while (set.size < count) {
    const randomNum = Math.floor(Math.random() * range)
    set.add(randomNum)
  }

  return Array.from(set)
}

class RandomFileSelector {
  constructor (options) {
    this.directoryPaths = Array.isArray(options.directoryPaths) ? options.directoryPaths : [options.directoryPaths]
    this.fileFormats = new Set(Array.isArray(options.fileFormats) ? options.fileFormats : [options.fileFormats])
    this.excludeStrings = Array.isArray(options.excludeStrings) ? options.excludeStrings : [options.excludeStrings]
    this.unique = options.unique || false
    this.cacheDbId = options.cacheDbId || null
    this.cache = []
    this.cacheExpiration = options.cacheExpiration || 30000 // Default cache expiration time: 30 seconds
    this.lastCacheUpdateTime = 0
    this.minFileSize = options.minFileSize || 0 // Minimum file size in bytes
    this.maxFileSize = options.maxFileSize || Number.MAX_SAFE_INTEGER // Maximum file size in bytes
    this.recursive = options.recursive || false // Whether to recursively read folders
    this.randomIndexes = []
    this.isUpdatingCache = false

    /**
     * 此处不应该创建对象就更新缓存，应该在需要获取随机文件时再更新缓存
     * 避免不断创建对象，疯狂扫描文件夹
     */
    // this._updateCache()
  }

  async _scanDirectory (directoryPath) {
    const files = await fs.readdir(directoryPath)
    const tasks = []
    for (const file of files) {
      const filePath = path.join(directoryPath, file)
      tasks.push(fs.stat(filePath).then(fileStats => {
        if (fileStats.isDirectory() && this.recursive) {
          return this._scanDirectory(filePath) // Recursively update cache for subdirectories
        } else if (fileStats.isFile() &&
          fileStats.size >= this.minFileSize &&
          fileStats.size <= this.maxFileSize &&
          this.fileFormats.has(path.extname(file)) &&
          !this.excludeStrings.some(excludeStr => file.includes(excludeStr))) {
          this.cache.push(filePath)
        }
      }))
    }
    await Promise.all(tasks)
  }

  async _updateCache () {
    this.isUpdatingCache = true
    this.cache = []
    const tasks = this.directoryPaths.map(directoryPath => this._scanDirectory(directoryPath))
    await Promise.all(tasks)
    this.lastCacheUpdateTime = Date.now()
    this.isUpdatingCache = false
  }

  async _checkCache () {
    const needUpdateCache = !this.lastCacheUpdateTime || Date.now() - this.lastCacheUpdateTime > this.cacheExpiration
    if (needUpdateCache && !this.isUpdatingCache) {
      await this._updateCache()
    }
  }

  /* 手动创建缓存 */
  async buildCache (force = false) {
    if (force) {
      await this._updateCache()
    } else {
      await this._checkCache()
    }
  }

  async getCacheDB () {
    if (!this.cacheDbId) {
      return null
    }

    const jsonDB = new JSONDB({
      name: `randomFileSelector_${this.cacheDbId}`,
      /* 这里考虑到可能会有大量的文件，建立缓存耗时较大，所以设置了一个比较长的超时时间 */
      timeout: 1000 * 60 * 10,
    })

    await jsonDB.ready()

    return jsonDB
  }

  async clearCache () {
    this.cache = []
    this.randomIndexes = []
    this.lastCacheUpdateTime = 0

    if (this.cacheDbId) {
      const jsonDB = await this.getCacheDB()
      jsonDB.data.cache = []
      jsonDB.data.randomIndexes = []
      jsonDB.data.lastCacheUpdateTime = 0
      jsonDB.save()
    }
  }

  async getRandomFile () {
    // Wait until the cache is ready before proceeding
    while (this.isUpdatingCache) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    await this._checkCache()

    const cacheFileNames = this.cache
    if (cacheFileNames.length === 0) {
      return null
    }

    if (this.unique) {
      if (this.randomIndexes.length === 0) {
        this.randomIndexes = getUniqueRandomNumbers(cacheFileNames.length)
      }
    }

    const randomIndex = this.unique ? this.randomIndexes.shift() : Math.floor(Math.random() * cacheFileNames.length)
    return cacheFileNames[randomIndex]
  }

  /**
   * 类似getRandomFile，但优先从jsonDB缓存中读取文件名和随机索引，这样的话就不用每次都去扫描文件夹
   * 并且即使重启了服务，也能保证随机文件的唯一性
   * 注意：需要检查是否需要更新缓存，和每次获取随机文件后更新jsonDB
   * @returns
   */
  async getRandomFileWithJSONDB () {
    if (!this.cacheDbId) {
      console.warn('未设置cacheDbId，无法使用jsonDB缓存')
      return this.getRandomFile()
    }

    const jsonDB = await this.getCacheDB()

    if (jsonDB.data.cache && jsonDB.data.cache.length > 0) {
      this.cache = jsonDB.data.cache
      this.randomIndexes = jsonDB.data.randomIndexes || []
      this.lastCacheUpdateTime = jsonDB.data.lastCacheUpdateTime
      // console.log('从jsonDB缓存中读取文件名和随机索引', this.cache.length, this.randomIndexes.length, this.lastCacheUpdateTime)
    }

    const randomFile = await this.getRandomFile()

    jsonDB.data.cache = this.cache
    jsonDB.data.randomIndexes = this.randomIndexes
    jsonDB.data.lastCacheUpdateTime = this.lastCacheUpdateTime

    /* 为了不影响读取的速度，这里save的时候不使用await */
    jsonDB.save()

    return randomFile
  }
}

/* 使用示例： */
async function demo () {
  const randomFileSelector = new RandomFileSelector({
    recursive: true,
    directoryPaths: [
      '/Volumes/web8T/tg-data/jiandan/photos',
      '/Volumes/web8T/tg-data/jiandan/video_files',
    ],
    fileFormats: ['.jpg', '.png', '.gif', '.mp4'],
    excludeStrings: ['_thumb'],
    cacheExpiration: 1000 * 60 * 60 * 24,
    minFileSize: 50 * 1024, // 大于50KB的文件
  })

  const randomFile = await randomFileSelector.getRandomFile()
  console.log(
    randomFileSelector.cache.length,
    randomFile
  )

  setInterval(async () => {
    const randomFile = await randomFileSelector.getRandomFile()
    console.log(randomFile)
  }, 2000)
}

// demo();

export default RandomFileSelector
