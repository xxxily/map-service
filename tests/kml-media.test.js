import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertKmlMediaPublicAddress,
  isBlockedKmlMediaAddress,
  KML_MEDIA_MAX_BYTES,
  validateKmlMediaResponse,
  validateKmlMediaTarget,
} from '../service/bin/admin/kmlMedia.js'

const allowedTarget = 'https://down-files.2bulu.com/f/dn1?downParams=opaque-value'

test('KML media target validation only accepts the fixed legacy image endpoint', () => {
  assert.equal(validateKmlMediaTarget(allowedTarget), allowedTarget)
  assert.throws(() => validateKmlMediaTarget(''), { statusCode: 400 })
  assert.throws(() => validateKmlMediaTarget('https://evil.example/f/dn1?id=1'), { statusCode: 403 })
  assert.throws(() => validateKmlMediaTarget('https://down-files.2bulu.com/f/other?id=1'), { statusCode: 403 })
  assert.throws(() => validateKmlMediaTarget('https://user:pass@down-files.2bulu.com/f/dn1?id=1'), { statusCode: 403 })
  assert.throws(() => validateKmlMediaTarget('https://down-files.2bulu.com/f/dn1?other=1'), { statusCode: 403 })
})

test('KML media DNS validation rejects private and non-address results', async () => {
  assert.equal(isBlockedKmlMediaAddress('127.0.0.1'), true)
  assert.equal(isBlockedKmlMediaAddress('169.254.169.254'), true)
  assert.equal(isBlockedKmlMediaAddress('::1'), true)
  assert.equal(isBlockedKmlMediaAddress('fd00::1'), true)
  assert.equal(isBlockedKmlMediaAddress('203.12.34.56'), false)
  assert.equal(isBlockedKmlMediaAddress('240e:1234::1'), false)

  const publicResult = await assertKmlMediaPublicAddress(allowedTarget, async () => [{ address: '203.12.34.56', family: 4 }])
  assert.equal(publicResult[0].address, '203.12.34.56')
  await assert.rejects(
    assertKmlMediaPublicAddress(allowedTarget, async () => [{ address: '10.0.0.1', family: 4 }]),
    { statusCode: 403 },
  )
  await assert.rejects(
    assertKmlMediaPublicAddress(allowedTarget, async () => { throw new Error('dns failed') }),
    { statusCode: 502 },
  )
})

test('KML media response validation requires a bounded image response', () => {
  const valid = {
    headers: {
      'content-type': 'image/jpeg;charset=UTF-8',
      'content-length': '941143',
    },
  }
  assert.equal(validateKmlMediaResponse(valid), valid)
  assert.throws(() => validateKmlMediaResponse({ headers: { 'content-type': 'text/html', 'content-length': '100' } }), { statusCode: 415 })
  assert.throws(() => validateKmlMediaResponse({ headers: { 'content-type': 'image/jpeg' } }), { statusCode: 502 })
  assert.throws(() => validateKmlMediaResponse({
    headers: {
      'content-type': 'image/jpeg',
      'content-length': String(KML_MEDIA_MAX_BYTES + 1),
    },
  }), { statusCode: 413 })
})
