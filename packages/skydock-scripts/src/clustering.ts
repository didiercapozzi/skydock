import { GROUP_GAP_SECONDS } from './constants'
import type { Manifest, ManifestFile, ManifestGroup } from './types'
import { formatDay, sortFilesByMtime } from './utils'

/* The rule that makes a jump: files in capture order, cut wherever the gap from one file to the
   *next* reaches GROUP_GAP_SECONDS. The gap is measured between neighbours, never from the first
   file of the run — so a jump goes on for as long as the filming does, and can cover far more than
   that gap in total, while a single pause longer than it ends the jump however briefly the filming
   had been going. A run of a single file is not a jump: callers drop those, leaving them loose
   (RULES, Jumps). */
const splitByGap = (files: ManifestFile[]) => {
  const batches: ManifestFile[][] = []
  let current: ManifestFile[] = []
  let last = 0
  for (const file of sortFilesByMtime(files)) {
    if (current.length > 0 && file.mtime - last >= GROUP_GAP_SECONDS) {
      batches.push(current)
      current = []
    }
    current.push(file)
    last = file.mtime
  }
  if (current.length > 0) batches.push(current)
  return batches
}

/* The jump itself, among the files it holds: its longest unbroken run. Whatever a pause the rule
   cuts at separates from that run was brought in — dragged from another jump, dropped in from the
   computer, or re-timed away from the rest. A copy is never part of it: it was shot for another
   jump, and says so with a flag of its own. A jump holding nothing but copies has only them. */
const mainRun = (held: ManifestFile[]) => {
  const own = held.filter((f) => !f.copyOf)
  const runs = splitByGap(own.length > 0 ? own : held)
  return runs.reduce<ManifestFile[]>((a, b) => (b.length > a.length ? b : a), [])
}

/* The files a jump holds that the gap rule would not have put there, so the board can flag them
   without moving anything. */
const offGap = (held: ManifestFile[]) => {
  const main = new Set(mainRun(held))
  return new Set(held.flatMap((f) => (f.id && !f.copyOf && !main.has(f) ? [f.id] : [])))
}

/* When a jump started: when its own run did. A file brought in from elsewhere — moved, added from
   the computer, copied — was often shot well before or after, and does not say when this jump was:
   the card's date, the jump's number, the day it is filed under and the time that gets corrected
   all follow the run, so bringing a file in changes none of them and leaves nothing to set right. */
const startOfFiles = (files: ManifestFile[]) => mainRun(files)[0]?.mtime ?? 0

/* The day a jump belongs to: the day it started. It is stored rather than worked out from the
   files each time, because a file dragged in from another day joins the jump — it does not drag
   the jump to its own day with it (RULES, Jumps). Whatever changes a whole jump's time changes
   this with it. */
const dayOfFiles = (files: ManifestFile[]) =>
  files.length === 0 ? '' : formatDay(startOfFiles(files))

const buildGroup = (files: ManifestFile[], id: string, label: string) => ({
  id,
  label,
  day: dayOfFiles(files),
  files
})

/* Hands out `group_1`, `group_2`, … skipping anything already taken in this pass. */
const idMinter = (taken: Iterable<string>) => {
  const used = new Set(taken)
  let idx = 1
  return {
    used,
    next: () => {
      while (used.has(`group_${idx}`)) idx++
      const id = `group_${idx}`
      used.add(id)
      return id
    }
  }
}

/* Builds every jump from the registry by the gap rule, for a board that has none yet. What was
   decided about a jump — its destination, its passenger, whether it has been processed — follows
   the jump most of the new jump's files came from. */
const reclusterGroups = (manifest: Manifest) => {
  const previous = new Map<string, ManifestGroup>()
  for (const group of manifest.groups)
    for (const file of group.files) if (file.id) previous.set(file.id, group)

  /* A copy is in its jump because a person put it there, and sits at the same moment as the file it
     is of — so the gap rule would pull it back beside its original, into a jump holding the same
     clip twice. Copies are left out of the rule and put back where they were afterwards. */
  const copies = manifest.files.filter((f) => f.copyOf)
  const mint = idMinter([])
  manifest.groups = splitByGap(manifest.files.filter((f) => !f.copyOf))
    .filter((files) => files.length > 1)
    .map((files) => {
      const counts = new Map<ManifestGroup, number>()
      for (const file of files) {
        const before = file.id ? previous.get(file.id) : undefined
        if (before) counts.set(before, (counts.get(before) ?? 0) + 1)
      }
      let dominant: ManifestGroup | undefined
      let most = 0
      for (const [group, count] of counts) {
        if (count > most) {
          most = count
          dominant = group
        }
      }
      /* a jump that split in two cannot hand its id to both halves */
      const keepsId = dominant !== undefined && !mint.used.has(dominant.id)
      if (keepsId && dominant) mint.used.add(dominant.id)
      const id = keepsId && dominant ? dominant.id : mint.next()
      return {
        ...buildGroup(files, id, dominant?.label ?? id),
        processed: dominant?.processed,
        passenger: dominant?.passenger,
        destination: dominant?.destination,
        /* a name was given to one jump, so of a jump that split it stays with the half that is
           still that jump */
        ...(keepsId && dominant?.name ? { name: dominant.name } : {})
      }
    })
  /* each copy back into the jump that held it, as that jump had it; one whose jump is no more has
     nowhere to be, and ends */
  const homeless = new Set<string>()
  for (const copy of copies) {
    const was = copy.id ? previous.get(copy.id) : undefined
    const home = was && manifest.groups.find((g) => g.id === was.id)
    const held = was?.files.find((f) => f.id === copy.id)
    if (home && held) home.files = [...home.files, held].sort((a, b) => a.mtime - b.mtime)
    else if (copy.id && !copy.destination) homeless.add(copy.id)
  }
  if (homeless.size > 0) manifest.files = manifest.files.filter((f) => !f.id || !homeless.has(f.id))
}

