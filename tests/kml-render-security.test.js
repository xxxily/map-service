import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('2D 和 3D KML 面板不会把用户可控 ID 直接插入 HTML 属性', () => {
  const sources = [
    fs.readFileSync(path.join(projectRoot, 'src/map/kml.js'), 'utf8'),
    fs.readFileSync(path.join(projectRoot, 'src/map3d/kml.js'), 'utf8'),
  ]
  const unsafePatterns = [
    /data-(?:kml|feature)-id="\$\{(?:kmlFile|feat|feature)\.id\}"/,
    /data-kml-card-id="\$\{kmlFile\.id\}"/,
    /id="features-\$\{kmlFile\.id\}"/,
    /attrs:\s*`data-kml-id="\$\{kmlFile\.id\}"`/,
  ]

  for (const source of sources) {
    for (const pattern of unsafePatterns) {
      assert.doesNotMatch(source, pattern)
    }
    assert.match(source, /safeKmlId\s*=\s*escapeHtml\(kmlFile\.id\)/)
  }
})
