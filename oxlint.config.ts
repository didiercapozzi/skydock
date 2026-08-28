import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['react'],
  ignorePatterns: ['server', 'client', 'dist'],
  rules: {
    'eslint/no-unused-vars': 'error',
    'react/refs': 'error'
  }
})
