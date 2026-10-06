import { configDefaults, defineConfig } from 'vitest/config'
import { InOrder } from './tests/journey/sequencer'

/* The journey: the built app, driven by a real browser, from the first drop to the last upload. Its files
   run one after another, each on an app of its own; the story (journey.test.ts) runs first and keeps the work
   folder at key moments, which the files after it start from. What needs SkyDock's own window and a real
   pointer lives in tests/journey/window and is run on its own, on a display of its own. */
export default defineConfig({
  test: {
    include: ['tests/journey/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      'tests/journey/window/**',
      'tests/journey/real-input.test.ts'
    ],
    fileParallelism: false,
    sequence: { sequencer: InOrder },
    testTimeout: 180_000,
    hookTimeout: 180_000
  }
})
