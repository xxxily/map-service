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
  }

  assert.match(map2d, /const featureOrderingAvailable = writable && \([\s\S]*!kmlFile\.isLiveTrack/)
  assert.match(map3d, /const featureOrderingAvailable = expanded && transferable && displayFeatures\.length === \(kmlFile\.features \|\| \[\]\)\.length/)
  assert.match(styles, /\.kml-feature-drag-handle/)
  assert.match(styles, /\.kml-feature-item\.is-kml-dragging/)
  assert.match(styles, /\.kml-file-card\.is-kml-drop-target/)
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
