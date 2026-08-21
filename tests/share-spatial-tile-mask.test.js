import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import sharp from 'sharp'
import { computeSpatialScope, TRANSPARENT_TILE_PNG } from '../service/bin/user/shareSpatialAccess.js'
import { buildShareTileAlphaMask, ShareSpatialTileMasker } from '../service/bin/user/shareSpatialTileMask.js'

function tileForCoordinate (longitude, latitude, zoom) {
  const scale = 2 ** zoom
  const latitudeRadians = latitude * Math.PI / 180
  return {
    z: zoom,
    x: Math.floor((longitude + 180) / 360 * scale),
    y: Math.floor((1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale),
  }
}

test('透明分享占位图是可解码且完全透明的 PNG', async () => {
  const metadata = await sharp(TRANSPARENT_TILE_PNG).metadata()
  assert.equal(metadata.format, 'png')
  assert.equal(metadata.width, 1)
  assert.equal(metadata.height, 1)
  assert.equal(metadata.hasAlpha, true)
  const pixel = await sharp(TRANSPARENT_TILE_PNG).raw().toBuffer()
  assert.equal(pixel[3], 0)
})

test('边界瓦片遮罩同时保留允许像素并清空范围外像素', async () => {
  const longitude = 113.2644
  const latitude = 23.1291
  const scope = computeSpatialScope({
    documents: [{ features: [{ type: 'Point', coordinates: [longitude, latitude] }] }],
    paddingMeters: 1000,
  }).scope
  const tile = tileForCoordinate(longitude, latitude, Math.max(scope.minZoom, 14))
  const alpha = buildShareTileAlphaMask(scope, tile, 256, 256)
  assert.ok(alpha.opaquePixels > 0)
  assert.ok(alpha.opaquePixels < alpha.totalPixels)

  const input = await sharp({
    create: { width: 256, height: 256, channels: 3, background: '#c52f2f' },
  }).jpeg().toBuffer()
  const masker = new ShareSpatialTileMasker({ maxConcurrency: 1, cacheBytes: 1024 * 1024 })
  const output = await masker.maskRelayResult(
    { stream: Readable.from([input]) },
    { scope, sourceId: 'test', tile }
  )
  const metadata = await sharp(output).metadata()
  assert.equal(metadata.format, 'png')
  assert.equal(metadata.hasAlpha, true)
  const stats = await sharp(output).stats()
  assert.equal(stats.channels[3].min, 0)
  assert.equal(stats.channels[3].max, 255)
})

test('边界瓦片遮罩不会把原图半透明像素变得更不透明', async () => {
  const longitude = 113.2644
  const latitude = 23.1291
  const scope = computeSpatialScope({
    documents: [{ features: [{ type: 'Point', coordinates: [longitude, latitude] }] }],
    paddingMeters: 1000,
  }).scope
  const tile = tileForCoordinate(longitude, latitude, Math.max(scope.minZoom, 14))
  const input = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 20, g: 80, b: 40, alpha: 0.25 },
    },
  }).png().toBuffer()
  const output = await new ShareSpatialTileMasker().maskRelayResult(
    { stream: Readable.from([input]) },
    { scope, sourceId: 'test', tile }
  )
  const stats = await sharp(output).stats()
  assert.equal(stats.channels[3].min, 0)
  assert.ok(stats.channels[3].max <= 64)
})

test('范围外边界遮罩保守返回空结果', async () => {
  const scope = computeSpatialScope({
    documents: [{ features: [{ type: 'Point', coordinates: [113.2644, 23.1291] }] }],
    paddingMeters: 1000,
  }).scope
  const tile = tileForCoordinate(120, 30, 14)
  const input = await sharp({
    create: { width: 256, height: 256, channels: 3, background: '#ffffff' },
  }).png().toBuffer()
  const output = await new ShareSpatialTileMasker().maskRelayResult(
    { stream: Readable.from([input]) },
    { scope, sourceId: 'test', tile }
  )
  assert.equal(output, null)
})

test('边界瓦片处理限制并发和等待队列并在队列满时销毁输入流', async () => {
  const masker = new ShareSpatialTileMasker({
    maxConcurrency: 1,
    maxQueue: 1,
    cacheBytes: 1024 * 1024,
  })
  let processCalls = 0
  let markFirstStarted
  let finishFirst
  const firstStarted = new Promise(resolve => { markFirstStarted = resolve })
  const firstGate = new Promise(resolve => { finishFirst = resolve })
  masker.process = async input => {
    processCalls += 1
    if (processCalls === 1) {
      markFirstStarted()
      await firstGate
    }
    return Buffer.from(input)
  }
  const options = sourceId => ({
    scope: { sourceRevisionHash: `scope-${sourceId}` },
    sourceId,
    tile: { z: 1, x: 0, y: 0 },
  })
  const first = masker.maskRelayResult(
    { stream: Readable.from([Buffer.from('first')]) },
    options('first')
  )
  await firstStarted

  const second = masker.maskRelayResult(
    { stream: Readable.from([Buffer.from('second')]) },
    options('second')
  )
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(masker.active, 1)
  assert.equal(masker.waiters.length, 1)

  const rejectedStream = Readable.from([Buffer.from('third')])
  await assert.rejects(
    masker.maskRelayResult({ stream: rejectedStream }, options('third')),
    error => error.code === 'SHARE_TILE_MASK_QUEUE_FULL'
  )
  assert.equal(rejectedStream.destroyed, true)

  finishFirst()
  assert.equal((await first).toString(), 'first')
  assert.equal((await second).toString(), 'second')
  assert.equal(masker.active, 0)
  assert.equal(masker.waiters.length, 0)
  assert.equal(processCalls, 2)
})

test('非图片和超大边界瓦片均保守失败', async () => {
  const options = {
    scope: { sourceRevisionHash: 'scope-invalid' },
    sourceId: 'test',
    tile: { z: 1, x: 0, y: 0 },
  }
  await assert.rejects(
    new ShareSpatialTileMasker().maskRelayResult(
      { stream: Readable.from([Buffer.from('not-an-image')]) },
      options
    )
  )
  await assert.rejects(
    new ShareSpatialTileMasker().maskRelayResult(
      { stream: Readable.from([Buffer.alloc(2 * 1024 * 1024 + 1)]) },
      options
    ),
    /正文过大/
  )
})
