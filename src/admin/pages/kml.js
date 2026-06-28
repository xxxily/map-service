import { escapeHtml } from '../utils.js'
import { generateKmlText } from '../../map/kml-format.js'
import { showEditDialog } from '../../ui/dialog.js'

export function renderKmlPage (state) {
  const kmls = state.kmls || []

  return `
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>公共 KML 图层管理</h2>
        <span class="admin-badge">${kmls.length}</span>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-primary" data-admin-action="create-blank-kml">新建空白 KML</button>
          <button type="button" class="btn-primary" data-admin-action="trigger-import">导入 KML 文件</button>
          <input type="file" id="admin-kml-file-input" accept=".kml" style="display: none;">
        </div>
      </div>
      <div class="admin-table-container" style="overflow-x: auto; margin-top: 16px;">
        <table class="admin-table" style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
          <thead>
            <tr style="border-bottom: 2px solid #e2e8f0; color: #4a5568; font-weight: 600;">
              <th style="padding: 10px 8px;">图层名称</th>
              <th style="padding: 10px 8px;">要素数量</th>
              <th style="padding: 10px 8px;">坐标纠偏</th>
              <th style="padding: 10px 8px;">状态</th>
              <th style="padding: 10px 8px;">最后更新时间</th>
              <th style="padding: 10px 8px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            ${kmls.map(kml => {
              let statusText = '草稿'
              let statusStyle = 'background: #f3f4f6; color: #4b5563;'
              if (kml.status === 'published') {
                statusText = '已发布'
                statusStyle = 'background: #dcfce7; color: #15803d;'
              } else if (kml.status === 'disabled') {
                statusText = '已禁用'
                statusStyle = 'background: #ffedd5; color: #c2410c;'
              }

              const formattedTime = kml.updatedAt ? new Date(kml.updatedAt).toLocaleString() : '-'

              return `
                <tr style="border-bottom: 1px solid #e2e8f0; height: 48px;">
                  <td style="padding: 10px 8px; font-weight: 500; color: #1a202c;">${escapeHtml(kml.name)}</td>
                  <td style="padding: 10px 8px; color: #4a5568;">${kml.features ? kml.features.length : (kml.featureCount || 0)}</td>
                  <td style="padding: 10px 8px; color: #4a5568;">
                    <label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                      <input type="checkbox" data-admin-action="toggle-correction" data-kml-id="${kml.id}" ${kml.coordCorrection !== 'none' ? 'checked' : ''}>
                      <span>纠偏</span>
                    </label>
                  </td>
                  <td style="padding: 10px 8px;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; ${statusStyle}">
                      ${statusText}
                    </span>
                  </td>
                  <td style="padding: 10px 8px; color: #718096;">${escapeHtml(formattedTime)}</td>
                  <td style="padding: 10px 8px; text-align: right;">
                    <div style="display: inline-flex; gap: 6px;">
                      ${kml.status === 'published' ? `
                        <button type="button" class="btn-xs" style="background: #ed8936; color: white;" data-admin-action="set-status" data-kml-id="${kml.id}" data-kml-status="disabled">禁用</button>
                      ` : `
                        <button type="button" class="btn-xs" style="background: #48bb78; color: white;" data-admin-action="set-status" data-kml-id="${kml.id}" data-kml-status="published">发布</button>
                      `}
                      <button type="button" class="btn-xs" data-admin-action="rename" data-kml-id="${kml.id}" data-kml-name="${escapeHtml(kml.name)}">重命名</button>
                      <a class="btn-xs-link" href="/?editPublicKml=${kml.id}" style="text-decoration: none; padding: 4px 8px; background: #3182ce; color: white; border-radius: 4px; display: inline-block; font-size: 11px; font-weight: 500;" target="_blank">编辑数据</a>
                      <button type="button" class="btn-xs" data-admin-action="export" data-kml-id="${kml.id}">导出</button>
                      <button type="button" class="btn-xs btn-danger" style="padding: 4px 8px; font-size: 11px;" data-admin-action="delete" data-kml-id="${kml.id}">删除</button>
                    </div>
                  </td>
                </tr>
              `
            }).join('') || `<tr><td colspan="6" style="padding: 24px; text-align: center; color: #a0aec0;">暂无公共 KML 图层</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `
}

export async function handleKmlClick ({ api, event, renderDashboard, setNotice, showConfirm, state }) {
  const actionTarget = event.target.closest('[data-admin-action]')
  if (!actionTarget) return false

  const action = actionTarget.getAttribute('data-admin-action')
  const kmlId = actionTarget.getAttribute('data-kml-id')

  if (action === 'create-blank-kml') {
    const result = await showEditDialog({
      title: '新建公共 KML',
      fields: [
        { name: 'name', label: '图层名称', type: 'text' }
      ],
      values: {
        name: `新建公共 KML ${state.kmls.length + 1}`
      }
    })
    if (!result || !result.name?.trim()) return true

    try {
      setNotice('正在创建...')
      await api.createKml({
        name: result.name.trim(),
        status: 'draft',
        coordCorrection: 'wgs84-to-gcj02',
        features: []
      })
      state.kmls = await api.kmls()
      setNotice('新建成功')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  if (action === 'trigger-import') {
    const fileInput = document.getElementById('admin-kml-file-input')
    fileInput?.click()
    return true
  }

  if (action === 'set-status') {
    const status = actionTarget.getAttribute('data-kml-status')
    try {
      setNotice('正在更新状态...')
      await api.updateKml(kmlId, { status })
      state.kmls = await api.kmls()
      setNotice('状态已更新')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  if (action === 'rename') {
    const currentName = actionTarget.getAttribute('data-kml-name')
    const result = await showEditDialog({
      title: '重命名公共 KML',
      fields: [
        { name: 'name', label: '图层名称', type: 'text' }
      ],
      values: {
        name: currentName
      }
    })
    if (!result || !result.name?.trim() || result.name.trim() === currentName) return true

    try {
      setNotice('正在重命名...')
      await api.updateKml(kmlId, { name: result.name.trim() })
      state.kmls = await api.kmls()
      setNotice('重命名成功')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  if (action === 'export') {
    try {
      setNotice('正在获取数据...')
      const kml = await api.getKml(kmlId)
      setNotice('')
      const kmlText = generateKmlText(kml.name, kml.features || [])
      const blob = new Blob([kmlText], { type: 'application/vnd.google-earth.kml+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${kml.name}.kml`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  if (action === 'delete') {
    if (!await showConfirm('确认永久删除此公共 KML 图层及其中所有要素？此操作不可撤销。')) return true
    try {
      setNotice('正在删除...')
      await api.deleteKml(kmlId)
      state.kmls = await api.kmls()
      setNotice('删除成功')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  return false
}

export async function handleKmlChange ({ api, event, renderDashboard, setNotice, state }) {
  const target = event.target
  if (target.id === 'admin-kml-file-input') {
    const file = target.files[0]
    if (!file) return true

    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', file.name)
    formData.append('status', 'draft')
    formData.append('coordCorrection', 'wgs84-to-gcj02')

    try {
      setNotice('正在导入 KML 文件...')
      await api.importKml(formData)
      state.kmls = await api.kmls()
      setNotice('导入成功（默认为草稿状态）')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    } finally {
      target.value = ''
    }
    return true
  }

  if (target.matches('[data-admin-action="toggle-correction"]')) {
    const kmlId = target.getAttribute('data-kml-id')
    const coordCorrection = target.checked ? 'wgs84-to-gcj02' : 'none'
    try {
      setNotice('正在更新纠偏设置...')
      await api.updateKml(kmlId, { coordCorrection })
      state.kmls = await api.kmls()
      setNotice('纠偏设置已更新')
      renderDashboard()
    } catch (err) {
      setNotice('', err.message)
      renderDashboard()
    }
    return true
  }

  return false
}
