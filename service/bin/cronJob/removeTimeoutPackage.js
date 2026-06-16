import { CronJob } from 'cron'
import service from '../service.js'

export default function () {
  /* 每天24点的时候执行移除超期前端包文件的定时任务 */
  const job = CronJob.from({
    cronTime: '00 00 00 * * *',
    onTick: function () {
      service.removeTimeoutPackageFiles().catch((err) => {
        console.error('移除超期前端包文件的定时任务执行失败', err)
      })
    },
    start: true,
    timeZone: 'Asia/Shanghai',
  })

  /* 首次执行移除超时文件任务 */
  service.removeTimeoutPackageFiles()

  return job
}
