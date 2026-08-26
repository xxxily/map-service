#!/usr/bin/env node
/* Browser KML benchmark. Uses only Node 22 built-ins and Chrome's CDP. */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const assertMode = process.argv.includes('--assert')
const chromeBinary = process.env.CHROME_BINARY || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find(candidate => existsSync(candidate))
const port = 39000 + Math.floor(Math.random() * 500)
const vitePort = 41000 + Math.floor(Math.random() * 500)
let chrome
let vite
let profile

const benchCenter = { longitude: 111.283573, latitude: 22.270636, zoom: 15.5 }

function featureOrigin (index) {
  const column = index % 10
  const row = Math.floor(index / 10)
  return {
    longitude: benchCenter.longitude + (column - 4.5) * 0.00035,
    latitude: benchCenter.latitude + (row - 4.5) * 0.00035,
  }
}

const point = (id, index) => {
  const origin = featureOrigin(index)
  return { id, type: 'Point', name: `点位 ${id}`, description: '', coordinates: [origin.longitude, origin.latitude] }
}
const line = (id, index) => {
  const origin = featureOrigin(index)
  return {
    id,
    type: 'LineString',
    name: `线段 ${id}`,
    description: '',
    coordinates: Array.from({ length: 8 }, (_, vertex) => [
      origin.longitude + vertex * 0.00003,
      origin.latitude + Math.sin(vertex / 2) * 0.00005,
    ]),
  }
}
const polygon = (id, index) => {
  const origin = featureOrigin(index)
  return {
    id,
    type: 'Polygon',
    name: `区域 ${id}`,
    description: '',
    coordinates: [
      [origin.longitude, origin.latitude],
      [origin.longitude + 0.0002, origin.latitude],
      [origin.longitude + 0.0002, origin.latitude + 0.0002],
      [origin.longitude, origin.latitude + 0.0002],
    ],
  }
}

function localFiles () {
  return Array.from({ length: 100 }, (_, fileIndex) => ({
    id: `bench-file-${fileIndex}`, name: `基准 KML ${fileIndex + 1}`, theme: 'simple', enabled: true, contentLoaded: true,
    features: Array.from({ length: 100 }, (_, i) => i % 10 === 0 ? line(`f-${fileIndex}-${i}`, i) : i % 25 === 0 ? polygon(`f-${fileIndex}-${i}`, i) : point(`f-${fileIndex}-${i}`, i)),
  }))
}

function shareItems () {
  return Array.from({ length: 40 }, (_, i) => ({ shareItemId: `share-file-${i}`, name: `分享文件 ${i + 1}`, visibleByDefault: i < 8, enabled: i < 8, featureCount: 100 }))
}

async function waitFor (url, timeout = 15000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`服务启动超时: ${url}`)
}

class Cdp {
  constructor (wsUrl) { this.ws = new WebSocket(wsUrl); this.id = 0; this.pending = new Map(); this.listeners = new Map(); this.ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id) } else if (m.method) for (const fn of this.listeners.get(m.method) || []) fn(m.params || {}) } }
  async open () { await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject }) }
  call (method, params = {}) { return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, msg => msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result || {})); this.ws.send(JSON.stringify({ id, method, params })) }) }
  on (method, listener) { const list = this.listeners.get(method) || []; list.push(listener); this.listeners.set(method, list) }
  async eval (expression, awaitPromise = true) { const result = await this.call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || '浏览器脚本执行失败'); return result.result?.value }
  close () { this.ws.close() }
}

