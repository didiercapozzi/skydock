import * as crypto from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { z } from 'zod'
import { jsonText } from './lib/json'
import { dsmCopyMove, dsmRequestUrl, listNasFiles, normalizeNasPath } from './nas'
import type { NasSession } from './nas'
import { binFor, uploadFile } from './publish'

type ListPlace = { dir: string; name: string }

const pathOf = (place: ListPlace) => normalizeNasPath(`${place.dir}/${place.name}`)

const isThere = async (session: NasSession, place: ListPlace) =>
  (await listNasFiles(session.hostname, session.sessionId, place.dir)).some(
    (file) => file.name === place.name
  )

const download = async <T>(session: NasSession, place: ListPlace, schema: z.ZodType<T>) => {
  const url = dsmRequestUrl(session.hostname, {
    api: 'SYNO.FileStation.Download',
    version: '2',
    method: 'download',
    path: JSON.stringify([pathOf(place)]),
    mode: 'download',
    _sid: session.sessionId
  })
  const res = await fetch(url.toString())
  const text = await res.text()
  if (!res.ok) throw new Error(`The storage answered ${res.status} for ${place.name}.`)
  const parsed = jsonText.pipe(schema).safeParse(text)
  if (!parsed.success) throw new Error(`${place.name} on the storage cannot be read.`)
  return parsed.data
}

const findList = async <T>(session: NasSession, places: ListPlace[], schema: z.ZodType<T>) => {
  const seen = new Set<string>()
  for (const place of places) {
    if (seen.has(pathOf(place))) continue
    seen.add(pathOf(place))
    if (await isThere(session, place))
      return { list: await download(session, place, schema), from: place }
  }
  return null
}

const writeList = async <T>(
  session: NasSession,
  home: ListPlace,
  list: T,
  schema: z.ZodType<T>,
  from?: ListPlace | null
) => {
  const staging = await mkdtemp(path.join(os.tmpdir(), `skydock-list-${crypto.randomUUID()}`))
  const local = path.join(staging, home.name)
  try {
    await writeFile(local, JSON.stringify(schema.parse(list), null, 2))
    await uploadFile(session.hostname, session.sessionId, home.dir, local, undefined, {
      overwrite: true
    })
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
  if (!from || pathOf(from) === pathOf(home)) return
  await download(session, home, schema)
  await dsmCopyMove(
    session.hostname,
    session.sessionId,
    pathOf(from),
    binFor(pathOf(from), new Date())
  )
}

export { findList, writeList }
export type { ListPlace }
