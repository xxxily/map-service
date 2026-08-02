import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { getElementVisualMatrix } from '../src/map/screenshot.js'

const source = readFileSync(new URL('../src/map/screenshot.js', import.meta.url), 'utf8')

test('地图截图依赖由构建系统本地打包，不再运行时加载第三方脚本', () => {
  assert.match(source, /import html2canvas from 'html2canvas'/)
  assert.doesNotMatch(source, /unpkg\.com|createElement\(['"]script['"]\)/)
})

test('地图截图按完整祖先矩阵合成瓦片和 SVG，并处理 SVG 缺失 offset 的情况', () => {
  assert.match(source, /function getElementVisualMatrix/)
  assert.match(source, /Number\.isFinite\(currentElement\.offsetLeft\)/)
  assert.match(source, /function getElementVisualOpacity/)
  assert.match(source, /context\.setTransform\(matrix\.a, matrix\.b, matrix\.c, matrix\.d, matrix\.e, matrix\.f\)/)
  assert.match(source, /querySelectorAll\('\.leaflet-tile'\)/)
  assert.match(source, /querySelectorAll\('\.leaflet-overlay-pane svg'\)/)
})

test('SVG 没有 offset 属性时仍可得到有限且正确的旋转合成矩阵', () => {
  class Matrix2D {
    constructor (value) {
      if (typeof value === 'string') {
        const parts = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')')).split(',').map(Number)
        ;[this.a, this.b, this.c, this.d, this.e, this.f] = parts
      } else {
        this.a = 1
        this.b = 0
        this.c = 0
        this.d = 1
        this.e = 0
        this.f = 0
      }
    }

    translate (x, y) {
      const translation = new Matrix2D()
      translation.e = x
      translation.f = y
      return this.multiply(translation)
    }

    multiply (other) {
      const result = new Matrix2D()
      result.a = this.a * other.a + this.c * other.b
      result.b = this.b * other.a + this.d * other.b
      result.c = this.a * other.c + this.c * other.d
      result.d = this.b * other.c + this.d * other.d
      result.e = this.a * other.e + this.c * other.f + this.e
      result.f = this.b * other.e + this.d * other.f + this.f
      return result
    }
  }

  const originalWindow = globalThis.window
  const originalDOMMatrix = globalThis.DOMMatrix
  globalThis.DOMMatrix = Matrix2D
  globalThis.window = {
    getComputedStyle: element => element.styles,
  }

  const stopElement = {}
  const rotatePane = {
    offsetLeft: 0,
    offsetTop: 0,
    parentElement: stopElement,
    styles: {
      marginLeft: '0px',
      marginTop: '0px',
      transform: 'matrix(0, 1, -1, 0, 100, 0)',
      transformOrigin: '0px 0px',
    },
  }
  const svg = {
    parentElement: rotatePane,
    styles: {
      marginLeft: '0px',
      marginTop: '0px',
      transform: 'matrix(1, 0, 0, 1, -2, -3)',
      transformOrigin: '0px 0px',
    },
  }

  try {
    const matrix = getElementVisualMatrix(svg, stopElement)
    assert.deepEqual(
      [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
      [0, 1, -1, 0, 103, -2]
    )
    assert.ok([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite))
  } finally {
    globalThis.window = originalWindow
    globalThis.DOMMatrix = originalDOMMatrix
  }
})

test('地图截图克隆阶段隐藏原 Leaflet 图层，只使用离屏合成结果', () => {
  assert.match(source, /clonedMapPane\.style\.display = 'none'/)
  assert.match(source, /data-map-screenshot-root/)
  assert.match(source, /overlayClone\.cloneNode\(true\)/)
})

test('同一地图的并发截图请求会复用正在执行的任务', () => {
  assert.match(source, /const screenshotTasks = new WeakMap\(\)/)
  assert.match(source, /const currentTask = screenshotTasks\.get\(map\)/)
  assert.match(source, /if \(currentTask\) return currentTask/)
})
