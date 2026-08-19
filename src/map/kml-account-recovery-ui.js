import { showAlert, showChoiceDialog } from '../ui/dialog.js'
import {
  bindKmlAccountWorkingFilesReplacement,
  isAccountKmlMode,
  getKmlAccountConflictSession,
  resolveKmlAccountConflict,
  resolveKmlAccountConflictChoices,
  resolveKmlAccountRecovery,
  scheduleKmlAccountSync,
  setKmlAccountWorkingFiles,
} from './kml-account-sync.js'

async function applyResolution (result, replaceFiles) {
  const workingFiles = await replaceFiles(result.files, result)
  const files = Array.isArray(workingFiles) ? workingFiles : result.files
  if (result.blockedByConflict) {
    setKmlAccountWorkingFiles(files, { persist: false })
  } else if (result.shouldSync) {
    scheduleKmlAccountSync(files, { delayMs: 0 })
  } else {
    setKmlAccountWorkingFiles(files, { persist: false })
  }
  return { ...result, files }
}

const CONFLICT_FIELD_LABELS = {
  name: '名称',
  description: '说明',
  isDefault: '默认状态',
  coordCorrection: '坐标纠偏',
  theme: '主题',
  color: '颜色',
  lockDrag: '拖动锁定',
  enabled: '显示状态',
  isLiveTrack: '实时轨迹',
  type: '类型',
  coordinates: '位置',
  styleUrl: '样式',
  markerIcon: '图标',
  resourceCollection: '媒体集合',
  order: '顺序',
}

function compactConflictValue (value) {
  if (value == null) return '已删除'
  if (typeof value === 'boolean') return value ? '开启' : '关闭'
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim() || '空值'
    return text.length > 24 ? `${text.slice(0, 24)}…` : text
  }
  if (Array.isArray(value)) return `${value.length} 项`
  return '内容有修改'
}

function conflictFileName (item, merge) {
  const fileId = String(item?.fileId || item?.localId || '')
  const files = [
    ...(merge?.files || []),
    ...(merge?.draft?.files || []),
    ...(merge?.serverFiles || []),
  ]
  return String(files.find(file => (
    String(file?.id || '') === fileId || String(file?.serverId || '') === fileId
  ))?.name || fileId || '未命名 KML')
}

function conflictLabel (item = {}, merge = {}) {
  const path = String(item.path || '')
  const field = String(item.field || path.split('.').at(-1) || '')
  const fieldLabel = CONFLICT_FIELD_LABELS[field] || (item.kind === 'delete-modify' ? '删除与修改' : '内容')
  const kind = String(item.kind || '')
  const valueHint = kind === 'field'
    ? `：原值“${compactConflictValue(item.base)}”，本地“${compactConflictValue(item.local)}”，服务器“${compactConflictValue(item.server)}”`
    : ''
  return `${conflictFileName(item, merge)} · ${fieldLabel}${valueHint}`
}

function conflictGroups (conflicts = [], merge = {}) {
  const groups = new Map()
  conflicts.forEach(item => {
    const group = conflictFileName(item, merge)
    groups.set(group, (groups.get(group) || 0) + 1)
  })
  return [...groups.entries()].map(([name, count]) => `${name} ${count} 项`).join('、')
}

async function promptKmlConflictChoices (session) {
  const merge = session?.merge
  const conflicts = Array.isArray(merge?.conflicts) ? merge.conflicts : []
  const autoMergedCount = Number(merge?.autoMergedCount || 0)
  if (merge?.legacy || !merge) return null
  if (merge.retryExhausted && !conflicts.length) {
    const strategy = await showChoiceDialog({
      title: 'KML 保存仍有冲突',
      message: '自动合并后的保存仍遇到服务器更新。请确认后再次保存合并结果，或选择其他处理方式。',
      cancelText: '保留草稿，稍后处理',
      choices: [
        { value: 'retry-merged', text: '保存合并结果', class: 'app-dialog-primary' },
        { value: 'reload', text: '加载服务器版本' },
        { value: 'save-as', text: '本地版本另存为' },
      ],
    })
    if (!strategy || strategy === 'cancel') return null
    return strategy === 'retry-merged' ? { choices: {} } : { strategy }
  }
  if (!conflicts.length) return { choices: {} }

  const summary = [
    `已自动合并 ${autoMergedCount} 项，仍有 ${conflicts.length} 项待处理。`,
    conflictGroups(conflicts, merge) ? `涉及：${conflictGroups(conflicts, merge)}。` : '',
  ].filter(Boolean).join('')
  const start = await showChoiceDialog({
    title: '合并 KML 保存冲突',
    message: summary,
    cancelText: '保留草稿，稍后处理',
    choices: [
      { value: 'resolve', text: '逐项处理', class: 'app-dialog-primary' },
      { value: 'reload', text: '加载服务器版本' },
      { value: 'save-as', text: '本地版本另存为' },
    ],
  })
  if (!start || start === 'cancel') return null
  if (start !== 'resolve') return { strategy: start }

  const choices = {}
  for (const conflict of conflicts) {
    const choice = await showChoiceDialog({
      title: '选择冲突版本',
      message: conflictLabel(conflict, merge),
      cancelText: '保留草稿，稍后处理',
      choices: [
        { value: 'local', text: '保留本地版本', class: 'app-dialog-primary' },
        { value: 'server', text: '使用服务器版本' },
      ],
    })
    if (!choice || choice === 'cancel') return null
    choices[String(conflict.path)] = choice
  }
  return { choices }
}

