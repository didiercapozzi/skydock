import * as os from 'node:os'
import * as path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      SKYDOCK_OUTPUT_DIR: path.join(os.tmpdir(), 'skydock-test-output'),
      SKYDOCK_CONFIG_DIR: path.join(os.tmpdir(), 'skydock-test-config'),
      SKYDOCK_TRASH_DIR: path.join(os.tmpdir(), 'skydock-test-trash'),
      SKYDOCK_CAMERA_ROOTS: ''
    }
  }
})
