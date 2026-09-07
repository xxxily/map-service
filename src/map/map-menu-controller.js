const MAP_MENU_ACTION_SELECTOR = '[data-action]'

function isPromiseLike (value) {
  return Boolean(value && typeof value.then === 'function')
}

/**
 * Keep the static map toolbar interactive while map-specific services are
 * still loading. Actions which need a runtime handler are coalesced and
 * replayed once that handler is registered; the toolbar expansion state is
 * updated immediately so a tap never disappears without feedback.
 */
export function createMapMenuController (options = {}) {
  const menu = options.menu
  if (!menu || typeof menu.addEventListener !== 'function') return null

  const handlers = new Map()
  const pending = new Set()
  const inFlight = new Set()
  let toolsExpanded = options.toolsExpanded === true
  let ready = false
  let disposed = false

  const reportError = (error, action) => {
    if (typeof options.onError === 'function') {
      options.onError(error, action)
      return
    }
    console.error(`地图工具“${action}”执行失败`, error)
  }

  const syncToolsUi = () => {
    menu.classList?.toggle('is-expanded', toolsExpanded)
    const moreButton = menu.querySelector?.('[data-action="toggleLayerControl"]')
    moreButton?.setAttribute('aria-expanded', String(toolsExpanded))
    menu.dataset.mapMenuState = ready ? 'ready' : 'initializing'
  }

  const invoke = (action, context = {}) => {
    if (disposed) return false
    const handler = handlers.get(action)
    if (!(handler instanceof Function)) {
      pending.add(action)
      return false
    }
    if (inFlight.has(action)) return false

    let result
    try {
      result = handler({
        ...context,
        action,
        expanded: toolsExpanded,
      })
    } catch (error) {
      reportError(error, action)
      return false
    }

    if (isPromiseLike(result)) {
      inFlight.add(action)
      Promise.resolve(result)
        .catch(error => reportError(error, action))
        .finally(() => inFlight.delete(action))
    }
    return true
  }

  const flushPending = () => {
    const actions = [...pending]
    pending.clear()
    actions.forEach(action => {
      if (handlers.has(action)) invoke(action, { replay: true })
      else if (!ready) pending.add(action)
    })
  }

  const onClick = event => {
    if (disposed) return
    const target = event.target?.closest?.(MAP_MENU_ACTION_SELECTOR)
    if (!target || (typeof menu.contains === 'function' && !menu.contains(target))) return
    const action = target.getAttribute?.('data-action')
    if (!action) return

    if (action === 'toggleLayerControl') {
      toolsExpanded = !toolsExpanded
      syncToolsUi()
      invoke(action, { event, target })
      return
    }

    invoke(action, { event, target })
  }

  menu.addEventListener('click', onClick)

  const setAction = (action, handler) => {
    if (!action) return controller
    if (handler instanceof Function) handlers.set(String(action), handler)
    else handlers.delete(String(action))
    flushPending()
    return controller
  }

  const setActions = (nextHandlers = {}, options = {}) => {
    Object.entries(nextHandlers).forEach(([action, handler]) => {
      if (handler instanceof Function) handlers.set(action, handler)
      else handlers.delete(action)
    })
    if (options.ready === true) ready = true
    syncToolsUi()
    flushPending()
    return controller
  }

  const setReady = (value = true) => {
    ready = value === true
    syncToolsUi()
    flushPending()
    return controller
  }

  const setToolsExpanded = (expanded, options = {}) => {
    toolsExpanded = expanded === true
    syncToolsUi()
    if (options.apply === true) invoke('toggleLayerControl', { reason: 'state-sync' })
    return toolsExpanded
  }

  const controller = {
    setAction,
    setActions,
    setReady,
    setToolsExpanded,
    invoke,
    getToolsExpanded: () => toolsExpanded,
    isBusy: action => inFlight.has(String(action || '')),
    dispose: () => {
      if (disposed) return
      disposed = true
      menu.removeEventListener?.('click', onClick)
      pending.clear()
      handlers.clear()
    },
  }

  syncToolsUi()
  setActions(options.handlers || {})
  return controller
}

