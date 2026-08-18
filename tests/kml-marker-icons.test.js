import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  KML_MARKER_ICON_KEYS,
  KML_MARKER_ICON_OPTIONS,
  normalizeKmlMarkerIcon,
  renderKmlMarkerIconGlyph,
} from '../shared/kml-marker-icons.js'
import {
  applyKmlMarkerIconSelection,
  buildKmlMarkerQuickIconKeys,
  buildKmlMarkerIconField,
  getEditableKmlMarkerIcon,
  KML_MARKER_RECENT_LIMIT,
  KML_MARKER_RECENT_STORAGE_KEY,
  normalizeKmlFeatureMarkerIcon,
  normalizeKmlMarkerRecentIcons,
  readKmlMarkerRecentIcons,
  recordKmlMarkerRecentIcon,
} from '../src/map/kml-marker-picker.js'

function createMemoryStorage (initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

test('marker icon catalog is a bounded safe enum with an automatic UI-only option', () => {
  assert.equal(KML_MARKER_ICON_OPTIONS[0].key, 'auto')
  assert.equal(KML_MARKER_ICON_KEYS.includes('auto'), false)
  assert.deepEqual(KML_MARKER_ICON_KEYS, [
    'pin', 'star', 'flag', 'viewpoint', 'camera', 'collection',
    'campsite',
    'food', 'lodging', 'parking', 'warning', 'heart',
    'home', 'water', 'restroom', 'hospital', 'shop', 'charging',
    'bus', 'train', 'bicycle', 'hiking', 'summit', 'waterfall',
  ])
  assert.equal(normalizeKmlMarkerIcon('CAMPSITE'), 'campsite')
  assert.equal(normalizeKmlMarkerIcon('auto'), '')
  assert.equal(normalizeKmlMarkerIcon('<svg onload=alert(1)>'), '')
  assert.match(renderKmlMarkerIconGlyph('parking'), /^<svg/)
  assert.doesNotMatch(renderKmlMarkerIconGlyph('parking'), /script|onload/i)
})

test('marker picker persists explicit icons, clears automatic mode and drops invalid legacy values', () => {
  const point = applyKmlMarkerIconSelection({ type: 'Point' }, 'star')
  assert.equal(point.markerIcon, 'star')
  assert.equal(getEditableKmlMarkerIcon(point), 'star')

  applyKmlMarkerIconSelection(point, 'auto')
  assert.equal(Object.hasOwn(point, 'markerIcon'), false)
  assert.equal(getEditableKmlMarkerIcon(point), 'auto')

  assert.deepEqual(normalizeKmlFeatureMarkerIcon({ type: 'Point', markerIcon: 'unknown' }), { type: 'Point' })
  assert.deepEqual(normalizeKmlFeatureMarkerIcon({ type: 'LineString', markerIcon: 'flag' }), { type: 'LineString' })
})

test('marker picker field exposes accessible labels and only trusted built-in SVG markup', () => {
  const field = buildKmlMarkerIconField('summit', { recentIcons: ['water', 'camera'] })
  assert.equal(field.type, 'icon-picker')
  assert.equal(field.options.length, KML_MARKER_ICON_OPTIONS.length)
  assert.deepEqual(field.quickValues.slice(0, 4), ['auto', 'summit', 'water', 'camera'])
  assert.equal(field.hint, '自动模式按内容匹配图标。')
  assert.equal(field.options.every(option => option.label && /^<span class="kml-marker-picker-glyph"/.test(option.iconHtml)), true)
  assert.equal(field.options.every(option => !/script|onload|javascript:/i.test(option.iconHtml)), true)
})

test('marker picker normalizes bounded recent icons and orders automatic, current, recent and common choices', () => {
  assert.deepEqual(normalizeKmlMarkerRecentIcons([
    'WATER', 'auto', 'water', 'unknown', 'hospital', 'shop', 'bus', 'train', 'hiking',
  ]), ['water', 'hospital', 'shop', 'bus', 'train'])
  assert.equal(normalizeKmlMarkerRecentIcons(KML_MARKER_ICON_KEYS).length, KML_MARKER_RECENT_LIMIT)
  assert.deepEqual(buildKmlMarkerQuickIconKeys('waterfall', ['hospital', 'water', 'hospital']).slice(0, 4), [
    'auto', 'waterfall', 'hospital', 'water',
  ])
  assert.equal(buildKmlMarkerQuickIconKeys('waterfall', []).includes('waterfall'), true)
})

test('marker picker recent storage records only successfully supplied explicit safe icons', () => {
  const storage = createMemoryStorage({
    [KML_MARKER_RECENT_STORAGE_KEY]: JSON.stringify(['camera', 'invalid', 'camera', 'water']),
  })
  assert.deepEqual(readKmlMarkerRecentIcons(storage), ['camera', 'water'])
  assert.deepEqual(recordKmlMarkerRecentIcon('hospital', storage), ['hospital', 'camera', 'water'])
  assert.deepEqual(recordKmlMarkerRecentIcon('auto', storage), ['hospital', 'camera', 'water'])
  assert.deepEqual(recordKmlMarkerRecentIcon('<svg onload=alert(1)>', storage), ['hospital', 'camera', 'water'])
  assert.deepEqual(readKmlMarkerRecentIcons(storage), ['hospital', 'camera', 'water'])

  const brokenStorage = createMemoryStorage({ [KML_MARKER_RECENT_STORAGE_KEY]: '{broken' })
  assert.deepEqual(readKmlMarkerRecentIcons(brokenStorage), [])
  assert.deepEqual(recordKmlMarkerRecentIcon('summit', brokenStorage), ['summit'])
})

test('Leaflet media point icon hover feedback does not change the marker positioning transform', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const iconRule = css.match(/\.kml-media-point-icon\s*\{([\s\S]*?)\n\}/)?.[1] || ''
  const hoverRule = css.match(/\.leaflet-marker-icon\.kml-media-point-icon:hover\s*\{([\s\S]*?)\n\}/)?.[1] || ''
  assert.doesNotMatch(iconRule, /transform-origin|\bscale\s*:/)
  assert.doesNotMatch(hoverRule, /\bscale\s*:|\btransform\s*:/)
  assert.match(hoverRule, /filter\s*:/)
})
