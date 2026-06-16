const L = window.L
const urlParams = new URLSearchParams(window.location.search)

const AMap = window.AMap

function parseDefaultView () {
  const rawCoords = (urlParams.get('coords') || '23.129112,113.264385').split(',')
  const lat = Number(rawCoords[0])
  const lng = Number(rawCoords[1])
  const zoom = Number.parseInt(rawCoords[2] || 16, 10)

  return {
    center: [
      Number.isFinite(lat) ? lat : 23.129112,
      Number.isFinite(lng) ? lng : 113.264385,
    ],
    zoom: Number.isFinite(zoom) ? zoom : 16,
  }
}

function AMapSearch () {
  if (!AMap || !AMap.AutoComplete || !AMap.PlaceSearch) {
    console.warn('高德搜索插件加载失败，搜索功能不可用')
    return
  }

  const auto = new AMap.AutoComplete({
    input: 'tipinput',
  })
  // 构造地点查询类
  auto.on('select', select)

  function select (e) {
    console.log('高德搜索选中结果', e)

    if (window.map && window.map.setView && e.poi && e.poi.location) {
      const location = [e.poi.location.lat, e.poi.location.lng]
      window.map.setView(location, 18)

      L.marker(location, {
        opacity: 1,
        draggable: true,
        title: e.poi.name,
      }).addTo(window.map)
    }
    // placeSearch.setCity(e.poi.adcode)
    // placeSearch.search(e.poi.name)  //关键字查询查询
  }
}

/**
 * 高德地图定位
 * https://lbs.amap.com/api/javascript-api/reference/location
 */
let geolocation = null
function AMapGeolocation () {
  if (!AMap || !AMap.Geolocation) {
    console.warn('高德定位插件加载失败，将仅使用浏览器定位')
    return null
  }

  geolocation = new AMap.Geolocation({
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

  return geolocation
}

function getPosition () {
  return new Promise((resolve, reject) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (position) {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        const data = {
          lat: latitude,
          lng: longitude,
        }
        resolve(data)
      }, function () {
        reject(arguments)
      })
    } else {
      reject('你的浏览器不支持当前地理位置信息获取')
    }
  })
}

const defaultView = parseDefaultView()

function initLayerControl (map) {
  const mapLayers = {
    '谷歌高德/卫星（缓存）': L.layerGroup([
      L.tileLayer('/api.v1/fetchRelay?url=https%3A%2F%2Fwww.google.com%2Fmaps%2Fvt%3Flyrs%3Ds%40189%26gl%3Dcn%26x%3D{x}%26y%3D{y}%26z%3D{z}', {
        maxZoom: 19,
        minZoom: 3,
        useCache: true,
        attribution: '谷歌提供卫星图，高德提供街道图 - 带缓存',
        keepBuffer: 10,
        edgeBufferTiles: 3,
      }),
      L.tileLayer('/api.v1/fetchRelay?url=http%3A%2F%2Fwebst0{s}.is.autonavi.com%2Fappmaptile%3Fstyle%3D8%26x%3D{x}%26y%3D{y}%26z%3D{z}', {
        maxZoom: 19,
        maxNativeZoom: 18,
        minZoom: 3,
        useCache: true,
        attribution: '谷歌提供卫星图，高德提供街道图 - 带缓存',
        subdomains: '1234',
        opacity: 0.8,
        keepBuffer: 10,
        edgeBufferTiles: 3,
      }),
    ]).addTo(map),

    '谷歌卫星（缓存）': L.layerGroup([
      L.tileLayer('/api.v1/fetchRelay?url=https%3A%2F%2Fwww.google.com%2Fmaps%2Fvt%3Flyrs%3Ds%40189%26gl%3Dcn%26x%3D{x}%26y%3D{y}%26z%3D{z}', {
        maxZoom: 19,
        minZoom: 3,
        useCache: true,
        attribution: '谷歌提供卫星图，高德提供街道图 - 带缓存',
        keepBuffer: 10,
        edgeBufferTiles: 3,
      }),
    ]),

    '谷歌高德杂交/卫星': L.layerGroup([
      L.tileLayer('//www.google.cn/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}', {
        maxZoom: 19,
        minZoom: 3,
        attribution: '谷歌提供卫星图，高德提供街道图',
      }),
      L.tileLayer('//webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}', {
        maxZoom: 19,
        maxNativeZoom: 18,
        minZoom: 3,
        useCache: false,
        // useOnlyCache: true,
        crossOrigin: false,
        attribution: '谷歌提供卫星图，高德提供街道图',
        subdomains: '1234',
        opacity: 0.8,
      }),
    ]),

    '高德/卫星': L.layerGroup([
      L.tileLayer('//webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        maxNativeZoom: 18,
        minZoom: 3,
        attribution: '高德地图 AutoNavi.com',
        subdomains: '1234',
      }),
      L.tileLayer('//webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        maxNativeZoom: 18,
        minZoom: 3,
        attribution: '高德地图 AutoNavi.com',
        subdomains: '1234',
        opacity: 0.5,
      }),
    ]),
    '高德/街道': L.tileLayer('//webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      maxNativeZoom: 18,
      minZoom: 3,
      attribution: '高德地图 AutoNavi.com',
      subdomains: '1234',
    }),
    '谷歌/卫星': L.tileLayer('//www.google.cn/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      minZoom: 3,
      attribution: '谷歌 Google.cn',
    }),
    '谷歌/街道': L.tileLayer('//www.google.cn/maps/vt?lyrs=m@189&gl=cn&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      minZoom: 3,
      attribution: '谷歌 Google.cn',
    }),
    '智图/街道': L.tileLayer('//map.geoq.cn/ArcGIS/rest/services/ChinaOnlineStreetPurplishBlue/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 20,
      maxNativeZoom: 16,
      minZoom: 3,
      attribution: '智图 GeoQ.cn',
    }),
  }

  const layerControl = window.L.control.layers(mapLayers, {}, {
    position: 'topright',
    collapsed: true,
  }).addTo(map)

  /* 默认隐藏图层控制 */
  layerControl._container.style.display = 'none'

  return layerControl
}

