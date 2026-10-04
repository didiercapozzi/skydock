import {
  ensureNasSession,
  getOutputDir,
  listShareLinks,
  liveShareLinks,
  loadManifest
} from '@skydock/scripts'
import { z } from 'zod'
import {
  listStorageFolder,
  storageDirOf,
  withinStorage
} from '../../../packages/skydock-scripts/src/storageFolder'
import type { StorageFolder } from '../../../packages/skydock-scripts/src/storageEntry'
import { routingEngine } from '../helpers/routing'
import type { Route } from './+types/api.storage-folder'

const searchParamsArgs = z.object({
  destination: z.string().optional(),
  groupId: z.string().optional(),
  folder: z.string().optional()
})

const loader = async ({ request }: Route.LoaderArgs) => {
  const answer = (folder: StorageFolder) => Response.json(folder)
  const where = routingEngine.parseSearchParams(searchParamsArgs, { request })
  const session = await ensureNasSession()
  if (!session) return answer({ ok: false, reason: 'The storage is not connected.' })
  const manifest = loadManifest(`${getOutputDir()}/manifest.json`)
  if (!manifest) return answer({ ok: false, reason: 'Nothing has been scanned yet.' })
  const named =
    where.folder && withinStorage(manifest, session, `${where.folder}/.`) ? where.folder : null
  const dir = named ?? storageDirOf(manifest, where)
  if (!dir) return answer({ ok: false, reason: 'No folder on the storage has been chosen for it.' })
  const links = liveShareLinks(
    session.hostname,
    await listShareLinks(session.hostname, session.sessionId).catch(() => [])
  )
  try {
    return answer({ ok: true, dir, files: await listStorageFolder(session, dir, links) })
  } catch {
    return answer({ ok: false, reason: 'The storage could not be read — try again in a moment.' })
  }
}

export { loader, searchParamsArgs }
