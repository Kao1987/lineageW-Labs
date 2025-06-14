import { fileURLToPath, URL } from 'node:url'
import { defineConfig, ServerOptions, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { createMimeFixPlugin } from './vite-plugins/mime-fix'
import { createCspPlugin } from './vite-plugins/csp-plugin'
import { createApiPlugin } from './vite-plugins/api-plugin'
import basicSsl from '@vitejs/plugin-basic-ssl'
import compression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  const alias: Record<string, string> = {
    // 模組特定路徑
    '@/job-change': fileURLToPath(new URL('./modules/job-change', import.meta.url)),
    '@/pet-evaluate': fileURLToPath(new URL('./modules/pet-evaluate', import.meta.url)),
    '@/shared': fileURLToPath(new URL('./modules/shared', import.meta.url)),
    '@/shared-stores': fileURLToPath(new URL('./modules/shared/stores', import.meta.url)),
    '@/shared-utils': fileURLToPath(new URL('./modules/shared/utils', import.meta.url)),
    '@/modules': fileURLToPath(new URL('./modules', import.meta.url)),

    // 通用路徑
    '@': fileURLToPath(new URL('./src', import.meta.url)),
    '@/assets': fileURLToPath(new URL('./src/assets', import.meta.url)),
    '@/components': fileURLToPath(new URL('./src/components', import.meta.url)),
    '@/stores': fileURLToPath(new URL('./src/stores', import.meta.url)),
    '@/types': fileURLToPath(new URL('./src/types', import.meta.url)),
    '@/utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
    '@/api': fileURLToPath(new URL('./src/api', import.meta.url)),
  }

  if (isProduction) {
    // 在生產環境中，強制 vue-i18n 使用 runtime-only 版本以符合 CSP
    alias['vue-i18n'] = 'vue-i18n/dist/vue-i18n.runtime.esm-bundler.js'
  }

  return {
    base:
      process.env.CI === 'github'
        ? '/lineageW-Labs/' // GitHub Pages
        : '/', // 伺服器 (Nginx)
    plugins: [
      vue(),
      createMimeFixPlugin(),
      createCspPlugin(mode),
      createApiPlugin(),
      basicSsl(),
      AutoImport({
        imports: [
          'vue',
          'vue-router',
          'pinia',
          'vue-i18n',
          {
            '@vueuse/core': ['useDark', 'useToggle'],
          },
        ],
        dts: true,
        vueTemplate: true,
        eslintrc: {
          enabled: true,
        },
      }),
      Components({
        dts: true,
        dirs: ['src/components', 'modules/*/components', 'modules/shared/components'],
        resolvers: [
          // 自動解析模組元件
          (componentName) => {
            if (componentName.startsWith('PetEvaluate')) {
              return `@/pet-evaluate/components/${componentName}.vue`
            }
            if (componentName.startsWith('JobChange')) {
              return `@/job-change/components/${componentName}.vue`
            }
            return null
          },
        ],
      }),
      // 壓縮：同時產出 .br 與 .gz
      compression({
        algorithm: 'brotliCompress',
        ext: '.br',
        threshold: 1024,
        deleteOriginFile: false,
      }),
      compression({
        algorithm: 'gzip',
        ext: '.gz',
        threshold: 1024,
        deleteOriginFile: false,
      }),

      visualizer({
        open: true,
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
      }) as Plugin,
    ],
    resolve: {
      alias,
    },
    define: {
      __VUE_I18N_FULL_INSTALL__: false,
      __VUE_I18N_LEGACY_API__: false,
      __VUE_I18N_PROD_DEVTOOLS__: false,
      __INTLIFY_PROD_DEVTOOLS__: false,
    },
    server: {
      https: {},
      port: 3000,
      fs: {
        // 允許服務超出根目錄的檔案
        allow: ['..'],
      },
      middlewareMode: false,
    } as ServerOptions,
    optimizeDeps: {
      include: ['vue', 'vue-router', 'pinia', 'vue-i18n'],
    },
    build: {
      sourcemap: 'hidden',
      rollupOptions: {
        output: {
          manualChunks(id) {
            // 將多國語系檔案分離成獨立的 chunk
            if (id.includes('src/locales/')) {
              const lang = id.toString().split('locales/')[1].split('.')[0]
              return `locale-${lang}`
            }

            if (id.includes('node_modules')) {
              if (id.includes('vue-i18n')) return 'vue-i18n'
              if (id.includes('pinia')) return 'pinia'
              return 'vendor'
            }
          },
        },
      },
    },
  }
})
