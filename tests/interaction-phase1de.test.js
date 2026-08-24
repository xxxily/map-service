import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { interactionResourceRef } from '../src/ui/interaction.js'
import { renderInteractionCommentsPage, renderInteractionReportsPage } from '../src/admin/pages/interaction.js'

const interactionSource = readFileSync(new URL('../src/ui/interaction.js', import.meta.url), 'utf8')
const previewSource = readFileSync(new URL('../src/ui/media-preview.js', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const deploy161Source = readFileSync(new URL('../deploy-161.sh', import.meta.url), 'utf8')

test('2D and 3D media items normalize to one stable feature resource reference', () => {
  const twoD = interactionResourceRef({ sharePublicId: 'shr_public_a', shareItemId: 'shi_a', featureId: 'feature_a', mediaId: 'media_a' })
  const threeD = interactionResourceRef({ publicId: 'shr_public_a', kmlId: 'shi_a', resourceFeatureId: 'feature_a', mediaId: 'media_b' })
  assert.deepEqual({ ...twoD, mediaId: '' }, { ...threeD, mediaId: '' })
  assert.equal(twoD.scope, 'feature')
})

test('media preview keeps interaction controls wired for comments and source details', () => {
  for (const action of ['comments', 'info']) {
    assert.match(previewSource, new RegExp(`data-media-preview-action="${action}"`))
    assert.equal(previewSource.includes(`if (action === '${action}')`), true)
  }
  assert.doesNotMatch(previewSource, /data-media-preview-action="report"/)
  assert.doesNotMatch(previewSource, /if \(action === 'report'\)/)
  assert.match(previewSource, /syncInteractionControls\(root, item\)/)
  assert.match(interactionSource, /showChoiceDialog/)
  assert.match(interactionSource, /举报此内容/)
  assert.match(interactionSource, /请先登录后再留言/)
  assert.match(interactionSource, /clientRequestId/)
})

test('interaction controls fail closed when count API fails without throwing into media preview', () => {
  assert.match(interactionSource, /catch \(error\) \{[\s\S]*?error\?\.name !== 'AbortError'[\s\S]*?badge\.hidden = true/s)
  assert.match(interactionSource, /if \(!commentsEnabled\) return/)
  assert.match(interactionSource, /const infoEnabled = Boolean\(item\?\.url/)
})

test('nested resource references keep media preview interaction actions addressable', () => {
  const nested = interactionResourceRef({
    resourceRef: { sharePublicId: 'shr_public_nested', shareItemId: 'shi_nested', featureId: 'feature_nested', mediaId: 'media_nested' },
  })
  assert.deepEqual(nested, {
    sharePublicId: 'shr_public_nested',
    shareItemId: 'shi_nested',
    featureId: 'feature_nested',
    mediaId: 'media_nested',
    scope: 'feature',
  })
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

test('161 deployment entrypoint preserves persistent data and has a bounded rollback path', () => {
  assert.match(deploy161Source, /REMOTE_HOST:-root@192\.168\.0\.161/)
  assert.match(deploy161Source, /REMOTE_APP_DIR:-\/opt\/1panel\/apps\/local\/map-service\/map-service/)
  assert.match(deploy161Source, /--exclude='data'/)
  assert.match(deploy161Source, /--rollback/)
  assert.match(deploy161Source, /docker compose build --pull/)
  assert.match(deploy161Source, /health/)
  assert.match(deploy161Source, /DEPLOY_ARCHIVE=/)
  assert.match(deploy161Source, /cleanup_deploy_archive/)
  assert.doesNotMatch(deploy161Source, /MAP_SERVICE_.*SECRET.*=/)
})
