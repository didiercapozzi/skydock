import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ArchiveEntry } from './archive'
import { startOfFiles } from './clustering'
import { filmNameOf, montageArtifacts } from './montageArtifacts'
import { sendPlanSchema } from './types'
import type { ManifestGroup, SendPart, SendPlan } from './types'
import { isVideoFile, parseDayEpoch, sizeOf } from './utils'
import { formatCaptureTime, formatGroupDay, passengerName, toFileStem } from './workspace'

/* What a montage sends, and how, worked out once for the step that shows it and the upload that
   builds it — so what is shown is what is built (RULES, Uploading a montage).

   A montage has four parts: its original videos, its photos, the film, and the editing project.
   Step one makes zips out of them — each zip any of the parts, the same part in as many zips as
   wanted — and every part can also go as it is. What comes out are the items: each zip and each
   part, named after the montage and when it starts, each put in one destination or more in step two. */

const PARTS = ['videos', 'photos', 'film', 'project'] as const satisfies readonly SendPart[]

/* The plan a board has never been told: one full backup of the originals, the photos and the
   project, nothing put anywhere yet. */
const DEFAULT_PLAN: SendPlan = {
  zips: [{ ending: 'full', parts: ['videos', 'photos', 'project'] }],
  placed: {}
}

/* A name made of lowercase letters, digits and single dashes, from whatever was typed: "Boogie 2026"
   is boogie-2026. While it is being typed a dash at the end stays, so the next word can follow it. */
const slugOf = (text: string, typing = false) => {
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-/, '')
  return typing ? slug : slug.replace(/-$/, '')
}

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
  const artifacts = montageArtifacts(outputDir, group)
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

/* A zip is named by the montage and the ending it was given, ….full.zip, or ….zip when it was given
   none. */
const zipNameOf = (stem: string, ending: string) => `${stem}${ending ? `.${ending}` : ''}.zip`

/* The folder a montage lands in inside a destination, unless it goes straight into its folder:
   the one asked for, or the montage's name made into one. */
const projectFolderOf = (group: ManifestGroup, plan: SendPlan) =>
  plan.folder ?? (slugOf(passengerName(group.passenger)) || 'montage')

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
   made of: the zips, then every part as it is. A part the montage has none of — no photos, no film
   rendered yet — is simply not among them, nor is a zip left with nothing in it. Nothing here
   touches the disk, so the board works out the same items from what it knows. */
const itemsFrom = (
  files: Record<SendPart, PartFile[]>,
  stem: string,
  zips: SendPlan['zips']
): SendItem[] => {
  const present = PARTS.filter((part) => files[part].length > 0)
  const zipped = zips.flatMap((zip) => {
    const holds = present.filter((part) => zip.parts.includes(part))
    return holds.length === 0
      ? []
      : [
          itemOf(
            `zip:${zip.ending}`,
            zipNameOf(stem, zip.ending),
            true,
            holds,
            holds.flatMap((part) => partEntries(part, files[part], stem))
          )
        ]
  })
  const loose = present.map((part) => {
    const entries = partEntries(part, files[part], stem)
    const name = part === 'videos' || part === 'photos' ? `${part}/` : entries[0]!.name
    return itemOf(part, name, false, [part], entries)
  })
  return [...zipped, ...loose]
}

/* The items a montage sends, from what is on this machine: the one answer the upload builds. */
const sendItems = (
  group: ManifestGroup,
  outputDir: string,
  zips: SendPlan['zips'],
  film: string | null = null
) => itemsFrom(partFiles(group, outputDir, film), stemOf(group), zips)

/* The plan as it came from the page, read the way anything from outside is: parsed, never trusted. */
const planOf = (value: unknown) => sendPlanSchema.safeParse(value).data ?? DEFAULT_PLAN

export {
  DEFAULT_PLAN,
  itemsFrom,
  PARTS,
  partEntries,
  planOf,
  projectFolderOf,
  sendItems,
  slugOf,
  stemOf,
  zipNameOf
}
export type { PartFile, SendItem }
