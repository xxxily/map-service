import { escapeHtml, formatBytes, formatTime } from '../utils.js'

const GIB = 1024 * 1024 * 1024
const MIB = 1024 * 1024
let cacheRefreshTimer = null

const CACHE_TABS = [
  ['overview', '概览'],
  ['cleanup', '清理策略'],
  ['url', 'URL 分析'],
  ['history', '执行记录'],
]

function formatPercent (value) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`
}

function bytesAsUnit (bytes, unit) {
  if (bytes === null || bytes === undefined) return ''
  const divisor = unit === 'mib' ? MIB : GIB
  const value = Number(bytes) / divisor
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function parseUnitBytes (value, unit, field) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field}必须是非负数`)
  const bytes = Math.round(parsed * (unit === 'mib' ? MIB : GIB))
  if (!Number.isSafeInteger(bytes)) throw new Error(`${field}超出安全整数范围`)
  return bytes
}

function renderCacheTabs (activeTab) {
  return `
    <div class="admin-settings-tabs admin-cache-tabs" role="tablist" aria-label="缓存治理分类">
      ${CACHE_TABS.map(([id, label]) => `
        <button type="button" class="admin-settings-tab ${activeTab === id ? 'is-active' : ''}"
          role="tab" aria-selected="${activeTab === id}" aria-controls="admin-cache-panel-${id}"
          data-admin-action="cache-tab" data-cache-tab="${id}">${label}</button>
      `).join('')}
    </div>
  `
}

function indexStatusLabel (index = {}) {
  if (index.refreshing) return '校准中'
  if (index.exact) return '可用'
  if (index.status === 'stale') return '待重新校准'
  if (index.ready) return '待校准'
  if (index.status === 'failed') return '校准失败'
  return '未建立'
}

function jobStatusLabel (status) {
  return {
    queued: '排队中',
    running: '执行中',
    completed: '已完成',
    cancelled: '已取消',
    failed: '失败',
    interrupted: '已中断',
  }[status] || status || '-'
}

function renderOverviewTab (state) {
  const cache = state.cache || {}
  const index = cache.index || {}
  const status = state.cacheError || (state.cacheLoading ? '读取中' : '')
  const bySource = cache.bySource || {}
  const tileSources = (state.tileSources || []).length
    ? state.tileSources
    : (state.cacheKeyPolicies?.items || []).map(item => ({ id: item.sourceId, name: item.sourceName }))
  const activeJob = cache.activeJob
  return `
    <div class="admin-cache-tabpanel" id="admin-cache-panel-overview" role="tabpanel">
      <dl class="admin-metrics admin-cache-metrics">
        <div class="metric-files"><dt>文件数</dt><dd>${escapeHtml(status || cache.files || 0)}</dd></div>
        <div class="metric-size"><dt>正文体积</dt><dd>${formatBytes(cache.bytes || 0)}</dd></div>
        <div><dt>Sidecar 体积</dt><dd>${formatBytes(cache.sidecarBytes || 0)}</dd></div>
        <div><dt>估算物理占用</dt><dd>${formatBytes(cache.physicalBytes ?? ((cache.bytes || 0) + (cache.sidecarBytes || 0)))}</dd></div>
        <div class="metric-fresh"><dt>新鲜</dt><dd>${cache.fresh || 0}</dd></div>
        <div class="metric-stale"><dt>可回退</dt><dd>${cache.stale || 0}</dd></div>
        <div class="metric-expired"><dt>已过期</dt><dd>${cache.expired || 0}</dd></div>
      </dl>

      <div class="admin-cache-index-status ${index.exact ? 'is-ready' : ''}">
        <div>
          <span>索引状态</span>
          <strong>${escapeHtml(indexStatusLabel(index))}</strong>
          <small>${Number(index.entries || 0)} 条 · 覆盖 ${formatPercent(index.coverage)} · 最近校准 ${formatTime(index.lastReconciledAt)}${index.error ? ` · ${escapeHtml(index.error)}` : ''}</small>
        </div>
        <div class="admin-row-actions">
          ${activeJob ? `<span class="admin-state-pill is-${escapeHtml(activeJob.status)}">${escapeHtml(jobStatusLabel(activeJob.status))} ${Number(activeJob.deletedFiles || 0)}/${Number(activeJob.plannedFiles || 0)}</span>` : ''}
          <button type="button" data-admin-action="cache-reconcile" ${index.refreshing || activeJob ? 'disabled' : ''}>${index.lastReconciledAt ? '重新校准' : '建立索引'}</button>
        </div>
      </div>

      <div class="admin-table-wrap admin-cache-source-table">
        <table class="admin-table">
          <thead><tr><th>图源</th><th>文件数</th><th>正文体积</th><th>新鲜 / 回退 / 过期</th><th>操作</th></tr></thead>
          <tbody>
            ${Object.entries(bySource).map(([sourceId, stats]) => {
              const matchedSource = tileSources.find(source => source.id === sourceId)
              return `
                <tr>
                  <td><strong>${escapeHtml(matchedSource?.name || '专用/未知图源')}</strong><small class="admin-cell-secondary">${escapeHtml(sourceId)}</small></td>
                  <td>${Number(stats.files || 0)}</td>
                  <td>${formatBytes(stats.bytes ?? stats.size ?? 0)}</td>
                  <td>${Number(stats.fresh || 0)} / ${Number(stats.stale || 0)} / ${Number(stats.expired || 0)}</td>
                  <td><div class="admin-row-actions">
                    <button type="button" data-admin-action="cache-source-cleanup" data-source-id="${escapeHtml(sourceId)}">清理预演</button>
                    <button type="button" data-admin-action="cache-source-analysis" data-source-id="${escapeHtml(sourceId)}">URL 分析</button>
                  </div></td>
                </tr>
              `
            }).join('') || '<tr><td colspan="5" class="empty-row">暂无分源缓存数据</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `
}

