import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  ensureTerrainQualityControls,
  getTerrainQualityLabel,
  updateTerrainQualityControls,
} from '../src/map3d/quality-controls.js'

function createElement (tagName) {
  const listeners = new Map()
  const element = {
    tagName: tagName.toUpperCase(),
    id: '',
    className: '',
    children: [],
    dataset: {},
    attributes: new Map(),
    textContent: '',
    appendChild (child) {
      this.children.push(child)
      return child
    },
    setAttribute (name, value) {
      this.attributes.set(name, String(value))
    },
    getAttribute (name) {
      return this.attributes.get(name) ?? null
    },
    addEventListener (type, listener) {
      listeners.set(type, [...(listeners.get(type) || []), listener])
    },
    emit (type) {
      for (const listener of listeners.get(type) || []) listener({ target: this })
    },
    querySelector (selector) {
      return findAll(this, selector)[0] || null
    },
    querySelectorAll (selector) {
      return findAll(this, selector)
    },
  }
  element.classList = {
    toggle (className, force) {
      const names = new Set(element.className.split(/\s+/).filter(Boolean))
      force ? names.add(className) : names.delete(className)
      element.className = [...names].join(' ')
    },
    contains (className) {
      return element.className.split(/\s+/).includes(className)
    },
  }
  return element
}

function findAll (root, selector) {
  const matches = []
  const visit = (node) => {
    const matched = selector.startsWith('#')
      ? node.id === selector.slice(1)
      : selector === '[data-terrain-quality]' && typeof node.dataset?.terrainQuality === 'string'
    if (matched) matches.push(node)
    for (const child of node.children || []) visit(child)
  }
  visit(root)
  return matches
}

function createDocumentFixture () {
  const root = createElement('body')
  const statusPanel = createElement('div')
  statusPanel.id = 'terrain-status-panel'
  statusPanel.insertAdjacentElement = (_position, element) => root.appendChild(element)
  root.appendChild(statusPanel)
  return {
    root,
    createElement,
    getElementById (id) {
      return findAll(root, `#${id}`)[0] || null
    },
  }
}

test('quality controls expose four stable, accessible choices and do not duplicate', () => {
  const documentLike = createDocumentFixture()
  const selections = []
  const panel = ensureTerrainQualityControls(documentLike, selection => selections.push(selection))

  assert.equal(panel.id, 'terrain-quality-panel')
  assert.equal(panel.getAttribute('role'), 'group')
  assert.equal(panel.getAttribute('aria-label'), '三维地形渲染质量')
  const buttons = panel.querySelectorAll('[data-terrain-quality]')
  assert.deepEqual(buttons.map(button => button.dataset.terrainQuality), [
    'auto', 'economy', 'balanced', 'quality',
  ])
  assert.ok(buttons.every(button => button.getAttribute('aria-pressed') === 'false'))
  buttons[3].emit('click')
  assert.deepEqual(selections, ['quality'])
  assert.equal(ensureTerrainQualityControls(documentLike, () => {}), panel)
})

test('quality controls keep selection and actual flat-mode preset explicit', () => {
  const documentLike = createDocumentFixture()
  const panel = ensureTerrainQualityControls(documentLike, () => {})

  assert.equal(getTerrainQualityLabel('auto'), '自动（当前按均衡执行）')
  const active = updateTerrainQualityControls(panel, 'quality', 'active')
  assert.equal(active.label, '渲染质量：高质量')
  assert.equal(panel.querySelector('#terrain-quality-quality').getAttribute('aria-pressed'), 'true')
  assert.equal(panel.querySelector('#terrain-quality-auto').getAttribute('aria-pressed'), 'false')

  const fallback = updateTerrainQualityControls(panel, 'quality', 'fallback')
  assert.equal(fallback.label, '渲染质量：高质量（平面模式按节能执行）')
  assert.equal(panel.querySelector('#terrain-quality-quality').classList.contains('is-selected'), true)
})

test('3D map keeps automatic quality without rendering the quality panel', () => {
  const source = readFileSync(new URL('../src/3d.js', import.meta.url), 'utf8')
  const html = readFileSync(new URL('../3d.html', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../src/map3d-styles.css', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /ensureTerrainQualityControls\(\)/)
  assert.doesNotMatch(source, /setTerrainQualitySelection/)
  assert.match(source, /formatCompactTerrainStatus\(terrainRuntime\.state, terrainRuntime\.statusDetail\)/)
  assert.match(html, /id="terrain-status-panel" class="terrain-status-panel" hidden/)
  assert.match(html, /id="camera-status" class="camera-status"/)
  assert.match(styles, /\.terrain-quality-panel\s*\{\s*display:\s*none !important;/s)
  assert.match(styles, /img\[title="Cesium"\]/)
  assert.match(styles, /img\[title="Cesium ion"\]/)
})
