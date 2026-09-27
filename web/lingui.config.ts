import { defineConfig } from '@lingui/cli'
import { formatter } from '@lingui/format-po'

/* The languages SkyDock speaks (RULES, Languages): its sentences are written in English where they
   stand, and extracted from there into a catalog per language for translating. */
export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'fr', 'de'],
  /* where each sentence is used, without line numbers that would change the catalogs at every edit */
  format: formatter({ lineNumbers: false }),
  catalogs: [
    {
      path: '<rootDir>/app/locales/{locale}/messages',
      include: ['<rootDir>/app'],
      exclude: ['**/*.d.ts', '**/node_modules/**']
    }
  ]
})
