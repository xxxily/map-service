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

test('空间受限分享的底图目录失败时不允许使用普通地图兜底，并关闭世界横向环绕', () => {
  assert.match(layersSource, /strictCatalog = options\.strictCatalog === true/)
  assert.match(layersSource, /if \(strictCatalog\) throw err/)
  assert.match(layersSource, /if \(strictCatalog\) \{\s*throw new Error\('分享地图图层目录为空或不可用'\)/)
  assert.match(layersSource, /noWrap: layerOptions\.noWrap === true/)
  assert.match(mainSource, /strictCatalog: shareMode/)
  assert.match(mainSource, /maxBounds: restrictedBounds \|\| undefined/)
  assert.match(mainSource, /minZoom: restrictedShare \? shareSpatial\.minZoom/)
  assert.match(mainSource, /分享地图空间范围版本不一致/)
  assert.match(mainSource, /querySelector\('\[data-action="open3d"\]'\)\?\.closest\('li'\)\?\.setAttribute\('hidden'/)
})
