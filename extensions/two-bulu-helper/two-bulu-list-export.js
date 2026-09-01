(() => {
  'use strict'

  if (globalThis.MapServiceTwoBuluListExport) return

  const PAGE_HOSTS = new Set(['2bulu.com', 'www.2bulu.com', 'app.2bulu.com'])
  const TRACK_ID_PATTERN = /^[A-Za-z0-9+/_=-]{1,160}$/
  const MAX_ITEMS = 200

  function text (value) {
    return String(value || '')
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

  function number (value) {
    const parsed = Number(String(value || '').replace(/,/g, ''))
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }

  function trackUrl (value, baseUrl) {
    try {
      const parsed = new URL(String(value || ''), baseUrl)
      const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
      if (parsed.protocol !== 'https:' || !PAGE_HOSTS.has(hostname) || parsed.username || parsed.password || parsed.port) return ''
      const path = parsed.pathname.replace(/;jsessionid=[^/?]*/gi, '')
      let rawId = ''
      const short = /^\/track\/t-([\s\S]+)\.htm$/i.exec(path)
      if (short) rawId = short[1]
      else if (/^\/(?:track\/track_detail|share\/share_track)\.htm$/i.test(path)) rawId = parsed.searchParams.get('trackId') || ''
      else return ''
      let id = String(rawId).trim().replaceAll(' ', '+')
      for (let index = 0; index < 2; index += 1) {
        const decoded = decodeURIComponent(id)
        if (decoded === id) break
        id = decoded.replaceAll(' ', '+')
      }
      if (!TRACK_ID_PATTERN.test(id)) return ''
      return `https://www.2bulu.com/track/track_detail.htm?trackId=${encodeURIComponent(id)}`
    } catch {
      return ''
    }
  }

  function cardText (anchor) {
    const card = anchor.closest('li,article,tr,[class*="track-item"],[class*="track_item"],[class*="route-item"],[class*="route_item"],[class*="list-item"],[class*="list_item"]') || anchor.parentElement
    return text(card?.innerText || card?.textContent || anchor.textContent)
  }

  function matchNumber (value, labels, suffix = '') {
    const source = String(value || '')
    const label = labels.join('|')
    const patterns = [
      new RegExp(`(?:${label})\\s*[:：]?\\s*([\\d,.]+)\\s*${suffix}`, 'i'),
      new RegExp(`([\\d,.]+)\\s*${suffix}\\s*(?:${label})`, 'i'),
    ]
    for (const pattern of patterns) {
      const result = number(pattern.exec(source)?.[1])
      if (result !== null) return result
    }
    return null
  }

  function publishedAt (value) {
    const match = /(?:发布|创建|上传|更新)(?:日期|时间)?\s*[:：]?\s*((?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|20\d{2}年\d{1,2}月\d{1,2}日)(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)|\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)\b/i.exec(String(value || ''))
    const raw = match?.[1] || match?.[2] || ''
    if (!raw) return null
    const iso = new Date(raw.replaceAll('/', '-').replace(/年|月/g, '-').replace(/日/g, ''))
    return Number.isNaN(iso.getTime()) ? null : iso.toISOString()
  }

  function userName () {
    const candidates = [
      document.querySelector('meta[name="author"]')?.content,
      document.querySelector('[class*="nick"], [class*="user-name"], [class*="username"], [class*="user_name"]')?.textContent,
      document.querySelector('a[href*="spaceindex"]')?.textContent,
    ]
    return candidates.map(text).find(Boolean)?.slice(0, 80) || ''
  }

  function collect () {
    const currentUrl = location.href
    const pathname = new URL(currentUrl).pathname.replace(/;jsessionid=[^/?]*/gi, '')
    if (!/^\/spaceindex\/my_track\.htm$/i.test(pathname)) {
      return { status: 'failed', code: 'TWO_BULU_LIST_URL_INVALID', message: '当前页面不是受支持的两步路用户轨迹列表页。' }
    }
    const seen = new Set()
    const items = []
    const warnings = []
    Array.from(document.querySelectorAll('a[href]')).forEach((anchor, index) => {
      const url = trackUrl(anchor.getAttribute('href'), currentUrl)
      if (!url || seen.has(url)) return
      seen.add(url)
      const nearby = cardText(anchor)
      const name = text(anchor.textContent).slice(0, 200) || `公开轨迹 ${index + 1}`
      items.push({
        url,
        name,
        pointCount: matchNumber(nearby, ['点位数', '点位数量', '点位', '点数'], '(?:个)?'),
        publishedAt: publishedAt(nearby),
        distanceKm: matchNumber(nearby, ['总里程', '轨迹里程', '里程', '距离'], '(?:km|公里|千米)?'),
        likeCount: matchNumber(nearby, ['点赞', '获赞', '喜欢'], '(?:次|个)?'),
        favoriteCount: matchNumber(nearby, ['收藏', '收藏数'], '(?:次|个)?'),
        position: items.length,
      })
    })
    if (!items.length) return { status: 'unsupported', code: 'TWO_BULU_LIST_DATA_NOT_RECOGNIZED', message: '页面已打开，但未识别到公开轨迹链接；请等待列表加载完成后重试。' }
    if (items.length > MAX_ITEMS) return { status: 'failed', code: 'TWO_BULU_BATCH_TOO_LARGE', message: `列表识别到 ${items.length} 条公开轨迹，单次最多处理 ${MAX_ITEMS} 条；请增加筛选条件后重试。`, detectedCount: items.length }
    const missing = new Set()
    items.forEach(item => ['pointCount', 'publishedAt', 'distanceKm', 'likeCount', 'favoriteCount'].forEach(key => { if (item[key] === null) missing.add(key) }))
    if (missing.size) warnings.push(`部分轨迹缺少公开统计字段：${[...missing].join('、')}`)
    return { status: 'success', sourceUrl: currentUrl, userName: userName(), items, detectedCount: items.length, warnings }
  }

  globalThis.MapServiceTwoBuluListExport = Object.freeze({ collect })
})()
