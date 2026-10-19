import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebStream } from 'node:stream/web'
import { getOutputDir, messageOf } from '@skydock/scripts'
import {
  getImagesDir,
  imageSources,
  isImageFile
} from '../../../packages/skydock-scripts/src/filmEdit'
import type { Route } from './+types/api.images'

const action = async ({ request }: Route.ActionArgs) => {
  const dir = getImagesDir(getOutputDir())
  try {
    const form = await request.formData()
    const files = form
      .getAll('files')
      .filter((entry): entry is File => entry instanceof File)
      .filter((file) => isImageFile(file.name))
    if (files.length === 0)
      return Response.json(
        { ok: false, error: 'Only pictures come in: png, jpg, jpeg or webp.' },
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
    return Response.json({ ok: true, images: await imageSources(getOutputDir()) })
  } catch (e) {
    return Response.json({ ok: false, error: messageOf(e) }, { status: 422 })
  }
}

export { action }
