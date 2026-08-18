import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applySceneQuality,
  formatCompactTerrainStatus,
  formatTerrainStatus,
  getHeightAdjustedExaggeration,
  getRecommendedPixelRatio,
  getTerrainProviderPlan,
  normalizeQualitySelection,
  normalizeQualityPreset,
  QUALITY_PRESETS,
} from '../src/map3d/scene-quality.js'

test('scene quality normalizes settings and caps device pixel ratio', () => {
  assert.equal(normalizeQualityPreset('auto'), 'balanced')
  assert.equal(normalizeQualityPreset('unknown'), 'balanced')
  assert.equal(normalizeQualitySelection('auto'), 'auto')
  assert.equal(getRecommendedPixelRatio(3, 'economy'), 1)
  assert.equal(getRecommendedPixelRatio(3, 'quality'), 2)
  assert.equal(QUALITY_PRESETS.economy.maxExaggeration, 1.08)
  assert.equal(QUALITY_PRESETS.balanced.maxExaggeration, 1.2)
  assert.equal(QUALITY_PRESETS.quality.maxExaggeration, 1.35)
})

test('terrain plans only accept known providers and self-hosted URLs', () => {
  assert.equal(getTerrainProviderPlan('arcgis-terrain3d').kind, 'arcgis')
  assert.equal(getTerrainProviderPlan('not-a-provider').id, 'arcgis-terrain3d')
  assert.equal(getTerrainProviderPlan('self-hosted').id, 'ellipsoid')
  assert.equal(getTerrainProviderPlan('self-hosted', { url: 'https://terrain.example.com/' }).url, 'https://terrain.example.com/')
  assert.equal(getTerrainProviderPlan('maptiler-quantized-mesh').id, 'ellipsoid')
  assert.equal(
    getTerrainProviderPlan('maptiler-quantized-mesh', { mapTilerUrl: 'https://terrain.example.com/maptiler/' }).url,
    'https://terrain.example.com/maptiler/',
  )
})

test('exaggeration smoothly returns to one at high altitude', () => {
  assert.equal(getHeightAdjustedExaggeration(0, 'quality'), 1.35)
  assert.equal(getHeightAdjustedExaggeration(2_000_000, 'quality'), 1)
  assert.ok(getHeightAdjustedExaggeration(500_000, 'balanced') > 1)
})

test('applySceneQuality mutates only supported scene quality controls', () => {
  const viewer = {
    resolutionScale: 1,
    scene: {
      highDynamicRangeSupported: true,
      globe: {},
      postProcessStages: { fxaa: {}, ambientOcclusion: {} },
    },
  }
  const applied = applySceneQuality(viewer, 'quality', { devicePixelRatio: 3 })

  assert.equal(applied.id, 'quality')
  assert.equal(viewer.scene.globe.depthTestAgainstTerrain, true)
  assert.equal(viewer.scene.globe.maximumScreenSpaceError, 1.25)
  assert.equal(viewer.scene.postProcessStages.fxaa.enabled, true)
  assert.equal(viewer.scene.postProcessStages.ambientOcclusion.enabled, true)
  assert.equal(viewer.resolutionScale, 2)
})

test('terrain status never includes hidden provider details by itself', () => {
  assert.equal(formatTerrainStatus('standby'), '地形：等待进入 3D 模式')
  assert.equal(formatTerrainStatus('active', '1.35x'), '地形：真实地形已验证 · 1.35x')
  assert.equal(formatTerrainStatus('fallback'), '地形：已回退平面模式')
})

test('compact terrain status fits beside camera coordinates', () => {
  assert.equal(formatCompactTerrainStatus('active', '1.18x'), '真实地形 1.18×')
  assert.equal(formatCompactTerrainStatus('loading'), '地形加载中')
  assert.equal(formatCompactTerrainStatus('fallback', '上游服务不可用'), '平面模式')
})
