import { getCameraInteractionProfile } from './map3d/feature-flags.js'

export const amapConfig = {
  key: 'de27deab99d785fc6d1cf5ea64200794',
  securityJsCode: '4d0564f442a8150fd4209442f4e2fcde',
  plugins: [
    'AMap.AutoComplete',
    'AMap.PlaceSearch',
    'AMap.Geolocation',
    'AMap.Driving',
    'AMap.Geocoder',
  ],
}

export const defaultMapView = {
  center: [23.129112, 113.264385],
  zoom: 16,
}

export const tileRelayEndpoint = '/api/v1/tiles/relay'

// The compatibility profile keeps controlled pan/zoom alive while removing
// the higher-risk orbit/tilt gestures during a staged rollout or rollback.
const cameraInteractionProfile = getCameraInteractionProfile(
  import.meta.env.VITE_MAP3D_CAMERA_PROFILE ??
    import.meta.env.VITE_MAP3D_CAMERA_ADAPTER_ENABLED,
)

export const map3dCameraInteractionConfig = {
  profile: cameraInteractionProfile,
  enhancedGesturesEnabled: cameraInteractionProfile === 'enhanced',
}

export const terrainConfig = {
  enabled: true,
  // Only known provider IDs are accepted by the 3D client; raw URLs are not public configuration.
  provider: import.meta.env.VITE_CESIUM_TERRAIN_PROVIDER || 'arcgis-terrain3d',
  ionToken: import.meta.env.VITE_CESIUM_ION_TOKEN || '',
  selfHostedUrl: import.meta.env.VITE_CESIUM_TERRAIN_URL || '',
  // MapTiler requires an approved deployment endpoint/key; no public fallback is embedded.
  mapTilerUrl: import.meta.env.VITE_MAPTILER_TERRAIN_URL || '',
  exaggeration: Number(import.meta.env.VITE_CESIUM_TERRAIN_EXAGGERATION || 1.18),
  quality: import.meta.env.VITE_CESIUM_SCENE_QUALITY || 'auto',
  demoView: {
    lng: 86.925,
    lat: 27.988,
    range: 32000,
    heading: 28,
    pitch: -28,
  },
}
