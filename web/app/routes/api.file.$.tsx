import * as path from 'node:path'
import { getOutputDir } from '@skydock/scripts'
import { statOrNull } from '../../../packages/skydock-scripts/src/lib/fs'
import { serveFile } from '../helpers/serve-file'

const loader = async ({
  params,
  request
}: {
  params: Record<string, string | undefined>
  request: Request
}) => {
  const splat = params['*'] ?? ''
  const filePath = path.join(getOutputDir(), splat)

  const found = await statOrNull(filePath)
  if (!found) return new Response('Not found', { status: 404 })

  return serveFile(filePath, request, found.size)
}

export { loader }
