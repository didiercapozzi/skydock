import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/journey/window/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000
  }
})