function renderPolicyForm (policy = {}) {
  const suggestions = policy.suggestions || {}
  const limits = policy.technicalLimits || {}
  return `
    <form class="admin-form admin-cache-policy-form" data-cache-policy-form>
      <div class="admin-field-grid admin-field-grid-three">
        <label><span>软水位 (GiB)</span><input name="softLimitGiB" type="number" min="0" step="0.01" value="${escapeHtml(bytesAsUnit(policy.softLimitBytes, 'gib'))}" placeholder="建议 ${escapeHtml(bytesAsUnit(suggestions.softLimitBytes, 'gib'))}"></label>
        <label><span>硬水位 (GiB)</span><input name="hardLimitGiB" type="number" min="0" step="0.01" value="${escapeHtml(bytesAsUnit(policy.hardLimitBytes, 'gib'))}" placeholder="建议 ${escapeHtml(bytesAsUnit(suggestions.hardLimitBytes, 'gib'))}"></label>
        <label><span>最低可用空间 (GiB)</span><input name="minFreeGiB" type="number" min="0" step="0.01" value="${escapeHtml(bytesAsUnit(policy.minFreeBytes, 'gib'))}" placeholder="建议 ${escapeHtml(bytesAsUnit(suggestions.minFreeBytes, 'gib'))}"></label>
        <label><span>过期保留天数</span><input name="expiredRetentionDays" type="number" min="1" step="1" value="${Number(policy.expiredRetentionDays || 30)}" required></label>
        <label><span>自动治理周期 (分钟)</span><input name="autoCleanupIntervalMinutes" type="number" min="5" step="1" value="${Number(policy.autoCleanupIntervalMinutes || 360)}" required></label>
        <label><span>索引校准冷却 (分钟)</span><input name="reconcileMinIntervalMinutes" type="number" min="5" step="1" value="${Number(policy.reconcileMinIntervalMinutes || 360)}" required></label>
        <label><span>单批最大文件数</span><input name="batchMaxFiles" type="number" min="1" max="${Number(limits.batchMaxFiles || 10000)}" step="1" value="${Number(policy.batchMaxFiles || 500)}" required></label>
        <label><span>单批最大体积 (MiB)</span><input name="batchMaxMiB" type="number" min="1" max="${Math.floor(Number(limits.batchMaxBytes || 0) / MIB) || 4096}" step="1" value="${escapeHtml(bytesAsUnit(policy.batchMaxBytes || 256 * MIB, 'mib'))}" required></label>
        <label class="admin-check admin-cache-check"><input name="autoCleanupEnabled" type="checkbox" ${policy.autoCleanupEnabled ? 'checked' : ''}><span>启用自动治理</span></label>
      </div>
      <div class="admin-form-actions"><button type="submit">保存策略</button></div>
    </form>
  `
}

