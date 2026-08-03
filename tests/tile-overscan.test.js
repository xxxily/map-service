import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  drawTileWithEdgeOverscan,
  getOverscannedTileSize,
} from '../src/map/tile-overscan.js'

test('瓦片边缘外延保留 256px 中心区域，并在四周增加 1px 保护带', () => {
  assert.deepEqual(getOverscannedTileSize({ x: 256, y: 256 }), {
    width: 256,
    height: 256,
    edge: 1,
    canvasWidth: 258,
    canvasHeight: 258,
  })
})

test('瓦片边缘外延只复制最外侧像素，不把中心图像拉伸到保护带', () => {
  const calls = []
  const context = {
    drawImage: (...args) => calls.push(args),
  }
  const image = { naturalWidth: 256, naturalHeight: 256 }

  drawTileWithEdgeOverscan(context, image, { x: 256, y: 256 })

  assert.equal(calls.length, 9)
  assert.deepEqual(calls[0], [image, 1, 1, 256, 256])
  assert.deepEqual(calls[1], [image, 0, 0, 256, 1, 1, 0, 256, 1])
  assert.deepEqual(calls[3], [image, 0, 0, 1, 256, 0, 1, 1, 256])
  assert.deepEqual(calls[8], [image, 255, 255, 1, 1, 257, 257, 1, 1])
})
