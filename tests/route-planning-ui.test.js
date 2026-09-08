import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('路线规划工具栏使用图标按钮并提供交换、保存、添加和导航操作', () => {
  const html = readSource('../index.html')
  for (const id of ['route-search-btn', 'route-swap-btn', 'route-save-btn', 'route-add-btn', 'route-nav-btn']) {
    const button = html.match(new RegExp(`<button[^>]*id="${id}"[\\s\\S]*?</button>`))?.[0]
    assert.ok(button, `缺少路线按钮：${id}`)
    assert.match(button, /aria-label="[^"]+"/)
    assert.match(button, /<svg[^>]+aria-hidden="true"/)
  }
  assert.doesNotMatch(html, /id="route-search-btn"[^>]*>[\\s\\S]*开始规划[\\s\\S]*<\/button>/)
  assert.doesNotMatch(html, /id="route-save-btn"[^>]*>[\\s\\S]*保存路线[\\s\\S]*<\/button>/)
  assert.doesNotMatch(html, /id="route-add-btn"[^>]*>[\\s\\S]*添加路线[\\s\\S]*<\/button>/)
})

test('每个路线方案提供独立保存和临时添加动作', () => {
  const source = readSource('../src/map/search.js')
  assert.match(source, /data-route-action="save"/)
  assert.match(source, /data-route-action="add"/)
  assert.match(source, /saveSelectedRoute\(map, AMap, idx\)/)
  assert.match(source, /addTemporaryRoute\(map, AMap, idx\)/)
})

test('临时路线只保存在页面内存并在地图卸载时清理', () => {
  const source = readSource('../src/map/search.js')
  assert.match(source, /let temporaryRoutes = \[\]/)
  assert.match(source, /map\.on\('unload',[\s\S]*?clearTemporaryRoutes\(map\)/)
  assert.doesNotMatch(source, /temporaryRoutes[\s\S]{0,160}localStorage/)
})

test('路线保存复用统一 KML 目标选择弹框和既有持久化链路', () => {
  const source = readSource('../src/map/kml.js')
  assert.match(source, /export async function saveRouteLineToKml/)
  assert.match(source, /title: '保存路线到 KML'/)
  assert.match(source, /name: 'kmlId'/)
  assert.match(source, /saveKmlChanges\(kmlFile\)/)
})
