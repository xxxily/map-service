import { createHttpError } from './security.js'

export const DEFAULT_ANALYTICS_SETTINGS = Object.freeze({
  global: Object.freeze({
    enabled: false,
    script: null,
  }),
  share: Object.freeze({
    enabled: false,
    providerScriptUrl: 'https://msc.anzz.site/script.js',
    providerWebsiteIdAttribute: 'data-website-id',
    customScriptEnabled: false,
  }),
})

const SCRIPT_ATTRIBUTE_PATTERN_SOURCE = '([A-Za-z_:][A-Za-z0-9_.:-]*)(?:\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'=<>`]+)))?'
const DATA_ATTRIBUTE_PATTERN = /^data-[a-z0-9][a-z0-9_.:-]{0,63}$/
const WEBSITE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/
const ALLOWED_STANDARD_ATTRIBUTES = new Set(['crossorigin', 'integrity', 'referrerpolicy', 'type'])

function validationError (message) {
  return createHttpError(message, 400, 'VALIDATION_FAILED')
}

function isPlainObject (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function normalizeBoolean (value, fallback, label) {
  if (value === undefined) return Boolean(fallback)
  if (typeof value !== 'boolean') throw validationError(`${label}格式不正确`)
  return value
}

function normalizeScriptUrl (value, label = '统计脚本地址') {
  const raw = String(value || '').trim()
  if (!raw || raw.length > 2048) throw validationError(`${label}长度不正确`)
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw validationError(`${label}格式不正确`)
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw validationError(`${label}必须是无账号信息的 HTTPS 地址`)
  }
  parsed.hash = ''
  return parsed.href
}

function normalizeAttributeName (value, options = {}) {
  const name = String(value || '').trim().toLowerCase()
  if (options.websiteId === true) {
    if (!DATA_ATTRIBUTE_PATTERN.test(name)) throw validationError('网站 ID 属性必须是 data-* 属性')
    return name
  }
  if (!DATA_ATTRIBUTE_PATTERN.test(name) && !ALLOWED_STANDARD_ATTRIBUTES.has(name)) {
    throw validationError(`统计脚本属性 ${name || '(空)'} 不受支持`)
  }
  return name
}

function normalizeAttributes (value = {}) {
  if (!isPlainObject(value)) throw validationError('统计脚本属性格式不正确')
  const entries = Object.entries(value)
  if (entries.length > 20) throw validationError('统计脚本属性数量不能超过 20 个')
  const result = {}
  entries.forEach(([rawName, rawValue]) => {
    const name = normalizeAttributeName(rawName)
    const text = String(rawValue ?? '').trim()
    if (text.length > 1000) throw validationError(`统计脚本属性 ${name} 过长`)
    result[name] = text
  })
  return result
}

function descriptorFromScriptText (value) {
  const source = String(value || '').trim()
  if (!source) return null
  if (!source.startsWith('<')) {
    return { src: normalizeScriptUrl(source), defer: true, async: false, attributes: {} }
  }
  const matched = /^<script\b([^>]*)>([\s\S]*?)<\/script>$/i.exec(source)
  if (!matched || String(matched[2] || '').trim()) {
    throw validationError('只允许不含内联代码的外部 script 标签')
  }
  const rawAttributes = matched[1] || ''
  const parsed = {}
  const attributePattern = new RegExp(SCRIPT_ATTRIBUTE_PATTERN_SOURCE, 'g')
  let attributeMatch
  while ((attributeMatch = attributePattern.exec(rawAttributes))) {
    const name = String(attributeMatch[1] || '').toLowerCase()
    if (Object.hasOwn(parsed, name)) throw validationError(`统计脚本属性 ${name} 重复`)
    parsed[name] = attributeMatch[2] ?? attributeMatch[3] ?? attributeMatch[4] ?? true
  }
  const residue = rawAttributes.replace(new RegExp(SCRIPT_ATTRIBUTE_PATTERN_SOURCE, 'g'), '').trim()
  if (residue) throw validationError('统计脚本标签包含无法识别的属性')
  const src = normalizeScriptUrl(parsed.src, '统计脚本 src')
  const attributes = {}
  Object.entries(parsed).forEach(([name, attributeValue]) => {
    if (['src', 'defer', 'async'].includes(name)) return
    const normalizedName = normalizeAttributeName(name)
    const text = attributeValue === true ? '' : String(attributeValue)
    if (text.length > 1000) throw validationError(`统计脚本属性 ${normalizedName} 过长`)
    attributes[normalizedName] = text
  })
  return {
    src,
    defer: parsed.defer !== undefined,
    async: parsed.async !== undefined,
    attributes,
  }
}

export function normalizeScriptDescriptor (value, options = {}) {
  if (value === undefined || value === null || value === '') return null
  const descriptor = typeof value === 'string'
    ? descriptorFromScriptText(value)
    : value
  if (!isPlainObject(descriptor)) throw validationError('统计脚本格式不正确')
  const result = {
    src: normalizeScriptUrl(descriptor.src || descriptor.scriptUrl),
    defer: normalizeBoolean(descriptor.defer, true, 'defer'),
    async: normalizeBoolean(descriptor.async, false, 'async'),
    attributes: normalizeAttributes(descriptor.attributes || {}),
  }
  if (options.allowedOrigin) {
    const expected = new URL(normalizeScriptUrl(options.allowedOrigin)).origin
    if (new URL(result.src).origin !== expected) throw validationError('统计脚本来源不在允许范围内')
  }
  return result
}

export function scriptDescriptorToHtml (descriptor) {
  const normalized = normalizeScriptDescriptor(descriptor)
  if (!normalized) return ''
  const attributes = [
    normalized.defer ? 'defer' : '',
    normalized.async ? 'async' : '',
    `src="${normalized.src.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`,
    ...Object.entries(normalized.attributes).map(([name, value]) => (
      `${name}="${String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`
    )),
  ].filter(Boolean)
  return `<script ${attributes.join(' ')}></script>`
}

