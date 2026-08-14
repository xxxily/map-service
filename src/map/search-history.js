const MAX_SEARCH_HISTORY_ITEMS = 10
const MAX_SEARCH_HISTORY_NAME_LENGTH = 200

function getStorage (storage) {
  if (storage) return storage
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

function readCoordinate (value, methodName, propertyNames) {
  if (value && typeof value[methodName] === 'function') {
    return Number(value[methodName]())
  }
  for (const propertyName of propertyNames) {
    if (value?.[propertyName] !== undefined) return Number(value[propertyName])
  }
  return Number.NaN
}

/**
 * Convert AMap LngLat instances and legacy/plain values to a stable pair.
 * History is persisted as JSON, so never store provider-specific objects.
 */
export function normalizeSearchLocation (location) {
  if (Array.isArray(location)) {
    const [lng, lat] = location
    const normalizedLng = Number(lng)
    const normalizedLat = Number(lat)
    if (Number.isFinite(normalizedLng) && Number.isFinite(normalizedLat) &&
        normalizedLng >= -180 && normalizedLng <= 180 &&
        normalizedLat >= -90 && normalizedLat <= 90) {
      return { lng: normalizedLng, lat: normalizedLat }
    }
    return null
  }

  const lng = readCoordinate(location, 'getLng', ['lng', 'longitude'])
  const lat = readCoordinate(location, 'getLat', ['lat', 'latitude'])
  if (!Number.isFinite(lng) || !Number.isFinite(lat) ||
      lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return null
  }
  return { lng, lat }
}

export function normalizeSearchHistoryItem (item) {
  const name = String(item?.name ?? '').normalize('NFKC').trim().slice(0, MAX_SEARCH_HISTORY_NAME_LENGTH)
  const location = normalizeSearchLocation(item?.location ?? item)
  if (!name || !location) return null
  return { name, location }
}

export function readSearchHistory (key, storage) {
  const target = getStorage(storage)
  if (!target || !key) return []
  try {
    const parsed = JSON.parse(target.getItem(key) || '[]')
    if (!Array.isArray(parsed)) return []
    const seen = new Set()
    return parsed
      .map(normalizeSearchHistoryItem)
      .filter(item => {
        if (!item) return false
        const identity = `${item.name}\u0000${item.location.lng}\u0000${item.location.lat}`
        if (seen.has(identity)) return false
        seen.add(identity)
        return true
      })
      .slice(0, MAX_SEARCH_HISTORY_ITEMS)
  } catch {
    return []
  }
}

export function saveSearchHistory (key, item, storage) {
  const normalized = normalizeSearchHistoryItem(item)
  const target = getStorage(storage)
  if (!normalized || !target || !key) return null

  const history = readSearchHistory(key, target).filter(existing =>
    existing.name !== normalized.name ||
    existing.location.lng !== normalized.location.lng ||
    existing.location.lat !== normalized.location.lat,
  )
  history.unshift(normalized)
  try {
    target.setItem(key, JSON.stringify(history.slice(0, MAX_SEARCH_HISTORY_ITEMS)))
  } catch {
    // Storage failures must not prevent a search result from being displayed.
  }
  return normalized
}

export function clearSearchHistory (key, storage) {
  const target = getStorage(storage)
  if (!target || !key) return
  try {
    target.removeItem(key)
  } catch {
    // Ignore disabled or unavailable browser storage.
  }
}

function createHistoryButton (item, onSelect, className = 'auto-item') {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = className
  button.setAttribute('data-search-history-item', '')
  const label = document.createElement('span')
  label.className = 'sug-key'
  label.textContent = item.name
  button.appendChild(label)

  const select = event => {
    event.preventDefault()
    onSelect({ ...item, location: { ...item.location } })
    button.closest('.history-dropdown')?.style.setProperty('display', 'none')
  }
  button.addEventListener('click', select)
  return button
}

export function renderSearchHistoryDropdown (container, input, key, onSelect, options = {}) {
  if (!container || !input || typeof document === 'undefined') return null

  let dropdown = container.querySelector('.history-dropdown')
  if (!dropdown) {
    dropdown = document.createElement('div')
    dropdown.className = 'history-dropdown amap-sug-result'
    dropdown.style.cssText = 'display: none; position: absolute; top: 100%; left: 0; width: 100%; z-index: 20000; box-sizing: border-box;'
    container.appendChild(dropdown)
  }

  const hide = () => { dropdown.style.display = 'none' }
  const show = () => {
    if (input.value.trim()) {
      hide()
      return
    }
    const history = readSearchHistory(key, options.storage)
    if (history.length === 0) {
      hide()
      return
    }

    dropdown.replaceChildren()
    history.forEach(item => dropdown.appendChild(createHistoryButton(item, selected => {
      input.value = selected.name
      onSelect(selected)
    })))

    const clearButton = createHistoryButton(
      { name: '清除历史', location: { lng: 0, lat: 0 } },
      () => clearSearchHistory(key, options.storage),
      'auto-item history-clear-item',
    )
    clearButton.removeAttribute('data-search-history-item')
    clearButton.querySelector('.sug-key').style.cssText = 'color: #94a3b8 !important; font-size: 11px; font-weight: 400;'
    clearButton.style.cssText = 'text-align: right; border-top: 1px dashed #edf2f7; padding: 6px 12px !important;'
    dropdown.appendChild(clearButton)
    dropdown.style.display = 'block'
  }

  let blurTimer = null
  const onInput = () => input.value.trim() ? hide() : show()
  const onBlur = () => {
    blurTimer = window.setTimeout(() => {
      blurTimer = null
      hide()
    }, 260)
  }

  input.addEventListener('focus', show)
  input.addEventListener('click', show)
  input.addEventListener('input', onInput)
  input.addEventListener('blur', onBlur)

  return {
    dropdown,
    destroy () {
      if (blurTimer !== null) window.clearTimeout(blurTimer)
      input.removeEventListener('focus', show)
      input.removeEventListener('click', show)
      input.removeEventListener('input', onInput)
      input.removeEventListener('blur', onBlur)
      dropdown.remove()
    },
  }
}

export { MAX_SEARCH_HISTORY_ITEMS }
