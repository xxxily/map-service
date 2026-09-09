export function captureKmlPanelScrollState (container) {
  const scrollContainer = container?.closest?.('.kml-panel-body') || container?.parentElement
  if (!scrollContainer) return null
  return {
    scrollContainer,
    scrollTop: Number(scrollContainer.scrollTop) || 0,
    scrollLeft: Number(scrollContainer.scrollLeft) || 0,
  }
}

export function restoreKmlPanelScrollState (state) {
  if (!state?.scrollContainer) return
  state.scrollContainer.scrollTop = state.scrollTop
  state.scrollContainer.scrollLeft = state.scrollLeft
}
