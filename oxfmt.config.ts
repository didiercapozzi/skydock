import { defineConfig } from 'oxfmt'

export default defineConfig({
  printWidth: 100,
  bracketSameLine: true,
  jsxSingleQuote: true,
  semi: false,
  singleAttributePerLine: true,
  singleQuote: true,
  trailingComma: 'none',
  ignorePatterns: ['dist', 'playwright-report', 'test-results', 'e2e'],
  sortPackageJson: { sortScripts: true }
})
