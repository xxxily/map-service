import assert from 'node:assert/strict'
import { test } from 'node:test'
import UserDatabase from '../service/bin/user/database.js'
import UserContentService, {
  generateKmlText,
  normalizeKmlPointClustering,
  parseKmlText,
} from '../service/bin/user/userContent.js'
import { hashToken } from '../service/bin/user/security.js'

const USER_PERMISSIONS = [
  'kml.own.read',
  'kml.own.write',
  'favorite.own.manage',
  'share.own.manage',
]

test('KML point clustering configuration normalizes and rejects unsafe ranges', () => {
  assert.deepEqual(normalizeKmlPointClustering({ enabled: false, gridSize: 1 }), { enabled: false })
  assert.deepEqual(normalizeKmlPointClustering({ enabled: true, minZoom: 2, maxClusterZoom: 8, gridSize: 48, maxMembersPerCluster: 300 }), {
    enabled: true, minZoom: 2, maxClusterZoom: 8, gridSize: 48, minClusterPoints: 2, maxMembersPerCluster: 300,
  })
  assert.throws(() => normalizeKmlPointClustering({ enabled: true, minZoom: 9, maxClusterZoom: 8 }), error => error.code === 'SHARE_CLUSTER_CONFIG_INVALID')
  assert.throws(() => normalizeKmlPointClustering({ enabled: true, gridSize: 8 }), error => error.code === 'SHARE_CLUSTER_CONFIG_INVALID')
  assert.throws(() => normalizeKmlPointClustering({ enabled: true, minClusterPoints: 2500 }), error => error.code === 'SHARE_CLUSTER_CONFIG_INVALID')
})

function insertUser (database, id, username) {
  const now = '2026-08-05T00:00:00.000Z'
  database.prepare(`
    INSERT INTO users(
      id, username_normalized, username_display, display_name, password_hash,
      status, quota_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'test-password-hash', 'active', '{}', ?, ?)
  `).run(id, username, username, `${username} display`, now, now)
}

function actor (id, permissions = USER_PERMISSIONS) {
  return {
    user: {
      id,
      permissions: [...permissions],
    },
  }
}

function point (id, longitude = 113.2644, latitude = 23.1291) {
  return {
    id,
    type: 'Point',
    name: `点位 ${id}`,
    description: '测试点位',
    coordinates: [longitude, latitude],
  }
}

function createHarness (options = {}) {
  const database = new UserDatabase({ filePath: ':memory:' })
  insertUser(database, 'usr_one', 'user-one')
  insertUser(database, 'usr_two', 'user-two')
  insertUser(database, 'usr_admin', 'admin-user')
  let now = Date.parse('2026-08-05T08:00:00.000Z')
  const settings = {
    quota: {
      maxKmlFiles: 100,
      maxKmlFileBytes: 10 * 1024 * 1024,
      maxFeaturesPerKml: 50000,
      maxFeaturesPerUser: 200000,
      trashRetentionDays: 30,
      ...(options.quota || {}),
    },
    share: {
      publicAccessPolicy: options.publicAccessPolicy || 'independent',
      maxFilesPerShare: 20,
      accessTtlMs: 1000 * 60 * 60,
      // Test fixtures explicitly opt in to passwordless links; production
      // defaults keep this administrator-controlled capability disabled.
      passwordlessSharingEnabled: true,
      spatialAccessEnabled: true,
      spatialPaddingMeters: 1000,
      spatialMaxAreaKm2: 10000,
      spatialMaxDiagonalKm: 300,
      spatialUnrestrictedTileMaxZoom: 14,
      unlimitedAccessEnabled: true,
      unlimitedAccessMaxAreaKm2: 2000,
      unlimitedAccessMaxDiagonalKm: 100,
      spatialPolicyRevision: 1,
      ...(options.share || {}),
    },
  }
  const service = new UserContentService({
    database,
    clock: () => now,
    settingsProvider: () => settings,
    isSiteAccessEnabled: () => Boolean(options.siteAccessEnabled),
    shareTileRateLimit: options.shareTileRateLimit,
    shareManifestRateLimit: options.shareManifestRateLimit,
  })
  return {
    database,
    service,
    settings,
    one: actor('usr_one'),
    two: actor('usr_two'),
    admin: actor('usr_admin', ['admin.share.moderate']),
    advance (milliseconds) {
      now += milliseconds
    },
    close () {
      database.close()
    },
  }
}

