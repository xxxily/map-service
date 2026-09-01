const NUMERIC_FIELDS = Object.freeze([
  ['pointCount', '点位数量'],
  ['distanceKm', '轨迹里程'],
  ['likeCount', '点赞数量'],
  ['favoriteCount', '收藏数量'],
])

function numeric (value) {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function dateValue (value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime()
}

function dateOnlyValue (value, label) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) throw new Error(`${label}必须使用 YYYY-MM-DD 格式`)
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (parsed.getUTCFullYear() !== Number(match[1]) ||
      parsed.getUTCMonth() !== Number(match[2]) - 1 ||
      parsed.getUTCDate() !== Number(match[3])) {
    throw new Error(`${label}不是有效日期`)
  }
  return parsed.getTime()
}

export function normalizeTwoBuluBatchFilters (input = {}) {
  const result = {
    sort: ['position', 'publishedAt', 'distanceKm', 'likeCount', 'favoriteCount', 'pointCount'].includes(input.sort)
      ? input.sort
      : 'position',
    order: input.order === 'desc' ? 'desc' : 'asc',
    dateFrom: String(input.dateFrom || '').trim(),
    dateTo: String(input.dateTo || '').trim(),
  }
  NUMERIC_FIELDS.forEach(([field, label]) => {
    const minRaw = input[`${field}Min`]
    const maxRaw = input[`${field}Max`]
    const min = minRaw === '' || minRaw === undefined || minRaw === null ? null : numeric(minRaw)
    const max = maxRaw === '' || maxRaw === undefined || maxRaw === null ? null : numeric(maxRaw)
    if (minRaw !== '' && minRaw !== undefined && minRaw !== null && min === null) {
      throw new Error(`${label}最小值必须是非负数字`)
    }
    if (maxRaw !== '' && maxRaw !== undefined && maxRaw !== null && max === null) {
      throw new Error(`${label}最大值必须是非负数字`)
    }
    result[`${field}Min`] = min
    result[`${field}Max`] = max
  })
  const from = dateOnlyValue(result.dateFrom, '发布时间起始日期')
  const to = dateOnlyValue(result.dateTo, '发布时间结束日期')
  if (from !== null && to !== null && from > to) throw new Error('发布时间起始日期不能晚于结束日期')
  NUMERIC_FIELDS.forEach(([field, label]) => {
    if (result[`${field}Min`] !== null && result[`${field}Max`] !== null && result[`${field}Min`] > result[`${field}Max`]) {
      throw new Error(`${label}最小值不能大于最大值`)
    }
  })
  return result
}

export function filterAndSortTwoBuluItems (items, filters = {}) {
  const normalized = normalizeTwoBuluBatchFilters(filters)
  const from = normalized.dateFrom ? dateValue(`${normalized.dateFrom}T00:00:00Z`) : null
  const to = normalized.dateTo ? dateValue(`${normalized.dateTo}T23:59:59.999Z`) : null
  const filtered = (Array.isArray(items) ? items : []).filter(item => {
    for (const [field] of NUMERIC_FIELDS) {
      const value = numeric(item?.[field])
      const min = normalized[`${field}Min`]
      const max = normalized[`${field}Max`]
      if (min !== null && (value === null || value < min)) return false
      if (max !== null && (value === null || value > max)) return false
    }
    const published = dateValue(item?.publishedAt)
    if (from !== null && (published === null || published < from)) return false
    if (to !== null && (published === null || published > to)) return false
    return true
  }).map((item, index) => ({ ...item, position: Number.isSafeInteger(Number(item?.position)) ? Number(item.position) : index }))
  const direction = normalized.order === 'asc' ? 1 : -1
  const compare = (left, right) => {
    if (normalized.sort === 'position') return (left.position - right.position) * direction
    if (normalized.sort === 'publishedAt') {
      const a = dateValue(left.publishedAt)
      const b = dateValue(right.publishedAt)
      if (a === null && b !== null) return 1
      if (a !== null && b === null) return -1
      if (a !== null && b !== null && a !== b) return (a - b) * direction
    } else {
      const a = numeric(left[normalized.sort])
      const b = numeric(right[normalized.sort])
      if (a === null && b !== null) return 1
      if (a !== null && b === null) return -1
      if (a !== null && b !== null && a !== b) return (a - b) * direction
    }
    const positionOrder = left.position - right.position
    if (positionOrder) return positionOrder
    return String(left.url || '').localeCompare(String(right.url || ''))
  }
  return filtered.sort(compare)
}

export function summarizeTwoBuluBatch (items, results = []) {
  const source = Array.isArray(results) ? results : []
  return {
    total: Array.isArray(items) ? items.length : 0,
    imported: source.filter(item => item?.status === 'success').length,
    skipped: source.filter(item => item?.status === 'skipped').length,
    failed: source.filter(item => item?.status === 'failed').length,
    cancelled: source.filter(item => item?.status === 'cancelled').length,
  }
}
