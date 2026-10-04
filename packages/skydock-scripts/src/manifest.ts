import * as fs from 'node:fs'
import * as path from 'node:path'
import { changedNothing, describeChange } from './boardChange'
import { z } from 'zod'
import { outputKeyOf } from './fileStatus'
import { writeJsonAtomic } from './lib/fs'
import { jsonText } from './lib/json'
import { groupsFileSchema, manifestSchema } from './types'
import type { GroupsFile, Manifest, ManifestFile } from './types'

const getGroupsPath = (manifestPath: string) => path.join(path.dirname(manifestPath), 'groups.json')

class UnreadableGroups extends Error {}

const groupsTextSchema = jsonText.pipe(groupsFileSchema)

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

const MANIFEST_VERSION = 2

const backupOf = (file: string) => `${file}.bak`

const HISTORY_KEPT = 30
const historyDir = (manifestPath: string) => path.join(path.dirname(manifestPath), '.history')

const readPair = (manifestPath: string, groupsPath: string) => {
  if (!fs.existsSync(manifestPath)) return null
  const stored = storedManifestSchema.safeParse(fs.readFileSync(manifestPath, 'utf-8'))
  if (!stored.success) return null
  const groups = resolveGroups(stored.data.files, readGroupsFile(groupsPath))
  const manifest: Manifest = { ...stored.data, groups }
  return manifest
}

const loadManifest = (manifestPath: string) => {
  const groupsPath = getGroupsPath(manifestPath)
  let failed: unknown = null
  try {
    const manifest = readPair(manifestPath, groupsPath)
    if (manifest || !fs.existsSync(manifestPath)) return manifest
  } catch (e) {
    failed = e
  }
  try {
    const kept = fs.existsSync(backupOf(manifestPath))
      ? readPair(backupOf(manifestPath), backupOf(groupsPath))
      : null
    if (kept) {
      console.warn(`[Manifest] ${manifestPath} could not be read — using the last one read whole.`)
      return kept
    }
  } catch {}
  if (failed) throw failed
  return null
}

const keepBoardStep = (manifestPath: string) => {
  const groupsPath = getGroupsPath(manifestPath)
  if (!fs.existsSync(manifestPath)) return
  const history = historyDir(manifestPath)
  const at = new Date().toISOString().replace(/[:.]/g, '-')
  const taken = fs.existsSync(history)
    ? fs.readdirSync(history).filter((n) => n.startsWith(at))
    : []
  const step = path.join(history, `${at}-${String(taken.length).padStart(3, '0')}`)
  fs.mkdirSync(step, { recursive: true })
  fs.copyFileSync(manifestPath, path.join(step, 'manifest.json'))
  if (fs.existsSync(groupsPath)) fs.copyFileSync(groupsPath, path.join(step, 'groups.json'))
  const steps = fs.readdirSync(history).sort()
  for (const old of steps.slice(0, Math.max(0, steps.length - HISTORY_KEPT)))
    fs.rmSync(path.join(history, old), { recursive: true, force: true })
}

const boardHistory = (manifestPath: string) => {
  const history = historyDir(manifestPath)
  if (!fs.existsSync(history)) return []
  const read = (step: string) => {
    try {
      return readPair(
        path.join(history, step, 'manifest.json'),
        path.join(history, step, 'groups.json')
      )
    } catch {
      return null
    }
  }
  const steps = fs
    .readdirSync(history)
    .sort()
    .flatMap((step) => {
      const board = read(step)
      if (!board) return []
      const at = fs.statSync(path.join(history, step, 'manifest.json')).mtimeMs
      return [{ step, at: Math.floor(at / 1000), board }]
    })
  let now: Manifest | null = null
  try {
    now = loadManifest(manifestPath)
  } catch {
    now = null
  }
  return steps
    .flatMap(({ step, at, board }, i) => {
      const after = steps[i + 1]?.board ?? now
      if (!after) return []
      const change = describeChange(board, after)
      return changedNothing(change) ? [] : [{ step, at, change }]
    })
    .reverse()
}

const restoreBoard = (manifestPath: string, step: string) => {
  const from = path.join(historyDir(manifestPath), path.basename(step))
  const was = readPair(path.join(from, 'manifest.json'), path.join(from, 'groups.json'))
  if (!was) throw new Error('That earlier state of the board can no longer be read.')
  keepBoardStep(manifestPath)
  saveManifest(manifestPath, was)
  return was
}

const BATCH_MS = 500

type Waiting = { changes: Map<string, (board: Manifest) => void>; timer: NodeJS.Timeout | null }

declare global {
  var skydockBoardChanges: Map<string, Waiting> | undefined
}

const waitingFor = (manifestPath: string) => {
  const all = (globalThis.skydockBoardChanges ??= new Map())
  let waiting = all.get(manifestPath)
  if (!waiting) {
    waiting = { changes: new Map(), timer: null }
    all.set(manifestPath, waiting)
  }
  return waiting
}

let unnamed = 0

const flushBoardChanges = (manifestPath: string) => {
  const waiting = waitingFor(manifestPath)
  if (waiting.timer) clearTimeout(waiting.timer)
  waiting.timer = null
  if (waiting.changes.size === 0) return
  const changes = [...waiting.changes.values()]
  waiting.changes.clear()
  try {
    const board = loadManifest(manifestPath)
    if (!board) return
    for (const change of changes) change(board)
    saveManifest(manifestPath, board)
  } catch (e) {
    console.warn(
      '[Manifest] could not record what was waiting:',
      e instanceof Error ? e.message : e
    )
  }
}

const flushAllBoardChanges = () => {
  for (const manifestPath of globalThis.skydockBoardChanges?.keys() ?? [])
    flushBoardChanges(manifestPath)
}

const changeBoardSoon = (manifestPath: string, change: (board: Manifest) => void, key?: string) => {
  const waiting = waitingFor(manifestPath)
  waiting.changes.set(key ?? `#${unnamed++}`, change)
  waiting.timer ??= setTimeout(() => flushBoardChanges(manifestPath), BATCH_MS)
}

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

const stampOfFile = (target: string) => {
  try {
    const stat = fs.statSync(target)
    return `${stat.size}:${stat.mtimeMs}`
  } catch {
    return 'none'
  }
}
const pairStamp = (manifestPath: string) =>
  `${stampOfFile(manifestPath)}|${stampOfFile(getGroupsPath(manifestPath))}`

declare global {
  var skydockManifestWritten: Map<string, string> | undefined
}

const writtenHere = () => (globalThis.skydockManifestWritten ??= new Map())

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
  fs.copyFileSync(manifestPath, backupOf(manifestPath))
  fs.copyFileSync(getGroupsPath(manifestPath), backupOf(getGroupsPath(manifestPath)))
  writtenHere().set(manifestPath, pairStamp(manifestPath))
}

export {
  changeBoardSoon,
  pairStamp,
  writtenHere,
  flushAllBoardChanges,
  flushBoardChanges,
  boardHistory,
  keepBoardStep,
  getGroupsPath,
  loadManifest,
  MANIFEST_VERSION,
  restoreBoard,
  saveManifest,
  statProcessedOutputs
}
