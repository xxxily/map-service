import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  createKmlLineEditorState,
  lineEditorPointsToLatLngs,
} from '../src/map/kml-line-editor-state.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('KML 线段编辑状态支持连续加点、拖拽、删除和撤销重做', () => {
  const state = createKmlLineEditorState()
  assert.equal(state.addPoint({ id: 'a', lat: 23.1, lng: 113.2 }), true)
  assert.equal(state.addPoint({ id: 'b', lat: 23.2, lng: 113.3 }), true)
  assert.deepEqual(lineEditorPointsToLatLngs(state.getPoints()), [[23.1, 113.2], [23.2, 113.3]])
  assert.equal(state.getSelectedId(), 'b')

  state.pushHistory()
  assert.equal(state.movePoint('b', 23.25, 113.35, { history: false }), true)
  assert.deepEqual(state.getPoints()[1], { id: 'b', lat: 23.25, lng: 113.35 })
  assert.equal(state.deletePoint('a'), true)
  assert.deepEqual(state.getPoints().map(point => point.id), ['b'])

  assert.equal(state.undo(), true)
  assert.deepEqual(state.getPoints().map(point => point.id), ['a', 'b'])
  assert.equal(state.undo(), true)
  assert.deepEqual(state.getPoints()[1], { id: 'b', lat: 23.2, lng: 113.3 })
  assert.equal(state.redo(), true)
  assert.deepEqual(state.getPoints()[1], { id: 'b', lat: 23.25, lng: 113.35 })
})

test('KML 线段编辑状态可清除全部点位并恢复，非法坐标不会写入', () => {
  const state = createKmlLineEditorState([{ id: 'seed', lat: 1, lng: 2 }])
  assert.equal(state.addPoint({ lat: 'bad', lng: 2 }), false)
  assert.equal(state.size, 1)
  assert.equal(state.clear(), true)
  assert.equal(state.size, 0)
  assert.equal(state.undo(), true)
  assert.deepEqual(state.getPoints(), [{ id: 'seed', lat: 1, lng: 2 }])
})

test('KML 线段编辑器保留地图拖拽缩放并提供完整工具栏动作', () => {
  const editorSource = fs.readFileSync(path.join(projectRoot, 'src/map/kml-line-editor.js'), 'utf8')
  const kmlSource = fs.readFileSync(path.join(projectRoot, 'src/map/kml.js'), 'utf8')
  const indexSource = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8')
  assert.match(editorSource, /map\.on\('click', onMapClick\)/)
  assert.match(editorSource, /draggable: true/)
  assert.match(editorSource, /bubblingMouseEvents: false/)
  assert.match(editorSource, /leaflet-interactive/)
  assert.match(editorSource, /data-kml-line-action="merge"/)
  assert.match(editorSource, /const committed = await options\.onCommit\?\./)
  assert.match(editorSource, /if \(committed === false\)/)
  assert.match(editorSource, /options\.initialPoints/)
  assert.doesNotMatch(editorSource, /map\.dragging\.disable\(/)
  assert.match(kmlSource, /data-kml-action="add-line"/)
  assert.match(kmlSource, /data-kml-action="edit-feature"/)
  assert.match(kmlSource, /startKmlLineEditor\(map, kmlId, \{ featureId/)
  assert.match(kmlSource, /const currentLayer = featureLayers\.get\(getFeatureLayerKey\(kmlId, featureId\)\)/)
  assert.match(kmlSource, /type: 'LineString'/)
  assert.match(kmlSource, /mapLatLngToStoredCoordinate\(kmlFile, point\)/)
  assert.match(kmlSource, /showEditDialog\(\{[\s\S]*线段名称[\s\S]*description/)
  assert.match(kmlSource, /name: String\(draftFeature\.name \|\| ''\)\.trim\(\) \|\| '新建线段'/)
  assert.match(kmlSource, /savedFeature\.description = String\(enriched\.description \|\| ''\)\.trim\(\)/)
  assert.match(indexSource, /id="kml-line-editor-toolbar"/)
  assert.match(indexSource, /data-kml-line-action="merge"[\s\S]*?<span class="btn-text">保存<\/span>/)
  for (const action of ['undo', 'redo', 'delete', 'clear', 'merge', 'cancel']) {
    assert.match(indexSource, new RegExp(`data-kml-line-action="${action}"`))
  }
})
