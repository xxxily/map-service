import assert from 'node:assert/strict'
import { test } from 'node:test'
import TwoBuluImportCoordinator from '../service/bin/user/twoBuluImportCoordinator.js'
import { normalizeKmlFeatures } from '../service/bin/user/userContent.js'

const ACTOR = {
  user: {
    id: 'usr_two_bulu',
    permissions: ['kml.own.write'],
  },
}

const SHARE_URL = 'https://www.2bulu.com/track/t-OavTTmw9VMzp%252FR2KBg5Tzw%253D%253D.htm'
const VALID_KML = `<?xml version="1.0"?>
  <kml><Document><name>公开路线</name><Placemark><LineString>
    <coordinates>113.1,23.1,0 113.2,23.2,0</coordinates>
  </LineString></Placemark></Document></kml>`

function providerError (code, statusCode = 502) {
  return Object.assign(new Error('上游读取失败'), { code, statusCode })
}

function createHarness (options = {}) {
  const state = {
    audits: [],
    createCalls: [],
    documentsBySyncId: new Map(),
    providerCalls: [],
  }
  const provider = {
    async resolvePublicTrack (input, context) {
      state.providerCalls.push({ input, context })
      if (options.providerError) throw options.providerError
      return options.resolved || {
        sourceUrl: input.url,
        kmlText: VALID_KML,
        sourceByteSize: Buffer.byteLength(VALID_KML),
        completeness: 'full',
        warnings: [],
      }
    },
  }
  const userContent = {
    assertPermission (actor, permission) {
      assert.equal(actor.user.id, ACTOR.user.id)
      assert.equal(permission, 'kml.own.write')
    },
    getKmlBySyncClientId (actor, syncClientId) {
      assert.equal(actor.user.id, ACTOR.user.id)
      return state.documentsBySyncId.get(syncClientId) || null
    },
    createKml (actor, input, createOptions) {
      assert.equal(actor.user.id, ACTOR.user.id)
      const features = normalizeKmlFeatures(input.features)
      const document = {
        id: `kml_import_${state.createCalls.length + 1}`,
        name: input.name,
        description: input.description || '',
        featureCount: features.length,
        features,
        sourceType: input.sourceType,
        coordCorrection: input.coordCorrection,
      }
      state.createCalls.push({ input, createOptions, document })
      if (createOptions.syncClientId) {
        state.documentsBySyncId.set(createOptions.syncClientId, document)
      }
      return document
    },
    insertAudit (entry) {
      state.audits.push(entry)
    },
  }
  return {
    coordinator: new TwoBuluImportCoordinator({
      userContent,
      ...(options.withoutProvider ? {} : { provider }),
      clock: () => 1000,
    }),
    state,
  }
}

test('两步路协调服务用 requestId 幂等恢复且不重复读取上游或占用配额', async () => {
  const { coordinator, state } = createHarness()
  const input = {
    url: SHARE_URL,
    requestId: '2bulu-request-one',
    coordCorrection: 'wgs84-to-gcj02',
  }

  const first = await coordinator.import(ACTOR, input, { ip: '203.0.113.10' })
  const repeated = await coordinator.import(ACTOR, input, { ip: '203.0.113.10' })

  assert.equal(state.providerCalls.length, 1)
  assert.equal(state.createCalls.length, 1)
  assert.match(state.createCalls[0].createOptions.syncClientId, /^2bulu:2bulu-request-one:[A-Za-z0-9_-]{16}$/)
  assert.equal(first.id, repeated.id)
  assert.equal(first.importSummary.completeness, 'full')
  assert.equal(repeated.importSummary.completeness, 'existing')
  assert.equal(repeated.importSummary.idempotent, true)
  assert.equal(state.audits.length, 2)
  assert.equal(state.audits[0].targetId, first.id)
  assert.equal(state.audits[1].metadata.idempotent, true)
})

