import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/server/**/*.test.{ts,tsx}'],
      environment: 'node'
    }
  })
)
