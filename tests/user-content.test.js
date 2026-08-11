import assert from 'node:assert/strict'
import { test } from 'node:test'
import UserDatabase from '../service/bin/user/database.js'
import UserContentService, {
  generateKmlText,
  parseKmlText,
} from '../service/bin/user/userContent.js'

const USER_PERMISSIONS = [
  'kml.own.read',
  'kml.own.write',
  'favorite.own.manage',
  'share.own.manage',
]

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
    },
  }
  const service = new UserContentService({
    database,
    clock: () => now,
    settingsProvider: () => settings,
    isSiteAccessEnabled: () => Boolean(options.siteAccessEnabled),
  })
  return {
    database,
    service,
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
    harness.service.trashKml(harness.one, list.items[0].id)
    assert.deepEqual(harness.service.deleteKmlPermanently(harness.one, list.items[0].id), {
      id: list.items[0].id,
      status: 'deleted',
    })
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
      operations: [{ action: 'trash', clientId: 'local-stable' }],
    })
    assert.equal(responseLossDelete.results[0].document.id, first.results[0].document.id)
    assert.equal(responseLossDelete.results[0].document.status, 'trashed')
    const missingDelete = harness.service.syncKmlFiles(harness.one, {
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
          <Point><coordinates>113.2644,23.1291,0</coordinates></Point></Placemark>
      </Document></kml>`
    const imported = harness.service.importKml(harness.one, { kmlText: source })
    assert.equal(imported.name, '导入路线')
    assert.match(imported.description, /总里程[：:]<\/strong>12\.34 km/)
    assert.match(imported.description, /作者[：:]<\/strong>山友阿明/)
    assert.doesNotMatch(imported.description, /<script|alert\(1\)/i)
    assert.equal(imported.features[0].description.includes('<script'), false)
    const exported = harness.service.exportKml(harness.one, imported.id)
    assert.match(exported.filename, /导入路线\.kml$/)
    assert.match(exported.content, /113\.2644,23\.1291,0/)

    const parsed = parseKmlText(exported.content)
    assert.equal(parsed.features.length, 1)
    assert.match(parsed.description, /总里程[：:]<\/strong>12\.34 km/)
    assert.match(generateKmlText('测试', parsed.features, parsed.description), /<description>.*总里程/s)
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

test('multi-KML shares expose only public item IDs and detach trashed files', () => {
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
    assert.equal('ownerId' in publicFile, false)
    assert.equal('kmlId' in publicFile, false)
    assert.equal('syncClientId' in publicFile, false)
    assert.match(harness.service.exportPublicShareFile(share.publicId, manifest.items[0].shareItemId).content, /<kml/)

    harness.service.trashKml(harness.one, second.id)
    const afterOneRemoval = harness.service.getPublicShareManifest(share.publicId)
    assert.equal(afterOneRemoval.itemCount, 1)
    harness.service.trashKml(harness.one, first.id)
    assert.throws(
      () => harness.service.getPublicShareManifest(share.publicId),
      error => error.statusCode === 410 && error.code === 'SHARE_PAUSED'
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
