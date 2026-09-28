import {
  earlierMontagesDirs,
  ensureNasSession,
  parentOf,
  montagesRemoteDir
} from '@skydock/scripts'
import { boardAnswer } from '../../helpers/manifest'
import type { Intent } from './change'
import { recordOnStorage } from './storage'

/* The passenger was emailed — or, taken back, was not — and the storage's list is where that is
   said, so that any machine of the club can see it. */
const markEmailed: Intent = async ({ data, manifest, refuse }) => {
  const session = await ensureNasSession()
  if (!session || !data.emailed)
    return refuse('Connect the storage first — the list of montages is kept there.')
  const { folder, to, sent } = data.emailed
  let known = true
  const listing = await recordOnStorage(
    session,
    montagesRemoteDir(manifest, session) ?? parentOf(folder),
    (index) => {
      const entry = index.montages.find((t) => t.folder === folder)
      if (!entry) known = false
      else if (sent) entry.emailed = { at: Math.floor(Date.now() / 1000), ...(to ? { to } : {}) }
      else delete entry.emailed
    },
    earlierMontagesDirs(manifest)
  )
  if (!known) return refuse('This montage is not on the storage’s list — upload it first.')
  return { ...boardAnswer(manifest), ...listing }
}

export { markEmailed }
