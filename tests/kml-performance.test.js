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
import { getOpenKmlPopupIdentity } from '../src/map/kml-popup-state.js'

function popupFixture (isOpen) {
  return {
    isOpen: () => isOpen,
    _source: {
      _mapServiceKmlFileId: 'kml-1',
      _mapServiceKmlFeatureId: 'feature-1',
    },
  }
}

test('closed KML popup is not restored after viewport rerender', () => {
  const map = { _popup: popupFixture(false) }
  assert.equal(getOpenKmlPopupIdentity(map), null)

  map._popup = popupFixture(true)
  assert.deepEqual(getOpenKmlPopupIdentity(map), {
    kmlId: 'kml-1',
    featureId: 'feature-1',
  })
})

test('popup identity supports lightweight map and popup mocks', () => {
  const map = {}
  const popup = {
    _map: map,
    _source: {
      _mapServiceKmlFileId: 'kml-2',
      _mapServiceKmlFeatureId: 'feature-2',
    },
  }
  map._popup = popup
  assert.deepEqual(getOpenKmlPopupIdentity(map), {
    kmlId: 'kml-2',
    featureId: 'feature-2',
  })
})

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
  const shareInitSource = source.match(/async function initShareKmlSupport \(map(?:, options = \{\})?\)[\s\S]*?\n}\n\nfunction bindKmlFeatureOrganizationEvents/)?.[0] || ''
  assert.match(shareInitSource, /\n  renderAllKmls\(map\)\n/)
  assert.ok(shareInitSource.indexOf('fitKmlFilesBounds(') < shareInitSource.indexOf('renderAllKmls(map)'))
  assert.match(shareInitSource, /if \(options\.fitShareView !== false\)/)

  const sharePanelSource = source.match(/function renderShareKmlPanel \(map\)[\s\S]*?\n}\n\nasync function initShareKmlSupport/)?.[0] || ''
  assert.match(sharePanelSource, /\$\{expanded && kmlFile\.contentLoaded !== false \? features\.map\(feature =>/)
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
  assert.ok(initSource.indexOf('bindKmlViewportRerender(map)') < initSource.indexOf('loadInitialKmlFiles()'))
  assert.doesNotMatch(source, /map\.on\('moveend zoomend', \(\) => scheduleKmlViewportRerender\(map\)\)/)
})

test('2D 个人 KML 全局聚合跨文件处理 Point 并让分享配置优先', () => {
  const source = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const globalConfig = source.match(/function getGlobalPointClusteringConfig2d \(\)[\s\S]*?\n}/)?.[0] || ''
  const personalClustering = source.match(/function renderPersonalClusterLayers \(map, config\)[\s\S]*?\n}/)?.[0] || ''
  const initSource = source.slice(source.indexOf('export async function initKmlSupport'))

  assert.match(globalConfig, /if \(getActiveShare\(\)\) return null/)
  assert.match(globalConfig, /getAuthSnapshot\(\)\.config\?\.kml\?\.pointClustering/)
  assert.match(globalConfig, /resolveGlobalKmlPointClusteringConfig/)
  assert.match(personalClustering, /kmlList\.filter/)
  assert.doesNotMatch(personalClustering, /isAccountKmlMode/)
  assert.match(personalClustering, /feature\.type !== 'Point'/)
  assert.match(personalClustering, /clusterKmlPoints/)
  assert.match(source, /if \(getGlobalPointClusteringConfig2d\(\)\?\.enabled\)/)
  assert.match(source, /map\.setView\([^)]*[\s\S]*\{ animate: true \}\)/)
  assert.match(initSource, /ensureAuthConfig/)
  assert.ok(initSource.indexOf('ensureAuthConfig') < initSource.indexOf('loadPublicKmls(map)'))
})

test('collapsed KML cards skip overview work and 3D feature filtering', () => {
  const map2d = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const map3d = readFileSync(new URL('../src/map3d/kml.js', import.meta.url), 'utf8')

  assert.equal(map2d.match(/expanded \? renderKmlFileOverview\(kmlFile\) : ''/g)?.length, 2)
  assert.match(map2d, /expanded && kmlFile\.contentLoaded !== false \? renderKmlFileOverview\(kmlFile\) : ''/)
  assert.match(map3d, /const displayFeatures = !expanded\s*\? \[\]/)
  assert.match(map3d, /\$\{expanded \? `[\s\S]*?\$\{renderKmlFileOverview\(kmlFile\)\}/)
  assert.match(map3d, /const willExpand = !expandedKmlIds\.has\(kmlId\)/)
})

test('collapsed KML sections do not build their child cards', () => {
  const map2d = readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  const map3d = readFileSync(new URL('../src/map3d/kml.js', import.meta.url), 'utf8')

  assert.match(map2d, /\$\{personalExpanded\s*\? kmlDirectories\.map\(directory =>/)
  assert.match(map2d, /\$\{directoryExpanded\s*\? directoryFiles\.map\(kmlFile =>/)
  assert.match(map2d, /function renderShareKmlPanel \(map\)[\s\S]*groups\.map\(group =>/)
  assert.match(map3d, /\$\{personalExpanded \? renderKmlDirectoryGroups\(kmlList, false\) : ''\}/)
  assert.match(map3d, /publicExpanded[\s\S]*?publicKmlList\.length[\s\S]*?renderKmlDirectoryGroups\(publicKmlList, false\)/)
  assert.match(map3d, /\$\{expanded \? `\$\{emptyMessage\}\$\{group\.files\.map\(renderKmlCard\)\.join\(''\)\}` : ''\}/)
})
