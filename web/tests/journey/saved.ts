import * as fs from 'node:fs'
import * as path from 'node:path'
import * as url from 'node:url'
import { makeWorld } from './app'
import type { World } from './app'

/* The work folder of a run, kept at a chosen moment — sorted, processed, uploaded — so a chapter that
   needs the app in that state starts from it instead of replaying the story that led there. A state is a
   copy of the work folder and of the settings; it holds the paths of the folder it was made in, so they are
   rewritten to the folder it is restored into, the way the record would be if the folder had been moved. The
   files keep their dates, which is what the app reads them by. */

const here = path.dirname(url.fileURLToPath(import.meta.url))
const STATES = path.join(here, '.states')

/* what is text and small enough to carry a path: the record, the lists, the settings, a project */
const TEXT = /\.(json|jsonl|txt|kdenlive|mlt|xml)$/i
const MOST = 5_000_000

const rewrite = (folder: string, from: string, to: string) => {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const here = path.join(folder, entry.name)
    if (entry.isDirectory()) rewrite(here, from, to)
    else if (TEXT.test(entry.name) && fs.statSync(here).size < MOST) {
      const text = fs.readFileSync(here, 'utf8')
      if (text.includes(from)) fs.writeFileSync(here, text.split(from).join(to))
    }
  }
}

const saveState = (world: World, name: string) => {
  const target = path.join(STATES, name)
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  fs.cpSync(world.output, path.join(target, 'output'), {
    recursive: true,
    preserveTimestamps: true
  })
  fs.cpSync(world.config, path.join(target, 'config'), { recursive: true })
  fs.writeFileSync(path.join(target, 'root.txt'), world.root)
}

const hasState = (name: string) => fs.existsSync(path.join(STATES, name, 'root.txt'))

/* a world of its own, holding what the state held */
const loadState = (name: string): World => {
  const source = path.join(STATES, name)
  if (!hasState(name))
    throw new Error(
      `no saved state "${name}" — run npm run test:journey, which makes them in order`
    )
  const world = makeWorld()
  fs.cpSync(path.join(source, 'output'), world.output, {
    recursive: true,
    preserveTimestamps: true
  })
  fs.cpSync(path.join(source, 'config'), world.config, { recursive: true })
  const was = fs.readFileSync(path.join(source, 'root.txt'), 'utf8')
  rewrite(world.output, was, world.root)
  rewrite(world.config, was, world.root)
  return world
}

export { hasState, loadState, saveState }
