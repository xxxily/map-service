export const DEFAULT_KML_POINT_CLUSTERING_CONFIG = Object.freeze({
  enabled: false,
  minZoom: 0,
  maxClusterZoom: 16,
  gridSize: 64,
  minClusterPoints: 2,
  maxMembersPerCluster: null,
})

function finiteNumber (value, name) {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new TypeError(`${name} 必须是有限数值`)
  return number
}

function compareIds (left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizeMember (member) {
  const id = String(member?.id ?? '')
  if (!id) throw new TypeError('聚合点必须包含非空 id')

  const coordinates = member?.coordinates
  const latLng = member?.latLng ?? (Array.isArray(coordinates)
    ? { lat: coordinates[1], lng: coordinates[0] }
    : member)
  return {
    id,
    lat: finiteNumber(latLng?.lat, `点 ${id} 的纬度`),
    lng: finiteNumber(latLng?.lng, `点 ${id} 的经度`),
    value: member,
  }
}

export function normalizeKmlPointClusteringConfig (config = {}) {
  const gridSize = Number(config.gridSize ?? DEFAULT_KML_POINT_CLUSTERING_CONFIG.gridSize)
  const maxMembers = config.maxMembersPerCluster
  const minClusterPoints = Number(config.minClusterPoints ?? DEFAULT_KML_POINT_CLUSTERING_CONFIG.minClusterPoints)
  return {
    enabled: config.enabled ?? DEFAULT_KML_POINT_CLUSTERING_CONFIG.enabled,
    minZoom: finiteNumber(config.minZoom ?? DEFAULT_KML_POINT_CLUSTERING_CONFIG.minZoom, 'minZoom'),
    maxClusterZoom: finiteNumber(
      config.maxClusterZoom ?? DEFAULT_KML_POINT_CLUSTERING_CONFIG.maxClusterZoom,
      'maxClusterZoom',
    ),
    gridSize: Math.min(128, Math.max(24, Number.isFinite(gridSize) ? gridSize : DEFAULT_KML_POINT_CLUSTERING_CONFIG.gridSize)),
    minClusterPoints: Math.min(1000, Math.max(2, Number.isFinite(minClusterPoints) ? Math.floor(minClusterPoints) : DEFAULT_KML_POINT_CLUSTERING_CONFIG.minClusterPoints)),
    maxMembersPerCluster: maxMembers == null
      ? null
      : Math.max(0, Math.floor(finiteNumber(maxMembers, 'maxMembersPerCluster'))),
  }
}

function summarizeMembers (members, detailLimit) {
  const memberIds = members.map(member => member.id)
  const detailed = detailLimit == null ? members : members.slice(0, detailLimit)
  let south = Infinity
  let west = Infinity
  let north = -Infinity
  let east = -Infinity
  let latSum = 0
  let lngSum = 0

  for (const member of members) {
    south = Math.min(south, member.lat)
    west = Math.min(west, member.lng)
    north = Math.max(north, member.lat)
    east = Math.max(east, member.lng)
    latSum += member.lat
    lngSum += member.lng
  }

  return {
    count: members.length,
    center: { lat: latSum / members.length, lng: lngSum / members.length },
    bounds: { south, west, north, east },
    memberIds,
    sampleMemberIds: detailed.map(member => member.id),
    members: detailed.map(member => member.value),
    membersTruncated: detailed.length < members.length,
  }
}

function singleResult (member) {
  return {
    type: 'point',
    id: member.id,
    ...summarizeMembers([member], null),
  }
}

/**
 * 按当前缩放级别的屏幕像素网格聚合 KML 点位，不依赖 Leaflet。
 *
 * 点位结构为 { id, latLng: { lat, lng }, ... }，也接受顶层 lat/lng 或
 * KML 常用的 { id, coordinates: [lng, lat] }。
 * project(latLng, zoom) 应返回 { x, y } 屏幕/世界像素坐标。
 */
export function clusterKmlPoints (points, zoom, config = {}, project) {
  if (!Array.isArray(points)) throw new TypeError('points 必须是数组')

  const normalizedZoom = finiteNumber(zoom, 'zoom')
  const options = normalizeKmlPointClusteringConfig(config)
  const members = points.map(normalizeMember).sort((left, right) => compareIds(left.id, right.id))

  for (let index = 1; index < members.length; index += 1) {
    if (members[index - 1].id === members[index].id) throw new TypeError(`聚合点 id 重复: ${members[index].id}`)
  }

  if (members.length === 0) return []
  if (!options.enabled || normalizedZoom < options.minZoom || normalizedZoom > options.maxClusterZoom) {
    return members.map(singleResult)
  }
  if (typeof project !== 'function') throw new TypeError('启用聚合时 project 必须是函数')

  const cells = new Map()
  for (const member of members) {
    const projected = project({ lat: member.lat, lng: member.lng }, normalizedZoom)
    const x = finiteNumber(projected?.x, `点 ${member.id} 的投影 x`)
    const y = finiteNumber(projected?.y, `点 ${member.id} 的投影 y`)
    const cellX = Math.floor(x / options.gridSize)
    const cellY = Math.floor(y / options.gridSize)
    const key = `${cellX}:${cellY}`
    const cell = cells.get(key) ?? { cellX, cellY, members: [] }
    cell.members.push(member)
    cells.set(key, cell)
  }

  return [...cells.values()]
    .sort((left, right) => left.cellY - right.cellY || left.cellX - right.cellX)
    .flatMap(cell => {
      if (cell.members.length < options.minClusterPoints) return cell.members.map(singleResult)
      return {
        type: 'cluster',
        id: `cluster:${normalizedZoom}:${cell.cellX}:${cell.cellY}`,
        cell: { x: cell.cellX, y: cell.cellY },
        ...summarizeMembers(cell.members, options.maxMembersPerCluster),
      }
    })
}
