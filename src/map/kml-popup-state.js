/**
 * Return the identity of the KML feature whose popup is currently open.
 * Leaflet keeps map._popup after close(), so the overlay's open state must be
 * checked before using its source for viewport-render restoration.
 */
export function getOpenKmlPopupIdentity (map) {
  const popup = map?.getPopup?.() || map?._popup
  if (!popup) return null

  const popupIsOpen = typeof popup.isOpen === 'function'
    ? popup.isOpen() === true
    : popup._map === map || Boolean(map?.hasLayer?.(popup))
  if (!popupIsOpen) return null

  const source = popup._source
  const kmlId = String(source?._mapServiceKmlFileId || '')
  const featureId = String(source?._mapServiceKmlFeatureId || '')
  return kmlId && featureId ? { kmlId, featureId } : null
}
