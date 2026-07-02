import { escapeHtml } from '../utils.js'

function getResultError (result) {
  return result?.errorMessage || result?.error || ''
}

function getPoolTestSummary (testState) {
  const members = Array.isArray(testState?.members) ? testState.members : []
  if (!members.length) return { successCount: 0, totalCount: 0, fastestMs: null }
  const successMembers = members.filter(item => item.success)
  const durations = successMembers
    .map(item => Number(item.duration))
    .filter(Number.isFinite)
  return {
    successCount: successMembers.length,
    totalCount: members.length,
    fastestMs: durations.length ? Math.min(...durations) : null,
  }
}

export function renderProxyPage (state) {
  state.editingProxyOutbound = state.editingProxyOutbound || null
  state.editingProxyPool = state.editingProxyPool || null

  const outbounds = state.proxyOutbounds || []
  const pools = state.proxyPools || []
  const editingOutbound = state.editingProxyOutbound
  const editingPool = state.editingProxyPool

  let content = ''

  // 1. 代理出口表单
  if (editingOutbound) {
    const isNew = !outbounds.some(o => o.id === editingOutbound.id)
    content = `
      <div class="form-card animate-fade-in">
        <h3>${isNew ? '创建代理出口' : `编辑代理出口: ${escapeHtml(editingOutbound.id)}`}</h3>
        <form data-proxy-form="outbound">
          <input type="hidden" name="isNew" value="${isNew}">
          <div class="form-grid">
            <div class="field-group">
              <label>出口 ID</label>
              <input name="id" value="${escapeHtml(editingOutbound.id || '')}" required ${!isNew ? 'readonly' : ''} placeholder="例如: hk-clash">
            </div>
            <div class="field-group">
              <label>出口名称</label>
              <input name="name" value="${escapeHtml(editingOutbound.name || '')}" required placeholder="例如: 香港节点">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>协议</label>
              <select name="protocol">
                <option value="http" ${editingOutbound.protocol === 'http' ? 'selected' : ''}>HTTP</option>
                <option value="https" ${editingOutbound.protocol === 'https' ? 'selected' : ''}>HTTPS</option>
              </select>
            </div>
            <div class="field-group">
              <label>代理服务器地址</label>
              <input name="host" value="${escapeHtml(editingOutbound.host || '')}" required placeholder="example">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>端口</label>
              <input name="port" type="number" value="${editingOutbound.port ?? 7890}" required>
            </div>
            <div class="field-group">
              <label>用户名</label>
              <input name="username" value="${escapeHtml(editingOutbound.username || '')}">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>密码（留空不修改）</label>
              <input name="password" type="password" placeholder="${editingOutbound.hasPassword ? '********' : '无密码'}">
            </div>
            <div class="field-group">
              <label>连通测试链接</label>
              <input name="testUrl" value="${escapeHtml(editingOutbound.testUrl || 'https://www.google.com/generate_204')}">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>超时时间（毫秒）</label>
              <input name="timeoutMs" type="number" value="${editingOutbound.timeoutMs ?? 8000}">
            </div>
            <div class="field-group">
              <label>备注描述</label>
              <input name="description" value="${escapeHtml(editingOutbound.description || '')}">
            </div>
          </div>
          
          <div class="checkbox-group" style="margin-top:15px;">
            <input type="checkbox" id="outbound_enabled" name="enabled" ${editingOutbound.enabled !== false ? 'checked' : ''}>
            <label for="outbound_enabled" style="font-weight:600;">启用该代理出口</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存出口</button>
            <button type="button" class="admin-form-cancel" data-proxy-cancel="outbound">取消</button>
          </div>
        </form>
      </div>
    `
  }
  // 2. 代理池表单
  else if (editingPool) {
    const isNew = !pools.some(p => p.id === editingPool.id)
    const members = editingPool.members || []
    content = `
      <div class="form-card animate-fade-in">
        <h3>${isNew ? '创建代理池' : `编辑代理池: ${escapeHtml(editingPool.id)}`}</h3>
        <form data-proxy-form="pool">
          <input type="hidden" name="isNew" value="${isNew}">
          <div class="form-grid">
            <div class="field-group">
              <label>代理池 ID</label>
              <input name="id" value="${escapeHtml(editingPool.id || '')}" required ${!isNew ? 'readonly' : ''} placeholder="例如: proxy-pool-hk">
            </div>
            <div class="field-group">
              <label>代理池名称</label>
              <input name="name" value="${escapeHtml(editingPool.name || '')}" required placeholder="例如: 智能负载代理池">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>负载分配策略</label>
              <select name="strategy">
                <option value="priority" ${editingPool.strategy === 'priority' ? 'selected' : ''}>按优先级顺序选择</option>
                <option value="round_robin" ${editingPool.strategy === 'round_robin' ? 'selected' : ''}>均摊轮询选择</option>
                <option value="failover" ${editingPool.strategy === 'failover' ? 'selected' : ''}>主备失败自动切换</option>
              </select>
            </div>
            <div class="field-group">
              <label>代理池描述</label>
              <input name="description" value="${escapeHtml(editingPool.description || '')}">
            </div>
          </div>

          <div class="field-group" style="margin-top:15px;">
            <label style="font-weight:600;">关联代理出口及优先级/权重</label>
            <div class="layer-items-list">
              ${outbounds.map((outbound) => {
                const member = members.find(m => m.outboundId === outbound.id)
                const checked = Boolean(member)
                const priority = member?.priority ?? 100
                const weight = member?.weight ?? 1
                return `
                  <div style="display:flex; gap:12px; align-items:center; background:#f8fafc; padding:6px 12px; border-radius:4px;">
                    <label style="display:inline-flex; align-items:center; gap:8px; width:220px; font-weight:500; cursor:pointer;">
                      <input type="checkbox" name="pool_outbound_id" value="${outbound.id}" ${checked ? 'checked' : ''}>
                      <span>${escapeHtml(outbound.name)}</span>
                      <small style="color:#64748b;">(${outbound.host}:${outbound.port})</small>
                    </label>
                    <div style="display:flex; align-items:center; gap:4px;">
                      <span style="font-size:12px; color:#475569;">优先级:</span>
                      <input name="pool_priority_${outbound.id}" type="number" value="${priority}" style="width:60px; padding:4px;">
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                      <span style="font-size:12px; color:#475569;">权重:</span>
                      <input name="pool_weight_${outbound.id}" type="number" value="${weight}" style="width:60px; padding:4px;">
                    </div>
                  </div>
                `
              }).join('') || '<p style="color:#64748b;">暂无可用的代理出口，请先在下方创建代理出口！</p>'}
            </div>
          </div>

          <div class="checkbox-group" style="margin-top:15px;">
            <input type="checkbox" id="pool_enabled" name="enabled" ${editingPool.enabled !== false ? 'checked' : ''}>
            <label for="pool_enabled" style="font-weight:600;">启用该代理池</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存代理池</button>
            <button type="button" class="admin-form-cancel" data-proxy-cancel="pool">取消</button>
          </div>
        </form>
      </div>
    `
  }
  // 3. 代理列表双视图展示
  else {
    content = `
      <div style="margin-bottom:40px;">
        <div class="admin-panel-head">
          <h3>代理出口</h3>
          <button type="button" data-proxy-add="outbound">+ 新建代理出口</button>
        </div>
        
        <table class="item-table">
          <thead>
            <tr>
              <th>ID / 出口名称</th>
              <th>协议</th>
              <th>出口主机</th>
              <th>代理认证</th>
              <th>接口测试</th>
              <th>状态</th>
              <th>管理操作</th>
            </tr>
          </thead>
          <tbody>
            ${outbounds.map(o => {
              const testState = state[`test_outbound_${o.id}`] || ''
              return `
                <tr>
                  <td>
                    <strong>${escapeHtml(o.name)}</strong>
                    <div style="color: #64748b; font-size:11px; margin-top:2px;">${escapeHtml(o.id)}</div>
                  </td>
                  <td><span class="badge-gray">${o.protocol.toUpperCase()}</span></td>
                  <td><code>${escapeHtml(o.host)}:${o.port}</code></td>
                  <td>
                    ${o.username 
                      ? `<span class="badge-blue" title="已配置代理用户名密码">${escapeHtml(o.username)}</span>` 
                      : '<span style="color:#94a3b8; font-size:12px;">免密/匿名</span>'}
                  </td>
                  <td>
                    <button type="button" class="btn-link" data-proxy-test-outbound="${o.id}">测试连接</button>
                    ${testState === 'loading' ? '<span class="test-status test-loading">测试中...</span>' : ''}
                    ${testState && testState !== 'loading' && testState.success ? `<span class="test-status test-success">成功 (${testState.duration}ms)</span>` : ''}
                    ${testState && testState !== 'loading' && !testState.success ? `<span class="test-status test-fail" title="${escapeHtml(getResultError(testState))}">失败: ${escapeHtml(getResultError(testState))}</span>` : ''}
                  </td>
                  <td>
                    ${o.enabled 
                      ? '<span class="badge-green">已启用</span>' 
                      : '<span class="badge-red">已禁用</span>'}
                  </td>
                  <td>
                    <div class="flex-actions">
                      <button type="button" class="btn-link" data-proxy-edit-outbound="${o.id}">编辑</button>
                      <button type="button" class="btn-link btn-danger-link" data-proxy-delete-outbound="${o.id}">删除</button>
                    </div>
                  </td>
                </tr>
              `
            }).join('') || '<tr><td colspan="7" style="text-align:center; color:#64748b; padding:20px;">暂无配置的代理出口</td></tr>'}
          </tbody>
        </table>
      </div>

      <div>
        <div class="admin-panel-head">
          <h3>代理出口池</h3>
          <button type="button" data-proxy-add="pool">+ 新建代理池</button>
        </div>
        
        <table class="item-table">
          <thead>
            <tr>
              <th>ID / 代理池名称</th>
              <th>路由分配策略</th>
              <th>关联出口数量</th>
              <th>连通批量测试</th>
              <th>使用状态</th>
              <th>管理操作</th>
            </tr>
          </thead>
          <tbody>
            ${pools.map(p => {
              const testState = state[`test_pool_${p.id}`] || ''
              const summary = testState && testState !== 'loading' ? getPoolTestSummary(testState) : null
              return `
                <tr>
                  <td>
                    <strong>${escapeHtml(p.name)}</strong>
                    <div style="color: #64748b; font-size:11px; margin-top:2px;">${escapeHtml(p.id)}</div>
                  </td>
                  <td>
                    <span class="badge-blue">${escapeHtml(p.strategy)}</span>
                  </td>
                  <td>
                    <strong>${(p.members || []).length}</strong> 个出口
                  </td>
                  <td>
                    <button type="button" class="btn-link" data-proxy-test-pool="${p.id}">批量连通测试</button>
                    ${testState === 'loading' ? '<span class="test-status test-loading">测试中...</span>' : ''}
                    ${testState && testState !== 'loading' && testState.success ? `<span class="test-status test-success">可用 ${summary.successCount}/${summary.totalCount}${summary.fastestMs === null ? '' : ` (最快: ${summary.fastestMs}ms)`}</span>` : ''}
                    ${testState && testState !== 'loading' && !testState.success ? `<span class="test-status test-fail" title="${escapeHtml(getResultError(testState))}">失败: ${escapeHtml(getResultError(testState))}</span>` : ''}
                  </td>
                  <td>
                    ${p.enabled 
                      ? '<span class="badge-green">已启用</span>' 
                      : '<span class="badge-red">已禁用</span>'}
                  </td>
                  <td>
                    <div class="flex-actions">
                      <button type="button" class="btn-link" data-proxy-edit-pool="${p.id}">编辑</button>
                      <button type="button" class="btn-link btn-danger-link" data-proxy-delete-pool="${p.id}">删除</button>
                    </div>
                  </td>
                </tr>
              `
            }).join('') || '<tr><td colspan="6" style="text-align:center; color:#64748b; padding:20px;">暂无配置的代理出口池</td></tr>'}
          </tbody>
        </table>
      </div>
    `
  }

  return `
    <section class="admin-panel tile-sources-panel">


      ${content}
    </section>
  `
}

