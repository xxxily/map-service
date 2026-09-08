import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')

test('2D panel focus registers the request before lazy detail loading and ignores stale completions', () => {
  const helper = source.match(/async function focusKmlFeatureFromPanel[\s\S]*?\n}\n\nfunction activateFeatureForMedia/)?.[0] || ''
  assert.match(helper, /const requestId = beginKmlFeatureFocus\(map, kmlId, featureId\)/)
  assert.ok(helper.indexOf('beginKmlFeatureFocus') < helper.indexOf('await loadDetails()'))
  assert.match(helper, /if \(!isCurrentKmlFeatureFocus\(map, identity, requestId\)\) return false/)
  assert.match(helper, /focusFeature\(map, identity\.kmlId, identity\.featureId, \{ requestId \}\)/)
  assert.match(helper, /cancelKmlFeatureFocus\(map, requestId\)/)
})

test('2D share and personal KML panels route feature clicks through the latest-wins helper', () => {
  const shareHandler = source.match(/async function initShareKmlSupport[\s\S]*?panel\.addEventListener\('click', async event =>[\s\S]*?\n  \}\)\n}/)?.[0] || ''
  const personalHandler = source.match(/panel\.addEventListener\('click', async \(event\) => \{[\s\S]*?\n  \}\)\n}/)?.[0] || ''

  assert.match(shareHandler, /action === 'focus-feature'/)
  assert.match(shareHandler, /await focusKmlFeatureFromPanel\(/)
  assert.doesNotMatch(shareHandler, /focusFeature\(map, kmlFile\.id, target\.dataset\.featureId\)/)

  assert.match(personalHandler, /if \(action === 'focus-feature'\)/)
  assert.match(personalHandler, /await focusKmlFeatureFromPanel\(/)
  assert.doesNotMatch(personalHandler, /focusFeature\(map, kmlId, featureId\)/)
})

test('2D focus invalidates old popup restoration and does not pan an already visible point', () => {
  const restore = source.match(/function restoreKmlPopup[\s\S]*?\n}\n\nfunction resolveTargetKmlId/)?.[0] || ''
  const focus = source.match(/function focusFeature[\s\S]*?\n}\n\nasync function focusKmlFeatureFromPanel/)?.[0] || ''

  assert.match(restore, /const expectedRequestId = kmlFeatureFocusRequestId/)
  assert.match(restore, /expectedRequestId !== kmlFeatureFocusRequestId/)
  assert.match(restore, /!sameKmlFeatureIdentity\(focusState\.identity, normalizedIdentity\)/)
  assert.match(focus, /if \(plan\.method === 'set-view'\)/)
  assert.match(focus, /else if \(plan\.method === 'pan-inside'\)/)
  assert.doesNotMatch(focus, /else map\.panInside/)
})

test('2D focus waits for Leaflet fade removal before opening the latest popup', () => {
  const begin = source.match(/function beginKmlFeatureFocus[\s\S]*?\n}\n\nfunction cancelKmlFeatureFocus/)?.[0] || ''
  const focus = source.match(/async function focusFeature[\s\S]*?\n}\n\nasync function focusKmlFeatureFromPanel/)?.[0] || ''

  assert.match(source, /KML_POPUP_FADE_FALLBACK_MS/)
  assert.match(begin, /queueKmlPopupTransition\(map\)/)
  assert.ok(begin.indexOf('queueKmlPopupTransition(map)') < begin.indexOf('map\?\.closePopup\?\.\(\)'))
  assert.match(focus, /await waitForKmlPopupTransition\(map\)/)
  assert.match(focus, /if \(!isCurrentKmlFeatureFocus\(map, identity, requestId\)\) return false/)
  assert.doesNotMatch(source, /forceCloseKmlPopups/)
})

test('2D viewport refresh stays behind a fading KML popup', () => {
  const defer = source.match(/function shouldDeferKmlViewportRender[\s\S]*?\n}\n\nfunction flushDeferredKmlViewportRender/)?.[0] || ''
  const flush = source.match(/function flushDeferredKmlViewportRender[\s\S]*?\n}\n\nfunction cancelKmlScheduledTasks/)?.[0] || ''

  assert.match(defer, /getKmlPopupTransitionState\(map\)/)
  assert.match(flush, /waitForKmlPopupTransition\(map\)/)
})

test('2D manual KML popup close invalidates pending popup restoration', () => {
  const restore = source.match(/function restoreKmlPopup[\s\S]*?\n}\n\nfunction resolveTargetKmlId/)?.[0] || ''
  const popupActions = source.match(/function bindKmlPopupActions[\s\S]*?\n}\n\nfunction renderShareKmlPanel/)?.[0] || ''

  assert.match(restore, /const expectedPopupCloseGeneration = getKmlPopupCloseGeneration\(map\)/)
  assert.match(restore, /expectedPopupCloseGeneration !== getKmlPopupCloseGeneration\(map\)/)
  assert.match(popupActions, /if \(!isKmlPopupInstance\(event\?\.popup\)\) return/)
  assert.match(popupActions, /noteKmlPopupClosed\(map\)/)
})

test('2D KML focus and popup restoration stop when the map unloads', () => {
  const restore = source.match(/function restoreKmlPopup[\s\S]*?\n}\n\nfunction resolveTargetKmlId/)?.[0] || ''
  const focus = source.match(/async function focusFeature[\s\S]*?\n}\n\nasync function focusKmlFeatureFromPanel/)?.[0] || ''
  const binding = source.match(/function bindKmlViewportRerender[\s\S]*?\n}\n\nfunction scheduleKmlPointLabelSync/)?.[0] || ''

  assert.match(restore, /isKmlMapUnloading\(map\)/)
  assert.match(focus, /if \(isKmlMapUnloading\(map\)\) return false/)
  assert.match(binding, /markKmlMapUnloading\(map\)/)
  assert.match(binding, /cancelKmlFeatureFocus\(map\)/)
})