export function mergeAnalyticsSettings (saved = {}) {
  return {
    global: {
      ...DEFAULT_ANALYTICS_SETTINGS.global,
      ...(saved.global || {}),
    },
    share: {
      ...DEFAULT_ANALYTICS_SETTINGS.share,
      ...(saved.share || {}),
    },
  }
}

export function normalizeAnalyticsSettings (input, current = DEFAULT_ANALYTICS_SETTINGS, options = {}) {
  if (!isPlainObject(input)) throw validationError('访问统计设置格式不正确')
  const mergedCurrent = mergeAnalyticsSettings(current)
  const result = mergeAnalyticsSettings(mergedCurrent)

  if (input.global !== undefined) {
    if (!isPlainObject(input.global)) throw validationError('全站访问统计设置格式不正确')
    result.global.enabled = normalizeBoolean(input.global.enabled, mergedCurrent.global.enabled, '全站访问统计开关')
    if (Object.hasOwn(input.global, 'script') || Object.hasOwn(input.global, 'scriptUrl') || Object.hasOwn(input.global, 'attributes')) {
      const scriptValue = Object.hasOwn(input.global, 'script')
        ? input.global.script
        : {
            src: input.global.scriptUrl,
            defer: input.global.defer,
            async: input.global.async,
            attributes: input.global.attributes || {},
          }
      result.global.script = normalizeScriptDescriptor(scriptValue)
    }
    if (result.global.enabled && !result.global.script) throw validationError('启用全站访问统计前需配置外部脚本')
  }

  if (input.share !== undefined) {
    if (!isPlainObject(input.share)) throw validationError('分享访问统计策略格式不正确')
    result.share.enabled = normalizeBoolean(input.share.enabled, mergedCurrent.share.enabled, '分享访问统计开关')
    if (input.share.providerScriptUrl !== undefined) {
      result.share.providerScriptUrl = normalizeScriptUrl(input.share.providerScriptUrl, '分享统计服务地址')
    }
    if (input.share.providerWebsiteIdAttribute !== undefined) {
      result.share.providerWebsiteIdAttribute = normalizeAttributeName(input.share.providerWebsiteIdAttribute, { websiteId: true })
    }
    if (input.share.customScriptEnabled !== undefined) {
      if (options.allowCustomScriptChange !== true) {
        throw createHttpError('只有超级管理员可以修改自定义分享统计脚本策略', 403, 'PERMISSION_DENIED')
      }
      result.share.customScriptEnabled = normalizeBoolean(
        input.share.customScriptEnabled,
        mergedCurrent.share.customScriptEnabled,
        '自定义分享统计脚本开关'
      )
    }
  }
  return result
}