export function handleProxyEnter (state) {
  state.editingProxyOutbound = null
  state.editingProxyPool = null
}

export async function handleProxyClick ({ api, event, state, renderDashboard, showConfirm, setNotice }) {
  // 1. 出口管理
  if (event.target.closest('[data-proxy-add="outbound"]')) {
    state.editingProxyOutbound = {
      id: '',
      name: '',
      protocol: 'http',
      host: '',
      port: 7890,
      username: '',
      password: '',
      testUrl: 'https://www.google.com/generate_204',
      timeoutMs: 8000,
      description: '',
      enabled: true
    }
    renderDashboard()
    return true
  }

  if (event.target.closest('[data-proxy-cancel="outbound"]')) {
    state.editingProxyOutbound = null
    renderDashboard()
    return true
  }

  if (event.target.closest('[data-proxy-edit-outbound]')) {
    const id = event.target.closest('[data-proxy-edit-outbound]').getAttribute('data-proxy-edit-outbound')
    state.editingProxyOutbound = JSON.parse(JSON.stringify(state.proxyOutbounds.find(o => o.id === id)))
    renderDashboard()
    return true
  }

  if (event.target.closest('[data-proxy-delete-outbound]')) {
    const id = event.target.closest('[data-proxy-delete-outbound]').getAttribute('data-proxy-delete-outbound')
    if (await showConfirm(`确认删除代理出口 “${escapeHtml(id)}” 吗？`)) {
      setNotice('正在删除代理出口')
      try {
        await api.deleteProxyOutbound(id)
        state.proxyOutbounds = await api.listProxyOutbounds()
        setNotice('删除成功')
      } catch (err) {
        setNotice('', err.message)
      }
      renderDashboard()
    }
    return true
  }

  if (event.target.closest('[data-proxy-test-outbound]')) {
    const id = event.target.closest('[data-proxy-test-outbound]').getAttribute('data-proxy-test-outbound')
    state[`test_outbound_${id}`] = 'loading'
    renderDashboard()
    try {
      const res = await api.testProxyOutbound(id)
      state[`test_outbound_${id}`] = res
    } catch (err) {
      state[`test_outbound_${id}`] = { success: false, error: err.message }
    }
    renderDashboard()
    return true
  }

  // 2. 代理池管理
  if (event.target.closest('[data-proxy-add="pool"]')) {
    state.editingProxyPool = {
      id: '',
      name: '',
      strategy: 'priority',
      description: '',
      enabled: true,
      members: []
    }
    renderDashboard()
    return true
  }

  if (event.target.closest('[data-proxy-cancel="pool"]')) {
    state.editingProxyPool = null
    renderDashboard()
    return true
  }

  if (event.target.closest('[data-proxy-edit-pool]')) {
    const id = event.target.closest('[data-proxy-edit-pool]').getAttribute('data-proxy-edit-pool')
    state.editingProxyPool = JSON.parse(JSON.stringify(state.proxyPools.find(p => p.id === id)))
    renderDashboard()
    return true
  }

  if (event.target.closest('[data-proxy-delete-pool]')) {
    const id = event.target.closest('[data-proxy-delete-pool]').getAttribute('data-proxy-delete-pool')
    if (await showConfirm(`确认删除代理池 “${escapeHtml(id)}” 吗？`)) {
      setNotice('正在删除代理池')
      try {
        await api.deleteProxyPool(id)
        state.proxyPools = await api.listProxyPools()
        setNotice('删除成功')
      } catch (err) {
        setNotice('', err.message)
      }
      renderDashboard()
    }
    return true
  }

  if (event.target.closest('[data-proxy-test-pool]')) {
    const id = event.target.closest('[data-proxy-test-pool]').getAttribute('data-proxy-test-pool')
    state[`test_pool_${id}`] = 'loading'
    renderDashboard()
    try {
      const res = await api.testProxyPool(id)
      state[`test_pool_${id}`] = res
    } catch (err) {
      state[`test_pool_${id}`] = { success: false, error: err.message }
    }
    renderDashboard()
    return true
  }

  return false
}

