import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  COMPACT_TOUCH_MEDIA_QUERY,
  isTouchFirstEnvironment,
  TOUCH_FIRST_MEDIA_QUERY,
} from '../src/ui/touch-environment.js'

function matchMediaFrom (matches = {}) {
  return query => ({ matches: matches[query] === true })
}

test('主指针为粗粒度且无 hover 时识别为触屏优先环境', () => {
  assert.equal(isTouchFirstEnvironment({
    matchMedia: matchMediaFrom({ [TOUCH_FIRST_MEDIA_QUERY]: true }),
    navigator: { maxTouchPoints: 0 },
  }), true)
})

test('窄屏触摸设备作为兼容路径识别为触屏优先环境', () => {
  assert.equal(isTouchFirstEnvironment({
    matchMedia: matchMediaFrom({ [COMPACT_TOUCH_MEDIA_QUERY]: true }),
    navigator: { maxTouchPoints: 2 },
  }), true)
})

test('窄窗口桌面鼠标不改变为移动端媒体交互', () => {
  assert.equal(isTouchFirstEnvironment({
    matchMedia: matchMediaFrom({ [COMPACT_TOUCH_MEDIA_QUERY]: true }),
    navigator: { maxTouchPoints: 0 },
  }), false)
})
