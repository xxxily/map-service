import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('2D 和 3D 媒体点位在桌面与触屏环境统一为单击预览、长按简介', () => {
  const map2dSource = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const map3dSource = readFileSync(new URL('../src/map3d/kml.js', import.meta.url), 'utf8')

  assert.match(map2dSource, /function bindMediaPointInteraction/)
  assert.match(map2dSource, /const isPrimaryPointer = event =>[\s\S]*event\?\.isPrimary !== false/)
  assert.doesNotMatch(map2dSource, /defaultPopupHandler\?\.call\(layer, event\)/)
  assert.match(map2dSource, /window\.setTimeout\([\s\S]*layer\.openPopup\(\)[\s\S]*LONG_PRESS_DELAY_MS/)
  assert.match(map2dSource, /openKmlFeatureMediaPreview\(kmlFile, feature/)
  assert.match(map2dSource, /layer\.on\('dragstart', clearPress\)/)

  assert.match(map3dSource, /function getMediaPointTarget/)
  assert.match(map3dSource, /pressState = \{\s*kind: 'media'/)
  assert.match(map3dSource, /pressState\.longPressTriggered = true[\s\S]*mobileMediaClickSuppression = \{[\s\S]*MEDIA_CLICK_SUPPRESSION_MS[\s\S]*showFeaturePopup\(/)
  assert.match(map3dSource, /mobileMediaClickSuppression = \{[\s\S]*showFeaturePopup\(/)
  assert.match(map3dSource, /event\.isPrimary !== false[\s\S]*const mediaTarget = getMediaPointTarget\(pickedMeta\)/)
  assert.match(map3dSource, /const mediaTarget = getMediaPointTarget\(meta\)/)
  assert.match(map3dSource, /openKmlFeatureMediaPreview\(mediaTarget\.kmlFile, mediaTarget\.feature/)
  assert.match(map3dSource, /initLongPressPointCreation\(\{ allowPointCreation: false \}\)/)
})
