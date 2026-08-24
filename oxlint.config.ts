import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['react'],
  ignorePatterns: ['server', 'client'],
  rules: {
    'eslint/no-unused-vars': 'error'
  }
})
