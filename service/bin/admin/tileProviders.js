export const TILE_PROVIDER_CATALOG = [
  {
    id: 'amap-satellite',
    name: '高德卫星',
    template: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    subdomains: ['1', '2', '3', '4'],
    minZoom: 3,
    maxZoom: 18,
  },
  {
    id: 'amap-road',
    name: '高德街道',
    template: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}',
    subdomains: ['1', '2', '3', '4'],
    minZoom: 3,
    maxZoom: 18,
  },
  {
    id: 'google-satellite',
    name: '谷歌卫星',
    template: 'https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}',
    minZoom: 3,
    maxZoom: 20,
  },
  {
    id: 'google-street',
    name: '谷歌街道',
    template: 'https://www.google.com/maps/vt?lyrs=m@189&gl=cn&x={x}&y={y}&z={z}',
    minZoom: 3,
    maxZoom: 20,
  },
]

export function listTileProviders () {
  return TILE_PROVIDER_CATALOG.map(({ id, name, minZoom, maxZoom }) => ({
    id,
    name,
    minZoom,
    maxZoom,
  }))
}

export function getTileProvider (providerId) {
  return TILE_PROVIDER_CATALOG.find(provider => provider.id === providerId) || null
}

export function buildTileUrl (provider, tile) {
  const subdomains = provider.subdomains || ['']
  const subdomain = subdomains[(tile.x + tile.y + tile.z) % subdomains.length]
  return provider.template
    .replaceAll('{s}', subdomain)
    .replaceAll('{x}', String(tile.x))
    .replaceAll('{y}', String(tile.y))
    .replaceAll('{z}', String(tile.z))
}
