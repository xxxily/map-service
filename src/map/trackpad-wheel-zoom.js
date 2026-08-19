export const WHEEL_GESTURE_IDLE_MS = 120
export const TRACKPAD_PINCH_MOMENTUM_GUARD_MS = 180

const PATCH_FLAG = Symbol.for('map-service.stable-wheel-zoom')
const GESTURE_STATE = Symbol.for('map-service.wheel-gesture-state')

export function createWheelGestureState () {
  return {
    mode: null,
    direction: 0,
    lastEventAt: Number.NEGATIVE_INFINITY,
    lastPinchAt: Number.NEGATIVE_INFINITY,
  }
}

function normalizeTimestamp (value) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function getWheelInputMode (event) {
  return event?.ctrlKey === true && Number(event?.deltaMode || 0) === 0
    ? 'pinch'
    : 'scroll'
}

export function getWheelGestureDecision (previousState, sample) {
  const state = previousState || createWheelGestureState()
  const delta = Number(sample?.delta)
  const direction = Math.sign(Number.isFinite(delta) ? delta : 0)
  if (!direction) return { action: 'ignore', state }

  const timestamp = normalizeTimestamp(sample?.timestamp)
  // Browsers normally expose monotonic wheel timestamps, but synthetic or
  // mixed native events can occasionally arrive out of order. An older event
  // must never reopen a superseded direction or input mode.
  if (timestamp < state.lastEventAt) return { action: 'ignore', state }

  const mode = sample?.mode === 'pinch' ? 'pinch' : 'scroll'
  const pinchElapsed = timestamp - state.lastPinchAt
  if (mode === 'scroll' && pinchElapsed >= 0 && pinchElapsed < TRACKPAD_PINCH_MOMENTUM_GUARD_MS) {
    return { action: 'ignore', state }
  }

  const elapsed = timestamp - state.lastEventAt
  const restarted = elapsed < 0 || elapsed > WHEEL_GESTURE_IDLE_MS
  const inputChanged = state.mode !== mode || state.direction !== direction
  const nextState = {
    mode,
    direction,
    lastEventAt: timestamp,
    lastPinchAt: mode === 'pinch' ? timestamp : state.lastPinchAt,
  }

  return {
    action: restarted || inputChanged ? 'reset' : 'continue',
    state: nextState,
  }
}

function resetLeafletWheelAccumulator (handler) {
  clearTimeout(handler._timer)
  handler._timer = null
  handler._delta = 0
  handler._startTime = null
}

function eventTimestamp (event) {
  const timestamp = Number(event?.timeStamp)
  if (Number.isFinite(timestamp) && timestamp > 0) return timestamp
  return globalThis.performance?.now?.() || Date.now()
}

export function installStableTrackpadWheelZoom (Leaflet) {
  const prototype = Leaflet?.Map?.ScrollWheelZoom?.prototype
  if (!prototype || prototype[PATCH_FLAG]) return false

  const originalOnWheelScroll = prototype._onWheelScroll
  if (!(originalOnWheelScroll instanceof Function) || !(Leaflet?.DomEvent?.getWheelDelta instanceof Function)) {
    return false
  }

  prototype._onWheelScroll = function (event) {
    const decision = getWheelGestureDecision(this[GESTURE_STATE], {
      delta: Leaflet.DomEvent.getWheelDelta(event),
      mode: getWheelInputMode(event),
      timestamp: eventTimestamp(event),
    })
    this[GESTURE_STATE] = decision.state

    if (decision.action === 'ignore') {
      Leaflet.DomEvent.stop(event)
      return
    }
    if (decision.action === 'reset') resetLeafletWheelAccumulator(this)

    return originalOnWheelScroll.call(this, event)
  }
  prototype[PATCH_FLAG] = true
  return true
}
