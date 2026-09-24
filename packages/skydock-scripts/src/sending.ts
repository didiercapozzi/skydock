import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ArchiveEntry } from './archive'
import { startOfFiles } from './clustering'
import { filmNameOf, tandemArtifacts } from './tandem'
import { sendPlanSchema } from './types'
import type { ManifestGroup, SendPart, SendPlan } from './types'
import { isVideoFile, parseDayEpoch, sizeOf } from './utils'
import { formatCaptureTime, formatGroupDay, passengerName, toFileStem } from './workspace'

/* What a montage sends, and how, worked out once for the step that shows it and the upload that
   builds it — so what is shown is what is built (RULES, Uploading a montage).

   A montage has four parts: its original videos, its photos, the film, and the editing project.
   Step one ticks which go into a zip — into one zip, or a zip each — and whatever is not ticked goes
   as it is. What comes out are the items: each one a zip or the part itself, named after the montage
   and when it starts, and each put in one destination or more in step two. */

const PARTS = ['videos', 'photos', 'film', 'project'] as const satisfies readonly SendPart[]

/* The plan a board has never been told: the originals and the project in one zip, the film and the
   photos as they are, nothing put anywhere yet. */
const DEFAULT_PLAN: SendPlan = { zip: { parts: ['videos', 'project'], each: false }, placed: {} }

/* `boogie_2026_20260801_153004`: the montage's name, the day of its jump — the day its film and its
   project are named for too — and the time the jump started. */
const stemOf = (group: ManifestGroup) => {
  const start = startOfFiles(group.files)
  const day = parseDayEpoch(group.day) ?? start
  return `${toFileStem(passengerName(group.passenger), 'montage')}_${formatGroupDay(day)}_${formatCaptureTime(start)}`
}

/* One file of a part: where it is, what it is called, how big it is. */
type PartFile = ArchiveEntry & { size: number }

/* A folder's worth of a part keeps its files under the part's own name, in a zip and on the storage
   alike: videos/ and photos/. The film and the project are single files, named by the stem. */
const partEntries = (part: SendPart, files: PartFile[], stem: string): PartFile[] =>
  part === 'videos' || part === 'photos'
    ? files.map((f) => ({ ...f, name: `${part}/${f.name}` }))
    : files.map((f) => ({ ...f, name: `${stem}.${part === 'film' ? 'mp4' : 'kdenlive'}` }))

/* What each part is made of on this machine, when there is any of it: the originals as they came off
   the cameras, the photos as they were prepared, the film as rendered and the project as edited. */
const partFiles = (group: ManifestGroup, outputDir: string, film: string | null) => {
  const artifacts = tandemArtifacts(outputDir, group)
  const photosDir = path.join(artifacts.dir, 'photos')
  const project = path.join(artifacts.dir, `${artifacts.baseName}.kdenlive`)
  const renderedFilm =
    film ??
    (artifacts.film
      ? path.join(artifacts.dir, filmNameOf(artifacts.baseName))
      : artifacts.strayFilms.length === 1
        ? path.join(artifacts.dir, artifacts.strayFilms[0]!)
        : null)
  const one = (file: string) => ({ file, name: path.basename(file), size: sizeOf(file) })
  return {
    videos: group.files
      .filter((f) => isVideoFile(f.path) && fs.existsSync(f.path))
      .map((f) => ({ file: f.path, name: f.filename, size: sizeOf(f.path) })),
    photos: fs.existsSync(photosDir)
      ? fs
          .readdirSync(photosDir)
          .sort()
          .map((name) => one(path.join(photosDir, name)))
      : [],
    film: renderedFilm ? [one(renderedFilm)] : [],
    project: fs.existsSync(project) ? [one(project)] : []
  } satisfies Record<SendPart, PartFile[]>
}

/* One zip is named for what it is a backup of: its videos, its photos, or both — the full backup.
   A zip each is named for the one part in it. */
const zipNameOf = (stem: string, holds: SendPart[], each: boolean) => {
  if (each) return `${stem}.backup.${holds[0]}.zip`
  const videos = holds.includes('videos')
  const photos = holds.includes('photos')
  return `${stem}.backup.${videos && photos ? 'full' : videos ? 'videos' : photos ? 'photos' : 'full'}.zip`
}

/* A zip each is a zip per ticked part, except that the project goes in with the videos when both are
   ticked: the edit and the clips it was cut from are one backup. */
const zipGroups = (ticked: SendPart[], each: boolean): SendPart[][] => {
  if (!each) return ticked.length > 0 ? [ticked] : []
  const withVideos = ticked.includes('videos') && ticked.includes('project')
  return ticked
    .filter((part) => !(withVideos && part === 'project'))
    .map((part) => (part === 'videos' && withVideos ? ['videos', 'project'] : [part]))
}

type SendItem = {
  key: string
  name: string
  zip: boolean
  holds: SendPart[]
  entries: PartFile[]
  /* how many files, and how big, before any zipping */
  count: number
  size: number
}

const itemOf = (
  key: string,
  name: string,
  zip: boolean,
  holds: SendPart[],
  entries: PartFile[]
) => ({
  key,
  name,
  zip,
  holds,
  entries,
  count: entries.length,
  size: entries.reduce((sum, entry) => sum + entry.size, 0)
})

/* Every item a montage sends under this plan, in the order they are shown, from what each part is
   made of. A part the montage has none of — no photos, no film rendered yet — is simply not among
   them. Nothing here touches the disk, so the board works out the same items from what it knows. */
const itemsFrom = (
  files: Record<SendPart, PartFile[]>,
  stem: string,
  zip: SendPlan['zip']
): SendItem[] => {
  const present = PARTS.filter((part) => files[part].length > 0)
  const ticked = present.filter((part) => zip.parts.includes(part))
  const zips = zipGroups(ticked, zip.each).map((holds) =>
    itemOf(
      zip.each ? `zip:${holds[0]}` : 'zip',
      zipNameOf(stem, holds, zip.each),
      true,
      holds,
      holds.flatMap((part) => partEntries(part, files[part], stem))
    )
  )
  const loose = present
    .filter((part) => !ticked.includes(part))
    .map((part) => {
      const entries = partEntries(part, files[part], stem)
      const name = part === 'videos' || part === 'photos' ? `${part}/` : entries[0]!.name
      return itemOf(part, name, false, [part], entries)
    })
  return [...zips, ...loose]
}

/* The items a montage sends, from what is on this machine: the one answer the upload builds. */
const sendItems = (
  group: ManifestGroup,
  outputDir: string,
  zip: SendPlan['zip'],
  film: string | null = null
) => itemsFrom(partFiles(group, outputDir, film), stemOf(group), zip)

/* The plan as it came from the page, read the way anything from outside is: parsed, never trusted. */
const planOf = (value: unknown) => sendPlanSchema.safeParse(value).data ?? DEFAULT_PLAN

export { DEFAULT_PLAN, itemsFrom, PARTS, partEntries, planOf, sendItems, stemOf, zipNameOf }
export type { PartFile, SendItem }
