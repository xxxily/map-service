import { CronJob } from 'cron'
import service from '../service.js'

let running = false

export default function () {
  return CronJob.from({
    // KML recycle-bin cleanup runs outside request handling. A daily pass is
    // sufficient because retention is measured in days and the operation is
    // bounded; referenced published snapshots are skipped by the service.
    cronTime: '00 40 03 * * *',
    onTick: function () {
      if (running) return
      running = true
      try {
        const result = service.cleanupExpiredUserKmlTrash({ limit: 500 })
        if (result.deletedCount || result.skippedByShare) {
          console.log(`[cronJob] KML 回收站清理扫描=${result.scannedCount} 删除=${result.deletedCount} 保留引用=${result.skippedByShare}`)
        }
      } catch (error) {
        console.error('[cronJob] KML 回收站清理失败', String(error?.message || error))
      } finally {
        running = false
      }
    },
    start: true,
    timeZone: 'Asia/Shanghai',
  })
}

