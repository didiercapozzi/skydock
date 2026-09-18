import { ensureNasSession, getOutputDir, loadManifest } from '@skydock/scripts'
import { openStorageFile, withinStorage } from '../../../packages/skydock-scripts/src/storageFolder'
import type { Route } from './+types/api.storage-file.$'

/* what the player needs to know about what it is handed, passed on as the storage said it */
const PASSED_ON = ['content-type', 'content-length', 'content-range', 'accept-ranges']

/* One file played straight off the storage. The browser cannot ask the storage itself — the
   session is the server's, and so is the right to be there — so the request goes through here,
   byte range and all, and the answer is passed back as it comes without being held in memory.
   Only ever a file inside a folder SkyDock uploads into. */
const loader = async ({ params, request }: Route.LoaderArgs) => {
  const filePath = `/${params['*'] ?? ''}`
  const session = await ensureNasSession()
  if (!session) return new Response('The storage is not connected.', { status: 503 })
  const manifest = loadManifest(`${getOutputDir()}/manifest.json`)
  if (!manifest || !withinStorage(manifest, session, filePath))
    return new Response('Not a file SkyDock keeps on the storage.', { status: 403 })

  const answer = await openStorageFile(session, filePath, request.headers.get('range'))
  if (!answer.ok && answer.status !== 206)
    return new Response('The storage does not have that file.', { status: 404 })
  const headers = new Headers({ 'Accept-Ranges': 'bytes' })
  for (const name of PASSED_ON) {
    const value = answer.headers.get(name)
    if (value) headers.set(name, value)
  }
  return new Response(answer.body, { status: answer.status, headers })
}

export { loader }
