import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      setupFiles: ['./tests/setup.ts'],
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
