import { configDefaults, defineConfig } from 'vitest/config'
import { InOrder } from './tests/journey/sequencer'

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