test('personal KML CRUD enforces revisions, ownership and default protection', () => {
  const harness = createHarness()
  try {
    const list = harness.service.listKmlFiles(harness.one)
    assert.equal(list.total, 1)
    assert.equal(list.items[0].isDefault, true)
    assert.notEqual(list.items[0].id, 'default-kml')

    const document = harness.service.createKml(harness.one, {
      name: '巡检路线',
      features: [point('point-one')],
    })
    assert.equal(document.revision, 1)
    assert.equal(document.featureCount, 1)
    assert.equal(document.shareReferenceCount, 0)

    const updated = harness.service.updateKml(harness.one, document.id, {
      revision: 1,
      name: '巡检路线 2026',
      features: [
        point('point-one'),
        {
          id: 'line-one',
          type: 'LineString',
          name: '线路',
          coordinates: [[113.2, 23.1], [113.3, 23.2]],
        },
      ],
    })
    assert.equal(updated.revision, 2)
    assert.equal(updated.featureCount, 2)
    assert.throws(
      () => harness.service.updateKml(harness.one, document.id, { revision: 1, name: '覆盖' }),
      error => error.statusCode === 409 && error.code === 'KML_REVISION_CONFLICT'
    )
    assert.throws(
      () => harness.service.getKml(harness.two, document.id),
      error => error.statusCode === 404 && error.code === 'RESOURCE_NOT_FOUND'
    )
    assert.equal(
      harness.service.getKml(actor('usr_admin', ['kml.any.manage']), document.id).id,
      document.id
    )
    assert.throws(
      () => harness.service.listKml(harness.one, { sort: 'unsafe-column' }),
      error => error.code === 'VALIDATION_FAILED'
    )
    assert.throws(
      () => harness.service.trashKml(harness.one, list.items[0].id),
      error => error.statusCode === 409 && error.code === 'DEFAULT_KML_PROTECTED'
    )

    const madeDefault = harness.service.updateKml(harness.one, document.id, {
      revision: updated.revision,
      isDefault: true,
    })
    assert.equal(madeDefault.isDefault, true)
    const trashedOldDefault = harness.service.trashKml(harness.one, list.items[0].id)
    assert.equal(trashedOldDefault.status, 'trashed')
    const restored = harness.service.restoreKml(harness.one, list.items[0].id)
    assert.equal(restored.status, 'active')
    const restoreAudit = harness.database.prepare(`
      SELECT action, target_type, target_id, metadata_json
      FROM audit_logs
      WHERE action = 'kml.restore' AND target_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(list.items[0].id)
    assert.equal(restoreAudit.action, 'kml.restore')
    assert.equal(restoreAudit.target_type, 'kml')
    assert.equal(restoreAudit.target_id, list.items[0].id)
    assert.deepEqual(JSON.parse(restoreAudit.metadata_json), { previousRevision: 2, featureCount: 0 })
    harness.service.trashKml(harness.one, list.items[0].id)
    assert.deepEqual(harness.service.deleteKmlPermanently(harness.one, list.items[0].id), {
      id: list.items[0].id,
      status: 'deleted',
    })
  } finally {
    harness.close()
  }
})

test('KML sync switches the default file when the new default update runs first', () => {
  const harness = createHarness()
  try {
    const previousDefault = harness.service.ensureDefaultKml(harness.one)
    const nextDefault = harness.service.createKml(harness.one, {
      name: '新的默认文件',
      features: [],
    })

    const result = harness.service.syncKmlFiles(harness.one, {
      operations: [
        {
          action: 'update',
          kmlId: nextDefault.id,
          data: { revision: nextDefault.revision, isDefault: true },
        },
        {
          action: 'update',
          kmlId: previousDefault.id,
          data: { revision: previousDefault.revision, isDefault: false },
        },
      ],
    })

    assert.equal(result.results[0].document.isDefault, true)
    assert.equal(result.results[1].document.isDefault, false)
    assert.deepEqual(
      harness.service.listKmlFiles(harness.one).items
        .filter(item => item.isDefault)
        .map(item => item.id),
      [nextDefault.id],
    )
  } finally {
    harness.close()
  }
})

test('KML restore is idempotent and only audits a real trashed-to-active transition', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '恢复竞态测试' })
    harness.service.updateKml(harness.one, document.id, { revision: document.revision, name: '恢复竞态测试 2' })
    harness.service.trashKml(harness.one, document.id)
    const staleTrashedRow = harness.database.prepare('SELECT * FROM kml_documents WHERE id = ?').get(document.id)
    const before = Number(harness.database.prepare(`
      SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'kml.restore' AND target_id = ?
    `).get(document.id)?.count || 0)

    // Simulate a competing restore completing after the caller read its row,
    // before the conditional state transition executes.
    harness.database.prepare(`
      UPDATE kml_documents SET status = 'active', revision = revision + 1, deleted_at = NULL WHERE id = ?
    `).run(document.id)

    const originalRequireKmlAccess = harness.service.requireKmlAccess
    harness.service.requireKmlAccess = () => staleTrashedRow
    assert.throws(
      () => harness.service.restoreKml(harness.one, document.id),
      error => error.statusCode === 409 && error.code === 'KML_REVISION_CONFLICT'
    )
    harness.service.requireKmlAccess = originalRequireKmlAccess
    const after = Number(harness.database.prepare(`
      SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'kml.restore' AND target_id = ?
    `).get(document.id)?.count || 0)
    assert.equal(after, before)

    const repeated = harness.service.restoreKml(harness.one, document.id)
    assert.equal(repeated.status, 'active')
    assert.equal(repeated.revision, 4)
  } finally {
    harness.close()
  }
})

test('KML sync requires explicit confirmation before every trash operation', () => {
  const harness = createHarness()
  try {
    const first = harness.service.createKml(harness.one, { name: '待删除文件一' })
    const second = harness.service.createKml(harness.one, { name: '待删除文件二' })
    const operations = [first, second].map(document => ({
      action: 'trash',
      kmlId: document.id,
    }))

    assert.throws(
      () => harness.service.syncKmlFiles(harness.one, { operations }),
      error => error.statusCode === 409 &&
        error.code === 'KML_DELETE_CONFIRMATION_REQUIRED' &&
        error.message === '移入回收站前需要用户确认'
    )
    assert.equal(harness.service.getKml(harness.one, first.id).status, 'active')
    assert.equal(harness.service.getKml(harness.one, second.id).status, 'active')

    assert.throws(
      () => harness.service.syncKmlFiles(harness.one, {
        operations: [{ action: 'trash', kmlId: first.id }],
      }),
      error => error.statusCode === 409 &&
        error.code === 'KML_DELETE_CONFIRMATION_REQUIRED' &&
        error.message === '移入回收站前需要用户确认'
    )
    assert.equal(harness.service.getKml(harness.one, first.id).status, 'active')

    const confirmed = harness.service.syncKmlFiles(harness.one, {
      deletionIntent: 'user-confirmed',
      operations: [{ action: 'trash', kmlId: first.id }],
    })
    assert.equal(confirmed.results[0].document.status, 'trashed')

    const confirmedBatch = harness.service.syncKmlFiles(harness.one, {
      deletionIntent: 'user-confirmed-batch',
      operations,
    })
    assert.deepEqual(confirmedBatch.results.map(item => item.document.status), ['trashed', 'trashed'])
  } finally {
    harness.close()
  }
})

test('KML sync rejects permanent deletion and leaves the recycle-bin record untouched', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '密码保护删除测试' })
    harness.service.trashKml(harness.one, document.id)
    const beforeAudit = Number(harness.database.prepare(`
      SELECT COUNT(*) AS count FROM audit_logs
      WHERE action = 'kml.delete-permanent' AND target_id = ?
    `).get(document.id)?.count || 0)

    assert.throws(
      () => harness.service.syncKmlFiles(harness.one, {
        operations: [{ action: 'deletePermanent', kmlId: document.id }],
      }),
      error => error.statusCode === 409 && error.code === 'REAUTH_REQUIRED'
    )

    assert.equal(harness.service.getKml(harness.one, document.id).status, 'trashed')
    assert.equal(Number(harness.database.prepare(`
      SELECT COUNT(*) AS count FROM audit_logs
      WHERE action = 'kml.delete-permanent' AND target_id = ?
    `).get(document.id)?.count || 0), beforeAudit)
  } finally {
    harness.close()
  }
})

test('deleting a KML directory clears active and trashed file directory ids', () => {
  const harness = createHarness()
  try {
    const directory = harness.service.createKmlDirectory(harness.one, { name: '待删除目录' })
    const active = harness.service.createKml(harness.one, { name: '活动文件', directoryId: directory.id })
    const trashed = harness.service.createKml(harness.one, { name: '回收文件', directoryId: directory.id })
    harness.service.trashKml(harness.one, trashed.id)
    harness.service.deleteKmlDirectory(harness.one, directory.id)
    const rows = harness.database.prepare('SELECT id, status, directory_id FROM kml_documents WHERE id IN (?, ?) ORDER BY id').all(active.id, trashed.id)
    assert.deepEqual(rows.map(row => row.directory_id), [null, null])
  } finally {
    harness.close()
  }
})

test('directory share expansion deduplicates files and preserves directory metadata on sync', () => {
  const harness = createHarness()
  try {
    const directory = harness.service.createKmlDirectory(harness.one, { name: '分享目录' })
    const first = harness.service.createKml(harness.one, { name: '目录文件', directoryId: directory.id })
    const share = harness.service.createShare(harness.one, {
      title: '目录分享',
      items: [{ directoryId: directory.id }, { kmlId: first.id }],
      viewConfig: { kmlPointClustering: { enabled: true, minZoom: 1, maxClusterZoom: 10, gridSize: 64, maxMembersPerCluster: 500 } },
    })
    assert.equal(share.itemCount, 1)
    assert.equal(share.items[0].directoryName, '分享目录')
    const synced = harness.service.syncShareContent(harness.one, share.id, { revision: share.revision })
    assert.equal(synced.items[0].directoryName, '分享目录')
    assert.deepEqual(synced.viewConfig.kmlPointClustering, { enabled: true, minZoom: 1, maxClusterZoom: 10, gridSize: 64, minClusterPoints: 2, maxMembersPerCluster: 500 })
  } finally {
    harness.close()
  }
})

test('管理员配置可允许单个分享包含超过旧 20 个上限的 KML', () => {
  const harness = createHarness({ share: { maxFilesPerShare: 25 } })
  try {
    const documents = Array.from({ length: 22 }, (_, index) => harness.service.createKml(harness.one, {
      name: `批量分享 ${index + 1}`,
      features: [point(`share-${index + 1}`)],
    }))
    const share = harness.service.createShare(harness.one, {
      title: '超过旧上限的分享',
      items: documents.map(document => ({ kmlId: document.id })),
    })
    assert.equal(share.itemCount, 22)
    assert.equal(share.items.length, 22)
  } finally {
    harness.close()
  }
})

test('public share manifest preserves hidden items and combines forced clustering with share configuration', () => {
  const harness = createHarness({
    share: {
      kmlClusterForceEnabled: true,
      kmlClusterMaxZoom: 11,
      kmlClusterMinPoints: 180,
    },
  })
  try {
    const document = harness.service.createKml(harness.one, {
      name: '密集点位',
      features: [point('dense-point')],
    })
    const forcedShare = harness.service.createShare(harness.one, {
      title: '策略强制聚合',
      items: [{ kmlId: document.id, visibleByDefault: false }],
      viewConfig: { kmlPointClustering: { enabled: false } },
    })
    const forcedManifest = harness.service.getPublicShareManifest(forcedShare.publicId)

    assert.equal(forcedManifest.items[0].visibleByDefault, false)
    assert.equal(forcedManifest.items[0].enabled, false)
    assert.equal('features' in forcedManifest.items[0], false)
    assert.deepEqual(forcedManifest.viewConfig.kmlPointClustering, {
      enabled: true,
      minZoom: 0,
      maxClusterZoom: 11,
      gridSize: 64,
      minClusterPoints: 180,
      maxMembersPerCluster: 5000,
      forcedByPolicy: true,
    })

    const explicitShare = harness.service.createShare(harness.one, {
      title: '分享自定义聚合',
      items: [{ kmlId: document.id }],
      viewConfig: {
        kmlPointClustering: {
          enabled: true,
          minZoom: 3,
          maxClusterZoom: 9,
          gridSize: 48,
          minClusterPoints: 7,
          maxMembersPerCluster: 800,
        },
      },
    })
    assert.deepEqual(
      harness.service.getPublicShareManifest(explicitShare.publicId).viewConfig.kmlPointClustering,
      {
        enabled: true,
        minZoom: 0,
        maxClusterZoom: 11,
        gridSize: 64,
        minClusterPoints: 7,
        maxMembersPerCluster: 800,
        forcedByPolicy: true,
      }
    )

    const aggressiveShare = harness.service.createShare(harness.one, {
      title: '分享更积极聚合',
      items: [{ kmlId: document.id }],
      viewConfig: {
        kmlPointClustering: {
          enabled: true,
          minZoom: 0,
          maxClusterZoom: 15,
          gridSize: 96,
          minClusterPoints: 2,
          maxMembersPerCluster: 600,
        },
      },
    })
    assert.deepEqual(
      harness.service.getPublicShareManifest(aggressiveShare.publicId).viewConfig.kmlPointClustering,
      {
        enabled: true,
        minZoom: 0,
        maxClusterZoom: 15,
        gridSize: 96,
        minClusterPoints: 2,
        maxMembersPerCluster: 600,
        forcedByPolicy: true,
      }
    )
  } finally {
    harness.close()
  }
})

test('share directory ids stay stable for the same source directory and change after an explicit move', () => {
  const harness = createHarness()
  try {
    const firstDirectory = harness.service.createKmlDirectory(harness.one, { name: '原目录' })
    const secondDirectory = harness.service.createKmlDirectory(harness.one, { name: '目标目录' })
    const first = harness.service.createKml(harness.one, { name: '文件一', directoryId: firstDirectory.id })
    const second = harness.service.createKml(harness.one, { name: '文件二', directoryId: firstDirectory.id })
    let share = harness.service.createShare(harness.one, {
      title: '目录快照',
      items: [{ directoryId: firstDirectory.id }],
    })
    const initialManifest = harness.service.getPublicShareManifest(share.publicId)
    const initialDirectoryId = initialManifest.items[0].directoryId
    assert.ok(initialDirectoryId)
    assert.equal(initialManifest.items[1].directoryId, initialDirectoryId)

    harness.service.updateKmlDirectory(harness.one, firstDirectory.id, { name: '已重命名目录' })
    share = harness.service.updateShare(harness.one, share.id, {
      revision: share.revision,
      items: [
        { kmlId: first.id, position: 0 },
        { kmlId: second.id, position: 1 },
      ],
    })
    const renamedManifest = harness.service.getPublicShareManifest(share.publicId)
    assert.equal(renamedManifest.items[0].directoryId, initialDirectoryId)
    assert.equal(renamedManifest.items[0].directoryName, '已重命名目录')

    harness.service.moveKmlFile(harness.one, second.id, { directoryId: secondDirectory.id })
    share = harness.service.updateShare(harness.one, share.id, {
      revision: share.revision,
      items: [
        { kmlId: first.id, position: 0 },
        { kmlId: second.id, position: 1 },
      ],
    })
    const movedManifest = harness.service.getPublicShareManifest(share.publicId)
    assert.equal(movedManifest.items[0].directoryId, initialDirectoryId)
    assert.notEqual(movedManifest.items[1].directoryId, initialDirectoryId)
    assert.equal(movedManifest.items[1].directoryName, '目标目录')
  } finally {
    harness.close()
  }
})

test('manual share sync refreshes directory snapshots while preserving unchanged public ids', () => {
  const harness = createHarness()
  try {
    const directory = harness.service.createKmlDirectory(harness.one, { name: '同步前目录' })
    const document = harness.service.createKml(harness.one, { name: '同步文件', directoryId: directory.id })
    let share = harness.service.createShare(harness.one, {
      title: '同步目录快照',
      items: [{ kmlId: document.id }],
    })
    const initialDirectoryId = harness.service.getPublicShareManifest(share.publicId).items[0].directoryId
    harness.service.updateKmlDirectory(harness.one, directory.id, { name: '同步后目录' })
    share = harness.service.syncShareContent(harness.one, share.id, { revision: share.revision })
    const manifest = harness.service.getPublicShareManifest(share.publicId)
    assert.equal(manifest.items[0].directoryId, initialDirectoryId)
    assert.equal(manifest.items[0].directoryName, '同步后目录')
  } finally {
    harness.close()
  }
})

test('file reordering updates only changed revisions and returns refreshed organization metadata', () => {
  const harness = createHarness()
  try {
    const directory = harness.service.createKmlDirectory(harness.one, { name: '排序目录' })
    const first = harness.service.createKml(harness.one, { name: '第一项', directoryId: directory.id })
    const second = harness.service.createKml(harness.one, { name: '第二项', directoryId: directory.id })
    const reordered = harness.service.reorderKmlFiles(harness.one, {
      directoryId: directory.id,
      ids: [second.id, first.id],
    })
    assert.deepEqual(reordered.documents.map(item => [item.id, item.position, item.revision]), [
      [second.id, 0, 2],
      [first.id, 1, 2],
    ])
    const unchanged = harness.service.reorderKmlFiles(harness.one, {
      directoryId: directory.id,
      ids: [second.id, first.id],
    })
    assert.deepEqual(unchanged.documents, [])
  } finally {
    harness.close()
  }
})

test('batch KML move appends cross-directory files in request order and skips target matches', () => {
  const harness = createHarness()
  try {
    const sourceA = harness.service.createKmlDirectory(harness.one, { name: '来源甲' })
    const sourceB = harness.service.createKmlDirectory(harness.one, { name: '来源乙' })
    const target = harness.service.createKmlDirectory(harness.one, { name: '目标目录' })
    const first = harness.service.createKml(harness.one, { name: '甲一', directoryId: sourceA.id })
    const remaining = harness.service.createKml(harness.one, { name: '甲二', directoryId: sourceA.id })
    const second = harness.service.createKml(harness.one, { name: '乙一', directoryId: sourceB.id })
    const targetHead = harness.service.createKml(harness.one, { name: '目标首项', directoryId: target.id })
    const skipped = harness.service.createKml(harness.one, { name: '已在目标', directoryId: target.id })

    const result = harness.service.batchMoveKmlFiles(harness.one, {
      ids: [second.id, skipped.id, first.id],
      directoryId: target.id,
    })

    assert.deepEqual(result.movedIds, [second.id, first.id])
    assert.deepEqual(result.skippedIds, [skipped.id])
    assert.equal(result.movedCount, 2)
    assert.equal(result.skippedCount, 1)
    assert.deepEqual(result.documents.map(item => item.id), [second.id, first.id])
    assert.deepEqual(harness.service.listKmlFiles(harness.one, { sort: 'position', order: 'asc' }).items
      .filter(item => item.directoryId === target.id)
      .map(item => [item.id, item.position]), [
      [targetHead.id, 0],
      [skipped.id, 1],
      [second.id, 2],
      [first.id, 3],
    ])
    assert.equal(harness.service.getKml(harness.one, skipped.id).revision, skipped.revision)
    assert.deepEqual(
      harness.service.listKmlFiles(harness.one, { sort: 'position', order: 'asc' }).items
        .filter(item => item.directoryId === sourceA.id)
        .map(item => [item.id, item.position]),
      [[remaining.id, 0]],
    )
    assert.equal(harness.service.getKml(harness.one, remaining.id).revision, remaining.revision + 1)
    assert.deepEqual(new Set(result.affectedDocuments.map(item => item.id)), new Set([
      remaining.id,
      second.id,
      first.id,
    ]))
  } finally {
    harness.close()
  }
})

test('batch KML move treats an all-target selection as a successful no-op', () => {
  const harness = createHarness()
  try {
    const target = harness.service.createKmlDirectory(harness.one, { name: '原目录' })
    const first = harness.service.createKml(harness.one, { name: '原目录一', directoryId: target.id })
    const second = harness.service.createKml(harness.one, { name: '原目录二', directoryId: target.id })
    const result = harness.service.batchMoveKmlFiles(harness.one, {
      ids: [second.id, first.id],
      directoryId: target.id,
    })

    assert.deepEqual(result.movedIds, [])
    assert.deepEqual(result.skippedIds, [second.id, first.id])
    assert.deepEqual(result.documents, [])
    assert.deepEqual(result.affectedDocuments, [])
    assert.deepEqual([
      harness.service.getKml(harness.one, first.id).revision,
      harness.service.getKml(harness.one, second.id).revision,
    ], [first.revision, second.revision])
  } finally {
    harness.close()
  }
})

test('batch KML move validates every file before writing and rolls back database failures', () => {
  const harness = createHarness()
  try {
    const source = harness.service.createKmlDirectory(harness.one, { name: '事务来源' })
    const target = harness.service.createKmlDirectory(harness.one, { name: '事务目标' })
    const first = harness.service.createKml(harness.one, { name: '事务一', directoryId: source.id })
    const second = harness.service.createKml(harness.one, { name: '事务二', directoryId: source.id })
    const foreign = harness.service.createKml(harness.two, { name: '其他用户文件' })
    const foreignDirectory = harness.service.createKmlDirectory(harness.two, { name: '其他用户目录' })
    const trashed = harness.service.createKml(harness.one, { name: '回收站文件', directoryId: source.id })
    harness.service.trashKml(harness.one, trashed.id)

    assert.throws(
      () => harness.service.batchMoveKmlFiles(harness.one, { ids: [], directoryId: target.id }),
      error => error.code === 'KML_MOVE_INVALID',
    )
    assert.throws(
      () => harness.service.batchMoveKmlFiles(harness.one, {
        ids: [first.id, first.id],
        directoryId: target.id,
      }),
      error => error.code === 'KML_MOVE_INVALID',
    )
    assert.throws(
      () => harness.service.batchMoveKmlFiles(harness.one, {
        ids: [first.id],
        directoryId: foreignDirectory.id,
      }),
      error => error.code === 'KML_DIRECTORY_NOT_FOUND',
    )
    assert.throws(
      () => harness.service.batchMoveKmlFiles(harness.one, {
        ids: [first.id, foreign.id],
        directoryId: target.id,
      }),
      error => error.code === 'RESOURCE_NOT_FOUND',
    )
    assert.equal(harness.service.getKml(harness.one, first.id).directoryId, source.id)
    assert.throws(
      () => harness.service.batchMoveKmlFiles(harness.one, {
        ids: [first.id, trashed.id],
        directoryId: target.id,
      }),
      error => error.code === 'KML_MOVE_INVALID',
    )
    assert.equal(harness.service.getKml(harness.one, first.id).directoryId, source.id)

    harness.database.exec(`
      CREATE TRIGGER reject_second_batch_kml_move
      BEFORE UPDATE OF directory_id ON kml_documents
      WHEN NEW.id = '${second.id}' AND NEW.directory_id = '${target.id}'
      BEGIN
        SELECT RAISE(ABORT, 'injected batch move failure');
      END;
    `)
    assert.throws(() => harness.service.batchMoveKmlFiles(harness.one, {
      ids: [first.id, second.id],
      directoryId: target.id,
    }), /injected batch move failure/)
    assert.deepEqual([
      harness.service.getKml(harness.one, first.id).directoryId,
      harness.service.getKml(harness.one, second.id).directoryId,
    ], [source.id, source.id])
    assert.deepEqual([
      harness.service.getKml(harness.one, first.id).revision,
      harness.service.getKml(harness.one, second.id).revision,
    ], [first.revision, second.revision])
  } finally {
    harness.close()
  }
})

test('invalid KML position does not partially update document content', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '原始名称' })
    assert.throws(() => harness.service.updateKml(harness.one, document.id, { revision: 1, name: '不应保存', position: 999 }), error => error.code === 'KML_MOVE_INVALID')
    assert.equal(harness.service.getKml(harness.one, document.id).name, '原始名称')
  } finally {
    harness.close()
  }
})

test('KML active positions stay dense when files move through the recycle bin', () => {
  const harness = createHarness()
  try {
    harness.service.ensureDefaultKml(harness.one)
    const first = harness.service.createKml(harness.one, { name: '顺序一' })
    const second = harness.service.createKml(harness.one, { name: '顺序二' })
    const third = harness.service.createKml(harness.one, { name: '顺序三' })

    harness.service.trashKml(harness.one, second.id)
    const appended = harness.service.createKml(harness.one, { name: '回收后新建' })
    let active = harness.service.listKmlFiles(harness.one, { sort: 'position', order: 'asc' }).items
    assert.deepEqual(active.map(item => [item.name, item.position]), [
      ['默认标注', 0],
      [first.name, 1],
      [third.name, 2],
      [appended.name, 3],
    ])

    const restored = harness.service.restoreKml(harness.one, second.id)
    assert.equal(restored.position, 4)
    active = harness.service.listKmlFiles(harness.one, { sort: 'position', order: 'asc' }).items
    assert.deepEqual(active.map(item => item.position), [0, 1, 2, 3, 4])
  } finally {
    harness.close()
  }
})

test('a stale out-of-range position is repaired during an ordinary KML update', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '位置损坏文件' })
    harness.database.prepare('UPDATE kml_documents SET position = ? WHERE id = ?').run(117, document.id)
    const updated = harness.service.updateKml(harness.one, document.id, {
      revision: document.revision,
      name: '位置已修复',
      position: 117,
    })
    assert.equal(updated.name, '位置已修复')
    assert.equal(updated.position, 1)
  } finally {
    harness.close()
  }
})

test('an ordinary KML content update does not rewrite an already valid position', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '位置保持文件' })
    harness.database.exec(`
      CREATE TRIGGER reject_noop_kml_position_update
      BEFORE UPDATE OF position ON kml_documents
      WHEN NEW.position = OLD.position
      BEGIN
        SELECT RAISE(ABORT, 'unexpected position rewrite');
      END;
    `)
    const updated = harness.service.updateKml(harness.one, document.id, {
      revision: document.revision,
      name: '仅更新内容',
    })
    assert.equal(updated.name, '仅更新内容')
    assert.equal(updated.position, document.position)
  } finally {
    harness.close()
  }
})

test('a concurrent KML move invalidates an older content update', () => {
  const harness = createHarness()
  try {
    const directory = harness.service.createKmlDirectory(harness.one, { name: '并发移动目录' })
    const document = harness.service.createKml(harness.one, { name: '并发移动文件' })
    const originalTransaction = harness.database.transaction.bind(harness.database)
    let moved = null
    let injected = false
    harness.database.transaction = callback => {
      if (!injected) {
        injected = true
        moved = harness.service.moveKmlFile(harness.one, document.id, { directoryId: directory.id })
      }
      return originalTransaction(callback)
    }
    try {
      assert.throws(
        () => harness.service.updateKml(harness.one, document.id, {
          revision: document.revision,
          name: '不应覆盖移动',
        }),
        error => error.code === 'KML_REVISION_CONFLICT',
      )
    } finally {
      harness.database.transaction = originalTransaction
    }
    const current = harness.service.getKml(harness.one, document.id)
    assert.equal(current.directoryId, directory.id)
    assert.equal(current.revision, moved.revision)
    assert.equal(current.name, document.name)
  } finally {
    harness.close()
  }
})

test('deleting a directory reindexes active files without mixing trashed rows', () => {
  const harness = createHarness()
  try {
    const directory = harness.service.createKmlDirectory(harness.one, { name: '混合目录' })
    const activeOne = harness.service.createKml(harness.one, { name: '目录活动一', directoryId: directory.id })
    const activeTwo = harness.service.createKml(harness.one, { name: '目录活动二', directoryId: directory.id })
    const trashed = harness.service.createKml(harness.one, { name: '目录回收', directoryId: directory.id })
    harness.service.trashKml(harness.one, trashed.id)
    harness.service.deleteKmlDirectory(harness.one, directory.id)

    const active = harness.database.prepare(`
      SELECT position FROM kml_documents
      WHERE owner_id = ? AND directory_id IS NULL AND status = 'active'
      ORDER BY position, id
    `).all(harness.one.user.id)
    assert.deepEqual(active.map(row => row.position), active.map((row, index) => index))
    assert.equal(harness.database.prepare('SELECT directory_id, position FROM kml_documents WHERE id = ?').get(trashed.id).directory_id, null)
    assert.equal(harness.database.prepare('SELECT position FROM kml_documents WHERE id = ?').get(trashed.id).position, 0)
    assert.equal(harness.service.getKml(harness.one, activeOne.id).directoryId, null)
    assert.equal(harness.service.getKml(harness.one, activeTwo.id).directoryId, null)
  } finally {
    harness.close()
  }
})

test('KML usage counts active files while reporting recycle-bin storage separately', () => {
  const harness = createHarness({
    quota: { maxKmlFiles: 3, maxFeaturesPerUser: 10 },
  })
  try {
    const first = harness.service.createKml(harness.one, { name: '配额活动', features: [point('active')] })
    const second = harness.service.createKml(harness.one, { name: '配额回收', features: [point('trash')] })
    harness.service.trashKml(harness.one, second.id)
    const usage = harness.service.getKmlUsage(harness.one)
    assert.equal(usage.fileCount, 2)
    assert.equal(usage.featureCount, 1)
    assert.equal(usage.trashCount, 1)
    assert.equal(usage.trashFeatureCount, 1)
    assert.equal(usage.trashByteSize, second.byteSize)
    assert.equal(harness.service.createKml(harness.one, { name: '回收不占名额' }).status, 'active')
    assert.throws(
      () => harness.service.restoreKml(harness.one, second.id),
      error => error.code === 'QUOTA_EXCEEDED',
    )
    assert.equal(harness.service.getKml(harness.one, first.id).status, 'active')
  } finally {
    harness.close()
  }
})

test('expired KML recycle-bin rows are cleaned asynchronously and referenced rows are retained', () => {
  const harness = createHarness({ quota: { trashRetentionDays: 2 } })
  try {
    const expired = harness.service.createKml(harness.one, { name: '应清理回收文件' })
    const referenced = harness.service.createKml(harness.one, { name: '分享引用回收文件' })
    const share = harness.service.createShare(harness.one, {
      title: '保留引用',
      items: [{ kmlId: referenced.id }],
    })
    assert.ok(share.id)
    harness.service.trashKml(harness.one, expired.id)
    harness.service.trashKml(harness.one, referenced.id)
    harness.advance(3 * 86_400_000)
    const result = harness.service.purgeExpiredKmlTrash()
    assert.equal(result.deletedCount, 1)
    assert.equal(harness.database.prepare('SELECT 1 FROM kml_documents WHERE id = ?').get(expired.id), undefined)
    assert.equal(harness.service.getKml(harness.one, referenced.id).status, 'trashed')
    assert.equal(result.skippedByShare, 1)
  } finally {
    harness.close()
  }
})

test('KML recycle-bin cleanup scans past retained rows until the deletion limit is filled', () => {
  const harness = createHarness({ quota: { trashRetentionDays: 2 } })
  try {
    const referenced = harness.service.createKml(harness.one, { name: '最旧但需保留' })
    harness.service.createShare(harness.one, {
      title: '清理阻塞验证',
      items: [{ kmlId: referenced.id }],
    })
    harness.service.trashKml(harness.one, referenced.id)
    harness.advance(1)
    const expired = harness.service.createKml(harness.one, { name: '稍新但应清理' })
    harness.service.trashKml(harness.one, expired.id)
    harness.advance(3 * 86_400_000)

    const result = harness.service.purgeExpiredKmlTrash({ limit: 1, scanBatchSize: 1 })
    assert.equal(result.deletedCount, 1)
    assert.equal(result.skippedByShare, 1)
    assert.equal(result.scannedCount, 2)
    assert.equal(harness.service.getKml(harness.one, referenced.id).status, 'trashed')
    assert.equal(harness.database.prepare('SELECT 1 FROM kml_documents WHERE id = ?').get(expired.id), undefined)
  } finally {
    harness.close()
  }
})

test('KML recycle-bin cleanup leaves the sync key intact when deletion loses a share-reference race', () => {
  const harness = createHarness({ quota: { trashRetentionDays: 2 } })
  try {
    const expired = harness.service.createKml(
      harness.one,
      { name: '并发保留回收文件' },
      { syncClientId: 'cleanup-race-client' },
    )
    const shareSource = harness.service.createKml(harness.one, { name: '分享占位文件' })
    const share = harness.service.createShare(harness.one, {
      title: '并发引用验证',
      items: [{ kmlId: shareSource.id }],
    })
    harness.service.trashKml(harness.one, expired.id)
    harness.advance(3 * 86_400_000)

    const originalPrepare = harness.database.prepare.bind(harness.database)
    let injected = false
    harness.database.prepare = sql => {
      const statement = originalPrepare(sql)
      if (!String(sql).includes('COALESCE(k.deleted_at, k.updated_at, k.created_at) AS trashed_at')) {
        return statement
      }
      return {
        all: (...params) => {
          const rows = statement.all(...params)
          if (!injected && rows.some(row => row.id === expired.id)) {
            injected = true
            originalPrepare(`
              INSERT INTO kml_share_items(id, share_id, kml_id)
              VALUES (?, ?, ?)
            `).run('shi_cleanup_race', share.id, expired.id)
          }
          return rows
        },
      }
    }
    let result
    try {
      result = harness.service.purgeExpiredKmlTrash()
    } finally {
      harness.database.prepare = originalPrepare
    }

    assert.equal(result.eligibleCount, 1)
    assert.equal(result.deletedCount, 0)
    assert.equal(harness.service.getKml(harness.one, expired.id).status, 'trashed')
    assert.equal(harness.database.prepare(`
      SELECT deleted_at FROM kml_sync_create_keys
      WHERE owner_id = ? AND client_id = ?
    `).get(harness.one.user.id, 'cleanup-race-client').deleted_at, null)
  } finally {
    harness.close()
  }
})

test('KML sync failures expose safe operation details for diagnosis', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '失败详情文件' })
    assert.throws(
      () => harness.service.syncKmlFiles(harness.one, {
        operations: [{
          action: 'update',
          kmlId: document.id,
          data: { revision: document.revision, name: '不应保存', position: 999 },
        }],
      }),
      error => {
        assert.equal(error.code, 'KML_MOVE_INVALID')
        assert.equal(error.exposeDetails, true)
        assert.deepEqual(error.details, {
          operationIndex: 0,
          action: 'update',
          kmlId: document.id,
          clientId: null,
          fileName: document.name,
          errorCode: 'KML_MOVE_INVALID',
          reason: 'KML 文件位置不正确',
          suggestion: '请重新加载 KML 后再保存；若仍失败，请检查文件所在目录的顺序。',
        })
        return true
      },
    )
  } finally {
    harness.close()
  }
})

test('KML sync failures do not expose unknown internal error details', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '内部错误脱敏文件' })
    const originalUpdateKml = harness.service.updateKml.bind(harness.service)
    harness.service.updateKml = () => {
      const error = new Error('SQLITE_ERROR: no such table: private_internal_table')
      error.code = 'SQLITE_ERROR'
      throw error
    }
    try {
      assert.throws(
        () => harness.service.syncKmlFiles(harness.one, {
          operations: [{
            action: 'update',
            kmlId: document.id,
            data: { revision: document.revision, name: '不应保存' },
          }],
        }),
        error => {
          assert.equal(error.code, 'SQLITE_ERROR')
          assert.equal(error.exposeDetails, undefined)
          assert.equal(error.details, undefined)
          return true
        },
      )
    } finally {
      harness.service.updateKml = originalUpdateKml
    }
  } finally {
    harness.close()
  }
})

test('KML sync restores a future default before promoting it in the next batch', () => {
  const harness = createHarness()
  try {
    const previousDefault = harness.service.ensureDefaultKml(harness.one)
    const futureDefault = harness.service.createKml(harness.one, {
      name: '回收站中的新默认',
      features: [],
    })
    harness.service.trashKml(harness.one, futureDefault.id)

    const restored = harness.service.syncKmlFiles(harness.one, {
      operations: [{ action: 'restore', kmlId: futureDefault.id }],
    }).results[0].document
    assert.equal(restored.status, 'active')
    assert.equal(restored.isDefault, false)

    harness.service.syncKmlFiles(harness.one, {
      operations: [
        {
          action: 'update',
          kmlId: futureDefault.id,
          data: { revision: restored.revision, isDefault: true },
        },
        {
          action: 'update',
          kmlId: previousDefault.id,
          data: { revision: previousDefault.revision, isDefault: false },
        },
      ],
    })

    assert.deepEqual(
      harness.service.listKmlFiles(harness.one).items
        .filter(item => item.isDefault)
        .map(item => item.id),
      [futureDefault.id],
    )
  } finally {
    harness.close()
  }
})

test('KML quotas reject oversized writes and sync batches roll back atomically', () => {
  const harness = createHarness({
    quota: {
      maxKmlFiles: 3,
      maxFeaturesPerKml: 2,
      maxFeaturesPerUser: 3,
    },
  })
  try {
    harness.service.ensureDefaultKml(harness.one)
    assert.throws(
      () => harness.service.createKml(harness.one, {
        name: '过多要素',
        features: [point('p1'), point('p2'), point('p3')],
      }),
      error => error.statusCode === 422 && error.code === 'QUOTA_EXCEEDED'
    )

    const before = harness.service.listKml(harness.one).total
    assert.throws(
      () => harness.service.syncKmlFiles(harness.one, {
        operations: [
          { action: 'create', clientId: 'local-ok', data: { name: '会回滚', features: [point('ok')] } },
          { action: 'create', clientId: 'local-bad', data: { name: '失败项', features: [point('a'), point('b'), point('c')] } },
        ],
      }),
      error => error.code === 'QUOTA_EXCEEDED'
    )
    assert.equal(harness.service.listKml(harness.one).total, before)
  } finally {
    harness.close()
  }
})

test('KML 内容服务对历史配额执行同样的运输层和关系收敛', () => {
  const harness = createHarness({
    quota: {
      maxKmlFileBytes: 100 * 1024 * 1024,
      maxFeaturesPerKml: 9000,
      maxFeaturesPerUser: 1000,
      unknownSetting: 123,
    },
  })
  try {
    harness.database.prepare('UPDATE users SET quota_json = ? WHERE id = ?').run(
      JSON.stringify({
        maxKmlFileBytes: 100 * 1024 * 1024,
        maxFeaturesPerKml: 5000,
        maxFeaturesPerUser: 1000,
        unknownOverride: 'legacy',
      }),
      'usr_one',
    )
    assert.deepEqual(harness.service.quotaForUser('usr_one'), {
      maxKmlFiles: 100,
      maxKmlFileBytes: 50 * 1024 * 1024,
      maxFeaturesPerKml: 1000,
      maxFeaturesPerUser: 1000,
      trashRetentionDays: 30,
    })
  } finally {
    harness.close()
  }
})

test('KML sync create is idempotent per owner and requires a stable clientId', () => {
  const harness = createHarness()
  try {
    const before = harness.service.listKmlFiles(harness.one).total
    const first = harness.service.syncKmlFiles(harness.one, {
      operations: [
        { action: 'create', clientId: 'local-stable', data: { name: '首次创建', features: [point('one')] } },
      ],
    })
    const repeated = harness.service.syncKmlFiles(harness.one, {
      operations: [
        { action: 'create', clientId: 'local-stable', data: { name: '重试时的本地新名称', features: [] } },
      ],
    })
    const otherOwner = harness.service.syncKmlFiles(harness.two, {
      operations: [
        { action: 'create', clientId: 'local-stable', data: { name: '另一用户的文件', features: [] } },
      ],
    })

    assert.equal(first.results[0].document.id, repeated.results[0].document.id)
    assert.equal(first.results[0].document.syncClientId, 'local-stable')
    assert.equal(repeated.results[0].document.name, '首次创建')
    assert.equal(harness.service.listKmlFiles(harness.one).total, before + 1)
    assert.notEqual(first.results[0].document.id, otherOwner.results[0].document.id)
    assert.throws(
      () => harness.service.syncKmlFiles(harness.one, {
        operations: [{ action: 'create', clientId: '   ', data: { name: '无幂等键', features: [] } }],
      }),
      error => error.statusCode === 400 && error.code === 'VALIDATION_FAILED'
    )

    const responseLossDelete = harness.service.syncKmlFiles(harness.one, {
      deletionIntent: 'user-confirmed',
      operations: [{ action: 'trash', clientId: 'local-stable' }],
    })
    assert.equal(responseLossDelete.results[0].document.id, first.results[0].document.id)
    assert.equal(responseLossDelete.results[0].document.status, 'trashed')
    const missingDelete = harness.service.syncKmlFiles(harness.one, {
      deletionIntent: 'user-confirmed',
      operations: [{ action: 'trash', clientId: 'never-created' }],
    })
    assert.deepEqual(missingDelete.results[0], {
      action: 'trash',
      clientId: 'never-created',
      result: { status: 'absent' },
    })
    assert.throws(
      () => harness.service.syncKmlFiles(harness.one, {
        operations: [
          { action: 'create', clientId: 'never-created', data: { name: '乱序到达的旧创建', features: [] } },
        ],
      }),
      error => error.statusCode === 409 && error.code === 'KML_CREATE_REPLAY_DELETED'
    )
    assert.equal(
      harness.database.prepare(`
        SELECT COUNT(*) AS count
        FROM kml_sync_delete_tombstones
        WHERE owner_id = ? AND client_id = ?
      `).get(harness.one.user.id, 'never-created').count,
      1
    )
    const cancelDelete = harness.service.syncKmlFiles(harness.one, {
      operations: [{ action: 'restore', clientId: 'never-created' }],
    })
    assert.deepEqual(cancelDelete.results[0], {
      action: 'restore',
      clientId: 'never-created',
      result: { status: 'absent' },
    })
    const recreatedAfterUndo = harness.service.syncKmlFiles(harness.one, {
      operations: [
        { action: 'create', clientId: 'never-created', data: { name: '撤销删除后创建', features: [] } },
      ],
    })
    assert.equal(recreatedAfterUndo.results[0].document.status, 'active')
    assert.equal(recreatedAfterUndo.results[0].document.syncClientId, 'never-created')
    assert.equal(harness.service.getKml(harness.two, otherOwner.results[0].document.id).status, 'active')

    harness.service.trashKml(harness.one, first.results[0].document.id)
    harness.service.permanentDeleteKml(harness.one, first.results[0].document.id)
    const beforeDeletedReplay = harness.service.listKmlFiles(harness.one).total
    assert.throws(
      () => harness.service.syncKmlFiles(harness.one, {
        operations: [
          { action: 'create', clientId: 'local-stable', data: { name: '不应复活', features: [] } },
        ],
      }),
      error => error.statusCode === 409 && error.code === 'KML_CREATE_REPLAY_DELETED'
    )
    assert.equal(harness.service.listKmlFiles(harness.one).total, beforeDeletedReplay)
  } finally {
    harness.close()
  }
})

test('local KML migration is idempotent and never replaces the server default', () => {
  const harness = createHarness()
  try {
    const serverDefault = harness.service.ensureDefaultKml(harness.one)
    const input = {
      batchId: 'browser-batch-0001',
      files: [
        {
          id: 'default-kml',
          name: '默认标注',
          isDefault: true,
          features: [point('migrated-point')],
        },
        {
          id: 'local-route',
          name: '本地路线',
          features: [],
        },
      ],
    }
    const first = harness.service.migrateLocalKml(harness.one, input)
    const repeated = harness.service.migrateLocalKml(harness.one, input)
    assert.equal(first.importedCount, 2)
    assert.equal(first.idempotent, false)
    assert.equal(repeated.idempotent, true)
    assert.deepEqual(repeated.imported, first.imported)
    assert.match(first.imported[0].name, /本地默认/)

    const files = harness.service.listKml(harness.one, { status: 'all', limit: 100 }).items
    assert.equal(files.length, 3)
    assert.equal(files.filter(item => item.isDefault).length, 1)
    assert.equal(files.find(item => item.isDefault).id, serverDefault.id)
  } finally {
    harness.close()
  }
})

test('KML import rejects entity declarations and export keeps normalized WGS84 data', () => {
  const harness = createHarness()
  try {
    const unsafe = `<?xml version="1.0"?><!DOCTYPE kml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><kml></kml>`
    assert.throws(
      () => harness.service.importKml(harness.one, { kmlText: unsafe }),
      error => error.code === 'KML_UNSAFE_XML'
    )

    const source = `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>导入路线</name>
        <description><![CDATA[<p><strong>总里程：</strong>12.34 km</p><p><strong>作者：</strong>山友阿明</p><script>alert(1)</script>]]></description>
        <Placemark><name>起点</name><description><![CDATA[<script>alert(1)</script><b>安全说明</b>]]></description>
          <ExtendedData><Data name="map-service:marker-icon"><value>viewpoint</value></Data></ExtendedData>
          <Point><coordinates>113.2644,23.1291,0</coordinates></Point></Placemark>
      </Document></kml>`
    const imported = harness.service.importKml(harness.one, { kmlText: source })
    assert.equal(imported.name, '导入路线')
    assert.match(imported.description, /总里程[：:]<\/strong>12\.34 km/)
    assert.match(imported.description, /作者[：:]<\/strong>山友阿明/)
    assert.doesNotMatch(imported.description, /<script|alert\(1\)/i)
    assert.equal(imported.features[0].description.includes('<script'), false)
    assert.equal(imported.features[0].markerIcon, 'viewpoint')
    const exported = harness.service.exportKml(harness.one, imported.id)
    assert.match(exported.filename, /导入路线\.kml$/)
    assert.match(exported.content, /113\.2644,23\.1291,0/)
    assert.match(exported.content, /name="map-service:marker-icon"/)
    assert.match(exported.content, /<value>viewpoint<\/value>/)

    const parsed = parseKmlText(exported.content)
    assert.equal(parsed.features.length, 1)
    assert.equal(parsed.features[0].markerIcon, 'viewpoint')
    assert.match(parsed.description, /总里程[：:]<\/strong>12\.34 km/)
    assert.match(generateKmlText('测试', parsed.features, parsed.description), /<description>.*总里程/s)
  } finally {
    harness.close()
  }
})

test('personal KML validates markerIcon as a Point-only built-in enum', () => {
  const harness = createHarness()
  try {
    const created = harness.service.createKml(harness.one, {
      name: '图标点位',
      features: [{ ...point('point-icon'), markerIcon: 'campsite' }],
    })
    assert.equal(created.features[0].markerIcon, 'campsite')

    assert.throws(
      () => harness.service.createKml(harness.one, {
        name: '非法图标',
        features: [{ ...point('point-unsafe'), markerIcon: '<svg onload=alert(1)>' }],
      }),
      error => error.statusCode === 400 && error.code === 'VALIDATION_FAILED'
    )

    const lineOnly = harness.service.createKml(harness.one, {
      name: '线段忽略图标',
      features: [{
        id: 'line-icon',
        type: 'LineString',
        name: '线路',
        markerIcon: 'flag',
        coordinates: [[113.2, 23.1], [113.3, 23.2]],
      }],
    })
    assert.equal(Object.hasOwn(lineOnly.features[0], 'markerIcon'), false)

    const importedUnknown = parseKmlText(`<?xml version="1.0"?><kml><Document><Placemark>
      <ExtendedData><Data name="map-service:marker-icon"><value>remote-svg</value></Data></ExtendedData>
      <Point><coordinates>113.2,23.1,0</coordinates></Point>
    </Placemark></Document></kml>`)
    assert.equal(Object.hasOwn(importedUnknown.features[0], 'markerIcon'), false)
  } finally {
    harness.close()
  }
})

test('personal KML resource collections preserve safe query parameters and reject credentials', () => {
  const harness = createHarness()
  try {
    const created = harness.service.createKml(harness.one, {
      name: '资源包',
      features: [{
        ...point('collection-point'),
        resourceCollection: {
          version: 1,
          viewMode: 'grid',
          items: [{
            id: 'scene',
            title: '720 云视角',
            url: 'https://www.720yun.com/t/demo?scene_id=4279442',
            type: 'iframe',
          }],
        },
      }],
    })
    assert.equal(created.features[0].resourceCollection.items[0].url, 'https://www.720yun.com/t/demo?scene_id=4279442')
    assert.throws(
      () => harness.service.updateKml(harness.one, created.id, {
        revision: created.revision,
        features: [{
          ...point('collection-point'),
          resourceCollection: {
            version: 1,
            items: [{ url: 'https://cdn.example.com/a.jpg?token=secret', type: 'image' }],
          },
        }],
      }),
      error => error.code === 'VALIDATION_FAILED' && /敏感查询参数/.test(error.message)
    )
  } finally {
    harness.close()
  }
})

test('KML import supports stable sync client id for response-loss recovery', () => {
  const harness = createHarness()
  try {
    const source = `<?xml version="1.0"?><kml><Document><name>两步路导入</name>
      <Placemark><LineString><coordinates>113.1,23.1,0 113.2,23.2,0</coordinates></LineString></Placemark>
    </Document></kml>`
    const first = harness.service.importKml(harness.one, { kmlText: source }, {
      syncClientId: '2bulu:request-one:source-hash',
    })
    const recovered = harness.service.getKmlBySyncClientId(
      harness.one,
      '2bulu:request-one:source-hash'
    )
    const repeated = harness.service.importKml(harness.one, {
      kmlText: source.replace('两步路导入', '不应覆盖原文档'),
    }, {
      syncClientId: '2bulu:request-one:source-hash',
    })

    assert.equal(recovered.id, first.id)
    assert.equal(repeated.id, first.id)
    assert.equal(repeated.name, '两步路导入')
    assert.equal(harness.service.getKmlBySyncClientId(harness.two, '2bulu:request-one:source-hash'), null)
  } finally {
    harness.close()
  }
})

test('KML import ignores an invalid resource collection and returns a warning', () => {
  const harness = createHarness()
  try {
    const source = `<?xml version="1.0"?><kml><Document><Placemark>
      <ExtendedData><Data name="map-service:resource-collection"><value>{&quot;version&quot;:99,&quot;items&quot;:[]}</value></Data></ExtendedData>
      <Point><coordinates>113.2,23.1,0</coordinates></Point>
    </Placemark></Document></kml>`
    const imported = harness.service.importKml(harness.one, { kmlText: source })
    assert.equal(Object.hasOwn(imported.features[0], 'resourceCollection'), false)
    assert.equal(imported.warnings.length, 1)
    assert.match(imported.warnings[0], /资源集合已忽略/)
  } finally {
    harness.close()
  }
})

test('favorites validate coordinates, filter private data and mark deleted KML sources unavailable', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '点位来源', features: [] })
    const favorite = harness.service.createFavorite(harness.one, {
      name: '集合点',
      note: '停车场东门',
      longitude: 113.2644,
      latitude: 23.1291,
      sourceType: 'kml',
      sourceRef: document.id,
      address: '广州市',
      category: '出行',
      tags: ['集合', '停车', '集合'],
      color: '#2563eb',
    })
    assert.deepEqual(favorite.tags, ['集合', '停车'])
    assert.equal(favorite.sourceAvailable, true)
    assert.equal(harness.service.listFavorites(harness.one, { search: '停车', tag: '集合' }).total, 1)
    assert.equal(harness.service.listFavorites(harness.two).total, 0)
    assert.throws(
      () => harness.service.getFavorite(harness.two, favorite.id),
      error => error.statusCode === 404
    )
    assert.throws(
      () => harness.service.createFavorite(harness.one, { name: '越界', longitude: 181, latitude: 0 }),
      error => error.code === 'VALIDATION_FAILED'
    )

    harness.service.trashKml(harness.one, document.id)
    assert.equal(harness.service.getFavorite(harness.one, favorite.id).sourceAvailable, false)
    assert.deepEqual(harness.service.deleteFavorite(harness.one, favorite.id), {
      id: favorite.id,
      status: 'deleted',
    })
  } finally {
    harness.close()
  }
})

test('multi-KML shares keep published snapshots when source KML is trashed', () => {
  const harness = createHarness()
  try {
    const first = harness.service.syncKmlFiles(harness.one, {
      operations: [
        { action: 'create', clientId: 'share-source', data: { name: '主路线', features: [point('first')] } },
      ],
    }).results[0].document
    const second = harness.service.createKml(harness.one, { name: '备用路线', features: [point('second')] })
    const foreign = harness.service.createKml(harness.two, { name: '他人路线', features: [] })
    assert.throws(
      () => harness.service.createShare(harness.one, {
        title: '越权分享',
        items: [{ kmlId: foreign.id }],
      }),
      error => error.statusCode === 404
    )

    const share = harness.service.createShare(harness.one, {
      title: '周末徒步路线合集',
      description: '主路线和备用路线',
      items: [
        { kmlId: first.id, position: 2, visibleByDefault: true },
        { kmlId: second.id, position: 1, visibleByDefault: false, displayName: '下撤路线' },
      ],
      allowDownload: true,
      viewConfig: { center: [23.1291, 113.2644], zoom: 13, mapMode: '2d' },
    })
    assert.equal(share.itemCount, 2)
    assert.match(share.publicId, /^[A-Za-z0-9_-]{32}$/)
    assert.throws(
      () => harness.service.getShare(harness.two, share.id),
      error => error.statusCode === 404 && error.code === 'RESOURCE_NOT_FOUND'
    )

    const manifest = harness.service.getPublicShareManifest(share.publicId)
    const serialized = JSON.stringify(manifest)
    assert.equal(manifest.itemCount, 2)
    assert.equal(manifest.items[0].name, '下撤路线')
    assert.equal(serialized.includes('ownerId'), false)
    assert.equal(serialized.includes('kmlId'), false)
    assert.equal(serialized.includes(first.id), false)
    assert.equal(serialized.includes('usr_one'), false)

    const publicFile = harness.service.getPublicShareFile(share.publicId, manifest.items[0].shareItemId)
    assert.equal(publicFile.features.length, 1)
    assert.equal(publicFile.features[0].resourceRefs.featureId, 'second')
    assert.equal(publicFile.features[0].resourceRefs.media.length, 0)
    assert.equal('ownerId' in publicFile, false)
    assert.equal('kmlId' in publicFile, false)
    assert.equal('syncClientId' in publicFile, false)
    assert.match(harness.service.exportPublicShareFile(share.publicId, manifest.items[0].shareItemId).content, /<kml/)

    harness.service.trashKml(harness.one, second.id)
    const afterOneRemoval = harness.service.getPublicShareManifest(share.publicId)
    assert.equal(afterOneRemoval.itemCount, 2)
    harness.service.restoreKml(harness.one, second.id)
    assert.equal(harness.service.getPublicShareManifest(share.publicId).itemCount, 2)
    harness.service.trashKml(harness.one, first.id)
    assert.equal(harness.service.getPublicShareManifest(share.publicId).itemCount, 2)
    const paused = harness.service.pauseShare(harness.one, share.id)
    assert.equal(paused.status, 'paused')
    const resumed = harness.service.resumeShare(harness.one, share.id)
    assert.equal(resumed.status, 'active')
  } finally {
    harness.close()
  }
})

test('公开分享页元信息在密码验证前可用且仅对 active 分享公开', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '带密码路线',
      features: [point('metadata-point')],
    })
    const share = harness.service.createShare(harness.one, {
      title: '分享标题',
      description: '<p>社交卡片说明</p>',
      items: [{ kmlId: document.id }],
      password: 'metadata-password',
    })
    assert.deepEqual(harness.service.getPublicShareMetadata(share.publicId), {
      publicId: share.publicId,
      title: '分享标题',
      description: '<p>社交卡片说明</p>',
    })

    harness.service.pauseShare(harness.one, share.id)
    assert.equal(harness.service.getPublicShareMetadata(share.publicId), null)
  } finally {
    harness.close()
  }
})

test('shared KML edits remain private until an atomic manual content sync publishes them', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '待发布路线',
      features: [point('published-point', 113.2, 23.1)],
    })
    const share = harness.service.createShare(harness.one, {
      title: '手动发布分享',
      items: [{ kmlId: document.id }],
    })
    const before = harness.service.getPublicShareManifest(share.publicId)
    const shareItemId = before.items[0].shareItemId
    const initialFile = harness.service.getPublicShareFile(share.publicId, shareItemId)

    const updatedDocument = harness.service.updateKml(harness.one, document.id, {
      revision: document.revision,
      name: '草稿路线',
      features: [point('draft-point', 114.2, 24.1)],
    })
    const newlyAddedDocument = harness.service.createKml(harness.one, {
      name: '新增公开路线',
      features: [point('newly-published-point', 115.2, 25.1)],
    })
    const pending = harness.service.getShare(harness.one, share.id)
    assert.equal(pending.syncStatus, 'pending')
    assert.equal(pending.pendingSyncItemCount, 1)
    assert.equal(pending.items[0].publishedRevision, document.revision)
    assert.equal(pending.items[0].sourceRevision, updatedDocument.revision)
    assert.equal(pending.items[0].syncStatus, 'pending')
    assert.deepEqual(
      harness.service.getPublicShareFile(share.publicId, shareItemId).features,
      initialFile.features
    )
    const pendingDocument = harness.service.getKml(harness.one, document.id)
    assert.equal(pendingDocument.shareReferenceCount, 1)
    assert.equal(pendingDocument.outdatedShareReferenceCount, 1)

    const configured = harness.service.updateShare(harness.one, share.id, {
      revision: pending.revision,
      items: [{
        kmlId: document.id,
        position: 0,
        visibleByDefault: false,
        displayName: '审核中的路线',
      }, {
        kmlId: newlyAddedDocument.id,
        position: 1,
        visibleByDefault: true,
      }],
    })
    assert.equal(configured.syncStatus, 'pending')
    assert.equal(configured.pendingSyncItemCount, 1)
    const configuredExistingItem = configured.items.find(item => item.kmlId === document.id)
    const configuredNewItem = configured.items.find(item => item.kmlId === newlyAddedDocument.id)
    assert.equal(configuredExistingItem.publishedRevision, document.revision)
    assert.equal(configuredExistingItem.sourceRevision, updatedDocument.revision)
    assert.equal(configuredExistingItem.visibleByDefault, false)
    assert.equal(configuredExistingItem.displayName, '审核中的路线')
    assert.equal(configuredNewItem.publishedRevision, newlyAddedDocument.revision)
    assert.equal(configuredNewItem.syncStatus, 'synced')
    const configuredManifest = harness.service.getPublicShareManifest(share.publicId)
    assert.deepEqual(
      harness.service.getPublicShareFile(
        share.publicId,
        configuredManifest.items.find(item => item.shareItemId === configuredExistingItem.id).shareItemId
      ).features,
      initialFile.features
    )
    assert.equal(
      harness.service.getPublicShareFile(share.publicId, configuredNewItem.id).features[0].id,
      'newly-published-point'
    )
    assert.throws(
      () => harness.service.syncShareContent(harness.two, share.id, { revision: configured.revision }),
      error => error.statusCode === 404 && error.code === 'RESOURCE_NOT_FOUND'
    )
    assert.throws(
      () => harness.service.syncShareContent(harness.one, share.id, {}),
      error => error.statusCode === 400 && error.code === 'VALIDATION_FAILED'
    )
    assert.throws(
      () => harness.service.syncShareContent(harness.one, share.id, { revision: configured.revision + 1 }),
      error => error.statusCode === 409 && error.code === 'SHARE_REVISION_CONFLICT'
    )

    harness.advance(1000)
    const synced = harness.service.syncShareContent(harness.one, share.id, {
      revision: configured.revision,
    })
    assert.equal(synced.syncStatus, 'synced')
    assert.equal(synced.pendingSyncItemCount, 0)
    assert.equal(synced.contentRevision, configured.contentRevision + 1)
    assert.equal(synced.items[0].id, shareItemId)
    assert.equal(synced.items[0].publishedRevision, updatedDocument.revision)
    const published = harness.service.getPublicShareFile(share.publicId, shareItemId)
    assert.equal(published.name, '审核中的路线')
    assert.equal(published.features[0].id, 'draft-point')
    assert.equal(harness.service.getKml(harness.one, document.id).outdatedShareReferenceCount, 0)
    assert.equal(harness.database.prepare(`
      SELECT COUNT(*) AS count FROM audit_logs
      WHERE action = 'share.content.sync' AND target_id = ?
    `).get(share.id).count, 1)
  } finally {
    harness.close()
  }
})

test('share item configuration changes preserve stale published snapshots and spatial bounds', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '范围内路线',
      features: [{ id: 'published-line', type: 'LineString', coordinates: [[113.2, 23.1], [113.3, 23.2]] }],
    })
    const share = harness.service.createShare(harness.one, {
      title: '配置更新不发布草稿',
      items: [{ kmlId: document.id }],
      spatialAccess: { mode: 'kml_bounds' },
    })
    const initialBounds = share.spatialAccess.cameraBounds
    const initialManifest = harness.service.getPublicShareManifest(share.publicId)

    harness.service.updateKml(harness.one, document.id, {
      revision: document.revision,
      features: [{ id: 'draft-line', type: 'LineString', coordinates: [[120.1, 30.1], [121.1, 31.1]] }],
    })
    const updated = harness.service.updateShare(harness.one, share.id, {
      revision: share.revision,
      items: [{ kmlId: document.id, visibleByDefault: false }],
    })

    assert.equal(updated.syncStatus, 'pending')
    assert.deepEqual(updated.spatialAccess.cameraBounds, initialBounds)
    const manifest = harness.service.getPublicShareManifest(share.publicId)
    assert.deepEqual(manifest.spatialAccess.cameraBounds, initialManifest.spatialAccess.cameraBounds)
    assert.equal(
      harness.service.getPublicShareFile(share.publicId, manifest.items[0].shareItemId).features[0].id,
      'published-line'
    )
  } finally {
    harness.close()
  }
})

test('share passwords, pause, rotation and revoke invalidate public access immediately', async () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '加密路线', features: [point('secure')] })
    assert.throws(
      () => harness.service.createShare(harness.one, {
        title: '过短密码分享',
        items: [{ kmlId: document.id }],
        password: '123',
      }),
      error => error.statusCode === 400 && error.code === 'VALIDATION_FAILED' && /至少为 4 位/.test(error.message)
    )
    assert.throws(
      () => harness.service.createShare(harness.one, {
        title: '过长密码分享',
        items: [{ kmlId: document.id }],
        password: 'x'.repeat(129),
      }),
      error => error.statusCode === 400 && error.code === 'VALIDATION_FAILED' && /不能超过 128 位/.test(error.message)
    )
    const share = harness.service.createShare(harness.one, {
      title: '加密分享',
      items: [{ kmlId: document.id }],
      password: '1234',
    })
    assert.throws(
      () => harness.service.getPublicShareManifest(share.publicId),
      error => error.statusCode === 401 && error.code === 'SHARE_PASSWORD_REQUIRED'
    )
    await assert.rejects(
      harness.service.authorizePublicShare(share.publicId, { password: 'wrong password' }, { ip: '203.0.113.1' }),
      error => error.code === 'SHARE_PASSWORD_INVALID'
    )
    const authorization = await harness.service.authorizePublicShare(
      share.publicId,
      { password: '1234' },
      { ip: '203.0.113.1' }
    )
    assert.equal(harness.service.getPublicShareManifest(share.publicId, {
      accessToken: authorization.accessToken,
    }).itemCount, 1)
    assert.equal(
      harness.database.prepare('SELECT token_hash FROM share_access_sessions').get().token_hash === authorization.accessToken,
      false
    )

    const paused = harness.service.pauseShare(harness.one, share.id)
    assert.equal(paused.status, 'paused')
    assert.throws(
      () => harness.service.getPublicShareManifest(share.publicId, { accessToken: authorization.accessToken }),
      error => error.code === 'SHARE_PAUSED'
    )
    harness.service.resumeShare(harness.one, share.id)
    const rotated = harness.service.rotateShareLink(harness.one, share.id)
    assert.notEqual(rotated.publicId, share.publicId)
    assert.throws(
      () => harness.service.getPublicShareManifest(share.publicId),
      error => error.statusCode === 404
    )
    assert.throws(
      () => harness.service.getPublicShareManifest(rotated.publicId, { accessToken: authorization.accessToken }),
      error => error.code === 'SHARE_PASSWORD_REQUIRED'
    )
    harness.service.revokeShare(harness.one, share.id)
    assert.throws(
      () => harness.service.getPublicShareManifest(rotated.publicId),
      error => error.statusCode === 404
    )
  } finally {
    harness.close()
  }
})

test('password share URL and password copy no longer require the owner to re-enter the password', async () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '带密码链接', features: [point('password-link')] })
    const share = harness.service.createShare(harness.one, {
      title: '带密码链接', items: [{ kmlId: document.id }], password: '1234',
    })
    const link = await harness.service.createPasswordShareUrl(harness.one, share.id)
    assert.equal(link.shareUrl, `/share/${share.publicId}?password=1234`)
    assert.equal(link.password, '1234')
    const authorization = await harness.service.authorizePublicShare(
      share.publicId,
      { password: '1234', accessMethod: 'password_link' },
      { visitorId: 'visitor-link-1234567890' },
    )
    harness.service.getPublicShareManifest(share.publicId, {
      accessToken: authorization.accessToken,
      visitorId: 'visitor-link-1234567890',
    })
    const events = harness.service.listShareAccessEvents(harness.one, share.id)
    assert.equal(events.total, 1)
    assert.equal(events.items[0].accessMethod, 'password_link')
    assert.equal(events.items[0].accessCount, 1)

    const current = harness.service.getShare(harness.one, share.id)
    harness.service.updateShare(harness.one, share.id, { revision: current.revision, password: '5678' })
    await assert.rejects(
      harness.service.authorizePublicShare(share.publicId, { password: '1234' }),
      error => error.code === 'SHARE_PASSWORD_INVALID' && error.statusCode === 401,
    )
  } finally {
    harness.close()
  }
})

test('password copying fails closed when the encrypted password copy is unavailable', async () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '密码副本异常', features: [point('password-secret-unavailable')] })
    const share = harness.service.createShare(harness.one, {
      title: '密码副本异常', items: [{ kmlId: document.id }], password: '1234',
    })
    harness.database.prepare("UPDATE kml_shares SET password_secret = '' WHERE id = ?").run(share.id)
    await assert.rejects(
      harness.service.createPasswordShareUrl(harness.one, share.id),
      error => error.code === 'SHARE_PASSWORD_SECRET_UNAVAILABLE' && error.statusCode === 409,
    )
    const current = harness.service.getShare(harness.one, share.id)
    harness.service.updateShare(harness.one, share.id, { revision: current.revision, password: '5678' })
    const updated = await harness.service.createPasswordShareUrl(harness.one, share.id)
    assert.equal(updated.password, '5678')
  } finally {
    harness.close()
  }
})

test('share expiry, download control, site policy and administrator moderation are enforced', () => {
  const harness = createHarness({
    publicAccessPolicy: 'inherit_site_access',
    siteAccessEnabled: true,
  })
  try {
    const document = harness.service.createKml(harness.one, { name: '受控路线', features: [point('controlled')] })
    const share = harness.service.createShare(harness.one, {
      title: '受控分享',
      items: [{ kmlId: document.id }],
      allowDownload: false,
      expiresAt: '2026-08-05T09:00:00.000Z',
    })
    assert.throws(
      () => harness.service.getPublicShareManifest(share.publicId),
      error => error.code === 'SITE_ACCESS_REQUIRED'
    )
    const manifest = harness.service.getPublicShareManifest(share.publicId, { siteAccessGranted: true })
    assert.throws(
      () => harness.service.exportPublicShareFile(share.publicId, manifest.items[0].shareItemId, { siteAccessGranted: true }),
      error => error.statusCode === 403 && error.code === 'SHARE_DOWNLOAD_DISABLED'
    )

    const blocked = harness.service.blockShare(harness.admin, share.id, { reason: '发现敏感数据' })
    assert.equal(blocked.status, 'blocked')
    assert.equal(blocked.blockedReason, '发现敏感数据')
    assert.equal(Object.hasOwn(blocked, 'publicId'), false)
    assert.equal(Object.hasOwn(blocked, 'shareUrl'), false)
    assert.throws(
      () => harness.service.getPublicShareManifest(share.publicId, { siteAccessGranted: true }),
      error => error.statusCode === 404
    )
    const unblocked = harness.service.unblockShare(harness.admin, share.id)
    assert.equal(unblocked.status, 'paused')
    harness.service.resumeShare(harness.one, share.id)
    harness.advance(1000 * 60 * 61)
    assert.throws(
      () => harness.service.getPublicShareManifest(share.publicId, { siteAccessGranted: true }),
      error => error.statusCode === 410 && error.code === 'SHARE_EXPIRED'
    )

    const moderation = harness.service.listAllShares(harness.admin)
    assert.equal(moderation.total, 1)
    assert.equal(moderation.items[0].owner.id, 'usr_one')
    assert.equal(Object.hasOwn(moderation.items[0], 'publicId'), false)
    assert.equal(Object.hasOwn(moderation.items[0], 'shareUrl'), false)
    assert.equal(Object.hasOwn(moderation.items[0], 'description'), false)

    const contentAuditor = actor('usr_admin', ['admin.share.moderate', 'kml.any.read'])
    const inspectable = harness.service.listAllShares(contentAuditor)
    assert.equal(inspectable.items[0].publicId, share.publicId)
    assert.equal(inspectable.items[0].shareUrl, `/share/${share.publicId}`)
  } finally {
    harness.close()
  }
})

test('share deletion is owner/admin authorized, cascades access data, and preserves source KML', async () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '可删除分享源',
      features: [point('deletion-point')],
    })
    const share = harness.service.createShare(harness.one, {
      title: '待删除分享',
      items: [{ kmlId: document.id }],
      password: 'delete-password',
    })
    const access = await harness.service.authorizePublicShare(share.publicId, { password: 'delete-password' })
    harness.service.getPublicShareManifest(share.publicId, { accessToken: access.accessToken })
    assert.equal(harness.database.prepare('SELECT COUNT(*) AS count FROM share_access_sessions WHERE share_id = ?').get(share.id).count, 1)
    assert.equal(harness.database.prepare('SELECT COUNT(*) AS count FROM share_access_events WHERE share_id = ?').get(share.id).count, 1)

    assert.throws(
      () => harness.service.deleteShare(harness.two, share.id),
      error => error.statusCode === 404 && error.code === 'RESOURCE_NOT_FOUND'
    )
    const deleted = harness.service.deleteShare(harness.one, share.id)
    assert.deepEqual(deleted, {
      id: share.id,
      status: 'deleted',
      deletedItems: 1,
      deletedAccessSessions: 1,
      deletedAccessEvents: 1,
      sourceKmlPreserved: true,
    })
    assert.equal(harness.database.prepare('SELECT COUNT(*) AS count FROM kml_documents WHERE id = ?').get(document.id).count, 1)
    assert.equal(harness.service.getKml(harness.one, document.id).id, document.id)
    assert.equal(harness.database.prepare('SELECT COUNT(*) AS count FROM kml_share_items WHERE share_id = ?').get(share.id).count, 0)
    assert.throws(
      () => harness.service.getPublicShareManifest(share.publicId),
      error => error.statusCode === 404 && error.code === 'RESOURCE_NOT_FOUND'
    )

    const adminShare = harness.service.createShare(harness.one, {
      title: '管理员删除分享',
      items: [{ kmlId: document.id }],
    })
    const adminDeleted = harness.service.deleteShareForAdmin(harness.admin, adminShare.id)
    assert.equal(adminDeleted.status, 'deleted')
    assert.equal(harness.database.prepare('SELECT COUNT(*) AS count FROM kml_documents WHERE id = ?').get(document.id).count, 1)
  } finally {
    harness.close()
  }
})

test('spatial preview returns a safe bounds summary and rejects empty or oversized ranges', () => {
  const harness = createHarness({
    share: {
      spatialMaxAreaKm2: 500,
      spatialMaxDiagonalKm: 300,
    },
  })
  try {
    const document = harness.service.createKml(harness.one, {
      name: '空间预览',
      features: [
        point('preview-point', 113.2644, 23.1291),
        { id: 'preview-line', type: 'LineString', coordinates: [[113.2, 23.1], [113.3, 23.2]] },
      ],
    })
    const preview = harness.service.getSpatialPreview(harness.one, {
      spatialAccess: { mode: 'kml_bounds' },
      items: [{ kmlId: document.id }],
    })
    assert.equal(preview.mode, 'kml_bounds')
    assert.equal(preview.status, 'ready')
    assert.equal(preview.spatialAccessEligible, true)
    assert.equal(typeof preview.areaKm2, 'number')
    assert.equal(Object.hasOwn(preview, 'projection'), false)
    assert.equal(Object.hasOwn(preview, 'primitives'), false)
    assert.equal(Object.hasOwn(preview, 'sourceRevisionHash'), false)

    const empty = harness.service.createKml(harness.one, { name: '空文件', features: [] })
    assert.throws(
      () => harness.service.getSpatialPreview(harness.one, {
        spatialAccess: { mode: 'kml_bounds' }, items: [{ kmlId: empty.id }],
      }),
      error => error.code === 'SHARE_SPATIAL_BOUNDS_EMPTY'
    )

    const oversized = harness.service.createKml(harness.one, {
      name: '超大范围',
      features: [{ id: 'wide', type: 'LineString', coordinates: [[100, 0], [105, 0]] }],
    })
    assert.throws(
      () => harness.service.getSpatialPreview(harness.one, {
        spatialAccess: { mode: 'kml_bounds' }, items: [{ kmlId: oversized.id }],
      }),
      error => error.code === 'SHARE_SPATIAL_RANGE_TOO_LARGE'
    )
  } finally {
    harness.close()
  }
})

test('空间受限分享保存低缩放瓦片放宽阈值并在公开视图返回', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '低缩放底图路线',
      features: [point('low-zoom')],
    })
    const share = harness.service.createShare(harness.one, {
      title: '低缩放底图分享',
      items: [{ kmlId: document.id }],
      spatialAccess: { mode: 'kml_bounds', unrestrictedTileMaxZoom: 8 },
    })
    assert.equal(share.spatialAccess.unrestrictedTileMaxZoom, 8)
    const manifest = harness.service.getPublicShareManifest(share.publicId)
    assert.equal(manifest.spatialAccess.unrestrictedTileMaxZoom, 8)

    const updated = harness.service.updateShare(harness.one, share.id, {
      revision: share.revision,
      spatialAccess: { mode: 'kml_bounds', unrestrictedTileMaxZoom: 6 },
    })
    assert.equal(updated.spatialAccess.unrestrictedTileMaxZoom, 6)
  } finally {
    harness.close()
  }
})

test('低缩放瓦片放宽阈值受管理员最大级别限制，且只接受整数', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '低缩放阈值校验',
      features: [point('threshold')],
    })
    for (const value of [-1, 1.5, 25, 'abc']) {
      assert.throws(
        () => harness.service.createShare(harness.one, {
          title: `非法阈值 ${value}`,
          items: [{ kmlId: document.id }],
          spatialAccess: { mode: 'kml_bounds', unrestrictedTileMaxZoom: value },
        }),
        error => error.code === 'SHARE_SPATIAL_TILE_ZOOM_INVALID'
      )
    }
    const allowed = harness.service.createShare(harness.one, {
      title: '管理员上限内的阈值',
      items: [{ kmlId: document.id }],
      spatialAccess: { mode: 'kml_bounds', unrestrictedTileMaxZoom: 14 },
    })
    assert.equal(allowed.spatialAccess.unrestrictedTileMaxZoom, 14)

    assert.throws(
      () => harness.service.createShare(harness.one, {
        title: '超过管理员上限',
        items: [{ kmlId: document.id }],
        spatialAccess: { mode: 'kml_bounds', unrestrictedTileMaxZoom: 15 },
      }),
      error => error.code === 'SHARE_SPATIAL_TILE_ZOOM_TOO_HIGH'
    )
  } finally {
    harness.close()
  }
})

test('管理员下调放宽最大级别时存量分享自动收敛', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '收敛阈值路线',
      features: [point('cap-threshold')],
    })
    const share = harness.service.createShare(harness.one, {
      title: '待收敛分享',
      items: [{ kmlId: document.id }],
      spatialAccess: { mode: 'kml_bounds', unrestrictedTileMaxZoom: 14 },
    })
    harness.settings.share.spatialUnrestrictedTileMaxZoom = 12
    harness.settings.share.spatialPolicyRevision = 2
    const result = harness.service.revalidateSpatialShare(share.id, harness.settings)
    assert.equal(result.affected, true)
    assert.equal(harness.service.getPublicShareManifest(share.publicId).spatialAccess.unrestrictedTileMaxZoom, 12)
  } finally {
    harness.close()
  }
})

test('unlimited password authorization requires spatial policy and creates a non-expiring session', async () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '不限期路线', features: [point('unlimited')] })
    assert.throws(
      () => harness.service.createShare(harness.one, {
        title: '无密码不限期', items: [{ kmlId: document.id }],
        spatialAccess: { mode: 'kml_bounds' }, passwordAccess: { ttlMode: 'unlimited' },
      }),
      error => error.code === 'SHARE_UNLIMITED_ACCESS_REQUIRES_PASSWORD'
    )
    assert.throws(
      () => harness.service.createShare(harness.one, {
        title: '无空间不限期', items: [{ kmlId: document.id }], password: '1234',
        passwordAccess: { ttlMode: 'unlimited' },
      }),
      error => error.code === 'SHARE_UNLIMITED_ACCESS_REQUIRES_SPATIAL'
    )

    const share = harness.service.createShare(harness.one, {
      title: '合规不限期', items: [{ kmlId: document.id }], password: '1234',
      spatialAccess: { mode: 'kml_bounds' }, passwordAccess: { ttlMode: 'unlimited' },
    })
    assert.equal(share.passwordAccess.ttlMode, 'unlimited')
    const authorization = await harness.service.authorizePublicShare(share.publicId, { password: '1234' })
    assert.equal(authorization.ttlMode, 'unlimited')
    assert.equal(authorization.expiresAt, null)
    const session = harness.database.prepare(`
      SELECT ttl_mode, expires_at, revoked_at FROM share_access_sessions WHERE share_id = ?
    `).get(share.id)
    assert.equal(session.ttl_mode, 'unlimited')
    assert.equal(session.expires_at, null)
    assert.equal(session.revoked_at, null)
    assert.equal(harness.service.getPublicShareManifest(share.publicId, { accessToken: authorization.accessToken }).itemCount, 1)
  } finally {
    harness.close()
  }
})

test('管理员关闭无密码分享后拒绝新建、移除密码和继续保存无密码分享', () => {
  const harness = createHarness({ share: { passwordlessSharingEnabled: false } })
  try {
    const document = harness.service.createKml(harness.one, { name: '密码策略', features: [point('password-policy')] })
    assert.throws(
      () => harness.service.createShare(harness.one, {
        title: '不应创建', items: [{ kmlId: document.id }],
      }),
      error => error.code === 'SHARE_PASSWORDLESS_DISABLED' && error.statusCode === 422
    )

    harness.settings.share.passwordlessSharingEnabled = true
    const passwordless = harness.service.createShare(harness.one, {
      title: '已有无密码链接', items: [{ kmlId: document.id }],
    })
    harness.settings.share.passwordlessSharingEnabled = false

    assert.throws(
      () => harness.service.syncShareContent(harness.one, passwordless.id, {
        revision: passwordless.revision,
      }),
      error => error.code === 'SHARE_PASSWORDLESS_DISABLED' && error.statusCode === 422
    )

    assert.throws(
      () => harness.service.rotateShareLink(harness.one, passwordless.id),
      error => error.code === 'SHARE_PASSWORDLESS_DISABLED' && error.statusCode === 422
    )

    assert.throws(
      () => harness.service.updateShare(harness.one, passwordless.id, {
        revision: passwordless.revision,
        title: '不允许继续保存',
      }),
      error => error.code === 'SHARE_PASSWORDLESS_DISABLED' && error.statusCode === 422
    )

    const passwordShare = harness.service.createShare(harness.one, {
      title: '已有密码链接', items: [{ kmlId: document.id }], password: '1234',
    })
    assert.throws(
      () => harness.service.updateShare(harness.one, passwordShare.id, {
        revision: passwordShare.revision,
        password: null,
      }),
      error => error.code === 'SHARE_PASSWORDLESS_DISABLED' && error.statusCode === 422
    )
  } finally {
    harness.close()
  }
})

test('管理员开启后无密码分享支持不限链接期限，但不限密码授权仍要求密码', () => {
  const harness = createHarness({ share: { passwordlessSharingEnabled: true } })
  try {
    const document = harness.service.createKml(harness.one, { name: '无密码链接', features: [point('passwordless')] })
    const share = harness.service.createShare(harness.one, {
      title: '无固定期限无密码', items: [{ kmlId: document.id }], expiresAt: null,
    })
    assert.equal(share.passwordProtected, false)
    assert.equal(share.expiresAt, null)
    assert.equal(share.passwordAccess.ttlMode, 'not_applicable')

    assert.throws(
      () => harness.service.createShare(harness.one, {
        title: '无密码不限授权', items: [{ kmlId: document.id }],
        spatialAccess: { mode: 'kml_bounds' },
        passwordAccess: { ttlMode: 'unlimited' },
      }),
      error => error.code === 'SHARE_UNLIMITED_ACCESS_REQUIRES_PASSWORD'
    )
  } finally {
    harness.close()
  }
})

test('share access session touch is throttled during tile and manifest requests', async () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '触碰节流', features: [point('touch')] })
    const share = harness.service.createShare(harness.one, {
      title: '触碰节流', items: [{ kmlId: document.id }], password: '1234',
    })
    const authorization = await harness.service.authorizePublicShare(share.publicId, { password: '1234' })
    const initial = harness.database.prepare(`
      SELECT last_accessed_at FROM share_access_sessions WHERE share_id = ?
    `).get(share.id).last_accessed_at

    harness.advance(60 * 1000)
    assert.equal(harness.service.getPublicShareManifest(share.publicId, { accessToken: authorization.accessToken }).itemCount, 1)
    const withinWindow = harness.database.prepare(`
      SELECT last_accessed_at FROM share_access_sessions WHERE share_id = ?
    `).get(share.id).last_accessed_at
    assert.equal(withinWindow, initial)

    harness.advance(5 * 60 * 1000)
    harness.service.getPublicShareManifest(share.publicId, { accessToken: authorization.accessToken })
    const afterWindow = harness.database.prepare(`
      SELECT last_accessed_at FROM share_access_sessions WHERE share_id = ?
    `).get(share.id).last_accessed_at
    assert.notEqual(afterWindow, initial)
  } finally {
    harness.close()
  }
})

test('independent spatial shares are readable without a password and never expose internal scope data', () => {
  const harness = createHarness({ publicAccessPolicy: 'independent' })
  try {
    const document = harness.service.createKml(harness.one, { name: '半公开路线', features: [point('semi-public')] })
    const share = harness.service.createShare(harness.one, {
      title: '半公开', items: [{ kmlId: document.id }],
      spatialAccess: { mode: 'kml_bounds' },
    })
    const manifest = harness.service.getPublicShareManifest(share.publicId)
    const serialized = JSON.stringify(manifest)
    assert.equal(manifest.spatialAccess.mode, 'kml_bounds')
    assert.equal(manifest.passwordProtected, false)
    assert.equal(serialized.includes('internalScope'), false)
    assert.equal(serialized.includes('projection'), false)
    assert.equal(serialized.includes('primitives'), false)
    assert.equal(serialized.includes('sourceRevisionHash'), false)
    assert.equal(serialized.includes(document.id), false)
    assert.equal(harness.service.getShareRuntimeMetrics(harness.admin).items.some(item => (
      item.shareId === share.id && item.event === 'spatial_scope_cache' && item.decision === 'hit'
    )), true)
  } finally {
    harness.close()
  }
})

test('public share files strip legacy resource collection credentials from snapshots', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '历史资源包',
      features: [point('legacy-collection')],
    })
    const share = harness.service.createShare(harness.one, {
      title: '历史资源包',
      items: [{ kmlId: document.id }],
    })
    const manifest = harness.service.getPublicShareManifest(share.publicId)
    const itemId = manifest.items[0].shareItemId
    const row = harness.database.prepare('SELECT published_snapshot_json FROM kml_share_items WHERE id = ?').get(itemId)
    const snapshot = JSON.parse(row.published_snapshot_json)
    snapshot.features[0].resourceCollection = {
      version: 1,
      items: [{ id: 'legacy', url: 'https://cdn.example.com/a.jpg?token=secret', type: 'image' }],
    }
    harness.database.prepare('UPDATE kml_share_items SET published_snapshot_json = ? WHERE id = ?')
      .run(JSON.stringify(snapshot), itemId)

    const publicFile = harness.service.getPublicShareFile(share.publicId, itemId)
    assert.equal(Object.hasOwn(publicFile.features[0], 'resourceCollection'), false)
    assert.doesNotMatch(JSON.stringify(publicFile), /secret|token=/i)
  } finally {
    harness.close()
  }
})

test('tampered published media references fail closed for manifest and file without repairing the snapshot', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '资源引用篡改',
      features: [point('tampered-media', 113.2, 23.1)],
    })
    const share = harness.service.createShare(harness.one, {
      title: '资源引用篡改',
      items: [{ kmlId: document.id }],
    })
    const itemId = share.items[0].id
    const row = harness.database.prepare('SELECT published_snapshot_json FROM kml_share_items WHERE id = ?').get(itemId)
    const snapshot = JSON.parse(row.published_snapshot_json)
    snapshot.features[0].description = '<img src="https://cdn.example.com/photo.jpg">'
    snapshot.features[0].resourceRefs.media = [{
      ...snapshot.features[0].resourceRefs.media[0],
      mediaId: 'media_tampered',
    }]
    const tamperedJson = JSON.stringify(snapshot)
    harness.database.prepare('UPDATE kml_share_items SET published_snapshot_json = ? WHERE id = ?')
      .run(tamperedJson, itemId)

    for (const read of [
      () => harness.service.getPublicShareManifest(share.publicId),
      () => harness.service.getPublicShareFile(share.publicId, itemId),
    ]) {
      assert.throws(read, error => error.statusCode === 503 && error.code === 'PUBLISHED_RESOURCE_REFERENCE_INVALID')
    }
    assert.equal(
      harness.database.prepare('SELECT published_snapshot_json FROM kml_share_items WHERE id = ?').get(itemId).published_snapshot_json,
      tamperedJson
    )
  } finally {
    harness.close()
  }
})

test('sync rejects illegal or duplicate resource identities and preserves the published snapshot', () => {
  for (const features of [
    [{ type: 'Point', name: '缺失 ID', coordinates: [113.2, 23.1] }],
    [point('duplicate'), point('duplicate', 113.3, 23.2)],
  ]) {
    const harness = createHarness()
    try {
      const document = harness.service.createKml(harness.one, {
        name: '同步资源引用校验',
        features: [point('original')],
      })
      const share = harness.service.createShare(harness.one, {
        title: '同步资源引用校验',
        items: [{ kmlId: document.id }],
      })
      const itemId = share.items[0].id
      const before = harness.database.prepare(
        'SELECT published_snapshot_json, published_revision FROM kml_share_items WHERE id = ?'
      ).get(itemId)
      harness.database.prepare(`
        UPDATE kml_documents
        SET features_json = ?, feature_count = ?, revision = revision + 1, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(features), features.length, '2026-08-05T08:01:00.000Z', document.id)
      const currentShare = harness.service.getShare(harness.one, share.id)
      assert.throws(
        () => harness.service.syncShareContent(harness.one, share.id, { revision: currentShare.revision }),
        error => error.statusCode === 409 && error.code === 'PUBLISHED_RESOURCE_REFERENCE_INVALID'
      )
      const after = harness.database.prepare(
        'SELECT published_snapshot_json, published_revision FROM kml_share_items WHERE id = ?'
      ).get(itemId)
      assert.deepEqual(after, before)
    } finally {
      harness.close()
    }
  }
})

