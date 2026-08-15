import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createMediaPreviewHistoryGuard,
  MEDIA_PREVIEW_HISTORY_STATE_KEY,
} from '../src/ui/media-preview-history.js'

function createWindowFixture () {
  const listeners = new Map()
  const pushes = []
  let backCalls = 0
  const windowLike = {
    location: { href: 'https://map.example.test/?zoom=12' },
    addEventListener (type, listener) {
      listeners.set(type, [...(listeners.get(type) || []), listener])
    },
    removeEventListener (type, listener) {
      listeners.set(type, (listeners.get(type) || []).filter(item => item !== listener))
    },
    emit (type) {
      for (const listener of listeners.get(type) || []) listener({ type })
    },
  }
  const history = {
    state: { existing: true },
    pushState (state, _title, url) {
      pushes.push({ state, url })
      this.state = state
    },
    back () {
      backCalls += 1
    },
  }
  return {
    history,
    pushes,
    windowLike,
    get backCalls () { return backCalls },
  }
}

test('移动端媒体预览只压入一个同 URL 历史哨兵', () => {
  const fixture = createWindowFixture()
  const guard = createMediaPreviewHistoryGuard({
    window: fixture.windowLike,
    history: fixture.history,
    isEnabled: () => true,
  })

  assert.equal(guard.activate(), true)
  assert.equal(guard.activate(), false)
  assert.equal(fixture.pushes.length, 1)
  assert.equal(fixture.pushes[0].url, fixture.windowLike.location.href)
  assert.equal(fixture.pushes[0].state.existing, true)
  assert.equal(fixture.pushes[0].state[MEDIA_PREVIEW_HISTORY_STATE_KEY], 1)
  guard.destroy()
})

test('浏览器返回优先关闭媒体预览并释放历史哨兵', () => {
  const fixture = createWindowFixture()
  let closeCalls = 0
  const guard = createMediaPreviewHistoryGuard({
    window: fixture.windowLike,
    history: fixture.history,
    isEnabled: () => true,
    onBack: () => { closeCalls += 1 },
  })

  guard.activate()
  fixture.windowLike.emit('popstate')
  assert.equal(closeCalls, 1)
  assert.equal(guard.isActive(), false)
  fixture.windowLike.emit('popstate')
  assert.equal(closeCalls, 1)
  guard.destroy()
})

test('关闭按钮回退自身哨兵且不会留下额外返回步骤', () => {
  const fixture = createWindowFixture()
  let closeCalls = 0
  const timers = []
  const guard = createMediaPreviewHistoryGuard({
    window: fixture.windowLike,
    history: fixture.history,
    isEnabled: () => true,
    onBack: () => { closeCalls += 1 },
    setTimeout: callback => {
      timers.push(callback)
      return timers.length
    },
    clearTimeout: () => {},
  })

  guard.activate()
  assert.equal(guard.requestClose(), true)
  assert.equal(guard.requestClose(), false)
  assert.equal(fixture.backCalls, 1)
  assert.equal(closeCalls, 0)
  fixture.windowLike.emit('popstate')
  assert.equal(closeCalls, 1)
  assert.equal(guard.isCloseRequested(), false)
  timers[0]?.()
  assert.equal(closeCalls, 1)
  guard.destroy()
})

test('桌面环境不创建媒体预览历史记录', () => {
  const fixture = createWindowFixture()
  const guard = createMediaPreviewHistoryGuard({
    window: fixture.windowLike,
    history: fixture.history,
    isEnabled: () => false,
  })

  assert.equal(guard.activate(), false)
  assert.equal(fixture.pushes.length, 0)
  guard.destroy()
})
