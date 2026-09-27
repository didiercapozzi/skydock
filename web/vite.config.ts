// vite.config.js
import { transformAsync } from '@babel/core'
import { lingui } from '@lingui/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import babel from 'vite-plugin-babel'

const ReactCompilerConfig = {/* ... */}

/* The installed app carries the server as one file with no node_modules beside it, so a build puts
   everything it uses inside it rather than leaving it to be found at runtime. A build only: the
   development server reads the packages where they are, as it always did. */
const building = process.argv.includes('build')

/* The shared packages sit beside the app, outside the folder the development server watches, so an
   edit there would reach the server but never the page. Watching them too keeps both in step. */
const watchPackages = {
  name: 'watch-packages',
  /* nothing returned: what a hook returns is taken for one to run later */
  configureServer: (server: { watcher: { add: (path: string) => unknown } }) => {
    server.watcher.add(fileURLToPath(new URL('../packages', import.meta.url)))
  }
}

/* The sentences to translate turned into catalog lookups (RULES, Languages) — in the files that ask
   for Lingui's macros and in no other, and leaving their TypeScript for the build to strip, so a
   route module is handed on exactly as React Router expects it. */
const linguiMacros = {
  name: 'lingui-macros',
  enforce: 'pre' as const,
  transform: async (code: string, id: string) => {
    const file = id.split('?')[0] ?? id
    if (!/\.[jt]sx?$/.test(file) || file.includes('node_modules') || !code.includes('@lingui/'))
      return null
    const out = await transformAsync(code, {
      filename: file,
      babelrc: false,
      configFile: false,
      sourceMaps: true,
      parserOpts: { plugins: ['typescript', 'jsx'] },
      plugins: ['@lingui/babel-plugin-lingui-macro']
    })
    return out?.code ? { code: out.code, map: out.map } : null
  }
}

export default defineConfig({
  ssr: building ? { noExternal: true } : {},
  plugins: [
    watchPackages,
    tailwindcss(),
    reactRouter(),
    /* a catalog imported is compiled as it is, so there is no step to forget between translating and
       seeing it */
    lingui(),
    linguiMacros,
    babel({
      filter: /\.[jt]sx?$/,
      babelConfig: {
        presets: ['@babel/preset-typescript'], // if you use TypeScript
        plugins: [['babel-plugin-react-compiler', ReactCompilerConfig]]
      }
    })
  ]
})