test('legacy published snapshots without resource references remain readable without database repair', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '旧资源快照',
      features: [point('legacy-no-refs')],
    })
    const share = harness.service.createShare(harness.one, {
      title: '旧资源快照',
      items: [{ kmlId: document.id }],
    })
    const itemId = share.items[0].id
    const row = harness.database.prepare('SELECT published_snapshot_json FROM kml_share_items WHERE id = ?').get(itemId)
    const legacy = JSON.parse(row.published_snapshot_json)
    delete legacy.resourceRefsVersion
    delete legacy.features[0].resourceRefs
    const legacyJson = JSON.stringify(legacy)
    harness.database.prepare('UPDATE kml_share_items SET published_snapshot_json = ? WHERE id = ?')
      .run(legacyJson, itemId)

    const manifest = harness.service.getPublicShareManifest(share.publicId)
    const file = harness.service.getPublicShareFile(share.publicId, itemId)
    assert.equal(manifest.itemCount, 1)
    assert.equal(file.features[0].resourceRefs.featureId, 'legacy-no-refs')
    assert.equal(
      harness.database.prepare('SELECT published_snapshot_json FROM kml_share_items WHERE id = ?').get(itemId).published_snapshot_json,
      legacyJson
    )
  } finally {
    harness.close()
  }
})

