import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  DEFAULT_TILE_KEEP_BUFFER,
  DEFAULT_TILE_PRELOAD_BUFFER_PX,
} from '../src/map/tile-overscan.js'

const layersSource = readFileSync(new URL('../src/map/layers.js', import.meta.url), 'utf8')
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')

test('无缝瓦片保留边缘像素保护并限制缓存规模', () => {
  assert.equal(DEFAULT_TILE_KEEP_BUFFER, 2)
  assert.equal(DEFAULT_TILE_PRELOAD_BUFFER_PX, 256)
  assert.match(layersSource, /keepBuffer:\s*DEFAULT_TILE_KEEP_BUFFER/)
  assert.match(layersSource, /preloadBuffer:\s*DEFAULT_TILE_PRELOAD_BUFFER_PX/)
  assert.match(layersSource, /tile\.style\.margin = `\$\{-size\.edge\}px`/)
})

test('无缝瓦片立即变为不透明，同时保留缩放期间的旧层级兜底', () => {
  assert.match(layersSource, /_updateOpacity\s*\(\)/)
  assert.match(layersSource, /Object\.values\(this\._tiles \|\| \{\}\)/)
  assert.match(layersSource, /L\.DomUtil\.setOpacity\(tile\.el, 1\)/)
  assert.match(layersSource, /不在逐瓦片加载期间主动裁剪/)
  assert.doesNotMatch(layersSource, /hasOpaqueTiles && !this\._noPrune/)
  assert.doesNotMatch(mainSource, /fadeAnimation:\s*false/)
  assert.doesNotMatch(mainSource, /zoomAnimation:\s*false/)
})

test('canvas 瓦片缩放时只中止未完成请求并保留已绘制旧层级', () => {
  assert.match(layersSource, /_abortLoading\s*\(\)/)
  assert.match(layersSource, /const sourceImage = canvas\?\._sourceImage/)
  assert.match(layersSource, /if \(!sourceImage\) continue/)
  assert.match(layersSource, /this\.fire\('tileabort'/)
  assert.doesNotMatch(layersSource, /if \(!tile\.complete\)/)
})

test('只写入的瓦片 canvas 不请求高频像素回读优化', () => {
  assert.match(layersSource, /canvas\.getContext\('2d'\)/)
  assert.doesNotMatch(layersSource, /canvas\.getContext\('2d',\s*\{\s*willReadFrequently:\s*true\s*\}\)/)
})
