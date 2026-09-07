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
  assert.match(restore, /if \(expectedRequestId !== kmlFeatureFocusRequestId\) return/)
  assert.match(restore, /!sameKmlFeatureIdentity\(focusState\.identity, normalizedIdentity\)/)
  assert.match(focus, /if \(plan\.method === 'set-view'\)/)
  assert.match(focus, /else if \(plan\.method === 'pan-inside'\)/)
  assert.doesNotMatch(focus, /else map\.panInside/) 
})
