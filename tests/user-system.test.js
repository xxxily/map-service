import assert from 'node:assert/strict'
import { test } from 'node:test'
import UserDatabase, { USER_DATABASE_VERSION } from '../service/bin/user/database.js'
import UserSystemService from '../service/bin/user/userSystem.js'
import { hashToken, verifyPassword } from '../service/bin/user/security.js'

const ROOT_USERNAME = 'root.admin'
const ROOT_PASSWORD = 'correct horse battery staple 2026'
const START_TIME = Date.parse('2026-08-05T01:00:00.000Z')

function matchesError (code, statusCode) {
  return err => {
    assert.equal(err?.code, code)
    if (statusCode !== undefined) assert.equal(err?.statusCode, statusCode)
    return true
  }
}

function createHarness (t, options = {}) {
  const database = new UserDatabase({ filePath: ':memory:' })
  let now = options.now ?? START_TIME
  const bootstrapAdmin = Object.hasOwn(options, 'bootstrapAdmin')
    ? options.bootstrapAdmin
    : {
        username: ROOT_USERNAME,
        password: ROOT_PASSWORD,
      }
  const service = new UserSystemService({
    database,
    clock: () => now,
    bootstrapAdmin,
    requireSecureBootstrap: options.requireSecureBootstrap,
    loginLimit: options.loginLimit,
    registerLimit: options.registerLimit,
    passwordLimit: options.passwordLimit,
  })
  t.after(() => database.close())
  return {
    database,
    service,
    advance (milliseconds) {
      now += milliseconds
      return now
    },
  }
}

async function login (service, username = ROOT_USERNAME, password = ROOT_PASSWORD, input = {}, context = {}) {
  const result = await service.login({ username, password, ...input }, context)
  const session = service.verifySession(result.sessionToken)
  assert.ok(session)
  return { result, session }
}

test('UserSystemService seeds protected built-in roles and does not overwrite an existing super admin', async t => {
  const { database, service } = createHarness(t)
  const root = service.getUserRowByUsername(ROOT_USERNAME)

  assert.ok(root)
  assert.equal(root.status, 'active')
  assert.equal(root.must_change_password, 0)
  assert.deepEqual(service.roleCodesForUser(root.id), ['super_admin'])
  assert.equal(service.permissionsForUser(root.id).includes('system.super_admin'), true)
  assert.equal(service.activeSuperAdminCount(), 1)

  const originalHash = root.password_hash
  const restarted = new UserSystemService({
    database,
    clock: () => START_TIME,
    bootstrapAdmin: {
      username: ROOT_USERNAME,
      password: 'a completely different bootstrap phrase',
    },
  })
  assert.equal(service.getUserRowByUsername(ROOT_USERNAME).password_hash, originalHash)
  await assert.rejects(
    restarted.login({ username: ROOT_USERNAME, password: 'a completely different bootstrap phrase' }),
    matchesError('INVALID_CREDENTIALS', 401)
  )
  await login(restarted)

  const bootstrapAudits = database.prepare(`
    SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'user.bootstrap-super-admin'
  `).get()
  assert.equal(bootstrapAudits.count, 1)
})

test('weak bootstrap credentials are allowed only with mandatory first-login password change', async t => {
  const { service } = createHarness(t, { bootstrapAdmin: {} })
  const { result, session } = await login(service, 'admin', 'admin')

  assert.equal(session.user.mustChangePassword, true)
  assert.throws(
    () => service.assertPermission(session, 'admin.overview.read'),
    matchesError('PASSWORD_CHANGE_REQUIRED', 403)
  )

  await service.changePassword(session, {
    currentPassword: 'admin',
    newPassword: 'bootstrap replacement phrase 2026',
  })
  const refreshed = service.verifySession(result.sessionToken)
  assert.equal(refreshed.user.mustChangePassword, false)
  assert.equal(service.hasPermission(refreshed, 'admin.overview.read'), true)
})

