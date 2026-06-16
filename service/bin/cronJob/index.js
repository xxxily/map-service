/*!
 * @name         cronJob.js
 * @description  定时任务
 * @version      0.0.1
 * @author       Blaze
 * @date         2020/2/27 15:45
 * @github       https://github.com/xxxily
 */

import glob from 'glob'

/* 获取定时任务模块，cronJob下的每个文件都是一个定时任务模块 */
const getCronJobMod = () => {
  const jobsMod = {}
  const globResult = glob.sync('*.js', {
    cwd: new URL('.', import.meta.url).pathname,
  })

  globResult.forEach(filename => {
    if (filename !== 'index.js') {
      const name = filename.replace(/\.js$/, '')
      import(`./${filename}`).then(module => {
        jobsMod[name] = module.default
      })
    }
  })

  return jobsMod
}

const jobs = {
  init () {
    const jobsIgnore = [
      'removeTimeoutPackage',
    ]
    const jobsMap = getCronJobMod()
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
