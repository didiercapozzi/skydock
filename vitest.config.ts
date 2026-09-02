import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'web/tests/**/*.test.ts',
      'web/tests/**/*.test.tsx',
      'packages/skydock-scripts/tests/**/*.test.ts'
    ],
    exclude: [
      '**/node_modules/**',
      'web/tests/review.test.tsx',
      'web/tests/timeline.test.tsx',
      'web/tests/timeline_isolation.test.tsx',
      'web/tests/timeline_jump_isolation.test.tsx',
      'e2e/**',
      'playwright.config.ts',
      'playwright-report/**',
      'test-results/**'
    ],
    setupFiles: ['./web/tests/setup.ts']
  }
})
