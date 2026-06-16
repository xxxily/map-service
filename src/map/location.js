import L from 'leaflet'

export function initAmapGeolocation (AMap) {
  if (!AMap?.Geolocation) {
    console.warn('高德定位插件加载失败，将仅使用浏览器定位')
    return null
  }

  return new AMap.Geolocation({
    enableHighAccuracy: true,
    noIpLocate: 3,
    timeout: 10000,
    maximumAge: 10,
    convert: false,
    showButton: false,
    buttonPosition: 'LB',
    showMarker: false,
    showCircle: false,
    panToLocation: false,
    zoomToAccuracy: false,
  })
}

export function getBrowserPosition () {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('你的浏览器不支持当前地理位置信息获取'))
      return
    }

    navigator.geolocation.getCurrentPosition((position) => {
      resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      })
    }, reject)
  })
}

export function addTargetMarker (map, location) {
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer)
    }
  })

  L.marker(location, {
    opacity: 1,
    draggable: true,
  }).addTo(map)
    .on('dragend', (event) => {
      const latlng = event.target.getLatLng()
      const coords = `${latlng.lat},${latlng.lng},${map.getZoom()}`
      window.history.replaceState(null, '', `?coords=${coords}`)
    })
}

export async function updatePosition (map, AMap) {
  const result = await getBrowserPosition().catch((err) => {
    console.error('获取地理位置失败', err)
    return null
  })

  if (!result?.lat || !result?.lng) {
    window.alert('获取地理位置失败，请手动选择')
    return
  }

  const { lat, lng } = result

  if (!AMap?.convertFrom) {
    map.setView([lat, lng], 18)
    addTargetMarker(map, [lat, lng])
    return
  }

  AMap.convertFrom([lng, lat], 'gps', (status, converted) => {
    if (converted.info === 'ok' && converted.locations.length > 0) {
      const lnglats = converted.locations[0]
      map.setView([lnglats.lat, lnglats.lng], 18)
      addTargetMarker(map, [lnglats.lat, lnglats.lng])
      return
    }

    window.alert('坐标转换失败，请手动选择')
    map.setView([lat, lng], 18)
    addTargetMarker(map, [lat, lng])
  })
}
