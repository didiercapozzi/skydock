import { mkdir, readFile } from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
import { outputKeyOf } from './fileStatus'
import { pathExists, statOrNull, writeJsonAtomic } from './lib/fs'
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

const parseGroups = (groupsPath: string, text: string) => {
  const parsed = groupsTextSchema.safeParse(text)
  if (!parsed.success)
    throw new UnreadableGroups(
      `${groupsPath} cannot be read as a jumps file, so it will not be read as having none:\n${z.prettifyError(parsed.error)}`
    )
  return parsed.data
}

const readTextOrNull = (file: string) => readFile(file, 'utf-8').catch(() => null)

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

const FOLDERS = /^(.*?)\/(original_files|processed|proxies|\.send|\.trash)\/(.+)$/
const PATH_KEYS = new Set(['path', 'localPath', 'proxy'])

const rebaseOnto = async (value: unknown, root: string, seen = new Set<unknown>()) => {
  if (value === null || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  const holder = value as Record<string, unknown>
  for (const [key, inside] of Object.entries(holder)) {
    if (typeof inside === 'string' && PATH_KEYS.has(key) && !inside.startsWith(`${root}/`)) {
      const found = FOLDERS.exec(inside)
      if (!found || (await pathExists(inside))) continue
      const here = `${root}/${found[2]}/${found[3]}`
      if (await pathExists(here)) holder[key] = here
    } else await rebaseOnto(inside, root, seen)
  }
}

const assemble = async (manifestPath: string, text: string, groupsFile: GroupsFile | null) => {
  const stored = storedManifestSchema.safeParse(text)
  if (!stored.success) return null
  const manifest: Manifest = {
    ...stored.data,
    groups: resolveGroups(stored.data.files, groupsFile)
  }
  await rebaseOnto(manifest, path.dirname(manifestPath))
  return manifest
}

const readPair = async (manifestPath: string, groupsPath: string) => {
  const text = await readTextOrNull(manifestPath)
  if (text === null) return null
  const groupsText = await readTextOrNull(groupsPath)
  return assemble(
    manifestPath,
    text,
    groupsText === null ? null : parseGroups(groupsPath, groupsText)
  )
}

const RECORD_UNREADABLE =
  'The board’s record could not be read — nothing was changed. Mend or put back manifest.json in the work folder.'

const readRecordAsync = async (manifestPath: string) => {
  const manifest = await readPair(manifestPath, getGroupsPath(manifestPath))
  return { manifest, unreadable: manifest === null && (await pathExists(manifestPath)) }
}

const loadManifestAsync = async (manifestPath: string) =>
  (await readRecordAsync(manifestPath)).manifest

const BATCH_MS = 500

type BoardChange = (board: Manifest) => void | Promise<void>

type Waiting = {
  changes: Map<string, BoardChange>
  timer: NodeJS.Timeout | null
  chain: Promise<void>
}

declare global {
  var skydockBoardChanges: Map<string, Waiting> | undefined
}

const waitingFor = (manifestPath: string) => {
  const all = (globalThis.skydockBoardChanges ??= new Map())
  let waiting = all.get(manifestPath)
  if (!waiting) {
    waiting = { changes: new Map(), timer: null, chain: Promise.resolve() }
    all.set(manifestPath, waiting)
  }
  return waiting
}

let unnamed = 0

const flushBoardChanges = (manifestPath: string) => {
  const waiting = waitingFor(manifestPath)
  if (waiting.timer) clearTimeout(waiting.timer)
  waiting.timer = null
  if (waiting.changes.size === 0) return waiting.chain
  const changes = [...waiting.changes.values()]
  waiting.changes.clear()
  waiting.chain = waiting.chain.then(async () => {
    try {
      await inTurn(manifestPath, async () => {
        const board = await loadManifestAsync(manifestPath)
        if (!board) return
        for (const change of changes) await change(board)
        await writeManifest(manifestPath, board)
      })
    } catch (e) {
      console.warn(
        '[Manifest] could not record what was waiting:',
        e instanceof Error ? e.message : e
      )
    }
  })
  return waiting.chain
}

const flushAllBoardChanges = () =>
  Promise.all([...(globalThis.skydockBoardChanges?.keys() ?? [])].map(flushBoardChanges))

const changeBoardSoon = (manifestPath: string, change: BoardChange, key?: string) => {
  const waiting = waitingFor(manifestPath)
  waiting.changes.set(key ?? `#${unnamed++}`, change)
  waiting.timer ??= setTimeout(() => void flushBoardChanges(manifestPath), BATCH_MS)
}

const recordPass = (
  manifestPath: string,
  pass: Manifest,
  merge: (file: ManifestFile, found: ManifestFile) => void | Promise<void>,
  key: string
) =>
  changeBoardSoon(
    manifestPath,
    async (current) => {
      const found = new Map(pass.files.map((file) => [outputKeyOf(file), file]))
      for (const file of current.files) {
        const done = found.get(outputKeyOf(file))
        if (done) await merge(file, done)
      }
    },
    key
  )

const statProcessedOutputs = async (manifest: Manifest) => {
  const outputs: Record<string, { exists: boolean; size: number }> = {}
  for (const file of manifest.files) {
    if (!file.processed) continue
    const stat = await statOrNull(file.processed.path)
    outputs[outputKeyOf(file)] = { exists: stat !== null, size: stat?.size ?? 0 }
  }
  return outputs
}

const stampOfFile = async (target: string) => {
  const stat = await statOrNull(target)
  return stat ? `${stat.size}:${stat.mtimeMs}` : 'none'
}

const pairStamp = async (manifestPath: string) =>
  `${await stampOfFile(manifestPath)}|${await stampOfFile(getGroupsPath(manifestPath))}`

declare global {
  var skydockManifestWritten: Map<string, string> | undefined
}

const writtenHere = () => (globalThis.skydockManifestWritten ??= new Map())

const turnsOf = new Map<string, Promise<void>>()

const inTurn = (manifestPath: string, work: () => Promise<void>) => {
  const turn = (turnsOf.get(manifestPath) ?? Promise.resolve()).then(work)
  turnsOf.set(
    manifestPath,
    turn.catch(() => {})
  )
  return turn
}

const saveManifest = (manifestPath: string, manifest: Manifest) =>
  inTurn(manifestPath, () => writeManifest(manifestPath, manifest))

const writeManifest = async (manifestPath: string, manifest: Manifest) => {
  manifestSchema.parse(manifest)
  await mkdir(path.dirname(manifestPath), { recursive: true })

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
  await writeJsonAtomic(getGroupsPath(manifestPath), groupsFile)

  const raw = {
    version: manifest.version,
    createdAt: manifest.createdAt,
    files: manifest.files,
    destinations: manifest.destinations ?? undefined
  }
  manifestSchema.omit({ groups: true }).parse(raw)
  await writeJsonAtomic(manifestPath, raw)
  writtenHere().set(manifestPath, await pairStamp(manifestPath))
}

export {
  changeBoardSoon,
  pairStamp,
  writtenHere,
  flushAllBoardChanges,
  flushBoardChanges,
  getGroupsPath,
  loadManifestAsync,
  readRecordAsync,
  recordPass,
  MANIFEST_VERSION,
  RECORD_UNREADABLE,
  saveManifest,
  statProcessedOutputs
}
