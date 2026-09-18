import * as fs from 'node:fs'
import * as path from 'node:path'
import { getProxyPath } from './proxy'
import type { Manifest } from './types'

/* Files nobody wants — a test shot, footage of the ground — are put in the bin rather than deleted
   (RULES, Putting files in the bin). Only from Unsorted: a file that has been filed somewhere is
   somebody's, and taking it back to Unsorted is the step that says it no longer is. The file leaves
   the originals folder, so a scan does not find it again, and nothing is erased: the bin is never
   emptied by SkyDock, and a file can be taken back out of it by hand. */

const trashUnsorted = (manifest: Manifest, ids: Set<string>, outputDir: string) => {
  const filed = new Set(
    manifest.groups
      .filter((g) => g.destination)
      .flatMap((g) => g.files.flatMap((f) => (f.id ? [f.id] : [])))
  )
  const going = manifest.files.filter((f) => f.id && ids.has(f.id))
  if (going.length === 0) throw new Error('Those files are no longer on the board.')
  if (going.some((f) => f.destination || filed.has(f.id ?? '')))
    throw new Error('Only files in Unsorted can be put in the bin — send them back there first.')

  /* one folder per time the bin is asked for, keeping each file where it sat among the originals,
     so what went in together can be found together and put back where it came from */
  const originals = path.join(outputDir, 'original_files')
  const bin = path.join(
    outputDir,
    '.trash',
    `unsorted-${new Date().toISOString().replace(/[:.]/g, '-')}`
  )

  for (const file of going) {
    const within = path.relative(originals, file.path)
    const to = path.join(bin, within.startsWith('..') ? path.basename(file.path) : within)
    /* a file already gone from the disk simply leaves the board */
    if (fs.existsSync(file.path)) {
      fs.mkdirSync(path.dirname(to), { recursive: true })
      fs.renameSync(file.path, to)
    }
    /* what was made from it has nothing left to be made from: the copy and the proxy go */
    for (const made of [file.processed?.path, getProxyPath(file, outputDir)])
      if (made) fs.rmSync(made, { force: true })
  }

  manifest.files = manifest.files.filter((f) => !f.id || !ids.has(f.id))
  manifest.groups = manifest.groups
    .map((g) => ({ ...g, files: g.files.filter((f) => !f.id || !ids.has(f.id)) }))
    .filter((g) => g.files.length > 0)

  return {
    count: going.length,
    bytes: going.reduce((n, f) => n + f.size, 0),
    bin: path.relative(outputDir, bin)
  }
}

export { trashUnsorted }
