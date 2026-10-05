import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { isMediaName } from './constants'
import { CameraGone, CopyStopped, givenBack, isNameFor, landingFor, loadBoard } from './copy'
import type { Copied, CopyProgress } from './copy'
import { computeFileId } from './fileId'
import { watchGrowth } from './lib/growing'
import { kioReader } from './kio'
import type { KioFile, KioReader } from './kio'
import { findMediaFiles, sameBytes } from './lib/fs'
import type { Manifest } from './types'
import { shotTimes } from './scan'
import { getOutputDir } from './utils'

const kioCameras = async (reader: KioReader | null) => {
  if (!reader) return []
  const found: string[] = []
  for (const device of await reader.ls('mtp:/'))
    for (const store of await reader.ls(`mtp:/${device}`))
      if ((await reader.ls(`mtp:/${device}/${store}`)).includes('DCIM'))
        found.push(`mtp:/${device}/${store}`)
  return found
}

const isKioCamera = (camera: string) => camera.startsWith('mtp:/')

const kioCameraName = (camera: string) => camera.slice('mtp:/'.length).split('/')[0] ?? camera

const clipsUnder = async (
  reader: KioReader,
  url: string,
  depth = 0
): Promise<{ url: string; name: string }[]> => {
  const found: { url: string; name: string }[] = []
  for (const name of await reader.ls(url)) {
    const child = `${url}/${name}`
    if (isMediaName(name)) found.push({ url: child, name })
    else if (!path.extname(name) && depth < 3)
      found.push(...(await clipsUnder(reader, child, depth + 1)))
  }
  return found
}

const ASKED_AT_ONCE = 6

type SeenClip = {
  url: string
  name: string
  size: number
  mtime: number | null
  original: string | null
}

const keyOf = (name: string) => {
  const { name: stem, ext } = path.parse(name)
  return `${stem.replace(/_\d+$/, '')}${ext}`.toLowerCase()
}

const hereAlready = (outputDir: string) => {
  const byKey = new Map<string, { path: string; size: number; mtime: number }[]>()
  const add = (file: string) => {
    const stat = fs.statSync(file)
    const key = keyOf(path.basename(file))
    byKey.set(key, [
      ...(byKey.get(key) ?? []),
      { path: file, size: stat.size, mtime: Math.floor(stat.mtimeMs / 1000) }
    ])
  }
  const originals = path.join(outputDir, 'original_files')
  if (fs.existsSync(originals)) for (const file of findMediaFiles(originals)) add(file)
  const named = (name: string, size: number) =>
    (byKey.get(keyOf(name)) ?? []).filter(
      (here) => here.size === size && isNameFor(path.basename(here.path), name)
    )
  return {
    add,
    find: (name: string, said: KioFile) =>
      named(name, said.size).find((here) => said.mtime === null || here.mtime === said.mtime)
        ?.path ?? null,
    named
  }
}

const copyOverKio = async ({
  camera,
  reader,
  outputDir = getOutputDir(),
  manifest = loadBoard(outputDir),
  onProgress,
  onClip,
  onCopied,
  fetch: wanted = () => true,
  stop
}: {
  camera: string
  reader: KioReader
  stop?: AbortSignal
  outputDir?: string
  manifest?: Manifest | null
  onProgress?: (progress: CopyProgress) => void
  onCopied?: (copied: Copied) => Promise<void> | void
  onClip?: (clip: SeenClip) => void
  fetch?: (clip: { url: string; name: string }) => boolean
}) => {
  const clips = await clipsUnder(reader, `${camera}/DCIM`)
  const here = hereAlready(outputDir)
  const board = manifest ? [...manifest.files, ...manifest.groups.flatMap((g) => g.files)] : []
  const progress: CopyProgress = { done: 0, total: clips.length, copied: 0, skipped: 0 }
  onProgress?.({ ...progress, files: clips.map((clip) => ({ name: clip.name, size: 0 })) })

  const incoming = path.join(outputDir, '.incoming')
  fs.mkdirSync(incoming, { recursive: true })
  try {
    for (let at = 0; at < clips.length; at += ASKED_AT_ONCE) {
      const batch = clips.slice(at, at + ASKED_AT_ONCE)
      const told = await Promise.all(batch.map((clip) => reader.stat(clip.url)))
      for (const [i, clip] of batch.entries()) {
        if (stop?.aborted) throw new CopyStopped('Stopped when asked.')
        const said = told[i] ?? null
        const found = said ? here.find(clip.name, said) : null
        let last: 'copied' | 'skipped' = 'skipped'
        if (said && (found || givenBack(board, clip.name, said.size))) {
          progress.skipped++
          onClip?.({ ...clip, size: said.size, mtime: said.mtime, original: found })
        } else if (!wanted(clip)) {
          onClip?.({ ...clip, size: said?.size ?? 0, mtime: said?.mtime ?? null, original: null })
        } else {
          const fetched = await fetchInto(reader, clip, said, incoming, outputDir, here, (part) =>
            onProgress?.({ ...progress, part })
          )
          if (fetched.copied) {
            progress.copied++
            last = 'copied'
            await onCopied?.({
              dest: fetched.at,
              id: await computeFileId(fetched.at),
              shot: fetched.shot
            })
          } else progress.skipped++
          onClip?.({
            ...clip,
            size: fetched.size,
            mtime: said?.mtime ?? null,
            original: fetched.at
          })
        }
        progress.done++
        onProgress?.({ ...progress, last })
      }
    }
  } finally {
    try {
      if (fs.readdirSync(incoming).length === 0) fs.rmdirSync(incoming)
    } catch {}
  }
  return progress
}

const fetchInto = async (
  reader: KioReader,
  clip: { url: string; name: string },
  said: KioFile | null,
  incoming: string,
  outputDir: string,
  here: ReturnType<typeof hereAlready>,
  onPart?: (part: number) => void
) => {
  const partial = path.join(incoming, `${crypto.randomBytes(6).toString('hex')}-${clip.name}`)
  const stop = onPart && said ? watchGrowth([partial, `${partial}.part`], said.size, onPart) : null
  const landed = await reader.copy(clip.url, partial).finally(() => stop?.())
  const size = landed && fs.existsSync(partial) ? fs.statSync(partial).size : -1
  if (!landed || size < 0 || (said && size !== said.size)) {
    fs.rmSync(partial, { force: true })
    throw new CameraGone('The camera stopped answering during the copy.')
  }
  if (said?.mtime) fs.utimesSync(partial, said.mtime, said.mtime)
  let twin: { path: string } | undefined
  for (const one of here.named(clip.name, size))
    if (await sameBytes(partial, one.path)) {
      twin = one
      break
    }
  if (twin) {
    fs.rmSync(partial, { force: true })
    return { copied: false, at: twin.path, size, shot: 0 }
  }
  const shot = (await shotTimes([partial])).get(partial) ?? Math.floor(Date.now() / 1000)
  const dest = landingFor(outputDir, clip.name, shot)
  fs.renameSync(partial, dest)
  here.add(dest)
  return { copied: true, at: dest, size, shot }
}

const camerasThroughKde = async () => kioCameras(await kioReader())

export { camerasThroughKde, copyOverKio, givenBack, isKioCamera, kioCameraName, kioCameras }
export type { SeenClip }
