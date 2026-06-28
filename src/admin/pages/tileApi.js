import { escapeHtml } from '../utils.js'

export function renderTileApiPage (state) {
  const tileApi = state.settings?.tileApi || {}
  const logs = state.tileApiLogs || []
  const loadingLogs = state.tileApiLogsLoading
  const errorLogs = state.tileApiLogsError
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3088'
  const tokenQuery = tileApi.tokenEnabled ? `&token=${tileApi.token || ''}` : ''
  const sampleUrl = `${origin}/api/v1/external/tile?x={x}&y={y}&z={z}&scale=2${tokenQuery}`
  const testUrl = `${origin}/api/v1/external/tile?x=0&y=0&z=0&scale=2${tokenQuery}`
  let logsTableRows = ''
  if (loadingLogs && logs.length === 0) {
    logsTableRows = `<tr><td colspan="7" class="admin-empty">正在加载日志...</td></tr>`
  } else if (errorLogs) {
    logsTableRows = `<tr><td colspan="7" class="admin-empty" style="color: #9f1239;">加载日志失败: ${escapeHtml(errorLogs)}</td></tr>`
  } else if (logs.length === 0) {
    logsTableRows = `<tr><td colspan="7" class="admin-empty">暂无访问日志</td></tr>`
  } else {
    logsTableRows = logs.map(log => {
      const isSuccess = log.statusCode >= 200 && log.statusCode < 300
      const isRedirect = log.statusCode >= 300 && log.statusCode < 400
      const badgeClass = isSuccess ? 'badge-2xx' : (isRedirect ? 'badge-3xx' : 'badge-err')
      const formattedTime = log.timestamp ? log.timestamp.replace('T', ' ').slice(0, 19) : ''

      return `
        <tr style="cursor: pointer;" data-admin-action="view-log-detail" data-log-time="${escapeHtml(log.timestamp)}">
          <td class="admin-time-td">${escapeHtml(formattedTime)}</td>
          <td><code>${escapeHtml(log.clientIp)}</code></td>
          <td><code>${escapeHtml(log.coordinates)}</code></td>
          <td><span class="admin-status-badge ${badgeClass}">${log.statusCode}</span></td>
          <td>
            <span class="admin-status-badge ${log.cacheStatus === 'HIT' ? 'badge-2xx' : (log.cacheStatus === 'MISS' ? 'badge-err' : 'badge-3xx')}">
              ${escapeHtml(log.cacheStatus || 'MISS')}
            </span>
          </td>
          <td>${log.duration} ms</td>
          <td><button type="button" class="admin-task-actions" style="border: none; background: none; color: #0f766e; font-weight: bold; cursor: pointer; padding: 0;">详情</button></td>
        </tr>
      `
    }).join('')
  }

  let modalHtml = ''
  if (state.activeLogDetail) {
    const log = state.activeLogDetail
    modalHtml = `
      <div class="app-dialog-backdrop" data-admin-action="close-log-detail-modal">
        <div class="app-dialog" style="width: min(600px, 95vw); max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; padding: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #163d3d1a; padding-bottom: 10px; margin-bottom: 14px;">
            <h2 style="margin: 0; font-size: 16px;">请求日志详情</h2>
            <button type="button" data-admin-action="close-log-detail-modal" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #64748b;">&times;</button>
          </div>
          <div style="flex: 1; overflow-y: auto; font-size: 13px; color: #172f32; gap: 12px; display: flex; flex-direction: column;">
            <div style="display: flex; flex-direction: column; gap: 4px; background: #f8fbfa; padding: 10px; border-radius: 6px; border: 1px solid #163d3d16;">
              <span style="font-size: 11px; color: #657b7f; font-weight: bold;">请求时间</span>
              <strong>${escapeHtml(log.timestamp)}</strong>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; background: #f8fbfa; padding: 10px; border-radius: 6px; border: 1px solid #163d3d16;">
              <span style="font-size: 11px; color: #657b7f; font-weight: bold;">客户端 IP</span>
              <strong>${escapeHtml(log.clientIp)}</strong>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; background: #f8fbfa; padding: 10px; border-radius: 6px; border: 1px solid #163d3d16;">
              <span style="font-size: 11px; color: #657b7f; font-weight: bold;">请求层级与坐标</span>
              <strong>${escapeHtml(log.coordinates)}</strong>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; background: #f8fbfa; padding: 10px; border-radius: 6px; border: 1px solid #163d3d16;">
              <span style="font-size: 11px; color: #657b7f; font-weight: bold;">完整请求 URL</span>
              <a href="${escapeHtml(origin + log.reqUrl)}" target="_blank" style="word-break: break-all; color: #0284c7; text-decoration: underline; font-family: monospace;">${escapeHtml(origin + log.reqUrl)}</a>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; background: #f8fbfa; padding: 10px; border-radius: 6px; border: 1px solid #163d3d16;">
              <span style="font-size: 11px; color: #657b7f; font-weight: bold;">上游请求 URL</span>
              <code style="word-break: break-all; background: #edf7f6; padding: 4px; border-radius: 4px; font-family: monospace;">${escapeHtml(log.upstreamUrl || '-')}</code>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; background: #f8fbfa; padding: 10px; border-radius: 6px; border: 1px solid #163d3d16;">
              <span style="font-size: 11px; color: #657b7f; font-weight: bold;">User-Agent</span>
              <span style="word-break: break-all;">${escapeHtml(log.userAgent || '-')}</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; background: #f8fbfa; padding: 10px; border-radius: 6px; border: 1px solid #163d3d16;">
              <span style="font-size: 11px; color: #657b7f; font-weight: bold;">响应状态码 与 耗时</span>
              <strong>
                <span class="admin-status-badge ${log.statusCode >= 200 && log.statusCode < 300 ? 'badge-2xx' : (log.statusCode >= 300 && log.statusCode < 400 ? 'badge-3xx' : 'badge-err')}">${log.statusCode}</span>
                - ${log.duration} ms
              </strong>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; background: #f8fbfa; padding: 10px; border-radius: 6px; border: 1px solid #163d3d16;">
              <span style="font-size: 11px; color: #657b7f; font-weight: bold;">缓存状态</span>
              <strong>
                <span class="admin-status-badge ${log.cacheStatus === 'HIT' ? 'badge-2xx' : (log.cacheStatus === 'MISS' ? 'badge-err' : 'badge-3xx')}">${escapeHtml(log.cacheStatus || 'MISS')}</span>
              </strong>
            </div>
            ${log.errorMessage ? `
              <div style="display: flex; flex-direction: column; gap: 4px; background: #fff1f2; padding: 10px; border-radius: 6px; border: 1px solid #be185d2e;">
                <span style="font-size: 11px; color: #9f1239; font-weight: bold;">错误原因</span>
                <strong style="color: #9f1239;">${escapeHtml(log.errorMessage)}</strong>
              </div>
            ` : ''}
          </div>
          <div style="display: flex; justify-content: flex-end; margin-top: 14px; border-top: 1px solid #163d3d1a; padding-top: 10px;">
            <button type="button" data-admin-action="close-log-detail-modal" class="app-dialog-secondary" style="border: 1px solid #163d3d2e; border-radius: 8px; min-height: 36px; padding: 0 16px; cursor: pointer;">关闭</button>
          </div>
        </div>
      </div>
    `
  }

  return `
    <div class="admin-grid" style="grid-template-columns: 1fr;">
      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>对外开放图层 API 设置</h2>
          <span class="admin-badge">${tileApi.enabled ? 'ON' : 'OFF'}</span>
        </div>
        <form class="admin-form" data-tile-api-form autocomplete="off">
          <div class="admin-field-row" style="grid-template-columns: repeat(4, 1fr); align-items: center;">
            <label class="admin-check">
              <input type="checkbox" name="enabled" ${tileApi.enabled ? 'checked' : ''}>
              <span>开放图层 API 接口</span>
            </label>
            <label class="admin-check">
              <input type="checkbox" name="cacheEnabled" ${tileApi.cacheEnabled !== false ? 'checked' : ''}>
              <span>启用本地缓存策略</span>
            </label>
            <label class="admin-check">
              <input type="checkbox" name="useProxy" ${tileApi.useProxy ? 'checked' : ''}>
              <span>启用系统代理拉取上游</span>
            </label>
            <label class="admin-check">
              <input type="checkbox" name="tokenEnabled" ${tileApi.tokenEnabled ? 'checked' : ''}>
              <span>启用访问 Token 验证</span>
            </label>
          </div>
          <label>
            <span>上游图层接口地址模板 (支持 {x}, {y}, {z} 占位符)</span>
            <input name="upstreamUrl" value="${escapeHtml(tileApi.upstreamUrl || '')}" placeholder="默认: https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}" required>
          </label>
          <div class="admin-field-row" style="grid-template-columns: 2fr 1fr;">
            <label>
              <span>访问 Token</span>
              <div style="display: flex; gap: 8px; width: 100%;">
                <input name="token" id="tile-api-token-input" value="${escapeHtml(tileApi.token || '')}" required style="flex: 1;">
                <button type="button" data-admin-action="copy-token" style="flex: none; padding: 0 12px; height: 36px; background: #e2f5f3; color: #0f766e; font-weight: bold; border: 1px solid #0f766e2e; border-radius: 7px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 13px;">复制 Token</button>
                <button type="button" data-admin-action="regenerate-token" style="flex: none; padding: 0 12px; height: 36px; background: #f8fbfa; color: #143235; border: 1px solid #163d3d2e; border-radius: 7px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 13px;">重新生成</button>
              </div>
            </label>
            <label>
              <span>审计日志记录上限</span>
              <select name="maxLogCount">
                <option value="200" ${tileApi.maxLogCount === 200 ? 'selected' : ''}>最近 200 条</option>
                <option value="500" ${tileApi.maxLogCount === 500 ? 'selected' : ''}>最近 500 条</option>
                <option value="1000" ${tileApi.maxLogCount === 1000 ? 'selected' : ''}>最近 1000 条</option>
              </select>
            </label>
          </div>

          <div style="margin-top: 14px; background: #f0fdfa; border: 1px solid #0f766e2e; border-radius: 8px; padding: 12px; font-size: 13px; color: #0f766e; text-align: left;">
            <div style="font-weight: bold; margin-bottom: 6px;">📋 对外开放瓦片接口样例 (可复制到 QGIS 或 GIS 客户端)：</div>
            <div style="margin-bottom: 8px;">
              <span style="font-size: 11px; color: #657b7f; font-weight: bold; display: block; margin-bottom: 2px;">标准图层 API 样例 (支持占位符参数)：</span>
              <code style="word-break: break-all; background: #fff; border: 1px solid #0f766e20; padding: 4px 6px; border-radius: 4px; font-family: monospace; display: block; user-select: all;">${escapeHtml(sampleUrl)}</code>
            </div>
            <div>
              <span style="font-size: 11px; color: #657b7f; font-weight: bold; display: block; margin-bottom: 2px;">浏览器测试 API 地址 (直连测试可用)：</span>
              <a href="${escapeHtml(testUrl)}" target="_blank" style="word-break: break-all; color: #0284c7; text-decoration: underline; font-family: monospace; display: block;">${escapeHtml(testUrl)}</a>
            </div>
          </div>

          <button type="submit" style="justify-self: start; margin-top: 10px;">保存对外 API 配置</button>
        </form>
      </section>

      <section class="admin-panel" style="margin-top: 14px;">
        <div class="admin-panel-head" style="margin-bottom: 14px;">
          <h2>访问审计日志 ${logs.length > 0 ? `<small style="font-size: 12px; color: #657b7f; margin-left: 6px;">(当前记录 ${logs.length} 条)</small>` : ''}</h2>
          <div style="display: flex; gap: 8px;">
            <button type="button" data-admin-action="refresh-logs" class="admin-actions" style="background: #f8fbfa; color: #143235; border: 1px solid #163d3d2e;">刷新日志</button>
            <button type="button" data-admin-action="clear-logs" class="btn-danger admin-actions" style="border: 1px solid #dc26262e;">清空日志</button>
          </div>
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th style="width: 160px;">时间</th>
                <th style="width: 120px;">来源 IP</th>
                <th style="width: 120px;">坐标 (Z X Y)</th>
                <th style="width: 90px;">状态码</th>
                <th style="width: 90px;">缓存状态</th>
                <th style="width: 90px;">响应时间</th>
                <th style="width: 80px;">操作</th>
              </tr>
            </thead>
            <tbody>
              ${logsTableRows}
            </tbody>
          </table>
        </div>
      </section>
    </div>
    ${modalHtml}
  `
}

