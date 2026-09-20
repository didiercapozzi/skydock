// vite.config.js
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import babel from 'vite-plugin-babel'

const ReactCompilerConfig = {/* ... */}

/* The installed app carries the server as one file with no node_modules beside it, so a build puts
   everything it uses inside it rather than leaving it to be found at runtime. A build only: the
   development server reads the packages where they are, as it always did. */
const building = process.argv.includes('build')

export default defineConfig({
  ssr: building ? { noExternal: true } : {},
  plugins: [
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
