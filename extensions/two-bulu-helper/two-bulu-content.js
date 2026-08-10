(() => {
  'use strict'

  if (window.top !== window || globalThis.__mapServiceTwoBuluCollectorLoaded) return
  globalThis.__mapServiceTwoBuluCollectorLoaded = true

  const PAGE_HOSTS = new Set(['2bulu.com', 'www.2bulu.com', 'app.2bulu.com'])
  const DOWNLOAD_HOSTS = new Set([...PAGE_HOSTS, 'down-files.2bulu.com'])
  const TRACK_DATA_PATHS = new Set([
    '/track/get_track_positions_list4.htm',
    '/track/get_track_positions_list_new.htm',
    '/track/get_track_positions_list.htm',
  ])
  const MARKER_DATA_PATHS = new Set([
    '/track/get_track_marker_list_new.htm',
    '/track/get_track_marker_list_2.htm',
  ])
  const DATA_PATHS = new Set([...TRACK_DATA_PATHS, ...MARKER_DATA_PATHS])
  const TRACK_ID_PATTERN = /^[A-Za-z0-9+/_=-]{1,160}$/
  const MAX_DATA_BYTES = 10 * 1024 * 1024
  const MAX_KML_BYTES = 10 * 1024 * 1024

  function isKmlText (value) {
    const text = String(value || '').replace(/^\uFEFF/, '').trim()
    return /^(?:<\?xml\b[^>]*>\s*)?<(?:[\w.-]+:)?kml\b/i.test(text) &&
      /<\/(?:[\w.-]+:)?kml\s*>/i.test(text)
  }

  function allowedDownloadUrl (value, baseUrl = location.href) {
    try {
      const parsed = new URL(String(value || ''), baseUrl)
      const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
      if (parsed.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(hostname) || parsed.username || parsed.password || parsed.port) return ''
      parsed.hash = ''
      return parsed.toString()
    } catch {
      return ''
    }
  }

  function allowedDataUrl (value, baseUrl = location.href, allowedPaths = DATA_PATHS) {
    try {
      const parsed = new URL(String(value || ''), baseUrl)
      const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
      if (parsed.protocol !== 'https:' || !PAGE_HOSTS.has(hostname) || parsed.username || parsed.password || parsed.port || !allowedPaths.has(parsed.pathname)) return ''
      parsed.hash = ''
      return parsed.toString()
    } catch {
      return ''
    }
  }

  function pageSignals (value) {
    const text = String(value || '').slice(0, 120000)
    return {
      blocked: /safeline|sl-session|\.safeline\/static|confirm you are human|客户端异常，请确认您是合法用户/i.test(text),
      login: /请[^<]{0,20}登录|需要登录|先登录|<title[^>]*>[^<]*(?:登录|验证)|type=["']password["']|验证码|captcha|人机验证/i.test(text),
    }
  }

  function pageName () {
    const title = document.querySelector('meta[property="og:title"]')?.content || document.title || ''
    return String(title)
      .replace(/\s*[-_|].*(?:轨迹|两步路).*$/i, '')
      .replace(/\.(?:kml|kmz|gpx)$/i, '')
      .trim()
      .slice(0, 200)
  }

  function pageScriptText () {
    return Array.from(document.scripts || [])
      .map(script => String(script.textContent || ''))
      .join('\n')
      .slice(0, 500000)
  }

  function pageVariable (name) {
    const escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const sources = [pageScriptText(), String(document.documentElement?.outerHTML || '').slice(0, 160000)]
    const patterns = [
      new RegExp(`(?:var|let|const)\\s+${escaped}\\s*=\\s*["']([^"']{1,200})["']`, 'i'),
      new RegExp(`["']?${escaped}["']?\\s*[:=]\\s*["']([^"']{1,200})["']`, 'i'),
      new RegExp(`(?:var|let|const)\\s+${escaped}\\s*=\\s*([A-Za-z0-9+/_=-]{1,160})`, 'i'),
      new RegExp(`["']?${escaped}["']?\\s*[:=]\\s*([A-Za-z0-9+/_=-]{1,160})`, 'i'),
    ]
    for (const source of sources) {
      for (const pattern of patterns) {
        const match = pattern.exec(source)
        if (match?.[1]) return String(match[1]).trim()
      }
    }
    const selectors = [`#${name}`, `[name="${name}"]`, `[data-${name}]`]
    for (const selector of selectors) {
      const element = document.querySelector(selector)
      const value = element?.getAttribute('value') || element?.getAttribute(`data-${name}`) || ''
      if (value) return String(value).trim()
    }
    return ''
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

  function trackIdCandidates (message) {
    const values = [
      pageVariable('trackId'),
      pageVariable('trackStr'),
      pageVariable('encryptTrackId'),
      message.trackId,
    ]
    const results = []
    const seen = new Set()
    values.forEach(value => {
      const normalized = normalizeTrackId(value)
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized)
        results.push(normalized)
      }
    })
    return results.slice(0, 6)
  }

  async function localFetchText (url) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal,
      })
      const finalUrl = allowedDownloadUrl(response.url || url, url)
      if (!finalUrl) throw new Error('下载地址超出允许范围')
      const declaredSize = Number(response.headers.get('content-length'))
      if (Number.isFinite(declaredSize) && declaredSize > MAX_KML_BYTES) {
        return { ok: false, code: 'FILE_TOO_LARGE', message: '两步路 KML 超过 10 MiB' }
      }
      const text = await response.text()
      if (new TextEncoder().encode(text).byteLength > MAX_KML_BYTES) {
        return { ok: false, code: 'FILE_TOO_LARGE', message: '两步路 KML 超过 10 MiB' }
      }
      return { ok: response.ok, statusCode: response.status, text }
    } finally {
      clearTimeout(timer)
    }
  }

  async function localFetchData (url) {
    const normalized = allowedDataUrl(url)
    if (!normalized) return { ok: false, code: 'TWO_BULU_DATA_URL_INVALID' }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      const response = await fetch(normalized, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        redirect: 'follow',
        headers: {
          Accept: 'application/json, text/plain;q=0.9',
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: controller.signal,
      })
      let finalUrl = ''
      try {
        const parsedFinal = new URL(response.url || normalized)
        const hostname = parsedFinal.hostname.toLowerCase().replace(/\.$/, '')
        if (parsedFinal.protocol !== 'https:' || !PAGE_HOSTS.has(hostname) || parsedFinal.username || parsedFinal.password || parsedFinal.port) {
          return { ok: false, code: 'TWO_BULU_DATA_REDIRECT_BLOCKED', statusCode: response.status }
        }
        finalUrl = parsedFinal.toString()
      } catch {
        return { ok: false, code: 'TWO_BULU_DATA_REDIRECT_BLOCKED', statusCode: response.status }
      }
      const declaredSize = Number(response.headers.get('content-length'))
      if (Number.isFinite(declaredSize) && declaredSize > MAX_DATA_BYTES) {
        return { ok: false, code: 'FILE_TOO_LARGE', message: '两步路轨迹数据超过 10 MiB' }
      }
      const text = await response.text()
      if (new TextEncoder().encode(text).byteLength > MAX_DATA_BYTES) {
        return { ok: false, code: 'FILE_TOO_LARGE', message: '两步路轨迹数据超过 10 MiB' }
      }
      return { ok: response.ok, statusCode: response.status, text, url: finalUrl }
    } catch (error) {
      return {
        ok: false,
        code: error?.name === 'AbortError' ? 'TWO_BULU_TIMEOUT' : 'TWO_BULU_DATA_FETCH_FAILED',
        message: error?.name === 'AbortError' ? '读取两步路轨迹数据超时' : '读取两步路轨迹数据失败',
      }
    } finally {
      clearTimeout(timer)
    }
  }

  async function fetchText (url) {
    try {
      return await localFetchText(url)
    } catch {
      return chrome.runtime.sendMessage({
        channel: 'map-service-two-bulu-helper',
        action: 'FETCH_OFFICIAL_KML',
        url,
      })
    }
  }

  async function tryKmlUrl (url) {
    const normalized = allowedDownloadUrl(url)
    if (!normalized) return null
    const response = await fetchText(normalized)
    if (response?.code === 'FILE_TOO_LARGE') {
      return { status: 'failed', code: response.code, message: response.message || '两步路 KML 超过 10 MiB' }
    }
    const signals = pageSignals(response?.text)
    if (response?.statusCode === 468 || signals.blocked) {
      return { status: 'needs-user-action', code: 'TWO_BULU_UPSTREAM_BLOCKED', message: '两步路当前要求在可见页面完成人机校验，请完成后回到 map-service 重试。' }
    }
    if ([401, 403].includes(Number(response?.statusCode)) || signals.login) {
      return { status: 'needs-user-action', code: 'TWO_BULU_LOGIN_REQUIRED', message: '请先在已打开的两步路页面登录或完成验证，然后回到 map-service 重试。' }
    }
    if (response?.ok && isKmlText(response.text)) return { status: 'success', kmlText: response.text }
    return null
  }

  function jsonPayload (response) {
    if (!response?.ok || !response.text) return null
    try {
      return JSON.parse(response.text)
    } catch {
      return null
    }
  }

  function dataResponseSignal (response) {
    const signals = pageSignals(response?.text)
    return {
      blocked: response?.statusCode === 468 || signals.blocked,
      login: [401, 403].includes(Number(response?.statusCode)) || signals.login,
    }
  }

  function markerRequestUrl (path, trackId, operationCode = '') {
    const parsed = new URL(path, location.origin)
    parsed.searchParams.set('trackId', trackId)
    if (operationCode) parsed.searchParams.set('operationCode', operationCode)
    return parsed.toString()
  }

  async function fetchRenderedTrackData (message) {
    const candidates = trackIdCandidates(message)
    if (!candidates.length) return null
    const operationCode = normalizeTrackId(pageVariable('operationCode'))
    let sawBlocked = false
    let sawLogin = false
    let sawPositions = false

    for (const trackId of candidates) {
      for (const path of TRACK_DATA_PATHS) {
        const positionsUrl = new URL(path, location.origin)
        positionsUrl.searchParams.set('trackId', trackId)
        const positionsResponse = await localFetchData(positionsUrl.toString())
        if (positionsResponse.code === 'FILE_TOO_LARGE') return { status: 'failed', code: positionsResponse.code, message: positionsResponse.message }
        const positionSignal = dataResponseSignal(positionsResponse)
        sawBlocked ||= positionSignal.blocked
        sawLogin ||= positionSignal.login
        if (positionSignal.blocked || positionSignal.login) continue
        const positionsPayload = jsonPayload(positionsResponse)
        if (!positionsPayload) continue
        sawPositions = true

        let markersPayload
        let markerFound = false
        for (const markerPath of MARKER_DATA_PATHS) {
          const markerResponse = await localFetchData(markerRequestUrl(markerPath, trackId, operationCode))
          if (markerResponse.code === 'FILE_TOO_LARGE') return { status: 'failed', code: markerResponse.code, message: markerResponse.message }
          const markerSignal = dataResponseSignal(markerResponse)
          sawBlocked ||= markerSignal.blocked
          sawLogin ||= markerSignal.login
          if (markerSignal.blocked || markerSignal.login) continue
          const candidatePayload = jsonPayload(markerResponse)
          if (candidatePayload === null) continue
          const markerResult = globalThis.MapServiceTwoBuluData?.findMarkerList?.(candidatePayload)
          if (!markerResult?.found) continue
          markersPayload = candidatePayload
          markerFound = true
          break
        }

        try {
          const converter = globalThis.MapServiceTwoBuluData?.convertTwoBuluRenderedData
          if (!(converter instanceof Function)) return { status: 'failed', code: 'HELPER_INCOMPATIBLE', message: '浏览器助手缺少轨迹数据转换模块，请重新加载扩展。' }
          const converted = converter({
            positionsPayload,
            markersPayload: markerFound ? markersPayload : undefined,
            sourceUrl: message.sourceUrl,
            title: pageName(),
            partialPolicy: message.partialPolicy || 'reject',
          })
          return { ...converted, sourceUrl: message.sourceUrl, name: pageName() || converted.name }
        } catch (error) {
          if (error?.code === 'TWO_BULU_TRACK_EMPTY') continue
          return {
            status: error?.status || 'failed',
            code: error?.code || 'TWO_BULU_DATA_CONVERT_FAILED',
            message: error?.message || '两步路页面轨迹数据无法转换为 KML',
          }
        }
      }
    }

    if (sawPositions && sawLogin) {
      return { status: 'needs-user-action', code: 'TWO_BULU_LOGIN_REQUIRED', message: '两步路轨迹数据接口要求登录或验证，请在当前页面完成后重试。' }
    }
    if (sawBlocked) {
      return { status: 'needs-user-action', code: 'TWO_BULU_UPSTREAM_BLOCKED', message: '两步路轨迹数据接口要求在当前页面完成人机校验，请完成后重试。' }
    }
    return null
  }

  function directKmlLinks () {
    const results = []
    const seen = new Set()
    document.querySelectorAll('a[href], link[href], [data-kml-url]').forEach((element) => {
      const value = element.getAttribute('href') || element.getAttribute('data-kml-url') || ''
      if (!/\.kml(?:$|[?#])/i.test(value)) return
      const normalized = allowedDownloadUrl(value)
      if (normalized && !seen.has(normalized) && results.length < 5) {
        seen.add(normalized)
        results.push(normalized)
      }
    })
    return results
  }

  async function collectKml (message) {
    const currentHost = location.hostname.toLowerCase()
    if (location.protocol !== 'https:' || !PAGE_HOSTS.has(currentHost)) {
      return { status: 'failed', code: 'TWO_BULU_URL_INVALID', message: '当前页面不是受支持的两步路官方页面。' }
    }

    const xmlRoot = document.documentElement
    if (String(xmlRoot?.localName || '').toLowerCase() === 'kml') {
      const kmlText = new XMLSerializer().serializeToString(xmlRoot)
      if (isKmlText(kmlText)) {
        return { status: 'success', sourceUrl: message.sourceUrl, name: pageName(), kmlText }
      }
    }
    const documentText = xmlRoot?.outerHTML || ''
    if (isKmlText(documentText)) {
      return { status: 'success', sourceUrl: message.sourceUrl, name: pageName(), kmlText: documentText }
    }
    const initialSignals = pageSignals(documentText)
    if (initialSignals.blocked) {
      return { status: 'needs-user-action', code: 'TWO_BULU_UPSTREAM_BLOCKED', message: '请先在当前两步路页面完成人机校验，然后回到 map-service 重试。' }
    }

    for (const url of directKmlLinks()) {
      const result = await tryKmlUrl(url)
      if (result) return { ...result, sourceUrl: message.sourceUrl, name: pageName() }
    }

    const renderedData = await fetchRenderedTrackData(message)
    if (renderedData) return renderedData

    const discoveryUrl = `https://www.2bulu.com/space/download_track.htm?trackId=${encodeURIComponent(String(message.trackId || ''))}&type=1`
    const discovery = await fetchText(discoveryUrl)
    if (discovery?.code === 'FILE_TOO_LARGE') {
      return { status: 'failed', code: discovery.code, message: discovery.message }
    }
    const discoverySignals = pageSignals(discovery?.text)
    if (discovery?.statusCode === 468 || discoverySignals.blocked) {
      return { status: 'needs-user-action', code: 'TWO_BULU_UPSTREAM_BLOCKED', message: '两步路下载请求需要人机校验，请在当前页面完成后回到 map-service 重试。' }
    }
    if ([401, 403].includes(Number(discovery?.statusCode)) || discoverySignals.login) {
      return { status: 'needs-user-action', code: 'TWO_BULU_LOGIN_REQUIRED', message: '两步路要求登录或验证码，请在当前页面完成后回到 map-service 重试。' }
    }
    if (discovery?.ok && isKmlText(discovery.text)) {
      return { status: 'success', sourceUrl: message.sourceUrl, name: pageName(), kmlText: discovery.text }
    }

    let payload = null
    try {
      payload = JSON.parse(String(discovery?.text || ''))
    } catch {}
    if (String(payload?.code) === '1') {
      return { status: 'needs-user-action', code: 'TWO_BULU_LOGIN_REQUIRED', message: '两步路要求先登录，请在当前页面完成登录后回到 map-service 重试。' }
    }
    if (String(payload?.code) === '2' && payload?.url) {
      const result = await tryKmlUrl(payload.url)
      if (result) return { ...result, sourceUrl: message.sourceUrl, name: pageName() }
    }

    if (initialSignals.login) {
      return { status: 'needs-user-action', code: 'TWO_BULU_LOGIN_REQUIRED', message: '请先在当前两步路页面登录或完成验证，然后回到 map-service 重试。' }
    }

    return {
      status: 'unsupported',
      code: 'TWO_BULU_PAGE_DATA_NOT_RECOGNIZED',
      message: '当前两步路页面尚未识别到已展示的轨迹运行数据；请等待地图、轨迹和点位完全显示后重试。',
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.channel !== 'map-service-two-bulu-helper' || message.action !== 'COLLECT_TWO_BULU_KML') return false
    collectKml(message).then(sendResponse).catch((error) => {
      sendResponse({
        status: 'failed',
        code: error?.name === 'AbortError' ? 'TWO_BULU_TIMEOUT' : 'TWO_BULU_FETCH_FAILED',
        message: error?.name === 'AbortError' ? '读取两步路 KML 超时，请稍后重试。' : (error?.message || '读取两步路 KML 失败，请稍后重试。'),
      })
    })
    return true
  })
})()
