import * as path from 'node:path'
import { run } from './tools'
import { toolPath } from './utils'

/* KDE's own way into a camera that has no drive to offer.

   A camera speaking MTP is reached on a KDE desktop through KIO — what the file manager shows as
   `mtp:/HERO5 Black/…` — and nowhere else: there is no folder for it on the disk, and the USB device
   answers only one reader at a time, which KDE already is. So it is asked through KDE rather than
   around it: `kioclient` names what is in a folder, says how big a file is and when it was written,
   and copies it, the same engine the file manager uses and at the same speed.

   Plasma 6 calls it `kioclient` and Plasma 5 `kioclient5`, and a machine can have both with only one
   of them able to reach cameras, so the one used is the first that answers for `mtp:/`. A machine
   without KDE has neither, and then nothing here is ever asked. */

type KioFile = { size: number; mtime: number | null }

type KioReader = {
  ls: (url: string) => Promise<string[]>
  stat: (url: string) => Promise<KioFile | null>
  copy: (url: string, to: string) => Promise<boolean>
}

const PROGRAMS = ['kioclient5', 'kioclient']

/* What a folder holds, as `kioclient ls` prints it: a name to a line, with the folder itself and its
   parent among them. */
const namesIn = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((name) => name !== '' && name !== '.' && name !== '..')

/* Before this, a time is a camera saying it has none. A GoPro answering over MTP gives every file
   the first second of 1970, and a time taken at its word would make every clip look new each time
   the camera is plugged in. */
const NO_TIME_BEFORE = Date.UTC(2000, 0, 1) / 1000

/* How big a file is and when it was written, from what `kioclient stat` prints: one field of the
   entry to a line, its name first, its value after a run of spaces — `SIZE  2118308`. The time comes
   as seconds or written out as a date, depending on the version; both are read, and a time that
   cannot be read, or is no time at all, is none rather than a wrong one. */
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

/* A reader that asks one program. Nothing it is asked stops the board: each question is a program
   of its own, waited for without holding the thread. */
const readerFor = (program: string): KioReader => {
  const ask = (args: string[]) => run(program, ['--noninteractive', ...args])
  return {
    ls: async (url) => {
      const said = await ask(['ls', url])
      return said.ok ? namesIn(said.stdout) : []
    },
    /* Read whatever it ends with: an answer that says how big the file is is taken for what it
       says. Thrown away, it would cost a clip fetched whole again only to find it was here. */
    stat: async (url) => fileIn((await ask(['stat', url])).stdout),
    copy: async (url, to) => (await ask(['copy', url, path.resolve(to)])).ok
  }
}

/* The reader on this machine: the first program that is there and can reach cameras. Kept once it
   has answered, and asked for again until then — KDE starting after SkyDock is no reason for a
   camera never to be seen. */
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
