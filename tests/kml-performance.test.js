import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  expandKmlViewportBounds,
  getKmlFeatureFocusPlan,
  getKmlLeafletPerformanceOptions,
  KML_VIEWPORT_BUFFER_RATIO,
  shouldVirtualizeKmlPoints,
} from '../src/map/kml-performance.js'

test('KML feature focus opens visible points immediately and never queues a long flight', () => {
  assert.deepEqual(getKmlFeatureFocusPlan({
    type: 'Point',
    currentZoom: 16,
    targetInView: true,
  }), {
    method: 'open',
    animate: false,
    zoom: 16,
  })
  assert.deepEqual(getKmlFeatureFocusPlan({
    type: 'Point',
    currentZoom: 12,
    targetInView: false,
  }), {
    method: 'set-view',
    animate: false,
    zoom: 15,
  })
  assert.equal(getKmlFeatureFocusPlan({ type: 'LineString', targetInView: false }).method, 'fit-bounds')
})

test('2D map performance options preserve transitions and a usable wheel zoom step', () => {
  const options = getKmlLeafletPerformanceOptions()
  assert.equal(options.preferCanvas, true)
  assert.equal(options.zoomAnimation, true)
  assert.equal(options.fadeAnimation, true)
  assert.equal(options.markerZoomAnimation, true)
  assert.equal(options.wheelDebounceTime, 8)
  assert.equal(options.zoomSnap, 0.5)
  assert.equal(options.zoomDelta, 0.5)
})

test('ordinary KML point virtualization uses a bounded two-view buffer', () => {
  assert.equal(shouldVirtualizeKmlPoints(79), false)
  assert.equal(shouldVirtualizeKmlPoints(80), true)
  assert.equal(KML_VIEWPORT_BUFFER_RATIO, 2)
  assert.deepEqual(expandKmlViewportBounds({
    south: 10,
    west: 20,
    north: 12,
    east: 24,
  }), {
    south: 9,
    west: 18,
    north: 13,
    east: 26,
  })
})

