import * as fs from 'node:fs'
import * as path from 'node:path'
import { getOutputDir } from '@skydock/scripts'
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

  if (!fs.existsSync(filePath)) {
    return new Response('Not found', { status: 404 })
  }

  return serveFile(filePath, request)
}

export { loader }
