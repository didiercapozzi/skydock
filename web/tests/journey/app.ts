import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as url from 'node:url'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const SERVER = path.join(here, '..', '..', 'build', 'skydock-server.mjs')

type World = { root: string; output: string; config: string; trash: string; computer: string }

const makeWorld = (): World => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skydock-journey-'))
  const [output, config, computer] = ['output', 'config', 'computer'].map(
    (name) => fs.mkdirSync(path.join(root, name)) ?? path.join(root, name)
  )
  return {
    root,
    output: output!,
    config: config!,
    computer: computer!,
    trash: path.join(output!, '.trash')
  }
}

const start = (world: World, extra: Record<string, string> = {}) =>
  new Promise<{ url: string; stop: () => Promise<void> }>((resolve, reject) => {
    const child = spawn('node', [SERVER], {
      env: {
        PATH: process.env.PATH,
        HOME: world.root,
        ...Object.fromEntries(
          [
            'TZ',
            'LANG',
            'LC_ALL',
            'SKYDOCK_FFMPEG_PATH',
            'SKYDOCK_FFPROBE_PATH',
            'SKYDOCK_EXIFTOOL_PATH'
          ].flatMap((name) => (process.env[name] ? [[name, process.env[name]]] : []))
        ),
        SKYDOCK_OUTPUT_DIR: world.output,
        SKYDOCK_CONFIG_DIR: world.config,
        SKYDOCK_TRASH_DIR: world.trash,
        SKYDOCK_CAMERA_ROOTS: '',
        PORT: '0',
        ...extra
      }
    })
    const stop = () =>
      new Promise<void>((done) => {
        if (child.exitCode !== null) return done()
        child.once('exit', () => done())
        child.kill('SIGTERM')
      })
    child.once('error', reject)
    child.once('exit', (code) =>
      reject(new Error(`the server stopped with ${code} before it was ready`))
    )
    child.stdout.on('data', (chunk) => {
      const port = /SKYDOCK_READY (\d+)/.exec(String(chunk))?.[1]
      if (port) {
        child.removeAllListeners('exit')
        resolve({ url: `http://127.0.0.1:${port}`, stop })
      }
    })
  })

export { makeWorld, start }
export type { World }
