import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { KML_COLOR_PALETTES } from '../src/ui/kml-color-palettes.js'
import { renderCustomColorPicker } from '../src/ui/controls.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('KML 主题色提供四组固定且互不重复的协调色板', () => {
  assert.equal(KML_COLOR_PALETTES.length, 4)
  assert.deepEqual(KML_COLOR_PALETTES.map(group => group.name), [
    '森野地貌',
    '海岸晴空',
    '暖霞人文',
    '均衡分类',
  ])
  assert.ok(KML_COLOR_PALETTES.every(group => group.colors.length === 8))
  const colors = KML_COLOR_PALETTES.flatMap(group => group.colors)
  assert.equal(new Set(colors).size, 32)
  assert.ok(colors.every(color => /^#[0-9a-f]{6}$/.test(color)))
})

test('共享颜色选择器按组渲染按钮语义、当前选中态和自定义颜色入口', () => {
  const html = renderCustomColorPicker({ value: '#0284c7', className: 'kml-color-input' })
  KML_COLOR_PALETTES.forEach(group => assert.match(html, new RegExp(group.name)))
  assert.equal((html.match(/class="custom-color-swatch/g) || []).length, 32)
  assert.match(html, /button type="button" class="custom-color-trigger"/)
  assert.match(html, /custom-color-swatch is-selected[^>]*data-color="#0284c7"/)
  assert.doesNotMatch(html, /id="custom-color-palette-/)
  assert.match(html, /class="custom-color-hex-input"/)
  assert.match(html, /class="custom-color-custom-btn"/)
})

test('个人空间编辑弹窗复用共享颜色控件并同步表单值', () => {
  const dialogSource = fs.readFileSync(path.join(projectRoot, 'src/ui/dialog.js'), 'utf8')
  assert.match(dialogSource, /renderCustomColorPicker/)
  assert.match(dialogSource, /field\.type === 'color'/)
  assert.match(dialogSource, /data-dialog-color-input/)
  assert.match(dialogSource, /initCustomControlsListeners\(\)/)
  assert.match(dialogSource, /closeCustomControlsDropdowns\(\)/)
})
