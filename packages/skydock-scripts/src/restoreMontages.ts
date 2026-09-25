import { dayOfFiles, freshIds } from './clustering'
import { moveFiles } from './moveFiles'
import type { MontageEntry } from './montageEntry'
import type { Manifest } from './types'

/* A board that has forgotten its montages — the output folder scanned again from nothing, its record
   of the jumps lost — gets them back from the storage's list. Every montage uploaded is written down
   up there with the files it was made of, each by what it contains; a scan from scratch gives every
   file that same identity again, so the two can be matched whatever the files are now called.

   What comes back is what was decided by a person and cannot be worked out again: which files are
   one montage, whose it is, and the times that were set right. What was made from them is not
   claimed back — the copies are gone with the record of them, and "uploaded" is only ever said of a
   copy proved on both sides — so a restored montage is named and waits to be processed; uploading it
   again skips what the storage already holds. */

/* The files of a listed montage that are on this board waiting to be sorted. A montage whose files
   are already filed somewhere is left to whoever filed them, and one freed from its machine has no
   files here to find. */
const restorableFiles = (manifest: Manifest, entry: MontageEntry) => {
  const fresh = freshIds(manifest)
  return (entry.files ?? []).filter((f) => fresh.has(f.id))
}

const restoreMontages = (manifest: Manifest, entries: MontageEntry[]) => {
  const restored: { who: string; files: number; of: number }[] = []
  for (const entry of entries) {
    const found = restorableFiles(manifest, entry)
    if (found.length === 0) continue
    const ids = new Set(found.map((f) => f.id))
    moveFiles(manifest, ids, { newGroup: true, montage: true })
    const group = manifest.groups.find((g) => g.files.some((f) => f.id && ids.has(f.id)))
    if (!group) continue
    group.passenger = { firstname: entry.firstname, lastname: entry.lastname }
    /* the times as the montage had them, which may be ones a person set right */
    const timeOf = new Map(found.map((f) => [f.id, f.mtime]))
    for (const file of [...manifest.files, ...group.files]) {
      const time = file.id ? timeOf.get(file.id) : undefined
      if (time !== undefined) file.mtime = time
    }
    group.files.sort((a, b) => a.mtime - b.mtime)
    group.day = dayOfFiles(group.files)
    restored.push({
      who: `${entry.firstname} ${entry.lastname}`.trim(),
      files: found.length,
      of: entry.files?.length ?? found.length
    })
  }
  return restored
}

export { restorableFiles, restoreMontages }
