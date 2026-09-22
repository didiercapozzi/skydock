import { defineConfig } from 'oxfmt'

export default defineConfig({
  printWidth: 100,
  bracketSameLine: true,
  jsxSingleQuote: true,
  semi: false,
  singleAttributePerLine: true,
  singleQuote: true,
  trailingComma: 'none',
  /* `docs` is written by `scripts/map-the-board.ts` and compared against what that writes, so
     anything laying it out differently would make it look out of date the moment it was made */
  ignorePatterns: ['dist', 'playwright-report', 'test-results', 'e2e', 'docs'],
  sortPackageJson: { sortScripts: true }
})