test('partially present published resource references are not repaired as legacy snapshots', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '不完整资源快照',
      features: [point('partial-refs')],
    })
    const share = harness.service.createShare(harness.one, {
      title: '不完整资源快照',
      items: [{ kmlId: document.id }],
    })
    const itemId = share.items[0].id
    const row = harness.database.prepare('SELECT published_snapshot_json FROM kml_share_items WHERE id = ?').get(itemId)
    const snapshot = JSON.parse(row.published_snapshot_json)
    delete snapshot.features[0].resourceRefs.media
    const partialJson = JSON.stringify(snapshot)
    harness.database.prepare('UPDATE kml_share_items SET published_snapshot_json = ? WHERE id = ?')
      .run(partialJson, itemId)

    assert.throws(
      () => harness.service.getPublicShareManifest(share.publicId),
      error => error.statusCode === 503 && error.code === 'PUBLISHED_RESOURCE_REFERENCE_INVALID'
    )
    assert.equal(
      harness.database.prepare('SELECT published_snapshot_json FROM kml_share_items WHERE id = ?').get(itemId).published_snapshot_json,
      partialJson
    )
  } finally {
    harness.close()
  }
})

test('corrupt published snapshots fail closed for manifest and file', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '损坏快照',
      features: [point('corrupt-snapshot')],
    })
    const share = harness.service.createShare(harness.one, {
      title: '损坏快照',
      items: [{ kmlId: document.id }],
    })
    const itemId = share.items[0].id
    const corruptJson = '{"features":'
    harness.database.prepare('UPDATE kml_share_items SET published_snapshot_json = ? WHERE id = ?')
      .run(corruptJson, itemId)

    for (const read of [
      () => harness.service.getPublicShareManifest(share.publicId),
      () => harness.service.getPublicShareFile(share.publicId, itemId),
    ]) {
      assert.throws(read, error => error.statusCode === 503 && error.code === 'PUBLISHED_RESOURCE_REFERENCE_INVALID')
    }
    assert.equal(
      harness.database.prepare('SELECT published_snapshot_json FROM kml_share_items WHERE id = ?').get(itemId).published_snapshot_json,
      corruptJson
    )
  } finally {
    harness.close()
  }
})

