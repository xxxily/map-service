import { escapeHtml } from '../utils.js'

const DEFAULT_CACHE_TTL_MS = 21600000
const DEFAULT_STALE_TTL_MS = 2592000000
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const SCALE_REQUEST_PIXELS = {
  1: 256,
  2: 512,
  3: 768,
}

function getResultError (result) {
  return result?.errorMessage || result?.error || ''
}

function getPublishTargetLabel (targetType) {
  if (targetType === 'layer') return '组合图层'
  if (targetType === 'dedicated_source') return '专用图源'
  return '系统图源'
}

function getSourceVisibilityLabel (source) {
  return source.visibility?.scope === 'external_only' ? '专用发布' : '系统图源'
}

function renderPublishExample (activePublish, state) {
  const origin = window.location.origin
  const pathSlug = activePublish.pathSlug
  const tokenParam = activePublish.auth?.mode === 'token' ? '?token=您的TOKEN' : ''
  const tileJsonUrl = `${origin}/api/v1/external/${pathSlug}/tilejson${tokenParam}`

  if (activePublish.targetType === 'layer') {
    const layer = (state.mapLayers || []).find(item => item.id === activePublish.targetId)
    const sourceUrls = (layer?.items || []).map((item) => ({
      ...item,
      url: `${origin}/api/v1/external/${pathSlug}/sources/${item.sourceId}/{z}/{x}/{y}${tokenParam}`,
    }))
    const leafletSnippet = sourceUrls.length
      ? sourceUrls.map((item) => `L.tileLayer('${item.url}', {
  minZoom: ${layer?.minZoom ?? 3},
  maxZoom: ${layer?.maxZoom ?? 18},
  opacity: ${item.opacity ?? 1},
  attribution: '私有地图服务中心'
}).addTo(map);`).join('\n\n')
      : '// 当前组合图层没有可用图源'

    return `
      <div class="form-card" style="margin-top:25px; background:white;">
        <h4>对外接入 URL 示例 : <strong>${escapeHtml(activePublish.name)}</strong></h4>
        <div style="margin-top:10px; font-size:12px;">
          <div><strong>TileJSON 契约接口 URL:</strong></div>
          <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${escapeHtml(tileJsonUrl)}</code>
          <div style="margin-top:10px;"><strong>组合图层图源瓦片地址:</strong></div>
          ${sourceUrls.map(item => `<code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${escapeHtml(item.url)}</code>`).join('') || '<p style="color:#64748b;">暂无可用图源地址</p>'}
        </div>

        <div style="margin-top:20px;">
          <strong>Leaflet 加载接入示例:</strong>
          <div class="api-example">${escapeHtml(leafletSnippet)}</div>
        </div>
      </div>
    `
  }

  const tileUrlTemplate = `${origin}/api/v1/external/${pathSlug}/{z}/{x}/{y}${tokenParam}`
  return `
    <div class="form-card" style="margin-top:25px; background:white;">
      <h4>对外接入 URL 示例 : <strong>${escapeHtml(activePublish.name)}</strong></h4>
      <div style="margin-top:10px; font-size:12px;">
        <div><strong>TileJSON 契约接口 URL:</strong></div>
        <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${escapeHtml(tileJsonUrl)}</code>
        
        <div style="margin-top:10px;"><strong>标准 XYZ 瓦片服务地址:</strong></div>
        <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${escapeHtml(tileUrlTemplate)}</code>
      </div>

      <div style="margin-top:20px;">
        <strong>Leaflet 加载接入示例:</strong>
        <div class="api-example">L.tileLayer('${escapeHtml(tileUrlTemplate)}', {
  minZoom: 3,
  maxZoom: 18,
  attribution: '私有地图服务中心'
}).addTo(map);</div>
      </div>

      <div style="margin-top:15px;">
        <strong>QGIS 接入说明:</strong>
        <div style="font-size:12px; color:#475569; margin-top:4px;">
          在 QGIS 的 Browser 面板中右键选择 <strong>XYZ Tiles</strong> -> <strong>New Connection</strong>，填入名称并将瓦片地址设置为上方“XYZ瓦片服务地址”即可。
        </div>
      </div>
    </div>
  `
}

