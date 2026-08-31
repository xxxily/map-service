(() => {
  'use strict'

  if (globalThis.MapServiceTwoBuluPageExport) return

  const PAGE_HOSTS = new Set(['2bulu.com', 'www.2bulu.com', 'app.2bulu.com'])
  const TRACK_DATA_PATHS = [
    '/track/get_track_positions_list.htm',
    '/track/get_track_positions_list4.htm',
    '/track/get_track_positions_list_new.htm',
  ]
  const MARKER_DATA_PATHS = [
    '/track/get_track_marker_list_new.htm',
    '/track/get_track_marker_list_2.htm',
  ]
  const DATA_PATHS = new Set([...TRACK_DATA_PATHS, ...MARKER_DATA_PATHS])
  const TRACK_ID_PATTERN = /^[A-Za-z0-9+/_=-]{1,160}$/
  const MAX_BYTES = 10 * 1024 * 1024
  const MAX_POINTS = 100000
  const MAX_RESOURCE_COUNT = 40
  const MAX_GLOBAL_NODES = 1800
  const GLOBAL_NAME_PATTERN = /(?:track|route|path|line|layer|point|marker|mark|map|lng|lat|coord|position|location|data|state)/i

  function dataApi () {
    return globalThis.MapServiceTwoBuluData
  }

  function pageError (message, code = 'TWO_BULU_PAGE_DATA_NOT_RECOGNIZED', status = 'unsupported') {
    return { status, code, message }
  }

  function safeRead (callback, fallback = undefined) {
    try { return callback() } catch { return fallback }
  }

  function byteLength (value) {
    try { return new TextEncoder().encode(String(value || '')).byteLength } catch { return String(value || '').length }
  }

  function isPageUrl (value) {
    return safeRead(() => {
      const parsed = new URL(String(value || ''), location.href)
      return parsed.protocol === 'https:' &&
        PAGE_HOSTS.has(parsed.hostname.toLowerCase().replace(/\.$/, '')) &&
        !parsed.username && !parsed.password && !parsed.port
    }, false)
  }

  function isDataUrl (value) {
    return safeRead(() => {
      const parsed = new URL(String(value || ''), location.href)
      return isPageUrl(parsed.toString()) && DATA_PATHS.has(parsed.pathname)
    }, false)
  }

  function parseJson (value) {
    let normalized = value
    const isArrayBuffer = Object.prototype.toString.call(normalized) === '[object ArrayBuffer]'
    if (typeof ArrayBuffer !== 'undefined' && isArrayBuffer) {
      if (normalized.byteLength > MAX_BYTES) return null
      normalized = new TextDecoder('utf-8').decode(new Uint8Array(normalized))
    } else if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(normalized)) {
      if (normalized.byteLength > MAX_BYTES) return null
      normalized = new TextDecoder('utf-8').decode(new Uint8Array(normalized.buffer, normalized.byteOffset, normalized.byteLength))
    }
    if (normalized && typeof normalized === 'object') return normalized
    const text = String(normalized || '').replace(/^\uFEFF/, '').trim()
    if (!text || text.length > MAX_BYTES) return null
    try { return JSON.parse(text) } catch { return null }
  }

  function unwrapResponsePayload (value) {
    let current = value
    for (let depth = 0; depth < 4; depth += 1) {
      const parsed = parseJson(current)
      if (parsed === null) return null
      current = parsed
      if (!current || typeof current !== 'object' || Array.isArray(current) || current.data === undefined) return current
      current = current.data
    }
    return parseJson(current)
  }

  function decodeText (value) {
    return String(value || '')
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function pageTitle () {
    const value = safeRead(() => document.querySelector('meta[property="og:title"]')?.content || document.title, '')
    return decodeText(value)
      // 两步路标题通常是“路线名-GPS导航轨迹下载|行程线路图-…”。
      // 只移除已知站点后缀，不能从首个日期连字符处截断路线名。
      .replace(/\s*-\s*GPS导航[\s\S]*$/i, '')
      .replace(/\s*\|\s*行程线路图[\s\S]*$/i, '')
      .replace(/\s*-\s*(?:步行|骑行|自驾)?轨迹(?:下载)?\s*-\s*两步路[\s\S]*$/i, '')
      .replace(/\s*-\s*两步路[\s\S]*$/i, '')
      .replace(/\.(?:kml|kmz|gpx)$/i, '')
      .slice(0, 200) || '两步路公开轨迹'
  }

  function pageVisibleTextLines () {
    const value = safeRead(() => document.body?.innerText || document.documentElement?.innerText, '')
    return String(value || '')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
      .split(/\r?\n|[·|]+/)
      .map(decodeText)
      .filter(Boolean)
      .slice(0, 4000)
  }

  function normalizeDistance (value) {
    const number = Number(value)
    if (!Number.isFinite(number) || number < 0 || number > 100000) return ''
    const formatted = number.toFixed(3).replace(/\.?0+$/, '')
    return `${formatted} km`
  }

  function distanceFromText (value) {
    const text = String(value || '')
    const patterns = [
      /(\d{1,5}(?:\.\d{1,3})?)\s*(?:km|公里|千米)\s*(?:总里程|轨迹里程|总距离|里程)/i,
      /(?:总里程|轨迹里程|总距离|里程)\s*[:：]?\s*(\d{1,5}(?:\.\d{1,3})?)\s*(?:km|公里|千米)/i,
    ]
    for (const pattern of patterns) {
      const match = pattern.exec(text)
      const normalized = normalizeDistance(match?.[1])
      if (normalized) return normalized
    }
    return ''
  }

  function normalizeDuration (value) {
    const normalized = decodeText(value)
    if (!/^\d{1,3}:[0-5]\d:[0-5]\d$/.test(normalized) && !/^[0-5]?\d:[0-5]\d$/.test(normalized)) return ''
    return normalized
  }

  function durationFromText (value) {
    const text = String(value || '')
    const durationPattern = '(\\d{1,3}:[0-5]\\d:[0-5]\\d|[0-5]?\\d:[0-5]\\d)'
    const labelPattern = '(?:运动耗时|运动时长|轨迹耗时|总耗时|耗时|用时)'
    const patterns = [
      new RegExp(`${durationPattern}\\s*${labelPattern}`, 'i'),
      new RegExp(`${labelPattern}\\s*[:：]?\\s*${durationPattern}`, 'i'),
    ]
    for (const pattern of patterns) {
      const match = pattern.exec(text)
      const normalized = normalizeDuration(match?.[1])
      if (normalized) return normalized
    }
    return ''
  }

  function normalizeAuthor (value) {
    const normalized = decodeText(value).slice(0, 80)
    if (!normalized || /(?:原作者|轨迹作者|作者|基本信息|标注点|互动|下载|分享|扫码|登录|注册|总里程|运动耗时)/.test(normalized)) return ''
    if (/https?:\/\/|\d+(?:\.\d+)?\s*(?:km|公里|千米)|\d{1,3}:[0-5]\d:[0-5]\d/i.test(normalized)) return ''
    return normalized
  }

  function authorFromDom () {
    const nodes = safeRead(() => Array.from(document.querySelectorAll('body *')), []).slice(0, 3000)
    for (const node of nodes) {
      const label = decodeText(safeRead(() => node.textContent, ''))
      if (!/^(?:原作者|轨迹作者|作者)$/.test(label)) continue
      const parent = safeRead(() => node.parentElement, null)
      const nearbyLink = safeRead(() => parent?.querySelector?.('a[href*="user"], a[href*="space"], a[href*="member"], [class*="author"], [class*="nick"]'), null)
      const candidates = [
        safeRead(() => node.previousElementSibling?.textContent, ''),
        safeRead(() => nearbyLink?.textContent, ''),
        safeRead(() => parent?.previousElementSibling?.textContent, ''),
        safeRead(() => node.nextElementSibling?.textContent, ''),
      ]
      for (const candidate of candidates) {
        const normalized = normalizeAuthor(candidate)
        if (normalized) return normalized
      }
    }
    return ''
  }

  function authorFromLines (lines) {
    const labels = /^(?:原作者|轨迹作者|作者)$/
    for (let index = 0; index < lines.length; index += 1) {
      const sameLine = /^(.*?)\s*(?:原作者|轨迹作者)$/.exec(lines[index]) || /^(?:原作者|轨迹作者)\s*[:：]?\s*(.+)$/.exec(lines[index])
      const sameLineAuthor = normalizeAuthor(sameLine?.[1])
      if (sameLineAuthor) return sameLineAuthor
      if (!labels.test(lines[index])) continue
      for (const offset of [-1, -2, 1, 2]) {
        const normalized = normalizeAuthor(lines[index + offset])
        if (normalized) return normalized
      }
    }
    return ''
  }

  function readPageMetadata () {
    const lines = pageVisibleTextLines()
    // 数值和标签在不同页面版本中可能是同一行的内联元素，也可能被块级
    // 元素拆成相邻两行；使用换行拼接可同时覆盖两种结构，而不跨过其他
    // 可见文本猜测字段值。
    const visibleText = lines.join('\n')
    const metaAuthor = safeRead(() => document.querySelector('meta[name="author"], meta[property="article:author"]')?.content, '')
    return {
      distance: distanceFromText(visibleText),
      duration: durationFromText(visibleText),
      author: authorFromLines(lines) || authorFromDom() || normalizeAuthor(metaAuthor),
    }
  }

  function pointFromValue (value) {
    if (!value || typeof value !== 'object' && !Array.isArray(value)) return null
    const parsed = dataApi()?.coordinateFromPoint?.(value)
    if (parsed?.coordinates) return parsed
    let lat = null
    let lng = null
    if (Array.isArray(value)) {
      lng = Number(value[0])
      lat = Number(value[1])
    } else {
      lng = Number(value.lng ?? value.lon ?? value.longitude ?? value.x ?? safeRead(() => value.getLng?.(), undefined))
      lat = Number(value.lat ?? value.latitude ?? value.y ?? safeRead(() => value.getLat?.(), undefined))
    }
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) return null
    return { coordinates: [lng, lat], altitude: Number.isFinite(Number(value?.elev ?? value?.altitude ?? value?.height ?? value?.z)) ? Number(value.elev ?? value.altitude ?? value.height ?? value.z) : null }
  }

  function coordinateSeries (value, depth = 0) {
    if (depth > 5 || !Array.isArray(value) || !value.length) return []
    if (pointFromValue(value[0])) return [value]
    const result = []
    value.forEach(item => result.push(...coordinateSeries(item, depth + 1)))
    return result
  }

  function parseCoordinateString (value) {
    const text = String(value || '').trim()
    if (!text || text.length > MAX_BYTES) return []
    const parsed = parseJson(text)
    if (parsed) return parsed
    const points = text
      .split(/[;|\n]+/)
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => item.split(/[\s,]+/).filter(Boolean).slice(0, 3))
      .filter(item => item.length >= 2)
      .map(item => pointFromValue(item))
      .filter(Boolean)
    return points.length ? points : []
  }

  function readGlobal (names) {
    for (const name of names) {
      const value = safeRead(() => globalThis[name], undefined)
      if (value !== undefined && value !== null && value !== '') return value
    }
    return undefined
  }

  function normalizeTrackId (value) {
    let normalized = String(value || '').trim().replaceAll(' ', '+')
    for (let index = 0; index < 2; index += 1) {
      try {
        const decoded = decodeURIComponent(normalized)
        if (decoded === normalized) break
        normalized = decoded.replaceAll(' ', '+')
      } catch {
        return ''
      }
    }
    return TRACK_ID_PATTERN.test(normalized) ? normalized : ''
  }

  function currentTrackId (options = {}) {
    const candidates = [
      readGlobal(['trackId']),
      readGlobal(['trackStr']),
      readGlobal(['encryptTrackId']),
      options.trackId,
    ]
    return candidates.map(normalizeTrackId).find(Boolean) || ''
  }

  function pairLongitudeLatitude (lngValue, latValue, altitudeValue) {
    const normalizeSeries = value => {
      const parsed = typeof value === 'string' ? parseCoordinateString(value) : value
      if (!Array.isArray(parsed)) return []
      if (!parsed.length) return []
      if (!Array.isArray(parsed[0])) return [parsed]
      return parsed
    }
    const lngSegments = normalizeSeries(lngValue)
    const latSegments = normalizeSeries(latValue)
    if (!lngSegments.length || !latSegments.length) return []
    const altitudeSegments = normalizeSeries(altitudeValue)
    const segments = []
    const count = Math.min(lngSegments.length, latSegments.length)
    for (let index = 0; index < count; index += 1) {
      const lngs = lngSegments[index]
      const lats = latSegments[index]
      const alts = altitudeSegments[index] || []
      const points = []
      for (let pointIndex = 0; pointIndex < Math.min(lngs.length, lats.length); pointIndex += 1) {
        const point = pointFromValue([lngs[pointIndex], lats[pointIndex], alts[pointIndex]])
        if (point) points.push(point)
      }
      if (points.length) segments.push(points)
    }
    return segments
  }

  function readBalancedLiteral (source, start) {
    const opener = source[start]
    if (opener !== '[' && opener !== '{') return ''
    const closer = opener === '[' ? ']' : '}'
    let depth = 0
    let quote = ''
    let escaped = false
    for (let index = start; index < source.length; index += 1) {
      const char = source[index]
      if (quote) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === quote) quote = ''
        continue
      }
      if (char === '"' || char === "'") {
        quote = char
        continue
      }
      if (char === opener) depth += 1
      else if (char === closer) {
        depth -= 1
        if (depth === 0) return source.slice(start, index + 1)
      }
      if (index - start > MAX_BYTES) return ''
    }
    return ''
  }

  function parseScriptLiteral (value) {
    const direct = parseJson(value)
    if (direct !== null) return direct
    const normalized = String(value || '')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)\s*:/g, '$1"$2":')
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, text) => `"${text.replace(/"/g, '\\"')}"`)
    return parseJson(normalized)
  }

  function collectScriptLiterals (diagnostics) {
    const values = []
    const names = ['trackPositions', 'trackLngs', 'trackLats', 'trackElevations', 'trackPoints', 'markers', 'trackMarkers', 'markerList']
    const scripts = safeRead(() => Array.from(document.scripts || [], script => String(script.textContent || '')).join('\n'), '')
    if (!scripts || scripts.length > 2 * 1024 * 1024) return values
    names.forEach(name => {
      const pattern = new RegExp(`(?:var|let|const|window\\.)?\\s*${name}\\s*(?:=|:)\\s*`, 'g')
      let match
      while ((match = pattern.exec(scripts)) !== null && values.length < 40) {
        const start = scripts.slice(match.index + match[0].length).search(/[\\[{]/)
        if (start < 0) continue
        const absoluteStart = match.index + match[0].length + start
        const literal = readBalancedLiteral(scripts, absoluteStart)
        const parsed = parseScriptLiteral(literal)
        if (parsed !== null) values.push({ name, value: parsed })
        pattern.lastIndex = absoluteStart + Math.max(literal.length, 1)
      }
    })
    diagnostics.scriptLiterals = values.length
    return values
  }

  function markerFromLayer (layer) {
    const pointMessage = safeRead(() => layer?.pointMsg, null) || safeRead(() => layer?._pointMsg, null)
    const extData = safeRead(() => layer?.getExtData?.(), null) || safeRead(() => layer?._opts?.extData, null) || safeRead(() => layer?.options?.extData, null)
    const markerData = pointMessage && typeof pointMessage === 'object'
      ? pointMessage
      : extData && typeof extData === 'object' ? extData : null
    const latlng = safeRead(() => markerData?.latLng, null) || safeRead(() => layer?.getLatLng?.(), null) || safeRead(() => layer?.getPosition?.(), null) || safeRead(() => layer?._latlng, null)
    let point = restoreMapPointToGps(pointFromValue(latlng))
    // 两步路在高德图层上会把原始 GPS 坐标转换成 GCJ-02；pointMsg 保留的是
    // 转换后的地图坐标，而轨迹数组 trackLngs 保留 GPS 坐标。优先调用页面
    // 自己的反向转换函数，保证标注和轨迹在导入后的 KML 中仍然重合。
    if (!point) return null
    const popup = safeRead(() => layer?.getPopup?.(), null) || layer?._popup
    const rawContent = safeRead(() => popup?.getContent?.(), '') || popup?._content || safeRead(() => layer?.getContent?.(), '') || ''
    const html = typeof rawContent === 'string'
      ? rawContent
      : safeRead(() => rawContent?.outerHTML || rawContent?.textContent, '')
    const options = layer?.options || {}
    const params = markerData?.params && typeof markerData.params === 'object' ? markerData.params : {}
    const merged = { ...markerData, ...params }
    const readAttribute = (attributes, name) => new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(String(attributes || ''))?.[2] || ''
    const linkedImage = /<a\b([^>]*)>[\s\S]*?<img\b([^>]*)>/i.exec(String(html))
    const linkedImageUrl = linkedImage ? readAttribute(linkedImage[1], 'href') : ''
    const linkedThumbnailUrl = linkedImage ? readAttribute(linkedImage[2], 'src') : ''
    const urls = [...String(html).matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(match => match[1]).filter(Boolean)
    const imageUrl = linkedImageUrl || urls.find(url => /\.(?:png|jpe?g|gif|webp)(?:[?#]|$)/i.test(url)) || urls[0] || ''
    const previewImageUrl = linkedThumbnailUrl && linkedThumbnailUrl !== imageUrl ? linkedThumbnailUrl : ''
    // 只有 pointMsg/extData 中明确的用户字段才作为名称；图层标题、alt 和
    // 弹窗系统文本通常是序号或 UI 标签，不能直接生成点位名称。
    const text = decodeText(merged.userName || merged.customName || merged.pointName || merged.markerName || merged.name || merged.text || merged.title || '')
    const descriptionText = decodeText(html) || text
    return {
      longitude: point.coordinates[0],
      latitude: point.coordinates[1],
      elevation: point.altitude,
      text,
      descriptionText,
      ...(imageUrl ? { centerUrl: previewImageUrl || imageUrl, fileType: 0 } : {}),
      ...(merged.fileUrl || merged.centerUrl ? { centerUrl: merged.fileUrl || merged.centerUrl } : {}),
      ...(merged.fileUrl || merged.centerUrl ? { fileUrl: merged.fileUrl || merged.centerUrl } : {}),
      ...(linkedImageUrl ? { commnFileUrl: linkedImageUrl } : {}),
      ...(merged.commnFileUrl || merged.commonFileUrl ? { commnFileUrl: merged.commnFileUrl || merged.commonFileUrl } : {}),
      ...(merged.firstPicUrl ? { firstPicUrl: merged.firstPicUrl } : {}),
      ...(merged.mp3FileUrl ? { mp3FileUrl: merged.mp3FileUrl } : {}),
      ...(merged.fileType !== undefined ? { fileType: merged.fileType } : {}),
    }
  }

  function restoreMapPointToGps (point) {
    if (!point || typeof globalThis.changeMapCoordByMapType !== 'function') return point
    const restored = safeRead(() => globalThis.changeMapCoordByMapType(point.coordinates[0], point.coordinates[1]), null)
    const restoredPoint = pointFromValue(restored)
    return restoredPoint ? { ...point, coordinates: restoredPoint.coordinates } : point
  }

  function lineSegmentsFromLayer (layer) {
    const latlngs = safeRead(() => layer?.getLatLngs?.(), null) || safeRead(() => layer?.getPath?.(), null) || safeRead(() => layer?._latlngs, null)
    return coordinateSeries(latlngs).map(segment => segment
      .map(value => restoreMapPointToGps(pointFromValue(value)))
      .filter(Boolean))
  }

  function collectLeafletGeometry (diagnostics) {
    const positions = []
    const markers = []
    const visited = new WeakSet()
    const layerVisited = new WeakSet()
    const layers = []

    function addLayer (layer) {
      if (!layer || (typeof layer !== 'object' && typeof layer !== 'function') || layerVisited.has(layer)) return
      layerVisited.add(layer)
      layers.push(layer)
    }

    function walk (value, depth) {
      if (depth > 3 || !value || (typeof value !== 'object' && typeof value !== 'function') || visited.has(value)) return
      visited.add(value)
      if (typeof value.getLayers === 'function') safeRead(() => value.getLayers().forEach(addLayer))
      if (typeof value.getAllOverlays === 'function') safeRead(() => value.getAllOverlays().forEach(addLayer))
      if (typeof value.getOverlays === 'function') safeRead(() => value.getOverlays().forEach(addLayer))
      const layerMap = safeRead(() => value._layers, null)
      if (layerMap && typeof layerMap === 'object') Object.values(layerMap).slice(0, 500).forEach(addLayer)
      const keys = ['map', '_map', 'trackMap', 'trackLayer', 'lineLayer', 'markerLayer', 'layers', '_layers', 'overlays', '_overlays', 'polyline', 'polylineLayer', 'marker', '_marker']
      keys.forEach(key => walk(safeRead(() => value[key], null), depth + 1))
    }

    const globalNames = safeRead(() => Object.getOwnPropertyNames(globalThis), [])
      .filter(name => /(?:map|track|route|layer|line|marker)/i.test(name))
      .slice(0, 120)
    globalNames.forEach(name => walk(safeRead(() => globalThis[name], null), 0))
    layers.forEach(layer => {
      const segments = lineSegmentsFromLayer(layer)
      if (segments.some(segment => segment.length >= 2)) {
        positions.push({ payload: { trackPositions: segments }, score: segments.reduce((sum, item) => sum + item.length, 0) + 1000, source: 'rendered' })
        diagnostics.lineLayers += 1
        return
      }
      const marker = markerFromLayer(layer)
      if (marker) {
        markers.push(marker)
        diagnostics.markerLayers += 1
      }
    })
    return { positions, markers }
  }

  function collectGlobalData (diagnostics) {
    const positions = []
    const markers = []
    const visited = new WeakSet()
    let nodeCount = 0
    const positionNames = new Set(['trackPositions', 'positions', 'trackPoints', 'points', 'trackData', 'routeData', 'pathData', 'coordinates', 'trackLngs', 'trackLats'])
    const markerNames = new Set(['markers', 'trackMarkers', 'trackMarkerList', 'markerList', 'markList'])

    function addMarkers (value) {
      const markerResult = dataApi()?.findMarkerList?.(value)
      if (!markerResult?.found) return
      markerResult.markers.forEach(marker => markers.push(markerFromLayer(marker) || marker))
    }

    function addValue (value, name, depth) {
      if (nodeCount++ > MAX_GLOBAL_NODES || depth > 4 || value === null || value === undefined) return
      if (typeof value === 'string') {
        const parsed = parseCoordinateString(value)
        if (parsed.length) addValue(parsed, name, depth + 1)
        return
      }
      if (typeof value !== 'object') return
      if (positionNames.has(name) || /(?:track|route|path|line|coord|position|lnglat)/i.test(name)) {
        const segments = dataApi()?.findTrackSegments?.(value) || coordinateSeries(value)
        if (segments.length) {
          // 两步路 trackLngs/trackPositions 保存原始 GPS/WGS84；地图折线图层则是
          // changeGPSCoordByMapType 后的展示坐标。给原始运行态明确更高优先级，
          // 同时保留海拔、时间和速度字段，避免选择地图图层后发生二次纠偏。
          const sourceBonus = name === 'trackLngs'
            ? 4000
            : name === 'trackPositions' ? 3000 : 0
          positions.push({
            payload: value,
            score: segments.reduce((sum, segment) => sum + segment.length, 0) + sourceBonus,
            source: 'raw',
          })
        }
      }
      if (markerNames.has(name) || /marker|mark/i.test(name)) {
        addMarkers(value)
      }
      if (depth >= 3 || Array.isArray(value)) return
      Object.keys(value).filter(key => GLOBAL_NAME_PATTERN.test(key)).slice(0, 40).forEach(key => addValue(safeRead(() => value[key], null), key, depth + 1))
    }

    const names = safeRead(() => Object.getOwnPropertyNames(globalThis), [])
      .filter(name => GLOBAL_NAME_PATTERN.test(name))
      .slice(0, 180)
    names.forEach(name => addValue(safeRead(() => globalThis[name], null), name, 0))

    const lngs = readGlobal(['trackLngs', 'trackLongitudes', 'lngs', 'longitudes'])
    const lats = readGlobal(['trackLats', 'trackLatitudes', 'lats', 'latitudes'])
    const alts = readGlobal(['trackElevations', 'trackAlts', 'trackHeights', 'elevations', 'altitudes'])
    const paired = pairLongitudeLatitude(lngs, lats, alts)
    if (paired.length) positions.push({ payload: { trackPositions: paired }, score: paired.reduce((sum, segment) => sum + segment.length, 0) + 4000, source: 'raw' })
    addMarkers(readGlobal(['trackMarks', 'trackMarkers', 'trackMarkerList', 'markerList', 'markList']))
    const scriptValues = collectScriptLiterals(diagnostics)
    const scriptMap = new Map(scriptValues.map(item => [item.name, item.value]))
    const scriptPaired = pairLongitudeLatitude(scriptMap.get('trackLngs'), scriptMap.get('trackLats'), scriptMap.get('trackElevations'))
    if (scriptPaired.length) positions.push({ payload: { trackPositions: scriptPaired }, score: scriptPaired.reduce((sum, segment) => sum + segment.length, 0) + 3500, source: 'raw' })
    scriptValues.forEach(item => {
      const segments = dataApi()?.findTrackSegments?.(item.value) || coordinateSeries(item.value)
      if (segments.length && /(?:trackPositions|trackLngs|trackLats|trackPoints)/.test(item.name)) {
        positions.push({ payload: item.value, score: segments.reduce((sum, segment) => sum + segment.length, 0) + 1800, source: 'raw' })
      }
      if (/marker|mark/i.test(item.name)) addMarkers(item.value)
    })
    diagnostics.globalNodes = nodeCount
    return { positions, markers }
  }

  async function readResourcePayloads (diagnostics) {
    const payloads = []
    const seen = new Set()
    const add = (url, payload) => {
      if (payload === null || payload === undefined) return
      payloads.push({ url, payload })
    }
    const captured = safeRead(() => globalThis.__mapServiceTwoBuluCapturedResponses, [])
    const capturedUrls = []
    if (Array.isArray(captured)) captured.slice(-MAX_RESOURCE_COUNT).forEach(record => {
      if (!isDataUrl(record?.url)) return
      capturedUrls.push(record.url)
      const payload = parseJson(record.payload ?? record.text ?? record.body)
      if (payload) add(record.url, payload)
    })
    const entries = safeRead(() => performance.getEntriesByType('resource'), [])
    const urls = [...capturedUrls, ...entries.map(entry => entry?.name)].filter(isDataUrl).filter(url => {
      if (seen.has(url)) return false
      seen.add(url)
      return true
    }).slice(-MAX_RESOURCE_COUNT)
    diagnostics.resourceUrls = urls.length
    for (const url of urls) {
      try {
        const response = await fetch(url, { credentials: 'include', cache: 'no-store', redirect: 'follow' })
        if (!response.ok) continue
        if (!isDataUrl(response.url || url)) continue
        const text = await response.text()
        if (byteLength(text) > MAX_BYTES) continue
        const payload = parseJson(text)
        if (payload) add(url, payload)
      } catch {}
    }
    return payloads
  }

  async function readPageRequestPayloads (diagnostics, options = {}, needs = {}) {
    const requestClient = safeRead(() => globalThis.request, null)
    const trackId = currentTrackId(options)
    if (typeof requestClient?.get !== 'function' || !trackId) return []
    const operationCode = normalizeTrackId(readGlobal(['operationCode']))
    const payloads = []
    let requestCount = 0
    const requestPayload = async path => {
      try {
        requestCount += 1
        const url = new URL(path, location.origin).toString()
        const response = await requestClient.get(url, {
          params: { trackId, operationCode },
          decrypt: true,
          responseType: 'arraybuffer',
        })
        const payload = unwrapResponsePayload(response)
        return payload === null ? null : { url, payload }
      } catch {
        return null
      }
    }

    if (needs.positions !== false) {
      for (const path of TRACK_DATA_PATHS) {
        const item = await requestPayload(path)
        if (!item) continue
        const segments = dataApi()?.findTrackSegments?.(item.payload) || []
        if (!segments.length) continue
        payloads.push(item)
        break
      }
    }
    if (needs.markers !== false) {
      for (const path of MARKER_DATA_PATHS) {
        const item = await requestPayload(path)
        if (!item) continue
        const markerResult = dataApi()?.findMarkerList?.(item.payload)
        if (!markerResult?.found) continue
        payloads.push(item)
        break
      }
    }
    diagnostics.pageRequests = requestCount
    return payloads
  }

  function addPayloadCandidates (items, positionCandidates, markerValues, scoreBonus = 1500) {
    items.forEach(item => {
      const pathname = safeRead(() => new URL(item.url, location.href).pathname, '')
      if (/positions/i.test(pathname)) {
        const segments = dataApi()?.findTrackSegments?.(item.payload) || []
        if (segments.length) {
          positionCandidates.push({
            payload: item.payload,
            score: segments.reduce((sum, segment) => sum + segment.length, 0) + scoreBonus,
            source: 'raw',
          })
        }
      }
      if (/marker/i.test(pathname)) {
        const markerResult = dataApi()?.findMarkerList?.(item.payload)
        if (markerResult?.found) markerValues.push(...markerResult.markers)
      }
    })
  }

  function positionSegmentKey (segment) {
    const coordinates = (Array.isArray(segment) ? segment : [])
      .map(pointFromValue)
      .filter(Boolean)
      .map(point => point.coordinates.map(value => Number(value).toFixed(6)).join(','))
    if (!coordinates.length) return ''
    const forward = coordinates.join(';')
    const reverse = [...coordinates].reverse().join(';')
    return forward < reverse ? forward : reverse
  }

  function mergePositions (candidates) {
    const result = []
    const seen = new Set()
    const rawCandidates = candidates.filter(candidate => candidate?.source === 'raw')
      .sort((left, right) => Number(right?.score || 0) - Number(left?.score || 0))
    const renderedCandidates = candidates.filter(candidate => candidate?.source === 'rendered')
      .sort((left, right) => Number(right?.score || 0) - Number(left?.score || 0))
    // 原始 GPS/WGS84 候选优先，地图线图层随后补充；相同或反向重复线段
    // 通过坐标键去重，独立线段则全部保留。
    const ordered = [...rawCandidates, ...renderedCandidates]
    ordered.forEach(candidate => {
      const segments = dataApi()?.findTrackSegments?.(candidate?.payload) || coordinateSeries(candidate?.payload)
      segments.forEach(segment => {
        if (!Array.isArray(segment) || segment.length < 2) return
        const key = positionSegmentKey(segment)
        if (!key || seen.has(key)) return
        seen.add(key)
        result.push(segment)
      })
    })
    return result.length ? { trackPositions: result } : null
  }

  function uniqueMarkers (values) {
    const result = []
    const seen = new Set()
    values.forEach(marker => {
      const point = pointFromValue(marker)
      if (!point) return
      const key = `${point.coordinates[0]},${point.coordinates[1]}|${decodeText(marker?.text || marker?.name || '')}`
      if (seen.has(key)) return
      seen.add(key)
      result.push(marker)
    })
    return result
  }

  async function collect (options = {}) {
    if (!isPageUrl(location.href)) return pageError('当前页面不是受支持的两步路官方页面。', 'TWO_BULU_URL_INVALID', 'failed')
    const diagnostics = { globalNodes: 0, resourceUrls: 0, lineLayers: 0, markerLayers: 0 }
    const metadata = readPageMetadata()
    diagnostics.metadataFields = Object.entries(metadata).filter(([, value]) => Boolean(value)).map(([key]) => key)
    const positionCandidates = []
    const markerValues = []
    const globals = collectGlobalData(diagnostics)
    positionCandidates.push(...globals.positions)
    markerValues.push(...globals.markers)
    const leaflet = collectLeafletGeometry(diagnostics)
    // 运行态全局数据（尤其是 trackLngs）始终优先；地图图层只作为没有
    // 原始轨迹数组时的回退，避免按轨迹点数量或图层遍历顺序误选展示坐标。
    positionCandidates.push(...leaflet.positions.map(candidate => ({
      ...candidate,
      score: Number(candidate.score || 0) - 1000000,
    })))
    markerValues.push(...leaflet.markers)
    let positionsPayload = mergePositions(positionCandidates)
    let markers = uniqueMarkers(markerValues)
    // 运行态已经包含完整轨迹和标注时不再重复读取接口。两步路会把重复
    // 请求判定为异常流量，且这些接口常返回 SafeLine 页面而不是 JSON。
    const needsResourceFallback = !positionsPayload || (markers.length === 0 && options.partialPolicy !== 'allow-track-only')
    if (needsResourceFallback) {
      const resources = await readResourcePayloads(diagnostics)
      addPayloadCandidates(resources, positionCandidates, markerValues)
      positionsPayload = mergePositions(positionCandidates)
      markers = uniqueMarkers(markerValues)
    }
    const needsPageRequestFallback = !positionsPayload || (markers.length === 0 && options.partialPolicy !== 'allow-track-only')
    if (needsPageRequestFallback) {
      const pagePayloads = await readPageRequestPayloads(diagnostics, options, {
        positions: !positionsPayload,
        markers: markers.length === 0 && options.partialPolicy !== 'allow-track-only',
      })
      addPayloadCandidates(pagePayloads, positionCandidates, markerValues, 2500)
      positionsPayload = mergePositions(positionCandidates)
      markers = uniqueMarkers(markerValues)
    }
    const markerPayload = markers.length ? { markers } : undefined
    if (!positionsPayload && !markerPayload) {
      const checkedSummary = `已检查 ${diagnostics.resourceUrls} 个轨迹资源、${diagnostics.scriptLiterals || 0} 个脚本数据块、${diagnostics.lineLayers} 个线图层和 ${diagnostics.markerLayers} 个点图层`
      return pageError(
        `页面已打开，但未识别到可转换的轨迹运行数据（${checkedSummary}）；请等待地图和轨迹点完全显示后重试。`,
        'TWO_BULU_PAGE_DATA_NOT_RECOGNIZED',
        'unsupported',
      )
    }
    if (!(dataApi()?.convertTwoBuluRenderedData instanceof Function)) {
      return pageError('页面导出脚本缺少 KML 转换模块，请重新加载扩展。', 'HELPER_INCOMPATIBLE', 'failed')
    }
    try {
      const converted = dataApi().convertTwoBuluRenderedData({
        positionsPayload: positionsPayload || { trackPositions: [] },
        markersPayload: markerPayload,
        sourceUrl: location.href,
        title: pageTitle(),
        metadata,
        partialPolicy: options.partialPolicy || 'reject',
        maxPoints: MAX_POINTS,
      })
      return {
        ...converted,
        sourceUrl: location.href,
        name: pageTitle(),
        metadata: converted.metadata || metadata,
        diagnostics,
      }
    } catch (error) {
      return pageError(error?.message || '页面运行数据无法转换为 KML。', error?.code || 'TWO_BULU_DATA_CONVERT_FAILED', error?.status || 'failed')
    }
  }

  async function download (options = {}) {
    const result = await collect(options)
    if (result.status !== 'success') return result
    const blob = new Blob([result.kmlText], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${String(result.name || '两步路公开轨迹').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || '两步路公开轨迹'}.kml`
    anchor.hidden = true
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return result
  }

  function installButton (options = {}) {
    const id = options.id || 'map-service-two-bulu-export-button'
    const existing = document.getElementById(id)
    if (existing) return existing
    const button = document.createElement('button')
    button.id = id
    button.type = 'button'
    button.textContent = options.label || '导出当前轨迹 KML'
    Object.assign(button.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      padding: '8px 12px',
      background: '#0f766e',
      color: '#fff',
      border: '0',
      borderRadius: '4px',
      cursor: 'pointer',
    })
    button.addEventListener('click', async () => {
      button.disabled = true
      const result = await download(options)
      button.disabled = false
      if (result.status !== 'success') button.dataset.error = result.code || 'export-failed'
      else button.dataset.status = 'success'
    })
    document.documentElement.appendChild(button)
    return button
  }

  globalThis.MapServiceTwoBuluPageExport = Object.freeze({
    collect,
    download,
    installButton,
    readPageMetadata,
  })
})()
