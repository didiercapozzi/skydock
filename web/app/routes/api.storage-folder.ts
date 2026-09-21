import { ensureNasSession, getOutputDir, loadManifest } from '@skydock/scripts'
import { z } from 'zod'
import {
  listStorageFolder,
  storageDirOf,
  withinStorage
} from '../../../packages/skydock-scripts/src/storageFolder'
import type { StorageFolder } from '../../../packages/skydock-scripts/src/storageEntry'
import { routingEngine } from '../helpers/routing'
import type { Route } from './+types/api.storage-folder'

/* a dropzone by its name, a tandem by its jump — or, for a tandem the storage's list names and
   this board no longer holds, the folder the list gives */
const searchParamsArgs = z.object({
  destination: z.string().optional(),
  groupId: z.string().optional(),
  folder: z.string().optional()
})

/* What a place's folder on the storage holds, whether or not any of it is still on this machine
   (RULES, Network storage). Read-only: it lists, and nothing it finds is ever written down. */
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
  return answer({ ok: true, dir, files: await listStorageFolder(session, dir) })
}

export { loader, searchParamsArgs }
