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
      setupFiles: ['./tests/server/setup.ts'],
      env: {
        SKYDOCK_OUTPUT_DIR: path.join(os.tmpdir(), 'skydock-test-output'),
        SKYDOCK_CONFIG_DIR: path.join(os.tmpdir(), 'skydock-test-config'),
        SKYDOCK_TRASH_DIR: path.join(os.tmpdir(), 'skydock-test-trash'),
        SKYDOCK_CAMERA_ROOTS: ''
      }
    }
  })
)
