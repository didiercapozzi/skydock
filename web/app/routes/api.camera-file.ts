import * as fs from 'node:fs'
import { isOnCamera } from '../../../packages/skydock-scripts/src/cameraWatch'
import { serveFile } from '../helpers/serve-file'

/* A file on a camera plugged in, played or shown from where it is, without copying it: only what lies
   under a camera's DCIM folder, whatever the address says (RULES, Seeing what is on a camera). */
const loader = ({ request }: { request: Request }) => {
  const file = new URL(request.url).searchParams.get('path') ?? ''
  if (!file || !isOnCamera(file) || !fs.statSync(file).isFile())
    return new Response('Not found', { status: 404 })
  return serveFile(file, request)
}

export { loader }
