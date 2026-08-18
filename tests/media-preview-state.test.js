import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  clampMediaPreviewScale,
  getDefaultMediaPreviewTrackExpanded,
  getMediaPreviewFeatureName,
  getMediaPreviewHeadingTitle,
  getMediaPreviewTrackLabel,
  getMediaPreviewTrackWindow,
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

test('media preview track exposes every gallery item for scrolling and direct selection', () => {
  assert.deepEqual(getMediaPreviewTrackWindow(4, 2), [0, 1, 2, 3])
  const indexes = getMediaPreviewTrackWindow(300, 150)
  assert.equal(indexes.length, 300)
  assert.deepEqual(indexes.slice(0, 3), [0, 1, 2])
  assert.deepEqual(indexes.slice(-3), [297, 298, 299])
  assert.equal(indexes[150], 150)
})

test('media preview prefers point names and falls back to stable track numbers', () => {
  const named = { type: 'image', title: '入口照片', featureName: '北门入口' }
  const unnamed = { type: 'iframe', title: '' }

  assert.equal(getMediaPreviewFeatureName(named), '北门入口')
  assert.equal(getMediaPreviewHeadingTitle(named), '北门入口')
  assert.equal(getMediaPreviewTrackLabel(named, 4), '北门入口')
  assert.equal(getMediaPreviewFeatureName(unnamed), '')
  assert.equal(getMediaPreviewHeadingTitle(unnamed), '页面')
  assert.equal(getMediaPreviewTrackLabel(unnamed, 4), '05')
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
  assert.match(previewSource, /getMediaPreviewHeadingTitle/)
  assert.match(previewSource, /getMediaPreviewTrackLabel/)
  assert.match(stylesSource, /\.media-preview-track-item\.has-feature-name/)
  assert.match(previewSource, /data-media-preview-action="toggle-track"/)
  assert.match(previewSource, /document\.createDocumentFragment\(\)/)
  assert.match(previewSource, /image\.dataset\.src = imageUrl/)
  assert.match(stylesSource, /\.media-preview-track-item\s*\{[^}]*content-visibility:\s*auto;/s)
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

test('media preview small-window mode keeps one title bar and centers navigation icons', () => {
  const previewSource = readFileSync(new URL('../src/ui/media-preview.js', import.meta.url), 'utf8')
  const stylesSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const previewTemplate = previewSource.match(/root\.innerHTML = `([\s\S]*?)`/)?.[1]
  const headerTemplate = previewTemplate?.match(/<header class="media-preview-header">[\s\S]*?<\/header>/)?.[0]

  assert.ok(previewTemplate)
  assert.ok(headerTemplate)
  assert.equal([...previewTemplate.matchAll(/data-media-preview-action="restore"/g)].length, 1)
  assert.match(headerTemplate, /data-media-preview-action="restore"/)
  assert.doesNotMatch(previewSource, /media-preview-restore-copy|data-media-preview-restore-title|data-media-preview-restore-position/)
  assert.match(stylesSource, /\.media-preview-root\.is-minimized \.media-preview-header\s*\{[^}]*opacity:\s*1;[^}]*background:/s)
  assert.match(stylesSource, /\.media-preview-root\.is-minimized \.media-preview-heading\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;[^}]*align-items:\s*center;/s)
  const minimizedNavRule = stylesSource.match(/\.media-preview-root\.is-minimized \.media-preview-nav:not\(\[hidden\]\)\s*\{([^}]*)\}/s)?.[1] || ''
  assert.match(minimizedNavRule, /display:\s*grid;/)
  assert.match(minimizedNavRule, /place-items:\s*center;/)
  assert.match(minimizedNavRule, /top:\s*50%;/)
  assert.match(minimizedNavRule, /transform:\s*translateY\(-50%\);/)
})

test('media preview cleanup releases media sources and observers between items and on close', () => {
  const source = readFileSync(new URL('../src/ui/media-preview.js', import.meta.url), 'utf8')
  const cleanupSource = source.match(/function cleanupCurrentMedia \(\)[\s\S]*?\n}\n\nfunction cleanupTrackObserver/)?.[0] || ''
  const closeSource = source.match(/function hideMediaPreview \(\)[\s\S]*?\n}\n\nexport function closeMediaPreview/)?.[0] || ''

  assert.match(cleanupSource, /cleanupPanzoom\(\)/)
  assert.match(cleanupSource, /hlsInstance\?\.destroy\(\)/)
  assert.match(cleanupSource, /media\.pause\(\)/)
  assert.match(cleanupSource, /media\.removeAttribute\('src'\)/)
  assert.match(cleanupSource, /media\.load\(\)/)
  assert.match(cleanupSource, /frame\.removeAttribute\('src'\)/)
  assert.match(cleanupSource, /content\?\.replaceChildren\(\)/)
  assert.match(closeSource, /cleanupTrackObserver\(\)/)
  assert.match(closeSource, /track\?\.replaceChildren\(\)/)
  assert.match(closeSource, /delete track\.dataset\.signature/)
  assert.match(closeSource, /document\.removeEventListener\('keydown', onDocumentKeydown\)/)
})