function renderCleanupPreview (preview) {
  if (!preview) return ''
  const indexReady = preview.exact === true
  return `
    <div class="admin-cache-result ${indexReady ? '' : 'is-warning'}" data-cache-cleanup-preview>
      <div class="admin-cache-result-head">
        <div><span>预演结果</span><strong>${Number(preview.files || 0)} 个文件 · ${formatBytes(preview.bytes || 0)}</strong></div>
        <span class="admin-state-pill ${indexReady ? 'is-active' : 'is-expired'}">${indexReady ? '精确' : '索引未完成'}</span>
      </div>
      <dl class="admin-cache-result-metrics">
        <div><dt>新鲜</dt><dd>${Number(preview.fresh || 0)}</dd></div>
        <div><dt>可回退</dt><dd>${Number(preview.stale || 0)}</dd></div>
        <div><dt>过期</dt><dd>${Number(preview.expired || 0)}</dd></div>
        <div><dt>截止时间</dt><dd>${formatTime(preview.selectionCutoff)}</dd></div>
      </dl>
      <div class="admin-form-actions">
        ${indexReady && preview.files > 0 ? '<button type="button" class="admin-button-danger" data-admin-action="cache-run-cleanup">创建清理任务</button>' : ''}
        ${!indexReady ? '<button type="button" data-admin-action="cache-reconcile">校准索引</button>' : ''}
      </div>
    </div>
  `
}

function renderCleanupTab (state) {
  const sources = (state.tileSources || []).length
    ? state.tileSources
    : (state.cacheKeyPolicies?.items || []).map(item => ({ id: item.sourceId, name: item.sourceName }))
  const selectedSource = state.cacheCleanupSourceId || ''
  return `
    <div class="admin-cache-tabpanel" id="admin-cache-panel-cleanup" role="tabpanel">
      <section class="admin-cache-section">
        <div class="admin-cache-section-head"><div><h3>容量与批处理</h3><p>水位按正文与 Sidecar 的估算物理占用计算；留空表示不限制，建议值不会限制管理员保存更高容量。</p></div></div>
        ${renderPolicyForm(state.cachePolicy || {})}
      </section>
      <section class="admin-cache-section">
        <div class="admin-cache-section-head"><div><h3>清理预演</h3><p>任务只处理预演截止时间之前仍匹配的缓存项。</p></div></div>
        <form class="admin-form admin-cache-cleanup-form" data-cache-cleanup-form>
          <div class="admin-field-grid admin-field-grid-three">
            <label><span>图源</span><select name="sourceId"><option value="">全部图源</option>${sources.map(source => `<option value="${escapeHtml(source.id)}" ${selectedSource === source.id ? 'selected' : ''}>${escapeHtml(source.name)}</option>`).join('')}</select></label>
            <label><span>失效至少 (天)</span><input name="expiredBeforeDays" type="number" min="0" step="1" value="30"></label>
            <label><span>最多文件数</span><input name="maxFiles" type="number" min="1" step="1" placeholder="不限"></label>
            <label><span>最多体积 (GiB)</span><input name="maxGiB" type="number" min="0" step="0.01" placeholder="不限"></label>
            <div class="admin-cache-state-options" role="group" aria-label="缓存状态">
              <label class="admin-check"><input name="states" type="checkbox" value="expired" checked><span>过期</span></label>
              <label class="admin-check"><input name="states" type="checkbox" value="stale"><span>可回退</span></label>
              <label class="admin-check"><input name="states" type="checkbox" value="fresh"><span>新鲜</span></label>
            </div>
            <label class="admin-check admin-cache-check"><input name="orphanedOnly" type="checkbox"><span>仅无归属缓存</span></label>
          </div>
          <div class="admin-form-actions"><button type="submit">生成预演</button></div>
        </form>
        ${renderCleanupPreview(state.cacheCleanupPreview)}
      </section>
    </div>
  `
}