function renderProxyPolicyFields (policy = {}, outbounds = [], pools = [], prefix = 'proxy') {
  const mode = ['fixed', 'pool'].includes(policy.mode) ? policy.mode : 'never'
  return `
    <div class="form-grid">
      <div class="field-group">
        <label>代理模式</label>
        <select name="${prefix}_mode" data-proxy-mode-select>
          <option value="never" ${mode === 'never' ? 'selected' : ''}>始终直连</option>
          <option value="fixed" ${mode === 'fixed' ? 'selected' : ''}>固定代理出口</option>
          <option value="pool" ${mode === 'pool' ? 'selected' : ''}>代理出口池</option>
        </select>
      </div>
      <div class="field-group" data-proxy-outbound-field style="display: ${mode === 'fixed' ? 'flex' : 'none'};">
        <label>关联代理出口</label>
        <select name="${prefix}_outboundId">
          <option value="">请选择出口</option>
          ${outbounds.map(o => `<option value="${o.id}" ${policy.outboundId === o.id ? 'selected' : ''}>${escapeHtml(o.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field-group" data-proxy-pool-field style="display: ${mode === 'pool' ? 'flex' : 'none'};">
        <label>关联代理池</label>
        <select name="${prefix}_poolId">
          <option value="">请选择代理池</option>
          ${pools.map(p => `<option value="${p.id}" ${policy.poolId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="checkbox-group">
      <input type="checkbox" id="${prefix}_fallback" name="${prefix}_fallbackToDirect" ${policy.fallbackToDirect ? 'checked' : ''}>
      <label for="${prefix}_fallback">代理连接失败时允许直连</label>
    </div>
  `
}

function decomposeDurationMs (value, defaultValue) {
  const totalMs = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : defaultValue
  const days = Math.floor(totalMs / DAY_MS)
  const hours = Math.floor((totalMs % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((totalMs % HOUR_MS) / MINUTE_MS)
  return { days, hours, minutes }
}

function renderDurationInputs (name, label, value, defaultValue) {
  const duration = decomposeDurationMs(value, defaultValue)
  return `
    <div class="field-group">
      <label>${label}</label>
      <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:8px;">
        <input name="${name}_days" type="number" min="0" max="365" value="${duration.days}" aria-label="${label}天数">
        <input name="${name}_hours" type="number" min="0" max="23" value="${duration.hours}" aria-label="${label}小时数">
        <input name="${name}_minutes" type="number" min="0" max="59" value="${duration.minutes}" aria-label="${label}分钟数">
      </div>
      <small style="color:#64748b;">天 / 小时 / 分钟</small>
    </div>
  `
}

function renderCachePolicyFields (cache = {}, prefix = 'cache') {
  return `
    <div class="checkbox-group">
      <input type="checkbox" id="${prefix}_enabled" name="${prefix}_enabled" ${cache.enabled !== false ? 'checked' : ''}>
      <label for="${prefix}_enabled">启用服务端缓存</label>
    </div>
    <div class="form-grid" style="margin-top:10px;">
      ${renderDurationInputs(`${prefix}_ttl`, '缓存有效时间', cache.ttlMs, DEFAULT_CACHE_TTL_MS)}
      ${renderDurationInputs(`${prefix}_staleTtl`, '软过期时间', cache.staleTtlMs, DEFAULT_STALE_TTL_MS)}
    </div>
  `
}

function collectProxyPolicy (form, formData, prefix = 'proxy') {
  return {
    mode: formData.get(`${prefix}_mode`) || 'never',
    outboundId: formData.get(`${prefix}_outboundId`) || '',
    poolId: formData.get(`${prefix}_poolId`) || '',
    fallbackToDirect: Boolean(form.elements[`${prefix}_fallbackToDirect`]?.checked),
  }
}

function durationInputToMs (formData, prefix) {
  const days = Math.max(0, parseInt(formData.get(`${prefix}_days`) || '0', 10) || 0)
  const hours = Math.max(0, parseInt(formData.get(`${prefix}_hours`) || '0', 10) || 0)
  const minutes = Math.max(0, parseInt(formData.get(`${prefix}_minutes`) || '0', 10) || 0)
  return days * DAY_MS + hours * HOUR_MS + minutes * MINUTE_MS
}

function collectCachePolicy (form, formData, prefix = 'cache') {
  return {
    enabled: Boolean(form.elements[`${prefix}_enabled`]?.checked),
    ttlMs: durationInputToMs(formData, `${prefix}_ttl`),
    staleTtlMs: durationInputToMs(formData, `${prefix}_staleTtl`),
  }
}

function getScaleFromSource (source = {}) {
  const fixedScale = Number(source.retina?.normalValue)
  if (SCALE_REQUEST_PIXELS[fixedScale]) return String(fixedScale)
  return '1'
}

function renderStatusToggleButton (enabled, action, id, activeLabel, inactiveLabel) {
  const nextLabel = enabled ? inactiveLabel : activeLabel
  return `
    <button
      type="button"
      class="status-toggle ${enabled ? 'is-enabled' : 'is-disabled'}"
      data-tile-sources-toggle-${action}="${escapeHtml(id)}"
      title="点击切换为${escapeHtml(nextLabel)}"
    >${escapeHtml(enabled ? activeLabel : inactiveLabel)}</button>
  `
}

async function reloadCatalogRelatedState (state, api, options = {}) {
  const {
    tileSources = false,
    mapLayers = false,
    externalPublishes = false,
    precacheCatalog = true,
  } = options
  const requests = []
  const setters = []

  if (tileSources) {
    requests.push(api.listTileSources())
    setters.push(result => { state.tileSources = result })
  }
  if (mapLayers) {
    requests.push(api.listMapLayers())
    setters.push(result => { state.mapLayers = result })
  }
  if (externalPublishes) {
    requests.push(api.listExternalPublishes())
    setters.push(result => { state.externalPublishes = result })
  }
  if (precacheCatalog) {
    requests.push(api.precacheCatalog())
    setters.push(result => { state.precacheCatalog = result })
  }

  const results = await Promise.all(requests)
  results.forEach((result, index) => setters[index](result))
}

// 本地组件私有状态（当重新加载页面时通过 dashboard.js 的 loadDashboard 重置）
export function renderTileSourcesPage (state) {
  state.tileSourcesSubTab = state.tileSourcesSubTab || 'sources'

  const subTabs = [
    { id: 'sources', label: '图源' },
    { id: 'layers', label: '图层组合' },
    { id: 'publishes', label: '发布/API' },
    { id: 'diagnostics', label: '诊断日志' }
  ]

  let content = ''
  switch (state.tileSourcesSubTab) {
    case 'sources':
      content = renderSourcesView(state)
      break
    case 'layers':
      content = renderLayersView(state)
      break
    case 'publishes':
      content = renderPublishesView(state)
      break
    case 'diagnostics':
      content = renderDiagnosticsView(state)
      break
    default:
      content = '<p>未知子页面</p>'
  }

  return `
    <section class="admin-panel tile-sources-panel">


      <div class="subtab-header" role="tablist">
        ${subTabs.map(tab => `
          <button class="subtab-btn ${state.tileSourcesSubTab === tab.id ? 'is-active' : ''}" 
                  type="button" role="tab" 
                  data-tile-sources-tab="${tab.id}">
            ${escapeHtml(tab.label)}
          </button>
        `).join('')}
      </div>

      <div class="subtab-content">
        ${content}
      </div>
    </section>
  `
}

// ----------------- 子视图渲染函数 -----------------

// 1. 图源视图
function renderSourcesView (state) {
  const sources = state.tileSources || []
  const editing = state.editingTileSource

  if (editing) {
    const isNew = !sources.some(s => s.id === editing.id)
    const outbounds = state.proxyOutbounds || []
    const pools = state.proxyPools || []
    const tileScale = getScaleFromSource(editing)
    return `
      <div class="form-card">
        <h3>${isNew ? '新增图源' : `编辑图源: ${escapeHtml(editing.id)}`}</h3>
        <form data-tile-sources-form="source">
          <input type="hidden" name="isNew" value="${isNew}">
          <div class="form-grid">
            <div class="field-group">
              <label>图源唯一 ID</label>
              <input name="id" value="${escapeHtml(editing.id || '')}" required ${!isNew ? 'readonly' : ''} placeholder="例如: custom-satellite">
            </div>
            <div class="field-group">
              <label>图源名称</label>
              <input name="name" value="${escapeHtml(editing.name || '')}" required placeholder="例如: 自定义卫星">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>地图提供商</label>
              <input name="vendor" value="${escapeHtml(editing.vendor || '')}" required placeholder="例如: amap, google, custom">
            </div>
            <div class="field-group">
              <label>图源分类</label>
              <select name="category">
                <option value="satellite" ${editing.category === 'satellite' ? 'selected' : ''}>卫星</option>
                <option value="road" ${editing.category === 'road' ? 'selected' : ''}>街道/道路</option>
                <option value="other" ${editing.category === 'other' ? 'selected' : ''}>其他</option>
              </select>
            </div>
          </div>
          <div class="form-grid single">
            <div class="field-group">
              <label>上游 URL 模板</label>
              <input name="template" value="${escapeHtml(editing.template || '')}" required placeholder="https://example.com/{z}/{x}/{y}.png">
              <small style="color: #64748b;">支持占位符: {s}, {x}, {y}, {z}, {scale}, {yTms}</small>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>缩放范围 (最小 - 最大)</label>
              <div style="display:flex; gap:10px; align-items:center;">
                <input name="minZoom" type="number" value="${editing.minZoom ?? 3}" min="0" max="22" style="flex:1;">
                <span>至</span>
                <input name="maxZoom" type="number" value="${editing.maxZoom ?? 18}" min="0" max="22" style="flex:1;">
              </div>
            </div>
            <div class="field-group">
              <label>最大原生缩放</label>
              <input name="maxNativeZoom" type="number" value="${editing.maxNativeZoom ?? 18}" min="0" max="22">
            </div>
          </div>
          
          <div class="form-grid">
            <div class="field-group">
              <label>子域名组 (半角逗号分隔)</label>
              <input name="subdomains" value="${escapeHtml((editing.subdomains || []).join(','))}" placeholder="例如: 1,2,3,4">
            </div>
            <div class="field-group">
              <label>瓦片倍率</label>
              <select name="tileScale">
                <option value="1" ${tileScale === '1' ? 'selected' : ''}>1x（256px）</option>
                <option value="2" ${tileScale === '2' ? 'selected' : ''}>2x（请求 512px，网格 256px）</option>
                <option value="3" ${tileScale === '3' ? 'selected' : ''}>3x（请求 768px，网格 256px）</option>
              </select>
            </div>
          </div>

          <div class="form-grid">
            <div class="field-group">
              <label>版权声明</label>
              <input name="attribution" value="${escapeHtml(editing.attribution || '')}">
            </div>
            <div class="field-group">
              <label>描述</label>
              <textarea name="description" rows="2">${escapeHtml(editing.description || '')}</textarea>
            </div>
          </div>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">缓存策略</legend>
            ${renderCachePolicyFields(editing.cache, 'cache')}
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">代理策略</legend>
            ${renderProxyPolicyFields(editing.proxy, outbounds, pools, 'proxy')}
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">权限控制</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="perm_front" name="perm_frontendVisible" ${editing.permissions?.frontendVisible !== false ? 'checked' : ''}>
              <label for="perm_front">允许前台底图选择器显示</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="perm_precache" name="perm_precacheAllowed" ${editing.permissions?.precacheAllowed !== false ? 'checked' : ''}>
              <label for="perm_precache">允许创建预缓存任务</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="perm_external" name="perm_externalApiAllowed" ${editing.permissions?.externalApiAllowed !== false ? 'checked' : ''}>
              <label for="perm_external">允许作为外部 API 发布公开项</label>
            </div>
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">使用范围</legend>
            <div class="field-group">
              <label>图源范围</label>
              <select name="visibility_scope">
                <option value="system" ${editing.visibility?.scope !== 'external_only' ? 'selected' : ''}>系统图源</option>
                <option value="external_only" ${editing.visibility?.scope === 'external_only' ? 'selected' : ''}>仅对外 API 专用</option>
              </select>
            </div>
          </fieldset>

          <div class="checkbox-group" style="margin-top:20px;">
            <input type="checkbox" id="source_enabled" name="enabled" ${editing.enabled !== false ? 'checked' : ''}>
            <label for="source_enabled" style="font-weight:600; color:#1e293b;">启用该图源</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存配置</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="source">取消</button>
          </div>
        </form>
      </div>
    `
  }

  return `
    <div class="admin-panel-head">
      <h3>系统图源列表</h3>
      <button type="button" data-tile-sources-add="source">+ 新建图源</button>
    </div>
    
    <table class="item-table">
      <thead>
        <tr>
          <th>ID / 图源名称</th>
          <th>厂商 / 类型</th>
          <th>缩放级</th>
          <th>缓存状态</th>
          <th>代理策略</th>
          <th>前台可见</th>
          <th>状态</th>
          <th>测试诊断</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${sources.map(source => {
          const testState = state[`test_source_${source.id}`] || ''
          return `
            <tr>
              <td>
                <strong>${escapeHtml(source.name)}</strong>
                <div style="color: #64748b; font-size:11px; margin-top:2px;">${escapeHtml(source.id)}</div>
              </td>
              <td>
                <span class="badge-gray">${escapeHtml(source.vendor)}</span>
                <span class="badge-gray" style="margin-left:4px;">${escapeHtml(source.category)}</span>
                <span class="badge-gray" style="margin-left:4px;">${escapeHtml(getSourceVisibilityLabel(source))}</span>
              </td>
              <td>${source.minZoom}-${source.maxZoom}</td>
              <td>
                ${source.cache?.enabled !== false 
                  ? '<span class="badge-green">启用</span>' 
                  : '<span class="badge-gray">绕过</span>'}
              </td>
              <td>
                ${source.proxy?.mode === 'never' ? '<span class="badge-gray">直连</span>' : ''}
                ${source.proxy?.mode === 'fixed' ? `<span class="badge-blue" title="出口: ${escapeHtml(source.proxy.outboundId)}">固定出口</span>` : ''}
                ${source.proxy?.mode === 'pool' ? `<span class="badge-blue" title="池: ${escapeHtml(source.proxy.poolId)}">代理池</span>` : ''}
              </td>
              <td>
                ${source.permissions?.frontendVisible !== false 
                  ? '<span class="badge-green">可见</span>' 
                  : '<span class="badge-red">隐藏</span>'}
              </td>
              <td>
                ${renderStatusToggleButton(source.enabled, 'source', source.id, '启用中', '已禁用')}
              </td>
              <td>
                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                  <button type="button" class="btn-link" data-tile-sources-test-source="${source.id}">测试</button>
                  ${testState === 'loading' ? '<span class="test-status test-loading" style="margin-left: 0;">测试中...</span>' : ''}
                  ${testState && testState !== 'loading' && testState.success ? `<span class="test-status test-success" style="margin-left: 0;">通过 (${testState.duration}ms)</span>` : ''}
                  ${testState && testState !== 'loading' && !testState.success ? `<span class="test-status test-fail" style="margin-left: 0;" title="${escapeHtml(getResultError(testState))}">失败</span>` : ''}
                </div>
              </td>
              <td>
                <div class="flex-actions">
                  <button type="button" class="btn-link" data-tile-sources-edit-source="${source.id}">编辑</button>
                  <button type="button" class="btn-link btn-danger-link" data-tile-sources-delete-source="${source.id}">删除</button>
                </div>
              </td>
            </tr>
          `
        }).join('') || '<tr><td colspan="9" style="text-align:center;">暂无图源配置</td></tr>'}
      </tbody>
    </table>
  `
}

// 2. 图层视图
function renderLayersView (state) {
  const layers = state.mapLayers || []
  const editing = state.editingMapLayer

  if (editing) {
    const isNew = !layers.some(l => l.id === editing.id)
    const sources = state.tileSources || []
    const layerItems = editing.items || [{ sourceId: '', opacity: 1, zIndex: 0 }]
    
    return `
      <div class="form-card">
        <h3>${isNew ? '创建组合图层' : `编辑组合图层: ${escapeHtml(editing.id)}`}</h3>
        <form data-tile-sources-form="layer">
          <input type="hidden" name="isNew" value="${isNew}">
          <div class="form-grid">
            <div class="field-group">
              <label>图层唯一 ID</label>
              <input name="id" value="${escapeHtml(editing.id || '')}" required ${!isNew ? 'readonly' : ''} placeholder="例如: hybrid-sat">
            </div>
            <div class="field-group">
              <label>图层显示名称</label>
              <input name="name" value="${escapeHtml(editing.name || '')}" required placeholder="例如: 高德/卫星">
            </div>
          </div>
          
          <div class="form-grid">
            <div class="field-group">
              <label>图层展示类型</label>
              <select name="type">
                <option value="base" ${editing.type === 'base' ? 'selected' : ''}>底图图层</option>
                <option value="overlay" ${editing.type === 'overlay' ? 'selected' : ''}>叠加图层</option>
              </select>
            </div>
            <div class="field-group">
              <label>图层排序权重</label>
              <input name="sortOrder" type="number" value="${editing.sortOrder ?? 10}">
            </div>
          </div>

          <div class="form-grid">
            <div class="field-group">
              <label>缩放范围 (最小 - 最大)</label>
              <div style="display:flex; gap:10px; align-items:center;">
                <input name="minZoom" type="number" value="${editing.minZoom ?? 3}" min="0" max="22" style="flex:1;">
                <span>至</span>
                <input name="maxZoom" type="number" value="${editing.maxZoom ?? 18}" min="0" max="22" style="flex:1;">
              </div>
            </div>
            <div class="field-group">
              <label>适用客户端</label>
              <div style="display:flex; gap:20px; align-items:center; margin-top:10px;">
                <label style="display:inline-flex; align-items:center; gap:6px; font-weight:normal;">
                  <input type="checkbox" name="client_2d" value="2d" ${(editing.clients || ['2d', '3d']).includes('2d') ? 'checked' : ''}> 2D 地图
                </label>
                <label style="display:inline-flex; align-items:center; gap:6px; font-weight:normal;">
                  <input type="checkbox" name="client_3d" value="3d" ${(editing.clients || ['2d', '3d']).includes('3d') ? 'checked' : ''}> 3D 地图
                </label>
              </div>
            </div>
          </div>

          <div class="form-grid single">
            <div class="field-group">
              <label>图层描述</label>
              <input name="description" value="${escapeHtml(editing.description || '')}" placeholder="可描述图层构成">
            </div>
          </div>

          <div class="field-group" style="margin-top:15px;">
            <label style="font-weight:600; display:flex; justify-content:space-between; align-items:center;">
              <span>包含图源组合 (从下往上叠加)</span>
              <button type="button" class="btn-link" data-tile-sources-add-layer-item>+ 添加图源</button>
            </label>
            <div class="layer-items-list" data-tile-sources-items-container>
              ${layerItems.map((item, index) => `
                <div class="layer-item-row" data-layer-item-index="${index}">
                  <span style="font-weight:bold; color:#64748b; font-size:11px; width:20px;">#${index + 1}</span>
                  <select name="item_sourceId" required>
                    <option value="">请选择系统图源</option>
                    ${sources.map(s => `<option value="${s.id}" ${item.sourceId === s.id ? 'selected' : ''}>${escapeHtml(s.name)} (${s.id})</option>`).join('')}
                  </select>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <span style="font-size:12px; color:#475569;">不透明度:</span>
                    <input name="item_opacity" type="number" step="0.1" min="0" max="1" value="${item.opacity ?? 1}" style="width:60px;">
                  </div>
                  <div class="flex-actions" style="margin-left:auto;">
                    <button type="button" class="btn-link" data-tile-sources-move-up="${index}">↑</button>
                    <button type="button" class="btn-link" data-tile-sources-move-down="${index}">↓</button>
                    <button type="button" class="btn-link btn-danger-link" data-tile-sources-remove-layer-item="${index}">移除</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="checkbox-group" style="margin-top:15px;">
            <input type="checkbox" id="layer_visible" name="frontendVisible" ${editing.frontendVisible !== false ? 'checked' : ''}>
            <label for="layer_visible">前台地图可见 (可见性)</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="layer_enabled" name="enabled" ${editing.enabled !== false ? 'checked' : ''}>
            <label for="layer_enabled" style="font-weight:600;">启用该图层组合</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存配置</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="layer">取消</button>
          </div>
        </form>
      </div>
    `
  }

  return `
    <div class="admin-panel-head">
      <h3>组合图层配置</h3>
      <button type="button" data-tile-sources-add="layer">+ 新增图层配置</button>
    </div>
    
    <table class="item-table">
      <thead>
        <tr>
          <th>ID / 图层名称</th>
          <th>图层类型</th>
          <th>包含子图源 (透明度)</th>
          <th>缩放级</th>
          <th>客户端</th>
          <th>状态</th>
          <th>默认底图</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${layers.map(layer => `
          <tr>
            <td>
              <strong>${escapeHtml(layer.name)}</strong>
              <div style="color: #64748b; font-size:11px; margin-top:2px;">${escapeHtml(layer.id)}</div>
            </td>
            <td>
              <span class="badge-gray">${layer.type === 'base' ? '基础底图' : '叠加图层'}</span>
            </td>
            <td>
              <div style="display:flex; flex-direction:column; gap:4px;">
                ${(layer.items || []).map((item, idx) => {
                  const source = (state.tileSources || []).find(s => s.id === item.sourceId)
                  const name = source ? source.name : item.sourceId
                  return `<div style="font-size:12px;">#${idx+1} ${escapeHtml(name)} (${item.opacity ?? 1})</div>`
                }).join('')}
              </div>
            </td>
            <td>${layer.minZoom}-${layer.maxZoom}</td>
            <td>
              ${(layer.clients || []).map(c => `<span class="badge-blue">${c.toUpperCase()}</span>`).join(' ')}
            </td>
            <td>
              ${renderStatusToggleButton(layer.enabled, 'layer', layer.id, '启用中', '已禁用')}
            </td>
            <td>
              ${layer.default 
                ? '<span class="badge-green" style="font-weight:bold;">默认</span>' 
                : `<button type="button" class="btn-link" data-tile-sources-set-default="${layer.id}">设为默认</button>`}
            </td>
            <td>
              <div class="flex-actions">
                <button type="button" class="btn-link" data-tile-sources-edit-layer="${layer.id}">编辑</button>
                <button type="button" class="btn-link btn-danger-link" data-tile-sources-delete-layer="${layer.id}">删除</button>
              </div>
            </td>
          </tr>
        `).join('') || '<tr><td colspan="8" style="text-align:center;">暂无图层配置</td></tr>'}
      </tbody>
    </table>
  `
}


// 4. 对外发布/API 视图
function renderPublishesView (state) {
  const publishes = state.externalPublishes || []
  const editing = state.editingExternalPublish
  const selectedPublishId = state.selectedPublishId || (publishes[0]?.id || '')

  if (editing) {
    const isNew = !publishes.some(p => p.id === editing.id)
    const sources = state.tileSources || []
    const systemSources = sources.filter(s => s.visibility?.scope !== 'external_only' && s.permissions?.externalApiAllowed !== false)
    const dedicatedSources = sources.filter(s => s.visibility?.scope === 'external_only')
    const layers = state.mapLayers || []
    const outbounds = state.proxyOutbounds || []
    const pools = state.proxyPools || []
    const targetType = editing.targetType || 'source'
    const targetOptions = targetType === 'layer'
      ? layers.map(l => `<option value="${l.id}" ${editing.targetId === l.id ? 'selected' : ''}>${escapeHtml(l.name)} (${l.id})</option>`).join('')
      : targetType === 'dedicated_source'
        ? dedicatedSources.map(s => `<option value="${s.id}" ${editing.targetId === s.id ? 'selected' : ''}>${escapeHtml(s.name)} (${s.id})</option>`).join('')
        : systemSources.map(s => `<option value="${s.id}" ${editing.targetId === s.id ? 'selected' : ''}>${escapeHtml(s.name)} (${s.id})</option>`).join('')
    const proxyOverride = editing.overrides?.proxy || null
    const cacheOverride = editing.overrides?.cache || null
    return `
      <div class="form-card">
        <h3>${isNew ? '创建公开对外发布项' : `编辑发布项: ${escapeHtml(editing.id)}`}</h3>
        <form data-tile-sources-form="publish">
          <input type="hidden" name="isNew" value="${isNew}">
          <div class="form-grid">
            <div class="field-group">
              <label>发布项 ID</label>
              <input name="id" value="${escapeHtml(editing.id || '')}" required ${!isNew ? 'readonly' : ''} placeholder="例如: amap-sat-public">
            </div>
            <div class="field-group">
              <label>发布项名称</label>
              <input name="name" value="${escapeHtml(editing.name || '')}" required placeholder="例如: 高德卫星图源对外公开服务">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>发布对象类型</label>
              <select name="targetType" data-publish-target-type>
                <option value="source" ${targetType === 'source' ? 'selected' : ''}>发布系统图源</option>
                <option value="dedicated_source" ${targetType === 'dedicated_source' ? 'selected' : ''}>发布专用图源</option>
                <option value="layer" ${targetType === 'layer' ? 'selected' : ''}>发布组合图层</option>
              </select>
            </div>
            <div class="field-group">
              <label>选择关联对象</label>
              <select name="targetId" required>
                <option value="">请选择${escapeHtml(getPublishTargetLabel(targetType))}</option>
                ${targetOptions}
              </select>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>访问路径标识</label>
              <input name="pathSlug" value="${escapeHtml(editing.pathSlug || '')}" required placeholder="例如: satellite-api">
            </div>
            <div class="field-group">
              <label>Token 鉴权模式</label>
              <select name="auth_mode">
                <option value="none" ${editing.auth?.mode === 'none' ? 'selected' : ''}>公开无限制</option>
                <option value="token" ${editing.auth?.mode === 'token' ? 'selected' : ''}>需要验证鉴权</option>
              </select>
            </div>
          </div>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">流控限制 & 日志限制</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="pub_ratelimit" name="rateLimit_enabled" ${editing.rateLimit?.enabled ? 'checked' : ''}>
              <label for="pub_ratelimit">启用访问限流</label>
            </div>
            <div class="field-group" style="margin-top:10px;">
              <label>每分钟最大请求量</label>
              <input name="rateLimit_maxRequestsPerMinute" type="number" value="${editing.rateLimit?.maxRequestsPerMinute ?? 600}">
            </div>
            <hr style="margin:15px 0; border:none; border-top:1px solid #e2e8f0;">
            <div class="checkbox-group">
              <input type="checkbox" id="pub_log" name="log_enabled" ${editing.log?.enabled !== false ? 'checked' : ''}>
              <label for="pub_log">启用访问日志统计</label>
            </div>
            <div class="field-group" style="margin-top:10px;">
              <label>最大历史日志保留行数</label>
              <input name="log_maxLogCount" type="number" value="${editing.log?.maxLogCount ?? 1000}">
            </div>
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">发布项代理覆盖</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="pub_proxy_override" name="proxy_override_enabled" ${proxyOverride ? 'checked' : ''}>
              <label for="pub_proxy_override">覆盖目标图源代理策略</label>
            </div>
            ${renderProxyPolicyFields(proxyOverride || { mode: 'never' }, outbounds, pools, 'publish_proxy')}
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">发布项缓存覆盖</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="pub_cache_override" name="cache_override_enabled" ${cacheOverride ? 'checked' : ''}>
              <label for="pub_cache_override">覆盖目标图源缓存策略</label>
            </div>
            ${renderCachePolicyFields(cacheOverride || { enabled: true }, 'publish_cache')}
          </fieldset>

          <div class="checkbox-group" style="margin-top:20px;">
            <input type="checkbox" id="pub_enabled" name="enabled" ${editing.enabled !== false ? 'checked' : ''}>
            <label for="pub_enabled" style="font-weight:600;">启用该对外服务发布项</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存发布</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="publish">取消</button>
          </div>
        </form>
      </div>
    `
  }

  // 明文 Token 提示展示
  const tokenMessage = state.lastGeneratedToken 
    ? `<div class="admin-token-notice">
        <span><strong>已成功重置 Token！您的明文 Token 是：</strong> <code>${escapeHtml(state.lastGeneratedToken)}</code> <br><small>请立即复制，刷新或离开本页后此明文 Token 将不再出现！</small></span>
        <button type="button" class="admin-token-notice-close" data-tile-sources-close-token-notice aria-label="关闭 Token 提示">×</button>
       </div>`
    : ''

  const activePublish = publishes.find(p => p.id === selectedPublishId)
  let exampleSection = ''

  if (activePublish) {
    exampleSection = renderPublishExample(activePublish, state)
  }

  return `
    ${tokenMessage}
    
    <div class="admin-panel-head">
      <h3>对外发布项管理</h3>
      <button type="button" data-tile-sources-add="publish">+ 创建对外发布</button>
    </div>
    
    <table class="item-table">
      <thead>
        <tr>
          <th style="white-space: nowrap;">名称 / 标识 ID</th>
          <th style="white-space: nowrap;">目标类型</th>
          <th style="white-space: nowrap;">路径标识</th>
          <th style="white-space: nowrap;">鉴权方式</th>
          <th style="white-space: nowrap;">限流控制</th>
          <th style="white-space: nowrap;">连通测试</th>
          <th style="white-space: nowrap;">状态</th>
          <th style="white-space: nowrap;">管理操作</th>
        </tr>
      </thead>
      <tbody>
        ${publishes.map(p => {
          const testState = state[`test_publish_${p.id}`] || ''
          const isActive = p.id === selectedPublishId
          return `
            <tr style="background: ${isActive ? '#f0fdfa' : 'transparent'}; cursor:pointer;" data-tile-sources-select-publish="${p.id}">
              <td style="white-space: nowrap;">
                <strong style="display:inline-block; max-width:180px; overflow:hidden; text-overflow:ellipsis; vertical-align:middle;" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</strong>
                <div style="color: #64748b; font-size:11px; margin-top:2px;">${escapeHtml(p.id)}</div>
              </td>
              <td style="white-space: nowrap;"><span class="badge-gray">${escapeHtml(getPublishTargetLabel(p.targetType))}</span></td>
              <td style="white-space: nowrap;"><code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:12px;">${escapeHtml(p.pathSlug)}</code></td>
              <td style="white-space: nowrap;">
                ${p.auth?.mode === 'token' 
                  ? `<span class="badge-blue" title="Token预览: ${escapeHtml(p.auth.tokenPreview || '')}">Token鉴权</span>` 
                  : '<span class="badge-gray">完全公开</span>'}
              </td>
              <td style="white-space: nowrap;">
                ${p.rateLimit?.enabled 
                  ? `<span class="badge-green">${p.rateLimit.maxRequestsPerMinute} 请求/分</span>` 
                  : '<span class="badge-gray">无限制</span>'}
              </td>
              <td>
                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                  <button type="button" class="btn-link" data-tile-sources-test-publish="${p.id}">测试</button>
                  ${testState === 'loading' ? '<span class="test-status test-loading" style="margin-left: 0;">测试中...</span>' : ''}
                  ${testState && testState !== 'loading' && testState.success ? `<span class="test-status test-success" style="margin-left: 0;">成功 (${testState.duration}ms)</span>` : ''}
                  ${testState && testState !== 'loading' && !testState.success ? `<span class="test-status test-fail" style="margin-left: 0;" title="${escapeHtml(getResultError(testState))}">失败</span>` : ''}
                </div>
              </td>
              <td style="white-space: nowrap;">
                ${renderStatusToggleButton(p.enabled, 'publish', p.id, '已发布', '已禁用')}
              </td>
              <td style="white-space: nowrap;">
                <div class="flex-actions" style="flex-wrap: nowrap;">
                  <button type="button" class="btn-link" data-tile-sources-edit-publish="${p.id}">编辑</button>
                  ${p.auth?.mode === 'token' ? `<button type="button" class="btn-link" data-tile-sources-reset-token="${p.id}">重置</button>` : ''}
                  <button type="button" class="btn-link btn-danger-link" data-tile-sources-delete-publish="${p.id}">注销</button>
                </div>
              </td>
            </tr>
          `
        }).join('') || '<tr><td colspan="8" style="text-align:center;">暂无对外发布项</td></tr>'}
      </tbody>
    </table>

    ${exampleSection}
  `
}

// 5. 诊断日志视图
function renderDiagnosticsView (state) {
  const selectedPublishId = state.diagnosticsPublishId || ''
  const publishes = state.externalPublishes || []
  const logs = state.diagnosticLogs || []
  const error = state.diagnosticLogsError || ''

  return `
    <div class="admin-panel-head">
      <h3>运行诊断与对外日志</h3>
      <div style="display:flex; gap:10px; align-items:center;">
        <span style="font-size:13px; color:#475569;">筛选发布项:</span>
        <select data-tile-sources-diagnostic-filter style="padding:6px 10px; border-radius:4px; border:1px solid #cbd5e1; font-size:12px;">
          <option value="">查看所有日志</option>
          ${publishes.map(p => `<option value="${p.id}" ${p.id === selectedPublishId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
        <button type="button" data-tile-sources-refresh-logs>刷新日志</button>
      </div>
    </div>

    <table class="item-table log-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>发布项 ID</th>
          <th>关联图源</th>
          <th>客户端 IP</th>
          <th>坐标 (Z/X/Y)</th>
          <th>代理网关</th>
          <th>耗时</th>
          <th>缓存</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        ${error
          ? `<tr><td colspan="9" style="text-align:center; color:#b91c1c; padding:20px;">${escapeHtml(error)}</td></tr>`
          : logs.map(log => `
          <tr>
            <td style="color:#64748b;">${new Date(log.timestamp).toLocaleString()}</td>
            <td><strong>${escapeHtml(log.publishId)}</strong></td>
            <td><span class="badge-gray">${escapeHtml(log.sourceId || '-')}</span></td>
            <td><code>${escapeHtml(log.clientIp)}</code></td>
            <td><code>${escapeHtml(log.coordinates)}</code></td>
            <td>
              ${log.proxyOutboundId 
                ? `<span class="badge-blue" title="池: ${escapeHtml(log.proxyPoolId || '')}">${escapeHtml(log.proxyOutboundId)}</span>` 
                : '<span style="color:#94a3b8;">直连</span>'}
            </td>
            <td>${log.duration}ms</td>
            <td>
              ${log.cacheStatus === 'HIT' ? '<span class="badge-green">HIT</span>' : ''}
              ${log.cacheStatus === 'MISS' ? '<span class="badge-red">MISS</span>' : ''}
              ${log.cacheStatus === 'BYPASS' ? '<span class="badge-gray">BYPASS</span>' : ''}
              ${log.cacheStatus === 'REVALIDATED' ? '<span class="badge-blue">REVAL</span>' : ''}
              ${log.cacheStatus === 'STALE' ? '<span class="badge-blue">STALE</span>' : ''}
            </td>
            <td>
              ${log.statusCode >= 200 && log.statusCode < 300 
                ? '<span class="badge-green">200 OK</span>' 
                : `<span class="badge-red" title="${escapeHtml(log.errorMessage || '')}">${log.statusCode}</span>`}
            </td>
          </tr>
        `).join('') || '<tr><td colspan="9" style="text-align:center; color:#64748b; padding:20px;">暂无相关的对外访问日志</td></tr>'}
      </tbody>
    </table>
  `
}

// ----------------- 页面跳转与事件处理逻辑 -----------------

export async function handleTileSourcesEnter (state, api) {
  // 载入诊断日志数据（如有日志展示）
  if (state.tileSourcesSubTab === 'diagnostics') {
    await refreshDiagnosticLogs(state, api)
  }
}

async function refreshDiagnosticLogs (state, api) {
  state.loading = true
  try {
    const pubId = state.diagnosticsPublishId || ''
    state.diagnosticLogs = await api.listExternalPublishLogs(pubId)
    state.diagnosticLogsError = ''
  } catch (err) {
    state.diagnosticLogs = []
    state.diagnosticLogsError = err.message
  } finally {
    state.loading = false
  }
}

export async function handleTileSourcesClick (context) {
  const { event, state, api, renderDashboard, showConfirm, setNotice } = context

  // 1. 子 Tab 切换
  const subTabBtn = event.target.closest('[data-tile-sources-tab]')
  if (subTabBtn) {
    state.tileSourcesSubTab = subTabBtn.getAttribute('data-tile-sources-tab')
    state.editingTileSource = null
    state.editingMapLayer = null
    state.editingProxyOutbound = null
    state.editingProxyPool = null
    state.editingExternalPublish = null
    
    if (state.tileSourcesSubTab === 'diagnostics') {
      await refreshDiagnosticLogs(state, api)
    }
    renderDashboard()
    return true
  }

  // 2. 关闭 Token 明文提示
  if (event.target.closest('[data-tile-sources-close-token-notice]')) {
    state.lastGeneratedToken = null
    renderDashboard()
    return true
  }

  // 3. 诊断面板日志刷新
  if (event.target.closest('[data-tile-sources-refresh-logs]')) {
    await refreshDiagnosticLogs(state, api)
    renderDashboard()
    return true
  }

  // 4. 选择发布项切换接入示例
  const publishRow = event.target.closest('[data-tile-sources-select-publish]')
  if (publishRow && !event.target.closest('button')) {
    state.selectedPublishId = publishRow.getAttribute('data-tile-sources-select-publish')
    renderDashboard()
    return true
  }

  // ================= 图源操作 =================
  if (event.target.closest('[data-tile-sources-add="source"]')) {
    state.editingTileSource = {
      id: '',
      name: '',
      vendor: '',
      category: 'satellite',
      template: '',
      minZoom: 3,
      maxZoom: 18,
      maxNativeZoom: 18,
      tileSize: 256,
      retina: { mode: 'fixed', param: 'scale', normalValue: '1', retinaValue: '1' },
      subdomains: [],
      cache: { enabled: true, ttlMs: 21600000, staleTtlMs: 2592000000 },
      proxy: { mode: 'never', fallbackToDirect: false },
      permissions: { frontendVisible: true, precacheAllowed: true, externalApiAllowed: true },
      visibility: { scope: 'system' }
    }
    renderDashboard()
    return true
  }
  if (event.target.closest('[data-tile-sources-cancel="source"]')) {
    state.editingTileSource = null
    renderDashboard()
    return true
  }
  const toggleSourceBtn = event.target.closest('[data-tile-sources-toggle-source]')
  if (toggleSourceBtn) {
    const id = toggleSourceBtn.getAttribute('data-tile-sources-toggle-source')
    const source = (state.tileSources || []).find(item => item.id === id)
    if (!source) return true
    const nextEnabled = !source.enabled
    state.loading = true
    renderDashboard()
    try {
      await api.updateTileSource(id, { enabled: nextEnabled })
      await reloadCatalogRelatedState(state, api, { tileSources: true })
      setNotice(`图源已${nextEnabled ? '启用' : '禁用'}`)
    } catch (err) {
      setNotice('', err.message)
    } finally {
      state.loading = false
      renderDashboard()
    }
    return true
  }
  const editSourceBtn = event.target.closest('[data-tile-sources-edit-source]')
  if (editSourceBtn) {
    const id = editSourceBtn.getAttribute('data-tile-sources-edit-source')
    state.loading = true
    renderDashboard()
    try {
      state.editingTileSource = await api.getTileSource(id)
    } catch (err) {
      setNotice('', err.message)
    } finally {
      state.loading = false
      renderDashboard()
    }
    return true
  }
  const deleteSourceBtn = event.target.closest('[data-tile-sources-delete-source]')
  if (deleteSourceBtn) {
    const id = deleteSourceBtn.getAttribute('data-tile-sources-delete-source')
    const confirm = await showConfirm(`确定要删除图源 "${id}" 吗？如果该图源已被图层或发布项引用将报错阻止。`, '确认删除图源')
    if (confirm) {
      state.loading = true
      renderDashboard()
      try {
        await api.deleteTileSource(id)
        await reloadCatalogRelatedState(state, api, { tileSources: true })
        setNotice('删除图源成功')
      } catch (err) {
        setNotice('', err.message)
      } finally {
        state.loading = false
        renderDashboard()
      }
    }
    return true
  }
  const testSourceBtn = event.target.closest('[data-tile-sources-test-source]')
  if (testSourceBtn) {
    const id = testSourceBtn.getAttribute('data-tile-sources-test-source')
    state[`test_source_${id}`] = 'loading'
    renderDashboard()
    try {
      const res = await api.testTileSource(id)
      state[`test_source_${id}`] = res
    } catch (err) {
      state[`test_source_${id}`] = { success: false, error: err.message }
    } finally {
      renderDashboard()
    }
    return true
  }

  // ================= 图层操作 =================
  if (event.target.closest('[data-tile-sources-add="layer"]')) {
    state.editingMapLayer = {
      id: '',
      name: '',
      type: 'base',
      sortOrder: 10,
      minZoom: 3,
      maxZoom: 18,
      clients: ['2d', '3d'],
      items: [{ sourceId: '', opacity: 1, zIndex: 0 }]
    }
    renderDashboard()
    return true
  }
  if (event.target.closest('[data-tile-sources-cancel="layer"]')) {
    state.editingMapLayer = null
    renderDashboard()
    return true
  }
  const toggleLayerBtn = event.target.closest('[data-tile-sources-toggle-layer]')
  if (toggleLayerBtn) {
    const id = toggleLayerBtn.getAttribute('data-tile-sources-toggle-layer')
    const layer = (state.mapLayers || []).find(item => item.id === id)
    if (!layer) return true
    const nextEnabled = !layer.enabled
    if (layer.default && !nextEnabled) {
      setNotice('', '默认图层不能直接禁用，请先设置新的默认图层')
      return true
    }
    state.loading = true
    renderDashboard()
    try {
      await api.updateMapLayer(id, { enabled: nextEnabled })
      await reloadCatalogRelatedState(state, api, { mapLayers: true })
      setNotice(`组合图层已${nextEnabled ? '启用' : '禁用'}`)
    } catch (err) {
      setNotice('', err.message)
    } finally {
      state.loading = false
      renderDashboard()
    }
    return true
  }
  const editLayerBtn = event.target.closest('[data-tile-sources-edit-layer]')
  if (editLayerBtn) {
    const id = editLayerBtn.getAttribute('data-tile-sources-edit-layer')
    state.editingMapLayer = JSON.parse(JSON.stringify(state.mapLayers.find(l => l.id === id)))
    renderDashboard()
    return true
  }
  const deleteLayerBtn = event.target.closest('[data-tile-sources-delete-layer]')
  if (deleteLayerBtn) {
    const id = deleteLayerBtn.getAttribute('data-tile-sources-delete-layer')
    const confirm = await showConfirm(`确认删除图层组合 "${id}"？`, '确认删除')
    if (confirm) {
      state.loading = true
      renderDashboard()
      try {
        await api.deleteMapLayer(id)
        await reloadCatalogRelatedState(state, api, { mapLayers: true })
        setNotice('删除图层组合成功')
      } catch (err) {
        setNotice('', err.message)
      } finally {
        state.loading = false
        renderDashboard()
      }
    }
    return true
  }
  const setDefaultBtn = event.target.closest('[data-tile-sources-set-default]')
  if (setDefaultBtn) {
    const id = setDefaultBtn.getAttribute('data-tile-sources-set-default')
    state.loading = true
    renderDashboard()
    try {
      await api.setDefaultMapLayer(id)
      await reloadCatalogRelatedState(state, api, { mapLayers: true })
      setNotice('已将该图层设为默认展示')
    } catch (err) {
      setNotice('', err.message)
    } finally {
      state.loading = false
      renderDashboard()
    }
    return true
  }
  if (event.target.closest('[data-tile-sources-add-layer-item]')) {
    state.editingMapLayer.items.push({ sourceId: '', opacity: 1, zIndex: state.editingMapLayer.items.length })
    renderDashboard()
    return true
  }
  const removeLayerItemBtn = event.target.closest('[data-tile-sources-remove-layer-item]')
  if (removeLayerItemBtn) {
    const idx = parseInt(removeLayerItemBtn.getAttribute('data-tile-sources-remove-layer-item'))
    if (state.editingMapLayer.items.length > 1) {
      state.editingMapLayer.items.splice(idx, 1)
      renderDashboard()
    } else {
      setNotice('', '图层组合中必须包含至少一个图源')
    }
    return true
  }
  const moveUpBtn = event.target.closest('[data-tile-sources-move-up]')
  if (moveUpBtn) {
    const idx = parseInt(moveUpBtn.getAttribute('data-tile-sources-move-up'))
    if (idx > 0) {
      const items = state.editingMapLayer.items
      const temp = items[idx]
      items[idx] = items[idx-1]
      items[idx-1] = temp
      renderDashboard()
    }
    return true
  }
  const moveDownBtn = event.target.closest('[data-tile-sources-move-down]')
  if (moveDownBtn) {
    const idx = parseInt(moveDownBtn.getAttribute('data-tile-sources-move-down'))
    const items = state.editingMapLayer.items
    if (idx < items.length - 1) {
      const temp = items[idx]
      items[idx] = items[idx+1]
      items[idx+1] = temp
      renderDashboard()
    }
    return true
  }



  // ================= 发布/API 操作 =================
  if (event.target.closest('[data-tile-sources-add="publish"]')) {
    state.editingExternalPublish = {
      id: '',
      name: '',
      targetType: 'source',
      targetId: '',
      pathSlug: '',
      auth: { mode: 'token' },
      rateLimit: { enabled: true, maxRequestsPerMinute: 600 },
      log: { enabled: true, maxLogCount: 1000 },
      overrides: { proxy: null, cache: null },
      enabled: true
    }
    renderDashboard()
    return true
  }
  if (event.target.closest('[data-tile-sources-cancel="publish"]')) {
    state.editingExternalPublish = null
    renderDashboard()
    return true
  }
  const togglePublishBtn = event.target.closest('[data-tile-sources-toggle-publish]')
  if (togglePublishBtn) {
    const id = togglePublishBtn.getAttribute('data-tile-sources-toggle-publish')
    const publish = (state.externalPublishes || []).find(item => item.id === id)
    if (!publish) return true
    const nextEnabled = !publish.enabled
    state.loading = true
    renderDashboard()
    try {
      await api.updateExternalPublish(id, { enabled: nextEnabled })
      await reloadCatalogRelatedState(state, api, { externalPublishes: true, precacheCatalog: false })
      setNotice(`对外发布项已${nextEnabled ? '发布' : '禁用'}`)
    } catch (err) {
      setNotice('', err.message)
    } finally {
      state.loading = false
      renderDashboard()
    }
    return true
  }
  const editPublishBtn = event.target.closest('[data-tile-sources-edit-publish]')
  if (editPublishBtn) {
    const id = editPublishBtn.getAttribute('data-tile-sources-edit-publish')
    state.editingExternalPublish = JSON.parse(JSON.stringify(state.externalPublishes.find(p => p.id === id)))
    renderDashboard()
    return true
  }
  const deletePublishBtn = event.target.closest('[data-tile-sources-delete-publish]')
  if (deletePublishBtn) {
    const id = deletePublishBtn.getAttribute('data-tile-sources-delete-publish')
    const confirm = await showConfirm(`确认注销并删除外部发布接口项 "${id}" 吗？`, '注销对外服务')
    if (confirm) {
      state.loading = true
      renderDashboard()
      try {
        await api.deleteExternalPublish(id)
        await reloadCatalogRelatedState(state, api, { externalPublishes: true, precacheCatalog: false })
        setNotice('成功注销对外发布服务')
      } catch (err) {
        setNotice('', err.message)
      } finally {
        state.loading = false
        renderDashboard()
      }
    }
    return true
  }
  const resetTokenBtn = event.target.closest('[data-tile-sources-reset-token]')
  if (resetTokenBtn) {
    const id = resetTokenBtn.getAttribute('data-tile-sources-reset-token')
    const confirm = await showConfirm(`确认要重置该对外服务的 Token 吗？旧 Token 将会立即失效！`, '重置 Token 凭证')
    if (confirm) {
      state.loading = true
      renderDashboard()
      try {
        const res = await api.resetExternalPublishToken(id)
        state.lastGeneratedToken = res.token
        await reloadCatalogRelatedState(state, api, { externalPublishes: true, precacheCatalog: false })
        setNotice('Token 已重置，请记录您的新明文 Token')
      } catch (err) {
        setNotice('', err.message)
      } finally {
        state.loading = false
        renderDashboard()
      }
    }
    return true
  }
  const testPublishBtn = event.target.closest('[data-tile-sources-test-publish]')
  if (testPublishBtn) {
    const id = testPublishBtn.getAttribute('data-tile-sources-test-publish')
    state[`test_publish_${id}`] = 'loading'
    renderDashboard()
    try {
      const res = await api.testExternalPublish(id)
      state[`test_publish_${id}`] = res
    } catch (err) {
      state[`test_publish_${id}`] = { success: false, error: err.message }
    } finally {
      renderDashboard()
    }
    return true
  }

  return false
}

export async function handleTileSourcesSubmit (context) {
  const { event, state, api, renderDashboard, setNotice } = context
  const form = event.target.closest('[data-tile-sources-form]')
  if (!form) return false

  event.preventDefault()
  const formType = form.getAttribute('data-tile-sources-form')
  state.loading = true
  renderDashboard()

  const formData = new FormData(form)
  const isNew = formData.get('isNew') === 'true'

  try {
    if (formType === 'source') {
      const sourceId = formData.get('id')
      const tileScale = formData.get('tileScale') || '1'
      const payload = {
        id: sourceId,
        name: formData.get('name'),
        enabled: form.elements.enabled.checked,
        vendor: formData.get('vendor'),
        category: formData.get('category'),
        kind: 'xyz',
        template: formData.get('template'),
        subdomains: formData.get('subdomains').split(',').map(s => s.trim()).filter(Boolean),
        minZoom: parseInt(formData.get('minZoom')),
        maxZoom: parseInt(formData.get('maxZoom')),
        maxNativeZoom: parseInt(formData.get('maxNativeZoom')),
        tileSize: 256,
        retina: {
          mode: 'fixed',
          param: 'scale',
          normalValue: tileScale,
          retinaValue: tileScale
        },
        attribution: formData.get('attribution'),
        description: formData.get('description'),
        cache: collectCachePolicy(form, formData, 'cache'),
        proxy: collectProxyPolicy(form, formData, 'proxy'),
        permissions: {
          frontendVisible: form.elements.perm_frontendVisible.checked,
          precacheAllowed: form.elements.perm_precacheAllowed.checked,
          externalApiAllowed: form.elements.perm_externalApiAllowed.checked
        },
        visibility: {
          scope: formData.get('visibility_scope') || 'system'
        }
      }

      if (isNew) {
        await api.createTileSource(payload)
      } else {
        await api.updateTileSource(sourceId, payload)
      }
      state.editingTileSource = null
      await reloadCatalogRelatedState(state, api, { tileSources: true })
      setNotice('保存图源配置成功')
    }

    else if (formType === 'layer') {
      const layerId = formData.get('id')
      
      // 提取图源 items 列表
      const itemSourceIds = form.querySelectorAll('select[name="item_sourceId"]')
      const itemOpacities = form.querySelectorAll('input[name="item_opacity"]')
      const items = []
      itemSourceIds.forEach((select, idx) => {
        if (select.value) {
          items.push({
            sourceId: select.value,
            opacity: parseFloat(itemOpacities[idx].value || 1),
            zIndex: idx
          })
        }
      })

      if (!items.length) {
        throw new Error('组合图层必须包含至少一个有效图源')
      }

      const payload = {
        id: layerId,
        name: formData.get('name'),
        enabled: form.elements.enabled.checked,
        frontendVisible: form.elements.frontendVisible.checked,
        default: state.editingMapLayer.default || false,
        type: formData.get('type'),
        sortOrder: parseInt(formData.get('sortOrder')),
        minZoom: parseInt(formData.get('minZoom')),
        maxZoom: parseInt(formData.get('maxZoom')),
        clients: [
          form.elements.client_2d.checked ? '2d' : '',
          form.elements.client_3d.checked ? '3d' : ''
        ].filter(Boolean),
        items,
        description: formData.get('description')
      }

      if (isNew) {
        await api.createMapLayer(payload)
      } else {
        await api.updateMapLayer(layerId, payload)
      }
      state.editingMapLayer = null
      await reloadCatalogRelatedState(state, api, { mapLayers: true })
      setNotice('保存图层组合成功')
    }



    else if (formType === 'publish') {
      const publishId = formData.get('id')
      const proxyOverrideEnabled = Boolean(form.elements.proxy_override_enabled?.checked)
      const cacheOverrideEnabled = Boolean(form.elements.cache_override_enabled?.checked)
      const payload = {
        id: publishId,
        name: formData.get('name'),
        enabled: form.elements.enabled.checked,
        targetType: formData.get('targetType'),
        targetId: formData.get('targetId'),
        pathSlug: formData.get('pathSlug'),
        auth: {
          mode: formData.get('auth_mode')
        },
        rateLimit: {
          enabled: form.elements.rateLimit_enabled.checked,
          maxRequestsPerMinute: parseInt(formData.get('rateLimit_maxRequestsPerMinute'))
        },
        log: {
          enabled: form.elements.log_enabled.checked,
          maxLogCount: parseInt(formData.get('log_maxLogCount'))
        },
        overrides: {
          proxy: proxyOverrideEnabled ? collectProxyPolicy(form, formData, 'publish_proxy') : null,
          cache: cacheOverrideEnabled ? collectCachePolicy(form, formData, 'publish_cache') : null
        }
      }

      if (isNew) {
        const res = await api.createExternalPublish(payload)
        state.lastGeneratedToken = res.token
      } else {
        await api.updateExternalPublish(publishId, payload)
      }
      state.editingExternalPublish = null
      await reloadCatalogRelatedState(state, api, { externalPublishes: true, precacheCatalog: false })
      setNotice('保存对外发布服务成功')
    }

  } catch (err) {
    setNotice('', err.message)
  } finally {
    state.loading = false
    renderDashboard()
  }

  return true
}

export async function handleTileSourcesChange (context) {
  const { event, state, renderDashboard } = context
  
  // 代理字段切换展示
  const selectMode = event.target.closest('[data-proxy-mode-select]')
  if (selectMode) {
    const val = selectMode.value
    const form = selectMode.closest('form')
    const outboundField = form.querySelector('[data-proxy-outbound-field]')
    const poolField = form.querySelector('[data-proxy-pool-field]')
    
    if (outboundField) outboundField.style.display = val === 'fixed' ? 'flex' : 'none'
    if (poolField) poolField.style.display = val === 'pool' ? 'flex' : 'none'
    return true
  }

  const publishTargetType = event.target.closest('[data-publish-target-type]')
  if (publishTargetType && state.editingExternalPublish) {
    state.editingExternalPublish.targetType = publishTargetType.value
    state.editingExternalPublish.targetId = ''
    renderDashboard()
    return true
  }

  // 诊断日志视图筛选器
  const logFilter = event.target.closest('[data-tile-sources-diagnostic-filter]')
  if (logFilter) {
    state.diagnosticsPublishId = logFilter.value
    await refreshDiagnosticLogs(state, context.api)
    renderDashboard()
    return true
  }

  // 图层多图源更改值同步到编辑状态对象
  if (state.editingMapLayer) {
    const selectSource = event.target.closest('select[name="item_sourceId"]')
    const inputOpacity = event.target.closest('input[name="item_opacity"]')
    if (selectSource || inputOpacity) {
      const row = event.target.closest('[data-layer-item-index]')
      const idx = parseInt(row.getAttribute('data-layer-item-index'))
      if (selectSource) state.editingMapLayer.items[idx].sourceId = selectSource.value
      if (inputOpacity) state.editingMapLayer.items[idx].opacity = parseFloat(inputOpacity.value || 1)
      return true
    }
  }

  return false
}
