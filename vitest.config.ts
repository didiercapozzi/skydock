import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['web/tests/**/*.test.ts', 'web/tests/**/*.test.tsx'],
    setupFiles: ['./web/tests/setup.ts']
  }
})