function selectedKeyPolicy (state) {
  const items = state.cacheKeyPolicies?.items || []
  const sourceId = state.cacheKeySourceId || items[0]?.sourceId || ''
  return { sourceId, policy: items.find(item => item.sourceId === sourceId) || null }
}

function listText (values) {
  return (Array.isArray(values) ? values : []).join('\n')
}

function renderAnalysisResult (analysis) {
  if (!analysis) return ''
  const topHosts = (analysis.hostDistribution || []).slice(0, 8)
  const topParams = (analysis.parameterDistribution || []).slice(0, 12)
  return `
    <div class="admin-cache-result ${analysis.safeToEnable ? '' : 'is-warning'}">
      <div class="admin-cache-result-head">
        <div><span>分析结果</span><strong>${analysis.safeToEnable ? '未发现阻断冲突' : '需要调整规则'}</strong></div>
        <span class="admin-state-pill ${analysis.safeToEnable ? 'is-active' : 'is-expired'}">${analysis.complete ? '全量' : '抽样'}</span>
      </div>
      <dl class="admin-cache-result-metrics">
        <div><dt>样本 / 总量</dt><dd>${Number(analysis.sampledEntries || 0)} / ${Number(analysis.totalEntries || 0)}</dd></div>
        <div><dt>可合并文件</dt><dd>${Number(analysis.duplicateFiles || 0)}</dd></div>
        <div><dt>预计节省</dt><dd>${formatBytes(analysis.duplicateBytes || 0)}</dd></div>
        <div><dt>冲突组</dt><dd>${Number(analysis.conflictCount || 0)}</dd></div>
        <div><dt>异常 URL</dt><dd>${Number(analysis.malformedCount || 0)}</dd></div>
      </dl>
      <div class="admin-cache-analysis-grid">
        <div><h4>主机分布</h4>${topHosts.map(item => `<p><code>${escapeHtml(item.host)}</code><span>${Number(item.count || 0)}</span></p>`).join('') || '<small>无数据</small>'}</div>
        <div><h4>参数分布</h4>${topParams.map(item => `<p><code>${escapeHtml(item.name)}</code><span>${Number(item.count || 0)}</span></p>`).join('') || '<small>无数据</small>'}</div>
      </div>
      ${(analysis.warnings || []).length ? `<ul class="admin-cache-warnings">${analysis.warnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
      ${(analysis.collisions || []).length ? `<details class="admin-inline-details"><summary>查看冲突样本</summary><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>归一 URL</th><th>文件</th><th>尺寸</th></tr></thead><tbody>${analysis.collisions.map(item => `<tr><td class="admin-path-td">${escapeHtml(item.canonicalUrl)}</td><td>${Number(item.files || 0)}</td><td>${escapeHtml((item.sizes || []).join(', '))}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      <div class="admin-form-actions">
        ${analysis.safeToEnable ? '<button type="button" data-admin-action="cache-enable-normalized">启用归一键</button>' : ''}
        <button type="button" data-admin-action="cache-use-full-url">使用完整 URL</button>
      </div>
    </div>
  `
}

function renderUrlTab (state) {
  const items = state.cacheKeyPolicies?.items || []
  const analyses = state.cacheKeyPolicies?.analyses || []
  const { sourceId, policy } = selectedKeyPolicy(state)
  const limits = state.cachePolicy?.technicalLimits || {}
  return `
    <div class="admin-cache-tabpanel" id="admin-cache-panel-url" role="tabpanel">
      <section class="admin-cache-section">
        <div class="admin-cache-section-head"><div><h3>按图源分析</h3><p>默认保持完整 URL；只会应用这里明确配置的主机和参数规则。</p></div></div>
        <form class="admin-form admin-cache-key-form" data-cache-key-form>
          <div class="admin-field-grid admin-field-grid-three">
            <label><span>图源</span><select name="sourceId" data-cache-key-source>${items.map(item => `<option value="${escapeHtml(item.sourceId)}" ${sourceId === item.sourceId ? 'selected' : ''}>${escapeHtml(item.sourceName)}</option>`).join('')}</select></label>
            <label><span>规范主机</span><input name="canonicalHost" value="${escapeHtml(policy?.canonicalHost || '')}" placeholder="tiles.example.com"></label>
            <label><span>分析样本数</span><input name="sampleLimit" type="number" min="1" max="${Number(limits.analysisSampleLimit || 50000)}" step="1" value="5000"></label>
            <label class="admin-field-span-two"><span>等价主机（每行一个）</span><textarea name="equivalentHosts" rows="3">${escapeHtml(listText(policy?.equivalentHosts))}</textarea></label>
            <label><span>忽略参数（逗号分隔）</span><input name="ignoredQueryParams" value="${escapeHtml((policy?.ignoredQueryParams || []).join(', '))}" placeholder="token, key"></label>
            <label><span>额外敏感参数（逗号分隔）</span><input name="sensitiveQueryParams" value="${escapeHtml((policy?.sensitiveQueryParams || []).join(', '))}" placeholder="ak, signature"></label>
            <label class="admin-check admin-cache-check"><input name="sortQueryParams" type="checkbox" ${policy?.sortQueryParams !== false ? 'checked' : ''}><span>排序查询参数</span></label>
          </div>
          <div class="admin-form-actions"><button type="submit" ${sourceId ? '' : 'disabled'}>开始分析</button><button type="button" data-admin-action="cache-use-full-url" ${sourceId ? '' : 'disabled'}>保持完整 URL</button></div>
        </form>
        ${renderAnalysisResult(state.cacheKeyAnalysis)}
      </section>
      <section class="admin-cache-section">
        <div class="admin-cache-section-head"><div><h3>图源规则</h3></div></div>
        <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>图源</th><th>模式</th><th>规则</th><th>最近分析</th><th>操作</th></tr></thead><tbody>
          ${items.map(item => `<tr>
            <td><strong>${escapeHtml(item.sourceName)}</strong><small class="admin-cell-secondary">${escapeHtml(item.sourceId)}</small></td>
            <td><span class="admin-state-pill ${item.mode === 'normalized_v2' ? 'is-active' : ''}">${item.mode === 'normalized_v2' ? '归一 v2' : '完整 URL'}</span></td>
            <td>${item.canonicalHost ? `<code>${escapeHtml(item.canonicalHost)}</code>` : '-'}<small class="admin-cell-secondary">忽略 ${(item.ignoredQueryParams || []).length} 个参数</small></td>
            <td>${item.latestAnalysis ? `${formatTime(item.latestAnalysis.createdAt)}<small class="admin-cell-secondary">冲突 ${Number(item.latestAnalysis.conflictCount || 0)} · 异常 ${Number(item.latestAnalysis.malformedCount || 0)}</small>` : '-'}</td>
            <td><div class="admin-row-actions"><button type="button" data-admin-action="cache-edit-key-policy" data-source-id="${escapeHtml(item.sourceId)}">配置</button></div></td>
          </tr>`).join('') || '<tr><td colspan="5" class="empty-row">暂无可配置图源</td></tr>'}
        </tbody></table></div>
      </section>
      <section class="admin-cache-section">
        <div class="admin-cache-section-head"><div><h3>分析记录</h3></div></div>
        <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>图源</th><th>覆盖</th><th>可合并</th><th>冲突</th><th>时间</th><th>操作</th></tr></thead><tbody>
          ${analyses.map(item => `<tr>
            <td>${escapeHtml(items.find(source => source.sourceId === item.sourceId)?.sourceName || item.sourceId)}</td>
            <td>${Number(item.sampledEntries || 0)} / ${Number(item.totalEntries || 0)}<small class="admin-cell-secondary">${item.complete ? '全量' : '抽样'}</small></td>
            <td>${Number(item.duplicateFiles || 0)}<small class="admin-cell-secondary">${formatBytes(item.duplicateBytes || 0)}</small></td>
            <td><span class="admin-state-pill ${item.safeToEnable ? 'is-active' : 'is-expired'}">${Number(item.conflictCount || 0)}</span></td>
            <td>${formatTime(item.createdAt)}</td>
            <td><div class="admin-row-actions"><button type="button" data-admin-action="cache-view-analysis" data-analysis-id="${escapeHtml(item.analysisId)}">查看</button></div></td>
          </tr>`).join('') || '<tr><td colspan="6" class="empty-row">暂无 URL 分析记录</td></tr>'}
        </tbody></table></div>
      </section>
    </div>
  `
}

function renderHistoryTab (state) {
  const jobs = state.cacheCleanupJobs || { items: [] }
  const totalPages = Math.max(1, Math.ceil(Number(jobs.total || 0) / Number(jobs.limit || 20)))
  return `
    <div class="admin-cache-tabpanel" id="admin-cache-panel-history" role="tabpanel">
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>状态</th><th>范围</th><th>进度</th><th>释放空间</th><th>时间</th><th>操作</th></tr></thead><tbody>
        ${(jobs.items || []).map(job => `<tr>
          <td><span class="admin-state-pill is-${escapeHtml(job.status)}">${escapeHtml(jobStatusLabel(job.status))}</span>${job.automatic ? '<small class="admin-cell-secondary">自动治理</small>' : ''}</td>
          <td>${escapeHtml((job.filter?.sourceIds || []).join(', ') || '全部图源')}<small class="admin-cell-secondary">${escapeHtml((job.filter?.states || []).join(' / '))}</small></td>
          <td>${Number(job.deletedFiles || 0)} / ${Number(job.plannedFiles || 0)}<small class="admin-cell-secondary">${Number(job.batches || 0)} 批次${job.skippedFiles ? ` · 跳过 ${Number(job.skippedFiles)}` : ''}</small></td>
          <td>${formatBytes(job.deletedBytes || 0)}</td>
          <td>${formatTime(job.createdAt)}<small class="admin-cell-secondary">${job.finishedAt ? `结束 ${formatTime(job.finishedAt)}` : ''}</small></td>
          <td>${job.cancellable ? `<button type="button" class="admin-button-danger" data-admin-action="cache-cancel-job" data-job-id="${escapeHtml(job.id)}">取消</button>` : '-'}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="empty-row">暂无缓存治理记录</td></tr>'}
      </tbody></table></div>
      ${jobs.total > jobs.limit ? `<nav class="admin-pagination" aria-label="缓存任务分页"><button type="button" data-admin-action="cache-jobs-page" data-page="${Math.max(1, jobs.page - 1)}" ${jobs.page <= 1 ? 'disabled' : ''}>上一页</button><span>第 ${jobs.page} / ${totalPages} 页，共 ${jobs.total} 条</span><button type="button" data-admin-action="cache-jobs-page" data-page="${Math.min(totalPages, jobs.page + 1)}" ${jobs.page >= totalPages ? 'disabled' : ''}>下一页</button></nav>` : ''}
    </div>
  `
}

export function renderCachePage (state) {
  const activeTab = state.cacheTab || 'overview'
  const content = activeTab === 'cleanup'
    ? renderCleanupTab(state)
    : activeTab === 'url'
        ? renderUrlTab(state)
        : activeTab === 'history'
            ? renderHistoryTab(state)
            : renderOverviewTab(state)
  return `
    <section class="admin-panel admin-panel-wide admin-cache-page">
      <div class="admin-panel-head"><h2>缓存治理</h2><span class="admin-state-pill">${escapeHtml(indexStatusLabel(state.cache?.index || {}))}</span></div>
      ${renderCacheTabs(activeTab)}
      ${content}
    </section>
  `
}

function splitList (value) {
  return [...new Set(String(value || '').split(/[\n,]+/).map(item => item.trim()).filter(Boolean))]
}

function collectKeyRule (form) {
  return {
    sourceId: form.elements.sourceId.value,
    canonicalHost: form.elements.canonicalHost.value.trim(),
    equivalentHosts: splitList(form.elements.equivalentHosts.value),
    ignoredQueryParams: splitList(form.elements.ignoredQueryParams.value),
    sensitiveQueryParams: splitList(form.elements.sensitiveQueryParams.value),
    sortQueryParams: Boolean(form.elements.sortQueryParams.checked),
  }
}

async function refreshCacheState ({ api, renderDashboard, state }) {
  const [cache, jobs] = await Promise.all([
    api.cache(),
    api.cacheCleanupJobs({ page: state.cacheCleanupJobs?.page || 1, limit: state.cacheCleanupJobs?.limit || 20 }),
  ])
  state.cache = cache
  state.cacheCleanupJobs = jobs
  renderDashboard()
  if (cache.index?.refreshing || cache.activeJob) scheduleCacheRefresh({ api, renderDashboard, state })
}

function scheduleCacheRefresh (context, delay = 1500) {
  if (cacheRefreshTimer) window.clearTimeout(cacheRefreshTimer)
  cacheRefreshTimer = window.setTimeout(async () => {
    cacheRefreshTimer = null
    if (context.state.activeTab !== 'cache') return
    try {
      await refreshCacheState(context)
    } catch (err) {
      context.setNotice?.('', err.message)
      context.renderDashboard()
    }
  }, delay)
}

export async function handleCacheSubmit ({ api, event, renderDashboard, setNotice, state }) {
  const policyForm = event.target.closest('[data-cache-policy-form]')
  if (policyForm) {
    event.preventDefault()
    try {
      state.cachePolicy = await api.updateCachePolicy({
        softLimitBytes: parseUnitBytes(policyForm.elements.softLimitGiB.value, 'gib', '缓存软水位'),
        hardLimitBytes: parseUnitBytes(policyForm.elements.hardLimitGiB.value, 'gib', '缓存硬水位'),
        minFreeBytes: parseUnitBytes(policyForm.elements.minFreeGiB.value, 'gib', '最低可用空间'),
        autoCleanupEnabled: Boolean(policyForm.elements.autoCleanupEnabled.checked),
        autoCleanupIntervalMinutes: Number(policyForm.elements.autoCleanupIntervalMinutes.value),
        expiredRetentionDays: Number(policyForm.elements.expiredRetentionDays.value),
        batchMaxFiles: Number(policyForm.elements.batchMaxFiles.value),
        batchMaxBytes: parseUnitBytes(policyForm.elements.batchMaxMiB.value, 'mib', '单批最大体积'),
        reconcileMinIntervalMinutes: Number(policyForm.elements.reconcileMinIntervalMinutes.value),
      })
      setNotice('缓存治理策略已保存')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  const cleanupForm = event.target.closest('[data-cache-cleanup-form]')
  if (cleanupForm) {
    event.preventDefault()
    try {
      const states = [...cleanupForm.querySelectorAll('input[name="states"]:checked')].map(input => input.value)
      state.cacheCleanupSourceId = cleanupForm.elements.sourceId.value
      state.cacheCleanupPreview = await api.previewCacheCleanup({
        sourceIds: state.cacheCleanupSourceId ? [state.cacheCleanupSourceId] : [],
        states,
        orphanedOnly: Boolean(cleanupForm.elements.orphanedOnly.checked),
        expiredBeforeDays: Number(cleanupForm.elements.expiredBeforeDays.value || 0),
        maxFiles: cleanupForm.elements.maxFiles.value ? Number(cleanupForm.elements.maxFiles.value) : null,
        maxBytes: parseUnitBytes(cleanupForm.elements.maxGiB.value, 'gib', '最大清理体积'),
      })
      setNotice('清理预演已生成')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  const keyForm = event.target.closest('[data-cache-key-form]')
  if (keyForm) {
    event.preventDefault()
    try {
      const rule = collectKeyRule(keyForm)
      state.cacheKeySourceId = rule.sourceId
      state.cacheKeyAnalysis = await api.analyzeCacheKeyPolicy({
        sourceId: rule.sourceId,
        rule,
        sampleLimit: Number(keyForm.elements.sampleLimit.value || 5000),
      })
      setNotice('URL 缓存键分析已完成')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }
  return false
}

export async function handleCacheClick ({ api, event, renderDashboard, setNotice, showConfirm, state }) {
  const target = event.target.closest('[data-admin-action]')
  if (!target) return false
  const action = target.getAttribute('data-admin-action')

  if (action === 'cache-tab') {
    state.cacheTab = target.getAttribute('data-cache-tab') || 'overview'
    renderDashboard()
    return true
  }
  if (action === 'cache-source-cleanup') {
    state.cacheCleanupSourceId = target.getAttribute('data-source-id') || ''
    state.cacheCleanupPreview = null
    state.cacheTab = 'cleanup'
    renderDashboard()
    return true
  }
  if (action === 'cache-source-analysis' || action === 'cache-edit-key-policy') {
    state.cacheKeySourceId = target.getAttribute('data-source-id') || ''
    state.cacheKeyAnalysis = null
    state.cacheTab = 'url'
    renderDashboard()
    return true
  }
  if (action === 'cache-view-analysis') {
    const analysisId = target.getAttribute('data-analysis-id')
    const analysis = (state.cacheKeyPolicies?.analyses || []).find(item => item.analysisId === analysisId)
    if (analysis) {
      state.cacheKeySourceId = analysis.sourceId
      state.cacheKeyAnalysis = analysis
      state.cacheTab = 'url'
      renderDashboard()
    }
    return true
  }
  if (action === 'cache-reconcile') {
    try {
      await api.reconcileCacheIndex()
      setNotice('缓存索引校准已启动')
      await refreshCacheState({ api, renderDashboard, state })
      scheduleCacheRefresh({ api, renderDashboard, setNotice, state })
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }
  if (action === 'cache-run-cleanup') {
    const preview = state.cacheCleanupPreview
    if (!preview || !await showConfirm(`将分批删除 ${Number(preview.files || 0)} 个缓存文件，预计释放 ${formatBytes(preview.bytes || 0)}。继续吗？`, { title: '创建缓存清理任务' })) return true
    try {
      await api.createCacheCleanupJob({ previewId: preview.previewId })
      state.cacheCleanupPreview = null
      state.cacheTab = 'history'
      setNotice('缓存清理任务已创建')
      await refreshCacheState({ api, renderDashboard, state })
      scheduleCacheRefresh({ api, renderDashboard, setNotice, state })
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }
  if (action === 'cache-cancel-job') {
    const jobId = target.getAttribute('data-job-id')
    if (!jobId || !await showConfirm('当前批次可能会完成，后续批次将停止。', { title: '取消缓存清理任务' })) return true
    try {
      await api.cancelCacheCleanupJob(jobId)
      setNotice('已请求取消缓存清理任务')
      await refreshCacheState({ api, renderDashboard, state })
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }
  if (action === 'cache-enable-normalized') {
    const analysis = state.cacheKeyAnalysis
    if (!analysis) return true
    if (!await showConfirm('新请求将使用该图源的 v2 归一键，旧完整 URL 缓存仍会兼容读取。', { title: '启用 URL 归一键' })) return true
    try {
      await api.updateCacheKeyPolicy(analysis.sourceId, {
        ...analysis.rule,
        mode: 'normalized_v2',
        analysisId: analysis.analysisId,
      })
      state.cacheKeyPolicies = await api.cacheKeyPolicies()
      state.cacheKeyAnalysis = null
      setNotice('图源 URL 归一键已启用')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }
  if (action === 'cache-use-full-url') {
    const form = state.root?.querySelector('[data-cache-key-form]')
    const sourceId = form?.elements.sourceId.value || state.cacheKeySourceId
    if (!sourceId) return true
    try {
      await api.updateCacheKeyPolicy(sourceId, { mode: 'full_url' })
      state.cacheKeyPolicies = await api.cacheKeyPolicies()
      state.cacheKeyAnalysis = null
      setNotice('该图源继续使用完整 URL 缓存键')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }
  if (action === 'cache-jobs-page') {
    try {
      const page = Number(target.getAttribute('data-page') || 1)
      state.cacheCleanupJobs = await api.cacheCleanupJobs({ page, limit: state.cacheCleanupJobs?.limit || 20 })
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }
  return false
}

export async function handleCacheChange ({ event, renderDashboard, state }) {
  const sourceSelect = event.target.closest('[data-cache-key-source]')
  if (!sourceSelect) return false
  state.cacheKeySourceId = sourceSelect.value
  state.cacheKeyAnalysis = null
  renderDashboard()
  return true
}
