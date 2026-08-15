import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('2D 和 3D 媒体点位保持触屏单击预览、长按简介与桌面原交互', () => {
  const map2dSource = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const map3dSource = readFileSync(new URL('../src/map3d/kml.js', import.meta.url), 'utf8')

  assert.match(map2dSource, /function bindMobileMediaPointInteraction/)
  assert.match(map2dSource, /if \(!isTouchFirstEnvironment\(\)\) \{\s*defaultPopupHandler\?\.call\(layer, event\)/s)
  assert.match(map2dSource, /window\.setTimeout\([\s\S]*layer\.openPopup\(\)[\s\S]*LONG_PRESS_DELAY_MS/)
  assert.match(map2dSource, /openKmlFeatureMediaPreview\(kmlFile, feature/)
  assert.match(map2dSource, /layer\.on\('dragstart', clearPress\)/)

  assert.match(map3dSource, /function getMobileMediaPointTarget/)
  assert.match(map3dSource, /pressState = \{\s*kind: 'media'/)
  assert.match(map3dSource, /pressState\.longPressTriggered = true[\s\S]*mobileMediaClickSuppression = \{[\s\S]*MEDIA_CLICK_SUPPRESSION_MS[\s\S]*showFeaturePopup\(/)
  assert.match(map3dSource, /mobileMediaClickSuppression = \{[\s\S]*showFeaturePopup\(/)
  assert.match(map3dSource, /const mediaTarget = isTouchFirstEnvironment\(\) \? getMobileMediaPointTarget\(meta\) : null/)
  assert.match(map3dSource, /openKmlFeatureMediaPreview\(mediaTarget\.kmlFile, mediaTarget\.feature/)
  assert.match(map3dSource, /initLongPressPointCreation\(\{ allowPointCreation: false \}\)/)
})