function toggleLayerControl (layerControl, map) {
  layerControl._container.style.display = layerControl._container.style.display === 'block' ? 'none' : 'block'

  /* 如果存在通过window.L.control.zoom生成的zoomControl则隐藏，创建并显示 */
  const zoomControl = document.getElementsByClassName('leaflet-control-zoom')[0]
  if (zoomControl) {
    zoomControl.style.display = zoomControl.style.display === 'block' ? 'none' : 'block'
  } else {
    window.L.control.zoom({
      zoomInTitle: '放大',
      zoomOutTitle: '缩小',
    }).addTo(map)
    document.getElementsByClassName('leaflet-control-zoom')[0].style.display = 'block'
  }
}

function toggleSearchMode () {
  const searchMode = document.getElementById('map-search-mod')
  searchMode.style.display = searchMode.style.display === 'block' ? 'none' : 'block'
}
/* 移除之前通过addTargetMarker添加的marker，添加新的marker */
function addTargetMarker (map, location) {
  map.eachLayer(function (layer) {
    if (layer instanceof L.Marker) {
      map.removeLayer(layer)
    }
  })

  /* 增加marker，并且设置为可拖动，当拖动结束后将坐标写入地址栏 */
  L.marker(location, {
    opacity: 1,
    draggable: true,
  }).addTo(map)
    .on('dragend', function (e) {
      const latlng = e.target.getLatLng()
      const coords = `${latlng.lat},${latlng.lng},${map.getZoom()}`
      window.history.replaceState(null, null, `?coords=${coords}`)
    })
}

async function initLeafletMap () {
  const map = L.map('map', {
    center: defaultView.center,
    zoom: defaultView.zoom,
    zoomControl: false,
    /* 是否显示属性控件，即右下角提示内容 */
    attributionControl: false,
    keyboardPanDelta: 480,
  })
    .setMaxBounds([[-90, 0], [90, 360]])

  window.map = map

  AMapSearch()
  AMapGeolocation()
  addTargetMarker(map, defaultView.center)

  const layerControl = initLayerControl(map)
  console.log('图层控制', layerControl)

  // window.L.control.zoom({
  //   zoomInTitle: '放大',
  //   zoomOutTitle: '缩小',
  // }).addTo(map)

  /* 当中心点或缩放发生变化时将坐标写入地址栏 */
  function updateUrlParams () {
    const center = map.getCenter()
    const zoom = map.getZoom()
    const coords = `${center.lat},${center.lng},${zoom}`
    window.history.replaceState(null, null, `?coords=${coords}`)
  }

  map.on('moveend', updateUrlParams)
  map.on('zoomend', updateUrlParams)

  async function updataPosition () {
    /* 使用高德地图sdk获取定位，进行对比 */
    // geolocation && geolocation.getCurrentPosition(function (status, result) {
    //   if (status === 'complete') {
    //     result.message = '高德地图sdk定位成功'
    //     map.setView([result.position.lat, result.position.lng], 18)
    //     addTargetMarker(map, [result.position.lat, result.position.lng])
    //   } else {
    //     result.message = '高德地图sdk定位失败'
    //     alert(JSON.stringify(result))
    //   }
    // })
    // return true

    const result = await getPosition().catch(err => {
      console.error('获取地理位置失败', err)
    })

    if (result && result.lat && result.lng) {
      const { lat, lng, } = result

      /**
       * 将获取到的WGS-84坐标转换为GCJ-02坐标
       * https://lbs.amap.com/api/javascript-api/guide/transform/convertfrom
       */
      if (!AMap || !AMap.convertFrom) {
        map.setView([lat, lng], 18)
        addTargetMarker(map, [lat, lng])
        return
      }

      AMap.convertFrom([lng, lat], 'gps', function (status, result) {
        if (result.info === 'ok' && result.locations.length > 0) {
          const lnglats = result.locations[0]

          // result.old = { lat, lng, }
          // alert(JSON.stringify(result))

          map.setView([lnglats.lat, lnglats.lng], 18)
          addTargetMarker(map, [lnglats.lat, lnglats.lng])
        } else {
          result.message = '坐标转换失败，请手动选择'
          alert(JSON.stringify(result, null, 2))

          /* 直接显示WGS-84坐标 */
          map.setView([lat, lng], 18)
        }
      })
    } else {
      alert('获取地理位置失败，请手动选择')
    }
  }

  const actionMap = {
    toggleLayerControl: () => toggleLayerControl(layerControl, map),
    toggleSearchMode: toggleSearchMode,
    updataPosition: updataPosition,
  }

  /* 给map-menu绑定代理事件 */
  document.getElementById('map-menu').addEventListener('click', function (e) {
    const actionTarget = e.target.closest('[data-action]')
    const action = actionTarget && actionTarget.getAttribute('data-action')
    if (action && actionMap[action] instanceof Function) {
      actionMap[action]()
    }
  })
}

initLeafletMap()
