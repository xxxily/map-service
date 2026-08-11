import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  extractGeneratedKmlShareEmbeds,
  mergeKmlShareEmbeds,
} from '../shared/kml-share-links.js'
import {
  enrichKmlDescriptionWithShareLinks,
  getEditableKmlDescription,
} from '../src/integrations/kml-share-links.js'

test('shared merge output can be consumed by the UI enrichment contract', () => {
  const item = {
    provider: 'douyin',
    resourceId: '7645601561687440101',
    sourceUrl: 'https://v.douyin.com/Xi6sjYn-rps/',
  }
  const description = mergeKmlShareEmbeds('原始分享文案', [item])
  const extracted = extractGeneratedKmlShareEmbeds(description)

  assert.equal(extracted.length, 1)
  assert.equal(extracted[0].resourceId, item.resourceId)
  assert.equal(extracted[0].sourceUrl, item.sourceUrl)
})

test('UI enrichment converts canonical Douyin links locally and hides generated markup on edit', async () => {
  const videoId = '7645601561687440101'
  const result = await enrichKmlDescriptionWithShareLinks(`现场视频 https://www.douyin.com/video/${videoId}`)

  assert.equal(result.items.length, 1)
  assert.equal(result.warnings.length, 0)
  assert.match(result.description, /data-kml-share-provider="douyin"/)
  assert.equal(getEditableKmlDescription(result.description), `现场视频 https://www.douyin.com/video/${videoId}`)
})

test('UI enrichment converts a 720yun public URL locally and keeps only the normalized editable URL', async () => {
  const result = await enrichKmlDescriptionWithShareLinks('全景 https://720yun.com/vr/f4ejtOsf5y0?from=copy')

  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].provider, '720yun')
  assert.equal(result.warnings.length, 0)
  assert.match(result.description, /data-kml-share-provider="720yun"/)
  assert.equal(getEditableKmlDescription(result.description), '全景 https://www.720yun.com/vr/f4ejtOsf5y0')
})

test('2D and 3D point create/edit flows share enrichment, 720yun guidance and marker picker', () => {
  const map2dSource = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const map3dSource = readFileSync(new URL('../src/map3d/kml.js', import.meta.url), 'utf8')
  const dialogSource = readFileSync(new URL('../src/ui/dialog.js', import.meta.url), 'utf8')
  const previewSource = readFileSync(new URL('../src/ui/media-preview.js', import.meta.url), 'utf8')
  const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const contentPanelSource = readFileSync(new URL('../src/map/kml-content-panel.js', import.meta.url), 'utf8')
  const agentsSource = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8')

  for (const source of [map2dSource, map3dSource]) {
    assert.match(source, /enrichKmlDescriptionWithShareLinks/)
    assert.match(source, /getEditableKmlDescription/)
    assert.match(source, /可粘贴受支持的公开分享链接/)
    assert.doesNotMatch(source, /可留空，留空时地图和详情中不显示标题/)
    assert.doesNotMatch(source, /支持粘贴抖音、720 云等公开分享地址/)
    assert.match(source, /buildKmlMarkerIconField\(/)
    assert.match(source, /applyKmlMarkerIconSelection/)
    assert.match(source, /recordKmlMarkerRecentIcon\(result\.markerIcon\)/)
    assert.match(source, /required:\s*false/)
  }
  assert.match(dialogSource, /field\.hint/)
  assert.match(dialogSource, /field\.type === 'icon-picker'/)
  assert.match(dialogSource, /role="radiogroup"/)
  assert.match(dialogSource, /field\.required === false/)
  assert.match(dialogSource, /data-icon-picker-more/)
  assert.match(dialogSource, /data-icon-picker-library/)
  assert.match(dialogSource, /closeIconLibrary/)
  assert.match(stylesSource, /\.app-dialog-icon-strip/)
  assert.match(stylesSource, /overflow-x:\s*auto/)
  assert.match(stylesSource, /overscroll-behavior-x:\s*contain/)
  assert.match(stylesSource, /\.app-dialog\s*\{[^}]*overflow-x:\s*hidden/s)
  assert.match(stylesSource, /\.app-dialog-icon-picker\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/s)
  assert.match(stylesSource, /\.app-dialog-icon-toolbar\s*\{[^}]*max-width:\s*100%[^}]*overflow:\s*hidden/s)
  assert.match(stylesSource, /\.app-dialog-icon-more/)
  assert.match(stylesSource, /\.app-dialog-icon-grid/)
  assert.match(stylesSource, /\.app-dialog-icon-option\.is-selected/)
  assert.match(contentPanelSource, /featureName \? `<h2>/)
  assert.doesNotMatch(contentPanelSource, /feature\?\.name \|\| '未命名点位'/)
  assert.match(agentsSource, /界面文案应保持克制/)
  assert.match(agentsSource, /不在通用提示中枚举当前支持的平台、媒体类型/)
  assert.match(previewSource, /frame\.setAttribute\('allow', policy\.allow\)/)
  assert.match(previewSource, /frame\.allowFullscreen = true/)
})