export async function promptKmlAccountRecovery (recovery, replaceFiles) {
  if (!recovery?.draft || !(replaceFiles instanceof Function)) return null
  try {
    // A recovery loaded with a merge session should enter the same structured
    // conflict flow as an in-session save conflict. Legacy sessions continue
    // through the original restore/reload/save-as choices below.
    if (recovery.merge && !recovery.merge.legacy) {
      const conflictResolution = await promptKmlConflictChoices(recovery)
      if (!conflictResolution) return null
      const result = conflictResolution.strategy
        ? await resolveKmlAccountConflict(conflictResolution.strategy)
        : await resolveKmlAccountConflictChoices(conflictResolution.choices)
      return applyResolution(result, replaceFiles)
    }
    const analysis = recovery.analysis || {}
    const changedCount = Number(analysis.operations?.length || 0)
    const conflictCount = Number(analysis.conflictedLocalIds?.length || 0)
    const conflictHint = conflictCount
      ? `其中 ${conflictCount} 项基于旧的服务器版本，恢复后会暂停同步并要求处理冲突。`
      : '服务器版本未变化，恢复后会继续自动同步。'
    const incompleteHint = recovery.draft?.incompleteWrite
      ? '浏览器关闭前最后一次草稿写入未完成，将从最近一份完整草稿恢复。'
      : ''
    const choices = [
      {
        value: 'restore',
        text: recovery.draft?.incompleteWrite ? '使用最近完整草稿' : '恢复草稿',
        class: 'app-dialog-primary',
      },
      ...(changedCount ? [{ value: 'save-as-all', text: '另存为新 KML' }] : []),
      { value: 'discard', text: '丢弃草稿', class: 'app-dialog-danger' },
    ]
    const choice = await showChoiceDialog({
      title: '恢复未同步的 KML',
      message: `${changedCount ? `检测到当前账号有 ${changedCount} 项未完成的 KML 修改。` : ''}${conflictHint}${incompleteHint}`,
      dismissible: false,
      choices,
    })
    const result = await resolveKmlAccountRecovery(choice, recovery)
    return applyResolution(result, replaceFiles)
  } catch (error) {
    if (!isAccountKmlMode()) return null
    await showAlert(error.message || 'KML 恢复失败，请稍后重试', {
      title: '无法恢复 KML 草稿',
    })
    return null
  }
}

export function bindKmlAccountConflictRecovery (replaceFiles) {
  if (typeof window === 'undefined' || !(replaceFiles instanceof Function)) return () => {}
  const unbindWorkingFilesReplacement = bindKmlAccountWorkingFilesReplacement(replaceFiles)
  let resolving = false
  const onRequest = async () => {
    if (resolving) return
    resolving = true
    try {
      const session = getKmlAccountConflictSession()
      const supportsStructuredMerge = Boolean(session?.merge && !session.merge.legacy)
      if (!supportsStructuredMerge) {
        const fallback = await showChoiceDialog({
          title: '处理 KML 保存冲突',
          message: '服务器上的 KML 已被其他客户端更新。自动同步已暂停，本地修改仍保存在当前账号的恢复草稿中。',
          cancelText: '保留草稿，稍后处理',
          choices: [
            { value: 'reload', text: '加载服务器版本', class: 'app-dialog-primary' },
            { value: 'save-as', text: '本地版本另存为' },
          ],
        })
        if (!fallback || fallback === 'cancel') return
        const result = await resolveKmlAccountConflict(fallback)
        await applyResolution(result, replaceFiles)
        return
      }
      const conflictResolution = await promptKmlConflictChoices(session)
      if (!conflictResolution) return
      const result = conflictResolution.strategy
        ? await resolveKmlAccountConflict(conflictResolution.strategy)
        : await resolveKmlAccountConflictChoices(conflictResolution.choices)
      await applyResolution(result, replaceFiles)
    } catch (error) {
      if (!isAccountKmlMode()) return
      await showAlert(error.message || 'KML 冲突处理失败，请稍后重试', {
        title: '无法处理保存冲突',
      })
    } finally {
      resolving = false
    }
  }
  window.addEventListener('map-kml-sync-resolution-request', onRequest)
  return () => {
    window.removeEventListener('map-kml-sync-resolution-request', onRequest)
    unbindWorkingFilesReplacement()
  }
}
