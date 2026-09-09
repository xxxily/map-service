const latestCaptureTokenByContainer = new WeakMap()
let nextCaptureToken = 0

function readElementAttribute (element, name) {
  if (!element) return ''
  try {
    const value = element.getAttribute?.(name)
    if (value != null && value !== '') return String(value)
  } catch {
    // Lightweight test doubles and detached nodes may not implement attributes.
  }
  const dataKey = name.startsWith('data-')
    ? name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    : ''
  const value = dataKey ? element.dataset?.[dataKey] : ''
  return value == null ? '' : String(value)
}

function collectElements (root, selector) {
  if (!root) return []
  const elements = []
  if (root.matches?.(selector)) elements.push(root)
  if (typeof root.querySelectorAll === 'function') {
    elements.push(...Array.from(root.querySelectorAll(selector)))
  }
  return elements
}

function findPanelScrollContainer (container) {
  if (!container) return null
  if (container.matches?.('.kml-panel-body')) return container
  return container.closest?.('.kml-panel-body') || null
}

function getFeatureListIdentity (element, index) {
  const stableKey = readElementAttribute(element, 'data-kml-scroll-key') ||
    readElementAttribute(element, 'data-kml-id') ||
    readElementAttribute(element.closest?.('[data-kml-card-id]'), 'data-kml-card-id')
  return stableKey
    ? { key: stableKey, stable: true }
    : { key: `index:${index}`, stable: false }
}

function readScrollPosition (element) {
  return {
    scrollTop: Number(element?.scrollTop) || 0,
    scrollLeft: Number(element?.scrollLeft) || 0,
  }
}

function writeScrollPosition (element, position) {
  if (!element || !position) return
  element.scrollTop = position.scrollTop
  element.scrollLeft = position.scrollLeft
}

function getFeatureListStates (container) {
  const seenKeys = new Map()
  return collectElements(container, '.kml-features-list').map((element, index) => {
    const identity = getFeatureListIdentity(element, index)
    const occurrence = seenKeys.get(identity.key) || 0
    seenKeys.set(identity.key, occurrence + 1)
    return {
      element,
      key: identity.key,
      stableKey: identity.stable,
      occurrence,
      ...readScrollPosition(element),
    }
  })
}

function syncElementAttributes (target, source) {
  if (!target?.attributes || !source?.attributes ||
      typeof target.setAttribute !== 'function' || typeof target.removeAttribute !== 'function') return
  const sourceNames = new Set()
  Array.from(source.attributes).forEach(attribute => {
    sourceNames.add(attribute.name)
    target.setAttribute(attribute.name, attribute.value)
  })
  Array.from(target.attributes).forEach(attribute => {
    if (!sourceNames.has(attribute.name)) target.removeAttribute(attribute.name)
  })
}

function preserveExistingFeatureLists (container, state) {
  if (!container || !state?.featureLists?.length) return
  const candidates = collectElements(container, '.kml-features-list')
  const candidatesByKey = new Map()
  candidates.forEach((candidate, index) => {
    const key = getFeatureListIdentity(candidate, index).key
    const matches = candidatesByKey.get(key) || []
    matches.push(candidate)
    candidatesByKey.set(key, matches)
  })
  state.featureLists.forEach((savedList, index) => {
    const matching = candidatesByKey.get(savedList.key) || []
    const replacement = matching[savedList.occurrence] ||
      (!savedList.stableKey &&
       candidates[index] &&
       !getFeatureListIdentity(candidates[index], index).stable
        ? candidates[index]
        : null)
    const previous = savedList.element
    if (!replacement || !previous || replacement === previous ||
        typeof replacement.replaceWith !== 'function') return
    try {
      syncElementAttributes(previous, replacement)
      if ('innerHTML' in previous && 'innerHTML' in replacement) {
        previous.innerHTML = replacement.innerHTML
      }
      replacement.replaceWith(previous)
      writeScrollPosition(previous, savedList)
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[kml-panel-scroll] 无法复用内部滚动容器，将继续执行滚动位置恢复', error)
      }
    }
  })
}

function scheduleDeferredRestore (callback) {
  const requestFrame = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : null
  if (!requestFrame) return
  requestFrame(() => {
    callback()
    // A second pass covers layout/content-visibility settling after a large
    // KML feature list is recreated.
    requestFrame(callback)
  })
}

function isCurrentCapture (state) {
  if (!state?.container || !state.token) return true
  return latestCaptureTokenByContainer.get(state.container) === state.token
}

export function captureKmlPanelScrollState (container) {
  if (!container || (typeof container !== 'object' && typeof container !== 'function')) return null
  const scrollContainer = findPanelScrollContainer(container)
  const featureLists = getFeatureListStates(container)
  if (!scrollContainer && !featureLists.length) return null
  const token = ++nextCaptureToken
  latestCaptureTokenByContainer.set(container, token)
  return {
    container,
    token,
    scrollContainer,
    ...(scrollContainer ? readScrollPosition(scrollContainer) : {}),
    featureLists,
  }
}

export function restoreKmlPanelScrollState (state) {
  if (!state || !isCurrentCapture(state)) return
  const apply = () => {
    if (!isCurrentCapture(state)) return
    writeScrollPosition(state.scrollContainer, state)
    if (!state.container || !state.featureLists?.length) return
    const candidates = collectElements(state.container, '.kml-features-list')
    const candidatesByKey = new Map()
    candidates.forEach((candidate, index) => {
      const key = getFeatureListIdentity(candidate, index).key
      const matches = candidatesByKey.get(key) || []
      matches.push(candidate)
      candidatesByKey.set(key, matches)
    })
    const used = new Set()
    state.featureLists.forEach((savedList, index) => {
      const matching = candidatesByKey.get(savedList.key) || []
      const replacement = matching[savedList.occurrence] ||
        (!savedList.stableKey &&
         candidates[index] &&
         !getFeatureListIdentity(candidates[index], index).stable
          ? candidates[index]
          : null)
      if (used.has(replacement)) return
      if (!replacement) return
      used.add(replacement)
      writeScrollPosition(replacement, savedList)
    })
  }
  apply()
  scheduleDeferredRestore(apply)
}

export function replaceKmlPanelContent (container, html) {
  if (!container) return
  const state = captureKmlPanelScrollState(container)
  container.innerHTML = html
  preserveExistingFeatureLists(container, state)
  restoreKmlPanelScrollState(state)
}
