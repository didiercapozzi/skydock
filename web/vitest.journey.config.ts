import { configDefaults, defineConfig } from 'vitest/config'
import { InOrder } from './tests/journey/sequencer'

/* The journey: the built app, driven by a real browser, from the first drop to the last upload. Each file runs
   on an app of its own. The story (journey.test.ts) runs first and keeps the work folder at key moments, which
   the files after it start from — and the montage made ready (i2-a-ready) before the files that start from
   that — so those two run alone, one after another, and the rest run side by side (JOURNEY_PARALLEL=1, the
   number at once in JOURNEY_WORKERS, four if not said): a file shares nothing with another but the states it
   copies. The four that work big clips or draw many pictures — full screen, stopping a long process, a camera's
   thumbnails, the board's grid — are timed by the machine they run on, so they run alone, last. What needs SkyDock's own window and a real
   pointer lives in tests/journey/window and is run on its own, on a display of its own. */
export default defineConfig({
  test: {
    include: ['tests/journey/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      'tests/journey/window/**',
      'tests/journey/real-input.test.ts'
    ],
    fileParallelism: Boolean(process.env.JOURNEY_PARALLEL),
    maxWorkers: Number(process.env.JOURNEY_WORKERS ?? 4),
    sequence: { sequencer: InOrder },
    testTimeout: 180_000,
    hookTimeout: 180_000
  }
})
