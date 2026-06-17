import L from 'leaflet'

let currentSearchMarker = null

export function initAmapSearch (map, AMap) {
  if (!AMap?.AutoComplete || !AMap?.PlaceSearch) {
    console.warn('高德搜索插件加载失败，搜索功能不可用')
    return
  }

  const autoComplete = new AMap.AutoComplete({
    input: 'tipinput',
  })

  autoComplete.on('select', (event) => {
    if (!event.poi?.location) {
      return
    }

    const location = [event.poi.location.lat, event.poi.location.lng]
    map.setView(location, 18)

    // 清理先前的搜索标记，防止标记无限累积
    if (currentSearchMarker) {
      map.removeLayer(currentSearchMarker)
    }

    currentSearchMarker = L.marker(location, {
      opacity: 1,
      draggable: true,
      title: event.poi.name,
    }).addTo(map)
  })
}

export function toggleSearchMode () {
  const searchMode = document.getElementById('map-search-mod')
  searchMode.style.display = searchMode.style.display === 'block' ? 'none' : 'block'
}