test('两步路协调服务将非法或危险上游 KML 映射为稳定 502 错误并审计', async () => {
  const invalidValues = [
    '<html><body>not kml</body></html>',
    '<!DOCTYPE kml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><kml><Document></Document></kml>',
    '<kml><Document><Placemark><Point><coordinates>999,999</coordinates></Point></Placemark></Document></kml>',
  ]

  for (const kmlText of invalidValues) {
    const { coordinator, state } = createHarness({
      resolved: {
        sourceUrl: SHARE_URL,
        kmlText,
        sourceByteSize: Buffer.byteLength(kmlText),
        completeness: 'full',
      },
    })
    await assert.rejects(
      coordinator.import(ACTOR, { url: SHARE_URL, requestId: `invalid-${state.audits.length}` }),
      error => error.statusCode === 502 && error.code === 'TWO_BULU_UPSTREAM_INVALID'
    )
    assert.equal(state.createCalls.length, 0)
    assert.equal(state.audits.length, 1)
    assert.equal(state.audits[0].result, 'failure')
    assert.equal(state.audits[0].reason, 'TWO_BULU_UPSTREAM_INVALID')
  }
})

test('两步路协调服务拒绝空轨迹且保留上游业务错误', async () => {
  const empty = createHarness({
    resolved: {
      sourceUrl: SHARE_URL,
      kmlText: '<kml><Document><name>空轨迹</name></Document></kml>',
      sourceByteSize: 55,
      completeness: 'full',
    },
  })
  await assert.rejects(
    empty.coordinator.import(ACTOR, { url: SHARE_URL }),
    error => error.statusCode === 422 && error.code === 'TWO_BULU_TRACK_EMPTY'
  )
  assert.equal(empty.state.createCalls.length, 0)
  assert.equal(empty.state.audits[0].reason, 'TWO_BULU_TRACK_EMPTY')

  const blocked = createHarness({
    providerError: providerError('TWO_BULU_UPSTREAM_BLOCKED'),
  })
  await assert.rejects(
    blocked.coordinator.import(ACTOR, { url: SHARE_URL }),
    error => error.statusCode === 502 && error.code === 'TWO_BULU_UPSTREAM_BLOCKED'
  )
  assert.equal(blocked.state.createCalls.length, 0)
  assert.equal(blocked.state.audits[0].reason, 'TWO_BULU_UPSTREAM_BLOCKED')
})

test('两步路公开 JSON 文档在持久化校验失败时映射为上游内容无效', async () => {
  const { coordinator, state } = createHarness({
    resolved: {
      sourceUrl: SHARE_URL,
      document: {
        name: '错误轨迹',
        features: [{
          id: 'broken-line',
          type: 'LineString',
          coordinates: [[113.1, 23.1]],
        }],
      },
      sourceByteSize: 128,
      completeness: 'full',
      warnings: [],
    },
  })

  await assert.rejects(
    coordinator.import(ACTOR, { url: SHARE_URL }),
    error => error.statusCode === 502 && error.code === 'TWO_BULU_UPSTREAM_INVALID'
  )
  assert.equal(state.createCalls.length, 0)
  assert.equal(state.audits[0].reason, 'TWO_BULU_UPSTREAM_INVALID')
})

test('非法坐标纠偏参数在读取上游前统一返回请求校验错误', async () => {
  const resolvedValues = [
    {
      sourceUrl: SHARE_URL,
      kmlText: VALID_KML,
      completeness: 'full',
    },
    {
      sourceUrl: SHARE_URL,
      document: {
        name: '公开路线',
        features: [{ id: 'point-one', type: 'Point', coordinates: [113.1, 23.1] }],
      },
      completeness: 'full',
    },
  ]

  for (const resolved of resolvedValues) {
    const { coordinator, state } = createHarness({ resolved })
    await assert.rejects(
      coordinator.import(ACTOR, { url: SHARE_URL, coordCorrection: 'invalid-mode' }),
      error => error.statusCode === 400 && error.code === 'VALIDATION_FAILED'
    )
    assert.equal(state.providerCalls.length, 0)
    assert.equal(state.createCalls.length, 0)
    assert.equal(state.audits[0].reason, 'VALIDATION_FAILED')
  }
})

