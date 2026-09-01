import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['react'],
  ignorePatterns: ['dist'],
  rules: {
    'eslint/no-unused-vars': 'error',
    'react/refs': 'error',
    'react/set-state-in-effect': 'error'
  }
})
