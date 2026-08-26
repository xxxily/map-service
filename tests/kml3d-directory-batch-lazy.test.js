import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/map3d/kml.js', import.meta.url), 'utf8')

test('3D KML feature batch mode is scoped to one file and rendered in file actions', () => {
  assert.match(source, /kmlBatchFileId === kmlFile\?\.id/)
  assert.match(source, /\$\{renderKmlBatchToolbar\(kmlFile\)\}/)
  assert.match(source, /data-kml-action="toggle-batch" data-kml-id="\$\{escapeHtml\(kmlFile\.id\)\}"/)
  assert.doesNotMatch(source, /kml-section-actions[\s\S]{0,200}renderKmlBatchToolbar\(\)/)
})

test('3D directory batch mode is configuration-gated and uses confirmed batch deletion intent', () => {
  assert.match(source, /config\?\.kml\?\.batchDownloadEnabled === true/)
  assert.match(source, /createKmlDirectoryBatchSelectionModel/)
  assert.match(source, /deletionIntent: 'user-confirmed-batch'/)
  assert.match(source, /filter\(file => selectedIds\.has\(file\.id\) && !file\.isDefault\)/)
  assert.match(source, /isPersonal\s*\? `\$\{visibilityButton\}\$\{renderKmlDirectoryBatchControls\(group\)\}/)
  assert.match(source, /isPersonal && !directoryWritable \? 'disabled' : ''/)
})

test('2D and 3D account directory downloads use server-authoritative export per file', async () => {
  const map2d = await readFile(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  for (const code of [map2d, source]) {
    assert.match(code, /import \{ accountApi, saveDownload \} from ['"]\.\.\/account\/api\.js['"]/)
    const flow = code.slice(code.indexOf('async function downloadDirectoryBatchFiles'), code.indexOf('async function deleteDirectoryBatchFiles'))
    assert.match(flow, /if \(isAccountKmlMode\(\)\)/)
    assert.match(flow, /await accountApi\.exportKml\(file\.id\)/)
    assert.match(flow, /saveDownload\(download/)
    assert.match(flow, /loadSharedKmlFileForUse\(file\)/)
  }
})

test('3D share display, directory display, expand and export use lazy detail loading', () => {
  assert.match(source, /loadActiveShareFile\(kmlFile\)/)
  assert.match(source, /loadSharedKmlFileForUse\(file(?:, \{ enableOnSuccess: true \})?\)/)
  assert.match(source, /loadSharedKmlFileForUse\(kmlFile, \{ enableOnSuccess: true \}\)/)
  assert.match(source, /contentLoaded === false && !\(await loadSharedKmlFileForUse\(kmlFile\)\)/)
})

test('2D and 3D directory detail loading is bounded and visibility waits for all loads', async () => {
  const map2d = await readFile(new URL('../src/map/kml.js', import.meta.url), 'utf8')
  for (const code of [map2d, source]) {
    assert.match(code, /import \{ loadKmlFilesWithConcurrency \} from ['"][^'"]*kml-detail-loading\.js['"]/)
    assert.match(code, /toggleKmlDirectoryBatchSelectionAll/)
    assert.match(code, /loadKmlFilesWithConcurrency\(files, (?:loadAccountKmlFileForUse|file => loadSharedKmlFileForUse\(file\))\)/)
    assert.match(code, /if \(!loaded\.every\(Boolean\)\)[\s\S]*未修改显隐状态/)
    assert.match(code, /visibilityBeforeLoad[\s\S]*files\.forEach\(\(file, index\) => \{ file\.enabled = visibilityBeforeLoad\[index\] \}\)/)
    assert.doesNotMatch(code, /Promise\.all\(files\.map\(loadAccountKmlFileForUse\)\)/)
  }
})
