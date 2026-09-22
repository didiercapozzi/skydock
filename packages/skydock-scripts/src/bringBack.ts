import * as fs from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import * as streams from 'node:stream/promises'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import { computeFileId } from './fileId'
import { dsmRequestUrl, normalizeNasPath } from './nas'
import type { NasSession } from './nas'
import type { Manifest, ManifestFile } from './types'

/* A file fetched off the storage back onto this machine.

   Freeing deletes the original once the storage is proved to hold it, and nothing brings it back by
   itself — that is what freeing means. This is the way back for a file whose card is long since
   reused: it is fetched from where its upload record says it went, into the place its entry says it
   lived, and its entry stops reading as freed.

   What comes back is what is up there, and that is not always the same thing. A tandem's originals
   go up as themselves, so the original returns, whole, and everything decided about it still
   applies. A dropzone never sends originals — what went up is the copy that was delivered, already
   trimmed, cropped and turned — so what returns is that copy. It is told by its contents: the same
   id is the same file, and any other id is the delivered copy, whose picture is already cut. Then
   the trim, the frame and the turn are cleared rather than applied a second time, and the copy
   SkyDock had made of it is gone with the freeing, so the file reads as one to prepare again. */

/* One file off the storage onto this machine, written under a temporary name and given its own only
   once it is whole — as everything written here is, so a fetch cut off leaves nothing that could be
   taken for the file. */
const fetchNasFile = async (host: string, sid: string, filePath: string, localPath: string) => {
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
  fs.mkdirSync(path.dirname(localPath), { recursive: true })
  try {
    await streams.pipeline(
      Readable.fromWeb(res.body as NodeWebStream<Uint8Array>),
      fs.createWriteStream(partial)
    )
    fs.renameSync(partial, localPath)
  } catch (e) {
    fs.rmSync(partial, { force: true })
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

/* the delivered copy, not the original: what was decided has been applied to it already */
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

const bringBack = async ({
  manifest,
  session,
  fileId
}: {
  manifest: Manifest
  session: NasSession
  /* which file, by what it contains — the id its entry carries */
  fileId: string
}) => {
  const entry = [...manifest.files, ...manifest.groups.flatMap((g) => g.files)].find(
    (f) => f.id === fileId
  )
  if (!entry) throw new Error('That file is no longer on the board.')
  const sent = entry.uploaded
  if (!sent) throw new Error(`${entry.filename} was never uploaded, so there is nothing to fetch.`)
  if (fs.existsSync(entry.path)) throw new Error(`${entry.filename} is already on this machine.`)

  await fetchNasFile(session.hostname, session.sessionId, sent.remotePath, entry.path)
  const id = await computeFileId(entry.path)
  const { size } = fs.statSync(entry.path)
  const original = id === entry.id
  /* the entry is the same entry wherever it is held — the registry's, and the jump's own */
  const put = (file: ManifestFile) =>
    file.id === fileId ? (original ? sameFileBack : copyBack)(file, id, size) : file
  manifest.files = manifest.files.map(put)
  manifest.groups = manifest.groups.map((group) => ({ ...group, files: group.files.map(put) }))
  /* a jump lives on the storage only for as long as nothing of it is here */
  manifest.groups = manifest.groups.map((group) =>
    group.freed && group.files.some((f) => f.id === id) ? { ...group, freed: undefined } : group
  )
  return { filename: entry.filename, original, size }
}

export { bringBack }
