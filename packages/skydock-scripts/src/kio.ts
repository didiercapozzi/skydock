import * as path from 'node:path'
import { run } from './tools'
import { toolPath } from './utils'

type KioFile = { size: number; mtime: number | null }

type KioReader = {
  ls: (url: string) => Promise<string[]>
  stat: (url: string) => Promise<KioFile | null>
  copy: (url: string, to: string) => Promise<boolean>
}

const PROGRAMS = ['kioclient5', 'kioclient']

const namesIn = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((name) => name !== '' && name !== '.' && name !== '..')

const NO_TIME_BEFORE = Date.UTC(2000, 0, 1) / 1000

const fileIn = (text: string) => {
  const field = (key: string) =>
    text
      .split('\n')
      .map((line) =>
        line.trim().match(new RegExp(`^["']?(?:UDS_)?${key}["']?(?:\\s*[:=]\\s*|\\s+)(.+)$`, 'i'))
      )
      .find((found) => found)?.[1]
      .trim()
      .replace(/^["']|["']$/g, '')
  const size = Number(field('SIZE'))
  if (!Number.isFinite(size) || size < 0) return null
  const written = field('MODIFICATION_TIME')
  const seconds = !written
    ? null
    : /^\d{9,}$/.test(written)
      ? Number(written)
      : Number.isFinite(Date.parse(written))
        ? Math.floor(Date.parse(written) / 1000)
        : null
  return { size, mtime: seconds !== null && seconds >= NO_TIME_BEFORE ? seconds : null }
}

const readerFor = (program: string): KioReader => {
  const ask = (args: string[]) => run(program, ['--noninteractive', ...args])
  return {
    ls: async (url) => {
      const said = await ask(['ls', url])
      return said.ok ? namesIn(said.stdout) : []
    },
    stat: async (url) => fileIn((await ask(['stat', url])).stdout),
    copy: async (url, to) => (await ask(['copy', url, path.resolve(to)])).ok
  }
}

const kept: { reader: KioReader | null } = { reader: null }

const kioReader = async () => {
  if (kept.reader || process.platform !== 'linux') return kept.reader
  for (const name of PROGRAMS) {
    const program = toolPath(name)
    if (!program) continue
    if ((await run(program, ['--noninteractive', 'ls', 'mtp:/'])).ok) {
      kept.reader = readerFor(program)
      break
    }
  }
  return kept.reader
}

export { fileIn, kioReader, namesIn, readerFor }
export type { KioFile, KioReader }
