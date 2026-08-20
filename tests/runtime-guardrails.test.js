import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  MAX_FETCH_RELAY_STATS_ENTRIES,
  retainRecentStatsEntry,
} from '../service/bin/middleware/fetchRelay/index.js'

const pm2Source = readFileSync(new URL('../pm2.config.cjs', import.meta.url), 'utf8')
const cronSource = readFileSync(new URL('../service/bin/cronJob/index.js', import.meta.url), 'utf8')

test('生产 PM2 配置限制 Node 内存并关闭文件监听与每日强制重启', () => {
  assert.match(pm2Source, /watch:\s*false/)
  assert.match(pm2Source, /cwd:\s*__dirname/)
  assert.match(pm2Source, /--max-old-space-size=640/)
  assert.ok(pm2Source.includes("max_memory_restart: '768M'"))
  assert.doesNotMatch(pm2Source, /cron_restart/)
})

test('应用自拉代码默认关闭且只能显式启用', () => {
  assert.match(cronSource, /MAP_SERVICE_ENABLE_AUTO_PULL/)
  assert.match(cronSource, /autoPullProjectCode/)
})

test('缓存统计预览始终只保留有限数量的最近条目', () => {
  const entries = []
  for (let index = 0; index < 10000; index += 1) {
    retainRecentStatsEntry(entries, { key: String(index), updatedAt: index })
  }
  assert.equal(MAX_FETCH_RELAY_STATS_ENTRIES, 100)
  assert.ok(entries.length <= MAX_FETCH_RELAY_STATS_ENTRIES * 2)
  entries.sort((a, b) => b.updatedAt - a.updatedAt)
  assert.equal(entries[0].updatedAt, 9999)
})
