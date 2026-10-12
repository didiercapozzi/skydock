import { isOnCamera } from '../../../packages/skydock-scripts/src/cameraWatch'
import { statOrNull } from '../../../packages/skydock-scripts/src/lib/fs'
import { serveFile } from '../helpers/serve-file'

const loader = async ({ request }: { request: Request }) => {
  const file = new URL(request.url).searchParams.get('path') ?? ''
  const found = file && isOnCamera(file) ? await statOrNull(file) : null
  if (!found?.isFile()) return new Response('Not found', { status: 404 })
  return serveFile(file, request, found.size)
}

export { loader }
