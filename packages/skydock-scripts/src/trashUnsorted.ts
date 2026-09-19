import * as fs from 'node:fs'
import * as path from 'node:path'
import { moveFile } from './lib/fs'
import { getProxyPath } from './proxy'
import type { Manifest } from './types'
import { getTrashDir } from './utils'

/* Files nobody wants — a test shot, footage of the ground — are put in the bin rather than deleted
   (RULES, Putting files in the bin). Only from Unsorted: a file that has been filed somewhere is
   somebody's, and taking it back to Unsorted is the step that says it no longer is. The file leaves
   the originals folder, so a scan does not find it again, and nothing is erased: the bin is never
   emptied by SkyDock, and a file can be taken back out of it by hand. */

const trashUnsorted = async (
  manifest: Manifest,
  ids: Set<string>,
  outputDir: string,
  trashDir = getTrashDir()
) => {
  const filed = new Set(
    manifest.groups
      .filter((g) => g.destination)
      .flatMap((g) => g.files.flatMap((f) => (f.id ? [f.id] : [])))
  )
  const going = manifest.files.filter((f) => f.id && ids.has(f.id))
  if (going.length === 0) throw new Error('Those files are no longer on the board.')
  if (going.some((f) => f.destination || filed.has(f.id ?? '')))
    throw new Error('Only files in Fresh files can be put in the bin — send them back there first.')
  /* the bin takes the file off the disk, and a copy of it in a jump is of that very file */
  const copied = going.find((f) => manifest.files.some((c) => c.copyOf === f.id))
  if (copied)
    throw new Error(
      `${copied.filename} was copied into a jump, which still needs it — take the copy out first.`
    )

  /* one folder per time the bin is asked for, keeping each file where it sat among the originals,
     so what went in together can be found together and put back where it came from */
  const originals = path.join(outputDir, 'original_files')
  const bin = path.join(trashDir, `unsorted-${new Date().toISOString().replace(/[:.]/g, '-')}`)

  for (const file of going) {
    const within = path.relative(originals, file.path)
    const to = path.join(bin, within.startsWith('..') ? path.basename(file.path) : within)
    /* a file already gone from the disk simply leaves the board */
    if (fs.existsSync(file.path)) await moveFile(file.path, to)
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
    bin
  }
}

export { trashUnsorted }