test('changing a password, rotating a link, or blocking a share revokes existing access sessions', async () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, { name: '撤销测试', features: [point('revoke')] })
    const share = harness.service.createShare(harness.one, { title: '撤销', items: [{ kmlId: document.id }], password: '1234' })
    const first = await harness.service.authorizePublicShare(share.publicId, { password: '1234' })
    harness.service.updateShare(harness.one, share.id, { revision: share.revision, password: '5678' })
    let session = harness.database.prepare('SELECT revoked_at, revoke_reason FROM share_access_sessions LIMIT 1').get()
    assert.ok(session.revoked_at)
    assert.equal(session.revoke_reason, 'share.password.update')
    assert.throws(() => harness.service.getPublicShareManifest(share.publicId, { accessToken: first.accessToken }), error => error.code === 'SHARE_PASSWORD_REQUIRED')

    const current = harness.service.getShare(harness.one, share.id)
    const second = await harness.service.authorizePublicShare(current.publicId, { password: '5678' })
    const rotated = harness.service.rotateShareLink(harness.one, share.id)
    session = harness.database.prepare('SELECT revoked_at, revoke_reason FROM share_access_sessions WHERE token_hash = ?').get(
      hashToken(second.accessToken)
    )
    assert.ok(session.revoked_at)
    assert.equal(session.revoke_reason, 'share.rotate-link')
    assert.throws(() => harness.service.getPublicShareManifest(rotated.publicId, { accessToken: second.accessToken }), error => error.code === 'SHARE_PASSWORD_REQUIRED')

    const third = await harness.service.authorizePublicShare(rotated.publicId, { password: '5678' })
    harness.service.blockShare(harness.admin, share.id, { reason: '策略违规' })
    session = harness.database.prepare('SELECT revoked_at, revoke_reason FROM share_access_sessions WHERE token_hash = ?').get(
      hashToken(third.accessToken)
    )
    assert.ok(session.revoked_at)
    assert.equal(session.revoke_reason, 'admin.share.block')
  } finally {
    harness.close()
  }
})

