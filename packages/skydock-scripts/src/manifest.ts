import * as fs from 'node:fs'
import * as path from 'node:path'
import { writeJsonAtomic } from './lib/fs'
import { groupsFileSchema, manifestSchema } from './types'
import type { GroupsFile, Manifest, ManifestFile } from './types'

/* The registry of files and the jumps built out of it live in two files side by side: every file
   is described once in manifest.json, and groups.json only points at them. A file therefore never
   exists twice with two different truths. */
const getGroupsPath = (manifestPath: string) => path.join(path.dirname(manifestPath), 'groups.json')

const readGroupsFile = (groupsPath: string) => {
  if (!fs.existsSync(groupsPath)) return null
  try {
    return groupsFileSchema.parse(JSON.parse(fs.readFileSync(groupsPath, 'utf-8')))
  } catch {
    return null
  }
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
        return resolved
      })
      .filter((f): f is ManifestFile => f !== null)
  }))
  if (dangling > 0) console.log(`[Manifest] Dropped ${dangling} dangling group file ref(s).`)
  return groups
}

const loadManifest = (manifestPath: string) => {
  if (!fs.existsSync(manifestPath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    const files: ManifestFile[] = Array.isArray(raw.files) ? raw.files : []
    const groups = resolveGroups(files, readGroupsFile(getGroupsPath(manifestPath)))
    return manifestSchema.parse({
      version: raw.version ?? 1,
      createdAt: raw.createdAt ?? new Date().toISOString(),
      files,
      groups,
      destinations: raw.destinations ?? undefined
    })
  } catch {
    return null
  }
}

/* What the disk currently says about each processed copy, keyed by source path. The record alone
   cannot know that someone emptied `processed/` or that a crop was re-rendered shorter, so the
   status is only trustworthy with this alongside it. One stat per processed file. */
const statProcessedOutputs = (manifest: Manifest) => {
  const outputs: Record<string, { exists: boolean; size: number }> = {}
  for (const file of manifest.files) {
    if (!file.processed) continue
    try {
      const stat = fs.statSync(file.processed.path)
      outputs[file.path] = { exists: true, size: stat.size }
    } catch {
      outputs[file.path] = { exists: false, size: 0 }
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
          cropEnd: f.cropEnd ?? undefined
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

export { loadManifest, saveManifest, statProcessedOutputs }
