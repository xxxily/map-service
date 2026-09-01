import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { filterAndSortTwoBuluItems, normalizeTwoBuluBatchFilters } from '../src/integrations/two-bulu-batch.js'
import { runTwoBuluBatchImport, shouldStopTwoBuluBatch } from '../src/integrations/two-bulu-batch-runner.js'
import { twoBuluBatchPreviewMessageHtml } from '../src/ui/two-bulu-import-dialog.js'
import { normalizeTwoBuluTrackListUrl } from '../extensions/two-bulu-helper/protocol.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadListApi () {
  const source = fs.readFileSync(path.join(root, 'extensions/two-bulu-helper/two-bulu-list-export.js'), 'utf8')
  const card = text => ({ innerText: text, textContent: text })
  const cards = [
    { href: '/track/t-aaa.htm', label: '线路 A', text: '线路 A 点位数 12 发布日期 2026-08-20 总里程 10.5 km 点赞 9 收藏 2' },
    { href: '/track/track_detail.htm?trackId=bbb', label: '线路 B', text: '线路 B 点位数 4 发布日期 2026-07-01 总里程 2 km 点赞 3 收藏 1' },
  ].map(item => ({
    textContent: item.label,
    getAttribute: name => name === 'href' ? item.href : '',
    closest: () => card(item.text),
    parentElement: card(item.text),
  }))
  const sandbox = {
    URL,
    location: { href: 'https://www.2bulu.com/spaceindex/my_track.htm?userId=user-1' },
    document: {
      querySelectorAll: () => cards,
      querySelector: selector => selector.includes('author') ? { content: '山友阿明' } : null,
    },
  }
  vm.runInNewContext(source, sandbox)
  return sandbox.MapServiceTwoBuluListExport
}

test('用户轨迹列表 URL 只接受官方列表页并规范化 userId', () => {
  const normalized = normalizeTwoBuluTrackListUrl('https://www.2bulu.com/spaceindex/my_track.htm?userId=user-1&foo=ignored#x')
  assert.equal(normalized.userId, 'user-1')
  assert.equal(normalized.canonicalUrl, 'https://www.2bulu.com/spaceindex/my_track.htm?userId=user-1')
  assert.throws(() => normalizeTwoBuluTrackListUrl('https://www.2bulu.com/track/t-abc.htm'), error => error.code === 'TWO_BULU_URL_INVALID')
})

test('浏览器端列表解析提取轨迹链接和公开统计字段', () => {
  const result = loadListApi().collect()
  assert.equal(result.status, 'success')
  assert.equal(result.detectedCount, 2)
  assert.equal(result.items[0].url, 'https://www.2bulu.com/track/track_detail.htm?trackId=aaa')
  assert.equal(result.items[0].pointCount, 12)
  assert.equal(result.items[0].distanceKm, 10.5)
  assert.equal(result.items[0].likeCount, 9)
  assert.equal(result.items[0].favoriteCount, 2)
})

test('批量筛选和排序对缺失字段采用确定性规则', () => {
  const items = [
    { url: 'b', position: 1, pointCount: 4, publishedAt: null, distanceKm: 2 },
    { url: 'a', position: 0, pointCount: 12, publishedAt: '2026-08-20T00:00:00.000Z', distanceKm: 10 },
  ]
  const result = filterAndSortTwoBuluItems(items, { pointCountMin: 10, sort: 'pointCount', order: 'desc' })
  assert.deepEqual(result.map(item => item.url), ['a'])
  assert.throws(() => normalizeTwoBuluBatchFilters({ distanceKmMin: 5, distanceKmMax: 1 }), /最小值不能大于最大值/)
  assert.throws(() => normalizeTwoBuluBatchFilters({ pointCountMin: 'abc' }), /最小值必须是非负数字/)
  assert.throws(() => normalizeTwoBuluBatchFilters({ dateFrom: '2026-02-30' }), /不是有效日期/)
  assert.equal(normalizeTwoBuluBatchFilters({}).order, 'asc')
})

test('批次级错误停止后续导入，普通单项错误继续执行', async () => {
  assert.equal(shouldStopTwoBuluBatch({ code: 'QUOTA_EXCEEDED' }), true)
  assert.equal(shouldStopTwoBuluBatch({ code: 'TWO_BULU_DATA_CONVERT_FAILED' }), false)
  const calls = []
  const result = await runTwoBuluBatchImport({
    items: [{ url: 'a', position: 0 }, { url: 'b', position: 1 }, { url: 'c', position: 2 }],
    filters: { order: 'asc' },
    importItem: async item => {
      calls.push(item.url)
      if (item.url === 'a') throw Object.assign(new Error('配额不足'), { code: 'QUOTA_EXCEEDED' })
      return item
    },
  })
  assert.deepEqual(calls, ['a'])
  assert.deepEqual(result.results.map(item => item.status), ['failed', 'cancelled', 'cancelled'])
})

test('批量预览 HTML 包含每条筛选后的轨迹摘要并转义不可信文本', () => {
  const html = twoBuluBatchPreviewMessageHtml({ userName: '<用户>', detectedCount: 1 }, [{
    name: '<路线>', pointCount: 12, distanceKm: 3.5, likeCount: 2, favoriteCount: 1, publishedAt: '2026-08-20T00:00:00.000Z',
  }])
  assert.match(html, /&lt;用户&gt;/)
  assert.match(html, /&lt;路线&gt;/)
  assert.match(html, /点位 12/)
  assert.match(html, /2026\/08\/20|2026-08-20/)
  assert.doesNotMatch(html, /<路线>/)
})