test('浏览器助手导入只保存浏览器取得的 KML，不调用服务端两步路 provider，并按 requestId 幂等', async () => {
  const { coordinator, state } = createHarness({
    withoutProvider: true,
  })
  const input = {
    protocolVersion: 1,
    helperVersion: '0.2.0',
    url: SHARE_URL,
    requestId: 'helper-request-one',
    coordCorrection: 'wgs84-to-gcj02',
    partialPolicy: 'reject',
    name: '浏览器取得的路线',
    kmlText: VALID_KML,
    sourceMode: 'rendered-data',
    completeness: 'full',
    warnings: ['已忽略\u0000 一个无效点'],
  }

  const first = await coordinator.importFromBrowserHelper(ACTOR, input, { ip: '203.0.113.20' })
  const repeated = await coordinator.importFromBrowserHelper(ACTOR, input, { ip: '203.0.113.20' })

  assert.equal(state.providerCalls.length, 0)
  assert.equal(state.createCalls.length, 1)
  assert.match(state.createCalls[0].createOptions.syncClientId, /^2bulu-helper:helper-request-one:[A-Za-z0-9_-]{16}$/)
  assert.equal(first.name, '浏览器取得的路线')
  assert.equal(first.importSummary.helperVersion, '0.2.0')
  assert.equal(first.importSummary.sourceMode, 'rendered-data')
  assert.deepEqual(first.importSummary.warnings, ['已忽略 一个无效点'])
  assert.equal(repeated.id, first.id)
  assert.equal(repeated.importSummary.completeness, 'existing')
  assert.equal(state.audits[0].action, 'kml.import-2bulu-browser-helper')
  assert.equal(state.audits[0].metadata.sourceMode, 'rendered-data')
  assert.equal(state.audits[1].metadata.idempotent, true)
})

test('浏览器助手还原结果为仅轨迹线时要求用户显式允许并回传完整性警告', async () => {
  const strict = createHarness({ withoutProvider: true })
  const input = {
    protocolVersion: 1,
    helperVersion: '0.2.0',
    url: SHARE_URL,
    partialPolicy: 'reject',
    kmlText: VALID_KML,
    sourceMode: 'rendered-data',
    completeness: 'track-only',
    warnings: ['两步路页面未提供标注点或媒体'],
  }
  await assert.rejects(
    strict.coordinator.importFromBrowserHelper(ACTOR, input),
    error => error.statusCode === 422 && error.code === 'TWO_BULU_PARTIAL_REJECTED'
  )
  assert.equal(strict.state.createCalls.length, 0)

  const allowed = createHarness({ withoutProvider: true })
  const result = await allowed.coordinator.importFromBrowserHelper(ACTOR, {
    ...input,
    partialPolicy: 'allow-track-only',
  })
  assert.equal(result.importSummary.completeness, 'track-only')
  assert.equal(result.importSummary.sourceMode, 'rendered-data')
  assert.deepEqual(result.importSummary.warnings, ['两步路页面未提供标注点或媒体'])
  assert.equal(allowed.state.audits[0].metadata.completeness, 'track-only')
})

test('浏览器助手导入拒绝不兼容协议、超大正文和 XXE，且不产生 KML 文档', async () => {
  const cases = [
    {
      input: { protocolVersion: 2, helperVersion: '0.1.0', url: SHARE_URL, kmlText: VALID_KML },
      statusCode: 400,
      code: 'VALIDATION_FAILED',
    },
    {
      input: { protocolVersion: 1, helperVersion: '0.1.0', url: SHARE_URL, kmlText: 'x'.repeat(10 * 1024 * 1024 + 1) },
      statusCode: 413,
      code: 'FILE_TOO_LARGE',
    },
    {
      input: {
        protocolVersion: 1,
        helperVersion: '0.1.0',
        url: SHARE_URL,
        kmlText: '<!DOCTYPE kml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><kml><Document><Placemark><Point><coordinates>113,23</coordinates></Point></Placemark></Document></kml>',
      },
      statusCode: 400,
      code: 'KML_UNSAFE_XML',
    },
    {
      input: { protocolVersion: 1, helperVersion: '0.2.0', url: SHARE_URL, kmlText: VALID_KML, sourceMode: 'unsafe-mode' },
      statusCode: 400,
      code: 'VALIDATION_FAILED',
    },
  ]
  for (const item of cases) {
    const { coordinator, state } = createHarness()
    await assert.rejects(
      coordinator.importFromBrowserHelper(ACTOR, item.input),
      error => error.statusCode === item.statusCode && error.code === item.code,
    )
    assert.equal(state.createCalls.length, 0)
    assert.equal(state.audits.length, 1)
    assert.equal(state.audits[0].result, 'failure')
  }
})