export async function loadTileApiLogs (state, api) {
  state.tileApiLogsLoading = true
  try {
    state.tileApiLogs = await api.tileApiLogs()
    state.tileApiLogsError = ''
  } catch (err) {
    state.tileApiLogsError = err.message
  } finally {
    state.tileApiLogsLoading = false
    window.renderDashboard?.()
  }
}

export async function handleTileApiSubmit ({ api, event, renderDashboard, setNotice, state }) {
  const form = event.target.closest('[data-tile-api-form]')
  if (!form) return false

  event.preventDefault()
  
  const payload = {
    tileApi: {
      enabled: form.elements.enabled.checked,
      cacheEnabled: form.elements.cacheEnabled.checked,
      upstreamUrl: form.elements.upstreamUrl.value.trim(),
      useProxy: form.elements.useProxy.checked,
      tokenEnabled: form.elements.tokenEnabled.checked,
      token: form.elements.token.value.trim(),
      maxLogCount: Number(form.elements.maxLogCount.value),
    }
  }

  try {
    state.settings = await api.updateSettings(payload)
    setNotice('对外 API 配置已保存')
    renderDashboard()
  } catch (err) {
    setNotice('', err.message)
    renderDashboard()
  }

  return true
}

export async function handleTileApiClick ({ api, event, renderDashboard, setNotice, showConfirm, state }) {
  const actionTarget = event.target.closest('[data-admin-action]')
  if (!actionTarget) return false

  const action = actionTarget.getAttribute('data-admin-action')

  if (action === 'copy-token') {
    const input = document.getElementById('tile-api-token-input')
    if (input) {
      try {
        await navigator.clipboard.writeText(input.value)
        setNotice('Token 已成功复制到剪贴板')
      } catch (err) {
        setNotice('', '复制失败，请手动选择复制')
      }
      renderDashboard()
    }
    return true
  }

  if (action === 'regenerate-token') {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    let token = ''
    for (let i = 0; i < 32; i++) {
      token += chars[Math.floor(Math.random() * chars.length)]
    }

    if (state.settings && state.settings.tileApi) {
      state.settings.tileApi.token = token
    }
    setNotice('已生成新 Token，请点击底部“保存对外 API 配置”按钮以使其生效！')
    renderDashboard()
    return true
  }

  if (action === 'refresh-logs') {
    await loadTileApiLogs(state, api)
    setNotice('访问日志已刷新')
    renderDashboard()
    return true
  }

  if (action === 'clear-logs') {
    const confirmed = await showConfirm('确认清空所有对外接口的访问审计日志吗？')
    if (!confirmed) return true

    try {
      await api.clearTileApiLogs()
      state.tileApiLogs = []
      setNotice('审计日志已成功清空')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  if (action === 'view-log-detail') {
    const logTime = actionTarget.getAttribute('data-log-time')
    const log = (state.tileApiLogs || []).find(l => l.timestamp === logTime)
    if (log) {
      state.activeLogDetail = log
      renderDashboard()
    }
    return true
  }

  if (action === 'close-log-detail-modal') {
    state.activeLogDetail = null
    renderDashboard()
    return true
  }

  return false
}
