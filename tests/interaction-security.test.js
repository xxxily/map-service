import test from 'node:test'
import assert from 'node:assert/strict'

import {
  decryptInteractionSecret,
  encryptInteractionSecret,
  hashInteractionContact,
  hashInteractionContacts,
  isInteractionCiphertext,
} from '../service/bin/interaction/security.js'

test('interaction secrets use authenticated encryption and fail closed', () => {
  const encrypted = encryptInteractionSecret('匿名邮箱', 'interaction-test-key')
  assert.notEqual(encrypted, '匿名邮箱')
  assert.equal(isInteractionCiphertext(encrypted), true)
  assert.equal(isInteractionCiphertext('aes-256-gcm$1$$$$'), false)
  assert.equal(isInteractionCiphertext('aes-256-gcm$1$                $                      $AA'), false)
  assert.equal(isInteractionCiphertext('aes-256-gcm$1$AAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA$AA'), false)
  assert.equal(isInteractionCiphertext('aes-256-gcm$1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA$A'), false)
  assert.equal(isInteractionCiphertext('aes-256-gcm$1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA$AA\u0000!'), false)
  assert.equal(decryptInteractionSecret(encrypted, 'interaction-test-key'), '匿名邮箱')
  assert.equal(decryptInteractionSecret('', ''), '')
  assert.throws(
    () => decryptInteractionSecret(encrypted, 'wrong-key'),
    error => error?.code === 'INTERACTION_DECRYPT_FAILED'
  )
  assert.throws(
    () => decryptInteractionSecret('invalid', 'interaction-test-key'),
    error => error?.code === 'INTERACTION_CIPHERTEXT_INVALID'
  )
  assert.throws(
    () => decryptInteractionSecret(encrypted, ''),
    error => error?.code === 'INTERACTION_SECRET_REQUIRED'
  )
  assert.throws(() => encryptInteractionSecret('secret', ''), /密钥不能为空/)
  assert.throws(() => encryptInteractionSecret(false, 'interaction-test-key'), /必须是字符串/)
})

test('contact hashes are deterministic, one-way and domain separated', () => {
  const first = hashInteractionContact('email', 'User@Example.com', 'contact-key')
  assert.equal(first, hashInteractionContact('email', 'User@Example.com', 'contact-key'))
  assert.notEqual(first, 'User@Example.com')
  assert.notEqual(first, hashInteractionContact('phone', '+8613800138000', 'contact-key'))
  assert.notEqual(first, hashInteractionContact('email', 'User@Example.com', 'other-key'))
  assert.equal(
    hashInteractionContact('phone', '+86 138-0013-8000', 'contact-key'),
    hashInteractionContact('phone', '+8613800138000', 'contact-key')
  )
  assert.equal(
    hashInteractionContacts({ email: 'User@Example.com', phone: '+8613800138000' }, 'contact-key'),
    hashInteractionContacts({ email: 'user@example.com', phone: '+8613800138000' }, 'contact-key')
  )
  assert.notEqual(
    hashInteractionContacts({ email: 'user@example.com', phone: '' }, 'contact-key'),
    hashInteractionContacts({ email: '', phone: '+8613800138000' }, 'contact-key')
  )
})
