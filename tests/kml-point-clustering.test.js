import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clusterKmlPoints,
  normalizeKmlPointClusteringConfig,
} from '../src/map/kml-point-clustering.js'

const project = latLng => ({ x: latLng.lng, y: latLng.lat })
const point = (id, x, y) => ({ id, latLng: { lat: y, lng: x }, name: id })

test('聚合算法默认关闭，只有显式开启后才合并点位', () => {
  const points = [point('a', 1, 1), point('b', 2, 2)]
  assert.deepEqual(clusterKmlPoints(points, 8, {}, project).map(item => item.type), ['point', 'point'])
  assert.equal(clusterKmlPoints(points, 8, { enabled: true }, project)[0].type, 'cluster')
})

test('同一像素网格内聚合，并计算准确中心、边界和完整成员 ID', () => {
  const result = clusterKmlPoints([
    point('b', 20, 30),
    point('a', 10, 10),
    point('c', 30, 20),
  ], 8, { enabled: true, gridSize: 64 }, project)

  assert.equal(result.length, 1)
  assert.deepEqual(result[0], {
    type: 'cluster',
    id: 'cluster:8:0:0',
    cell: { x: 0, y: 0 },
    count: 3,
    center: { lat: 20, lng: 20 },
    bounds: { south: 10, west: 10, north: 30, east: 30 },
    memberIds: ['a', 'b', 'c'],
    sampleMemberIds: ['a', 'b', 'c'],
    members: [point('a', 10, 10), point('b', 20, 30), point('c', 30, 20)],
    membersTruncated: false,
  })
})

test('跨网格点位保持为独立单点，且 gridSize 被限制在 24-128', () => {
  assert.equal(normalizeKmlPointClusteringConfig({ gridSize: 1 }).gridSize, 24)
  assert.equal(normalizeKmlPointClusteringConfig({ gridSize: 999 }).gridSize, 128)

  const result = clusterKmlPoints([
    point('left', 23, 5),
    point('right', 24, 5),
  ], 4, { enabled: true, gridSize: 1 }, project)

  assert.deepEqual(result.map(item => [item.type, item.id]), [
    ['point', 'left'],
    ['point', 'right'],
  ])
})

test('重复坐标仍保留全部成员并形成一个簇', () => {
  const result = clusterKmlPoints([
    point('one', 12, 12),
    { id: 'two', coordinates: [12, 12], name: 'two' },
  ], 6, { enabled: true }, project)

  assert.equal(result[0].count, 2)
  assert.deepEqual(result[0].memberIds, ['one', 'two'])
  assert.deepEqual(result[0].center, { lat: 12, lng: 12 })
})

test('禁用或超出 zoom 边界时全部返回单点，边界值仍启用聚合', () => {
  const points = [point('a', 1, 1), point('b', 2, 2)]
  const config = { enabled: true, minZoom: 5, maxClusterZoom: 10 }

  assert.deepEqual(clusterKmlPoints(points, 4, config, project).map(item => item.type), ['point', 'point'])
  assert.equal(clusterKmlPoints(points, 5, config, project)[0].type, 'cluster')
  assert.equal(clusterKmlPoints(points, 10, config, project)[0].type, 'cluster')
  assert.deepEqual(clusterKmlPoints(points, 11, config, project).map(item => item.type), ['point', 'point'])
  assert.deepEqual(clusterKmlPoints(points, 7, { ...config, enabled: false }, project).map(item => item.type), ['point', 'point'])
})

test('成员明细上限只限制样本，不截断完整 count 和 memberIds', () => {
  const points = Array.from({ length: 5 }, (_, index) => point(`p${index}`, index, index))
  const [cluster] = clusterKmlPoints(points, 3, {
    enabled: true,
    gridSize: 64,
    maxMembersPerCluster: 2,
  }, project)

  assert.equal(cluster.count, 5)
  assert.deepEqual(cluster.memberIds, ['p0', 'p1', 'p2', 'p3', 'p4'])
  assert.deepEqual(cluster.sampleMemberIds, ['p0', 'p1'])
  assert.equal(cluster.members.length, 2)
  assert.equal(cluster.membersTruncated, true)
})

test('输入顺序不影响簇、成员和输出顺序', () => {
  const points = [
    point('d', 80, 80),
    point('b', 10, 10),
    point('c', 70, 70),
    point('a', 20, 20),
  ]
  const forward = clusterKmlPoints(points, 9, { enabled: true, gridSize: 64 }, project)
  const reverse = clusterKmlPoints([...points].reverse(), 9, { enabled: true, gridSize: 64 }, project)

  assert.deepEqual(reverse, forward)
  assert.deepEqual(forward.map(item => item.memberIds), [['a', 'b'], ['c', 'd']])
})
