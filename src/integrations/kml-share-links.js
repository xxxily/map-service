import {
  extractGeneratedKmlShareEmbeds,
  extractKmlShareLinkCandidates,
  mergeKmlShareEmbeds,
  normalizeKmlShareLinksInText,
  normalizeKmlShareEmbedItem,
  stripGeneratedKmlShareEmbeds,
} from '../../shared/kml-share-links.js'
import { apiRequest } from '../auth/api.js'
import { getAuthSnapshot } from '../auth/session.js'

function itemKey (item) {
  return `${item?.provider || ''}:${item?.resourceId || ''}`
}

function warningFromError (error) {
  if (error?.code === 'AUTH_REQUIRED') return '登录后才能自动解析抖音短链接，原分享文本已保留'
  if (error?.code === 'PERMISSION_DENIED') return '当前账号没有 KML 写权限，原分享文本已保留'
  if (error?.code === 'SHARE_LINK_RATE_LIMITED') return '分享链接解析过于频繁，原分享文本已保留'
  if (error?.code === 'SHARE_LINK_TIMEOUT') return '抖音分享链接读取超时，原分享文本已保留'
  return '抖音分享链接暂时无法转换，原分享文本已保留'
}

function findReusableItem (candidate, existingItems) {
  return existingItems.find(item => {
    if (candidate.sourceUrl && item.sourceUrl === candidate.sourceUrl) return true
    if (candidate.item && itemKey(candidate.item) === itemKey(item)) return true
    return false
  }) || null
}

/**
 * Remove machine-generated provider iframe tags before showing a description in
 * the edit dialog. User-authored HTML and ordinary links are left untouched.
 */
export function getEditableKmlDescription (description) {
  return stripGeneratedKmlShareEmbeds(description)
}

/**
 * Resolve supported share links and merge their provider-owned iframe markers.
 * A resolver failure is intentionally non-fatal: the caller can save the
 * original description and surface the returned warning through the common UI.
 */
export async function enrichKmlDescriptionWithShareLinks (description, options = {}) {
  const original = String(description || '')
  const editableDescription = normalizeKmlShareLinksInText(stripGeneratedKmlShareEmbeds(original))
  const extracted = extractKmlShareLinkCandidates(editableDescription, { limit: options.limit })
  if (!extracted.candidates.length) {
    return {
      description: editableDescription,
      items: [],
      warnings: [],
      supportedCount: 0,
    }
  }

  const existingItems = extractGeneratedKmlShareEmbeds(options.previousDescription ?? original)
  const items = []
  const pending = []
  const seen = new Set()
  const addItem = (item) => {
    const normalized = normalizeKmlShareEmbedItem(item)
    if (!normalized || seen.has(itemKey(normalized))) return
    seen.add(itemKey(normalized))
    items.push(normalized)
  }

  extracted.candidates.forEach(candidate => {
    if (candidate.item) {
      addItem(candidate.item)
      return
    }
    const reusable = findReusableItem(candidate, existingItems)
    if (reusable) addItem(reusable)
    else pending.push(candidate)
  })

  const warnings = extracted.truncated
    ? [`一次最多转换 ${extracted.limit} 个受支持分享链接，其余链接已按原文保留`]
    : []
  if (pending.length) {
    const auth = getAuthSnapshot()
    if (!auth.authenticated) {
      warnings.push('登录后才能自动解析抖音短链接，原分享文本已保留')
    } else {
      try {
        const result = await apiRequest('/kml/share-links/resolve', {
          method: 'POST',
          body: { text: editableDescription },
        })
        ;(result?.items || []).forEach(addItem)
        ;(result?.warnings || []).forEach(message => {
          const normalized = String(message || '').trim()
          if (normalized && !warnings.includes(normalized)) warnings.push(normalized)
        })
      } catch (error) {
        warnings.push(warningFromError(error))
        existingItems.forEach(item => {
          if (pending.some(candidate => candidate.sourceUrl === item.sourceUrl)) addItem(item)
        })
      }
    }
  }

  return {
    description: mergeKmlShareEmbeds(editableDescription, items),
    items,
    warnings,
    supportedCount: extracted.supportedCount,
  }
}

export function hasKmlShareLinks (description) {
  return extractKmlShareLinkCandidates(stripGeneratedKmlShareEmbeds(description)).candidates.length > 0
}
