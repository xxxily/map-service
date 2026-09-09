import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  captureKmlPanelScrollState,
  clearKmlPanelScrollState,
  replaceKmlPanelContent,
  restoreKmlPanelScrollState,
} from '../src/map/kml-panel-scroll.js'

function createFeatureList (id, scrollTop, scrollLeft = 0) {
  const card = {
    dataset: { kmlCardId: id },
    getAttribute: name => name === 'data-kml-card-id' ? id : null,
    matches: selector => selector === '[data-kml-card-id]',
  }
  return {
    scrollTop,
    scrollLeft,
    dataset: {},
    closest: selector => selector === '[data-kml-card-id]' ? card : null,
  }
}

function createUnkeyedFeatureList (scrollTop, scrollLeft = 0) {
  return {
    scrollTop,
    scrollLeft,
    dataset: {},
    closest: () => null,
  }
}

function createCollapsibleFeatureList (id, getHidden, initialScrollTop) {
  const card = {
    dataset: { kmlCardId: id },
    getAttribute: name => name === 'data-kml-card-id' ? id : null,
    matches: selector => selector === '[data-kml-card-id]',
  }
  let scrollTop = initialScrollTop
  const hiddenParent = {
    hidden: true,
    parentElement: null,
    parentNode: null,
  }
  const list = {
    scrollLeft: 0,
    dataset: {},
    closest: selector => {
      if (selector === '[data-kml-card-id]') return card
      if (selector === '[hidden]' && getHidden()) return hiddenParent
      return null
    },
  }
  Object.defineProperty(list, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: value => {
      // Browsers clamp a hidden/zero-height scroller to zero.
      scrollTop = getHidden() ? 0 : Number(value) || 0
    },
  })
  return list
}

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

test('KML 列表重建后按文件 ID 恢复内部点位列表滚动位置', () => {
  const panelBody = { scrollTop: 74, scrollLeft: 3 }
  let featureLists = [
    createFeatureList('file-a', 18),
    createFeatureList('file-b', 326, 7),
  ]
  const container = {
    closest: selector => selector === '.kml-panel-body' ? panelBody : null,
    querySelectorAll: selector => selector === '.kml-features-list' ? featureLists : [],
    innerHTML: '',
  }
  Object.defineProperty(container, 'innerHTML', {
    configurable: true,
    get: () => '',
    set: () => {
      // Simulate innerHTML replacing the old nodes and changing their order.
      featureLists = [
        createFeatureList('file-b', 0),
        createFeatureList('file-a', 0),
      ]
    },
  })

  replaceKmlPanelContent(container, '<new-panel />')

  assert.equal(panelBody.scrollTop, 74)
  assert.equal(panelBody.scrollLeft, 3)
  assert.equal(featureLists[0].scrollTop, 326)
  assert.equal(featureLists[0].scrollLeft, 7)
  assert.equal(featureLists[1].scrollTop, 18)
})

test('KML 文件移除后不会把旧滚动位置套到其他文件', () => {
  let featureLists = [
    createFeatureList('file-a', 120),
    createFeatureList('file-b', 480),
  ]
  const container = {
    closest: () => null,
    querySelectorAll: selector => selector === '.kml-features-list' ? featureLists : [],
  }
  Object.defineProperty(container, 'innerHTML', {
    configurable: true,
    get: () => '',
    set: () => {
      featureLists = [createFeatureList('file-b', 0)]
    },
  })

  replaceKmlPanelContent(container, '<new-panel />')

  assert.equal(featureLists[0].scrollTop, 480)
})

test('无稳定 ID 时不会把旧位置套到新的有 ID 文件', () => {
  let featureLists = [createUnkeyedFeatureList(240)]
  const container = {
    closest: () => null,
    querySelectorAll: selector => selector === '.kml-features-list' ? featureLists : [],
  }
  Object.defineProperty(container, 'innerHTML', {
    configurable: true,
    get: () => '',
    set: () => {
      featureLists = [createFeatureList('new-file', 0)]
    },
  })

  replaceKmlPanelContent(container, '<new-panel />')

  assert.equal(featureLists[0].scrollTop, 0)
})

test('KML 列表重建时复用原滚动容器并更新其内容', () => {
  const previousList = createFeatureList('file-a', 215)
  previousList.innerHTML = '<old-row />'
  const nextList = createFeatureList('file-a', 0)
  nextList.innerHTML = '<new-row />'
  let featureLists = [previousList]
  const container = {
    closest: () => null,
    querySelectorAll: selector => selector === '.kml-features-list' ? featureLists : [],
  }
  nextList.replaceWith = replacement => {
    featureLists = [replacement]
  }
  Object.defineProperty(container, 'innerHTML', {
    configurable: true,
    get: () => '',
    set: () => {
      featureLists = [nextList]
    },
  })

  replaceKmlPanelContent(container, '<new-panel />')

  assert.equal(featureLists[0], previousList)
  assert.equal(previousList.innerHTML, '<new-row />')
  assert.equal(previousList.scrollTop, 215)
})

