import { defineConfig } from 'vitest/config'

/* The journey: the built app, driven by a real browser, from the first drop to the last upload. It is
   one story, so its chapters run in order, in one process, on one app. */
export default defineConfig({
  test: {
    include: ['tests/journey/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000
  }
})
