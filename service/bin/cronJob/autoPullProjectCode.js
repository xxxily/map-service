import { CronJob } from 'cron'
import rootPath from '../rootPath.js'
import simpleGit from 'simple-git'

let pulling = false
async function gitPull (options) {
  if (pulling) return false
  pulling = true

  const git = simpleGit(rootPath)

  git.pull(options).then(() => {
    // console.log('代码拉取更新成功')
    pulling = false
  }).catch((err) => {
    pulling = false
    console.error(err)
  })
}

export default function () {
  /* 每小时执行一次定时任务 */
  const job = new CronJob('00 00 * * * *', function () {
    gitPull(['-f'])
  }, null, true, 'Asia/Shanghai')

  job.start()

  return job
}
