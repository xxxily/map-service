import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('Leaflet default markers use Vite asset URLs without prepending imagePath', () => {
  const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  const disablePathDetectionAt = mainSource.indexOf('delete L.Icon.Default.prototype._getIconUrl')
  const configureUrlsAt = mainSource.indexOf('L.Icon.Default.mergeOptions({')

  assert.notEqual(disablePathDetectionAt, -1)
  assert.notEqual(configureUrlsAt, -1)
  assert.ok(disablePathDetectionAt < configureUrlsAt)
})
