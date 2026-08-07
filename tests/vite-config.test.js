import assert from 'node:assert/strict'
import test from 'node:test'

import viteConfig from '../vite.config.js'

test('Vite API proxy preserves the browser origin host for credential checks', () => {
  const apiProxy = viteConfig.server?.proxy?.['/api']

  assert.equal(apiProxy?.target, 'http://127.0.0.1:3088')
  assert.equal(apiProxy?.changeOrigin, false)
})
