import test from 'node:test'
import assert from 'node:assert/strict'

import config from '../service/config.js'
import { getInteractionRetentionConfig } from '../service/bin/cronJob/interactionRetention.js'

test('interaction retention cron reads the production interaction config path', () => {
  const retention = getInteractionRetentionConfig(config)
  assert.equal(retention.databasePath, config.staticService.interaction.databasePath)
  assert.equal(retention.retention.reportEvents, config.staticService.interaction.retention.reportEventsDays)
  assert.equal(retention.retention.outbox, config.staticService.interaction.retention.outboxDays)
})

test('interaction retention config helper fails closed when the interaction section is absent', () => {
  assert.deepEqual(getInteractionRetentionConfig({ staticService: {} }), {
    databasePath: undefined,
    retention: { reportEvents: undefined, outbox: undefined },
  })
})