async function launch () {
  if (!chromeBinary) throw new Error('未找到 Chrome/Chromium；可通过 CHROME_BINARY 指定可执行文件')
  profile = await mkdtemp(join(tmpdir(), 'map-kml-browser-'))
  vite = spawn(join(root, 'node_modules/.bin/vite'), ['--host', '127.0.0.1', '--port', String(vitePort)], { cwd: root, stdio: 'ignore' })
  await waitFor(`http://127.0.0.1:${vitePort}/`)
  chrome = spawn(chromeBinary, [`--remote-debugging-port=${port}`, '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
  await waitFor(`http://127.0.0.1:${port}/json/version`)
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  const cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.open()
  await cdp.call('Page.enable')
  await cdp.call('Runtime.enable')
  return cdp
}

async function browserRun (cdp) {
  const files = localFiles(); const items = shareItems()
  const shareFeatures = Array.from({ length: 100 }, (_, i) => point(`share-point-${i}`, i % 20))
  const spatialAccess = { mode: 'unrestricted', status: 'ready' }
  const catalog = { code: 0, result: { spatialAccess, sources: [{ id: 'bench', tileUrl: '/api/v1/tiles/bench/{z}/{x}/{y}', tileSize: 256 }], layers: [{ id: 'bench', name: '基准底图', enabled: true, default: true, clients: ['2d'], items: [{ sourceId: 'bench' }] }] } }
  const bootstrap = `localStorage.setItem('map_kml_list', ${JSON.stringify(JSON.stringify(files))})`
  await cdp.call('Page.addScriptToEvaluateOnNewDocument', { source: bootstrap })
  let tileRequests = 0; let networkRequests = 0; let apiRequests = 0; let detailRequests = 0; let catalogRequests = 0
  const transparentPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3jz9WQAAAABJRU5ErkJggg=='
  const fulfillJson = (requestId, value) => cdp.call('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(value)).toString('base64') })
  cdp.on('Fetch.requestPaused', async event => {
    const url = event.request.url
    if (/\/public\/kml-shares\/bench-share\/files\//.test(url)) {
      detailRequests++; const id = url.split('/').pop(); await fulfillJson(event.requestId, { result: { id, shareItemId: id, name: id, features: shareFeatures } })
    } else if (/\/public\/kml-shares\/bench-share\/map\/catalog/.test(url) || /\/api\/v1\/map\/catalog/.test(url)) {
      catalogRequests++; await fulfillJson(event.requestId, catalog)
    } else if (/\/api\/v1\/public\/kml-shares\/bench-share(?:\?|$)/.test(url)) {
      await fulfillJson(event.requestId, { result: { publicId: 'bench-share', title: '基准分享', allowDownload: false, items, viewConfig: { kmlPointClustering: { enabled: true, gridSize: 64, minClusterPoints: 20 } }, spatialAccess } })
    } else if (/\/api\/v1\/access\/status(?:\?|$)/.test(url)) {
      await fulfillJson(event.requestId, { code: 0, result: { required: false }, error: null })
    } else if (/\/api\/v1\/auth\/config(?:\?|$)/.test(url)) {
      await fulfillJson(event.requestId, { code: 0, result: { analytics: {}, kml: { batchDownloadEnabled: false } }, error: null })
    } else if (/\/api\/v1\/auth\/session(?:\?|$)/.test(url)) {
      await fulfillJson(event.requestId, { code: 0, result: { authenticated: false }, error: null })
    } else if (/\/api\/v1\/kml\/shared(?:\?|$)/.test(url)) {
      await fulfillJson(event.requestId, { code: 0, result: [], error: null })
    } else if (/amap\.com|webapi\.amap/.test(url)) {
      await cdp.call('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 503, responseHeaders: [], body: '' }).catch(() => {})
    } else if (/\/api\/v1\/tiles\//.test(url)) {
      tileRequests += 1
      await new Promise(resolve => setTimeout(resolve, 250))
      await cdp.call('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: transparentPng }).catch(() => {})
    } else await cdp.call('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {})
  })
  cdp.on('Network.requestWillBeSent', event => {
    networkRequests++
    if (/\/api\//.test(event.request.url) && !/\/api\/v1\/tiles\//.test(event.request.url)) apiRequests++
  })
  await cdp.call('Network.enable'); await cdp.call('Performance.enable'); await cdp.call('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  let peakHeap = 0; const heapTimer = setInterval(async () => { try { peakHeap = Math.max(peakHeap, (await cdp.call('Runtime.getHeapUsage')).usedSize || 0) } catch {} }, 50)
  const localUrl = `http://127.0.0.1:${vitePort}/?coords=${encodeURIComponent(`${benchCenter.latitude},${benchCenter.longitude},${benchCenter.zoom},0`)}`
  await cdp.call('Page.navigate', { url: localUrl })
  const localReadiness = await cdp.eval(`new Promise((resolve,reject)=>{const end=performance.now()+20000;let listReadyMs=null;let mapReadyMs=null;let renderedKmlLayers=0;const check=()=>{const panel=document.getElementById('kml-panel');if(panel?.hidden)window.toggleKmlPanel?.();const fileCount=new Set([...document.querySelectorAll('[data-kml-id^="bench-file-"]')].map(e=>e.dataset.kmlId)).size;if(fileCount===100&&listReadyMs===null)listReadyMs=performance.now();renderedKmlLayers=0;window.map?.eachLayer?.(layer=>{if(String(layer?._mapServiceKmlFileId||'').startsWith('bench-file-'))renderedKmlLayers++});if(renderedKmlLayers>=10000&&mapReadyMs===null)mapReadyMs=performance.now();if(listReadyMs!==null&&mapReadyMs!==null)resolve({fileCount,listReadyMs,mapReadyMs,renderedKmlLayers});else if(performance.now()>end)reject(new Error('本地页面 readiness 超时：files='+fileCount+', layers='+renderedKmlLayers));else setTimeout(check,50)};check()})`)
  const leafletOptions = await cdp.eval(`({zoomAnimation:window.map?.options?.zoomAnimation,fadeAnimation:window.map?.options?.fadeAnimation,markerZoomAnimation:window.map?.options?.markerZoomAnimation})`)
  const zoom = await cdp.eval(`(async () => { const node=document.getElementById('map'); const summarize=frames=>{const sorted=[...frames].sort((a,b)=>a-b);const p95Index=Math.max(0,Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1));return {frameCount:sorted.length,p95FrameMs:sorted[p95Index]||0,maxFrameMs:sorted.length?Math.max(...sorted):0,longFrameCount:sorted.filter(value=>value>50).length}};const sample=async action=>{const frames=[];let last=performance.now(),running=true;const tick=now=>{frames.push(now-last);last=now;if(running)requestAnimationFrame(tick)};requestAnimationFrame(tick);const started=performance.now();await action();running=false;return {...summarize(frames),durationMs:performance.now()-started}};const continuous=await sample(async()=>{for(let index=0;index<20;index++){node.dispatchEvent(new WheelEvent('wheel',{deltaY:index%2?160:-160,bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,35))}await new Promise(resolve=>setTimeout(resolve,450))});const rapidCrossLevel=await sample(async()=>{for(let index=0;index<8;index++)node.dispatchEvent(new WheelEvent('wheel',{deltaY:-900,bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,850))});return {continuous,rapidCrossLevel,startZoom:${benchCenter.zoom},endZoom:window.map?.getZoom?.()??null} })()`)
  const localRequestTotals = { networkRequests, apiRequests, catalogRequests, detailRequests, tileRequests }
  await cdp.call('Page.navigate', { url: `http://127.0.0.1:${vitePort}/share/bench-share` })
  const shareReadiness = await cdp.eval(`new Promise((resolve,reject)=>{const end=performance.now()+15000;const check=()=>{const count=document.querySelectorAll('[data-share-kml-action="toggle-visible"]').length;if(count===40)resolve({firstReadyMs:performance.now(),cards:count});else if(performance.now()>end)reject(new Error(document.body.innerText.slice(0,200)));else setTimeout(check,50)};check()})`)
  const initialDetailRequests = detailRequests
  const expandedDetailStart = detailRequests
  const expanded = await cdp.eval(`(async () => { document.querySelector('[data-share-kml-action="toggle-collapse"][data-kml-id="share-file-39"]')?.click();await new Promise(resolve=>setTimeout(resolve,350));const card=document.querySelector('[data-share-kml-action="toggle-collapse"][data-kml-id="share-file-39"]')?.closest('.kml-file-card');return {featureRows:card?.querySelectorAll('.kml-feature-item').length||0,stillHidden:Boolean(card?.classList.contains('is-disabled'))} })()`)
  const expandedDetailRequests = detailRequests
  const displayed = await cdp.eval(`(async () => { const button=document.querySelector('[data-share-kml-action="toggle-visible"][data-kml-id="share-file-38"]');button?.click();await new Promise(resolve=>setTimeout(resolve,350));const card=document.querySelector('[data-share-kml-action="toggle-visible"][data-kml-id="share-file-38"]')?.closest('.kml-file-card');return {loadedAndVisible:Boolean(card&&!card.classList.contains('is-disabled'))} })()`)
  const finalHeap = (await cdp.call('Runtime.getHeapUsage')).usedSize || 0
  peakHeap = Math.max(peakHeap, finalHeap)
  clearInterval(heapTimer)
  const browserVersion = await cdp.call('Browser.getVersion')
  return {
    generatedAt: new Date().toISOString(),
    browser: browserVersion.product || chromeBinary,
    local: {
      fileCount: localReadiness.fileCount,
      featureCount: 10000,
      listReadyMs: Number(localReadiness.listReadyMs.toFixed(2)),
      firstMapRenderMs: Number(localReadiness.mapReadyMs.toFixed(2)),
      firstRenderedKmlLayers: localReadiness.renderedKmlLayers,
      leafletOptions,
      requests: localRequestTotals,
    },
    zoom: { ...zoom, slowTileDelayMs: 250 },
    share: {
      cards: shareReadiness.cards,
      firstReadyMs: Number(shareReadiness.firstReadyMs.toFixed(2)),
      clusterMarkers: await cdp.eval(`document.querySelectorAll('.kml-point-cluster-icon').length`),
      unavailable: await cdp.eval(`document.body.classList.contains('share-unavailable')`),
      initialDetailRequests,
      detailRequestsAfterHiddenExpand: expandedDetailRequests,
      detailRequestsAfterHiddenDisplay: detailRequests,
      hiddenExpandAddedRequests: expandedDetailRequests - expandedDetailStart,
      hiddenExpandedFeatureRows: expanded.featureRows,
      hiddenExpandedRemainedHidden: expanded.stillHidden,
      hiddenDisplayLoadedAndVisible: displayed.loadedAndVisible,
    },
    totals: { peakJsHeapBytes: peakHeap, networkRequests, apiRequests, catalogRequests, detailRequests, tileRequests },
  }
}

async function cleanup () { try { chrome?.kill('SIGTERM'); vite?.kill('SIGTERM'); await rm(profile, { recursive: true, force: true }) } catch {} }

try {
  const cdp = await launch(); const result = await browserRun(cdp); cdp.close()
  if (assertMode) {
    const failures = []
    if (result.local.fileCount !== 100) failures.push(`管理列表文件数 ${result.local.fileCount}`)
    if (result.local.firstRenderedKmlLayers < 10000) failures.push(`首次地图 KML 图层数 ${result.local.firstRenderedKmlLayers}`)
    if (!result.local.leafletOptions.zoomAnimation || !result.local.leafletOptions.fadeAnimation || !result.local.leafletOptions.markerZoomAnimation) failures.push('Leaflet 连续缩放动画配置被关闭')
    if (result.share.cards !== 40) failures.push(`分享列表文件数 ${result.share.cards}`)
    if (result.share.initialDetailRequests !== 8) failures.push(`分享首屏详情请求 ${result.share.initialDetailRequests}`)
    if (result.share.detailRequestsAfterHiddenExpand !== 9) failures.push(`隐藏文件展开后详情请求 ${result.share.detailRequestsAfterHiddenExpand}`)
    if (result.share.detailRequestsAfterHiddenDisplay !== 10) failures.push(`隐藏文件显示后详情请求 ${result.share.detailRequestsAfterHiddenDisplay}`)
    if (result.share.hiddenExpandedFeatureRows !== 100 || !result.share.hiddenExpandedRemainedHidden) failures.push('隐藏分享文件展开加载状态不正确')
    if (!result.share.hiddenDisplayLoadedAndVisible) failures.push('隐藏分享文件显示后未进入已加载状态')
    if (result.share.clusterMarkers < 1) failures.push('分享点位未生成聚合标记')
    if (result.zoom.continuous.p95FrameMs > 750) failures.push(`连续缩放 p95 帧耗时 ${result.zoom.continuous.p95FrameMs}ms`)
    if (result.zoom.rapidCrossLevel.p95FrameMs > 750) failures.push(`快速跨级缩放 p95 帧耗时 ${result.zoom.rapidCrossLevel.p95FrameMs}ms`)
    if (result.totals.peakJsHeapBytes > 900 * 1024 * 1024) failures.push(`JS heap 峰值 ${result.totals.peakJsHeapBytes}`)
    if (failures.length) throw new Error(`浏览器 KML 基准未通过：${failures.join('；')}`)
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} catch (error) { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1 } finally { await cleanup() }
