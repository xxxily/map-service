import axios from 'axios'
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

class RandomWallhavenSelector {
  constructor (options) {
    this.unique = options.unique || false
    this.cacheDbId = options.cacheDbId || null
    this.cache = []
    this.cacheExpiration = options.cacheExpiration || 1000 * 60 * 60 * 24 * 30 * 12
    this.lastCacheUpdateTime = 0
    this.minFileSize = options.minFileSize || 0 // Minimum file size in bytes
    this.maxFileSize = options.maxFileSize || Number.MAX_SAFE_INTEGER // Maximum file size in bytes
    this.recursive = options.recursive || false // Whether to recursively read folders
    this.randomIndexes = []
    this.isUpdatingCache = false
    this.maxPages = options.maxPages || 1000
    this.params = {
      ...{
        categories: '001', // 分类，默认 Wallpapers 100/101/111*/etc (general/anime/people)
        purity: '010', // 纯净度，默认 SFW (Safe For Work)  100/110/111*/etc (sfw/sketchy/nsfw)
        sorting: 'toplist', // 排序方式，默认按相关性排序，可选 relevance | views | favorites | toplist | random | date_added
        order: 'desc',
        apiKey: '34Xko2PAafrmxxHSu9Kr2qT6g4L7SdvH',
      },
      ...(options.params || {}),
    }
  }

  async _scanWallhaven (params) {
    params = params || this.params
    const totalPages = this.maxPages
    // const startTime = Date.now()
    let keepScaning = true
    let page = 1

    while (keepScaning) {
      try {
        console.log(`正在扫描第 ${page} 页`)

        const response = await axios.get('https://wallhaven.cc/api/v1/search', { params: { ...params, page, }, })
        const wallpapers = response.data.data
        const meta = response.data.meta

        if (!meta || !meta.current_page || !meta.last_page || !meta.per_page || !meta.total) {
          console.error('无法获取meta信息，停止扫描', response.data, response.code, response.statusText, response.message)
          keepScaning = false
          break
        }

        if (!wallpapers || wallpapers.length === 0) {
          console.error('无法获取壁纸信息，停止扫描')
          keepScaning = false
          break
        }

        console.log(`第 ${page} 页扫描完成，共 ${wallpapers.length} 张壁纸，总共 ${meta.total} 张壁纸，共 ${meta.last_page} 页`)

        /* 将结果添加到缓存中 */
        for (const wallpaper of wallpapers) {
          this.cache.push(wallpaper.path)
        }

        /* 休眠一下，避免请求过快 */
        await new Promise(resolve => setTimeout(resolve, 1000))

        /* 根据需要判断是否结束扫描 */
        if (page >= meta.last_page || (totalPages && meta.current_page >= totalPages)) {
          console.log('扫描结束')
          keepScaning = false
        }

        page++
      } catch (error) {
        console.error('扫描错误:', error)
        keepScaning = false
      }
    }
  }

  async _updateCache () {
    this.isUpdatingCache = true
    this.cache = []
    await this._scanWallhaven()
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
    if (!this.params) {
      return null
    }

    const params = this.params

    const jsonDB = new JSONDB({
      name: `Wallhaven_${params.categories}_${params.purity}_${params.sorting}`,
      timeout: 1000 * 60 * 3,
    })

    await jsonDB.ready()

    return jsonDB
  }

  async clearCache () {
    this.cache = []
    this.randomIndexes = []
    this.lastCacheUpdateTime = 0

    if (this.params) {
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
    if (!this.params) {
      console.warn('没有params，无法使用jsonDB缓存')
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

export default RandomWallhavenSelector
