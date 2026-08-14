import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { normalizeCesiumShaderComments } from './scripts/cesium-build-compat.js'

const packageInfo = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  root: '.',
  publicDir: 'public',
  define: {
    __APP_VERSION__: JSON.stringify(packageInfo.version),
  },
  build: {
    outDir: 'service/app',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        map3d: '3d.html',
      },
    },
  },
  plugins: [
    {
      name: 'normalize-cesium-shader-comments',
      apply: 'build',
      renderChunk (code) {
        const normalizedCode = normalizeCesiumShaderComments(code)
        if (normalizedCode === code) return null
        return { code: normalizedCode, map: null }
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3088',
        changeOrigin: false,
      },
    },
  },
})
