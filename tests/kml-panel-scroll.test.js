import test from 'node:test'
import assert from 'node:assert/strict'

import {
  captureKmlPanelScrollState,
  restoreKmlPanelScrollState,
} from '../src/map/kml-panel-scroll.js'

test('KML 面板列表重绘后恢复滚动位置', () => {
  const scrollContainer = {
    scrollTop: 860,
    scrollLeft: 12,
  }
  const list = {
    closest: selector => selector === '.kml-panel-body' ? scrollContainer : null,
    parentElement: null,
  }

  const state = captureKmlPanelScrollState(list)

  scrollContainer.scrollTop = 0
  scrollContainer.scrollLeft = 0
  restoreKmlPanelScrollState(state)

  assert.equal(scrollContainer.scrollTop, 860)
  assert.equal(scrollContainer.scrollLeft, 12)
})

test('KML 面板滚动状态工具兼容不存在容器的场景', () => {
  assert.equal(captureKmlPanelScrollState(null), null)
  assert.doesNotThrow(() => restoreKmlPanelScrollState(null))
})
