import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { z } from 'zod'
import { jsonText } from './lib/json'
import { dsmCopyMove, dsmRequestUrl, listNasFiles, normalizeNasPath } from './nas'
import type { NasSession } from './nas'
import { binFor, uploadFile } from './publish'

/* SkyDock's own lists on the storage — of what it holds, and of the montages — and the one way they
   are found, read and written. Each lives in one place under one name; it may once have been kept
   somewhere else or called something else, and those places are looked in after its own. */

type ListPlace = { dir: string; name: string }

const pathOf = (place: ListPlace) => normalizeNasPath(`${place.dir}/${place.name}`)

/* Whether a list is there, asked of its folder: asking for a file that is not there is not answered
   the same way by every NAS — a Synology behind its own proxy answers with a 502 page, which cannot
   be told from a real failure — while a listing says plainly what is in it. A listing that fails is a
   failure, never "no list": a new list written over one that could not be seen would throw away
   every entry in it. */
const isThere = async (session: NasSession, place: ListPlace) =>
  (await listNasFiles(session.hostname, session.sessionId, place.dir)).some(
    (file) => file.name === place.name
  )

/* A list that is there but cannot be read is an error, never an empty list, for the same reason. */
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

/* The list from the first of its places that holds one — its own first — and where it was found;
   null when none does. */
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

/* Written where it lives, replacing what is there: the one thing up there SkyDock writes over. A list
   that was read from somewhere else — an older name, an older place — is put in the storage's bin
   once the new one has been read back, so there are never two lists telling different stories. If
   the new one cannot be written, the old one stays where it was. */
const writeList = async <T>(
  session: NasSession,
  home: ListPlace,
  list: T,
  schema: z.ZodType<T>,
  from?: ListPlace | null
) => {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), `skydock-list-${crypto.randomUUID()}`))
  const local = path.join(staging, home.name)
  try {
    fs.writeFileSync(local, JSON.stringify(schema.parse(list), null, 2))
    await uploadFile(session.hostname, session.sessionId, home.dir, local, undefined, {
      overwrite: true
    })
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
  if (!from || pathOf(from) === pathOf(home)) return
  await download(session, home, schema)
  /* one the storage will not move is harmless: its own place is always looked in first */
  await dsmCopyMove(
    session.hostname,
    session.sessionId,
    pathOf(from),
    binFor(pathOf(from), new Date())
  )
}

export { findList, writeList }
export type { ListPlace }
