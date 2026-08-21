import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  normalizeShareAnalyticsConfig,
  publicAnalyticsConfig,
  resolveShareAnalyticsDescriptor,
} from '../service/bin/user/analytics.js'
import { loadAnalyticsScript } from '../src/analytics.js'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const providerPolicy = {
  enabled: true,
  providerScriptUrl: 'https://msc.anzz.site/script.js',
  providerWebsiteIdAttribute: 'data-website-id',
  customScriptEnabled: true,
}

test('分享统计自定义脚本必须是非空的外部 HTTPS descriptor', () => {
  assert.throws(
    () => normalizeShareAnalyticsConfig({ mode: 'custom', script: null }, providerPolicy),
    error => error.code === 'VALIDATION_FAILED' && error.statusCode === 400,
  )
  const normalized = normalizeShareAnalyticsConfig({
    mode: 'custom',
    script: '<script defer src="https://analytics.example.test/script.js" data-site="demo"></script>',
  }, providerPolicy)
  assert.equal(normalized.mode, 'custom')
  assert.equal(normalized.script.src, 'https://analytics.example.test/script.js')
})

test('统计脚本属性解析失败不会污染下一次配置解析', () => {
  assert.throws(
    () => normalizeShareAnalyticsConfig({
      mode: 'custom',
      script: '<script src="https://analytics.example.test/a.js" src="https://analytics.example.test/b.js"></script>',
    }, providerPolicy),
    error => error.code === 'VALIDATION_FAILED' && error.statusCode === 400,
  )
  const normalized = normalizeShareAnalyticsConfig({
    mode: 'custom',
    script: '<script defer src="https://analytics.example.test/script.js" data-site="demo"></script>',
  }, providerPolicy)
  assert.equal(normalized.script.src, 'https://analytics.example.test/script.js')
  assert.equal(normalized.script.attributes['data-site'], 'demo')
})

test('公开访问统计配置会隔离历史污染的 provider 地址', () => {
  const config = publicAnalyticsConfig({
    global: {
      enabled: true,
      script: { src: 'javascript:alert(1)' },
    },
    share: {
      enabled: true,
      providerScriptUrl: 'http://attacker.example.test/script.js',
      providerWebsiteIdAttribute: 'onclick',
      customScriptEnabled: true,
    },
  })
  assert.equal(config.global, null)
  assert.equal(config.sharePolicy.providerScriptUrl, 'https://msc.anzz.site/script.js')
  assert.equal(config.sharePolicy.providerWebsiteIdAttribute, 'data-website-id')
})

test('分享 manifest descriptor 对污染的 provider 或 custom 配置失败关闭', () => {
  assert.equal(
    resolveShareAnalyticsDescriptor(
      { mode: 'provider', websiteId: 'site-1' },
      { ...providerPolicy, providerScriptUrl: 'http://bad.example.test/script.js' },
    ),
    null,
  )
  assert.equal(
    resolveShareAnalyticsDescriptor(
      { mode: 'custom', script: null },
      providerPolicy,
    ),
    null,
  )
})

test('客户端只加载无账号信息的 HTTPS 统计脚本并避免重复注入', () => {
  const previousDocument = globalThis.document
  const scripts = []
  globalThis.document = {
    head: {
      appendChild (script) {
        scripts.push(script)
      },
    },
    documentElement: null,
    querySelectorAll () {
      return scripts
    },
    createElement (tagName) {
      assert.equal(tagName, 'script')
      return {
        dataset: {},
        attributes: {},
        setAttribute (name, value) {
          this.attributes[name] = value
        },
      }
    },
  }

  try {
    assert.equal(loadAnalyticsScript({ src: 'http://analytics.example.test/script.js' }), null)
    assert.equal(loadAnalyticsScript({ src: 'https://user:password@analytics.example.test/script.js' }), null)

    const descriptor = {
      src: 'https://analytics.example.test/script.js',
      attributes: {
        'data-website-id': 'site-1',
        onclick: 'alert(1)',
      },
    }
    const script = loadAnalyticsScript(descriptor)
    assert.equal(script.src, descriptor.src)
    assert.equal(script.defer, true)
    assert.equal(script.attributes['data-website-id'], 'site-1')
    assert.equal(Object.hasOwn(script.attributes, 'onclick'), false)
    assert.equal(scripts.length, 1)
    assert.equal(loadAnalyticsScript(descriptor), null)
    assert.equal(scripts.length, 1)
  } finally {
    globalThis.document = previousDocument
  }
})

test('分享页会立即清理密码参数并以密码链接方式验证', () => {
  const shareViewSource = fs.readFileSync(path.join(projectRoot, 'src/map/share-view.js'), 'utf8')
  const serviceEntrySource = fs.readFileSync(path.join(projectRoot, 'service/index.js'), 'utf8')

  assert.match(shareViewSource, /url\.searchParams\.delete\('password'\)/)
  assert.match(shareViewSource, /window\.history\.replaceState/)
  assert.match(shareViewSource, /accessMethod:\s*'password_link'/)
  assert.match(shareViewSource, /referrer\.content\s*=\s*'no-referrer'/)
  assert.match(serviceEntrySource, /res\.set\('Referrer-Policy', 'no-referrer'\)/)
})
