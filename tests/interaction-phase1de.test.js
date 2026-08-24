import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { interactionResourceRef } from '../src/ui/interaction.js'
import { renderInteractionCommentsPage, renderInteractionReportsPage } from '../src/admin/pages/interaction.js'

const interactionSource = readFileSync(new URL('../src/ui/interaction.js', import.meta.url), 'utf8')
const previewSource = readFileSync(new URL('../src/ui/media-preview.js', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

test('2D and 3D media items normalize to one stable feature resource reference', () => {
  const twoD = interactionResourceRef({ sharePublicId: 'shr_public_a', shareItemId: 'shi_a', featureId: 'feature_a', mediaId: 'media_a' })
  const threeD = interactionResourceRef({ publicId: 'shr_public_a', kmlId: 'shi_a', resourceFeatureId: 'feature_a', mediaId: 'media_b' })
  assert.deepEqual({ ...twoD, mediaId: '' }, { ...threeD, mediaId: '' })
  assert.equal(twoD.scope, 'feature')
})

test('media preview keeps interaction controls wired for comments, source info and reports', () => {
  for (const action of ['comments', 'info', 'report']) {
    assert.match(previewSource, new RegExp(`data-media-preview-action="${action}"`))
    assert.equal(previewSource.includes(`if (action === '${action}')`), true)
  }
  assert.match(previewSource, /syncInteractionControls\(root, item\)/)
})

test('interaction controls fail closed when count API fails without throwing into media preview', () => {
  assert.match(interactionSource, /catch \(error\) \{[\s\S]*?error\?\.name !== 'AbortError'[\s\S]*?badge\.hidden = true/s)
  assert.match(interactionSource, /if \(!enabled\) return/)
})

test('interaction panel restores focus and traps Escape and Tab navigation', () => {
  assert.match(interactionSource, /previousFocus\?\.isConnected\) previousFocus\.focus\(\{ preventScroll: true \}\)/)
  assert.match(interactionSource, /event\.key === 'Escape'/)
  assert.match(interactionSource, /event\.key === 'Tab'/)
  assert.match(interactionSource, /event\.shiftKey && document\.activeElement === first/)
  assert.match(interactionSource, /!event\.shiftKey && document\.activeElement === last/)
})

test('interaction panel and media preview expose narrow-screen full-height layout and wrapping text', () => {
  assert.match(stylesSource, /@media \(max-width: 640px\)[\s\S]*?\.map-interaction-panel-root \{ place-items: stretch; \}/)
  assert.match(stylesSource, /\.map-interaction-comment p \{[\s\S]*?overflow-wrap: anywhere;/)
  assert.match(stylesSource, /\.map-interaction-panel \{[\s\S]*?width: min\(430px, 100%\)/)
})

test('admin interaction pages expose query filters required for moderation and report triage', () => {
  const commentsHtml = renderInteractionCommentsPage({ interactionComments: { total: 0, page: 1, limit: 20, items: [] } })
  const reportsHtml = renderInteractionReportsPage({ interactionReports: { total: 0, page: 1, limit: 20, items: [] } })
  assert.match(commentsHtml, /name="moderationStatus"/)
  assert.match(commentsHtml, /name="contentStatus"/)
  assert.match(commentsHtml, /name="canonicalShareId"/)
  assert.match(commentsHtml, /name="featureId"/)
  assert.match(reportsHtml, /name="status"/)
  assert.match(reportsHtml, /name="priority"/)
  assert.match(reportsHtml, /name="canonicalShareId"/)
  assert.match(reportsHtml, /name="scope"/)
  assert.match(reportsHtml, /name="reportType"/)
})
