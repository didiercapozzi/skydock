import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import * as path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import { computeFileId } from './fileId'
import { dsmRequestUrl, normalizeNasPath } from './nas'
import type { NasSession } from './nas'
import type { Manifest, ManifestFile } from './types'

const fetchNasFile = async (
  host: string,
  sid: string,
  filePath: string,
  localPath: string,
  onBytes?: (landed: number, total: number) => void
) => {
  const url = dsmRequestUrl(host, {
    api: 'SYNO.FileStation.Download',
    version: '2',
    method: 'download',
    path: JSON.stringify([normalizeNasPath(filePath)]),
    mode: 'download',
    _sid: sid
  })
  const res = await fetch(url.toString())
  if (!res.ok || !res.body) throw new Error(`The storage answered ${res.status} for ${filePath}.`)
  const partial = `${localPath}.part`
  await mkdir(path.dirname(localPath), { recursive: true })
  try {
    const total = Number(res.headers.get('content-length') ?? 0)
    let landed = 0
    await pipeline(
      Readable.fromWeb(res.body as NodeWebStream<Uint8Array>),
      new Transform({
        transform(chunk: Buffer, _encoding, done) {
          landed += chunk.length
          onBytes?.(landed, total)
          done(null, chunk)
        }
      }),
      createWriteStream(partial)
    )
    await rename(partial, localPath)
  } catch (e) {
    await rm(partial, { force: true })
    throw e
  }
  return localPath
}

const sameFileBack = (entry: ManifestFile, id: string, size: number): ManifestFile => ({
  ...entry,
  freed: undefined,
  id,
  size
})

const copyBack = (entry: ManifestFile, id: string, size: number): ManifestFile => ({
  ...entry,
  freed: undefined,
  id,
  size,
  cropStart: undefined,
  cropEnd: undefined,
  frame: undefined,
  rotation: undefined,
  processed: undefined
})

const restored = (
  board: Manifest,
  fileId: string,
  id: string,
  size: number,
  original: boolean,
  reviving = true
) => {
  const put = (file: ManifestFile) =>
    file.id === fileId ? (original ? sameFileBack : copyBack)(file, id, size) : file
  board.files = board.files.map(put)
  board.groups = board.groups.map((group) => {
    const files = group.files.map(put)
    return reviving && group.freed && files.some((f) => f.id === id)
      ? { ...group, files, freedBefore: group.freed, freed: undefined }
      : { ...group, files }
  })
  return board
}

const bringBack = async ({
  manifest,
  session,
  fileId,
  latest = () => manifest,
  onStart,
  onBytes
}: {
  manifest: Manifest
  session: NasSession
  fileId: string
  latest?: () => Manifest | Promise<Manifest>
  onStart?: (name: string, size: number) => void
  onBytes?: (landed: number, total: number) => void
}) => {
  const entry = [...manifest.files, ...manifest.groups.flatMap((g) => g.files)].find(
    (f) => f.id === fileId
  )
  if (!entry) throw new Error('That file is no longer on the board.')
  const sent = entry.uploaded
  if (!sent) throw new Error(`${entry.filename} was never uploaded, so there is nothing to fetch.`)
  if (await stat(entry.path).catch(() => null))
    throw new Error(`${entry.filename} is already on this machine.`)

  onStart?.(entry.filename, sent.size)
  await fetchNasFile(session.hostname, session.sessionId, sent.remotePath, entry.path, onBytes)
  const id = await computeFileId(entry.path)
  const { size } = await stat(entry.path)
  const original = id === entry.id
  const board = restored(await latest(), fileId, id, size, original)
  return { filename: entry.filename, original, size, board }
}

export { bringBack, restored }
