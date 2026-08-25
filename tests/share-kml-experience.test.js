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
  assert.match(source, /groupsById = new Map\(\)/)
  assert.match(source, /data-share-kml-action="toggle-directory-visible"/)
  assert.match(source, /publicKmlList\.filter\(file => String\(file\.directoryId \|\| ''\) === directoryId\)/)
  assert.match(source, /if \(sharePointClusteringConfig\?\.enabled\) renderAllKmls\(map\)/)
  assert.match(source, /getKmlMediaListIcon\(feature\)/)
  assert.match(source, /fitKmlFilesBounds\([\s\S]*publicKmlList\.filter\(kmlFile => isKmlEnabled\(kmlFile\)/)
  assert.ok(initSource.indexOf('bindKmlPopupActions(map)') < initSource.indexOf('if (getActiveShare())'))
  assert.match(contentPanelSource, /kmlFile\?\.isPublic && !kmlFile\?\.isShare/)
  assert.match(mainSource, /if \(!shareMode\) addTargetMarker\(map, defaultView\.center\)/)
  assert.match(mainSource, /initKmlSupport\(map, \{ fitShareView: !useUrlView \}\)/)
  assert.match(source, /if \(options\.fitShareView !== false\)/)
  assert.match(source, /getFeatureLayerKey\(kmlId, featureId\)/)
  assert.match(source, /const features = getTrackDisplayFeatures\(kmlFile, viewportOptions\)/)
  assert.match(source, /includeFeatureIds: \[String\(featureId\)\]/)
  assert.doesNotMatch(source, /showShareBanner/)
  assert.doesNotMatch(styles, /kml-share-banner/)
})

test('share clustering redraw clears feature references and keeps exact counts', () => {
  const source = readSource('../src/map/kml.js')
  const cleanup = source.match(/function removeShareClusterLayers \(map\)[\s\S]*?\n}/)?.[0] || ''

  assert.match(cleanup, /shareClusterLayerGroup\.eachLayer/)
  assert.match(cleanup, /featureLayers\.delete\(getFeatureLayerKey\(kmlId, featureId\)\)/)
  assert.match(source, /layer\._mapServiceKmlFileId = String\(kmlId \|\| ''\)/)
  assert.match(source, /Number\(count\)\.toLocaleString\('zh-CN'\)/)
  assert.doesNotMatch(source, /9999\+/)
})

test('3D share view exposes full features and automatically fits enabled content', () => {
  const source = readSource('../src/map3d/kml.js')
  const mainSource = readSource('../src/3d.js')

  assert.match(source, /const displayFeatures = !expanded[\s\S]*?: kmlFile\.isShare\s*\? \(kmlFile\.features \|\| \[\]\)/)
  assert.match(source, /const styleEditable = \(kmlFile\.isPublic && !kmlFile\.isShare\) \|\| editable/)
  assert.match(source, /async function fitShareKmlView \(\)/)
  assert.match(mainSource, /initKmlSupport3d\(viewer, \{ fitShareView: !urlState\.hasExplicitViewState \}\)/)
  assert.match(source, /if \(options\.fitShareView !== false\) await fitShareKmlView\(\)/)
  assert.match(source, /await fitShareKmlView\(\)/)
  assert.match(source, /renderFeatureItem\(kmlFile, feature, editable\)/)
  assert.match(source, /getFeatureEntityKey\(kmlId, featureId\)/)
  assert.match(source, /renderKmlDirectoryGroups\(publicKmlList, true\)/)
  assert.match(source, /data-kml-action="toggle-directory-visible"/)
  assert.match(source, /const files = \(getActiveShare\(\) \? publicKmlList : kmlList\)\.filter/)
  assert.doesNotMatch(source, /showShareBanner3d/)
})
