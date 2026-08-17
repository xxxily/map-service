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

  assert.match(map2d, /featureOrderingAvailable = writable && displayFeatures\.length === kmlFile\.features\.length/)
  assert.match(map3d, /const featureOrderingAvailable = transferable && displayFeatures\.length === \(kmlFile\.features \|\| \[\]\)\.length/)
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
