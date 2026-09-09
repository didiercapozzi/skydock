import * as fs from 'node:fs'
import * as path from 'node:path'
import { jumpsFileSchema, manifestSchema } from './types'
import type { JumpsFile, Manifest, ManifestFile } from './types'

const getJumpsPath = (manifestPath: string): string =>
  path.join(path.dirname(manifestPath), 'jumps.json')

const readJumpsFile = (jumpsPath: string): JumpsFile | null => {
  if (!fs.existsSync(jumpsPath)) return null
  try {
    return jumpsFileSchema.parse(JSON.parse(fs.readFileSync(jumpsPath, 'utf-8')))
  } catch {
    return null
  }
}

const resolveJumps = (files: ManifestFile[], jumpsFile: JumpsFile | null): Manifest['jumps'] => {
  if (!jumpsFile) return []
  const byId = new Map<string, ManifestFile>()
  for (const f of files) if (f.id) byId.set(f.id, f)
  return jumpsFile.jumps.map((j) => ({
    id: j.id,
    label: j.label,
    confirmed: j.confirmed,
    processed: j.processed ?? undefined,
    passenger: j.passenger ?? undefined,
    publish: j.publish ?? undefined,
    files: j.files
      .map((ref) => {
        const base = byId.get(ref.id)
        if (!base) return null
        const resolved: ManifestFile = { ...base }
        if (ref.cropStart !== undefined) resolved.cropStart = ref.cropStart
        else delete resolved.cropStart
        if (ref.cropEnd !== undefined) resolved.cropEnd = ref.cropEnd
        else delete resolved.cropEnd
        return resolved
      })
      .filter((f): f is ManifestFile => f !== null)
  }))
}

const loadManifest = (manifestPath: string): Manifest | null => {
  if (!fs.existsSync(manifestPath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

    if (Array.isArray(raw.jumps)) {
      const parsed = manifestSchema.parse(raw)
      const jumpsPath = getJumpsPath(manifestPath)
      if (!fs.existsSync(jumpsPath)) {
        const jumpsFile: JumpsFile = {
          jumps: parsed.jumps.map((j) => ({
            id: j.id,
            label: j.label,
            confirmed: j.confirmed,
            processed: j.processed ?? undefined,
            passenger: j.passenger ?? undefined,
            publish: j.publish ?? undefined,
            files: j.files
              .filter((f) => f.id)
              .map((f) => ({
                id: f.id!,
                cropStart: f.cropStart ?? undefined,
                cropEnd: f.cropEnd ?? undefined
              }))
          }))
        }
        const tmpJ = `${jumpsPath}.tmp`
        fs.writeFileSync(tmpJ, JSON.stringify(jumpsFile, null, 2))
        fs.renameSync(tmpJ, jumpsPath)

        const newManifestRaw = {
          version: parsed.version,
          status: parsed.status,
          date: parsed.date,
          startDatetime: parsed.startDatetime,
          createdAt: parsed.createdAt,
          theory: parsed.theory,
          files: parsed.files,
          cameraClockOffsetSeconds: parsed.cameraClockOffsetSeconds
        }
        const tmpM = `${manifestPath}.tmp`
        fs.writeFileSync(tmpM, JSON.stringify(newManifestRaw, null, 2))
        fs.renameSync(tmpM, manifestPath)
      }
      return parsed
    }

    const files: ManifestFile[] = Array.isArray(raw.files) ? raw.files : []
    const jumpsFile = readJumpsFile(getJumpsPath(manifestPath))
    const jumps = resolveJumps(files, jumpsFile)

    const manifest: Manifest = {
      version: raw.version ?? 1,
      status: raw.status ?? (jumps.length > 0 ? 'proposed' : 'empty'),
      date: raw.date ?? new Date().toISOString().split('T')[0],
      startDatetime: raw.startDatetime ?? new Date().toISOString(),
      createdAt: raw.createdAt ?? new Date().toISOString(),
      theory: Array.isArray(raw.theory) ? raw.theory : [],
      files,
      jumps,
      cameraClockOffsetSeconds: raw.cameraClockOffsetSeconds ?? undefined
    }
    return manifestSchema.parse(manifest)
  } catch {
    return null
  }
}

const saveManifest = (manifestPath: string, manifest: Manifest): void => {
  const dir = path.dirname(manifestPath)
  fs.mkdirSync(dir, { recursive: true })

  const jumpsFile: JumpsFile = {
    jumps: manifest.jumps.map((j) => ({
      id: j.id,
      label: j.label,
      confirmed: j.confirmed,
      processed: j.processed ?? undefined,
      passenger: j.passenger ?? undefined,
      publish: j.publish ?? undefined,
      files: j.files
        .filter((f) => f.id)
        .map((f) => ({
          id: f.id!,
          cropStart: f.cropStart ?? undefined,
          cropEnd: f.cropEnd ?? undefined
        }))
    }))
  }
  const jumpsPath = getJumpsPath(manifestPath)
  const tmpJ = `${jumpsPath}.tmp`
  fs.writeFileSync(tmpJ, JSON.stringify(jumpsFile, null, 2))
  fs.renameSync(tmpJ, jumpsPath)

  const raw = {
    version: manifest.version,
    status: manifest.status,
    date: manifest.date,
    startDatetime: manifest.startDatetime,
    createdAt: manifest.createdAt,
    theory: manifest.theory,
    files: manifest.files,
    cameraClockOffsetSeconds: manifest.cameraClockOffsetSeconds
  }
  const tmpM = `${manifestPath}.tmp`
  fs.writeFileSync(tmpM, JSON.stringify(raw, null, 2))
  fs.renameSync(tmpM, manifestPath)
}

const normalizeManifest = (manifest: Manifest): boolean => {
  let changed = false
  for (const jump of manifest.jumps) {
    if (jump.processed === null) {
      delete jump.processed
      changed = true
    }
    if (jump.passenger === null) {
      delete jump.passenger
      changed = true
    }
    if (jump.publish === null) {
      delete jump.publish
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
    ...manifest.jumps.flatMap((j) => j.files)
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
