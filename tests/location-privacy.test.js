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
