import { CronJob } from 'cron'
import config from '../../config.js'
import InteractionDatabase from '../interaction/database.js'
import { applyRetention } from '../interaction/operations.js'

let running = false

export function getInteractionRetentionConfig (runtimeConfig = config) {
  const interactionConfig = runtimeConfig?.staticService?.interaction || {}
  return {
    databasePath: interactionConfig.databasePath,
    retention: {
      reportEvents: interactionConfig.retention?.reportEventsDays,
      outbox: interactionConfig.retention?.outboxDays,
    },
  }
}

export default function () {
  const retentionConfig = getInteractionRetentionConfig(config)
  return CronJob.from({
    // Retention is intentionally daily and outside request handling.
    cronTime: '00 20 03 * * *',
    onTick: function () {
      if (running) return
      running = true
      let database
      try {
        database = new InteractionDatabase({ filePath: retentionConfig.databasePath })
        const result = applyRetention(database, {
          dryRun: false,
          retention: retentionConfig.retention,
        })
        console.log(`[cronJob] interaction retention cleaned ${result.total} records`)
      } catch (error) {
        console.error('[cronJob] interaction retention failed', String(error?.message || error))
      } finally {
        database?.close()
        running = false
      }
    },
    start: true,
    timeZone: 'Asia/Shanghai',
  })
}
