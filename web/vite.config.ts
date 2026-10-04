import { transformAsync } from '@babel/core'
import { lingui } from '@lingui/vite-plugin'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import babel from 'vite-plugin-babel'

const building = process.argv.includes('build')

const watchPackages = {
  name: 'watch-packages',
  configureServer: (server: { watcher: { add: (path: string) => unknown } }) => {
    server.watcher.add(fileURLToPath(new URL('../packages', import.meta.url)))
  }
}

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
    lingui(),
    linguiMacros,
    babel({
      filter: /\.[jt]sx?$/,
      babelConfig: {
        presets: ['@babel/preset-typescript'],
        plugins: [['babel-plugin-react-compiler', {}]]
      }
    })
  ]
})
