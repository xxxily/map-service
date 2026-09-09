const latestCaptureTokenByContainer = new WeakMap()
const featureListScrollMemoryByContainer = new WeakMap()
const featureListInvalidationVersionByContainer = new WeakMap()
const pendingFeatureListInvalidationByContainer = new WeakMap()
const latestFeatureListInvalidationKeysByContainer = new WeakMap()
const MAX_FEATURE_LIST_SCROLL_MEMORY = 512
// Invalidation versions for active/pending KML keys stay addressable so an
// older deferred restore cannot resurrect a removed list. Only historical
// tombstones are subject to this bound.
const MAX_FEATURE_LIST_INVALIDATION_TOMBSTONES = 512
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

function hasElementAttribute (element, name) {
  if (!element) return false
  try {
    if (element.hasAttribute?.(name)) return true
    return element.getAttribute?.(name) != null
  } catch {
    return false
  }
}

function isHiddenElement (element) {
  if (!element) return true
  if (element.hidden === true || element.closest?.('[hidden]')) return true
  try {
    const computedStyle = typeof window !== 'undefined' && window.getComputedStyle?.(element)
    if (computedStyle && (
      computedStyle.display === 'none' ||
      computedStyle.visibility === 'hidden' ||
      computedStyle.contentVisibility === 'hidden'
    )) return true
  } catch {
    // Detached nodes and lightweight test doubles may not expose styles.
  }
  const visited = new Set()
  let current = element.parentElement || element.parentNode
  while (current && !visited.has(current)) {
    visited.add(current)
    if (current.hidden === true || hasElementAttribute(current, 'hidden')) return true
    current = current.parentElement || current.parentNode
  }
  return false
}

function hasUnavailableLayout (element) {
  // A zero-height list with content is commonly observed while a collapsed
  // card or content-visibility subtree is settling. Do not replace a valid
  // remembered position with the transient zero value.
  if (!element || !('clientHeight' in element) || !('offsetHeight' in element) || !('scrollHeight' in element)) return false
  return Number(element.clientHeight) === 0 &&
    Number(element.offsetHeight) === 0 &&
    Number(element.scrollHeight) > 0
}

function canRememberFeatureListPosition (element) {
  return Boolean(element) && !isHiddenElement(element) && !hasUnavailableLayout(element)
}

function getFeatureListScrollMemory (container, create = false) {
  if (!container) return null
  let memory = featureListScrollMemoryByContainer.get(container)
  if (!memory && create) {
    memory = new Map()
    featureListScrollMemoryByContainer.set(container, memory)
  }
  return memory || null
}

function getFeatureListInvalidationVersions (container, create = false) {
  if (!container) return null
  let versions = featureListInvalidationVersionByContainer.get(container)
  if (!versions && create) {
    versions = new Map()
    featureListInvalidationVersionByContainer.set(container, versions)
  }
  return versions || null
}

function getPendingFeatureListInvalidations (container, create = false) {
  if (!container) return null
  let pending = pendingFeatureListInvalidationByContainer.get(container)
  if (!pending && create) {
    pending = new Set()
    pendingFeatureListInvalidationByContainer.set(container, pending)
  }
  return pending || null
}

function trimFeatureListInvalidationVersions (container) {
  const versions = getFeatureListInvalidationVersions(container)
  if (!versions || versions.size <= MAX_FEATURE_LIST_INVALIDATION_TOMBSTONES) return
  const protectedKeys = new Set([
    ...(getPendingFeatureListInvalidations(container) || []),
    ...(latestFeatureListInvalidationKeysByContainer.get(container) || []),
  ])
  while (versions.size > MAX_FEATURE_LIST_INVALIDATION_TOMBSTONES) {
    const oldestKey = [...versions.keys()].find(key => !protectedKeys.has(key))
    if (oldestKey === undefined) break
    versions.delete(oldestKey)
  }
}

function getFeatureListStateKey (state) {
  return JSON.stringify([
    state?.stableKey ? 'stable' : 'unkeyed',
    String(state?.key || ''),
    Number(state?.occurrence) || 0,
  ])
}

function getFeatureListInvalidationKey (state) {
  return JSON.stringify([
    state?.stableKey ? 'stable' : 'unkeyed',
    String(state?.key || ''),
  ])
}

function getFeatureListInvalidationVersion (container, state) {
  return getFeatureListInvalidationVersions(container)?.get(getFeatureListInvalidationKey(state)) || 0
}

function isFeatureListStateCurrent (captureState, featureListState) {
  if (!captureState?.container || !featureListState) return true
  const capturedVersion = captureState.featureListInvalidationVersions?.get(
    getFeatureListInvalidationKey(featureListState),
  ) || 0
  return getFeatureListInvalidationVersion(captureState.container, featureListState) === capturedVersion
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
      rememberable: canRememberFeatureListPosition(element),
      ...readScrollPosition(element),
    }
  })
}

function rememberFeatureListState (container, state) {
  if (!container || !state || state.rememberable === false || !canRememberFeatureListPosition(state.element)) return
  const memory = getFeatureListScrollMemory(container, true)
  const cacheKey = getFeatureListStateKey(state)
  memory.delete(cacheKey)
  memory.set(cacheKey, {
    key: state.key,
    stableKey: state.stableKey,
    occurrence: state.occurrence,
    scrollTop: state.scrollTop,
    scrollLeft: state.scrollLeft,
  })
  while (memory.size > MAX_FEATURE_LIST_SCROLL_MEMORY) {
    const oldestKey = memory.keys().next().value
    if (oldestKey === undefined) break
    memory.delete(oldestKey)
  }
}

