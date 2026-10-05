import * as fs from 'node:fs'
import { isOnCamera } from '../../../packages/skydock-scripts/src/cameraWatch'
import { serveFile } from '../helpers/serve-file'

const loader = ({ request }: { request: Request }) => {
  const file = new URL(request.url).searchParams.get('path') ?? ''
  if (!file || !isOnCamera(file) || !fs.statSync(file).isFile())
    return new Response('Not found', { status: 404 })
  return serveFile(file, request)
}

export { loader }
