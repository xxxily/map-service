import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  clampMediaPreviewScale,
  getDefaultMediaPreviewTrackExpanded,
  getWrappedMediaIndex,
  normalizeMediaPreviewItems,
} from '../src/ui/media-preview-state.js'

test('media preview wraps gallery navigation and clamps image scale', () => {
  assert.equal(getWrappedMediaIndex(-1, 3), 2)
  assert.equal(getWrappedMediaIndex(3, 3), 0)
  assert.equal(getWrappedMediaIndex(1, 0), 0)
  assert.equal(clampMediaPreviewScale(0.2), 1)
  assert.equal(clampMediaPreviewScale(3.4), 3.4)
  assert.equal(clampMediaPreviewScale(20), 6)
  assert.equal(clampMediaPreviewScale('invalid'), 1)
  assert.equal(getDefaultMediaPreviewTrackExpanded(3, false), true)
  assert.equal(getDefaultMediaPreviewTrackExpanded(3, true), false)
  assert.equal(getDefaultMediaPreviewTrackExpanded(1, false), false)
})

test('media preview only accepts supported HTTPS media items', () => {
  const items = normalizeMediaPreviewItems([
    { type: 'image', url: 'https://cdn.example.com/a.jpg', title: 'A' },
    { type: 'link', url: 'https://example.com/' },
    { type: 'video', url: 'http://cdn.example.com/b.mp4' },
    { url: 'https://cdn.example.com/c.mp3', title: 'C' },
  ], 'audio')

  assert.deepEqual(items.map(item => item.type), ['image', 'audio'])
  assert.equal(items[1].title, 'C')
})

test('KML media thumbnails open the in-app preview instead of a blank browser page', () => {
  const panelSource = readFileSync(new URL('../src/map/kml-content-panel.js', import.meta.url), 'utf8')
  const previewSource = readFileSync(new URL('../src/ui/media-preview.js', import.meta.url), 'utf8')
  const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

  assert.match(panelSource, /data-kml-media-preview/)
  assert.match(panelSource, /openMediaPreview/)
  assert.doesNotMatch(panelSource, /<a class="kml-content-image-item"/)
  assert.match(previewSource, /item\?\.renderUrl \|\| item\?\.url/)
  assert.match(previewSource, /source\.href = getOriginalContentUrl\(item\)/)
  assert.match(previewSource, /data-media-preview-track/)
  assert.match(previewSource, /data-media-preview-action="toggle-track"/)
  assert.match(previewSource, /createMediaPreviewHistoryGuard/)
  assert.match(previewSource, /data-media-preview-action="minimize"/)
  assert.match(previewSource, /data-media-preview-action="restore"/)
  assert.match(previewSource, /import\('hls\.js'\)/)
  assert.match(previewSource, /video\.autoplay = true/)
  assert.match(previewSource, /video\.muted = true/)
  assert.match(previewSource, /onActiveItemChange/)
  assert.match(previewSource, /activeItemChangeHandler\?\.\(item\)/)
  assert.match(previewSource, /media-preview-iframe-shell/)
  assert.match(previewSource, /shell\.dataset\.provider/)
  assert.doesNotMatch(previewSource, /media-preview-feature-jump|data-media-preview-feature|open-feature/)
  assert.match(stylesSource, /\.media-preview-image\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*contain;/s)
  assert.match(stylesSource, /\.media-preview-content\s*\{[^}]*background:\s*var\(--media-preview-surface,\s*#050909\);/s)
  assert.match(stylesSource, /\.media-preview-iframe-shell\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*flex-start;[^}]*padding-block:[^;]+;[^}]*padding-inline:\s*0;[^}]*background:\s*var\(--media-preview-surface,\s*#050909\);/s)
  assert.match(stylesSource, /\.media-preview-iframe\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;[^}]*background:\s*var\(--media-preview-surface,\s*#050909\);[^}]*color-scheme:\s*dark;/s)
  assert.doesNotMatch(stylesSource, /\.media-preview-iframe\s*\{[^}]*width:\s*min\(1280px,\s*100%\)/s)
})
