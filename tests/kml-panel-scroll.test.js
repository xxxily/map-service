import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  captureKmlPanelScrollState,
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
