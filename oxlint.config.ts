import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['react'],
  ignorePatterns: ['dist', 'playwright-report', 'test-results', 'e2e'],
  rules: {
    'eslint/no-unused-vars': 'error',
    'react/refs': 'error',
    'react/set-state-in-effect': 'error'
  }
})
