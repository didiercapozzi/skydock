import { defineConfig } from 'vitest/config'

/* What a browser cannot do — a file let go from outside the window, the window's frame, quitting — needs
   SkyDock's own window on a display of its own and a real pointer (journey-tests.md, Tier B). One file at
   a time, because there is one display and one debugging port. */
export default defineConfig({
  test: {
    include: ['tests/journey/window/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 180_000
  }
})
