import { getOutputDir, messageOf, saveUploadedFiles } from '@skydock/scripts'
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
    await saveUploadedFiles(dir, files)
    return Response.json({ ok: true, music: await musicSources(getOutputDir()) })
  } catch (e) {
    return Response.json({ ok: false, error: messageOf(e) }, { status: 422 })
  }
}

export { action }