/* What a scan found that the board did not have is grouped on its own, by the gap rule, and the
   jumps already there are left exactly as they are — sorted, merged, split, re-timed, processed,
   uploaded (RULES, Jumps). A run of new files within the gap of a jump still in Fresh files joins
   it, so a card copied off in two goes ends up one jump; a new file with no neighbours stays loose. */
const groupNewFiles = (manifest: Manifest, added: ManifestFile[]) => {
  const unfiled = manifest.groups.filter((g) => !g.destination)
  for (const batch of splitByGap(added)) {
    const first = batch[0]!.mtime
    const last = batch[batch.length - 1]!.mtime
    const near = unfiled.find((g) => {
      const own = g.files.filter((f) => !f.copyOf).map((f) => f.mtime)
      return (
        own.length > 0 &&
        first - Math.max(...own) < GROUP_GAP_SECONDS &&
        Math.min(...own) - last < GROUP_GAP_SECONDS
      )
    })
    if (near) {
      near.files = sortFilesByMtime([...near.files, ...batch])
      near.day = dayOfFiles(near.files)
    } else if (batch.length > 1) groupFromFiles(manifest, batch)
  }
}

/* A jump made on the spot out of files dropped somewhere — the only way loose files can become a
   tandem, which needs a jump to carry the passenger name. */
const groupFromFiles = (manifest: Manifest, files: ManifestFile[], destination?: string) => {
  if (files.length === 0) return null
  const id = idMinter(manifest.groups.map((g) => g.id)).next()
  const group: ManifestGroup = {
    ...buildGroup(sortFilesByMtime(files), id, id),
    ...(destination ? { destination } : {})
  }
  manifest.groups.push(group)
  return group
}

/* The files still to be sorted: in no place, and in no jump that is in one. */
const freshIds = (manifest: Manifest) => {
  const filed = new Set(
    manifest.groups.filter((g) => g.destination).flatMap((g) => g.files.map((f) => f.id))
  )
  return new Set(
    manifest.files.flatMap((f) => (f.id && !f.destination && !filed.has(f.id) ? [f.id] : []))
  )
}

/* Re-clusters only the files sitting in no jump, so putting the sorting area back in order never
   disturbs a jump that has already been filed. */
const regroupLooseFiles = (manifest: Manifest) => {
  const grouped = new Set<string>()
  for (const group of manifest.groups)
    for (const file of group.files) if (file.id) grouped.add(file.id)

  const loose = manifest.files.filter((f) => f.id && !grouped.has(f.id) && !f.destination)
  if (loose.length === 0) return 0

  /* a run of one is not a jump, the same as on a scan — it stays loose (RULES, Jumps) */
  const batches = splitByGap(loose).filter((files) => files.length > 1)
  for (const files of batches) groupFromFiles(manifest, files)
  return batches.length
}

/* Moves the given files in time by the same amount, so their order inside the jump is untouched.
   A file is reachable both from the registry and from its jump, hence the seen set. */
const shiftFiles = (manifest: Manifest, ids: Set<string>, offsetSeconds: number) => {
  const shifted = new Set<ManifestFile>()
  const shiftOne = (file: ManifestFile) => {
    if (!file.id || !ids.has(file.id) || shifted.has(file)) return
    shifted.add(file)
    file.mtime += offsetSeconds
  }
  for (const file of manifest.files) shiftOne(file)
  for (const group of manifest.groups) for (const file of group.files) shiftOne(file)
  /* re-timing a jump can carry it into another day, and the day it is filed under has to follow */
  for (const group of manifest.groups) {
    if (group.files.some((f) => shifted.has(f))) group.day = dayOfFiles(group.files)
  }
}

/* A jump moved so that its earliest file lands on the time asked for, and every other file by the
   same amount — so the gaps between them, and their order, stay as they were (RULES, Times and
   dates). */
const shiftGroupTo = (manifest: Manifest, group: ManifestGroup, anchorEpoch: number) => {
  if (group.files.length === 0) return
  const offset = Math.round(anchorEpoch) - startOfFiles(group.files)
  if (offset === 0) return
  shiftFiles(manifest, new Set(group.files.flatMap((f) => (f.id ? [f.id] : []))), offset)
}

/* One file put right on its own — a clip from a second camera on another clock, a photo off a phone
   (RULES, Times and dates). It stays in its jump, and the jump keeps the day it is filed under, as it
   does when a file from another day is dropped into it; only the order inside the jump moves. A lone
   file simply goes with its new time, to whichever day that is. */
const retimeFile = (manifest: Manifest, id: string, epoch: number) => {
  const touched = [...manifest.files, ...manifest.groups.flatMap((g) => g.files)].filter(
    (f) => f.id === id
  )
  if (touched.length === 0) return false
  for (const file of touched) file.mtime = Math.round(epoch)
  for (const group of manifest.groups)
    if (group.files.some((f) => f.id === id)) group.files.sort((a, b) => a.mtime - b.mtime)
  return true
}

export {
  dayOfFiles,
  freshIds,
  groupFromFiles,
  groupNewFiles,
  offGap,
  reclusterGroups,
  regroupLooseFiles,
  retimeFile,
  shiftFiles,
  shiftGroupTo,
  splitByGap,
  startOfFiles
}
