const DOCUMENT_LIFECYCLE_EVENTS = new Set([
  'visibilitychange',
  'freeze',
  'resume',
])

/**
 * 将分散在 window/document 上的页面生命周期事件适配为定位控制器使用的单一目标。
 * 模块导入时不读取浏览器全局，便于 node:test 和服务端工具安全加载。
 */
export function createLocationLifecycleTarget ({
  windowRef = globalThis.window,
  documentRef = globalThis.document,
} = {}) {
  function getTarget (eventName) {
    return DOCUMENT_LIFECYCLE_EVENTS.has(eventName) ? documentRef : windowRef
  }

  return {
    isVisible () {
      return documentRef?.visibilityState !== 'hidden'
    },

    addEventListener (eventName, listener) {
      const target = getTarget(eventName)
      if (typeof target?.addEventListener !== 'function') return
      target.addEventListener(eventName, listener)
    },

    removeEventListener (eventName, listener) {
      const target = getTarget(eventName)
      target?.removeEventListener?.(eventName, listener)
    },
  }
}
