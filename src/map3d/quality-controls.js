import { normalizeQualitySelection } from './scene-quality.js'

export const TERRAIN_QUALITY_OPTIONS = Object.freeze([
  Object.freeze(['auto', '自动']),
  Object.freeze(['economy', '节能']),
  Object.freeze(['balanced', '均衡']),
  Object.freeze(['quality', '高质量']),
])

export function getTerrainQualityLabel (selection, runtimeState = '') {
  const normalized = normalizeQualitySelection(selection, 'balanced')
  const baseLabel = normalized === 'auto'
    ? '自动（当前按均衡执行）'
    : TERRAIN_QUALITY_OPTIONS.find(([id]) => id === normalized)?.[1] || '均衡'
  return runtimeState === 'fallback' || runtimeState === 'disabled'
    ? `${baseLabel}（平面模式按节能执行）`
    : baseLabel
}

export function ensureTerrainQualityControls (documentLike, onSelectionChange) {
  const existing = documentLike?.getElementById?.('terrain-quality-panel')
  if (existing) return existing

  const statusPanel = documentLike?.getElementById?.('terrain-status-panel')
  if (!statusPanel || typeof documentLike?.createElement !== 'function') return null

  const panel = documentLike.createElement('section')
  panel.id = 'terrain-quality-panel'
  panel.className = 'terrain-quality-panel'
  panel.setAttribute('role', 'group')
  panel.setAttribute('aria-label', '三维地形渲染质量')

  const label = documentLike.createElement('span')
  label.id = 'terrain-quality-label'
  label.className = 'terrain-quality-label'
  label.setAttribute('aria-live', 'polite')
  panel.appendChild(label)

  const options = documentLike.createElement('div')
  options.className = 'terrain-quality-options'
  for (const [quality, labelText] of TERRAIN_QUALITY_OPTIONS) {
    const button = documentLike.createElement('button')
    button.type = 'button'
    button.id = `terrain-quality-${quality}`
    button.className = 'terrain-quality-btn'
    button.dataset.terrainQuality = quality
    button.textContent = labelText
    button.setAttribute('aria-pressed', 'false')
    button.setAttribute('aria-label', quality === 'auto'
      ? '自动渲染质量，当前按均衡执行'
      : `使用${labelText}渲染质量`)
    button.addEventListener('click', () => onSelectionChange?.(quality))
    options.appendChild(button)
  }
  panel.appendChild(options)

  const keyboardHelp = documentLike.createElement('p')
  keyboardHelp.id = 'map3d-keyboard-help'
  keyboardHelp.className = 'map3d-keyboard-help'
  keyboardHelp.textContent = '聚焦地图后可使用方向键平移，使用加号或减号缩放。'
  panel.appendChild(keyboardHelp)

  statusPanel.insertAdjacentElement('afterend', panel)
  return panel
}

export function updateTerrainQualityControls (panel, selection, runtimeState = '') {
  if (!panel) return null
  const normalized = normalizeQualitySelection(selection, 'balanced')
  const labelText = `渲染质量：${getTerrainQualityLabel(normalized, runtimeState)}`
  const label = panel.querySelector?.('#terrain-quality-label')
  if (label) label.textContent = labelText
  panel.querySelectorAll?.('[data-terrain-quality]').forEach((button) => {
    const selected = button.dataset.terrainQuality === normalized
    button.classList.toggle('is-selected', selected)
    button.setAttribute('aria-pressed', String(selected))
  })
  return { selection: normalized, label: labelText }
}
