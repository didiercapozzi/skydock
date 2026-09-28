import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import { outputKeyOf } from './fileStatus'
import { writeJsonAtomic } from './lib/fs'
import { jsonText } from './lib/json'
import { groupsFileSchema, manifestSchema } from './types'
import type { GroupsFile, Manifest, ManifestFile } from './types'

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
   either way it cannot be read — so there is one schema and one way out. */
const groupsTextSchema = jsonText.pipe(groupsFileSchema)

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

const MANIFEST_VERSION = 2

/* The last pair that was read whole, kept beside the pair itself: what the board falls back on when
   either file is found broken, rather than starting again from nothing. */
const backupOf = (file: string) => `${file}.bak`

/* Earlier states of the board, one folder each, the latest last: what the board can be put back to
   by hand (RULES, Going back). A handful is plenty — every change made on the board makes one. */
const HISTORY_KEPT = 30
const historyDir = (manifestPath: string) => path.join(path.dirname(manifestPath), '.history')

const readPair = (manifestPath: string, groupsPath: string) => {
  if (!fs.existsSync(manifestPath)) return null
  const stored = storedManifestSchema.safeParse(fs.readFileSync(manifestPath, 'utf-8'))
  if (!stored.success) return null
  /* jumps that cannot be read are not "no jumps", so that refusal travels out of here rather than
     being flattened into the same answer */
  const groups = resolveGroups(stored.data.files, readGroupsFile(groupsPath))
  const manifest: Manifest = { ...stored.data, groups }
  return manifest
}

/* The registry and its jumps. A pair that cannot be read is not taken for no board: the last pair
   that was read whole is used instead, and said. Only with neither is it "no manifest" — the
   registry describes files that are still on the disk, and a scan builds it again. */
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
  } catch {
    /* the kept pair is broken as well: what was wrong with the first is what is said */
  }
  if (failed) throw failed
  return null
}

/* The board as it is now, when it reads whole, kept as one more step of its history — asked for
   before a change somebody makes on the board, and only then: a camera copy, a proxy landing or a
   processing run saves the board file by file, and would push every change made by hand out of
   the history in minutes. */
const keepBoardStep = (manifestPath: string) => {
  const groupsPath = getGroupsPath(manifestPath)
  try {
    if (!readPair(manifestPath, groupsPath)) return
  } catch {
    return
  }
  const history = historyDir(manifestPath)
  /* two changes in the same millisecond are still two steps, in the order they were made */
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

/* The board's earlier states, the latest first: when each was, and how many jumps and files it had. */
const boardHistory = (manifestPath: string) => {
  const history = historyDir(manifestPath)
  if (!fs.existsSync(history)) return []
  return fs
    .readdirSync(history)
    .sort()
    .reverse()
    .flatMap((step) => {
      try {
        const was = readPair(
          path.join(history, step, 'manifest.json'),
          path.join(history, step, 'groups.json')
        )
        if (!was) return []
        const at = fs.statSync(path.join(history, step, 'manifest.json')).mtimeMs
        return [
          { step, at: Math.floor(at / 1000), jumps: was.groups.length, files: was.files.length }
        ]
      } catch {
        return []
      }
    })
}

/* The board put back as it was at an earlier step. What it is now becomes a step of its own first,
   so going back can itself be undone. */
const restoreBoard = (manifestPath: string, step: string) => {
  const from = path.join(historyDir(manifestPath), path.basename(step))
  const was = readPair(path.join(from, 'manifest.json'), path.join(from, 'groups.json'))
  if (!was) throw new Error('That earlier state of the board can no longer be read.')
  keepBoardStep(manifestPath)
  saveManifest(manifestPath, was)
  return was
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
  /* the pair just written whole is the one to fall back on */
  fs.copyFileSync(manifestPath, backupOf(manifestPath))
  fs.copyFileSync(getGroupsPath(manifestPath), backupOf(getGroupsPath(manifestPath)))
}

export {
  boardHistory,
  keepBoardStep,
  getGroupsPath,
  loadManifest,
  MANIFEST_VERSION,
  restoreBoard,
  saveManifest,
  statProcessedOutputs
}
