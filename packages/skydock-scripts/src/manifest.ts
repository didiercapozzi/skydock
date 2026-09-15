import * as fs from 'node:fs'
import * as path from 'node:path'
import { writeJsonAtomic } from './lib/fs'
import { groupsFileSchema, manifestSchema } from './types'
import type { GroupsFile, Manifest, ManifestFile } from './types'

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
    id: g.id,
    label: g.label,
    confirmed: g.confirmed,
    processed: g.processed ?? undefined,
    passenger: g.passenger ?? undefined,
    publish: g.publish ?? undefined,
    day: g.day,
    destination: g.destination ?? undefined,
    files: g.files
      .map((ref) => {
        const base = byId.get(ref.id)
        if (!base) {
          dangling++
          return null
        }
        const resolved: ManifestFile = { ...base }
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

    if (Array.isArray(raw.jumps)) {
      const parsed = manifestSchema.parse({ ...raw, groups: raw.jumps })
      const groupsPath = getGroupsPath(manifestPath)
      if (!fs.existsSync(groupsPath)) {
        const groupsFile: GroupsFile = {
          groups: parsed.groups.map((g) => ({
            id: g.id,
            label: g.label,
            confirmed: g.confirmed,
            processed: g.processed ?? undefined,
            passenger: g.passenger ?? undefined,
            publish: g.publish ?? undefined,
            day: g.day,
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
        writeJsonAtomic(groupsPath, groupsFile)

        const newManifestRaw = {
          version: parsed.version,
          status: parsed.status,
          date: parsed.date,
          startDatetime: parsed.startDatetime,
          createdAt: parsed.createdAt,
          theory: parsed.theory,
          files: parsed.files,
          destinations: parsed.destinations ?? undefined,
          cameraClockOffsetSeconds: parsed.cameraClockOffsetSeconds
        }
        manifestSchema.omit({ groups: true }).passthrough().parse(newManifestRaw)
        writeJsonAtomic(manifestPath, newManifestRaw)
      }
      return parsed
    }

    const files: ManifestFile[] = Array.isArray(raw.files) ? raw.files : []
    const groupsFile = readGroupsFile(getGroupsPath(manifestPath))
    const groups = resolveGroups(files, groupsFile)

    const manifest: Manifest = {
      version: raw.version ?? 1,
      status: raw.status ?? (groups.length > 0 ? 'proposed' : 'empty'),
      date: raw.date ?? new Date().toISOString().split('T')[0],
      startDatetime: raw.startDatetime ?? new Date().toISOString(),
      createdAt: raw.createdAt ?? new Date().toISOString(),
      theory: Array.isArray(raw.theory) ? raw.theory : [],
      files,
      groups,
      destinations: raw.destinations ?? undefined,
      cameraClockOffsetSeconds: raw.cameraClockOffsetSeconds ?? undefined
    }
    return manifestSchema.parse(manifest)
  } catch {
    return null
  }
}

const saveManifest = (manifestPath: string, manifest: Manifest) => {
  manifestSchema.parse(manifest)
  const dir = path.dirname(manifestPath)
  fs.mkdirSync(dir, { recursive: true })

  const groupsFile: GroupsFile = {
    groups: manifest.groups.map((g) => ({
      id: g.id,
      label: g.label,
      confirmed: g.confirmed,
      processed: g.processed ?? undefined,
      passenger: g.passenger ?? undefined,
      publish: g.publish ?? undefined,
      day: g.day,
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
  const groupsPath = getGroupsPath(manifestPath)
  writeJsonAtomic(groupsPath, groupsFile)

  const raw = {
    version: manifest.version,
    status: manifest.status,
    date: manifest.date,
    startDatetime: manifest.startDatetime,
    createdAt: manifest.createdAt,
    theory: manifest.theory,
    files: manifest.files,
    destinations: manifest.destinations ?? undefined,
    cameraClockOffsetSeconds: manifest.cameraClockOffsetSeconds
  }
  manifestSchema.omit({ groups: true }).passthrough().parse(raw)
  writeJsonAtomic(manifestPath, raw)
}

const normalizeManifest = (manifest: Manifest) => {
  let changed = false
  for (const group of manifest.groups) {
    if (group.processed === null) {
      delete group.processed
      changed = true
    }
    if (group.passenger === null) {
      delete group.passenger
      changed = true
    }
    if (group.publish === null) {
      delete group.publish
      changed = true
    }
  }
  if (manifest.cameraClockOffsetSeconds === null) {
    delete manifest.cameraClockOffsetSeconds
    changed = true
  }
  for (const file of [
    ...manifest.files,
    ...manifest.theory,
    ...manifest.groups.flatMap((g) => g.files)
  ]) {
    if (file.id === null) {
      delete file.id
      changed = true
    }
    if (file.originalMtime === null) {
      delete file.originalMtime
      changed = true
    }
    if (file.cropStart === null) {
      delete file.cropStart
      changed = true
    }
    if (file.cropEnd === null) {
      delete file.cropEnd
      changed = true
    }
    const legacy = file as unknown as Record<string, unknown>
    if (legacy.thumbPath !== undefined) {
      delete legacy.thumbPath
      changed = true
    }
    if (legacy.filmstripDir !== undefined) {
      delete legacy.filmstripDir
      changed = true
    }
    if (legacy.keyframes !== undefined) {
      delete legacy.keyframes
      changed = true
    }
  }
  return changed
}

export { loadManifest, normalizeManifest, saveManifest }