test('secure bootstrap refuses missing or weak credentials on a new database', t => {
  const missingDatabase = new UserDatabase({ filePath: ':memory:' })
  t.after(() => missingDatabase.close())
  assert.throws(
    () => new UserSystemService({
      database: missingDatabase,
      requireSecureBootstrap: true,
      bootstrapAdmin: { configured: false },
    }),
    /必须显式配置超级管理员账号和强密码/
  )
  assert.equal(missingDatabase.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0)

  const weakDatabase = new UserDatabase({ filePath: ':memory:' })
  t.after(() => weakDatabase.close())
  assert.throws(
    () => new UserSystemService({
      database: weakDatabase,
      requireSecureBootstrap: true,
      bootstrapAdmin: {
        configured: true,
        username: 'admin',
        password: 'admin',
      },
    }),
    matchesError('WEAK_PASSWORD', 400)
  )
  assert.equal(weakDatabase.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0)
})

test('secure bootstrap is required only until an active super administrator exists', async t => {
  const database = new UserDatabase({ filePath: ':memory:' })
  t.after(() => database.close())
  const service = new UserSystemService({
    database,
    requireSecureBootstrap: true,
    bootstrapAdmin: {
      configured: true,
      username: ROOT_USERNAME,
      password: ROOT_PASSWORD,
    },
  })
  await login(service)

  assert.doesNotThrow(() => new UserSystemService({
    database,
    requireSecureBootstrap: true,
    bootstrapAdmin: { configured: false },
  }))
})

test('secure bootstrap rotates credentials and revokes sessions when reclaiming an existing username', async t => {
  const database = new UserDatabase({ filePath: ':memory:' })
  t.after(() => database.close())
  const initial = new UserSystemService({
    database,
    bootstrapAdmin: {
      username: ROOT_USERNAME,
      password: ROOT_PASSWORD,
    },
  })
  const { session: rootSession } = await login(initial)
  const ordinaryPassword = 'ordinary account password 2026'
  const recoveredPassword = 'recovered bootstrap password 2026'
  const created = initial.createUser(rootSession, {
    username: 'recovery.admin',
    displayName: '待恢复管理员',
    password: ordinaryPassword,
    roles: ['user'],
  })
  const ordinaryLogin = await initial.login({
    username: 'recovery.admin',
    password: ordinaryPassword,
  })
  assert.ok(initial.verifySession(ordinaryLogin.sessionToken))
  const beforeVersion = Number(database.prepare(`
    SELECT permissions_version FROM users WHERE id = ?
  `).get(created.user.id).permissions_version)

  database.prepare(`
    UPDATE users SET status = 'disabled' WHERE username_normalized = ?
  `).run(ROOT_USERNAME)

  const restarted = new UserSystemService({
    database,
    requireSecureBootstrap: true,
    bootstrapAdmin: {
      configured: true,
      username: 'recovery.admin',
      password: recoveredPassword,
    },
  })
  const recovered = restarted.getUserRowByUsername('recovery.admin')
  assert.equal(Number(recovered.permissions_version), beforeVersion + 1)
  assert.equal(restarted.verifySession(ordinaryLogin.sessionToken), null)
  await assert.rejects(
    restarted.login({ username: 'recovery.admin', password: ordinaryPassword }),
    matchesError('INVALID_CREDENTIALS', 401)
  )
  const recoveredLogin = await login(restarted, 'recovery.admin', recoveredPassword)
  assert.equal(recoveredLogin.session.user.roles.includes('super_admin'), true)
  assert.equal(recoveredLogin.session.user.mustChangePassword, false)
})