test('滚动容器复用失败时保留恢复兜底并输出诊断', () => {
  const previousList = createFeatureList('file-a', 215)
  const nextList = createFeatureList('file-a', 0)
  nextList.replaceWith = () => {
    throw new Error('replace failed')
  }
  let featureLists = [previousList]
  const container = {
    closest: () => null,
    querySelectorAll: selector => selector === '.kml-features-list' ? featureLists : [],
  }
  Object.defineProperty(container, 'innerHTML', {
    configurable: true,
    get: () => '',
    set: () => {
      featureLists = [nextList]
    },
  })
  const previousWarn = console.warn
  let warningCount = 0
  console.warn = () => { warningCount += 1 }
  try {
    replaceKmlPanelContent(container, '<new-panel />')
  } finally {
    console.warn = previousWarn
  }

  assert.equal(featureLists[0].scrollTop, 215)
  assert.equal(warningCount, 1)
})

test('连续重绘时旧动画帧不会覆盖较新的滚动状态', () => {
  const previousWindow = globalThis.window
  const frameQueue = []
  globalThis.window = {
    requestAnimationFrame: callback => {
      frameQueue.push(callback)
      return frameQueue.length
    },
  }
  try {
    let featureLists = [createFeatureList('file-a', 100)]
    const container = {
      closest: () => null,
      querySelectorAll: selector => selector === '.kml-features-list' ? featureLists : [],
    }
    Object.defineProperty(container, 'innerHTML', {
      configurable: true,
      get: () => '',
      set: () => {
        featureLists = [createFeatureList('file-a', 0)]
      },
    })

    replaceKmlPanelContent(container, '<first-render />')
    featureLists[0].scrollTop = 260
    replaceKmlPanelContent(container, '<second-render />')
    featureLists[0].scrollTop = 0

    frameQueue.shift()()
    assert.equal(featureLists[0].scrollTop, 0)

    frameQueue.shift()()
    assert.equal(featureLists[0].scrollTop, 260)

    frameQueue.shift()()
    assert.equal(featureLists[0].scrollTop, 260)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('按文件清理滚动缓存不会取消其他文件的延迟恢复', () => {
  const previousWindow = globalThis.window
  const frameQueue = []
  globalThis.window = {
    requestAnimationFrame: callback => {
      frameQueue.push(callback)
      return frameQueue.length
    },
  }
  try {
    let featureLists = [
      createFeatureList('file-a', 120),
      createFeatureList('file-b', 340),
    ]
    const container = {
      closest: () => null,
      querySelectorAll: selector => selector === '.kml-features-list' ? featureLists : [],
    }
    Object.defineProperty(container, 'innerHTML', {
      configurable: true,
      get: () => '',
      set: () => {
        featureLists = [
          createFeatureList('file-a', 0),
          createFeatureList('file-b', 0),
        ]
      },
    })

    replaceKmlPanelContent(container, '<new-panel />')
    featureLists.forEach(list => { list.scrollTop = 0 })
    clearKmlPanelScrollState(container, 'file-a')

    frameQueue.shift()()
    assert.equal(featureLists[0].scrollTop, 0)
    assert.equal(featureLists[1].scrollTop, 340)

    frameQueue.shift()()
    assert.equal(featureLists[0].scrollTop, 0)
    assert.equal(featureLists[1].scrollTop, 340)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('按文件清理后重新渲染不会恢复被删除文件的旧位置', () => {
  let featureLists = [
    createFeatureList('file-a', 275),
    createFeatureList('file-b', 185),
  ]
  const container = {
    closest: () => null,
    querySelectorAll: selector => selector === '.kml-features-list' ? featureLists : [],
  }
  Object.defineProperty(container, 'innerHTML', {
    configurable: true,
    get: () => '',
    set: () => {
      featureLists = [
        createFeatureList('file-a', 0),
        createFeatureList('file-b', 0),
      ]
    },
  })

  clearKmlPanelScrollState(container, 'file-a')
  replaceKmlPanelContent(container, '<recreated-panel />')

  assert.equal(featureLists[0].scrollTop, 0)
  assert.equal(featureLists[1].scrollTop, 185)
})

test('CSS 隐藏期间不会用不可用布局覆盖已有滚动缓存', () => {
  const previousWindow = globalThis.window
  let hidden = false
  globalThis.window = {
    getComputedStyle: () => ({
      display: hidden ? 'none' : 'block',
      visibility: 'visible',
      contentVisibility: 'visible',
    }),
  }
  try {
    let featureLists = [createFeatureList('file-a', 420)]
    const container = {
      closest: () => null,
      querySelectorAll: selector => selector === '.kml-features-list' ? featureLists : [],
    }
    Object.defineProperty(container, 'innerHTML', {
      configurable: true,
      get: () => '',
      set: () => { featureLists = [createFeatureList('file-a', 0)] },
    })

    replaceKmlPanelContent(container, '<visible />')
    hidden = true
    replaceKmlPanelContent(container, '<hidden />')
    hidden = false
    replaceKmlPanelContent(container, '<visible-again />')

    assert.equal(featureLists[0].scrollTop, 420)
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('KML 卡片折叠后重新展开恢复最近一次内部列表滚动位置', () => {
  let expanded = true
  let renderedHidden = false
  let featureLists = []
  const createList = scrollTop => {
    const list = createCollapsibleFeatureList('file-a', () => renderedHidden, scrollTop)
    list.replaceWith = replacement => {
      featureLists = [replacement]
    }
    return list
  }
  featureLists = [createList(640)]
  const container = {
    closest: () => null,
    querySelectorAll: selector => selector === '.kml-features-list' ? featureLists : [],
  }
  Object.defineProperty(container, 'innerHTML', {
    configurable: true,
    get: () => '',
    set: () => {
      renderedHidden = !expanded
      featureLists = [createList(0)]
    },
  })

  expanded = false
  replaceKmlPanelContent(container, '<collapsed />')
  assert.equal(featureLists[0].scrollTop, 0)

  // A second redraw while collapsed must not replace the remembered 640px
  // with the browser's clamped zero.
  replaceKmlPanelContent(container, '<collapsed-again />')
  assert.equal(featureLists[0].scrollTop, 0)

  expanded = true
  replaceKmlPanelContent(container, '<expanded />')
  assert.equal(featureLists[0].scrollTop, 640)
})

test('零高度过渡列表不会覆盖已有滚动缓存', () => {
  let featureLists = [createFeatureList('file-a', 310)]
  let nextLayout = 'transient'
  const container = {
    closest: () => null,
    querySelectorAll: selector => selector === '.kml-features-list' ? featureLists : [],
  }
  Object.defineProperty(container, 'innerHTML', {
    configurable: true,
    get: () => '',
    set: () => {
      const next = createFeatureList('file-a', 0)
      Object.assign(next, nextLayout === 'transient'
        ? { clientHeight: 0, offsetHeight: 0, scrollHeight: 800 }
        : { clientHeight: 200, offsetHeight: 200, scrollHeight: 800 })
      featureLists = [next]
    },
  })

  replaceKmlPanelContent(container, '<transition />')
  assert.equal(featureLists[0].scrollTop, 310)

  const transient = createFeatureList('file-a', 0)
  Object.assign(transient, { clientHeight: 0, offsetHeight: 0, scrollHeight: 800 })
  featureLists = [transient]
  nextLayout = 'settled'
  replaceKmlPanelContent(container, '<settled />')
  assert.equal(featureLists[0].scrollTop, 310)
})

test('清理 KML 文件后不会恢复同 ID 的旧滚动位置', () => {
  let featureLists = [createFeatureList('file-a', 275)]
  let renderMode = 'initial'
  const container = {
    closest: () => null,
    querySelectorAll: selector => selector === '.kml-features-list' ? featureLists : [],
  }
  Object.defineProperty(container, 'innerHTML', {
    configurable: true,
    get: () => '',
    set: () => {
      featureLists = renderMode === 'delete' ? [] : [createFeatureList('file-a', 0)]
    },
  })
  replaceKmlPanelContent(container, '<initial />')
  renderMode = 'delete'
  replaceKmlPanelContent(container, '<deleted />')
  clearKmlPanelScrollState(container, 'file-a')

  renderMode = 'recreate'
  featureLists = [createFeatureList('file-a', 0)]
  replaceKmlPanelContent(container, '<recreated />')
  assert.equal(featureLists[0].scrollTop, 0)
})

test('2D、分享和 3D KML 面板统一使用滚动安全替换入口', () => {
  const map2d = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const map3d = readFileSync(new URL('../src/map3d/kml.js', import.meta.url), 'utf8')
  const shareRenderer = map2d.match(/function renderShareKmlPanel \(map\)[\s\S]*?\n}\n\nasync function initShareKmlSupport/)?.[0] || ''
  const map3dRenderer = map3d.match(/function updateKmlPanelUI \(\)[\s\S]*?\n}\n\nfunction renderKmlDirectoryGroups/)?.[0] || ''

  assert.match(map2d, /function updateKmlPanelUI \(map\)[\s\S]*replaceKmlPanelContent\(container, html\)/)
  assert.match(shareRenderer, /replaceKmlPanelContent\(container, `/)
  assert.match(map3dRenderer, /replaceKmlPanelContent\(container, `/)
  assert.match(map2d, /data-kml-scroll-key="\$\{safeKmlId\}"/)
  assert.match(map3d, /data-kml-scroll-key="\$\{safeKmlId\}"/)
  assert.match(map3d, /<div class="kml-features-list" data-kml-scroll-key="\$\{safeKmlId\}"[\s\S]*\$\{expanded \?/)
})
