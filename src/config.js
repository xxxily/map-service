export const amapConfig = {
  key: 'de27deab99d785fc6d1cf5ea64200794',
  securityJsCode: '4d0564f442a8150fd4209442f4e2fcde',
  plugins: [
    'AMap.AutoComplete',
    'AMap.PlaceSearch',
    'AMap.Geolocation',
  ],
}

export const defaultMapView = {
  center: [23.129112, 113.264385],
  zoom: 16,
}

export const tileRelayEndpoint = '/api/v1/tiles/relay'

export const terrainConfig = {
  enabled: true,
  provider: import.meta.env.VITE_CESIUM_TERRAIN_PROVIDER || 'world',
  ionToken: import.meta.env.VITE_CESIUM_ION_TOKEN || '',
  url: import.meta.env.VITE_CESIUM_TERRAIN_URL || '',
  exaggeration: Number(import.meta.env.VITE_CESIUM_TERRAIN_EXAGGERATION || 1.35),
  demoView: {
    lng: 86.925,
    lat: 27.988,
    height: 9000,
    heading: 28,
    pitch: -34,
  },
}
