import { tileRelayEndpoint } from '../config.js'

export const DEFAULT_LAYER_NAME = '高德/卫星'

export const LAYER_NAME_MAPPING = {
  'amap-hybrid': '高德/卫星',
  'google-amap-hybrid': '谷歌高德/卫星',
  'google-amap-hybrid-hd': '谷歌高德/卫星（HD）',
  'google-sat': '谷歌/卫星',
  'amap-road': '高德/街道',
  'google-road': '谷歌/街道',
}

export const REVERSE_LAYER_MAPPING = Object.fromEntries(
  Object.entries(LAYER_NAME_MAPPING).map(([key, value]) => [value, key])
)

export function relayTileUrl (targetUrl) {
  const encodedTarget = encodeURIComponent(targetUrl)
    .replace(/%7B/g, '{')
    .replace(/%7D/g, '}')

  return `${tileRelayEndpoint}?url=${encodedTarget}`
}

export function getTileScales (options = {}) {
  const isRetina = typeof options.isRetina === 'boolean'
    ? options.isRetina
    : (typeof window !== 'undefined' && window.devicePixelRatio > 1)

  return {
    googleScale: isRetina ? '2' : '1',
    autonaviScale: isRetina ? '2' : '1',
  }
}

export function createTileUrls (options = {}) {
  const { googleScale, autonaviScale } = getTileScales(options)

  return {
    googleSatellite: relayTileUrl(`https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}&scale=${googleScale}`),
    googleSatelliteHd: relayTileUrl('https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}&scale=3'),
    googleStreet: relayTileUrl(`https://www.google.com/maps/vt?lyrs=m@189&gl=cn&x={x}&y={y}&z={z}&scale=${googleScale}`),
    autonaviSatellite: relayTileUrl(`https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=6&x={x}&y={y}&z={z}&scl=${autonaviScale}`),
    autonaviRoad: relayTileUrl('https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}&scl=1'),
  }
}

export function createCesiumLayerSources (options = {}) {
  const tileUrls = createTileUrls(options)
  const autonaviSubdomains = ['1', '2', '3', '4']

  return {
    'amap-hybrid': [
      {
        url: tileUrls.autonaviSatellite,
        subdomains: autonaviSubdomains,
      },
      {
        url: tileUrls.autonaviRoad,
        subdomains: autonaviSubdomains,
        opacity: 0.5,
      },
    ],
    'google-amap-hybrid': [
      {
        url: tileUrls.googleSatellite,
        subdomains: [],
      },
      {
        url: tileUrls.autonaviRoad,
        subdomains: autonaviSubdomains,
        opacity: 0.7,
      },
    ],
    'google-amap-hybrid-hd': [
      {
        url: tileUrls.googleSatelliteHd,
        subdomains: [],
      },
      {
        url: tileUrls.autonaviRoad,
        subdomains: autonaviSubdomains,
        opacity: 0.7,
      },
    ],
    'google-sat': [
      {
        url: tileUrls.googleSatellite,
        subdomains: [],
      },
    ],
    'amap-road': [
      {
        url: tileUrls.autonaviRoad,
        subdomains: autonaviSubdomains,
      },
    ],
    'google-road': [
      {
        url: tileUrls.googleStreet,
        subdomains: [],
      },
    ],
  }
}
