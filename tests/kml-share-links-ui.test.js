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

test('2D and 3D point create/edit flows share the same enrichment and dialog hint', () => {
  const map2dSource = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const map3dSource = readFileSync(new URL('../src/map3d/kml.js', import.meta.url), 'utf8')
  const dialogSource = readFileSync(new URL('../src/ui/dialog.js', import.meta.url), 'utf8')
  const previewSource = readFileSync(new URL('../src/ui/media-preview.js', import.meta.url), 'utf8')

  for (const source of [map2dSource, map3dSource]) {
    assert.match(source, /enrichKmlDescriptionWithShareLinks/)
    assert.match(source, /getEditableKmlDescription/)
    assert.match(source, /支持粘贴抖音等应用分享文案/)
  }
  assert.match(dialogSource, /field\.hint/)
  assert.match(previewSource, /frame\.setAttribute\('allow', policy\.allow\)/)
  assert.match(previewSource, /frame\.allowFullscreen = true/)
})
