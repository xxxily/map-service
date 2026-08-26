import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const sources = [
  ['2D', readFileSync(new URL('../src/map/kml.js', import.meta.url), 'utf8')],
  ['3D', readFileSync(new URL('../src/map3d/kml.js', import.meta.url), 'utf8')],
]

test('2D and 3D explicit KML file deletion carries confirmed deletion intent', () => {
  for (const [label, source] of sources) {
    const deleteHandler = source.slice(
      source.indexOf("if (action === 'delete-file')"),
      source.indexOf("if (action === 'export')", source.indexOf("if (action === 'delete-file')")),
    )
    assert.match(
      deleteHandler,
      /saveToStorage\(\{ deletedIds: \[kmlId\], deletionIntent: 'user-confirmed' \}\)/,
      `${label} explicit deletion must carry confirmed intent`,
    )
  }
})

test('2D and 3D undo and redo mark only removed KML file ids as confirmed deletions', () => {
  for (const [label, source] of sources) {
    assert.match(source, /function getRemovedKmlFileIds \(previousFiles, nextFiles\)/, `${label} compares file collections`)
    assert.match(
      source,
      /saveToStorage\(deletedIds\.length > 0\s+\? \{ deletedIds, deletionIntent: 'user-confirmed' \}\s+: \{\}\)/,
      `${label} only sends deletion metadata when files disappeared`,
    )

    for (const functionName of ['undoKml', 'redoKml']) {
      const start = source.indexOf(`function ${functionName} (`)
      const body = source.slice(start, source.indexOf('\n}', start) + 2)
      assert.match(body, /const previousFiles = kmlList/, `${label} ${functionName} captures the prior file set`)
      assert.match(body, /saveKmlHistoryState\(previousFiles\)/, `${label} ${functionName} checks removed files`)
      assert.doesNotMatch(body, /saveToStorage\(\)/, `${label} ${functionName} does not bypass deletion detection`)
    }
  }
})
