import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const src = path.resolve(__dirname, '../node_modules/cesium/Build/Cesium')
const dest = path.resolve(__dirname, '../public/cesium')

async function main () {
  try {
    // 检查源目录是否存在
    if (!await fs.pathExists(src)) {
      console.error(`Error: Cesium build files not found at ${src}. Make sure you have installed cesium dependency.`)
      process.exit(1)
    }

    console.log(`Copying Cesium assets from ${src} to ${dest}...`)
    await fs.ensureDir(dest)
    await fs.copy(src, dest)
    console.log('Cesium assets successfully copied.')
  } catch (err) {
    console.error('Failed to copy Cesium assets:', err)
    process.exit(1)
  }
}

main()