test('manual sync rejects oversized unlimited content and preserves the published snapshot and access session', async () => {
  const harness = createHarness({
    share: {
      spatialMaxAreaKm2: 10000,
      spatialMaxDiagonalKm: 300,
      unlimitedAccessMaxAreaKm2: 2000,
      unlimitedAccessMaxDiagonalKm: 100,
    },
  })
  try {
    const document = harness.service.createKml(harness.one, {
      name: '会扩大路线',
      features: [{ id: 'moving', type: 'LineString', coordinates: [[113.2644, 23.1291], [113.3, 23.16]] }],
    })
    const share = harness.service.createShare(harness.one, {
      title: '无限授权', items: [{ kmlId: document.id }], password: '1234',
      spatialAccess: { mode: 'kml_bounds' }, passwordAccess: { ttlMode: 'unlimited' },
    })
    const authorization = await harness.service.authorizePublicShare(share.publicId, { password: '1234' })
    harness.service.updateKml(harness.one, document.id, {
      revision: document.revision,
      features: [{ id: 'moving', type: 'LineString', coordinates: [[113.2, 23.1291], [115.2, 23.16]] }],
    })
    const pending = harness.service.getShare(harness.one, share.id)
    assert.equal(pending.passwordAccess.ttlMode, 'unlimited')
    assert.equal(pending.syncStatus, 'pending')
    const originalManifest = harness.service.getPublicShareManifest(share.publicId, {
      accessToken: authorization.accessToken,
    })
    assert.throws(
      () => harness.service.syncShareContent(harness.one, share.id, { revision: pending.revision }),
      error => error.code === 'SHARE_UNLIMITED_ACCESS_RANGE_TOO_LARGE'
    )
    const session = harness.database.prepare('SELECT revoked_at, revoke_reason FROM share_access_sessions LIMIT 1').get()
    assert.equal(session.revoked_at, null)
    assert.equal(session.revoke_reason, '')
    const afterFailure = harness.service.getPublicShareManifest(share.publicId, {
      accessToken: authorization.accessToken,
    })
    assert.deepEqual(afterFailure.spatialAccess.cameraBounds, originalManifest.spatialAccess.cameraBounds)
    assert.equal(harness.service.getShare(harness.one, share.id).syncStatus, 'pending')
  } finally {
    harness.close()
  }
})

