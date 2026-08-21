import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  hashPasswordSync,
  hashToken,
  normalizeOptionalEmail,
  normalizeUsername,
  randomId,
  randomToken,
  validateDisplayName,
  validatePassword,
  validateUsername,
  verifyPassword,
} from '../service/bin/user/security.js'

test('user security encrypts share secrets and rejects invalid ciphertext', () => {
  const encrypted = encryptSecret('share-password-123', 'stable-server-key')
  assert.notEqual(encrypted, 'share-password-123')
  assert.equal(decryptSecret(encrypted, 'stable-server-key'), 'share-password-123')
  assert.equal(decryptSecret(encrypted, 'wrong-server-key'), '')

  const parts = encrypted.split('$')
  parts[4] = `${parts[4].slice(0, -1)}${parts[4].endsWith('A') ? 'B' : 'A'}`
  assert.equal(decryptSecret(parts.join('$'), 'stable-server-key'), '')
})

test('user security normalizes public identity fields', () => {
  assert.equal(normalizeUsername('  Map.User  '), 'map.user')
  assert.deepEqual(validateUsername('Map_User-1'), {
    display: 'Map_User-1',
    normalized: 'map_user-1',
  })
  assert.equal(validateDisplayName('  地图用户  '), '地图用户')
  assert.equal(normalizeOptionalEmail(' USER@Example.COM '), 'user@example.com')
  assert.throws(() => validateUsername('中文用户名'), /用户名需为/)
  assert.throws(() => normalizeOptionalEmail('not-an-email'), /邮箱格式不正确/)
})

test('user security hashes passwords and rejects weak credentials', async () => {
  const password = 'a sufficiently long map passphrase'
  const encoded = await hashPassword(password, { username: 'map-user' })
  assert.equal(encoded.includes(password), false)
  assert.equal(await verifyPassword(password, encoded), true)
  assert.equal(await verifyPassword('wrong-password', encoded), false)

  const syncEncoded = hashPasswordSync(password)
  assert.equal(await verifyPassword(password, syncEncoded), true)
  assert.throws(() => validatePassword('admin', { username: 'admin' }), /密码长度至少为/)
  assert.throws(() => validatePassword('admin-password-phrase', { username: 'admin' }), /包含用户名/)
})

test('user security creates opaque ids and hashes tokens', () => {
  const token = randomToken()
  const id = randomId('usr')
  assert.match(token, /^[A-Za-z0-9_-]+$/)
  assert.match(id, /^usr_[A-Za-z0-9_-]+$/)
  assert.notEqual(hashToken(token), token)
  assert.equal(hashToken(token), hashToken(token))
})
