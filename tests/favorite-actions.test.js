import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  buildFavoriteAccountUrl,
  buildFavoritePayload,
  createKmlFavoriteCandidate,
  isFavoriteSessionUsable,
  normalizeFavoriteCandidate,
  parseFavoriteTags,
  renderFavoriteActionButton,
} from '../src/map/favorite-actions.js'
import { wgs84ToGcj02 } from '../src/map/coord-transform.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('GCJ-02 收藏候选统一反算为 WGS84，WGS84 定位结果保持原值', () => {
  const wgs84 = [116.397389, 39.908722]
  const gcj02 = wgs84ToGcj02(wgs84)
  const searchCandidate = normalizeFavoriteCandidate({
    name: '搜索点',
    longitude: gcj02[0],
    latitude: gcj02[1],
    coordType: 'gcj02',
    sourceType: 'search',
  })
  assert.ok(Math.abs(searchCandidate.longitude - wgs84[0]) < 1e-6)
  assert.ok(Math.abs(searchCandidate.latitude - wgs84[1]) < 1e-6)
  assert.equal(searchCandidate.coordType, 'wgs84')
  const normalizedAgain = normalizeFavoriteCandidate(searchCandidate)
  assert.equal(normalizedAgain.longitude, searchCandidate.longitude)
  assert.equal(normalizedAgain.latitude, searchCandidate.latitude)

  const locationCandidate = normalizeFavoriteCandidate({
    longitude: wgs84[0],
    latitude: wgs84[1],
    coordType: 'wgs84',
    sourceType: 'location',
  })
  assert.equal(locationCandidate.longitude, wgs84[0])
  assert.equal(locationCandidate.latitude, wgs84[1])
})

test('KML 点位按图层纠偏语义生成 WGS84 收藏候选且分享文件只读', () => {
  const wgs84Feature = {
    id: 'point-1',
    type: 'Point',
    name: '集合点',
    coordinates: [113.2644, 23.1291],
  }
  const standardCandidate = createKmlFavoriteCandidate({
    id: 'kml_owned123',
    coordCorrection: 'wgs84-to-gcj02',
    color: '#0f766e',
  }, wgs84Feature)
  assert.equal(standardCandidate.longitude, 113.2644)
  assert.equal(standardCandidate.latitude, 23.1291)
  assert.equal(standardCandidate.sourceRef, 'kml_owned123')

  const gcj02 = wgs84ToGcj02(wgs84Feature.coordinates)
  const directMapCandidate = createKmlFavoriteCandidate({
    id: 'local-kml',
    coordCorrection: 'none',
  }, { ...wgs84Feature, coordinates: gcj02 })
  assert.ok(Math.abs(directMapCandidate.longitude - wgs84Feature.coordinates[0]) < 1e-6)
  assert.ok(Math.abs(directMapCandidate.latitude - wgs84Feature.coordinates[1]) < 1e-6)
  assert.equal(directMapCandidate.sourceRef, '')
  assert.equal(createKmlFavoriteCandidate({ isShare: true }, wgs84Feature), null)
  assert.equal(createKmlFavoriteCandidate({}, { type: 'LineString', coordinates: [] }), null)
})

test('KML 点位收藏按钮只显示图标并保留无障碍名称', () => {
  const button = renderFavoriteActionButton({
    id: 'kml_owned123',
    coordCorrection: 'wgs84-to-gcj02',
  }, {
    id: 'point-1',
    type: 'Point',
    name: '集合点',
    coordinates: [113.2644, 23.1291],
  })

  assert.match(button, /class="favorite-inline-button"/)
  assert.match(button, /aria-label="保存为位置收藏"/)
  assert.match(button, /<svg[^>]+aria-hidden="true"/)
  assert.doesNotMatch(button, />保存收藏</)
  assert.doesNotMatch(button, /<span>/)
})