test('updating spatial share metadata or status preserves the computed KML scope', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '保持范围路线',
      features: [{ id: 'stable-line', type: 'LineString', coordinates: [[113.2, 23.1], [113.4, 23.3]] }],
    })
    const created = harness.service.createShare(harness.one, {
      title: '原始标题',
      items: [{ kmlId: document.id }],
      spatialAccess: { mode: 'kml_bounds' },
    })
    const initialScope = JSON.parse(harness.database.prepare(
      'SELECT spatial_scope_json FROM kml_shares WHERE id = ?'
    ).get(created.id).spatial_scope_json)

    const renamed = harness.service.updateShare(harness.one, created.id, {
      revision: created.revision,
      title: '新标题',
    })
    assert.equal(renamed.title, '新标题')
    assert.deepEqual(renamed.spatialAccess.cameraBounds, initialScope.cameraBounds)

    const paused = harness.service.pauseShare(harness.one, created.id)
    assert.equal(paused.status, 'paused')
    assert.deepEqual(paused.spatialAccess.cameraBounds, initialScope.cameraBounds)

    const resumed = harness.service.resumeShare(harness.one, created.id)
    assert.equal(resumed.status, 'active')
    assert.deepEqual(resumed.spatialAccess.cameraBounds, initialScope.cameraBounds)
    const finalScope = JSON.parse(harness.database.prepare(
      'SELECT spatial_scope_json FROM kml_shares WHERE id = ?'
    ).get(created.id).spatial_scope_json)
    assert.equal(finalScope.sourceRevisionHash, initialScope.sourceRevisionHash)
  } finally {
    harness.close()
  }
})

