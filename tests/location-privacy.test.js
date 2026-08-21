import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { sanitizeLogUrl } from '../service/bin/logSanitizer.js'

function readProjectFile (relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')
}

test('map documents and server responses use strict-origin Referer policy to protect coordinates', () => {
  for (const htmlFile of ['index.html', '3d.html']) {
    const html = readProjectFile(htmlFile)
    assert.match(html, /<meta name="referrer" content="strict-origin">/)
  }

  const serverSource = readProjectFile('service/index.js')
  assert.match(serverSource, /res\.set\('Referrer-Policy', 'strict-origin'\)/)
})

test('access logs redact shared map coordinates while preserving other query fields', () => {
  assert.equal(
    sanitizeLogUrl('/?coords=23.123456,113.123456,16&layer=road'),
    '/?coords=%5Bredacted%5D&layer=road',
  )
  assert.equal(
    sanitizeLogUrl('/3d?layer=satellite'),
    '/3d?layer=satellite',
  )
  assert.equal(
    sanitizeLogUrl('https://maps.example/?coords=1,2,3'),
    '/?coords=%5Bredacted%5D',
  )
})

test('access logs redact KML compatibility media targets', () => {
  assert.equal(
    sanitizeLogUrl('/api/v1/kml/media?url=https%3A%2F%2Fdown-files.2bulu.com%2Ff%2Fdn1%3FdownParams%3Dsecret'),
    '/api/v1/kml/media?url=%5Bredacted%5D',
  )
})

test('access logs redact password links and common credential query parameters', () => {
  const sanitized = sanitizeLogUrl('/share/public-id?password=A%26b%3D1234&layer=road&TOKEN=secret-token&api_key=secret-key')
  assert.equal(sanitized.includes('A%26b%3D1234'), false)
  assert.equal(sanitized.includes('secret-token'), false)
  assert.equal(sanitized.includes('secret-key'), false)
  assert.equal(sanitized, '/share/public-id?password=****&layer=road&TOKEN=****&api_key=****')
})

test('access log redaction still protects credentials in malformed URLs', () => {
  const sanitized = sanitizeLogUrl('/share/public-id?password=plain-secret&token=token-secret&bad=%E0%A4%A')
  assert.equal(sanitized.includes('plain-secret'), false)
  assert.equal(sanitized.includes('token-secret'), false)
  assert.match(sanitized, /password=\*\*\*\*/)
  assert.match(sanitized, /token=\*\*\*\*/)
})