export async function handleProxySubmit ({ api, event, state, renderDashboard, setNotice }) {
  // 1. 出口表单提交
  const outboundForm = event.target.closest('[data-proxy-form="outbound"]')
  if (outboundForm) {
    event.preventDefault()
    setNotice('正在保存代理出口')
    const isNew = outboundForm.elements.isNew.value === 'true'
    const id = outboundForm.elements.id.value.trim()
    const payload = {
      name: outboundForm.elements.name.value.trim(),
      protocol: outboundForm.elements.protocol.value,
      host: outboundForm.elements.host.value.trim(),
      port: parseInt(outboundForm.elements.port.value, 10),
      username: outboundForm.elements.username.value.trim(),
      testUrl: outboundForm.elements.testUrl.value.trim(),
      timeoutMs: parseInt(outboundForm.elements.timeoutMs.value, 10),
      description: outboundForm.elements.description.value.trim(),
      enabled: outboundForm.elements.enabled.checked
    }
    const password = outboundForm.elements.password.value
    if (password) {
      payload.password = password
    }

    try {
      if (isNew) {
        await api.createProxyOutbound({ id, ...payload })
      } else {
        await api.updateProxyOutbound(id, payload)
      }
      state.proxyOutbounds = await api.listProxyOutbounds()
      state.editingProxyOutbound = null
      setNotice('保存成功')
    } catch (err) {
      setNotice('', err.message)
    }
    renderDashboard()
    return true
  }

  // 2. 代理池表单提交
  const poolForm = event.target.closest('[data-proxy-form="pool"]')
  if (poolForm) {
    event.preventDefault()
    setNotice('正在保存代理池')
    const isNew = poolForm.elements.isNew.value === 'true'
    const id = poolForm.elements.id.value.trim()

    // 收集 members
    const members = []
    const checkboxes = poolForm.querySelectorAll('input[name="pool_outbound_id"]:checked')
    checkboxes.forEach((cb) => {
      const outboundId = cb.value
      const priority = parseInt(poolForm.querySelector(`[name="pool_priority_${outboundId}"]`).value, 10)
      const weight = parseInt(poolForm.querySelector(`[name="pool_weight_${outboundId}"]`).value, 10)
      members.push({ outboundId, priority, weight })
    })

    const payload = {
      name: poolForm.elements.name.value.trim(),
      strategy: poolForm.elements.strategy.value,
      description: poolForm.elements.description.value.trim(),
      enabled: poolForm.elements.enabled.checked,
      members
    }

    try {
      if (isNew) {
        await api.createProxyPool({ id, ...payload })
      } else {
        await api.updateProxyPool(id, payload)
      }
      state.proxyPools = await api.listProxyPools()
      state.editingProxyPool = null
      setNotice('保存成功')
    } catch (err) {
      setNotice('', err.message)
    }
    renderDashboard()
    return true
  }

  return false
}

export function handleProxyChange () {
  return false
}
