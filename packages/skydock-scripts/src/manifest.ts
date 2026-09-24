import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { outputKeyOf } from './fileStatus'
import { writeJsonAtomic } from './lib/fs'
import { jsonText } from './lib/json'
import { groupsFileSchema, manifestSchema, tandemUploadSchema } from './types'
import type { GroupsFile, Manifest, ManifestFile, ManifestGroup } from './types'
import { MONTAGES_FOLDER } from './workspace'

/* The registry of files and the jumps built out of it live in two files side by side: every file
   is described once in manifest.json, and groups.json only points at them. A file therefore never
   exists twice with two different truths. */
const getGroupsPath = (manifestPath: string) => path.join(path.dirname(manifestPath), 'groups.json')

/* A groups file that is there but cannot be understood is the one case where answering "no jumps"
   is worse than answering nothing: the next scan re-clusters from an empty slate, mints fresh ids
   and files none of them, so a day of sorting is gone with no message. Refusing is recoverable —
   the file is still on disk and can be looked at. Quietly agreeing is not. */
class UnreadableGroups extends Error {}

/* Whether the file failed as JSON or failed as a jumps file makes no difference to what follows —
   either way it cannot be read — so there is one schema and one way out. A jumps file written when
   a tandem's upload was recorded under the name "delivered" is read as the same record. */
const storedGroupSchema = groupsFileSchema.shape.groups.element.extend({
  delivered: tandemUploadSchema.optional()
})
const groupsTextSchema = jsonText.pipe(
  z.object({ groups: z.array(storedGroupSchema) }).transform(({ groups }): GroupsFile => ({
    groups: groups.map(({ delivered, ...group }) => ({
      ...group,
      uploaded: group.uploaded ?? delivered
    }))
  }))
)

/* What is actually on disk: the registry, without the jumps, which live in their own file and are
   put back by resolveGroups. The three defaults are what an older or half-written manifest is
   allowed to be missing. */
const storedManifestSchema = jsonText.pipe(
  manifestSchema.omit({ groups: true }).extend({
    version: manifestSchema.shape.version.default(1),
    createdAt: manifestSchema.shape.createdAt.default(() => new Date().toISOString()),
    files: manifestSchema.shape.files.default([])
  })
)

const readGroupsFile = (groupsPath: string) => {
  if (!fs.existsSync(groupsPath)) return null
  const parsed = groupsTextSchema.safeParse(fs.readFileSync(groupsPath, 'utf-8'))
  if (!parsed.success)
    throw new UnreadableGroups(
      `${groupsPath} cannot be read as a jumps file, so it will not be read as having none:\n${z.prettifyError(parsed.error)}`
    )
  return parsed.data
}

const resolveGroups = (files: ManifestFile[], groupsFile: GroupsFile | null) => {
  if (!groupsFile) return []
  const byId = new Map<string, ManifestFile>()
  for (const f of files) if (f.id) byId.set(f.id, f)
  let dangling = 0
  const groups = groupsFile.groups.map((g) => ({
    ...g,
    processed: g.processed ?? undefined,
    passenger: g.passenger ?? undefined,
    publish: g.publish ?? undefined,
    destination: g.destination ?? undefined,
    files: g.files
      .map((ref) => {
        const base = byId.get(ref.id)
        if (!base) {
          dangling++
          return null
        }
        const resolved: ManifestFile = { ...base }
        /* the jump's own crop wins, and its absence clears whatever the registry entry had */
        if (ref.cropStart !== undefined) resolved.cropStart = ref.cropStart
        else delete resolved.cropStart
        if (ref.cropEnd !== undefined) resolved.cropEnd = ref.cropEnd
        else delete resolved.cropEnd
        if (ref.frame !== undefined) resolved.frame = ref.frame
        else delete resolved.frame
        if (ref.rotation !== undefined) resolved.rotation = ref.rotation
        else delete resolved.rotation
        return resolved
      })
      .filter((f) => f !== null)
  }))
  if (dangling > 0) console.log(`[Manifest] Dropped ${dangling} dangling group file ref(s).`)
  return groups
}

/* The record as montages have it. Before them, a tandem was a jump filed under Tandems; from version 2
   a montage is marked as one and belongs to no destination, and Tandems is a destination like any
   other. The change is made once, on reading an older record, and written with its next save: a jump
   filed under Tandems after that is filed there, not a montage. */
const MANIFEST_VERSION = 2

const asMontages = (groups: ManifestGroup[]) =>
  groups.map(({ destination, ...group }) =>
    destination === MONTAGES_FOLDER ? { ...group, montageJump: true } : { ...group, destination }
  )

const loadManifest = (manifestPath: string) => {
  if (!fs.existsSync(manifestPath)) return null
  const stored = storedManifestSchema.safeParse(fs.readFileSync(manifestPath, 'utf-8'))
  /* a manifest that cannot be read at all is "no manifest", which is safe: the registry describes
     files that are still on the card and a scan builds it again */
  if (!stored.success) return null
  /* jumps that cannot be read are not "no jumps", so that refusal travels out of here rather than
     being flattened into the same answer */
  const groups = resolveGroups(stored.data.files, readGroupsFile(getGroupsPath(manifestPath)))
  const older = stored.data.version < MANIFEST_VERSION
  const manifest: Manifest = {
    ...stored.data,
    version: Math.max(stored.data.version, MANIFEST_VERSION),
    groups: older ? asMontages(groups) : groups
  }
  return manifest
}

/* What the disk currently says about each processed copy, keyed by the file's identity. The record alone
   cannot know that someone emptied `processed/` or that a crop was re-rendered shorter, so the
   status is only trustworthy with this alongside it. One stat per processed file. */
const statProcessedOutputs = (manifest: Manifest) => {
  const outputs: Record<string, { exists: boolean; size: number }> = {}
  for (const file of manifest.files) {
    if (!file.processed) continue
    try {
      const stat = fs.statSync(file.processed.path)
      outputs[outputKeyOf(file)] = { exists: true, size: stat.size }
    } catch {
      outputs[outputKeyOf(file)] = { exists: false, size: 0 }
    }
  }
  return outputs
}

const saveManifest = (manifestPath: string, manifest: Manifest) => {
  manifestSchema.parse(manifest)
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })

  const groupsFile: GroupsFile = {
    groups: manifest.groups.map((g) => ({
      ...g,
      processed: g.processed ?? undefined,
      passenger: g.passenger ?? undefined,
      publish: g.publish ?? undefined,
      destination: g.destination ?? undefined,
      files: g.files
        .filter((f) => f.id)
        .map((f) => ({
          id: f.id!,
          cropStart: f.cropStart ?? undefined,
          cropEnd: f.cropEnd ?? undefined,
          frame: f.frame ?? undefined,
          /* as shot is not written down */
          rotation: f.rotation || undefined
        }))
    }))
  }
  groupsFileSchema.parse(groupsFile)
  writeJsonAtomic(getGroupsPath(manifestPath), groupsFile)

  const raw = {
    version: manifest.version,
    createdAt: manifest.createdAt,
    files: manifest.files,
    destinations: manifest.destinations ?? undefined
  }
  manifestSchema.omit({ groups: true }).parse(raw)
  writeJsonAtomic(manifestPath, raw)
}

export { getGroupsPath, loadManifest, MANIFEST_VERSION, saveManifest, statProcessedOutputs }
