import * as os from 'node:os'
import * as path from 'node:path'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/server/**/*.test.{ts,tsx}'],
      environment: 'node',
      /* never the app's real settings: a test that names no folder of its own writes here */
      env: { SKYDOCK_CONFIG_DIR: path.join(os.tmpdir(), 'skydock-test-config') }
    }
  })
)
