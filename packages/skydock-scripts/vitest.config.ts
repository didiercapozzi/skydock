import * as os from 'node:os'
import * as path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    /* never the app's real settings or bin: a test that names no folder of its own writes here */
    env: {
      SKYDOCK_CONFIG_DIR: path.join(os.tmpdir(), 'skydock-test-config'),
      SKYDOCK_TRASH_DIR: path.join(os.tmpdir(), 'skydock-test-trash')
    }
  }
})
