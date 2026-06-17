const PI = Math.PI
const A = 6378245.0
const EE = 0.00669342162296594323

function outOfChina (lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat (lng, lat) {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
  ret += (20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(lat * PI) + 40.0 * Math.sin(lat / 3.0 * PI)) * 2.0 / 3.0
  ret += (160.0 * Math.sin(lat / 12.0 * PI) + 320 * Math.sin(lat * PI / 30.0)) * 2.0 / 3.0
  return ret
}

function transformLng (lng, lat) {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
  ret += (20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(lng * PI) + 40.0 * Math.sin(lng / 3.0 * PI)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(lng / 12.0 * PI) + 300.0 * Math.sin(lng / 30.0 * PI)) * 2.0 / 3.0
  return ret
}

export function wgs84ToGcj02 ([lng, lat]) {
  if (outOfChina(lng, lat)) {
    return [lng, lat]
  }

  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = lat / 180.0 * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI)
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI)
  return [lng + dLng, lat + dLat]
}

export function gcj02ToWgs84 ([lng, lat]) {
  if (outOfChina(lng, lat)) {
    return [lng, lat]
  }

  let minLng = lng - 0.02
  let maxLng = lng + 0.02
  let minLat = lat - 0.02
  let maxLat = lat + 0.02
  let wgsLng = lng
  let wgsLat = lat

  for (let i = 0; i < 30; i++) {
    wgsLng = (minLng + maxLng) / 2
    wgsLat = (minLat + maxLat) / 2
    const [convertedLng, convertedLat] = wgs84ToGcj02([wgsLng, wgsLat])
    const dLng = convertedLng - lng
    const dLat = convertedLat - lat

    if (Math.abs(dLng) < 1e-9 && Math.abs(dLat) < 1e-9) {
      return [wgsLng, wgsLat]
    }

    if (dLng > 0) {
      maxLng = wgsLng
    } else {
      minLng = wgsLng
    }

    if (dLat > 0) {
      maxLat = wgsLat
    } else {
      minLat = wgsLat
    }
  }

  return [wgsLng, wgsLat]
}

export function wgs84ToGcj02Deep (coordinates) {
  if (!Array.isArray(coordinates)) return coordinates
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    return wgs84ToGcj02(coordinates)
  }
  return coordinates.map(wgs84ToGcj02Deep)
}

export function gcj02ToWgs84Deep (coordinates) {
  if (!Array.isArray(coordinates)) return coordinates
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    return gcj02ToWgs84(coordinates)
  }
  return coordinates.map(gcj02ToWgs84Deep)
}