test('收藏表单规范化标签并生成后端约定字段', () => {
  assert.deepEqual(parseFavoriteTags('集合, 停车，集合\n夜间'), ['集合', '停车', '夜间'])
  const payload = buildFavoritePayload({
    name: '搜索结果',
    longitude: 113.2644,
    latitude: 23.1291,
    coordType: 'wgs84',
    sourceType: 'search',
    address: '广州市越秀区',
  }, {
    name: '集合点',
    note: '停车场东门',
    category: '出行',
    tags: '集合, 停车',
    color: '#2563EB',
  })
  assert.deepEqual(payload, {
    name: '集合点',
    note: '停车场东门',
    longitude: 113.2644,
    latitude: 23.1291,
    sourceType: 'search',
    sourceRef: '',
    address: '广州市越秀区',
    category: '出行',
    tags: ['集合', '停车'],
    color: '#2563eb',
  })
  assert.throws(() => buildFavoritePayload(payload, { name: '', color: '#2563eb' }), /收藏名称/)
  assert.throws(() => parseFavoriteTags(Array.from({ length: 21 }, (_, index) => `标签${index}`)), /20/)
})

test('账号回跳只使用站内路径，会话必须保持同一有效登录和权限', () => {
  assert.equal(
    buildFavoriteAccountUrl({ pathname: '/3d', search: '?coords=1,2,3,0', hash: '#point' }),
    '/account?returnTo=%2F3d%3Fcoords%3D1%2C2%2C3%2C0%23point',
  )
  assert.equal(buildFavoriteAccountUrl({ pathname: '//evil.example/path' }), '/account?returnTo=%2F')

  const auth = {
    authenticated: true,
    user: { permissions: ['favorite.own.manage'] },
    session: { id: 'ses_1', expiresAt: '2030-01-01T00:00:00.000Z' },
  }
  assert.equal(isFavoriteSessionUsable(auth, 'ses_1', Date.parse('2029-01-01')), true)
  assert.equal(isFavoriteSessionUsable(auth, 'ses_2', Date.parse('2029-01-01')), false)
  assert.equal(isFavoriteSessionUsable(auth, 'ses_1', Date.parse('2031-01-01')), false)
  assert.equal(isFavoriteSessionUsable({ ...auth, user: { permissions: [] } }, 'ses_1'), false)
})

test('2D/3D 静态入口和四类位置来源均接入统一收藏动作', () => {
  const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8')
  const map3dHtml = fs.readFileSync(path.join(projectRoot, '3d.html'), 'utf8')
  const mainSource = fs.readFileSync(path.join(projectRoot, 'src/main.js'), 'utf8')
  const map3dSource = fs.readFileSync(path.join(projectRoot, 'src/3d.js'), 'utf8')
  const search2d = fs.readFileSync(path.join(projectRoot, 'src/map/search.js'), 'utf8')
  const search3d = fs.readFileSync(path.join(projectRoot, 'src/map3d/search.js'), 'utf8')
  const location2d = fs.readFileSync(path.join(projectRoot, 'src/map/location.js'), 'utf8')
  const location3d = fs.readFileSync(path.join(projectRoot, 'src/map3d/location.js'), 'utf8')
  const kmlPanel = fs.readFileSync(path.join(projectRoot, 'src/map/kml-content-panel.js'), 'utf8')

  assert.match(indexHtml, /data-action="saveFavorite"/)
  assert.match(map3dHtml, /data-action="saveFavorite"/)
  assert.match(mainSource, /initFavoriteActions\([\s\S]*coordType: 'gcj02'/)
  assert.match(map3dSource, /getMap3dCenterFavoriteCandidate/)
  for (const source of [search2d, search3d]) {
    assert.match(source, /setFavoriteCandidate/)
    assert.match(source, /sourceType: 'search'/)
  }
  for (const source of [location2d, location3d]) {
    assert.match(source, /setFavoriteCandidate/)
    assert.match(source, /sourceType: 'location'/)
  }
  assert.match(kmlPanel, /renderFavoriteActionButton/)
  assert.match(kmlPanel, /bindFavoriteActionButtons/)
})
