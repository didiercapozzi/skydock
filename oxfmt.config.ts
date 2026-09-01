import { defineConfig } from 'oxfmt'

export default defineConfig({
  printWidth: 100,
  bracketSameLine: true,
  jsxSingleQuote: true,
  semi: false,
  singleAttributePerLine: true,
  singleQuote: true,
  trailingComma: 'none',
  ignorePatterns: ['dist'],
  sortPackageJson: { sortScripts: true }
})
