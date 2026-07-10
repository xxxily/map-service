import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildTrackSegments,
  createTrackRecordingSession,
  getTrackDisplayFeatures,
  getTrackRecordingPoints,
  hasTrackRecordingData,
  pauseTrackRecordingSession,
  parseBoundedInteger,
  readBoundedIntegerSetting,
  readLocationSetting,
  recordTrackPosition,
  resetTrackRecordingSession,
  resumeTrackRecordingSession,
  safeStorageGet,
  trimTrackPointHistory,
  trimTrackRecordingSession,
} from '../src/map/location-track.js'

function trackPoint (timestamp, lng = 113) {
  return {
    lat: 23,
    lng,
    latlng: [23, lng],
    timestamp,
    firstTimestamp: timestamp - 1000,
    staySeconds: 99,
    locationSample: { lat: 23, lng, timestamp },
  }
}

test('recording pause/resume preserves earlier segments and excludes the paused gap', () => {
  const session = createTrackRecordingSession()
  resetTrackRecordingSession(session, { active: true })
  recordTrackPosition(session, trackPoint(1000))
  recordTrackPosition(session, trackPoint(2000, 113.01))
  pauseTrackRecordingSession(session)

  const resumeSeed = trackPoint(10_000, 114)
  resumeTrackRecordingSession(session, { currentPosition: resumeSeed })
  assert.equal(session.lastPosition.firstTimestamp, 10_000)
  assert.equal(session.lastPosition.staySeconds, 0)
  recordTrackPosition(session, trackPoint(11_000, 114.01))

  const recording = getTrackRecordingPoints(session)
  const segments = buildTrackSegments(
    recording.historyPoints,
    recording.lastPosition,
    recording.segments,
  )
  assert.deepEqual(segments.map(segment => segment.map(point => point.timestamp)), [
    [1000, 2000],
    [10_000, 11_000],
  ])
})

test('the first stationary fix after resume does not include time spent with recording paused', () => {
  const session = createTrackRecordingSession()
  resetTrackRecordingSession(session, { active: true })
  recordTrackPosition(session, trackPoint(1000))
  pauseTrackRecordingSession(session)

  resumeTrackRecordingSession(session, { currentPosition: trackPoint(100_000) })
  const globalStationaryPoint = trackPoint(101_000)
  globalStationaryPoint.firstTimestamp = 1000
  globalStationaryPoint.staySeconds = 100
  recordTrackPosition(session, globalStationaryPoint, { replaceLast: true })

  assert.equal(session.lastPosition.firstTimestamp, 100_000)
  assert.equal(session.lastPosition.staySeconds, 1)
})

test('paused recording data remains finalizable and reset releases the complete session', () => {
  const session = createTrackRecordingSession()
  resetTrackRecordingSession(session, { active: true })
  recordTrackPosition(session, trackPoint(1000))
  recordTrackPosition(session, trackPoint(2000, 113.01))
  pauseTrackRecordingSession(session)

  assert.equal(hasTrackRecordingData(session), true)
  assert.equal(session.active, false)
  assert.equal(session.segments.length, 1)

  resetTrackRecordingSession(session)
  assert.equal(hasTrackRecordingData(session), false)
  assert.deepEqual(session, {
    active: false,
    segments: [],
    historyPoints: [],
    lastPosition: null,
  })
})

test('location settings fall back when storage is absent or rejects reads', () => {
  assert.equal(readLocationSetting('location_interval', '15', () => null), '15')
  assert.equal(readLocationSetting('location_interval', '15', () => ({
    getItem: () => '30',
  })), '30')
  assert.equal(readLocationSetting('location_interval', '15', () => ({
    getItem: () => { throw new Error('Storage disabled') },
  })), '15')
  assert.equal(readLocationSetting('location_interval', '15', () => {
    throw new Error('Storage accessor denied')
  }), '15')
  assert.equal(readBoundedIntegerSetting('location_interval', 15, { min: 1, max: 60 }, () => ({
    getItem: () => '30',
  })), 30)
  assert.equal(readBoundedIntegerSetting('location_interval', 15, { min: 1, max: 60 }, () => ({
    getItem: () => '999999999',
  })), 15)
})

test('hot history limits immediately trim map and segmented recording buffers', () => {
  const mapHistory = Array.from({ length: 10_000 }, (_value, index) => trackPoint(index))
  assert.equal(trimTrackPointHistory(mapHistory, 100), true)
  assert.equal(mapHistory.length, 100)
  assert.equal(mapHistory[0].timestamp, 9900)

  const session = createTrackRecordingSession()
  resetTrackRecordingSession(session, { active: true })
  for (let index = 0; index < 8; index += 1) recordTrackPosition(session, trackPoint(index))
  pauseTrackRecordingSession(session)
  resumeTrackRecordingSession(session, { currentPosition: trackPoint(100) })
  recordTrackPosition(session, trackPoint(101))

  assert.equal(trimTrackRecordingSession(session, 3), true)
  const recording = getTrackRecordingPoints(session)
  const points = buildTrackSegments(recording.historyPoints, recording.lastPosition, recording.segments).flat()
  assert.equal(points.length, 4)
  assert.deepEqual(points.map(point => point.timestamp), [6, 7, 100, 101])
})

test('live-track display keeps full storage data but caps rendered points and line vertices', () => {
  const coordinates = Array.from({ length: 10_000 }, (_value, index) => [113 + index / 100_000, 23])
  const pointFeatures = Array.from({ length: 500 }, (_value, index) => ({
    id: `point-${index}`,
    type: 'Point',
    coordinates: coordinates[index],
  }))
  const kmlFile = {
    isLiveTrack: true,
    renderPointLimit: 120,
    renderLinePointLimit: 2000,
    features: [{ id: 'line', type: 'LineString', coordinates }, ...pointFeatures],
  }

  const displayed = getTrackDisplayFeatures(kmlFile)
  const displayedLine = displayed.find(feature => feature.type === 'LineString')
  const displayedPoints = displayed.filter(feature => feature.type === 'Point')

  assert.equal(kmlFile.features[0].coordinates.length, 10_000)
  assert.equal(displayedLine.coordinates.length, 2000)
  assert.deepEqual(displayedLine.coordinates[0], coordinates[0])
  assert.deepEqual(displayedLine.coordinates.at(-1), coordinates.at(-1))
  assert.equal(displayedPoints.length, 120)
  assert.equal(displayedPoints[0].id, 'point-380')
})

test('safeStorageGet falls back when browser storage access is blocked', () => {
  const blockedStorage = {
    getItem () {
      throw Object.assign(new Error('blocked'), { name: 'SecurityError' })
    },
  }
  assert.equal(safeStorageGet(blockedStorage, 'location_interval', '15'), '15')
  assert.equal(safeStorageGet(null, 'location_interval', '15'), '15')
})

test('bounded integer parsing rejects partial numbers, decimals, and unsafe timer values', () => {
  assert.equal(parseBoundedInteger('15', { min: 1, max: 60 }), 15)
  assert.equal(parseBoundedInteger('1abc', { min: 1, max: 60 }), null)
  assert.equal(parseBoundedInteger('1.5', { min: 1, max: 60 }), null)
  assert.equal(parseBoundedInteger('999999999', { min: 1, max: 60 }), null)
})