test('2D KML popup content is lazy and feature focus has no fixed 850ms wait', () => {
  const source = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  assert.match(source, /layer\.bindPopup\(\(\) => renderKmlFeaturePopupContent/)
  const focusSource = source.match(/function focusFeature \([\s\S]*?\n}\n\nfunction activateFeatureForMedia/)?.[0] || ''
  assert.match(focusSource, /map\.stop\?\.\(\)/)
  assert.match(focusSource, /getKmlFeatureFocusPlan/)
  assert.doesNotMatch(focusSource, /setTimeout|duration:\s*0\.8|850/)
})

test('share mode fits before one layer render and collapsed files do not mount hidden feature rows', () => {
  const source = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const shareInitSource = source.match(/async function initShareKmlSupport \(map\)[\s\S]*?\n}\n\nfunction bindKmlFeatureOrganizationEvents/)?.[0] || ''
  assert.equal(shareInitSource.match(/renderAllKmls\(map\)/g)?.length, 1)
  assert.ok(shareInitSource.indexOf('fitKmlFilesBounds(') < shareInitSource.indexOf('renderAllKmls(map)'))

  const sharePanelSource = source.match(/function renderShareKmlPanel \(map\)[\s\S]*?\n}\n\nasync function initShareKmlSupport/)?.[0] || ''
  assert.match(sharePanelSource, /\$\{expanded \? features\.map\(feature =>/)
  assert.doesNotMatch(sharePanelSource, /\$\{features\.map\(feature =>/)
})

test('new files and imports keep only the active KML expanded', () => {
  const source = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  assert.match(source, /function expandKmlFileExclusively \(kmlId\)/)
  assert.match(source, /expandKmlFileExclusively\(kmlFile\.id\)/)
  assert.match(source, /expandKmlFileExclusively\(importedKml\.id\)/)
  assert.match(source, /expandKmlFileExclusively\(newKml\.id\)/)
})

test('2D point creation preserves the current map center and zoom after saving', () => {
  const source = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const createFlow = source.slice(
    source.indexOf('async function createPointAtLatLng'),
    source.indexOf('function togglePickupMode'),
  )

  assert.match(createFlow, /renderFeature\(map, kmlFile, newFeat\)/)
  assert.match(createFlow, /updateKmlPanelUI\(map\)/)
  assert.doesNotMatch(createFlow, /focusFeature\(/)
  assert.doesNotMatch(createFlow, /fitBounds|setView|panInside|panTo|flyTo/)
})

test('KML feature rows skip offscreen layout and paint work', () => {
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const featureRule = styles.match(/\.kml-feature-item\s*\{[\s\S]*?\n}/)?.[0] || ''
  assert.match(featureRule, /content-visibility:\s*auto/)
  assert.match(featureRule, /contain-intrinsic-size:\s*36px/)
})

test('KML point labels are deduplicated and every visible label is mounted in idle batches', () => {
  const source = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  assert.match(source, /const KML_POINT_LABEL_MIN_ZOOM = 14/)
  assert.match(source, /const KML_POINT_LABEL_BATCH_SIZE = 40/)
  assert.match(source, /visibleLabelKeys = new Set\(\)/)
  assert.match(source, /const layers = Array\.from\(featureLayers\.values\(\)\)/)
  assert.match(source, /nextIndex < layers\.length/)
  assert.match(source, /processed < KML_POINT_LABEL_BATCH_SIZE/)
  assert.match(source, /scheduleKmlPointLabelIdleTask/)
  assert.match(source, /window\.requestIdleCallback/)
  assert.match(source, /cancelKmlPointLabelSync\(\)/)
  assert.doesNotMatch(source, /KML_POINT_LABEL_LIMIT|visibleLabelCount\s*</)
})

test('2D KML viewport work is lifecycle-bound and cancelled when the map unloads', () => {
  const source = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const bindingSource = source.match(/function bindKmlViewportRerender \(map\)[\s\S]*?\n}/)?.[0] || ''

  assert.match(bindingSource, /map\.on\('moveend zoomend', rerender\)/)
  assert.match(bindingSource, /map\.off\('moveend zoomend', rerender\)/)
  assert.match(bindingSource, /map\.on\('unload', unbind\)/)
  assert.match(bindingSource, /cancelKmlScheduledTasks\(\)/)
  assert.equal(source.match(/bindKmlViewportRerender\(map\)/g)?.length, 1)
  const initSource = source.slice(source.indexOf('export async function initKmlSupport'))
  assert.ok(initSource.indexOf('bindKmlViewportRerender(map)') < initSource.indexOf('if (getActiveShare())'))
  assert.ok(initSource.indexOf('bindKmlViewportRerender(map)') < initSource.indexOf('await loadInitialKmlFiles()'))
  assert.doesNotMatch(source, /map\.on\('moveend zoomend', \(\) => scheduleKmlViewportRerender\(map\)\)/)
})

test('collapsed KML cards skip overview work and 3D feature filtering', () => {
  const map2d = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const map3d = readFileSync(new URL('../src/map3d/kml.js', import.meta.url), 'utf8')

  assert.equal(map2d.match(/expanded \? renderKmlFileOverview\(kmlFile\) : ''/g)?.length, 3)
  assert.match(map3d, /const displayFeatures = !expanded\s*\? \[\]/)
  assert.match(map3d, /\$\{expanded \? `[\s\S]*?\$\{renderKmlFileOverview\(kmlFile\)\}/)
  assert.match(map3d, /const willExpand = !expandedKmlIds\.has\(kmlId\)/)
})

test('collapsed KML sections do not build their child cards', () => {
  const map2d = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const map3d = readFileSync(new URL('../src/map3d/kml.js', import.meta.url), 'utf8')

  assert.match(map2d, /\$\{personalExpanded\s*\? \(kmlList\.map\(kmlFile =>/)
  assert.match(map2d, /\$\{publicExpanded\s*\? \(publicKmlList\.map\(kmlFile =>/)
  assert.match(map3d, /\$\{personalExpanded \? \(kmlList\.map\(renderKmlCard\)/)
  assert.match(map3d, /\$\{publicExpanded \? \(publicKmlList\.map\(renderKmlCard\)/)
})