export function normalizeShareAnalyticsConfig (value, policy, current = {}) {
  if (value === undefined) return isPlainObject(current) ? { ...current } : {}
  if (value === null) return {}
  if (!isPlainObject(value)) throw validationError('分享访问统计设置格式不正确')
  const mode = String(value.mode || 'none')
  if (mode === 'none') return {}
  if (policy?.enabled !== true) throw validationError('管理员尚未开放分享访问统计能力')
  if (mode === 'provider') {
    const websiteId = String(value.websiteId || '').trim()
    if (!WEBSITE_ID_PATTERN.test(websiteId)) throw validationError('统计网站 ID 格式不正确')
    return { mode, websiteId }
  }
  if (mode === 'custom') {
    if (policy.customScriptEnabled !== true) throw validationError('管理员未开放自定义分享统计脚本')
    const script = normalizeScriptDescriptor(value.script)
    if (!script) throw validationError('自定义分享统计脚本不能为空')
    return { mode, script }
  }
  throw validationError('分享访问统计模式不正确')
}

export function resolveShareAnalyticsDescriptor (config, policy, options = {}) {
  if (policy?.enabled !== true || options.disabled === true || !isPlainObject(config)) return null
  if (config.mode === 'provider') {
    if (!WEBSITE_ID_PATTERN.test(String(config.websiteId || ''))) return null
    try {
      return normalizeScriptDescriptor({
        src: policy.providerScriptUrl,
        defer: true,
        attributes: {
          [normalizeAttributeName(policy.providerWebsiteIdAttribute, { websiteId: true })]: config.websiteId,
        },
      })
    } catch {
      return null
    }
  }
  if (config.mode === 'custom' && policy.customScriptEnabled === true) {
    try {
      return normalizeScriptDescriptor(config.script)
    } catch {
      return null
    }
  }
  return null
}

export function publicAnalyticsConfig (settings) {
  const normalized = mergeAnalyticsSettings(settings)
  let global = null
  if (normalized.global.enabled && normalized.global.script) {
    try {
      global = normalizeScriptDescriptor(normalized.global.script)
    } catch {
      // 历史设置即使被外部手工修改，也不能阻断公开配置或泄露未校验描述。
      global = null
    }
  }
  let providerScriptUrl = DEFAULT_ANALYTICS_SETTINGS.share.providerScriptUrl
  try {
    providerScriptUrl = normalizeScriptUrl(normalized.share.providerScriptUrl, '分享统计服务地址')
  } catch {
    // 回退到受控的内置 provider 地址。
  }
  let providerWebsiteIdAttribute = DEFAULT_ANALYTICS_SETTINGS.share.providerWebsiteIdAttribute
  try {
    providerWebsiteIdAttribute = normalizeAttributeName(
      normalized.share.providerWebsiteIdAttribute,
      { websiteId: true },
    )
  } catch {
    // 回退到标准 data-* 属性。
  }
  return {
    global,
    sharePolicy: {
      enabled: normalized.share.enabled === true,
      providerScriptUrl,
      providerWebsiteIdAttribute,
      customScriptEnabled: normalized.share.customScriptEnabled === true,
    },
  }
}
