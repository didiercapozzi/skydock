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
      /* Never the app's real work, settings or bin, and never a real camera: a test that names no
         folder of its own writes here, and a server started by a test watches no drive. */
      env: {
        SKYDOCK_OUTPUT_DIR: path.join(os.tmpdir(), 'skydock-test-output'),
        SKYDOCK_CONFIG_DIR: path.join(os.tmpdir(), 'skydock-test-config'),
        SKYDOCK_TRASH_DIR: path.join(os.tmpdir(), 'skydock-test-trash'),
        SKYDOCK_CAMERA_ROOTS: ''
      }
    }
  })
)
