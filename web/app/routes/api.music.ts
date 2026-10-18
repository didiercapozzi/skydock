import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import { getOutputDir, messageOf } from '@skydock/scripts'
import {
  getMusicDir,
  isMusicFile,
  musicSources
} from '../../../packages/skydock-scripts/src/filmEdit'
import type { Route } from './+types/api.music'

const action = async ({ request }: Route.ActionArgs) => {
  const dir = getMusicDir(getOutputDir())
  try {
    const form = await request.formData()
    const files = form
      .getAll('files')
      .filter((entry): entry is File => entry instanceof File)
      .filter((file) => isMusicFile(file.name))
    if (files.length === 0)
      return Response.json(
        { ok: false, error: 'Only music files come in: mp3, m4a, aac, wav, ogg or flac.' },
        { status: 400 }
      )
    await mkdir(dir, { recursive: true })
    for (const file of files) {
      const name = path.basename(file.name).replace(/^\.+/, '')
      const part = path.join(dir, `.${name}.arriving`)
      try {
        await pipeline(
          Readable.fromWeb(file.stream() as NodeWebStream<Uint8Array>),
          createWriteStream(part)
        )
        await rename(part, path.join(dir, name))
      } finally {
        await rm(part, { force: true })
      }
    }
    return Response.json({ ok: true, music: await musicSources(getOutputDir()) })
  } catch (e) {
    return Response.json({ ok: false, error: messageOf(e) }, { status: 422 })
  }
}

export { action }