test('spatial recalculation retries when a KML revision changes after computation', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '并发更新路线',
      features: [{ id: 'moving-line', type: 'LineString', coordinates: [[113.2, 23.1], [113.3, 23.2]] }],
    })
    const share = harness.service.createShare(harness.one, {
      title: '并发重算',
      items: [{ kmlId: document.id }],
      spatialAccess: { mode: 'kml_bounds' },
    })
    const originalCompute = harness.service.computeSpatialState.bind(harness.service)
    let changedDuringComputation = false
    harness.service.computeSpatialState = (items, settings) => {
      const state = originalCompute(items, settings)
      harness.advance(25)
      if (!changedDuringComputation) {
        changedDuringComputation = true
        harness.database.prepare(`
          UPDATE kml_share_items
          SET published_snapshot_json = ?, published_revision = published_revision + 1,
              published_at = ?
          WHERE share_id = ?
        `).run(JSON.stringify({
          name: '并发更新路线',
          features: [{ id: 'moving-line', type: 'LineString', coordinates: [[120.1, 30.1], [120.3, 30.2]] }],
          featureCount: 1,
          revision: document.revision + 1,
          updatedAt: '2026-08-05T08:01:00.000Z',
        }), '2026-08-05T08:01:00.000Z', share.id)
      }
      return state
    }

    const result = harness.service.revalidateSpatialShare(share.id)
    assert.equal(result.recalculating, undefined)
    assert.equal(result.status, 'ready')
    const recalculateMetric = harness.service.getShareRuntimeMetrics(harness.admin).items.find(item => (
      item.shareId === share.id && item.event === 'spatial_recalculate' && item.decision === 'ready'
    ))
    assert.equal(recalculateMetric.totalDurationMs, 50)
    assert.equal(recalculateMetric.maxDurationMs, 50)
    const scope = JSON.parse(harness.database.prepare(
      'SELECT spatial_scope_json FROM kml_shares WHERE id = ?'
    ).get(share.id).spatial_scope_json)
    assert.deepEqual(scope.sourceRevisions, [{ id: document.id, revision: document.revision + 1 }])
    assert.ok(scope.cameraBounds[0] > 119)
    assert.ok(scope.cameraBounds[2] < 121)
  } finally {
    harness.close()
  }
})

test('spatial recalculation records failed computations without exposing inputs', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '失败指标路线',
      features: [point('metric-failure')],
    })
    const share = harness.service.createShare(harness.one, {
      title: '失败指标',
      items: [{ kmlId: document.id }],
      spatialAccess: { mode: 'kml_bounds' },
    })
    harness.service.computeSpatialState = () => {
      harness.advance(17)
      const error = new Error('内部测试失败')
      error.code = 'SPATIAL_TEST_FAILURE'
      throw error
    }

    assert.throws(
      () => harness.service.revalidateSpatialShare(share.id),
      error => error.code === 'SPATIAL_TEST_FAILURE'
    )
    assert.equal(
      harness.database.prepare('SELECT status FROM kml_shares WHERE id = ?').get(share.id).status,
      'active'
    )
    const metrics = harness.service.getShareRuntimeMetrics(harness.admin)
    const failure = metrics.items.find(item => (
      item.shareId === share.id && item.event === 'spatial_recalculate' && item.decision === 'SPATIAL_TEST_FAILURE'
    ))
    assert.equal(failure.totalDurationMs, 17)
    assert.equal(JSON.stringify(failure).includes('内部测试失败'), false)
  } finally {
    harness.close()
  }
})

test('spatial recalculation fails closed after repeated KML revision conflicts', () => {
  const harness = createHarness()
  try {
    const document = harness.service.createKml(harness.one, {
      name: '持续变化路线',
      features: [{ id: 'changing-line', type: 'LineString', coordinates: [[113.2, 23.1], [113.3, 23.2]] }],
    })
    const share = harness.service.createShare(harness.one, {
      title: '持续冲突',
      items: [{ kmlId: document.id }],
      spatialAccess: { mode: 'kml_bounds' },
    })
    const initialRow = harness.database.prepare(
      'SELECT revision, spatial_scope_json FROM kml_shares WHERE id = ?'
    ).get(share.id)
    const originalCompute = harness.service.computeSpatialState.bind(harness.service)
    let conflictCount = 0
    harness.service.computeSpatialState = (items, settings) => {
      const state = originalCompute(items, settings)
      conflictCount += 1
      harness.database.prepare(`
        UPDATE kml_share_items
        SET published_snapshot_json = ?, published_revision = published_revision + 1,
            published_at = ?
        WHERE share_id = ?
      `).run(JSON.stringify({
        name: '持续变化路线',
        features: [{
          id: 'changing-line',
          type: 'LineString',
          coordinates: [[120 + conflictCount, 30], [120.2 + conflictCount, 30.2]],
        }],
        featureCount: 1,
        revision: document.revision + conflictCount,
        updatedAt: `2026-08-05T08:0${conflictCount}:00.000Z`,
      }), `2026-08-05T08:0${conflictCount}:00.000Z`, share.id)
      return state
    }

    const result = harness.service.revalidateSpatialShare(share.id)
    assert.equal(result.recalculating, true)
    assert.equal(result.status, 'recalculating')
    assert.equal(conflictCount, 2)
    const finalRow = harness.database.prepare(
      'SELECT revision, status, spatial_scope_json FROM kml_shares WHERE id = ?'
    ).get(share.id)
    assert.equal(finalRow.revision, initialRow.revision)
    assert.equal(finalRow.status, 'active')
    assert.equal(finalRow.spatial_scope_json, initialRow.spatial_scope_json)
    const metrics = harness.service.getShareRuntimeMetrics(harness.admin)
    const conflictMetric = metrics.items.find(item => (
      item.shareId === share.id && item.event === 'spatial_recalculate' && item.decision === 'conflict'
    ))
    assert.equal(conflictMetric.count, 1)
    assert.equal(conflictMetric.totalDurationMs, 0)
  } finally {
    harness.close()
  }
})

test('public share tile and manifest rate limits isolate shares and IPs and reset after the window', () => {
  const harness = createHarness({
    shareTileRateLimit: { maxRequests: 2, windowMs: 1000, maxEntries: 100 },
    shareManifestRateLimit: { maxRequests: 2, windowMs: 1000, maxEntries: 100 },
  })
  try {
    const document = harness.service.createKml(harness.one, {
      name: '限流路线',
      features: [point('rate-limit')],
    })
    const share = harness.service.createShare(harness.one, {
      title: '限流分享',
      items: [{ kmlId: document.id }],
    })

    harness.service.assertPublicShareTileRequest(share.publicId, 'road', { ip: '198.51.100.1' })
    harness.service.assertPublicShareTileRequest(share.publicId, 'road', { ip: '198.51.100.1' })
    assert.throws(
      () => harness.service.assertPublicShareTileRequest(share.publicId, 'road', { ip: '198.51.100.1' }),
      error => error.statusCode === 429 && error.code === 'SHARE_TILE_RATE_LIMITED'
    )
    const metrics = harness.service.getShareRuntimeMetrics(harness.admin)
    assert.equal(metrics.items.some(item => item.shareId === share.id && item.event === 'tile_rate_limited'), true)
    assert.equal(JSON.stringify(metrics).includes(share.publicId), false)
    assert.equal(JSON.stringify(metrics).includes('198.51.100.1'), false)
    assert.throws(
      () => harness.service.getShareRuntimeMetrics(harness.one),
      error => error.statusCode === 403 && error.code === 'PERMISSION_DENIED'
    )
    assert.throws(
      () => harness.service.assertPublicShareTileRequest(share.publicId, 'satellite', { ip: '198.51.100.1' }),
      error => error.statusCode === 429 && error.code === 'SHARE_TILE_RATE_LIMITED'
    )
    assert.doesNotThrow(
      () => harness.service.assertPublicShareTileRequest(share.publicId, 'road', { ip: '198.51.100.2' })
    )

    harness.service.getPublicShareManifest(share.publicId, { ip: '203.0.113.1' })
    harness.service.getPublicShareManifest(share.publicId, { ip: '203.0.113.1' })
    assert.throws(
      () => harness.service.getPublicShareManifest(share.publicId, { ip: '203.0.113.1' }),
      error => error.statusCode === 429 && error.code === 'SHARE_MANIFEST_RATE_LIMITED'
    )
    const manifestMetrics = harness.service.getShareRuntimeMetrics(harness.admin)
    assert.equal(manifestMetrics.items.some(item => (
      item.shareId === share.id && item.event === 'manifest_rate_limited'
    )), true)
    assert.equal(manifestMetrics.summary.totalShares >= 1, true)
    assert.doesNotThrow(
      () => harness.service.getPublicShareManifest(share.publicId, { ip: '203.0.113.2' })
    )

    harness.advance(1000)
    assert.doesNotThrow(
      () => harness.service.assertPublicShareTileRequest(share.publicId, 'road', { ip: '198.51.100.1' })
    )
    assert.doesNotThrow(
      () => harness.service.getPublicShareManifest(share.publicId, { ip: '203.0.113.1' })
    )

    const capacityHarness = createHarness({
      shareTileRateLimit: { maxRequests: 1000, windowMs: 1000, maxEntries: 100 },
    })
    try {
      const capacityDocument = capacityHarness.service.createKml(capacityHarness.one, {
        name: '限流容量',
        features: [point('rate-capacity')],
      })
      const capacityShare = capacityHarness.service.createShare(capacityHarness.one, {
        title: '限流容量',
        items: [{ kmlId: capacityDocument.id }],
      })
      for (let index = 0; index < 105; index += 1) {
        capacityHarness.service.assertPublicShareTileRequest(
          capacityShare.publicId,
          `source-${index}`,
          { ip: `192.0.2.${(index % 200) + 1}` }
        )
      }
      assert.equal(capacityHarness.service.shareTileLimiter.entries.size, 100)
    } finally {
      capacityHarness.close()
    }
  } finally {
    harness.close()
  }
})
