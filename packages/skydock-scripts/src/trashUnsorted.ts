import * as fs from 'node:fs'
import * as path from 'node:path'
import { moveFile } from './lib/fs'
import { getProxyPath } from './proxy'
import { isMontage } from './filed'
import { slugOf } from './sending'
import { passengerOf } from './workspace'
import type { Manifest } from './types'
import { getTrashDir } from './utils'

/* Files nobody wants — a test shot, footage of the ground — are put in the bin rather than deleted
   (RULES, Putting files in the bin), from wherever they are, once that is the way out chosen for
   them. Not a file already on the storage: what went up is somebody's, and not the board's to throw
   away. The file leaves the originals folder, so a scan does not find it again, and nothing is
   erased: the bin is never emptied by SkyDock, and a file can be brought back out of it. */

const trashUnsorted = async (
  manifest: Manifest,
  ids: Set<string>,
  outputDir: string,
  trashDir = getTrashDir()
) => {
  const going = manifest.files.filter((f) => f.id && ids.has(f.id))
  if (going.length === 0) throw new Error('Those files are no longer on the board.')
  const sent = going.find((f) => f.uploaded || f.freed)
  if (sent)
    throw new Error(
      `${sent.filename} is on the storage already — it is not the board’s to throw away.`
    )
  /* a copy is the jump's own hold on a file that stays where it is: it is taken out, never binned */
  const copy = going.find((f) => f.copyOf)
  if (copy)
    throw new Error(
      `${copy.filename} is a copy — take it out of its jump instead; its original stays.`
    )
  /* the bin takes the file off the disk, and a copy of it in a jump is of that very file */
  const copied = going.find((f) => manifest.files.some((c) => c.copyOf === f.id))
  if (copied)
    throw new Error(
      `${copied.filename} was copied into a jump, which still needs it — take the copy out first.`
    )

  /* one folder per time the bin is asked for, keeping each file where it sat among the originals,
     so what went in together can be found together and put back where it came from */
  const originals = path.join(outputDir, 'original_files')
  /* named after the montage or the dropzone they came out of, when they all came out of the one */
  const places = new Set(
    going.map((f) => {
      const group = manifest.groups.find((g) => g.files.some((h) => h.id === f.id))
      if (group && isMontage(group)) return `montage-${slugOf(passengerOf(group)) || 'montage'}`
      const place = group?.destination ?? f.destination
      return place ? `dropzone-${slugOf(place) || 'dropzone'}` : 'unsorted'
    })
  )
  const [only] = [...places]
  const from = places.size === 1 && only ? only : 'unsorted'
  const bin = path.join(trashDir, `${from}-${new Date().toISOString().replace(/[:.]/g, '-')}`)

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
