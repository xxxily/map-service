import { showAlert, showChoiceDialog } from '../ui/dialog.js'
import {
  isAccountKmlMode,
  resolveKmlAccountConflict,
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

export async function promptKmlAccountRecovery (recovery, replaceFiles) {
  if (!recovery?.draft || !(replaceFiles instanceof Function)) return null
  try {
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
  let resolving = false
  const onRequest = async () => {
    if (resolving) return
    resolving = true
    try {
      const choice = await showChoiceDialog({
        title: '处理 KML 保存冲突',
        message: '服务器上的 KML 已被其他客户端更新。自动同步已暂停，本地修改仍保存在当前账号的恢复草稿中。',
        cancelText: '保留草稿，稍后处理',
        choices: [
          { value: 'reload', text: '加载服务器版本', class: 'app-dialog-primary' },
          { value: 'save-as', text: '本地版本另存为' },
        ],
      })
      if (!choice || choice === 'cancel') return
      const result = await resolveKmlAccountConflict(choice)
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
  return () => window.removeEventListener('map-kml-sync-resolution-request', onRequest)
}
