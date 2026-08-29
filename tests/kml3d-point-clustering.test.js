import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { clusterKmlPoints } from '../src/map/kml-point-clustering.js'
import {
  getKmlVisibilityRenderMode3d,
  getShareFitEntities3d,
  projectKmlPoint3d,
} from '../src/map3d/kml.js'

test('3D Web Mercator 投影在同一缩放级别可稳定用于聚合', () => {
  const a = projectKmlPoint3d({ lat: 22.27, lng: 111.28 }, 10)
  const b = projectKmlPoint3d({ lat: 22.27, lng: 111.28 }, 10)
  assert.deepEqual(a, b)
  assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y))
})

test('3D 分享聚合仅合并 Point，且放大到最大聚合级别后展开', () => {
  const points = [
    { id: 'a', latLng: { lat: 22.27, lng: 111.28 }, type: 'Point' },
    { id: 'b', latLng: { lat: 22.27001, lng: 111.28001 }, type: 'Point' },
  ]
  const config = { enabled: true, minZoom: 0, maxClusterZoom: 16, gridSize: 64, minClusterPoints: 2 }
  const clustered = clusterKmlPoints(points, 10, config, projectKmlPoint3d)
  assert.equal(clustered.length, 1)
  assert.equal(clustered[0].type, 'cluster')
  assert.equal(clustered[0].count, 2)
  const expanded = clusterKmlPoints(points, 17, config, projectKmlPoint3d)
  assert.deepEqual(expanded.map(item => item.type), ['point', 'point'])
})

test('3D 分享和个人全局聚合保留非 Point 要素，并接入 moveEnd 重渲染', () => {
  const source = fs.readFileSync(new URL('../src/map3d/kml.js', import.meta.url), 'utf8')
  assert.match(source, /renderShareClusterLayers3d/)
  assert.match(source, /renderPersonalClusterLayers3d/)
  assert.match(source, /getAuthSnapshot\(\)\.config\?\.kml\?\.pointClustering/)
  assert.match(source, /feature\.type !== 'Point'/)
  assert.match(source, /hasShareClustering/)
  assert.match(source, /hasPersonalClustering/)
  assert.match(source, /camera\.moveEnd\.addEventListener\(scheduleKmlViewportRerender3d\)/)
  assert.match(source, /_map3dKmlCluster/)
})

test('3D 分享显隐在聚合开启时选择一次全量重绘', () => {
  assert.equal(getKmlVisibilityRenderMode3d({ activeShare: true, clusteringEnabled: true }), 'all')
  assert.equal(getKmlVisibilityRenderMode3d({ activeShare: true, clusteringEnabled: false }), 'files')
  assert.equal(getKmlVisibilityRenderMode3d({ activeShare: false, clusteringEnabled: true }), 'files')
  assert.equal(getKmlVisibilityRenderMode3d({ activeShare: false, globalClusteringEnabled: true }), 'all')
  assert.equal(getKmlVisibilityRenderMode3d({
    activeShare: true,
    clusteringEnabled: false,
    globalClusteringEnabled: true,
  }), 'files')
})

test('3D 分享首屏定位包含聚合实体', () => {
  const fileEntity = { id: 'file-entity' }
  const clusterEntity = { id: 'cluster-entity' }
  const rendered = new Map([
    ['visible', new Set([fileEntity])],
    ['hidden', new Set([{ id: 'hidden-entity' }])],
    ['__share-clusters__', new Set([clusterEntity])],
  ])
  const entities = getShareFitEntities3d([
    { id: 'visible', enabled: true },
    { id: 'hidden', enabled: false },
  ], rendered)
  assert.deepEqual(entities, [fileEntity, clusterEntity])
})
