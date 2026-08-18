import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('2D share view keeps the full read-only KML browsing lifecycle', () => {
  const source = readSource('../src/map/kml.js')
  const contentPanelSource = readSource('../src/map/kml-content-panel.js')
  const mainSource = readSource('../src/main.js')
  const styles = readSource('../src/styles.css')
  const initSource = source.slice(source.indexOf('export async function initKmlSupport'))

  assert.match(source, /function renderShareKmlPanel \(map\)[\s\S]*class="kml-features-list"/)
  assert.match(source, /data-share-kml-action="focus-layer"/)
  assert.match(source, /data-share-kml-action="focus-feature"/)
  assert.match(source, /getKmlMediaListIcon\(feature\)/)
  assert.match(source, /fitKmlFilesBounds\([\s\S]*publicKmlList\.filter\(kmlFile => isKmlEnabled\(kmlFile\)/)
  assert.ok(initSource.indexOf('bindKmlPopupActions(map)') < initSource.indexOf('if (getActiveShare())'))
  assert.match(contentPanelSource, /kmlFile\?\.isPublic && !kmlFile\?\.isShare/)
  assert.match(mainSource, /if \(!shareMode\) addTargetMarker\(map, defaultView\.center\)/)
  assert.match(source, /getFeatureLayerKey\(kmlId, featureId\)/)
  assert.match(source, /const features = getTrackDisplayFeatures\(kmlFile, viewportOptions\)/)
  assert.match(source, /includeFeatureIds: \[String\(featureId\)\]/)
  assert.doesNotMatch(source, /showShareBanner/)
  assert.doesNotMatch(styles, /kml-share-banner/)
})

test('3D share view exposes full features and automatically fits enabled content', () => {
  const source = readSource('../src/map3d/kml.js')

  assert.match(source, /const displayFeatures = !expanded[\s\S]*?: kmlFile\.isShare\s*\? \(kmlFile\.features \|\| \[\]\)/)
  assert.match(source, /const styleEditable = \(kmlFile\.isPublic && !kmlFile\.isShare\) \|\| editable/)
  assert.match(source, /async function fitShareKmlView \(\)/)
  assert.match(source, /await fitShareKmlView\(\)/)
  assert.match(source, /renderFeatureItem\(kmlFile, feature, editable\)/)
  assert.match(source, /getFeatureEntityKey\(kmlId, featureId\)/)
  assert.doesNotMatch(source, /showShareBanner3d/)
})