test('registration mode and safe default roles are enforced by the service', async t => {
  const { service } = createHarness(t)
  const { session: rootSession } = await login(service)

  assert.deepEqual(service.getPublicConfig().registration, {
    mode: 'closed',
    enabled: false,
  })
  await assert.rejects(
    service.register({
      username: 'closed.user',
      displayName: '关闭注册用户',
      password: 'safe registration phrase 2026',
    }),
    matchesError('REGISTRATION_CLOSED', 403)
  )

  const editorRole = service.createRole(rootSession, {
    code: 'map_editor',
    name: '地图编辑者',
    permissions: ['kml.own.read', 'kml.own.write'],
  })
  service.updateSettings(rootSession, {
    registration: {
      mode: 'open',
      defaultRoleCodes: ['user', editorRole.code],
    },
  })

  const registration = await service.register({
    username: 'new.user',
    displayName: '新用户',
    password: 'safe registration phrase 2026',
    email: 'NEW.USER@example.com',
    roles: ['super_admin'],
    status: 'disabled',
  }, { ip: '203.0.113.8' })
  assert.deepEqual(registration, { status: 'accepted' })
  const registeredSession = (await login(service, 'new.user', 'safe registration phrase 2026')).session
  assert.deepEqual(registeredSession.user.roles, ['map_editor', 'user'])
  assert.equal(registeredSession.user.status, 'active')
  assert.equal(registeredSession.user.email, 'new.user@example.com')

  assert.throws(
    () => service.updateSettings(rootSession, {
      registration: { defaultRoleCodes: ['user', 'admin'] },
    }),
    matchesError('VALIDATION_FAILED', 400)
  )
  assert.throws(
    () => service.updateSettings(registeredSession, {
      registration: { mode: 'closed' },
    }),
    matchesError('PERMISSION_DENIED', 403)
  )
})

test('user-system health summary is permission-gated and reports operational counts', async t => {
  const { service } = createHarness(t)
  const { session: rootSession } = await login(service)
  const summary = service.getHealthSummary(rootSession)

  assert.equal(summary.database.status, 'ok')
  assert.equal(summary.database.schemaVersion, USER_DATABASE_VERSION)
  assert.equal(summary.database.allocatedBytes > 0, true)
  assert.equal(summary.counts.users, 1)
  assert.equal(summary.counts.activeSessions, 1)
  assert.equal(summary.counts.shares, 0)
  assert.equal(summary.storage.kmlBytes, 0)
  assert.throws(
    () => service.getHealthSummary({
      user: {
        id: 'usr_ordinary',
        status: 'active',
        permissions: ['account.self.read'],
      },
    }),
    matchesError('PERMISSION_DENIED', 403)
  )
})

test('user-system settings and their audit record are committed atomically', async t => {
  const { service } = createHarness(t)
  const { session: rootSession } = await login(service)
  const originalInsertAudit = service.insertAudit

  service.insertAudit = () => {
    throw new Error('audit write failed')
  }
  assert.throws(
    () => service.updateSettings(rootSession, {
      registration: { mode: 'open' },
    }),
    /audit write failed/
  )
  service.insertAudit = originalInsertAudit

  assert.equal(service.getSettings().registration.mode, 'closed')
})

test('only a recently authenticated super administrator can change spatial share policy', async t => {
  const { service } = createHarness(t)
  const { session: rootSession } = await login(service)
  service.createUser(rootSession, {
    username: 'policy.admin',
    displayName: '策略管理员',
    password: 'policy administrator phrase 2026',
    roles: ['admin'],
  })
  const adminLogin = await login(service, 'policy.admin', 'policy administrator phrase 2026')
  await service.changePassword(adminLogin.session, {
    currentPassword: 'policy administrator phrase 2026',
    newPassword: 'policy administrator replacement 2026',
  })
  const adminSession = service.verifySession(adminLogin.result.sessionToken)

  assert.throws(
    () => service.updateSettings(adminSession, {
      share: { spatialPaddingMeters: 1200 },
    }),
    matchesError('PERMISSION_DENIED', 403)
  )
  const updated = service.updateSettings(rootSession, {
    share: { spatialPaddingMeters: 1200 },
  })
  assert.equal(updated.share.spatialPaddingMeters, 1200)
  assert.equal(updated.share.spatialPolicyRevision, 2)
})

