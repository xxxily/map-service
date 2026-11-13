import config from '../../config.js'
import service from '../service.js'

let running = false

export default function () {
  const mirror = config.staticService?.interaction?.artalkMirror || {}
  if (mirror.enabled !== true) return null
  const interval = Math.max(1000, Number(mirror.pollIntervalMs) || 5000)
  const timer = setInterval(async () => {
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
  }, interval)
  timer.unref?.()
  return {
    stop () { clearInterval(timer) },
  }
}
