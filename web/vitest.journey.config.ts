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
    fileParallelism: false,
    sequence: { sequencer: InOrder },
    testTimeout: 180_000,
    hookTimeout: 180_000
  }
})
