import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import babel from 'vite-plugin-babel'

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
    babel({
      include: /\.[jt]sx?$/,
      babelConfig: {
        presets: ['@babel/preset-typescript'],
        plugins: [['babel-plugin-react-compiler']]
      }
    })
  ],
  resolve: {
    tsconfigPaths: true
  },
  envDir: '..'
})
