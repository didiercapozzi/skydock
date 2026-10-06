import * as fs from 'node:fs'
import * as path from 'node:path'
import { z } from 'zod'
import type { World } from './app'

const readJson = (world: World, name: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(world.output, name), 'utf8'))

const momentsSchema = z.looseObject({
  exit: z.number(),
  opening: z.number().optional(),
  canopy: z.number().optional(),
  landing: z.number().optional()
})

const jumpFileSchema = z.looseObject({
  id: z.string(),
  cropStart: z.number().nullish(),
  cropEnd: z.number().nullish(),
  rotation: z.number().nullish(),
  frame: z.looseObject({ width: z.number(), height: z.number() }).nullish()
})

const groupSchema = z.looseObject({
  id: z.string(),
  files: z.array(jumpFileSchema),
  destination: z.string().optional(),
  passenger: z.looseObject({ firstname: z.string(), lastname: z.string() }).optional(),
  processed: z.boolean().optional(),
  day: z.string().optional()
})

const fileSchema = z.looseObject({
  id: z.string().nullish(),
  filename: z.string(),
  path: z.string().optional(),
  mtime: z.number().optional(),
  size: z.number().optional(),
  destination: z.string().nullish(),
  cropStart: z.number().nullish(),
  moments: momentsSchema.nullish(),
  foundMoments: z.looseObject({ exit: z.number() }).nullish(),
  processed: z.looseObject({ size: z.number() }).nullish(),
  uploaded: z.looseObject({ remotePath: z.string(), md5: z.string() }).nullish()
})

const manifestSchema = z.looseObject({
  files: z.array(fileSchema),
  destinations: z.array(z.looseObject({ name: z.string(), path: z.string().nullish() })).default([])
})

const manifestOf = (world: World) => manifestSchema.parse(readJson(world, 'manifest.json'))

const groupsOf = (world: World) =>
  z.looseObject({ groups: z.array(groupSchema) }).parse(readJson(world, 'groups.json')).groups

const recorded = (world: World, filename: string) => {
  const file = manifestOf(world).files.find((one) => one.filename === filename)
  if (!file) throw new Error(`${filename} is not in the record`)
  const inJump = groupsOf(world)
    .flatMap((group) => group.files)
    .find((one) => one.id === file.id)
  return { ...file, ...inJump }
}

const recordedUploads = (world: World) =>
  new Map(manifestOf(world).files.map((f) => [f.filename, f.uploaded ?? null]))

const recordedRemotePaths = (world: World) =>
  [...recordedUploads(world).values()].flatMap((u) => (u ? [u.remotePath] : [])).sort()

const idOf = (world: World, filename: string) => {
  const id = manifestOf(world).files.find((f) => f.filename === filename)?.id
  if (!id) throw new Error(`the record has no ${filename}`)
  return id
}

const recordedJumps = (world: World) => groupsOf(world).map((g) => g.id)

const recordedFolders = (world: World) =>
  Object.fromEntries(manifestOf(world).destinations.map((d) => [d.name, d.path ?? null]))

export {
  groupsOf,
  idOf,
  manifestOf,
  readJson,
  recorded,
  recordedFolders,
  recordedJumps,
  recordedRemotePaths,
  recordedUploads
}
