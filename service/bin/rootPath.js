/* 定义工程的根目录 */
import fs from 'fs-extra'
import path from 'path'

let rootPath = process.cwd()
if (!fs.existsSync(path.resolve(rootPath, './package.json'))) {
  rootPath = path.resolve(import.meta.dirname, '../../')
}

export default rootPath
