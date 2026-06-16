/*!
 * @name         cronJob.js
 * @description  定时任务
 * @version      0.0.1
 * @author       Blaze
 * @date         2020/2/27 15:45
 * @github       https://github.com/xxxily
 */

import { globSync } from 'glob'

/* 获取定时任务模块，cronJob下的每个文件都是一个定时任务模块 */
const getCronJobMod = async () => {
  const jobsMod = {}
  const globResult = globSync('*.js', {
    cwd: new URL('.', import.meta.url).pathname,
  })

  for (const filename of globResult) {
    if (filename !== 'index.js') {
      const name = filename.replace(/\.js$/, '')
      const module = await import(`./${filename}`)
      jobsMod[name] = module.default
    }
  }

  return jobsMod
}

const jobs = {
  async init () {
    const jobsIgnore = []
    const jobsMap = await getCronJobMod()
    const jobList = Object.keys(jobsMap)

    jobList.forEach((jobName) => {
      if (jobsIgnore.includes(jobName)) {
        // console.log('[cronJob] 已忽略定时任务：' + jobName)
        return false
      } else if (jobsMap[jobName] instanceof Function) {
        /* 执行定时任务函数 */
        jobsMap[jobName]()

        console.log('[cronJob] 已注册定时任务：' + jobName)
      }
    })
  },
}

export default jobs
