import * as os from 'node:os'
import * as path from 'node:path'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/e2e/**/*.test.{ts,tsx}'],
      setupFiles: ['./tests/setup.ts'],
      /* the page is served by this process, so whatever of the app's server it reaches works on
         throwaway folders and watches no camera — never the real work, settings or bin */
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
