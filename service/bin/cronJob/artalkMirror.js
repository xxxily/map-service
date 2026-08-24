import { CronJob } from 'cron'
import config from '../../config.js'
import service from '../service.js'

let running = false

export default function () {
  const mirror = config.staticService?.interaction?.artalkMirror || {}
  if (mirror.enabled !== true) return null
  const interval = Math.max(1000, Math.min(59_000, Number(mirror.pollIntervalMs) || 5000))
  return CronJob.from({
    cronTime: `*/${Math.max(1, Math.round(interval / 1000))} * * * * *`,
    onTick: async function () {
      if (running) return
      running = true
      try {
        const result = await service.drainArtalkMirror({ limit: mirror.batchSize, reconcile: true })
        if (result.claimed || result.failed || result.reconcileScanned) {
          console.log(`[cronJob] Artalk mirror claimed=${result.claimed} sent=${result.sent} failed=${result.failed} reconciled=${result.reconciled || 0} reconcileFailed=${result.reconcileFailed || 0}`)
        }
      } catch (error) {
        console.error('[cronJob] Artalk mirror failed', String(error?.message || error))
      } finally { running = false }
    },
    start: true,
    timeZone: 'Asia/Shanghai',
  })
}
