import L from 'leaflet'

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

    L.marker(location, {
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
