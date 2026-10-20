import { getOutputDir, messageOf, saveUploadedFiles } from '@skydock/scripts'
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
    await saveUploadedFiles(dir, files)
    return Response.json({ ok: true, images: await imageSources(getOutputDir()) })
  } catch (e) {
    return Response.json({ ok: false, error: messageOf(e) }, { status: 422 })
  }
}

export { action }