test('spatial share settings reject unlimited thresholds above the overall range limits', async t => {
  const { service } = createHarness(t)
  const { session: rootSession } = await login(service)

  assert.throws(
    () => service.updateSettings(rootSession, {
      share: {
        spatialMaxAreaKm2: 100,
        unlimitedAccessMaxAreaKm2: 101,
      },
    }),
    matchesError('VALIDATION_FAILED', 400)
  )
  assert.throws(
    () => service.updateSettings(rootSession, {
      share: {
        spatialMaxDiagonalKm: 50,
        unlimitedAccessMaxDiagonalKm: 51,
      },
    }),
    matchesError('VALIDATION_FAILED', 400)
  )
})

test('spatial policy changes return recalculation impact, increment revision and write a dedicated audit', async t => {
  const { database, service } = createHarness(t)
  const { session: rootSession } = await login(service)
  let received = null
  service.setSettingsChangeHandler((next, previous) => {
    received = { next, previous }
    return {
      affectedShares: 1,
      downgradedShares: 1,
      revokedUnlimitedSessions: 1,
    }
  })

  const result = service.updateSettings(rootSession, {
    share: { unlimitedAccessEnabled: true },
  }, { ip: '198.51.100.77' })
  assert.equal(received.previous.spatialPolicyRevision, 1)
  assert.equal(received.next.spatialPolicyRevision, 2)
  assert.equal(received.next.unlimitedAccessEnabled, true)
  assert.deepEqual(result.sharePolicyImpact, {
    affectedShares: 1,
    downgradedShares: 1,
    revokedUnlimitedSessions: 1,
  })
  const audit = database.prepare(`
    SELECT metadata_json FROM audit_logs
    WHERE action = 'admin.share-spatial-policy.update'
    ORDER BY created_at DESC LIMIT 1
  `).get()
  assert.ok(audit)
  assert.deepEqual(JSON.parse(audit.metadata_json), {
    spatialPolicyRevision: 2,
    affectedShares: 1,
    downgradedShares: 1,
    revokedUnlimitedSessions: 1,
  })
})

