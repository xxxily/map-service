import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('2D and 3D search panels expose a direct close action', () => {
  const search2d = readSource('../src/map/search.js')
  const search3d = readSource('../src/map3d/search.js')
  const indexHtml = readSource('../index.html')
  const map3dHtml = readSource('../3d.html')

  for (const source of [search2d, search3d]) {
    assert.match(source, /close-search-panel-btn/)
    assert.match(source, /searchContainer\.style\.display = 'none'/)
  }
  assert.match(indexHtml, /id="close-search-panel-btn"[^>]*class="route-close-btn"/)
  assert.match(map3dHtml, /id="close-search-panel-btn"[^>]*class="route-close-btn"/)
})

test('search close binding is registered before optional map plugins', () => {
  const search2d = readSource('../src/map/search.js')
  const search3d = readSource('../src/map3d/search.js')

  for (const source of [search2d, search3d]) {
    const initIndex = source.indexOf('export function initAmapSearch')
    const guardIndex = source.indexOf("if (!AMap?.", initIndex)
    const closeIndex = source.indexOf("closeSearchButton.addEventListener('click'", initIndex)
    assert.ok(initIndex >= 0)
    assert.ok(closeIndex > initIndex && closeIndex < guardIndex)
  }
})

test('map entry points initialize the search close action even without the map SDK', () => {
  const mainSource = readSource('../src/main.js')
  const map3dSource = readSource('../src/3d.js')

  assert.match(mainSource, /initAmapSearch\(map, AMap, amapGeolocation\)/)
  assert.match(mainSource, /if \(AMap && !restrictedShare\) \{[\s\S]*?amapGeolocation = initAmapGeolocation\(AMap\)[\s\S]*?\}\s*initAmapSearch\(map, AMap, amapGeolocation\)/)
  assert.match(map3dSource, /if \(AMap\) \{[\s\S]*?amapGeolocation = initAmapGeolocation\(AMap\)[\s\S]*?\}\s*initAmapSearch3d\(viewer, AMap\)/)
})

test('left-side Leaflet controls keep complete hover borders', () => {
  const styles = readSource('../src/styles.css')
  assert.match(styles, /\.leaflet-top\.leaflet-left[\s\S]*overflow:\s*visible;/)
  assert.match(styles, /\.leaflet-top\.leaflet-left \.leaflet-bar a:hover,[\s\S]*border:\s*1px solid #14b8a6 !important;[\s\S]*box-shadow:\s*inset 0 0 0 1px #14b8a6;/)
})
