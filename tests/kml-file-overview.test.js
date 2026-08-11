import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildKmlFileOverview,
  renderKmlFileOverview,
} from '../src/map/kml-file-overview.js'

test('KML 文件详情将文档介绍转成安全可读文本并统计要素类型', () => {
  const kmlFile = {
    name: '<img src=x onerror=alert(1)>测试路线',
    description: [
      '<p><strong>总里程：</strong>12.34 km</p>',
      '<p><strong>运动耗时：</strong>06:05:04</p>',
      '<p><strong>作者：</strong>山友阿明</p>',
      '<script>alert(1)</script>',
    ].join(''),
    features: [
      { type: 'Point' },
      { type: 'LineString' },
      { type: 'LineString' },
    ],
  }

  const overview = buildKmlFileOverview(kmlFile)
  const html = renderKmlFileOverview(kmlFile)

  assert.equal(overview.featureCount, 3)
  assert.deepEqual(overview.typeCounts, { Point: 1, LineString: 2, Polygon: 0 })
  assert.match(overview.descriptionText, /总里程：12\.34 km/)
  assert.match(overview.descriptionText, /运动耗时：06:05:04/)
  assert.match(overview.descriptionText, /作者：山友阿明/)
  assert.doesNotMatch(overview.descriptionText, /alert|script/i)
  assert.match(html, /KML 详情/)
  assert.match(html, /总里程：12\.34 km/)
  assert.match(html, /2 条线/)
  assert.doesNotMatch(html, /<img src=x|onerror=|<script/i)
})

test('KML 文件详情兼容未加载要素和没有介绍的旧文件', () => {
  const overview = buildKmlFileOverview({ featureCount: 27, description: '' })
  const html = renderKmlFileOverview({ featureCount: 27, description: '' })

  assert.equal(overview.featureCount, 27)
  assert.equal(overview.hasLoadedFeatures, false)
  assert.equal(overview.descriptionText, '')
  assert.match(html, /暂无文件介绍/)
  assert.match(html, /27 个要素/)
})