test('spatial policy impact preview validates permissions without persisting settings', async t => {
  const { database, service } = createHarness(t)
  const { session: rootSession } = await login(service)
  service.setSettingsPreviewHandler((next, previous) => ({
    affectedShares: 4,
    downgradedShares: 2,
    revokedUnlimitedSessions: 3,
    revisions: [previous.spatialPolicyRevision, next.spatialPolicyRevision],
  }))

  const preview = service.updateSettings(rootSession, {
    share: { unlimitedAccessEnabled: true },
  }, {}, { preview: true })
  assert.equal(preview.preview, true)
  assert.deepEqual(preview.sharePolicyImpact, {
    affectedShares: 4,
    downgradedShares: 2,
    revokedUnlimitedSessions: 3,
    revisions: [1, 2],
  })
  assert.equal(service.getSettings().share.unlimitedAccessEnabled, false)
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'admin.share-spatial-policy.update'
  `).get().count, 0)
})

test('admin-created and reset temporary passwords always satisfy the normal password policy', async t => {
  const { database, service, advance } = createHarness(t)
  const rootLogin = await login(service)
  let rootSession = rootLogin.session

  assert.throws(
    () => service.createUser(rootSession, {
      username: 'weak.user',
      displayName: '弱密码用户',
      password: 'admin',
    }),
    matchesError('WEAK_PASSWORD', 400)
  )
  assert.equal(service.getUserRowByUsername('weak.user'), undefined)

  const created = service.createUser(rootSession, {
    username: 'managed.user',
    displayName: '后台用户',
  })
  assert.equal(created.temporaryPassword.length >= 12, true)
  assert.equal(created.user.mustChangePassword, true)
  const stored = service.getUserRowByUsername('managed.user')
  assert.equal(stored.password_hash.includes(created.temporaryPassword), false)
  assert.equal(await verifyPassword(created.temporaryPassword, stored.password_hash), true)

  const managedLogin = await login(service, 'managed.user', created.temporaryPassword)
  advance(11 * 60 * 1000)
  await assert.rejects(
    service.resetUserPassword(rootSession, created.user.id, {
      password: 'another secure temporary phrase',
    }),
    matchesError('REAUTH_REQUIRED', 403)
  )

  await service.reauthenticate(rootSession, ROOT_PASSWORD)
  rootSession = service.verifySession(rootLogin.result.sessionToken)
  await assert.rejects(
    service.resetUserPassword(rootSession, created.user.id, { password: '123456' }),
    matchesError('WEAK_PASSWORD', 400)
  )
  assert.ok(service.verifySession(managedLogin.result.sessionToken))

  const replacement = 'one-time replacement phrase 2026'
  const reset = await service.resetUserPassword(rootSession, created.user.id, {
    password: replacement,
  }, { ip: '198.51.100.24' })
  assert.equal(reset.temporaryPassword, replacement)
  assert.equal(reset.mustChangePassword, true)
  assert.equal(service.verifySession(managedLogin.result.sessionToken), null)
  assert.equal(await verifyPassword(replacement, service.getUserRowByUsername('managed.user').password_hash), true)

  const audit = database.prepare(`
    SELECT metadata_json, ip_summary
    FROM audit_logs
    WHERE action = 'admin.user.password-reset'
    ORDER BY created_at DESC LIMIT 1
  `).get()
  assert.equal(audit.metadata_json.includes(replacement), false)
  assert.match(audit.ip_summary, /^ip_[A-Za-z0-9_-]{16}$/)
})

test('temporary-password sessions are restricted until the user changes the password', async t => {
  const { service } = createHarness(t)
  const { session: rootSession } = await login(service)
  const temporaryPassword = 'temporary onboarding phrase 2026'
  const created = service.createUser(rootSession, {
    username: 'onboarding.user',
    displayName: '待改密用户',
    password: temporaryPassword,
  })
  const firstLogin = await login(service, 'onboarding.user', temporaryPassword)
  const secondLogin = await login(service, 'onboarding.user', temporaryPassword)

  assert.equal(service.getMyProfile(firstLogin.session).mustChangePassword, true)
  assert.equal(service.listSessions(firstLogin.session).length, 2)
  assert.throws(
    () => service.updateMyProfile(firstLogin.session, { displayName: '不应生效' }),
    matchesError('PASSWORD_CHANGE_REQUIRED', 403)
  )
  assert.throws(
    () => service.assertPermission(firstLogin.session, 'kml.own.read'),
    matchesError('PASSWORD_CHANGE_REQUIRED', 403)
  )

  await service.changePassword(firstLogin.session, {
    currentPassword: temporaryPassword,
    newPassword: 'permanent account phrase 2026',
  })
  const refreshed = service.verifySession(firstLogin.result.sessionToken)
  assert.equal(refreshed.user.mustChangePassword, false)
  assert.equal(service.verifySession(secondLogin.result.sessionToken), null)
  assert.equal(service.assertPermission(refreshed, 'kml.own.read'), refreshed)
  assert.equal(service.updateMyProfile(refreshed, { displayName: '已完成改密' }).displayName, '已完成改密')
  assert.equal(created.user.id, refreshed.user.id)
})

test('sessions store only token hashes, enforce CSRF, support revocation, and expire', async t => {
  const { database, service, advance } = createHarness(t)
  const { session: rootSession } = await login(service)
  service.updateSettings(rootSession, { registration: { mode: 'open' } })
  const registration = await service.register({
    username: 'session.user',
    displayName: '会话用户',
    password: 'session management phrase 2026',
  }, {
    ip: '192.0.2.44',
    userAgent: 'Map Test Browser',
  })
  assert.deepEqual(registration, { status: 'accepted' })
  const firstLogin = await login(
    service,
    'session.user',
    'session management phrase 2026',
    {},
    { ip: '192.0.2.44', userAgent: 'Map Test Browser' }
  )
  const firstSession = firstLogin.session
  const stored = database.prepare('SELECT * FROM sessions WHERE id = ?').get(firstLogin.result.sessionId)

  assert.equal(stored.token_hash, hashToken(firstLogin.result.sessionToken))
  assert.equal(stored.csrf_hash, hashToken(firstLogin.result.csrfToken))
  assert.equal(stored.token_hash.includes(firstLogin.result.sessionToken), false)
  assert.equal(stored.csrf_hash.includes(firstLogin.result.csrfToken), false)
  assert.match(stored.ip_summary, /^ip_[A-Za-z0-9_-]{16}$/)
  assert.notEqual(stored.ip_summary, '192.0.2.44')
  assert.equal(service.verifyCsrf(firstSession, firstLogin.result.csrfToken), true)
  assert.throws(
    () => service.verifyCsrf(firstSession, 'incorrect-csrf-token'),
    matchesError('CSRF_INVALID', 403)
  )

  const remembered = await login(
    service,
    'session.user',
    'session management phrase 2026',
    { remember: true },
    { ip: '192.0.2.45' }
  )
  assert.equal(remembered.result.maxAge, 30 * 24 * 60 * 60 * 1000)
  assert.equal(service.listSessions(firstSession).length, 2)
  assert.deepEqual(service.revokeOwnSession(firstSession, remembered.result.sessionId), {
    status: 'ok',
    currentRevoked: false,
  })
  assert.equal(service.verifySession(remembered.result.sessionToken), null)

  advance(7 * 24 * 60 * 60 * 1000 + 1)
  assert.equal(service.verifySession(firstLogin.result.sessionToken), null)
})

test('a permissions-version mismatch invalidates a session even before explicit revocation', async t => {
  const { database, service } = createHarness(t)
  const rootLogin = await login(service)

  database.prepare(`
    UPDATE users SET permissions_version = permissions_version + 1 WHERE id = ?
  `).run(rootLogin.session.user.id)
  const storedSession = database.prepare('SELECT revoked_at FROM sessions WHERE id = ?')
    .get(rootLogin.result.sessionId)
  assert.equal(storedSession.revoked_at, null)
  assert.equal(service.verifySession(rootLogin.result.sessionToken), null)
})

test('login lockouts remain effective for the full block interval and then recover', async t => {
  const { service, advance } = createHarness(t, {
    loginLimit: {
      maxAttempts: 2,
      windowMs: 10 * 60 * 1000,
      blockMs: 15 * 60 * 1000,
    },
  })
  const { session: rootSession } = await login(service)
  const password = 'lockout account phrase 2026'
  service.createUser(rootSession, {
    username: 'lockout.user',
    displayName: '锁定测试用户',
    password,
  })
  const activeLogin = await login(service, 'lockout.user', password)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      service.login({ username: 'lockout.user', password: 'wrong password' }, { ip: '192.0.2.99' }),
      matchesError('INVALID_CREDENTIALS', 401)
    )
  }
  assert.equal(service.getUserRowByUsername('lockout.user').status, 'locked')
  assert.equal(service.verifySession(activeLogin.result.sessionToken), null)

  advance(11 * 60 * 1000)
  await assert.rejects(
    service.login({ username: 'lockout.user', password }, { ip: '192.0.2.99' }),
    matchesError('RATE_LIMITED', 429)
  )

  advance(5 * 60 * 1000)
  await login(service, 'lockout.user', password, {}, { ip: '192.0.2.99' })
  assert.equal(service.getUserRowByUsername('lockout.user').status, 'active')
})

test('successful login does not clear the shared IP password-spraying bucket', async t => {
  const { service } = createHarness(t, {
    loginLimit: {
      maxAttempts: 2,
      windowMs: 10 * 60 * 1000,
      blockMs: 15 * 60 * 1000,
    },
  })
  const context = { ip: '192.0.2.120' }

  await assert.rejects(
    service.login({ username: 'unknown-one', password: 'wrong password' }, context),
    matchesError('INVALID_CREDENTIALS', 401)
  )
  await login(service, ROOT_USERNAME, ROOT_PASSWORD, {}, context)
  await assert.rejects(
    service.login({ username: 'unknown-two', password: 'wrong password' }, context),
    matchesError('INVALID_CREDENTIALS', 401)
  )
  await assert.rejects(
    service.login({ username: 'unknown-three', password: 'wrong password' }, context),
    matchesError('RATE_LIMITED', 429)
  )
})

test('successful password verification does not clear the shared IP bucket', async t => {
  const { service } = createHarness(t, {
    passwordLimit: {
      maxAttempts: 2,
      windowMs: 10 * 60 * 1000,
      blockMs: 15 * 60 * 1000,
    },
  })
  const context = { ip: '192.0.2.121' }
  const { session: rootSession } = await login(service)
  const temporaryPassword = 'password limiter user phrase 2026'
  service.createUser(rootSession, {
    username: 'password.limit.user',
    displayName: '密码限流用户',
    password: temporaryPassword,
  })
  const { session: otherSession } = await login(service, 'password.limit.user', temporaryPassword)

  await assert.rejects(
    service.reauthenticate(rootSession, 'wrong password', context),
    matchesError('INVALID_CREDENTIALS', 401)
  )
  await service.reauthenticate(otherSession, temporaryPassword, context)
  await assert.rejects(
    service.reauthenticate(rootSession, 'wrong password again', context),
    matchesError('INVALID_CREDENTIALS', 401)
  )
  await assert.rejects(
    service.reauthenticate(otherSession, temporaryPassword, context),
    matchesError('RATE_LIMITED', 429)
  )
})

test('KML manage permissions imply the corresponding read permission', t => {
  const { service } = createHarness(t)
  assert.equal(service.hasPermission({
    user: { permissions: ['kml.own.write'] },
  }, 'kml.own.read'), true)
  assert.equal(service.hasPermission({
    user: { permissions: ['kml.any.manage'] },
  }, 'kml.any.read'), true)
})

test('role assignment and role permission changes invalidate every affected session', async t => {
  const { database, service } = createHarness(t)
  const { session: rootSession } = await login(service)
  const role = service.createRole(rootSession, {
    code: 'content_reader',
    name: '内容查看者',
    permissions: ['kml.own.read'],
  })
  const created = service.createUser(rootSession, {
    username: 'role.user',
    displayName: '角色用户',
    password: 'role assignment phrase 2026',
  })
  const firstLogin = await login(service, 'role.user', 'role assignment phrase 2026')
  const beforeVersion = database.prepare('SELECT permissions_version FROM users WHERE id = ?').get(created.user.id)

  service.setUserRoles(rootSession, created.user.id, ['user', role.code])
  const assignedVersion = database.prepare('SELECT permissions_version FROM users WHERE id = ?').get(created.user.id)
  assert.equal(assignedVersion.permissions_version, beforeVersion.permissions_version + 1)
  assert.equal(service.verifySession(firstLogin.result.sessionToken), null)

  const secondLogin = await login(service, 'role.user', 'role assignment phrase 2026')
  service.updateRole(rootSession, role.id, {
    name: '分享查看者',
    permissions: ['share.own.manage'],
  })
  const updatedVersion = database.prepare('SELECT permissions_version FROM users WHERE id = ?').get(created.user.id)
  assert.equal(updatedVersion.permissions_version, assignedVersion.permissions_version + 1)
  assert.equal(service.verifySession(secondLogin.result.sessionToken), null)

  const thirdLogin = await login(service, 'role.user', 'role assignment phrase 2026')
  assert.equal(thirdLogin.session.user.permissions.includes('share.own.manage'), true)
  assert.throws(
    () => service.updateRole(rootSession, 'role_user', { name: '不可修改' }),
    matchesError('ROLE_BUILTIN', 409)
  )

  const actions = database.prepare(`
    SELECT action FROM audit_logs
    WHERE target_id IN (?, ?)
    ORDER BY action
  `).all(created.user.id, role.id).map(row => row.action)
  assert.equal(actions.includes('admin.user.roles-update'), true)
  assert.equal(actions.includes('admin.role.update'), true)
})

test('the last active super admin cannot be locked, disabled, or demoted', async t => {
  const { service } = createHarness(t, {
    loginLimit: {
      maxAttempts: 2,
      windowMs: 60 * 60 * 1000,
      blockMs: 15 * 60 * 1000,
    },
  })
  const rootLogin = await login(service)
  const rootSession = rootLogin.session
  const rootId = rootSession.user.id

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(
      service.login({ username: ROOT_USERNAME, password: 'wrong password' }, { ip: '203.0.113.90' }),
      matchesError('INVALID_CREDENTIALS', 401)
    )
  }
  await assert.rejects(
    service.login({ username: ROOT_USERNAME, password: ROOT_PASSWORD }, { ip: '203.0.113.90' }),
    matchesError('RATE_LIMITED', 429)
  )
  assert.equal(service.getUserRowByUsername(ROOT_USERNAME).status, 'active')
  assert.equal(service.activeSuperAdminCount(), 1)

  assert.throws(
    () => service.updateUser(rootSession, rootId, { status: 'disabled' }),
    matchesError('LAST_SUPER_ADMIN', 409)
  )
  assert.throws(
    () => service.setUserRoles(rootSession, rootId, ['user']),
    matchesError('LAST_SUPER_ADMIN', 409)
  )

  service.createUser(rootSession, {
    username: 'backup.root',
    displayName: '备用超级管理员',
    password: 'backup authority phrase 2026',
    roles: ['super_admin'],
  })
  assert.equal(service.activeSuperAdminCount(), 2)
  service.updateUser(rootSession, rootId, { status: 'disabled' })
  assert.equal(service.activeSuperAdminCount(), 1)
  assert.equal(service.verifySession(rootLogin.result.sessionToken), null)
})

test('RBAC keeps ordinary administrators away from root-level user and registration controls', async t => {
  const { service } = createHarness(t)
  const { session: rootSession } = await login(service)
  const temporaryPassword = 'administrator onboarding phrase 2026'
  service.createUser(rootSession, {
    username: 'daily.admin',
    displayName: '日常管理员',
    password: temporaryPassword,
    roles: ['admin'],
  })
  const adminLogin = await login(service, 'daily.admin', temporaryPassword)
  await service.changePassword(adminLogin.session, {
    currentPassword: temporaryPassword,
    newPassword: 'administrator permanent phrase 2026',
  })
  const adminSession = service.verifySession(adminLogin.result.sessionToken)

  assert.equal(service.hasPermission(adminSession, 'admin.overview.read'), true)
  assert.equal(service.hasPermission(adminSession, 'admin.user.manage'), false)
  assert.throws(
    () => service.createUser(adminSession, {
      username: 'forbidden.user',
      displayName: '不应创建',
    }),
    matchesError('PERMISSION_DENIED', 403)
  )
  assert.throws(
    () => service.updateSettings(adminSession, { registration: { mode: 'open' } }),
    matchesError('PERMISSION_DENIED', 403)
  )
  assert.equal(service.listAuditLogs(adminSession).total > 0, true)
})

test('audit metadata and IP addresses are sanitized before persistence', async t => {
  const { database, service } = createHarness(t)
  const { session: rootSession } = await login(service)
  service.insertAudit({
    actorUserId: rootSession.user.id,
    action: 'security.sanitization-test',
    targetType: 'test',
    targetId: 'target',
    metadata: {
      password: 'plain-password',
      csrfToken: 'plain-csrf',
      nested: {
        authorization: 'Bearer plain-token',
        safe: '保留字段',
      },
    },
    ipSummary: '198.51.100.77',
  })

  const row = database.prepare(`
    SELECT metadata_json, ip_summary FROM audit_logs
    WHERE action = 'security.sanitization-test'
  `).get()
  const metadata = JSON.parse(row.metadata_json)
  assert.equal(metadata.password, '[已脱敏]')
  assert.equal(metadata.csrfToken, '[已脱敏]')
  assert.equal(metadata.nested.authorization, '[已脱敏]')
  assert.equal(metadata.nested.safe, '保留字段')
  assert.doesNotMatch(row.metadata_json, /plain-password|plain-csrf|plain-token/)
  assert.match(row.ip_summary, /^ip_[A-Za-z0-9_-]{16}$/)
  assert.notEqual(row.ip_summary, '198.51.100.77')
})
