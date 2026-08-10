(() => {
  'use strict'

  const MAX_POINTS = 100000
  const MAX_KML_BYTES = 10 * 1024 * 1024
  const MEDIA_HOST = 'down-files.2bulu.com'
  const MEDIA_PATHS = new Set(['/f/d1', '/f/dn1'])

  function dataError (message, code = 'TWO_BULU_TRACK_EMPTY', status = 'failed') {
    const error = new Error(message)
    error.code = code
    error.status = status
    return error
  }

  function utf8Bytes (value) {
    return new TextEncoder().encode(String(value || '')).byteLength
  }

  function decodeHtmlText (value) {
    return String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_, code) => {
        const number = Number(code)
        return Number.isInteger(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : ' '
      })
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function escapeXml (value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;')
  }

  function numberInRange (value, min, max) {
    const number = Number(value)
    return Number.isFinite(number) && number >= min && number <= max ? number : null
  }

  function coordinateFromPoint (value) {
    let longitude
    let latitude
    let altitude
    let createTime
    let speed

    if (Array.isArray(value)) {
      longitude = value[0]
      latitude = value[1]
      altitude = value[2]
      createTime = value[3]
    } else if (value && typeof value === 'object') {
      const nested = value.coordinate || value.coordinates || value.point || value.position
      if (nested && nested !== value && value.lng === undefined && value.longitude === undefined && value.lon === undefined && value.lat === undefined && value.latitude === undefined) {
        const parsed = coordinateFromPoint(nested)
        if (parsed) {
          parsed.createTime = value.createTime ?? value.timestamp ?? value.time
          parsed.speed = numberInRange(value.speed, 0, 1000)
          parsed.altitude = numberInRange(value.elev ?? value.elevation ?? value.altitude ?? value.height, -12000, 100000) ?? parsed.altitude
          return parsed
        }
      }
      longitude = value.lng ?? value.lon ?? value.longitude ?? value.longitude_gps ?? value.lo ?? value.x
      latitude = value.lat ?? value.latitude ?? value.latitude_gps ?? value.la ?? value.y
      altitude = value.elev ?? value.elevation ?? value.altitude ?? value.height ?? value.z
      createTime = value.createTime ?? value.timestamp ?? value.time
      speed = value.speed
    } else if (typeof value === 'string') {
      const parts = value.trim().split(/[\s,;]+/).filter(Boolean)
      longitude = parts[0]
      latitude = parts[1]
      altitude = parts[2]
    }

    const normalizedLongitude = numberInRange(longitude, -180, 180)
    const normalizedLatitude = numberInRange(latitude, -90, 90)
    if (normalizedLongitude === null || normalizedLatitude === null) return null
    return {
      coordinates: [normalizedLongitude, normalizedLatitude],
      altitude: numberInRange(altitude, -12000, 100000),
      createTime,
      speed: numberInRange(speed, 0, 1000),
    }
  }

  function unwrap (value) {
    if (!value || typeof value !== 'object') return []
    return [value, value.data, value.result, value.payload, value.data?.result, value.result?.data]
      .filter(item => item !== undefined && item !== null)
  }

  function toSegments (candidate) {
    if (!Array.isArray(candidate) || candidate.length === 0) return []
    if (coordinateFromPoint(candidate[0])) return [candidate]
    if (Array.isArray(candidate[0]) && coordinateFromPoint(candidate[0][0])) return candidate
    return []
  }

  function findTrackSegments (payload) {
    const queue = [{ value: payload, depth: 0 }]
    const preferredKeys = ['trackPositions', 'positions', 'trackPoints', 'points', 'path', 'coordinates', 'list']
    const seen = new Set()
    while (queue.length) {
      const current = queue.shift()
      const value = current.value
      if (!value || (typeof value !== 'object' && !Array.isArray(value))) continue
      if (seen.has(value)) continue
      seen.add(value)
      const segments = toSegments(value)
      if (segments.length) return segments
      if (current.depth >= 4) continue

      if (Array.isArray(value)) {
        value.slice(0, 12).forEach(item => queue.push({ value: item, depth: current.depth + 1 }))
        continue
      }
      preferredKeys.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          queue.push({ value: value[key], depth: current.depth + 1 })
        }
      })
      unwrap(value).forEach(item => queue.push({ value: item, depth: current.depth + 1 }))
    }
    return []
  }

  function findMarkerList (payload) {
    if (payload === undefined || payload === null) return { found: false, markers: [] }
    const queue = [{ value: payload, depth: 0 }]
    const preferredKeys = ['markers', 'trackMarkers', 'trackMarkerList', 'markerList', 'list', 'data', 'result']
    const seen = new Set()
    while (queue.length) {
      const current = queue.shift()
      const value = current.value
      if (!value || (typeof value !== 'object' && !Array.isArray(value))) continue
      if (seen.has(value)) continue
      seen.add(value)
      if (Array.isArray(value)) {
        const markerLike = value.every(item => item && typeof item === 'object' && !Array.isArray(item))
        if (markerLike) return { found: true, markers: value }
        if (current.depth < 4) value.slice(0, 12).forEach(item => queue.push({ value: item, depth: current.depth + 1 }))
        continue
      }
      if (current.depth >= 4) continue
      preferredKeys.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          queue.push({ value: value[key], depth: current.depth + 1 })
        }
      })
      unwrap(value).forEach(item => queue.push({ value: item, depth: current.depth + 1 }))
    }
    return { found: false, markers: [] }
  }

  function normalizeMediaUrl (value, baseUrl = 'https://www.2bulu.com/') {
    const raw = String(value || '').trim()
    if (!raw || raw.length > 2048) return ''
    try {
      const parsed = new URL(raw, baseUrl)
      if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== MEDIA_HOST || parsed.username || parsed.password || parsed.port) return ''
      if (!MEDIA_PATHS.has(parsed.pathname)) return ''
      const keys = [...parsed.searchParams.keys()]
      if (keys.length !== 1 || keys[0] !== 'downParams' || !parsed.searchParams.get('downParams')) return ''
      parsed.hash = ''
      return parsed.toString()
    } catch {
      return ''
    }
  }

  function firstMediaUrl (values, baseUrl) {
    for (const value of values) {
      const normalized = normalizeMediaUrl(value, baseUrl)
      if (normalized) return normalized
    }
    return ''
  }

  function markerMedia (marker, baseUrl) {
    const params = marker?.params && typeof marker.params === 'object' ? marker.params : {}
    const type = markerMediaType(marker)
    // 两步路的图片字段不是多个独立附件：commnFileUrl 是点击查看的大图，
    // centerUrl/fileUrl 是列表或气泡中的预览图。大图作为唯一媒体 URL，
    // 预览图只写入该媒体项的 thumbnailUrl；原图不可用时才提升预览图为主资源。
    const commonValues = [
      marker?.commnFileUrl,
      marker?.commonFileUrl,
      params.commnFileUrl,
      params.commonFileUrl,
    ]
    const previewValues = [
      marker?.centerUrl,
      marker?.fileUrl,
      params.centerUrl,
      params.fileUrl,
    ]
    const mediaValues = [
      marker?.mediaUrl,
      params.mediaUrl,
    ]

    if (type === 'image') {
      const originalUrl = firstMediaUrl([...commonValues, ...mediaValues], baseUrl)
      const previewUrl = firstMediaUrl([...previewValues, marker?.firstPicUrl, params.firstPicUrl], baseUrl)
      const url = originalUrl || previewUrl
      return url
        ? [{
            url,
            type: 'image',
            thumbnailUrl: originalUrl && previewUrl && previewUrl !== originalUrl ? previewUrl : '',
          }]
        : []
    }
    if (type === 'audio') {
      const url = firstMediaUrl([
        marker?.mp3FileUrl,
        marker?.audioUrl,
        params.mp3FileUrl,
        params.audioUrl,
        ...commonValues,
        ...mediaValues,
        ...previewValues,
      ], baseUrl)
      return url ? [{ url, type: 'audio' }] : []
    }
    if (type === 'video') {
      const url = firstMediaUrl([
        marker?.videoUrl,
        params.videoUrl,
        ...commonValues,
        ...mediaValues,
        ...previewValues,
      ], baseUrl)
      if (url) {
        return [{
          url,
          type: 'video',
          posterUrl: firstMediaUrl([marker?.firstPicUrl, params.firstPicUrl], baseUrl),
        }]
      }
      const posterUrl = firstMediaUrl([marker?.firstPicUrl, params.firstPicUrl], baseUrl)
      return posterUrl ? [{ url: posterUrl, type: 'image' }] : []
    }

    const url = firstMediaUrl([...commonValues, ...mediaValues, ...previewValues], baseUrl)
    return url ? [{ url, type: 'link' }] : []
  }

  function markerMediaType (marker) {
    const params = marker?.params && typeof marker.params === 'object' ? marker.params : {}
    const fileType = Number(marker?.fileType ?? marker?.type ?? params.fileType ?? params.type)
    if (fileType === 0) return 'image'
    if (fileType === 1) return 'audio'
    if (fileType === 2) return 'video'
    const typeName = String(marker?.mediaType || marker?.type || params.mediaType || params.type || '').toLowerCase()
    if (['image', 'audio', 'video'].includes(typeName)) return typeName
    const hint = String(marker?.mimeType || marker?.contentType || '').toLowerCase()
    if (hint.startsWith('image/')) return 'image'
    if (hint.startsWith('audio/')) return 'audio'
    if (hint.startsWith('video/')) return 'video'
    return 'link'
  }

  function markerFeature (marker, index, baseUrl) {
    const point = coordinateFromPoint(marker)
    if (!point) return null
    const params = marker?.params && typeof marker.params === 'object' ? marker.params : {}
    const text = decodeHtmlText(marker?.text ?? marker?.name ?? marker?.title ?? params.text ?? params.name ?? params.title ?? '').slice(0, 2000)
    const mediaItems = markerMedia(marker, baseUrl)
    const description = []
    if (text) description.push(`<p>${escapeXml(text)}</p>`)
    mediaItems.forEach(item => {
      const safeUrl = escapeXml(item.url)
      if (item.type === 'image') {
        const thumbnailUrl = item.thumbnailUrl ? escapeXml(item.thumbnailUrl) : ''
        description.push(thumbnailUrl
          ? `<a href="${safeUrl}" data-kml-media="image"><img src="${thumbnailUrl}" alt="两步路标注图片"></a>`
          : `<img src="${safeUrl}" alt="两步路标注图片">`)
      }
      else if (item.type === 'audio') description.push(`<audio src="${safeUrl}" controls></audio>`)
      else if (item.type === 'video') {
        const poster = item.posterUrl ? ` poster="${escapeXml(item.posterUrl)}"` : ''
        description.push(`<video src="${safeUrl}"${poster} controls></video>`)
      }
      else description.push(`<a href="${safeUrl}">查看两步路公开附件</a>`)
    })
    return {
      type: 'Point',
      name: text || `两步路标注点 ${index + 1}`,
      description: description.join('\n'),
      coordinates: point.coordinates,
      altitude: point.altitude,
    }
  }

  function formatCoordinate (point) {
    const altitude = point.altitude === null ? 0 : point.altitude
    return `${point.coordinates[0]},${point.coordinates[1]},${altitude}`
  }

  function generateKml (name, features) {
    const parts = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<kml xmlns="http://www.opengis.net/kml/2.2">',
      '  <Document>',
      `    <name>${escapeXml(name)}</name>`,
    ]
    features.forEach(feature => {
      parts.push('    <Placemark>')
      parts.push(`      <name>${escapeXml(feature.name)}</name>`)
      parts.push(`      <description>${escapeXml(feature.description || '')}</description>`)
      if (feature.type === 'Point') {
        parts.push('      <Point>')
        parts.push(`        <coordinates>${formatCoordinate(feature)}</coordinates>`)
        parts.push('      </Point>')
      } else {
        parts.push('      <LineString>')
        parts.push('        <tessellate>1</tessellate>')
        parts.push(`        <coordinates>${feature.points.map(formatCoordinate).join(' ')}</coordinates>`)
        parts.push('      </LineString>')
      }
      parts.push('    </Placemark>')
    })
    parts.push('  </Document>')
    parts.push('</kml>')
    return parts.join('\n')
  }

  function convertTwoBuluRenderedData (options = {}) {
    const positionsPayload = options.positionsPayload
    const markerResult = findMarkerList(options.markersPayload)
    const segments = findTrackSegments(positionsPayload)
    const maxPoints = Number.isSafeInteger(Number(options.maxPoints)) && Number(options.maxPoints) > 0
      ? Number(options.maxPoints)
      : MAX_POINTS
    const title = decodeHtmlText(options.title || positionsPayload?.trackName || positionsPayload?.name || positionsPayload?.title || '两步路公开轨迹')
      .replace(/\.(?:kml|kmz|gpx)$/i, '')
      .slice(0, 200) || '两步路公开轨迹'
    const features = []
    let pointCount = 0
    let invalidPointCount = 0

    segments.forEach((segment, segmentIndex) => {
      const points = []
      segment.forEach(rawPoint => {
        const point = coordinateFromPoint(rawPoint)
        if (!point) {
          invalidPointCount += 1
          return
        }
        pointCount += 1
        if (pointCount > maxPoints) throw dataError('两步路轨迹坐标数量超过导入限制', 'FILE_TOO_LARGE')
        points.push(point)
      })
      if (points.length >= 2) {
        features.push({
          type: 'LineString',
          name: segments.length > 1 ? `轨迹分段 ${segmentIndex + 1}` : title,
          description: '',
          points,
        })
      } else if (points.length === 1) {
        features.push({
          type: 'Point',
          name: title,
          description: '',
          coordinates: points[0].coordinates,
          altitude: points[0].altitude,
        })
      }
    })

    if (markerResult.found) {
      markerResult.markers.forEach((marker, index) => {
        const feature = markerFeature(marker, index, options.sourceUrl || 'https://www.2bulu.com/')
        if (feature) {
          if (pointCount + 1 > maxPoints) throw dataError('两步路轨迹坐标和标注点数量超过导入限制', 'FILE_TOO_LARGE')
          pointCount += 1
          features.push(feature)
        } else {
          invalidPointCount += 1
        }
      })
    }

    if (!features.length) throw dataError('两步路公开分享中未找到有效轨迹数据', 'TWO_BULU_TRACK_EMPTY')

    const completeness = markerResult.found ? 'full' : 'track-only'
    if (completeness === 'track-only' && options.partialPolicy !== 'allow-track-only') {
      throw dataError('两步路页面当前只能读取到轨迹线，未能确认标注点和媒体；请选择“允许仅导入公开轨迹线”后重试', 'TWO_BULU_PARTIAL_REJECTED', 'needs-user-action')
    }
    const warnings = []
    if (invalidPointCount) warnings.push(`已忽略 ${invalidPointCount} 个无效坐标或标注点`)
    if (!markerResult.found) warnings.push('两步路页面未提供可读取的标注点或媒体，本次仅导入轨迹线')
    const kmlText = generateKml(title, features)
    if (utf8Bytes(kmlText) > MAX_KML_BYTES) throw dataError('生成的 KML 超过 10 MiB 导入限制', 'FILE_TOO_LARGE')
    return {
      status: 'success',
      sourceMode: 'rendered-data',
      completeness,
      warnings,
      pointCount,
      name: title,
      kmlText,
    }
  }

  globalThis.MapServiceTwoBuluData = Object.freeze({
    MAX_POINTS,
    MAX_KML_BYTES,
    coordinateFromPoint,
    findTrackSegments,
    findMarkerList,
    normalizeMediaUrl,
    generateKml,
    convertTwoBuluRenderedData,
  })
})()
