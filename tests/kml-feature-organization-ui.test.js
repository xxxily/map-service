import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('2D and 3D KML editors expose shared move, copy and drag organization flows', () => {
  const map2d = readSource('../src/map/kml.js')
  const map3d = readSource('../src/map3d/kml.js')
  const styles = readSource('../src/styles.css')

  for (const source of [map2d, map3d]) {
    assert.match(source, /import \{ transferKmlFeature \}/)
    assert.match(source, /label: '所属 KML'/)
    assert.match(source, /showChoiceDialog\(\{[\s\S]*text: '移动'[\s\S]*text: '复制'/)
    assert.match(source, /data-kml-draggable="true"/)
    assert.match(source, /data-kml-drop-target="feature"/)
    assert.match(source, /data-kml-drop-target="file"/)
    assert.match(source, /beforeFeatureId/)
    assert.match(source, /applyKmlFeatureBatch/)
    assert.match(source, /data-kml-action="toggle-batch"/)
    assert.match(source, /data-kml-action="batch-operate"/)
    assert.match(source, /data-kml-action="batch-select-all"/)
    assert.match(source, /data-kml-action="batch-invert"/)
    assert.match(source, /data-kml-action="toggle-batch-feature"/)
    assert.match(source, /if \(action === 'toggle-batch'\)/)
    assert.match(source, /if \(action === 'batch-operate'\)/)
    assert.match(source, /action === 'batch-select-all' \|\| action === 'batch-invert'/)
  }

  assert.match(map2d, /const featureOrderingAvailable = writable && !directoryBatchSelectable && !kmlBatchSelection\.isActive\(\) && \([\s\S]*!kmlFile\.isLiveTrack/)
  assert.match(map2d, /kmlFile\.id === kmlBatchFileId/)
  assert.match(map2d, /kml-file-more-actions[\s\S]*renderKmlBatchToolbar\(safeKmlId\)/)
  assert.doesNotMatch(map2d, /kml-section-actions[\s\S]{0,400}renderKmlBatchToolbar\(\)/)
  assert.match(map2d, /application\/x-map-service-kml-file/)
  assert.match(map2d, /application\/x-map-service-kml-feature/)
  assert.match(map2d, /data-kml-file-draggable="true"/)
  assert.match(map2d, /data-kml-action="move-file"/)
  assert.match(map2d, /async function moveKmlFileFromPanel/)
  assert.match(map3d, /const featureOrderingAvailable = expanded && transferable && !\(kmlBatchSelection\.isActive\(\) && kmlBatchFileId === kmlFile\.id\) && displayFeatures\.length === \(kmlFile\.features \|\| \[\]\)\.length/)
  assert.match(map3d, /application\/x-map-service-kml-file/)
  assert.match(map3d, /application\/x-map-service-kml-directory/)
  assert.match(map3d, /application\/x-map-service-kml-feature/)
  assert.match(map3d, /data-kml-file-draggable="true"/)
  assert.match(map3d, /data-kml-directory-draggable="true"/)
  assert.match(map3d, /function renderKmlDirectoryGroups/)
  assert.match(map3d, /data-kml-action="toggle-directory-visible"/)
  assert.match(map3d, /data-kml-action="move-file"/)
  assert.match(map3d, /\/kml\/directories\/reorder/)
  assert.match(map3d, /\/kml\/files\/\$\{encodeURIComponent\(source\.id\)\}\/move/)
  assert.match(styles, /\.kml-feature-drag-handle/)
  assert.match(styles, /\.kml-feature-item\.is-kml-dragging/)
  assert.match(styles, /\.kml-file-card\.is-kml-drop-target/)
  assert.match(styles, /\.kml-batch-toolbar/)
  assert.match(styles, /\.kml-feature-batch-check/)
  assert.match(styles, /\.kml-feature-item\.is-batch-selected/)
})

test('2D cross-file feature transfers load account summaries before changing either file', () => {
  const map2d = readSource('../src/map/kml.js')
  const editFlow = map2d.slice(
    map2d.indexOf('async function handleEditFeature'),
    map2d.indexOf('async function handleDeleteFeature'),
  )
  const dragFlow = map2d.slice(
    map2d.indexOf('function bindKmlFeatureOrganizationEvents'),
    map2d.indexOf('function bindKmlFileOrganizationEvents'),
  )

  assert.match(editFlow, /kmlFile\.contentLoaded === false[\s\S]*await loadAccountKmlFileForUse\(kmlFile\)[\s\S]*const feature = kmlFile\.features\.find/)
  assert.match(editFlow, /targetKmlFile\.contentLoaded === false[\s\S]*await loadAccountKmlFileForUse\(targetKmlFile\)[\s\S]*transferKmlFeature\(kmlList/)
  assert.match(dragFlow, /const filesToLoad = \[sourceKml, targetKml\][\s\S]*await loadAccountKmlFileForUse\(file\)[\s\S]*return[\s\S]*transferKmlFeature\(kmlList/)
})

test('2D and 3D personal KML metadata changes load account details before mutation or history', () => {
  const map2d = readSource('../src/map/kml.js')
  const map3d = readSource('../src/map3d/kml.js')
  const change2d = map2d.slice(map2d.indexOf("panel.addEventListener('change', async"), map2d.indexOf('// 监听键盘事件'))
  const change3d = map3d.slice(map3d.indexOf("panel.addEventListener('change', async"), map3d.indexOf('function bindCanvasPickEvents'))

  for (const [source, loader] of [
    [change2d, 'loadAccountKmlFileForUse'],
    [change3d, 'ensureAccountKmlFilesLoaded'],
  ]) {
    assert.match(source, new RegExp(`${loader}\\(kmlFile\\)[\\s\\S]*kmlFile\\.coordCorrection =`))
    assert.match(source, new RegExp(`${loader}\\(kmlFile\\)[\\s\\S]*kmlFile\\.lockDrag =`))
    assert.match(source, new RegExp(`${loader}\\(kmlFile\\)[\\s\\S]*kmlFile\\.theme = target\\.value`))
    assert.match(source, new RegExp(`${loader}\\(kmlFile\\)[\\s\\S]*kmlFile\\.color = target\\.value`))
    assert.match(source, /KML 文件详情加载失败，未修改/)
  }

  for (const property of ['coordCorrection', 'lockDrag', 'theme', 'color']) {
    const mutationIndex = change3d.indexOf(`kmlFile.${property} =`)
    const historyIndex = change3d.lastIndexOf('pushKmlHistory()', mutationIndex)
    const loadIndex = change3d.lastIndexOf('ensureAccountKmlFilesLoaded(kmlFile)', mutationIndex)
    assert.ok(loadIndex >= 0 && loadIndex < historyIndex, `${property} must load before creating history`)
  }
})

test('2D and 3D KML panels keep directory and file controls in the shared layout contract', () => {
  const map2d = readSource('../src/map/kml.js')
  const map3d = readSource('../src/map3d/kml.js')
  const styles = readSource('../src/styles.css')
  const map3dStyles = readSource('../src/map3d-styles.css')

  for (const source of [map2d, map3d]) {
    assert.match(source, /class="kml-section-header[^"]*"/)
    assert.match(source, /class="kml-section-list"/)
    assert.match(source, /class="kml-directory-group"/)
    assert.match(source, /class="kml-directory-head"/)
    assert.match(source, /class="kml-directory-files"/)
    assert.match(source, /class="kml-file-card /)
    assert.match(source, /class="kml-file-head /)
    assert.match(source, /class="kml-file-actions"/)
    assert.match(source, /data-kml-action="toggle-file-actions"/)
    assert.match(source, /class="kml-file-more-actions"/)
    assert.match(source, /aria-expanded="\$\{actionsExpanded\}"/)
    assert.match(source, /data-kml-action="create-directory"[\s\S]*?<svg class="svg-icon"/)
    assert.match(source, /class="kml-file-detail[^"]*"[\s\S]*?hidden/)
    assert.match(source, /class="kml-directory-label"[\s\S]*?title=/)
  }

  assert.match(styles, /\.kml-panel\s*\{[\s\S]*?width:\s*min\(360px,/)
  assert.match(styles, /\.kml-section-header[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/)
  assert.match(styles, /\.kml-directory-head[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/)
  assert.match(styles, /\.kml-file-head[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/)
  assert.match(styles, /\.kml-section-action-button[\s\S]*?width:\s*28px[\s\S]*?flex-basis:\s*28px/)
  assert.match(styles, /\.kml-directory-label[\s\S]*?text-overflow:\s*ellipsis/)
  assert.match(styles, /\.kml-directory-name[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/)
  assert.match(styles, /\.kml-file-name[\s\S]*?text-overflow:\s*ellipsis/)
  assert.match(styles, /\.kml-file-actions[\s\S]*?max-width:\s*64px/)
  assert.match(styles, /\.kml-file-more-actions[\s\S]*?justify-content:\s*flex-end/)
  assert.match(styles, /\.kml-file-more-actions\[hidden\][\s\S]*?display:\s*none !important/)
  assert.match(styles, /\.kml-visibility-btn\.is-visible[\s\S]*?\.kml-directory-visibility\.is-visible/)
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.kml-file-btn[\s\S]*?width:\s*30px/)
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.kml-file-head\s*\{[\s\S]*?align-items:\s*center/)
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?max-height:\s*min\(78dvh/)
  assert.doesNotMatch(map3dStyles, /\.kml-section-header\s*,|\.kml-section-list\s*\{|\.kml-empty\s*\{/)
})

test('3D editing refreshes or closes the popup without moving the camera', () => {
  const map3d = readSource('../src/map3d/kml.js')
  const editFlow = map3d.slice(
    map3d.indexOf('async function handleEditFeature'),
    map3d.indexOf('async function handleDeleteFeature'),
  )

  assert.match(editFlow, /closeFeaturePopup\(\)/)
  assert.match(editFlow, /showFeaturePopup\(kmlId, featureId/)
  assert.doesNotMatch(editFlow, /focusFeature\(/)
})

test('3D panel feature focus replaces older flights and opens content after a short arrival', () => {
  const map3d = readSource('../src/map3d/kml.js')
  const focusFlow = map3d.slice(
    map3d.indexOf('function focusFeature'),
    map3d.indexOf('function activateFeatureForMedia'),
  )

  assert.match(focusFlow, /viewerRef\.camera\.cancelFlight\?\.\(\)/)
  assert.match(focusFlow, /const focusRequestId = \+\+featureFocusRequestId/)
  assert.match(focusFlow, /duration: 0\.28/)
  assert.match(focusFlow, /complete: showFocusedFeature/)
  assert.match(focusFlow, /if \(focusRequestId !== featureFocusRequestId\) return/)
  assert.doesNotMatch(focusFlow, /duration: 0\.8/)
  assert.doesNotMatch(focusFlow, /850/)
})

test('3D point creation preserves the current camera after saving', () => {
  const map3d = readSource('../src/map3d/kml.js')
  const createFlow = map3d.slice(
    map3d.indexOf('async function createPointAtLatLng'),
    map3d.indexOf('function togglePickupMode'),
  )

  assert.match(createFlow, /renderKmlLayers\(kmlFile\)/)
  assert.match(createFlow, /updateKmlPanelUI\(\)/)
  assert.doesNotMatch(createFlow, /focusFeature\(/)
  assert.doesNotMatch(createFlow, /flyTo/)
})
