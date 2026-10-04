import { defineConfig } from '@lingui/cli'
import { formatter } from '@lingui/format-po'

export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'fr', 'de'],
  format: formatter({ lineNumbers: false }),
  catalogs: [
    {
      path: '<rootDir>/app/locales/{locale}/messages',
      include: ['<rootDir>/app'],
      exclude: ['**/*.d.ts', '**/node_modules/**']
    }
  ]
})
