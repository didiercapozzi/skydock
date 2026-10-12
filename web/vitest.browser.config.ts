import * as os from 'node:os'
import * as path from 'node:path'
import { playwright } from '@vitest/browser-playwright'
import type { Plugin } from 'vite'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

const inertNodeModules = (): Plugin => ({
  name: 'inert-node-modules',
  enforce: 'pre',
  resolveId: (id) => (id.startsWith('node:') ? `\0${id}` : null),
  load: async (id) => {
    if (!id.startsWith('\0node:')) return null
    const names = Object.keys(await import(id.slice(1))).filter(
      (name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default'
    )
    return `export default {}\n${names.map((name) => `export const ${name} = undefined`).join('\n')}`
  }
})

export default mergeConfig(
  viteConfig,
  defineConfig({
    plugins: [inertNodeModules()],
    test: {
      include: ['tests/e2e/**/*.test.{ts,tsx}'],
      setupFiles: ['./tests/setup.ts'],
      env: {
        SKYDOCK_OUTPUT_DIR: path.join(os.tmpdir(), 'skydock-test-output'),
        SKYDOCK_CONFIG_DIR: path.join(os.tmpdir(), 'skydock-test-config'),
        SKYDOCK_TRASH_DIR: path.join(os.tmpdir(), 'skydock-test-trash'),
        SKYDOCK_CAMERA_ROOTS: ''
      },
      browser: {
        enabled: true,
        provider: playwright(),
        headless: true,
        viewport: { width: 1280, height: 800 },
        instances: [{ browser: 'chromium', viewport: { width: 1280, height: 800 } }]
      }
    }
  })
)