function rememberFeatureListStates (container, states, captureState = null) {
  states?.forEach(state => {
    if (!captureState || isFeatureListStateCurrent(captureState, state)) {
      rememberFeatureListState(container, state)
    }
  })
}

function getRememberedFeatureListPosition (container, state) {
  const remembered = getFeatureListScrollMemory(container)?.get(getFeatureListStateKey(state))
  return remembered || null
}

function getRestorableFeatureListPosition (container, state) {
  if (!state) return null
  return getRememberedFeatureListPosition(container, state) ||
    (state.rememberable === false ? null : state)
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
      writeScrollPosition(previous, getRestorableFeatureListPosition(container, savedList))
    } catch (error) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') {
        console.warn('[kml-panel-scroll] 无法复用内部滚动容器，将继续执行滚动位置恢复', error)
      }
    }
  })
}

function scheduleDeferredRestore (callback, onSettled) {
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
    requestFrame(() => {
      callback()
      onSettled?.()
    })
  })
}

function isCurrentCapture (state) {
  if (!state?.container || !state.token) return true
  return latestCaptureTokenByContainer.get(state.container) === state.token
}

export function captureKmlPanelScrollState (container) {
  if (!container || (typeof container !== 'object' && typeof container !== 'function')) return null
  const scrollContainer = findPanelScrollContainer(container)
  const pendingInvalidations = getPendingFeatureListInvalidations(container)
  const featureLists = getFeatureListStates(container).filter(featureList => {
    return !pendingInvalidations?.has(getFeatureListInvalidationKey(featureList))
  })
  pendingInvalidations?.clear()
  latestFeatureListInvalidationKeysByContainer.set(container, new Set(
    featureLists.map(getFeatureListInvalidationKey),
  ))
  trimFeatureListInvalidationVersions(container)
  if (!scrollContainer && !featureLists.length) return null
  rememberFeatureListStates(container, featureLists)
  const token = ++nextCaptureToken
  latestCaptureTokenByContainer.set(container, token)
  return {
    container,
    token,
    scrollContainer,
    ...(scrollContainer ? readScrollPosition(scrollContainer) : {}),
    featureLists,
    featureListInvalidationVersions: new Map(featureLists.map(featureList => [
      getFeatureListInvalidationKey(featureList),
      getFeatureListInvalidationVersion(container, featureList),
    ])),
  }
}

export function restoreKmlPanelScrollState (state) {
  if (!state || !isCurrentCapture(state)) return
  const apply = () => {
    if (!isCurrentCapture(state)) return
    writeScrollPosition(state.scrollContainer, state)
    if (!state.container) return
    const candidates = getFeatureListStates(state.container)
    if (!candidates.length) return
    const savedByKey = new Map((state.featureLists || []).map(savedList => [
      getFeatureListStateKey(savedList),
      savedList,
    ]))
    candidates.forEach(candidate => {
      const savedList = savedByKey.get(getFeatureListStateKey(candidate))
      if (!isFeatureListStateCurrent(state, candidate)) return
      const position = getRestorableFeatureListPosition(state.container, savedList || candidate)
      if (!position) return
      writeScrollPosition(candidate.element, position)
    })
  }
  apply()
  scheduleDeferredRestore(apply, () => {
    if (!isCurrentCapture(state) || !state.container) return
    rememberFeatureListStates(state.container, getFeatureListStates(state.container), state)
  })
}

export function clearKmlPanelScrollState (container, keys = null) {
  if (!container) return
  const memory = getFeatureListScrollMemory(container)
  if (keys == null) {
    memory?.clear()
    getFeatureListInvalidationVersions(container)?.clear()
    getPendingFeatureListInvalidations(container)?.clear()
    latestFeatureListInvalidationKeysByContainer.delete(container)
  } else {
    const normalizedKeys = new Set((Array.isArray(keys) ? keys : [keys]).map(key => String(key || '')))
    const versions = getFeatureListInvalidationVersions(container, true)
    normalizedKeys.forEach(key => {
      const invalidationKey = getFeatureListInvalidationKey({ key, stableKey: true })
      versions.set(invalidationKey, (versions.get(invalidationKey) || 0) + 1)
      getPendingFeatureListInvalidations(container, true).add(invalidationKey)
    })
    trimFeatureListInvalidationVersions(container)
    if (memory) {
      for (const [cacheKey, entry] of memory) {
        if (entry.stableKey && normalizedKeys.has(String(entry.key))) memory.delete(cacheKey)
      }
    }
    // A key-scoped invalidation deliberately leaves other files' pending
    // restores alive; only the removed file must lose its old position.
    return
  }
  // A full reset (for example, switching the panel to another data scope)
  // invalidates every pending restore because no prior node can be trusted.
  latestCaptureTokenByContainer.set(container, ++nextCaptureToken)
}

export function replaceKmlPanelContent (container, html) {
  if (!container) return
  const state = captureKmlPanelScrollState(container)
  container.innerHTML = html
  preserveExistingFeatureLists(container, state)
  restoreKmlPanelScrollState(state)
}
