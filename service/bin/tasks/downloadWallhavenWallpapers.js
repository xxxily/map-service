import axios from 'axios'
import fs from 'fs-extra'
import path from 'path'
import PQueue from 'p-queue'

const downloadWallhavenWallpapers = async (params, concurrentDownloads, maxPages = null) => {
  const downloadPath = './wallpapers' // 下载路径
  const queue = new PQueue({ concurrency: concurrentDownloads, })

  let page = 1
  const totalPages = maxPages
  let keepDownloading = true

  while (keepDownloading) {
    try {
      const response = await axios.get('https://wallhaven.cc/api/v1/search', { params: { ...params, page, }, })
      const wallpapers = response.data.data

      if (wallpapers.length === 0) {
        keepDownloading = false
        break
      }

      for (const wallpaper of wallpapers) {
        queue.add(async () => {
          const imageURL = wallpaper.path
          const fileName = path.basename(imageURL)
          const imagePath = path.join(downloadPath, fileName)

          const exists = await fs.pathExists(imagePath)

          if (!exists) {
            try {
              const imageResponse = await axios.get(imageURL, { responseType: 'stream', })
              const writer = fs.createWriteStream(imagePath)
              imageResponse.data.pipe(writer)
              console.log(`下载 ${fileName} 完成`)
            } catch (error) {
              console.error(`下载 ${fileName} 失败`, error)
            }
          } else {
            console.log(`${fileName} 已存在，跳过下载`)
          }
        })
      }

      if (totalPages !== null && page >= totalPages) {
        keepDownloading = false
      }

      page++
    } catch (error) {
      console.error('下载错误:', error)
      keepDownloading = false
    }
  }

  await queue.onIdle()
  console.log('所有下载任务已完成')
}

// 从外部传递自定义参数、同时下载的任务数量和最大下载页数（可选）
const customParams = {
  categories: '1',
  purity: '100',
  sorting: 'random',
  order: 'desc',
  apiKey: 'YOUR_API_KEY',
}
const concurrentDownloads = 5 // 同时下载任务数量
const maxPages = 3 // 最大下载页数（可选）

// 调用下载壁纸函数并传递自定义参数、同时下载任务数量和最大下载页数
downloadWallhavenWallpapers(customParams, concurrentDownloads, maxPages)

export { downloadWallhavenWallpapers }
