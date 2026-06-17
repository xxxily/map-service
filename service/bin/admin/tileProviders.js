export const TILE_PROVIDER_CATALOG = [
  {
    id: 'amap-satellite',
    name: '高德卫星',
    vendor: 'amap',
    category: 'satellite',
    description: '高德卫星瓦片图层。',
    template: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    subdomains: ['1', '2', '3', '4'],
    minZoom: 3,
    maxZoom: 18,
    proxyDefault: false,
  },
  {
    id: 'amap-road',
    name: '高德街道',
    vendor: 'amap',
    category: 'road',
    description: '高德街道瓦片图层。',
    template: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}',
    subdomains: ['1', '2', '3', '4'],
    minZoom: 3,
    maxZoom: 18,
    proxyDefault: false,
  },
  {
    id: 'google-satellite',
    name: '谷歌卫星',
    vendor: 'google',
    category: 'satellite',
    description: '谷歌卫星瓦片图层。',
    template: 'https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}',
    minZoom: 3,
    maxZoom: 20,
    proxyDefault: true,
  },
  {
    id: 'google-street',
    name: '谷歌街道',
    vendor: 'google',
    category: 'road',
    description: '谷歌街道瓦片图层。',
    template: 'https://www.google.com/maps/vt?lyrs=m@189&gl=cn&x={x}&y={y}&z={z}',
    minZoom: 3,
    maxZoom: 20,
    proxyDefault: true,
  },
]

export function listTileProviders () {
  return TILE_PROVIDER_CATALOG.map(({ id, name, vendor, category, description, template, subdomains, minZoom, maxZoom, proxyDefault }) => ({
    id,
    name,
    vendor,
    category,
    description,
    template,
    subdomains: subdomains || [],
    minZoom,
    maxZoom,
    proxyDefault,
  }))
}

export function getTileProvider (providerId) {
  return TILE_PROVIDER_CATALOG.find(provider => provider.id === providerId) || null
}

function sampleProviderUrl (provider, subdomain = provider.subdomains?.[0] || '') {
  return provider.template
    .replace('0{s}', subdomain ? `0${subdomain}` : '')
    .replaceAll('{s}', subdomain)
    .replaceAll('{x}', '0')
    .replaceAll('{y}', '0')
    .replaceAll('{z}', '0')
}

function matchesProviderHost (provider, urlObj) {
  if (provider.subdomains?.length) {
    return provider.subdomains.some((subdomain) => {
      const providerUrl = new URL(sampleProviderUrl(provider, subdomain))
      return providerUrl.hostname === urlObj.hostname
    })
  }

  const providerUrl = new URL(sampleProviderUrl(provider))
  return providerUrl.hostname === urlObj.hostname
}

export function getTileProviderByUrl (url) {
  try {
    const urlObj = new URL(url)

    return TILE_PROVIDER_CATALOG.find((provider) => {
      const providerUrl = new URL(sampleProviderUrl(provider))
      if (!matchesProviderHost(provider, urlObj) || providerUrl.pathname !== urlObj.pathname) {
        return false
      }

      if (provider.vendor === 'google') {
        return providerUrl.searchParams.get('lyrs') === urlObj.searchParams.get('lyrs') &&
          providerUrl.searchParams.get('gl') === urlObj.searchParams.get('gl')
      }

      if (provider.vendor === 'amap') {
        return providerUrl.searchParams.get('style') === urlObj.searchParams.get('style')
      }

      return true
    }) || null
  } catch (err) {
    return null
  }
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
