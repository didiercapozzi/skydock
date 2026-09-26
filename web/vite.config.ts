// vite.config.js
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

export default defineConfig({
  ssr: building ? { noExternal: true } : {},
  plugins: [
    watchPackages,
    tailwindcss(),
    reactRouter(),
    babel({
      filter: /\.[jt]sx?$/,
      babelConfig: {
        presets: ['@babel/preset-typescript'], // if you use TypeScript
        plugins: [['babel-plugin-react-compiler', ReactCompilerConfig]]
      }
    })
  ]
})
